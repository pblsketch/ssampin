/**
 * 쌤핀 AI — 도구 결과 화이트리스트 **재구성** (egress 4중 그물 ②)
 *
 * 순수 TypeScript — 외부 의존성 import 금지(entities 타입 제외).
 *
 * ★핵심 원리: 위험한 필드를 **빼지 않는다. 안전한 필드만으로 새로 만든다.**
 *
 * 기존 객체에서 `delete` 하거나 구조분해 rest(`const { studentName, ...rest } = obj`)로
 * 걸러내는 방식은, 나중에 원본 엔티티에 필드가 하나 추가되면 **조용히 새어 나간다.**
 * 그 사고는 예고 없이 오고, 테스트도 통과한 채로 온다(사전 부검 시나리오 2).
 *
 * ★**중첩까지 재구성한다.** 최상위만 걸러내면 `{ items: store.todos }` 를 넘길 때
 * `subTasks`·`googleTaskId` 가 통째로 나간다. 계획서 §4.2 의 화이트리스트가
 * `{ items: [{ title, due, done }] }` 처럼 중첩 단위로 적혀 있으므로 코드도 그 깊이를 지킨다.
 *
 * 설계 근거: docs/01-plan/features/in-app-chatbot-zen.plan.md §4.4 그물 ②
 */
import type { AssistToolDef, ModelSafe } from '../entities/AssistTool';

/** 도구 결과로 다룰 수 있는 값의 모양 */
export type ToolResultValue =
  | string
  | number
  | boolean
  | null
  | ToolResultShape
  | ToolResultValue[];

export interface ToolResultShape {
  readonly [key: string]: ToolResultValue;
}

function isPlainObject(value: ToolResultValue): value is ToolResultShape {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 허용 필드만 복사해 새 객체를 만든다(한 단계). */
function pick(source: ToolResultShape, allowed: readonly string[]): ToolResultShape {
  const out: Record<string, ToolResultValue> = {};
  for (const field of allowed) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
    const value = source[field];
    if (value === undefined) continue;
    out[field] = value;
  }
  return out;
}

/** 중첩 값(객체 또는 객체 배열)을 허용 필드로 재구성한다. */
function rebuildNested(value: ToolResultValue, allowed: readonly string[]): ToolResultValue {
  if (Array.isArray(value)) {
    return value.map((item) => (isPlainObject(item) ? pick(item, allowed) : item));
  }
  if (isPlainObject(value)) return pick(value, allowed);
  return value;
}

/**
 * 허용 필드만으로 새 객체를 만든다.
 *
 * - 허용 목록에 있으나 원본에 없는 키는 **그냥 빠진다**(오류가 아니다).
 *   실패시키면 숫자 카드가 통째로 사라져 P5(모델이 죽어도 숫자는 남는다)가 깨진다.
 * - 허용 목록에 없는 키는 **결과에 존재하지 않는다.** `undefined` 로도 남기지 않는다.
 * - `nestedFields` 가 선언된 키는 **한 단계 더 들어가 재구성한다.**
 */
export function sanitizeToolResult(
  tool: AssistToolDef,
  raw: ToolResultShape,
): ModelSafe<ToolResultShape> {
  const top = pick(raw, tool.resultFields);
  const nested = tool.nestedFields;
  if (!nested) return top as ModelSafe<ToolResultShape>;

  const rebuilt: Record<string, ToolResultValue> = { ...top };
  for (const [key, allowed] of Object.entries(nested)) {
    if (!Object.prototype.hasOwnProperty.call(rebuilt, key)) continue;
    const value = rebuilt[key];
    if (value === undefined) continue;
    rebuilt[key] = rebuildNested(value, allowed);
  }
  return rebuilt as ModelSafe<ToolResultShape>;
}

/**
 * 재구성 결과에 허용 목록 밖 키가 하나도 없는지 확인한다(중첩 포함).
 *
 * `sanitizeToolResult` 가 이미 보장하지만, **계약 테스트가 읽을 수 있는 형태로** 따로 둔다.
 * 그물은 "있다"가 아니라 "잡는다"를 증명해야 하기 때문이다.
 *
 * 반환값은 `키` 또는 `부모.자식` 경로 문자열이다.
 */
export function findDisallowedFields(
  tool: AssistToolDef,
  value: ToolResultShape,
): readonly string[] {
  const allowedTop = new Set(tool.resultFields);
  const bad = Object.keys(value).filter((key) => !allowedTop.has(key));

  const nested = tool.nestedFields;
  if (!nested) return bad;

  for (const [key, allowed] of Object.entries(nested)) {
    const child = value[key];
    if (child === undefined) continue;
    const allowedSet = new Set(allowed);
    const items = Array.isArray(child) ? child : [child];
    for (const item of items) {
      if (!isPlainObject(item)) continue;
      for (const childKey of Object.keys(item)) {
        if (!allowedSet.has(childKey)) bad.push(`${key}.${childKey}`);
      }
    }
  }
  return bad;
}
