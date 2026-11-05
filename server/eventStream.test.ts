import { describe, it, expect, vi } from 'vitest';
import {
  toEventStream,
  friendlyErrorMessage,
  googleTextDelta,
  anthropicTextDelta,
  withStreamFallback,
  RESET,
  type StreamChunk,
} from './stream';

async function* gen(items: Array<StreamChunk | Error>): AsyncGenerator<StreamChunk> {
  for (const item of items) {
    if (item instanceof Error) throw item;
    yield item;
  }
}

async function collectChunks(source: AsyncGenerator<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of source) out.push(chunk);
  return out;
}

async function readEvents(stream: ReadableStream<Uint8Array>): Promise<Array<Record<string, string>>> {
  const text = await new Response(stream).text();
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, '')));
}

describe('toEventStream', () => {
  it('조각마다 delta 이벤트를 순서대로 내보낸다', async () => {
    const events = await readEvents(toEventStream(gen(['const A', ' = 1;'])));
    expect(events.slice(0, 2)).toEqual([
      { type: 'delta', text: 'const A' },
      { type: 'delta', text: ' = 1;' },
    ]);
  });

  it('done 이벤트의 code는 펜스를 제거하고 render 호출을 보장한다', async () => {
    const events = await readEvents(toEventStream(gen(['```jsx\nconst Card = () => null;\n', '```'])));
    const done = events[events.length - 1];
    expect(done.type).toBe('done');
    expect(done.code).toBe('const Card = () => null;\n\nrender(<Card />);');
  });

  it('도중에 throw 하면 error 이벤트를 내보내고 스트림을 닫는다', async () => {
    const events = await readEvents(toEventStream(gen(['x', new Error('boom')])));
    expect(events[events.length - 1]).toEqual({ type: 'error', message: 'boom' });
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('error 이벤트 메시지에도 과부하 안내 문구를 적용한다', async () => {
    const events = await readEvents(toEventStream(gen([new Error('Claude API error: overloaded_error')])));
    expect(events[0].message).toContain('과부하');
  });

  it('후처리 결과가 비어 있으면 done 대신 error를 보낸다', async () => {
    const events = await readEvents(toEventStream(gen([])));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
  });

  it('RESET을 만나면 reset 이벤트를 보내고 이전 조각을 최종 코드에서 버린다', async () => {
    const events = await readEvents(toEventStream(gen(['const Bad', RESET, 'const Card = () => null;'])));
    expect(events.map((e) => e.type)).toEqual(['delta', 'reset', 'delta', 'done']);
    expect(events[3].code).toBe('const Card = () => null;\n\nrender(<Card />);');
  });

  it('소비자가 취소하면 상류 제너레이터를 정리한다', async () => {
    const source = gen(['a', 'b', 'c']);
    const spy = vi.spyOn(source, 'return');
    const reader = toEventStream(source).getReader();
    await reader.read();
    await reader.cancel();
    expect(spy).toHaveBeenCalled();
  });
});

describe('friendlyErrorMessage', () => {
  it('503 또는 overloaded_error는 503 과부하 문구로 매핑한다', () => {
    expect(friendlyErrorMessage('Gemini API error: 503')).toMatchObject({ status: 503 });
    expect(friendlyErrorMessage('Claude API error: overloaded_error').message).toContain('과부하');
  });

  it('429 또는 rate_limit_error는 429 문구로 매핑한다', () => {
    expect(friendlyErrorMessage('Claude API error: 429')).toMatchObject({ status: 429 });
    expect(friendlyErrorMessage('Claude API error: rate_limit_error').message).toContain('너무 많습니다');
  });

  it('그 외는 500과 원문 메시지를 그대로 반환한다', () => {
    expect(friendlyErrorMessage('boom')).toEqual({ status: 500, message: 'boom' });
  });
});

describe('googleTextDelta 차단/에러 신호', () => {
  it.each(['SAFETY', 'RECITATION', 'OTHER'])('finishReason이 %s이면 던진다', (reason) => {
    const data = JSON.stringify({ candidates: [{ finishReason: reason }] });
    expect(() => googleTextDelta(data)).toThrow(reason);
  });

  it('error 필드가 오면 API error 형식으로 던진다', () => {
    const data = JSON.stringify({ error: { code: 503, message: 'x' } });
    expect(() => googleTextDelta(data)).toThrow('Gemini API error: 503');
  });

  it('promptFeedback.blockReason이 오면 던진다', () => {
    const data = JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } });
    expect(() => googleTextDelta(data)).toThrow('SAFETY');
  });

  it('정상 종료(STOP)는 던지지 않는다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }] }, finishReason: 'STOP' }] });
    expect(googleTextDelta(data)).toBe('a');
  });
});

describe('withStreamFallback', () => {
  it('첫 모델이 스트림 도중 실패하면 RESET 후 다음 모델 결과를 이어서 낸다', async () => {
    const open = async (model: string) => (model === 'a' ? gen(['x', new Error('cut')]) : gen(['y']));
    expect(await collectChunks(withStreamFallback(['a', 'b'], open))).toEqual(['x', RESET, 'y']);
  });

  it('조각을 내기 전에 실패하면 RESET 없이 다음 모델로 넘어간다', async () => {
    const open = async (model: string) => {
      if (model === 'a') throw new Error('Gemini API error: 503');
      return gen(['y']);
    };
    expect(await collectChunks(withStreamFallback(['a', 'b'], open))).toEqual(['y']);
  });

  it('모든 모델이 조각을 낸 뒤 실패해도 마지막 실패 뒤에는 RESET을 붙이지 않는다', async () => {
    const out: StreamChunk[] = [];
    const open = async (model: string) => gen(model === 'a' ? ['x', new Error('a')] : ['y', new Error('b')]);
    await expect(
      (async () => {
        for await (const chunk of withStreamFallback(['a', 'b'], open)) out.push(chunk);
      })(),
    ).rejects.toThrow('b');
    expect(out).toEqual(['x', RESET, 'y']);
  });

  it('모델 목록이 비어 있으면 던진다', async () => {
    await expect(collectChunks(withStreamFallback([], async () => gen([])))).rejects.toThrow('시도할 모델이 없습니다');
  });

  it('모든 모델이 실패하면 마지막 에러를 던진다', async () => {
    const open = async (model: string): Promise<AsyncGenerator<StreamChunk>> => {
      throw new Error(`fail-${model}`);
    };
    await expect(collectChunks(withStreamFallback(['a', 'b'], open))).rejects.toThrow('fail-b');
  });
});

describe('프로바이더 페이로드 파싱 실패', () => {
  it('Anthropic 페이로드가 JSON이 아니면 고정 문구로 던진다', () => {
    expect(() => anthropicTextDelta('{oops')).toThrow('응답을 해석할 수 없습니다');
  });

  it('Gemini 페이로드가 JSON이 아니면 원문 없이 고정 문구로 던진다', () => {
    expect(() => googleTextDelta('{oops secret')).toThrow('응답을 해석할 수 없습니다');
  });
});
