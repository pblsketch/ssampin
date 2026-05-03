# 담임 업무 페이지 통합 감사 리포트

> **분석 대상**: `src/adapters/components/Homeroom/` + 관련 도메인 (28개 파일, ~8,500 LOC)  
> **분석일**: 2026-05-01  
> **작성**: 통합 감사 위원회 (Design/FE Arch/Clean Arch/Code Quality/PM/GAP 6개 분석 동시 실행)  
> **종합 점수**: **현황 60점 → 목표 85점** (현재 상황의 심각도 인식 필요)

---

## 1. Executive Summary

### 현재 상태 한눈에

**담임 업무 페이지는 핵심 기능(출결·상담·기록)은 완성되었으나, 세 가지 영역에서 신뢰성과 확장성을 위협하는 부채가 누적된 상태입니다:**

1. **즉시 해소 필요 (P0)**: 9개 거대 컴포넌트 + 7개 인라인 모달 + 무테스트 도메인 + 수업반 탭 미구현
2. **중기 개선 (P1)**: 색상 매핑 중복(84건) + 의존성 규칙 위반(9건) + 접근성 미흡(aria/focus-trap)
3. **방향성 명확화**: PRD/SPEC 문서가 30% 이상 뒤처짐 (Survey/Assignment/Consultation은 미정의 도메인)

### 6개 분석의 종합 점수

| 분석 관점 | 점수 | 가중 | 비고 |
|:---|:---:|:---:|:---|
| 🎨 **디자인 시스템 v3.2** | 55.25/100 | 25% | 직각 칩·색상 매핑 부채 327건·z-50 raw 22건 |
| 🏗️ **프론트엔드 아키텍처** | 55/100 | 20% | 7개 모달 focus-trap 부재·Zustand 전체 구독·props drilling |
| 🧱 **Clean Architecture** | 73/100 | 20% | uuid/supabase 컴포넌트 직접 호출 9건·store 로직 누수 140줄 |
| 📊 **코드 품질** | 37건 (P0:6/P1:8/P2:12/P3:11) | 15% | 테스트 0개·에러 swallow·거대 컴포넌트 9건 |
| 👤 **사용자 가치** | 72/100 | 15% | 기록·상담·명렬은 우수·과제 오프라인 미지원·수업반 미구현 |
| 📋 **PRD/SPEC 정합** | 85% Match Rate | — | FR-STMEMO-10 수업반 탭 미구현 + SPEC 데이터 모델 60% 변경 |

**🔴 종합**: **현재 ~60점 (위기 상태) → 목표 85점 (안정)까지의 간격 좁혀야 함**

---

## 2. 교차 검증된 P0 이슈 (여러 분석 동시 지적)

### A. 모달 7개 + focus-trap·키보드 접근성 부재

**지적 분석**: 디자인(P0) + 프론트엔드(P0) + 코드품질(P0) = **3중 동시 지적**

| 파일 | 줄 | 문제 | 심각도 |
|:---|:---:|:---|:---:|
| `Records/InputMode.tsx` | 943, 1242 | batch-confirm, 메모 확대 인라인 모달 | P0 |
| `RosterManagementTab.tsx` | 643, 719, 1021 | 3개 모달(상태변경, wizard, 미리보기) | P0 |
| `Consultation/{Tab,Detail}.tsx` | 82, 88 | 모달 2개 | P0 |
| `Survey/{Tab,Detail}.tsx` | 96, 384, 524 | 3개 모달 | P0 |
| `AssignmentTab.tsx` | 282, 285 | 2개 delete confirm | P0 |

**근본 원인**: `fixed inset-0 z-50` 패턴으로 인라인 렌더. **focus-trap-react 미적용, ESC 미처리, body lock 미적용, role=dialog 미선언, aria-labelledby 미설정**.

