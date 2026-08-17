# 쌤핀(SsaemPin) 무설정 멀티모델 인앱 AI 어시스턴트 PRD

> **문서 ID**: PRD-2026-AI-001  
> **최종 수정일**: 2026-08-17  
> **구현 대상**: SsaemPin Core (`github.com/pblsketch/ssampin`)  
> **구현 에이전트**: Claude 3.7 / Opus 5  
> **상태**: Ready for Implementation (Phase 1 MVP ~ Phase 3)

---

## 1. 제품 개요 및 목표 (Product Overview)

### 1.1 배경 및 문제 정의 (Problem Statement)

- **선생님의 과중한 텍스트 & 멀티모달 행정 부담**: 초·중·고 교사는 학생 한 명당 수십 줄의 생활기록부 문장, 상담 일지, 학부모 알림 문구를 교육부 훈령과 문체 가이드라인에 맞춰 작성하고, 학생 손글씨 활동지나 칠판 판서, 1년 치 전교생 방대한 데이터를 분석하느라 학기말마다 극심한 야근과 인지 피로를 겪습니다.
- **기존 AI 도구의 진입 장벽 (Friction)**:
  1. 회원가입 및 신용카드 등록의 번거로움
  2. $20/월 유료 구독 또는 복잡한 API 키 발급
  3. 학생 실명 및 학습지 사진 업로드 시 개인정보 유출 우려

### 1.2 핵심 솔루션: "Zero-Setup Multi-Model In-App AI"

- **무설정(Zero-Setup)**: 선생님은 가입, 결제, 설정 창을 볼 필요 없이 **버튼 하나만 누르면 즉시 작동**.
- **스마트 자동 라우팅 (Smart Auto-Routing)**: 작업 성격에 따라 최적의 OpenCode 무료 모델 포트폴리오로 백그라운드 자동 분기.
  1. **텍스트 추론/문체 윤문**: `deepseek-v4-flash-free` (Reasoning 특화, 200k 토큰)
  2. **멀티모달 (사진/손글씨/음성)**: `mimo-v2.5-free` (비전/오디오 입력 지원)
  3. **초대형 빅데이터/전교 문서 분석**: `nemotron-3-ultra-free` (1,000,000 토큰 / 1M 컨텍스트)
  4. **초고속 퀵 라우팅 & 대량 일괄 출력**: `nemotron-3.5-lightning-free` (26.2만 토큰 최대 출력)
- **내장 보안 파이프라인**: 전송 전 클라이언트단 **자동 가명화(실명 ➡️ 학생A)** 및 수신 후 **원래 이름 복원**.
- **하이브리드 확장성 (Two-Track)**: 일반 교사용 **무료 무설정 인앱 AI** + 파워 유저용 **기존 AI 브릿지(Claude/GPT BYOK)** 공존.

---

## 2. 클린 아키텍처 매핑 (Architecture Specification)

쌤핀의 클린 아키텍처 4계층 원칙에 따라 신규 모듈을 구성합니다:

