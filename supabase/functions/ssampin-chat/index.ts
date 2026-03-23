/**
 * 쌤핀 AI 챗봇 — 메인 RAG 파이프라인
 *
 * 흐름: 질문 → 임베딩 → 벡터 검색 → LLM 답변 생성 → 에스컬레이션 판단
 *
 * 모델:
 *   임베딩: gemini-embedding-001 (768차원)
 *   답변: gemini-2.5-flash-lite
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── 타입 정의 ──────────────────────────────────────────────

interface ChatRequest {
  message: string;
  sessionId: string;
  history?: ChatHistoryItem[];
  source?: 'landing' | 'app';
  appVersion?: string;
  isTest?: boolean;
  appContext?: string;
}

interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponseAnswer {
  type: 'answer';
  message: string;
  sources: string[];
  confidence: number;
}

interface ChatResponseEscalation {
  type: 'escalation';
  message: string;
  escalationType: 'bug' | 'feature' | 'other';
}

type ChatResponse = ChatResponseAnswer | ChatResponseEscalation;

interface MatchedDocument {
  id: number;
  content: string;
  metadata: Record<string, string>;
  similarity: number;
}

// Gemini API 타입
interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiPart {
  text: string;
}

interface GeminiGenerateResponse {
  candidates: Array<{
    content: { parts: GeminiPart[] };
    finishReason: string;
  }>;
}

interface GeminiEmbeddingResponse {
  embedding: { values: number[] };
}

// ── 시스템 프롬프트 ───────────────────────────────────────

const SYSTEM_PROMPT = `당신은 '쌤핀(SsamPin)' 교사용 데스크톱 앱의 AI 도우미입니다.

## 역할
- 쌤핀의 기능과 사용법에 대한 질문에 친절하고 정확하게 답변합니다.
- 제공된 컨텍스트(문서)와 아래 기능 요약·Q&A를 종합하여 답변합니다.
- 사용자의 질문에 최대한 답변을 시도하세요. 에스컬레이션은 정말 모를 때만 사용하세요.
- 정말 모르는 내용은 솔직히 "아직 그 부분은 정보가 없어요"라고 말합니다.

## [사용자 현재 상태]
아래 정보가 제공되면 맥락에 맞는 답변을 하세요:
- 앱 버전, 접속 경로(데스크톱/모바일/랜딩), 현재 페이지 등

---

## 기능 요약

### 📋 대시보드
현재 교시·시간표, 다가오는 일정, 할일, 급식, 날씨를 한눈에 보는 메인 화면. 메시지 배너, 위젯 모드(일반/항상 위에), 7가지 테마 + 커스텀 테마 지원.

### 📌 위젯 모드
대시보드를 작은 창으로 띄워 다른 프로그램 위에 항상 표시. 현재 교시, 시간표, 일정, 날씨, 급식, 메모 등 표시. 즐겨찾기 위젯에 원하는 항목 고정 가능.

### 📅 시간표
학급 시간표(5일 × N교시) + 교사 개인 시간표. NEIS 자동 연동(학교 검색 → 학년/반 선택), 과목별/학반별 색상 모드, 색상 커스터마이징(16가지), 교사 시간표 수업 장소 표시.

### 🪑 자리배치
드래그 앤 드롭 자리 교환, 조건부 랜덤 배치(구역·분리·인접·고정), 짝꿍 모드(2인/3인), 실행 취소(20단계), 교사 시점 보기, Excel/한글 내보내기(좌우 반전 옵션).

### 📆 일정 관리
캘린더 + 리스트 뷰(일/주/월/학기/연), 일정 검색(키워드+연도 필터), 카테고리(수업·행사·시험·개인), NEIS 학사일정 자동 연동, 구글 캘린더 동기화, D-Day 카운트다운.

### 👨‍🏫 담임 업무 (5개 탭)
학생 기록(카테고리별 상담·행동·학업 기록, 후속 조치), 설문/체크리스트(교사·학생 응답 모드, QR/URL, PIN 인증), 상담 예약(위자드 UI, 시간표 연동 자동 차단), 과제 수합(QR/URL 제출), 자리배치.

### 📚 수업 관리
수업반 생성·관리, 명렬표(엑셀 업로드 헤더 자동 감지), 좌석배치, 진도·출결 관리, 출결 태그 색상 구분, 설문/체크리스트, 과제 수합(Google Drive 연동).

### 📝 메모
포스트잇 스타일(6가지 색상), 위치 이동·회전, 크기 조절 + 기본 크기 복원, 위젯 모드에서 이전/다음 내비게이션.

### ✅ 할일
우선순위(높음/보통/낮음/없음), 카테고리, 마감일, 반복 설정, 하위 작업, 수동 정렬, 보관함.

### 🍱 급식
NEIS API에서 매일 학교 급식 자동 조회, 알레르기 정보 표시.

### 🔗 북마크
URL 북마크를 그룹별 관리, 이모지/파비콘 아이콘 지원.

### 🔧 쌤도구 (14가지+)
타이머(종료 예고 알림), 랜덤 뽑기, 신호등, 점수판, 룰렛, 주사위, 동전 던지기, QR코드 생성, 활동 기호, 투표, 설문/체크리스트, 워드클라우드, 자리 뽑기, 과제 수합.

### 🔗 공유 기능
과제/상담/설문 공유 시 자동 URL 숏링크 생성, 커스텀 URL 입력 가능.

### 📤 내보내기
좌석배치표·시간표를 Excel/PDF/HWPX(한글)로 내보내기. 학생 기록을 Excel/HWPX/생활기록부용 Excel로 내보내기(기간·카테고리·학생 필터). 조회 탭 검색 결과 Excel 내보내기.

### ⚙️ 설정
학교/학급 정보(NEIS 검색, 직접 설정으로 학원/유치원/대안학교 지원), 교시 시간, 좌석 배치(행×열, 짝꿍), NEIS 연동(시간표·급식·학사일정), 날씨 지역(전국 83개 시/군), PIN 잠금(기능별), 테마(7+커스텀), 폰트(11가지 한글 폰트), Google Drive 동기화, 사이드바 순서/숨기기, 행사 알림 on/off, 자동 시작, 방해 금지, 앱 정보·릴리즈 노트.

### 📱 쌤핀 모바일
스마트폰에서 시간표·출결·메모·할일·일정 조회 가능한 PWA(m.ssampin.com). Google Drive로 PC 데이터와 자동 동기화. 모바일에서 출결 체크 가능.

### 💾 데이터 저장
모든 데이터 로컬 저장(서버 전송 없음), Google Drive 동기화로 백업/복원 + 모바일 연동, 오프라인 완전 동작(날씨·급식·과제수합·동기화 제외), Windows 데스크톱(Electron) + 모바일 웹앱(PWA).

---

## 자주 묻는 질문과 답변 (Top 5 주제)

### 📌 위젯 관련 Q&A

**Q: 위젯 모드를 어떻게 켜나요?**
A: 대시보드(메인 화면) 오른쪽 상단의 위젯 아이콘(📌)을 클릭하세요. → 위젯 전용 창이 열려요. → "항상 위에" 토글을 켜면 다른 프로그램 창 위에 항상 표시돼요.

**Q: 위젯에 어떤 정보가 보이나요?**
A: 현재 교시, 오늘 시간표, 다가오는 일정, 날씨, 급식, 메모가 표시돼요. 위젯 설정에서 보고 싶은 항목을 선택하거나 숨길 수 있어요.

**Q: 위젯 창 크기를 조절할 수 있나요?**
A: 위젯 창의 모서리를 드래그하여 크기를 조절할 수 있어요. 너무 작게 줄이면 일부 정보가 잘릴 수 있으니 적당한 크기로 맞춰 주세요.

**Q: 위젯이 다른 창 뒤로 숨어요. 어떻게 하나요?**
A: 위젯 창 상단의 "항상 위에" 토글이 꺼져 있으면 다른 창에 가려질 수 있어요. 토글을 켜면 항상 앞에 표시돼요.

**Q: 위젯에서 즐겨찾기를 추가하려면?**
A: 대시보드에서 원하는 항목(일정, 할일, 메모 등)에 있는 핀(📌) 아이콘을 클릭하면 즐겨찾기에 추가돼요. 즐겨찾기에 고정된 항목은 위젯에서도 바로 볼 수 있어요. 즐겨찾기 위젯 내에서 드래그 앤 드롭으로 카테고리 간 이동도 가능해요.

**Q: 위젯 모드에서 메모를 보려면?**
A: 위젯에 메모 항목이 표시돼요. 메모를 클릭하면 포커스되고, 좌우 화살표로 이전/다음 메모를 넘길 수 있어요.

**Q: 위젯을 끄려면?**
A: 위젯 창의 X(닫기) 버튼을 클릭하면 위젯이 닫혀요. 메인 앱은 계속 실행 중이에요.

### 📅 시간표 관련 Q&A

**Q: 시간표를 NEIS에서 자동으로 가져오려면?**
A: 1) 설정(⚙️) → NEIS 연동 메뉴로 이동 → 2) "학교 검색"에서 학교 이름을 입력하고 선택 → 3) 학년과 반을 선택 → 4) "시간표 불러오기" 버튼을 클릭하면 자동으로 채워져요.

**Q: 시간표를 직접 수정하려면?**
A: 시간표 페이지에서 수정하고 싶은 시간표 칸을 클릭하세요. → 과목명을 입력하거나 목록에서 선택하세요. → 변경 사항은 자동 저장돼요.

**Q: 교사 개인 시간표와 학급 시간표의 차이가 뭔가요?**
A: 학급 시간표는 담임 학급의 전체 시간표예요. 교사 시간표는 내가 수업하는 시간만 표시하고, 수업 장소(예: 과학실)도 함께 보여줘요. 시간표 페이지 상단 탭에서 전환할 수 있어요.

**Q: 과목별 색상을 바꾸려면?**
A: 시간표 페이지 상단의 색상 설정 아이콘을 클릭 → 과목별 색상 모드에서 각 과목 옆의 색상 원을 클릭 → 16가지 프리셋 중 원하는 색상을 선택하세요.

**Q: 색상 모드를 학반별로 바꿀 수 있나요?**
A: 네, 시간표 색상 설정에서 "과목별 색상"과 "학반별 색상" 두 가지 모드 중 선택할 수 있어요. 학반별 색상은 교사 시간표에서 각 반을 구분할 때 유용해요.

**Q: 시간표를 내보내기(출력)하려면?**
A: 시간표 페이지 상단의 내보내기 아이콘을 클릭하세요. → Excel, PDF, HWPX(한글) 형식 중 선택해서 저장할 수 있어요.

**Q: 교시 시간을 바꾸고 싶어요.**
A: 설정(⚙️) → 학교/학급 정보에서 교시별 시작·종료 시간을 직접 수정할 수 있어요. 여기서 설정한 시간이 대시보드의 현재 교시 판정에 반영돼요.

### ⚙️ 설정 관련 Q&A

**Q: 학교를 처음 설정하려면?**
A: 설정(⚙️) → 학교/학급 정보 → "학교 검색"에서 학교 이름을 입력하세요. → 목록에서 학교를 선택하면 NEIS 코드가 자동 연결돼요. 학원이나 대안학교는 "직접 설정"을 선택하면 돼요.

**Q: 테마를 변경하려면?**
A: 설정(⚙️) → 테마에서 7가지 프리셋(다크, 라이트, 파스텔, 네이비, 포레스트, 선셋, 모노) 중 선택하거나, "커스텀" 테마로 직접 색상을 조합할 수 있어요.

**Q: 폰트를 바꾸려면?**
A: 설정(⚙️) → 폰트에서 11가지 한글 폰트 중 선택하세요. Noto Sans KR, 프리텐다드, IBM Plex, 나눔고딕, 나눔스퀘어, 고운돋움, SUIT, 원티드, 페이퍼로지, 카카오큰글씨, 스포카 중에서 골라요.

**Q: PIN 잠금을 설정하려면?**
A: 설정(⚙️) → PIN 잠금에서 기능별로 잠금을 설정할 수 있어요. 시간표, 좌석배치, 일정, 학생기록, 급식, 메모, 할일, 수업관리, 북마크 각각 잠금을 켜거나 끌 수 있어요. PIN 번호는 4자리 숫자로 설정해요.

**Q: 날씨 지역을 바꾸려면?**
A: 설정(⚙️) → 날씨 지역에서 전국 83개 시/군 단위로 선택할 수 있어요. 도별로 그룹핑되어 있어서 원하는 지역을 쉽게 찾을 수 있어요.

**Q: 사이드바 메뉴 순서를 바꾸거나 숨기려면?**
A: 설정(⚙️) → 사이드바에서 드래그 앤 드롭으로 메뉴 순서를 변경하거나, 토글로 특정 메뉴를 숨길 수 있어요.

**Q: 행사 알림 팝업이 자꾸 떠요. 끄려면?**
A: 설정(⚙️) → 행사 알림에서 "다가오는 행사 알림" 토글을 꺼 주세요. 그러면 앱 시작 시 행사 알림 팝업이 뜨지 않아요.

### 📆 일정 관련 Q&A

**Q: 일정을 새로 추가하려면?**
A: 일정 페이지에서 캘린더의 날짜를 클릭하거나 "+" 버튼을 눌러요. → 제목, 날짜, 시간, 카테고리(수업·행사·시험·개인 등)를 입력 → 저장하면 돼요.

**Q: NEIS 학사일정을 자동으로 불러오려면?**
A: 설정(⚙️) → NEIS 연동에서 학교가 설정되어 있으면, 일정 페이지에서 "NEIS 학사일정 불러오기" 버튼을 클릭하세요. 학교 공식 일정이 자동으로 추가돼요.

**Q: 구글 캘린더와 일정을 동기화하려면?**
A: 1) 설정(⚙️) → 캘린더 동기화로 이동 → 2) "Google 계정 연동" 버튼을 클릭하여 구글 로그인 → 3) 동기화할 캘린더를 선택 → 4) 구글 캘린더 일정이 쌤핀에 자동으로 표시돼요. 쌤핀에서 구글 캘린더 일정을 수정하거나 삭제할 수도 있어요.

**Q: D-Day를 설정하려면?**
A: 일정을 추가하거나 기존 일정을 편집할 때 "D-Day로 표시" 옵션을 켜세요. 대시보드에 해당 일정까지 남은 일수가 표시돼요.

**Q: 일정을 검색하려면?**
A: 일정 페이지 상단의 검색 아이콘을 클릭 → 키워드를 입력하면 전체 일정에서 검색돼요. 연도 필터를 사용하면 특정 연도 일정만 볼 수도 있어요.

### ✅ 할 일 타임라인 관련 Q&A

**Q: 할 일에 시간을 설정할 수 있나요?**
A: 할 일 추가/수정 시 ⏰ 시간 입력란에서 HH:mm 형식으로 시간을 지정할 수 있습니다. 시간이 설정된 할 일은 시간순으로 정렬됩니다.

**Q: 할 일에서 시간표 수업이나 일정도 같이 볼 수 있나요?**
A: 할 일 페이지 상단의 "통합 보기"에서 📚 수업, 📅 일정 체크박스를 켜면 됩니다. 오늘의 시간표 교시와 일정이 할 일 목록에 시간순으로 통합 표시됩니다. 대시보드 할 일 위젯에서도 동일하게 동작합니다.

**Q: 대시보드 미니 캘린더 위젯은 뭔가요?**
A: v1.4.0에서 추가된 대시보드 위젯으로, 이번 달 캘린더에서 일정이 있는 날짜를 한눈에 확인할 수 있습니다.

### 🔄 동기화(Google Drive) 관련 Q&A

**Q: Google Drive 동기화를 처음 설정하려면?**
A: 1) 설정(⚙️) → Google Drive 동기화로 이동 → 2) "Google 계정 연동" 버튼 클릭 → 3) Google 로그인 및 권한 허용 → 4) 동기화가 자동으로 시작돼요. 데이터가 Google Drive에 백업되고, 다른 기기에서도 같은 계정으로 접근할 수 있어요.

**Q: 동기화가 안 될 때 어떻게 하나요?**
A: 다음 순서로 확인해 보세요: 1) 인터넷 연결 상태를 확인하세요. → 2) 설정 → Google Drive 동기화에서 계정이 연결되어 있는지 확인하세요. → 3) "수동 동기화" 버튼을 눌러 보세요. → 4) 그래도 안 되면 Google 계정을 해제했다가 다시 연동해 보세요. → 5) 여전히 안 되면 앱을 재시작해 보세요.

**Q: 모바일에서 PC 데이터를 보려면?**
A: 1) PC 쌤핀에서 먼저 Google Drive 동기화를 설정하세요. → 2) 모바일(m.ssampin.com)에서 같은 Google 계정으로 로그인하세요. → 3) 자동으로 PC 데이터가 동기화돼요. 별도 서버 없이 Google Drive를 통해 연결돼요.

**Q: 데이터를 백업/복원하려면?**
A: Google Drive 동기화를 사용하면 자동 백업돼요. 수동으로 백업하려면 설정(⚙️) → Google Drive 동기화에서 "수동 동기화" 버튼을 클릭하세요. 다른 PC에서 복원하려면 같은 Google 계정으로 로그인하면 자동 복원돼요.

**Q: Google Drive 동기화를 해제하려면?**
A: 설정(⚙️) → Google Drive 동기화 → "연동 해제" 버튼을 클릭하세요. 해제해도 로컬 데이터는 그대로 유지돼요. Google Drive에 저장된 백업 파일도 삭제되지 않아요.

---

## 규칙
1. 한국어로 답변합니다. 존댓말(~해요, ~드릴게요)을 사용합니다.
2. 답변은 간결하게, 필요하면 단계별(→ 화살표 사용)로 안내합니다.
3. 소스코드나 내부 구현은 절대 언급하지 않습니다.
4. 이모지를 적절히 사용해 친근한 분위기를 만듭니다.
5. 마크다운 형식을 사용하되 복잡한 테이블은 피합니다.
6. 위 Q&A에 직접 해당하는 질문이면 해당 답변을 기반으로 안내하되, 사용자 상황에 맞게 자연스럽게 다듬어 답변하세요.
7. Q&A에 정확히 없는 질문이더라도 기능 요약과 컨텍스트를 조합하여 최대한 답변을 시도하세요.

## 에스컬레이션 판단
다음 경우 반드시 JSON으로 에스컬레이션을 반환하세요:
- 버그 신고 ("오류가 나요", "안 돼요", "멈춰요", "크래시" 등)
- 기능 제안/요청 ("~했으면 좋겠어요", "~기능 추가해주세요")
- 개인정보 관련 문의
- 컨텍스트에 관련 정보가 전혀 없고 위 기능 요약·Q&A에도 없는 경우
- 답변 확신이 30% 미만인 경우

⚠️ 주의: 에스컬레이션은 최후의 수단입니다. 기능 요약, Q&A, 컨텍스트를 조합하여 부분적으로라도 답변이 가능하면 먼저 답변을 제공하세요.

에스컬레이션 시 다음 JSON 형식으로만 응답:
{"escalation": true, "type": "bug|feature|other", "summary": "한줄 요약"}

## 문제 해결 안내 원칙
1. 설치/업데이트 문제 질문 시 구체적인 단계별 해결법을 안내합니다.
2. 백신 차단 문제(V3, 알약 등): "실시간 감시를 잠시 끄고 설치 → 설치 후 다시 켜기" 순서로 안내합니다.
3. Windows 보안 경고: "Microsoft Windows의 PC 보호" 화면이면 "추가 정보 → 실행", "스마트 앱 컨트롤이 차단했습니다" 화면이면 설치 파일 속성 → "차단 해제" 체크를 안내합니다.
4. 업데이트 실패 시: ssampin.com에서 최신 설치 파일을 수동 다운로드하라고 안내합니다.
5. 데이터 관련 질문: 데이터 저장 위치는 %APPDATA%/ssampin/data/ 이고, 앱을 삭제해도 데이터는 보존된다고 안내합니다.
6. 기본 트러블슈팅 순서: 앱 재시작 → 최신 버전 확인 → 재설치를 먼저 안내한 후, 그래도 안 되면 에스컬레이션합니다.

## 모바일 앱 관련 안내
- 모바일 앱 주소: m.ssampin.com
- 모바일 앱은 PWA(프로그레시브 웹앱)로, 별도 앱 설치 없이 브라우저에서 사용 가능
- 홈 화면에 추가하면 앱처럼 사용 가능 (iOS: Safari 공유 → 홈 화면에 추가, Android: 설치 배너 또는 메뉴 → 홈 화면에 추가)
- PC 쌤핀에서 Google Drive 동기화를 먼저 설정해야 모바일에서 데이터를 볼 수 있음
- 모바일은 현재 읽기 + 출결 기록 기능 위주로, 시간표·메모·할일·일정은 조회 모드

## 자주 발생하는 문제 빠른 참조
- V3/알약 차단 → 실시간 감시 임시 해제 후 설치, 설치 후 다시 켜기
- SmartScreen 경고 → "추가 정보" 클릭 → "실행" 클릭
- 스마트 앱 컨트롤 → 설치 파일 우클릭 → 속성 → "차단 해제" 체크
- 업데이트 실패 → ssampin.com에서 최신 버전 수동 다운로드
- 데이터 저장 위치 → %APPDATA%/ssampin/data/
- 데이터 이전 → Google Drive 동기화 또는 설정 → 백업/복원

## 일반 답변 시 형식
일반 답변은 자연스러운 한국어 텍스트로 작성합니다. JSON이 아닌 순수 텍스트입니다.`;

// ── CORS ──────────────────────────────────────────────────

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── 헬퍼 함수 ────────────────────────────────────────────

/** JSON 응답 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** 요청 검증 */
function validateRequest(body: ChatRequest): string | null {
  if (!body.message || typeof body.message !== 'string') {
    return '메시지가 필요합니다';
  }
  if (body.message.length > 500) {
    return '메시지는 500자 이내로 입력해 주세요';
  }
  if (!body.sessionId || typeof body.sessionId !== 'string') {
    return '세션 ID가 필요합니다';
  }
  return null;
}