**통합 수정 방향**:
- 공용 `<Modal>` 컴포넌트(`src/adapters/components/common/Modal.tsx`)를 이미 보유 중 (RecordsExportModal에서 사용 중)
- 7개 모달을 일괄 마이그레이션 → focus-trap, ESC, role=dialog 자동 획득
- **추정 작업량**: 7개 파일 × 30분 = 3.5시간 (Modal Q 라운드로 통합)

---

### B. 거대 컴포넌트 9건 + 인지 부하 폭증

**지적 분석**: 디자인(P0) + 프론트엔드(P0) + 코드품질(P0) + 아키텍처(스멜) = **4중 동시 지적**

| 파일 | LOC | 관심사 개수 | 분해 추천 |
|:---|---:|:---:|:---|
| `ConsultationCreateModal.tsx` | 1431 | 상담 생성 + 슬롯 계산 + 프리셋 + 시간 선택 | 3-step wizard |
| `Records/InputMode.tsx` | 1299 | 학생 선택(2) + 입력(4) + 우측 기록 조회(1) + 리사이즈 | 3 패널 추출 |
| `RosterManagementTab.tsx` | 1103 | 명렬표 + wizard + 모달 3개 + 미리보기 | 별도 컴포넌트 4개 |
| `ConsultationDetail.tsx` | 802 | 일정 조회 + 예약 목록 + 복호화 + 폴링 | 2 섹션 분리 |
| 나머지 5개 | 2,500 | — | — |

**통합 수정 방향**:
- **단기**: InputMode(1299) → StudentSelectorPanel(140) + RecordEntryPanel(290) + TodayRecordPanel(210) + hooks 3개(렌더 경계 설정)
- **중기**: ConsultationCreateModal(1431) → Step1/2/3 컴포넌트 분리 + `domain/rules/consultationSlotRules.ts` 이동
- **설계 이득**: 각 컴포넌트 리렌더 최소화 → 성능 + 테스트 격리 + 신규 개발자 온보딩

---

### C. adapters → infrastructure 직접 import 9건 (의존성 위반)

**지적 분석**: 프론트엔드(P0) + 아키텍처(P0) + 코드품질(선호도) = **3중 동시 지적**

**본 페이지 9건** (프로젝트 전체 11건 중):

| 파일 | import | 의도 |
|:---|:---|:---|
| `RosterManagementTab.tsx:10` | `ExcelExporter` | Excel 가져오기·내보내기 |
| `Consultation/{CreateModal,Detail}.tsx:8,16` | `ShortLinkClient`, `SlotPublic` 타입 | 상담 예약 관리 |
| `Survey/{CreateModal,Detail}.tsx:5,10,12` | `ShortLinkClient`, `hashPin`, `uuid`, `SurveySupabaseClient` | 설문 생성·암호화 |
| `Records/{RecordsExportModal,SearchMode}.tsx:11,17` | `ExcelExporter`, `HwpxExporter` | 내보내기 |

**근본 원인**: 
1. **타입 직접 import** (`SlotPublic`, `SurveyResponsePublic` = infrastructure supabase 타입) → domain entity 승격 필요
2. **유틸 직접 import** (`ExcelExporter`, `hashPin`, `uuid`) → DI 컨테이너 또는 use case 추상화 필요
3. **supabase 클라이언트 메서드 직접 호출** (컴포넌트에서 `surveySupabaseClient.createSurvey()` 호출) → store/use case 경유 필요

**통합 수정 방향**:
- **타입**: `Consultation.ts`, `Survey.ts`에 `SlotPublic`, `SurveyResponsePublic` 반입
- **유틸**: `uuid` → `src/shared/utils/uuid.ts` 이동 (31파일 일괄 codemod)
- **supabase 메서드**: use case 3~4개 추출 (`CreateRemoteSurvey`, `CreateConsultationSchedule`, `PollBookings` 등)

---

### D. RECORD_COLOR_MAP + 색상 매핑 84건 중복 (설계 부채)

