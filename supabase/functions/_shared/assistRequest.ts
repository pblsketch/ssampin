/**
 * 쌤핀 AI 중계 함수 — 요청 검증 (순수 함수)
 *
 * ★`index.ts` 에서 분리한 이유: **테스트할 수 있게 하려고.**
 *
 * `vitest.config.ts` 의 include 는 `src/**` 와 `electron/**` 뿐이라
 * `supabase/functions/**` 아래 테스트는 CI 에서 돌지 않는다.
 * 그런데 이 파일은 **앱의 그물이 뚫렸을 때 마지막으로 막는 자리**라 돌지 않는 테스트로 둘 수 없다.
 * 그래서 Deno 전역·URL import 없이 순수 함수만 모아 두고,
 * `src/infrastructure/supabase/__tests__/` 에서 상대경로로 불러 검증한다.
 * (온라인 교무실의 `_shared/staffroomAccess.ts` 가 같은 구조다.)
 *
 * ★이 검증이 존재하는 이유: **서버는 앱을 믿지 않는다.**
 * 앱의 등급제·재구성·PII 관문은 정상 클라이언트를 전제한다. 변조된 클라이언트는
 * 아무거나 보낼 수 있으므로 서버가 같은 검사를 다시 한다.
 */

/** 모델에 허용된 도구 등급. 앱의 `ALLOWED_GRADES` 와 같은 값이며 **영구 경계**다(ADR-061 결정 7). */
export const ALLOWED_GRADES: readonly number[] = [1];

export const LIMITS = {
  maxTurns: 12,
  maxTurnChars: 2_000,
  maxTotalChars: 8_000,
  maxToolResults: 6,
  maxToolResultChars: 4_000,
} as const;

const INSTALL_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_REQUEST_KEYS = new Set(['installId', 'turns', 'toolResults', 'tools', 'stream']);
const ALLOWED_TURN_KEYS = new Set(['role', 'content']);
const ALLOWED_TOOL_RESULT_KEYS = new Set(['tool', 'grade', 'data']);

/**
 * 서버가 보는 PII 패턴 — 전화·주민번호·이메일뿐이다.
 *
 * ★생년월일·주소는 **일부러 뺐다.** 서버는 어느 필드가 자유 입력인지 모르는데,
 * 생년월일 패턴은 `2026-08-21` 같은 **평범한 날짜를 전부 잡는다.**
 * 앱에서 그걸 켰다가 정상 도구 결과 5종 중 3종이 100% 차단된 적이 있다(실측으로 확인).
 * 여기서 켜면 같은 사고가 서버에서 재현된다 — **오탐이 기능을 죽인다.**
 * 필드 성격을 아는 앱(`assertNoPii`)이 세밀하게 보고, 서버는 **명백한 것만** 막는다.
 */
