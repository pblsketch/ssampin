import { create } from 'zustand';
import type { AttendanceRecord } from '@domain/entities/Attendance';
import { findAttendanceRecordForClass } from '@domain/entities/Attendance';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { teachingClassRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';
import { todayISO } from '@mobile/utils/date';

const manageAttendance = new ManageAttendance(teachingClassRepository);

interface MobileAttendanceState {
  records: readonly AttendanceRecord[];
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
  /** 오늘 출결 조회 — 그룹 학급은 groupId를 함께 넘겨야 다른 과목 명의의 공유 레코드를 찾는다. */
  getTodayRecord: (classId: string, period?: number, groupId?: string) => AttendanceRecord | null;
  saveRecord: (record: AttendanceRecord) => Promise<void>;
}

export const useMobileAttendanceStore = create<MobileAttendanceState>((set, get) => ({
  records: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const records = await manageAttendance.getAll();
      set({ records, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    await get().load(true);
  },

  getTodayRecord: (classId, period, groupId) => {
    const today = todayISO();
    return findAttendanceRecordForClass(
      get().records,
      { id: classId, ...(groupId ? { groupId } : {}) },
      today,
      period,
    );
  },

  saveRecord: async (record) => {
    // 그룹 키 인지 upsert 경유 — 구 saveRecord는 (classId,date,period)만 매치해
    // 같은 classId의 그룹 레코드를 그룹 키 없는 레코드로 통째 교체(그룹 출결 소실
    // +툼스톤 전파)했다. 화면 상태는 저장 결과(반환값)로 갱신한다(P6).
    const saved = await manageAttendance.upsertRecord(record);
    set({ records: [...saved] });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
