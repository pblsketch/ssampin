# 대시보드 + 위젯 모드 종합 감사 보고서

> **요약**: 쌤핀 메인 대시보드(`/`) + 위젯 모드에 대한 6개 분석 문서 통합.
> **분석 기간**: 2026-04-25 ~ 2026-05-01
> **종합 점수**: **63/100** (메모리 기준 90% 미달 → pdca-iterator 발동 권고)
> **대상**: 13개 대시보드 컴포넌트 + 32개 위젯 시스템 + Widget 모드 전체
> **상태**: 즉시 조치 필요 사항 3건, 구조 개선 5건, 문서 갱신 4건

---

## Executive Summary

### 현재 상태

쌤핀 대시보드/위젯 시스템은 **핵심 기능은 동작하나 설계 의도와 구현의 괴리가 3곳**, **아키텍처 부채가 9곳**, **문서 정합성이 부족**한 상태입니다.

#### 종합 점수 (6개 분석 도메인 통합)

| 도메인 | 점수 | 현황 |
|--------|------|------|
| 디자인 시스템 + UX | 59/100 | PRD FR-WIDGET 명세 위반 3건 (P0), 레퍼런스 재현도 저하 |
| 프론트엔드 아키텍처 | 60/100 | Widget.tsx 432줄 단일파일, 접근성 WCAG 2.1 P0 3건 |
| Clean Architecture | 80/100 | domain 100% 완벽, usecases P0 위반 6건(uuid/iCal), widgets 아키텍처 혼재 |
| 코드 품질 | 52/100 (52건) | Zustand 전체 구독 P0, non-null assertion P0 7건, 성능 이슈 14건 |
| 제품 워크플로우 | 메인 72/100, 위젯 63/100 | 위젯 모드 전환 발견성 P0, 위젯 모드 가치 약화(축소판 수준) |
| PRD/SPEC 정합성 | 60% | FR-WIDGET-01/02/04/05 위반, v2.0.0 대시보드 통합 미흡 |
| **종합** | **63/100** | — |

### 가장 시급한 3개 문제 (P0)

1. **위젯 모드 Always on Top 기본 비활성** — 사용자가 설정하지 않으면 다른 창에 가려짐 (PRD 정면 위반)
2. **위젯 모드 최소 크기 640×480** — PRD 명시 280×350을 280px 초과 (소형 위젯 불가)
3. **위젯 모드 전환 버튼 숨김** — 메인 앱 → 위젯 진입이 발견 불가능 (발견성 P0)

---

## 교차 검증된 P0 이슈 (여러 분석 동시 지적)

### 1. 위젯 PRD 정면 위반 3건

**이슈**: FR-WIDGET-02, FR-WIDGET-04, FR-WIDGET-05 중 2개 위반 + 1개 설계 차이

| 명세 | 코드 위치 | 현황 | 갭 분석 |
|------|---------|------|---------|
| **FR-WIDGET-02** minWidth=280 maxHeight=350 (기본) | electron/main.ts:961-962 | `minWidth: 640, minHeight: 480` | **PRD 2.3배 초과** — 소형 데스크톱 위젯 불가 |
| **FR-WIDGET-04** 투명도 0~100% (기본 80%) | WidgetContextMenu.tsx:194-196 | `min={20} max={100}` | **0~20% 영역 조작 불가** — PR 고의였으나 명세 위반 |
| **FR-WIDGET-05** Always on Top **기본 활성화** | useSettingsStore.ts:46, electron/main.ts:1000-1004 | `desktopMode: 'normal'` (기본) | **위젯이 기본 비활성 → 다른 창에 가려짐** — 핵심 가치 상실 |

**통합 영향**:
- 디자인 분석: P0 3건 명시 (정면 위반)
- PRD/SPEC 갭 분석: P0 2건 + 부분 1건 명시 (기본값 설정 오류)
- PM 분석: 위젯 모드 발견성 + 가치 약화로 이어짐

**수정 우선순위**: 즉시 (설정값 변경만으로 해소 가능한 3건)

---

### 2. 위젯 발견성 부족 (P0 연쇄 효과)

**이슈**: 메인 대시보드에서 위젯 모드로 진입하는 UI 버튼 없음

