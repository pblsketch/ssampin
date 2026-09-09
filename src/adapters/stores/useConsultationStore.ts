import { create } from 'zustand';
import type {
  ConsultationSchedule,
  ConsultationsData,
  ScheduleUpdateImpact,
  ScheduleUpdatePatch,
} from '@domain/entities/Consultation';
import {
  analyzeScheduleUpdateImpact,
  buildBusyPeriods,
  computeDefaultConsultationExpiry,
  isSlotBlockedByTimetable,
  makePeriodResolver,
} from '@domain/rules/consultationRules';
import {
  computeBreakPresets,
  findClassTimeOpenSlots,
} from '@domain/rules/consultationTimetableRules';
import {
  consultationRepository,
  consultationSupabaseClient,
  shortLinkClient,
  consultationLocalCopyStore,
} from '@adapters/di/container';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { generateUUID } from '@infrastructure/utils/uuid';
import { SITE_URL } from '@config/siteUrl';

export type UpdateScheduleResult =
  | { readonly ok: true; readonly impact: ScheduleUpdateImpact }
  | { readonly ok: false; readonly reason: string };

export type RescheduleBookingResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type CancelBookingResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export type SetSlotBlockedResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface RecomputeResult {
  readonly blockedAdded: number;
  readonly availableRestored: number;
  readonly conflictedBookingIds: readonly string[];
}

/** 정규 수업 시간과 겹치는 슬롯. 앱이 자동으로 막지 않고 교사에게 알리기만 한다. */
export interface ClassTimeConflicts {
  /** 예약이 없고 열려 있는데 수업과 겹침 — 교사가 막을 수 있다 */
  readonly openSlotIds: readonly string[];
  /** 이미 예약이 들어왔는데 수업과 겹침 — 막을 수 없고 알리기만 한다 */
  readonly bookedSlotIds: readonly string[];
}

const SHARE_BASE_URL = `${SITE_URL}/booking`;

interface ConsultationState {
  schedules: readonly ConsultationSchedule[];
  loaded: boolean;

  load: () => Promise<void>;
  /**
   * 새 상담 일정 — **서버가 먼저다.**
   *
   * 서버가 구글 계정을 확인해 소유자를 박고 관리 키·소금값을 발급한다(ADR-095).
   * 그래서 서버가 성공한 뒤에야 공유 링크를 조립하고 로컬에 저장한다. 순서를 되돌리면
   * 서버가 거부했을 때 **열리지 않는 반쪽 일정**이 기기에 남는다.
   */
  createSchedule: (
    params: Omit<
      ConsultationSchedule,
      | 'id'
      | 'createdAt'
      | 'shareUrl'
      | 'shortUrl'
      | 'adminKey'
      | 'isArchived'
      | 'cryptoVersion'
      | 'cryptoSalt'
    > & {
      customLinkCode?: string;
      blockedSlots?: ReadonlyArray<{ date: string; startTime: string }>;
    },
  ) => Promise<ConsultationSchedule>;
  deleteSchedule: (id: string) => Promise<void>;
  archiveSchedule: (id: string) => Promise<void>;

  /** 수동 예약 마감 — 학부모 예약만 중단한다(명단·내보내기는 계속 사용). */
  closeSchedule: (id: string) => Promise<CancelBookingResult>;
  /** 마감 해제 — 다시 예약을 받는다. */
  reopenSchedule: (id: string) => Promise<CancelBookingResult>;
  /** 자동 만료 시각 변경(ISO) 또는 해제(null). */
  setScheduleExpiry: (id: string, iso: string | null) => Promise<CancelBookingResult>;

  /**
   * 일정 부분 갱신 (2-step commit).
   *
   * - 영향 받는 예약이 있고 `options.onAffectedBookings` 가 비어 있으면
   *   **DB 변경 없이** impact 만 반환. 호출자(UI) 가 사용자에게 확인 후 옵션을 채워 재호출한다.
   * - `'cancel'` 이면 영향 예약을 자동 cancelBooking 후 schedule PATCH + 슬롯 재생성을 진행한다.
   * - `'abort'` 이면 영향 예약이 있을 때 작업을 중단한다.
   */
  updateSchedule: (
    id: string,
    patch: ScheduleUpdatePatch,
    options?: { onAffectedBookings?: 'cancel' | 'abort' },
  ) => Promise<UpdateScheduleResult>;

