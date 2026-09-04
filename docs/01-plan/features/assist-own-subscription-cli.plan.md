# "내 AI로 실행" — 선생님 본인 구독(Claude Code·Codex)을 쌤핀 화면 안에서 돌린다

> 파일명: `docs/01-plan/features/assist-own-subscription-cli.plan.md`
> 최종 수정: 2026-09-04 (오너 인터뷰 반영)
> 상태: **Approved(실험실)** — 오너 결정 완료, S0 기술 스파이크 착수 대기
> 관련: ADR-082(이 계획의 결정) · ADR-072(생기부 초안 인앱) · ADR-061(Solar) · [`zero-setup-in-app-ai-features.plan.md`](zero-setup-in-app-ai-features.plan.md) · [`assist-bridge-parity.plan.md`](assist-bridge-parity.plan.md)

---

## 0. 한 줄 요약

쌤핀 AI(무료 Solar)는 그대로 두고, **선생님 PC에 이미 설치·로그인된 Claude Code / Codex CLI 를 쌤핀이 대신 띄워** 브릿지가 하던 일 전체를 **쌤핀 오른쪽 AI 패널 안에서** 하게 한다. **생기부 초안은 구독 모델 전용**이고, 그 외 기능은 구독이 없는 선생님도 지금처럼 Solar 로 쓴다. 쌤핀은 토큰을 만지지 않고, 도구는 이미 동봉된 브릿지(MCP)를 그대로 물린다. **구글은 약관상 뺀다.**

## 1. 오너 결정 (2026-09-04, 두 차례)

**1차 — 반론 3건 기각**

| 반론                                         | 오너 결정                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 구독은 BYOK 보다 부담이 크다(비용 조건 위반) | **기각.** 이미 클로드·코덱스·제미나이를 구독하는 선생님이 많다. 조건 1은 "쌤핀이 비용을 _새로_ 요구하지 않는다"로 읽는다. |
| 설치·로그인 장벽이 쌤핀 정체성과 충돌        | **기각.** 설치·로그인 UI/UX 를 친화적으로 만든다.                                                                         |
| 이미 Solar 로 답이 정해졌다                  | **기각.** `solar-pro3` 품질이 부족하다. 브릿지가 하던 걸 앱 화면으로 가져와 **생기부 초안까지** 쓰게 한다.                |

**2차 — 인터뷰 결정**

| #   | 결정            | 내용                                                                                                                                                                                                |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 구글 제외 수용  | 인앱 실행은 Claude Code·Codex 2종. 구글은 Antigravity IDE 에서 브릿지를 쓰는 기존 경로만(§3.3).                                                                                                     |
| D2  | Solar 는 남긴다 | **구독이 없는 선생님**은 생기부 초안을 **뺀** 나머지 기능을 지금처럼 Solar 로 쓴다. 생기부 초안은 **구독 모델 전용**(Solar 로는 안 만든다).                                                         |
| D3  | 같은 패널       | 실험실 "쌤핀 AI"를 켜면 열리는 **오른쪽 AI 패널 그대로**, 답하는 모델만 Claude/Codex 로 바뀐다.                                                                                                     |
| D4  | 생기부 버튼     | 초안 화면의 AI 버튼을 누르면 **선생님이 구독하는 모델로 초안을 쓴다.** (지금 그 자리에는 "요청문 복사" 버튼 — 외부 AI 에 붙여 넣을 문장을 복사 — 만 있다. 초안 생성 버튼은 **새로 생기는 것**이다.) |
| D5  | 실험실          | 실험실 버전으로 낸다.                                                                                                                                                                               |
| D6  | 1차 범위 = 전체 | 읽기·**쓰기**·생기부를 한 번에. 쓰기는 미리보기 → [실행]. **메커니즘은 CLI 권한 프롬프트가 아니라 loopback 적용 지점의 "제안 후 즉시 409"로 확정됐다**(§5.3, ADR-082 D6 보정).                      |
| D7  | 생기부 프롬프트 | 앱에 내장하지 않고 **실행할 때 서버에서 받아온다**(ADR-072 결정 1 유지).                                                                                                                            |
| D8  | 생성 단위       | **선생님이 고른다** — "이 학생만" / "남은 학생 모두". 한도에 걸리면 멈추고 이어 하기.                                                                                                               |
| D9  | 모델 선택       | **설정에서 고를 수 있게.** 기본값은 쌤핀이 정한 안전한 값.                                                                                                                                          |