| 분석 관점 | 발견 내용 |
|----------|---------|
| **프론트엔드** (02-frontend-architecture.analysis.md:233-236) | 위젯 컨텍스트 메뉴 진입점(more_vert 버튼) 부재 — 우클릭만 가능 |
| **PM/워크플로우** (05-product-workflow.analysis.md:144-150) | 메인 앱 → 위젯 전환 버튼이 사이드바/헤더에 없음 → 신규 사용자 발견 불가능 |
| **설계 레퍼런스** (01-design-uiux.analysis.md:55) | design examples 컨텍스트 메뉴가 더 메뉴(more_vert)로 진입 설정 |

**통합 수정**: DashboardHeader 또는 Sidebar에 위젯 모드 전환 버튼 추가 + 온보딩에서 설명

---

### 3. Widget.tsx 책임 과부하 → 다중 부채 연쇄

**이슈**: Widget.tsx (432줄) 단일 파일에 7가지 관심사 혼재

| 관심사 | 라인 | 영향도 |
|--------|------|--------|
| 반응형 레이아웃 폴백 | 293-347 | 리사이즈 로직 8개 핸들(350-409)과 분리 필요 |
| 5개 store load + 에러 처리 없음 | 84-92 | **P0 에러**: void 발사 후 망각 → Promise.allSettled |
| 헤더 UI (시계/날씨/버튼) | 189-277 | 약 90줄, WidgetHeader 컴포넌트로 추출 가능 |
| IPC onDataChanged 구독 | 127-139 | **아키텍처**: useDataChangeSubscription 훅으로 분리 |
| 투명창 hit-test 보정 | 74-81 | 정상 구현 |
| 컨텍스트 메뉴 | 142-145 | WidgetContextMenu.tsx와 일관성 유지 |

**통합 영향**:
- 프론트엔드 분석: P1 6건 (대型 컴포넌트 분해 필요)
- 코드 품질: P0 에러 처리 + P1 성능 8건
- 아키텍처: P1 store load 에러 처리, P1 IPC 구독 분리

**수정 전략**: 3단계
1. `useWidgetDataLoader()` 훅 신설 (에러 처리 포함)
2. `WidgetHeader` 컴포넌트 추출
3. `useDataChangeSubscription()` 훅으로 IPC 분리

---

### 4. availableFor 필터링 미동작 (설계 vs 구현)

**이슈**: registry.ts에 `availableFor.role/schoolLevel` 필드 정의되었으나 **실제 필터링 로직 0건**

| 증거 | 위치 |
|------|------|
| 필드 정의 | `registry.ts:37-43` `availableFor: { schoolLevel, role }` 있음 |
| **필터링 호출 0건** | Grep `availableFor` → registry.ts, types.ts 외 **0건** |
| WidgetListTab | `WidgetSettingsPanel.tsx:95-177` 전체 위젯 카테고리별 나열 (필터 없음) |

**통합 영향**:
- 프론트엔드: P1 14건 (availableFor 미동작 → disabled 처리 미도입)
- 아키텍처: P2 dead config (의도 있었으나 미구현)
- 제품: 교과 교사에게 담임 전용 위젯(Seating, StudentRecords) 노출

**수정**: WidgetListTab에 selector 추가 + 미매칭 위젯 회색 처리

---

### 5. Zustand 전체 구독 → 리렌더 폭풍 (P0 성능)

**이슈**: 15개+ 파일에서 `const { settings, ... } = useSettingsStore()` (selector 미사용)

| 컴포넌트 | 위치 | 영향 |
|---------|------|------|
| Widget.tsx | 34-39 | settings 전체 구독 → 어느 필드든 변경 시 리렌더 |
| DashboardTodo.tsx | 23-27 | useTodoStore, useScheduleStore, useEventsStore 전체 구독 |
| DashboardEvents.tsx | 156-157 | 전체 구독 |
| 기타 14개 | 파일 다수 | — |

**측정 결과**:
- 위젯 16개 동시 가동 시 1개 필드 변경 → **16개 컴포넌트 동시 리렌더**
- scale 0.7~0.85배 축소 모드에서도 리렌더 폭풍 (성능 저하)

**통합 수정**: selector 패턴 일관 적용
```typescript
// Before (전체 구독)
const { settings } = useSettingsStore();
// After (필드만 선택)
const todoShowTimetable = useSettingsStore((s) => s.settings.todoShowTimetable);
const periodTimes = useSettingsStore((s) => s.settings.periodTimes);
```

