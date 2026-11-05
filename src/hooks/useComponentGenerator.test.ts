import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { HISTORY_KEY, saveHistory } from '../utils/historyStorage';

function sseResponse(events: object[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
  return { ok: true, body } as unknown as Response;
}

const stored = {
  id: 'old',
  prompt: '이전 프롬프트',
  code: 'render(<div />)',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('useComponentGenerator 히스토리', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('마운트 시 저장된 히스토리를 불러온다', () => {
    saveHistory([stored]);
    const { result } = renderHook(() => useComponentGenerator());
    expect(result.current.components).toEqual([stored]);
  });

  it('생성에 성공하면 히스토리에 저장한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([{ type: 'done', code: 'render(<p />)' }])),
    );
    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('새 프롬프트', undefined, 'google');
    });
    await waitFor(() => {
      const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      expect(raw).toHaveLength(1);
      expect(raw[0].prompt).toBe('새 프롬프트');
    });
  });

  it('전체 삭제하면 저장된 히스토리도 비운다', () => {
    saveHistory([stored]);
    const { result } = renderHook(() => useComponentGenerator());
    act(() => result.current.clearAll());
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')).toEqual([]);
  });

  it('개별 삭제하면 저장된 히스토리에서도 제거한다', () => {
    saveHistory([stored]);
    const { result } = renderHook(() => useComponentGenerator());
    act(() => result.current.removeComponent('old'));
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')).toEqual([]);
  });
});

describe('useComponentGenerator 스트리밍', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delta를 받는 동안 draft.code에 누적한다', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(enc.encode('data: {"type":"delta","text":"const A"}\n\n'));
        await gate;
        c.enqueue(enc.encode('data: {"type":"done","code":"const A = 1;"}\n\n'));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }));
    const { result } = renderHook(() => useComponentGenerator());
    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = result.current.generate('p', undefined, 'google');
    });
    await waitFor(() => expect(result.current.draft?.code).toBe('const A'));
    expect(result.current.draft?.prompt).toBe('p');
    release();
    await act(async () => {
      await promise;
    });
  });

  it('done 이벤트의 code로 컴포넌트를 확정하고 draft를 비운다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { type: 'delta', text: '```\nconst A' },
          { type: 'done', code: 'const A = 1;\nrender(<A />);' },
        ]),
      ),
    );
    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', undefined, 'google');
    });
    expect(result.current.draft).toBeNull();
    expect(result.current.components[0].code).toBe('const A = 1;\nrender(<A />);');
  });

  it('error 이벤트를 받으면 error를 설정하고 컴포넌트를 추가하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          { type: 'delta', text: 'x' },
          { type: 'error', message: '잘림' },
        ]),
      ),
    );
    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', undefined, 'google');
    });
    expect(result.current.error).toBe('잘림');
    expect(result.current.components).toEqual([]);
    expect(result.current.draft).toBeNull();
  });

  it('done 없이 스트림이 끝나면 끊김 에러를 설정한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([{ type: 'delta', text: 'x' }])));
    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', undefined, 'google');
    });
    expect(result.current.error).toContain('중간에 끊겼습니다');
    expect(result.current.components).toEqual([]);
  });

  it('done의 code가 비어 있으면 컴포넌트를 추가하지 않고 에러를 설정한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([{ type: 'done', code: '' }])));
    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', undefined, 'google');
    });
    expect(result.current.error).not.toBeNull();
    expect(result.current.components).toEqual([]);
  });

  it('reset 이벤트를 받으면 지금까지 누적한 draft 코드를 비운다', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(enc.encode('data: {"type":"delta","text":"bad"}\n\n'));
        c.enqueue(enc.encode('data: {"type":"reset"}\n\n'));
        c.enqueue(enc.encode('data: {"type":"delta","text":"good"}\n\n'));
        await gate;
        c.enqueue(enc.encode('data: {"type":"done","code":"good"}\n\n'));
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body }));
    const { result } = renderHook(() => useComponentGenerator());
    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = result.current.generate('p', undefined, 'google');
    });
    await waitFor(() => expect(result.current.draft?.code).toBe('good'));
    release();
    await act(async () => {
      await promise;
    });
  });

  it('알 수 없는 이벤트 type은 무시하고 확정된 코드를 유지한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([{ type: 'done', code: 'ok' }, { type: 'ping' }])),
    );
    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', undefined, 'google');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.components[0].code).toBe('ok');
  });

  it('언마운트되면 진행 중인 요청을 abort 한다', () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise(() => {});
      }),
    );
    const { result, unmount } = renderHook(() => useComponentGenerator());
    act(() => {
      void result.current.generate('p', undefined, 'google');
    });
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('HTTP 에러 응답이면 JSON error 메시지를 노출한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: '키 필요' }) }),
    );
    const { result } = renderHook(() => useComponentGenerator());
    await act(async () => {
      await result.current.generate('p', undefined, 'google');
    });
    expect(result.current.error).toBe('키 필요');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.draft).toBeNull();
  });
});
