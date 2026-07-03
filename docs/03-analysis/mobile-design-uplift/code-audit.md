조사를 마쳤습니다. 아래는 `src/mobile` 프론트엔드 디자인 전수 분석 보고서입니다.

---

# 쌤핀 모바일 PWA — 프론트엔드 디자인 전수 분석

분석 대상: `src/mobile/` (React 18 + TS + Tailwind), 진입 CSS는 `src/index.css`(데스크톱 토큰) + `src/mobile/styles/mobile.css`(모바일 오버라이드) 둘 다 로드 (`src/mobile/main.tsx:7-8`).

## 1. 화면 인벤토리 (라우팅·탭 구조)

라우터 라이브러리 없이 `App.tsx`의 `useState` 기반 수동 탭 스위칭입니다 (`src/mobile/App.tsx:133-159`).

**하단 탭 4개** (`App.tsx:109-114`): 홈(home) · 학생(group) · 일정(calendar_month) · 더보기(more_horiz). 주석상 6→4개로 재편된 이력 존재(`App.tsx:469`, `NavMigrationCoachmark`).

**탭 내부 세그먼트 컨트롤 중첩** (`App.tsx:430-459`):

- 학생 탭 → 담임 / 수업 (`STUDENTS_SEGMENTS`, `App.tsx:116-119`) → `StudentsPage` / `ClassListPage`
- 일정 탭 → 일정 / 할 일 (`SCHEDULE_SEGMENTS`, `App.tsx:121-124`) → `SchedulePage` / `TodoPage`

**더보기 하위 페이지** (`renderMoreSub`, `App.tsx:362-383`): 메모(`MemoPage`), 쌤도구(`ToolsOverviewPage`), 설정(`SettingsPage`), 지인추천(`MobileShareModal`). 쌤도구는 9개 lazy 교실도구 레지스트리(`MORE_LAZY_TOOLS`, `App.tsx:69-83`) + 과제수합(`ToolAssignmentPage`) + 설문/체크리스트(`ToolSurveyPage`).

**전체화면 오버레이(탭바 숨김)**: 출결 체크(`AttendanceCheckPage`, `App.tsx:308-318`), 온보딩(`OnboardingFlow`, `App.tsx:273-287`), 로딩 스플래시(`App.tsx:289-305`).

핵심 UI 구성:

- **홈**(`TodayHub.tsx`): 날짜 헤더 + `HomeScheduleCarousel`(좌우 스와이프) + 2열 Bento Grid(`TodayHub.tsx:135`)로 우리반/수업 출결·날씨·급식 카드. 카드는 `CollapsibleCard` 접기/펴기.
- **일정**(`SchedulePage.tsx`): 미니 달력(`glass-card`) + 일정 리스트 + 바텀시트 추가 모달.
- **할일**(`TodoPage.tsx`): 할일/보관함 탭 + `TodoItem` 리스트.
- **학생**(`StudentsPage.tsx`): 좌석/명단 토글 + 학급 가로 스크롤 탭.
- **쌤도구**(`ToolsOverviewPage.tsx`): 교실도구 2열 그리드(이모지) + 관리도구 리스트.

## 2. 디자인 토큰 사용 실태

**`mobile.css` 요약** (224줄): Glassmorphism 시스템. `:root`/`.dark`에 sp-\* **색상** CSS 변수 재정의(`mobile.css:8-51`) — bg/surface/card/border/divider/subtle/accent/highlight/text/muted + 의미색(success/warning/error/info). 유틸 클래스: `.glass-card`(radius **20px**, `mobile.css:67`), `.glass-card-accent`, `.glass-tabbar`, `.glass-header`, `.glass-input`, `.mobile-bg`(그라데이션), `.tab-bar`, `.touch-target`(44px, `mobile.css:177`), `.pill-badge`, `.no-scrollbar`, `.pb-safe`/`.pt-safe`. keyframes: `sp-float`, `swipe-undo-progress`.

**sp-\* 토큰 정의 위치**: 색상은 `mobile.css`가 담당하되, **radius/shadow/weight/duration/ease 토큰은 `src/index.css`(데스크톱 파일)에만 정의**됨(`index.css:66-86`). `tailwind.config.js`가 `var(--sp-radius-*)` 등을 참조하므로(`tailwind.config.js:96-124`) 모바일은 index.css를 함께 import해야만 동작 — 모바일 전용 토큰 파일이 없어 데스크톱 파일에 결합됨.

**중요**: `tailwind.config.js:97-100`에 **"신규 코드에서 `rounded-sp-*` 사용 금지, Tailwind 기본 rounded-xl(12) 사용"** 정책 주석. 즉 sp-radius 토큰은 사실상 폐기 방향인데 여전히 정의·유지(기존 37파일). fontWeight도 `sp-medium(510)` 등 Pretendard Variable 축 토큰이 있으나 "신규만 opt-in"(`tailwind.config.js:88-95`).

**하드코딩/raw 팔레트 사용 빈도**:

- `text-gray-*`/`bg-white`/`bg-black`/`#hex`: **73건 / 26파일** (대표: `SchedulePage.tsx:22-44` COLOR_MAP 9색 raw, `MobileShareModal.tsx`, `RecordsSubTab.tsx` 5건).
- 컬러 팔레트(`text-red-400` 등 3자리): **76건 / 29파일** (대표: `ToolSurveyPage.tsx` 8건, `students/shared.ts` 5건, `More/SyncStatus.tsx` 5건, `priorityConfig.ts` 4건, `WeatherCard.tsx` 4건).

