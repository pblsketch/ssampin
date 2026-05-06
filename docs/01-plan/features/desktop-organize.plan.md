# 바탕화면 정리 (Desktop Organize) Planning Document

> **Summary**: 위젯 모드의 `native-desktop` (바탕화면 아이콘 아래) 모드를 활용하는 신규 위젯 카드 "바탕화면 정리". 사용자가 가로×세로 그리드로 카테고리 박스를 만들고 각 박스 위에 실제 Windows 바탕화면 아이콘을 시각적으로 올려 정리하는 도구. 카드는 시각적 영역(제목 + 반투명 테두리)만 그리고 아이콘 자체는 Explorer가 그대로 관리한다.
>
> **Project**: SsamPin
> **Version**: v2.1.x (예정 — native-desktop-mode 안정화 이후)
> **Author**: pblsketch
> **Date**: 2026-05-07
> **Status**: Draft v0.1

---

## 1. 개요

### 1.1 목적

`native-desktop` 모드(2026-05-05 이후 다른 세션에서 재구현, Phase 7-G까지 진행)는 쌤핀 위젯을 Windows WorkerW 레이어에 SetParent하여 바탕화면 아이콘과 같은 평면에서 공존시킨다. 그러나 현재 위젯은 일반적인 시간표·일정·메모 카드 모음에 머물러 있어 이 모드의 제품적 가치(=바탕화면 작업판)를 충분히 활용하지 못한다.

이 기능이 해결하는 문제:

1. 교사들은 바탕화면에 수업자료·학급 파일·업무 문서를 무더기로 쌓아둔다 — **시각적 정리 기준이 없다**.
2. Windows 바탕화면 자체에는 "그룹"이라는 개념이 없어 폴더로 묶거나, 안 묶고 흩어두거나 양자택일이다.
3. 폴더로 묶으면 한 번 더 클릭해야 하고, 안 묶으면 어디 있는지 모른다.
4. 두 옵션 사이의 빈자리: **시각적 그리드(그룹 영역)는 보여주되 실제 아이콘은 그 위에 그대로 둬서 단일 클릭으로 접근**할 수 있어야 한다.

### 1.2 배경

2026-05-04 사용자 제안으로 시작된 native-desktop-mode의 원래 PRD([`docs/desktop-icon-underlay-widget-mode-prd.md`](e:/github/ssampin/docs/desktop-icon-underlay-widget-mode-prd.md))는 "바탕화면 작업판"이라는 제품 언어를 명시했지만, 작업판 자체의 콘텐츠(어떤 카드를 깔 것인가)는 비어 있었다. 본 PDCA는 그 빈자리를 채우는 첫 번째 1급 시민 카드를 정의한다.

설계 결정 요약 (2026-05-07 사용자 인터뷰):

| 항목 | 결정 |
|------|------|
| 카드 노출 위치 | 위젯 모드 = 실동작, 대시보드 = 미리보기만 |
| 데이터 모델 | 시각적 영역만 (박스 = 제목 + 테두리, 아이콘 추적 X) |
| 그리드 입력 | 프리셋 3종(1×3, 3×1, 2×2) + 가로×세로 직접 입력 |
| 제목 편집 | 위젯 편집 모드(우상단 ✏️ 토글) 진입 시 박스에서 인플레이스 편집 |
| 그리드 변경 | 카드 ⋯ 서브메뉴(or 편집 모드 내부) |
| 박스 시각 | 단일 톤(`sp-card`/`sp-border` 반투명) + 디자인 시스템 일관성 |
| native-desktop과 충돌 | 없음 — 다른 세션 작업과 영역 분리, 자유 진행 |

### 1.3 관련 문서

