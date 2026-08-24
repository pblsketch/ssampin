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
  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화(앱 복귀·네트워크 복구)가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 화면들이 `!loaded`일 때 스피너로
   * 갈아끼우므로, 동기화가 도는 순간 **열려 있던 입력창·시트가 통째로 언마운트**되고
   * 타이핑이 사라진다. 스크롤 위치와 서브탭 선택도 함께 날아간다.
   * 잠금 장치: `scripts/regression-grep-check.mjs` REGRESSION #63
   */
  reload: () => Promise<void>;
}

export const useMobileStaffContactStore = create<MobileStaffContactState>((set, get) => ({
  contacts: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const data = await staffContactRepository.load();
      set({ contacts: data?.contacts ? [...data.contacts] : [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    await get().load(true);
  },
}));
