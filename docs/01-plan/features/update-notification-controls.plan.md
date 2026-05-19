# 업데이트 알림 사용자 통제권 (Update Notification Controls) Planning Document

> **Summary**: v2.0.4 `update-notification-friendliness` PDCA가 인앱 업데이트 모달의 **카피·정보계층·a11y**를 개선했음에도, v2.0.4 출시 직후 사용자 피드백 3건(2026-05-08 ~ 05-14)이 "하루에 한 번씩 같은 모달이 떠서 번거롭다 / 안 떴으면 좋겠다 / 제발 안 뜨게 해달라"로 모아졌다. 진짜 문제는 **카피 친절도가 아니라 빈도 제어권 부재**였다. 본 PDCA는 사용자에게 알림 채널·빈도 통제권을 주되 보안 업데이트는 보호한다. **`dismissed` 상태 영속화 + 스누즈 드롭다운 + 버전 건너뛰기 + 사이드바 배지 폴백 + 보안 강제 노출**의 5개 축으로 "매번 강제 차단성 모달"에서 "최초 1회 모달 → 이후 사일런트 배지"로 UX를 재설계한다.
>
> **Project**: SsamPin
> **Version**: v2.0.5 (예정 — patch)
> **Author**: pblsketch
> **Date**: 2026-05-14
> **Status**: Draft v0.2 (Design v0.1 작성 중 RG-03 표현 보정 + RG-06/07 신규 추가)
> **Scope**: Standard (사용자 결정 — 2주, 스누즈 + 사이드바 배지 폴백 + 보안 분기 포함)
>
> **v0.2 변경사항** (2026-05-14, Design 단계에서 역피드백):
> - RG-03 표현 보정: "24시간 후 자동 모달 재노출" → "24시간 후 사이드바 배지 노출, 배지 클릭 시 모달 재호출". 이유: `lastNotifiedVersion === v` 게이트가 자동 재노출을 막음. 자동 재노출 풀면 무한 루프 위험.
> - RG-06 (사이드바 배지 클릭 → 모달 강제 재호출) 신규 추가
> - RG-07 (Collapsed 사이드바 배지 위치 — 햄버거 아이콘 우상단) 신규 추가
> - D-04a/D-07a — LaterDropdown / SidebarUpdateBadge 분리 컴포넌트 명시 (Design §3.3 / §4.2 반영)

---

## 1. 개요

### 1.1 목적

이 PDCA가 해결하는 문제:

