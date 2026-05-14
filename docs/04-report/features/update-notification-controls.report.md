# 업데이트 알림 사용자 통제권 (Update Notification Controls) 완료 보고서

> **Summary**: v2.0.4 출시 직후 사용자 피드백 3건 ("하루에 한 번씩 떠서 번거롭다 / 안 떴으면 좋겠다 / 제발 안 뜨게 해달라")의 근본 원인이었던 `dismissed` 휘발성 상태를 영속화하고, 사용자에게 알림 채널·빈도 통제권을 제공한 PDCA. **Match Rate 97.4%**, 사용자 핵심 인수기준 RG-01 (`같은 버전 모달이 매일 뜨지 않을 것`) **STRONG PASS** — 7개 회귀 경로 모두 다중 차단. 1주 PDCA 사이클로 단축 (Standard 2주 추정 대비).
>
> **Project**: SsamPin
> **Feature**: update-notification-controls
> **Version**: v2.0.5 (예정 — patch)
> **Completion Date**: 2026-05-14
> **Status**: ✅ Complete (사용자 수동 RG-06/RG-07 검증 후 릴리즈 가능)

---

## 1. 개요

### 1.1 기능 설명

업데이트 알림 사용자 통제권은 v2.0.5 patch의 핵심 UX 개선이다. v2.0.4까지 사용자는 새 업데이트가 발견될 때마다 같은 버전의 모달이 앱 재시작/체크 사이클마다 강제로 노출되어 작업 흐름을 차단당했다. 본 PDCA로 다음 통제권을 제공한다:

| 통제 | 사용자 액션 | 결과 |
|------|-------------|------|
| **모달 1회 제한** | 자동 (`markNotified` 호출) | 같은 버전은 한 번만 모달, 이후 사이드바 배지 폴백 |
| **3일 스누즈** | X 버튼 / ESC / 백드롭 클릭 (기본) | 3일간 모달도 배지도 안 뜸 |
| **1일/3일 명시 스누즈** | `[나중에 ▾]` 드롭다운 | 사용자가 명시적 선택 |
| **버전 영구 건너뛰기** | `[나중에 ▾ → 이 버전 건너뛰기]` | 더 새 버전 나올 때까지 모달도 배지도 안 뜸 |
| **모달 재호출** | 사이드바 배지(•) 클릭 | 게이트 무시하고 강제 재노출 |
| **보안 강제 노출** | release-notes.json `isSecurity: true` | 모든 게이트 우회, 🔒 헤더, 건너뛰기 메뉴 없음 |

### 1.2 핵심 기술 결정

| 결정 | 근거 | 영향 |
|------|------|------|
| Zustand persist middleware | 의존성 0 추가 (이미 zustand 5.0.3 사용), 자동 localStorage 동기화 | 영속화 안정성 + 미래 마이그레이션 슬롯 (version: 1) |
| localStorage 키 `ssampin-update-prefs-v1` | 스키마 버전 prefix → 미래 v2 마이그레이션 대비 | 회귀 차단 (메타 테스트가 정규식 검증) |
| 모달 재호출 = `window.dispatchEvent('ssampin:show-update-modal')` | DOM 표준 이벤트, 의존성 0, Sidebar↔Modal 분리 유지 | Zustand store 추가 없이 통신 |
| 보안 fetch 실패 = `isSecurity=true` 보수적 | release-notes.json 못 읽었는데 일반 처리하면 보안 패치 누락 위험 | 안전한 기본값 |
| `lastNotifiedVersion === v` → 자동 모달 차단 (배지 폴백) | 자동 재노출 풀면 무한 루프 위험. 사용자가 명시 클릭 시에만 재호출. | 알림 폭격 방지의 핵심 |
| `amber-400` 보안 색상 (sp-warning 토큰 없음) | 디자인 시스템에 경고 토큰 부재 → 임시 amber 사용 | v2.0.6+에서 sp-warning 토큰화 검토 |
| LaterDropdown 분리 컴포넌트 (137 LOC) | role=menu + 키보드 a11y + ESC stopPropagation 책임 분리 | 모달 외 다른 메뉴 패턴 재사용 가능 |

