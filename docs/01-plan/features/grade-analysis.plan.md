# SsamPin 성적 분석 기능 구현 계획

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.
> 상태: **검토 대기(pending approval)** · ralplan 합의(Planner→Architect→Critic) 반영 · 2026-06-18
> 합의 결과 요약과 적용 델타는 문서 끝 `## 14. ralplan 합의 검토` 참조.

**Goal:** SsamPin에 `수업 관리`의 교과 평가 운영/성적 분석과 `학급 업무`의 담임 상담용 학급 성적 살펴보기를 분리해, 교사가 평가 결과를 학습 피드백·지원 필요 학생 발견·기초 자료 정리에 사용할 수 있게 한다.

**Architecture:** 새 기능은 “점수 입력” 하나로 뭉치지 않고 `지필평가`, `수행평가`, `학기 성적 산출`, `분석/신호`를 분리한다. 기존 `과제 수합`, `루브릭`, `학교알리미 평가계획 불러오기`, `학생 기록함`을 연결하되, 과제 수합을 수행평가 자체로 오해하지 않게 별도 평가 모델을 둔다. `학급 업무`와 `수업 관리`는 같은 학생을 보더라도 데이터 출처·권한·화면 목적을 분리한다.

**Tech Stack:** Electron + React 18 + TypeScript + Zustand + Tailwind, Clean Architecture(domain/usecases/adapters/infrastructure), Vitest, ESLint, existing SsamPin local storage/Drive sync registry.

---

## 0. 작성 배경과 정정

이 문서는 `E:\github\ssampin` 실제 SsamPin 저장소에 저장되는 **성적 분석 기능 계획**이다. 이전에 생성된 LazyCodex 운영 문서는 이번 요구와 맞지 않았으므로 폐기 대상이며, 이 계획의 범위에 포함하지 않는다.

## 1. 현재 코드 근거

### 1.1 이미 있는 연결점

- `src/domain/entities/Assignment.ts`
  - `Assignment`, `Submission`, `AssignmentTarget`가 존재한다.
  - `AssignmentTarget.type`은 이미 `class`와 `teaching`을 분리한다.
  - 현재 `Submission`은 제출 파일/텍스트 메타데이터 중심이며 점수·루브릭·성취기준·확인/이의신청 상태는 없다.
- `src/adapters/components/ClassManagement/ClassAssignmentTab.tsx`
  - `수업 관리` 안에 교과 수업반 기준 `과제 수합` 화면이 있다.
  - 이 화면은 수행평가 증거 수집 표면으로 연결할 수 있지만, 수행평가 모델 자체가 되어서는 안 된다.
- `src/domain/entities/Rubric.ts`, `src/usecases/rubric/ManageRubrics.ts`, `src/adapters/components/ClassManagement/Rubric/*`
  - 루브릭, 채점 결과(`RubricGrading`), 루브릭 빌더/채점 화면이 존재한다.
  - `RubricGrading`은 루브릭 기준 학생별 채점 결과로 수행평가 세부 채점의 기반이 될 수 있다.
- `src/domain/entities/EvaluationPlan.ts`, `src/usecases/evaluation/ImportEvaluationPlan.ts`, `src/infrastructure/schoolinfo/SchoolInfoEvaluationAdapter.ts`, `src/adapters/components/SchoolAnnouncements/EvaluationTab.tsx`
  - 학교알리미 평가 운영 계획 조회/파싱/루브릭 초안 변환 기반이 이미 존재한다.
  - 평가계획은 “참고/초안”으로 받아 교사가 확인한 뒤 확정해야 한다.
- `src/domain/entities/FormCategory.ts`
  - 내장 카테고리 `성적/평가`가 이미 있다. 성적표/채점표/분석표 내보내기 anchor로 쓸 수 있다.
- `src/widgets/items/Grades.tsx`
  - 현재 `성적 현황` 위젯은 placeholder이다. 대시보드 요약 신호의 진입점 후보이다.
- `src/usecases/sync/syncRegistry.ts`
  - Drive 동기화 대상은 명시 registry로 관리된다. 새 성적 저장 키를 추가한다면 별도 merge/충돌 테스트 없이 조용히 sync에 넣지 않는다.

### 1.2 정책/업무 원칙

- 학교생활기록/평가 기록은 직접 관찰·평가한 내용에 근거해야 한다.
- 평가 운영은 정기시험/지필평가와 수행평가를 구분한다.
- 수행평가는 원칙적으로 수업 중 실시·관찰되는 증거를 바탕으로 한다.
- 학생 개인 성적은 해당 학생에게만 확인되어야 하며, 화면/내보내기에서 동료 성적 노출을 주의한다.
- AI 보조 분석은 판단 대체가 아니라 “확인할 신호”와 “교사 검토용 요약”으로 제한한다.

## 2. 제품 방향

### 2.1 정보 구조

#### A. `수업 관리 > 평가 관리`

교과 담당 교사가 쓰는 운영 화면이다.

