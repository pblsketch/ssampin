import { useCallback, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useCoolImportHistoryStore } from '@adapters/stores/useCoolImportHistoryStore';
import type { CoolImportItem, CoolMessage } from '@domain/entities/CoolMessage';

/**
 * 쿨메신저 가져오기의 공통 배선.
 *
 * 버튼(`CoolImportButton`)과 알림 배너(`CoolImportBanner`)가 **같은 창을 같은 방식으로**
 * 열어야 하므로 한 군데 모아 둔다. 여기에만 스토어·IPC 의존이 있고,
 * 화면 조각들은 이 훅이 주는 것만 쓴다.
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */

/** Date → "YYYY-MM-DD" (지역시간 기준. toISOString은 UTC라 하루가 밀린다) */
function toDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Date → "HH:mm" */
function toTimeKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 가져온 일정이 어디서 왔는지 알 수 있게 남긴다 */
const SOURCE_NOTE = '쿨메신저 쪽지에서 가져옴';

/**
 * Electron IPC 오류에 붙는 기계어 껍데기를 벗긴다.
 *
 * 그대로 두면 선생님 화면에
 * `Error invoking remote method 'cool-messenger:list': Error: 쿨메신저 쪽지함 구조가…`
 * 처럼 보인다. 정작 필요한 한국어 설명은 맨 뒤에 파묻힌다.
 */
export function readableIpcError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']*':\s*/, '')
    .replace(/^(?:\w*Error):\s*/, '')
    .trim();
  return new Error(cleaned || '쪽지함을 읽지 못했습니다.');
}

export interface CoolImportWiring {
  /** 설정에서 켜져 있는가 — 꺼져 있으면 화면에 아무것도 내보내지 않는다 */
  readonly enabled: boolean;
  readonly loadMessages: () => Promise<readonly CoolMessage[]>;
  readonly loadMessage: (key: number) => Promise<CoolMessage | null>;
  readonly roster: ReadonlySet<string>;
  readonly onSubmit: (items: readonly CoolImportItem[]) => Promise<void>;
  readonly isImported: (key: string) => boolean;
  readonly hasImportedFrom: (messageKey: number) => boolean;
  /** 가져온 기록을 아직 안 읽었으면 읽어 둔다 (창을 열기 직전에 부른다) */
  readonly ensureHistory: () => void;
}

export function useCoolImport(): CoolImportWiring {
  const enabled = useSettingsStore((s) => s.settings.coolMessengerImportEnabled === true);
  const addEvent = useEventsStore((s) => s.addEvent);
  const addTodo = useTodoStore((s) => s.addTodo);
  const students = useStudentStore((s) => s.students);
  const remember = useCoolImportHistoryStore((s) => s.remember);
  const loadHistory = useCoolImportHistoryStore((s) => s.load);
  const historyLoaded = useCoolImportHistoryStore((s) => s.loaded);
  const isImported = useCoolImportHistoryStore((s) => s.isImported);
  const hasImportedFrom = useCoolImportHistoryStore((s) => s.hasImportedFrom);

  const [staffNames, setStaffNames] = useState<readonly string[]>([]);

  /** 이름 대조 사전 — 우리 반 학생 + 쿨메신저 교직원 명단 */
  const roster = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) if (s.name) set.add(s.name);
    for (const n of staffNames) set.add(n);
    return set;
  }, [students, staffNames]);

  const loadMessages = useCallback(async (): Promise<readonly CoolMessage[]> => {
    const api = window.electronAPI?.coolMessenger;
    if (!api) throw new Error('이 기능은 쌤핀 데스크톱 앱에서만 쓸 수 있습니다.');
    // 명단은 없어도 기능이 살아야 하므로 실패를 삼킨다
    void api
      .members()
      .then(setStaffNames)
      .catch(() => setStaffNames([]));
    try {
      return await api.list();
    } catch (err: unknown) {
      throw readableIpcError(err);
    }
  }, []);

  const loadMessage = useCallback(async (key: number): Promise<CoolMessage | null> => {
    const api = window.electronAPI?.coolMessenger;
    if (!api) return null;
    try {
      return await api.get(key);
    } catch (err: unknown) {
      throw readableIpcError(err);
    }
  }, []);

  const onSubmit = useCallback(
    async (items: readonly CoolImportItem[]) => {
      // ★성공한 것까지는 반드시 기록한다 (2026-08-24 UltraQA) — 3건 중 2건을 등록하고
      //   3번째에서 실패하면, 기록이 없을 때 선생님이 재시도하면서 1·2번이 **또** 등록된다.
      //   성공분이 기록돼 있으면 카드의 "전에 가져간 적이 있습니다" 표시가 중복을 눈으로 막는다.
      const done: CoolImportItem[] = [];
      try {
        for (const item of items) {
          if (item.target === 'todo') {
            await addTodo(
              item.title,
              toDateKey(item.start),
              'none',
              'admin',
              undefined,
              item.allDay ? undefined : toTimeKey(item.start),
            );
          } else {
            await addEvent({
              title: item.title,
              date: toDateKey(item.start),
              category: 'school',
              description: SOURCE_NOTE,
              ...(item.end ? { endDate: toDateKey(item.end) } : {}),
              ...(item.allDay ? {} : { time: toTimeKey(item.start) }),
            });
          }
          done.push(item);
        }
      } finally {
        if (done.length > 0) await remember(done);
      }
    },
    [addEvent, addTodo, remember],
  );

  const ensureHistory = useCallback(() => {
    if (!historyLoaded) void loadHistory();
  }, [historyLoaded, loadHistory]);

  return {
    enabled,
    loadMessages,
    loadMessage,
    roster,
    onSubmit,
    isImported,
    hasImportedFrom,
    ensureHistory,
  };
}
