/**
 * 돌아보기 숫자 줄의 **상담 예약 수**를 서버에서 가져온다(돌아보기 spec 2-3).
 *
 * - 상담 예약은 이 컴퓨터가 아니라 서버에만 있다. 정리 창을 열 때만 부른다 — 먼저 거는 말의 '알릴지' 판단에는
 *   쓰지 않는다(서버 부르는 횟수를 늘리지 않는다).
 * - 기간 안의 날짜가 있는 일정만 묻고, 동시에 부르는 수를 **창 하나 기준으로** 제한한다(학기·접힌 '이번 주'를 합쳐서).
 * - **일정 하나라도 잠깐 실패하면 null**(상담 항목을 뺀다). 인터넷·서버·구글 연결 끊김 모두 조용히 null.
 * - 서버가 **영영** 열어 주지 않는 일정(다른 구글 계정의 일정·예전 방식 기간이 끝난 옛 일정·맞지 않는 관리 키)은
 *   그 일정만 빼고 센다 — 선생님도 더는 볼 수 없는 일정이라서다(ADR-138, 오너 결정 2026-09-23).
 * - 무거운 모듈(상담 저장소·서버 연결)은 부를 때 가져온다 — 이 파일을 가져오는 화면·시험을 가볍게 둔다.
 * - 창 하나가 열려 있는 동안 같은 일정은 **한 번만** 묻는다(`ConsultationFetchCache`) — 학기 돌아보기와 접힌
 *   '이번 주'가 같은 일정을 따로 묻지 않게. 실패한 답도 그 동안은 다시 묻지 않는다.
 */
import {
  CONSULTATION_UNREADABLE,
  combineConsultationCount,
  schedulesInRange,
  type ConsultationDetailResult,
  type DateRange,
} from '@domain/rules/recapWorkCounts';
import { accessDenialReasonOf, isLastingDenial } from '@domain/rules/consultationAccessReason';

/** 창 하나에서 동시에 묻는 일정 수(조정 가능). */
export const CONSULTATION_CONCURRENCY = 3;

/** 한 번에 `limit` 개까지만 돌리는 줄 세우기. */
function createLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: (() => void)[] = [];
  const pump = (): void => {
    while (active < limit && queue.length > 0) {
      const start = queue.shift();
      if (start === undefined) return;
      active += 1;
      start();
    }
  };
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1;
            pump();
          });
      });
      pump();
    });
}

/**
 * 창 하나가 열려 있는 동안의 상담 묻기 — 일정별 답(일정 id → 답, 잠깐 실패는 null, 영영 열 수 없음은
 * `CONSULTATION_UNREADABLE`)과 동시에 묻는 수 제한을 창 안의 모든 숫자 줄이 함께 쓴다.
 */
export interface ConsultationFetchCache {
  readonly details: Map<string, Promise<ConsultationDetailResult>>;
  readonly run: <T>(task: () => Promise<T>) => Promise<T>;
}

export function createConsultationFetchCache(): ConsultationFetchCache {
  return { details: new Map(), run: createLimiter(CONSULTATION_CONCURRENCY) };
}

/** 무거운 모듈을 한 번만 가져온다 — 두 숫자 줄이 동시에 불러도 가져오기는 하나. 실패하면 다음에 다시. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => {
    if (pending === null) {
      pending = load().catch((e: unknown) => {
        pending = null;
        throw e;
      });
    }
    return pending;
  };
}

const loadConsultationStore = once(() => import('@adapters/stores/useConsultationStore'));
const loadContainer = once(() => import('@adapters/di/container'));

export async function fetchConsultationCount(
  range: DateRange,
  cache: ConsultationFetchCache = createConsultationFetchCache(),
): Promise<number | null> {
  try {
    const { useConsultationStore } = await loadConsultationStore();
    if (!useConsultationStore.getState().loaded) await useConsultationStore.getState().load();
    const targets = schedulesInRange(useConsultationStore.getState().schedules, range);
    if (targets.length === 0) return 0;
    const { consultationSupabaseClient } = await loadContainer();
    const details = await Promise.all(
      targets.map((s) => {
        const known = cache.details.get(s.id);
        if (known !== undefined) return known;
        const asked = cache
          .run(() => consultationSupabaseClient.getDetail(s.id, s.adminKey))
          .then(
            (d): ConsultationDetailResult => ({ slots: d.slots, bookings: d.bookings }),
            (e: unknown): ConsultationDetailResult => {
              const reason = accessDenialReasonOf(e);
              return reason !== null && isLastingDenial(reason) ? CONSULTATION_UNREADABLE : null;
            },
          );
        cache.details.set(s.id, asked);
        return asked;
      }),
    );
    return combineConsultationCount(details, range);
  } catch {
    return null;
  }
}