- 사용자 인터뷰: 본 세션 대화 (2026-05-07)
- native-desktop-mode PRD: [`docs/desktop-icon-underlay-widget-mode-prd.md`](e:/github/ssampin/docs/desktop-icon-underlay-widget-mode-prd.md)
- 인접 PDCA: native-desktop-mode (다른 세션, Phase 7-A~7-G 진행 중)
- 위젯 레지스트리 패턴: [`src/widgets/registry.ts`](e:/github/ssampin/src/widgets/registry.ts), [`src/widgets/types.ts`](e:/github/ssampin/src/widgets/types.ts)
- 위젯 카드 컨테이너: [`src/widgets/components/WidgetCard.tsx`](e:/github/ssampin/src/widgets/components/WidgetCard.tsx)
- 위젯 윈도우: [`src/adapters/components/Widget/Widget.tsx`](e:/github/ssampin/src/adapters/components/Widget/Widget.tsx)
- native-desktop hook 기반 클릭 라우팅: `electron/desktopWidgetManager.ts`, `electron/platform/win32Desktop.ts` (다른 세션 산출물)
- 라운딩 정책: `feedback_rounding_policy.md` (메모리) — `rounded-sp-*` 금지, Tailwind 기본 키 사용
- 프론트 협업 정책: `feedback_frontend_agent_collaboration.md` (메모리) — 디자인 작업은 frontend-design 에이전트와 협업 의무
- 다중 세션 회피: `feedback_neis_schedule_other_session.md` 패턴 — 영역 분리 원칙

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

- [ ] 신규 위젯 카드 컴포넌트 `src/widgets/items/DesktopOrganize.tsx` 작성
- [ ] `src/widgets/registry.ts`에 `desktop-organize` 정의 등록 (category: `admin` 또는 신규 `tools`)
- [ ] 카드 데이터 모델 정의: `cols`, `rows`, `boxTitles[]` (cols×rows 길이)
- [ ] 카드별 설정 영속화 (per-widget settings store 신설 — 현재 `WidgetInstance`에 슬롯 없음)
- [ ] 그리드 프리셋 3종 버튼: 1×3 (가로형), 3×1 (세로형), 2×2
- [ ] 그리드 직접 입력 UI: 가로 [n] × 세로 [m] (각 1~6 범위)
- [ ] 박스 제목 인라인 편집 (편집 모드 진입 시 박스에서 더블클릭/Enter)
- [ ] 박스 시각 스타일: `sp-card`/`sp-border` 반투명 (배경 alpha ~30~50%), 제목 `text-sp-text` 굵게
- [ ] 카드 크기 조정: 기존 `colSpan`(1~4) × `rowSpan`(1~12) 시스템 그대로 사용 — 기본 `{ w: 4, h: 6 }`
- [ ] 대시보드(메인) 노출: 미리보기만 — 박스 그리드+제목만 보이고 아이콘은 없음, "위젯 모드에서 동작" 안내
- [ ] 위젯 모드 노출: 실동작 — `native-desktop` 모드일 때 박스 영역 = 아이콘 정리 영역
- [ ] **클릭 통과(pass-through) 정책**:
  - native-desktop 모드: 박스 빈 공간 클릭은 hook이 widget으로 라우팅 → 카드는 view 모드에서 무시 (NoOp)
  - 박스 안 아이콘 클릭: hook이 LVM_HITTEST로 hit → Explorer 처리 (카드 무관)
  - 일반/topmost 모드: 박스 빈 공간 클릭은 카드가 받음 → view 모드 NoOp, 편집 모드만 동작
- [ ] 그리드 변경 모달/팝업 UI (편집 모드에서 박스 헤더의 ⋯ 또는 카드 우상단 ⚙️)
- [ ] `prefers-reduced-motion: reduce` 시 박스 hover 트랜지션 0
- [ ] release-notes.json 항목 추가 (v2.1.x)
- [ ] AI 챗봇 KB Q&A 추가 (`scripts/ingest-chatbot-qa.mjs`)
- [ ] 노션 사용자 가이드 업데이트

### 2.2 제외 범위 (Out of Scope)

- 모바일 앱(`src/mobile/`) — 데스크톱 Electron 전용
- macOS/Linux 동작 — `native-desktop` 모드가 Windows 전용이므로 동일 제약. 비-Windows에서는 카드를 등록만 하고 "Windows 전용 안내" 노출
- **아이콘 추적**: "이 박스에 어떤 아이콘이 들어있다"는 데이터는 절대 저장하지 않음. 박스 = 시각적 영역만
- 아이콘 자동 정렬/이동/스냅 — 사용자가 직접 OS에서 드래그
- 박스별 색상/아이콘 커스터마이징 — v2 검토 (디자인 일관성 우선)
- 박스 내부에 다른 위젯 콘텐츠 표시 — 카드 = 그리드 프레임 전용
- 바탕화면 파일 목록 직접 수집 — native-desktop-mode PRD §3.3 비목표 준수
- 자동 분류, 파일 이동, 파일 삭제 — 같은 이유
- 하나의 대시보드에 여러 개의 desktop-organize 카드 인스턴스 — MVP는 1개만 (registry는 id 기반이라 자연스럽게 단일)

