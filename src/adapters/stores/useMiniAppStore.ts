import { create } from 'zustand';
import type { MiniApp } from '@domain/entities/MiniApp';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { miniAppRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';
import { registerMiniApp, type RegisterMiniAppInput } from '@usecases/miniapp/RegisterMiniApp';
import { updateMiniApp, type UpdateMiniAppInput } from '@usecases/miniapp/UpdateMiniApp';
import { removeMiniApp } from '@usecases/miniapp/RemoveMiniApp';
import { reorderMiniApps } from '@usecases/miniapp/ReorderMiniApps';

/**
 * 미니앱("내가 만든 앱") 액션 스토어.
 *
 * 상태를 직접 들고 있지 않는다 — 메타의 원천은 `useSettingsStore().settings.miniApps`
 * (설정에 실려 'settings' 동기화 도메인에 편승)이고, 이 스토어는 그 원천을 읽고 갱신하는
 * 액션만 제공한다. 파일(HTML·아이콘) 저장은 DI 컨테이너의 `miniAppRepository`(Electron IPC 위임)가
 * 담당하고, id 생성은 인프라 uuid를 주입해 usecase에 넘긴다(레이어 순수성 유지).
 *
 * 에러는 그대로 throw한다 — 호출부(모달/카드)가 try/catch로 받아 토스트로 보여준다.
 *
 * (파일-메타 정합 확인: repo.list()가 디스크의 실제 앱 폴더 id 목록을 돌려주지만, 앱 시작 시
 * settings.miniApps와 대조해 orphan을 정리하는 로직은 이번 범위에 포함하지 않는다 — 후속 작업.)
 */
interface MiniAppStoreState {
  register: (input: RegisterMiniAppInput) => Promise<void>;
  update: (input: UpdateMiniAppInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (orderedIds: readonly string[]) => Promise<void>;
  toggleSectionHidden: () => Promise<void>;
}

function currentMiniApps(): readonly MiniApp[] {
  return useSettingsStore.getState().settings.miniApps ?? [];
}

export const useMiniAppStore = create<MiniAppStoreState>(() => ({
  register: async (input) => {
    const next = await registerMiniApp(
      { repo: miniAppRepository, generateId: generateUUID },
      input,
      currentMiniApps(),
    );
    await useSettingsStore.getState().update({ miniApps: next });
  },

  update: async (input) => {
    const next = await updateMiniApp({ repo: miniAppRepository }, input, currentMiniApps());
    await useSettingsStore.getState().update({ miniApps: next });
  },

  remove: async (id) => {
    const next = await removeMiniApp({ repo: miniAppRepository }, id, currentMiniApps());
    await useSettingsStore.getState().update({ miniApps: next });
  },

  reorder: async (orderedIds) => {
    const next = reorderMiniApps(orderedIds, currentMiniApps());
    await useSettingsStore.getState().update({ miniApps: next });
  },

  toggleSectionHidden: async () => {
    const current = useSettingsStore.getState().settings.hiddenMiniAppSection ?? false;
    await useSettingsStore.getState().update({ hiddenMiniAppSection: !current });
  },
}));
