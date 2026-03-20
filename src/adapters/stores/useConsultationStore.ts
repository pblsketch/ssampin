import { create } from 'zustand';
import type {
  ConsultationSchedule,
  ConsultationsData,
} from '@domain/entities/Consultation';
import { consultationRepository, shortLinkClient } from '@adapters/di/container';
import { SITE_URL } from '@config/siteUrl';

const SHARE_BASE_URL = `${SITE_URL}/booking`;

interface ConsultationState {
  schedules: readonly ConsultationSchedule[];
  loaded: boolean;

  load: () => Promise<void>;
  createSchedule: (
    params: Omit<ConsultationSchedule, 'id' | 'createdAt' | 'shareUrl' | 'shortUrl' | 'adminKey' | 'isArchived'> & { customLinkCode?: string },
  ) => Promise<ConsultationSchedule>;
  deleteSchedule: (id: string) => Promise<void>;
  archiveSchedule: (id: string) => Promise<void>;
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
    const id = crypto.randomUUID();
    const adminKey = crypto.randomUUID().slice(0, 8);
    const shareUrl = `${SHARE_BASE_URL}/${id}#key=${encodeURIComponent(adminKey)}`;
    const createdAt = new Date().toISOString();

    // 상담 날짜 중 가장 마지막 날짜 + 30일을 만료일로 설정
    const lastDate = scheduleParams.dates.length > 0
      ? [...scheduleParams.dates].sort((a, b) => b.date.localeCompare(a.date))[0]!.date
      : createdAt.slice(0, 10);
    const expiresAt = new Date(new Date(lastDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

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
      schedules: schedules.map((s) =>
        s.id === id ? { ...s, isArchived: true } : s,
      ),
    };
    await consultationRepository.save(next);
    set({ schedules: next.schedules });
  },
}));
