import { create } from 'zustand';

/**
 * 화면 이동 안내(ADR-139, spec 5-3).
 *
 * 진행 중인 도구(지금은 타이머)가 스스로 등록한다. 등록된 것이 있으면 페이지를 바꾸기 전에
 * [팝업으로 옮기고 이동]·[끄고 이동]·[머무르기]를 묻는다. 없으면 바로 이동한다.
 *
 * 이동하는 쪽(App·모바일 라우터·팝업 가져오기)은 `requestLeave` 만 부른다. 무엇이 진행 중인지는 모른다.
 */

export type LeaveKind =
  /** 본문 창 페이지 이동(사이드바·뒤로·Esc·명령 팔레트·위젯 창·파일 열기 등). */
  | 'navigate'
  /** 다른 도구를 팝업에서 본문으로 가져오기. */
  | 'returnTool'
  /** 병렬 모드에서 Esc 로 칸 닫기. */
  | 'closeSlot';

export interface LeaveGuard {
  readonly id: string;
  /**
   * 페이지 이동을 막고 묻는가. 끝났는데 아직 [확인]하지 않은 타이머는 이동은 막지 않지만(false),
   * 본문 창이 숨을 때는 팝업으로 옮긴다(spec 5-4). 없으면 true.
   */
  readonly blocksNavigation?: boolean;
  /** 지금 팝업으로 옮길 수 있는가(Electron 본문 창·병렬 모드 아님). */
  canMoveToPopup(): boolean;
  /** 팝업으로 옮긴다. 성공하면 true. */
  moveToPopup(): Promise<boolean>;
}

export type LeaveChoice = 'popup' | 'stop' | 'stay';

export interface PendingLeave {
  readonly kind: LeaveKind;
  /** [팝업으로 옮기고 …] 를 보여 줄지. */
  readonly allowPopup: boolean;
  readonly proceed: () => void;
  readonly cancel: () => void;
  /** 이번에 따지는 진행 중인 도구들. */
  readonly targets: readonly LeaveGuard[];
}

interface LeaveGuardState {
  readonly guards: readonly LeaveGuard[];
  readonly pending: PendingLeave | null;
  /** 팝업으로 옮기는 중(단추를 잠근다). */
  readonly working: boolean;
  /** 진행 중인 도구를 등록한다. 돌려받은 함수로 해제한다. */
  register: (guard: LeaveGuard) => () => void;
  /**
   * 떠나기를 청한다. 진행 중인 도구가 없으면 곧바로 `proceed`.
   * 있으면 안내 창을 띄우고 선생님의 선택을 기다린다.
   * `options.guards` 를 주면 그 도구들만 따진다(병렬 칸 닫기처럼 범위가 좁을 때).
   */
  requestLeave: (
    kind: LeaveKind,
    proceed: () => void,
    options?: { readonly cancel?: () => void; readonly guards?: readonly LeaveGuard[] },
  ) => void;
  choose: (choice: LeaveChoice) => Promise<void>;
}

/** 모든 도구가 팝업으로 옮겨질 수 있을 때만 [팝업으로 옮기고 …] 를 보인다. */
function canAllMove(guards: readonly LeaveGuard[]): boolean {
  return guards.length > 0 && guards.every((g) => g.canMoveToPopup());
}

export const useLeaveGuardStore = create<LeaveGuardState>((set, get) => ({
  guards: [],
  pending: null,
  working: false,

  register: (guard) => {
    set((s) => ({ guards: [...s.guards.filter((g) => g.id !== guard.id), guard] }));
    return () => {
      set((s) => ({ guards: s.guards.filter((g) => g !== guard) }));
    };
  },

  requestLeave: (kind, proceed, options) => {
    const targets = options?.guards ?? get().guards.filter((g) => g.blocksNavigation !== false);
    const cancel = options?.cancel ?? (() => undefined);
    if (targets.length === 0) {
      proceed();
      return;
    }
    // 이미 묻고 있으면 앞의 요청은 머무르기로 끝낸다(두 창이 겹치지 않게).
    get().pending?.cancel();
    set({
      pending: {
        kind,
        allowPopup: kind !== 'closeSlot' && canAllMove(targets),
        proceed,
        cancel,
        targets,
      },
      working: false,
    });
  },

  choose: async (choice) => {
    const pending = get().pending;
    if (pending === null || get().working) return;
    if (choice === 'stay') {
      set({ pending: null });
      pending.cancel();
      return;
    }
    if (choice === 'stop') {
      set({ pending: null });
      pending.proceed();
      return;
    }
    // 팝업으로 옮기고 이동
    set({ working: true });
    let ok = true;
    for (const guard of pending.targets) {
      try {
        ok = (await guard.moveToPopup()) && ok;
      } catch {
        ok = false;
      }
      if (!ok) break;
    }
    set({ pending: null, working: false });
    if (ok) {
      pending.proceed();
    } else {
      // 옮기지 못했으면 이동하지 않고 머무른다 — 타이머를 잃지 않는 것이 먼저다.
      // 까닭("새 창이 준비되지 않아 …")은 팝업을 여는 쪽(MainToolPopupHost)이 알린다.
      pending.cancel();
    }
  },
}));

/**
 * 본문 창이 숨거나 없어지기 직전에 진행 중인(또는 끝났는데 확인 전인) 도구를 팝업으로 옮긴다
 * (ADR-139, spec 5-4). 옮길 수 없는 도구(병렬 모드)는 지금 동작 그대로 둔다.
 * 돌려주는 값: 옮길 것이 없으면 'none', 모두 옮겼으면 'moved', 하나라도 실패하면 'failed'.
 */
export async function moveGuardedToolsBeforeHide(
  onStart: () => void,
): Promise<'none' | 'moved' | 'failed'> {
  const movable = useLeaveGuardStore.getState().guards.filter((g) => g.canMoveToPopup());
  if (movable.length === 0) return 'none';
  onStart();
  for (const guard of movable) {
    try {
      if (!(await guard.moveToPopup())) return 'failed';
    } catch {
      return 'failed';
    }
  }
  return 'moved';
}
