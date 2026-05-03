# 담임 업무 페이지 - 디자인 시스템 v3.2 / UI·UX 감사 보고서

- **대상**: `src/adapters/components/Homeroom/` 전체 + 위젯(`DashboardStudentRecords`)
- **레퍼런스**: `design examples/ssampin_homeroom_memo_page/{code.html, screen.png}`
- **기준**: 디자인 시스템 v3.2 (Audit 90/100), sp-* 토큰, focus-trap Modal, WCAG AA, 라운드 정책
- **방식**: 디자인 레퍼런스 1:1 비교 + 정량 grep + 코드 인용
- **인벤토리**: 20개 컴포넌트 / 약 8,500 LOC / 7개 Tab+모달 / 1개 widget

---

## A. 디자인 레퍼런스 재현도

### A-1. 디자인 vs 구현 1:1 매핑 표

| 영역 | `code.html` 레퍼런스 | 실제 구현 | 일치도 | 비고 |
|---|---|---|---|---|
| 페이지 컨테이너 | 사이드바 `w-64` + main `flex-1` | `App.tsx` 외곽이 동일 구조 (사이드바 별도) | OK | 페이지 자체 책임 아님 |
| 헤더 BG | `bg-card-dark/50 backdrop-blur-sm border-b` (line 99) | `PageHeader`: `bg-sp-bg` + `border-b border-sp-border` (PageHeader:46-50) | 부분 | 디자인은 카드톤 + blur, 구현은 평면 sp-bg |
| 헤더 타이틀 | `text-3xl font-bold` + 이모지 `👩‍🏫` (line 101) | `text-lg xl:text-xl font-bold` + `iconIsMaterial` `school` (HomeroomPage:32-33, PageHeader:53) | **불일치** | 폰트 크기 약 50% 작음. 이모지 → 머티리얼 아이콘 톤 다운 |
| 모드 토글(입력/통계/조회) | 레퍼런스에서 헤더 우측 큰 pill 그룹 (line 105-115) | `RecordsTab.tsx:72-86`에 헤더가 아닌 콘텐츠 안쪽 별도 위치 | **불일치** | 헤더 우측 = HomeroomTabBar(6탭), 모드 토글은 그 아래라 시각 위계가 어긋남 |
| 학급 탭(담임/1-1~1-5) | `border-b-[3px] border-primary` 언더라인 (line 119-136) | 미구현 (담임만 보여주는 RecordsTab) | **부재** | 디자인은 다중 학급 동시 노출, 구현은 단일 className만 |
| 학생 격자 컬럼 수 | `grid-cols-4 sm:grid-cols-5` (line 154) | `grid-cols-4` 고정 (InputMode:552) | **불일치** | 디자인 5열 가정, 구현 4열 — 30명 학급에서 행이 더 많아져 스크롤 ↑ |
| 학생 격자 비율 | `aspect-[4/3]` (line 156) | `px-1.5 py-2.5` 일반 padding (InputMode:571) | 부분 | 일관된 비율 박스 모양 손실 |
| 학생 격자 선택 상태 | `bg-primary text-white shadow-lg shadow-primary/30 ring-2 ring-primary ring-offset-2 ring-offset-background-dark` (line 160) | `bg-sp-accent text-white ring-1 ring-sp-accent` (InputMode:572) | 부분 | ring 두께 1 vs 2, ring-offset 누락, shadow 미사용 → 시각 강조 약함 |
| 카테고리 컨테이너 | `bg-card-dark rounded-2xl p-6 border border-slate-700/50 shadow-sm` (line 183) | `bg-sp-card p-5` only, 테두리·shadow 누락 (InputMode:649) | **불일치** | sp-shadow / border ring-1 sp-border 사용 필요 |
| 카테고리 그룹 라벨 | `text-xs font-bold text-rose-400 uppercase tracking-wider mb-2` (line 191) | `text-xs font-semibold` + `getCategoryLabelColor` (InputMode:675) | 부분 | uppercase·tracking·font-bold 누락 → 시각 위계 약 |
| 카테고리 칩 | **`rounded-full`** + `border-rose-500/30 bg-rose-500/10 text-rose-200` (line 193) | **`rounded-lg`** + `bg-{c}-500/10 text-{c}-400` (recordUtils:140) | **불일치** | 핵심 미스매치: 디자인은 알약형(pill), 구현은 직각 라운드 → 인지 부하 ↑ |
| 카테고리 칩 active | `bg-rose-600 text-white shadow-md shadow-rose-900/50` + 체크 아이콘 (line 196-198) | `bg-{c}-500/80 text-white` + `✓ ` 텍스트 (RECORD_COLOR_MAP:21) | 부분 | shadow 누락. 색상도 600 vs 500/80 |
| 메모 컨테이너 | `bg-card-dark rounded-2xl p-6 border border-slate-700/50 shadow-sm` (line 234) | `bg-sp-card` 없음, 텍스트에어리어만 (InputMode:782) | **불일치** | 별도 카드 분리 안 됨 |
| 메모 textarea | `bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-base leading-relaxed` (line 239) | `bg-sp-surface border border-sp-border rounded-lg p-3 text-sm` (InputMode:787) | 부분 | rounded-xl→lg, p-4→p-3, text-base→sm — 작아짐 |
| 저장 버튼 | **하단 sticky 풀폭 큰 버튼** `text-xl font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20` + 도움말 1줄 (line 246-255) | **3컬럼 중 가운데 col 안에서 sticky `py-3 text-sm`** (InputMode:925-938) | **불일치** | 디자인은 페이지 하단 풀폭 / 구현은 좁은 가운데 컬럼만 → CTA 가시성 저하. 도움말 누락 |
| 도움말 안내 | "💡 카테고리만 선택해도 바로 저장할 수 있어요" (line 252-254) | 단축키 안내만 (InputMode:725) | 부재 | 첫 진입 사용자 가이드 누락 |

### [P0] 디자인 핵심 시각 언어 미준수: 카테고리 칩이 직각

- **위치**: `src/adapters/components/Homeroom/Records/recordUtils.ts:139-143`
- **현재**:
  ```ts
  export function getSubcategoryChipClass(color: string, isSelected: boolean): string {
    const base = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none';
    ...
  }
  ```
  레퍼런스(line 193): `class="px-4 py-2 rounded-full border border-rose-500/30 bg-rose-500/10 ..."`
