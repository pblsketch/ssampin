/**
 * 작성 방식 조합 — 고른 설정을 **실제로 나갈 구성**으로 풀고, 검사하고, 문장으로 만든다(순수).
 *
 * ★핵심 계약: 기본값(기존형 + 교사 판단 먼저 + 이어진 과정)이면 「작성 구성」 블록을 **아예 붙이지
 *   않는다**(`shouldEmitComposition` = false). 고르지 않은 선생님의 요청서는 오늘과 글자 하나까지 같다.
 *
 * ★검사는 **앱이 실제로 판정할 수 있는 것만** 한다. "근거에 질문이 있는가" 같은 의미 판정은 못 하므로
 *   근거 건수·날짜 구별·영역 같은 셀 수 있는 것만 본다. 못 하는 판정을 하는 척하지 않는다.
 *
 * ★검사는 **막지 않고 알린다.** 유일한 예외가 규정 판본 문지기인데, 그것도 되돌렸다고 화면에 적는다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  DEFAULT_RECORD_WRITING_STYLE,
  RECORD_STYLE_MIN_PROMPT_VERSION,
  type RecordGrouping,
  type RecordModuleId,
  type RecordWritingStyle,
} from '../entities/RecordWritingStyle';
import {
  RECORD_GROUPING_INSTRUCTIONS,
  RECORD_MODULES,
  focusById,
  isKnownModuleId,
  type RecordModule,
} from './recordStyleCatalog';
import { NARRATIVE_ROLE_MARKS } from './narrativeParagraphs';

/** 풀어 놓은 구성 — 화면 요약과 요청서 문장이 **같은 값**을 본다(둘이 갈리면 거짓말이 된다). */
export interface ResolvedComposition {
  /** 실제로 나갈 요소, 순서대로. 교사 판단이 이미 자리를 잡은 뒤다. */
  readonly modules: readonly RecordModule[];
  /** 첫 문단이 교사 평가인가 — 어미 '~하는 학생임.' 요구 여부. */
  readonly firstIsEvaluation: boolean;
  /** 고른 묶는 방식. */
  readonly grouping: RecordGrouping;
  /** 묶는 방식 문장. */
  readonly groupingInstruction: string;
  /** 「작성 구성」 블록을 요청서에 붙여야 하는가(기본값이면 false). */
  readonly shouldEmitComposition: boolean;
}