오너 판단: "Solar 와 분명히 다를 것" — 따라서 S0 는 **품질 관문이 아니라 기술 확인**이다(브릿지가 붙는지, 스트리밍이 되는지, 쓰기 문이 서는지).

## 2. 레퍼런스 실측 — OpenMotion 은 클로드를 이렇게 붙였다

`OpenMotion-1.1.0-x64.dmg`(1.1.0-build.4)를 풀어 `app.asar` 를 직접 읽었다(`E:\test\openmotion-inspect\app\out\main\index.js`).

| 항목          | OpenMotion 실제 구현                                                                                                                                                                                                                                                                                             | 쌤핀 적용                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 바이너리 동봉 | **안 한다.** `@anthropic-ai/claude-agent-sdk`(JS 4.2MB)만 동봉, 플랫폼 바이너리(224MB)는 electron-builder 에서 제외                                                                                                                                                                                              | 같게. 쌤핀은 SDK 도 안 쓰고 CLI 직접 실행(§5)                                                                                                |
| CLI 탐색      | PATH + `~/.local/bin`, `~/.volta/bin`, `~/.bun/bin`, homebrew, nvm/fnm 경로를 훑어 `claude`(win: `claude.exe`) 찾기. `CLAUDE_CODE_PATH` env 로 강제 가능                                                                                                                                                         | 같게 + **Windows npm 설치의 `claude.cmd`/`codex.cmd` 도 잡는다**(OpenMotion 은 놓친다. 쌤핀 `aiBridgeCore.ts` 는 이미 `where codex` 로 처리) |
| 미설치 시     | 공식 한 줄 설치 명령을 **복사만** 시켜 주고 "터미널에서 실행 후 [다시 확인]"                                                                                                                                                                                                                                     | 쌤핀은 한 단계 더 — 공식 설치 명령을 **쌤핀이 새 터미널에서 대신 실행**(§6)                                                                  |
| 로그인        | `claude auth login` / `codex login` 을 **자식 프로세스로 실행**(브라우저가 열림, 5분 타임아웃) → `claude auth status` / `codex login status` 로 확인 → `claude auth logout`                                                                                                                                      | 같게. 쌤핀 화면에 로그인 폼을 만들지 않는다(약관)                                                                                            |
| 실행          | Agent SDK `query({ pathToClaudeCodeExecutable, model, maxTurns, resume, permissionMode:"bypassPermissions", tools:[], allowedTools:[자기 MCP 도구만], mcpServers:{openmotion: 자체 MCP}, includePartialMessages, abortController, systemPrompt })`                                                               | `claude -p --output-format stream-json` 직접 실행 + `--mcp-config`(브릿지) + `--allowedTools mcp__ssampin__*`                                |
| 코덱스        | `@openai/codex-sdk` `new Codex({ codexPathOverride, config:{ mcp_servers:{…, default_tools_approval_mode:"approve", startup_timeout_sec:20, tool_timeout_sec:150 } } })` → `startThread({ sandboxMode:"read-only", approvalPolicy:"never", skipGitRepoCheck:true, webSearchMode:"disabled" })` → `runStreamed()` | `codex exec --json -s read-only --skip-git-repo-check -C <빈 폴더> -c mcp_servers.ssampin.…` 직접 실행                                       |
| API 키        | "또는 Anthropic/OpenAI API 키 저장"(safeStorage 암호화) 병행                                                                                                                                                                                                                                                     | **안 한다** — BYOK 기각 유지                                                                                                                 |
| 오류 분류     | 401/403/oauth/"not signed in" → [다시 연결] · "usage limit" → "구독·사용량 확인 후 재시도 또는 공급자 전환"                                                                                                                                                                                                      | 같게 + 쌤핀 AI 로 폴백 제안(생기부 제외)                                                                                                     |
| 제미나이      | **지원 안 함**(클로드·코덱스 2종만)                                                                                                                                                                                                                                                                              | 같은 결론(§3.3)                                                                                                                              |

**교훈**: OpenMotion 의 "API 키 불필요"는 마법이 아니라 _"사용자가 자기 터미널에 깔고 로그인한 CLI 를 앱이 찾아 쓴다"_ 이다. 쌤핀은 그 절반(브릿지·원클릭 등록·PII 토큰화·동의 게이트)을 이미 갖고 있다.