- 평가계획: 학교알리미/수기 입력 기반 평가 영역, 반영비율, 평가 방법, 만점, 학기, 실시 시기
- 지필평가: 시험명, 만점, 반영비율, 문항/영역별 점수, 결시/인정점, 확인 상태
- 수행평가: 평가명, 영역, 루브릭, 반영비율, 만점, 연결된 과제/제출/첨부/관찰 증거, 채점 상태
- 성적 산출: 지필+수행 환산점, 원점수, 성취수준, 미확정/확정 상태

#### B. `수업 관리 > 교과 성적 분석`

교과 수업 개선용 분석 화면이다.

- 평가별 분포: 평균, 중앙값, 구간별 학생 수
- 문항/영역별 신호: 정답률/득점률, 낮은 영역, 오개념 후보
- 루브릭 기준별 분포: 기준별 미도달 학생, 보통 이상 비율
- 학생별 변화: 이전 평가 대비 상승/하락, 결시/미제출/미채점
- 다음 수업 피드백: 재지도 필요 개념, 보충 과제 후보, 교과 기록함 연결

#### C. `학급 업무 > 학급 성적 살펴보기`

담임이 상담·지원·학급 운영에 쓰는 화면이다. **과목 세부 채점/수정은 하지 않는다.**

- 학생별 요약: 과목별 최근 신호, 급격한 하락/상승, 결시/미제출, 상담 필요 표시
- 학급 분포: 과목별 전체 경향, 특정 영역 지원 필요 학생 그룹
- 상담 참고: 보호자 상담/학생 상담 전 확인할 질문과 근거
- 기록 연결: 담임 기록함에 “상담 참고 메모”로 남길 수 있지만, 교과세특 문장 생성은 하지 않는다.

### 2.2 명칭 원칙

- 기능명 후보:
  - `수업 관리 > 평가 관리`
  - `수업 관리 > 교과 성적 분석`
  - `학급 업무 > 학급 성적 살펴보기`
- 피해야 할 표현:
  - `AI 성적표`, `AI 생기부`, `자동 산출 확정`, `학생부 자동 작성`
- 권장 설명:
  - `교사가 확인할 성적 신호를 모아 보여줍니다.`
  - `평가 결과를 다음 수업 피드백과 상담 준비에 연결합니다.`
- 용어: 2026 교육부 훈령 개정으로 '지필평가'의 공식 명칭은 **'정기시험'**이다. UI는 `정기시험(지필평가)` 병기 또는 `정기시험` 기본을 권장.

## 3. 비목표

- NEIS 자동 로그인·크롤링 등 성적 **자동 수집**은 하지 않는다. (단, 교사가 직접 내려받은 NEIS/채점프로그램 엑셀의 **수기 업로드**는 지원 — §8.1b.)
- 학교 공식 성적 산출 규정을 임의로 자동 확정하지 않는다.
- 학급 업무 화면에서 교과 세부 점수를 수정하지 않는다.
- 교과 수업 화면에서 담임 행동특성 기록과 무분별하게 합치지 않는다.
- 과제 수합을 수행평가 전체로 취급하지 않는다.
- 학생 개인 성적을 학생 간 비교 공개용 화면으로 만들지 않는다.
- HWPX/Word 생기부 문장 자동 생성은 1차 MVP에서 제외한다.

## 4. 데이터 모델 설계

### 4.1 새 domain entity 후보

Create: `src/domain/entities/GradeAnalysis.ts`

```ts
export type AssessmentKind = 'written-exam' | 'performance';

export type AssessmentStatus = 'draft' | 'confirmed' | 'archived';

export interface AssessmentPlanItem {
  readonly id: string;
  readonly teachingClassId: string;
  readonly semester: '1' | '2';
  readonly subject: string;
  readonly title: string;
  readonly kind: AssessmentKind;
  readonly areaName: string;
  readonly method?: string;
  readonly fullScore: number;
  readonly weightPercent: number;
  readonly plannedAt?: string;
  readonly source: 'manual' | 'schoolinfo-draft' | 'schoolinfo-confirmed';
  readonly status: AssessmentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WrittenExamResult {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentKey: string;
  readonly score: number | null;
  readonly absenceCode?: 'none' | 'absent' | 'recognized' | 'exempt';
  readonly recognizedScore?: number;
  readonly confirmed: boolean;
  readonly memo?: string;
}

export interface PerformanceAssessmentResult {
  readonly id: string;
  readonly assessmentId: string;
  readonly studentKey: string;
  readonly score: number | null;
  readonly rubricGradingId?: string;
  readonly assignmentId?: string;
  readonly submissionId?: string;
  readonly evidenceNote?: string;
  readonly confirmed: boolean;
  readonly memo?: string;
}

export interface SemesterGradeResult {
  readonly id: string;
  readonly teachingClassId: string;
  readonly semester: '1' | '2';
  readonly studentKey: string;
  readonly convertedScore: number;
  readonly rawScore: number;
  readonly achievementLevel?: string;
  readonly rank?: number;
  readonly subjectAverage?: number;
  readonly confirmed: boolean;
}

export interface GradeAnalysisData {
  readonly plans: readonly AssessmentPlanItem[];
  readonly writtenResults: readonly WrittenExamResult[];
  readonly performanceResults: readonly PerformanceAssessmentResult[];
  readonly semesterResults: readonly SemesterGradeResult[];
}
```