- **문제**: 디자인 레퍼런스의 핵심 차별점 = 알약형 칩(`rounded-full`). 구현은 `rounded-lg`로 직각 모서리 → 첫 인상 다른 페이지(시간표·설정)와 구분 안 됨. 또한 디자인은 `border` + `bg/10`인데 구현은 `bg/10`만으로 테두리 없음 → 빈 상태에서 칩 영역이 모호.
- **개선안**:
  ```ts
  const base = 'px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all select-none';
  // RECORD_COLOR_MAP의 inactiveBg에 `border-{c}-500/30` 추가
  // active: `bg-{c}-600 text-white shadow-md` (현재 500/80은 너무 흐림)
  ```
- **레퍼런스**: `design examples/ssampin_homeroom_memo_page/code.html:191-228`

### [P0] 학생 격자 4열 → 디자인 5열 미준수

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:552`
- **현재**: `<div className="grid grid-cols-4 gap-2 overflow-y-auto flex-1">`
- **레퍼런스**: `<div class="grid grid-cols-4 sm:grid-cols-5 gap-2 content-start">` (line 154)
- **문제**: 30명 학급 기준 4열 = 8행, 5열 = 6행. 행이 줄어 한 화면 가시성 ↑. 또한 학생 박스에 `aspect-[4/3]` 비율 미적용 → 타이포 길이에 따라 박스 높이 변동.
- **개선안**:
  ```tsx
  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 content-start">
    {students.map(...)}
  </div>
  ```
  학생 버튼에 `aspect-[4/3]` 추가 또는 고정 `h-12` 권장.
- **레퍼런스**: `code.html:154`, `screen.png` (5열 배치 확인됨)

### [P0] 저장 버튼 위치·크기 디자인 위반

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:925-939`
- **현재**:
  ```tsx
  <div className="sticky bottom-0 bg-gradient-to-t from-sp-card to-transparent pt-6 pb-1 px-5 -mt-16 rounded-b-xl">
    <button ... className="w-full py-3 rounded-xl text-sm font-bold ...">저장하기</button>
  </div>
  ```
  - 위치: 3컬럼 중 가운데 컬럼 내부 sticky → 가운데 영역 width의 ~30% 만 차지
- **레퍼런스**:
  ```html
  <div class="absolute bottom-0 left-0 right-0 bg-card-dark border-t border-slate-700 p-6 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
    <button class="w-full bg-primary ... text-xl font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 ...">
      <span class="material-symbols-outlined">save</span> 저장하기
    </button>
    <p class="text-text-secondary text-sm">💡 카테고리만 선택해도 바로 저장할 수 있어요</p>
  </div>
  ```
- **문제**: Fitt's Law 위반. 가장 중요한 CTA가 시야 한가운데 좁은 컬럼에 종속 → 조회 빈도 ↓. text-xl 가이드까지 사라져 시각 강조 약함. 도움말도 누락.
- **개선안**: HomeroomPage 레벨로 끌어올려 페이지 하단 풀폭 sticky로 만들거나, InputMode 외곽으로 추출 후 `text-base font-bold py-4` + 도움말 1줄. (단계적: 일단 `text-base` + 도움말부터)
- **레퍼런스**: `code.html:246-256`

