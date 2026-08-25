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
import { applyMask, type MaskSession } from '../privacy/maskEngine';
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
 * 연락처·주민번호·이메일이 **질문에** 있으면 보내지 않는다는 뜻의 한국어 안내.
 *
 * ★서버(`supabase/functions/_shared/assistRequest.ts`)가 돌려주는 문구와 **같아야 한다.**
 * 앱에서 막히든 서버에서 막히든 선생님이 보는 말이 달라질 이유가 없다.
 * (Deno 쪽은 이 파일을 import 할 수 없어 문자열을 미러한다 — 서버가 최후의 관문이므로
 *  둘 다 남는다.)
 */
export const ASSIST_PII_BLOCKED_MESSAGE =
  '연락처나 주민번호로 보이는 내용이 있어 보내지 않았습니다';

/**
 * 질문을 **보내도 되는가.** true 면 보내지 않는다.
 *
 * ★왜 가리지 않고 막는가 — 원 설계의 판단을 그대로 잇는다. 이름·학번은 가려도 뜻이
 * 남지만("［이름1］ 학부모 면담이 있다"), 연락처는 가리면 남는 뜻이 없고 하나만 새도
 * 피해가 크다. 그래서 **몰래 지우고 보내는 대신 "이 질문은 못 보낸다"고 말한다.**
 *
 * ★그리고 이 판정은 **앱 안에서** 한다. 서버(`assistRequest.ts`)도 같은 검사를 하지만
 * 거기까지 가면 연락처가 이미 쌤핀 서버를 한 번 지난 뒤다. 서버 검사는 지우지 않는다 —
 * 여기가 뚫렸을 때 마지막으로 막아야 하기 때문이다(두 겹).
 */
export function questionHasBlockingPii(question: string): boolean {
  return detectPatterns(question, BLANK_PATTERNS).length > 0;
}

/**
 * **가리기만** 하는 패턴. 오탐이 나도 한 단어 손해라 넓게 켠다.
 * (`address` 는 엔진이 저신뢰로 표시하는 항목이지만, 대가가 작으므로 켜 둔다.)
 *
 * ★`birth` 는 **끈다.** "오탐이 나도 한 단어 손해"라는 위 근거가 **날짜에는 성립하지
 * 않는다.** 생년월일 규칙은 `YYYY-MM-DD`·`YYYY년 M월 D일` 을 전부 잡는데, 선생님이
 * 보내는 글은 공문·안내문이라 날짜가 내용의 **핵심**이다. 실제로 수행평가 안내문에서
 * 제출 기한·회의 일시 다섯 곳이 통째로 ［생년월일N］ 이 되어 AI 가 무슨 글인지조차
 * 알 수 없었다(2026-08-25 오너 신고).
 *
 * ★같은 판단이 이미 저장소에 있다 — 쿨메신저 쪽지(`privacy/coolMessagePii.ts`)도
 * 같은 이유로 `birth` 를 꺼 두었고 그 근거를 적어 두었다("쪽지 본문은 날짜투성이다").
 * 그 교훈이 이 경로에만 안 와 있었다.
 *
 * ★막는 힘은 줄지 않는다: 주민번호·연락처·이메일은 `BLANK_PATTERNS` 에서 **통째로
 * 비우는** 쪽으로 그대로 살아 있고, 이름·학번은 명렬표 대조로 계속 가린다.
 * 생년월일이 정말 위험한 꼴(주민번호)은 `rrn` 이 잡는다.
 */
