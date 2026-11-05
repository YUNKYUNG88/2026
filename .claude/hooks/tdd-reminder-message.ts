const SKIP =
  /\.(md|json|css|svg|html|lock)$|(^|[\\/])(vite|eslint)\.config\.|\.d\.ts$/

const TEST_FILE = /\.test\.[jt]sx?$/

const TEST_REMINDER = [
  '[TDD 리마인더] 테스트 파일을 작성/수정하려 한다. .claude/rules/tdd.md 를 지켜라.',
  '- 하나의 동작 = 하나의 테스트. 한 테스트에 여러 동작을 섞지 마라.',
  "- 작성 후 반드시 실행해서 실패(RED)를 확인한다. 실패 이유는 '기능 미구현'이어야 하며 오타/import 오류는 RED가 아니다.",
].join('\n')

const PRODUCTION_REMINDER = [
  '[TDD 리마인더] 프로덕션 코드를 작성/수정하려 한다. .claude/rules/tdd.md 를 지켜라.',
  '- 비즈니스 로직, API, 유틸, 버그 수정이면 실패하는 테스트가 먼저 있어야 한다. 실행해서 RED를 확인했는가?',
  '- 테스트보다 먼저 쓴 프로덕션 코드는 삭제하고 RED부터 다시 시작한다. 주석/임시 파일로 남기는 것도 금지.',
  '- GREEN은 테스트를 통과시키는 최소한의 코드만(YAGNI). REFACTOR는 green 상태에서 새 동작 없이 정리만.',
  '- 타입 정의, 설정 파일, 순수 UI는 TDD 불필요. 경계가 모호하면 TDD를 적용한다.',
].join('\n')

export function buildReminder(filePath: string): string | null {
  if (!filePath || SKIP.test(filePath)) return null
  return TEST_FILE.test(filePath) ? TEST_REMINDER : PRODUCTION_REMINDER
}
