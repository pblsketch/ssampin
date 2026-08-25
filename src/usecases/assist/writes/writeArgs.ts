/**
 * 쌤핀 AI 쓰기 — 모델이 준 인자를 읽는 자리 (순수 함수)
 *
 * ★모델 인자는 **끝까지 불신한다.** 읽기 도구에서는 이상한 인자가 오면 기본값으로 넘어가
 * 조회 범위가 조금 어긋날 뿐이지만, 쓰기에서는 그대로 저장된다. 그래서 여기서 형식을
 * 확정하지 못한 값은 **없는 것으로 취급하고**, 없으면 안 되는 값이면 제안 자체를 만들지
 * 않는다(거절 사유를 한국어로 돌려준다).
 *
 * 여기를 통과한 값만 `AssistWriteValues` 에 실린다.
 */
import type { AssistWriteRejection } from '@domain/entities/AssistWrite';
import { particle } from '@domain/rules/koreanParticle';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** 모델이 준 인자 뭉치. JSON 파싱까지는 호출자가 끝내 놓는다. */
export type RawArgs = Readonly<Record<string, unknown>>;

/** 사람이 읽는 문자열 하나. 공백만 있으면 없는 것으로 본다. */
export function text(args: RawArgs, key: string): string | undefined {
  const value = args[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** YYYY-MM-DD 만 받는다. "내일"·"8/24" 같은 것은 모델이 이미 날짜로 바꿔서 보내야 한다. */
export function date(args: RawArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && DATE_RE.test(value) ? value : undefined;
}

/** HH:mm 만 받는다. */
export function time(args: RawArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && TIME_RE.test(value) ? value : undefined;
}

/**
 * 정수. 모델이 숫자를 문자열로 보내는 일이 잦아 `"3"` 도 받는다.
 * 범위를 벗어나면 없는 것으로 본다 — 0교시나 99교시가 저장되는 것보다 낫다.
 */
export function int(args: RawArgs, key: string, min: number, max: number): number | undefined {
  const value = args[key];
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return undefined;
  return parsed;
}

/** 불리언. 모델이 문자열 "true" 를 보내는 일이 잦다. */
export function bool(args: RawArgs, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** 정해진 목록 중 하나. 목록에 없으면 없는 것으로 본다. */
export function choice<T extends string>(
  args: RawArgs,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = args[key];
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** 빠뜨리면 안 되는 값이 없을 때의 거절. 사유는 그대로 화면에 뜬다. */
export function missing(what: string): AssistWriteRejection {
  return {
    reason: `${what}${particle(what, '을', '를')} 알 수 없어서 만들지 않았어요. 다시 알려주시겠어요?`,
  };
}

/** 공백을 지운 비교용 문자열. "3학년 2반" 과 "3학년2반" 을 같게 본다. */
export function squash(value: string): string {
  return value.replace(/\s+/g, '');
}

/**
 * 이름으로 딱 한 건을 찾는다.
 *
 * ★모델은 **내부 식별자를 모른다**(보여준 적이 없다). 그래서 "장보기 할 일 지워줘"처럼
 * 사람이 쓰는 말로 가리키고, 그 말을 실제 항목에 잇는 것은 앱의 몫이다.
 *
 * ★후보가 둘 이상이면 **고르지 않는다.** 지우기에서 아무거나 고르면 선생님은 무엇을
 * 잃었는지도 모른 채 잃는다. 읽기(`namedClass`)에서는 전체를 보여주는 폴백이 있었지만
 * 쓰기에는 그런 폴백이 없다 — 되묻는 것이 유일하게 안전한 길이다.
 */
export function matchOne<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
  /** 사유 문장에 쓸 이름. 예: '할 일' */
  what: string,
): { ok: true; item: T } | ({ ok: false } & AssistWriteRejection) {
  const wanted = squash(query);
  if (wanted.length === 0) {
    return { ok: false, reason: `어떤 ${what}인지 알 수 없어서 아무것도 하지 않았어요.` };
  }

  const exact = items.filter((item) => squash(textOf(item)) === wanted);
  const pool =
    exact.length > 0
      ? exact
      : items.filter((item) => {
          const candidate = squash(textOf(item));
          return candidate.length > 0 && (candidate.includes(wanted) || wanted.includes(candidate));
        });

  if (pool.length === 0) {
    return {
      ok: false,
      reason: `"${query}"에 맞는 ${what}${particle(what, '을', '를')} 찾지 못했어요.`,
    };
  }
  if (pool.length > 1) {
    const names = pool
      .slice(0, 3)
      .map((item) => `"${textOf(item)}"`)
      .join(', ');
    const more = pool.length > 3 ? ` 외 ${pool.length - 3}건` : '';
    return {
      ok: false,
      reason: `"${query}"에 맞는 ${what}${particle(what, '이', '가')} 여러 개예요(${names}${more}). 어떤 것인지 더 정확히 알려주세요.`,
    };
  }
  return { ok: true, item: pool[0]! };
}