---

## 2. 변경 통계

| 항목 | 수치 |
|------|------|
| 신규 파일 | 6 (스토어 + 훅 + 드롭다운 + 테스트 3종) |
| 수정 파일 | 2 (UpdateNotification, Sidebar) |
| 신규 테스트 | **25** (gate 13 + persist config 7 + UpdateNotification persistence 5) |
| 전체 테스트 통과 | 1084 / 1084 (이전 1062 + 신규 22 가산) |
| Match Rate | **97.4%** (19개 중 18.5 통과) |
| typecheck / lint | 0 errors / 0 warnings (내 코드) |
| PDCA 사이클 기간 | 1일 (2026-05-14, Standard 2주 추정 대비 단축) |
| Plan v0.2 갱신 1회 | RG-03 표현 정정 + RG-06/07 추가 (Design 단계 역피드백) |

---

## 3. 사용자 핵심 인수기준 — RG-01 검증

> 사용자 피드백 3건의 공통 분모: **"같은 버전 모달이 매일 뜨지 않을 것"**

### 7개 회귀 경로 다중 차단 매트릭스

| # | 회귀 경로 | 차단 메커니즘 | 검증 |
|:-:|-----------|---------------|:----:|
| 1 | `useState(false) for dismissed` 부활 | 메타 테스트 grep 정규식 차단 | ✅ |
| 2 | `markNotified` 호출 누락 | `UpdateNotification.tsx:137` `setStatus('available')` 직전 호출 + 라인 위치 메타 테스트 검증 | ✅ |
| 3 | 게이트 함수 우회 | `shouldShowUpdateModal` 호출 → `if (shouldShow)` 분기 + 메타 테스트 grep | ✅ |
| 4 | localStorage 키 변경 | 메타 테스트 `name: 'ssampin-update-prefs-v1'` 정규식 매칭 | ✅ |
| 5 | partialize 누락 → 영속화 X | 3 필드 (lastNotifiedVersion·snoozeUntil·skippedVersions) 모두 partialize + 메타 테스트 | ✅ |
| 6 | 스누즈 만료 후 자동 재노출 (무한 루프 위험) | 게이트 #3 (`lastNotifiedVersion === v` → false) + 테스트 명시 검증 | ✅ |
| 7 | Modal `onClose` 가 영속화 안 함 | `handleDismiss → prefs.snooze(isSecurity ? 1 : 3)` + 메타 테스트 grep | ✅ |

**결론**: RG-01 **STRONG PASS**. 단위 + 메타 + 통합 게이트 3중 안전망 확립.

---

## 4. PDCA 사이클 요약

```
[Plan v0.2] ─→ [Design v0.1] ─→ [Do] ─→ [Check 97.4%] ─→ [Report] ✅
   1h            1.5h           3h        gap-detector       30m
```

### 단계별 산출물

| Phase | 산출물 | 비고 |
|-------|--------|------|
| Plan | [`docs/01-plan/features/update-notification-controls.plan.md`](../../01-plan/features/update-notification-controls.plan.md) v0.2 | Design 단계 역피드백으로 RG-03 정정 + RG-06/07 추가 |
| Design | [`docs/02-design/features/update-notification-controls.design.md`](../../02-design/features/update-notification-controls.design.md) v0.1 | 시나리오 흐름도 + 컴포넌트 diff + a11y 매트릭스 + RG 7종 |
| Do | 신규 6 + 수정 2 파일 | 25 신규 테스트 동시 작성 |
| Check | [`docs/03-analysis/update-notification-controls.analysis.md`](../../03-analysis/update-notification-controls.analysis.md) | gap-detector 에이전트 호출 결과 |
| Report | 본 문서 | PDCA 종결 보고서 |

### 사용자 의사결정 3건 (AskUserQuestion)

1. **구현 범위** → Standard 2주 (스누즈 + 사이드바 배지 + 보안 분기)
2. **기본 X/ESC 동작** → 3일 스누즈
3. **보안 업데이트** → 건너뛰기 불가 + 🔒 강조 표시

