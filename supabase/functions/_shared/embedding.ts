/**
 * 임베딩(글 → 검색용 숫자) — 제미나이 gemini-embedding-2, 1536차원.
 *
 * ## 이력
 *
 * - 2026-08-25 구글 키가 무효화되자 챗봇이 **모든 질문에 500** 으로 죽어 업스테이지로 옮겼다.
 * - 2026-10-24 이번엔 업스테이지 키가 크레딧 만료로 정지돼 같은 일이 났고, 쓰던
 *   `embedding-query`/`-passage`(4096차원)도 2026-12-31 종료라 제미나이로 되돌렸다(ADR-142).
 *   답변은 Claude 가 만들지만 Claude 에는 임베딩 모델이 없다.
 * - 두 번 모두 "키 하나가 죽자 기능 전체가 멎었다"가 사고의 모양이었다. 그래서 이제
 *   ssampin-chat 은 임베딩이 실패하면 **글자 검색만으로** 답한다(축소 운영).
 *
 * ## 반드시 지킬 것
 *
 * ★질문과 문서는 **다른 형식**으로 감싼다 — gemini-embedding-2 는 비대칭 검색을 모델 인자가
 *   아니라 본문 앞머리로 구분한다(공식 문서 형식). 한쪽으로 통일하면 검색 품질이 조용히
 *   나빠지고 에러는 안 난다.
 *     질문: `task: search result | query: {질문}`
 *     문서: `title: {제목 또는 none} | text: {본문}`
 *
 * ★차원은 1536 이고, DB `ssampin_docs.embedding` 이 `vector(1536)` 이다(079). 한쪽만 바꾸면
 *   insert 가 통째로 실패한다. 2000 이하라 HNSW 색인을 걸 수 있다(080).
 *
 * ## 환경변수
 *
 *   GOOGLE_API_KEY   제미나이 키. 없으면 EmbeddingNotConfiguredError.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-embedding-2';

/** DB `ssampin_docs.embedding` 의 vector(N) 과 같아야 하는 값 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * 한 번에 보낼 수 있는 문서 수. 넘으면 나눠서 여러 번 부른다.
 * 호출부가 신경 쓰지 않도록 여기서 잘라 준다. (2026-10-24 100건 한 번에 성공 실측)
 */
const MAX_INPUTS_PER_REQUEST = 100;

const TIMEOUT_MS = 30_000;

/** 키가 없을 때. 배포 실수이므로 호출부가 '축소'로 내려보내고 로그를 남긴다. */
export class EmbeddingNotConfiguredError extends Error {
  constructor() {
    super('GOOGLE_API_KEY 미설정');
    this.name = 'EmbeddingNotConfiguredError';
  }
}

/** 공급자 오류(키 무효·장애·한도). 원문을 실어 로그에서 원인을 가릴 수 있게 한다. */
export class EmbeddingError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`임베딩 실패 (${status}): ${body.slice(0, 300)}`);
    this.name = 'EmbeddingError';
  }
}

/** 저장할 문서 한 건. 제목이 있으면 검색 품질에 도움이 된다. */
export interface PassageInput {
  readonly title?: string;
  readonly text: string;
}

interface GeminiValues {
  values?: number[];
}

function apiKey(): string {
  const key = Deno.env.get('GOOGLE_API_KEY');
  if (!key) throw new EmbeddingNotConfiguredError();
  return key;
}

function queryContent(text: string): string {
  return `task: search result | query: ${text}`;
}

function passageContent(passage: PassageInput): string {
  const title = passage.title?.trim() || 'none';
  return `title: ${title} | text: ${passage.text}`;
}

function checkedVector(values: number[] | undefined): number[] {
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new EmbeddingError(
      200,
      `차원이 ${values?.length ?? 0} 이다 (기대값 ${EMBEDDING_DIMENSIONS})`,
    );
  }
  return values;
}

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/models/${MODEL}:${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new EmbeddingError(response.status, await response.text());
  }
  return await response.json();
}

/** 질문 하나 → 벡터 하나. 검색할 때 쓴다. */
export async function embedQuery(text: string): Promise<number[]> {
  const json = (await post('embedContent', {
    content: { parts: [{ text: queryContent(text) }] },
    outputDimensionality: EMBEDDING_DIMENSIONS,
  })) as { embedding?: GeminiValues };
  return checkedVector(json.embedding?.values);
}

/**
 * 문서 여러 건 → 벡터 여러 건. 저장할 때 쓴다.
 * 입력 순서와 출력 순서가 같다는 것을 보장한다(호출부가 zip 하므로 어긋나면 내용이 섞인다).
 */
export async function embedPassages(passages: readonly PassageInput[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < passages.length; i += MAX_INPUTS_PER_REQUEST) {
    const batch = passages.slice(i, i + MAX_INPUTS_PER_REQUEST);
    const json = (await post('batchEmbedContents', {
      requests: batch.map((passage) => ({
        model: `models/${MODEL}`,
        content: { parts: [{ text: passageContent(passage) }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      })),
    })) as { embeddings?: GeminiValues[] };
    const embeddings = json.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new EmbeddingError(
        200,
        `요청 ${batch.length}건 중 ${embeddings.length}건만 돌아왔습니다`,
      );
    }
    out.push(...embeddings.map((embedding) => checkedVector(embedding.values)));
  }
  return out;
}