→ `design-system.md:25`의 **"하드코딩 HEX 금지 — 반드시 sp-\* 토큰 사용"** 규칙과 정면 배치. 특히 삭제 색이 `text-red-400`(raw, `ActionSheet.tsx:37`, `MemoPage.tsx:307`)과 `bg-sp-error`(토큰, `ConfirmDialog.tsx:52`)로 혼용.

## 3. 타이포그래피

**폰트 로드**(`index.html:8-30`): Noto Sans KR, Material Symbols Outlined, Pretendard Variable(dynamic subset), JetBrains Mono. Tailwind `fontFamily.display/body`는 **Pretendard Variable 우선**(`tailwind.config.js:84-85`). 그러나 `design-system.md:34`는 "기본 폰트 Noto Sans KR"로 기재 → **문서-구현 불일치**(문서가 구식). `index.html:33` splash는 `-apple-system` 시스템 폰트.

**폰트 스케일**: 커스텀 소형 스케일 정의 — `micro 8px`, `tiny 9px`, `caption 10px`, `detail 11px`(`tailwind.config.js:71-74`) + Material 아이콘용 `icon-xs~icon-xl`. text-xs/sm/base는 Tailwind 기본.

**12px 미만 텍스트 존재 — 있음(다수)**:

- 하단 탭 라벨 `text-tiny`(**9px**), `App.tsx:498`.
- `text-tiny/detail` 계열 16건/5파일(`AttendanceSummaryCard`, `WeeklyTimetableCard`, `SeatingView`, `TeachingSeatingView`).
- `text-[10px]` (`AttendanceCheckPage.tsx:534`), `text-[11px]` (`SurveyDetail.tsx:126-127`).
- 8px `micro` 토큰까지 정의되어 있어 초소형 텍스트가 의도적으로 열려 있음 → 가독성/접근성 위험.

## 4. 컴포넌트 일관성

**공용 컴포넌트**(`components/common/`) 7종: `ActionSheet`(편집/삭제/취소 바텀시트), `CollapsibleCard`(홈 카드 접기), `ConfirmDialog`(파괴적 동작 확인 모달), `EmptyState`(아이콘+문구+버튼), `SegmentedControl`(iOS pill 토글), `Spinner`(progress_activity 회전), `Toggle`(role=switch 스위치).

**공용화 vs 중복**:

- `Spinner`/`EmptyState`는 존재하나 **채택률 낮음**. TodoPage는 로딩을 `<p>불러오는 중...</p>`(`TodoPage.tsx:104`), 빈 상태도 인라인(`TodoPage.tsx:108-111`, `126-131`)으로 자체 구현 — `EmptyState`/`Spinner` 미사용. SchedulePage도 빈 상태 인라인(`SchedulePage.tsx:305-308`).
- 모달이 컴포넌트로 통일되지 않음: MemoPage는 `AddModal`/`EditModal`을 **파일 내부에 중복 정의**(`MemoPage.tsx:55-214`, 두 모달이 색상선택 블록까지 거의 동일). SchedulePage 추가 모달도 인라인(`SchedulePage.tsx:346-448`).

**radius/shadow/spacing 일관성 문제**:

- `.glass-card`는 CSS에서 **20px**(`mobile.css:67`)인데, 사용처에서 `rounded-xl`(12px)로 덮어씀: `ToolsOverviewPage.tsx:39` `"rounded-xl glass-card"`, `MorePage.tsx:32`. → 같은 glass-card가 화면마다 20px/12px로 달라짐. `design-system.md:42`는 카드 12px 명시 → 3중 불일치.
- 모달 셸: `ConfirmDialog`는 `bg-sp-card rounded-2xl`(`ConfirmDialog.tsx:37`), `ActionSheet`는 `bg-sp-card rounded-t-2xl`(`ActionSheet.tsx:21`), MemoPage/SchedulePage 모달은 `glass-card rounded-t-2xl` — **불투명 카드 vs glass 혼용**.
- 버튼 radius: `rounded-xl`(EmptyState), `rounded-lg`(ConfirmDialog), `rounded-md`(SegmentedControl) 혼재.

## 5. 내비게이션

- **하단 탭 4개** — 위 1항 참조. 활성 탭 `bg-sp-accent/12 text-sp-accent`(`App.tsx:492`), `aria-current` 처리(`App.tsx:487`).
- **헤더 패턴 2종 공존(불일치)**: (a) `glass-header ... px-4 py-3`(MemoPage/ClassDetail/ClassList/Settings/Students/Todo), (b) `border-b border-sp-border/30`(ToolsOverview `:23`, ToolAssignment `:33`, ToolSurvey `:52`, SurveyDetail `:63`) — glass 효과 없는 평면 헤더. 앱 최상단 헤더는 또 별도 `glass-header` 인라인 style 높이(`App.tsx:391-393`). `docs/계획_페이지헤더-통일.md` 문서 존재가 **인지된 부채**임을 방증.
- **뒤로가기**: 라우터 없음 → `onBack` prop 콜백 방식. 버튼 스타일 제각각 — MemoPage `arrow_back w-10 h-10`(`MemoPage.tsx:261`), ToolsOverview `arrow_back text-sp-muted`(크기 미지정, `ToolsOverviewPage.tsx:24`). 하드웨어 back/스와이프 back 미지원(브라우저 기본 의존).
- **Safe-area 처리 — 양호**: 헤더 `paddingTop: env(safe-area-inset-top)`(`App.tsx:393`), 탭바 `--tab-bar-height: calc(56px + env(safe-area-inset-bottom))`(`mobile.css:28`), 바텀시트 `pb-[env(safe-area-inset-bottom)]`(`ActionSheet.tsx:21`, `QuickAddFab.tsx:58`), `.pt-safe/.pb-safe` 유틸(`mobile.css:202-208`).

