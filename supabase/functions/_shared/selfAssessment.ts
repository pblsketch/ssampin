/**
 * 학생 자기평가서 — 서버 쪽 검사.
 *
 * ★정본은 앱의 `src/domain/entities/SelfAssessment.ts` 다. 엣지 함수는 Deno 라 그 파일을 못
 *   가져오므로 **규칙을 옮겨 적는다.** 두 곳이 어긋나면 앱에서는 되는데 서버가 거절하는(또는
 *   그 반대의) 상태가 되므로, 아래 상수와 자르기 규칙을 고칠 때는 반드시 양쪽을 같이 고친다.
 *
 * 왜 서버가 또 검사하는가: 학생 화면은 브라우저다. 개발자 도구로 아무 값이나 보낼 수 있다.
 * 앱이 만든 문항 정의와 대조해 **모르는 문항 id 는 버리고**, 길이도 서버에서 자른다.
 */

/** 문항 수 상한. 앱 `SELF_ASSESSMENT_MAX_QUESTIONS` 와 같아야 한다. */
export const MAX_QUESTIONS = 6;

/**
 * 한 제출에 **저장해 둘 수 있는 답 개수** 상한. 문항 상한(6)과 **일부러 다르다.**
 *
 * 교사가 문항을 갈아 끼우면 옛 답 + 새 답이 6 을 넘는다. 그건 위반이 아니라 정상이라,
 * 표의 `submissions_self_assessment_shape` 도 12 로 잡혀 있다(마이그레이션 070).
 * 두 숫자가 어긋나면 upsert 가 통째로 실패해 **학생이 방금 쓴 글을 잃는다.**
 */
export const MAX_STORED_ANSWERS = 12;

/** 답변 길이 상한(글자 수). 앱 `SELF_ASSESSMENT_MAX_ANSWER_LENGTH` 와 같아야 한다. */
export const MAX_ANSWER_LENGTH = 1000;

/** 문항 길이 상한. 앱 `SELF_ASSESSMENT_MAX_PROMPT_LENGTH` 와 같아야 한다. */
export const MAX_PROMPT_LENGTH = 200;

export interface SelfAssessmentQuestion {
  id: string;
  prompt: string;
  slot?: string;
  maxLength?: number;
}

export interface SelfAssessmentAnswer {
  questionId: string;
  prompt: string;
  slot?: string;
  answer: string;
}

/**
 * 글자 수만큼 자른다 — **코드 포인트 기준**.
 *
 * ★`String.slice` 를 쓰면 안 된다. 이모지 하나가 2로 세어져 앱이 보여 주는 잔여 글자 수와
 * 어긋나고, 자르는 자리가 이모지 한복판이면 반쪽 글자가 남아 Postgres `jsonb` 저장이 통째로
 * 실패한다(unsupported Unicode escape sequence). 앱 쪽 `clipText` 와 같은 규칙이다.
 */
function clip(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('');
}

function limitOf(q: SelfAssessmentQuestion): number {
  const raw = q.maxLength;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return MAX_ANSWER_LENGTH;
  return Math.min(Math.floor(raw), MAX_ANSWER_LENGTH);
}

function isQuestion(v: unknown): v is SelfAssessmentQuestion {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.prompt !== 'string') return false;
  if (o.slot !== undefined && typeof o.slot !== 'string') return false;
  if (o.maxLength !== undefined && typeof o.maxLength !== 'number') return false;
  return true;
}

/**
 * 교사가 보낸 문항 정의를 저장 직전에 다듬는다(create-assignment).
 *
 * 배열이 아니거나 쓸 만한 문항이 하나도 없으면 `null` 을 준다 — 호출자는 컬럼에 NULL 을 넣어
 * "이 과제는 자기평가를 받지 않는다"로 남긴다(빈 배열로 넣지 않는다. 부재와 빈 값을 구분한다).
 */
export function sanitizeQuestions(raw: unknown): SelfAssessmentQuestion[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const out: SelfAssessmentQuestion[] = [];
  for (const item of raw) {
    if (out.length >= MAX_QUESTIONS) break;
    if (!isQuestion(item)) continue;
    const id = item.id.trim();
    const prompt = item.prompt.trim();
    if (id.length === 0 || prompt.length === 0 || seen.has(id)) continue;
    seen.add(id);
    const q: SelfAssessmentQuestion = { id, prompt: clip(prompt, MAX_PROMPT_LENGTH) };
    if (typeof item.slot === 'string' && item.slot.trim().length > 0) q.slot = item.slot.trim();
    const lim = limitOf(item);
    if (lim !== MAX_ANSWER_LENGTH) q.maxLength = lim;
    out.push(q);
  }
  return out.length > 0 ? out : null;
}