## 3. 약관·기술 현황 (2026-09-04 기준, 공식 문서로 확인)

### 3.1 Claude Code — ✅ 허용(조건부), 단 방향이 불리

- **허용 근거** — `code.claude.com/docs/en/legal-and-compliance`: 플랫폼이 Claude Code 를 품는 경우에도 _"an end user signing in to the **unmodified** Claude Code binary with their own Claude subscription"_ 은 허용. 조건: ①바이너리 무수정·인증 방식 제거 금지 ②쌤핀은 **Commercial ToS 동의** ③각 사용자가 본인 구독으로 직접 인증(쌤핀이 대신 결제·재판매·중계 금지) ④쌤핀은 Claude.ai 로그인 화면을 만들거나 **토큰을 수집·저장·중계할 수 없다**(로그인은 Anthropic 자체 플로우) ⑤"Claude Code"·로고를 쌤핀 기능명·로고에 못 쓴다(평문 언급만).
- **사용량 정책** — `support.claude.com` 15036540(2026-06-16 갱신): _"Claude Agent SDK, `claude -p`, and third-party app usage still draw from your subscription's usage limits."_ 2026-05-13 발표된 **"Agent SDK 크레딧"(Pro $20~Max $200/월 별도 풀, 이월 없음)** 은 6/15 시행 당일 **보류**, 재개 시 사전 고지 약속. → 오늘은 일반 한도 차감, **앞으로 별도 상한이 생길 수 있다.**
- **기술 함정** — `--bare` 는 _"doesn't use your subscription login"_ 이고 _"will become the default for `-p` in a future release"_. **`--bare` 를 쓰지 말 것**, 그리고 기본값이 바뀌는 날 깨진다 → 버전 하한·폴백 필수(§9).
- 로컬 확인(이 PC, 2.1.258): `claude auth login|logout|status` 존재. `-p` 에서 `/login` 불가. 모델은 `--model sonnet|opus|haiku|fable` 별칭 또는 전체 이름.

### 3.2 Codex — ✅ 허용, 가장 깔끔

- `learn.chatgpt.com/docs/app-server`: _"Embed Codex into your product with the app-server protocol"_ — 제3자 앱 임베딩이 **공식 용도**. `codex exec --json`(JSONL 이벤트) 도 문서화. OpenAI 자체 `codex-plugin-cc` 가 같은 방식.
- 로그인: `codex login`(브라우저) · `codex login status` · 디바이스 코드. ChatGPT Plus/Pro/Team/Edu/Enterprise 포함.
- 약관 확답: GitHub Discussion #8338 에서 OpenAI 엔지니어가 "ToS 는 꽤 관대, OpenCode 등이 그렇게 함"이라 했을 뿐 법무 확답은 없음. 공식 임베딩 문서가 있으므로 **위험 낮음**.
- 로컬 확인(0.144.4): `codex exec --json -m <model> -s <sandbox> -C <dir> --skip-git-repo-check --output-schema -c key=value`.

### 3.3 Google — ⛔ 인앱 실행 불가(약관), 브릿지 통로만 (D1 확정)

- **Gemini CLI 소비자 경로 종료**: 2026-06-18 부로 무료·AI Pro·AI Ultra 개인 계정 서비스 중단(엔터프라이즈 Code Assist 라이선스·API 키만 유지). 후속은 **Antigravity CLI(`agy`)**.
- **Antigravity 는 제3자 접근을 약관으로 막는다** — `antigravity.google/docs/faq`: _"Using third party software, tools, or services to access Antigravity is a violation of our Terms of Service"_, 제3자 통합은 _"Vertex or AI Studio API key"_ 로 하라고 안내. Anthropic 같은 "무수정 바이너리는 예외" 문구가 **없다.**
- 계정: 개인 Google 계정 대상, Workspace(교육청) 계정은 "문제 있으면 @gmail.com 으로" 안내.
- 기술적으로는 된다(1.1.22 로컬 확인) — **되는 것과 해도 되는 것은 다르다.**
- **결론**: 인앱 실행 목록에서 뺀다. 선생님이 **Antigravity IDE 를 직접 열어** 쌤핀 브릿지(MCP)를 쓰는 기존 경로는 유지. **재검토 조건**: Google 이 제3자 임베딩을 허용하는 문서를 내거나, 교육청 Workspace 에 Gemini Code Assist 가 포함될 때. 그 전에는 다시 제안하지 않는다.