### [P1] 카테고리 그룹 라벨 시각 위계 약함

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx:675`
- **현재**: `text-xs font-semibold mb-1.5`
- **레퍼런스(line 191)**: `text-xs font-bold text-rose-400 uppercase tracking-wider mb-2`
- **문제**: 그룹 라벨이 본문 텍스트와 무게가 비슷하게 보여 카테고리 경계가 약함. 디자인은 uppercase + wide tracking으로 명확한 섹션 헤더.
- **개선안**: `text-xs font-bold uppercase tracking-wider mb-2` + `getCategoryLabelColor` 유지.

### [P1] 카테고리 카드와 메모 카드가 한 컨테이너로 합쳐져 있음

- **위치**: `InputMode.tsx:649` (`bg-sp-card p-5 flex-1 overflow-y-auto`)
- **레퍼런스**: 카테고리 카드(line 183)와 메모 카드(line 234)가 별도 `bg-card-dark rounded-2xl p-6 border` × 2장.
- **문제**: 본래 시각적으로 분리된 두 컨테이너가 통합돼 정보 그루핑이 흐려짐. 메모 영역 식별성 ↓.
- **개선안**: 두 카드를 분리 `<div className="rounded-xl bg-sp-card p-5 ring-1 ring-sp-border">` × 2 + `flex flex-col gap-4`.

### [P2] 헤더 BG에 backdrop-blur·반투명 누락

- **위치**: `src/adapters/components/common/PageHeader/PageHeader.tsx:46`
- **현재**: `'bg-sp-bg'` (sticky=false 시) 또는 `'bg-sp-bg/95 backdrop-blur-sm z-10'` (sticky=true)
- **레퍼런스(line 99)**: `bg-card-dark/50 backdrop-blur-sm border-b border-slate-700/50`
- **문제**: HomeroomPage는 sticky=false라 평면 sp-bg. 디자인 톤이 떠오르지 않음. 디자인 시스템 v3.2 정책상 모든 페이지 헤더에 약한 blur+반투명을 적용하면 일관성 ↑.
- **개선안**: PageHeader에 `bg-sp-card/40 backdrop-blur-sm` 모드 옵션 추가하거나 `sticky=true`를 기본값으로.

---

## B. 디자인 토큰 일관성 (sp-*)

### B-1. 정량 점검 (Homeroom 디렉토리 전체 grep)

| 위반 패턴 | 총 발생 | 영향 파일 수 | 비고 |
|---|---|---|---|
| `bg-{tailwind-color}-{N}00` (sp-* 미사용) | **122건** | 19개 | InputMode·ProgressMode·SearchMode·SurveyTab·ConsultationCreateModal·SurveyCreateModal 전반 |
| `text-{tailwind-color}-{N}00` | **177건** | 18개 | RosterManagementTab(22), ConsultationCreateModal(22), ProgressMode(29) 가장 심각 |
| `border-{tailwind-color}-{N}00` | **28건** | 10개 | PeriodChipGroup이 8건 — 한 컴포넌트 집중 |
| `z-50` 등 임의 z (z-sp-* 미사용) | **22건** | 8개 | 모든 raw 모달·드롭다운 |
| `style={{ fontSize: '...' }}` 인라인 | **4건** | 2개 | RosterManagementTab(3), ConsultationCreateModal(1) |
| `rounded-2xl` (raw 모달 카드) | **3건** | 2개 | RecordsExportModal/sharedExportModal은 sp-Modal로 통일됨 |
| `rounded-full` 사용 | **47건** | 14개 | 일부 정당(ping/badge), 칩에는 미적용이라 정책 미스 |
| `text-white` (sp-text 미사용) | **44건** | 18개 | 선택 상태·CTA 위주이긴 하나 sp-* 토큰화 가능 |

### [P0] RECORD_COLOR_MAP가 sp-* 토큰을 일절 쓰지 않음

- **위치**: `src/adapters/stores/useStudentRecordsStore.ts:14-73` (9색 × 4슬롯 = 36 클래스 문자열)
- **현재**:
  ```ts
  export const RECORD_COLOR_MAP = {
    red: {
      text: 'text-red-400',
      activeBg: 'bg-red-500/80 text-white',
      inactiveBg: 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
      tagBg: 'bg-red-500/15 text-red-400',
    }, ...
  }
  ```
- **문제**:
  1. 디자인 시스템 v3.2 핵심은 sp-* 토큰. 그러나 RECORD_COLOR_MAP은 raw Tailwind 색을 9색×4슬롯=**36 매핑**으로 펼쳐 sp-* 시스템 외부에 별도 색 시스템을 만든 셈. 향후 칩 디자인 변경 시 36개 모두 수정.
  2. `getCategoryDotColor`(recordUtils:155-169)에 또 한 벌의 색 매핑 — DRY 위반.
  3. PeriodChipGroup의 `ACCENT_CLASSES`(PeriodChipGroup:14-47)에서 4색 × 6슬롯 = 24 매핑 또 다시 — 카테고리 색 + 강조 색이 동일 의미인데도 별도.
- **개선안**:
  - `tailwind.config.js`에 `sp-cat-{red,blue,green,...}-{50,100,200,400,600}` 시맨틱 토큰 신설하거나, 적어도 `tagBg` `inactiveBg` `activeBg` 3 슬롯 → CSS 변수화: `bg-[var(--sp-cat-red-soft)]`. 단계적 P1 먼저 인지 후 codemod.
  - `getCategoryDotColor`는 `RECORD_COLOR_MAP[c].text.replace('text-','bg-').replace('-400','-400')`로 통합 가능.
- **레퍼런스**: 다른 라운드의 dashboard-audit 사례, `feedback_design_system_audit.md` (가상 — Modal P 라운드 결과)

### [P0] SurveyTab/ConsultationTab/Assignment에 같은 색 매핑 중복

- **위치**:
  - `src/adapters/components/Homeroom/Survey/SurveyTab.tsx:20-29` (`COLOR_MAP`: blue/green/yellow/.../teal × `bg/dot/bar` 3슬롯 = 24 매핑)
  - `src/adapters/components/Homeroom/Records/PeriodChipGroup.tsx:14-47` (`ACCENT_CLASSES`: 4×6 = 24 매핑)
- **현재 (대표)**:
  ```ts
  const COLOR_MAP: Record<string, { bg: string; dot: string; bar: string }> = {
    blue: { bg: 'bg-blue-500/10', dot: 'bg-blue-400', bar: 'bg-blue-400' },
    ... // 8 colors
  };
  ```
- **문제**: 카테고리 색 = 설문 색 = 출결 강조 색이 동일 의미인데 3곳에서 독립 정의. 한 색 변경 = 3곳 수정. **단일 source 부재**.
- **개선안**: `src/adapters/styles/categoryColors.ts` 신설해 모든 매핑을 단일 객체로 통합 후 export. 또는 RECORD_COLOR_MAP을 store 밖 styles로 이동시키고 SurveyTab/PeriodChipGroup에서 import.
- **레퍼런스**: 위치 3개 비교

### [P1] 인라인 fontSize 4건

- **위치**:
  - `RosterManagementTab.tsx:654` `style={{ fontSize: '20px' }}` (모달 close 아이콘)
  - `RosterManagementTab.tsx:970` `style={{ fontSize: '18px' }}` (warning)
  - `RosterManagementTab.tsx:1099` `style={{ fontSize: '16px' }}` (이모지 🎂)
  - `ConsultationCreateModal.tsx:1320` `style={{ fontSize: '10px' }}` (배지)
- **문제**: 디자인 시스템 v3.2의 `text-icon-{xs,sm,md,lg}` 토큰을 우회. Modal P 라운드 종결 결과(text-[Npx] 449→66)와 정합성 깨짐.
- **개선안**: 각각 `text-icon-md`(20px), `text-icon-sm`(18px), `text-icon-sm`(16px), `text-detail`(10px)로 치환.

### [P1] z-50 raw 사용 22건 (z-sp-modal·z-sp-dropdown 미사용)

- **대표 위치**:
  - `InputMode.tsx:943, 1242` (batch-confirm 모달, 메모 확대 모달)
  - `RosterManagementTab.tsx:643, 719, 1021` (preview / 일괄입력 마법사 / 상태 변경 모달)
  - `Survey/SurveyTab.tsx:96` (SurveyShareModal)
  - `Consultation/ConsultationTab.tsx:82` (ConsultationShareModal)
  - `AssignmentTab.tsx:282, 285` (delete confirm)
  - `Consultation/ConsultationDetail.tsx:88, 438, 439` (모달 + 드롭다운)
  - `Survey/SurveyDetail.tsx:154, 155` (드롭다운)
  - `Survey/SurveyStudentDetail.tsx:268, 269, 384, 524` (드롭다운 + 모달 2종)
- **문제**: 디자인 시스템 v3.2에서 신설된 `z-sp-{modal:50, toast:60, palette:70, dropdown:40, tooltip:80}` 시맨틱 토큰을 사용하지 않음. 다른 부분(공용 Modal, Toast)이 z-sp-*로 마이그레이션된 상태에서 Homeroom만 raw로 남아 향후 z 충돌 위험.
- **개선안**: 일괄 codemod — modal는 `z-sp-modal`, dropdown은 `z-sp-dropdown`으로 치환.

### [P1] Tailwind 색상 hardcode 327건

- **분포**: bg 122 + text 177 + border 28 = 327건
- **핫스팟 Top 5**:
  1. `RosterManagementTab.tsx`: 45건 (status 배지, 이름 라벨 등)
  2. `ProgressMode.tsx`: 42건 (warning 카드, 통계 차트)
  3. `ConsultationCreateModal.tsx`: 33건
  4. `Records/recordUtils.ts`: 18건 (`ATTENDANCE_TAG_COLORS`)
  5. `PeriodChipGroup.tsx`: 24건
- **문제**: sp-cat-* 시맨틱 토큰화 부재로 색 변경 시 3xx건 수동 수정. 디자인 v3.2에서 부채로 인식되어야 함.
- **개선안**: 대시보드 audit과 통합한 별도 P 라운드(`HomeroomColorMap` 라운드) 권장.

---

## C. 시각 위계와 정보 구조

### [P0] 6개 탭이 균등 배치 — 사용 빈도 가중 없음

- **위치**: `src/adapters/components/Homeroom/HomeroomTabBar.tsx:3-10`
- **현재**: 명렬·기록·설문·과제·상담·자리배치 6개가 동일 크기·동일 간격
- **문제**:
  - 담임 교사 일상 빈도: **기록(매일 N회) >> 명렬(학기초/이동) >> 자리배치(주~월) >> 설문/과제/상담(주간 이벤트)** 인데, 시각적으로 동일.
  - 첫 진입 default가 `'records'`(HomeroomPage:21)인 건 옳지만 탭바에서 시각 우선순위가 안 보임.
  - 6개가 1줄에 다 들어갈 때 텍스트가 좁아 인지 부하.
- **개선안**:
  - 기록 탭에 빈도 강조 (`font-bold` 유지 + 좌측 첫 위치 + slight emphasis).
  - 사용량 적은 탭(자리배치)을 끝에 배치 (이미 OK).
  - 최소 너비 보정: `min-w-[112px]` 또는 그룹 분리(`기록 / 명렬 | 설문·과제·상담 | 자리배치`).
  - 탭 옆 카운트 배지 추가 (`설문 (3)`, `과제 (2)` 등) — 액티브 항목 즉시 인지.

### [P0] 모드 토글이 헤더 아닌 본문에 있어 시각 위계 어긋남

- **위치**: `src/adapters/components/Homeroom/Records/RecordsTab.tsx:71-105`
- **현재**: HomeroomTabBar 아래 본문 영역에 `(입력/통계/조회)` + 우측 액션 + DateNavigator가 모두 들어감
- **레퍼런스**: 헤더 우측에 큰 pill 그룹으로 (코드 line 105)
- **문제**:
  - 이미 6탭 → 다시 3모드 → 본문은 또 학생/카테고리 칼럼 등으로 위계 4단.
  - 모드 변경 빈도(매일)가 탭 변경(주간)보다 높은데 위치가 더 깊은 곳.
- **개선안**: HomeroomPage에서 records 탭일 때 `rightActions`에 모드 토글까지 포함하도록 구조 변경 (state lift up).

### [P1] 학생 격자 5열 가독성 — 한 학급 30명에서 한눈에 안 들어옴

- **위치**: `InputMode.tsx:552, 583`
- **현재**: 4열 grid + 가변 높이
- **문제**: 좌측 컬럼 폭(약 38%) × 4열 = 학생당 ~70px → 이름이 3글자 이상이면 truncate. 5열로 가도 ~56px = 더 좁음. 학생 격자 보기와 명렬표 보기 두 모드가 있는 건 좋으나, 30명 모두를 1뷰로 보려면 격자 모드에서 ergonomic 한계.
- **개선안**:
  - 격자 카드를 `flex-col gap-0.5` + `tabular-nums` 번호 + 이름 `font-medium`로 정리 (현재는 이름 truncate).
  - 30명 가정시 5열·6행 = 약 240×360px 영역. 실 측정: leftPct 38%로 보면 화면 1280에서 좌측 = 486px → 5열 시 cell ~94px → 가능. **5열 권장**.

### [P1] 카테고리 칩 색상 매핑이 의미 우선순위 미반영

- **위치**: `src/domain/valueObjects/RecordCategory.ts:22-47`
- **현재**: 출결=red(긴급), 상담=blue(소통), 생활=green(일상), 기타=gray(보조)
- **문제**: 디자인 의도와는 OK하나 SurveyTab의 8색(blue/green/yellow/purple/red/pink/indigo/teal)과 의미 충돌. 설문 카테고리 색이 적색이면 출결 색과 같아져 의미 혼동.
- **개선안**: 설문/과제/상담은 카테고리 색 = "장식적", 기록은 "의미적"으로 명시 분리. 또는 설문에서 red 사용 금지(예약).

### [P1] 빈 상태 패턴 일관성 부족

- **위치**:
  - InputMode 빈 상태: `material-symbols-outlined text-3xl mb-2 + 안내 (InputMode:1217-1221)`
  - SurveyTab 빈 상태: `text-4xl 📋 + 2줄 안내` (SurveyTab:326-330)
  - AssignmentTab 빈 상태 (별도 컴포넌트 사용)
  - ConsultationTab 빈 상태 (별도)
- **현재**: 4개 탭이 빈 상태 일러스트·아이콘 크기·메시지 톤·CTA 유무 모두 다름
- **개선안**: 공용 `<EmptyState icon iconType title description action />` 컴포넌트 신설 (이미 common/에 있을 가능성. 없다면 신설).

### [P2] 로딩 상태 일관성 부족

- **위치**: 4개 탭 각자 로딩 처리
  - RecordsTab: `text-sp-muted text-sm "로딩 중..."` (RecordsTab:62-65)
  - SurveyTab: `text-sp-muted text-sm "불러오는 중..."` (SurveyTab:284-289)
  - 그 외 각자
- **개선안**: 공용 `<LoadingState>` (Spinner + 메시지) — 메시지 톤만이라도 통일 ("불러오는 중..." 권장).

---

## D. 인터랙션·접근성

### [P0] 학생 격자 button에 aria-pressed 누락

- **위치**: `InputMode.tsx:567-579, 608-628`
- **현재**:
  ```tsx
  <button
    key={student.id}
    onClick={() => toggleStudent(student.id)}
    className={... isSelected ? 'bg-sp-accent ...' : 'bg-sp-surface ...'}
  >
  ```
- **문제**: 토글 버튼임에도 `aria-pressed={isSelected}` 누락. 스크린리더는 학생 선택 상태를 읽지 못함. WCAG 2.1 4.1.2 위반.
- **개선안**: `<button aria-pressed={isSelected} aria-label={`${num}번 ${student.name} ${isSelected ? '선택됨' : '선택 안 됨'}`}>`

### [P0] 카테고리 칩에 aria-pressed/role=group 누락

- **위치**: `InputMode.tsx:684-693, 711-722, 736-746`
- **현재**: 일반 `<button>`에 클래스만 적용
- **문제**: 단축키(A/L/E/X 등)가 있어 키보드 친화적이긴 하나, 토글 칩의 ARIA 패턴이 누락. 그룹 라벨링도 없음 (`role="group" aria-label="출결 유형"`).
- **개선안**:
  ```tsx
  <div role="group" aria-label="출결 유형">
    {ATTENDANCE_TYPES.map(type => (
      <button aria-pressed={attendanceType === type} ...>
    ))}
  </div>
  ```

### [P0] 모든 raw 모달 7건이 focus-trap·ESC·body lock 미적용

- **위치**: 7개 파일
  - `Records/InputMode.tsx:943` (batch-confirm), `:1242` (메모 확대)
  - `RosterManagementTab.tsx:643, 719, 1021`
  - `Consultation/{ConsultationTab.tsx:82, ConsultationDetail.tsx:88}`
  - `Survey/{SurveyTab.tsx:96, SurveyStudentDetail.tsx:384, 524}`
  - `AssignmentTab.tsx:285`
- **현재(예)**:
  ```tsx
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div className="bg-sp-card border border-sp-border rounded-xl p-6 ..." />
  </div>
  ```
- **문제**:
  - Tab 키가 모달 밖으로 벗어남.
  - ESC로 닫히지 않음.
  - 모달 열려도 배경 페이지가 스크롤 됨.
  - role=dialog, aria-modal=true, aria-labelledby 누락.
  - WCAG 2.4.3 (Focus Order) + 2.1.2 (No Keyboard Trap의 반대) 위반 + 모달 밖 탐색 가능 문제.
- **개선안**: 4개 파일은 이미 공용 `<Modal isOpen onClose title>` 사용 — 동일 패턴으로 7개 raw 모달 마이그레이션. Modal 라운드(B~P)의 잔존 부채.

### [P0] 학생 격자가 격자형 키보드 네비를 지원 안 함

- **위치**: `InputMode.tsx:552-580`
- **현재**: 평범한 button × N. Tab으로 1번부터 30번까지 순회.
- **문제**: 5열 6행 격자에서 Tab만 사용 = 비효율. 화살표 키로 좌우/상하 이동이 자연스러움. WAI-ARIA Grid pattern 미적용.
- **개선안**: 단일 tabindex roving 패턴(`role="grid"` + `role="row"` + `role="gridcell"` + 화살표 키 핸들러). 또는 최소한 `←→↑↓` 화살표 단축키(현재 단축키 영역에 추가).

### [P1] 카테고리 칩 + 서브카테고리 2단 흐름 — 시각 단서 부족

- **위치**: `InputMode.tsx:678-728`
- **현재**: 출결 유형 클릭 → 사유 행이 아래에 등장 (애니메이션 없음, border-l-2 red 표시만)
- **문제**:
  - 갑작스럽게 등장 → 사용자가 영역 변화 인지 어려움.
  - 사유 미선택 상태에서도 저장 버튼이 활성될 수 있음(`canSave = selectedSub !== null` — 사유까지 포함하면 OK이긴 한데 단계적 안내 부족).
- **개선안**:
  - `transition-all duration-200` + `animate-in slide-in-from-top-2`.
  - 사유 영역에 "사유를 선택하세요" placeholder 강조.
  - 1단계(유형) → 2단계(사유) 미선택일 때 저장 버튼에 "사유 선택" 가이드 표시.

### [P1] 출결 교시 칩(PeriodChipGroup) UI 복잡도

- **위치**: `PeriodChipGroup.tsx:99-156`
- **현재**: 전체 / 조회 / 1~7 / 종례 + 선택된 라벨 안내(`1교시·3교시 선택됨`)
- **문제**:
  - 전체 토글의 의미가 다중(전부 선택 / 전부 해제 / 빈 상태에서 전부 선택)이라 인지 부담.
  - 색 맵 4종(red/amber/orange/purple)이 각자 active/inactive로 24개 클래스 — 동일한 시각 패턴.
  - "전체"가 활성일 때 1~7 교시 칩은 inactive처럼 보이므로 사용자가 "전체 + 특정 교시"를 동시 선택할 수 있는지 모름(사실 못함).
- **개선안**:
  - "정규 전체" 토글 의미를 명시 라벨링: `aria-pressed={allActive} aria-label="1~N교시 전체 선택 토글"`
  - 활성 시 1~7 칩은 `disabled` 또는 `opacity-50` 표시로 동시 선택 불가 시각화.

### [P1] 내보내기 모달은 공용 Modal 사용 — 좋은 사례

- **위치**: `Records/RecordsExportModal.tsx:187` (`<Modal isOpen onClose>`)
- **현재**: focus-trap, ESC, role=dialog 모두 정상.
- **참고**: 7개 raw 모달이 따라야 할 표준.

### [P1] 키보드 단축키 안내 텍스트가 모달이 아닌 본문에 묻혀 있음

- **위치**: `InputMode.tsx:725-727`
- **현재**: `text-caption text-sp-muted` 1줄 텍스트
- **문제**: A/L/E/X/Q/W/R/T/1~7/Enter/Esc 등 12+ 단축키가 한 줄에. 가독성 ↓. 또한 `?` 누르면 단축키 가이드 모달 같은 표준 패턴 부재.
- **개선안**: `?` 또는 `Shift+/` 키로 KeyboardShortcutsModal 띄우기. 본문 1줄은 유지하되 `<Kbd>` 토큰 사용 (디자인 시스템 v3.2의 신규 Kbd 컴포넌트).

### [P1] WCAG AA 색 대비 의심 지점

- **위치**:
  - `RECORD_COLOR_MAP[c].inactiveBg`: `bg-{c}-500/10 text-{c}-400` → 어두운 배경 위 옅은 색칩 + 옅은 텍스트
  - `text-sp-muted/60` 등 sp-muted를 더 흐리게(`/60`, `/40`) 사용한 곳
- **추정 비율**: red-400 (`#f87171`) on sp-card (`#1a2332`) ≈ 7.5:1 (OK), 그러나 `bg-red-500/10` 위에 `text-red-400` ≈ 약 5:1 (AA 통과). `text-sp-muted/60` (`#94a3b8` × 0.6 = 약 #5b6470 on #1a2332) ≈ 약 3:1 → **AA 본문 4.5:1 미달 가능성**.
- **개선안**: 자동 contrast checker(axe DevTools)로 InputMode + ProgressMode 검증. `text-sp-muted/60`은 placeholder/decorative 외 사용 금지 룰.

