/**
 * 학생 자기평가서 — 활동이 끝난 뒤 학생이 스스로 적는 성찰. 생기부 근거의 세 번째 갈래다.
 *
 * 근거 3종은 교사 관찰 / 학생 과제물과 교사 평가 / **학생 자기평가서**인데, 셋 중 이것만 없었다.
 * 교사가 못 보는 것 — 학생이 무엇을 궁금해했고 어디서 막혔는지 — 은 학생만 안다.
 *
 * 수집은 **과제 수합 위에서** 한다(ADR-096 결정 1). 과제에 얹거나(`Assignment.selfAssessment`)
 * 단독으로 열고(`submitType: 'selfAssessment'`), 학생은 지금 쓰는 제출 링크로 들어와 답한다.
 * 제출분은 근거 정리 보드에 **거울 카드**로만 뜨고 교사가 손댄 것만 창고에 저장된다(결정 2) —
 * 학생 글이 곧바로 AI 재료가 되면 학생 표현이 세특에 그대로 흘러들기 때문이다.
 *
 * ★문항에 붙는 슬롯은 `observationSlots` 의 값을 **그대로** 쓴다. 새 문자열 축을 만들면
 *   교사가 본 질문 / 학생이 쓴 질문 / 과제에 드러난 질문이 서로 다른 갈래가 되어, "한자리에
 *   모인다"는 이 기능의 목적이 깨진다.
 *
 * 이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { SlotContext } from '@domain/rules/observationSlots';
import { normalizeSlots } from '@domain/rules/observationSlots';

/** 한 과제에 붙일 수 있는 문항 수 상한. 더 물으면 학생이 성의 없이 답한다. */
export const SELF_ASSESSMENT_MAX_QUESTIONS = 6;

/** 답변 한 건의 길이 상한(글자 수). ★서버(엣지 함수)도 **같은 규칙**으로 검사해야 한다. */
export const SELF_ASSESSMENT_MAX_ANSWER_LENGTH = 1000;

/** 문항 한 줄의 길이 상한. */
export const SELF_ASSESSMENT_MAX_PROMPT_LENGTH = 200;

/**
 * 글자 수 세기 — 코드 포인트 기준.
 *
 * ★`String.length` 를 쓰지 않는 이유: 이모지 하나가 2로 세어져 한도가 사람이 보는 것과
 * 달라진다. 앱·서버·학생 화면 셋이 **같은 함수**로 세야 "1,000자까지"가 세 곳에서 같은 뜻이 된다.
 */
export function selfAssessmentTextLength(text: string): number {
  return Array.from(text).length;
}

/**
 * 글자 수만큼 자른다 — 코드 포인트 기준. 서버 `_shared/selfAssessment.ts` 의 `clip` 과 같은 규칙.
 *
 * ★`String.slice` 를 쓰면 자르는 자리가 이모지 한복판일 때 **반쪽 글자**가 남고, 그 값이
 * Postgres `jsonb` 로 갈 때 저장이 통째로 실패한다(unsupported Unicode escape sequence).
 */
export function clipText(text: string, limit: number): string {
  return Array.from(text).slice(0, limit).join('');
}

/** 교사가 만든 문항 하나. */
export interface SelfAssessmentQuestion {
  /** 과제 안에서 고유한 문항 id. 답변이 이 값으로 문항을 가리킨다. */
  readonly id: string;
  /** 학생에게 보이는 물음. */
  readonly prompt: string;
  /**
   * 이 문항의 답이 들어갈 관찰 슬롯(`observationSlots` 값). 선택이다.
   *
   * 추천 문항은 슬롯을 달고 오고, 교사가 직접 쓴 문항은 골라도 되고 안 골라도 된다.
   * **교사는 자유롭고 AI 는 갈래를 안다** — 이게 이 설계의 장치다.
   */
  readonly slot?: string;
  /** 이 문항만의 길이 상한. 없으면 `SELF_ASSESSMENT_MAX_ANSWER_LENGTH`. */
  readonly maxLength?: number;
}

/** 학생이 낸 답 하나. */
export interface SelfAssessmentAnswer {
  readonly questionId: string;
  /**
   * ★답변 시점의 **문항 원문을 함께 저장한다.**
   *
   * 교사가 나중에 문항을 고치거나 지우면, id 만 남은 답변은 "무엇에 답한 것인지" 알 수 없게 된다.
   * 근거 창고에 들어간 뒤에는 더 심각하다 — 세특의 출처가 되는 문장이 맥락을 잃는다.
   * 그래서 문항을 복사해 둔다(저장 비용보다 유실 비용이 크다).
   */
  readonly prompt: string;
  /** 답변 시점에 문항에 달려 있던 슬롯. 문항 쪽 슬롯이 바뀌어도 이 답의 갈래는 안 바뀐다. */
  readonly slot?: string;
  readonly answer: string;
}