  rescheduleBooking: (
    scheduleId: string,
    bookingId: string,
    newSlotId: string,
  ) => Promise<RescheduleBookingResult>;

  cancelBooking: (scheduleId: string, bookingId: string) => Promise<CancelBookingResult>;

  /**
   * 교사가 슬롯을 직접 막거나 푼다 (상담 상세 화면의 차단/해제 버튼).
   *
   * 여기서 건 차단은 `blockedBy: 'teacher'` 로 남아 자동 재계산이 손대지 않는다.
   * 예약이 있는 슬롯은 호출자가 먼저 걸러야 한다.
   */
  setSlotBlocked: (
    scheduleId: string,
    slotId: string,
    blocked: boolean,
  ) => Promise<SetSlotBlockedResult>;

  /**
   * 일정표/시간표 변경을 반영해 슬롯 가용성을 재계산한다 (Phase 2).
   *
   * 정책:
   * - 예약이 있는 슬롯은 status 자동 변경하지 않는다 — 충돌만 식별해 반환
   * - 예약 없는 슬롯은: busy 와 겹치면 blocked, 안 겹치면 available 로 PATCH (멱등)
   * - archived schedule 은 건너뛴다
   */
  recomputeSlotAvailability: (scheduleId: string) => Promise<RecomputeResult>;

  /**
   * 이미 만들어진 슬롯 중 "그 날 수업 중인데 아직 열려 있는" 것을 찾는다. **쓰기 없음.**
   *
   * `recomputeSlotAvailability` 는 학교 행사·시간표 임시 변경만 보고 자동으로 막는다.
   * 정규 시간표는 여기서 따로 본다 — 그리고 **자동으로 막지 않는다.** 수업 시간에 슬롯이
   * 열려 있는 것이 실수인지 의도인지(상담 주간 수업 단축·보결 확보 등) 앱은 모르기 때문이다.
   * 막을지는 화면에서 교사가 정한다(ADR-060 의 교훈을 반대 방향으로 되풀이하지 않는다).
   */
  findClassTimeConflicts: (scheduleId: string) => Promise<ClassTimeConflicts>;

  /**
   * 교사가 확인한 뒤 여러 슬롯을 한 번에 막는다. `blockedBy: 'teacher'` 로 남아
   * 자동 재계산이 다시 풀지 않는다. 일부 실패해도 나머지는 계속 진행한다.
   */
  blockSlotsByTeacher: (
    scheduleId: string,
    slotIds: readonly string[],
  ) => Promise<{ blocked: number; failed: number }>;

  /**
   * 일정표(useScheduleStore) 와 일정(useEventsStore) 변경을 구독해
   * 활성 상담 일정 전체의 슬롯 가용성을 자동 재계산한다.
   *
   * App.tsx mount 에서 1회 호출. 반환된 unsubscribe 함수로 해제 가능.
   * debounce 1s + in-flight 가드 + idempotent.
   */
  registerScheduleSyncListener: () => () => void;

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
   *
   * 상담 일정의 targetStudents는 `{ number: number }`만 보유하고 학생 이름은
   * 저장하지 않는다. 따라서 "이름 보수 매칭" 정책을 적용할 수 없어,
   * 본 store는 **항상 0을 반환**하는 가장 보수적 양성 거부를 채택한다.
   *
   * names 파라미터는 시그니처 통일을 위해 받지만 사용하지 않는다.
   * (가드 D는 다른 store의 ref 합과 가드 E/F/G가 함께 보호하므로 안전.)
   */
  hasStudentReferencesByName: (names: readonly string[]) => number;
}