## 6. 인터랙션 / 모션

- **터치 피드백 양호**: `active:scale-95`/`active:scale-[0.98]` **81건 / 39파일**. 탭바(`App.tsx:488`), FAB(`QuickAddFab.tsx:45`) 등 광범위.
- **애니메이션**: tailwind에 slideInRight/fadeIn/scaleIn/slideUp + 마스코트(pinIdle/pinHoverBounce/pinBubblePop/fabJiggle) keyframes(`tailwind.config.js:134-189`). mobile.css에 `sp-float`, `swipe-undo-progress`.
- **prefers-reduced-motion**: `sp-float`에만 적용(`mobile.css:111-115`). 나머지 애니메이션/`active:scale`/캐러셀은 reduced-motion 미대응.
- **햅틱 — 심각한 저활용**: `utils/haptic.ts` 존재하나 호출 3파일뿐(`useLongPress`, `SwipeRow`, 자기 자신). 탭 전환·버튼·토글·출결 체크 등 주요 인터랙션에 햅틱 없음. iOS Safari는 `navigator.vibrate` 미지원이라 iOS에서 완전 무효.
- **로딩/스켈레톤/빈 상태**: 스켈레톤은 `WeatherCard`의 `animate-pulse` **단 1곳**. 나머지는 `progress_activity` 스피너 또는 텍스트. 빈 상태 컴포넌트(`EmptyState`) 있으나 미채택 화면 다수(4항 참조).

## 7. 접근성