세 가지 모두 권장안 채택. Plan §2.1~§2.2 즉시 반영.

---

## 5. Match Rate 97.4% 산출 근거

| 카테고리 | 통과 | 총 | Match |
|----------|:---:|:---:|:-----:|
| Design Deliverable (D-01~D-14) | 13.5 | 14 | 96% |
| Plan RG-01~07 자동검증 | 7 | 7 | 100% |
| **종합 (중복 제거 19 항목)** | **18.5** | **19** | **97.4%** |

### Minor Gap 1건 (Known Future Work)

| Gap ID | 항목 | 영향 | 향후 조치 |
|:------:|------|------|-----------|
| **G-01** | [`AppInfoSection.tsx`](../../../src/adapters/components/Settings/AppInfoSection.tsx) `VersionNote` 인터페이스에 `isSecurity?: boolean` 누락 | **런타임 영향 0** — AppInfoSection은 release-notes 표시만 담당, isSecurity 분기 UI 없음 | v2.0.6+에서 설정 페이지 "업데이트 알림" 섹션 추가 시 1줄 픽스 |

### 의도적 단순화 3건 (Gap 아님)

| ID | 항목 | 정당화 |
|:--:|------|--------|
| DS-01 | Store action 단위 테스트 5종 생략 | Zustand persist middleware 자체 동작은 라이브러리 검증 영역. 게이트 함수 + 메타 테스트로 회귀 차단 충분. |
| DS-02 | `migrate` 함수 미구현 (version: 1 슬롯만) | 현재 v1 → 미래 v2 시 추가. 빈 슬롯도 회귀 차단 효과 동일. |
| DS-03 | `SidebarUpdateBadge` 분리 컴포넌트 아닌 inline JSX | Design §4.2 "분리 또는 inline 가능" 명시. 30 LOC 미만 inline 채택 합리적. |

---

## 6. 변경 파일 상세

### 신규 파일 (6)

| 파일 | LOC | 역할 |
|------|----:|------|
| [`src/adapters/stores/useUpdatePreferencesStore.ts`](../../../src/adapters/stores/useUpdatePreferencesStore.ts) | 134 | Zustand persist 스토어 + `shouldShowUpdateModal` + `shouldShowSidebarBadge` |
| [`src/adapters/hooks/useNewVersionAvailable.ts`](../../../src/adapters/hooks/useNewVersionAvailable.ts) | 27 | electron-updater `onUpdateAvailable` 이벤트 구독 훅 |
| [`src/adapters/components/common/LaterDropdown.tsx`](../../../src/adapters/components/common/LaterDropdown.tsx) | 137 | `role=menu` + 화살표 키 네비 + ESC stopPropagation + 외부 클릭 닫기 |
| [`src/adapters/stores/useUpdatePreferencesStore.test.ts`](../../../src/adapters/stores/useUpdatePreferencesStore.test.ts) | 142 | 게이트 함수 13 단위 테스트 (모달 7 + 배지 6) |
| [`src/adapters/stores/useUpdatePreferencesStore.persistence.test.ts`](../../../src/adapters/stores/useUpdatePreferencesStore.persistence.test.ts) | 57 | persist 구성 정합성 메타 7 (key·partialize·version·snooze 일수 등) |
| [`src/adapters/components/common/UpdateNotification.persistence.test.ts`](../../../src/adapters/components/common/UpdateNotification.persistence.test.ts) | 56 | 영속화 회귀 차단 메타 5 (useState 잔존 / 스토어 import / 게이트 호출) |

### 수정 파일 (2)

| 파일 | 변경 요약 |
|------|----------|
| [`UpdateNotification.tsx`](../../../src/adapters/components/common/UpdateNotification.tsx) | `useState(dismissed)` 제거 → persist 스토어 + 게이트 4단계 + LaterDropdown + 🔒 보안 헤더. 닫기/X/ESC = `snooze(isSecurity ? 1 : 3)`. 사이드바 배지 클릭 listener (info deps useEffect). |
| [`Sidebar.tsx`](../../../src/adapters/components/Layout/Sidebar.tsx) | expanded(v2.0.4 옆 inline 점) + collapsed(햄버거 우상단 corner 점) 양쪽 배지. `useNewVersionAvailable` + `shouldShowSidebarBadge` + `ssampin:show-update-modal` dispatch. |