const SERVER_PII_PATTERNS: ReadonlyArray<{ kind: string; re: RegExp }> = [
  { kind: 'rrn', re: /(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)/ },
  // ★경계에 영문(16진수 포함)을 넣은 이유: UUID 가 전화번호로 오인되기 때문이다.
  //   `a4755b0f-69b8-4b05-9129-3171a4a53e17` 안의 `05-9129-3171` 이 원래 경계 `(?<![\d-])` 를 통과했다.
  //   실측 30만 개 중 717개(0.24%). 앱에서 같은 오탐으로 list_classes 가 영구히 막힌 적이 있고,
  //   **서버 코드에 같은 실수를 다시 넣었다가 이 파일의 테스트가 잡았다.**
  //   `domain/privacy/maskRules.ts` 는 쿨메신저와 공유라 건드리지 않고 여기만 좁힌다.
  {
    kind: 'phone',
    re: /(?<![0-9A-Za-z-])(01[016-9]|0\d{1,2})[-.\s]?\d{3,4}[-.\s]?\d{4}(?![0-9A-Za-z-])/,
  },
  { kind: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
];

/** 걸린 종류만 돌려준다. **걸린 값 자체는 담지 않는다** — 로그로 새면 검사의 의미가 없다. */
export function findServerPii(text: string): string | null {
  for (const { kind, re } of SERVER_PII_PATTERNS) {
    if (re.test(text)) return kind;
  }
  return null;
}

export interface ValidatedTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface ValidatedToolResult {
  readonly tool: string;
  readonly grade: number;
  readonly data: unknown;
}

export interface ValidatedToolSchema {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

export interface ValidatedAssistRequest {
  readonly installId: string;
  readonly turns: readonly ValidatedTurn[];
  readonly toolResults: readonly ValidatedToolResult[];
  readonly tools: readonly ValidatedToolSchema[];
  readonly stream: boolean;
}

/** 검증 결과. `error` 는 사용자에게 그대로 보여도 되는 한국어 문구다. */
export type ValidationResult =
  | { readonly error: string; readonly logKind?: string }
  | { readonly ok: ValidatedAssistRequest };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: Set<string>): string[] {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

/**
 * 요청을 검증한다.
 *
 * **모르는 키는 무시가 아니라 400 이다.** 조용히 통과시키면 앱의 그물 ②(화이트리스트 재구성)가
 * 서버에서 무의미해진다 — 클라이언트가 필드를 하나 더 실어 보내면 그대로 모델에 간다.
 */
export function validateAssistRequest(body: unknown): ValidationResult {
  if (!isRecord(body)) return { error: '요청 형식이 올바르지 않습니다' };

  const extra = unknownKeys(body, ALLOWED_REQUEST_KEYS);
  if (extra.length > 0) return { error: `알 수 없는 항목이 있습니다: ${extra.join(', ')}` };

  const installId = body.installId;
  if (typeof installId !== 'string' || !INSTALL_ID_PATTERN.test(installId)) {
    return { error: '설치 식별자가 올바르지 않습니다' };
  }

  if (!Array.isArray(body.turns) || body.turns.length === 0) {
    return { error: '대화 내용이 없습니다' };
  }
  if (body.turns.length > LIMITS.maxTurns) return { error: '대화가 너무 깁니다' };

  const turns: ValidatedTurn[] = [];
  let totalChars = 0;
  for (const raw of body.turns) {
    if (!isRecord(raw)) return { error: '대화 형식이 올바르지 않습니다' };
    const bad = unknownKeys(raw, ALLOWED_TURN_KEYS);
    if (bad.length > 0) return { error: `대화에 알 수 없는 항목이 있습니다: ${bad.join(', ')}` };

    const { role, content } = raw;
    if (role !== 'user' && role !== 'assistant') return { error: '대화 역할이 올바르지 않습니다' };
    if (typeof content !== 'string' || content.length === 0) {
      return { error: '빈 대화는 보낼 수 없습니다' };
    }
    if (content.length > LIMITS.maxTurnChars) {
      return { error: '한 번에 보낼 수 있는 길이를 넘었습니다' };
    }

    totalChars += content.length;
    const hit = findServerPii(content);
    if (hit) {
      // 앱의 관문(그물 ③)이 막았어야 하는 것이 여기까지 왔다 = 앱 쪽 그물이 뚫렸다는 신호.
      return { error: '연락처나 주민번호로 보이는 내용이 있어 보내지 않았습니다', logKind: hit };
    }
    turns.push({ role, content });
  }
  if (totalChars > LIMITS.maxTotalChars) return { error: '대화가 너무 깁니다' };

  const toolResults: ValidatedToolResult[] = [];
  if (body.toolResults !== undefined) {
    if (!Array.isArray(body.toolResults)) return { error: '조회 결과 형식이 올바르지 않습니다' };
    if (body.toolResults.length > LIMITS.maxToolResults) {
      return { error: '한 번에 보낼 수 있는 조회 결과 수를 넘었습니다' };
    }
    for (const raw of body.toolResults) {
      if (!isRecord(raw)) return { error: '조회 결과 형식이 올바르지 않습니다' };
      const bad = unknownKeys(raw, ALLOWED_TOOL_RESULT_KEYS);
      if (bad.length > 0) {
        return { error: `조회 결과에 알 수 없는 항목이 있습니다: ${bad.join(', ')}` };
      }
      if (typeof raw.tool !== 'string' || raw.tool.length === 0) {
        return { error: '조회 결과에 도구 이름이 없습니다' };
      }
      if (typeof raw.grade !== 'number' || !ALLOWED_GRADES.includes(raw.grade)) {
        // ★등급 위반은 무시가 아니라 거절이다.
        return {
          error: '허용되지 않은 자료를 보내려 했습니다',
          logKind: `grade:${String(raw.grade)}`,
        };
      }

      const serialized = JSON.stringify(raw.data ?? null);
      if (serialized.length > LIMITS.maxToolResultChars) {
        return { error: '조회 결과가 너무 깁니다' };
      }
      const hit = findServerPii(serialized);
      if (hit) {
        return {
          error: '개인정보로 보이는 내용이 있어 보내지 않았습니다',
          logKind: `${raw.tool}:${hit}`,
        };
      }
      toolResults.push({ tool: raw.tool, grade: raw.grade, data: raw.data });
    }
  }

  const tools: ValidatedToolSchema[] = [];
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools)) return { error: '도구 목록 형식이 올바르지 않습니다' };
    for (const raw of body.tools) {
      if (!isRecord(raw) || raw.type !== 'function' || !isRecord(raw.function)) {
        return { error: '도구 형식이 올바르지 않습니다' };
      }
      const fn = raw.function;
      if (typeof fn.name !== 'string' || typeof fn.description !== 'string') {
        return { error: '도구 형식이 올바르지 않습니다' };
      }
      tools.push({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: isRecord(fn.parameters) ? fn.parameters : {},
        },
      });
    }
  }

  if (body.stream !== undefined && typeof body.stream !== 'boolean') {
    return { error: '요청 형식이 올바르지 않습니다' };
  }

  return {
    ok: { installId, turns, toolResults, tools, stream: body.stream === true },
  };
}