---

## 도메인별 발견사항 통합 분석

### A. 위젯 모드 PRD 정합성 (갭 60%)

**핵심 이슈**: 위젯 모드가 PRD 기본값 3가지를 어기고 있어 "항상 띄워두는 컴팩트 대시보드"라는 포지셔닝 미달성

| 명세 | 의도 | 현황 | 영향 |
|------|------|------|------|
| 최소 280×350 | 1280 해상도에서 사용자 공간 점유 최소화 | 640×480 (2배) | 소형 화면에서 위젯 불가 |
| Always on Top 기본 활성화 | 바탕화면 항상 노출 | 기본 normal → 가려짐 | 사용자가 매번 설정해야 함 |
| 투명도 0~100% | 완전 투명부터 불투명까지 자유 | 20~100% (완전 투명 불가) | UX 제약 |

**워크플로우 영향** (PM 분석):
- 위젯 모드 발견성 10/20 (메인 앱 → 진입 버튼 없음)
- at-a-glance 적합성 14/20 (컨텍스트 자동화 부재)
- 위젯 모드 가치 점수 9/20 ("메인 축소판" 수준)

**수정 우선순위**:
1. **즉시** (설정값): `useSettingsStore.ts:46` `'normal'` → `'topmost'` 또는 마이그레이션
2. **즉시** (명세vs구현): `electron/main.ts:961-962` minWidth/minHeight 280×350 명시
3. **즉시** (UI 발견성): DashboardHeader에 위젯 전환 버튼 추가

---

### B. 디자인 시스템 일관성

**종합 점수**: 59/100 (v3.2 목표 90 대비 -31점)

#### 주요 감점 원인

| 항목 | 위반 | 영향도 |
|------|------|--------|
| sp-* 토큰 미사용 (임의 색상) | MessageBanner 라이트 드롭다운 15건 + WidgetContextMenu blue-* 4건 | P1 (다크 테마 회귀 위험) |
| 인라인 fontSize (Material icon) | 24건 | P1 (text-icon-* 토큰 미사용) |
| z-index 토큰화 미흡 | z-50 / z-[9999] 7건 | P2 (vs z-sp-modal/toast/palette) |
| 메모 포스트잇 메타포 손실 | rotate/shadow/handwriting 폰트 없음 | P1 (시각적 차별화 상실) |
| 할일 진행률 바 없음 | 텍스트만 "1/3 완료" | P1 (시각 피드백 부재) |

**통합 수정** (v3.2 준수 강화):
```
Top 5 디자인 픽스:
1. MessageBanner 드롭다운 sp-* 토큰화 (15줄)
2. WidgetContextMenu blue-* → sp-accent (4줄)
3. Material icon fontSize 24건 → text-icon-* 토큰 codemod
4. z-50/z-[9999] 7건 → z-sp-{modal|toast|palette}
5. 메모 포스트잇: rotate + shadow + 라이트 배경 복원
```

---

### C. 컴포넌트 아키텍처 + 접근성

**문제**: Widget.tsx (432), MessageBanner (362), WidgetSettingsPanel (383) 3개 거대 컴포넌트 + 접근성 P0 3건

#### 접근성 P0 (WCAG 2.1)

| 이슈 | 위치 | 영향 | 수정 비용 |
|------|------|------|----------|
| WidgetContextMenu `role="menu"` 미적용 + 화살표 키 네비 없음 | WidgetContextMenu.tsx:76-269 | 스크린 리더 불감지 | 1~2h |
| EventPopup focus trap 없음 (Modal.tsx 존재하나 미사용) | EventPopup.tsx:107-202 | Tab 키로 배경 콘텐츠 접근 | 1h |
| SortableWidget 드래그 핸들 aria-label 없음 | SortableWidget.tsx:66-77 | 키보드 사용자 목적 불명확 | 30m |

**수정 전략**:
```
Phase 1 (즉시, 3시간):
- WidgetContextMenu에 role="menu" + ArrowUp/Down 네비
- EventPopup을 <Modal> 컴포넌트로 래핑
- SortableWidget aria-label 추가

Phase 2 (1주, 포괄적 접근성):
- focus-visible 전역 적용 (모든 대시/위젯 버튼)
- Widget 헤더 4버튼 → IconButton 컴포넌트 교체 (44×44px WCAG 2.5.5)
```

