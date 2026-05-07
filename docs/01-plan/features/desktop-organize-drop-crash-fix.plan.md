# 바탕화면 정리 위젯 드롭 크래시 핫픽스 (Desktop Organize Drop Crash Fix) Planning Document

> **Summary**: `바탕화면 정리` 위젯 박스에 파일/폴더를 드래그해 놓으면 빨간 동그라미 빗금(🚫) 커서 후 앱이 통째로 unload되는 사용자 신고를 처리한다. 근본원인은 Electron BrowserWindow에 글로벌 dragover/drop 가드가 없어서 드롭된 `file://` URL로 렌더러가 navigate되는 것. 위젯 자체의 비-드롭 설계는 그대로 두고, (1) 윈도우 레벨 글로벌 drop preventDefault 가드 + (2) main 프로세스 `will-navigate` `file://` 차단 + (3) 코치마크/챗봇 KB에 "바탕화면 아이콘 아래 모드 전제" 명시로 두 트랙을 동시에 처리한다.
>
> **Project**: SsamPin
> **Version**: v2.0.4 (예정 — patch 핫픽스)
> **Author**: pblsketch
> **Date**: 2026-05-07
> **Status**: Draft v0.1

---

## 1. 개요

### 1.1 목적

이 핫픽스가 해결하는 문제:

