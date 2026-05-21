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
  isSlotBlockedByTimetable,
  makePeriodResolver,
} from '@domain/rules/consultationRules';
import {
  consultationRepository,
  consultationSupabaseClient,
  shortLinkClient,
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

export interface RecomputeResult {
  readonly blockedAdded: number;
  readonly availableRestored: number;
  readonly conflictedBookingIds: readonly string[];
}

const SHARE_BASE_URL = `${SITE_URL}/booking`;

interface ConsultationState {
  schedules: readonly ConsultationSchedule[];
  loaded: boolean;

  load: () => Promise<void>;
  createSchedule: (
    params: Omit<
      ConsultationSchedule,
      'id' | 'createdAt' | 'shareUrl' | 'shortUrl' | 'adminKey' | 'isArchived'
    > & { customLinkCode?: string },
  ) => Promise<ConsultationSchedule>;
  deleteSchedule: (id: string) => Promise<void>;
  archiveSchedule: (id: string) => Promise<void>;

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
   * 일정표/시간표 변경을 반영해 슬롯 가용성을 재계산한다 (Phase 2).
   *
   * 정책:
   * - 예약이 있는 슬롯은 status 자동 변경하지 않는다 — 충돌만 식별해 반환
   * - 예약 없는 슬롯은: busy 와 겹치면 blocked, 안 겹치면 available 로 PATCH (멱등)
   * - archived schedule 은 건너뛴다
   */
  recomputeSlotAvailability: (scheduleId: string) => Promise<RecomputeResult>;

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
    const { customLinkCode, ...scheduleParams } = params;
    const id = generateUUID();
    const adminKey = generateUUID().slice(0, 8);
    const shareUrl = `${SHARE_BASE_URL}/${id}#key=${encodeURIComponent(adminKey)}`;
    const createdAt = new Date().toISOString();

    // 상담 날짜 중 가장 마지막 날짜 + 30일을 만료일로 설정
    const lastDate =
      scheduleParams.dates.length > 0
        ? [...scheduleParams.dates].sort((a, b) => b.date.localeCompare(a.date))[0]!.date
        : createdAt.slice(0, 10);
    const expiresAt = new Date(
      new Date(lastDate).getTime() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 숏링크 생성 (실패해도 무시)
    let shortUrl: string | undefined;
    try {
      const result = await shortLinkClient.createShortLink(shareUrl, customLinkCode, expiresAt);
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
  },

  archiveSchedule: async (id) => {
    const { schedules } = get();
    const next: ConsultationsData = {
      schedules: schedules.map((s) => (s.id === id ? { ...s, isArchived: true } : s)),
    };
    await consultationRepository.save(next);
    set({ schedules: next.schedules });
  },

  updateSchedule: async (id, patch, options = {}) => {
    const current = get().schedules.find((s) => s.id === id);
    if (!current) return { ok: false, reason: 'NOT_FOUND' };

    // 1) 영향 분석 — 최신 슬롯/예약을 Supabase 에서 조회
    let slots: Awaited<ReturnType<typeof consultationSupabaseClient.getSlots>>;
    let bookingsPublic: Awaited<ReturnType<typeof consultationSupabaseClient.getBookings>>;
    try {
      [slots, bookingsPublic] = await Promise.all([
        consultationSupabaseClient.getSlots(id),
        consultationSupabaseClient.getBookings(id),
      ]);
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
          await consultationSupabaseClient.cancelBooking(a.booking.id, id);
        } catch (e) {
          return {
            ok: false,
            reason: `영향 예약 취소 실패 (${a.booking.id}): ${String(e)}`,
          };
        }
      }
    }

    // 4) schedule 메타 PATCH
    const metaPatch: Parameters<typeof consultationSupabaseClient.updateSchedule>[1] = {};
    if (patch.title !== undefined) metaPatch.title = patch.title;
    if (patch.type !== undefined) metaPatch.type = patch.type;
    if (patch.methods !== undefined) metaPatch.methods = patch.methods;
    if (patch.slotMinutes !== undefined) metaPatch.slotMinutes = patch.slotMinutes;
    if (patch.dates !== undefined) metaPatch.dates = patch.dates;
    if (patch.message !== undefined) metaPatch.message = patch.message;

    try {
      await consultationSupabaseClient.updateSchedule(id, metaPatch);
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
        await consultationSupabaseClient.replaceSlots(id, {
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
    try {
      const res = await consultationSupabaseClient.rescheduleBooking({
        scheduleId,
        bookingId,
        newSlotId,
      });
      if (!res.success) return { ok: false, reason: res.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `예약 시간 변경 실패: ${String(e)}` };
    }
  },

  cancelBooking: async (scheduleId, bookingId) => {
    try {
      await consultationSupabaseClient.cancelBooking(bookingId, scheduleId);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `예약 취소 실패: ${String(e)}` };
    }
  },

  recomputeSlotAvailability: async (scheduleId) => {
    const schedule = get().schedules.find((s) => s.id === scheduleId);
    if (!schedule || schedule.isArchived) {
      return { blockedAdded: 0, availableRestored: 0, conflictedBookingIds: [] };
    }

    let slots: Awaited<ReturnType<typeof consultationSupabaseClient.getSlots>>;
    let bookings: Awaited<ReturnType<typeof consultationSupabaseClient.getBookings>>;
    try {
      [slots, bookings] = await Promise.all([
        consultationSupabaseClient.getSlots(scheduleId),
        consultationSupabaseClient.getBookings(scheduleId),
      ]);
    } catch {
      return { blockedAdded: 0, availableRestored: 0, conflictedBookingIds: [] };
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

      if (collides && slot.status === 'available') toBlock.push(slot.id);
      else if (!collides && slot.status === 'blocked') toRestore.push(slot.id);
    }

    // 배치 PATCH — 실패해도 다음 주기에 다시 시도, 사용자에게 무영향
    try {
      if (toBlock.length > 0) {
        await consultationSupabaseClient.bulkUpdateSlotStatus(toBlock, 'blocked');
      }
      if (toRestore.length > 0) {
        await consultationSupabaseClient.bulkUpdateSlotStatus(toRestore, 'available');
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

    const runAll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const active = get().schedules.filter((s) => !s.isArchived);
        for (const s of active) {
          await get().recomputeSlotAvailability(s.id);
        }
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