/**
 * 저장된 문항 정의(JSONB)를 읽을 때. 모양이 아니면 빈 배열.
 * 표의 CHECK 이 6개를 막고 있지만 여기서도 자른다 — 방어를 한 겹에만 두지 않는다.
 */
export function readQuestions(raw: unknown): SelfAssessmentQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isQuestion).slice(0, MAX_QUESTIONS);
}

export interface SanitizeAnswersResult {
  /** 저장할 값. 쓸 만한 답이 하나도 없으면 null. */
  answers: SelfAssessmentAnswer[] | null;
  /** 학생에게 돌려줄 거절 사유. 없으면 통과. */
  error?: string;
}

/**
 * 학생이 보낸 답변을 과제의 문항 정의와 대조해 다듬는다(submit-assignment).
 *
 * - 문항에 없는 `questionId` 는 **버린다**(브라우저를 고쳐 보낸 값).
 * - 문항 원문·슬롯은 학생이 보낸 값이 아니라 **저장된 문항 정의에서** 복사한다.
 * - 빈 답은 버린다. 길이는 문항별 상한으로 자른다.
 * - 결과 순서는 문항 순서다 — 교사가 늘 같은 차례로 읽는다.
 *
 * ★길이 초과를 **거절하지 않고 자른다.** 학생이 길게 쓴 글을 제출 순간에 통째로 잃는 것보다
 *   낫다. 대신 앱과 학생 화면이 같은 상한을 미리 보여 준다.
 */
export function sanitizeAnswers(raw: unknown, questionsRaw: unknown): SanitizeAnswersResult {
  const questions = readQuestions(questionsRaw);
  if (questions.length === 0) {
    // 이 과제는 자기평가를 안 받는다. 학생이 보냈어도 저장하지 않는다.
    return { answers: null };
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.trim().length === 0) return { answers: null };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { answers: null, error: '자기평가 답변 형식이 올바르지 않습니다' };
    }
  }
  if (parsed === undefined || parsed === null) return { answers: null };
  if (!Array.isArray(parsed)) {
    return { answers: null, error: '자기평가 답변 형식이 올바르지 않습니다' };
  }

  const byId = new Map<string, unknown>();
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.questionId !== 'string') continue;
    if (!byId.has(o.questionId)) byId.set(o.questionId, o);
  }

  const out: SelfAssessmentAnswer[] = [];
  for (const q of questions) {
    const found = byId.get(q.id) as Record<string, unknown> | undefined;
    if (!found || typeof found.answer !== 'string') continue;
    const text = found.answer.trim();
    if (text.length === 0) continue;
    const a: SelfAssessmentAnswer = {
      questionId: q.id,
      prompt: q.prompt,
      answer: clip(text, limitOf(q)),
    };
    if (q.slot !== undefined) a.slot = q.slot;
    out.push(a);
  }
  return { answers: out.length > 0 ? out : null };
}

/** 이 과제가 자기평가만 받는가(파일·글 없이 제출 가능한가). */
export function isSelfAssessmentOnly(submitType: unknown): boolean {
  return submitType === 'selfAssessment';
}

