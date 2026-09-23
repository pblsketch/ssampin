/**
 * 돌아보기 숫자 줄의 **상담 예약 수**를 서버에서 가져온다(돌아보기 spec 2-3).
 *
 * - 상담 예약은 이 컴퓨터가 아니라 서버에만 있다. 정리 창을 열 때만 부른다 — 먼저 거는 말의 '알릴지' 판단에는
 *   쓰지 않는다(서버 부르는 횟수를 늘리지 않는다).
 * - 기간 안의 날짜가 있는 일정만 묻고, 동시에 부르는 수를 제한한다.
 * - **일정 하나라도 실패하면 null**(상담 항목을 뺀다). 인터넷·서버·선생님 확인 실패 모두 조용히 null.
 * - 무거운 모듈(상담 저장소·서버 연결)은 부를 때 가져온다 — 이 파일을 가져오는 화면·시험을 가볍게 둔다.
 * - 창 하나가 열려 있는 동안 같은 일정은 **한 번만** 묻는다(`ConsultationFetchCache`) — 학기 돌아보기와 접힌
 *   '이번 주'가 같은 일정을 따로 묻지 않게. 실패한 답도 그 동안은 다시 묻지 않는다.
 */
import {
  combineConsultationCount,
  schedulesInRange,
  type ConsultationDetailLike,
  type DateRange,
} from '@domain/rules/recapWorkCounts';

/** 동시에 묻는 일정 수(조정 가능). */
const CONCURRENCY = 3;

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** 창 하나가 열려 있는 동안 일정별 답을 모아 둔다(일정 id → 답, 실패는 null). */
export interface ConsultationFetchCache {
  readonly details: Map<string, Promise<ConsultationDetailLike | null>>;
}

export function createConsultationFetchCache(): ConsultationFetchCache {
  return { details: new Map() };
}

export async function fetchConsultationCount(
  range: DateRange,
  cache: ConsultationFetchCache = createConsultationFetchCache(),
): Promise<number | null> {
  try {
    const { useConsultationStore } = await import('@adapters/stores/useConsultationStore');
    if (!useConsultationStore.getState().loaded) await useConsultationStore.getState().load();
    const targets = schedulesInRange(useConsultationStore.getState().schedules, range);
    if (targets.length === 0) return 0;
    const { consultationSupabaseClient } = await import('@adapters/di/container');
    const details = await mapLimit(targets, CONCURRENCY, (s) => {
      const known = cache.details.get(s.id);
      if (known !== undefined) return known;
      const asked = consultationSupabaseClient.getDetail(s.id, s.adminKey).then(
        (d): ConsultationDetailLike => ({ slots: d.slots, bookings: d.bookings }),
        () => null,
      );
      cache.details.set(s.id, asked);
      return asked;
    });
    return combineConsultationCount(details, range);
  } catch {
    return null;
  }
}
