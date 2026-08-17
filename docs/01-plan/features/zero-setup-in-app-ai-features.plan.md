# 쌤핀(SsaemPin) 무설정(Zero-Setup) 멀티모델 AI 기능 기획 및 아키텍처 명세서

> 파일명: `docs/01-plan/features/zero-setup-in-app-ai-features.plan.md`  
> 최종 수정: 2026-08-17  
> 상태: Draft / Approved Master Plan

---

## 1. 개요 및 배경 (Executive Summary)

### 1.1 배경 및 목적

현직 초·중·고 교사들은 수업 외에도 **생활기록부 작성, 상담 일지 정리, 학부모 소통, 수행평가 루브릭 개발, 출결 및 안전 관리** 등 고도의 인지 부하와 감정 소모를 동반하는 행정 업무에 매일 수시간을 쏟고 있습니다.

기존 상용 AI 서비스(ChatGPT, Claude 등)는 교사들에게 다음과 같은 심각한 진입 장벽이 존재합니다:

1. **복잡한 설정**: 회원가입, 해외 결제 카드 등록, API 키 발급 및 복사/붙여넣기
2. **비용 부담**: 매월 $20 결제 또는 토큰 과금
3. **보안/개인정보 불안**: 학생 실명 노출에 따른 교육청 감사 위험

### 1.2 해결 전략: "Zero-Setup Multi-Model Portfolio"

쌤핀 앱 내부에 **무설정·무료 고성능 오픈 모델 라인업**을 구축하고, 작업 유형에 따라 최적의 모델을 자동 라우팅(Auto-Routing)합니다.

1. **텍스트 추론/문체 윤문**: `deepseek-v4-flash-free` (Reasoning 특화, 200k 토큰)
2. **멀티모달 (사진/손글씨/음성)**: `mimo-v2.5-free` (비전/오디오 입력 지원)
3. **초대형 빅데이터/전교 문서 분석**: `nemotron-3-ultra-free` (1,000,000 토큰 / 1M 컨텍스트)
4. **초고속 퀵 라우팅 & 대량 일괄 출력**: `nemotron-3.5-lightning-free` (26.2만 토큰 최대 출력)

선생님은 모델을 고를 필요 없이 **버튼 하나만 누르면** 백그라운드에서 최적의 모델이 호출됩니다.

---

## 2. 보안 및 교육청 개인정보 보호 설계 (Security & Privacy Pipeline)

학생 개인정보(실명, 식별 정보)가 외부 API로 노출되지 않도록 전송 전 **클라이언트단 자동 비식별화(Masking) 엔진**을 기본 적용합니다.

```mermaid
flowchart LR
    A[선생님 메모/기록] --> B[쌤핀 비식별화 필터\n'김철수' -> '학생A']
    B --> C[OpenCode Smart Router\n최적 무료 모델 자동 선택]
    C --> D[AI 결과 생성]
    D --> E[쌤핀 복원 필터\n'학생A' -> '김철수']
    E --> F[최종 렌더링/입력창 반영]
```

1. **자동 가명화 (Anonymization)**: 학생 이름 ➡️ `학생A`, `학생B` 또는 `OO 학생`으로 치환 후 API 호출.
2. **기재 금지어 실시간 검증 (Compliance Guard)**: 교외 수상실적, 사교육 유발 요소, 공인어학성적, 부모 사회경제적 지위 암시 문구 등 교육부 생기부 기재 금지어를 로컬 정규식으로 1차 사전 차단.

---

## 3. 스마트 모델 자동 라우팅 매트릭스 (Model Routing Matrix)

| 작업 유형                | 자동 라우팅 모델              | 모델 특징                                  | 적용 기능                                                        |
| :----------------------- | :---------------------------- | :----------------------------------------- | :--------------------------------------------------------------- |
| **정밀 텍스트 윤문**     | `deepseek-v4-flash-free`      | Reasoning 지원, 한국어 문장력 최상         | 생기부 기재요령 윤문, 학부모 상담 쿠션어, 수행평가 루브릭        |
| **멀티모달 (사진/음성)** | `mimo-v2.5-free`              | 비전(이미지), 오디오 입력 지원             | 칠판 사진 ➡️ 수업일지, 손글씨 활동지 피드백, 상담 음성 녹음 요약 |
| **초장문 빅데이터**      | `nemotron-3-ultra-free`       | **1,000,000 토큰 (1M)** 컨텍스트           | 학급 30명 1년 전체 데이터 종합 분석, 교육과정 편제표 HWPX 분석   |
| **초고속 퀵 라우팅**     | `nemotron-3.5-lightning-free` | 지연시간 최소화, **26.2만 토큰 최대 출력** | 사이드핀 퀵 메모 0.5초 분류, 30명 생기부 일괄 동시 생성          |

