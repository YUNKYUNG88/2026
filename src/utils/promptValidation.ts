export const MAX_PROMPT_LENGTH = 500;

export interface PromptLengthResult {
  valid: boolean;
  length: number;
  max: number;
}

/** 프롬프트 길이가 최대 길이(500자) 이내인지 검증한다. 이모지 등은 한 글자로 센다. */
export function validatePromptLength(prompt: string): PromptLengthResult {
  const length = Array.from(prompt).length;
  return { valid: length <= MAX_PROMPT_LENGTH, length, max: MAX_PROMPT_LENGTH };
}
