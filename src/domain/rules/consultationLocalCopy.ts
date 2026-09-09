/**
 * 상담 명단 로컬 사본 규칙 (ADR-095 · 계획서 §6 S4-b, 오너 결정 3)
 *
 * 왜 두는가: 소유자가 없는 옛 일정은 유예 기한이 지나면 서버가 더 이상 열어 주지 않는다.
 * 그때 선생님이 지난 상담을 아예 못 보게 되는 것을 막으려고, **기한 안에 상세를 열어
 * 본 일정만** 기기에 사본으로 남긴다.
 *
 * 원칙 1(소유권은 서버가 검증한 신원으로만 생긴다)의 예외로 명시된 자리다 — 이미 받아
 * 둔 것을 다시 보는 것이지, 새로 권한을 얻는 것이 아니다.
 *
 * ★ 켜자마자 전부 받아 두지 않는다. 그러면 앱을 켤 때마다 활성 일정 수만큼 구글 확인
 *   호출이 몰린다. **상세를 열 때만** 저장하고, 같은 날 이미 저장했으면 다시 쓰지 않는다.
 */

/** 사본 한 벌 — 화면이 다시 그릴 수 있는 최소 단위 */
export interface ConsultationLocalCopy<TSlot, TBooking> {
  readonly scheduleId: string;
  /** 저장 시각(ISO). 화면이 "○월 ○일에 받아 둔 명단입니다"로 알린다. */
  readonly savedAt: string;
  readonly slots: readonly TSlot[];
  readonly bookings: readonly TBooking[];
}

/** 하루에 한 번만 다시 쓴다 — 상세를 여러 번 열어도 쓰기가 몰리지 않는다. */
export const LOCAL_COPY_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * 지금 사본을 새로 써야 하는가.
 *
 * @param savedAt 기존 사본의 저장 시각(ISO). 없으면 사본이 없는 것이다.
 * @param now 판정 기준 시각 — **인자로 받는다**(테스트에서 시계를 돌릴 수 있어야 한다).
 */
export function shouldRefreshLocalCopy(savedAt: string | undefined, now: Date): boolean {
  if (!savedAt) return true;
  const prev = Date.parse(savedAt);
  if (Number.isNaN(prev)) return true;
  const age = now.getTime() - prev;
  // 시계가 거꾸로 갔으면(기기 시간 조정) 다시 쓴다 — 영원히 안 쓰는 상태를 막는다.
  if (age < 0) return true;
  return age >= LOCAL_COPY_MIN_INTERVAL_MS;
}

/**
 * 사본을 화면에 내보여도 되는가.
 *
 * 서버가 **기한 만료(`legacy_closed`)** 로 거부했을 때만 쓴다. 구글 미연결이나 다른
 * 계정으로 거부된 경우에 사본을 보여 주면, 지금 이 기기 앞에 있는 사람이 그 일정을 볼
 * 자격이 있는지 확인하지 못한 채 예약자 정보를 펴 보이게 된다.
 */
export function canShowLocalCopy(denialReason: string | null): boolean {
  return denialReason === 'legacy_closed';
}
