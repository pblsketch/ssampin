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
import { checkRateLimit, clientIpFrom } from '../_shared/rateLimit.ts';

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
9. **운영체제(플랫폼) 일관성 (매우 중요):** 대화 맥락이나 [사용자 현재 상태]·[확인된 플랫폼]에서 사용자의 OS가 macOS 또는 Windows로 드러나면, **그 플랫폼에 맞는 해결법만** 제시하세요. macOS 사용자에게 Windows 전용 안내(설치 파일 .exe 실행, 백신 V3·알약 끄기, 스마트 앱 컨트롤, 작업 관리자, "추가 정보 → 실행")를 섞지 마세요. Windows 사용자에게도 macOS 전용 안내(DMG, xattr, "그래도 열기")를 섞지 마세요. 검색된 문서가 반대 플랫폼 것이더라도 확인된 플랫폼을 우선합니다. 단, OS를 되묻는 것은 **설치·실행 실패·보안 차단 등 해결법이 OS마다 다른 문제일 때로 한정**하고, 그마저도 OS가 끝까지 불명확할 때만 합니다. 기능·사용법·요금 같은 일반 질문은 OS를 되묻지 말고 바로 답하세요.

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

## 모호한 질문 되묻기 (중요)
질문이 한 줄이고 어느 기능을 말하는지 분명하지 않으면(예: "작동이 안돼요", "안 깔려요", "안 돼요", "오류나요"만 있는 경우), 임의의 기능(학교 Wi-Fi·실시간 활동·특정 도구 등)을 단정해 답하지 마세요. 어떤 화면·기능에서 무엇이 안 되는지 1개의 질문으로 먼저 되물은 뒤 안내합니다. 단, 설치·업데이트·보안 차단처럼 맥락이 분명한 경우는 기존 트러블슈팅 안내를 그대로 제공합니다. 또한 [관련 문서]가 특정 기능을 명확히 가리키면 그 문서를 우선해 답하고, 문서와 동떨어진 기능을 임의로 끌어와 답하지 마세요. (우선순위: 먼저 되묻고, 되물었는데도 어느 기능인지 특정되지 않으면 그때 아래 '에스컬레이션 판단'의 버그 처리로 넘어갑니다.)

## 문제 해결 안내 원칙 (플랫폼별 — 위 규칙 9에 따라 확인된 OS의 항목만 사용)
### Windows
1. 설치/업데이트 문제 질문 시 구체적인 단계별 해결법을 안내합니다.
2. 백신 차단 문제(V3, 알약 등): "실시간 감시를 잠시 끄고 설치 → 설치 후 다시 켜기" 순서로 안내합니다.
3. Windows 보안 경고: "Microsoft Windows의 PC 보호" 화면이면 "추가 정보 → 실행", "스마트 앱 컨트롤이 차단했습니다" 화면이면 설정 → 개인정보 및 보안 → Windows 보안 → 앱 및 브라우저 컨트롤 → 스마트 앱 컨트롤 → "끔"을 안내합니다.
4. 업데이트 실패 시: ssampin.com에서 최신 설치 파일(ssampin-Setup.exe)을 수동 다운로드하라고 안내합니다.
5. 데이터 관련 질문: Windows 데이터 저장 위치는 %APPDATA%/ssampin/data/ 이고, 앱을 삭제해도 데이터는 보존된다고 안내합니다.
### macOS (베타 지원 — Apple 인증서 없음)
6. "개발자를 확인할 수 없음"·"손상되었기 때문에 열 수 없습니다" 경고: ① 경고 창에서 "완료"(휴지통으로 이동 금지) → ② 시스템 설정 → 개인정보 보호 및 보안 → 아래로 스크롤 → ③ 쌤핀 옆 "그래도 열기" → 암호 입력. **"Control+클릭 → 열기" 방식은 macOS 15(Sequoia) 이상에서 동작하지 않으므로 안내하지 마세요.**
7. "이 버전의 macOS에서 작동하는지 확인하려면 개발자에게 문의하십시오" 오류: 칩(Apple Silicon/Intel) 불일치입니다. 🍎 메뉴 → "이 Mac에 관하여"에서 칩 확인 후 맞는 DMG(Apple M칩=arm64, Intel=x64)를 ssampin.com에서 다시 받아 설치하도록 안내합니다.
8. macOS는 자동 업데이트가 없습니다(베타). 새 버전은 DMG를 받아 응용 프로그램 폴더에 덮어써 수동 설치하며, 데이터는 유지됩니다. 손상 경고 반복 시 터미널에서 "xattr -cr /Applications/쌤핀.app" 명령을 안내하세요.
### 공통
9. 기본 트러블슈팅 순서: 앱 재시작 → 최신 버전 확인 → 재설치를 먼저 안내한 후, 그래도 안 되면 에스컬레이션합니다.

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