---

## 3. 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | `desktop-organize` 위젯이 위젯 레지스트리에 등록되고 편집 패널에서 추가 가능하다 | Must | Pending |
| FR-02 | 카드 기본 크기 `{ w: 4, h: 6 }`, 최소 크기 `{ w: 2, h: 3 }` (다른 카드와 동일한 colSpan/rowSpan 시스템) | Must | Pending |
| FR-03 | 그리드 프리셋 3종 버튼: 1×3, 3×1, 2×2 — 클릭 시 해당 그리드로 변경 | Must | Pending |
| FR-04 | 가로 [n] × 세로 [m] 직접 입력 (각 1~6, 합산 셀 수 ≤ 12) | Must | Pending |
| FR-05 | 박스 제목은 편집 모드 진입 시 인라인 편집 가능 (더블클릭 → input → Enter/Blur 저장) | Must | Pending |
| FR-06 | 그리드 변경 시 기존 박스 제목 보존: 새 그리드의 첫 N개 박스에 기존 제목 채움, 초과분은 빈 박스("새 카테고리"), 잘림은 사용자 확인 모달 | Must | Pending |
| FR-07 | 박스 시각 스타일: `sp-card` 30~50% 반투명 배경 + `sp-border` 1px + `rounded-2xl` + 상단 제목 영역 | Must | Pending |
| FR-08 | 위젯 view 모드에서 박스 빈 공간 클릭은 무동작 (NoOp) — native-desktop 모드의 hook 라우팅을 그대로 둔다 | Must | Pending |
| FR-09 | 위젯 편집 모드(우상단 ✏️ 토글)에서만 박스 제목 편집/그리드 변경 UI 노출 | Must | Pending |
| FR-10 | 대시보드(메인 윈도우)에서는 미리보기 모드 — 그리드+제목만 보이고 박스 빈 공간에 "위젯 모드에서 동작" 옅은 안내 | Should | Pending |
| FR-11 | 카드 설정(`cols`, `rows`, `boxTitles[]`)은 디스크에 영속화되고 다음 실행 시 복원 | Must | Pending |
| FR-12 | Windows 외 OS에서는 카드를 등록하되, 카드 본문에 "Windows 전용" 안내 + 미리보기만 노출 (편집은 가능, 동작은 비활성) | Should | Pending |
| FR-13 | `prefers-reduced-motion: reduce` 시 박스 hover/focus 트랜지션 0 | Must | Pending |
| FR-14 | 박스 제목 길이 제한 20자 (overflow 시 ellipsis), 빈 제목 허용(default placeholder) | Should | Pending |
| FR-15 | 그리드 셀 합계 = `cols × rows` 검증, 셀 1개 미만/12개 초과 차단 | Must | Pending |
| FR-16 | 카드 우상단 ⋯ 메뉴: "그리드 설정", "제목 모두 초기화" | Should | Pending |
| FR-17 | release-notes.json v2.1.x 항목 추가 + 챗봇 KB Q&A 5건 이상 추가 + 노션 가이드 업데이트 | Must | Pending |

### 3.2 비기능 요구사항 (Non-Functional Requirements)

| 분류 | 기준 | 측정 방법 |
|------|------|-----------|
| 성능 (렌더) | 박스 36개(6×6 가상 max) 렌더 시 16ms 이내 | React DevTools Profiler |
| 성능 (편집) | 인라인 제목 편집 keystroke → DOM 반영 < 32ms | 수동 체감 + Performance 패널 |
| 안정성 (회귀) | 기존 위젯 카드(=22개) 동작 100% 유지 | 회귀 시나리오 6개 수동 체크 (5.5 참조) |
| 안정성 (native-desktop 호환) | native-desktop 모드 hook 라우팅과 충돌 없음 (박스 빈 공간 클릭 = NoOp) | Windows 실기 검증 |
| 아키텍처 | Clean Architecture 4-layer 의존성 규칙 준수 | `npx tsc --noEmit` 0 errors |
| 디자인 일관성 | sp-* 토큰만 사용, `rounded-sp-*` 0건, 하드코딩 hex 0건 | grep 검증 |
| 접근성 | 박스 제목 input WCAG 2.5.5 (≥ 24×24px touch target), keyboard navigation, `aria-label` | axe-core + 수동 |
| 데이터 안전 | 그리드 축소 시 잘리는 박스의 제목은 사용자 확인 모달 통과 후에만 삭제 | 단위 테스트 |

