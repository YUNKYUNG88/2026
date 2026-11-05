# server/AGENTS.md

## Module Context

Bun 런타임의 AI API 프록시 서버. Vite dev 서버가 `/api`를 이 서버로 프록시한다. 프론트(`src/`)와 코드를 공유하지 않는다.

## Tech Stack and Constraints

- 런타임은 Bun (`Bun.serve`, `process.env`). Node 전용 API에 의존하지 마라.
- 외부 SDK 없이 `fetch`로 Anthropic/Google API를 직접 호출한다 (`index.ts:69`, `index.ts:101`). SDK를 새로 추가하지 말고 같은 방식을 따른다.
- 모든 응답에 `CORS_HEADERS`를 붙인다 (`index.ts:51`). 새 엔드포인트와 에러 응답도 동일하게 적용한다.

## Testing Strategy

- 테스트 대상은 순수 모듈뿐이다: `generator.ts`, `fallback.ts` (각각 `*.test.ts`). `index.ts`는 테스트가 없다.
- 새 로직은 `index.ts`에 넣지 말고 순수 모듈로 분리해 테스트한다.
- 실행: `bunx vitest run server`

## Local Golden Rules

- 에러 상태 매핑은 메시지 문자열 검색에 의존한다 (`index.ts:194`, `index.ts:201`의 `message.includes('503')`, `'429'`). 프로바이더 에러는 반드시 `... API error: ${response.status}` 형식(`index.ts:85`, `index.ts:112`)으로 던져야 한다. 형식을 바꾸면 503/429 안내가 500으로 떨어진다.
- 프로바이더 처리는 비대칭이다. Google만 `MAX_TOKENS` 잘림 검사(`index.ts:123`)와 모델 폴백(`index.ts:5`, `index.ts:135`)이 있고, Anthropic에는 없다 (`index.ts:68-96`, `max_tokens` 4096 vs 8192). 한쪽을 수정할 때 다른 쪽에 같은 처리가 필요한지 확인한다.
- `withModelFallback`은 모든 모델이 실패하면 마지막 에러만 던진다 (`fallback.ts:18-19`). 이전 모델의 에러 정보는 사라진다.
- Google API 키는 URL 쿼리스트링에 들어간다 (`index.ts:99`). 이 URL을 로그에 찍거나 에러 메시지에 포함하지 마라.
- 요청 키 우선순위는 클라이언트 키, 그다음 환경변수다 (`index.ts:64-66`). 이 순서를 바꾸지 마라. 프론트의 키 검증(`src/App.tsx:34`, `hasEnvKey`)과 서버의 400 응답(`index.ts:169-174`)은 이중 방어이므로 한쪽만 제거하지 마라.
