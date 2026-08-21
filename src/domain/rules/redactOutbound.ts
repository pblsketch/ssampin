/**
 * 쌤핀 AI — 나가기 직전 이름 가리기 + 관문 적용 (그물 ③의 실제 배선)
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
 * ─────────────────────────────────────────────────────────────────────────
 * ★지우지 않고 **가린다** (2026-08-21 오너 결정 — 절충안)
 *
 * 처음에는 걸린 칸을 통째로 비웠는데, 그러면 **오탐의 대가가 너무 크다.**
 * 제목 하나가 통째로 날아가니 학번처럼 애매한 것은 아예 검사 대상에 넣지도 못했고,
 * 그래서 `"15번 상담"` 이 그대로 나가고 있었다.
 *
 * 쿨메신저용으로 이미 만들어 둔 마스킹 엔진(`domain/privacy/maskEngine`)을 쓰면
 * `"김지훈 학부모 면담"` → `"［이름1］ 학부모 면담"` 이 된다. 한 단어만 손해라
 * **학번도 넣을 수 있고**, AI 는 "학부모 면담이 있다"까지는 말할 수 있다.
 *
 * ★단, 연락처·주민번호·이메일이 걸리면 **그 칸은 통째로 비운다.**
 * 한 칸에 여러 개가 있을 때(`"김지훈 (010-…) 면담"`) 못 잡은 것이 같이 남을 수 있는데,
 * 이 셋은 하나만 새도 피해가 크다. 이름·학번·생년월일·주소는 가리는 쪽으로 간다.
 *
 * ★복원(`restore`)은 **화면에 띄우기 직전**에 스토어가 한다.
 * 이름은 이 컴퓨터 밖으로 한 번도 안 나가지만 선생님 화면에는 실제 이름이 보인다 —
 * "이름은 화면에 남고, 숫자만 밖으로 나간다"가 말 그대로 성립한다.
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { AssistToolDef, ModelSafe } from '../entities/AssistTool';
import { applyMask } from '../privacy/maskEngine';
import { detectPatterns } from '../privacy/maskRules';
import type { KeywordGroup, MaskMapping, PatternConfig } from '../privacy/types';
import type { ToolResultShape, ToolResultValue } from '../services/sanitizeToolResult';
import { checkOutboundValue } from './assertNoPii';

/**
 * 걸리면 **칸을 통째로 비우는** 패턴.
 * 하나만 새도 피해가 커서, 같은 칸의 못 잡은 값까지 함께 없애는 쪽을 택한다.
 */
const BLANK_PATTERNS: PatternConfig = {
  phone: true,
  rrn: true,
  email: true,
  birth: false,
  address: false,
};

/**
 * **가리기만** 하는 패턴. 오탐이 나도 한 단어 손해라 넓게 켠다.
 * (`address` 는 엔진이 저신뢰로 표시하는 항목이지만, 대가가 작으므로 켜 둔다.)
 */
const MASK_PATTERNS: PatternConfig = {
  phone: false,
  rrn: false,
  email: false,
  birth: true,
  address: true,
};

export interface RedactionResult {
  /** 이름을 가리고 관문을 통과한 값 */
  readonly data: ModelSafe<ToolResultShape>;
  /** 별칭 → 원문. **개인정보다. 절대 전송하지 않고 복원에만 쓴다.** */
  readonly mappings: readonly MaskMapping[];
  /** 별칭으로 가린 곳 수 */
  readonly maskedCount: number;
  /** 통째로 비운 칸 수 (연락처·주민번호·이메일이 있던 칸) */
  readonly blankedCount: number;
  /** ★true 면 자유 입력이 아닌 곳에서 걸렸다는 뜻 — 이 카드는 보내지 않는다 */
  readonly blocked: boolean;
}

/** 학생 명단·학번을 관문이 쓰는 형태로 만든다. 한 글자짜리는 오탐이 커서 뺀다. */
export function rosterFrom(
  students: readonly { readonly name: string; readonly studentNumber?: number }[],
): readonly KeywordGroup[] {
  const groups: KeywordGroup[] = [];

  const names = students.map((s) => s.name.trim()).filter((n) => n.length >= 2);
  if (names.length > 0) groups.push({ label: '이름', values: names });

  // ★학번은 "15번" 형태로 넣는다. 숫자만 넣으면 정원·건수 같은 평범한 숫자까지 잡힌다.
  //   `"3번 항목"` 같은 오탐은 남지만, 이제 한 단어만 가려지므로 감당할 만하다.
  const numbers = students
    .map((s) => s.studentNumber)
    .filter((n): n is number => typeof n === 'number' && n > 0)
    .map((n) => `${n}번`);
  if (numbers.length > 0) groups.push({ label: '학번', values: [...new Set(numbers)] });

  return groups;
}

interface FieldOutcome {
  readonly value: ToolResultValue;
  readonly mappings: readonly MaskMapping[];
  readonly masked: number;
  readonly blanked: number;
}

const EMPTY: Omit<FieldOutcome, 'value'> = { mappings: [], masked: 0, blanked: 0 };

/** 자유 입력 한 칸을 처리한다 — 비우거나, 가리거나, 그대로 두거나. */
function handleFreeText(value: ToolResultValue, roster: readonly KeywordGroup[]): FieldOutcome {
  if (typeof value === 'string') {
    // ① 연락처·주민번호·이메일이 있으면 이 칸은 통째로 비운다.
    if (detectPatterns(value, BLANK_PATTERNS).length > 0) {
      return { value: null, mappings: [], masked: 0, blanked: 1 };
    }
    // ② 나머지는 별칭으로 가린다.
    const { masked, mappings } = applyMask(value, {
      patterns: MASK_PATTERNS,
      keywordGroups: roster,
    });
    return { value: masked, mappings, masked: mappings.length, blanked: 0 };
  }

  if (Array.isArray(value)) {
    const results = value.map((item) => handleFreeText(item, roster));
    return {
      value: results.map((r) => r.value),
      mappings: results.flatMap((r) => r.mappings),
      masked: results.reduce((n, r) => n + r.masked, 0),
      blanked: results.reduce((n, r) => n + r.blanked, 0),
    };
  }

  if (value !== null && typeof value === 'object') {
    const next: Record<string, ToolResultValue> = {};
    const mappings: MaskMapping[] = [];
    let masked = 0;
    let blanked = 0;
    for (const [key, child] of Object.entries(value)) {
      const r = handleFreeText(child, roster);
      next[key] = r.value;
      mappings.push(...r.mappings);
      masked += r.masked;
      blanked += r.blanked;
    }
    return { value: next, mappings, masked, blanked };
  }

  return { value, ...EMPTY };
}

/**
 * 재구성을 마친 도구 결과에서 **자유 입력 필드만** 가리거나 비운다.
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
  const mappings: MaskMapping[] = [];
  let maskedCount = 0;
  let blankedCount = 0;

  const walk = (value: ToolResultValue, key: string | undefined): ToolResultValue => {
    if (key !== undefined && freeText.has(key)) {
      const r = handleFreeText(value, roster);
      mappings.push(...r.mappings);
      maskedCount += r.masked;
      blankedCount += r.blanked;
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

  // ★가린 뒤에 다시 본다. 별칭(［이름1］)은 이름이 아니므로 여기서 안 걸려야 정상이다.
  const gate = checkOutboundValue(cleaned, roster, tool);

  return {
    data: cleaned,
    // 같은 원문이 여러 카드에 나오면 중복 매핑이 생긴다 — 복원은 멱등이라 문제없다.
    mappings,
    maskedCount,
    blankedCount,
    blocked: gate.blocked,
  };
}
