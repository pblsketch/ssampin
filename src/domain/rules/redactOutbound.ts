/**
 * 쌤핀 AI — 나가기 직전 이름 지우기 + 관문 적용 (그물 ③의 실제 배선)
 *
 * ★이 파일이 왜 생겼나 — QA 에서 잡힌 치명 결함 때문이다.
 *
 * `assertNoPii` 를 만들고 테스트까지 했는데 **실제 경로에서 부르는 곳이 0건**이었다.
 * 그리고 이름을 지우는 코드는 **아예 없었다.** 그런데 개인정보처리방침과 화면은 둘 다
 * "학생 이름은 전송 전에 지워집니다"라고 **약속하고 있었다.**
 *
 * 층을 만들고 배선을 잊은 것 — 이번 작업에서 세 번째 같은 유형이다
 * (①생년월일 오탐 ②UUID 오탐 ③여기). **만들었다고 작동하는 게 아니다.**
 *
 * ★카드를 통째로 버리지 않는다.
 * 걸린 **자유 입력 필드만 비운다**(계획서 §4.2.2). 카드를 버리면 숫자가 사라져
 * P5("모델이 죽어도 숫자는 남는다")가 깨진다. 화면에는 로컬 원본이 그대로 보이므로
 * 선생님이 잃는 것은 없다.
 */
import type { AssistToolDef, ModelSafe } from '../entities/AssistTool';
import type { KeywordGroup } from '../privacy/types';
import type { ToolResultShape, ToolResultValue } from '../services/sanitizeToolResult';
import { checkOutboundText, checkOutboundValue } from './assertNoPii';

export interface RedactionResult {
  /** 이름을 지우고 관문을 통과한 값 */
  readonly data: ModelSafe<ToolResultShape>;
  /** 몇 곳을 지웠는지. 화면의 "이름 N개 지움" 표시에 쓴다 */
  readonly redactedCount: number;
  /** ★true 면 자유 입력이 아닌 곳에서 걸렸다는 뜻 — 이 카드는 보내지 않는다 */
  readonly blocked: boolean;
}

/** 학생 명단을 관문이 쓰는 형태로 만든다. 빈 이름·한 글자는 오탐이 커서 뺀다. */
export function rosterFrom(names: readonly string[]): readonly KeywordGroup[] {
  const values = names.map((n) => n.trim()).filter((n) => n.length >= 2);
  return values.length === 0 ? [] : [{ label: '이름', values }];
}

function redactValue(
  value: ToolResultValue,
  roster: readonly KeywordGroup[],
): {
  value: ToolResultValue;
  count: number;
} {
  if (typeof value === 'string') {
    // ★자유 입력이므로 `checkOutboundText`(생년월일·주소까지 켜진 쪽)로 본다.
    // 구조화 필드용 패턴으로 보면 선생님이 제목에 적은 생일·주소를 놓친다.
    const hit = checkOutboundText(value, roster);
    // 걸리면 통째로 비운다. 일부만 지우면 남은 문맥으로 되짚을 수 있다.
    return hit.blocked ? { value: null, count: 1 } : { value, count: 0 };
  }
  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const r = redactValue(item, roster);
      count += r.count;
      return r.value;
    });
    return { value: next, count };
  }
  if (value !== null && typeof value === 'object') {
    let count = 0;
    const next: Record<string, ToolResultValue> = {};
    for (const [key, child] of Object.entries(value)) {
      const r = redactValue(child, roster);
      count += r.count;
      next[key] = r.value;
    }
    return { value: next, count };
  }
  return { value, count: 0 };
}

/**
 * 재구성을 마친 도구 결과에서 **자유 입력 필드만** 검사해 걸리면 비운다.
 *
 * 그 뒤 전체를 다시 관문에 통과시켜, 자유 입력이 아닌 곳에서 걸리면 `blocked` 로 알린다
 * (그런 일이 생기면 화이트리스트 설계가 잘못된 것이므로 보내면 안 된다).
 */
export function redactOutbound(
  tool: AssistToolDef,
  data: ModelSafe<ToolResultShape>,
  roster: readonly KeywordGroup[],
): RedactionResult {
  const freeText = new Set(tool.freeTextFields);
  let redactedCount = 0;

  const walk = (value: ToolResultValue, key: string | undefined): ToolResultValue => {
    if (key !== undefined && freeText.has(key)) {
      const r = redactValue(value, roster);
      redactedCount += r.count;
      return r.value;
    }
    if (Array.isArray(value)) return value.map((item) => walk(item, key));
    if (value !== null && typeof value === 'object') {
      const next: Record<string, ToolResultValue> = {};
      for (const [childKey, child] of Object.entries(value)) next[childKey] = walk(child, childKey);
      return next;
    }
    return value;
  };

  const cleaned = walk(data, undefined) as ModelSafe<ToolResultShape>;
  const gate = checkOutboundValue(cleaned, roster, tool);

  return { data: cleaned, redactedCount, blocked: gate.blocked };
}
