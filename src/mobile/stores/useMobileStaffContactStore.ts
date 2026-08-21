import { create } from 'zustand';
import type { StaffContact } from '@domain/entities/StaffContact';
import { staffContactRepository } from '@mobile/di/container';

/**
 * 모바일 교직원 연락처 — **읽기 전용**이다.
 *
 * 등록·수정은 데스크톱 쌤핀에서만 한다. 모바일에서 고칠 수 있게 하면
 * 같은 명부를 두 곳에서 고쳐 어느 쪽이 맞는지 알 수 없게 된다.
 * 데스크톱에서 고친 내용은 구글 드라이브 동기화로 넘어온다.
 */
interface MobileStaffContactState {
  contacts: readonly StaffContact[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMobileStaffContactStore = create<MobileStaffContactState>((set, get) => ({
  contacts: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await staffContactRepository.load();
      set({ contacts: data?.contacts ? [...data.contacts] : [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },
}));