**지적 분석**: 디자인(P0) + 프론트엔드(P0) + 아키텍처(P1) = **3중 동시 지적**

**위치별 분산**:
- `useStudentRecordsStore.ts:14-73` RECORD_COLOR_MAP: 9색 × 4슬롯 = 36 클래스
- `SurveyTab.tsx:20-29` COLOR_MAP: 8색 × 3슬롯 = 24 클래스
- `PeriodChipGroup.tsx:14-47` ACCENT_CLASSES: 4색 × 6슬롯 = 24 클래스
- **합계**: 84 tailwind 클래스 + `recordUtils.ts:155-169 getCategoryDotColor` 중복 정의

**근본 원인**: 단일 source 부재. 같은 의미의 색상(카테고리 = 설문 = 출결 강조)이 3곳에 분산.

**통합 수정 방향**:
- 신규 `src/adapters/presenters/recordCategoryPresenter.ts` 생성
- RECORD_COLOR_MAP 이동 + `getCategoryDotColor` 통합
- SurveyTab/PeriodChipGroup에서 presenter import 경유
- **P 라운드 통합 대안**: Tailwind v4 `@apply` 또는 CSS 변수로 sp-cat-* 시맨틱 토큰화 (단, 현재 v3.4 기준 arbitrary value로 회피)

---

### E. Zustand 전체 구독 패턴 22개 사용처 (성능 위험)

**지적 분석**: 프론트엔드(P0) + 코드품질(P0) = **2중 동시 지적**

**패턴**:
```tsx
// 현재 (선택자 미사용)
const { records, loaded, load, viewMode, setViewMode, categories } = useStudentRecordsStore();

// 개선안
const records = useStudentRecordsStore((s) => s.records);
const load = useStudentRecordsStore((s) => s.load);
```

**위험도**: 22개 사용처에서 store의 **어떤 필드가 변경되어도 리렌더** → 입력 1건마다 3~5개 컴포넌트가 불필요 리렌더 → 대시보드 audit과 동일 패턴이 담임 업무에서도 발견.

**통합 수정 방향**:
- 액션은 `useStore.getState().action()` 또는 `useStore(s => s.action)` (ref 고정)
- 데이터는 selector + `shallow` 추가: `useStudentRecordsStore((s) => ({ records: s.records, categories: s.categories }), shallow)`
- 도구: `zustand/shallow` import 사용 (이미 코드베이스에 존재)

---

### F. 수업반 탭(FR-STMEMO-10) 미구현 (PRD 핵심 요구사항)

**지적 분석**: PM(P0) + 갭 감지(P0) = **2중 동시 지적**

**PRD 원문**:
- PRD:284 `[담임] [1-1] [1-2] [1-3]...` 식 학급 탭바
- Design example (code.html L118~136) 학급 탭 명시
- 현재 코드: `HomeroomPage.tsx:30-46` — 학급 탭 자체가 없음

**현황**: 
- 담임반 기록만 표시 (단일 `useStudentStore` 학생)
- 수업반 관리는 별도 페이지 `ClassManagement/` (20개 파일)로 분리
- **PRD 의도**(담임 업무 내에서 학급 전환)와 구현(별도 페이지) 미일치

**통합 수정 방향** (Big Bet — v2.1.x):
- HomeroomPage 상단에 `[담임] [학급1] [학급2]...` 탭바 추가
- RecordsTab → 선택 학급의 학생·기록만 필터링
- useTeachingClassStore(이미 보유)의 출결부 동기화 로직 그대로 사용
- Settings.classes[] SPEC 이행 (중기)

---

## 3. 도메인별 발견사항

### A. PRD/문서 정합성 (갭 분석)

**Match Rate**: **85%** (FR-STMEMO 9/10 충족, 단 FR-10 수업반 탭 부재)

**미구현 요구사항**:
1. **FR-STMEMO-10**: 수업반 탭 (P0 — PRD 명시)
2. **상벌점 v2.0** (PRD:319): 미구현 (P3 — v2.0으로 명시했으므로 정상)