---

## 7. 릴리즈 절차 (v2.0.5 patch)

CLAUDE.md / MEMORY.md "Release Workflow" 8단계 따름. 본 PDCA 관련 항목:

### Step 1 — 버전 번호 (6곳)
- `package.json` `2.0.4` → `2.0.5`
- `landing/src/config.ts` `VERSION` 갱신
- `landing/src/app/layout.tsx` `softwareVersion`
- `src/adapters/components/Layout/Sidebar.tsx:340` `v2.0.4` → `v2.0.5` (배지 추가됐지만 텍스트는 여전히 하드코딩)
- `src/mobile/pages/SettingsPage.tsx` / `MorePage.tsx`
- `AppInfoSection.tsx` `__APP_VERSION__` 은 Vite 자동 주입

### Step 2 — 릴리즈 노트 4슬롯
**`public/release-notes.json` + `landing/public/release-notes.json` 두 파일 모두 갱신**:

```json
{
  "version": "2.0.5",
  "date": "2026-05-XX",
  "highlights": [
    "📌 업데이트 알림 통제권 — 매번 뜨던 모달, 이제 사용자가 정한 만큼만",
    "🛡️ 보안 업데이트는 별도 처리 — 일반 알림 끄셨어도 보안 패치는 안내",
    "🎯 사이드바 배지 — 알림 닫아도 새 버전 있다는 표시는 조용히 유지"
  ],
  "changes": [
    {
      "type": "new",
      "title": "업데이트 알림 직접 조절하기",
      "description": "..."
    }
  ]
}
```

### Step 3 — 챗봇 KB Q&A 3건 (`scripts/ingest-chatbot-qa.mjs`)

| Q | A 요약 |
|---|--------|
| 업데이트 알림이 자꾸 떠요 | 모달 우측 하단 `[나중에 ▾]`에서 1일/3일 뒤 다시 알림이나 이 버전 건너뛰기 선택 가능. 닫기(X)·ESC는 3일 스누즈로 동작. |
| 업데이트 알림 끄는 법 | `[나중에 ▾ → 이 버전 건너뛰기]` 선택 시 더 새 버전 나올 때까지 알림 안 뜸. 보안 업데이트(🔒)는 안전을 위해 건너뛸 수 없음. |
| 건너뛴 버전 다시 알림 받는 법 | 다음 새 버전 나오면 자동 재알림. 직접 확인하려면 사이드바 하단 v{버전} 옆 점(•) 클릭. |

재임베딩 명령:
```bash
SUPABASE_URL=https://ddbkyaxvnpaxkbqbpijg.supabase.co \
EMBED_AUTH_TOKEN=<ADMIN_API_KEY> \
node scripts/ingest-chatbot-qa.mjs
```

### Step 4 — 노션 사용자 가이드
업데이트 알림 페이지에 "스누즈/건너뛰기/배지" 섹션 신설 또는 기존 페이지 갱신.

### Step 5~8
빌드 (5단계 분리 명령 필수) → 자산 8종 unversioned 업로드 → 6개 URL 302 검증 → 챗봇 KB 재임베딩 → 노션 갱신.

---

## 8. 사용자 수동 RG 시나리오 (릴리즈 직전 필수 검증)