### 3.4 공통 — 개인정보

- 세 회사 모두 소비자 플랜은 대화가 **모델 학습에 쓰일 수 있다**(설정으로 끌 수 있음). 업스테이지 때(ADR-061/072)처럼 **쉬운 한국어로 고지**하고, 학생 이름은 브릿지 토큰화(［이름1］)로 **애초에 안 보낸다.** 이 원칙은 공급자와 무관하게 유지.

## 4. 목표 / 비목표

**목표**

1. 실험실 → AI 연결에서 Claude Code 또는 Codex 를 연결하면, **오른쪽 AI 패널**이 그 모델로 답한다(읽기·쓰기 = 브릿지 도구 전체).
2. 생기부 초안 화면에 **[AI로 초안 쓰기]** 가 생긴다 — 연결된 구독 모델로만 동작. 단위는 "이 학생만"/"남은 학생 모두" 중 선택.
3. 구독이 없는 선생님은 **아무것도 달라지지 않는다** — 패널은 Solar 로 계속, 생기부 버튼은 연결 안내.
4. 설치·로그인을 쌤핀이 **끝까지 안내·대행**하되, 토큰은 쌤핀에 절대 남기지 않는다.
5. 모델은 설정에서 고른다. CLI 가 없거나 깨지면 **패널은 Solar 로 폴백**(생기부는 폴백 없음, 오류 안내).

**비목표**

- API 키 입력(BYOK) — 기각 유지.
- Gemini/Antigravity 인앱 실행 — §3.3.
- 쌤핀이 CLI 바이너리를 동봉·자동 업데이트 — 하지 않는다(약관 "무수정" 조건과 설치파일 크기 둘 다).
- Solar 로 생기부 초안 — 만들지 않는다(D2).

## 5. 아키텍처

### 5.1 그림

```
[렌더러] AssistDock(패널) ─┐        RecordDraftView [AI로 초안 쓰기] ─┐
                          ▼                                          ▼
[useAssistStore] provider 스위치 ──┬─ 'ssampin' → 기존: Supabase ssampin-assist → Solar (패널만)
   provider = 'ssampin'|'claude'|'codex'
                                  └─ 'claude'|'codex' → IPC 'ownAi:run' / 'ownAi:draft'
                                                             │
[Electron main] ownAiRunner.ts ───────────────────────────────┘
   ├─ ownAiCli.ts     : 탐색(PATH/.local/bin/.cmd)·버전·auth status·login/logout·설치 명령 실행
   ├─ ownAiSpawn.ts   : 자식 프로세스 실행, stream-json/JSONL 파싱 → 렌더러로 델타 전송, 취소(SIGINT)
   └─ (쓰기 게이트는 별도 파일이 아니라 aiBridgeLiveSyncHost.applyWrite 안의 분기다 — §5.3)
   └─ 브릿지 MCP 엔트리: aiBridgeCore.buildEntry() 그대로 (ELECTRON_RUN_AS_NODE + electron/ai-bridge/index.mjs)
                          └─ PII 토큰화·동의 게이트·SSAMPIN_BRIDGE_ALLOW_WRITE 는 브릿지 안에서 그대로
[Supabase] ssampin-record-prompt (새 함수) : 생기부 1층 프롬프트를 실행 시점에 내려 준다 (D7)
```

### 5.2 원칙

