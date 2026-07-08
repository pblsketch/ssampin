import { create } from 'zustand';
import { reminderFireRepository } from '@adapters/di/container';
import { pruneFiredKeys } from '@domain/rules/recordReminderRules';

/**
 * 학생 관찰 기록 알림 — 발화 장부 스토어(로컬 전용).
 *
 * 같은 학생·같은 날(`studentId:YYYY-MM-DD`) 중복 OS 토스트 발화를 막는다.
 * 로컬 JSON('reminder-fires')에 영속하며 syncRegistry에는 등록하지 않는다 —
 * 크로스기기 중복은 유계(기기·일당 ≤ +1) 허용(계획서 M4). 오래된 키는 로드/기록 시 정리한다.
 */

const KEEP_DAYS = 30;

interface ReminderFireState {
  firedKeys: readonly string[];
  loaded: boolean;
  load: (force?: boolean) => Promise<void>;
  hasFired: (key: string) => boolean;
  markFired: (key: string) => Promise<void>;
}

export const useReminderFireStore = create<ReminderFireState>((set, get) => ({
  firedKeys: [],
  loaded: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    try {
      const data = await reminderFireRepository.load();
      const pruned = pruneFiredKeys(data?.firedKeys ?? [], new Date(), KEEP_DAYS);
      set({ firedKeys: pruned, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  hasFired: (key) => get().firedKeys.includes(key),

  markFired: async (key) => {
    if (get().firedKeys.includes(key)) return;
    const next = pruneFiredKeys([...get().firedKeys, key], new Date(), KEEP_DAYS);
    set({ firedKeys: next });
    await reminderFireRepository.save({ firedKeys: next });
  },
}));
