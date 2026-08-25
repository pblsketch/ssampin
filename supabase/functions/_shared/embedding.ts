/**
 * 임베딩(글 → 검색용 숫자) — 업스테이지 solar embedding.
 *
 * ## 왜 구글에서 옮겼나
 *
 * 2026-08-25 구글 API 키가 무효화되면서 도움말 챗봇이 **모든 질문에 500** 으로 죽었다.
 * 질문을 벡터로 바꾸는 단계가 검색보다 앞단이고 폴백이 없어서, 키 하나가 죽자 기능이
 * 통째로 멎었다. 답변 생성은 이미 업스테이지(solar-pro3)였으므로 임베딩까지 옮겨
 * **키 한 종류만 관리**한다. 공급자가 하나면 죽을 곳도 하나다.
 *
 * ## 반드시 지킬 것
 *
 * ★질문과 문서는 **다른 모델**을 쓴다 — `embedding-query` / `embedding-passage`.
 *   비대칭 검색(짧은 질문 ↔ 긴 문서)용으로 짝지어 학습된 모델이라, 한쪽으로 통일하면
 *   검색 품질이 조용히 나빠진다. 틀려도 에러가 안 나므로 눈치채기 어렵다.
 *
 * ★차원은 4096 이고, DB `ssampin_docs.embedding` 이 `vector(4096)` 이다. 한쪽만 바꾸면
 *   insert 가 통째로 실패한다. 줄이려면 `dimensions` 를 주고 DB 칼럼도 같이 바꿔야 한다.
 *
 * ## 환경변수
 *
 *   UPSTAGE_API_KEY   업스테이지 키. 없으면 EmbeddingNotConfiguredError.
 *   UPSTAGE_BASE_URL  기본 'https://api.upstage.ai/v1'
 */

const DEFAULT_BASE_URL = 'https://api.upstage.ai/v1';

/** 질문용 모델 — 짧은 검색어를 문서 쪽 벡터 공간에 맞춰 놓는다 */
const QUERY_MODEL = 'embedding-query';
/** 문서용 모델 — 저장할 본문에 쓴다 */
const PASSAGE_MODEL = 'embedding-passage';

/** DB `ssampin_docs.embedding` 의 vector(N) 과 같아야 하는 값 */
export const EMBEDDING_DIMENSIONS = 4096;

/**
 * 한 번에 보낼 수 있는 문서 수. 넘으면 나눠서 여러 번 부른다.
 * 호출부가 신경 쓰지 않도록 여기서 잘라 준다.
 */
const MAX_INPUTS_PER_REQUEST = 100;

const TIMEOUT_MS = 30_000;

/** 키가 없을 때. 배포 실수이므로 호출부가 '축소'로 내려보내고 로그를 남긴다. */
export class EmbeddingNotConfiguredError extends Error {
  constructor() {
    super('UPSTAGE_API_KEY 미설정');
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

interface UpstageEmbeddingResponse {
  data: { index: number; embedding: number[] }[];
}

function baseUrl(): string {
  return (Deno.env.get('UPSTAGE_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** 한 묶음 호출. `index` 로 되돌려 정렬한다 — 응답 순서를 믿지 않는다. */
async function embedBatch(model: string, inputs: readonly string[]): Promise<number[][]> {
  const apiKey = Deno.env.get('UPSTAGE_API_KEY');
  if (!apiKey) throw new EmbeddingNotConfiguredError();

  const response = await fetch(`${baseUrl()}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: inputs }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new EmbeddingError(response.status, await response.text());
  }

  const json = (await response.json()) as UpstageEmbeddingResponse;
  const sorted = [...json.data].sort((a, b) => a.index - b.index);

  if (sorted.length !== inputs.length) {
    throw new EmbeddingError(200, `요청 ${inputs.length}건 중 ${sorted.length}건만 돌아왔습니다`);
  }
  return sorted.map((d) => d.embedding);
}

/** 질문 하나 → 벡터 하나. 검색할 때 쓴다. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedBatch(QUERY_MODEL, [text]);
  return vector;
}

/**
 * 문서 여러 건 → 벡터 여러 건. 저장할 때 쓴다.
 * 입력 순서와 출력 순서가 같다는 것을 보장한다(호출부가 zip 하므로 어긋나면 내용이 섞인다).
 */
export async function embedPassages(texts: readonly string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += MAX_INPUTS_PER_REQUEST) {
    out.push(...(await embedBatch(PASSAGE_MODEL, texts.slice(i, i + MAX_INPUTS_PER_REQUEST))));
  }
  return out;
}