/** 답변 배열 전체가 비었는가(전부 공백이거나 배열이 없음). */
export function isSelfAssessmentEmpty(answers?: readonly SelfAssessmentAnswer[]): boolean {
  if (!answers || answers.length === 0) return true;
  return answers.every((a) => a.answer.trim().length === 0);
}

/** 이 문항의 실제 길이 상한. */
export function answerLimitOf(q: SelfAssessmentQuestion): number {
  const raw = q.maxLength;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return SELF_ASSESSMENT_MAX_ANSWER_LENGTH;
  }
  return Math.min(Math.floor(raw), SELF_ASSESSMENT_MAX_ANSWER_LENGTH);
}

/**
 * 교사가 편집한 문항 목록을 저장 직전에 다듬는다.
 *
 * - 물음이 빈 문항은 버린다(교사가 칸만 늘려 두고 안 채운 경우).
 * - id 가 겹치면 뒤엣것을 버린다 — 답변이 어느 문항 것인지 갈리면 안 된다.
 * - 슬롯이 목록에 없는 값이면 **문항을 버리지 않고 슬롯만 떼어 낸다.** 물음 자체는 교사가 쓴
 *   것이고 슬롯은 부가 정보다. 슬롯 하나 때문에 문항을 지우면 교사의 글이 사라진다.
 * - 상한을 넘는 문항은 잘라 낸다.
 */
export function normalizeSelfAssessmentQuestions(
  questions: readonly SelfAssessmentQuestion[],
  context: SlotContext,
  customSlots: readonly string[] = [],
): SelfAssessmentQuestion[] {
  const seen = new Set<string>();
  const out: SelfAssessmentQuestion[] = [];
  for (const q of questions) {
    if (out.length >= SELF_ASSESSMENT_MAX_QUESTIONS) break;
    const id = q.id.trim();
    const prompt = q.prompt.trim();
    if (id.length === 0 || prompt.length === 0 || seen.has(id)) continue;
    seen.add(id);
    const slot = q.slot === undefined ? [] : normalizeSlots([q.slot], context, customSlots);
    const limit = answerLimitOf(q);
    out.push({
      id,
      prompt: clipText(prompt, SELF_ASSESSMENT_MAX_PROMPT_LENGTH),
      ...(slot.length > 0 ? { slot: slot[0] } : {}),
      ...(limit !== SELF_ASSESSMENT_MAX_ANSWER_LENGTH ? { maxLength: limit } : {}),
    });
  }
  return out;
}

/**
 * 학생이 낸 답을 저장 직전에 다듬는다. 서버가 받은 값을 믿지 않고 문항과 대조한다.
 *
 * - **문항에 없는 `questionId` 는 버린다.** 학생 화면을 고쳐 아무 id 나 보낼 수 있다.
 * - 빈 답(공백만)은 버린다 — 안 쓴 문항이 "빈 근거"로 창고에 뜨면 안 된다.
 * - 길이는 문항별 상한으로 자른다.
 * - 문항 원문과 슬롯은 **지금 문항 정의에서** 복사해 붙인다(학생이 보낸 값은 안 믿는다).
 * - 결과 순서는 학생이 보낸 순서가 아니라 **문항 순서**다. 교사가 늘 같은 차례로 읽는다.
 */