- **공급자 스위치는 한 곳** — `useAssistStore.provider`. 화면은 모른다. 패널은 **Solar 가 켜져 있거나 구독이 연결돼 있으면** 열린다(둘 중 하나로 충분).
- **도구 실행 주체가 바뀐다** — Solar 경로는 모델이 고른 도구를 **렌더러가** 실행하지만(`executeAssistWrite`), 구독 경로는 **CLI 안의 브릿지 MCP 가** 실행한다. 도구 목록도 `assistToolRegistry`(41종, 1등급만)가 아니라 **브릿지 전체**다 — 학생 단위 도구는 브릿지의 동의 게이트가 감싼다.
- **깨끗한 작업 폴더** — `%APPDATA%/ssampin/own-ai/cwd`(빈 폴더)를 `cwd` 로. `-p` 는 cwd 의 `.mcp.json`·`CLAUDE.md`·훅을 읽으므로 빈 폴더가 안전장치. `--strict-mcp-config` 로 사용자 전역 MCP 도 끊는다.
- **생기부 프롬프트는 서버에서 실행 시점에 받는다**(D7) — 메모리에만 두고 디스크에 쓰지 않는다. 교사 커스텀(2층)은 지금처럼 로컬.
- **생기부 초안은 도구 없이 한 번에** — 쌤핀이 근거 꾸러미(토큰화된 관찰·근거·탐구 흐름·성취기준 **키워드만**)를 만들어 `maxTurns 1` 로 묻는다. ADR-072 의 **입력 단계 기재금지 차단**은 꾸러미를 만들 때 건다. (패널은 도구를 부르는 대화형, 초안은 한 방 — 결정적이고 한도를 아낀다.)
- **초안 결과는 바로 덮어쓰지 않는다** — 미리보기 → [반영] (지금 초안이 있으면 "바꾸기/뒤에 붙이기").

### 5.3 쓰기 문(D6) — **제안 후 즉시 반환** (2026-09-04 구현 중 교체)

> ⚠️ 아래는 **구현으로 확정된 형태**다. 원안(“CLI 권한 프롬프트 + 게이트 MCP 서버”)은 코드를 읽어 보니 성립하지 않아 폐기했다 — 근거는 `DECISIONS.md` ADR-082 “D6 보정”.
>
> 브릿지 쓰기는 파일 드롭이 아니라 **앱으로 오는 차단형 loopback HTTP** 이고, 브릿지 12초·앱 10초가 **번들에 박힌 상수**라 120초짜리 승인을 버틸 수 없다. 앱 서버가 없으면 브릿지는 파일을 **직접 쓴다**.

- **쓰기 허용은 기존 설정 토글(capability 파일)이 정한다.** 브릿지 쓰기 도구는 `assertWriteAllowed` 가 호출마다 capability 를 읽고, env `SSAMPIN_BRIDGE_ALLOW_WRITE` 는 관찰 도구 2곳만 본다 → 구독 실행은 **env 를 주입하지 않는다**.
- **게이트 위치**: `aiBridgeLiveSyncHost.applyWrite` 의 도메인 403 검사 **뒤**, 렌더러 위임 **앞**. 활성 중이면 저장하지 않고 `ownAi:write-proposal` 로 제안만 보낸 뒤 **즉시 409**("선생님 승인 대기 중 — … 다시 시도하지 마세요")로 답한다. [실행] 시 기존 `applyLiveSyncWrite` 로 적용한다.
- **활성 판정**: 패널 실행 spawn 직전 `activeUntil = Infinity` **대입**, 종료 시 `now + 15초` **대입**(`max` 금지 — `max(Infinity,…)` 는 영원히 활성이 된다). 생기부 실행은 건드리지 않는다.
- **실행 전 판정**: 쓰기·생기부·**채점** 토글 중 하나라도 켜져 있는데 `ensureServer()` 가 실패하면 **실행 자체를 하지 않는다**(그 상태에서 브릿지는 파일을 직접 쓴다).
- **종료**: `before-quit`·`app.exit` 경로에서 **동기로** 자식 트리를 죽인다(`taskkill /T /F` / 그룹 SIGKILL).
- 계약 테스트: `electron/ipc/ownAiGate.contract.test.ts` — 승인 없이 `applyLiveSyncWrite` 0회·409 반환·유예 15초·유예 후 원복·허용 안 된 도메인은 403·서버 실패 시 미실행.

### 5.4 실행 명령 — **S0 실측으로 확정**(claude 2.1.258 / codex 0.144.4, 2026-09-04)

