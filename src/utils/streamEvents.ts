// /api/generate 가 보내는 SSE 이벤트를 읽는 유틸. (서버 server/index.ts 의 toSSEResponse 와 쌍)

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'reset' }
  | { type: 'done'; code: string }
  | { type: 'error'; message: string };

export async function* readStreamEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (block: string): StreamEvent | null => {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (!data) return null;
    try {
      return JSON.parse(data) as StreamEvent;
    } catch {
      throw new Error('응답을 해석할 수 없습니다. 다시 시도해주세요.');
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const event = parse(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (event) yield event;
        boundary = buffer.indexOf('\n\n');
      }
    }

    const rest = parse(buffer);
    if (rest) yield rest;
  } finally {
    // 소비자가 중간에 그만두거나 파싱이 실패하면 연결을 정리한다.
    reader.cancel().catch(() => {});
  }
}
