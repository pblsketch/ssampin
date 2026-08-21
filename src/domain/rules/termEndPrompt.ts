/**
 * "이번 학기는 언제 끝나나요?"를 물어야 하는 때를 정하는 규칙.
 *
 * 학기 종료일이 없으면 총 차시를 셀 수 없다. 그런데 아무 때나 물으면 잔소리가 된다 —
 * 개학일 팝업(`termStartPrompt`)이 8월에만 묻는 것과 같은 이유다.
 *
 * 여기서는 달이 아니라 **화면**으로 시점을 좁힌다. 종료일은 오직 진도 관리 화면에서만 쓰이므로,
 * **사용자가 그 화면에 실제로 들어왔을 때만** 묻는다. 앱을 켜자마자 묻지 않는다 — 진도를 안 쓰는
 * 선생님에게는 평생 필요 없는 질문이다.
 *
 * ⚠️ 이건 ADR-037이 금지한 "앱이 학사 구간을 단정하는 것"이 아니다. 반대로 **모른다는 사실을
 * 인정하고 사용자에게 묻는다.** 답을 들으면 다시 묻지 않는다(등록되거나 넘기면 조용해진다).
 *
 * ⚠️ "다시 묻지 않는다"는 **먼저 말 걸지 않는다**는 뜻이지 **못 고친다**는 뜻이 아니다. 종업식이
 * 바뀌거나 날짜를 잘못 넣으면 학기 끝까지 틀린 차시를 보게 되므로, 사용자가 직접 부른
 * 경우(`editRequested`)는 이미 답한 학기라도 연다.
 *
 * ⚠️ 이 판정이 참이어도 팝업을 곧장 띄우면 안 된다. 8월에 처음 쓰는 선생님은 개학일 팝업과
 * 조건이 겹쳐 **focus trap 두 개가 동시에** 뜬다(2026년 8월 온보딩 먹통 사고의 재현 경로).
 * 두 팝업 모두 모달 코디네이터에 등록해 한 번에 하나만 뜨게 하는 것은 화면 쪽 책임이다.
 */

import { parseTerm } from './academicCalendar';

export interface TermEndPromptInput {
  /** 지금 앱이 아는 학기(resolveCurrentTerm 결과). */
  readonly currentTerm: string;
  /** 등록된 학기별 종료일 — 이미 답한 학기는 묻지 않는다. */
  readonly termEndDates?: Readonly<Record<string, string>>;
  /** 사용자가 "나중에"로 넘긴 학기 라벨 — 같은 학기를 다시 묻지 않는다. */
  readonly skippedTerm?: string;
  /**
   * 사용자가 진도 관리 화면에 들어왔는가.
   * 이 값이 false면 무조건 묻지 않는다 — 앱 시작만으로는 물을 이유가 없다.
   */
  readonly progressViewOpened: boolean;
  /**
   * 사용자가 "고칠래요"라고 직접 눌렀는가.
   * 참이면 이미 등록됐거나 넘긴 학기라도 연다 — 침묵 규칙은 먼저 묻지 않기 위한 것이지
   * 고치지 못하게 하려는 것이 아니다.
   */
  readonly editRequested?: boolean;
}

export type TermEndPromptDecision =
  | { readonly kind: 'none' }
  /** 그 학기의 종료일을 물어본다. */
  | { readonly kind: 'ask'; readonly term: string };

/**
 * 묻지 않는 경우 4가지:
 *  - 진도 관리 화면에 들어오지 않았다 — 종료일이 쓰이는 유일한 곳이다.
 *  - 그 학기 종료일이 이미 등록돼 있다 — 답을 들었다.
 *  - 사용자가 이미 넘겼다 — 같은 학기에 다시 묻지 않는다.
 *  - 학기 라벨이 형식에 맞지 않는다 — 추측하지 않고 조용히 넘어간다(예외를 던지지 않는다).
 *
 * 단, 아래 두 침묵(등록됨·넘김)은 **사용자가 직접 부르면 열린다**. 화면이 없는 상태(위 두 가지)는
 * 부름으로도 열리지 않는다 — 종료일을 쓰지 않는 화면에서 팝업이 뜨면 그건 고장이다.
 */
export function decideTermEndPrompt(input: TermEndPromptInput): TermEndPromptDecision {
  if (!input.progressViewOpened) return { kind: 'none' };

  const parsed = parseTerm(input.currentTerm);
  if (parsed === null) return { kind: 'none' };

  const term = input.currentTerm;
  if (input.editRequested === true) return { kind: 'ask', term };
  if (input.termEndDates?.[term] !== undefined) return { kind: 'none' };
  if (input.skippedTerm === term) return { kind: 'none' };

  return { kind: 'ask', term };
}