**과도 구현 (PRD에 없는데 구현)**:
- Survey, Assignment, Consultation: 3개 도메인 (2700+ 줄) — **PRD/SPEC 미정의**
- NEIS·Document·FollowUp·AttendancePeriods 추적: 실무 가치 높음 — **문서 역업데이트 필요**
- AttendancePeriodEntry(교시별 세부): SPEC 초과 (P0)

**권고**: 
- PRD/SPEC 문서 갱신 (Survey/Assignment/Consultation 추가 + 추적 필드 명시)
- 또는 별도 PRD 분리 (v2.0 신규 기능 정의)

---

### B. 디자인 시스템 일관성 (점수: 55.25/100)

**핵심 P0 위반**:
1. **칩 rounded-full 미적용** (`rounded-lg` 구현) — 디자인 핵심 시각 언어
2. **학생 격자 4열 고정** (`grid-cols-5 sm:` 미적용) — 30명 한눈에 미지원
3. **저장 버튼 위치·크기** (가운데 컬럼 내 sticky vs 페이지 풀폭) — Fitt's Law 위반
4. **색상 327건 raw tailwind** (sp-* 미사용) — v3.2 토큰 미준수

**통합 수정안**:
| 항목 | 수정 내용 | LOC | 예상 시간 |
|:---|:---|:---:|:---|
| 칩 rounded-full | `recordUtils.ts:140` 1줄 + border 추가 | 1 | 5분 |
| 5열 격자 | `InputMode.tsx:552` 1줄 + aspect 추가 | 2 | 10분 |
| 그룹 라벨 weight | `InputMode.tsx:675` uppercase/tracking 추가 | 1 | 5분 |
| 저장 버튼 | 위치 lift up (HomeroomPage 레벨) + 도움말 1줄 | 10 | 30분 |
| **색상 84건 통합** | presenter 추출 + codemod | — | P 라운드 (2시간 예정) |

**즉시 가능 Quick Win**: 칩·격자·라벨 3개 = 20분 안에 55→65점 상승

---

### C. 컴포넌트 아키텍처·접근성 (점수: 55/100)

**P0 접근성 위반**:
1. **tabpanel 연결 누락** (HomeroomTabBar) — WAI-ARIA Tabs Pattern 미준수
2. **aria-pressed 누락** (학생 격자, 출결 칩, 교시 칩) — WCAG 2.1 SC 4.1.2 위반
3. **role="gridcell" 미사용** (학생 격자) — WAI-ARIA Grid Pattern 미구현
4. **window.confirm 5건** — 비표준 UX (macOS/Linux OS-native 모달 이탈)

**통합 수정 방향**:
- `HomeroomTabBar` + `HomeroomPage` 동시 수정: aria-controls/aria-labelledby + 화살표 키 핸들러
- 버튼 5개 파일에 aria-pressed/role 추가 (각 1~3줄)
- window.confirm → 공용 `<ConfirmDialog>` 컴포넌트 생성 + 4건 교체

---

### D. Clean Architecture 부채 (점수: 73/100)

**지점별 순위**:
1. **uuid 폴리필** (31파일): 본질은 언어 polyfill인데 infrastructure 위치 → `@shared/utils` 이동 권고 (P1, 1 파일 이동 + 31파일 codemod)
2. **supabase 컴포넌트 직접 호출** (7건): use case 추상화 필요 (P1, use case 3~4개 신규 + 도메인 포트)
3. **RECORD_COLOR_MAP** (store 박힘): presenter로 이동 (P1, 이미 B 섹션에서 다룸)
4. **bridgeHomeroomDayAttendance** (store 비즈니스 로직): use case 분리 (P1, 신규 use case 1개)

**통합 효과**:
- uuid 이동으로 usecases→infrastructure 6건 위반 자동 해소
- supabase 추상화로 컴포넌트→infrastructure 직접 호출 자동 해소
- 아키텍처 점수: 73 → 88 (예상)