/** 중복 없이 순서를 지키며 합친다. */
function dedupe(ids: readonly RecordModuleId[]): RecordModuleId[] {
  const seen = new Set<RecordModuleId>();
  const out: RecordModuleId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * 고른 설정 → 실제 구성.
 *
 * - 더한 요소 중 `lessonContext`(수업 맥락)만 **맨 앞**에 붙는다. 수업 소개는 뒤에 오면 글이 흐트러진다.
 *   나머지 추가 요소는 뒤에 붙는다.
 * - 그 초점이 허락하지 않은 추가 요소는 조용히 버린다(옛 저장값이 카탈로그보다 낡을 수 있다).
 * - `teacherJudgement` 는 뺄 수 없다. 뺀 것으로 저장돼 있어도 되살린다 — 교사 판단 없는 생기부는 없다.
 */
export function resolveComposition(input: RecordWritingStyle): ResolvedComposition {
  // ★옛 값이 그대로 들어와도 여기서 한 번 맞춘다 — 부르는 쪽이 정규화했을 것이라 믿지 않는다.
  const style = normalizeWritingStyle(input);
  const focus = focusById(style.focus);
  const disabled = new Set<RecordModuleId>(
    (style.disabledModules ?? []).filter((id) => id !== 'teacherJudgement'),
  );
  const allowedExtras = (style.extraModules ?? []).filter((id) => focus.extras.includes(id));
  const head = allowedExtras.includes('lessonContext')
    ? (['lessonContext'] as RecordModuleId[])
    : [];
  const tail = allowedExtras.filter((id) => id !== 'lessonContext');

  let body = dedupe([...head, ...focus.body, ...tail]).filter((id) => !disabled.has(id));

  if (style.opening === 'question') {
    const at = body.findIndex((id) => RECORD_MODULES[id].role === 'motive');
    if (at > 0) {
      const picked = body[at] as RecordModuleId;
      body = [picked, ...body.filter((_, i) => i !== at)];
    }
  }

  const ordered: RecordModuleId[] =
    style.opening === 'evaluation' ? ['teacherJudgement', ...body] : [...body, 'teacherJudgement'];

  return {
    modules: ordered.map((id) => RECORD_MODULES[id]),
    firstIsEvaluation: style.opening === 'evaluation',
    grouping: style.grouping,
    groupingInstruction: RECORD_GROUPING_INSTRUCTIONS[style.grouping],
    shouldEmitComposition: !isDefaultStyle(style),
  };
}

/**
 * 저장된 값을 지금 카탈로그에 맞춘다 — **읽는 자리에서 한 번**.
 *
 * ★2026-09-09 에 초점 10종을 7종으로 줄였다. 이미 저장된 설정·「내 작성 방식」에는 없어진 값이
 *   남아 있으므로, 별칭 표로 옮기고 카탈로그에 없는 요소 id 는 버린다.
 * ★조용히 기본값으로 떨어뜨리지 않는다: 어디로 갔는지 표가 정하고, 그 표는 테스트가 지킨다.
 */
export function normalizeWritingStyle(style: RecordWritingStyle): RecordWritingStyle {
  const focus = focusById(style.focus).id;
  const keep = (ids: readonly RecordModuleId[] | undefined): RecordModuleId[] =>
    (ids ?? []).filter((id) => isKnownModuleId(id));
  const disabled = keep(style.disabledModules);
  const extras = keep(style.extraModules);
  return {
    focus,
    opening: style.opening,
    grouping: style.grouping,
    ...(disabled.length > 0 ? { disabledModules: disabled } : {}),
    ...(extras.length > 0 ? { extraModules: extras } : {}),
    ...(style.instruction === undefined ? {} : { instruction: style.instruction }),
  };
}

/**
 * 이 방식이 기본값 그대로인가 — 참이면 요청서가 오늘과 같아야 한다.
 * 추가 지시는 별도 블록(옛 `teacherPrompt` 자리)이므로 여기 판정에 넣지 않는다.
 */
export function isDefaultStyle(input: RecordWritingStyle): boolean {
  // ★옛 초점 값이 기존형으로 옮겨지면 그것도 "기본값"이다 — 그래야 요청서가 예전과 같아진다.
  const style = normalizeWritingStyle(input);
  return (
    style.focus === DEFAULT_RECORD_WRITING_STYLE.focus &&
    style.opening === DEFAULT_RECORD_WRITING_STYLE.opening &&
    style.grouping === DEFAULT_RECORD_WRITING_STYLE.grouping &&
    (style.disabledModules ?? []).length === 0 &&
    (style.extraModules ?? []).length === 0
  );
}

/** 「작성 구성」 블록 — 기본값이 아닐 때만 요청서에 실린다. */
export function buildStyleInstruction(resolved: ResolvedComposition): string {
  const lines: string[] = [];
  lines.push(
    '작성 구성 - 아래 차례로 씁니다. 근거가 없는 항목은 통째로 건너뛰고, 없는 사실을 지어내 채우지 않습니다.',
  );
  resolved.modules.forEach((m, i) => {
    lines.push(`${i + 1}. [${NARRATIVE_ROLE_MARKS[m.role]}] ${m.label} - ${m.purpose}`);
    lines.push(`   · 필요한 근거: ${m.needs}`);
    if (m.forbid) lines.push(`   · 하지 말 것: ${m.forbid}`);
    if (m.optional === true) lines.push('   · 이 항목은 근거가 없으면 건너뜁니다.');
    if (i === 0 && resolved.firstIsEvaluation && m.role === 'evaluation') {
      lines.push("   · 어미: 이 문단의 첫 문장은 '~하는 학생임.' 으로 맺습니다.");
    }
  });
  lines.push('');
  lines.push(resolved.groupingInstruction);
  if (resolved.grouping !== 'single') {
    // 실측(2026-09-09): 행특에서 근거 3건 중 1건을 이유 없이 빠뜨렸다. 지어내는 것만 막고
    // 빠뜨리는 것을 안 막으면 선생님이 적어 둔 장면이 소리 없이 사라진다.
    lines.push(
      '근거 자료에 있는 장면을 이유 없이 빠뜨리지 마세요. 서로 다른 면을 보여 주는 장면이면 각각 남깁니다. ' +
        '다만 같은 장면을 여러 문단으로 나누어 늘리지는 마세요. 근거가 적으면 글도 짧아야 합니다.',
    );
  }
  lines.push('');
  // 실측(2026-09-09): 연결 표현이 거의 없어 문장들이 나열처럼 읽혔다. 반대로 매 문장에 붙이면
  // 글이 늘어진다. "필요한 자리에만"과 "한 문단에 한두 번"을 함께 말해야 한쪽으로 쏠리지 않는다.
  lines.push(
    '문장을 잇는 법: 앞뒤 관계가 드러나게 씁니다. 이어지는 관계(그 과정에서·이를 통해), ' +
      '대비되는 관계(다만·반면), 근거를 대는 관계(~므로·~기 때문에)를 필요한 자리에만 씁니다. ' +
      '매 문장에 접속 표현을 붙이면 글이 늘어집니다. 한 문단에 한두 번이면 충분합니다.',
  );
  lines.push(
    '각 문장이 무엇을 하는 문장인지 드러나게 씁니다: 교사의 판단인지, 학생이 한 일인지, ' +
      '그 일에서 확인된 것인지가 서술어에서 갈리게 합니다.',
  );
  // 실측(2026-09-09, codex): 근거를 거의 그대로 옮기기만 하고 "그래서 무엇을 봤는가"가 빠졌다.
  // 반대로 해석만 부추기면 지어내기가 는다 - "사실에서 곧바로 읽히는 것만"과 짝으로 넣는다.
  lines.push(
    '각 항목은 근거를 옮겨 적는 데서 그치지 말고, 학생이 한 일과 그 일에서 교사가 읽은 것을 ' +
      "함께 씁니다(해석 문장의 어미는 '~확인됨'·'~드러남'·'~관찰됨'). " +
      '해석은 그 항목에 적은 사실에서 곧바로 읽히는 것만 쓰고, 성격 전체나 미래를 넘겨짚지 않습니다. ' +
      '항목마다 읽은 것이 서로 달라야 하며, 맨 앞 교사 판단을 되풀이하지 않습니다. ' +
      '근거가 얇아 읽을 것이 없으면 해석 문장을 쓰지 않고 사실만 남깁니다. ' +
      '이미 쓴 사실을 다시 모아 요약하는 항목을 덧붙이지 않습니다. 각 사실은 한 번만 씁니다.',
  );
  // 실측(2026-09-09): "근거가 많은 학생이 그렇게 느낀다는 인상에 머물렀고" 처럼 수식 관계가 두 가지로
  // 읽히는 문장, "갈아 끼우다·밀고 가다·벼리다" 같은 비유가 나왔다. 읽는 사람이 한 번에 이해해야 한다.
  lines.push(
    '뜻이 한 번에 통하게 씁니다. 수식 관계가 두 가지로 읽히는 문장을 쓰지 않고, ' +
      '주어와 서술어가 맞는지 확인합니다. 근거에 적힌 말을 그대로 명사 앞에 끼워 넣지 말고 ' +
      "따옴표로 인용하거나 풀어 씁니다(예: 근거가 '많은 학생이 그렇게 느낀다'는 인상에 그침).",
  );
  lines.push(
    '비유·은유로 사실을 바꿔 말하지 않습니다(밀고 가다, 벼리다, 갈아 끼우다, 자리에 서다 같은 표현). ' +
      '무엇을 어떻게 했는지 그대로 적습니다.',
  );
  return lines.join('\n');
}

/** 화면에 그리는 한 줄 요약 — 요청서와 **같은 값**에서 만든다. */
export function summarizeComposition(resolved: ResolvedComposition): string {
  return resolved.modules.map((m) => m.label).join(' → ');
}

// ────────────────────────────────────────────────────────────────────────────
// 검사 — 앱이 셀 수 있는 것만
// ────────────────────────────────────────────────────────────────────────────

export type StyleWarningKind =
  | 'few-evidence'
  | 'no-before-after'
  | 'question-opening-unfit'
  | 'connected-single-evidence'
  | 'area-focus-mismatch'
  | 'prompt-version';

export interface StyleWarning {
  readonly kind: StyleWarningKind;
  readonly message: string;
}

export interface StyleReadinessInput {
  readonly style: RecordWritingStyle;
  /** 실제로 보낼 근거 건수(제외된 것을 뺀 수). */
  readonly evidenceCount: number;
  /** 근거에 적힌 서로 다른 날짜의 수. 날짜가 없는 근거는 세지 않는다. */
  readonly distinctDateCount: number;
  /** 지금 쓰는 영역(`RecordArea` 값). */
  readonly area: string;
  /** 서버에서 받은 규정 판본. 아직 못 받았으면 undefined. */
  readonly promptVersion?: number;
}

/**
 * 고르기 전에 알려 줄 것들. **아무것도 막지 않는다.**
 *
 * ★`prompt-version` 만은 실제 동작을 바꾼다(기존형으로 되돌림). 그래서 이 경고는 화면에 반드시 뜬다.
 */
export function checkStyleReadiness(input: StyleReadinessInput): StyleWarning[] {
  const { style, evidenceCount, distinctDateCount, area, promptVersion } = input;
  const focus = focusById(style.focus);
  const out: StyleWarning[] = [];

  if (
    promptVersion !== undefined &&
    promptVersion < RECORD_STYLE_MIN_PROMPT_VERSION &&
    !isDefaultStyle(style)
  ) {
    out.push({
      kind: 'prompt-version',
      message:
        '지금은 기존 방식으로 만들어집니다. 서버의 작성 규정이 아직 새 구성을 받지 않아, 고른 구성 대신 기존형으로 씁니다.',
    });
  }

  if (evidenceCount > 0 && evidenceCount < focus.minEvidence) {
    out.push({
      kind: 'few-evidence',
      message: `근거가 ${evidenceCount}건뿐입니다. 「${focus.label}」은 최소 ${focus.minEvidence}건이 있어야 뜻이 있습니다. 「성취·수행 중심」이 더 맞을 수 있습니다.`,
    });
  }

  if (style.focus === 'feedbackRevise' && distinctDateCount < 2) {
    out.push({
      kind: 'no-before-after',
      message:
        '고치기 전후가 날짜로 구별되지 않습니다. 변화·향상은 쓰지 않고 지금 수행 중심으로 나옵니다.',
    });
  }

  if (style.opening === 'question') {
    const hasMotive = resolveComposition(style).modules.some((m) => m.role === 'motive');
    if (!hasMotive) {
      out.push({
        kind: 'question-opening-unfit',
        message: '이 초점에는 질문을 놓을 자리가 없어 수행부터 씁니다.',
      });
    }
  }

  if (style.grouping === 'connected' && evidenceCount === 1) {
    out.push({
      kind: 'connected-single-evidence',
      message: '근거가 하나라 이어 붙일 과정이 없습니다. 「대표 장면 하나」와 결과가 같습니다.',
    });
  }

  if (area === 'behavior' && style.focus !== 'lifeRelation') {
    out.push({
      kind: 'area-focus-mismatch',
      message: '행동특성 및 종합의견에는 「생활·관계 종합」이 더 맞습니다.',
    });
  } else if (area !== 'behavior' && style.focus === 'lifeRelation') {
    out.push({
      kind: 'area-focus-mismatch',
      message: '「생활·관계 종합」은 행동특성 및 종합의견을 위한 구성입니다.',
    });
  } else if (focus.preferredAreas && !focus.preferredAreas.includes(area)) {
    out.push({
      kind: 'area-focus-mismatch',
      message: `「${focus.label}」은 이 영역에서 쓰도록 만든 구성이 아닙니다.`,
    });
  }

  return out;
}

/**
 * 규정 판본 문지기 — 판본이 모자라면 기존형으로 되돌린다(추가 지시는 남긴다).
 *
 * ★조용히 바꾸지 않는다. `downgraded` 가 참이면 화면이 그 사실을 적고, 판에도 되돌린 뒤의 구성이 남는다.
 * ★판본을 아직 못 받았으면(undefined) 되돌리지 않는다 — 실행 직전에 받아 오므로 그때 다시 본다.
 */
export function applyPromptVersionGate(
  style: RecordWritingStyle,
  promptVersion: number | undefined,
): { readonly style: RecordWritingStyle; readonly downgraded: boolean } {
  if (promptVersion === undefined) return { style, downgraded: false };
  if (promptVersion >= RECORD_STYLE_MIN_PROMPT_VERSION) return { style, downgraded: false };
  if (isDefaultStyle(style)) return { style, downgraded: false };
  return {
    style: {
      ...DEFAULT_RECORD_WRITING_STYLE,
      ...(style.instruction === undefined ? {} : { instruction: style.instruction }),
    },
    downgraded: true,
  };
}
