/**
 * 관찰 기록 응원 문구(ADR-135). 건수·비교·꾸중을 넣지 않는다(ADR-134).
 * 문구는 조정 가능하다. 뜻(응원·숫자 없음)은 고정이다.
 */
import { weekStartOf } from '@domain/rules/schoolCalendarDays';

/** 오늘 이 컴퓨터에서 처음 관찰 기록을 저장했을 때 — 핀이 손을 흔든다. */
export const FIRST_RECORD_MESSAGES: readonly string[] = [
  '오늘 첫 기록을 남겼어요',
  '좋은 시작이에요',
  '오늘도 기록으로 하루를 열었네요',
  '오늘의 관찰을 잘 붙잡아 두었어요',
  '기록을 시작했어요. 오늘도 힘내요',
  '오늘 한 장면이 남았어요',
];

/** 반 하나가 한 바퀴를 마쳤을 때 — 핀이 만세를 한다. `{반}` 자리에 카드 이름이 들어간다. */
export const LAP_MESSAGES: readonly string[] = [
  '{반}, 한 바퀴를 돌았어요!',
  '{반} 한 바퀴 완주! 고생 많으셨어요',
  '{반} 모두를 한 번씩 만났네요',
  '{반} 한 바퀴를 마쳤어요. 멋져요',
];

export const ZERO_RECORD_LINE = '첫 기록을 남겨 볼까요?';

export function streakLine(weeks: number): string {
  return `${weeks}주째 꾸준히`;
}

export function termWeeksLine(weeks: number): string {
  return `이번 학기 기록한 주 ${weeks}주`;
}

export function pickMessage(pool: readonly string[], seed: number): string {
  const idx = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
  return pool[idx] ?? pool[0] ?? '';
}

// ── 2·3차(ADR-137) ──

/** 쉬는 날 핀 줄 */
export const RESTING_LINE = '오늘은 쉬어요';

/**
 * 먼저 거는 말 — 핀 줄·토스트 문구. 모르는 종류는 null(그 말은 다른 작업이 문구를 단다).
 * 지난주 정리를 다음 등교일에 알릴 때는 "지난주"라고 말한다.
 */
export function talkNoticeText(
  talk: { readonly kind: string; readonly key: string },
  today: string,
): string | null {
  if (talk.kind === 'weekly') {
    return talk.key < weekStartOf(today) ? '지난주 정리가 왔어요' : '이번 주 정리가 왔어요';
  }
  if (talk.kind === 'retrospect') return '이번 학기 돌아보기가 왔어요';
  return null;
}