### 4.2 학생 식별 규칙

Create: `src/domain/rules/studentGradeKeyRules.ts`

- 교과 수업반은 여러 학급 학생이 섞일 수 있으므로 `학년+반+번호+이름`을 기본 키로 한다.
- 기존 `TeachingClassStudent`의 `grade`, `classNum`, `number`, `name`을 우선 사용한다.
- `studentId`가 있는 경우 내부 연결용으로 보관하되, Excel import/export 매칭은 `학년+반+번호+이름`을 우선한다.

### 4.3 산출 규칙

Create: `src/domain/rules/gradeCalculationRules.ts`

- 평가별 환산점 = `score / fullScore * weightPercent`
- 학기 환산점 합계 = 지필평가 환산점 + 수행평가 환산점
- 원점수는 학교 규정에 따라 최종 단계에서 반올림하되, MVP에서는 “계산 미리보기”와 “교사 확인” 상태를 분리한다.
- 결시/인정점은 수동 입력과 메모를 남긴다. 자동 인정점 산출은 1차 MVP 제외.

### 4.4 2026 평가지침 등급/성취도 분기 규칙 (합의 추가 — 필수)

Create: `src/domain/rules/gradeStandardRules.ts` (+ `.test.ts`)

산출은 학교급·학년·과목으로 **자동 분기**한다(교사는 학교급/학년만 1회 선택). 단 모든 등급/성취도는 **"추정(미확정)"** 라벨로만 제시하며, 확정은 교사 몫이다(비목표 §3과 충돌 없음).

```ts
export type ScaleKind = 'rank5' | 'rank9' | 'achieve5' | 'achieve3' | 'none';
// 고1·고2(2022개정) → rank5 (+성취도 A~E 병기)
// 고3(2015개정) 공통·일반선택 → rank9 / 진로선택 → achieve3
// 고 융합선택 사회·과학·체육·예술·교양·과학탐구실험 → 석차 없음(성취도만)
// 중학교 → achieve5 (석차 없음) / 자유학기 → none
// 초등학교 → none (정량 성적 없음)
export function scaleFor(
  level: 'elem' | 'mid' | 'high',
  gradeYear: number,
  subjectFlags: { track?: 'common' | 'general' | 'career' | 'fusion'; noRank?: boolean },
): ScaleKind;
```

- **성취도 분할점수(원점수 컷)는 하드코딩하지 않는다.** 기준 성취율(A 90 / B 80 / C 70 / D 60 / E 60미만)은 불변이지만, 그 성취율에 해당하는 **원점수 컷은 분할방식에 따라 달라진다.**
  - **고정분할점수**: 원점수=성취도 1:1. 컷 자동 90/80/70/60(진로선택 3단계 80/60).
  - **추정분할점수(단위학교 산출)**: 교과 특성·문항 난이도로 성취수준별 예상정답률을 추정해 산출한 분할점수. 시험이 어려우면 A컷이 82점처럼 내려갈 수 있다. **학교가 산출·공개한 분할점수를 교사가 입력**한다(과목 단위 저장).
  - 도구가 통계로 추정분할을 제안할 수 있으나 공식값은 학교 협의 산출이므로 **"참고(비공식)" 라벨**로만, 확정은 교사/학교 몫.
- 성취도 판정 함수는 컷을 주입받는다: `achievementOf(원점수, cutScores: { A:number; B:number; C:number; D:number })`. 90/80/70/60 고정 금지. 분할방식(고정/추정)은 과목·평가별 설정.
- 석차등급 누적컷: 5등급 = 10/34/66/90/100%, 9등급 = 4/11/23/40/60/77/89/96/100%.
- `SemesterGradeResult.achievementLevel`/`rank`는 위 규칙으로 산출한 **추정값**이며 자유문자열이 아니다.

## 5. 저장소/동기화 설계

### 5.1 새 저장 키

- 후보 key: `grade-analysis`
- Create:
  - `src/domain/repositories/IGradeAnalysisRepository.ts`
  - `src/adapters/repositories/JsonGradeAnalysisRepository.ts`
  - `src/usecases/gradeAnalysis/ManageGradeAnalysis.ts`
  - `src/adapters/stores/useGradeAnalysisStore.ts`

### 5.2 Drive sync 원칙

1차 구현에서는 local-first로 저장한다.

- `syncRegistry.ts`에 즉시 추가하지 않는다.
- Drive sync 포함은 별도 Phase에서 한다.
- 포함할 경우 `grade-analysis`에 대해 record-level merge 전략과 충돌 테스트를 먼저 작성한다.
- 학생 개인 성적 데이터이므로 Drive 동기화 안내 문구와 보안 경고를 별도 검토한다.

