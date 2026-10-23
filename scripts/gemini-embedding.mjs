/**
 * 챗봇 지식 문서용 제미나이 임베딩 — 스크립트 공용 (Node).
 *
 * 서버 함수 쪽 짝은 `supabase/functions/_shared/embedding.ts`(Deno)다. **두 파일의 모델·차원·
 * 감싸는 형식이 같아야 한다** — 문서를 여기서 넣고 질문은 서버에서 바꾸므로, 한쪽만 바뀌면
 * 검색이 에러 없이 조용히 어긋난다.
 *
 *   모델  gemini-embedding-2
 *   차원  1536  (DB `ssampin_docs.embedding vector(1536)`, 079)
 *   문서  `title: {제목 또는 none} | text: {본문}`
 *   질문  `task: search result | query: {질문}`
 *
 * 키: GOOGLE_API_KEY. 값은 출력하지 않는다.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIMENSIONS = 1536;
const MAX_INPUTS_PER_REQUEST = 100;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** @param {{ title?: string, text: string }} passage */
export function passageContent(passage) {
  const title = passage.title?.trim() || 'none';
  return `title: ${title} | text: ${passage.text}`;
}

/** @param {string} text */
export function queryContent(text) {
  return `task: search result | query: ${text}`;
}

function checkedVector(values) {
  if (
    !Array.isArray(values) ||
    values.length !== EMBEDDING_DIMENSIONS ||
    values.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`임베딩 형식이 올바르지 않습니다 (차원 ${values?.length ?? 0})`);
  }
  return values;
}

async function post(path, body, apiKey, attempt = 1) {
  const response = await fetch(`${BASE_URL}/models/${GEMINI_EMBEDDING_MODEL}:${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (response.status === 429 && attempt < 5) {
    console.warn(`  제미나이 한도 도달, ${attempt * 5}초 후 재시도...`);
    await sleep(attempt * 5000);
    return post(path, body, apiKey, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(
      `제미나이 임베딩 실패 (HTTP ${response.status}): ${(await response.text()).slice(0, 300)}`,
    );
  }
  return response.json();
}

/**
 * 문서 여러 건 → 벡터 여러 건. 입력 순서 = 출력 순서.
 * @param {ReadonlyArray<{ title?: string, text: string }>} passages
 * @param {string} apiKey
 * @returns {Promise<number[][]>}
 */
export async function embedPassages(passages, apiKey) {
  const out = [];
  for (let i = 0; i < passages.length; i += MAX_INPUTS_PER_REQUEST) {
    const batch = passages.slice(i, i + MAX_INPUTS_PER_REQUEST);
    if (passages.length > MAX_INPUTS_PER_REQUEST) {
      console.log(`  임베딩 생성 중... (${i + 1}~${i + batch.length}/${passages.length})`);
    }
    const json = await post(
      'batchEmbedContents',
      {
        requests: batch.map((passage) => ({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text: passageContent(passage) }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      },
      apiKey,
    );
    const embeddings = json.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(`임베딩 ${batch.length}건 요청, ${embeddings.length}건 응답 — 개수 불일치`);
    }
    out.push(...embeddings.map((embedding) => checkedVector(embedding.values)));
  }
  return out;
}

/**
 * 질문 하나 → 벡터 하나.
 * @param {string} text
 * @param {string} apiKey
 * @returns {Promise<number[]>}
 */
export async function embedQuery(text, apiKey) {
  const json = await post(
    'embedContent',
    {
      content: { parts: [{ text: queryContent(text) }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    },
    apiKey,
  );
  return checkedVector(json.embedding?.values);
}
