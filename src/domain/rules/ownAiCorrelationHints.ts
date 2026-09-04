/**
 * 별칭 ↔ 번호 대응 힌트 — 구독 CLI 경로에서 "이름으로 물어본 질문"이 답을 얻게 한다.
 *
 * ★왜 필요한가(코드를 읽어 문제가 뒤집힌 자리):
 *
 * 처음에는 "앱 별칭과 브릿지 별칭의 번호가 어긋나 **남의 실명이 복원된다**"가 위험이라고 봤다.
 * 실제로는 그런 일이 구조적으로 없다 — 브릿지는 번호 별칭이 아니라 **불투명 토큰**(`stu_…`)을
 * 쓰고, `restoreModelText` 는 `［접두사N］` 꼴만 되돌린다.
 *
 * 진짜 문제는 반대였다. `rosterFrom` 은 **이름과 학번을 둘 다 가린다**
 * (`{label:'이름'}` → `［이름1］`, `{label:'학번', values:['15번']}` → `［학번1］`).
 * 그래서 "김지훈 출결 알려줘"도 "15번 출결 알려줘"도 모델에게는 별칭으로만 도착하고,
 * 모델은 그 별칭을 브릿지가 주는 학번과 이어 붙일 수가 없다 → 흔한 질문이 답을 못 낸다.
 *
 * 해법: 가린 뒤에 **"별칭 = 소속 + 번호"** 한 줄을 덧붙인다.
 * 번호는 브릿지가 `list_students` 로 **이미 내보내는 정보**라 새로 새는 게 없고,
 * **실명은 여전히 나가지 않는다.**
 *
 * ★`MaskMapping` 에는 학번이 없다(`alias`·`original`·`kind` 뿐). 그래서 학생 목록을 가진
 * 화면이 `resolve` 를 주입한다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { MaskMapping } from '../privacy/types';

/** 학생 한 명의 소속과 번호. 예: `{ scope: '담임', number: 15 }` → "담임 15번" */
export interface StudentNumberRef {
  /** 사람이 읽는 소속. 담임 학급이면 '담임', 교과 수업반이면 반 이름. */
  readonly scope: string;
  readonly number: number;
}

/** 실명 → 그 이름에 해당하는 번호 후보들. 동명이인이면 여러 개가 온다. */
export type StudentNumberResolver = (name: string) => readonly StudentNumberRef[];

/**
 * 별칭 접두사 — `rosterFrom` 이 만드는 두 묶음의 라벨과 같아야 한다.
 * (`redactOutbound.rosterFrom` 이 `label:'이름'` 과 `label:'학번'` 을 만든다.)
 */
const NAME_ALIAS_PREFIX = '［이름';
const NUMBER_ALIAS_PREFIX = '［학번';

function formatRefs(refs: readonly StudentNumberRef[]): string {
  return refs.map((r) => `${r.scope} ${r.number}번`).join(' 또는 ');
}

/**
 * 대응 힌트 줄들을 만든다.
 *
 * - **실명은 절대 넣지 않는다** — 별칭과 번호만.
 * - 해석되지 않은 이름(번호를 못 찾음)은 **줄을 만들지 않는다** — 없는 정보를 지어내지 않는다.
 * - 동명이인은 후보를 전부 나열한다 — 모델이 하나를 임의로 고르지 않게.
 * - 학번 별칭(`［학번N］`)은 가려진 값이 곧 번호라 해석기 없이 바로 되돌려 준다.
 * - 같은 별칭이 여러 번 나와도 한 줄만 만든다.
 */
export function buildCorrelationHints(
  mappings: readonly MaskMapping[],
  resolve: StudentNumberResolver,
): readonly string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const m of mappings) {
    // 학생 이름·학번은 명단 기반이라 kind 가 'keyword' 다(패턴이 아니다).
    if (m.kind !== 'keyword') continue;
    if (seen.has(m.alias)) continue;

    if (m.alias.startsWith(NUMBER_ALIAS_PREFIX)) {
      seen.add(m.alias);
      lines.push(`${m.alias} = ${m.original}`);
      continue;
    }
    if (!m.alias.startsWith(NAME_ALIAS_PREFIX)) continue;

    seen.add(m.alias);
    const refs = resolve(m.original);
    if (refs.length === 0) continue;
    lines.push(`${m.alias} = ${formatRefs(refs)}`);
  }
  return lines;
}

/** 힌트 줄들을 시스템 프롬프트에 붙일 한 덩어리로. 힌트가 없으면 빈 문자열. */
export function formatCorrelationHintBlock(lines: readonly string[]): string {
  if (lines.length === 0) return '';
  return [
    '학생 별칭 대응표입니다. 도구를 부를 때는 아래 번호를 쓰고, 답변에서는 별칭을 그대로 쓰세요.',
    ...lines,
  ].join('\n');
}