```text
claude -p "<프롬프트>" --output-format stream-json --verbose --include-partial-messages
  --mcp-config <파일경로> --strict-mcp-config
  --tools ""                       # ★내장 도구 0 (--disallowedTools 는 블랙리스트라 12개 이상이 샜다)
  --restricted                     # ★사용자·프로젝트 설정과 훅 무시 (훅 7건 → 0건)
  --allowedTools "mcp__ssampin__*" # ★접두사 필터 금지 — 읽기 도구가 list_/check_ 로도 시작한다
  --permission-mode dontAsk --no-session-persistence
  --model <설정값> --append-system-prompt "<지시 + 별칭 힌트>"
  # ★stdin 을 반드시 닫는다(stdio[0]='ignore') — 안 닫으면 3초를 버린다
  # ★--bare 금지: CLI --help 원문이 "OAuth and keychain are never read"
  # 생기부: --mcp-config/--strict-mcp-config/--allowedTools 를 빼면 도구 0
codex exec --json --skip-git-repo-check -C <빈 폴더> -s read-only --ignore-user-config
  -m <설정값>
  -c 'mcp_servers.ssampin.command="<electron.exe>"' -c 'mcp_servers.ssampin.args=["<index.mjs>"]'
  -c 'mcp_servers.ssampin.env={ELECTRON_RUN_AS_NODE="1",SSAMPIN_DATA_DIR="…"}'
  "<프롬프트>"
  # ★★stdin 을 닫지 않으면 **무한 대기**한다(실측 184초 타임아웃, 출력 0줄)
```

**쓰지 않는 플래그와 이유**: `--disallowedTools`(샌다) · `--setting-sources`(`--restricted` 가 포괄) · `--permission-prompts`(2.1.259+, 2.1.258 은 거부) · `--append-system-prompt-file`·`--max-turns`(옵션 행 없음) · `--bare`(구독 로그인 차단).

**A/B 실측**: 원안 34,294ms·3턴·훅 7건·도구 72개 → 확정안 **15,601ms·2턴·훅 0건·도구 54개**, 둘 다 정답.
**`rate_limit_event`** 로 남은 사용량(5시간/7일 소진율·리셋 시각)을 **한도를 맞기 전에** 안내할 수 있다.
**codex `item.type=="error"` 는 치명적이지 않다**(스킬 예산 경고도 여기로 온다) — 종료 코드로 판정한다.

## 6. 사용자 흐름

### 6.1 실험실 → 켜기

- 실험실에 카드 **"내 AI 연결(구독)"** 이 "쌤핀 AI" 카드 아래에 생긴다. 켜면 처음 한 번 **고지 1장**(쉬운 한국어): "선생님 구독 사용량을 씁니다 / 학생 이름은 ［이름1］로 바꿔 보냅니다 / 대화가 그 회사 설정에 따라 학습에 쓰일 수 있습니다 — 끄는 방법 링크 / 내 Claude Code·Codex 설정이 함께 적용됩니다".

### 6.2 AI 연결 탭 — 카드 두 장(Claude Code · Codex), 3상태

| 상태     | 화면                                                      | 쌤핀이 하는 일                                                                                                                                                                                                                  |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 미설치   | "아직 설치되지 않았어요" + [설치하기]                     | 공식 설치 명령을 **쌤핀이 새 터미널 창에서 실행**(Win: `irm https://claude.ai/install.ps1 \| iex` / `winget install OpenAI.Codex`, mac: `curl … \| bash`), 끝나면 [다시 확인]. 관리자 권한 불필요(공식 문서).                   |
| 미로그인 | "설치됐어요. 로그인이 필요해요" + [로그인]                | `claude auth login` / `codex login` 을 자식 프로세스로 실행 → 브라우저에서 **각 회사 화면으로** 로그인 → 5분 안에 `auth status` 가 성공하면 연결됨. 쌤핀 화면에 입력란 없음.                                                    |
| 연결됨   | "연결됨 · 2.1.258" + **모델 선택 상자**(D9) + [연결 해제] | 모델 목록은 쌤핀이 관리(Claude: 기본(권장)/sonnet/opus/haiku · Codex: 기본(권장)/gpt-5.x 목록). 플랜에 없는 모델을 고르면 오류를 **"이 모델은 지금 플랜에서 쓸 수 없어요 — 기본으로 바꿀까요?"** 로 번역. 해제는 `auth logout`. |

### 6.3 오른쪽 AI 패널(D3)

- 헤더에 **답하는 모델 선택**: 쌤핀 AI / Claude Code / Codex — 연결된 것만 보인다. 구독이 연결되면 기본값이 구독 모델로 바뀌고, 언제든 Solar 로 돌릴 수 있다.
- 답변 위에 배지 "내 AI(Claude Code · sonnet)" — 어느 경로로 답했는지 항상 보인다.
- 쓰기 제안은 지금과 똑같은 **미리보기 카드 → [실행]** (§5.3).
- 오류: 미로그인 → [다시 연결] · **사용량 한도** → "구독 한도에 닿았어요. 쌤핀 AI 로 이어서 답할까요?" · **버전 낮음** → "[업데이트]" · 실행 실패 → Solar 폴백 + 한 줄.