## 6. 기존 기능 연결

### 6.1 과제 수합 연결

- `Assignment`/`Submission`은 수행평가 증거 수집이다.
- `PerformanceAssessmentResult.assignmentId`와 `submissionId`로 연결한다.
- `ClassAssignmentTab`에 “수행평가 증거로 연결” CTA를 추가할 수 있다.
- 과제 미제출은 수행평가 점수 0점과 같지 않다. 교사가 평가 기준에 따라 확정해야 한다.

### 6.2 루브릭 연결

- `PerformanceAssessmentResult.rubricGradingId`로 기존 `RubricGrading`을 참조한다.
- `RubricGrading`의 기준별 선택 결과를 성적 분석에서 기준별 분포로 보여준다.
- 기존 루브릭 구조를 지필평가 문항 분석으로 재사용하지 않는다.

### 6.3 학교알리미 평가계획 연결

- `ParsedEvaluationPlan`과 `RubricCandidate`는 평가계획 초안 생성에 사용한다.
- 학교알리미에서 온 값은 `source: 'schoolinfo-draft'`로 저장하고, 교사가 확인하면 `schoolinfo-confirmed`로 바꾼다.
- 반영비율·만점·평가명은 반드시 교사 확인 단계를 둔다.

### 6.4 학생 기록함 연결

- `수업 관리 > 교과 성적 분석`에서 “교과 기록함에 근거 메모 추가”를 제공한다.
- 기록 문구는 점수 자체보다 관찰 가능한 학습 행동과 피드백 반영을 중심으로 한다.
- `학급 업무 > 학급 성적 살펴보기`에서는 담임 상담 참고 메모로만 연결한다.

## 7. 화면 설계

### 7.1 `수업 관리 > 평가 관리`

