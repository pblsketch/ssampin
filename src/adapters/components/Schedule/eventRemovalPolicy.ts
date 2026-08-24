import type { SchoolEvent } from '@domain/entities/SchoolEvent';

/**
 * "일정 삭제" 버튼이 실제로 무엇을 해야 하는지 정하는 순수 규칙.
 *
 * NEIS 학사일정은 지워도 다음 동기화에 되살아나므로 지우지 않고 **숨긴다**. 이때 반드시
 * `hideManyEvents` 경로여야 한다 — `updateEvent` 로 isHidden 만 바꾸면 구글 푸시가 함께
 * 돌아서, 아직 구글에 올라간 적 없는 NEIS 일정이면 **구글 캘린더에 사본이 새로 생긴다**.
 * `hideManyEvents` 는 구글에 알리지 않는다고 명시돼 있다(useEventsStore 참조).
 *
 * 실기기 없이 이 라우팅을 잠그려고 화면(Schedule.tsx)에서 분리해 테스트를 붙였다.
 */
export type EventRemovalPlan =
  /** NEIS: 구글에 알리지 않는 숨김 경로(hideManyEvents)로 보낸다 */
  | { readonly kind: 'hide'; readonly reason: 'manual' }
  /** 그 외: 진짜 삭제 */
  | { readonly kind: 'delete' };

export function planEventRemoval(event: Pick<SchoolEvent, 'source'> | undefined): EventRemovalPlan {
  if (event?.source === 'neis') {
    return { kind: 'hide', reason: 'manual' };
  }
  return { kind: 'delete' };
}