/* ────────────────────────────────────────────────────────────────────────
 * 재제출 병합 — "안 보낸 칸은 지우지 않는다"
 *
 * ★왜 순수 함수로 빼는가: 이 규칙이 `submit-assignment/index.ts` 안에만 있으면 **어느 게이트도
 *   안 본다.** 실제로 3차 리뷰에서 "게이트 4종 초록인 채 존재하는 결함"으로 지적받은 자리다.
 *
 * ★이 규칙을 **실제로 돌리는 게이트**는 `src/infrastructure/supabase/__tests__/selfAssessmentEdgeMerge.meta.test.ts`
 *   다(vitest → `npm run test`). 이 파일이 **import 0건 · `Deno.` 전역 0건인 순수 TypeScript** 라
 *   vitest 가 그대로 가져올 수 있어서다. **그 조건을 깨지 말 것** — 여기에 `import` 나 `Deno.` 를
 *   들이는 순간 게이트 밖으로 나간다.
 *   같은 폴더의 `selfAssessment.test.ts`(Deno)는 더 넓게 보지만 **게이트가 아니다** —
 *   `npm run test:edge` 는 **CI(.github/workflows) 에도 게이트 4종에도 없다.** 로컬에 deno 가
 *   있으면 돈다(2026-09-09 기준 deno 2.7.11 · `npm run test:edge` 37건 통과, 그중 `_shared/selfAssessment.test.ts` 가 29건).
 *   즉 **못 도는 게 아니라 자동으로 안 도는 것**이다 — 기기마다 갈리므로 게이트로 삼지 않는다.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ExistingSubmissionRow {
  student_id: string | null;
  file_name: string | null;
  file_size: number | null;
  drive_file_id: string | null;
  text_content: string | null;
  self_assessment: unknown;
  is_late: boolean | null;
}

export interface IncomingSubmission {
  /** 이번에 보낸 학생 id. 학생 화면은 안 보내므로 대개 null 이다. */
  studentId: string | null;
  /** 이번에 올린 파일 이름. 없으면 파일을 안 냈다. */
  fileName: string | null;
  fileSize: number | null;
  driveFileId: string | null;
  /**
   * 이번에 보낸 글. 안 보냈으면 `null` = 그대로 두기.
   * ★빈 문자열도 "안 보냄"으로 본다 — 아래 `mergeSubmission` 이 눕힌다.
   */
  textContent: string | null;
  /** 이번에 보낸 자기평가 답변. 없으면 null. */
  selfAssessment: SelfAssessmentAnswer[] | null;
  /** 지금 시점이 마감을 넘겼는가. */
  isLate: boolean;
  /**
   * 이 과제가 **자기평가만 받는 과제**인가(`submit_type === 'selfAssessment'`).
   *
   * ★지각 재측정에 쓴다. 파일·글 과제에서는 "돌아보기 한 줄 더 썼다고 제때 낸 제출이 지각으로
   *   뒤집히면 안 된다"가 맞다. 하지만 **돌아보기가 제출의 전부인 과제**에서는 그 논리가
   *   성립하지 않는다 — 마감 전에 한 줄만 써 두고 일주일 뒤 통째로 다시 써도 영원히
   *   "제때 냄"이 된다. 코드 리뷰(M-1)가 잡은 자리다.
   */
  selfAssessmentOnly: boolean;
}

export interface MergedSubmission {
  student_id: string | null;
  file_name: string | null;
  file_size: number;
  drive_file_id: string | null;
  text_content: string | null;
  self_assessment: SelfAssessmentAnswer[] | null;
  is_late: boolean;
}

/** 저장돼 있던 답 중 모양이 온전한 것만. `prompt` 까지 봐야 아래 타입 단언이 사실이 된다. */
function readOldAnswers(existing: unknown): SelfAssessmentAnswer[] {
  if (!Array.isArray(existing)) return [];
  return existing.filter(
    (a) =>
      typeof a === 'object' &&
      a !== null &&
      typeof (a as Record<string, unknown>).questionId === 'string' &&
      typeof (a as Record<string, unknown>).answer === 'string' &&
      typeof (a as Record<string, unknown>).prompt === 'string',
  ) as SelfAssessmentAnswer[];
}

/**
 * 자기평가 답변을 **문항 단위로** 합친다.
 *
 * ★통째로 교체하지 않는 이유: 화면이 옛 답을 다시 보여 주지 않으므로(ADR-096 결정 4), 학생이
 *   한 문항만 고쳐 쓰고 내면 나머지가 사라진다. "답한 문항만 저장됩니다"라는 화면 안내와도
 *   어긋난다. 이번에 답한 문항만 덮고 나머지는 둔다.
 *
 * ★결과 순서는 **문항 순서**다 — `sanitizeAnswers` 와 같은 계약이다(교사가 늘 같은 차례로 읽는다).
 *   `questionOrder` 를 안 넘기면 "이번 답 먼저, 옛 답 뒤"가 되어 **두 번에 나눠 쓴 학생의 글이
 *   거꾸로 보인다.** 실제로 아키텍처 검토가 `q1` 뒤 `q2` 를 쓰면 `[q2, q1]` 이 나오는 것을
 *   실행으로 재현했다. 그래서 호출부가 문항 순서를 넘기게 했다.
 */