/**
 * 모델에게 주는 시스템 지시 — 숫자를 지어내지 못하게 하는 것이 핵심이고,
 * **오늘 날짜를 반드시 넣어 부른다.**
 *
 * 날짜가 없던 시절, 모델이 지난 기한(8/19)을 "아직 남아 있다"고 답했다
 * (2026-08-23 오너 신고) — 모델은 오늘이 며칠인지 모르기 때문이다.
 * "항목을 빠짐없이" 줄도 같은 신고에서 나왔다: 출결 카드의 다섯 항목 중
 * '결과'만 빼고 요약해, 값이 있는 날엔 카드와 설명이 어긋나 보일 뻔했다.
 *
 * 순수 함수로 둔다 — Deno 전역을 쓰지 않아야 vitest 쪽 테스트가 돈다(파일 머리 주석).
 */
export function buildAssistSystemPrompt(today: string): string {
  return [
    '당신은 한국 중·고등학교 교사를 돕는 쌤핀의 업무 비서입니다.',
    `오늘은 ${today}입니다.`,
    '',
    '지켜야 할 것:',
    '- 학생 개인 정보(이름·명단·개별 이력)는 조회할 수 없습니다. 집계 수치만 다룹니다.',
    '- 주어진 숫자를 바꾸거나 지어내지 마세요. 없는 값은 없다고 말하세요.',
    '- 조회 결과의 항목을 빠짐없이 반영하세요. 0이 아닌 값을 빼놓고 요약하면 안 됩니다.',
    '- 항목 이름(할 일 제목 등)은 조회 결과의 표현을 글자 그대로 쓰세요. 바꿔 쓰거나 지어내면 안 됩니다.',
    '- 기한이 오늘보다 앞이거나 overdue 가 true 면 "기한이 지났다"고 분명히 말하세요.',
    // 아래 두 줄은 배포 후 실측에서 나온 것이다: "어떤 일인지"에 개수만 답하고,
    // "overdue가 true인 항목은…"처럼 내부 필드 이름을 선생님에게 그대로 노출했다.
    // 후보 문구를 solar-pro3 에 3회 반복 실측해 확정했다(제목 정확·누출 0).
    '- 어떤 항목인지 묻는 질문에는 제목을 그대로 나열해 답하세요.',
    '- undone, overdue, due 같은 영어 필드 이름을 답에 쓰지 마세요. 자연스러운 한국어로만 말하세요.',
    '- 한국어로, 두세 문장 안에 간결하게 답하세요.',
    '- 개별 학생 정보를 묻는 질문에는 집계로 답하고, 자세한 내용은 앱 화면에서 볼 수 있다고 안내하세요.',
  ].join('\n');
}

/** 도구 결과를 모델이 읽을 수 있는 한 턴으로 만든다. */
export function buildToolResultsTurn(
  results: readonly ValidatedToolResult[],
): ValidatedTurn | null {
  if (results.length === 0) return null;
  const lines = results.map((r) => `- ${r.tool}: ${JSON.stringify(r.data)}`);
  return { role: 'user', content: ['[앱에서 조회한 결과]', ...lines].join('\n') };
}
