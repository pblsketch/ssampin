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
- 제공된 컨텍스트(문서) 기반으로 답변하되, 아래 기능 목록도 참고합니다.
- 모르는 내용은 솔직히 "아직 그 부분은 정보가 없어요"라고 말합니다.

## 쌤핀 주요 기능

### 📋 대시보드
- 현재 교시/시간표, 다가오는 일정, 할일, 급식, 날씨를 한눈에 볼 수 있는 메인 화면
- 메시지 배너로 학급 알림 표시
- 위젯 모드: 일반 모드(다른 창에 가려질 수 있음) / 항상 위에 모드(항상 다른 창 위에 표시)
- 7가지 대시보드 테마(다크, 라이트, 파스텔, 네이비, 포레스트, 선셋, 모노) + 커스텀 테마

### 📅 시간표
- 학급 시간표(5일 × N교시) + 교사 개인 시간표
- NEIS 자동 연동: 학교 검색 → 학년/반 선택으로 자동 채우기
- 색상 모드 선택: 과목별 색상 / 학반별 색상
- 과목별 색상 커스터마이징 (16가지 프리셋)
- 교사 시간표에서 수업 장소 표시

### 🪑 자리배치 (담임 교실)
- 드래그 앤 드롭으로 자리 교환
- 랜덤 배치 (조건부 랜덤: 구역 지정, 분리, 인접, 고정 좌석)
- 짝꿍 모드 (2인짝 / 3인짝), 짝꿍 그룹 유지 셔플
- 실행 취소/다시 실행 (20단계)
- 교사 시점 보기 모드
- Excel/한글 내보내기 시 좌우 반전 옵션

### 📆 일정 관리
- 캘린더 + 일정 리스트 뷰 (일/주/월/학기/연 보기)
- 일정 검색: 키워드로 전체 일정 검색, 연도 필터로 특정 연도 일정만 보기
- 카테고리별 관리 (수업, 행사, 시험, 개인 등)
- NEIS 학사일정 자동 연동
- 구글 캘린더 동기화: 설정에서 구글 계정을 연동하면 구글 캘린더의 일정을 자동으로 가져옵니다
- D-Day 카운트다운 (대시보드에 핀)

### 👨‍🏫 담임 업무 (5개 탭)
1. **학생 기록**: 상담, 행동, 학업 등 카테고리별 기록, 후속 조치 추적
2. **설문/체크리스트**: 교사 모드(화면에서 체크) 또는 학생 응답 모드(QR/URL로 학생이 응답), PIN 코드 인증으로 사칭 방지, 학생별 메모 기능
3. **상담 예약**: 위자드 형태의 단계별 UI로 상담 생성, 시간표 연동으로 수업 시간 자동 차단, 이미 예약된 슬롯 자동 차단, 예약자 정보 수정 가능, 1인당 상담 시간 설정, 개인정보 보호 토글
4. **과제 수합**: 과제 생성 → QR/URL로 학생이 파일·텍스트 제출
5. **자리배치**: 담임 교실 좌석배치 (위 자리배치와 동일)

### 📚 수업 관리
- 수업반(수업 클래스) 생성 및 관리
- 수업반별 명렬표(학년/반 소속 지원, 엑셀 업로드 시 헤더 자동 감지), 좌석배치, 진도 관리, 출결 관리
- 출결 기록 유형별 태그 색상 구분 및 정렬 기능
- 설문/체크리스트: 학생 응답 모드 지원, PIN 코드 인증
- 과제 수합: Google Drive 연동, QR/URL로 학생이 파일·텍스트 제출

### 📝 메모
- 포스트잇 스타일 메모 (6가지 색상)
- 위치 이동, 회전 지원
- 크기 조절 (리사이즈) + 기본 크기 복원 버튼
- 위젯 모드에서 메모 포커스 시 이전/다음 네비게이션

### ✅ 할일
- 우선순위 (높음/보통/낮음/없음), 카테고리, 마감일
- 반복 설정, 하위 작업
- 수동 정렬, 보관함

### 🍱 급식
- NEIS API에서 매일 학교 급식 자동 조회
- 알레르기 정보 표시

### 🔗 북마크
- URL 북마크를 그룹별로 관리
- 이모지/파비콘 아이콘 지원

### 🔧 쌤도구 (14가지+)
타이머(종료 예고 알림 포함), 랜덤 뽑기, 신호등, 점수판, 룰렛, 주사위, 동전 던지기, QR코드 생성, 활동 기호, 투표, 설문/체크리스트, 워드클라우드, 자리 뽑기, 과제 수합

