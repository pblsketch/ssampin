/**
 * 시작 스냅샷으로 되돌린 자료를 메인 창에서 **한 번** 알린다(ADR-148).
 *
 * 원본·백업이 모두 깨진 자료를 메인 프로세스가 그날 처음 켰을 때의 상태로 되돌리면 그 사실을
 * `backups/restore-log` 에 남긴다. 메인 창은 그중 아직 알리지 않은 것을 한 토스트에 묶어 알리고
 * "알렸음"(`notified`)으로 표시한다 — 창을 다시 만들어도(메모리 절약 모드)·앱을 다시 켜도 또 알리지 않는다.
 *
 * 언제 알리나: 메인 프로세스가 "메인 창이 보이고 알릴 것이 있다"고 신호할 때(`onDataRestored`).
 * 위젯·옆핀 모드로 숨은 채 시작하면 메인 창이 처음 보일 때 신호가 온다. 위젯 창이 먼저 읽어서
 * 되돌린 경우에도 메인 창이 알린다.
 */
import { useEffect } from 'react';
import { buildRestoredDataNotice, type RestoredDataRecord } from '@domain/rules/restoredDataNotice';
import {
  listRestoredData,
  markRestoredDataNotified,
  onDataRestored,
} from '@adapters/repositories/restoredDataGateway';

/** 이 화면에서 이미 띄운 기록 — "알렸음" 표시가 디스크에 남지 못해도 같은 실행에서 또 띄우지 않는다. */
const shownIds = new Set<string>();
/** 지금 알림을 처리 중인가. 상태(state)가 아니라 모듈 변수로 막는다 — 두 신호가 같은 순간 올 수 있다. */
let running = false;
/** 처리 중에 신호가 또 왔다 — 끝나고 한 번 더 본다(그 사이 새로 되돌린 자료가 있을 수 있다). */
let rerun = false;

export interface RestoredDataNoticeDeps {
  readonly list: typeof listRestoredData;
  readonly markNotified: typeof markRestoredDataNotified;
  readonly show: (message: string) => void;
  /** 구글 드라이브 동기화가 켜져 있는가 — 켜져 있으면 '동기화 충돌' 창 안내를 덧붙인다. */
  readonly isDriveSyncOn?: () => boolean | Promise<boolean>;
}

/** 토스트를 띄워 두는 시간. 세 문장이고 확인할 일이 있어 길게 둔다(닫기 단추가 있다). */
export const RESTORED_NOTICE_DURATION_MS = 20_000;

async function showToast(message: string): Promise<void> {
  const { useToastStore } = await import('@adapters/components/common/Toast');
  useToastStore.getState().show(message, 'info', undefined, RESTORED_NOTICE_DURATION_MS);
}

const defaultDeps: RestoredDataNoticeDeps = {
  list: listRestoredData,
  markNotified: markRestoredDataNotified,
  show: (message) => {
    void showToast(message).catch(() => undefined);
  },
  isDriveSyncOn: async () => {
    const { useSettingsStore } = await import('@adapters/stores/useSettingsStore');
    return useSettingsStore.getState().settings.sync?.enabled === true;
  },
};

/** 아직 알리지 않은 복원을 한 토스트로 알리고 "알렸음"으로 표시한다. 겹쳐 불려도 한 번씩만 돈다. */
export async function notifyRestoredData(
  deps: RestoredDataNoticeDeps = defaultDeps,
): Promise<void> {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    do {
      rerun = false;
      let records: readonly RestoredDataRecord[];
      try {
        records = await deps.list();
      } catch {
        return; // 알 수 없으면 알리지 않는다
      }
      const pending = records.filter((record) => !record.notified && !shownIds.has(record.id));
      if (pending.length === 0) continue;
      let driveSyncOn = false;
      try {
        driveSyncOn = (await deps.isDriveSyncOn?.()) ?? false;
      } catch {
        driveSyncOn = false;
      }
      const message = buildRestoredDataNotice(pending, { driveSyncOn });
      if (message === null) continue;
      for (const record of pending) shownIds.add(record.id);
      deps.show(message);
      try {
        await deps.markNotified(pending.map((record) => record.id));
      } catch (err) {
        console.warn('[restoredData] 알림 표시를 남기지 못함:', err);
      }
    } while (rerun);
  } finally {
    running = false;
  }
}

/** 테스트 전용 — 모듈 상태를 비운다. */
export function resetRestoredDataNoticeForTest(): void {
  shownIds.clear();
  running = false;
  rerun = false;
}

/** 메인 창(MainApp)에서 한 번 부른다. */
export function useRestoredDataNotice(): void {
  useEffect(() => onDataRestored(() => void notifyRestoredData()), []);
}