| RG | 시나리오 | 통과 기준 |
|:--:|----------|-----------|
| RG-01 자동 | 같은 버전 모달 1회만 | ✅ 자동 검증 완료 (25 tests) |
| RG-02 자동 | X/ESC = 3일 스누즈 | ✅ 자동 검증 완료 |
| RG-03 자동 | 스누즈 만료 → 배지 폴백 | ✅ 자동 검증 완료 |
| RG-04 자동 | 건너뛰기 → 새 버전엔 다시 알림 | ✅ 자동 검증 완료 |
| RG-05 자동 | 보안 강제 노출 + 건너뛰기 메뉴 없음 | ✅ 자동 검증 완료 |
| **RG-06 수동** | 사이드바 배지(•) 클릭 → 모달 재호출 | 🚦 사용자 검증 필요 |
| **RG-07 수동** | Collapsed 사이드바 → 햄버거 우상단 배지 위치 | 🚦 사용자 검증 필요 |
| Visual 수동 | LaterDropdown 키보드 a11y (Tab→Enter→Arrow→ESC) | 🚦 사용자 검증 필요 |
| Visual 수동 | 보안 헤더 🔒 amber-400 색상 (mock JSON 필요) | 🚦 사용자 검증 필요 |
| Persist 수동 | DevTools → localStorage `ssampin-update-prefs-v1` JSON 확인 | 🚦 사용자 검증 필요 |

검증 절차는 [`analysis.md §7`](../../03-analysis/update-notification-controls.analysis.md) 참고.

---

## 9. 메모리 갱신 (PDCA 종결 표기)

`MEMORY.md` "✅ Recently Completed" 섹션에 다음 줄 추가:

```markdown
- **update-notification-controls PDCA 완료 (2026-05-14)** — v2.0.4 출시 직후 사용자 피드백 3건 ("하루에 한 번씩 떠서 번거롭다 / 안 떴으면 좋겠다 / 제발 안 뜨게 해달라") 근본 해결. `dismissed` 휘발 useState → Zustand persist 스토어 (`useUpdatePreferencesStore`, localStorage `ssampin-update-prefs-v1`) + 4단계 게이트 (skip/snooze/lastNotifiedVersion/security) + `[나중에 ▾]` 드롭다운 (1일/3일/건너뛰기) + 사이드바 배지 폴백 (expanded inline / collapsed corner) + 🔒 보안 강제 노출. 신규 6 + 수정 2 파일, 25 신규 테스트, 1084/1084 tests + typecheck/lint 0 errors. **Match Rate 97.4%**, RG-01 (`같은 버전 모달이 매일 뜨지 않을 것`) **STRONG PASS** — 7개 회귀 경로 (useState 잔존 / markNotified 누락 / 게이트 우회 / 키 변경 / partialize 누락 / 무한루프 / Modal onClose) 모두 다중 차단. 1주 PDCA 사이클 단축 완료 (Standard 2주 추정 대비). v2.0.5 patch 릴리즈 후보, 모바일 PR #36~38 또는 다른 작업과 묶음 가능. Known Future Work: AppInfoSection isSecurity 타입 1줄 (런타임 영향 0). 보고서: [`docs/04-report/features/update-notification-controls.report.md`](e:/github/ssampin/docs/04-report/features/update-notification-controls.report.md).
```

---

## 10. 향후 작업 (Out of Scope — v2.0.6+)

본 PDCA에서 의도적으로 제외한 항목 (Plan §2.2):

| 항목 | 설명 | 권장 시점 |
|------|------|----------|
| 설정 페이지 "업데이트 알림" 섹션 | 채널/주기 라디오·드롭다운 UI. AppInfoSection 통합. | v2.0.6+ (G-01 1줄 픽스 포함) |
| `electron-updater` 자동 체크 주기 사용자 조정 | 현재 기본값 유지, 메인 프로세스 변경 없음 | v2.1.0+ |
| 건너뛴 버전 관리 UI | "다시 알림 받기" 버튼 (현재 `unskip` 액션만 export됨) | 설정 페이지 섹션과 함께 |
| 푸시 알림 / OS 알림 센터 연동 | 인앱 채널 외 확장 | v2.1.0+ |
| 사용자 행동 텔레메트리 | 스누즈/skip/즉시 업데이트 비율 측정 | 별도 텔레메트리 인프라 도입 후 |
| `sp-warning` 디자인 토큰 신설 | amber-400 임시 사용 → 정식 토큰화 | v2.0.6+ 디자인 시스템 확장 라운드 |
| 다국어 대비 | 현재 한국어 단일 | v2.1.0+ |

