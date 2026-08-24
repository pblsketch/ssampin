import { create } from 'zustand';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { sortTeachingClasses } from '@domain/rules/teachingClassOrder';
import { teachingClassRepository } from '@mobile/di/container';

interface MobileTeachingClassState {
  classes: readonly TeachingClass[];
  loaded: boolean;
  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 수업 탭(`ClassListPage`)이
   * `if (!loaded) return <스피너/>` 가드를 가지고 있어, 앱 복귀로 동기화가 도는 순간
   * **학급 상세 화면(출결·진도 서브탭)이 통째로 언마운트**된다. 그러면 열려 있던
   * 진도 입력 모달과 타이핑이 사라지고, 서브탭 선택도 '출결'로 되돌아간다.
   */
  reload: () => Promise<void>;
  getClass: (classId: string) => TeachingClass | undefined;
}

export const useMobileTeachingClassStore = create<MobileTeachingClassState>((set, get) => ({
  classes: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const data = await teachingClassRepository.getClasses();
      if (data?.classes) {
        // 저장 파일의 배열 순서는 표시 순서가 아니다 — 재배치는 `order` 숫자만 바꾼다.
        // 데스크톱과 같은 도메인 규칙을 거쳐야 PC에서 정한 반 순서가 그대로 보인다.
        set({ classes: sortTeachingClasses(data.classes), loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    await get().load(true);
  },

  getClass: (classId) => {
    return get().classes.find((c) => c.id === classId);
  },
}));
