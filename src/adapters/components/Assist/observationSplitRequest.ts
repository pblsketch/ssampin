/**
 * 말로 쓴 긴 글을 "학생별로 나누기" — 쌤핀 AI 로 넘기는 통로.
 *
 * ## 왜 새 도구를 만들지 않는가
 *
 * 나누는 일은 이미 있는 `add_observation`(ADR-074)로 충분하다. 모델이 하는 일은
 * **나누고 옮기는 것뿐이고, 관찰문을 짓지 않는다**(ADR-074 결정 2). 그래서 여기서는
 * 도구를 늘리지 않고 **입력 경로 하나**만 더 낸다.
 *
 * ## 왜 스토어가 아니라 이 작은 통로인가
 *
 * 마이크가 있는 화면(관찰 입력·옆핀)과 쌤핀 AI 창은 서로 남남이다. 둘을 잇자고
 * 공용 스토어(`useAssistStore`)에 칸을 새로 파면, 그 파일은 **회귀 #57 가드가
 * 지키는 파일**이라 건드릴수록 위험하다. 대신 이 파일이 "요청이 하나 생겼다"는
 * 신호만 전달하고, 실제 질문은 `AssistDockContainer` 가 이미 쓰던 길(`handleAsk`)로
 * 보낸다. 그 길에는 이름을 별칭으로 가리는 관문이 이미 달려 있다.
 *
 * ★질문 원문도 `redactQuestion` 을 지난다 — 받아쓴 글에 학생 이름이 그대로 들어 있어도
 *   밖으로는 `［이름1］` 로 나간다(useAssistStore.ask).
 */

type Listener = (text: string) => void;

const listeners = new Set<Listener>();

/**
 * 이 길이보다 짧으면 "나누기"를 권하지 않는다.
 *
 * 한 학생 이야기 한 줄을 굳이 AI 에 태울 이유가 없다. 여러 학생이 섞이려면 어느 정도
 * 길어야 하고, 짧은 글에 단추가 떠 있으면 저장 단추와 눈싸움만 한다.
 */
export const OBSERVATION_SPLIT_MIN_LENGTH = 40;

export function isSplitWorthwhile(text: string): boolean {
  return text.trim().length >= OBSERVATION_SPLIT_MIN_LENGTH;
}

/**
 * 모델에게 주는 지시문.
 *
 * ★"짓지 말고 옮기라"를 문장으로 못 박는다. 프롬프트만으로 규정을 막을 수 없다는 것은
 *   이미 실측으로 안다(ADR-072 Phase 1) — 그래서 마지막 방어선은 이 문장이 아니라
 *   **[실행]을 누르기 전에는 아무것도 저장되지 않는다**는 구조다.
 * ★"남겨 주세요" 는 쓰기 의도 판정(`mentionsWriteIntent`)에 걸리는 말이다. 이 말이
 *   빠지면 모델에게 도구 목록이 안 나가서 제안이 아예 만들어지지 않는다.
 */
export function buildSplitQuestion(text: string): string {
  return [
    '아래는 수업 직후에 말로 받아쓴 관찰 메모입니다. 여러 학생 이야기가 섞여 있을 수 있어요.',
    '학생마다 따로 떼어서 관찰 기록으로 남겨 주세요.',
    '- 문장을 새로 짓지 말고, 제가 말한 표현을 그대로 옮겨 주세요.',
    '- 말하지 않은 내용을 채우거나 다듬지 마세요.',
    '- 누구 이야기인지 알 수 없는 부분은 빼 주세요.',
    '',
    text.trim(),
  ].join('\n');
}

/** 마이크가 있는 화면이 부른다. */
export function requestObservationSplit(text: string): void {
  if (!isSplitWorthwhile(text)) return;
  for (const listener of listeners) listener(text);
}

/** 쌤핀 AI 창이 구독한다. 반환값은 구독 해지 함수. */
export function subscribeObservationSplit(listener: Listener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}