1. **`dismissed` 상태가 영속화되지 않아 매 앱 시작/체크 사이클마다 같은 버전 모달이 재노출된다**. [`UpdateNotification.tsx:99`](e:/github/ssampin/src/adapters/components/common/UpdateNotification.tsx#L99)의 `const [dismissed, setDismissed] = useState(false)` 한 줄이 단일 회귀 지점. 영속화만 되어도 "하루에 한 번씩 뜨는" 핵심 증상은 차단된다.
2. **닫기·X·ESC가 모두 "현재 세션만 무시"로 작동해 사용자가 빈도를 통제할 수 없다**. 선택지가 `[닫기]` / `[지금 업데이트]` 둘뿐이라 "3일 뒤 다시 알려줘"·"이 버전 건너뛰기" 같은 중간 옵션이 없다.
3. **차단성 모달이 유일한 알림 채널이다**. 사용자가 작업 흐름 중인지 한가한지 무관하게 modal overlay + focus-trap이 강제로 입력을 가로챈다. 동의 없는 차단은 알림 피로의 가장 큰 원인.
4. **보안 업데이트와 일반 기능 업데이트의 우선순위 구분이 없다**. 사용자가 "끄고 싶다"는 요청을 그대로 받으면 보안 패치 누락 위험. 두 채널을 분리해서 사용자 통제권은 일반 업데이트에만 적용하고 보안은 보호해야 한다.
5. **(잠재 기술 부채) `electron-updater` 자동 체크 주기가 메인 프로세스에 하드코딩되어 있어 사용자가 직접 조정할 수 없다**. 본 PDCA Standard 스코프에선 다루지 않고 Pulsetech 스코프(v2.0.6+)로 이월.

### 1.2 배경

2026-05-08 v2.0.4 릴리즈 직후~2026-05-14 사이 사용자 피드백 3건 누적:

> "하루에 한 번씩 업데이트 창 뜨는 거 같은데 너무 번거롭네요. 안 떴으면 좋겠어요."
> (FEATURE / 2026-05-08T16:27:27 — "업데이트 알림 끄기 기능 혹은 알림 주기 설정 요청")
> "제발 업데이트 창 좀 안 뜨게 해주면 안 되나요?"

세 건이 모두 **빈도**를 문제 삼고 있다는 점이 핵심이다. v2.0.4 PDCA에서 다룬 모달 카피·정보 계층·a11y는 모달이 **뜬다는 전제** 하의 개선이었고, 그 전제 자체에 사용자가 거부 반응을 보였다.

v2.0.4 plan §2.3 "비목표"에 명시되어 있던 항목:
> "**업데이트 알림 자체의 메커니즘은 손대지 않음** (electron-updater 흐름·다운로드 진행률·재시작 로직 그대로 유지). UI 렌더링·카피만 손본다."

본 PDCA는 그 비목표를 정면으로 다룬다. 단, electron-updater 흐름·다운로드 로직은 여전히 손대지 않고 **렌더링 게이팅 레이어**를 사이에 끼워넣는 방식으로 비파괴 확장한다.

사용자 결정 (2026-05-14 AskUserQuestion 응답):

| 차원 | 선택 | 비고 |
|------|------|------|
| 구현 범위 | **Standard (2주)** | 스누즈 드롭다운 + 사이드바 배지 폴백. 설정 페이지 UI는 v2.0.6+로 이월. |
| 기본 X/ESC 동작 | **3일 스누즈** | "이 버전 건너뛰기"는 명시 선택 시에만. |
| 보안 업데이트 | **건너뛰기 불가 + 🔒 강조 표시** | `isSecurity` 옵션 플래그로 분기. |

### 1.3 관련 문서

- 사용자 피드백: 본 세션 대화 (2026-05-14) + FEATURE 2026-05-08T16:27:27.32834
- 선행 PDCA (카피/UI 개선): [`update-notification-friendliness.plan.md`](e:/github/ssampin/docs/01-plan/features/update-notification-friendliness.plan.md), [`.design.md`](e:/github/ssampin/docs/02-design/features/update-notification-friendliness.design.md)
- 인앱 컴포넌트: [`src/adapters/components/common/UpdateNotification.tsx`](e:/github/ssampin/src/adapters/components/common/UpdateNotification.tsx) (420줄, v2.0.4 기준)
- 사이드바 (배지 추가 대상): [`src/adapters/components/Layout/Sidebar.tsx`](e:/github/ssampin/src/adapters/components/Layout/Sidebar.tsx)
- 릴리즈 노트 소스: [`public/release-notes.json`](e:/github/ssampin/public/release-notes.json) — `isSecurity?: boolean` 옵션 필드 추가
- Electron 업데이트 흐름 (손대지 않음): [`electron/main.ts`](e:/github/ssampin/electron/main.ts) `autoUpdater.setFeedURL` 영역
- Zustand persist 패턴 레퍼런스: 기존 `useUpdatePreferencesStore` 미존재 — 본 PDCA에서 신설. 패턴은 `useTasksSyncStore`(persist + quotaCooldownUntil 영속 ISO timestamp 사례) 참고.

---

## 2. 범위

### 2.1 포함 범위 (In Scope) — Standard 2주

#### Layer 1 — 영속화 스토어 (P0, 필수)

- **`useUpdatePreferencesStore` 신규** (Zustand persist + localStorage):
  - `lastNotifiedVersion: string | null` — 같은 버전 모달 1회 제한 키
  - `snoozeUntil: number | null` — Unix ms timestamp, 이 시각까지 모달 침묵
  - `skippedVersions: string[]` — 영구 건너뛴 버전 목록 (보안 업데이트는 무시)
  - Actions: `markNotified(version)` / `snooze(days)` / `skip(version)` / `unskip(version)` / `reset()`
- **저장 위치**: localStorage `ssampin-update-prefs-v1` 키. Electron userData/IndexedDB 동기화는 본 스코프 밖 (사용자가 PC 변경 시 알림이 다시 떠도 무방한 데이터).
- **마이그레이션**: 신규 스토어이므로 기존 사용자 영향 0. 첫 실행 시 빈 상태 → 첫 모달 노출 → markNotified 호출.

#### Layer 2 — 모달 게이팅 + 드롭다운 (P0, 필수)

- **`UpdateNotification.tsx` 노출 게이팅**: `onUpdateAvailable` 이벤트 수신 후 모달 띄우기 직전, 스토어 상태로 4단계 게이트:
  ```
  if (skippedVersions ∋ info.version) → 침묵
  if (now < snoozeUntil) → 침묵
  if (lastNotifiedVersion === info.version) → 사이드바 배지만 (Layer 3)
  else → 모달 노출 + markNotified(info.version)
  ```
- **단, `info.isSecurity === true`면 위 4단계 모두 무시하고 강제 모달**.
- **푸터 CTA 재구성**:
  - 좌측: `[노션가이드 ↗] [피드백 ↗]` (현행 유지)
  - 우측 1: `[나중에 ▾]` 드롭다운 (현행 `[닫기]` 대체)
    - "1일 뒤 다시 알림" → `snooze(1)`
    - "3일 뒤 다시 알림" → `snooze(3)` (기본 권장)
    - 구분선
    - "이 버전 건너뛰기" → `skip(info.version)`
  - 우측 2: `[지금 업데이트]` (현행 유지)
- **X 버튼 / ESC 키 / 백드롭 클릭 = `snooze(3)`로 통일** (기본 동작, 사용자 결정).
- **보안 업데이트 헤더 변형**:
  - 🔒 lock 아이콘 + "보안 업데이트입니다 — v{version}"
  - 서브헤더: "이 업데이트는 보안 패치를 포함하고 있어 건너뛸 수 없어요. 가능한 한 빠른 업데이트를 권장해요."
  - 푸터 우측: `[나중에 ▾]` 드롭다운 → "1일/3일 뒤 다시 알림"만 (스누즈 단기간만 허용, "건너뛰기" 메뉴 항목 비활성/제거)
  - 백드롭 클릭은 닫히지만 `snooze(1)`로 단축 (3일 → 1일).

#### Layer 3 — 사이드바 배지 폴백 (P1)

- **`Sidebar.tsx` 우측 하단 `v{APP_VERSION}` 표시 옆에 작은 점(•) 배지 추가**:
  - 조건: `info.version`이 현재 앱 버전보다 높고, `lastNotifiedVersion === info.version`이고, `now > snoozeUntil`일 때.
  - 색상: `bg-sp-accent` (디자인 토큰), 6px 원형.
  - aria-label: "새 버전 v{version} 사용 가능"
  - 클릭 시 `UpdateNotification`을 다시 호출 (스토어에 `forceShow: boolean` 임시 플래그 또는 컴포넌트 내부 ref). 클릭하면 모달 다시 노출되고 스누즈/건너뛰기 선택 가능.
  - 호버 시 툴팁: "v{version} 사용 가능 — 클릭해서 자세히 보기".
- **사용자가 `skip(version)` 한 경우엔 배지도 숨김**. 의도가 "이 버전은 안 봄"이므로 일관성 유지. 단, 더 새로운 버전(`> skippedVersion`)이 나오면 다시 등장.

#### Layer 4 — 데이터 스키마 확장 (P1)

- **`public/release-notes.json` 스키마에 `isSecurity?: boolean` 옵션 필드 추가** (버전 단위):
  ```json
  {
    "version": "2.0.6",
    "date": "2026-XX-XX",
    "isSecurity": true,
    "highlights": [...],
    "changes": [...]
  }
  ```
- **`fetchReleaseNotesSince` 반환 타입에 `isSecurity` 전파** (`VersionNote.isSecurity?: boolean`).
- **`UpdateInfo`에 `isSecurity` 매핑**: electron-updater의 `onUpdateAvailable`이 release-notes.json의 해당 버전 항목을 조회해서 isSecurity를 함께 셋한다.
- **기존 9개 버전(v1.10.x ~ v2.0.4) 항목에는 isSecurity 추가하지 않음** (옵션 필드 — 누락 시 false로 간주).

#### Layer 5 — 회귀 안전망 (P0)

- **단위 테스트** (Vitest):
  - `useUpdatePreferencesStore.test.ts` — markNotified/snooze/skip/unskip/reset 5종
  - `UpdateNotification.gating.test.ts` — 4단계 게이트 + 보안 강제 노출 (메모리 store mock)
- **메타 테스트** (grep 기반, regression-check 스타일):
  - `__tests__/regression/update-notification-persistence.test.ts` — UpdateNotification.tsx에 `useUpdatePreferencesStore` import 존재 + `useState(false)` 패턴이 dismissed 영속화 외 잔존하지 않음 보장.
- **수동 RG 시나리오** 5종 (인수 기준 §6에 명시).

### 2.2 제외 범위 (Out of Scope, v2.0.6+)

다음은 v2.0.5 스코프 밖. 사용자 요청은 받았으나 본 사이클에서는 다루지 않음:

- **설정 페이지 "업데이트 알림" 섹션** (AppInfoSection 내 채널/주기 라디오·드롭다운 UI). 이 PDCA에선 모달 내부 상호작용으로만 통제권 제공. UI 카드는 v2.0.6+ Pulsetech 스코프.
- **`electron-updater` 자동 체크 주기 사용자 조정** (현재 기본값 유지, 메인 프로세스 변경 없음).
- **건너뛴 버전 관리 UI** ("다시 알림 받기" 버튼으로 unskip — v2.0.6+).
- **다국어 대비** (한국어 단일 유지).
- **푸시 알림/OS 알림 센터 연동** (현재 인앱 채널만).
- **사용자 행동 텔레메트리** (스누즈 선택 비율·skip 선택 비율 측정 — 별도 텔레메트리 인프라 필요).
- **모바일(Vercel PWA) 영향 없음** — 본 PDCA는 Electron desktop 전용. 모바일은 별도 OAuth/오토업데이트 흐름.

### 2.3 비목표

- **electron-updater 흐름 비파괴**. `autoUpdater.setFeedURL`·`onUpdateAvailable`·`downloadUpdate`·`installUpdate` IPC는 손대지 않는다. 게이팅은 **렌더러 UI 레이어**에서만.
- **release-notes.json 스키마 파괴 변경 금지**. `isSecurity` 추가는 옵션 필드, 누락 시 false로 간주 (비파괴 확장).
- **보안 업데이트 사용자 통제 금지**. isSecurity=true는 스누즈 1~3일은 허용하되 영구 건너뛰기 불가. 가이드 UX는 사용자의 즉시 업데이트를 유도.
- **NEIS / Schedule / Roster 관련 어떤 파일도 건드리지 않음** (다른 PDCA 진행 영역).
- **현재 진행 중인 모바일 UX (PR #38 이후) 브랜치와 충돌 회피**: 본 PDCA는 `src/adapters/components/common/`, `Layout/Sidebar.tsx`, `stores/` 영역으로 모바일(`src/mobile/`)과 자연 분리.

---

## 3. 산출물 (Deliverables)

| ID | 산출물 | Layer | 우선순위 |
|----|-------|-------|--------|
| D-01 | `src/adapters/stores/useUpdatePreferencesStore.ts` 신규 — Zustand persist 스토어 | 1 | P0 |
| D-02 | `useUpdatePreferencesStore.test.ts` — 5종 액션 단위 테스트 | 1 | P0 |
| D-03 | `UpdateNotification.tsx` 4단계 게이팅 로직 추가 + `useState(dismissed)` 제거 | 2 | P0 |
| D-04 | `UpdateNotification.tsx` `[나중에 ▾]` 드롭다운 메뉴 — 1일/3일/건너뛰기 | 2 | P0 |
| D-04a | `LaterDropdown.tsx` 분리 컴포넌트 (role=menu·키보드 a11y·ESC stopPropagation) — Design §3.3 | 2 | P0 |
| D-05 | `UpdateNotification.tsx` 보안 업데이트 헤더 변형 + 푸터 분기 | 2 | P0 |
| D-06 | `UpdateNotification.gating.test.ts` — 4단계 게이트 + 보안 강제 단위 테스트 | 2 | P0 |
| D-07 | `Sidebar.tsx` 우측 하단 업데이트 배지 점(•) + 클릭 핸들러 (expanded/collapsed 양쪽) | 3 | P1 |
| D-07a | `SidebarUpdateBadge` 분리 컴포넌트 + `useNewVersionAvailable` 훅 (Design §4.2/§4.4) | 3 | P1 |
| D-08 | 모달 재호출 메커니즘 — `window.dispatchEvent('ssampin:show-update-modal')` DOM 이벤트 (Design §3.2) | 3 | P1 |
| D-09 | `public/release-notes.json` 스키마 + `landing/public/release-notes.json` 미러에 `isSecurity?: boolean` 옵션 필드 정착 (스키마만, 기존 항목 수정 X) | 4 | P1 |
| D-10 | `VersionNote.isSecurity` 타입 전파 (UpdateNotification + AppInfoSection 양쪽) | 4 | P1 |
| D-11 | `UpdateInfo` 에 `isSecurity` 매핑 — electron-updater 이벤트 핸들러에서 release-notes.json 조회해 셋 | 4 | P1 |
| D-12 | 메타 테스트 `update-notification-persistence.test.ts` — useState(false) 잔존 검증 | 5 | P0 |
| D-13 | `docs/02-design/features/update-notification-controls.design.md` — 컴포넌트 diff + 시나리오 흐름도 | — | P0 |
| D-14 | (선택) `docs/04-report/features/update-notification-controls.report.md` — Match Rate ≥ 90% 후 작성 | — | P1 |

---

## 4. 구현 계획 (2주 타임라인)

### Week 1 — Layer 1·2 + 핵심 동작

| Day | 작업 | 산출물 | 의존성 |
|-----|------|-------|-------|
| D1 (월) | `useUpdatePreferencesStore` 신규 + 단위 테스트 5종 | D-01, D-02 | — |
| D2 (화) | `UpdateNotification.tsx` 4단계 게이팅 로직 추가 (`useState(dismissed)` 제거) + 영속화 검증 | D-03 | D-01 |
| D2 (화) | 메타 테스트 작성 | D-12 | D-03 |
| D3 (수) | `[나중에 ▾]` 드롭다운 메뉴 + 1일/3일/건너뛰기 액션 | D-04 | D-03 |
| D4 (목) | 보안 업데이트 헤더 변형 + 푸터 분기 + isSecurity 강제 노출 로직 | D-05 | D-04 |
| D5 (금) | 게이팅 단위 테스트 4종(기본 노출·스누즈 침묵·skip 침묵·보안 강제) + lint/typecheck | D-06 | D-05 |

**Week 1 완료 시 검증 가능**: 같은 버전 모달 두 번 안 뜨고, X/ESC가 3일 스누즈로 작동, 드롭다운에서 1일/건너뛰기 선택 가능, 보안 플래그가 게이트를 우회한다.

### Week 2 — Layer 3·4 + 통합 + 릴리즈

| Day | 작업 | 산출물 | 의존성 |
|-----|------|-------|-------|
| D6 (월) | release-notes.json 스키마에 isSecurity 옵션 필드 정의 + 타입 전파 + electron-updater 매핑 | D-09, D-10, D-11 | — |
| D7 (화) | `Sidebar.tsx` 배지 점(•) 추가 + 클릭 핸들러 | D-07, D-08 | D-03 |
| D8 (수) | 통합 — 사이드바 배지 ↔ 모달 재호출 흐름 검증 + 모바일 사이드바 영역 회귀 점검 | — | D-07 |
| D9 (목) | `/pdca design` 진입 후 design 문서 보강 + gap-detector 검증 + 수동 RG 5종 | D-13 | 전체 |
| D10 (금) | 묶음 릴리즈 (v2.0.5 patch) — 5단계 분리 빌드 적용, 챗봇 KB Q&A 추가(2~3건), 노션 사용자 가이드 업데이트 카드 갱신 | — | 전체 |

**병렬 가능 작업**: Layer 4(스키마+타입 전파)는 Layer 2 게이팅과 독립이라 Day 1~3에 병렬 가능. 사이드바 배지(Layer 3)는 Layer 1·2 완료 후에만.

### 4.1 빌드·배포 트러블 회피 (메모리 기록 적용)

CLAUDE.md / MEMORY.md "Release Workflow Step 6"의 5단계 분리 명령을 그대로 적용:
```
npx tsc -b
npx vite build
npx vite build --config vite.student.config.ts
node scripts/build-electron.mjs
npx electron-builder
```

### 4.2 챗봇 KB / 노션 가이드 갱신 항목

본 PDCA는 **사용자 노출 표면이 있는** 변경이므로 KB/가이드 갱신 필요:
- 챗봇 Q&A 추가 (`scripts/ingest-chatbot-qa.mjs`):
  - Q. "업데이트 알림이 자꾸 떠요" → A. "모달 우측 하단 [나중에 ▾]에서 1일/3일 뒤 다시 알림이나 이 버전 건너뛰기를 선택할 수 있어요. 닫기(X)·ESC는 3일 스누즈로 동작합니다."
  - Q. "업데이트 알림 끄는 법" → A. "[나중에 ▾ → 이 버전 건너뛰기]를 선택하면 더 새로운 버전이 나올 때까지 알림이 안 떠요. 보안 업데이트(🔒)는 안전을 위해 건너뛸 수 없어요."
  - Q. "건너뛴 버전 다시 알림" → A. "현재 버전에선 다음 새 버전이 나올 때 자동으로 다시 알림이 떠요. 직접 확인하려면 사이드바 하단 v{버전} 옆 점(•)을 클릭하세요."
- 노션 가이드: 업데이트 알림 페이지 신규 또는 기존 카드에 "스누즈/건너뛰기" 섹션 추가.

---

## 5. 위험 및 완화

| 위험 | 영향 | 가능성 | 완화 |
|------|------|--------|------|
| `lastNotifiedVersion`이 영속화돼서 사용자가 의도적으로 모달 다시 보고 싶을 때 막힘 | 사이드바 배지가 폴백이지만 클릭 못 찾을 수 있음 | 중 | 사이드바 배지 hover 시 명시적 툴팁("클릭해서 자세히 보기") + 노션 가이드 안내. 추가 보호로 `forceShow` 액션 export. |
| 보안 업데이트 isSecurity 플래그 누락 — 운영자가 release-notes.json 작성 시 빠뜨림 | 보안 패치가 일반 업데이트로 처리돼 건너뛰기 가능 | 중 | `RELEASE-NOTES-WRITING-STYLE.md`에 isSecurity 체크리스트 추가 + 변환 스크립트(D-09 후속)에서 보안 키워드(보안/security/CVE/취약점) 자동 감지 시 경고. |
| Zustand persist localStorage 손상 시 모달이 무한 노출 | UX 저하 | 낮 | 스토어에 `version: 1` 마이그레이션 슬롯 + try-catch JSON.parse 가드. 손상 감지 시 reset(). |
| 사이드바 배지 점(•)이 사이드바 collapsed 상태에서 가려짐 | 사용자 인지 실패 | 중 | collapsed 상태에선 사이드바 우측 햄버거 아이콘에 배지 점 이동 + 별도 시각 처리. 디자인 시점에 확정. |
| `info.version`을 release-notes.json에서 못 찾으면 isSecurity 매핑 실패 | 보안 업데이트가 일반으로 처리 | 낮 | release-notes.json fetch 실패 또는 해당 버전 항목 누락 시 보수적으로 isSecurity=true 강제 (안전한 기본값). |
| 모바일 사이드바(react `Layout/MobileSidebar` 등)에 영향 | 모바일 회귀 | 낮 | 본 PDCA는 데스크톱 `Layout/Sidebar.tsx`만 수정. 모바일은 자체 사이드바라 자연 분리. |
| 묶음 릴리즈 없이 단독 v2.0.5 patch면 빌드 트러블 발생 시 다른 작업과 묶을 기회 손실 | 릴리즈 사이클 비용 | 낮 | 사용자가 다른 작업(예: 모바일 PR #36~38 이후 추가)과 같이 묶을지 결정. 메모리 "MEMORY.md Mobile Phase 5 작업 → 번들 릴리즈만 남음"과 동시 머지 검토. |

---

## 6. 인수 기준 (Acceptance Criteria)

### A. 영속화 (Layer 1)

- [ ] `useUpdatePreferencesStore` 5종 액션(markNotified/snooze/skip/unskip/reset) 단위 테스트 통과
- [ ] localStorage 키 `ssampin-update-prefs-v1`에 JSON 형태로 저장됨
- [ ] 앱 재시작 후에도 lastNotifiedVersion·snoozeUntil·skippedVersions 모두 보존

### B. 게이팅 (Layer 2)

- [ ] **RG-01**: 같은 버전(v{X})에서 모달 노출 후 닫기 → 앱 재시작 → 같은 버전 발견 시 모달 안 뜸 (사이드바 배지만 노출)
- [ ] **RG-02**: 모달에서 X/ESC/백드롭 클릭 → 다음 자동 체크에서 모달 안 뜸, snoozeUntil이 3일 뒤로 셋
- [ ] **RG-03**: [나중에 ▾ → 1일 뒤] 클릭 → 24시간 동안 모달도 배지도 안 뜸. 24시간 + 1분 후 사이드바 배지(•) 노출 (모달 자동 재노출은 의도적으로 안 함 — 알림 폭격 방지).
- [ ] **RG-04**: [나중에 ▾ → 이 버전 건너뛰기] 클릭 → skippedVersions에 추가, 더 새 버전 나올 때까지 모달도 배지도 안 뜸
- [ ] **RG-05**: isSecurity=true인 모의 release-notes.json + 모의 onUpdateAvailable 이벤트 → 스누즈/건너뛰기 상태와 무관하게 모달 강제 노출, [나중에 ▾]에 "이 버전 건너뛰기" 항목 없음, 🔒 헤더 표시
- [ ] **RG-06** (신규, Design v0.1): RG-01 상태(배지 노출 중)에서 사이드바 배지(•) 클릭 → `ssampin:show-update-modal` 이벤트 발생 → UpdateNotification이 모든 게이트 무시하고 모달 강제 재호출
- [ ] **RG-07** (신규, Design v0.1): 사이드바 collapsed 상태에서도 배지(•)가 가려지지 않음 — 햄버거 아이콘 우상단 절대 위치(`top-1 right-1`)에 노출. 클릭 시 RG-06과 동일 동작.

### C. 사이드바 배지 (Layer 3)

- [ ] 사이드바 expanded 상태에서 v{X} 옆 배지 점(•) 노출 (RG-01 조건)
- [ ] 배지 클릭 시 UpdateNotification 모달 재노출 (스누즈 무시, 사용자 명시 의도)
- [ ] 사이드바 collapsed 상태에서 배지 점 가려지지 않음 (햄버거 아이콘 등에 이동)
- [ ] aria-label "새 버전 v{X} 사용 가능" 부착, 호버 툴팁 노출

### D. 스키마 + 타입 (Layer 4)

- [ ] `public/release-notes.json` 스키마에 `isSecurity?: boolean` 추가 (기존 9개 버전 항목 수정 없음, 옵션 필드)
- [ ] `landing/public/release-notes.json` 미러도 동일 스키마 (릴리즈 워크플로 Step 2에서 두 파일 같이 갱신 — 메모리 기록)
- [ ] `VersionNote.isSecurity?: boolean` 타입 추가 (UpdateNotification + AppInfoSection 양쪽에서 사용 가능)
- [ ] `UpdateInfo.isSecurity` 매핑 — release-notes.json 조회 실패 시 보수적으로 true 처리

### E. 회귀 안전망 (Layer 5)

- [ ] 메타 테스트: UpdateNotification.tsx 에서 `const [dismissed, setDismissed] = useState(false)` 잔존 0건 (영속화 회귀 차단)
- [ ] 메타 테스트: `useUpdatePreferencesStore` import 1건 존재
- [ ] 단위 테스트 합계 9종 추가 (스토어 5 + 게이팅 4) — 모두 통과
- [ ] `npx tsc -b` 에러 0건, `npm run lint` 에러 0건 (경고는 별도 관리)
- [ ] 1062 테스트(현재 통과 수, 메모리 기록) + 신규 9종 = 1071 모두 통과

### F. 통합 + 릴리즈

- [ ] v2.0.5 patch 빌드 (Win + macOS arm64 + macOS x64) 자산 8종 unversioned 업로드
- [ ] 6개 다운로드 URL 모두 302 검증
- [ ] 챗봇 KB 재임베딩 (Q&A 3건 추가)
- [ ] 노션 사용자 가이드 업데이트 알림 섹션 갱신
- [ ] release-notes.json v2.0.5 항목 작성 (4슬롯 가이드 적용 — v2.0.4에서 정착한 WRITING-STYLE.md 따름)
- [ ] (선택) v2.0.5 묶음 후보가 더 있으면 함께 머지 (모바일 PR #36~38 머지 후 번들에 합류 가능)

---

## 7. 메트릭 (사후 측정 가능 지표)

| 메트릭 | 측정 방법 | 목표 |
|--------|----------|------|
| "업데이트 알림이 자꾸 뜬다" 피드백 건수 | 수동 모니터링 (피드백 폼·노션 KB Q&A 유입) | v2.0.5 출시 후 4주 0건 |
| 같은 버전 모달 노출 횟수 | DevTools 콘솔 로그(개발자 모드) 또는 향후 텔레메트리 | 사용자당 버전당 1회 |
| 스누즈 vs 건너뛰기 vs 즉시 업데이트 선택 비율 | 향후 텔레메트리 (v2.0.6+) | — |
| 보안 업데이트 평균 설치 지연 | 향후 텔레메트리 | 일반 업데이트 대비 ≤ 50% |
| TypeScript / lint 에러 | `npx tsc -b`, `npm run lint` | 0건 (현재 메모리 "lint 에러 0건 + CI lint 하드 게이트 승격" 유지) |
| 신규 단위 테스트 통과율 | Vitest | 9/9 (스토어 5 + 게이팅 4) |

활성화율·CTA 클릭률 등 사용자 행동 지표는 v2.0.6+ 텔레메트리 인프라 도입 후 측정 (본 PDCA Out of Scope).

---

## 8. 다음 단계

1. **이 Plan 사용자 승인** — Standard 스코프·2주 타임라인·3일 스누즈·보안 강제 표시 모두 확정. 추가 결정 사항 발견 시 v0.2로 갱신.
2. **Design 단계 진입** — `/pdca design update-notification-controls`
   - Layer 1 Design: 스토어 액션 시그니처·persist 옵션·마이그레이션 슬롯
   - Layer 2 Design: UpdateNotification 변경 diff + 드롭다운 메뉴 a11y(role=menu·키보드 화살표) + 보안 변형 카피
   - Layer 3 Design: Sidebar 배지 위치·collapsed 처리·forceShow 메커니즘
   - Layer 4 Design: release-notes.json 스키마 + UpdateInfo 매핑 fallback
   - 시나리오 흐름도 (mermaid 또는 ASCII)
3. **bkit:design-validator** 검증 (Plan/Design 일관성)
4. **Do 단계** — Layer 1 → 2 → 5(테스트) → 3 → 4 순. 묶음 릴리즈 후보 확인 후 일정 확정.

---

> **Status**: Draft v0.1 — 사용자 승인 대기 중. 승인 후 `/pdca design update-notification-controls`로 Design 단계 진입.
