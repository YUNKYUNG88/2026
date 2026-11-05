// 프로바이더 스트리밍 응답(SSE)을 텍스트 조각으로 변환하는 순수 함수들.
import { stripCodeFences, ensureRenderCall } from './generator';

function dataOf(eventBlock: string): string | null {
  const lines = eventBlock
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  return lines.length > 0 ? lines.join('\n') : null;
}

/** SSE 바디에서 이벤트별 data 페이로드를 순서대로 내보낸다. */
export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const data = dataOf(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (data !== null) yield data;
        boundary = buffer.indexOf('\n\n');
      }
    }

    const rest = dataOf(buffer + decoder.decode());
    if (rest !== null) yield rest;
  } finally {
    // 소비자가 중간에 그만두면 상류 연결도 끊는다.
    reader.cancel().catch(() => {});
  }
}

/** 스트림 도중 모델을 갈아탈 때 지금까지 보낸 조각을 버리라는 신호. */
export const RESET = Symbol('reset');
export type StreamChunk = string | typeof RESET;

// 프로바이더 페이로드 원문이 사용자 에러 메시지로 새지 않도록 고정 문구로 감싼다.
function parsePayload<T>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    throw new Error('응답을 해석할 수 없습니다. 다시 시도해주세요.');
  }
}

/**
 * 모델 목록을 순서대로 시도한다. 스트림 도중(MAX_TOKENS 등) 실패하면
 * 이미 낸 조각을 버리도록 RESET을 내고 다음 모델로 넘어간다.
 * 모두 실패하면 마지막 에러를 던진다.
 */
export async function* withStreamFallback(
  models: string[],
  open: (model: string) => Promise<AsyncGenerator<string>>,
): AsyncGenerator<StreamChunk> {
  if (models.length === 0) {
    throw new Error('시도할 모델이 없습니다.');
  }

  let lastError: unknown;
  let emitted = false;
  for (const model of models) {
    if (emitted) {
      yield RESET;
      emitted = false;
    }
    try {
      const chunks = await open(model);
      for await (const chunk of chunks) {
        emitted = true;
        yield chunk;
      }
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Anthropic 스트림 이벤트에서 텍스트 조각을 꺼낸다. 에러 이벤트는 던진다. */
export function anthropicTextDelta(data: string): string {
  const event = parsePayload<{
    type: string;
    delta?: { type: string; text?: string };
    error?: { type?: string };
  }>(data);
  if (event.type === 'error') {
    throw new Error(`Claude API error: ${event.error?.type ?? 'unknown'}`);
  }
  if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
    return event.delta.text ?? '';
  }
  return '';
}

/** Gemini 스트림 청크에서 텍스트 조각을 꺼낸다. MAX_TOKENS 잘림은 던진다. */
export function googleTextDelta(data: string): string {
  const chunk = parsePayload<{
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
    error?: { code?: number };
  }>(data);
  if (chunk.error) {
    throw new Error(`Gemini API error: ${chunk.error.code ?? 'unknown'}`);
  }
  if (chunk.promptFeedback?.blockReason) {
    throw new Error(`요청이 차단되었습니다 (${chunk.promptFeedback.blockReason}).`);
  }
  const candidate = chunk.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.');
  }
  if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`생성이 중단되었습니다 (${candidate.finishReason}).`);
  }
  return candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}

/** 프로바이더 에러 메시지를 사용자 안내 문구와 HTTP 상태로 매핑한다. */
export function friendlyErrorMessage(message: string): { status: number; message: string } {
  if (message.includes('503') || message.includes('overloaded_error')) {
    return { status: 503, message: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.' };
  }
  if (message.includes('429') || message.includes('rate_limit_error')) {
    return { status: 429, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' };
  }
  return { status: 500, message };
}

/** 텍스트 조각 스트림을 delta/reset/done/error SSE 이벤트 스트림으로 변환한다. */
export function toEventStream(chunks: AsyncGenerator<StreamChunk>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let raw = '';
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: object) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (!done) {
          if (value === RESET) {
            raw = '';
            send(controller, { type: 'reset' });
            return;
          }
          raw += value;
          send(controller, { type: 'delta', text: value });
          return;
        }
        const code = ensureRenderCall(stripCodeFences(raw));
        if (code) {
          send(controller, { type: 'done', code });
        } else {
          send(controller, { type: 'error', message: '생성된 코드가 비어 있습니다. 다시 시도해주세요.' });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        send(controller, { type: 'error', message: friendlyErrorMessage(message).message });
      }
      controller.close();
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