### [P2] 인라인 편집(InlineRecordEditor)에서 ESC 취소 없음

- **위치**: `InputMode.tsx:1146-1150`
- **현재**: `onCancel` 버튼만
- **개선안**: 편집 모드 진입 시 keydown ESC → onCancel 호출.

---

## E. 거대 컴포넌트의 UX 영향

### [P0] InputMode.tsx 1,299 LOC — 한 화면 인지 부하

- **위치**: `src/adapters/components/Homeroom/Records/InputMode.tsx`
- **현재 구조**: 좌측 학생격자(2가지 보기) + 가운데 카테고리(4종)+상담방법+메모+나이스체크+서류체크+여러날범위+후속조치+저장버튼+범위확인모달 + 우측(오늘기록/이전기록 탭) + 메모확대모달
- **문제**:
  - **한 화면에 등장하는 인터랙티브 요소 ~50+** (학생 30 + 카테고리 칩 약 13 + 상담 방법 6 + 체크박스 4 + 단축키 안내 + 모드 토글 등).
  - Hick's Law: 결정 시간 = log2(N+1). 50요소 = 약 5.6 비트 = 매 입력마다 인지 비용 ↑.
  - 코드 1,299줄 → 신규 개발자 onboarding 어려움. 기능 추가 시 회귀 위험.
  - 우측 컬럼에 "오늘 기록"이 들어가면 좌측 학생 → 가운데 입력 → 우측 결과의 흐름인데, 입력하는 동안 결과 컬럼 봐야 할 빈도 낮음.
