/**
 * 쌤핀 AI 챗봇 — 메인 RAG 파이프라인
 *
 * 흐름: 질문 → 임베딩 → 벡터 검색 → LLM 답변 생성 → 에스컬레이션 판단
 *
 * 모델:
 *   임베딩: gemini-embedding-001 (768차원)
 *   답변: gemini-3.1-flash-lite-preview
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
    thinkingConfig?: { thinkingLevel: string };
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
- 제공된 컨텍스트(검색된 문서)를 기반으로 답변합니다.
- 사용자의 질문에 최대한 답변을 시도하세요. 에스컬레이션은 정말 모를 때만 사용하세요.
- 정말 모르는 내용은 솔직히 "아직 그 부분은 정보가 없어요"라고 말합니다.

## [사용자 현재 상태]
아래 정보가 제공되면 맥락에 맞는 답변을 하세요:
- 앱 버전, 접속 경로(데스크톱/모바일/랜딩), 현재 페이지 등

## 규칙
1. 한국어로 답변합니다. 존댓말(~해요, ~드릴게요)을 사용합니다.
2. 답변은 간결하게, 필요하면 단계별(→ 화살표 사용)로 안내합니다.
3. 소스코드나 내부 구현은 절대 언급하지 않습니다.
4. 이모지를 적절히 사용해 친근한 분위기를 만듭니다.
5. 마크다운 형식을 사용하되 복잡한 테이블은 피합니다.
6. 검색된 문서에 관련 정보가 있으면 그 내용을 기반으로 자연스럽게 답변하세요.
7. 검색된 문서에 정확히 없더라도 관련 정보를 조합하여 최대한 답변을 시도하세요.
8. **구글 보안 심사는 v1.8.1에서 이미 완료되었습니다.** "구글 보안 심사 진행 중", "신규 사용자 연동 제한" 등의 안내는 더 이상 하지 마세요. 구글 연결이 안 되는 경우, 학교 보안 프로그램 차단 → PKCE 폴백(30초 대기) 안내를 우선 제공하세요.

## 에스컬레이션 판단
다음 경우 반드시 JSON으로 에스컬레이션을 반환하세요:
- 버그 신고 ("오류가 나요", "안 돼요", "멈춰요", "크래시" 등)
- 기능 제안/요청 ("~했으면 좋겠어요", "~기능 추가해주세요")
- 개인정보 관련 문의
- 검색된 문서에 관련 정보가 전혀 없고 추론도 불가능한 경우
- 답변 확신이 30% 미만인 경우

⚠️ 주의: 에스컬레이션은 최후의 수단입니다. 검색된 문서를 조합하여 부분적으로라도 답변이 가능하면 먼저 답변을 제공하세요.

에스컬레이션 시 다음 JSON 형식으로만 응답:
{"escalation": true, "type": "bug|feature|other", "summary": "한줄 요약"}

## 문제 해결 안내 원칙
1. 설치/업데이트 문제 질문 시 구체적인 단계별 해결법을 안내합니다.
2. 백신 차단 문제(V3, 알약 등): "실시간 감시를 잠시 끄고 설치 → 설치 후 다시 켜기" 순서로 안내합니다.
3. Windows 보안 경고: "Microsoft Windows의 PC 보호" 화면이면 "추가 정보 → 실행", "스마트 앱 컨트롤이 차단했습니다" 화면이면 설정 → 개인정보 및 보안 → Windows 보안 → 앱 및 브라우저 컨트롤 → 스마트 앱 컨트롤 → "끔"을 안내합니다.
4. 업데이트 실패 시: ssampin.com에서 최신 설치 파일을 수동 다운로드하라고 안내합니다.
5. 데이터 관련 질문: 데이터 저장 위치는 %APPDATA%/ssampin/data/ 이고, 앱을 삭제해도 데이터는 보존된다고 안내합니다.
6. 기본 트러블슈팅 순서: 앱 재시작 → 최신 버전 확인 → 재설치를 먼저 안내한 후, 그래도 안 되면 에스컬레이션합니다.

## 모바일 앱 관련 안내
- 모바일 앱 주소: m.ssampin.com
- PC 쌤핀에서 Google Drive 동기화를 먼저 설정해야 모바일에서 데이터를 볼 수 있음
- 모바일은 현재 읽기 + 출결 기록 기능 위주

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

/** 대화 맥락 인식 쿼리 재구성 */
function reformulateQuery(message: string, history: ChatHistoryItem[]): string {
  const ambiguousPatterns = /^(그거|이거|그건|거기|어떻게|왜|뭐가|그럼|그래서|그러면|저거|이건|그게|뭔가요|그건요).{0,15}$/;
  if (ambiguousPatterns.test(message.trim()) && history.length >= 2) {
    const lastUserMsg = [...history].reverse().find(h => h.role === 'user');
    if (lastUserMsg) return `${lastUserMsg.content} ${message}`;
  }
  return message;
}

/** 쿼리 카테고리 분류 (키워드 기반) */
function classifyQuery(query: string): string | null {
  const categoryMap: Array<[string, RegExp]> = [
    ['timetable', /시간표|NEIS|교시|과목|수업시간|컴시간/i],
    ['seating', /좌석|자리|배치|랜덤|짝꿍|분리|고정/],
    ['schedule', /일정|캘린더|D-Day|행사|학사일정|디데이/i],
    ['memo', /메모|포스트잇/],
    ['todo', /할일|할 일|투두|마감|우선순위/],
    ['settings', /설정|테마|폰트|PIN|잠금|날씨 지역|사이드바/i],
    ['sync', /동기화|Google Drive|백업|복원|구글 드라이브|PKCE/i],
    ['widget', /위젯/],
    ['mobile', /모바일|PWA|m\.ssampin/i],
    ['troubleshooting', /설치|업데이트|오류|안 돼|안돼|차단|백신|SmartScreen|V3|알약|크래시|멈춰/i],
  ];

  for (const [category, pattern] of categoryMap) {
    if (pattern.test(query)) return category;
  }
  return null;
}