---

## 4. 전체 기능 목록 및 컴포넌트 매핑

### [Group A] 생활기록부 & 학생 평가 (High Impact)

1. **생기부 기재요령 초안 3단 윤문기** (`RecordDraftView.tsx`) ➡️ `deepseek-v4-flash`
2. **누가기록(Evidence) 기반 생기부 문단 자동 생성** (`RecordEvidenceView.tsx`) ➡️ `deepseek-v4-flash`
3. **성취기준 기반 수행평가 루브릭(채점표) 생성** (`AssignmentDetail.tsx`) ➡️ `deepseek-v4-flash`

### [Group B] 학급 경영 & 교우 관계 (High Care)

4. **학부모 소통 쿠션어(샌드위치 화법) 변환기** (`ConsultationCreateModal.tsx`) ➡️ `deepseek-v4-flash`
5. **상담 메모 공식 기록화 & 교실 지도 팁 추천** (`ConsultationDetail.tsx`) ➡️ `deepseek-v4-flash`
6. **교우관계도(소시오그램) 기반 소외 학생 조기 감지 & 짝 매칭** (`SurveyDetail.tsx`, `Seating.tsx`) ➡️ `nemotron-3-ultra`
7. **1년 기록 압축 '다음 담임용 학생 인수인계 카드'** (`StudentRecords`, `Archive`) ➡️ `nemotron-3-ultra`

### [Group C] 일상 수업 & 메모 & 일정 & 안전 (Daily Boost)

8. **쌤핀 전역 메모 스마트 3단 자동 분류기** (`MemoEditor.tsx`, `SidePinMemoEditor.tsx`, `DashboardMemo.tsx`) ➡️ `nemotron-3.5-lightning`
9. **NEIS 학사일정 기반 D-Day 사전 준비 Todo 자동 추천** (`NeisSchedulePanel.tsx`, `TodoEditor.tsx`) ➡️ `deepseek-v4-flash`
10. **거대 행정 업무의 5단계 서브태스크 자동 분해** (`TodoEditor.tsx`) ➡️ `deepseek-v4-flash`
11. **칠판 판서 & 학생 손글씨 활동지 비전 분석** (`SidePinMemoEditor.tsx`, `PraiseMemoSheet.tsx`) ➡️ `mimo-v2.5-free`
12. **NEIS 식단 자동 대조 알레르기 학생 안심 알림** (`Meal`, `Dashboard`) ➡️ 로컬 룰베이스 + AI
13. **실시간 월보드 학생 의견 AI 실시간 토론 맵** (`RealtimeWall`) ➡️ `deepseek-v4-flash`
14. **수업 중 즉석 3단계 수준별 발문(질문) 생성기** (`ClassManagement`) ➡️ `deepseek-v4-flash`

---

## 5. 단계별 개발 로드맵 (Phased Roadmap)

| 단계                          | 주요 기능                                                                                                             | 대상 컴포넌트                                                                                                                    | 모델 라우팅                              |
| :---------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| **Phase 1 (MVP)**             | 1. 생기부 문체 자동 윤문<br>2. 전역 스마트 메모 분류<br>3. 학부모 쿠션어 변환<br>4. NEIS D-Day Todo 추천              | `RecordDraftView.tsx`<br>`MemoEditor.tsx`<br>`SidePinMemoEditor.tsx`<br>`ConsultationCreateModal.tsx`<br>`NeisSchedulePanel.tsx` | `deepseek-flash`<br>`nemotron-lightning` |
| **Phase 2 (멀티모달 & 수업)** | 5. 칠판 판서/활동지 비전 분석<br>6. 수행평가 루브릭 생성<br>7. 상담록 공식화 & 지도 팁                                | `SidePinMemoEditor.tsx`<br>`AssignmentDetail.tsx`<br>`ConsultationDetail.tsx`                                                    | `mimo-v2.5-free`<br>`deepseek-flash`     |
| **Phase 3 (초장문 & 안전)**   | 8. 1년 데이터 종합 인수인계 카드<br>9. 소시오그램 짝 매칭<br>10. 급식 알레르기 안심 알림<br>11. 실시간 월보드 토론 맵 | `StudentRecords`<br>`Seating.tsx`<br>`Meal`<br>`RealtimeWall`                                                                    | `nemotron-3-ultra`<br>`deepseek-flash`   |

---

_본 문서는 쌤핀 프로젝트의 마스터 기획 및 기술 명세서입니다._