- **개선안**:
  1. **단계별 플로우 분해**: Wizard 패턴 (Step 1 학생 선택 → Step 2 카테고리 → Step 3 메모/추가 옵션). 이미 출결은 자연스럽게 단계적이므로 시각화만.
  2. **컴포넌트 분해**:
     - `<StudentSelector view='grid'|'roster'>` 추출 (~150줄).
     - `<CategoryChipGroup>` 추출 (~120줄).
     - `<AttendanceOptions>` (나이스/서류/범위/후속) 추출 (~150줄).
     - `<RightSidePanel>` (오늘기록/이전기록) 별도 (~250줄).
     - `<MemoFullScreenModal>` 추출 (~50줄).
     - `<BatchConfirmModal>` 추출 (~70줄).
     - 결과: InputMode 본체 ~500줄로 축소.
  3. **3컬럼 리사이즈 핸들러를 useResizableColumns 커스텀 훅으로 추출**.

### [P0] RosterManagementTab.tsx 1,103 LOC — 명렬+편집+가져오기 마법사

- **위치**: `src/adapters/components/Homeroom/RosterManagementTab.tsx`
- **현재 구조**: 헤더(인원조절+버튼) + 명렬표 그리드 + 일괄입력 3-step wizard + 엑셀 미리보기 모달 + 상태변경 모달 + 안내
- **문제**:
  - 컴포넌트 1개에 자체 헤더(`<header>:243`)도 또 있음 — HomeroomPage `PageHeader`와 시각 위계 충돌.
  - 마법사 3 step이 복잡한 상태 머신인데 한 함수형 컴포넌트 안.