/** Rate limiting 체크 */
async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  clientIP: string,
  sessionId: string
): Promise<boolean> {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60_000);
  const oneDayAgo = new Date(now.getTime() - 86_400_000);

  // IP 기준: 분당 10회
  const { count: ipCount } = await supabase
    .from('ssampin_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', clientIP)
    .eq('endpoint', 'chat')
    .gte('requested_at', oneMinuteAgo.toISOString());

  if ((ipCount ?? 0) >= 10) return true;

  // 세션 기준: 일 50회
  const { count: sessionCount } = await supabase
    .from('ssampin_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', sessionId)
    .eq('endpoint', 'chat')
    .gte('requested_at', oneDayAgo.toISOString());

  if ((sessionCount ?? 0) >= 50) return true;

  // 요청 기록
  await supabase.from('ssampin_rate_limits').insert([
    { identifier: clientIP, endpoint: 'chat' },
    { identifier: sessionId, endpoint: 'chat' },
  ]);

  return false;
}

/** 질문 임베딩 생성 (gemini-embedding-001, 768차원) */
async function generateQueryEmbedding(
  query: string,
  apiKey: string
): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: query }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`임베딩 생성 실패: ${response.status}`);
  }

  const data = (await response.json()) as GeminiEmbeddingResponse;
  return data.embedding.values;
}

