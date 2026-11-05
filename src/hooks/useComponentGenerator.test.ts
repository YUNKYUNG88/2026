import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useComponentGenerator } from './useComponentGenerator';
import { HISTORY_KEY, saveHistory } from '../utils/historyStorage';

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
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 'render(<p />)' }) }),
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