---

## 4. 사용자 시나리오 (User Stories)

**US-1: 수업·학급·업무 3분류 작업판**
> 교사가 바탕화면에 PPT, 학급 명렬표, 가정통신문, 결재 문서를 모두 펼쳐두고 일한다. "수업/학급/업무" 3개 박스로 시각적 그룹을 만들고 거기에 아이콘을 끌어놓는다.
>
> - 흐름: 위젯 모드 진입 → native-desktop 모드 켬 → 카드 추가 → 프리셋 1×3 클릭 → "수업"·"학급"·"업무" 제목 입력 → 편집 종료 → OS에서 아이콘들을 각 박스 위로 드래그
> - 수용 기준: 3개 박스가 바탕화면에 보이고, 각 박스 영역 위의 아이콘은 단일 클릭으로 열린다.

**US-2: 작업 흐름 칸반 (작업 전/중/완료)**
> 교사가 학교 행사 준비 중 30개 가까운 파일을 다룬다. "작업 전/중/완료" 칸반으로 정리.
>
> - 흐름: 카드 추가 → 1×3 프리셋 → 제목 "작업 전 / 작업 중 / 완료" → 파일 진척도에 따라 OS에서 아이콘 이동
> - 수용 기준: 박스 제목이 굵게 보이고, 박스 사이 경계가 명확해 어디로 옮겨야 하는지 한눈에 보인다.

**US-3: 사용자 정의 그리드 (3×2 = 6칸)**
> 교사가 6개 학급 담임 자료를 1반·2반·...·6반으로 분류하고 싶다.
>
> - 흐름: 카드 → 직접 입력 → 가로 [3] × 세로 [2] = 6칸 → 각 박스에 "1반"~"6반" 제목 → 학급별 자료 아이콘 분류
> - 수용 기준: 그리드가 정확히 3×2로 그려지고, 박스 6개 모두 제목이 보인다.

**US-4: 그리드 줄이기 (5칸 → 3칸)**
> 5칸 카드에서 3칸으로 줄인다 — 잘리는 2칸 제목 데이터 안전 확인.
>
> - 흐름: 5×1 → 직접 입력 3×1 → 사용자 확인 모달 "박스 4·5의 제목('OO', 'XX')이 사라집니다. 계속할까요?" → 확인 → 그리드 축소
> - 수용 기준: 모달 없이 데이터 사라지면 안 됨. 취소하면 5×1 유지.

**US-5: 대시보드 미리보기**
> 대시보드(메인 윈도우)에서도 카드를 추가해보고 그리드/제목을 미리 설정해보고 싶다.
>
> - 흐름: 메인 대시보드 → 위젯 편집 → desktop-organize 추가 → 그리드/제목 설정 → 위젯 모드 진입 시 같은 설정 그대로 적용
> - 수용 기준: 대시보드에는 박스 그리드만 보이고(아이콘 없음, 카드 안에 "위젯 모드에서 동작" 옅은 안내). 설정은 위젯과 공유.

**US-6: macOS 사용자**
> macOS 사용자가 카드를 추가했지만 native-desktop이 Windows 전용이라 동작하지 않는다.
>
> - 흐름: 카드 추가 → 카드 본문에 "Windows 전용 기능" 안내 + 그리드 미리보기만 노출 → 사용자가 그리드 설정은 미리 할 수 있음(향후 Windows 전환 대비)
> - 수용 기준: 앱 종료 없음, 명확한 안내, 설정은 보존.

---

## 5. 성공 기준

### 5.1 완료 정의 (Definition of Done)