/**
 * 텍스트에서 사용자 운영체제(플랫폼)를 추정. 강한 고유 신호만 사용해 오탐을 줄인다.
 * (예: navigator.platform 의 "MacIntel"/"Win32", macOS 버전명 tahoe/sequoia, .exe, xattr 등)
 */
function detectPlatform(text: string): 'macOS' | 'Windows' | null {
  if (!text) return null;
  const mac =
    /macos|macintel|macintosh|맥북|맥\b|\bmac\b|tahoe|sequoia|sonoma|ventura|monterey|\bdmg\b|apple silicon|\bm[1-4]\b|xattr|gatekeeper|개발자를 확인|응용 ?프로그램|런치패드|launchpad|그래도 열기/i;
  const win =
    /windows|윈도우|win ?1[01]|win32|\.exe|smartscreen|스마트 ?앱 ?컨트롤|바탕화면|작업 ?관리자|제어판|\bv3\b|알약|추가 ?정보/i;
  const isMac = mac.test(text);
  const isWin = win.test(text);
  if (isMac && !isWin) return 'macOS';
  if (isWin && !isMac) return 'Windows';
  return null; // 둘 다/둘 다 아님 → 불명확
}

/** 대화 맥락 인식 쿼리 재구성 — 애매하거나 짧은 후속 질문에 직전 사용자 질문을 이어붙여 검색 맥락을 회복 */
function reformulateQuery(message: string, history: ChatHistoryItem[]): string {
  const trimmed = message.trim();
  const ambiguousPatterns =
    /^(그거|이거|그건|거기|어떻게|왜|뭐가|그럼|그래서|그러면|저거|이건|그게|뭔가요|그건요).{0,15}$/;
  // 짧은 후속("그래도 안 돼", "알려준대로 해도 실행이 안되" 등)은 자체 주제 앵커가 약해
  // 임베딩·HyDE 검색이 엉뚱한(기본 편향된) 문서를 잡는다. 직전 사용자 질문을 이어붙여 맥락 회복.
  const shortFollowUp = trimmed.length <= 30;
  if ((ambiguousPatterns.test(trimmed) || shortFollowUp) && history.length >= 2) {
    const lastUserMsg = [...history]
      .reverse()
      .find((h) => h.role === 'user' && h.content.trim() !== trimmed);
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
    // ── 기능별 분류 (troubleshooting 보다 먼저 — "○○ 안돼/오류" 가 설치문제로 오분류되지 않게) ──
    // 카테고리 문자열은 KB(scripts/ingest-chatbot-qa.mjs)의 metadata.category 값과 정확히 일치해야 함.
    // 첫 매칭 승: 위의 기존 카테고리(settings/sync 등)가 키워드 겹침 시 우선한다(예: 'AI 연결 설정'→settings).
    // 가산보강 구조라 오분류돼도 전체검색이 정답 문서를 붙잡으므로 비치명적이다.
    ['homeroom', /생활기록부|생기부|근거 ?자료|누가기록|관찰기록|특기사항|세특|행동특성/i],
    [
      'ai-bridge',
      /AI ?브릿지|브릿지|MCP|외부 ?AI|클로드|claude|제미나이|gemini|코덱스|codex|안티그래비티|AI ?연결/i,
    ],
    ['attendance', /출결|출석|결석|지각|조퇴|무단/],
    ['consultation', /상담|학부모 ?상담|상담 ?예약/],
    ['realtime-wall', /담벼락|실시간 ?벽|모둠 ?의견/],
    ['survey', /설문|투표|워드클라우드|복합 ?설문|발제|퀴즈/],
    ['collab-board', /협업 ?보드|협업보드|화이트보드|모둠 ?보드/],
    ['assignment', /과제|수합|제출물/],
    ['signature', /서명받기|서명 ?받기|등록부/],
    ['roster', /명단|명렬|반 ?학생/],
    ['note', /쌤핀 ?노트|블록 ?에디터/],
    ['bookmark', /북마크|즐겨찾기/],
    ['meal', /급식|식단|중식|석식/],
    ['native-desktop', /바탕화면 ?아이콘|바탕화면 ?모드|아이콘 ?아래/],
    ['markdown-convert', /마크다운|markdown|hwpx/i],
    ['tools', /쌤도구|룰렛|뽑기|사다리|타이머|이름 ?뽑기|랜덤 ?뽑기/],
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
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `쌤핀(SsamPin) 교사용 데스크톱 앱 도움말에서 다음 질문에 대한 답변을 2-3문장으로 작성하세요. 추측이어도 괜찮습니다: ${query}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 1.0,
            maxOutputTokens: 200,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      },
    );
    if (!response.ok) return query; // 실패 시 원본 쿼리 반환
    const data = (await response.json()) as GeminiGenerateResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? query;
  } catch {
    return query; // 에러 시 원본 쿼리 반환
  }
}

/** 질문 임베딩 생성 (gemini-embedding-001, 768차원) */
async function generateQueryEmbedding(query: string, apiKey: string): Promise<number[]> {
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
    },
  );

  if (!response.ok) {
    throw new Error(`임베딩 생성 실패: ${response.status}`);
  }

  const data = (await response.json()) as GeminiEmbeddingResponse;
  return data.embedding.values;
}

/**
 * Hybrid 검색 (벡터 + 전문 검색 + RRF).
 *
 * ⚠️ 과거에는 category 가 추정되면 'hybrid_search_ssampin_docs_filtered' 로 그 카테고리
 * 문서만 '하드필터' 검색했다. 이 구조는 분류기(classifyQuery)가 질문을 잘못 분류하면(예:
 * "생기부 초안 안돼" → '안돼' 때문에 troubleshooting 으로 오분류) 정답 문서가 검색 후보에서
 * 통째로 빠져 엉뚱한 답(학교 Wi-Fi·실시간 활동 등)이 나오는 치명적 함정이었다.
 *
 * 그래서 이제는 '하드필터'가 아니라 '가산 보강'으로 바꾼다:
 *   ① 항상 카테고리 무관 전체 검색을 수행해 정답 문서가 절대 누락되지 않게 한다(recall 보장).
 *   ② category 가 추정되면 해당 카테고리 문서를 추가로 끌어와 앞쪽에 보강한다(precision↑).
 * 분류가 틀려도 ①이 정답을 붙잡고, 맞으면 ②가 정확도를 올린다. 최종 선별은 LLM 리랭킹이 한다.
 */
async function searchDocuments(
  supabase: ReturnType<typeof createClient>,
  queryEmbedding: number[],
  queryText: string,
  category: string | null,
): Promise<MatchedDocument[]> {
  const embeddingJson = JSON.stringify(queryEmbedding);

  // ① 항상 전체(카테고리 무관) hybrid 검색 — 오분류로 정답이 빠지는 일을 원천 차단
  const { data: baseData, error: baseError } = await supabase.rpc('hybrid_search_ssampin_docs', {
    query_text: queryText,
    query_embedding: embeddingJson,
    match_count: 10,
  });

  if (baseError) {
    console.error('Hybrid 검색 에러:', baseError);
    // Fallback: 기존 벡터 검색
    const { data: fallbackData } = await supabase.rpc('match_ssampin_docs', {
      query_embedding: embeddingJson,
      match_count: 10,
      match_threshold: 0.35,
    });
    return (fallbackData ?? []) as MatchedDocument[];
  }

  const baseDocs = (baseData ?? []) as MatchedDocument[];

  // 카테고리 추정이 없으면 전체 검색 결과를 그대로 사용
  if (!category) return baseDocs;

  // ② 카테고리 문서를 추가로 끌어와 앞쪽에 보강(가산). 실패해도 전체 검색 결과는 유지
  const { data: catData } = await supabase.rpc('hybrid_search_ssampin_docs_filtered', {
    query_text: queryText,
    query_embedding: embeddingJson,
    match_count: 6,
    filter_category: category,
  });

  const catDocs = (catData ?? []) as MatchedDocument[];
  if (catDocs.length === 0) return baseDocs;

  // 카테고리 문서를 앞에, 전체 검색 문서를 뒤에 두고 id 기준 중복 제거 (최대 12개)
  const seen = new Set<number>();
  const merged: MatchedDocument[] = [];
  for (const doc of [...catDocs, ...baseDocs]) {
    // id 가 비어 있으면(RPC 반환에 id 누락 등) 중복 제거를 건너뛰고 그대로 유지한다.
    // (Set 이 undefined 를 하나로 뭉개 결과가 조용히 붕괴하는 것을 방지)
    if (doc.id == null) {
      merged.push(doc);
      continue;
    }
    if (!seen.has(doc.id)) {
      seen.add(doc.id);
      merged.push(doc);
    }
  }
  return merged.slice(0, 12);
}

/** LLM 리랭킹: 검색된 문서의 관련성을 LLM으로 재평가 */
async function rerankDocuments(
  query: string,
  documents: MatchedDocument[],
  apiKey: string,
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
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `질문: "${query}"\n\n아래 문서들의 관련성을 평가하고, 가장 관련 있는 문서 인덱스를 관련도 순으로 쉼표 구분하여 반환하세요. 숫자만 반환:\n${docList}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 1.0,
            maxOutputTokens: 50,
            thinkingConfig: { thinkingLevel: 'minimal' },
          },
        }),
      },
    );

    if (!response.ok) return documents.slice(0, 5);

    const data = (await response.json()) as GeminiGenerateResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const indices =
      text
        .match(/\d+/g)
        ?.map(Number)
        .filter((i) => i >= 0 && i < documents.length) ?? [];

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
  appContext?: string,
  platformHint?: 'macOS' | 'Windows' | null,
): Promise<string> {
  // 컨텍스트가 부족한 경우 힌트 추가
  const contextNote =
    topSimilarity < 0.7
      ? '\n\n[참고: 관련 문서가 충분하지 않을 수 있습니다. 확신이 없으면 에스컬레이션하세요.]'
      : '';

  // 대화에서 플랫폼이 확인되면 시스템 지시에 못 박아, 검색 문서가 반대 OS 것이어도 흔들리지 않게 한다.
  const platformNote = platformHint
    ? `\n\n[확인된 플랫폼: ${platformHint}] 반드시 ${platformHint} 전용 해결법만 안내하고, 반대 OS 안내는 절대 섞지 마세요.`
    : '';

  const systemPrompt = SYSTEM_PROMPT + contextNote + platformNote;

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
        parts: [
          {
            text: `${appContext ? `[사용자 현재 상태]\n현재 페이지: ${appContext}\n\n` : ''}[관련 문서]\n${context || '(관련 문서 없음)'}\n\n[질문]\n${question}`,
          },
        ],
      },
    ],
    generationConfig: {
      // 지원 봇의 최종 답변은 검색 문서·대화 맥락에 충실해야 하므로 낮은 온도를 쓴다.
      // (과거 1.0 은 같은 질문에 Mac/Windows 답을 오가는 비결정성의 직접 원인이었다.)
      temperature: 0.3,
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
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini 답변 생성 실패: ${response.status}`);
  }

  const data = (await response.json()) as GeminiGenerateResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '답변을 생성하지 못했어요.';
}

/** 에스컬레이션 JSON 파싱 */
function parseEscalation(
  response: string,
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
      const type = validTypes.includes(parsed.type as (typeof validTypes)[number])
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
    feature:
      '💡 좋은 아이디어네요! 개발자에게 전달해 드릴게요.\n아래에서 원하시는 기능을 자세히 설명해 주세요!',
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
  isTest: boolean = false,
): Promise<void> {
  await supabase.from('ssampin_conversations').insert([
    { session_id: sessionId, role: 'user', content: userMessage, is_test: isTest },
    {
      session_id: sessionId,
      role: 'assistant',
      content: assistantMessage,
      sources,
      is_test: isTest,
    },
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const clientIP = clientIpFrom(req);
    const isLimited = await checkRateLimit(supabase, 'chat', [
      { identifier: clientIP, windowMs: 60_000, max: 10 },
      { identifier: body.sessionId, windowMs: 86_400_000, max: 50 },
    ]);
    if (isLimited) {
      return jsonResponse(
        {
          type: 'answer',
          message: '⏳ 잠시 후 다시 시도해 주세요. 너무 많은 요청이 감지되었어요.',
          sources: [],
          confidence: 1,
        } satisfies ChatResponseAnswer,
        429,
      );
    }

    // 3. 쿼리 전처리: 대화 맥락 인식 재구성
    const apiKey = Deno.env.get('GOOGLE_API_KEY')!;
    const history = body.history?.slice(-6) ?? [];
    let reformulatedQuery = reformulateQuery(body.message, history);

    // 3-1. 플랫폼(OS) 확정: 이번 메시지 → 대화 히스토리 → 앱 컨텍스트 순으로 탐지.
    // 짧은 후속 질문("실행이 안돼")은 자체 플랫폼 신호가 없어 검색이 다수(Windows) 문서로
    // 쏠린다. 대화에서 이미 드러난 OS를 검색 쿼리에 못 박아 recall 을 그 플랫폼으로 끌어온다.
    const msgPlatform = detectPlatform(body.message);
    const historyText = history.map((h) => h.content).join(' ');
    const platformHint =
      msgPlatform ?? detectPlatform(historyText) ?? detectPlatform(body.appContext ?? '');
    if (platformHint && !msgPlatform) {
      reformulatedQuery = `${reformulatedQuery} (${platformHint} 환경)`;
    }

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
    const rawDocs = await searchDocuments(
      supabase,
      combinedEmbedding,
      reformulatedQuery,
      queryCategory,
    );

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
      body.appContext,
      platformHint,
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
      await saveConversation(
        supabase,
        body.sessionId,
        body.message,
        escalation.summary,
        [],
        body.isTest ?? false,
      );

      return jsonResponse({
        type: 'escalation',
        message: getEscalationMessage(escalation.type),
        escalationType: escalation.type,
      } satisfies ChatResponseEscalation);
    }

    // 7. 일반 답변 반환

    // 답변이 "정보 없음"을 자인하는 표현(hedging)을 쓰면 신뢰도/출처를 보수적으로 처리
    const hedgingPatterns = ['정보가 없', '모르', '확인이 어렵', '아직 지원하지', '잘 모르'];
    const hasHedging = hedgingPatterns.some((p) => llmResponse.includes(p));

    // 출처(참고 문서) 목록.
    // ⚠️ hybrid_search 가 돌려주는 similarity 는 코사인 유사도가 아니라 순위 융합(RRF) 점수
    // (대략 0.01~0.03)다. 따라서 코사인 기준값(0.55)으로 거르면 출처가 항상 비어 화면의
    // "📚 참고" 줄이 영영 안 뜬다. matchedDocs 는 이미 LLM 리랭킹으로 관련도 상위만 추려진
    // 상태이므로 상위 문서 제목을 그대로 출처로 쓴다. 단 답변이 정보 없음을 자인한 경우엔
    // 잘못된 출처 표기를 막기 위해 비운다.
    const sources = hasHedging
      ? []
      : [
          ...new Set(
            matchedDocs
              .slice(0, 3)
              .map((d) => d.metadata?.title ?? d.metadata?.source ?? '')
              .filter((t): t is string => t.length > 0),
          ),
        ];

    // 신뢰도: RRF 점수는 0~1 신뢰도로 직접 환산할 수 없으므로(스케일이 ~0.01) 점수 크기 대신
    // "근거 문서 검색 성공 여부 + hedging" 으로 판정한다. 낮은 신뢰도 안내 배너는 0.45 미만에서
    // 노출되므로, 근거가 있고 답변이 자신 있을 때(0.85)는 배너가 뜨지 않고, 근거가 없거나(0.3)
    // 답변이 정보 없음을 자인할 때(0.35)만 배너가 노출된다.
    const confidence = matchedDocs.length === 0 ? 0.3 : hasHedging ? 0.35 : 0.85;

    // 대화 로그 저장
    await saveConversation(
      supabase,
      body.sessionId,
      body.message,
      llmResponse,
      sources,
      body.isTest ?? false,
    );

    return jsonResponse({
      type: 'answer',
      message: llmResponse,
      sources,
      confidence,
    } satisfies ChatResponseAnswer);
  } catch (error) {
    console.error('Chat error:', error);
    return jsonResponse(
      {
        type: 'answer',
        message: '죄송해요, 일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요! 🙏',
        sources: [],
        confidence: 0,
      } satisfies ChatResponseAnswer,
      500,
    );
  }
});