---

### E. 코드 품질 (37건: P0:6 / P1:8 / P2:12 / P3:11)

**P0 6건 (즉시 위협)**:
1. **도메인 테스트 0개** — studentRecordRules, rosterImportRules, 3개 store 무테스트 상태. 출결 데이터 손상 위험 최고
2. **load() 에러 swallow** (3개 store) — 네트워크 실패 시 `records: []`로 시작 → 데이터 덮어쓰기 위험
3. **encrypt 실패 침묵** (ConsultationDetail) — 학부모 개인정보 손실 인지 불가
4. **학생 status·count 변경 시 cascade 부재** — orphan studentRecords 정리 로직 없음
5. **거대 컴포넌트 9건** — 인지 부하 + 회귀 위험
6. **학생 격자 aria-pressed 누락** — 접근성

**P1 8건**: props drilling, useMemo deps 누락, React.memo 미사용, online/offline 중복, window.confirm, 인라인 fontSize 등 (기술부채)

**통합 수정 우선순위**:
1. **테스트 작성** (P0-1): studentRecordRules, rosterImportRules 우선 (20 TC × 3파일 = ~100줄, 2~3시간)
2. **에러 처리** (P0-2,3): load() try-catch + decrypt 로그 추가 (~20줄)
3. **컴포넌트 분해** (P0-5): InputMode/ConsultationCreateModal 분해 (Big Bet, 8시간)

---

### F. 사용자 워크플로우 (점수: 72/100)

**잘 된 부분**:
- 조회 시간(08:30) 출결 다중 기록: 단축키 + 다중 선택으로 5명을 7입력으로 처리 (개별 20입력 vs 60% 절감)
- 상담 예약 ↔ 기록 prefill 연동: 학생/카테고리/방법 자동 채움 (우수한 흐름)
- 명렬 관리 3단 wizard: Excel import/열 매핑/적용이 명확
- 기록 탭 기본 활성: 조회 시간 빠른 진입

**개선 필요**:
1. **탭 순서** (P1): 기록 >> 상담 >> 명렬 순으로 재배치 (사용 빈도 기준)
2. **수업반 탭** (P0): FR-STMEMO-10 미구현 (이미 C섹션)
3. **NEIS 모호성** (P0): "나이스 반영 체크" ≠ 실제 NEIS 보고 → 라벨 명시 필요
4. **prefill 소실** (P1): 탭 이동 시 입력 중인 기록 소실 → 경고 dialog 추가
5. **과제 오프라인** (P1): Google 의존 → 오프라인 체크리스트 모드 추가 권고

**Quick Win 7개**: 탭 순서, "오늘" 필터, 달력 팝오버, NEIS 일괄 체크, 비활동 잠금 등 (각 10~30줄, 1시간 총 소요)

---

## 4. 통합 우선순위 매트릭스 (4분면)

### Quick Win (Low Effort, High Impact) — v2.0.x 즉시

| 항목 | 노력 | 임팩트 | 예상 LOC |
|:---|:---|:---|:---|
| 칩 rounded-full | 5분 | 디자인 언어 회복 | 1 |
| 5열 격자 + aspect | 10분 | 30명 한눈에 | 2 |
| 그룹 라벨 weight | 5분 | 시각 위계 | 1 |
| "오늘" 필터 버튼 | 20분 | 조회 시간 효율 | 20 |
| DateNavigator 달력 | 15분 | 소급 기록 용이 | 10 |
| NEIS 일괄 체크 | 30분 | 보고 완료율 ↑ | 30 |
| prefill 탭 이동 경고 | 10분 | 데이터 손실 방지 | 10 |
| **합계** | **95분** | **높음** | **74줄** |

**기대 효과**: 사용자 점수 72→78, 설계 점수 55→65

---

### Big Bet (High Effort, High Impact) — v2.1.x~2.2.x