- [ ] FR-01 ~ FR-17 모두 구현 완료
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run build` 성공
- [ ] `npm run test` 통과 (신규 테스트 포함)
- [ ] 회귀 시나리오 6개 수동 체크 PASS (5.5)
- [ ] 디자인 검토 통과 (frontend-design 또는 bkit:frontend-architect 에이전트 — 메모리 정책 준수)
- [ ] PDCA Match Rate ≥ 90%
- [ ] release-notes.json v2.1.x 항목 + 챗봇 KB Q&A 5건+ + 노션 가이드 업데이트

### 5.2 품질 기준

- [ ] `domain/` → 외부 의존 0건
- [ ] `usecases/` → `adapters/`, `infrastructure/` import 0건
- [ ] `any` 타입 사용 0건
- [ ] `rounded-sp-*` 사용 0건
- [ ] sp-* 디자인 토큰만 사용 (하드코딩 hex 0건)
- [ ] 신규 단위 테스트: 그리드 축소 시 제목 보존/잘림 로직, 입력 검증(1~6 범위, 합 ≤ 12)

### 5.3 회귀 검증 시나리오 (6개)

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| RG-01 | 일반 위젯 모드(`normal`)에서 desktop-organize 카드 활성 | 그리드만 보이고 박스 클릭은 NoOp, 다른 카드 정상 |
| RG-02 | `topmost` 모드에서 카드 활성 | 마찬가지로 그리드만, 다른 카드 동작 정상 |
| RG-03 | `native-desktop` 모드 + 카드 활성 + 박스 위에 아이콘 | 아이콘 단일 클릭 → Explorer가 처리, 박스는 시각적 프레임만 |
| RG-04 | `native-desktop` 모드 + 박스 빈 공간 클릭 | NoOp (위젯 hook이 widget으로 라우팅 후 카드가 무시) |
| RG-05 | 위젯 편집 모드 진입 + 카드 그리드 변경 | 다른 카드 편집 동작 정상, desktop-organize 그리드 모달 정상 |
| RG-06 | 그리드 축소 시 잘리는 제목 데이터 | 사용자 확인 모달 노출, 취소 시 그리드 유지 |

### 5.4 위험 평가 결과

| 위험 | 검토 의견 | 결론 |
|------|-----------|------|
| native-desktop hook과 클릭 충돌 | 박스 빈 공간 = NoOp 정책으로 hook 라우팅 그대로 통과 | 진행 가능 |
| 다른 세션 native-desktop-mode 작업과 충돌 | 본 작업은 `src/widgets/items/`, `src/widgets/registry.ts`, 신규 settings store에만 변경. electron/main.ts·desktopWidgetManager.ts 미수정 | 진행 가능 |
| 그리드 축소 데이터 손실 | FR-06 사용자 확인 모달 + 단위 테스트 | 진행 가능 |
| MVP 단일 인스턴스 제약 | registry id 기반이라 자연 제약. 다중 인스턴스는 v2 검토 | MVP 적합 |

---

## 6. 위험 및 대응

| 위험 | 영향도 | 발생 가능성 | 대응 |
|------|--------|-------------|------|
| **다른 세션 native-desktop 머지 충돌** — `src/adapters/components/Widget/Widget.tsx` 등 공유 파일이 다른 세션에서 동시에 수정될 가능성 | High | Low | 본 작업은 `src/widgets/items/`, `src/widgets/registry.ts`, 신규 store 파일만 변경. Widget.tsx는 **건드리지 않음**. 충돌 발생 시 즉시 사용자에게 보고 |
| **클릭 통과 동작 미스매치** — 박스 빈 공간이 "view 모드 NoOp"이지만 사용자는 "이 영역에 아이콘이 자동 정렬될 것"이라 오해 | Medium | Medium | 첫 활성화 시 1회성 코치마크 ("박스 위로 바탕화면 아이콘을 직접 드래그하세요. 자동 정렬은 하지 않습니다"). 챗봇 KB에 명시 |
| **그리드 변경 중 제목 손실** — 사용자가 모달을 무심코 확인 | Medium | Medium | FR-06 모달에 잘리는 제목을 명시 노출. "되돌리기" 버튼 1회 (5초 토스트) |
| **per-widget settings 영속화 인프라 부재** — 현재 `WidgetInstance`에 settings 슬롯 없음 | Medium | High | Design 단계에서 결정: (a) `WidgetInstance.settings?: Record<string, unknown>` 확장 vs (b) 신규 `useDesktopOrganizeStore` JSON 영속화. 인터뷰 1회 필요 |
| **다중 모니터/DPI 환경에서 박스 좌표 오차** — 카드 자체는 widget 좌표계라 영향 없음. 그러나 사용자가 "박스 영역 = 아이콘 정렬 영역"으로 오해 시 혼란 | Low | Medium | 박스는 시각 가이드일 뿐, 아이콘 위치는 OS가 관리. 코치마크에서 명시 |
| **렌더 성능 — 박스 36개(max 6×6) hover 트랜지션** | Low | Low | `prefers-reduced-motion` 대응 + transition은 박스 1개 hover 시에만 (group-hover X) |
| **Windows 외 환경 사용자 혼란** | Low | Medium | 카드 본문에 "Windows 전용" 안내 명시. 그리드 설정은 보존(향후 Windows 전환 대비) |

---

## 7. 아키텍처 고려사항

### 7.1 프로젝트 레벨 선택

| 레벨 | 특성 | 추천 대상 | 선택 |
|------|------|-----------|:---:|
| Starter | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 단위 모듈 | Electron 데스크톱 앱 | **☑ (현재)** |
| Enterprise | 엄격한 레이어 분리 + DI | 마이크로서비스 | ☐ |

쌤핀 Clean Architecture 4레이어 구조 그대로 사용.

### 7.2 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|------|------|------|------|
| 카드 컴포넌트 위치 | `src/widgets/items/` / `src/adapters/components/Widget/` | **`src/widgets/items/DesktopOrganize.tsx`** | 기존 22개 위젯 카드 패턴과 일치 (registry 등록형) |
| 데이터 영속화 | `WidgetInstance.settings` 확장 / 별도 store | **별도 store (`useDesktopOrganizeStore`)** | per-card 설정은 미래 다른 카드도 필요할 수 있어 `WidgetInstance` 스키마 변경은 고비용. 단일 카드 설정용 가벼운 store가 적합. Design 단계에서 최종 결정 |
| 영속화 위치 | localStorage / Electron userData JSON | **Electron userData (`desktop-organize.json`)** + localStorage 폴백 | 기존 IStoragePort 패턴 재사용 |
| 그리드 변경 UI | 인라인 / 모달 / 팝오버 | **팝오버 (카드 우상단 ⚙️ 클릭 시)** | 인라인은 카드 좁아짐, 모달은 무거움. 팝오버가 위젯 카드 크기에 적합 |
| 박스 제목 편집 | 항상 인라인 / 편집 모드만 인라인 | **편집 모드만 인라인** | 사용자 결정 (인터뷰 2026-05-07). view 모드에서 클릭은 NoOp |
| 클릭 통과 정책 | CSS `pointer-events: none` / native hook 라우팅 그대로 | **native hook 그대로** | native-desktop 모드의 LVM_HITTEST 라우팅이 이미 "아이콘 = Explorer / 빈공간 = widget" 분기. 카드는 view 모드 NoOp만 보장 |
| 박스 색상 | 단일 톤 / 카테고리별 / 사용자 자유 | **단일 톤 (sp-card 반투명)** | 사용자 결정 (인터뷰 2026-05-07). 디자인 일관성 우선 |
| 그리드 셀 최대 | 9 / 12 / 16 | **12 (cols × rows ≤ 12, 각 1~6)** | 36개(6×6)는 너무 많음, 9개(3×3)는 6×2/3×4 같은 경우 제외. 12로 균형 |

### 7.3 Clean Architecture 적용

```
Selected Level: Dynamic (Electron + React + Clean Architecture 4-layer)

