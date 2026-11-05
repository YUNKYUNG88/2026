import { useState, useCallback, useEffect, useRef } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { loadHistory, saveHistory } from '../utils/historyStorage';
import { readStreamEvents } from '../utils/streamEvents';

/** 스트리밍 중인 컴포넌트. 완료되면 같은 id의 GeneratedComponent로 확정된다. */
export interface DraftComponent {
  id: string;
  prompt: string;
  code: string;
  createdAt: Date;
}

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  draft: DraftComponent | null;
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<void>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useState<GeneratedComponent[]>(loadHistory);
  const [draft, setDraft] = useState<DraftComponent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 언마운트되면 진행 중인 스트림 요청을 끊는다.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    saveHistory(components);
  }, [components]);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date();

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/generate', {
        signal: controller.signal,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      setDraft({ id, prompt, code: '', createdAt });

      let finalCode: string | null = null;
      for await (const event of readStreamEvents(res.body)) {
        if (event.type === 'delta') {
          setDraft((d) => (d ? { ...d, code: d.code + event.text } : d));
        } else if (event.type === 'reset') {
          setDraft((d) => (d ? { ...d, code: '' } : d));
        } else if (event.type === 'error') {
          throw new Error(event.message);
        } else if (event.type === 'done') {
          finalCode = event.code;
        }
      }

      if (!finalCode) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = { id, prompt, code: finalCode, createdAt };
      setComponents((prev) => [newComponent, ...prev]);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setDraft(null);
      setIsLoading(false);
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, draft, isLoading, error, generate, removeComponent, clearAll };
}