- **개선안**:
  - **자체 헤더 제거**. HomeroomPage가 이미 PageHeader 제공. 명렬 관리 탭은 `leftAddon`으로 인원 조절 + `rightActions`로 가져오기/내보내기/편집 토글.
  - `<BulkImportWizard>` 별도 라우트 또는 별도 컴포넌트(약 350줄 추출).
  - `<RosterTable>` 독립.

### [P0] ConsultationCreateModal.tsx 1,431 LOC — 모달 하나가 1.4k줄

- **위치**: `src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx`
- **현재**: 상담 유형/방법/날짜+시간 슬롯/프리셋(시간 사이/점심/조례 전 등 자동 계산)/기간 컨플릭트/QR 짧은 링크/ICS 등이 모두 한 모달
- **문제**: 모달 = 단일 작업 단위. 1.4k줄 = 사용자 인지 부하 폭증. 한 화면에 너무 많음.
- **개선안**:
  - 모달 내부 stepper 도입 (정보 → 일정 → 공유). Cal.com 스타일 (이미 schedule 페이지에 적용된 패턴 재사용).
  - 시간 프리셋 계산 로직(70줄)은 `usecases/consultation/computeBreakPresets.ts`로 분리. `lifo computeBreakPresets`이 이미 모달 안 헬퍼로 박혀 있음 (line 64-120) → 도메인 로직.

### [P2] 위젯 StudentRecords가 1959줄?

- **검증 결과**: 미션 명세 오류. 실제 `src/widgets/items/StudentRecords.tsx`는 **4줄짜리 re-export**:
  ```ts
  export { DashboardStudentRecords as StudentRecords } from '@adapters/components/Dashboard/DashboardStudentRecords';
  ```
- **실제 본체**: `DashboardStudentRecords.tsx` **269줄**.
- **현황**: 위젯으로 적절한 크기. 본질 위반 아님.
- **추가 발견**: 그러나 DashboardStudentRecords가 RECORD_COLOR_MAP을 직접 import + 자체 `getTagClass`까지 구현해 위젯-페이지 색 매핑 중복. recordUtils의 `getRecordTagClass`로 통합 가능.

### [P2] InputMode에 3컬럼 리사이즈 — 데스크톱 전용 가정

- **위치**: `InputMode.tsx:122-159`
- **현재**: leftPct/rightPct 마우스 드래그
- **문제**: 키보드 사용자 불가. 작은 노트북(1366×768)에서 3컬럼이 너무 좁음.
- **개선안**:
  - 키보드 핸들 추가 (`Shift+←/→`로 컬럼 폭 조정).
  - 1280px 미만에서 자동 2컬럼으로 fallback (우측 패널 → 토글 버튼).

