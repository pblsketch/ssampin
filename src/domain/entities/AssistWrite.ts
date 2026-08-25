/**
 * 쌤핀 AI — **쓰기 제안**의 뼈대 (브릿지 동등화 Phase 3)
 *
 * 순수 TypeScript — 외부 의존성 import 금지(domain 규칙).
 *
 * ★이 파일의 존재 이유 한 줄: **모델은 실행하지 못한다.**
 *
 * 읽기 도구는 모델이 고르면 앱이 곧바로 실행한다 — 조회는 되돌릴 것이 없기 때문이다.
 * 쓰기는 다르다. 잘못된 날짜에 진도가 들어가거나 엉뚱한 할 일이 지워지면 선생님이
 * 손으로 되돌려야 하고, 무엇이 바뀌었는지조차 모를 수 있다.
 *
 * 그래서 모델이 할 수 있는 것은 **제안까지**다. 제안은 이 파일의 `AssistWriteProposal`
 * 이라는 값일 뿐이고, 그 값에는 저장 능력이 없다. 실제 저장은 선생님이 [실행]을 누를 때
 * 앱이 **기존 스토어 함수를 그대로** 부르면서 일어난다(새 저장 경로를 만들지 않는다).
 *
 * 설계 근거: docs/01-plan/features/assist-bridge-parity.plan.md §2 C그룹
 */

/** 이 제안이 무엇을 하는가. 화면 문구와 확인 강도를 가르는 기준이다. */
export type AssistWriteAction = 'create' | 'update' | 'delete';

/**
 * 실행에 쓸 값. **모델이 준 원문이 아니라 앱이 검증·정규화한 결과**다.
 *
 * 타입을 22가지 도구별 유니온으로 쪼개지 않은 이유: 도구마다 변형을 만들면 새 도구를
 * 더할 때 손댈 자리가 여섯 곳이 되고, 그중 하나를 빠뜨리는 것이 이 저장소의 전형적인
 * 재발 경로다. 대신 **값이 여기 들어오기 전에** 도구별 조립기가 형식을 이미 확정하고,
 * 실행기는 도구 이름으로 갈라 읽으며, 그 짝을 도구별 테스트가 잠근다.
 */
export interface AssistWriteValues {
  readonly [key: string]: string | number | boolean;
}

/** 미리보기에 한 줄로 뜨는 항목. **파싱된 값 전부**를 보여주는 것이 목적이다. */
export interface AssistWriteField {
  readonly label: string;
  readonly value: string;
}

/**
 * 한 번에 여러 칸을 채우는 제안의 칸 하나 (루브릭 "만점으로 해줘").
 *
 * ★`values` 에 담지 않은 이유: `AssistWriteValues` 는 스칼라만 담는다(위 주석 참조).
 * 목록을 쉼표로 이어 붙이거나 JSON 문자열로 우겨넣으면 실행기가 그것을 다시 **파싱**해야
 * 하는데, 그 순간 "앱이 확정한 값"이라는 이 타입의 약속이 깨진다. 목록은 목록으로 둔다.
 */
export interface AssistWriteMark {
  readonly criterionId: string;
  readonly criterionName: string;
  readonly levelId: string;
  readonly levelName: string;
}

export interface AssistWriteProposal {
  /** 레지스트리의 도구 id. 실행기가 이걸로 갈라 읽는다 */
  readonly tool: string;
  readonly action: AssistWriteAction;
  /** 미리보기 카드 제목 — "할 일 추가" */
  readonly title: string;
  /**
   * 무엇이 저장되는지 사람이 읽는 형태로. **하나도 빠뜨리지 않는다.**
   * 미리보기가 값을 감추면 [실행] 버튼은 확인이 아니라 요식이 된다.
   */
  readonly fields: readonly AssistWriteField[];
  /**
   * 고칠·지울 대상의 **원문**. 계획서 요구사항이다 —
   * "삭제 계열은 미리보기에 삭제될 대상의 원문을 보여준다".
   * 만들기(create)에는 없다.
   */
  readonly target?: {
    readonly label: string;
    readonly original: string;
  };
  /** 실행기가 쓸 값. 화면에는 이 객체를 그대로 그리지 않는다 */
  readonly values: AssistWriteValues;
  /** 고칠·지울 대상의 내부 식별자. **모델에게는 한 번도 보이지 않는다** */
  readonly targetId?: string;
  /**
   * 한 번에 채울 칸들. 지금은 루브릭 채점만 쓴다 — 선생님이 "만점으로 해줘"라고 하면
   * 평가 요소가 여러 개라 칸도 여러 개가 된다.
   *
   * ★한 칸짜리도 여기에 **한 개짜리 목록**으로 들어온다. 실행기가 "한 칸이면 이 길,
   * 여러 칸이면 저 길"로 갈리면 한쪽만 고치는 사고가 나므로 길을 하나로 둔다.
   * (`values` 에도 첫 칸이 그대로 들어간다 — 미리보기·문구가 쓰던 자리라 유지한다.)
   */
  readonly marks?: readonly AssistWriteMark[];
  /**
   * 한 번에 저장할 **여러 건**. 공문 하나에 할 일이 셋 들어 있는 경우처럼,
   * 모델이 같은 쓰기 도구를 여러 번 고를 때 그것들을 묶는다.
   *
   * ★예전에는 **첫 건만 쓰고 나머지를 조용히 버렸다**(`toolCalls.find`) — 선생님은
   * 셋을 부탁했는데 하나만 저장되고, 무엇이 빠졌는지 말해 주지도 않았다
   * (2026-08-25 오너 신고).
   *
   * ★[실행] 은 여전히 **하나**다. 카드 하나에 무엇무엇이 저장되는지 전부 적고,
   * 누르면 묶음 전체가 저장된다 — 카드를 여러 장 띄우면 하나만 누르고 지나치기 쉽다.
   */
  readonly batch?: readonly AssistWriteProposal[];
}

/**
 * 제안을 만들지 못한 경우. **조용히 실패하지 않는다.**
 *
 * "그런 할 일을 못 찾았어요"를 선생님에게 그대로 보여줘야, 모델이 엉뚱한 것을 지웠다고
 * 착각하는 일이 없다. 사유는 화면에 그대로 뜨므로 한국어 완성 문장으로 쓴다.
 */
export interface AssistWriteRejection {
  readonly reason: string;
}

export type AssistWriteOutcome = AssistWriteProposal | AssistWriteRejection;

export function isWriteProposal(outcome: AssistWriteOutcome): outcome is AssistWriteProposal {
  return 'tool' in outcome;
}

/**
 * 제안의 상태. **한 번에 한 건**(계획서)이라 턴마다 최대 하나만 산다.
 *
 * - pending: 선생님의 [실행]을 기다린다
 * - done: 실행됐다. 다시 누를 수 없다 — 두 번 눌러 두 건이 들어가는 사고를 막는다
 * - expired: 실행 없이 대화가 이어져 소멸했다(계획서: "제안은 소멸")
 * - failed: 실행하다 실패했다. 무엇이 안 됐는지 선생님이 알아야 한다
 */
// - running: [실행]을 눌러 저장이 진행 중이다. 버튼이 사라져 **두 번 누를 수 없다** —
//   저장은 파일 쓰기라 수백 ms 걸리는데, 그동안 버튼이 살아 있으면 이중 저장이 된다
//   (2026-08-24 UltraQA).
export type AssistProposalState = 'pending' | 'running' | 'done' | 'expired' | 'failed';
