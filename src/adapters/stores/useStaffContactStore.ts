import { create } from 'zustand';
import type { StaffContact } from '@domain/entities/StaffContact';
import {
  mergeStaffContacts,
  toStaffContacts,
  type StaffImportMode,
  type StaffImportRow,
} from '@domain/rules/staffContactImportRules';
import { staffContactRepository } from '@adapters/di/container';

/** 새 연락처 id. crypto.randomUUID가 없는 환경(구형 웹뷰)을 위한 대비책까지 둔다. */
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `staff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 화면에서 새로 만들거나 고칠 때 채우는 값 (id·시각은 store가 붙인다). */
export type StaffContactDraft = Omit<StaffContact, 'id' | 'createdAt' | 'updatedAt'>;

interface StaffContactState {
  contacts: readonly StaffContact[];
  loaded: boolean;
  load: (force?: boolean) => Promise<void>;
  add: (draft: StaffContactDraft) => Promise<StaffContact>;
  update: (id: string, patch: Partial<StaffContactDraft>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  /** 엑셀 미리보기에서 확인을 누르면 호출한다. 실제로 반영된 인원 수를 돌려준다. */
  importRows: (rows: readonly StaffImportRow[], mode: StaffImportMode) => Promise<number>;
}

export const useStaffContactStore = create<StaffContactState>((set, get) => ({
  contacts: [],
  loaded: false,

  load: async (force = false) => {
    // force=true: 동기화 리로드용 — loaded를 유지한 채 데이터만 조용히 갱신
    if (get().loaded && !force) return;
    const data = await staffContactRepository.load();
    set({ contacts: data?.contacts ? [...data.contacts] : [], loaded: true });
  },

  add: async (draft) => {
    const contact: StaffContact = { ...draft, id: makeId(), createdAt: new Date().toISOString() };
    const next = [...get().contacts, contact];
    set({ contacts: next });
    await staffContactRepository.save({ contacts: next });
    return contact;
  },

  update: async (id, patch) => {
    const now = new Date().toISOString();
    const next = get().contacts.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now } : c));
    set({ contacts: next });
    await staffContactRepository.save({ contacts: next });
  },

  remove: async (id) => {
    const next = get().contacts.filter((c) => c.id !== id);
    set({ contacts: next });
    await staffContactRepository.save({ contacts: next });
  },

  toggleFavorite: async (id) => {
    const target = get().contacts.find((c) => c.id === id);
    if (!target) return;
    await get().update(id, { favorite: target.favorite !== true });
  },

  importRows: async (rows, mode) => {
    const now = new Date().toISOString();
    const incoming = toStaffContacts(rows, { makeId: () => makeId(), now });
    const next = mergeStaffContacts(get().contacts, incoming, mode, now);
    set({ contacts: next });
    await staffContactRepository.save({ contacts: next });
    return incoming.length;
  },
}));
