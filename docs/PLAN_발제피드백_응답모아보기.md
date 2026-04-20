# 쌤핀 "발제 피드백 + 응답 모아보기" 기능 계획서

> **작성일:** 2026-04-19 (v2 개정: 2026-04-19)
> **배경:** 교사 사례나눔 발제 후 간단히 질문/도움말/피드백(떠오르는 단어, 사진)을 나누고,
> 응답을 스프레드시트처럼 한꺼번에 볼 수 있는 기능 요청
>
> **v2 개정 요점 (코드베이스 검증 반영):**
> - Supabase Storage는 **현재 미도입** 상태임을 명시 (기존 v1의 "이미 인프라 존재" 서술 정정)
> - 프리셋 저장 위치를 `adapters/constants/`로 이동 (도메인 오염 방지)
> - 기존 MultiSurvey `create/running/result` 단계와 SpreadsheetView의 통합 방식 명문화
> - Excel 직렬화 규칙(배열/숫자/빈값) 구체화
> - 응답자 식별/익명 처리 정책 추가
> - Phase 기간 상향 (디자인 튜닝·e2e 반영)
>
> **v3 개정 요점 (대안 분석 결과 반영):**
> - Phase 3 이미지 응답: **A안(WebSocket+로컬 파일) 단독 채택 확정**. 가중 스코어링 결과 A=70 / B=42 / C=53
> - B/C안은 각각 "오프라인 강점 훼손"과 "원 요구 시나리오 55% 미충족"으로 배제
> - 하이브리드 진화 경로를 **Phase 5 조건부**로 신설 (YAGNI — 사용자 수요 발생 시에만 착수)
> - EXIF orientation 정규화, 썸네일 필수화, Drive 백업 확장 등 분석에서 도출된 함정을 구현 체크리스트에 반영
> - [부록 A: 대안 비교 분석](#부록-a-이미지-응답-대안-비교-분석) 추가 (의사결정 추적성 확보)

---

## 1. 레퍼런스 분석

### 1-1. 글로벌 도구 벤치마크

**Mentimeter**
- 발표 후 피드백: 워드클라우드, 주관식(Open Ended), 척도, Quick Form(복합 필드)
- 주관식 응답 표시: 말풍선 / 흐르는 그리드 / 하나씩 보기 3가지 모드
- 11개 이상 응답 시 AI 자동 그룹핑으로 유사 응답 묶기
- 내보내기: Excel(XLSX) — 유료만 가능
- 무료 제한: 월 50명 참여자, 데이터 내보내기 불가

**Padlet**
- 포스트 기반 수집: 텍스트 + 이미지 + 동영상 + 파일 모두 가능 (이미지 응답의 유일한 강자)
- Grid/Wall 레이아웃으로 모든 응답을 갤러리형 동시 조망
- 반응(좋아요/별점/투표) + 댓글로 상호 피드백
- 내보내기: 이미지, PDF, 스프레드시트
- 무료 제한: 패들릿 3개

**Slido**
- 6가지 폴 유형 + Q&A(업보트) + 피드백 서베이
- 내보내기: Excel + Google Sheets 직접 연동 (유일)
- 무료 제한: 이벤트당 100명, 폴 3개, 내보내기는 유료

**Wooclap**
- 20가지 이상 질문 유형, Find on Image(이미지 위 위치 클릭)
- Grid View: 개인별 응답 탐색, 평균 점수 비교
- 개인화된 학습자 보고서 PDF 공유 (독보적)
- 무료 제한: 이벤트당 1,000명(관대), 질문 2개

**Poll Everywhere**
- 텍스트 월(Text Wall): 주관식 전체 응답 동시 조망
- Response Pivot Table: 다수 활동의 전체 응답 상세 테이블
- Responses by Participant: 참여자별 응답 스냅샷
- Clickable Image: 이미지 특정 위치 클릭 응답

### 1-2. 한국 교육 도구 벤치마크

**띵커벨**
- 퀴즈 9종 + 토론/설문 7종 (워드클라우드 포함)
- 엑셀 리포트 다운로드 지원
- 교사 인증 시 무료, 최대 20명(무료)/300명(유료)
- 한국 교사 커뮤니티에서 연수 피드백 활용 사례 가장 풍부

**구글 폼**
- 스프레드시트 1클릭 연동 → 실시간 자동 저장 (핵심 레퍼런스)
- [응답] → [요약] 탭: 모든 문항 응답 한 화면 집계
- 완전 무료, 확장성 최고
- 워드클라우드는 기본 미지원

**클래스팅** — AI 평가 중심, 설문 기능 약함
**하이클래스** — 학급관리 중심, 설문은 가정통신문 수준
**캔바 교육용** — 슬라이드 내 투표/퀴즈, 데이터 내보내기 없음

### 1-3. 핵심 인사이트

| 기능 | 최고 레퍼런스 | 쌤핀 현재 상태 | 갭 |
|------|-------------|--------------|-----|
| 응답 모아보기 (테이블형) | 구글 폼 요약탭, Poll Everywhere Pivot Table | 없음 (결과 저장만 가능) | **큰 갭** |
| 엑셀 내보내기 | 구글 폼, Mentimeter, 띵커벨 | ExcelExporter 있으나 설문 결과 미지원 | **중간 갭** |
| 이미지 응답 | Padlet (직접 업로드) | 미지원 | **큰 갭** |
| 워드클라우드 | Mentimeter, Wooclap, 띵커벨 | 이미 있음 (ToolWordCloud) | 없음 |
| 실시간 응답 표시 | Mentimeter 흐르는 그리드, Padlet Wall | WebSocket 인프라 있음 | **UI만 추가** |
| 발제 피드백 프리셋 | Wooclap One-Minute Paper | 템플릿 시스템 있으나 프리셋 부족 | **작은 갭** |
| 구글시트 연동 | Slido (직접 연동), 구글 폼 | Google OAuth+Drive 있으나 Sheets API 없음 | 큰 갭(후순위) |

---

## 2. 쌤핀 현재 기술 분석

### 2-1. 기존 설문 시스템 구조

**두 개의 독립 시스템이 공존:**

**A. 실시간 도구 (WebSocket 기반)**
- Poll, Survey, MultiSurvey, WordCloud, 토론 도구
- Electron 로컬 서버 → Cloudflare 터널 → QR 접속
- 데이터: 세션 중 메모리, 종료 시 `useToolResultStore`에 로컬 저장
- 주요 파일: `electron/ipc/liveMultiSurvey.ts`, `liveMultiSurveyHTML.ts`

**B. 체크리스트 설문 (Supabase 기반)**
- 학생 자기제출, PIN 보호, 마감일 설정
- 데이터: Supabase `surveys` + `survey_responses` 테이블
- 폴링(30초) 방식, 실시간 아님
- 주요 파일: `SurveySupabaseClient.ts`, `landing/src/app/check/[id]/page.tsx`

### 2-2. 확장 가능한 기존 인프라

**이미 있는 것 (재활용 가능):**
- `ExcelExporter.ts` — ExcelJS 기반, `applyHeaderStyle()`/`applyCellStyle()` 유틸
- `useToolResultStore` — 최대 200개 결과 저장, 타입별 필터링
- `useToolTemplateStore` — 100개 템플릿, 타입별 관리
- Cloudflare 터널 + WebSocket + QR + Short Link 인프라
- Google OAuth + Drive API 연동
- `ToolMultiSurvey` — 4가지 질문 유형(single-choice, multi-choice, text, scale)
- Supabase **DB** 인프라 (surveys, survey_responses, chat, analytics 테이블 등)

**없는 것 (새로 만들어야 할 것):**
- 설문 결과 테이블/그리드 뷰 컴포넌트
- 설문 결과 → Excel 내보내기 함수
- 이미지 업로드 질문 유형 + **저장 인프라 신설** (아래 주의사항 참고)
- 실시간 피드백 월 디스플레이

**⚠️ 주의: Supabase Storage는 현재 미도입 상태**
- `supabase/migrations/001~025` 전체에서 Storage bucket/RLS 정의 **없음**
- 코드베이스 전역에서 `storage.from(...)` 호출 **0건**
- Supabase는 현재 **DB 테이블만** 사용 중
- → Phase 3 이미지 응답은 "기존 인프라 재활용"이 아니라 **신규 인프라 도입** 작업으로 분류

### 2-3. 핵심 타입/인터페이스

```
MultiSurveyQuestionType = 'single-choice' | 'multi-choice' | 'text' | 'scale'
MultiSurveyAnswer.value = string | string[] | number
ToolResultType = 'poll' | 'survey' | 'multi-survey' | 'wordcloud' | ...
ToolTemplateType = 'poll' | 'survey' | 'multi-survey' | 'wordcloud' | 'discussion'
```

---

## 3. 기능 설계

### Feature 1: 스프레드시트형 응답 모아보기 (SpreadsheetView)

**목표:** 설문 결과를 구글 폼 [응답]→[요약] 탭 + Poll Everywhere Pivot Table처럼 한눈에 조망

**구성:**

**A. 요약 뷰 (Summary View)**
- 각 질문별 집계: 선택형은 막대그래프, 텍스트는 빈도/목록, 척도는 평균/분포
- 전체 참여 수, 완료율 표시
- 레퍼런스: 구글 폼 [요약] 탭

**B. 테이블 뷰 (Table View)**
- 행 = 응답자(제출 순서), 열 = 질문
- 셀: 선택 응답은 텍스트, 텍스트 응답은 말줄임+확장, 척도는 숫자
- 정렬: 열 헤더 클릭으로 오름/내림차순
- 필터: 특정 선택지 응답자만 필터링
- 검색: 텍스트 응답 키워드 검색
- 레퍼런스: Poll Everywhere Pivot Table

**C. 개인별 뷰 (Individual View)**
- 응답자 1명의 전체 답변을 카드형으로 표시
- 좌우 화살표로 응답자 간 이동
- 레퍼런스: 구글 폼 [개별] 탭

**구현 위치:**
- 새 컴포넌트: `src/adapters/components/Tools/Results/SpreadsheetView.tsx`
- 하위: `SummaryTab.tsx`, `TableTab.tsx`, `IndividualTab.tsx`
- 데이터: `useToolResultStore`에서 `MultiSurveyResultData` 로드
- 진입점: `ToolMultiSurvey.tsx` 결과 단계 + `PastResultsView.tsx`에서 과거 결과 열기

**기존 MultiSurvey 단계와의 통합 방식 (명문화):**
- `ToolMultiSurvey`는 현재 `create / running / result` 3단계 구조.
- **`result` 단계를 SpreadsheetView로 대체**하고, 기존 단순 결과 집계 UI는 제거.
- `PastResultsView`에서 과거 결과 클릭 시 모달 또는 라우트로 같은 `SpreadsheetView`를 재사용 (스토어 없이 `MultiSurveyResultData` prop으로 주입 가능하도록 설계).
- 병존을 피해 유지보수 부담 제거.

**기술 결정:**
- 테이블 라이브러리: CSS Grid 직접 구현 (의존성 최소화, 쌤핀 기존 스타일 일관성)
- 기존 Tailwind + 디자인 토큰(`sp-card`, `sp-border` 등) 사용

**응답자 식별/익명성 정책:**
- 기본: 제출 순서 번호만 노출 (`응답 1`, `응답 2`, ...). 내부적으로 `submissionId`(uuid) 보관.
- 설정 토글: **"응답자 구분 표시"** on/off (기본 on). off 시 테이블 뷰 행·개별 뷰 모두 "익명" 처리.
- 향후 로그인 기반 설문 시 `submittedBy` 필드가 추가되면 "이름 표시" 옵션 확장 여지.
- Excel 내보내기 시에도 동일 정책 적용 (익명 모드면 번호만 출력).

---

### Feature 2: 설문 결과 Excel 내보내기

**목표:** 결과를 .xlsx로 1클릭 다운로드. 띵커벨/Mentimeter 수준.

**구현:**

`ExcelExporter.ts`에 함수 추가:

```
exportToolResultToExcel(result: ToolResult): ArrayBuffer
```

**시트 구성:**
- Sheet 1 "요약": 질문별 통계 (선택형: 옵션별 응답 수/비율, 텍스트: 응답 수, 척도: 평균/중앙값)
- Sheet 2 "전체 응답": 피벗 테이블 형태 (행=응답자, 열=질문)
- Sheet 3 "워드 빈도" (텍스트 질문이 있을 때만): 단어-빈도 정렬 목록

**셀 직렬화 규칙 (`MultiSurveyAnswer.value` 변환):**

| 질문 유형 | `value` 타입 | Sheet 2 셀 출력 |
|-----------|-------------|-----------------|
| `single-choice` | `string` (option id) | 옵션 텍스트 (id 해석 후) |
| `multi-choice` | `string[]` (option ids) | 옵션 텍스트들을 **세미콜론(`; `) 조인**. 추후 "열 분할" 옵션 추가 여지 |
| `text` | `string` | 원문 그대로 (긴 텍스트도 wrap) |
| `scale` | `number` | 숫자 셀 (Excel 숫자 포맷 적용) |
| 미응답 | `undefined` | 빈 셀 (`''`, 회색 배경으로 구분) |

- **필터/정렬 고려:** 멀티초이스 세미콜론 조인 컬럼은 정렬은 문자열 기준. 사용자가 개별 선택지별 필터를 원하면 Phase 4에서 "선택지별 컬럼 분할 모드" 옵션으로 확장.

**지원 결과 유형:**
- `multi-survey` → 위 3시트
- `poll` → 질문 + 옵션별 투표수 + 총 투표수
- `survey` → 질문 + 텍스트 응답 목록
- `wordcloud` → 단어-빈도 목록

**구현 위치:**
- `src/infrastructure/export/ExcelExporter.ts`에 함수 추가
- SpreadsheetView + PastResultsView에서 "엑셀 다운로드" 버튼 연결

---

### Feature 3: 발제 피드백 프리셋 템플릿

**목표:** "사례나눔 발제 후 피드백"을 1클릭으로 시작

**프리셋 정의:**

**프리셋 A: "발제 퀵 피드백"**
- Q1: 발제를 보고 떠오르는 키워드는? (text, maxLength: 50)
- Q2: 발제 내용 중 가장 인상 깊었던 점은? (text, maxLength: 200)
- Q3: 발제 내용의 이해도는? (scale, 1~5)
- Q4: 발제자에게 질문이 있다면? (text, maxLength: 200)

**프리셋 B: "사례나눔 리플렉션"**
- Q1: 이 사례에서 배울 수 있는 점은? (text, maxLength: 200)
- Q2: 나의 수업에 적용해보고 싶은 아이디어는? (text, maxLength: 200)
- Q3: 사례 공유에 대한 만족도 (scale, 1~5)
- Q4: 추가로 나누고 싶은 이야기 (text, maxLength: 300)

**프리셋 C: "소풍 활동 소감"**
- Q1: 오늘 활동에서 떠오르는 단어 3가지 (text, maxLength: 50)
- Q2: 가장 기억에 남는 순간은? (text, maxLength: 200)
- Q3: 활동 만족도 (scale, 1~5)
- Q4: 다음에 해보고 싶은 활동은? (text, maxLength: 200)

**구현 위치:**
- `ToolMultiSurvey.tsx`의 create 단계에 "프리셋 선택" 영역 추가 (`PresetSelector` 패턴 재사용)
- 프리셋 상수 파일: **`src/adapters/constants/feedbackPresets.ts`**
  - ❌ `src/domain/entities/`에 두지 않음 — 하드코딩된 UI 시딩 데이터는 도메인 규칙이 아니므로 CLAUDE.md의 4-레이어 의존성 규칙에 따라 adapters 계층이 정합.
  - 기존 `src/adapters/constants/toolDefinitions.ts` 옆에 배치하여 관례 일관성 유지.
- 사용자 커스텀 템플릿(`useToolTemplateStore`)과는 **분리** (시스템 기본값 vs 사용자 저장값).

---

### Feature 4: 라이브 피드백 월 (Live Feedback Wall)

**목표:** 발제 중 프로젝터에 띄워놓고 응답이 실시간으로 쌓이는 화면. Padlet Wall + Mentimeter 흐르는 그리드 레퍼런스.

**디스플레이 모드:**

**모드 A: 카드 월 (Card Wall)**
- 텍스트 응답이 포스트잇/카드 형태로 실시간 추가
- 새 카드는 fade-in 애니메이션으로 등장
- 카드 클릭 시 풀 텍스트 확대
- 선생님이 특정 카드 하이라이트/고정 가능
- 레퍼런스: Padlet Wall, Poll Everywhere Text Wall

**모드 B: 워드클라우드 라이브**
- 이미 있는 ToolWordCloud의 풀스크린 버전
- 단어가 들어올 때마다 크기 실시간 변화

**모드 C: 투표 라이브**
- 이미 있는 Poll의 풀스크린 버전
- 막대그래프 실시간 성장

**구현 위치:**
- 새 컴포넌트: `src/adapters/components/Tools/FeedbackWall/`
  - `FeedbackWallView.tsx` — 풀스크린 디스플레이 (교사 측 Electron 뷰)
  - `FeedbackWallCard.tsx` — 개별 카드
- **IPC/WebSocket 변경 없음.** 기존 `liveMultiSurvey` 세션의 제출 이벤트를 **React 뷰에서만** 구독하여 카드로 렌더링.
  - 학생 측 HTML(`liveMultiSurveyHTML.ts`)은 변경 불필요.
  - 메시지 스키마 추가 없음 → 기존 세션과 하위 호환.

**기술 결정:**
- 기존 MultiSurvey `running` 단계에 **"피드백 월 보기"** 토글 추가 (기본 폼 뷰 ↔ 월 뷰 전환).
- 별도 세션/별도 IPC 불필요 — 같은 세션의 응답을 다른 뷰로 표시.

---

### Feature 5: 이미지 응답 타입 (후순위)

**목표:** "떠오르는 사진"을 학생이 카메라/갤러리에서 업로드

**✅ 최종 결정: A안 (WebSocket + Electron 로컬 파일 저장) 단독 채택**

3개 대안(A: 로컬 파일, B: Supabase Storage, C: 체크리스트 한정) 심층 분석 결과(가중 스코어링: A=70, B=42, C=53), **A안을 단독 채택**한다. B/C안은 각각 "오프라인 강점 훼손"과 "원 요구 시나리오 55% 미충족" 이슈로 배제. 상세 분석 근거는 본 문서 말미 [부록 A: 대안 비교 분석](#부록-a-이미지-응답-대안-비교-분석) 참고.

**채택 근거 요약:**
- **브랜드 일관성**: 쌤핀 §6 경쟁 우위("오프라인 가능") 완전 보존
- **운영 비용**: $0 (로컬 디스크) — B안 대비 월 $25+ 절감
- **법적 부담 최소**: 학생 이미지가 외부 서버에 저장되지 않아 학부모 동의·개인정보 리스크 최소
- **데이터 소유권**: 교사 PC에 완전 귀속 — 쌤핀의 핵심 가치 제안과 정합
- **원 요구 95% 충족**: "발제 후 즉석 사진 수집" 시나리오 직접 지원
- **유일한 갭(URL 공유 불가)**: Phase 5 하이브리드 진화로 해소 경로 확보 (아래 참고)

**구현 방식:**
- 학생 모바일: `<input type="file" accept="image/*" capture="environment">` → Canvas API로 **EXIF orientation 정규화 + 리사이즈**(max 1280px, WebP, quality 0.7)
- 전송: WebSocket 바이너리 프레임 (base64 대비 33% 용량 절감 + CPU 이득). 프레임 상한 **2MB**, 초과 시 재압축 또는 거절
- 저장: Electron 메인이 `app.getPath('userData')/data/feedback-images/{sessionId}/{submissionId}.webp`에 원본 + `thumb_{submissionId}.webp`(200x200 썸네일) 생성
- `MultiSurveyAnswer.value`에는 `{ originalPath, thumbPath }` 객체 저장 (타입 확장 필요)
- Excel 내보내기: 결과 폴더를 **zip 번들**로 함께 내보냄 (ExcelJS 셀 이미지 임베드는 성능 이슈로 미채택)

**구현 범위 체크리스트:**
1. `MultiSurveyQuestionType`에 `'image'` 추가
2. `MultiSurveyAnswer.value` 타입 확장: `string | string[] | number | { originalPath: string; thumbPath: string }`
3. 학생 모바일 HTML 업로드 UI (`liveMultiSurveyHTML.ts` 확장) + 클라이언트 EXIF 정규화/리사이즈
4. WebSocket 바이너리 프레임 송수신 + 2MB 상한 로직
5. Electron IPC 이미지 저장 핸들러 + 썸네일 생성 (`sharp` 또는 Canvas)
6. 세션 종료 후 미저장 세션의 24h 클린업 크론
7. 결과 뷰에 갤러리 그리드 + 라이트박스 + 썸네일 기반 렌더링
8. SpreadsheetView 테이블에 이미지 썸네일 셀 표시
9. Excel 내보내기 시 동일 폴더로 zip 번들 생성
10. 설정 화면에 "이미지 스토리지 용량 표시 + 정리" UI
11. Google Drive 백업 로직 확장: `feedback-images/` 폴더 포함

**주의해야 할 구현 함정 (분석에서 도출):**
- iOS Safari EXIF orientation 미처리 시 90° 회전 저장 — 리사이즈 전 정규화 필수
- 썸네일 없이 원본 그리드 렌더링 시 메모리 폭발 — 썸네일 생성은 선택이 아닌 **필수**
- 디스크 용량 방치 시 수 GB 누적 — 설정 UI 필수
- Google Drive 백업이 현재 JSON 전용이라면 이미지 폴더 경로 추가 필요
- Cloudflare 터널 모드는 CF 무료 플랜 대역폭 점유 — 로컬 Wi-Fi 직접 접속은 무관

**향후 하이브리드 진화 경로 (Phase 5+):**
사용자로부터 "외부 URL 공유" 요구가 반복될 경우, **기본은 로컬 유지 + 교사가 원할 때만 "이 이미지 외부 공유하기" 버튼으로 선택 업로드**하는 하이브리드를 Phase 5에서 검토. 이 방식은 오프라인 강점을 훼손하지 않으면서 공유 기능을 추가할 수 있음. 즉석 도입은 하지 않음 (YAGNI).

---

## 4. 구현 로드맵

### Phase 1: 핵심 가치 전달 (스프레드시트 뷰 + Excel 내보내기)

**기간:** 4일 (구현 3일 + 디자인 튜닝·e2e 1일)
**우선순위 근거:** 사용자 피드백의 핵심 요구("한꺼번에 볼 수 있는 기능"), 기존 인프라 활용도 높음

작업 목록:
- [ ] `SpreadsheetView.tsx` 컴포넌트 (요약/테이블/개별 3탭, 탭 간 상태 보존)
- [ ] 응답자 익명/구분 토글 구현
- [ ] `ExcelExporter.ts`에 `exportToolResultToExcel()` 추가 (직렬화 규칙 표 기준)
- [ ] `ToolMultiSurvey.tsx` **`result` 단계를 SpreadsheetView로 대체** (기존 단순 집계 UI 제거)
- [ ] `PastResultsView.tsx`에서 과거 결과 SpreadsheetView 열기 (prop 주입 경로)
- [ ] Excel 다운로드 버튼 연결
- [ ] `design examples/` 톤에 맞춘 색/간격 튜닝, 브라우저/Electron 모두 동작 확인

### Phase 2: 빠른 시작 경험 (발제 프리셋 + 라이브 월)

**기간:** 4일 (구현 3일 + 디자인 튜닝·e2e 1일)
**우선순위 근거:** 사용자가 "발제 후 피드백" 시나리오를 1클릭으로 시작, 시각적 임팩트

작업 목록:
- [ ] `src/adapters/constants/feedbackPresets.ts` 프리셋 데이터 정의 (A/B/C 3종)
- [ ] `ToolMultiSurvey.tsx` create 단계에 프리셋 선택 UI (`PresetSelector` 재사용)
- [ ] `FeedbackWall/FeedbackWallView.tsx` 풀스크린 카드 월 디스플레이 (교사 뷰 전용)
- [ ] MultiSurvey `running` 단계에 "피드백 월 보기" 토글 (IPC 변경 없이 뷰 레이어만)
- [ ] 카드 fade-in 애니메이션, 카드 하이라이트/고정 기능
- [ ] 프로젝터 해상도 반응형 (1920x1080 기준 튜닝)

### Phase 3: 확장 (이미지 응답) — A안 확정

**기간:** 5일
**우선순위 근거:** Padlet 수준의 차별화 + 쌤핀 오프라인 강점 보존
**전제:** §3 Feature 5 A안 단독 채택 확정 (2026-04-19)

작업 목록:
- [ ] `MultiSurveyQuestionType`에 `'image'` 추가
- [ ] `MultiSurveyAnswer.value` 타입 확장 (`{ originalPath, thumbPath }` 객체 포함)
- [ ] 학생 모바일 HTML 이미지 업로드 UI + 클라이언트 **EXIF orientation 정규화** + 리사이즈(WebP, 1280px, q=0.7)
- [ ] WebSocket 바이너리 프레임 송수신 + 2MB 상한 + 재압축·거절 로직
- [ ] Electron 메인 이미지 저장 IPC 핸들러 + 썸네일(200x200) 생성
- [ ] 미저장 세션 24h 클린업 크론
- [ ] 결과 뷰 갤러리 그리드 + 라이트박스 (썸네일 우선 렌더링)
- [ ] SpreadsheetView 테이블에 이미지 썸네일 셀 표시
- [ ] Excel 내보내기 시 zip 번들 생성 (이미지 폴더 포함)
- [ ] 설정 화면에 "이미지 스토리지 용량 + 정리" UI
- [ ] Google Drive 백업 로직에 `feedback-images/` 폴더 포함

### Phase 4: 고급 (후순위)

- [ ] Google Sheets API 연동 (Sheets 직접 내보내기)
- [ ] AI 응답 그룹핑 (Mentimeter 스타일, Gemini 활용)
- [ ] 개인화된 피드백 보고서 PDF (Wooclap 스타일)
- [ ] 설문 결과 간 비교 뷰 (같은 프리셋 A반 vs B반)
- [ ] 멀티초이스 Excel "선택지별 컬럼 분할" 모드

### Phase 5: 이미지 하이브리드 진화 (조건부, 사용자 요구 발생 시에만)

**전제:** 사용자로부터 "외부 URL 공유" 요구가 반복 발생할 경우에만 착수. YAGNI 원칙 준수.
**기본 설계:** A안(로컬 저장) 유지 + 교사가 **선택적으로** 외부 공유 활성화

작업 목록 (조건부):
- [ ] Supabase Storage 버킷 + **Edge Function 업로드 중계** (rate limit + 토큰 검증)
- [ ] 결과 뷰에 "이 이미지 외부 공유하기" 토글 버튼 (개별/일괄)
- [ ] 업로드 후 공유 URL 발급 + 만료 정책 (30일)
- [ ] 법적 고지/학부모 동의 안내 UI
- [ ] 이 기능은 기본 OFF로 설정에서 명시적으로 활성화해야 사용 가능

---

## 5. 기술 의사결정 요약

| 항목 | 결정 | 이유 |
|------|------|------|
| 테이블 렌더링 | CSS Grid 직접 구현 | 의존성 최소화, 쌤핀 기존 스타일 유지 |
| Excel 생성 | ExcelJS (기존 의존성) | 이미 사용 중, 패턴 확립됨 |
| 멀티초이스 Excel 직렬화 | 세미콜론(`; `) 조인 (기본) | 단일 컬럼 유지 + Phase 4에서 분할 모드 옵션 |
| 이미지 저장 | **A안: WebSocket + 로컬 파일** (확정) | 스코어링 분석 결과 70점(B:42, C:53). 오프라인 강점 보존·$0 비용·법적 부담 최소·데이터 소유권 유지 |
| 이미지 썸네일 | Electron 메인에서 200x200 생성 | 원본 그리드 렌더링 시 메모리 폭발 방지 (30개 원본=150MB) |
| EXIF orientation | 클라이언트 리사이즈 전 정규화 | iOS 사진 90° 회전 저장 함정 방지 |
| 이미지 Excel 출력 | 별도 zip 번들 | ExcelJS 셀 이미지 임베드는 성능/용량 이슈 |
| URL 공유 기능 | Phase 5 조건부 (하이브리드) | YAGNI — 수요 확인 후에만 Supabase Storage 선택적 도입 |
| 라이브 월 | 기존 WebSocket 세션 뷰 레이어만 확장 | IPC/스키마 변경 없음, 하위 호환 |
| 프리셋 저장 | `adapters/constants/feedbackPresets.ts` | 도메인 오염 방지, 4-레이어 규칙 준수 |
| 응답자 표시 | 제출 순서 번호 + 익명 토글 | 민감 피드백 기본 보호, 필요 시 해제 |
| 구글시트 연동 | Phase 4 후순위 | OAuth scope 추가 필요, ROI 낮음 |

---

## 6. 경쟁 우위 분석

**쌤핀만의 강점 (레퍼런스 대비):**
- **무료 + 참여자 무제한** — Mentimeter(50명), Slido(100명), Poll Everywhere(25명) 대비 압도적
- **오프라인 가능** — Electron 로컬 서버, 인터넷 없어도 교실 내 Wi-Fi만으로 동작
- **데이터 소유권** — 로컬 JSON 파일, 교사가 데이터 완전 통제
- **한국 교육 맞춤** — 한글 UI, 교과/학급 연동, HWP 내보내기

**이번 기능 추가로 해소되는 약점:**
- 응답 모아보기 없음 → SpreadsheetView로 해결
- 엑셀 내보내기 없음 → ExcelExporter 확장으로 해결
- 발제 피드백 시나리오 부재 → 프리셋으로 해결
- 이미지 응답 불가 → **A안(WebSocket+로컬 파일) 확정으로 해결하여 오프라인 강점 보존**

**전략적 일관성:**
Phase 3 A안 확정으로 "오프라인/데이터 소유권/한국 교육 맞춤" 4대 강점이 모두 온전히 유지된다. URL 공유 같은 보조 기능 요구가 발생하면 Phase 5 하이브리드(기본 로컬 + 교사 선택 시 외부 업로드)로 **강점 훼손 없이** 확장 가능.

---

## 부록 A: 이미지 응답 대안 비교 분석

Phase 3 이미지 응답 설계 시 3개 안을 심층 분석한 결과. A안 채택 근거의 추적 가능성 확보용.

### A.1 평가 축별 비교

| 축 | A안 (로컬) | B안 (Supabase) | C안 (체크리스트 한정) |
|----|-----------|---------------|---------------------|
| 오프라인 동작 | ✅ 완전 보존 | ❌ 훼손 | ✅ 보존 (실시간 도구) |
| 외부 URL 공유 | ❌ 불가 | ✅ CDN | ✅ CDN |
| 운영 비용/월 | $0 | $25+ (Pro 거의 확실) | $25+ |
| 법적/개인정보 부담 | 최소 (로컬) | 높음 (외부 서버) | 중간 |
| 데이터 소유권 | 교사 완전 통제 | Supabase 의존 | Supabase 의존 |
| 구현 공수 | 5일 | 7일 | 4일 |
| 원 요구 충족도 | 95% | 100% | 55% |
| 보안 구현 복잡도 | 낮음 | 높음 (Edge Function + rate limit) | 높음 |
| 확장성 | 양호 (하이브리드 진화 가능) | 최고 | 양호 |

### A.2 가중 스코어링

평가축별 1~5점, 가중치는 쌤핀 전략 우선순위 반영.

| 평가축 | 가중 | A안 | B안 | C안 |
|--------|:----:|:---:|:---:|:---:|
| 브랜드 일관성 (오프라인) | 3 | 5 | 2 | 5 |
| 원 요구 충족도 | 3 | 4 | 5 | 2 |
| 운영 비용/리스크 | 2 | 5 | 2 | 3 |
| 법적/개인정보 안전성 | 2 | 5 | 3 | 3 |
| 구현 공수 | 2 | 4 | 2 | 5 |
| 데이터 소유권 | 2 | 5 | 2 | 3 |
| 확장성 | 1 | 4 | 5 | 3 |
| **가중 합계** | | **70** | **42** | **53** |

### A.3 배제된 안의 핵심 리스크

**B안 배제 이유:**
- 익명 업로드 RLS 허점 → Edge Function 중계 + rate limit + 세션 토큰 검증 필수 (단순 "버킷 추가"가 아님)
- 무료 플랜 한계(Storage 1GB + 월 2GB 대역폭) → 30명 × 5MB × 몇 세션이면 즉시 초과 → Pro 플랜 강제
- §6 "오프라인 가능" 브랜드 메시지와 정면 충돌
- 학생 얼굴 포함 이미지의 외부 서버 저장 → 한국 개인정보보호법 + 학부모 동의 부담

**C안 배제 이유:**
- 원 요구("발제 후 즉석 사진 수집") 시나리오를 지원하지 못함 (체크리스트는 비동기 과제형)
- 여전히 Supabase Storage 인프라 신설 필요 → 공수 이득이 실질적으로 크지 않음
- 실시간 도구 vs 체크리스트 기능 격차가 시간이 지날수록 확대 → 사용자 혼란 + 지원 부담

### A.4 A안의 유일한 갭 해결 경로

A안의 단점인 "외부 URL 공유 불가"는:
- **단기**: Excel zip 번들 + 수동 공유 (Phase 3에서 제공)
- **장기**: Phase 5 하이브리드 (기본 로컬 + 교사 선택 시 Supabase Storage 업로드) — 사용자 수요 확인 후에만 착수
