import { describe, it, expect } from 'vitest';
import { MAX_PROMPT_LENGTH, validatePromptLength } from './promptValidation';

describe('validatePromptLength', () => {
  it('최대 길이는 500자다', () => {
    expect(MAX_PROMPT_LENGTH).toBe(500);
  });

  it('500자 이하이면 유효하다', () => {
    expect(validatePromptLength('a'.repeat(500))).toEqual({ valid: true, length: 500, max: 500 });
  });

  it('501자 이상이면 유효하지 않다', () => {
    expect(validatePromptLength('a'.repeat(501))).toEqual({ valid: false, length: 501, max: 500 });
  });

  it('빈 문자열은 길이 0으로 유효하다', () => {
    expect(validatePromptLength('')).toEqual({ valid: true, length: 0, max: 500 });
  });

  it('이모지 같은 서로게이트 쌍은 한 글자로 센다', () => {
    expect(validatePromptLength('😀'.repeat(500)).valid).toBe(true);
  });
});