본 기능의 레이어별 변경:

┌─────────────────────────────────────────────────────────────┐
│ infrastructure/  (변경 최소)                                │
│  └─ 기존 IStoragePort 재사용 — 별도 파일 신설 X             │
├─────────────────────────────────────────────────────────────┤
│ adapters/  (UI + 상태)                                      │
│  └─ stores/useDesktopOrganizeStore.ts (NEW)                 │
│       - { cols, rows, boxTitles[], setGrid, setTitle, ... } │
│       - load/save via IStoragePort                          │
│  └─ repositories/JsonDesktopOrganizeRepository.ts (NEW, 옵션)│
│       - 또는 store 내부에서 직접 IStoragePort 호출          │
├─────────────────────────────────────────────────────────────┤
│ widgets/  (위젯 카드)                                       │
│  └─ items/DesktopOrganize.tsx (NEW)                         │
│       - 그리드 렌더, 제목 인라인 편집, 그리드 변경 팝오버   │
│  └─ items/DesktopOrganize/                                  │
│       - DesktopOrganizeGrid.tsx (그리드 셀 렌더)            │
│       - DesktopOrganizeBox.tsx (박스 1개)                   │
│       - DesktopOrganizeGridSettings.tsx (팝오버 UI)         │
│  └─ registry.ts (수정 — 정의 1건 추가)                      │
├─────────────────────────────────────────────────────────────┤
│ usecases/  (비즈니스 로직, 옵션)                            │
│  └─ desktopOrganize/ResizeGrid.ts (NEW, 옵션)               │
│       - 그리드 축소 시 제목 보존/잘림 결정 순수 함수        │
│  └─ desktopOrganize/ValidateGridDimensions.ts (NEW, 옵션)   │
│       - cols/rows 1~6, 합 ≤ 12 검증 순수 함수               │
├─────────────────────────────────────────────────────────────┤
│ domain/  (변경 최소)                                        │
│  └─ entities/DesktopOrganizeConfig.ts (NEW)                 │
│       - { cols: number; rows: number; boxTitles: string[] } │
│       - 타입만 (외부 의존 0)                                │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 IPC/외부 의존