Modify: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`

- `TabId`에 `assessment` 추가
- 탭 라벨: `평가 관리`
- 컴포넌트: `ClassAssessmentManagementTab`

Create: `src/adapters/components/ClassManagement/GradeAnalysis/ClassAssessmentManagementTab.tsx`

화면 섹션:

1. 평가계획 카드
   - 평가명, 종류, 영역, 반영비율, 만점, 상태
   - `학교알리미에서 불러오기`, `직접 추가`, `Excel 가져오기`
2. 지필평가 입력
   - 학생별 점수 입력, 결시/인정점, 확인 상태
3. 수행평가 입력
   - 루브릭 연결, 과제 수합 연결, 증거 메모, 확인 상태
4. 산출 미리보기
   - 학생별 환산점 합계, 원점수 미리보기, 미확정 항목 경고

### 7.2 `수업 관리 > 교과 성적 분석`

Create: `src/adapters/components/ClassManagement/GradeAnalysis/SubjectGradeAnalysisTab.tsx`

초기에는 `평가 관리` 안의 하위 모드로 구현해도 된다. 탭을 너무 많이 늘리지 않기 위해 MVP에서는 `평가 관리` 상단에 `입력/분석` 세그먼트를 둔다.

분석 카드:

- 평가별 평균/중앙값/최저/최고
- 구간별 분포
- 미제출/미채점/결시 학생
- 루브릭 기준별 미도달 학생
- 이전 평가 대비 급상승/급하락
- 다음 수업 피드백 제안

### 7.3 `학급 업무 > 학급 성적 살펴보기`

Modify:

- `src/adapters/components/Homeroom/HomeroomPage.tsx`
- `src/adapters/components/Homeroom/HomeroomTabBar.tsx`

Create:

- `src/adapters/components/Homeroom/GradeOverview/HomeroomGradeOverviewTab.tsx`

데이터 출처(중요): 담임은 타 교과 점수를 이 설치본에 갖지 못한다. 따라서 (a) 내가 가르치는 과목은 교과 입력분을 재사용하고, (b) 그 외 전과목은 **교사가 내려받은 NEIS 산출 파일(성적일람표/교과학습발달상황) 수기 업로드**(§8.1b)로 채운다. **데이터 없는 과목은 비워 두고 추정하지 않는다.** import한 성취도/석차등급은 기관 산출값을 그대로 표시(자체 재계산 금지).

화면 섹션:

- 학급 전체 신호: 과목별 평균/분포 요약, 미제출/결시 누적
- 학생별 지원 신호: 급격한 하락, 여러 과목 미제출, 상담 필요
- 상담 준비 카드: 확인 질문, 보호자 상담 전 체크할 근거
- 담임 기록함 연결: 상담 참고 메모 추가

제약:

- 이 화면에서는 점수 수정 불가
- 지필/수행 세부 채점표 수정 불가
- 교과별 공개 범위/출처 표시 필수

### 7.4 대시보드 위젯

Modify: `src/widgets/items/Grades.tsx`

- placeholder를 다음 정보로 교체한다.
  - 오늘 확인할 미채점/미제출 수
  - 최근 급상승/급하락 학생 수
  - 평가 관리 바로가기
- 개인 점수는 위젯에 표시하지 않는다.

## 8. Excel 가져오기/내보내기

### 8.1 가져오기

Create: `src/infrastructure/import/GradeExcelImporter.ts`

- repo 기존 Excel 유틸(exceljs, `parseTeachingClassRosterFromExcel` 패턴) 재사용.
- 매칭 키: `학년`, `반`, `번호`, `이름`.
- **두 가지 import 형태를 구분한다**:
  - **8.1a 교과 평가점수 import**(수업관리용): 열 후보 `평가명·종류·영역·만점·반영비율·점수·결시·메모`. 내 과목의 평가별 학생 점수.
  - **8.1b 담임 전과목 성취도 import**(학급용): NEIS 성적일람표/교과학습발달상황. 열 후보 `과목·원점수·과목평균·성취도·석차등급·분포비율`. 기관 산출값 그대로 보관(재계산 금지).
- **양식 자동 인식 + 수동 매핑 폴백(필수)**: NEIS·채점프로그램은 양식이 제각각이라, 헤더 별칭 사전으로 열을 자동 감지하고, 실패 시 **수동 컬럼 매핑 모달**로 교사가 직접 지정. 병합셀/소계행 대비 미리보기 제공.
- 가져오기 전 preview + 매칭 실패 목록을 보여준다.

### 8.2 내보내기

Create or extend:

- `src/infrastructure/export/GradeAnalysisExporter.ts`

내보내기 유형:

- 교과 평가 관리표 Excel
- 학생별 성적 상담 참고 Markdown/TXT
- 미제출/미채점 체크리스트

## 9. 구현 단계

### Phase 0. 잘못 생성된 LazyCodex 문서 제거

**Objective:** 이번 요구와 무관한 문서 흔적을 제거한다.

**Files:**

- Remove: `docs/ops/lazycodex-ssampin-implementation-plan.md`
- Remove: `.omo/ulw-loop/hermes-lazycodex-plan/`

**Verify:**

```powershell
Set-Location E:\github\ssampin
git status --short -- docs/ops/lazycodex-ssampin-implementation-plan.md .omo/ulw-loop/hermes-lazycodex-plan
```

Expected: no output.

### Phase 1. Domain model and calculation rules

**Objective:** 성적 분석의 핵심 타입과 계산 규칙을 만든다.

**Files:**

- Create: `src/domain/entities/GradeAnalysis.ts`
- Create: `src/domain/rules/gradeCalculationRules.ts`
- Create: `src/domain/rules/gradeCalculationRules.test.ts`
- Create: `src/domain/rules/studentGradeKeyRules.ts`
- Create: `src/domain/rules/studentGradeKeyRules.test.ts`

**Tests:**

- 환산점 계산
- 반영비율 합계 검증
- 지필/수행 분리
- 결시/인정점 수동 처리
- 학생 키 생성: `학년+반+번호+이름`

**Verify:**

```bash
npx vitest run src/domain/rules/gradeCalculationRules.test.ts src/domain/rules/studentGradeKeyRules.test.ts --testTimeout=30000
```

### Phase 2. Repository/usecase/store

**Objective:** local-first 저장과 기본 CRUD를 만든다.

**Files:**

- Create: `src/domain/repositories/IGradeAnalysisRepository.ts`
- Create: `src/adapters/repositories/JsonGradeAnalysisRepository.ts`
- Create: `src/usecases/gradeAnalysis/ManageGradeAnalysis.ts`
- Create: `src/adapters/stores/useGradeAnalysisStore.ts`
- Modify: `src/adapters/di/container.ts`

**Guard:**

- `syncRegistry.ts`는 수정하지 않는다.
- `SyncFromCloud.ts`는 수정하지 않는다.

**Verify:**

```bash
npx vitest run src/usecases/gradeAnalysis src/adapters/stores/useGradeAnalysisStore.test.ts --testTimeout=30000
```

### Phase 3. 수업 관리 평가 관리 MVP

**Objective:** 교과 담당 교사가 평가계획/점수/수행평가 결과를 입력하고 산출 미리보기를 볼 수 있게 한다.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/ClassAssessmentManagementTab.tsx`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/AssessmentPlanList.tsx`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/WrittenExamScoreGrid.tsx`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/PerformanceAssessmentGrid.tsx`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/SemesterGradePreview.tsx`

**Source-level guard test:**

Create: `src/adapters/components/ClassManagement/GradeAnalysis/gradeAnalysisSourceGuard.test.ts`

Assert strings/structure:

- `평가 관리`
- `지필평가`
- `수행평가`
- `산출 미리보기`
- `교사 확인 전에는 확정 성적으로 사용하지 마세요`
- `과제 수합은 수행평가 증거로만 연결됩니다`

### Phase 4. 기존 루브릭/과제 수합 연결

**Objective:** 수행평가 결과가 기존 루브릭 채점/과제 제출 증거를 참조할 수 있게 한다.

**Files:**

