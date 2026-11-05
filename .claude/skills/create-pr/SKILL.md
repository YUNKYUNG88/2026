---
name: create-pr
description: 현재 브랜치의 커밋과 diff를 분석해 GitHub Pull Request를 생성한다. 프로젝트 성격에 따라 한국어/영문 PR 템플릿(references/)을 자동 선택하고, 서브 에이전트(fork)에서 실행되어 메인 대화 컨텍스트를 오염시키지 않는다. "PR 만들어줘", "PR 생성", "풀 리퀘스트", "create pr", "open a pull request" 같은 요청이나, 브랜치 작업을 마치고 리뷰를 요청하려는 상황이면 사용자가 skill 이름을 말하지 않아도 반드시 이 skill을 사용하라.
context: fork
agent: general-purpose
---

# create-pr

현재 브랜치의 변경사항으로 GitHub PR을 만든다. `context: fork`이므로 이 skill은 격리된 서브 에이전트에서 돈다. 서브 에이전트는 메인 대화를 볼 수 없으니, 필요한 정보는 모두 git 상태와 저장소 파일에서 직접 수집한다. 그래야 diff를 많이 읽어도 메인 컨텍스트가 커지지 않는다.

## 절차

### 1. 사전 점검

```bash
git branch --show-current
git status --short
gh auth status
git remote -v
```

- 현재 브랜치가 기본 브랜치(`main`/`master`)면 PR을 만들 수 없다. 중단하고 브랜치를 먼저 만들라고 보고한다.
- 커밋 안 된 변경이 있으면 PR에 들어가지 않는다. 임의로 커밋하지 말고 결과 보고에 알린다. (커밋은 `commit` skill의 역할이다.)
- 원격 URL에 토큰(`ghp_...` 등)이 박혀 있으면 값을 출력하지 말고, 노출 위험만 보고한다.

### 2. base 브랜치와 변경 범위 파악

```bash
gh repo view --json defaultBranchRef -q .defaultBranchRef.name
# 실패하면(미인증/원격 없음): git symbolic-ref --short refs/remotes/origin/HEAD
# 그것도 없으면 로컬 main, 그다음 master. 로컬 브랜치만으로도 충분하다.
git log --oneline <base>..HEAD
git diff --stat <base>...HEAD
```

PR 본문은 **커밋 목록 전체와 diff**를 근거로 쓴다. 마지막 커밋만 보고 쓰면 앞선 작업이 빠진다. 커밋 메시지와 diff가 어긋나면(메시지에 있는 내용이 diff에 없는 경우 등) 실제 diff를 기준으로 쓰고, 어긋남을 리뷰 포인트에 적는다. 메시지만 믿고 지어내면 리뷰어를 오도한다. diff가 크면 `--stat`으로 구조를 보고 핵심 파일만 읽는다.

### 3. 템플릿 언어 선택

아래 순서로 판단하고, 먼저 확정되는 규칙을 따른다. 사람이 읽는 문서는 읽을 사람의 언어여야 하므로, 프로젝트 커뮤니티가 쓰는 언어를 기준으로 삼는다.

1. **사용자 명시**: 인자에 "영문/English" 또는 "한국어/Korean"이 있으면 그대로 따른다.
2. **저장소 자체 템플릿**: `.github/pull_request_template.md`(또는 `.github/PULL_REQUEST_TEMPLATE/`, 루트의 `pull_request_template.md`)가 있으면 그것이 최우선이다. 이 경우 `references/`의 템플릿은 쓰지 않고 해당 템플릿의 섹션을 채운다. 해외 오픈소스 대부분이 여기에 해당한다. 본문 언어는 그 템플릿의 언어를 따르고, 제목은 저장소의 커밋 스타일(없으면 Conventional Commits)을 따른다. 템플릿이 현재 브랜치에서 처음 추가된 경우에도 프로젝트가 의도한 형식이므로 사용하되, base에 아직 없어서 GitHub가 자동 적용하지 않는다는 점을 보고에 적는다.
3. **프로젝트 언어 신호**: 다음을 종합해 판단한다. `CONTRIBUTING.md` 등에 "영어로 작성"처럼 언어를 **명시한 문장**이 있으면 통계적 신호보다 우선한다.
   - 최근 커밋 메시지 20개(`git log -20 --format=%s`)에 한글이 절반 이상이면 한국어
   - `README.md`, `CONTRIBUTING.md`, `AGENTS.md`/`CLAUDE.md`의 본문 언어
   - 신호가 엇갈리면 최근 커밋 메시지를 우선한다(협업자가 실제로 쓰는 언어이기 때문)