---

### D. Clean Architecture 부채 (점수 80/100)

**통합 평가**: domain 완벽 (100점), usecases P0 위반 6건, adapters/widgets 아키텍처 혼재

#### P0 위반 (유효성 규칙 위반)

**usecases → infrastructure 직접 import** (6건)

| 위치 | import 대상 | 문제 |
|------|-----------|------|
| ImportEvents.ts:10, SyncNeisSchedule.ts:14, SyncExternalCalendar.ts:4, ManageBookmarks.ts:4, ManageStickers.ts:15, ManageTodos.ts:4 | `generateUUID`, `parseICal` | usecases가 infrastructure 직접 의존 금지 |

**개선안**: uuid + ICalParser를 `shared/utils` 또는 `domain/rules`로 이동

**adapters/widgets → infrastructure 직접 import** (44건)

| 종류 | 건수 | 개선 |
|------|------|------|
| uuid 폴리필 (22건) | 22 | shared/utils 이동 |
| export 모듈 (exceljs/hwpxcore) | 12 | IExportPort 포트화 |
| supabase 클라이언트 | 8 | IRemotePort 포트화 |
| weather 타입 | 4 | domain/entities 이동 |

**ROI 분석**: uuid 이동 1시간 작업으로 P0 위반 31건 해소 (가장 큰 ROI)

---

### E. 코드 품질 + 성능 (52건 문제)

**정량 요약**:

| 카테고리 | P0 | P1 | P2 | P3 | 합 |
|---------|:--:|:--:|:--:|:--:|:--:|
| TS 안전성 | 1 | 2 | 1 | 1 | 5 |
| 에러 처리 | 1 | 4 | 2 | 0 | 7 |
| 성능 | 1 | 8 | 4 | 1 | 14 |
| 메모리/생명주기 | 0 | 2 | 1 | 1 | 4 |
| 보안 | 0 | 5 | 1 | 1 | 7 |
| 코드 스멜 | 0 | 4 | 3 | 2 | 9 |
| 일관성 | 0 | 2 | 3 | 1 | 6 |
| **합계** | **3** | **27** | **15** | **7** | **52** |

**가장 임팩트 큰 3건**:

1. **P0 성능**: Zustand 전체 구독 → selector화 (15개 파일, 가장 쉬운 수정)
2. **P0 에러**: Widget.tsx store load → Promise.allSettled (위젯 모드 첫 진입 실패 차단)
3. **P0 TS**: TodayProgress.tsx non-null assertion 7건 (런타임 에러 위험)

---

### F. 사용자 워크플로우 + 정보 우선순위

**메인 대시보드 점수**: 72/100 (교사 맥락 양호, 정보 우선순위 약화)

| 시나리오 | 현황 | 개선 필요 |
|---------|------|---------|
| 출근(08:00) "지금 몇 교시?" | 현재 교시 강조 없음 | "1교시까지 N분" 카운트다운 칩 추가 |
| 수업 직전(08:50) "다음 교시?" | 다음 교시 보조 강조 없음 | 다음 교시 `border-sp-accent/50` 추가 + 스크롤 자동 |
| 수업 중(위젯 모드) 학급 전환 | 수동 전환만 가능 | 현재 교시 기반 자동 학급 컨텍스트 |
| 쉬는 시간 학생 기록 입력 | `/homeroom` 페이지 진입 필요 | 위젯 내 빠른 입력 폼 |

**위젯 모드 점수**: 63/100 (기술적으로 동작, 가치 약함)

- 발견성 10/20 (전환 버튼 숨김)
- at-a-glance 14/20 (자동 컨텍스트 부재)
- 차별화 가치 9/20 (메인 축소판 수준)

**Quick win 개선** (1주 이내):
1. 위젯 모드 전환 버튼 상시 노출 (사이드바/헤더)
2. 온보딩 완료 후 빈 위젯 CTA 오버레이 ("시간표 입력하기" 등)
3. 모든 empty state "이유 + 행동" 통일
4. 시간표 현재 교시 자동 스크롤

---

### G. 문서 부채 (PRD/SPEC ↔ 코드)