1. **앱 강제 종료 — 데이터 안전 위협**: 사용자가 위젯의 `바탕화면 정리` 박스에 파일/폴더를 끌어 넣으면 React 렌더러가 `file:///` URL로 navigate되며 통째로 unload된다. 사용자 입장에서는 "앱이 튕긴다"로 보이고, 입력 중이던 다른 위젯(메모/할일/노트)의 미저장 데이터가 함께 날아갈 수 있다.
2. **사용자 멘탈 모델 미스매치**: 사용자는 "바탕화면 정리"라는 이름과 박스 그리드 UI를 보고 자연스럽게 "여기로 파일을 끌어다 놓으면 분류된다"고 기대한다. 실제 설계는 [`바탕화면 아이콘 아래 모드`](docs/01-plan/features/desktop-organize.plan.md#L72-L77)에서만 동작하는 시각적 프레임이지만, 코치마크 한 줄("박스 위에 바탕화면 아이콘을 직접 드래그해 정리하세요")로는 그 전제가 전달되지 않는다.
3. **위젯 모드 전반의 잠재 위험**: 글로벌 drop 가드 부재는 `바탕화면 정리`만의 문제가 아니다. 위젯/메인/아이콘 윈도우 어느 곳에 파일을 드롭해도 같은 navigate 사고가 발생할 수 있다. 1번 신고를 계기로 모든 윈도우에 안전망을 동시에 까는 것이 합리적이다.

### 1.2 배경

2026-05-07 사용자 신고:
> "바탕화면 정리 탭에 파일이나 폴더를 넣으려고 하는데 금지 표시가 오른쪽 아래에 나오면서 계속 튕깁니다. 최선 버전이고, 앱 재시작도 해봤어. 모든 파일이나 폴더가 다 안돼."

진단 결과 두 층의 문제가 겹쳐 있었다:

| 증상 | 원인 | 의도/버그 | 처리 |
|------|------|-----------|------|
| 빨간 동그라미 빗금(🚫) 커서 | JS 측 `dragover` preventDefault 부재 → OS 표준 "drop 불가" 커서 | 위젯 의도대로 (박스 = 시각 프레임만) | 정상 — UX 문구만 보강 |
| 앱이 튕김(=React unload) | Electron 기본 동작: drop 시 file:// URL로 BrowserWindow navigate | **버그** — 모든 윈도우 공통 위험 | 글로벌 가드로 차단 |

[`DesktopOrganizeBox.tsx:156-159`](src/widgets/items/DesktopOrganize/DesktopOrganizeBox.tsx#L156-L159) 주석에도 *"onClick / pointer-events:none 사용 금지 (native-desktop hook 라우팅 보존)"* 라고 명시되어 있어, 위젯 자체에 onDrop을 다는 방향은 PRD([`desktop-organize.plan.md` §2.2](docs/01-plan/features/desktop-organize.plan.md#L82-L93))의 "아이콘 추적 절대 금지" 원칙을 깬다. 따라서 **드롭 자체를 수용하는 것이 아니라, 드롭이 앱을 깨뜨리지 못하게 막는 것**이 본 핫픽스의 핵심.

### 1.3 관련 문서

- 사용자 신고 컨텍스트: 본 세션 대화 (2026-05-07)
- 본 진단 직전 응답: 2-층 진단 (의도된 🚫 + 진짜 버그=navigate)
- 원본 위젯 기획: [`desktop-organize.plan.md`](docs/01-plan/features/desktop-organize.plan.md) — 시각 프레임만 + native-desktop 모드 전제
- 위젯 카드 본체: [`src/widgets/items/DesktopOrganize/`](src/widgets/items/DesktopOrganize/)
- 코치마크 위치: [`DesktopOrganize.tsx:213-230`](src/widgets/items/DesktopOrganize/DesktopOrganize.tsx#L213-L230)
- Electron 윈도우 정의:
  - 메인 윈도우: [`electron/main.ts` ~L1038](electron/main.ts) (webPreferences)
  - 위젯 윈도우: [`electron/main.ts` ~L1735, L1819-L1882](electron/main.ts)
  - 아이콘 윈도우: [`electron/main.ts` ~L1038-L1095](electron/main.ts)
  - quick-add/sticker-picker/etc: 동일 패턴 6+개 BrowserWindow
- 챗봇 KB: [`scripts/ingest-chatbot-qa.mjs`](scripts/ingest-chatbot-qa.mjs)
- 노션 가이드: 사용자 가이드 메인 + `바탕화면 정리` 섹션
- 릴리스 워크플로우: `MEMORY.md` § Release Workflow (8단계)

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

#### 트랙 A — 크래시 차단 (필수, P0)

- [ ] 모든 BrowserWindow 렌더러 루트(또는 preload)에서 `window.addEventListener('dragover', e => e.preventDefault())` + `'drop'` preventDefault 글로벌 가드 추가
- [ ] 메인 프로세스에서 모든 BrowserWindow의 `webContents.on('will-navigate', (e, url) => { if (url.startsWith('file://')) e.preventDefault() })` 가드 추가 (이미 navigate가 시작된 경우 fallback)
- [ ] `setWindowOpenHandler`로 `file://` 외부 윈도우 오픈도 차단 (deny)
- [ ] 가드 적용 대상: `mainWindow`, `widgetWindow`, `iconWindow`, `quickAddWindow`, `stickerPickerWindow`, 기타 BrowserWindow 인스턴스 전부 — 헬퍼로 일원화
- [ ] preload에 `installDropGuard()` 헬퍼 함수 신설 (재사용)

#### 트랙 B — 사용자 소통 보강 (P1)

- [ ] `DesktopOrganize.tsx` 코치마크 문구 수정:
  - 현재: "박스 위에 바탕화면 아이콘을 직접 드래그해 정리하세요. 자동 정렬은 하지 않아요."
  - 수정: "이 위젯은 **바탕화면 아이콘 아래 모드**에서만 동작해요. 위젯 모드에서는 박스 그리드만 보이고, 모드를 바꾸면 진짜 바탕화면 아이콘을 박스 위로 직접 드래그할 수 있어요."
- [ ] 코치마크에 "모드 전환 안내" 보조 액션 (트레이/설정 → 바탕화면 모드) 1줄 링크
- [ ] 위젯 모드/대시보드 미리보기에서 카드 본문에 옅은 안내 배너 ("바탕화면 아이콘 아래 모드에서 동작") — `!isWindows` 안내와 동일 톤
- [ ] 챗봇 KB Q&A 5건 추가:
  - Q1: "바탕화면 정리에 파일을 끌면 금지 표시가 나와요"
  - Q2: "바탕화면 정리 박스에 파일이 안 들어가요"
  - Q3: "바탕화면 정리는 어떻게 사용하나요?"
  - Q4: "바탕화면 아이콘 아래 모드는 무엇인가요?"
  - Q5: "위젯 모드에서 바탕화면 정리가 동작하지 않아요"
- [ ] 노션 사용자 가이드 `바탕화면 정리` 섹션에 "동작 모드 전제" 강조 배너

#### 트랙 C — 회귀 안전망 (P1)

- [ ] 메타 테스트: "preload는 dragover/drop을 preventDefault 한다" — DOM 이벤트 mock 단위 테스트
- [ ] 메타 테스트: "모든 BrowserWindow에 will-navigate 가드가 등록된다" — main.ts grep 기반 정적 검사 또는 헬퍼 호출 카운트 단위 테스트
- [ ] 회귀 시나리오 5개 수동 체크 (5.3)

#### 트랙 D — 릴리스 (P0)

- [ ] release-notes.json v2.0.4 항목 추가
- [ ] 챗봇 KB 재임베딩 (`node scripts/ingest-chatbot-qa.mjs`)
- [ ] 노션 가이드 업데이트
- [ ] Win+macOS 빌드 + GitHub 릴리스 (8단계)

### 2.2 제외 범위 (Out of Scope)

- **위젯이 파일 드롭을 수용하는 기능** — PRD §2.2 "아이콘 추적 절대 금지" 위반. 사용자가 진짜 분류 기능을 원하면 별도 신규 PDCA로 처리
- **자동 모드 전환** — 위젯 모드에서 카드를 추가했을 때 "바탕화면 모드로 전환할까요?" 다이얼로그는 본 핫픽스에 포함 안 함 (UX 결정 필요, 별도 PDCA)
- **모바일 앱** — 데스크톱 Electron 전용 이슈
- **macOS/Linux 기본 동작 차이** — `will-navigate` 가드는 cross-platform이므로 동일하게 적용. native-desktop 모드 자체는 Windows 전용이라 macOS는 코치마크에서만 변경
- **파일 외 다른 drop 타입** (이미지 dataURI, text/uri-list 등) — `bookmark/sticker/realtime-wall` 등 의도적으로 drop을 받는 컴포넌트는 그곳에서 `e.stopPropagation()`을 이미 호출하므로 글로벌 가드는 하위 핸들러를 안 깬다. 단 회귀 시나리오 RG-04로 검증
- **Electron 버전 업그레이드** — 본 핫픽스는 40.9.3 그대로 진행

---

## 3. 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 우선순위 | 트랙 |
|----|----------|----------|:----:|
| FR-01 | 어떤 BrowserWindow에 어떤 파일/폴더를 드롭해도 앱이 navigate/unload되지 않는다 | Must | A |
| FR-02 | preload에 `installDropGuard(window)` 또는 동등 헬퍼가 신설되어 모든 윈도우 진입점에서 호출된다 | Must | A |
| FR-03 | main 프로세스에서 `webContents.on('will-navigate')`로 `file://`/`http(s)://` 외부 navigation을 차단하는 헬퍼가 모든 BrowserWindow에 적용된다 | Must | A |
| FR-04 | `setWindowOpenHandler`가 모든 BrowserWindow에 등록되어 `file://` 외부 윈도우 오픈을 deny한다 | Should | A |
| FR-05 | `DesktopOrganize.tsx` 코치마크 문구가 "바탕화면 아이콘 아래 모드 전제"를 명시한다 | Must | B |
| FR-06 | 위젯 모드/대시보드 미리보기 시 카드 본문에 옅은 안내 배너 표시 (단, native-desktop 모드일 때는 숨김) | Should | B |
| FR-07 | 챗봇 KB에 본 이슈 관련 Q&A 5건 이상 추가되고 재임베딩된다 | Must | B |
| FR-08 | 노션 사용자 가이드 `바탕화면 정리` 섹션에 동작 모드 전제 안내가 추가된다 | Must | B |
| FR-09 | 메타 테스트로 가드 누락 회귀를 차단한다 (단위 테스트 2건+) | Should | C |
| FR-10 | release-notes.json v2.0.4 항목 추가 + GitHub 릴리스 (Win+macOS 6 자산 + 6 URL 302 검증) | Must | D |

### 3.2 비기능 요구사항 (Non-Functional Requirements)

| 분류 | 기준 | 측정 방법 |
|------|------|-----------|
| 안정성 (회귀) | 기존 위젯 22종 + 의도된 drop 컴포넌트(bookmark/sticker/realtime-wall) 동작 100% 유지 | RG-01~RG-05 수동 체크 |
| 안정성 (크래시) | 어떤 파일/폴더를 어떤 윈도우에 드롭해도 unload 0건 | 수동 5종 시나리오 |
| 성능 | 가드 추가로 인한 렌더 성능 영향 0 (이벤트 가드만, 무거운 처리 없음) | 체감 + DevTools |
| 아키텍처 | Clean Architecture 4-layer 의존성 규칙 준수 (가드는 preload + main에만, domain/usecases 변경 0) | `npx tsc --noEmit` 0 errors |
| 디자인 일관성 | 코치마크/배너 sp-* 토큰만 사용, `rounded-sp-*` 0건 | grep 검증 |
| 호환성 | Win11 24H2 + Win10 + macOS Tahoe 26 모두 동일 동작 | 빌드 후 실기 또는 사용자 검증 |

---

## 4. 사용자 시나리오 (User Stories)

**US-1: 위젯 모드에서 파일을 끌어 넣어본 사용자**
> 사용자가 위젯 모드의 `바탕화면 정리` 박스에 PPT 파일을 끌어 넣는다.
>
> - 흐름: 드래그 시작 → 박스 위에서 빨간 동그라미 빗금 커서 → 드롭 → **앱이 멀쩡히 살아있음** + 옅은 안내 배너 "바탕화면 아이콘 아래 모드에서 동작" 표시
> - 수용 기준: 앱 unload 0건. 드롭이 무동작이지만 "왜 안 되는지" 즉시 이해 가능.

**US-2: 코치마크를 처음 본 신규 사용자**
> 처음 위젯을 활성화한 사용자가 카드를 보고 코치마크를 읽는다.
>
> - 흐름: 코치마크 → "이 위젯은 바탕화면 아이콘 아래 모드에서만 동작해요" 명시 → "모드 전환" 보조 링크 클릭 → 트레이/설정 안내 → 모드 전환 → 박스 위로 진짜 아이콘 드래그 가능
> - 수용 기준: 사용자가 1회 코치마크로 사용법 이해.

**US-3: 다른 위젯 사용 중 실수로 파일을 떨군 사용자**
> 메모 위젯에 텍스트 입력 중 실수로 다른 창에서 파일을 끌다가 메모 윈도우 위에 떨군다.
>
> - 흐름: 드롭 → **메모 입력 데이터 보존** + 앱 그대로 + 콘솔에 가드 로그
> - 수용 기준: 메모 미저장 텍스트 손실 0건. 같은 시나리오를 메인 윈도우/아이콘 윈도우에서 반복해도 동일.

**US-4: bookmark/sticker/realtime-wall 정상 drop 사용자**
> 즐겨찾기 import이나 스티커 업로드처럼 의도적으로 drop을 받는 곳에서 파일을 떨어뜨린다.
>
> - 흐름: 드롭 → 기존 핸들러가 정상 처리 (가드는 글로벌 default만 차단, 하위 컴포넌트의 `e.preventDefault() + 정상 처리`는 그대로 동작)
> - 수용 기준: 회귀 0건. 즐겨찾기 import/스티커 업로드/실시간 보드 이미지 drop 모두 정상.

**US-5: 챗봇에 질문하는 사용자**
> "바탕화면 정리에 파일이 안 들어가요" 챗봇 질문.
>
> - 흐름: 챗봇 → KB Q&A 매칭 → "바탕화면 정리 위젯은 시각적 프레임이고, 실제 아이콘 정리는 `바탕화면 아이콘 아래 모드`에서 OS 바탕화면 아이콘을 직접 드래그해 동작합니다. 모드 전환은 트레이 메뉴/설정에서…" 안내
> - 수용 기준: 사용자 후속 질문 0~1건으로 해결.

---

## 5. 성공 기준

### 5.1 완료 정의 (Definition of Done)

- [ ] FR-01 ~ FR-10 모두 구현 완료
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run build` 성공 (5단계 분리 실행 — `MEMORY.md` Release Workflow 빌드 회피책 준수)
- [ ] `npm run test` 통과 (신규 메타 테스트 포함)
- [ ] 회귀 시나리오 5개 수동 체크 PASS (5.3)
- [ ] PDCA Match Rate ≥ 90%
- [ ] release-notes.json v2.0.4 항목 + 챗봇 KB Q&A 5건+ 재임베딩 + 노션 가이드 업데이트
- [ ] GitHub 릴리스 (Win+macOS arm64+x64 6자산, 6 URL 302 검증)

### 5.2 품질 기준

- [ ] `domain/` → 외부 의존 0건 (본 핫픽스는 domain 미변경)
- [ ] `usecases/` → `adapters/`, `infrastructure/` import 0건 (usecases 미변경)
- [ ] `any` 타입 사용 0건
- [ ] `rounded-sp-*` 사용 0건
- [ ] sp-* 디자인 토큰만 사용
- [ ] 신규 메타 테스트: drop 가드 유무 검증 + will-navigate 가드 유무 검증

### 5.3 회귀 검증 시나리오 (5개)

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| RG-01 | 위젯 모드 `바탕화면 정리` 박스에 파일 드롭 | 앱 살아있음 + 안내 배너 표시 |
| RG-02 | 메인 윈도우 어디든 파일/폴더 드롭 | 앱 살아있음 + 무동작 |
| RG-03 | 아이콘 모드 윈도우에 파일 드롭 | 앱 살아있음 + 무동작 |
| RG-04 | 즐겨찾기 import 모달에 .json 드롭 | 정상 import 동작 (가드가 하위 핸들러를 안 깸) |
| RG-05 | 스티커 업로더에 이미지 드롭 / 실시간 보드에 이미지 드롭 | 정상 업로드 동작 |

### 5.4 위험 평가 결과

| 위험 | 검토 의견 | 결론 |
|------|-----------|------|
| 글로벌 가드가 의도된 drop 컴포넌트를 깰 위험 | 가드는 `window` 레벨 default 차단만, 하위 컴포넌트가 자체 `e.preventDefault()`로 가로채면 그대로 동작 | RG-04, RG-05로 검증 |
| 다른 세션 native-desktop 작업과 충돌 | 본 작업은 preload + main `will-navigate` 가드 + DesktopOrganize.tsx + KB만 변경. native-desktop 핵심(`desktopWidgetManager.ts`, `win32Desktop.ts`) 미수정 | 진행 가능 |
| 빌드 트러블 (vite EXIT 127) | `MEMORY.md` v2.0.3 회피책 (5단계 분리 실행) 그대로 적용 | 진행 가능 |
| Electron 버전 업그레이드 필요 여부 | 40.9.3에서 will-navigate + dragover preventDefault 모두 표준 동작 | 불필요 |

---

## 6. 위험 및 대응

| 위험 | 영향도 | 발생 가능성 | 대응 |
|------|--------|-------------|------|
| **하위 drop 컴포넌트 회귀** — 글로벌 가드가 bookmark/sticker/realtime-wall import drop을 막음 | High | Low | RG-04, RG-05 수동 체크 + 가드 함수가 `e.target`이 의도된 drop zone인지 체크하지 않고 무조건 default만 막음(하위 stopPropagation은 이미 정상 동작 보장) |
| **다른 세션 충돌** — `electron/main.ts`가 다른 세션과 동시 수정 | Medium | Low | 본 작업은 main.ts에 새 헬퍼 1개 + 각 BrowserWindow 생성 직후 1줄씩 호출만 추가. 함수 본체는 별도 위치에 배치하여 머지 충돌 최소화. 충돌 발생 시 즉시 사용자에게 보고 |
| **코치마크 문구 변경의 사용자 학습 부담** | Low | Medium | 기존 사용자는 이미 코치마크를 dismiss했으므로 신규 노출 X. 신규 사용자만 새 문구 학습 |
| **챗봇 KB 재임베딩 실패** | Medium | Low | 환경변수 + 명령은 `MEMORY.md` Release Workflow §3 그대로 사용 |
| **macOS 빌드는 GitHub Actions 의존** | Low | Low | `MEMORY.md` Release Workflow §7 그대로 |

---

## 7. 아키텍처 고려사항

### 7.1 프로젝트 레벨 선택

| 레벨 | 특성 | 추천 대상 | 선택 |
|------|------|-----------|:---:|
| Starter | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 단위 모듈 | Electron 데스크톱 앱 | **☑ (현재)** |
| Enterprise | 엄격한 레이어 분리 + DI | 마이크로서비스 | ☐ |

쌤핀 Clean Architecture 4레이어 구조 그대로 사용. 본 핫픽스는 `infrastructure/` (Electron preload + main)와 `widgets/` (코치마크 + 배너)에만 변경.

### 7.2 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|------|------|------|------|
| 가드 위치 (renderer 측) | 컴포넌트별 / 앱 루트 / preload | **preload (`installDropGuard`)** | 모든 BrowserWindow가 동일 preload를 공유하므로 1곳 변경 = 전체 적용. 컴포넌트별은 누락 위험. App 루트는 BrowserWindow 종류마다 entry가 다름 (main, widget, icon, quickAdd, stickerPicker) |
| 가드 위치 (main 측) | 윈도우별 / 헬퍼 일원화 | **헬퍼 `installNavigationGuard(win)`** | 6+개 BrowserWindow에 동일 코드 반복하면 누락 회귀. 헬퍼로 일원화 + 메타 테스트로 호출 누락 차단 |
| 차단 정책 (file://) | preventDefault 만 / preventDefault + 콘솔 로그 / preventDefault + 토스트 | **preventDefault + 콘솔 진단 로그** | 토스트는 의도된 drop과 구분 어려움. 콘솔 로그는 디버깅 용도 |
| 코치마크 문구 변경 | 기존 dismiss 무시 / 강제 재노출 | **기존 dismiss 존중 (신규 사용자만)** | 사용자 학습 비용 최소. 기존 사용자는 안내 배너로 충분 |
| 안내 배너 노출 조건 | 항상 / native-desktop 아닐 때만 | **native-desktop 아닐 때만** | 정상 동작 모드에서는 군더더기 |
| 챗봇 KB 추가 위치 | 기존 Q&A 카테고리 / 신규 카테고리 | **기존 `바탕화면 정리` 카테고리 확장** | 카테고리 신설 비용 < 1건 추가 |

### 7.3 Clean Architecture 적용

```
Selected Level: Dynamic (Electron + React + Clean Architecture 4-layer)

본 핫픽스의 레이어별 변경:

┌─────────────────────────────────────────────────────────────┐
│ infrastructure/  (Electron — 변경 핵심)                      │
│  └─ electron/preload.ts (수정)                              │
│       - installDropGuard() 함수 신설 (window 레벨)          │
│       - 진입 시 자동 호출                                    │
│  └─ electron/main.ts (수정)                                 │
│       - installNavigationGuard(win) 헬퍼 신설               │
│       - 모든 BrowserWindow 생성 직후 1줄 호출 (mainWindow,  │
│         widgetWindow, iconWindow, quickAddWindow,           │
│         stickerPickerWindow, ...)                           │
├─────────────────────────────────────────────────────────────┤
│ adapters/  (UI 변경 최소)                                   │
│  └─ widgets/items/DesktopOrganize/DesktopOrganize.tsx (수정)│
│       - 코치마크 문구 변경 (모드 전제 명시)                 │
│       - 안내 배너 추가 (!isNativeDesktopMode 조건)          │
│       - 모드 전환 보조 링크 (트레이/설정 안내)              │
├─────────────────────────────────────────────────────────────┤
│ widgets/  (변경 없음)                                       │
├─────────────────────────────────────────────────────────────┤
│ usecases/  (변경 없음)                                      │
├─────────────────────────────────────────────────────────────┤
│ domain/  (변경 없음)                                        │
└─────────────────────────────────────────────────────────────┘

부수 변경:
- public/release-notes.json (v2.0.4 항목)
- scripts/ingest-chatbot-qa.mjs (Q&A 5건+)
- 노션 가이드 (Notion MCP)
- 신규 메타 테스트 2건 (드롭 가드 + navigation 가드 누락 검증)
```

### 7.4 IPC/외부 의존

본 핫픽스는 IPC 채널 신설 없음. `desktopWidgetManager`/`win32Desktop` 미수정.
가드 함수만 추가하므로 새 외부 의존 0건.

---

## 8. 컨벤션 사전 검토

### 8.1 기존 프로젝트 컨벤션 체크

- [x] `CLAUDE.md`에 코딩 컨벤션 섹션 존재
- [x] `tsconfig.json` strict 모드
- [x] Path Alias 정의 (`@domain/*`, `@usecases/*`, `@adapters/*`, `@infrastructure/*`, `@widgets/*`)
- [x] Tailwind sp-* 토큰
- [x] Noto Sans KR
- [x] 라운딩 정책: `rounded-sp-*` 금지, Tailwind 기본 키만

### 8.2 본 핫픽스에서 적용할 컨벤션

| 분류 | 본 핫픽스에서 적용 | 우선순위 |
|------|-------------------|:--------:|
| 라운딩 | 코치마크/배너 `rounded-lg`, `rounded-xl` (기존 그대로) | High |
| 디자인 토큰 | `sp-bg`, `sp-card`, `sp-border`, `sp-accent`, `sp-text`, `sp-muted`, `sp-highlight` (기존 그대로) | High |
| 모션 | `prefers-reduced-motion` 시 transition 0 (기존 그대로) | High |
| Import 순서 | `@domain` → `@usecases` → `@adapters` → `@widgets` 순 | Medium |
| any 금지 | strict | High |
| 가드 함수 위치 | preload는 단일 파일 그대로 (분리 X), main.ts는 기존 헬퍼 영역에 추가 | Medium |
| 다중 세션 회피 | `feedback_neis_schedule_other_session.md` 패턴 — 명시 path만 수정, `git add .` 금지 | High |
| 프론트 협업 정책 | 코치마크/배너 디자인 변경은 frontend-design 또는 bkit:frontend-architect 에이전트 협업 | High |

### 8.3 환경 변수

추가 환경 변수 없음. 챗봇 KB 재임베딩은 기존 `SUPABASE_URL`/`EMBED_AUTH_TOKEN` 그대로.

---

## 9. 다음 단계

1. [ ] 사용자 승인 → `/pdca design desktop-organize-drop-crash-fix`
2. [ ] **Design 단계 결정 항목**:
   - preload 가드 함수 시그니처 최종 결정 (`installDropGuard()` vs `setupSecurityGuards()`)
   - main.ts 헬퍼 함수 위치 (기존 헬퍼 영역 vs 신규 `electron/security-guards.ts`)
   - 안내 배너 정확한 카피 (frontend-design 협업)
   - 챗봇 Q&A 5건 정확한 문구
3. [ ] frontend-design 또는 bkit:frontend-architect 에이전트와 안내 배너 mockup 협업 (메모리 정책)
4. [ ] 디자인 검토 통과 후 `/pdca do desktop-organize-drop-crash-fix`
5. [ ] 구현 (Do Phase) — 예상 0.5~0.7 작업일
   - Phase A: preload 가드 + main 가드 헬퍼 + 모든 BrowserWindow 적용 (~0.2일)
   - Phase B: DesktopOrganize.tsx 코치마크/배너 + 메타 테스트 (~0.2일)
   - Phase C: 회귀 시나리오 수동 체크 RG-01~RG-05 (~0.1일)
   - Phase D: release-notes + 챗봇 KB + 노션 (~0.1일)
6. [ ] Gap 분석 (Check Phase) — Match Rate ≥ 90% 목표
7. [ ] v2.0.4 릴리즈 (Win+macOS, MEMORY.md 8단계)

---

## Version History

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-05-07 | 최초 Draft. 사용자 신고(2026-05-07) → 2-층 진단(의도된 🚫 + 진짜 navigate 버그) → 4트랙(A:크래시 차단, B:UX 보강, C:회귀 안전망, D:릴리스) 정의 | pblsketch |