| 항목 | 노력 | 임팩트 | 우선순위 |
|:---|:---|:---|:---|
| InputMode 분해 (3패널) | 8시간 | 리렌더·회귀 위험 ↓↓ | 1 |
| uuid → @shared 이동 | 2시간 | 의존성 위반 6건 자동 해소 | 2 |
| supabase use case 추상화 | 6시간 | 의존성 위반 7건 + 테스트 격리 | 3 |
| 색상 매핑 presenter 통합 | 2시간 | 84건 클래스 일원화 | 4 |
| 수업반 탭 구현 | 6시간 | FR-STMEMO-10 충족 | 5 |
| 도메인 테스트 작성 | 6시간 | 출결 데이터 보호 | 1 |
| 모달 7개 마이그레이션 | 4시간 | 접근성 P0 해소 | 2 |
| **합계** | **~34시간** | **매우 높음** | — |

**기대 효과**: 현황 60점 → 85점 도달

---

### Fill-in (Low Effort, Low Impact) — 여유 시간

- SPEC 문서 갱신 (3시간)
- 라우트 중복 제거 `'student-records'` 제거 (30분)
- 보건↔건강 표기 정정 (5분)

---

### Skip/Reconsider (High Effort, Low Impact)

- 상벌점 v2.0 (P3 — 정책 미결정)
- Survey/Assignment/Consultation PRD 역업데이트 vs 별도 PRD 분리 (의사결정 대기)

---

## 5. 권고 액션 플랜 (3단계)

### Phase 1: 즉시 수정 (1주, 스프린트 내)

**목표**: 데이터 보호 + 기본 접근성 + Quick Win

| 항목 | 분야 | 우선순위 | 담당 | 예상 시간 |
|:---|:---|:---|:---|:---|
| store load() try-catch + loadFailed 플래그 | 에러 처리 | P0 | Backend |  2시간 |
| encrypt 실패 진단 로그 추가 | 보안 | P0 | Backend | 1시간 |
| 7개 모달 → `<Modal>` 마이그레이션 | 접근성 | P0 | Frontend | 3시간 |
| 칩 rounded-full + border + 5열 | 디자인 | P0 | Frontend | 0.5시간 |
| aria-pressed 5개 버튼 + role=grid | 접근성 | P0 | Frontend | 2시간 |
| Quick Win 7개 (탭 순서·필터·경고) | UX | P1 | Frontend | 1.5시간 |
| **Phase 1 합계** | — | — | **Mixed** | **~10시간** |

**결과 지표**: Match Rate 85% → 88%, 아키텍처 73→75, 접근성 55→70, 사용자 72→75

---

### Phase 2: 구조 개선 (2~3주)

**목표**: Big Bet 우선 3개 (uuid, supabase, 색상)

| 항목 | 분야 | 우선순위 | 담당 | 예상 시간 |
|:---|:---|:---|:---|:---|
| `uuid` → `@shared/utils` 이동 + 31파일 codemod | 아키텍처 | P1 | DevOps/Frontend | 2시간 |
| supabase 메서드 use case 추상화 (3~4개) | 아키텍처 | P1 | Fullstack | 6시간 |
| RECORD_COLOR_MAP → presenter + 7파일 수정 | 아키텍처/설계 | P1 | Frontend | 2시간 |
| InputMode 분해: 3패널 + 3훅 | 프론트엔드 | P1 | Frontend | 8시간 |
| 도메인 테스트 작성 (studentRecord + roster) | 품질 | P0 | QA | 6시간 |
| **Phase 2 합계** | — | — | **Mixed** | **~24시간** |

**결과 지표**: 아키텍처 75→88, 프론트엔드 55→70, 코드품질 6P0→2P0, 종합 60→75점

---

### Phase 3: 확장 기능 (4주~, v2.2.x)

**목표**: FR-STMEMO-10 + 신규 기능