- Modify: `src/adapters/components/ClassManagement/GradeAnalysis/PerformanceAssessmentGrid.tsx`
- Modify: `src/adapters/components/ClassManagement/ClassAssignmentTab.tsx` only if CTA is needed
- Modify: `src/adapters/components/ClassManagement/Rubric/RubricGradingView.tsx` only if entry CTA is needed

**Guard:**

- `Assignment.ts`를 거대한 성적 모델로 확장하지 않는다.
- 필요한 경우 ID 참조만 추가하거나 새 entity에서 참조한다.

### Phase 5. 교과 성적 분석

**Objective:** 평가 결과를 수업 피드백으로 전환한다.

**Files:**

- Create: `src/domain/services/gradeAnalysisSummary.ts`
- Create: `src/domain/services/gradeAnalysisSummary.test.ts`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/SubjectGradeAnalysisPanel.tsx`

**Analysis outputs:**

- 평가별 통계
- 미제출/미채점/결시 목록
- 루브릭 기준별 분포
- 급상승/급하락 신호
- 다음 수업 보충 후보

### Phase 6. 학급 업무 학급 성적 살펴보기

**Objective:** 담임 상담/지원용 읽기 전용 화면을 추가한다.

**Files:**

- Modify: `src/adapters/components/Homeroom/HomeroomPage.tsx`
- Modify: `src/adapters/components/Homeroom/HomeroomTabBar.tsx`
- Create: `src/adapters/components/Homeroom/GradeOverview/HomeroomGradeOverviewTab.tsx`
- Create: `src/domain/services/homeroomGradeSignals.ts`
- Create: `src/domain/services/homeroomGradeSignals.test.ts`

**Guard strings:**

- `상담 참고용`
- `이 화면에서는 점수를 수정할 수 없습니다`
- `교과 평가 세부 내용은 수업 관리에서 확인하세요`

### Phase 7. Excel import/export

**Objective:** 학교 현장 데이터 입력을 현실화한다.

**Files:**

- Create: `src/infrastructure/import/GradeExcelImporter.ts`
- Create: `src/infrastructure/export/GradeAnalysisExporter.ts`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/GradeImportPreviewModal.tsx`
- Create: `src/adapters/components/ClassManagement/GradeAnalysis/GradeExportModal.tsx`

**Tests:**

- 열 이름 매칭
- 학생 매칭 실패 목록
- 결시/공란 처리
- 개인 점수 노출 없는 요약 export

### Phase 8. 대시보드 위젯

**Objective:** `Grades` placeholder를 안전한 요약 신호로 교체한다.

**Files:**

- Modify: `src/widgets/items/Grades.tsx`

**Guard:**

- 학생 개인 점수 표시 금지
- 미채점/미제출/확인 필요 수만 표시

## 10. Verification commands

### 문서 계획 검증

```powershell
Set-Location E:\github\ssampin
git diff --check -- docs/01-plan/features/grade-analysis.plan.md
git status --short -- docs/01-plan/features/grade-analysis.plan.md
```

### 구현 후 targeted 검증

```bash
npx vitest run \
  src/domain/rules/gradeCalculationRules.test.ts \
  src/domain/rules/studentGradeKeyRules.test.ts \
  src/domain/services/gradeAnalysisSummary.test.ts \
  src/domain/services/homeroomGradeSignals.test.ts \
  src/adapters/components/ClassManagement/GradeAnalysis/gradeAnalysisSourceGuard.test.ts \
  --testTimeout=30000

npx eslint \
  src/domain/entities/GradeAnalysis.ts \
  src/domain/rules/gradeCalculationRules.ts \
  src/domain/rules/studentGradeKeyRules.ts \
  src/domain/services/gradeAnalysisSummary.ts \
  src/domain/services/homeroomGradeSignals.ts \
  src/adapters/components/ClassManagement/GradeAnalysis \
  src/adapters/components/Homeroom/GradeOverview

npm run typecheck
npm run test
npm run regression-check   # SsamPin 공식 게이트 필수 (CLAUDE.md 4단계)
npm run build              # 릴리즈 전 선택 (무거움)
```

### 보호 파일 확인

```bash
git diff --name-only -- \
  src/usecases/sync/syncRegistry.ts \
  src/usecases/sync/SyncFromCloud.ts \
  src/adapters/stores/useDriveSyncStore.ts

git diff --name-only -- package.json package-lock.json
```

Expected for MVP: no output unless a later approved phase explicitly includes Drive sync or dependencies.

## 11. Manual QA checklist

### 수업 관리

- [ ] 수업반을 선택하면 `평가 관리` 탭이 보인다.
- [ ] 지필평가와 수행평가가 별도 섹션으로 보인다.
- [ ] 수행평가에서 루브릭/과제 수합을 “증거 연결”로만 선택한다.
- [ ] 미채점/미제출/결시 학생이 분리 표시된다.
- [ ] 산출 미리보기에는 “교사 확인 전 확정 성적 아님” 안내가 보인다.