/** HyDE: 가상 답변 생성 후 임베딩으로 검색 품질 향상 */
async function generateHypotheticalAnswer(query: string, apiKey: string): Promise<string> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `쌤핀(SsamPin) 교사용 데스크톱 앱 도움말에서 다음 질문에 대한 답변을 2-3문장으로 작성하세요. 추측이어도 괜찮습니다: ${query}` }] }],
          generationConfig: { temperature: 1.0, maxOutputTokens: 200, thinkingConfig: { thinkingLevel: 'minimal' } },
        }),
      }
    );
    if (!response.ok) return query; // 실패 시 원본 쿼리 반환
    const data = (await response.json()) as GeminiGenerateResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? query;
  } catch {
    return query; // 에러 시 원본 쿼리 반환
  }
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

/** Hybrid 검색 (벡터 + 전문 검색 + RRF) with 카테고리 필터 */
async function searchDocuments(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  queryText: string,
  category: string | null
): Promise<MatchedDocument[]> {
  // 카테고리가 있으면 필터 검색, 없으면 일반 hybrid 검색
  const rpcName = category
    ? 'hybrid_search_ssampin_docs_filtered'
    : 'hybrid_search_ssampin_docs';

  const params: Record<string, unknown> = {
    query_text: queryText,
    query_embedding: JSON.stringify(queryEmbedding),
    match_count: 10,
  };

  if (category) {
    params.filter_category = category;
  }

  const { data, error } = await supabase.rpc(rpcName, params);

  if (error) {
    console.error('Hybrid 검색 에러:', error);
    // Fallback: 기존 벡터 검색
    const { data: fallbackData } = await supabase.rpc('match_ssampin_docs', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 10,
      match_threshold: 0.35,
    });
    return (fallbackData ?? []) as MatchedDocument[];
  }

  return (data ?? []) as MatchedDocument[];
}

/** LLM 리랭킹: 검색된 문서의 관련성을 LLM으로 재평가 */
async function rerankDocuments(
  query: string,
  documents: MatchedDocument[],
  apiKey: string
): Promise<MatchedDocument[]> {
  if (documents.length <= 3) return documents; // 문서가 적으면 리랭킹 불필요

  try {
    const docList = documents.map((d, i) => `[${i}] ${d.content.slice(0, 200)}`).join('\n');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [{ text: `질문: "${query}"\n\n아래 문서들의 관련성을 평가하고, 가장 관련 있는 문서 인덱스를 관련도 순으로 쉼표 구분하여 반환하세요. 숫자만 반환:\n${docList}` }],
          }],
          generationConfig: { temperature: 1.0, maxOutputTokens: 50, thinkingConfig: { thinkingLevel: 'minimal' } },
        }),
      }
    );

    if (!response.ok) return documents.slice(0, 5);

    const data = (await response.json()) as GeminiGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const indices = text.match(/\d+/g)?.map(Number).filter(i => i >= 0 && i < documents.length) ?? [];

    if (indices.length === 0) return documents.slice(0, 5);

    // 리랭킹된 순서로 반환 (최대 5개)
    const seen = new Set<number>();
    const reranked: MatchedDocument[] = [];
    for (const idx of indices) {
      if (!seen.has(idx) && reranked.length < 5) {
        seen.add(idx);
        reranked.push(documents[idx]);
      }
    }
    return reranked;
  } catch {
    return documents.slice(0, 5); // 에러 시 상위 5개 반환
  }
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
      temperature: 1.0,
      maxOutputTokens: 2048,
      thinkingConfig: {
        thinkingLevel: 'low',
      },
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
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

    // 3. 쿼리 전처리: 대화 맥락 인식 재구성
    const apiKey = Deno.env.get('GOOGLE_API_KEY')!;
    const history = body.history?.slice(-6) ?? [];
    const reformulatedQuery = reformulateQuery(body.message, history);

    // 4. 쿼리 카테고리 분류
    const queryCategory = classifyQuery(reformulatedQuery);

    // 5. HyDE: 가상 답변 생성 + 원본 쿼리 임베딩 (병렬 실행)
    const [hydeAnswer, queryEmbedding] = await Promise.all([
      generateHypotheticalAnswer(reformulatedQuery, apiKey),
      generateQueryEmbedding(reformulatedQuery, apiKey),
    ]);

    // HyDE 답변 임베딩 생성
    const hydeEmbedding = await generateQueryEmbedding(hydeAnswer, apiKey);

    // 원본 + HyDE 임베딩 평균으로 검색 (가중 평균: 원본 40%, HyDE 60%)
    const combinedEmbedding = queryEmbedding.map((v, i) => v * 0.4 + hydeEmbedding[i] * 0.6);

    // 6. Hybrid 검색 (벡터 + 전문 검색 + 카테고리 필터)
    const rawDocs = await searchDocuments(supabase, combinedEmbedding, reformulatedQuery, queryCategory);

    // 7. LLM 리랭킹
    const matchedDocs = await rerankDocuments(reformulatedQuery, rawDocs, apiKey);

    // 8. 컨텍스트 구성 + LLM 답변 생성
    const context = matchedDocs.map((d) => d.content).join('\n\n---\n\n');

    const llmResponse = await generateAnswer(
      body.message,
      context,
      history,
      apiKey,
      matchedDocs.length > 0 ? 0.7 : 0,
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