export function normalizeSelfAssessmentAnswers(
  answers: readonly SelfAssessmentAnswer[],
  questions: readonly SelfAssessmentQuestion[],
): SelfAssessmentAnswer[] {
  // 문항 id 가 겹치면 어느 문항의 답인지 갈린다. 조용히 하나를 고르지 않고 먼저 멈춘다.
  //
  // ★서버(`_shared/selfAssessment.ts`)는 같은 상황에서 **던지지 않고 첫 값만 쓴다.** 일부러
  //   다르다 — 서버는 학생 제출을 처리하는 자리라 500 으로 죽이면 학생이 글을 잃는다. 여기는
  //   교사가 만든 문항을 다루는 자리라, 잘못된 정의를 조용히 통과시키면 답이 엉뚱한 문항에
  //   붙는다. 대조 테스트는 상수와 자르기 모양만 보므로 이 차이는 안 걸린다(의도된 차이).
  const ids = new Set(questions.map((q) => q.id));
  if (ids.size !== questions.length) {
    throw new Error(
      '자기평가 문항 id 가 겹칩니다. normalizeSelfAssessmentQuestions 를 먼저 거치세요.',
    );
  }
  const out: SelfAssessmentAnswer[] = [];
  for (const q of questions) {
    // 같은 문항에 답이 두 개 오면 첫 것만 쓴다 — `find` 가 그 일을 한다.
    // (예전엔 여기 `used` Set 을 두었는데, 위에서 문항 id 중복을 이미 던져 막으므로 그 조건은
    //  항상 참이었다. "중복을 막고 있다"는 착시만 주는 코드라 걷어냈다.)
    const found = answers.find((a) => a.questionId === q.id);
    if (!found) continue;
    const text = found.answer.trim();
    if (text.length === 0) continue;
    const clipped = clipText(text, answerLimitOf(q));
    out.push({
      questionId: q.id,
      prompt: q.prompt,
      ...(q.slot !== undefined ? { slot: q.slot } : {}),
      answer: clipped,
    });
  }
  return out;
}

/**
 * 답한 문항들의 슬롯 합집합 — 근거 창고로 옮길 때 `RecordEvidence.slots` 가 될 값.
 *
 * 첫 등장 순서를 보존한다. 슬롯이 하나도 없으면 빈 배열이고, **호출자는 빈 배열이면 필드를
 * 아예 만들지 않는다**(부재 != 빈 배열 — 동기화에서 구 데이터를 덮지 않기 위해).
 */
export function selfAssessmentSlots(
  answers: readonly SelfAssessmentAnswer[],
  /**
   * 맥락. **필수다** — 이 맥락의 갈래만 남긴다.
   *
   * ★서버는 갈래를 검증하지 못한다 — 허용 목록이 맥락과 교사 커스텀 슬롯에 달려 있는데 서버는
   *   그걸 모른다. 그래서 진짜 방어선은 **앱이 읽는 이 자리**다. 목록에 없는 갈래가 창고로
   *   들어가면 갈래로 거르는 화면에서 어느 칩에도 안 걸려 **사라진 것처럼 보인다**
   *   (저장소가 이미 겪은 "끌 수 없는 필터는 데이터 소실처럼 보인다"와 같은 사고).
   *
   * ★선택 인자로 두지 않는 이유: 그러면 나중에 근거 보드를 붙이는 사람이 안 넘겨도 **조용히
   *   검증이 꺼진 채** 통과한다. 필수로 두면 안 넘기는 순간 타입 검사가 잡는다.
   */
  context: SlotContext,
  customSlots: readonly string[] = [],
): string[] {
  const raw: string[] = [];
  const seen = new Set<string>();
  for (const a of answers) {
    const s = a.slot;
    if (s === undefined || seen.has(s)) continue;
    seen.add(s);
    raw.push(s);
  }
  return normalizeSlots(raw, context, customSlots);
}

/** 서버(JSONB)에서 온 값이 문항 모양인지. 모르는 값은 조용히 버리려고 쓴다. */
function isSelfAssessmentQuestion(v: unknown): v is SelfAssessmentQuestion {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.prompt !== 'string') return false;
  if (o.slot !== undefined && typeof o.slot !== 'string') return false;
  if (o.maxLength !== undefined && typeof o.maxLength !== 'number') return false;
  return true;
}

/** 서버(JSONB)에서 온 값이 답변 모양인지. */
function isSelfAssessmentAnswer(v: unknown): v is SelfAssessmentAnswer {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.questionId !== 'string' || typeof o.answer !== 'string') return false;
  if (typeof o.prompt !== 'string') return false;
  if (o.slot !== undefined && typeof o.slot !== 'string') return false;
  return true;
}

/** 알 수 없는 값(서버 JSONB·구버전) → 문항 배열. 모양이 아니면 빈 배열. */
export function parseSelfAssessmentQuestions(v: unknown): SelfAssessmentQuestion[] {
  if (!Array.isArray(v)) return [];
  // 서버 `readQuestions` 와 같이 6개로 자른다 — 방어를 한 겹에만 두지 않는다.
  return v.filter(isSelfAssessmentQuestion).slice(0, SELF_ASSESSMENT_MAX_QUESTIONS);
}

/** 알 수 없는 값(서버 JSONB·구버전) → 답변 배열. 모양이 아니면 빈 배열. */
export function parseSelfAssessmentAnswers(v: unknown): SelfAssessmentAnswer[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isSelfAssessmentAnswer);
}
