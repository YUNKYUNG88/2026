import { describe, it, expect, vi } from 'vitest';
import { readStreamEvents, type StreamEvent } from './streamEvents';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      c.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  for await (const e of readStreamEvents(body)) out.push(e);
  return out;
}

describe('readStreamEvents', () => {
  it('이벤트를 순서대로 파싱한다', async () => {
    const events = await collect(streamOf(['data: {"type":"delta","text":"a"}\n\ndata: {"type":"done","code":"b"}\n\n']));
    expect(events).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'done', code: 'b' },
    ]);
  });

  it('청크 경계에서 쪼개진 이벤트를 이어 붙인다', async () => {
    const events = await collect(streamOf(['data: {"type":"del', 'ta","text":"a"}\n', '\n']));
    expect(events).toEqual([{ type: 'delta', text: 'a' }]);
  });

  it('CRLF 줄바꿈을 처리한다', async () => {
    const events = await collect(streamOf(['data: {"type":"delta","text":"a"}\r\n\r\n']));
    expect(events).toEqual([{ type: 'delta', text: 'a' }]);
  });

  it('빈 줄 없이 끝난 마지막 이벤트도 내보낸다', async () => {
    const events = await collect(streamOf(['data: {"type":"done","code":"x"}']));
    expect(events).toEqual([{ type: 'done', code: 'x' }]);
  });

  it('소비를 중간에 그만두면 응답 바디를 cancel 한다', async () => {
    const cancel = vi.fn();
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"type":"delta","text":"a"}\n\n'));
      },
      cancel,
    });
    for await (const event of readStreamEvents(body)) {
      expect(event.type).toBe('delta');
      break;
    }
    expect(cancel).toHaveBeenCalled();
  });

  it('잘못된 JSON이면 사용자 친화 메시지로 던진다', async () => {
    await expect(collect(streamOf(['data: {oops\n\n']))).rejects.toThrow('응답을 해석할 수 없습니다');
  });
});