- **aria-label**: 44건 / 24파일 — 세그먼트/토글/FAB/CollapsibleCard 등 핵심은 커버. 그러나 아이콘 전용 버튼 일부 누락: 앱 헤더 계정변경 버튼은 `title`만 있고 `aria-label` 없음(`App.tsx:398-406`), 로그아웃/ToolsOverview 뒤로가기 버튼 라벨 없음.
- **터치 타깃 의심**: 앱 헤더 아이콘 버튼이 `text-xs` + `text-icon-sm`(14px)로 최소 크기 지정 없음(`App.tsx:398-413`) → 44px 미만 추정. MemoPage 삭제 `w-8 h-8`(32px, `MemoPage.tsx:307`), CollapsibleCard 토글 `w-7 h-7`(28px, `CollapsibleCard.tsx:67`), 색상 도트 `w-7 h-7`. `.touch-target`(44px) 유틸이 있으나 거의 미사용. 다만 리스트/모달 버튼은 `min-h-[44px]`/`min-h-[52px]`/`min-h-[56px]` 잘 지킴(`SegmentedControl.tsx:42`, `ActionSheet.tsx:30`, `ConfirmDialog.tsx:47`).
- **색상 대비 의심**: `text-gray-400` 직접 사용 2곳(`ToolSurveyPage.tsx:129`, `ToolAssignmentPage.tsx:198`) — 밝은 배경에서 대비 미달 가능. 초소형 텍스트+`text-sp-muted`(라이트 #64748b) 조합, `text-red-300/70`(`SurveyDetail.tsx:126`) 등 반투명 텍스트 대비 위험.

## 8. 다크모드

**완전 지원**. `index.html:2`가 `class="dark"` 기본, `App.tsx:167-201` `applyTheme`로 system/light/dark 3-way(localStorage `ssampin-mobile-theme`) + `prefers-color-scheme` 리스너 + `theme-changed` 이벤트. `mobile.css:33-51` `.dark` sp-\* 오버라이드(의미색을 다크에서 밝게 조정), 모든 glass 클래스에 `.dark` 변형, date/time 위젯 `color-scheme: dark`(`mobile.css:54-58`). 다크 우선 설계.

## 9. 디자인 부채 냄새

- **이모지 아이콘 남용(Material Symbols와 혼용)**: 쌤도구 11개가 이모지(🚦🎲🪙📊⏱️🤫🎯🔗👥🧮, `ToolsOverviewPage.tsx:2-12`), 섹션 헤더 🏫📋(`:33,51`), 할일 우선순위 🟡🟢(`priorityConfig.ts:9-10`), 온보딩 👋📋🏫(`OnboardingFlow.tsx:20,25,167`), InstallGuide 📲, SyncStatus 💡, ErrorBoundary 😢, ShareModal 👉. → 앱 전반은 Material Symbols인데 특정 화면만 이모지 → OS/폰트별 렌더 편차·톤 불일치.
- **인라인 style 남용**: `style={{}}` 53건 / 26파일. `ErrorBoundary.tsx`(6건, `fontSize:'48px'` 등 하드코딩), `CurrentClassCard.tsx`(6건), `ActionSheet`/`ConfirmDialog`의 `minHeight` 인라인, `App.tsx:393` 헤더 높이 인라인.
- **같은 목적·다른 스타일 사례**:
  - 삭제 색: raw `text-red-400`(ActionSheet) vs 토큰 `bg-sp-error`(ConfirmDialog).
  - 헤더: glass-header vs `border-sp-border/30` 평면(5항).
  - 로딩: `Spinner` 컴포넌트 vs 인라인 텍스트(TodoPage).
  - 빈 상태: `EmptyState` 컴포넌트 vs 인라인(TodoPage/SchedulePage).
  - 카드 radius: glass-card 20px vs rounded-xl 12px 덮어쓰기.
- **폐기 예정 토큰 잔존**: `rounded-sp-*`, `sp-weight-*`, `z-sp-*` 등 "신규 사용 금지"인데 유지(`tailwind.config.js:97,88,125`) → 신구 규칙 혼재.

---

## 데스크톱 디자인 시스템 요약 & 모바일 정합성 평가

**`docs/design-system.md` 핵심**: 색 토큰명 `--sp-*`(bg/surface/card/border/accent=파랑 #3b82f6/highlight=앰버 #f59e0b/text/muted), **다크 기본값 명시**(sp-bg #0a0e17 등). 폰트 "Noto Sans KR". 카드 `rounded-xl`(12px), 4px 그리드. **"하드코딩 HEX 금지"**. 과목별 컬러코드(국어=yellow…). `design examples/` 폴더에 Google Stitch 생성 UI 14세트(각 `code.html`+`screen.png`: main_dashboard, weekly_timetable, seating_chart, schedule_management, memo/notes, app_settings, event_alert_popup, compact_widget, onboarding 4단계 등) — **데스크톱/위젯 중심, 다크·글래스 무드**.

**모바일 정합성**:

- ✅ **토큰 이름 계승**: `sp-accent/highlight/text/muted` 등 동일 네이밍 유지, 과목색 safelist(`tailwind.config.js:14-30`) 일치.
- ✅ **무드(글래스·다크)**: mobile.css의 glassmorphism이 예시 무드와 부합.
- ⚠️ **폰트 어긋남**: 문서 Noto Sans KR ↔ 모바일 Pretendard Variable 우선.
- ⚠️ **색상 값 재정의**: 데스크톱은 다크 기본(#0a0e17), 모바일은 라이트 기본값으로 sp-\*를 재정의(`mobile.css:8-30`, bg #f1f5f9) — 접근성 4.5:1 목적의 의도적 분기지만 단일 소스가 아님.
- ❌ **"하드코딩 HEX 금지" 규칙 위반**: raw 팔레트 149건(2항). 문서 규범 대비 최대 이탈점.
- ❌ **카드 radius 규범(12px) 위반**: glass-card 20px.

---

## 전문 디자이너가 지적할 것 (심각도별)

**[상]**

1. **raw Tailwind 팔레트 149건 사용** — sp-\* 토큰 규범 붕괴, 다크모드에서 색 어긋남 위험. (`SchedulePage.tsx:22-44`, `ToolSurveyPage`, `students/shared.ts` 등 / 근거 2항)
2. **9px 탭 라벨 + 8~11px 초소형 텍스트 상시화** — 모바일 최소 가독 기준 미달. (`App.tsx:498` text-tiny=9px, `tailwind.config.js:71-74` micro 8px, `AttendanceCheckPage.tsx:534`)
3. **터치 타깃 44px 미만 아이콘 버튼** — 헤더 계정/로그아웃, 28~32px 토글·삭제. (`App.tsx:398-413`, `CollapsibleCard.tsx:67`, `MemoPage.tsx:307`)
4. **헤더/모달/카드 스타일 다중 표준 공존** — glass vs 평면 헤더, glass-card 20px vs rounded-xl 12px, glass vs bg-sp-card 모달. (5·4항, `docs/계획_페이지헤더-통일.md`가 부채 인지)

**[중]** 5. **이모지 아이콘과 Material Symbols 혼용** — 톤·크로스플랫폼 렌더 불일치. (`ToolsOverviewPage.tsx:2-12`, `priorityConfig.ts`, `OnboardingFlow.tsx`) 6. **공용 컴포넌트 저채택**(Spinner/EmptyState 미사용, 모달 인라인 중복) — 일관성·유지보수 저하. (`TodoPage.tsx:104-131`, `MemoPage.tsx:55-214`) 7. **삭제=위험 색의 raw/토큰 혼용** — 시맨틱 컬러 신뢰성 저하. (`ActionSheet.tsx:37` vs `ConfirmDialog.tsx:52`) 8. **prefers-reduced-motion 부분 대응** — sp-float 외 애니메이션/scale 미대응. (`mobile.css:111`) 9. **text-gray-400 저대비 텍스트** — WCAG 대비 미달 가능. (`ToolSurveyPage.tsx:129`, `ToolAssignmentPage.tsx:198`)

**[하]** 10. **햅틱 유틸 존재하나 3곳만 사용** — 촉각 피드백 일관성 부재(+iOS 무효). (`utils/haptic.ts`) 11. **스켈레톤 로딩 사실상 부재**(1곳) — 체감 성능. (`WeatherCard.tsx`) 12. **인라인 style 53건**(하드코딩 px 포함) — 토큰화 여지. (`ErrorBoundary.tsx`, `App.tsx:393`) 13. **문서-구현 불일치**(폰트 Noto vs Pretendard) 및 폐기예정 토큰 잔존 — 문서 신뢰성. (`design-system.md:34`, `tailwind.config.js:97`) 14. **라우터 부재로 back/딥링크 UX 제약** — 하드웨어 뒤로가기 미지원. (`App.tsx` 상태기반 네비)

---

分析을 완료했습니다. `src/mobile` 디렉토리 전수 분석 보고서를 위에 제출했습니다.

핵심 요약:

**구조**: 라우터 없는 4탭 구조(홈/학생/일정/더보기) + 세그먼트 컨트롤 중첩 + 더보기 하위에 메모/쌤도구(9 lazy 도구+과제수합+설문)/설정.

**가장 큰 디자인 부채 (심각도 상)**:

1. sp-\* 토큰 규범을 어긴 raw Tailwind 팔레트 149건(`design-system.md:25` "하드코딩 금지"와 정면 배치)
2. 9px 탭 라벨 등 8~11px 초소형 텍스트 상시화
3. 44px 미만 아이콘 버튼(헤더 계정/토글/삭제)
4. 헤더·모달·카드에 다중 스타일 표준 공존(glass-card 20px vs 문서 12px vs 코드 rounded-xl 12px 삼중 불일치)

**정합성**: 모바일은 데스크톱 디자인 시스템의 토큰명(sp-accent 등)·글래스/다크 무드는 계승했으나, 폰트(Pretendard vs 문서 Noto), 색상 값 재정의, "하드코딩 금지" 규칙, 카드 radius 규범에서 이탈.

**의외의 발견**: 햅틱 유틸이 있지만 3곳만 사용(iOS는 무효), 스켈레톤 로딩은 WeatherCard 1곳뿐, `docs/계획_페이지헤더-통일.md` 문서 존재 자체가 헤더 불일치가 이미 인지된 부채임을 방증합니다.

모든 지적은 파일:라인 근거와 함께 본문에 정리했습니다.

---

# 쌤핀 모바일 PWA — 프론트엔드 디자인 전수 분석 보고서

분석 대상: `src/mobile/` (React 18 + TypeScript + Tailwind). 진입 CSS는 `src/index.css`(데스크톱 토큰) + `src/mobile/styles/mobile.css`(모바일 오버라이드)를 모두 로드 (`src/mobile/main.tsx:7-8`). 라우터 라이브러리 없이 `App.tsx`의 `useState` 기반 수동 탭 스위칭.

---

## 1. 화면 인벤토리 (라우팅·탭 구조)

**하단 탭 4개** (`App.tsx:109-114`): 홈(home) · 학생(group) · 일정(calendar_month) · 더보기(more_horiz). 6→4개 재편 이력 존재 (`App.tsx:469`, `NavMigrationCoachmark`).

**탭 내부 세그먼트 컨트롤 중첩** (`App.tsx:430-459`):

- 학생 탭 → 담임 / 수업 (`App.tsx:116-119`) → `StudentsPage` / `ClassListPage`
- 일정 탭 → 일정 / 할 일 (`App.tsx:121-124`) → `SchedulePage` / `TodoPage`

**더보기 하위 페이지** (`renderMoreSub`, `App.tsx:362-383`): 메모(`MemoPage`), 쌤도구(`ToolsOverviewPage`), 설정(`SettingsPage`), 지인추천(`MobileShareModal`). 쌤도구는 9개 lazy 교실도구 레지스트리(`MORE_LAZY_TOOLS`, `App.tsx:69-83`) + 과제수합(`ToolAssignmentPage`) + 설문/체크리스트(`ToolSurveyPage`).

**전체화면 오버레이(탭바 숨김)**: 출결 체크(`App.tsx:308-318`), 온보딩(`App.tsx:273-287`), 로딩 스플래시(`App.tsx:289-305`).

각 페이지 핵심 UI:

- **홈**(`TodayHub.tsx`): 날짜 헤더 + `HomeScheduleCarousel`(좌우 스와이프, `TodayHub.tsx:126-132`) + 2열 Bento Grid(`TodayHub.tsx:135`)에 우리반/수업 출결·날씨·급식 카드. 카드는 `CollapsibleCard`로 접기/펴기.
- **일정**(`SchedulePage.tsx`): 미니 달력(`glass-card`, `:213`) + 일정 리스트 + 바텀시트 추가 모달(`:346-448`).
- **할일**(`TodoPage.tsx`): 할일/보관함 탭(`:80-98`) + `TodoItem` 리스트.
- **학생**(`StudentsPage.tsx`): 좌석/명단 토글(`:276-325`) + 학급 가로 스크롤 탭(`:330-331`).
- **메모**(`MemoPage.tsx`): 헤더 + 카드 리스트 + Add/Edit 모달(내부 정의).
- **더보기**(`MorePage.tsx`): `MenuItem` 리스트(메모/쌤도구/설정/추천) + 동기화 상태 + 버전.
- **쌤도구**(`ToolsOverviewPage.tsx`): 교실도구 2열 그리드(이모지) + 관리도구 리스트.

---

## 2. 디자인 토큰 사용 실태

**`mobile.css` 요약** (224줄): Glassmorphism 시스템.

- `:root`/`.dark`에 sp-\* **색상** CSS 변수 재정의 (`mobile.css:8-51`): bg/surface/card/border/divider/subtle/accent(#3b82f6)/highlight(#f59e0b)/text/muted + 의미색(success/warning/error/info).
- 유틸 클래스: `.glass-card`(radius **20px**, `:67`), `.glass-card-accent`, `.glass-tabbar`, `.glass-header`, `.glass-input`, `.mobile-bg`(그라데이션), `.tab-bar`, `.touch-target`(44px, `:177`), `.pill-badge`, `.no-scrollbar`, `.pb-safe`/`.pt-safe`.
- keyframes: `sp-float`(`:99`), `swipe-undo-progress`(`:211`).

**sp-\* 토큰 정의 위치**: 색상은 `mobile.css`가 담당하나, **radius/shadow/weight/duration/ease 토큰은 데스크톱 파일 `src/index.css`에만 정의**(`index.css:66-86`). `tailwind.config.js`가 `var(--sp-radius-*)` 등을 참조(`tailwind.config.js:96-124`)하므로 모바일은 index.css를 함께 import해야만 동작 — 모바일 전용 토큰 파일 부재로 데스크톱 파일에 결합.

**중요**: `tailwind.config.js:97-100`에 **"신규 코드에서 `rounded-sp-*` 사용 금지, Tailwind 기본 rounded-xl(12) 사용"** 정책 주석. sp-radius 토큰은 폐기 방향인데 기존 37파일 때문에 유지. fontWeight `sp-medium(510)` 등도 "신규만 opt-in"(`tailwind.config.js:88-95`).

**하드코딩/raw 팔레트 사용 빈도**:

- `text-gray-*`/`bg-white`/`bg-black`/`#hex`: **73건 / 26파일** (대표: `SchedulePage.tsx:22-44` COLOR_MAP 9색 raw, `MobileShareModal.tsx` 5건, `RecordsSubTab.tsx` 5건).
- 컬러 팔레트(`text-red-400` 등 3자리): **76건 / 29파일** (대표: `ToolSurveyPage.tsx` 8건, `students/shared.ts` 5건, `More/SyncStatus.tsx` 5건, `priorityConfig.ts` 4건, `WeatherCard.tsx` 4건).

→ `design-system.md:25`의 **"하드코딩 HEX 금지 — 반드시 sp-\* 토큰 사용"**과 정면 배치. 삭제 색이 `text-red-400`(raw, `ActionSheet.tsx:37`, `MemoPage.tsx:307`)과 `bg-sp-error`(토큰, `ConfirmDialog.tsx:52`)로 혼용.

---

## 3. 타이포그래피

**폰트 로드**(`index.html:8-30`): Noto Sans KR, Material Symbols Outlined, Pretendard Variable(dynamic subset), JetBrains Mono. Tailwind `fontFamily.display/body`는 **Pretendard Variable 우선**(`tailwind.config.js:84-85`). 그러나 `design-system.md:34`는 "기본 폰트 Noto Sans KR" 기재 → **문서-구현 불일치**(문서 구식). splash는 시스템 폰트 `-apple-system`(`index.html:57`).

**폰트 스케일 실태**: 커스텀 소형 스케일 — `micro 8px`, `tiny 9px`, `caption 10px`, `detail 11px`(`tailwind.config.js:71-74`) + Material 아이콘용 `icon-xs~icon-xl`. text-xs/sm/base/lg는 Tailwind 기본.

**12px 미만 텍스트 — 존재(다수)**:

- 하단 탭 라벨 `text-tiny`(**9px**), `App.tsx:498`.
- `text-tiny/detail` 계열 16건/5파일(`AttendanceSummaryCard`, `WeeklyTimetableCard`, `SeatingView`, `TeachingSeatingView`).
- `text-[10px]`(`AttendanceCheckPage.tsx:534`), `text-[11px]`(`SurveyDetail.tsx:126-127`).
- 8px `micro` 토큰까지 정의되어 초소형 텍스트가 구조적으로 열려 있음.

---

## 4. 컴포넌트 일관성

**공용 컴포넌트**(`components/common/`) 7종:

- `ActionSheet`(편집/삭제/취소 바텀시트), `CollapsibleCard`(홈 카드 접기), `ConfirmDialog`(파괴적 동작 확인 모달), `EmptyState`(아이콘+문구+버튼), `SegmentedControl`(iOS pill 토글), `Spinner`(progress_activity 회전), `Toggle`(role=switch 스위치).

**공용화 vs 중복**:

- `Spinner`/`EmptyState` **채택률 낮음**. TodoPage는 로딩을 `<p>불러오는 중...</p>`(`TodoPage.tsx:104`), 빈 상태도 인라인(`:108-111`, `:126-131`)으로 자체 구현. SchedulePage 빈 상태도 인라인(`SchedulePage.tsx:305-308`).
- 모달 미통일: MemoPage는 `AddModal`/`EditModal`을 **파일 내부에 중복 정의**(`MemoPage.tsx:55-214`, 두 모달 색상선택 블록까지 거의 동일). SchedulePage 추가 모달도 인라인(`:346-448`).

**radius/shadow/spacing 불일치**:

- `.glass-card`는 CSS에서 **20px**(`mobile.css:67`)인데 사용처에서 `rounded-xl`(12px)로 덮어씀: `ToolsOverviewPage.tsx:39` `"rounded-xl glass-card"`, `MorePage.tsx:32`. `design-system.md:42`는 카드 12px 명시 → **3중 불일치**.
- 모달 셸: `ConfirmDialog` `bg-sp-card rounded-2xl`(`:37`), `ActionSheet` `bg-sp-card rounded-t-2xl`(`:21`), MemoPage/SchedulePage 모달 `glass-card rounded-t-2xl` — **불투명 카드 vs glass 혼용**.
- 버튼 radius: `rounded-xl`(EmptyState)/`rounded-lg`(ConfirmDialog)/`rounded-md`(SegmentedControl) 혼재.

---

## 5. 내비게이션

- **하단 탭 4개** — 활성 `bg-sp-accent/12 text-sp-accent`(`App.tsx:492`), `aria-current` 처리(`App.tsx:487`).
- **헤더 패턴 2종 공존(불일치)**: (a) `glass-header ... px-4 py-3`(MemoPage`:259`/ClassDetail/ClassList/Settings/Students/Todo), (b) `border-b border-sp-border/30` 평면 헤더(ToolsOverview`:23`, ToolAssignment`:33`, ToolSurvey`:52`, SurveyDetail`:63`). 앱 최상단 헤더는 별도 `glass-header` + 인라인 style 높이(`App.tsx:391-393`). `docs/계획_페이지헤더-통일.md` 존재가 **인지된 부채** 방증.
- **뒤로가기**: 라우터 없음 → `onBack` prop 콜백. 버튼 스타일 제각각 — MemoPage `arrow_back w-10 h-10`(`:261`), ToolsOverview `arrow_back text-sp-muted`(크기 미지정, `:24`). 하드웨어 back/스와이프 back 미지원.
- **Safe-area — 양호**: 헤더 `paddingTop: env(safe-area-inset-top)`(`App.tsx:393`), 탭바 `calc(56px + env(safe-area-inset-bottom))`(`mobile.css:28`), 바텀시트 `pb-[env(safe-area-inset-bottom)]`(`ActionSheet.tsx:21`, `QuickAddFab.tsx:58`), `.pt-safe/.pb-safe` 유틸(`mobile.css:202-208`).

---

## 6. 인터랙션 / 모션

- **터치 피드백 양호**: `active:scale-95`/`active:scale-[0.98]` **81건 / 39파일**. 탭바(`App.tsx:488`), FAB(`QuickAddFab.tsx:45`) 등 광범위.
- **애니메이션**: tailwind에 slideInRight/fadeIn/scaleIn/slideUp + 마스코트(pinIdle/pinHoverBounce/pinBubblePop/fabJiggle) keyframes(`tailwind.config.js:134-189`). mobile.css `sp-float`, `swipe-undo-progress`.
- **prefers-reduced-motion**: `sp-float`에만 적용(`mobile.css:111-115`). 나머지 애니메이션/`active:scale`/캐러셀 미대응.
- **햅틱 — 심각한 저활용**: `utils/haptic.ts` 존재하나 호출 3파일뿐(`useLongPress`, `SwipeRow`, 자기 자신). 주요 인터랙션에 햅틱 없음. iOS Safari `navigator.vibrate` 미지원이라 iOS 무효(`haptic.ts:3`).
- **로딩/스켈레톤/빈 상태**: 스켈레톤은 `WeatherCard`의 `animate-pulse` **단 1곳**. 나머지는 `progress_activity` 스피너 또는 텍스트. `EmptyState` 컴포넌트 있으나 미채택 화면 다수(4항).

---

## 7. 접근성

- **aria-label**: 44건 / 24파일 — 세그먼트/토글/FAB/CollapsibleCard 등 핵심 커버. 그러나 아이콘 전용 버튼 일부 누락: 앱 헤더 계정변경 버튼 `title`만·`aria-label` 없음(`App.tsx:398-406`), 로그아웃/ToolsOverview 뒤로가기 라벨 없음.
- **터치 타깃 의심**: 앱 헤더 아이콘 버튼 `text-xs`+`text-icon-sm`(14px), 최소 크기 미지정(`App.tsx:398-413`) → 44px 미만 추정. MemoPage 삭제 `w-8 h-8`(32px, `:307`), CollapsibleCard 토글 `w-7 h-7`(28px, `:67`), 색상 도트 `w-7 h-7`. `.touch-target`(44px) 유틸 거의 미사용. 다만 리스트/모달 버튼은 `min-h-[44px]`/`[52px]`/`[56px]` 준수(`SegmentedControl.tsx:42`, `ActionSheet.tsx:30`, `ConfirmDialog.tsx:47`).
- **색상 대비 의심**: `text-gray-400` 직접 사용(`ToolSurveyPage.tsx:129`, `ToolAssignmentPage.tsx:198`), 반투명 `text-red-300/70`(`SurveyDetail.tsx:126`), 초소형+`text-sp-muted`(라이트 #64748b) 조합 대비 위험.

---

## 8. 다크모드

**완전 지원**. `index.html:2` `class="dark"` 기본. `App.tsx:167-201` `applyTheme`로 system/light/dark 3-way(localStorage `ssampin-mobile-theme`) + `prefers-color-scheme` 리스너 + `theme-changed` 이벤트. `mobile.css:33-51` `.dark` sp-\* 오버라이드(의미색 다크에서 밝게 조정), 모든 glass 클래스에 `.dark` 변형, date/time 위젯 `color-scheme: dark`(`mobile.css:54-58`). 다크 우선 설계.

---

## 9. 디자인 부채 냄새

- **이모지 아이콘 남용(Material Symbols와 혼용)**: 쌤도구 11개 이모지(🚦🎲🪙📊⏱️🤫🎯🔗👥🧮, `ToolsOverviewPage.tsx:2-12`), 섹션 헤더 🏫📋(`:33,51`), 할일 우선순위 🟡🟢(`priorityConfig.ts:9-10`), 온보딩 👋📋🏫(`OnboardingFlow.tsx:20,25,167`), InstallGuide 📲, SyncStatus 💡, ErrorBoundary 😢, ShareModal 👉. 앱 전반은 Material Symbols → 톤·크로스플랫폼 렌더 편차.
- **인라인 style 남용**: `style={{}}` 53건 / 26파일. `ErrorBoundary.tsx`(6건, `fontSize:'48px'`), `CurrentClassCard.tsx`(6건), `ActionSheet`/`ConfirmDialog` `minHeight` 인라인, `App.tsx:393` 헤더 높이 인라인.
- **같은 목적·다른 스타일**: 삭제 색 raw vs 토큰 / 헤더 glass vs 평면 / 로딩 Spinner vs 텍스트 / 빈 상태 EmptyState vs 인라인 / 카드 20px vs 12px.
- **폐기 예정 토큰 잔존**: `rounded-sp-*`, `sp-weight-*`, `z-sp-*` "신규 금지"인데 유지(`tailwind.config.js:97,88,125`).

---

## 데스크톱 디자인 시스템 요약 & 모바일 정합성

**`docs/design-system.md` 핵심**: 색 토큰명 `--sp-*`(bg/surface/card/border/accent=파랑 #3b82f6/highlight=앰버 #f59e0b/text/muted), **다크 기본값 명시**(sp-bg #0a0e17). 폰트 "Noto Sans KR". 카드 `rounded-xl`(12px), 4px 그리드. **"하드코딩 HEX 금지"**. 과목별 컬러(국어=yellow…). `design examples/` 폴더에 Google Stitch 생성 UI 14세트(각 `code.html`+`screen.png`: main_dashboard, weekly_timetable, seating_chart, schedule_management, memo/notes, app_settings, event_alert_popup, compact_widget, onboarding 4단계 등) — **데스크톱/위젯 중심, 다크·글래스 무드**.

**정합성 평가**:

- ✅ **토큰 이름 계승**: `sp-accent/highlight/text/muted` 동일, 과목색 safelist 일치(`tailwind.config.js:14-30`).
- ✅ **무드(글래스·다크)**: mobile.css glassmorphism이 예시 무드와 부합.
- ⚠️ **폰트 어긋남**: 문서 Noto Sans KR ↔ 모바일 Pretendard Variable 우선.
- ⚠️ **색상 값 재정의**: 데스크톱 다크 기본(#0a0e17) ↔ 모바일 라이트 기본(#f1f5f9, `mobile.css:9`) — 단일 소스 아님.
- ❌ **"하드코딩 HEX 금지" 위반**: raw 팔레트 149건.
- ❌ **카드 radius 규범(12px) 위반**: glass-card 20px.

---

## 전문 디자이너가 지적할 것 (심각도별)

### [상]

1. **raw Tailwind 팔레트 149건 사용** — sp-\* 토큰 규범 붕괴, 다크모드 색 어긋남 위험. (`SchedulePage.tsx:22-44`, `ToolSurveyPage`, `students/shared.ts` / 근거 2항)
2. **9px 탭 라벨 + 8~11px 초소형 텍스트 상시화** — 모바일 최소 가독 기준 미달. (`App.tsx:498`, `tailwind.config.js:71-74`, `AttendanceCheckPage.tsx:534`)
3. **터치 타깃 44px 미만 아이콘 버튼** — 헤더 계정/로그아웃, 28~32px 토글·삭제. (`App.tsx:398-413`, `CollapsibleCard.tsx:67`, `MemoPage.tsx:307`)
4. **헤더/모달/카드 다중 표준 공존** — glass vs 평면 헤더, glass-card 20px vs rounded-xl 12px, glass vs bg-sp-card 모달. (`docs/계획_페이지헤더-통일.md`가 부채 인지 / 근거 4·5항)

### [중]

5. **이모지 아이콘과 Material Symbols 혼용** — 톤·크로스플랫폼 렌더 불일치. (`ToolsOverviewPage.tsx:2-12`, `priorityConfig.ts`, `OnboardingFlow.tsx`)
6. **공용 컴포넌트 저채택**(Spinner/EmptyState 미사용, 모달 인라인 중복). (`TodoPage.tsx:104-131`, `MemoPage.tsx:55-214`)
7. **삭제=위험 색의 raw/토큰 혼용**. (`ActionSheet.tsx:37` vs `ConfirmDialog.tsx:52`)
8. **prefers-reduced-motion 부분 대응** — sp-float 외 미대응. (`mobile.css:111`)
9. **text-gray-400 저대비 텍스트** — WCAG 대비 미달 가능. (`ToolSurveyPage.tsx:129`, `ToolAssignmentPage.tsx:198`)

### [하]

10. **햅틱 유틸 3곳만 사용** — 촉각 피드백 일관성 부재(+iOS 무효). (`utils/haptic.ts`)
11. **스켈레톤 로딩 사실상 부재**(1곳). (`WeatherCard.tsx`)
12. **인라인 style 53건**(하드코딩 px 포함). (`ErrorBoundary.tsx`, `App.tsx:393`)
13. **문서-구현 불일치**(폰트) 및 폐기예정 토큰 잔존. (`design-system.md:34`, `tailwind.config.js:97`)
14. **라우터 부재로 back/딥링크 UX 제약**. (`App.tsx` 상태기반 네비)