export function mergeSelfAssessment(
  existing: unknown,
  incoming: SelfAssessmentAnswer[] | null,
  /**
   * 문항 id 를 정의 순서대로.
   *
   * ★**필수다.** 선택으로 두었더니 "넘길 것"이라는 **주석 계약**만 남았는데, 이 저장소에는
   *   "주석 계약은 아무도 안 지킨다"는 사고 기록이 이미 있다. 안 넘기면 조용히 정렬이 꺼져
   *   두 번에 나눠 쓴 학생의 답이 거꾸로 저장된다 — 게이트는 전부 초록인 채로.
   *   정렬할 순서가 없는 자리라면 빈 배열을 **명시적으로** 넘긴다.
   */
  questionOrder: readonly string[],
): SelfAssessmentAnswer[] | null {
  const old = readOldAnswers(existing);
  return sortByQuestions(combine(old, incoming), questionOrder);
}

/**
 * 자르기로 **실제로 버려진 답 개수**. 0 이면 아무것도 안 버렸다.
 *
 * ★왜 여기 있는가: 호출부에서 "옛 답 수 + 새 답 수 − 저장된 수"로 세면 **틀린다.** 병합은 같은
 *   문항을 덮어쓰므로(중복 제거), 평범한 재제출에서도 그 뺄셈이 양수가 되어 **정상 경로마다
 *   거짓 경고**가 뜬다. 실제로 그렇게 짰다가 리뷰에서 잡혔다. 산수를 규칙 옆에 두면 규칙이
 *   바뀔 때 같이 바뀐다 — 게이트 밖 호출부에 두면 조용히 어긋난다.
 */
export function droppedAnswerCount(
  existing: unknown,
  incoming: SelfAssessmentAnswer[] | null,
  questionsRaw: unknown,
): number {
  const merged = combine(readOldAnswers(existing), incoming);
  // ★`sortByQuestions` 를 직접 부르지 않고 **병합 함수 자체**를 태운다. 직접 부르면
  //   `mergeSelfAssessment` 에 나중에 거르기·상한이 붙었을 때 건수만 옛 규칙을 따른다.
  const kept = mergeSelfAssessment(existing, incoming, questionIdsOf(questionsRaw));
  return merged.length - (kept?.length ?? 0);
}

/**
 * 저장된 문항 정의에서 **정렬 기준이 될 id 목록**을 뽑는다.
 *
 * `mergeSubmission` 과 `droppedAnswerCount` 가 같은 정의에서 뽑도록 한자리에 모았다.
 *
 * ⚠️ **지금은** 이 목록이 갈려도 자르기 건수는 안 틀린다 — `sortByQuestions` 가 답을
 *   `known`/`unknown` 으로 쪼갠 뒤 다시 붙이므로 길이가 언제나 `min(n, 12)` 라서다.
 *   순서가 갈리는 것은 위 「★이음매」 테스트가 잡는다. 즉 **이 함수는 지금 없는 위험을 막는 게
 *   아니라, 표현을 하나로 줄인 것**이다. 나중에 `sortByQuestions` 가 "목록에 없는 답은 버린다"로
 *   바뀌면 그때부터는 건수까지 갈리므로, 그전에 모아 둔다.
 *
 * ★앞서 이 자리에 "어긋나도 게이트가 못 잡는다"고 적었는데 **사실이 아니었다**(리뷰가 실측으로
 *   반증). 없는 위험을 있다고 적는 것도 이 저장소가 경계해 온 거짓 진술이라 그대로 남긴다.
 */
function questionIdsOf(questionsRaw: unknown): readonly string[] {
  return readQuestions(questionsRaw).map((q) => q.id);
}

/** 옛 답과 이번 답을 문항 id 기준으로 합친다(같은 문항은 이번 답이 이긴다). 자르기·정렬 없음. */
function combine(
  old: SelfAssessmentAnswer[],
  incoming: SelfAssessmentAnswer[] | null,
): SelfAssessmentAnswer[] {
  if (!incoming || incoming.length === 0) return old;
  const replaced = new Set(incoming.map((a) => a.questionId));
  return [...incoming, ...old.filter((a) => !replaced.has(a.questionId))];
}