### 6.4 생기부 초안 화면(D4·D8)

- 학생 카드의 "요청문 복사" 옆에 **[AI로 초안 쓰기]**. 누르면 작은 선택: **"이 학생만"** / **"남은 학생 모두 (N명)"**. 주제("이 주제로…")를 골라 두었으면 그 주제 근거만 쓴다(지금 요청문과 같은 규칙).
- 결과는 **미리보기 → [반영]**. 기재금지·근거 없는 표현 경고(ADR-072)는 미리보기에서 그대로 뜬다.
- "남은 학생 모두"는 한 명씩 순차, 진행 표시, 한도·오류에 걸리면 **멈추고 [이어 하기]**. 이미 초안이 있는 학생은 건너뛴다(선택 해제 가능).
- **구독 미연결이면** 버튼은 보이되 누르면 "생기부 초안은 선생님 구독 AI(Claude Code·Codex)로만 만들 수 있어요 — [연결하러 가기]" + "또는 요청문을 복사해 쓰던 AI 에 붙여 넣기". Solar 로는 만들지 않는다(D2).

## 7. 슬라이스 (한 릴리즈, 개발 순서)

| #      | 이름                          | 산출물                                                                                                         | 완료 기준                                                                                                                                                                                                                                                       |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S0** | 기술 스파이크(품질 관문 아님) | `E:\test\ssampin-own-ai-spike\`(저장소 밖)                                                                     | (a) `--mcp-config` 로 브릿지 붙고 읽기 도구 호출 (b) stream-json/JSONL 파싱 (c) `--permission-prompt-tool` 게이트 왕복 1회 (d) Codex `exec` 읽기 + `app-server` 승인 1회 (e) Windows `.cmd` 탐색 (f) 한도·미로그인 오류 형태 (g) 생기부 사례 A~E 1회씩 — 기록만 |
| S1     | 러너 + 읽기                   | `electron/ipc/ownAi*.ts` + IPC 계약 + `useAssistStore` provider + 패널 선택·배지                               | 패널에서 브릿지 읽기 도구 전체가 Claude·Codex 로 동작, Solar 폴백                                                                                                                                                                                               |
| S2     | 쓰기 문                       | 게이트 MCP 서버 + 미리보기 카드 왕복 + `SSAMPIN_BRIDGE_ALLOW_WRITE` 세션 스코프                                | 계약 테스트: 게이트 없이 쓰기 실행 0건                                                                                                                                                                                                                          |
| S3     | 생기부 초안                   | `ssampin-record-prompt` 함수 + 근거 꾸러미 조립기(도메인, 순수) + [AI로 초안 쓰기] + 단위 선택 + 미리보기/반영 | 사례 A~E 표, 구독 미연결 안내                                                                                                                                                                                                                                   |
| S4     | 설치·로그인·모델 UX           | 실험실 카드·AI 연결 카드 3상태·모델 선택·고지·오류 문구 (프론트엔드 디자인 에이전트 협업 필수)                 | 깨끗한 Windows 에서 설치→로그인→사용 10분 안에                                                                                                                                                                                                                  |
| S5     | 문서·릴리즈                   | `/docs` 가이드(설치·로그인·한도·학습설정 끄기), 릴리즈 노트, KB ingest                                         | 게이트 4종 + `landing npm run docs:check`                                                                                                                                                                                                                       |

## 8. 파일 소유권 / 영향

**새 파일(이 계획 소유)**

- `electron/ipc/ownAiCli.ts` · `ownAiSpawn.ts` · `ownAiGate.ts` · `ownAi.ts`(IPC 등록) · `ownAi*.test.ts`
- `src/domain/entities/OwnAiProvider.ts`(`'claude' | 'codex'`, 상태·모델 목록 타입) · `src/domain/rules/ownAiCliRules.ts`(버전 하한·오류 분류) · `src/domain/services/recordDraftPack.ts`(근거 꾸러미 조립, 순수)
- `src/adapters/components/Settings/aiBridge/OwnAiProviderCard.tsx` · `OwnAiLabsCard.tsx`
- `supabase/functions/ssampin-record-prompt/`