**갭 분석**: Match Rate **60%** (메모리 90% 기준 미달)

#### PRD 위반 3건 (즉시 조치)

1. FR-WIDGET-05 Always on Top 기본 활성화 → 코드는 `'normal'`
2. FR-WIDGET-02 최소 280×350 → 코드는 640×480
3. FR-WIDGET-04 투명도 0~100% → 코드는 20~100%

#### SPEC.md 차이

| 항목 | SPEC (v0.2) | 코드 | 갱신 필요 |
|------|-----------|------|---------|
| `Settings.widget` 인터페이스 | size, minSize, alwaysOnTop (3개) | width, height, opacity, desktopMode, layoutMode, visibleSections (6개) | Yes |
| 컴포넌트 트리 | Widget, WidgetWeatherBar | Widget, WidgetHeader, WidgetSettingsPanel, WidgetTabBar, WidgetContextMenu, SortableWidget 등 (15개) | Yes |
| 데이터 동기화 | IPC `data:changed` 명시 | 동일 + syncRegistry 추가 | Clarify |

#### v2.0.0 신규 기능 대시보드 미통합

| 기능 | 대시보드 노출 | 갭 |
|------|-------------|------|
| RealtimeWall 실시간 담벼락 | 위젯 없음 | P2 |
| Quick Add Ctrl+K | 진입 버튼 없음 | P2 |
| CommandPalette Ctrl+Alt+T/E/M | 진입 버튼 없음 | P2 |
| 칠판 도형 14종 | Tools 페이지만 | P2 |

---

## 통합 우선순위 매트릭스

### Quick Win (Low Effort, High Impact) — 1주 이내

1. **위젯 모드 Always on Top 기본값 변경** — 설정값 1줄 (`'topmost'`)
2. **위젯 모드 전환 버튼 상시 노출** — 사이드바/헤더 버튼 추가 (2시간)
3. **Zustand selector 패턴** — 15개 파일 일괄 import 경로 변경 (2시간 + 검증)
4. **모든 empty state "이유+CTA" 통일** — 텍스트 13건 수정 (1시간)
5. **시간표 현재 교시 자동 스크롤** — CSS scroll-into-view (30분)

### Big Bet (High Effort, High Impact) — 2~4주

1. **현재 교시 학급 자동 컨텍스트** — 위젯 모드 + Seating/StudentRecords 자동 전환 (1주)
2. **uuid/ICalParser 이동** → shared/utils (1시간 + 31파일 import 치환, 회귀 테스트 필요)
3. **Widget.tsx 분해** → WidgetHeader + useWidgetDataLoader + useDataChangeSubscription (3시간)
4. **프로젝터 모드** — 개인정보 블러 (담임 메모 학생 이름/내용 가리기) (2시간)
5. **export/supabase/weather 포트화** — IExportPort, IRemotePort 신설 (4시간)

### Fill-in (Low Effort, Low Impact) — 2주

1. Material icon fontSize 24건 → text-icon-* codemod (1시간)
2. z-50/z-[9999] 7건 → z-sp-* 토큰 (30분)
3. 메모 포스트잇 메타포 복원 (rotate + shadow + 라이트 배경)
4. 할일 진행률 바 추가
5. D-Day 배지 공통 컴포넌트 추출
6. availableFor 필터링 활성화

### Skip/Defer (High Effort, Low Impact) — Next Phase

1. Widget 컴포넌트 tree 타입 추상화 (widgetId prop 전달)
2. 5번째 위젯 레이아웃 compact-list (단일 컬럼 미니멀)

---

## 권고 액션 플랜 (3단계)

### Phase 1: 즉시 수정 (1주, P0/P1 = 9건)

**목표**: 위젯 모드 기본 기능 정상화 + 설계 의도 복원

