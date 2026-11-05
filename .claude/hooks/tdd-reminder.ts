// PreToolUse(Write|Edit) 훅: 파일 생성/수정 직전에 .claude/rules/tdd.md 핵심을 additionalContext로 주입한다.
// 차단하지 않고 상기만 시킨다 (항상 exit 0). 판단 로직은 tdd-reminder-message.ts (테스트 있음).
import { buildReminder } from './tdd-reminder-message'

const input = JSON.parse(await Bun.stdin.text()) as {
  tool_input?: { file_path?: string }
}
const reminder = buildReminder(input.tool_input?.file_path ?? '')

if (reminder) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: reminder,
      },
    }),
  )
}
