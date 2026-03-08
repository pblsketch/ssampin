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
- 제공된 컨텍스트(문서) 기반으로만 답변합니다.
- 모르는 내용은 솔직히 "아직 그 부분은 정보가 없어요"라고 말합니다.

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
- 컨텍스트에 관련 정보가 전혀 없는 경우
- 답변 확신이 50% 미만인 경우

에스컬레이션 시 다음 JSON 형식으로만 응답:
{"escalation": true, "type": "bug|feature|other", "summary": "한줄 요약"}

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

    const confidence = matchedDocs.length > 0
      ? Math.min(matchedDocs[0].similarity, 1)
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