```
src/
├── domain/                      # 1. 도메인 계층 (순수 비즈니스 규칙)
│   ├── entities/
│   │   ├── AiGenerationResult.ts # AI 생성 결과 엔티티 (옵션 목록, 생성 메타)
│   │   ├── AiPromptTemplate.ts   # 프롬프트 템플릿 정의
│   │   └── AiModelRouter.ts      # 작업 유형별 모델 라우팅 엔티티
│   ├── rules/
│   │   ├── aiAnonymizerRules.ts  # 학생 실명 마스킹 / 언마스킹 규칙
│   │   └── neisForbiddenWords.ts # 교육부 생기부 기재 금지어 사전 검증 규칙
│   └── ports/
│       └── IAiClientPort.ts      # AI 통신 추상화 포트
│
├── usecases/                    # 2. 유스케이스 계층 (비즈니스 흐름)
│   └── ai/
│       ├── PolishStudentRecordDraft.ts # 생기부 초안 기재요령 윤문
│       ├── ClassifyAndRouteMemo.ts     # 쌤핀 전역 메모 스마트 3단 자동 분류
│       ├── TransformParentNotice.ts    # 학부모 소통 쿠션어 변환
│       ├── ParseWorksheetImage.ts      # 활동지/칠판 사진 비전 분석
│       ├── DecomposeTodoTasks.ts       # 거대 업무 서브태스크 5단계 분해
│       └── AggregateYearEndReport.ts   # 1년 데이터 1M 토큰 종합 분석
│
├── adapters/                    # 3. 어댑터 계층 (UI, 스토어)
│   ├── components/common/ai/
│   │   ├── AiAssistantModal.tsx        # 공통 AI 추천 문장 선택/교체 팝업
│   │   ├── AiGenerateButton.tsx        # 로딩 스피너 포함 트리거 버튼
│   │   ├── AiVisionUploadButton.tsx    # 칠판/활동지 사진 AI 분석 버튼
│   │   └── AiDiffViewer.tsx            # 원본 vs 수정본 비교 뷰어
│   └── stores/
│       └── useAiAssistantStore.ts      # AI 요청/결과/라우팅 글로벌 상태 관리
│
└── infrastructure/              # 4. 인프라 계층 (외부 통신)
    └── ai/
        ├── ZeroSetupAiClient.ts        # OpenCode Zen REST 통신 및 라우팅 엔진
        └── promptTemplates/
            ├── studentRecordPrompts.ts
            ├── memoClassificationPrompts.ts
            ├── parentNoticePrompts.ts
            ├── visionWorksheetPrompts.ts
            └── yearEndAggregationPrompts.ts
```

---

## 3. 스마트 모델 자동 라우팅 매트릭스 (Model Routing Matrix)

선생님은 모델을 직접 고를 필요 없이, 작업 유형(Task Type)에 따라 시스템이 최적의 모델을 자동 호출합니다.

| 작업 유형 (Task)                          | 자동 라우팅 모델                       | 모델 스펙 및 선정 근거                                             | 주요 적용 기능                                                                                      |
| :---------------------------------------- | :------------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| **정밀 텍스트 윤문 & 규정 준수**          | `opencode/deepseek-v4-flash-free`      | • Reasoning(추론) 지원<br>• 한국어 문장력 최상<br>• 200k 토큰      | • 생기부 기재요령 3단 윤문<br>• 학부모 상담 쿠션어 변환<br>• 수행평가 루브릭 생성                   |
| **사진 / 손글씨 / 음성 분석**             | `opencode/mimo-v2.5-free`              | • 멀티모달 비전/오디오 지원<br>• `attachment: true`<br>• 200k 토큰 | • 칠판 판서 사진 ➡️ 수업일지<br>• 학생 손글씨 활동지 피드백<br>• 상담 녹음 음성 요약                |
| **1년 치 전교생 / 초대형 문서 분석**      | `opencode/nemotron-3-ultra-free`       | • **1,000,000 토큰 (1M)**<br>• 초장문 Needle-in-Haystack 최우수    | • 학급 30명 1년 전체 데이터 종합<br>• 두꺼운 교육과정 편성표 분석<br>• 다음 담임 인수인계 카드 생성 |
| **초고속 실시간 라우팅 / 일괄 대량 출력** | `opencode/nemotron-3.5-lightning-free` | • 지연시간 최소화<br>• **26.2만 토큰 최대 출력**                   | • 사이드핀 퀵 메모 0.5초 분류<br>• 30명 생기부 일괄 동시 출력<br>• 할일 5단계 고속 분해             |

---

## 4. Phase 1 (MVP) 상세 요구사항 및 유저 스토리

---

### 🌟 Epic 1: 학생생활기록부 기재요령 기반 초안 3단 윤문기

#### [User Story 1.1]