---

## F. 6개 탭 통합 일관성

### F-1. 디자인 언어 일치도

| 항목 | RosterManagement | Records (Input) | Survey | Assignment | Consultation | Seating |
|---|---|---|---|---|---|---|
| 자체 헤더 유무 | **자체 있음** (line 243) | 없음 (모드 토글만) | 없음 (탭 내부 헤더 line 306) | 없음 (line 115) | 없음 (line 88) | 임베디드 |
| CTA 버튼 위치 | 헤더 우측 (편집/내보내기) | sticky 하단 가운데 컬럼 | 헤더 우측 ("새로 만들기") | 헤더 우측 ("새 과제") | 헤더 우측 ("새 일정") | N/A |
| CTA 스타일 | 외곽선 버튼 | filled accent (`bg-sp-accent`) | filled accent | filled accent | filled accent | N/A |
| 카드 컨테이너 | divide-y 리스트 | rounded-xl bg-sp-card | rounded-xl + `${color.bg}` | (외부 `<AssignmentCard>`) | rounded-xl bg-sp-accent/5 | N/A |
| 빈 상태 | 자체(미리보기 0건 시 없음) | text-3xl 아이콘 + 2줄 | text-4xl 이모지 + 2줄 | (외부 컴포넌트) | text-4xl + 2줄 | N/A |
| 모달 사용 | raw fixed inset-0 ×3 | raw ×2 + 공용 1 | raw ×2 + 공용 1 | raw ×1 + 외부 1 | raw ×3 | N/A |
| 검색·필터 | 인원 카운터만 | DateNavigator | 진행/완료 토글 | 진행/만료 분리 | 진행/만료 분리 | N/A |

### [P0] 헤더 패턴 비일관

- **문제**:
  1. RosterManagement는 자체 `<header>` (line 243-366)를 또 가짐 → HomeroomPage의 PageHeader와 위계 충돌.
  2. Records/Survey/Assignment/Consultation는 모드 토글·생성 버튼 등을 본문 첫 줄에 위치.
  3. 결과: 6 탭 모두 헤더 위계가 다름. 사용자는 매 탭마다 시각 스캐닝 다시.
- **개선안**:
  - HomeroomPage가 PageHeader의 `leftAddon`/`rightActions`를 탭별로 다르게 받도록 prop drill 또는 React Context.
  - 예: records 탭 → leftAddon=모드토글, rightActions=내보내기+카테고리관리. roster 탭 → leftAddon=인원조절, rightActions=가져오기/내보내기/편집.
- **예시 구조**:
  ```tsx
  <PageHeader
    title="담임 업무"
    leftAddon={<HomeroomTabBar ... />}
    rightActions={getTabRightActions(activeTab)}
  />
  ```

### [P1] CTA 스타일 비일관 (RosterManagement만 외곽선)

- **위치**:
  - RosterManagement: `border border-sp-border bg-sp-card hover:bg-sp-surface` (RosterManagementTab:279)
  - Survey/Assignment/Consultation 새 만들기: `bg-sp-accent text-white` (SurveyTab:316)
- **문제**: 같은 의미("새로 만들기")인데 색이 다름. 엔트리 포인트 일관성 부족.
- **개선안**: 모든 "새로 만들기"는 `bg-sp-accent text-white text-xs px-3 py-1.5 rounded-lg` 표준.

### [P1] 카드 컨테이너 라운드·테두리 비일관

- **위치**:
  - SurveyCard: `rounded-xl border border-sp-border + ${color.bg}` (SurveyTab:188)
  - ConsultationCard: `rounded-xl border border-sp-border + bg-sp-accent/5` (ConsultationTab:154)
  - AssignmentCard: 외부 `<AssignmentCard>`
- **문제**: Survey는 카테고리 색에 따라 8가지 배경, Consultation은 항상 sp-accent 5%, Assignment는 별도. 같은 "리스트의 항목"인데 시각이 다름.
- **개선안**: 공용 `<EntityCard>` 추출 + variant prop으로 색 결정.

### [P1] 모달 디자인 비일관

- **위치**: 12+ 모달 파일
  - 공용 Modal: 4건 (RecordsExportModal, ConsultationCreateModal, SurveyCreateModal, sharedExportModal)
  - raw fixed: 9+ 건 (남은 batch 모달, 공유 모달 5종, delete confirm 등)
- **문제**: 절반 이상 raw → focus-trap 없음 + 시각도 미세한 차이(rounded-2xl vs rounded-xl, p-6 vs p-5, border 유무).
- **개선안**: 모든 모달을 `<Modal>` 공용 컴포넌트로 통일 (Modal Q+ 라운드).

### [P2] 검색·필터·정렬 UI 비일관

- **위치**:
  - Records/SearchMode: 학생/카테고리/서브카테고리/방법/키워드/follow-up/unreported/doc-unsubmitted 8필터 모두 본문 상단
  - Survey: 진행/완료 토글만
  - Consultation: 진행/만료 분리 + 자체 정렬
- **문제**: 8필터 vs 1토글 vs 분리 — 각 탭에서 사용자가 매번 다른 패턴 학습.
- **개선안**: 공용 `<FilterBar>` 도입 (이미 일정 페이지에 있을 가능성 — Schedule 컴포넌트 참고).

---

## 종합 점수 / Top 10 우선순위 픽스

### 디자인 시스템 v3.2 기준 점수

| 카테고리 | 가중치 | 점수 | 가중점수 |
|---|---|---|---|
| A. 디자인 레퍼런스 재현도 (1:1) | 25% | 55 / 100 | 13.75 |
| B. 디자인 토큰 일관성 (sp-*) | 25% | 50 / 100 | 12.5 |
| C. 시각 위계·정보 구조 | 15% | 70 / 100 | 10.5 |
| D. 인터랙션·접근성 (WCAG AA) | 20% | 55 / 100 | 11.0 |
| E. 거대 컴포넌트 분해 | 10% | 45 / 100 | 4.5 |
| F. 6 탭 통합 일관성 | 5% | 60 / 100 | 3.0 |
| **종합** | 100% | — | **55.25 / 100** |

**v3.2 기준선(90점) 대비 -35점**. Modal 라운드의 P~ 수준 도달 전 단계. 디자인 레퍼런스(`code.html`)와 핵심 시각 언어가 어긋나 있고 RECORD_COLOR_MAP 등 색 토큰 부채가 가장 큼.

