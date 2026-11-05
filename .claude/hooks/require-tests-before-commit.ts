// PreToolUse(Bash) 훅: `git commit` 직전에 전체 테스트를 실행하고, 하나라도 실패하면 exit 2로 차단한다.
// stdin: Claude Code가 넘기는 JSON ({ tool_input: { command } })
// exit 0 = 통과, exit 2 = 차단 (stderr가 Claude에게 전달됨)

import { isGitCommit } from "./commit-guard";

const input = JSON.parse(await Bun.stdin.text()) as {
  tool_input?: { command?: string };
};
const command = input.tool_input?.command ?? "";

if (!isGitCommit(command)) process.exit(0);

console.error("[hook] git commit 감지: 전체 테스트를 실행합니다...");

const proc = Bun.spawn(["bun", "run", "test"], {
  cwd: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
  stdout: "pipe",
  stderr: "pipe",
});
const [out, err, code] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);

if (code === 0) {
  console.error("[hook] 모든 테스트 통과. 커밋을 허용합니다.");
  process.exit(0);
}

const tail = (out + err).split("\n").slice(-40).join("\n");
console.error(
  `[hook] 테스트 실패 (exit ${code}). 커밋을 차단합니다. 실패를 고친 뒤 다시 커밋하세요.\n\n${tail}`,
);
process.exit(2);
