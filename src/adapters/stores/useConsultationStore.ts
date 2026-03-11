import { create } from 'zustand';
import type {
  ConsultationSchedule,
  ConsultationsData,
} from '@domain/entities/Consultation';
import { consultationRepository } from '@adapters/di/container';

const SHARE_BASE_URL = 'https://ssampin.vercel.app/booking';

interface ConsultationState {
  schedules: readonly ConsultationSchedule[];
  loaded: boolean;

  load: () => Promise<void>;
  createSchedule: (
    params: Omit<ConsultationSchedule, 'id' | 'createdAt' | 'shareUrl' | 'adminKey' | 'isArchived'>,
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
    const id = crypto.randomUUID();
    const adminKey = crypto.randomUUID().slice(0, 8);
    const shareUrl = `${SHARE_BASE_URL}/${id}`;
    const createdAt = new Date().toISOString();

    const schedule: ConsultationSchedule = {
      ...params,
      id,
      adminKey,
      shareUrl,
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