### Top 10 우선순위 픽스 (P0/P1)

| # | 우선 | 작업 | 위치 | 임팩트 |
|---|---|---|---|---|
| 1 | **P0** | 카테고리 칩 `rounded-lg` → `rounded-full` + border 추가 | `recordUtils.ts:139-143` + RECORD_COLOR_MAP | 디자인 언어 핵심 회복. 5분 픽스. |
| 2 | **P0** | 학생 격자 `grid-cols-4` → `grid-cols-4 sm:grid-cols-5` + `aspect-[4/3]` | `InputMode.tsx:552, 571` | 30명 학급 한눈에 인지 ↑ |
| 3 | **P0** | RECORD_COLOR_MAP·SurveyTab COLOR_MAP·PeriodChipGroup ACCENT_CLASSES → 단일 `categoryColors.ts` 통합 + sp-cat-* 시맨틱 토큰화 | `useStudentRecordsStore.ts:14-73` 외 2개 | 327건 raw color 부채 정리. P 라운드 후속. |
| 4 | **P0** | 7개 raw 모달 → 공용 `<Modal>` 마이그레이션 (focus-trap, ESC, role=dialog) | `InputMode.tsx:943, 1242` 외 5건 | WCAG AA 회복. Modal Q 라운드 신규 |
| 5 | **P0** | 학생 격자 button + 카테고리 칩에 `aria-pressed` + `role="group"` 추가 | `InputMode.tsx:567, 684, 711, 736` | 스크린리더 사용 가능 |
| 6 | **P0** | 저장 버튼 위치 — 가운데 컬럼 sticky → 페이지 하단 풀폭 sticky + 도움말 1줄 추가 | `InputMode.tsx:925-939` (HomeroomPage 레벨로 lift) | CTA 가시성 ↑ |
| 7 | **P0** | RosterManagementTab 자체 `<header>` 제거, PageHeader rightActions/leftAddon 통합 | `RosterManagementTab.tsx:243-366` + `HomeroomPage.tsx:31-36` | 6 탭 헤더 일관성 |
| 8 | **P0** | InputMode 1299줄 → `<StudentSelector>` `<CategoryChipGroup>` `<AttendanceOptions>` `<RightSidePanel>` 4개로 분해 | `InputMode.tsx` | 인지부하 + 회귀 위험 ↓ |
| 9 | **P1** | z-50 22건 → `z-sp-{modal,dropdown}` codemod | 8개 파일 | v3.2 z 토큰 정합 |
| 10 | **P1** | 카테고리 그룹 라벨 `text-xs font-bold uppercase tracking-wider mb-2` 추가 | `InputMode.tsx:675` | 시각 위계 회복 |

### Quick Win (1시간 이내)

- #1 (칩 rounded-full): 1줄 변경
- #2 (5열 격자): 2줄 변경
- #10 (그룹 라벨 weight): 1줄 변경
- #6 (저장 버튼 도움말 1줄 추가): 5줄 추가

위 4건만 적용해도 **디자인 레퍼런스 재현도 55 → 75** 즉시 상승 추정.

### 중기 라운드 (1-2 sprint)

- #3 (categoryColors.ts 통합) — 디자인 시스템 라운드 별도 (Modal P 종결 이후 컬러 라운드)
- #4 (7개 모달 마이그레이션) — Modal Q 라운드
- #8 (InputMode 분해) — 별도 Refactor PDCA

### 장기 비전

- 6 탭 헤더·CTA·카드·빈상태·필터를 모두 공용 컴포넌트로 추출 → 신규 탭(예: 평가, 상담 회의록) 추가 비용 ↓
- ConsultationCreateModal 1.4k줄 → stepper로 인지 부하 ↓
- 학생 격자 WAI-ARIA Grid 패턴 — 키보드 사용자 만족도 ↑

---

## 부록: 검증 코드 인용

### 카테고리 칩 디자인 vs 구현 (P0 #1)

**디자인 (code.html:193)**:
```html
<button class="px-4 py-2 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 text-sm font-medium transition-colors">생리결석</button>
```

**구현 (recordUtils.ts:139)**:
```ts
const base = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer select-none';
```

차이: `rounded-full` → `rounded-lg`, `border border-{c}-500/30` 누락, `text-sm` → `text-xs`, `px-4 py-2` → `px-3 py-1.5`.

### RECORD_COLOR_MAP 구조 위반 (P0 #3)

**현재 (useStudentRecordsStore.ts:14-73)**: 9색 × 4슬롯 = 36 raw Tailwind 클래스 매핑.

**SurveyTab.tsx:20-29**: 8색 × 3슬롯 = 24 raw. 이름만 다른 같은 매핑.

**PeriodChipGroup.tsx:14-47**: 4색 × 6슬롯 = 24 raw. 출결 강조용 별도.

→ 같은 의미 색 매핑이 3 곳에 분산. 디자인 변경 시 84개 클래스 동시 수정 필요.

### Raw 모달 7건 (P0 #4)

```bash
$ grep -l "fixed inset-0 z-50" src/adapters/components/Homeroom/**/*.tsx
- Assignment/AssignmentTab.tsx (line 282, 285)
- Consultation/ConsultationDetail.tsx (line 88)
- Consultation/ConsultationTab.tsx (line 82)
- Records/InputMode.tsx (line 943, 1242)
- RosterManagementTab.tsx (line 643, 719, 1021)
- Survey/SurveyStudentDetail.tsx (line 384, 524)
- Survey/SurveyTab.tsx (line 96)
```

이 중 어느 하나도 focus-trap-react 미사용. role=dialog 미선언. ESC 처리 없음.

### 헤더 자체 보유 패턴 (P0 #7)

**HomeroomPage.tsx:31-36**: PageHeader 사용 — OK
**RosterManagementTab.tsx:243**:
```tsx
<header className="flex items-center justify-between pb-6">
  <div className="flex items-center gap-4">
    <div className="bg-sp-accent/20 p-2 rounded-lg text-sp-accent">
      <span className="material-symbols-outlined">groups</span>
    </div>
    <div>
      <h2 className="text-xl font-bold text-sp-text tracking-tight">명렬 관리</h2>
      ...
```
→ 페이지 하나에 헤더 2개. 이미 PageHeader가 "담임 업무" 표시 중. UI 위계 충돌.