### 교과 성적 분석

- [ ] 평가별 분포와 루브릭 기준별 분포가 표시된다.
- [ ] 특정 학생의 개인 점수는 교사 화면 안에서만 보이고, 공개용 위젯/요약에 노출되지 않는다.
- [ ] 다음 수업 피드백 제안은 점수 낙인보다 재지도 영역 중심이다.

### 학급 업무

- [ ] 담임 화면은 읽기 전용이다.
- [ ] 학생별 지원 신호와 상담 참고 질문이 보인다.
- [ ] 점수 수정/교과 세부 채점은 불가능하다.
- [ ] 담임 기록함에 남길 때 출처가 `성적 상담 참고`로 표시된다.

## 12. Risks and mitigations

- 위험: 성적 민감정보가 대시보드/공유 화면에 노출됨
  - 대응: 위젯은 숫자 count 중심, 개인 점수 미표시. export도 목적별 분리.
- 위험: 과제 수합을 수행평가 점수로 자동 확정함
  - 대응: 과제/제출은 증거 ID로만 연결, 점수 확정은 수행평가 결과에서 교사가 수행.
- 위험: 학교알리미 평가계획을 공식 성적 산출값처럼 오해함
  - 대응: `draft`/`confirmed` 상태와 확인 단계 필수.
- 위험: 담임/교과 흐름 혼합
  - 대응: UI, store query, export labels에 `homeroom`/`subject` context 명시.
- 위험: Drive sync 충돌
  - 대응: MVP에서는 syncRegistry 제외. 별도 merge 테스트 후 추가.

## 13. Implementation order recommendation

1. Phase 0: 잘못된 LazyCodex 문서 제거
2. Phase 1: domain/rules TDD
3. Phase 2: repository/usecase/store
4. Phase 3: `수업 관리 > 평가 관리` MVP
5. Phase 4: 루브릭/과제 수합 연결
6. Phase 5: 교과 성적 분석
7. Phase 6: 학급 성적 살펴보기
8. Phase 7: Excel import/export
9. Phase 8: 대시보드 위젯

첫 구현 slice는 Phase 1~3까지만 권장한다. Phase 4 이후는 실제 교사 입력 흐름을 확인한 뒤 확장한다.

---

## 14. ralplan 합의 검토 (Planner → Architect → Critic)

> Verdict: **ITERATE → 아래 델타 반영 시 승인 가능(pending approval)**. 본 계획은 코드 근거가 정확히 실재(검증 완료)하고 IA 분리(수업관리/학급업무)·기존기능 연결·local-first·개인정보 방향이 견고하다. 단 아래 중요 3건은 1차 구현 전 반영해야 한다.

### 14.1 검증된 코드 근거 (실재 확인)

`Assignment.AssignmentTarget.type:'class'|'teaching'`(L13), `Homeroom/`(HomeroomPage·HomeroomTabBar·Consultation·Records), `widgets/items/Grades.tsx`(placeholder), `usecases/sync/syncRegistry.ts`, `usecases/evaluation/ImportEvaluationPlan.ts`·`infrastructure/schoolinfo/SchoolInfoEvaluationAdapter.ts`, `FormCategory 'builtin:grade-eval' 성적/평가`, `usecases/rubric/ManageRubrics.ts` — 인용 전부 정확.

### 14.2 Architect 검토

- **Steelman(가장 약한 가정 공격)**: 계획의 `gradeCalculationRules`는 환산점 합산 + `achievementLevel:string`(자유문자열) + `rank:number`만 둔다. 한국 교사에게 성적 도구의 **존재 이유는 "성취도/등급이 맞게 나오는가"**인데, 정작 2026 등급체계(고1·2=5등급/고3=9등급/중=성취도/초=없음)·성취도 절대컷·융합선택 예외가 모델에 없다. 이 상태로는 "환산점 미리보기 계산기"일 뿐 "성적 분석"이라 부르기 어렵다. → **해소**: §4.4 `gradeStandardRules.scaleFor`로 분기하되 전부 "추정(미확정)" 라벨. 비목표(자동 확정 금지)와 충돌 없음.
- **트레이드오프 긴장(데이터 출처)**: `학급 업무 > 학급 성적 살펴보기`는 학급 **전과목** 신호를 보인다고 하나, 담임은 자기 교과 외 점수를 이 설치본에 갖지 못한다(다른 교사 데이터 없음). 동시에 §3은 "NEIS 자동화 비목표"라 한다. → **해소**: ① 담임 화면 데이터 출처를 명시 — (a) 내가 가르치는 과목(교과 입력분) + (b) **NEIS 산출 파일 수기 import**(=자동화 아님, §8 import를 담임 전과목 입력 경로로 명시 연결). ② 데이터 없는 과목은 "데이터 없음"으로 솔직히 비우고 추정하지 않는다. ③ import 성취도는 "기관 산출값" 그대로 표시, 자체 재계산 금지.
- **레이어**: domain 순수성·usecases→domain·di 예외는 계획과 일치(위반 없음). 차트만 신규 의존(아래).