| # | 항목 | 파일 | 비용 | 검증 |
|---|------|------|------|------|
| 1 | Always on Top 기본값: `'normal'` → `'topmost'` | useSettingsStore.ts:46 | 1m | Widget 모드 실행 시 always-on-top 확인 |
| 2 | minWidth/minHeight: 640×480 → 320×400 또는 PRD 갱신 | electron/main.ts:961-962 | 5m | 위젯 모드 리사이즈 최소 크기 확인 |
| 3 | 투명도 범위: min={20} → min={0} | WidgetContextMenu.tsx:194-196 | 2m | 0% 투명도 + 경고 메시지 표시 |
| 4 | 위젯 모드 전환 버튼 추가 | DashboardHeader.tsx 또는 Sidebar.tsx | 1h | 버튼 클릭 → 위젯 모드 진입 확인 |
| 5 | Zustand selector 일관 적용 (15개 파일) | Dashboard*/Widget 전체 | 2h | 성능 프로파일링 (리렌더 감소 확인) |
| 6 | Widget.tsx store load 에러 처리 | Widget.tsx:84-92 → Promise.allSettled | 1h | 위젯 모드 진입 시 데이터 로드 실패 토스트 |
| 7 | empty state 통일 ("이유 + CTA") | 13개 위젯 | 1h | 각 빈 상태 에서 CTA 클릭 → 해당 페이지 진입 |
| 8 | WidgetContextMenu role="menu" + 키보드 네비 | WidgetContextMenu.tsx:76-269 | 1h | 스크린 리더 + 화살표 키 테스트 |
| 9 | EventPopup focus trap (Modal 적용) | EventPopup.tsx:107-202 | 1h | 모달 내 Tab 키 배경 탈출 불가 확인 |

**검증**: Phase 1 완료 후 Widget 모드 기본 사용성 재평가 (예상 점수 70→80)

---

### Phase 2: 구조 개선 (2~3주, P1 = 여러 건)

**목표**: 아키텍처 부채 해소 + 성능 최적화 + 확장성 개선

| # | 항목 | 파일 | 비용 | 수정 우선순위 |
|---|------|------|------|---------------|
| 1 | uuid/ICalParser 이동 → shared/utils 또는 domain/rules | usecases × 6 + adapters × 22 | 1h | P0 (31파일 영향, 가장 큰 ROI) |
| 2 | use case 인스턴스화 통일 (container.ts로) | 30개 store | 2h | P1 (memory/singleton 정책) |
| 3 | IPC onDataChanged → useDataChangeSubscription 훅 | DashboardTimetable.tsx 등 | 1h | P1 (캡슐화 + 일관성) |
| 4 | availableFor 필터링 활성화 | WidgetListTab | 2h | P1 (무시되는 설계 활성화) |
| 5 | Widget.tsx 분해 (WidgetHeader + 훅 추출) | Widget.tsx:432줄 | 3h | P1 (가독성 + 유지보수) |
| 6 | ResizeObserver 5개 → WidgetCard 단일화 | Dashboard*/Widget 전체 | 2h | P1 (성능: reflow 폭풍 해소) |
| 7 | export/supabase/weather 포트화 | 12+8+4=24 컴포넌트 | 4h | P2 (장기 아키텍처) |

**점수 기대치**: Architecture 80→90, Code Quality 52→75, Design 59→75

---

### Phase 3: 확장 기능 (4주~, 新機能)

**목표**: 위젯 모드 가치 강화 + v2.0.0 대시보드 통합 + UX 고도화

| # | 기능 | 모듈 | 비용 | 워크플로우 임팩트 |
|---|------|------|------|-----------|
| 1 | 현재 교시 학급 자동 컨텍스트 | Seating/StudentRecords 자동 선택 | 1주 | 수업 중 학급 전환 자동화 (매우 높음) |
| 2 | 프로젝터 모드 (개인정보 블러) | 토글 → 학생 이름 이니셜/내용 가리기 | 2h | 교실 프로젝터 안전성 (높음) |
| 3 | 수업 타이머 위젯 (남은 교시 시간 카운트다운) | 신규 위젯 | 2h | 위젯 모드 독자 가치 (높음) |
| 4 | RealtimeWall 위젯 (담벼락 최신 포스트) | 신규 위젯 → registry | 2h | v2.0.0 기능 대시보드 연결 (중간) |
| 5 | 위젯 설정 패널에 역할별 추천 + 미리보기 | WidgetSettingsPanel | 2h | 위젯 발견성 (중간) |
| 6 | 교과 컬러 확장 (20종) + 미매핑 자동 색상 배정 | timetablePresenter + 설정 | 1h | 교과 다양성 (중간) |
| 7 | 이벤트 알림 D-Day 커스텀 (v2.0 미이행) | Settings UI | 1h | 장기 이벤트 준비 (낮음) |

