import { describe, it, expect } from 'vitest';
import { parseSSE, anthropicTextDelta, googleTextDelta } from './stream';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const v of gen) out.push(v);
  return out;
}

describe('parseSSE', () => {
  it('data 라인을 이벤트 단위로 추출한다', async () => {
    const body = streamOf(['data: {"a":1}\n\ndata: {"a":2}\n\n']);
    expect(await collect(parseSSE(body))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('청크 경계에서 쪼개진 이벤트를 이어 붙인다', async () => {
    const body = streamOf(['data: {"a"', ':1}\n', '\ndata: {"a":2}\n\n']);
    expect(await collect(parseSSE(body))).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('event: 라인과 CRLF 줄바꿈을 무시하고 data만 추출한다', async () => {
    const body = streamOf(['event: content_block_delta\r\ndata: {"a":1}\r\n\r\n']);
    expect(await collect(parseSSE(body))).toEqual(['{"a":1}']);
  });

  it('마지막 이벤트가 빈 줄로 끝나지 않아도 내보낸다', async () => {
    const body = streamOf(['data: {"a":1}']);
    expect(await collect(parseSSE(body))).toEqual(['{"a":1}']);
  });
});

describe('anthropicTextDelta', () => {
  it('text_delta 이벤트에서 텍스트를 꺼낸다', () => {
    const data = JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'const A' },
    });
    expect(anthropicTextDelta(data)).toBe('const A');
  });

  it('텍스트가 없는 이벤트는 빈 문자열을 반환한다', () => {
    expect(anthropicTextDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });

  it('error 이벤트는 API error 형식으로 던진다', () => {
    const data = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'x' } });
    expect(() => anthropicTextDelta(data)).toThrow('Claude API error: overloaded_error');
  });
});

describe('googleTextDelta', () => {
  it('candidates의 parts 텍스트를 이어 붙인다', () => {
    const data = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'foo' }, { text: 'bar' }] } }],
    });
    expect(googleTextDelta(data)).toBe('foobar');
  });

  it('텍스트가 없으면 빈 문자열을 반환한다', () => {
    expect(googleTextDelta(JSON.stringify({ candidates: [{ finishReason: 'STOP' }] }))).toBe('');
  });

  it('finishReason이 MAX_TOKENS이면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: 'MAX_TOKENS' }],
    });
    expect(() => googleTextDelta(data)).toThrow('너무 길어');
  });
});