| 항목 | 분야 | 우선순위 | 담당 | 예상 시간 |
|:---|:---|:---|:---|:---|
| 수업반 탭 구현 (FR-STMEMO-10) | 기능 | P0 | Frontend | 6시간 |
| ConsultationCreateModal 분해 (3 step) | 리팩토링 | P1 | Frontend | 8시간 |
| 새 학기 마이그레이션 wizard | 기능 | P1 | Fullstack | 6시간 |
| 학생 종합 뷰 패널 | 기능 | P1 | Frontend | 4시간 |
| 과제 오프라인 체크리스트 | 기능 | P1 | Fullstack | 4시간 |
| **Phase 3 합계** | — | — | **Mixed** | **~28시간** |

**최종 결과**: 모든 점수 85점 도달 + FR-STMEMO-10 충족

---

## 6. PDCA 다음 단계

### 현재 상태: Check 완료 (Match Rate 85%)

**다음 단계 선택지**:

| 옵션 | 조건 | 추천 |
|:---|:---|:---|
| **pdca-iterator 발동** | Match Rate < 90% | ✅ **권고** — 자동 수정 기능 활용 |
| **직접 수정** | Phase 1 추진 후 재분석 | 대안 |
| **보고서 작성 후 아카이브** | Phase 1~3 완료 신뢰도 | 미래 옵션 |

**조건부 사용자 협의 필요사항**:

1. **수업반 탭 통합 vs 별도 유지** (P0)
   - 옵션 A: HomeroomPage에 통합 (FR-STMEMO-10 정책)
   - 옵션 B: ClassManagement 별도 유지 (현 구조)
   - → 문서 갱신 필요 (PRD/SPEC 정합 위해)

2. **상벌점 v2.0 일정** (P3)
   - 현재: PRD 명시 미시행
   - 의사결정: v2.2.x 계획 vs 별도 PRD 분리 vs 취소

3. **Survey/Assignment/Consultation PRD 처우** (P0)
   - 옵션 A: PRD 5.7 갱신 (신규 도메인 추가)
   - 옵션 B: 별도 PRD (예: "v2.0 협업·설문·과제 기능")
   - → 현재 PRD/SPEC 갭 해소

4. **새 학기 명렬 마이그레이션 정책** (P1)
   - 옵션 A: 백업 + 초기화 (데이터 보존)
   - 옵션 B: 학번 매핑 업데이트 (연속성 유지)
   - → 학기초 온보딩 체크리스트 작성 필요

---

## 7. 대시보드 audit과의 공통 부채 (통합 라운드 후보)

### 2개 프로젝트 동시 부채

| 부채 | 대시보드 | 담임 업무 | 통합 규모 | 라운드 |
|:---|:---:|:---:|:---|:---|
| **uuid 폴리필** (위치 부적절) | 10파일 | 21파일 | **31파일** 일괄 codemod | Single (1~2시간) |
| **Zustand 전체 구독** | P0 다수 | 22개 사용처 | **50+ 사용처** | 통합 selector 라운드 |
| **모달 focus-trap** (EventPopup+담임 7개) | 1건 | 7건 | **8개 모달** | Modal Q/R 라운드 |
| **디자인 토큰 일탈** | 86 text-[Npx] | 327 raw color | **400+ 클래스** | 통합 P 라운드 (후속) |
| **adapters→infra** (직접 import) | 2건 | 9건 | **11건** | 통합 DI 라운드 |

**통합 효과**:
- uuid 이동 단일 커밋으로 2개 프로젝트 usecases→infra 의존성 위반 **13건 자동 해소**
- Zustand selector 라운드 단독 추진하면 성능 20~30% 개선 예상

---

## 8. 부록: 6개 분석 문서 위치 + 핵심 파일

### 분석 문서 위치

