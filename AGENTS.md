# AGENTS.md

## Operational Commands

- 패키지 매니저는 bun 고정. npm/yarn/pnpm 사용 금지 (`bun.lock`, `package.json` scripts가 `bun`을 호출).
- 전체 실행 (API 3002 + Vite 5173): `bun run dev`
- API 서버만: `bun run server`
- 테스트 (프론트 + 서버 전체): `bun run test` (단건: `bunx vitest run <파일>`)
- 린트: `bun run lint`
- 빌드 (타입체크 포함): `bun run build`
- 변경 완료 전 `bun run lint`, `bun run test`, `bun run build`를 통과시킨다.

## Golden Rules

### Immutable

- API 포트 3002는 `server/index.ts:139`와 `vite.config.ts:8-10`(proxy target)에 중복 정의되어 있다. 하나를 바꾸면 반드시 둘 다 바꾼다.
- 환경변수 API 키(`ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`)는 클라이언트로 노출하지 않는다. `/api/config`는 boolean만 반환한다 (`server/index.ts:147-156`). 키 값 자체를 응답, 로그, 에러 메시지에 넣지 마라.
- 사용자가 UI에 입력한 API 키는 React state에만 둔다 (`src/App.tsx:14`). localStorage 등에 저장하지 마라.
- 프론트는 항상 상대 경로 `/api/*`로 호출한다 (`src/hooks/useComponentGenerator.ts:20`). 서버 주소를 하드코딩하지 마라.

### 민감 파일 차단 (Security Boundary)

- 에이전트는 민감 파일을 읽거나 수정하지 않는다. `.claude/settings.json`의 `permissions.deny`로 강제된다.
  - 대상: `.env`, `.env.local`, `.env.*.local`, `.env.development|production|staging|test`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `*.jks`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `credentials*`, `secret*`, `secrets/**`, `.aws/**`, `.ssh/**`, `.npmrc`, `.netrc`, `service-account*.json`
  - Read/Edit 도구뿐 아니라 `cat`, `type`, `Get-Content`, `head`, `tail`, `grep`, `source`, `printenv`, `env` 등 Bash 우회도 막는다.
- 키 설정이 필요하면 사용자가 직접 `.env`를 편집하도록 안내한다. 변수명 목록은 `.env.example`(키 값 없음)에 둔다 (`.env.example`은 차단 대상이 아니다).
- 새 종류의 민감 파일이 생기면 `.gitignore`와 `permissions.deny`에 함께 추가한다. 한쪽만 고치지 마라.
- deny 규칙을 삭제하거나 완화하지 마라. 사용자가 명시적으로 요청한 경우에만 변경한다.
- 이 규칙을 피하려는 우회(복사 후 읽기, 심볼릭 링크, 스크립트로 내용 출력)도 금지한다.

### 커밋 보호 훅

- `git commit` 실행 전 PreToolUse 훅(`.claude/hooks/require-tests-before-commit.ts`)이 `bun run test`를 돌리고, 하나라도 실패하면 커밋을 차단(exit 2)한다.
- 차단되면 실패한 테스트를 고친 뒤 다시 커밋한다. 훅을 끄거나, 테스트를 skip/삭제해서 통과시키지 마라.

### 생성 코드 계약 (Hard Constraint)

- 미리보기는 react-live `noInline` 모드다 (`src/components/LivePreview.tsx:14`). 생성 코드 끝에 `render(<Component />)` 호출이 있어야 렌더된다. `import`, TypeScript 문법, 마크다운 펜스가 있으면 실행에 실패한다.
- 이 계약은 두 곳에서 이중으로 방어한다. 한쪽만 제거하지 마라.
  - 프롬프트 지시: `server/index.ts:9-20` (SYSTEM_PROMPT)
  - 응답 후처리: `server/generator.ts:5-24` (`stripCodeFences`, `ensureRenderCall`)
- SYSTEM_PROMPT의 규칙을 바꾸면 `server/generator.ts`와 `server/generator.test.ts`의 가정도 함께 점검한다.

### Do's and Don'ts

- Do: 순수 로직은 `server/generator.ts`, `server/fallback.ts`처럼 부수효과 없는 모듈로 분리하고 테스트를 붙인다.
- Do: 프론트 테스트는 `src/**/*.test.tsx`, jsdom + Testing Library (`vite.config.ts:14-19`, `src/test/setup.ts`).
- Don't: 테스트에서 `server/index.ts`를 import하지 마라. import 즉시 `Bun.serve`가 실행된다 (`server/index.ts:138`).
- Don't: 서버 전용 규칙(에러 매핑, 프로바이더 차이)은 `server/AGENTS.md`를 따른다.

## Project Context

- 목표: 프롬프트로 React 컴포넌트를 생성하고 실시간 미리보기와 코드를 제공하는 도구.
- Stack: React 19, TypeScript, Vite 8, Vitest, react-live, Bun (API 프록시 서버), Anthropic Claude, Google Gemini.

## Standards and References

- 설치/실행 안내는 `README.md` 참고. 중복 기재하지 않는다.
- 커밋: `<type>: <한국어 요약>` (type은 feat, fix, refactor, chore). 요약은 50자 안팎, 마침표 없음. 한 커밋에 한 목적만 담는다.
- 사용자가 요청하지 않으면 push, `--amend`, `--no-verify`를 쓰지 않는다.
- Maintenance Policy: 이 파일의 규칙과 코드가 어긋나는 것을 발견하면 작업을 멈추고 AGENTS.md 업데이트를 제안한다.