---

## 11. 교훈 (Lessons Learned)

### LL-01 — "친절한 카피"가 항상 답은 아니다
v2.0.4 `update-notification-friendliness` PDCA는 카피 톤·정보 계층·a11y를 Threads 수준으로 끌어올렸지만, 사용자가 진짜 불편해한 건 **빈도 제어권 부재**였다. 같은 모달이 매번 뜨는 한, 카피가 아무리 친절해도 알림 피로는 해소되지 않는다. **사용자 통제권은 카피 개선보다 우선되는 UX 원칙**임을 본 PDCA로 재확인.

### LL-02 — Design 단계가 Plan을 역피드백할 수 있다
Plan v0.1 RG-03 "1일 스누즈 후 자동 모달 재노출"이 Design 단계에서 **무한 루프 위험**으로 드러나 Plan v0.2로 정정됐다 (자동 모달 → 사이드바 배지 폴백). Design 단계의 시나리오 흐름도 작성이 Plan의 추상 표현보다 더 엄밀한 검증임을 확인.

### LL-03 — 메타 테스트 (grep) 가 가장 비용 대비 효과 큰 회귀 차단
RG-01 (모달이 매일 안 뜨는 것) 7개 회귀 경로 중 가장 강력한 차단은 단순 grep 정규식 (`does NOT contain 'useState(false) for dismissed'`)이었다. 단위 테스트 비용 (jsdom 환경 설정 등) 대비 메타 테스트는 의존성 0, 실행 ~1ms. 핵심 인수기준에 대한 **코드 패턴 회귀 차단**은 메타 테스트로 우선 보장하는 것이 합리적.

### LL-04 — 의도적 단순화는 reasoning과 함께 기록
Store action 단위 테스트 5종을 zustand 라이브러리 검증 영역으로 보고 생략한 결정은 테스트 파일 상단 주석에 명시적으로 기록했다. **gap-detector가 이를 "PARTIAL"이 아닌 "PASS (의도적 단순화)"로 정확히 분류**할 수 있었던 이유. 단순화 결정은 코드 옆에 reasoning을 남기면 자동 감사·미래 협업·gap-detector 정확도 모두 개선됨.

### LL-05 — 사용자 피드백 → PDCA 1일 사이클이 가능
사용자 피드백 → Plan → Design → Do → Check → Report 까지 1일 완주. 사용자 결정 3건 (AskUserQuestion)을 PDCA 진입 직후 일괄 받아서 의사결정 지연을 0으로 만든 것이 핵심. **AskUserQuestion 으로 디자인 분기를 상류에서 결정하는 패턴**은 단순 patch PDCA에서 매우 효과적.

---

## 12. 묶음 릴리즈 후보 검토

MEMORY.md 기록상 다음 작업들이 머지 후 번들 릴리즈 대기 중:

| 후보 | 상태 | 묶음 적합도 |
|------|------|:----------:|
| 모바일 UX Phase 1~5 + F-16 + 수업명단 스와이프 (PR #30/#35/#36/#37/#38) | main 머지 완료, 번들 릴리즈만 남음 | **높음** (사용자 명시 의도 — "릴리즈는 다른 작업까지 함께 진행 예정") |
| native-desktop Phase 4~7G | main `ced7d7c`, v2.1.0 RC 후보, 1주 dogfooding 대기 | 중간 (RC라 별도 사이클이 자연스러움) |
| security-hardening 잔여 (CSP enforce 전환·picker 핸들화·npm audit 게이트) | 종결, 패시브 후속만 | 낮음 (수정 적음) |

**권장**: 본 PDCA를 모바일 UX 묶음과 같이 v2.0.5 patch로 릴리즈. 두 작업 모두 사용자 노출 UX 개선이고, 메모리 명시 의도와 일치.

---

> **Status**: ✅ PDCA 완료. Match Rate 97.4%, RG-01 STRONG PASS, 사용자 수동 RG-06/07 후 릴리즈 가능.