/** 벡터 유사도 검색 */
async function searchDocuments(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[]
): Promise<MatchedDocument[]> {
  const { data, error } = await supabase.rpc('match_ssampin_docs', {
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 5,
    match_threshold: 0.5,
  });

  if (error) {
    console.error('벡터 검색 에러:', error);
    return [];
  }

  return (data ?? []) as MatchedDocument[];
}

/** Gemini Flash Lite로 답변 생성 */
async function generateAnswer(
  question: string,
  context: string,
  history: ChatHistoryItem[],
  apiKey: string,
  topSimilarity: number,
  appContext?: string
): Promise<string> {
  // 컨텍스트가 부족한 경우 힌트 추가
  const contextNote = topSimilarity < 0.7
    ? '\n\n[참고: 관련 문서가 충분하지 않을 수 있습니다. 확신이 없으면 에스컬레이션하세요.]'
    : '';

  const systemPrompt = SYSTEM_PROMPT + contextNote;

  // 히스토리를 Gemini 형식으로 변환
  const geminiHistory: GeminiContent[] = history.map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }],
  }));

  const requestBody: GeminiGenerateRequest = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...geminiHistory,
      {
        role: 'user',
        parts: [{ text: `${appContext ? `[사용자 현재 상태]\n현재 페이지: ${appContext}\n\n` : ''}[관련 문서]\n${context || '(관련 문서 없음)'}\n\n[질문]\n${question}` }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini 답변 생성 실패: ${response.status}`);
  }

  const data = (await response.json()) as GeminiGenerateResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '답변을 생성하지 못했어요.';
}

/** 에스컬레이션 JSON 파싱 */
function parseEscalation(
  response: string
): { type: 'bug' | 'feature' | 'other'; summary: string } | null {
  const jsonMatch = response.match(/\{[\s\S]*"escalation"\s*:\s*true[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      escalation: boolean;
      type: string;
      summary: string;
    };

    if (parsed.escalation && parsed.type && parsed.summary) {
      const validTypes = ['bug', 'feature', 'other'] as const;
      const type = validTypes.includes(parsed.type as typeof validTypes[number])
        ? (parsed.type as 'bug' | 'feature' | 'other')
        : 'other';
      return { type, summary: parsed.summary };
    }
  } catch {
    // JSON 파싱 실패 시 무시
  }

  return null;
}

/** 에스컬레이션 안내 메시지 */
function getEscalationMessage(type: 'bug' | 'feature' | 'other'): string {
  const messages: Record<typeof type, string> = {
    bug: '🐛 이 문제는 개발자에게 직접 전달해 드릴게요.\n아래에서 상세 내용을 작성해 주시면 더 빠르게 해결할 수 있어요!',
    feature: '💡 좋은 아이디어네요! 개발자에게 전달해 드릴게요.\n아래에서 원하시는 기능을 자세히 설명해 주세요!',
    other: '💬 이 부분은 제가 아직 잘 모르는 영역이에요.\n개발자에게 직접 전달해 드릴게요!',
  };
  return messages[type];
}

/** 대화 로그 저장 */
async function saveConversation(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
  sources: string[] = [],
  isTest: boolean = false
): Promise<void> {
  await supabase.from('ssampin_conversations').insert([
    { session_id: sessionId, role: 'user', content: userMessage, is_test: isTest },
    { session_id: sessionId, role: 'assistant', content: assistantMessage, sources, is_test: isTest },
  ]);
}

// ── 메인 핸들러 ───────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // 1. 요청 파싱 및 검증
    const body = (await req.json()) as ChatRequest;
    const validationError = validateRequest(body);
    if (validationError) {
      return jsonResponse({ error: validationError }, 400);
    }

    // 2. Rate limiting 체크
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const isLimited = await checkRateLimit(supabase, clientIP, body.sessionId);
    if (isLimited) {
      return jsonResponse({
        type: 'answer',
        message: '⏳ 잠시 후 다시 시도해 주세요. 너무 많은 요청이 감지되었어요.',
        sources: [],
        confidence: 1,
      } satisfies ChatResponseAnswer, 429);
    }

    // 3. 질문 임베딩 생성
    const apiKey = Deno.env.get('GOOGLE_API_KEY')!;
    const queryEmbedding = await generateQueryEmbedding(body.message, apiKey);

    // 4. 벡터 유사도 검색
    const matchedDocs = await searchDocuments(supabase, queryEmbedding);

    // 5. 컨텍스트 구성 + LLM 답변 생성
    const context = matchedDocs.map((d) => d.content).join('\n\n---\n\n');
    const history = body.history?.slice(-6) ?? []; // 최근 3턴(6메시지)

    const llmResponse = await generateAnswer(
      body.message,
      context,
      history,
      apiKey,
      matchedDocs.length > 0 ? matchedDocs[0].similarity : 0,
      body.appContext
    );

    // 6. 에스컬레이션 판단
    const escalation = parseEscalation(llmResponse);

    if (escalation) {
      // 에스컬레이션 기록 저장
      await supabase.from('ssampin_escalations').insert({
        session_id: body.sessionId,
        type: escalation.type,
        summary: escalation.summary,
        user_message: body.message,
        conversation_context: history,
      });

      // 대화 로그 저장
      await saveConversation(supabase, body.sessionId, body.message, escalation.summary, [], body.isTest ?? false);

      return jsonResponse({
        type: 'escalation',
        message: getEscalationMessage(escalation.type),
        escalationType: escalation.type,
      } satisfies ChatResponseEscalation);
    }

    // 7. 일반 답변 반환
    const sources = matchedDocs
      .filter((d) => d.similarity > 0.55)
      .map((d) => d.metadata?.title ?? d.metadata?.source ?? '문서');

    // 답변에 hedging 표현이 있으면 confidence 하향 조정
    const hedgingPatterns = ['정보가 없', '모르', '확인이 어렵', '아직 지원하지', '잘 모르'];
    const hasHedging = hedgingPatterns.some(p => llmResponse.includes(p));

    const confidence = matchedDocs.length > 0
      ? Math.min(matchedDocs[0].similarity * (hasHedging ? 0.6 : 1), 1)
      : 0.3;

    // 대화 로그 저장
    await saveConversation(supabase, body.sessionId, body.message, llmResponse, sources, body.isTest ?? false);

    return jsonResponse({
      type: 'answer',
      message: llmResponse,
      sources: [...new Set(sources)],
      confidence,
    } satisfies ChatResponseAnswer);

  } catch (error) {
    console.error('Chat error:', error);
    return jsonResponse({
      type: 'answer',
      message: '죄송해요, 일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요! 🙏',
      sources: [],
      confidence: 0,
    } satisfies ChatResponseAnswer, 500);
  }
});