### 14.3 Critic 검토 (품질·테스트가능성)

1. **[중요] 검증 게이트 정합** — §10이 `regression-check`를 누락했었다(수정 반영함). CLAUDE.md 4단계(tsc/lint/test/regression-check) 준수 필수, `build`는 선택.
2. **[중요] 핵심 도메인 AC 부재** — 등급/성취도 경계 테스트가 없다. 추가 필수: `scaleFor`(고1=rank5·고3 일반=rank9·고3 진로=achieve3·중=achieve5(석차null)·초=none·융합선택 사회/과학=석차null); `achievementOf(원점수, cutScores)` — **고정분할**(컷 90/80/70/60: 89.9→B/90→A) **및 추정분할**(예 컷 82/71/58/45: 81.9→B/82→A)로 둘 다 경계 검증, 진로선택 3단계 동일; `rankGradeOf`(5·9등급 누적컷 경계); 환산점 **센티포인트 드리프트 0**(`examAllocationRules` 패턴 재사용).
3. **[중요] 개인정보 가드 테스트** — "성적 키가 syncRegistry에 없음 / Drive 전송 0"을 **테스트로** 고정(현재 가드 문자열만 있음). AI 경로는 마스킹 미통과 시 호출 차단 테스트.
4. **[경미] Phase 0(LazyCodex 문서 삭제)** 분리 — 기능 계획과 직교한다. ralplan은 planning-only라 지금 삭제하지 않는다. "오너 승인 시 별도 정리"로 강등하고, 삭제 대신 .gitignore 처리도 선택지로 둔다.
5. **[경미] Phase 3 분할** — 평가관리 MVP(평가계획+지필+수행+산출)는 크다. 3a 지필 점수 그리드+산출 미리보기 → 3b 수행 연결 순으로 쪼갠다.

### 14.4 교사 사용성 델타 (사용자 최우선 요구)

- **강점(유지)**: "신호(signal)" 프레이밍(지원 필요 학생 발견·급상승/급하락·미제출 누적)은 순수 통계보다 담임에게 훨씬 유용 — 그대로 살린다.
- **입력 고통 제거(AC로 승격)**: ① 명단 재입력 0(기존 `TeachingClass.students`/로스터 자동) ② 지필 점수 **엑셀형 그리드**(↑↓/Enter 이동·붙여넣기·결시 토글) ③ 수행 점수는 `RubricGrading` 합계 **자동 연동**. 입력이 엑셀보다 느리면 교사가 안 쓴다(Phase 3 수동 QA 필수).
- **상담 즉효 산출 추가**: 고등 석차제에서 **등급 경계 near-miss**(한 등급만 올리면 되는 과목) — `peopleToNextGrade` 기반, 담임 상담에 고가치. §4.4 등급체계 의존.
- **안심 신호**: 모든 성적 화면에 "로컬 저장·외부 전송 없음" 배지.

### 14.5 미정 → 결정 권고

- 차트: **MVP는 표+막대(자체 SVG)** 로 충분, 추이/분포 고도화 시 recharts 도입 Phase 5로 미룸(번들·테마 영향 최소화).
- 반영비율 기본 출처: 학교알리미 import가 있으면 우선 채우고 교사 확인, 없으면 수동.

---

## 15. ADR (Architecture Decision Record)

- **Decision**: 성적 분석을 단일 도구가 아니라 (A) `수업 관리 > 평가 관리/교과 성적 분석`(교과·내부 산출)과 (B) `학급 업무 > 학급 성적 살펴보기`(담임·읽기전용/수기·import)로 분리하고, 등급/성취도는 `gradeStandardRules`로 2026 지침 분기하되 전부 "추정(미확정)"으로 제시한다.
- **Drivers**: 교사 사용성(역할별 동선·입력고통 제거), 2026 평가지침 정확성, 개인정보 로컬·전송 0.
- **Alternatives**: (단일 통합 도구) 데이터 출처가 다른 두 작업이 한 화면에 섞여 혼란 → 기각. (담임 NEIS import만 우선) 교과 교사 가치·기존 평가기능 연결 상실 → 기각.
- **Why chosen**: 분리안만 사용성·정확성·개인정보를 동시 충족하고, 기존 ExamPaper/Rubric/EvaluationPlan/Assignment를 최대 재사용.
- **Consequences**: 진입점 2개 학습비용(아이콘·안내로 흡수), 등급체계 규칙·테스트 추가 부담, 담임 전과목은 import 의존.
- **Follow-ups**: 차트 라이브러리 결정, Drive sync 포함 여부(별도 merge 테스트 선행), 마스킹 AI 상담초안(옵트인).

> 실행 보류: 본 문서는 ralplan 산출물로 **검토 대기(pending approval)** 상태다. 승인 시 team(병렬) 또는 ralph(순차)로 Phase 1부터 실행한다. 승인 전 소스 수정·삭제·커밋은 하지 않는다.
