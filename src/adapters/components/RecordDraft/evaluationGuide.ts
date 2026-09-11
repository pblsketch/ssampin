/**
 * 비어 있는 평가 자리 안내(ADR-109) — 지도 열·장면 상세·AI 장면 배치 제안이 **같은 말**을 쓴다.
 *
 * ★말만 하는 안내가 아니다. 초안 요청서가 빈 평가를 건너뛰지 않고 근거 전체를 종합해 쓰라고 지시한다
 *   (`recordDraftPack` 의 `EVALUATION_SYNTHESIZE_REF`). 이 문장을 바꾸면 그 줄과 어긋나지 않는지 볼 것.
 */

/** 초안을 쓸 때 무슨 일이 일어나는지 — 긴 안내의 뒷문장. */
export const EVALUATION_SYNTH_NOTE =
  '초안을 쓸 때 AI 가 이 학생의 관찰 기록·과제물 등 함께 보내는 근거 전체를 종합해 평가 문장을 씁니다.';

/** 넓은 자리(장면 상세·AI 제안)용. */
export const EVALUATION_EMPTY_LONG = `평가 자리는 비워 두어도 됩니다. ${EVALUATION_SYNTH_NOTE}`;

/** 좁은 자리(지도의 평가 열)용. 열 폭 224px 에 세 줄 안으로 들어간다. */
export const EVALUATION_EMPTY_SHORT =
  '비워 두어도 됩니다. 초안을 쓸 때 AI 가 근거 전체를 종합해 평가를 씁니다.';