> **담임/교과 교사**로서,  
> 관찰 메모를 거칠게 입력한 후 **[AI 기재요령 윤문]** 버튼을 누르면,  
> 교육부 훈령을 준수한 **3가지 스타일(표준형, 역량강조형, 인성강조형)**의 문장을 제안받아  
> 클릭 한 번으로 생기부 칸에 적용하고 싶다.

- **연동 대상 컴포넌트**: [`src/adapters/components/RecordDraft/RecordDraftView.tsx`](file:///E:/github/ssampin/src/adapters/components/RecordDraft/RecordDraftView.tsx)
- **라우팅 모델**: `opencode/deepseek-v4-flash-free`
- **인수 조건 (Acceptance Criteria)**:
  1. [ ] `RecordDraftView`의 각 학생별 텍스트 에디터 우측 상단에 `[AI 윤문]` 아이콘 버튼이 노출된다.
  2. [ ] 클릭 시 학생 이름이 `학생A`로 치환되어 API에 전달된다.
  3. [ ] 로딩 상태(`생기부 다듬는 중...`) 표시 후, 3가지 옵션 카드 모달이 뜬다.
  4. [ ] 각 카드에는 실명으로 복원된 문장과 예상 바이트 수(NEIS 바이트)가 표시된다.
  5. [ ] **[이 문장 적용]** 클릭 시 원본 에디터 내용이 해당 문장으로 교체된다.

---

### 🌟 Epic 2: 쌤핀 전역 스마트 메모 3단 자동 분류기 (메인/사이드핀/대시보드)

#### [User Story 1.2]

> **교사**로서,  
> 메인 메모, 사이드핀, 대시보드 어디서든 한 줄 메모를 적고 **[AI 자동 분류]**를 누르면,  
> **[할 일(Todo)]**, **[학생 누가기록]**, **[상담 일정]**으로 자동 분해되어  
> 각 탭으로 원클릭 저장하고 싶다.

- **연동 대상 컴포넌트**:
  - 메인 메모: [`src/adapters/components/Memo/MemoEditor.tsx`](file:///E:/github/ssampin/src/adapters/components/Memo/MemoEditor.tsx)
  - 사이드핀: [`src/adapters/components/SidePin/SidePinMemoEditor.tsx`](file:///E:/github/ssampin/src/adapters/components/SidePin/SidePinMemoEditor.tsx)
  - 대시보드: [`src/adapters/components/Dashboard/DashboardMemo.tsx`](file:///E:/github/ssampin/src/adapters/components/Dashboard/DashboardMemo.tsx)
- **라우팅 모델**: `opencode/nemotron-3.5-lightning-free` (초고속 반응)
- **인수 조건 (Acceptance Criteria)**:
  1. [ ] 메모 작성 툴바에 `[AI 스마트 정리]` 버튼이 노출된다.
  2. [ ] 클릭 시 메모 내용을 파싱하여 분류된 항목 미리보기 모달을 띄운다.
  3. [ ] 교사가 체크박스로 원하는 항목만 선택하여 `[선택 항목 자동 저장]`을 누르면:
     - `useTodoStore` ➡️ 새 할일 추가
     - `useObservationStore` ➡️ 지훈이 누가기록 추가
     - `useConsultationStore` ➡️ 영희 상담 예약 추가

---

### 🌟 Epic 3: 학부모 소통 쿠션어(샌드위치 화법) 변환기

#### [User Story 1.3]

> **담임 교사**로서,  
> 학생의 수업 방해나 생활지도 사항을 학부모에게 문자로 전달할 때,  
> 거친 메모를 입력하고 **[쿠션어 문자 생성]**을 누르면  
> 학부모의 감정을 배려하는 **정중한 3단 샌드위치 알림 문자**로 자동 변환하고 싶다.

- **연동 대상 컴포넌트**: [`src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx`](file:///E:/github/ssampin/src/adapters/components/Homeroom/Consultation/ConsultationCreateModal.tsx)
- **라우팅 모델**: `opencode/deepseek-v4-flash-free`
- **인수 조건 (Acceptance Criteria)**:
  1. [ ] 상담 생성 모달 내 '학부모 소통용 문자' 필드 옆에 `[쿠션어로 다듬기]` 버튼 제공.
  2. [ ] 클릭 시 즉시 샌드위치 화법으로 변환된 문안이 텍스트박스에 채워짐.
  3. [ ] `[클립보드 복사]` 버튼으로 메신저나 문자 발송 툴에 바로 붙여넣을 수 있음.

---

### 🌟 Epic 4: 일정 ➡️ 사전 준비 할일 자동 추천 및 서브태스크 분해

#### [User Story 1.4]

> **교사**로서,  
> NEIS 학사일정(시험, 체험학습 등)이 등록되면 D-Day별 준비 Todo를 자동 추천받고,  
> 거대한 대형 업무를 입력했을 때 5단계 세부 체크리스트로 자동 분해하고 싶다.

- **연동 대상 컴포넌트**: [`src/adapters/components/Schedule/NeisSchedulePanel.tsx`](file:///E:/github/ssampin/src/adapters/components/Schedule/NeisSchedulePanel.tsx), [`src/adapters/components/Todo/TodoEditor.tsx`](file:///E:/github/ssampin/src/adapters/components/Todo/TodoEditor.tsx)
- **라우팅 모델**: `opencode/deepseek-v4-flash-free`
- **인수 조건 (Acceptance Criteria)**:
  1. [ ] NEIS 학사일정 카드에 `[D-Day 할일 생성]` 퀵 액션 버튼 제공.
  2. [ ] Todo 작성 시 큰 제목 입력 후 `[AI 5단계 분해]` 클릭 시 하위 체크리스트 자동 추가.

---

## 5. Phase 2 & Phase 3 확장 로드맵 (멀티모달 및 초대형 분석)

### Phase 2: 멀티모달 활동지 & 칠판 판서 분석

- **모델**: `opencode/mimo-v2.5-free`
- **기능**:
  - 칠판 판서 사진 업로드 ➡️ 디지털 수업 진도 일지 자동 변환
  - 학생 손글씨 활동지 사진 ➡️ 내용 요약 및 칭찬 피드백 생성

### Phase 3: 1M 토큰 1년 전체 데이터 종합 분석

- **모델**: `opencode/nemotron-3-ultra-free`
- **기능**:
  - 1년 치 출결/상담/과제/누가기록 전체 통째 입력 ➡️ 다음 학년 담임용 인수인계 카드 자동 생성
  - 교우관계 설문 데이터 분석 ➡️ 소외 학생 감지 및 자리배치 모둠 매칭

---

## 6. 보안 및 품질 보증 (QA Matrix)

| 테스트 카테고리          | 검증 항목                       | 합격 기준                                                  |
| :----------------------- | :------------------------------ | :--------------------------------------------------------- |
| **단위 테스트 (Vitest)** | `aiAnonymizerRules.test.ts`     | 학생 실명 100% 가명화 및 복원 검증                         |
| **단위 테스트 (Vitest)** | `AiModelRouter.test.ts`         | 작업 유형 및 파일 첨부 여부에 따른 정확한 모델 라우팅 검증 |
| **단위 테스트 (Vitest)** | `neisForbiddenWords.test.ts`    | 교외 수상실적, 토익, 부모 직업 필터링 검증                 |
| **통합 테스트**          | `ZeroSetupAiClient.test.ts`     | 네트워크 타임아웃(15초) 및 에러 시 우아한 실패 처리        |
| **UI 테스트**            | `AiAssistantModal.test.tsx`     | 3가지 옵션 선택 시 에디터 교체 동작 검증                   |
| **E2E 수동 검증**        | 교사 실무 관찰 메모 10건 테스트 | 문체 종결어미(`~함`, `~보임`) 준수율 100%                  |

---

_본 문서는 쌤핀의 Zero-Setup 멀티모델 AI 어시스턴트 Phase 1 MVP ~ Phase 3 개발을 위한 마스터 PRD입니다._