/** 문항 정의 순서로 줄 세운다. 목록에 없는 답(교사가 문항을 지운 경우)은 뒤에 순서대로 붙인다. */
function sortByQuestions(
  answers: SelfAssessmentAnswer[],
  questionOrder?: readonly string[],
): SelfAssessmentAnswer[] | null {
  if (answers.length === 0) return null;
  // ★표의 CHECK(`submissions_self_assessment_shape`)이 12 다 — 문항 상한 6 과 **일부러 다르다**
  //   (위 `MAX_STORED_ANSWERS` 주석). 넘으면 upsert 가 통째로 실패해(500) **학생이 방금 쓴 글을
  //   잃는다.** 그래서 마지막 방어로 여기서 자른다. 아래에서 정의에 있는 문항을 앞에 세우므로
  //   떨어지는 것은 **교사가 이미 지운 문항의 옛 답**부터다 — 잃는 쪽을 고를 수 있으면 덜 아픈 쪽.
  if (!questionOrder || questionOrder.length === 0) return answers.slice(0, MAX_STORED_ANSWERS);
  const rank = new Map(questionOrder.map((id, i) => [id, i]));
  // ★목록에 없는 답도 **버리지 않는다.** 교사가 문항을 지워도 이미 받은 학생 글은 남긴다
  //   (`sanitizeAnswers` 는 모르는 id 를 버리지만, 그건 새로 들어오는 값을 거르는 자리다).
  const known = answers.filter((a) => rank.has(a.questionId));
  const unknown = answers.filter((a) => !rank.has(a.questionId));
  known.sort((a, b) => (rank.get(a.questionId) ?? 0) - (rank.get(b.questionId) ?? 0));
  return [...known, ...unknown].slice(0, MAX_STORED_ANSWERS);
}

/**
 * 제출 한 건을 기존 행과 합친다.
 *
 * - 파일·글·자기평가: 이번에 **안 보낸 것**은 옛 값을 살린다.
 * - `is_late`: 파일이나 글을 새로 냈을 때만 다시 잰다. 제때 낸 제출이 마감 뒤 돌아보기 한 줄에
 *   지각으로 뒤집히면 안 된다.
 * - `file_size` 는 `??` 로 가른다 — `||` 면 **0바이트 파일**이 옛 크기로 되살아난다.
 */
export function mergeSubmission(
  existing: ExistingSubmissionRow | null | undefined,
  incoming: IncomingSubmission,
  /**
   * 과제의 문항 정의(JSONB 원본). 답변을 문항 순서로 줄 세우는 데 쓴다.
   *
   * ★**필수다.** 선택으로 두면 안 넘겨도 조용히 정렬이 꺼져, 두 번에 나눠 쓴 학생의 글이
   *   거꾸로 저장된다 — 게이트는 전부 초록인 채로. 앱 쪽 `selfAssessmentSlots` 에 적어 둔
   *   원칙과 같다(아키텍처 3차 검토에서 이 자리가 그 원칙을 어긴 것으로 잡혔다).
   *   문항 정의가 없는 과제라면 `null` 을 명시적으로 넘긴다.
   */
  questionsRaw: unknown,
): MergedSubmission {
  // ★빈 값을 여기서 눕힌다. 이 정규화가 호출부(`index.ts`)에 있으면 **어느 게이트도 안 본다** —
  //   누가 "단순화"하며 `?? null` 로 바꾸면 빈 문자열이 통과해 옛 글을 지우고 지각까지 다시 잰다.
  //   H-1 이 그대로 되살아나는데 테스트는 전부 초록이다. 그래서 규칙과 정규화를 같은 자리에 둔다.
  const newText =
    incoming.textContent && incoming.textContent.length > 0 ? incoming.textContent : null;
  const newFileName = incoming.fileName && incoming.fileName.length > 0 ? incoming.fileName : null;
  // ★자기평가 전용 과제에서는 새 답변 자체가 "이번에 새로 낸 내용"이다(위 selfAssessmentOnly 주석).
  const hasNewContent =
    newFileName !== null ||
    newText !== null ||
    (incoming.selfAssessmentOnly &&
      incoming.selfAssessment !== null &&
      incoming.selfAssessment.length > 0);
  return {
    // ★학생 화면은 studentId 를 안 보낸다. 여기서 보호하지 않으면 앱이나 다른 경로가 채워 둔
    //   값이 **돌아보기만 내는 재제출 한 번에 null 로 지워진다.** 나머지 칸과 같은 규칙에 태운다.
    student_id:
      (incoming.studentId && incoming.studentId.length > 0 ? incoming.studentId : null) ??
      existing?.student_id ??
      null,
    file_name: newFileName ?? existing?.file_name ?? null,
    file_size: incoming.fileSize ?? existing?.file_size ?? 0,
    drive_file_id: incoming.driveFileId ?? existing?.drive_file_id ?? null,
    text_content: newText ?? existing?.text_content ?? null,
    self_assessment: mergeSelfAssessment(
      existing?.self_assessment,
      incoming.selfAssessment,
      questionIdsOf(questionsRaw),
    ),
    is_late: existing && !hasNewContent ? (existing.is_late ?? incoming.isLate) : incoming.isLate,
  };
}
