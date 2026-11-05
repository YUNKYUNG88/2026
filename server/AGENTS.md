# server/AGENTS.md

## Module Context

Bun 런타임의 AI API 프록시 서버. Vite dev 서버가 `/api`를 이 서버로 프록시한다. 프론트(`src/`)와 코드를 공유하지 않는다.

## Tech Stack and Constraints

- 런타임은 Bun (`Bun.serve`, `process.env`). Node 전용 API에 의존하지 마라.
- 외부 SDK 없이 `fetch`로 Anthropic/Google API를 직접 호출한다 (`index.ts:77`, `index.ts:107`). SDK를 새로 추가하지 말고 같은 방식을 따른다.
- `/api/generate`는 SSE(`delta`/`reset`/`done`/`error` 이벤트)로 응답한다. 프론트 `src/utils/streamEvents.ts`와 쌍이므로 이벤트 형식을 바꾸면 양쪽을 함께 고친다.
- 모든 응답에 `CORS_HEADERS`를 붙인다 (`index.ts:58`). 새 엔드포인트와 에러 응답도 동일하게 적용한다.

## Testing Strategy

- 테스트 대상은 순수 모듈뿐이다: `generator.ts`, `fallback.ts`, `stream.ts` (`*.test.ts`). `index.ts`는 테스트가 없다.
- 새 로직은 `index.ts`에 넣지 말고 순수 모듈로 분리해 테스트한다.
- 실행: `bunx vitest run server`

## Local Golden Rules

- 에러 상태 매핑은 메시지 문자열 검색에 의존한다 (`stream.ts`의 `friendlyErrorMessage`: `'503'`, `'429'`, `overloaded_error`, `rate_limit_error`). 프로바이더 에러는 반드시 `... API error: ${response.status}` 형식(`index.ts:95`, `index.ts:121`)으로 던져야 한다. 형식을 바꾸면 503/429 안내가 500으로 떨어진다. 스트림 도중 에러는 HTTP 상태가 아니라 `error` 이벤트 메시지로 전달된다. Google은 `streamGoogle`이 지연 실행 제너레이터라 연결 실패도 HTTP 200 안의 `error` 이벤트로 나가고, HTTP 상태(429/503) 매핑은 Anthropic 경로에서만 남는다.
- 프로바이더 처리는 비대칭이다. Google만 `MAX_TOKENS` 잘림 검사(`stream.ts`의 `googleTextDelta`)와 모델 폴백(`index.ts:12`, `index.ts:128`)이 있고, Anthropic에는 없다 (`index.ts:77-104`, `max_tokens` 4096 vs 8192). 한쪽을 수정할 때 다른 쪽에 같은 처리가 필요한지 확인한다.
- 모델 폴백은 연결 실패뿐 아니라 스트림 도중 실패에도 동작한다 (`stream.ts`의 `withStreamFallback`). 이미 조각을 보냈다면 `RESET`을 내보내 `reset` 이벤트로 클라이언트가 누적 코드를 비우게 한다. `withStreamFallback`은 모든 모델이 실패하면 마지막 에러만 던진다. 이전 모델의 에러 정보는 사라진다.
- 프로바이더 페이로드 파싱 실패는 원문 대신 고정 문구로 던진다 (`stream.ts`의 `parsePayload`). 프로바이더 응답 원문을 사용자 에러 메시지에 넣지 마라.
- Google API 키는 URL 쿼리스트링에 들어간다 (`index.ts:108`). 이 URL을 로그에 찍거나 에러 메시지에 포함하지 마라.
- 요청 키 우선순위는 클라이언트 키, 그다음 환경변수다 (`index.ts:71-73`). 이 순서를 바꾸지 마라. 프론트의 키 검증(`src/App.tsx:34`, `hasEnvKey`)과 서버의 400 응답(`index.ts:186-191`)은 이중 방어이므로 한쪽만 제거하지 마라.
