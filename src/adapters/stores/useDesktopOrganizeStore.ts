import { create } from 'zustand';
import type {
  DesktopOrganizeConfig,
  GridDimension,
} from '@domain/entities/DesktopOrganizeConfig';
import { desktopOrganizeRepository } from '@adapters/di/container';
import { ManageDesktopOrganize } from '@usecases/desktopOrganize/ManageDesktopOrganize';
import type { GridResizePlan } from '@usecases/desktopOrganize/computeGridResizePlan';

/**
 * undo 윈도우 (밀리초)
 * 그리드 변경 후 5초 동안 되돌리기 가능.
 */
const UNDO_WINDOW_MS = 5000;

interface DesktopOrganizeState {
  /** 로드된 설정. null = 미로드 또는 로드 실패 */
  config: DesktopOrganizeConfig | null;
  /** 로드/저장 진행 중 (UI에서 버튼 disable용) */
  isApplying: boolean;
  /** 그리드 변경 직전 스냅샷 (5초 undo) */
  undoSnapshot: DesktopOrganizeConfig | null;
  /** undo 만료 시각 (epoch ms) */
  undoExpiresAt: number | null;

  /** 첫 호출 시 영속 데이터 로드 (없으면 default 생성) */
  load: () => Promise<void>;
  /** 박스 제목 변경 */
  setTitle: (boxIndex: number, title: string) => Promise<void>;
  /** 그리드 변경 (호출자가 plan을 미리 계산해 사용자 동의를 받은 경우) */
  applyGridResize: (plan: GridResizePlan) => Promise<void>;
  /** 모든 제목을 placeholder로 초기화 */
  resetTitles: () => Promise<void>;
  /** 박스 내부 투명도 토글 */
  setBoxTransparent: (boxTransparent: boolean) => Promise<void>;
  /** 그리드 변경 plan 미리 계산 (UI 미리보기용, 영속화 X) */
  planResize: (cols: GridDimension, rows: GridDimension) => GridResizePlan | null;
  /** 5초 undo 윈도우 안에 호출 시 그리드 변경 직전 상태로 복원 */
  undo: () => Promise<boolean>;
}

export const useDesktopOrganizeStore = create<DesktopOrganizeState>((set, get) => {
  const useCase = new ManageDesktopOrganize(desktopOrganizeRepository);

  return {
    config: null,
    isApplying: false,
    undoSnapshot: null,
    undoExpiresAt: null,

    load: async () => {
      if (get().config !== null) return;
      try {
        const config = await useCase.load();
        set({ config });
      } catch (err) {
        // load 실패 시 콘솔 로그만. UI는 config=null skeleton 유지.
        // eslint-disable-next-line no-console
        console.error('[desktop-organize] load failed', err);
      }
    },

    setTitle: async (boxIndex, title) => {
      const current = get().config;
      if (!current || get().isApplying) return;
      set({ isApplying: true });
      try {
        const next = await useCase.setTitle(current, boxIndex, title);
        set({ config: next });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[desktop-organize] setTitle failed', err);
      } finally {
        set({ isApplying: false });
      }
    },

    applyGridResize: async (plan) => {
      const current = get().config;
      if (!current || get().isApplying) return;
      set({ isApplying: true });
      try {
        const snapshot = current;
        const next = await useCase.setGrid(current, plan);
        set({
          config: next,
          undoSnapshot: snapshot,
          undoExpiresAt: Date.now() + UNDO_WINDOW_MS,
        });
        // undo 윈도우 만료 후 스냅샷 청소
        setTimeout(() => {
          const state = get();
          if (state.undoExpiresAt !== null && Date.now() >= state.undoExpiresAt) {
            set({ undoSnapshot: null, undoExpiresAt: null });
          }
        }, UNDO_WINDOW_MS + 100);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[desktop-organize] applyGridResize failed', err);
      } finally {
        set({ isApplying: false });
      }
    },

    resetTitles: async () => {
      const current = get().config;
      if (!current || get().isApplying) return;
      set({ isApplying: true });
      try {
        const next = await useCase.resetTitles(current);
        set({ config: next });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[desktop-organize] resetTitles failed', err);
      } finally {
        set({ isApplying: false });
      }
    },

    setBoxTransparent: async (boxTransparent) => {
      const current = get().config;
      if (!current || get().isApplying) return;
      set({ isApplying: true });
      try {
        const next = await useCase.setBoxTransparent(current, boxTransparent);
        set({ config: next });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[desktop-organize] setBoxTransparent failed', err);
      } finally {
        set({ isApplying: false });
      }
    },

    planResize: (cols, rows) => {
      const current = get().config;
      if (!current) return null;
      return useCase.planResize(current, cols, rows);
    },

    undo: async () => {
      const { undoSnapshot, undoExpiresAt, isApplying } = get();
      if (!undoSnapshot || undoExpiresAt === null || isApplying) return false;
      if (Date.now() > undoExpiresAt) {
        set({ undoSnapshot: null, undoExpiresAt: null });
        return false;
      }
      set({ isApplying: true });
      try {
        // undo는 그리드와 제목을 한 번에 복원해야 하므로 setGrid 경로를 우회하고
        // 직접 plan을 만들어 적용한다.
        const restored: DesktopOrganizeConfig = {
          ...undoSnapshot,
          lastModified: new Date().toISOString(),
        };
        await desktopOrganizeRepository.save(restored);
        set({
          config: restored,
          undoSnapshot: null,
          undoExpiresAt: null,
        });
        return true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[desktop-organize] undo failed', err);
        return false;
      } finally {
        set({ isApplying: false });
      }
    },
  };
});