**수정(이 계획 소유, 다른 세션과 겹치지 않음 확인 2026-09-04)**

- `src/adapters/stores/useAssistStore.ts`(provider·모델·폴백) · `src/adapters/components/Assist/AssistDock.tsx`(선택·배지) · `src/adapters/components/Settings/tabs/AiBridgeTab.tsx` · `LabsTab.tsx` · `electron/preload` IPC 채널 · `electron/main.ts` 등록 한 줄

**요청만(소유 밖 — T 세션 작업 중)**

- `src/adapters/components/RecordDraft/RecordDraftView.tsx` — [AI로 초안 쓰기] 버튼과 미리보기 슬롯. **T6 통합 때** 요청한다. 그 전에는 S3 를 별도 컴포넌트(`RecordDraftAiButton.tsx`)로 만들어 두고 한 줄만 꽂게 준비.
- `assistToolRegistry.ts` — 구독 경로는 레지스트리를 안 거친다. "레지스트리 밖 도구가 인앱에서 보이면 실패"류 계약 테스트가 있으면 **경로별 예외**를 명시(S1 에서 확인).

**커밋 규칙**: 경로 지정 한 줄 커밋(`git commit -m … -- <paths>`), `git add -A` 금지(다중 세션).

## 9. 위험과 대비

| 위험                                                           | 대비                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anthropic 이 `-p` 기본을 `--bare` 로 바꿈(구독 로그인 못 읽음) | 실행 전 `claude --version` 하한·상한 검사, 인증 오류면 즉시 Solar 폴백(패널) / 오류 안내(생기부) + "업데이트 필요". 릴리즈 노트에 "Claude Code 버전 X~Y 에서 확인" 명기. |
| "Agent SDK 크레딧" 별도 상한 재개($20/월)                      | 한도 오류를 별도 문구로 분류. 배지에 "구독 사용량 사용 중". "남은 학생 모두"는 멈춤·이어하기.                                                                            |
| 쓰기 문이 뚫림                                                 | 게이트 MCP + `--allowedTools` 읽기만 + 브릿지 `ALLOW_WRITE` 세션 스코프 = 3겹. 계약 테스트.                                                                              |
| Windows npm 설치(`claude.cmd`) 탐색 실패                       | `where`/`.cmd` 처리(`aiBridgeCore.ts` 패턴 재사용).                                                                                                                      |
| MCP 기동 30초 상한(`MCP_TIMEOUT`)                              | S0 실측, 필요 시 상향.                                                                                                                                                   |
| 사용자 전역 `~/.claude` 훅·MCP·CLAUDE.md 가 끼어듦             | 빈 cwd + `--strict-mcp-config` + `--disallowedTools`. `~/.claude/settings.json` 훅은 못 막는다 → 고지.                                                                   |
| 플랜에 없는 모델 선택                                          | 오류 번역 + 기본값 복귀 제안(§6.2).                                                                                                                                      |
| 학생 이름 유출                                                 | 브릿지 토큰화·동의 게이트 그대로. 근거 꾸러미도 토큰화된 값만. **CLI 에 원문을 직접 넣는 코드 경로를 만들지 않는다**(계약 테스트).                                       |
| 다중 세션 충돌                                                 | §8 소유권 표. `RecordDraftView.tsx` 는 직접 수정하지 않는다.                                                                                                             |
| 구글 약관                                                      | 인앱 실행 안 함(§3.3). 재검토 조건 전 제안 금지.                                                                                                                         |

## 10. 검증 게이트

- 4종: `npx tsc --noEmit` 0 · `npm run lint` · `npm run test` · `npm run regression-check`
- 실기기: Windows(오너 PC, claude 2.1.258 / codex 0.144.4) + 깨끗한 Windows VM 1회(설치 흐름) + macOS 1회
- 브릿지 레포 변경 없음이 원칙. 있으면 `ssampin-ai-bridge` master 별도 커밋 + 동봉 번들 재생성(T6 와 조율)
- `/docs` 사용자 가이드 갱신 + `cd landing && npm run docs:check && npm run build`

## 11. 결정 이력

- 2026-09-04 1차: 반론 3건 기각(§1).
- 2026-09-04 2차(인터뷰): D1~D9 확정(§1). **남은 오너 결정 없음.** 다음 = S0 착수(오너 구독 사용량을 소량 쓴다 — 착수 신호 필요).
