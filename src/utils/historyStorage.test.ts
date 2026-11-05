import { describe, it, expect, beforeEach } from 'vitest';
import { HISTORY_KEY, MAX_HISTORY, loadHistory, saveHistory } from './historyStorage';
import type { GeneratedComponent } from '../types';

const make = (id: string): GeneratedComponent => ({
  id,
  prompt: `prompt ${id}`,
  code: `code ${id}`,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('historyStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('저장된 값이 없으면 빈 배열을 반환한다', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('저장한 히스토리를 그대로 복원한다', () => {
    saveHistory([make('a'), make('b')]);
    expect(loadHistory()).toEqual([make('a'), make('b')]);
  });

  it('복원 시 createdAt을 Date 객체로 되돌린다', () => {
    saveHistory([make('a')]);
    expect(loadHistory()[0].createdAt).toBeInstanceOf(Date);
  });

  it('손상된 JSON이면 빈 배열을 반환한다', () => {
    localStorage.setItem(HISTORY_KEY, '{not json');
    expect(loadHistory()).toEqual([]);
  });

  it('배열이 아닌 값이면 빈 배열을 반환한다', () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ a: 1 }));
    expect(loadHistory()).toEqual([]);
  });

  it('형식이 맞지 않는 항목은 걸러낸다', () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([{ id: 1 }, { ...make('ok'), createdAt: '2026-01-01T00:00:00.000Z' }]),
    );
    expect(loadHistory().map((c) => c.id)).toEqual(['ok']);
  });

  it(`최대 ${MAX_HISTORY}개까지만 최신순으로 보관한다`, () => {
    const items = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => make(String(i)));
    saveHistory(items);
    const loaded = loadHistory();
    expect(loaded).toHaveLength(MAX_HISTORY);
    expect(loaded[0].id).toBe('0');
  });

  it('저장소 쓰기가 실패해도 예외를 던지지 않는다', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(() => saveHistory([make('a')])).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
