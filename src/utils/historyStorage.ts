import type { GeneratedComponent } from '../types';

export const HISTORY_KEY = 'component-history';
export const MAX_HISTORY = 20;

function isStored(value: unknown): value is Omit<GeneratedComponent, 'createdAt'> & { createdAt: string } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.prompt === 'string' &&
    typeof v.code === 'string' &&
    typeof v.createdAt === 'string' &&
    !Number.isNaN(Date.parse(v.createdAt))
  );
}

export function loadHistory(): GeneratedComponent[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isStored)
      .slice(0, MAX_HISTORY)
      .map((c) => ({ ...c, createdAt: new Date(c.createdAt) }));
  } catch {
    return [];
  }
}

export function saveHistory(components: GeneratedComponent[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(components.slice(0, MAX_HISTORY)));
  } catch {
    // 저장 실패(용량 초과, 사생활 보호 모드 등)는 무시한다.
  }
}