const MASK_PATTERNS: PatternConfig = {
  phone: false,
  rrn: false,
  email: false,
  birth: false,
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

/**
 * 담임 학급 + 교과 수업반 명단을 **한 벌로 합쳐** 관문이 쓰는 형태로 만든다.
 *
 * ★왜 따로 두는가 — 담임 학급만 넣었다가 구멍이 났기 때문이다(2026-08-25 실측).
 * `students.json` 은 담임 학급 한 반뿐이라 교과 수업반 학생 이름은 대조할 것이 없었고,
 * `"옆반 최민호 학생도 결석이야"` 가 **한 글자도 안 가려진 채** 그대로 나갔다.
 *
 * 합치는 일 자체는 사소하지만 **호출부(컴포넌트)에 두면 테스트가 안 걸린다.**
 * 여기 두면 순수 함수라 "수업반 학생이 정말 가려지는가"를 직접 잴 수 있다.
 *
 * ★중복은 여기서 걷어내지 않는다 — `detectKeywords` 가 값을 `Set` 으로 한 번 거르므로
 * 같은 학생이 두 명단에 있어도 별칭은 하나로 유지된다.
 */
export function rosterFromAll(
  homeroom: readonly { readonly name: string; readonly studentNumber?: number }[],
  teachingClasses: readonly {
    readonly students: readonly { readonly name: string; readonly number: number }[];
  }[],
): readonly KeywordGroup[] {
  return rosterFrom([
    ...homeroom,
    ...teachingClasses.flatMap((c) =>
      c.students.map((s) => ({ name: s.name, studentNumber: s.number })),
    ),
  ]);
}

interface FieldOutcome {
  readonly value: ToolResultValue;
  readonly mappings: readonly MaskMapping[];
  readonly masked: number;
  readonly blanked: number;
}

const EMPTY: Omit<FieldOutcome, 'value'> = { mappings: [], masked: 0, blanked: 0 };

/** 자유 입력 한 칸을 처리한다 — 비우거나, 가리거나, 그대로 두거나. */
function handleFreeText(
  value: ToolResultValue,
  roster: readonly KeywordGroup[],
  session?: MaskSession,
): FieldOutcome {
  if (typeof value === 'string') {
    // ① 연락처·주민번호·이메일이 있으면 이 칸은 통째로 비운다.
    if (detectPatterns(value, BLANK_PATTERNS).length > 0) {
      return { value: null, mappings: [], masked: 0, blanked: 1 };
    }
    // ② 나머지는 별칭으로 가린다. 세션을 물려 **칸이 달라도 번호가 이어지게** 한다 —
    //    안 물리면 다른 학생 둘이 똑같이 ［이름1］ 이 된다(2026-08-24 UltraQA).
    const { masked, mappings } = applyMask(
      value,
      {
        patterns: MASK_PATTERNS,
        keywordGroups: roster,
      },
      session,
    );
    return { value: masked, mappings, masked: mappings.length, blanked: 0 };
  }

  if (Array.isArray(value)) {
    const results = value.map((item) => handleFreeText(item, roster, session));
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
      const r = handleFreeText(child, roster, session);
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
  session?: MaskSession,
): RedactionResult {
  const freeText = new Set(tool.freeTextFields);
  const mappings: MaskMapping[] = [];
  let maskedCount = 0;
  let blankedCount = 0;

  const walk = (value: ToolResultValue, key: string | undefined): ToolResultValue => {
    if (key !== undefined && freeText.has(key)) {
      const r = handleFreeText(value, roster, session);
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

/**
 * ★질문 원문도 카드와 **같은 그물**을 지난다 (2026-08-24 UltraQA — P0).
 *
 * 카드만 가리고 질문은 그대로 내보내고 있었는데, 공개 개인정보처리방침·고지문·화면
 * 문구는 전부 "질문 속 이름도 가려진다"고 약속하고 있었다. 코드가 약속을 따라간다.
 *
 * 연락처·주민번호는 여기서 비우지 않는다 — 서버 관문(`assistRequest.ts`)이 그 형태를
 * 거절하므로, 지우고 보내는 것보다 "이 질문은 못 보낸다"로 돌아오는 편이 정직하다.
 * 세션을 물리면 카드에서 만든 별칭 번호와 이어진다(같은 학생 = 같은 별칭).
 */
export function redactQuestion(
  question: string,
  roster: readonly KeywordGroup[],
  session?: MaskSession,
): { readonly masked: string; readonly mappings: readonly MaskMapping[] } {
  const { masked, mappings } = applyMask(
    question,
    { patterns: MASK_PATTERNS, keywordGroups: roster },
    session,
  );
  return { masked, mappings };
}

/**
 * ★모델이 돌려준 문장에서 별칭을 실제 이름으로 되돌린다.
 *
 * `maskEngine.restore` 는 **정확히 일치**할 때만 되돌리는데, 실측해 보니 그걸로는 부족했다.
 * solar-pro3 는 `［이름1］` 을 다음처럼 **11가지 형태로 바꿔서** 돌려준다(30회 중 16회 등장):
 *
 *   〈이름1〉 · ［이름1］ · [이름1] · [이름1 · (이름1) · (이름 1) · 학번1 · 학번1␠ …
 *
 * 정확 일치만 보면 6개만 잡혀 **선생님이 `〈이름1〉` 같은 찌꺼기를 그대로 본다.**
 * 그래서 괄호 종류·유무·공백을 무시하고 `접두사 + 번호` 만으로 되돌린다.
 *
 * 나머지 14회는 모델이 별칭을 아예 언급하지 않고 문장을 풀어 썼다 —
 * 되돌릴 것이 없고 답변도 자연스러우므로 그대로 둔다.
 *
 * ★번호가 긴 것부터 처리한다. `이름1` 규칙이 `이름11` 을 먼저 먹으면 안 된다.
 */
/**
 * ★모델이 **쓰기 제안의 인자로** 돌려준 별칭을 실제 값으로 되돌린다.
 *
 * 나가는 쪽은 촘촘한데 돌아오는 쪽은 `answer.text` 한 군데만 이어져 있었다.
 * 그래서 모델이 `match: "［이름1］ 상담"` 이라고 **정확히 옳은 답**을 보내도 앱은
 * 이름이 `［이름1］` 인 할 일을 찾다가 없다고 답했다(2026-08-25 재현 확인, 5개 중 3개 실패).
 *
 * ★문자열 값만 손대고 **구조는 건드리지 않는다.** 통짜 문자열에 정규식을 돌리면
 * 이름에 따옴표·역슬래시가 있을 때 JSON 이 깨진다 — 파싱해서 값만 바꾸고 다시 만든다.
 *
 * ★깨진 인자는 **그대로 돌려준다.** 여기서 삼키면 `buildWriteProposal` 의
 * "무엇을 저장할지 못 알아들었다" 거절이 안 돌아 조용히 이상한 것이 저장될 수 있다.
 */
/**
 * 인자 한 칸에서 별칭을 되돌린다 — **괄호까지 함께 걷어낸다.**
 *
 * ★`restoreModelText`(문장용)와 **일부러 다르다.** 저쪽은 모델이 쓴 괄호를 그대로 둔다 —
 * 문장에서는 `〈김지훈〉 학생은…` 이 자연스럽고, 괄호를 구분자로 쓴 건지 삽입구로 쓴 건지
 * 알 수 없어 건드리지 않는 편이 안전하기 때문이다.
 *
 * 그런데 **인자에서는 그 판단이 반대**다. `match` 는 읽을 문장이 아니라 **대상을 찾는 열쇠**라,
 * `〈김지훈〉 상담` 으로 남으면 `김지훈 상담` 을 못 찾는다(재현 테스트에서 실제로 그랬다).
 * 여기서는 괄호가 장식이라는 것이 확실하므로 걷어낸다.
 *
 * ★아무 괄호나 지우지 않는다 — **아는 별칭(접두사+번호)을 감싼 것만** 지운다.
 *   번호가 긴 것부터 처리한다(`이름1` 규칙이 `이름11` 을 먼저 먹으면 안 된다).
 */
function restoreAlias(text: string, mappings: readonly MaskMapping[]): string {
  const parsed = mappings
    .map((m) => {
      const hit = /^［(.+?)(\d+)］$/.exec(m.alias);
      return hit ? { prefix: hit[1]!, num: hit[2]!, original: m.original } : null;
    })
    .filter((v): v is { prefix: string; num: string; original: string } => v !== null)
    .sort((a, b) => b.num.length - a.num.length || Number(b.num) - Number(a.num));

  let out = text;
  for (const { prefix, num, original } of parsed) {
    const open = String.raw`[［\[(〈{]?`;
    const close = String.raw`[］\])〉}]?`;
    const core = prefix + String.raw`\s*` + num + String.raw`(?![0-9])`;
    out = out.replace(new RegExp(open + core + close, 'g'), original);
  }
  return out;
}

export function restoreModelArguments(
  rawArguments: string,
  mappings: readonly MaskMapping[],
): string {
  if (mappings.length === 0 || rawArguments.length === 0) return rawArguments;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    return rawArguments; // 기존 거절 경로가 처리한다
  }

  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return restoreAlias(value, mappings);
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };

  return JSON.stringify(walk(parsed));
}

export function restoreModelText(text: string, mappings: readonly MaskMapping[]): string {
  const parsed = mappings
    .map((m) => {
      const parsed = /^［(.+?)(\d+)］$/.exec(m.alias);
      return parsed ? { prefix: parsed[1], num: parsed[2], original: m.original } : null;
    })
    .filter((v): v is { prefix: string; num: string; original: string } => v !== null)
    .sort((a, b) => b.num.length - a.num.length || Number(b.num) - Number(a.num));

  let out = text;
  for (const { prefix, num, original } of parsed) {
    // ★규칙은 둘뿐이다 — **우리 괄호만 떼고, 모델이 쓴 괄호는 그대로 둔다.**
    //
    //   ① `［이름1］` 은 우리가 붙인 별칭 표기이므로 괄호째 바꾼다 → `김지훈`
    //   ② 그 밖의 `〈이름1〉` `(이름1)` `[이름1]` `이름1` 은 **속만** 바꾼다 → `〈김지훈〉` `(김지훈)`
    //
    //   ②에서 괄호까지 떼려다 두 번 실패했다:
    //   - 뒤 공백을 같이 먹어 `학번1 상담` → `15번상담`
    //   - 괄호를 떼니 `면담(이름1)이` → `면담김지훈이` 로 한글이 붙어 버림
    //   모델이 괄호를 **구분자로 쓴 건지 삽입구로 쓴 건지 알 수 없으므로** 건드리지 않는 쪽이 안전하다.
    //
    // ★`String.raw` 를 쓴다. 일반 템플릿 문자열은 `\s` 를 `s` 로 먹어 버려서
    //   조용히 "공백" 이 아니라 "문자 s" 를 찾는 정규식이 된다(실제로 한 번 그렇게 깨졌다).
    const core = prefix + String.raw`\s*` + num + String.raw`(?![0-9])`;
    out = out
      .replace(new RegExp('［' + core + '］', 'g'), original)
      .replace(new RegExp(core, 'g'), original);
  }
  return out;
}