export const useConsultationStore = create<ConsultationState>((set, get) => ({
  schedules: [],
  loaded: false,

  load: async () => {
    const data = await consultationRepository.load();
    if (data) {
      set({ schedules: data.schedules, loaded: true });
    } else {
      set({ loaded: true });
    }
  },

  createSchedule: async (params) => {
    const { customLinkCode, blockedSlots, ...scheduleParams } = params;
    const id = generateUUID();
    const createdAt = new Date().toISOString();

    // 예약 자동 만료: 마지막 상담일 다음날 00:00(KST). 이 시각이 지나면 예약 링크가 마감된다.
    const autoExpiresAt = computeDefaultConsultationExpiry(scheduleParams.dates);

    // ── 1) 서버가 먼저다 ────────────────────────────────────────────────
    // 실패하면 여기서 예외가 올라가고, 아래의 로컬 저장·링크 조립은 아예 하지 않는다.
    const issued = await consultationSupabaseClient.createSchedule({
      id,
      title: scheduleParams.title,
      type: scheduleParams.type,
      methods: scheduleParams.methods,
      slotMinutes: scheduleParams.slotMinutes,
      dates: scheduleParams.dates,
      targetClassName: scheduleParams.targetClassName,
      targetStudents: scheduleParams.targetStudents,
      ...(scheduleParams.message !== undefined ? { message: scheduleParams.message } : {}),
      ...(autoExpiresAt ? { expiresAt: autoExpiresAt } : {}),
      ...(blockedSlots ? { blockedSlots } : {}),
    });

    const adminKey = issued.adminKey;
    const shareUrl = `${SHARE_BASE_URL}/${id}#key=${encodeURIComponent(adminKey)}`;

    // 숏링크 만료: 마지막 상담일 + 30일 (예약 마감 후에도 학부모가 "마감" 안내
    // 화면을 볼 수 있도록 숏링크 자체는 여유 있게 유지)
    const lastDate =
      scheduleParams.dates.length > 0
        ? [...scheduleParams.dates].sort((a, b) => b.date.localeCompare(a.date))[0]!.date
        : createdAt.slice(0, 10);
    const shortLinkExpiresAt = new Date(
      new Date(lastDate).getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // ── 2) 여기부터는 서버가 성공한 뒤의 뒷정리다 ───────────────────────
    const expiresAt = autoExpiresAt;

    // 숏링크 생성 (실패해도 무시)
    let shortUrl: string | undefined;
    try {
      const result = await shortLinkClient.createShortLink(
        shareUrl,
        customLinkCode,
        shortLinkExpiresAt,
      );
      if (result !== shareUrl) shortUrl = result;
    } catch {
      // 숏링크 생성 실패는 무시
    }

    const schedule: ConsultationSchedule = {
      ...scheduleParams,
      id,
      adminKey,
      shareUrl,
      shortUrl,
      createdAt,
      isArchived: false,
      cryptoVersion: issued.cryptoVersion,
      cryptoSalt: issued.cryptoSalt,
      ...(expiresAt ? { expiresAt } : {}),
    };

    const { schedules } = get();
    const next: ConsultationsData = {
      schedules: [schedule, ...schedules],
    };
    await consultationRepository.save(next);
    set({ schedules: next.schedules });
    return schedule;
  },

  deleteSchedule: async (id) => {
    const { schedules } = get();
    const next: ConsultationsData = {
      schedules: schedules.filter((s) => s.id !== id),
    };
    await consultationRepository.save(next);
    set({ schedules: next.schedules });
    // 사본도 함께 지운다. 안 지우면 선생님이 상담을 지워도 예약자 정보(암호문)가
    // 기기에 남는다 — 아무도 다시 열어 볼 수 없는 개인정보가 되는 것이다(ADR-095 후속).
    try {
      await consultationLocalCopyStore.remove(id);
    } catch {
      // 사본 삭제 실패로 일정 삭제를 되돌리지는 않는다. 다음 삭제 때 다시 시도된다.
    }
  },

  archiveSchedule: async (id) => {
    const { schedules } = get();
    const next: ConsultationsData = {
      schedules: schedules.map((s) => (s.id === id ? { ...s, isArchived: true } : s)),
    };
    await consultationRepository.save(next);
    set({ schedules: next.schedules });
    // 서버에도 보관(is_archived)을 반영한다. 이 호출이 빠져 있어서 "보관"해도
    // 학부모 예약 링크가 닫히지 않던 버그를 여기서 함께 고친다.
    try {
      const key = schedules.find((s) => s.id === id)?.adminKey;
      if (key) await consultationSupabaseClient.setArchived(id, key, true);
    } catch {
      // 서버 반영 실패는 무시(로컬은 이미 반영). 온라인 복구 후 재보관/편집으로 정정 가능.
    }
  },

  closeSchedule: async (id) => {
    const closeKey = get().schedules.find((s) => s.id === id)?.adminKey;
    if (!closeKey) return { ok: false, reason: '상담 일정을 찾을 수 없습니다' };
    try {
      await consultationSupabaseClient.setClosed(id, closeKey, true);
    } catch (e) {
      return { ok: false, reason: `예약 마감에 실패했습니다: ${String(e)}` };
    }
    const closedAt = new Date().toISOString();
    const nextSchedules = get().schedules.map((s) => (s.id === id ? { ...s, closedAt } : s));
    set({ schedules: nextSchedules });
    try {
      await consultationRepository.save({ schedules: nextSchedules });
    } catch {
      // 로컬 미러 저장 실패는 무시 (Supabase 가 단일 진실 원천)
    }
    return { ok: true };
  },

  reopenSchedule: async (id) => {
    const reopenKey = get().schedules.find((s) => s.id === id)?.adminKey;
    if (!reopenKey) return { ok: false, reason: '상담 일정을 찾을 수 없습니다' };
    try {
      await consultationSupabaseClient.setClosed(id, reopenKey, false);
    } catch (e) {
      return { ok: false, reason: `예약 다시 열기에 실패했습니다: ${String(e)}` };
    }
    const nextSchedules: ConsultationSchedule[] = get().schedules.map((s) => {
      if (s.id !== id) return s;
      const { closedAt: _closedAt, ...rest } = s;
      return rest;
    });
    set({ schedules: nextSchedules });
    try {
      await consultationRepository.save({ schedules: nextSchedules });
    } catch {
      // 무시
    }
    return { ok: true };
  },

  setScheduleExpiry: async (id, iso) => {
    const expiryKey = get().schedules.find((s) => s.id === id)?.adminKey;
    if (!expiryKey) return { ok: false, reason: '상담 일정을 찾을 수 없습니다' };
    try {
      await consultationSupabaseClient.setExpiresAt(id, expiryKey, iso);
    } catch (e) {
      return { ok: false, reason: `만료일 변경에 실패했습니다: ${String(e)}` };
    }
    const nextSchedules: ConsultationSchedule[] = get().schedules.map((s) => {
      if (s.id !== id) return s;
      if (iso === null) {
        const { expiresAt: _expiresAt, ...rest } = s;
        return rest;
      }
      return { ...s, expiresAt: iso };
    });
    set({ schedules: nextSchedules });
    try {
      await consultationRepository.save({ schedules: nextSchedules });
    } catch {
      // 무시
    }
    return { ok: true };
  },

  updateSchedule: async (id, patch, options = {}) => {
    const current = get().schedules.find((s) => s.id === id);
    if (!current) return { ok: false, reason: 'NOT_FOUND' };

    // 1) 영향 분석 — 최신 슬롯/예약을 Supabase 에서 조회
    // 시간대와 예약을 한 번에 받는다 — 따로 부르면 구글 계정 확인도 두 번 일어난다.
    let slots: Awaited<ReturnType<typeof consultationSupabaseClient.getSlots>>;
    let bookingsPublic: Awaited<ReturnType<typeof consultationSupabaseClient.getBookings>>;
    try {
      const detail = await consultationSupabaseClient.getDetail(id, current.adminKey);
      slots = detail.slots;
      bookingsPublic = detail.bookings;
    } catch (e) {
      return { ok: false, reason: `현재 예약 정보를 불러오지 못했습니다: ${String(e)}` };
    }

    const impact = analyzeScheduleUpdateImpact(current, patch, slots, bookingsPublic);

    // 2) 영향 있고 옵션 미지정 → caller 결정 위임
    if (impact.affected.length > 0 && !options.onAffectedBookings) {
      return { ok: true, impact };
    }

    if (options.onAffectedBookings === 'abort' && impact.affected.length > 0) {
      return { ok: false, reason: 'ABORTED_BY_USER' };
    }

    // 3) 영향 예약 일괄 취소
    if (options.onAffectedBookings === 'cancel' && impact.affected.length > 0) {
      for (const a of impact.affected) {
        try {
          await consultationSupabaseClient.cancelBooking(a.booking.id, id, current.adminKey);
        } catch (e) {
          return {
            ok: false,
            reason: `영향 예약 취소 실패 (${a.booking.id}): ${String(e)}`,
          };
        }
      }
    }

    // 4) schedule 메타 PATCH
    const metaPatch: Parameters<typeof consultationSupabaseClient.updateSchedule>[2] = {};
    if (patch.title !== undefined) metaPatch.title = patch.title;
    if (patch.type !== undefined) metaPatch.type = patch.type;
    if (patch.methods !== undefined) metaPatch.methods = patch.methods;
    if (patch.slotMinutes !== undefined) metaPatch.slotMinutes = patch.slotMinutes;
    if (patch.dates !== undefined) metaPatch.dates = patch.dates;
    if (patch.message !== undefined) metaPatch.message = patch.message;

    try {
      await consultationSupabaseClient.updateSchedule(id, current.adminKey, metaPatch);
    } catch (e) {
      return { ok: false, reason: `일정 메타 갱신 실패: ${String(e)}` };
    }

    // 5) 슬롯 재생성 (dates 또는 slotMinutes 변경 시 또는 blockedSlots 명시 시)
    const slotShapeChanged =
      patch.dates !== undefined ||
      patch.slotMinutes !== undefined ||
      patch.blockedSlots !== undefined;
    if (slotShapeChanged) {
      try {
        await consultationSupabaseClient.replaceSlots(id, current.adminKey, {
          dates: patch.dates ?? current.dates,
          slotMinutes: patch.slotMinutes ?? current.slotMinutes,
          blockedSlots: patch.blockedSlots,
        });
      } catch (e) {
        return {
          ok: false,
          reason: `슬롯 재생성 실패 (메타는 갱신됨, 수동 복구 필요): ${String(e)}`,
        };
      }
    }

    // 6) 로컬 store 갱신 + JSON 미러 동기화
    const updated: ConsultationSchedule = {
      ...current,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.methods !== undefined ? { methods: patch.methods } : {}),
      ...(patch.slotMinutes !== undefined ? { slotMinutes: patch.slotMinutes } : {}),
      ...(patch.dates !== undefined ? { dates: patch.dates } : {}),
      ...(patch.message !== undefined ? { message: patch.message } : {}),
    };
    const nextSchedules = get().schedules.map((s) => (s.id === id ? updated : s));
    set({ schedules: nextSchedules });
    try {
      await consultationRepository.save({ schedules: nextSchedules });
    } catch {
      // 로컬 미러 저장 실패는 무시 (Supabase 가 단일 진실 원천)
    }

    return { ok: true, impact };
  },

  rescheduleBooking: async (scheduleId, bookingId, newSlotId) => {
    const key = get().schedules.find((s) => s.id === scheduleId)?.adminKey;
    if (!key) return { ok: false, reason: '예약 시간 변경 실패: 상담 일정을 찾을 수 없습니다' };
    try {
      const res = await consultationSupabaseClient.rescheduleBooking({
        scheduleId,
        bookingId,
        newSlotId,
        adminKey: key,
      });
      if (!res.success) return { ok: false, reason: res.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `예약 시간 변경 실패: ${String(e)}` };
    }
  },

  cancelBooking: async (scheduleId, bookingId) => {
    // adminKey 는 취소 RPC 의 인자다(마이그레이션 047). 일정을 못 찾으면 진행하지 않는다.
    const schedule = get().schedules.find((s) => s.id === scheduleId);
    if (!schedule) {
      return { ok: false, reason: '예약 취소 실패: 상담 일정을 찾을 수 없습니다' };
    }
    try {
      await consultationSupabaseClient.cancelBooking(bookingId, scheduleId, schedule.adminKey);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `예약 취소 실패: ${String(e)}` };
    }
  },

  setSlotBlocked: async (scheduleId, slotId, blocked) => {
    const key = get().schedules.find((s) => s.id === scheduleId)?.adminKey;
    if (!key) {
      return { ok: false, reason: '상담 일정을 찾을 수 없습니다' };
    }
    try {
      await consultationSupabaseClient.setSlotBlockedByTeacher(scheduleId, key, slotId, blocked);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        reason: blocked
          ? `슬롯을 막지 못했습니다: ${String(e)}`
          : `차단을 풀지 못했습니다: ${String(e)}`,
      };
    }
  },

  findClassTimeConflicts: async (scheduleId) => {
    const empty = { openSlotIds: [], bookedSlotIds: [] };
    const schedule = get().schedules.find((s) => s.id === scheduleId);
    if (!schedule || schedule.isArchived) return empty;

    const settings = useSettingsStore.getState().settings;
    const presets = computeBreakPresets(
      settings.periodTimes,
      settings.lunchStart,
      settings.lunchEnd,
    );
    if (presets.length === 0) return empty; // 교시 시간 미등록 — 판단 근거가 없다

    // 한 번에 받는다(구글 확인 호출 절반). 실패는 삼키지 않고 올린다 — 빈 결과로
    // 돌려주면 화면이 "겹치는 시간 없음"으로 읽어, 막아야 할 시간을 열어 둔 채
    // 안내가 사라진다. 부르는 쪽(상세 화면)이 사유를 문장으로 말한다.
    const { slots, bookings } = await consultationSupabaseClient.getDetail(
      scheduleId,
      schedule.adminKey,
    );

    // 날짜별 공강 교시 — 각 날짜는 자기 요일 시간표를 본다
    const scheduleStore = useScheduleStore.getState();
    const freePeriodsByDate = new Map<string, Set<number> | null>();
    for (const date of new Set(slots.map((s) => s.date))) {
      const day = scheduleStore.getEffectiveTeacherSchedule(date, settings.enableWeekendDays);
      if (day.length === 0) {
        freePeriodsByDate.set(date, null); // 시간표 없는 날 — 막을 근거 없음
        continue;
      }
      const free = new Set<number>();
      day.forEach((p, i) => {
        if (p === null) free.add(i + 1);
      });
      freePeriodsByDate.set(date, free);
    }

    return findClassTimeOpenSlots({
      slots,
      presets,
      freePeriodsByDate,
      bookedSlotIds: new Set(bookings.map((b) => b.slotId)),
    });
  },

  blockSlotsByTeacher: async (scheduleId, slotIds) => {
    const key = get().schedules.find((s) => s.id === scheduleId)?.adminKey;
    if (!key) return { blocked: 0, failed: slotIds.length };
    let blocked = 0;
    for (const id of slotIds) {
      try {
        await consultationSupabaseClient.setSlotBlockedByTeacher(scheduleId, key, id, true);
        blocked += 1;
      } catch {
        // 하나 실패해도 나머지는 계속 — 부분 성공을 그대로 돌려준다
      }
    }
    return { blocked, failed: slotIds.length - blocked };
  },

  recomputeSlotAvailability: async (scheduleId) => {
    const schedule = get().schedules.find((s) => s.id === scheduleId);
    if (!schedule || schedule.isArchived) {
      return { blockedAdded: 0, availableRestored: 0, conflictedBookingIds: [] };
    }

    let slots: Awaited<ReturnType<typeof consultationSupabaseClient.getSlots>>;
    let bookings: Awaited<ReturnType<typeof consultationSupabaseClient.getBookings>>;
    try {
      const detail = await consultationSupabaseClient.getDetail(scheduleId, schedule.adminKey);
      slots = detail.slots;
      bookings = detail.bookings;
    } catch (e) {
      // ★ 명단을 못 받았으면 **아무것도 하지 않는다.**
      //
      //   예전에는 빈 결과를 돌려줬는데, 그러면 부르는 쪽이 "겹치는 일정이 없다"로 읽어
      //   자동 차단이 조용히 멈춘다. 막아 뒀어야 할 시간에 학부모 예약이 들어오면
      //   이중 예약이 된다(계획서 §8 시나리오 4). 실패는 실패로 올린다.
      throw e instanceof Error ? e : new Error('상담 명단을 불러오지 못했습니다');
    }

    // 입력 수집
    const scheduleStore = useScheduleStore.getState();
    const eventsStore = useEventsStore.getState();
    const settings = useSettingsStore.getState().settings;
    const resolvePeriodTime = makePeriodResolver(settings.periodTimes);

    const targetDates = schedule.dates.map((d) => d.date);
    const busyPeriods = buildBusyPeriods({
      events: eventsStore.events,
      overrides: scheduleStore.overrides,
      targetDates,
      resolvePeriodTime,
    });

    const bookedSlotIds = new Set(bookings.map((b) => b.slotId));
    const toBlock: string[] = [];
    const toRestore: string[] = [];
    const conflictedBookingIds: string[] = [];

    for (const slot of slots) {
      const collides = isSlotBlockedByTimetable(slot, busyPeriods);

      // 예약 있는 슬롯: 자동 변경 금지, 충돌만 식별
      if (bookedSlotIds.has(slot.id)) {
        if (collides) {
          const b = bookings.find((bk) => bk.slotId === slot.id);
          if (b) conflictedBookingIds.push(b.id);
        }
        continue;
      }

      // 교사가 직접 막은 슬롯: 자동 재계산이 절대 건드리지 않는다.
      //
      // 이 가드가 없던 시절에는 "겹치는 일정이 없다" 는 이유로 교사의 수동 차단을
      // available 로 되돌렸고, 막아 둔 시간에 학부모 예약이 들어올 수 있었다
      // (2026-08-20 사용자 신고 · ADR-060). 해제는 상세 화면의 해제 버튼으로만 한다.
      if (slot.blockedBy === 'teacher') continue;

      if (collides && slot.status === 'available') toBlock.push(slot.id);
      // 남은 blocked 는 전부 자동 차단이므로 겹침이 사라지면 되돌린다
      else if (!collides && slot.status === 'blocked') toRestore.push(slot.id);
    }

    // 배치 PATCH — 실패해도 다음 주기에 다시 시도, 사용자에게 무영향
    try {
      if (toBlock.length > 0) {
        await consultationSupabaseClient.bulkUpdateSlotStatus(
          scheduleId,
          schedule.adminKey,
          toBlock,
          'blocked',
        );
      }
      if (toRestore.length > 0) {
        await consultationSupabaseClient.bulkUpdateSlotStatus(
          scheduleId,
          schedule.adminKey,
          toRestore,
          'available',
        );
      }
    } catch {
      // 무시 — 다음 폴링이나 다음 구독 트리거에서 다시 시도
    }

    return {
      blockedAdded: toBlock.length,
      availableRestored: toRestore.length,
      conflictedBookingIds,
    };
  },

  registerScheduleSyncListener: () => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;

    // 거부된 뒤에는 잠시 쉰다.
    //
    // 시간표·행사가 바뀔 때마다 활성 일정 전체의 명단을 다시 부른다. 서버가 거부하는
    // 상태(구글 미연결·기한 만료)에서 그대로 두면 같은 거부를 몇 초마다 되받아 서버와
    // 구글 확인 호출만 축낸다. 한 번 실패하면 5분 쉬고, 성공하면 곧바로 푼다.
    const BACKOFF_MS = 5 * 60 * 1000;
    let blockedUntil = 0;

    const runAll = async () => {
      if (inFlight) return;
      if (Date.now() < blockedUntil) return;
      inFlight = true;
      try {
        const active = get().schedules.filter((s) => !s.isArchived);
        for (const s of active) {
          await get().recomputeSlotAvailability(s.id);
        }
        blockedUntil = 0;
      } catch {
        // 왜 거부됐는지는 상세 화면이 문장으로 말한다. 여기서는 재시도만 늦춘다.
        blockedUntil = Date.now() + BACKOFF_MS;
      } finally {
        inFlight = false;
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void runAll();
      }, 1000);
    };

    const unsubSchedule = useScheduleStore.subscribe(schedule);
    const unsubEvents = useEventsStore.subscribe(schedule);

    return () => {
      unsubSchedule();
      unsubEvents();
      if (timer) clearTimeout(timer);
    };
  },

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
   *
   * 상담 도메인은 학생 이름을 직접 보유하지 않으므로(targetStudents에 number만 있음)
   * 보수적 양성 거부 정책에 따라 항상 0을 반환한다. names 인자는 시그니처
   * 통일을 위해 받지만 무시한다 (eslint no-unused-vars 회피용 void 캐스트).
   */
  hasStudentReferencesByName: (names) => {
    void names;
    return 0;
  },
}));
