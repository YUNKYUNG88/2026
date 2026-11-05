import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComponentCard } from './ComponentCard';

vi.mock('./LivePreview', () => ({
  LivePreview: () => <div data-testid="live-preview" />,
}));

const base = {
  id: '1',
  prompt: '버튼',
  code: 'const A = () => null;',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const props = { onRemove: vi.fn(), onRegenerate: vi.fn(), isLoading: false };

describe('ComponentCard 스트리밍 탭 전환', () => {
  it('스트리밍 중에는 코드 탭이 활성화되고 실시간 코드를 보여준다', () => {
    render(<ComponentCard component={base} isStreaming {...props} />);
    expect(screen.getByRole('button', { name: '코드' }).className).toContain('tab--active');
    expect(screen.getByText('const A = () => null;')).toBeTruthy();
    expect(screen.queryByTestId('live-preview')).toBeNull();
  });

  it('스트리밍이 끝나면 미리보기 탭으로 전환한다', () => {
    const { rerender } = render(<ComponentCard component={base} isStreaming {...props} />);
    rerender(<ComponentCard component={base} isStreaming={false} {...props} />);
    expect(screen.getByRole('button', { name: '미리보기' }).className).toContain('tab--active');
    expect(screen.getByTestId('live-preview')).toBeTruthy();
  });

  it('스트리밍이 아닌 기존 카드는 미리보기 탭으로 시작한다', () => {
    render(<ComponentCard component={base} {...props} />);
    expect(screen.getByTestId('live-preview')).toBeTruthy();
  });

  it('스트리밍 중에는 삭제 버튼을 비활성화한다', () => {
    render(<ComponentCard component={base} isStreaming {...props} />);
    expect((screen.getByRole('button', { name: '삭제' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('스트리밍이 아니면 삭제 버튼이 활성화되어 있다', () => {
    render(<ComponentCard component={base} {...props} />);
    expect((screen.getByRole('button', { name: '삭제' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('스트리밍 중에는 미리보기 탭을 비활성화한다', () => {
    render(<ComponentCard component={base} isStreaming {...props} />);
    expect((screen.getByRole('button', { name: '미리보기' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