4. **판단 불가**: 사용자 요청 언어를 따르되, 아무 단서도 없으면 영문을 쓴다. 영문은 어느 커뮤니티에서든 읽힐 수 있는 안전한 기본값이다.

선택 결과와 근거는 최종 보고에 한 줄로 남긴다. 사용자가 틀렸다고 느끼면 바로 바로잡을 수 있게 하기 위해서다.

| 선택 | 템플릿 | 제목 형식 |
|------|--------|-----------|
| 한국어 | `references/template.ko.md` | `<type>: <한국어 요약>` (type: feat, fix, refactor, chore; 50자 안팎, 마침표 없음) |
| 영문 | `references/template.en.md` | Conventional Commits `<type>: <summary>` (imperative, 72자 이내, 마침표 없음) |

프로젝트에 AGENTS.md 등으로 커밋/PR 규칙이 있으면 제목 형식은 그 규칙이 우선한다.

### 4. 본문 작성

선택한 템플릿 파일을 읽고 모든 섹션을 채운다. 템플릿의 테스트 항목은 예시이므로 프로젝트의 실제 명령(AGENTS.md/README/package.json 등에서 확인)으로 바꿔 쓴다. 검증 도구가 없는 프로젝트면 해당 항목을 체크하지 않고 "검증 도구 없음"이라고 적는다.

- 변경 **이유**를 먼저 쓴다. 무엇을 바꿨는지는 diff에 보이지만 왜 바꿨는지는 안 보인다.
- 실제로 실행해 확인한 검증만 체크한다. 돌려보지 않은 항목을 체크하지 않는다. 저장소의 테스트/린트/빌드 명령은 AGENTS.md나 README에서 찾는다.
- 해당 없는 섹션은 지우지 말고 "해당 없음" / "N/A"로 둔다. 리뷰어가 누락과 구분할 수 있다.
- 템플릿에 없는 내용(이슈 번호 등)을 지어내지 않는다. 모르면 비워 둔다.
- 비밀 정보, 토큰, 로컬 절대 경로를 본문에 넣지 않는다.
- PR 본문 끝에 붙일 attribution 문구(예: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`)가 컨텍스트나 호출 인자에 있으면 그대로 덧붙인다. 포크된 에이전트는 메인 세션 지침을 못 볼 수 있으므로, 보이지 않으면 생략하고 보고에 "attribution 미적용"이라고 적는다.

### 5. 푸시와 PR 생성

본문은 임시 파일에 쓰고 `--body-file`로 넘긴다. 셸 이스케이프로 여러 줄 본문이 깨지는 것을 막기 위해서다. 임시 파일은 프로젝트 안이 아니라 시스템 임시/scratchpad 디렉터리에 둔다.

```bash
git push -u origin HEAD          # 원격에 브랜치가 없거나 뒤처질 때만. force 금지
gh pr create --base <base> --head <branch> --title "<제목>" --body-file <본문파일>
```

- PR 생성 요청은 현재 브랜치의 푸시 허락을 포함한다. 단 `--force`, 다른 브랜치 푸시, base 브랜치 직접 푸시는 하지 않는다.
- 이미 같은 head의 열린 PR이 있으면(`gh pr list --head <branch>`) 새로 만들지 말고 URL을 보고한다.
- 드래프트 요청이 있으면 `--draft`를 붙인다.

### 6. gh를 쓸 수 없을 때

`gh`가 미설치이거나 인증/TLS 오류로 실패하면 우회하지 않는다(인증서 검증 해제, 토큰 추출 금지). 대신 다음을 한다.

1. 원격이 있으면 브랜치만 푸시한다.
2. 원격 URL에서 owner/repo를 얻을 수 있으면 비교 URL(`https://github.com/<owner>/<repo>/pull/new/<branch>`)을 만든다. 원격이 없으면 URL을 만들 수 없으니 그 사실만 밝힌다.
3. 완성한 제목과 본문을 그대로 출력해 사용자가 웹에서 붙여 넣을 수 있게 한다. 제목과 본문은 `# Title` / `# Body` 제목으로 구분해 쓴다.

### 7. 최종 보고

서브 에이전트의 마지막 메시지가 메인 대화로 돌아오는 유일한 결과다. 아래를 간결하게 담는다.

- PR URL (또는 gh 실패 시 비교 URL + 본문)
- 선택한 템플릿 언어와 근거 한 줄
- base/head 브랜치, 커밋 수
- 실행한 검증과 못 한 것, 커밋 안 된 변경 등 사용자가 알아야 할 경고