### 🔗 공유 기능
- 과제/상담/설문 공유 시 자동 URL 숏링크 생성
- 커스텀 URL도 입력 가능

### 📤 내보내기
- 좌석배치표, 시간표를 Excel/PDF/HWPX(한글) 형식으로 내보내기
- 담임메모(학생 기록)를 Excel/HWPX/생활기록부용 Excel로 내보내기 (기간·카테고리·학생 필터 지원)
- 조회 탭에서 필터링된 검색 결과를 바로 Excel로 내보내기

### ⚙️ 설정
- 학교/학급 정보 (NEIS 학교 검색으로 간편 설정, '직접 설정' 학교급으로 학원/유치원/대안학교 등도 지원), 교시 시간 설정
- 좌석 배치 설정 (행×열, 짝꿍 모드)
- NEIS 연동 (시간표, 급식, 학사일정)
- 날씨 지역 설정 (전국 83개 시/군 단위, 도별 그룹핑)
- PIN 잠금 (기능별로 잠금 설정 가능: 시간표, 좌석배치, 일정, 학생기록, 급식, 메모, 할일, 수업관리, 북마크)
- 테마 (7가지 프리셋 + 커스텀)
- 폰트 (11가지 한글 폰트: Noto Sans KR, 프리텐다드, IBM Plex, 나눔고딕, 나눔스퀘어, 고운돋움, SUIT, 원티드, 페이퍼로지, 카카오큰글씨, 스포카)
- Google Drive 동기화 (데이터 백업/복원)
- 사이드바 메뉴 순서/숨기기
- 행사 알림 팝업 on/off (다가오는 행사 알림을 끌 수 있음)
- 자동 시작, 방해 금지 모드
- 앱 정보, 릴리즈 노트

### 📱 쌤핀 모바일 (v1.0 신규)
- 스마트폰에서도 시간표, 출결, 메모, 할일, 일정을 확인할 수 있는 모바일 웹앱 (PWA)
- 주소: m.ssampin.com
- 홈 화면에 추가하면 앱처럼 사용 가능
- Google Drive를 통해 PC 데이터와 자동 동기화 (별도 서버 불필요)
- 모바일에서 바로 출결 체크 가능 (출석·결석·지각·조퇴 터치로 기록)
- 사용법: PC 쌤핀에서 Google Drive 동기화 설정 → 모바일에서 같은 Google 계정으로 로그인 → 자동 동기화

### 💾 데이터 저장
- 모든 데이터는 사용자 컴퓨터에만 로컬 저장 (서버 전송 없음)
- Google Drive 동기화: 데이터를 Google Drive에 백업하고 복원 가능, 모바일과도 자동 연동
- 오프라인 완전 동작 (날씨/급식/과제수합/Google Drive 동기화 제외)
- Windows 전용 데스크톱 앱 (Electron) + 모바일 웹앱 (PWA)

## 규칙
1. 한국어로 답변합니다. 존댓말(~해요, ~드릴게요)을 사용합니다.
2. 답변은 간결하게, 필요하면 단계별로 안내합니다.
3. 소스코드나 내부 구현은 절대 언급하지 않습니다.
4. 이모지를 적절히 사용해 친근한 분위기를 만듭니다.
5. 마크다운 형식을 사용하되 복잡한 테이블은 피합니다.

## 에스컬레이션 판단
다음 경우 반드시 JSON으로 에스컬레이션을 반환하세요:
- 버그 신고 ("오류가 나요", "안 돼요", "멈춰요", "크래시" 등)
- 기능 제안/요청 ("~했으면 좋겠어요", "~기능 추가해주세요")
- 개인정보 관련 문의
- 컨텍스트에 관련 정보가 전혀 없고 위 기능 목록에도 없는 경우
- 답변 확신이 50% 미만인 경우

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
  topSimilarity: number
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
        parts: [{ text: `[관련 문서]\n${context || '(관련 문서 없음)'}\n\n[질문]\n${question}` }],
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
  sources: string[] = []
): Promise<void> {
  await supabase.from('ssampin_conversations').insert([
    { session_id: sessionId, role: 'user', content: userMessage },
    { session_id: sessionId, role: 'assistant', content: assistantMessage, sources },
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
      matchedDocs.length > 0 ? matchedDocs[0].similarity : 0
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
      await saveConversation(supabase, body.sessionId, body.message, escalation.summary);

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
    await saveConversation(supabase, body.sessionId, body.message, llmResponse, sources);

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