본 기능은 IPC 채널 신설 없음. native-desktop 모드의 기존 hook 라우팅(`widget:layout-shortcut`, `setWidgetHeaderRegion`, `setWidgetResizeRegion`)을 변경하지 않는다. 카드는 widget 내부에서만 동작하며 OS와 직접 통신하지 않는다.

---

## 8. 컨벤션 사전 검토

### 8.1 기존 프로젝트 컨벤션 체크

- [x] `CLAUDE.md`에 코딩 컨벤션 섹션 존재
- [x] `tsconfig.json` strict 모드
- [x] Path Alias 정의 (`@domain/*`, `@usecases/*`, `@adapters/*`, `@infrastructure/*`, `@widgets/*`)
- [x] Tailwind sp-* 토큰
- [x] Noto Sans KR
- [x] 라운딩 정책: `rounded-sp-*` 금지, Tailwind 기본 키만

### 8.2 본 기능에서 적용할 컨벤션

| 분류 | 본 기능에서 적용 | 우선순위 |
|------|------------------|:--------:|
| 라운딩 | `rounded-2xl` (박스), `rounded-xl` (팝오버), `rounded-lg` (입력) | High |
| 디자인 토큰 | `sp-card`, `sp-border`, `sp-accent`, `sp-text`, `sp-muted` | High |
| 모션 | `prefers-reduced-motion` 시 transition 0 | High |
| 박스 배경 | `bg-sp-card/40` (alpha ~40%) — 아이콘 가독성 우선 | High |
| Import 순서 | `@domain` → `@usecases` → `@adapters` → `@widgets` 순 | Medium |
| any 금지 | strict | High |
| 컴포넌트 분리 | DesktopOrganize.tsx 가 200줄 초과 시 sub-component로 분리 | Medium |

### 8.3 환경 변수

추가 환경 변수 없음.

---

## 9. 다음 단계

1. [ ] 사용자 승인 → `/pdca design desktop-organize`
2. [ ] **Design 단계 결정 항목**:
   - 영속화 방식 최종 결정 (별도 store vs WidgetInstance 확장)
   - 그리드 변경 UI 위치 최종 결정 (팝오버 vs 모달)
   - 박스 배경 alpha 최종 결정 (디자인 시안 기반)
3. [ ] frontend-design 또는 bkit:frontend-architect 에이전트와 mockup 협업 (메모리 정책)
   - mockup 위치: `mockup/desktop-organize/{view,edit,resize-modal}.html`
4. [ ] 디자인 검토 통과 후 `/pdca do desktop-organize`
5. [ ] 구현 (Do Phase) — 예상 1.5~2 작업일
   - Phase A: 도메인 타입 + store + 검증 함수 (단위 테스트 포함, ~0.5일)
   - Phase B: 카드 컴포넌트 + 그리드 렌더 + 제목 편집 (~0.5일)
   - Phase C: 그리드 변경 팝오버 + 축소 모달 (~0.5일)
   - Phase D: 회귀 시나리오 수동 체크 + 디자인 polish (~0.3일)
6. [ ] Gap 분석 (Check Phase) — Match Rate ≥ 90% 목표
7. [ ] release-notes.json v2.1.x 항목 + 챗봇 KB Q&A + 노션 가이드
8. [ ] v2.1.x 릴리즈 (native-desktop-mode 안정화 이후 합류)

---

## Version History

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-05-07 | 최초 Draft 작성. 사용자 인터뷰(2026-05-07) 결정사항 반영: 카드 노출(위젯+대시보드 미리보기), 시각 영역만, 프리셋 3종 + 직접 입력, 단일 톤, native-desktop과 충돌 없음 | pblsketch |