| 분석 | 문서 | 점수 | 주 지적 |
|:---|:---|:---|:---|
| 디자인 시스템 | `docs/03-analysis/homeroom-audit/01-design-uiux.analysis.md` | 55.25/100 | 칩 rounded-full, 색상 327건, z-50 raw 22건 |
| 프론트엔드 아키텍처 | `docs/03-analysis/homeroom-audit/02-frontend-architecture.analysis.md` | 55/100 | 7개 모달 focus-trap, Zustand 선택자 미사용 |
| Clean Architecture | `docs/03-analysis/homeroom-audit/03-clean-architecture.analysis.md` | 73/100 | uuid 31파일, supabase 컴포넌트 호출 7건 |
| 코드 품질 | `docs/03-analysis/homeroom-audit/04-code-quality.analysis.md` | 37건 (P0:6) | 테스트 0, 에러 swallow, 거대 컴포넌트 |
| 사용자 가치 | `docs/03-analysis/homeroom-audit/05-product-workflow.analysis.md` | 72/100 | 과제 오프라인 미지원, 수업반 미구현 |
| PRD/SPEC 갭 | `docs/03-analysis/homeroom-audit/06-prd-spec-gap.analysis.md` | 85% Match | FR-STMEMO-10 미구현, Survey/Assignment/Consultation 미문서화 |

### 핵심 파일 절대경로 (수정 대상)

**P0 즉시 대상**:
- `e:\github\ssampin\src\adapters\components\Homeroom\Records\recordUtils.ts` (칩 반정 + 색상 통합)
- `e:\github\ssampin\src\adapters\components\Homeroom\Records\InputMode.tsx` (7개 모달 분해 + 격자 수정)
- `e:\github\ssampin\src\adapters\stores\useStudentRecordsStore.ts` (load() 에러 처리 + RECORD_COLOR_MAP 이동)
- `e:\github\ssampin\src\adapters\components\Homeroom\HomeroomTabBar.tsx` (aria-controls + 화살표 키)
- `e:\github\ssampin\src\adapters\components\common\Modal.tsx` (기존 코드 참조 — 7개 모달 마이그레이션 대상)

**P1 중기 대상**:
- `e:\github\ssampin\src\infrastructure\utils\uuid.ts` (→ `e:\github\ssampin\src\shared\utils\uuid.ts` 이동)
- `e:\github\ssampin\src\domain\ports\` (IRemoteSurveyPort 등 4개 신규 포트)
- `e:\github\ssampin\src\usecases\survey\`, `consultation\` (use case 3~4개 신규)

**설계 참고**:
- `e:\github\ssampin\design examples\ssampin_homeroom_memo_page\code.html` (디자인 레퍼런스 L118~256)
- `e:\github\ssampin\PRD.md` (L276~334 담임 메모장)
- `e:\github\ssampin\SPEC.md` (L736~784 데이터 모델)

---

## 결론

담임 업무 페이지는 **기능적으로 완성되었으나 신뢰성·확장성·접근성 측면에서 중대한 부채를 안고 있습니다**. 

**현재 상태 (60점)에서 안정적 상태(85점)로 전환하기 위한 3단계 액션플랜**을 제시합니다:

1. **Phase 1 (1주)**: 데이터 보호(load 에러) + 접근성 P0(모달/aria) + Quick Win 7개 → 점수 60→70
2. **Phase 2 (2~3주)**: 아키텍처 부채 해소(uuid/supabase/색상) + 컴포넌트 분해 → 점수 70→80
3. **Phase 3 (4주~)**: 기능 완성(수업반 탭) + 신규 기능(마이그레이션/학생 뷰) → 점수 80→85

**즉시 추진 권고**: Phase 1 + `/pdca iterate homeroom` 자동 수정 (Match Rate 85% < 90% 도달 전까지)

**문서 정합**: PRD/SPEC 갱신 필요 (Survey/Assignment/Consultation 추가 + 데이터 모델 동기화)

---

**분석 완료일**: 2026-05-01  
**다음 리뷰**: Phase 1 완료 후 (목표: 2026-05-08)