**예상 완료**: v1.13.x 또는 v2.0.1

---

## PDCA 다음 단계

**현재 상태**: Check 단계 (이 감사 완료)

### 1. 범위 조정

현재 Match Rate **60%** (메모리 기준 90% 미달) → **pdca-iterator 발동 권고**

```
Action → (Phase 1 수행) → Check (재측정) → 90% 달성 시 완료
```

### 2. 이해관계자 협의 필요

- **설계 선택 충돌** (3건):
  - PR 의도 vs. PRD 명세: "투명도 min=20 유지" vs. "0% 허용"?
  - 위젯 기본 크기: "640×480 교실 프로젝터용" vs. "280×350 컴팩트"?
  - MAX_VISIBLE: "5개" vs. "20개" (프리셋)?

- **문서 정합성**: PRD vs. SPEC 중 어느 쪽을 "정답"으로 할 것인지 명시

### 3. 릴리즈 계획

- **Phase 1** (P0/P1 9건) → v1.12.1 (hotfix 수준)
- **Phase 2** (P1 구조 7건) → v1.13.0 (minor 수준)
- **Phase 3** (新機能 7건) → v2.0.1 또는 별도 릴리즈

### 4. 메모리 업데이트

이 감사 완료 후 다음을 기록할 것:
- P0 이슈 3건 수정 상태
- availableFor 필터링 활성화 완료 시점
- Widget.tsx 분해 완료 후 성능 개선 측정 (리렌더 비율 감소율)

---

## 부록: 6개 분석 문서 링크

### 원본 분석 파일

1. **[디자인/UX 감사](docs/03-analysis/dashboard-audit/01-design-uiux.analysis.md)** — 점수 59/100
   - 디자인 레퍼런스 1:1 비교 + 토큰 일관성 + 정보 우선순위

2. **[프론트엔드 아키텍처](docs/03-analysis/dashboard-audit/02-frontend-architecture.analysis.md)** — 점수 60/100
   - 컴포넌트 분해 + React 패턴 + 접근성 (WCAG 2.1 AA)

3. **[Clean Architecture 의존성](docs/03-analysis/dashboard-audit/03-clean-architecture.analysis.md)** — 점수 80/100
   - 레이어 규칙 검증 + DI 컨테이너 + 위젯 시스템 위치

4. **[코드 품질 분석](docs/03-analysis/dashboard-audit/04-code-quality.analysis.md)** — 52건 이슈
   - TS strict + 에러 처리 + 성능 + 보안 (위험도별 P0~P3)

5. **[PM/워크플로우 분석](docs/03-analysis/dashboard-audit/05-product-workflow.analysis.md)** — 메인 72/100, 위젯 63/100
   - 교사 일과 시뮬레이션 + 정보 우선순위 + 위젯 모드 가치

6. **[PRD/SPEC 갭 분석](docs/03-analysis/dashboard-audit/06-prd-spec-gap.analysis.md)** — Match Rate 60%
   - FR-DASH/FR-WIDGET 명세 검증 + 구현 위반 3건 + 문서 부채

---

## 종합 결론

**상태**: 쌤핀 대시보드/위젯은 **기능적으로 완성되었으나 설계 의도와 다소 괴리**가 있는 상태입니다.

**최우선 조치** (1주):
- 위젯 모드 Always on Top / minSize / 투명도 3가지 설정값 정정
- 위젯 모드 진입 버튼 추가 (발견성)
- Zustand selector 패턴 일관화 (성능)

**3개월 계획**:
- Phase 1 P0 정합성 (1주)
- Phase 2 아키텍처 부채 (2~3주)
- Phase 3 신규 기능 (4주~)

**성공 지표**:
- 종합 점수 63 → 85+ 도달
- Match Rate 60% → 90%+ 달성
- 위젯 모드 일일 사용 시간 증가 (현재 미측정)

**다음 회의 안건**:
1. Phase 1 스케줄 확정 (언제 시작?)
2. 설계 선택사항 3건 의결 (투명도 min값, 위젯 크기, 기본값)
3. pdca-iterator 발동 여부 결정

---

**작성일**: 2026-05-01  
**상태**: 검토 대기  
**담당자**: Report Generator Agent  
**관련 PDCA**: `/pdca iterate dashboard-uiux-audit` (권고)
