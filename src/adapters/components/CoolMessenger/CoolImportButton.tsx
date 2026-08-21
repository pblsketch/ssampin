import { useCallback, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { CoolImportModal } from './CoolImportModal';
import type { CoolImportItem, CoolMessage } from '@domain/entities/CoolMessage';

/**
 * "쿨메신저에서 가져오기" 버튼 + 모달.
 *
 * 일정 화면과 할일 화면 양쪽에 그대로 얹을 수 있게 하나로 묶었다.
 *
 * ## 설정에서 켜지 않으면 아무것도 안 보인다
 * 쿨메신저를 안 쓰는 시도교육청이 많다. 기본은 꺼짐이고, 설정 > 일정에서 켜야 나온다.
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

/** 화면마다 도구모음 버튼 모양이 달라서, 통째로 갈아끼울 수 있게 둔다 */
const VARIANT_CLASS = {
  /** 기본 — 단독으로 놓을 때 */
  button:
    'inline-flex items-center gap-1.5 rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text hover:bg-sp-surface transition-colors duration-sp-base ease-sp-out',
  /** 좁은 자리 */
  compact:
    'inline-flex items-center gap-1.5 rounded-lg border border-sp-border px-2 py-1 text-xs text-sp-text hover:bg-sp-surface transition-colors duration-sp-base ease-sp-out',
  /** 일정 화면 도구모음 — 옆 버튼들(가져오기·내보내기)과 같은 모양 */
  toolbar:
    'flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all',
} as const;

interface Props {
  /** 버튼 모양 — 놓을 화면에 맞춰 고른다 */
  readonly variant?: keyof typeof VARIANT_CLASS;
  /** 도구모음처럼 좁을 때 글자를 숨긴다 (아이콘만) */
  readonly hideLabelOnNarrow?: boolean;
  readonly className?: string;
}

export function CoolImportButton({
  variant = 'button',
  hideLabelOnNarrow = false,
  className = '',
}: Props) {
  const enabled = useSettingsStore((s) => s.settings.coolMessengerImportEnabled === true);
  const addEvent = useEventsStore((s) => s.addEvent);
  const addTodo = useTodoStore((s) => s.addTodo);
  const students = useStudentStore((s) => s.students);
  const [open, setOpen] = useState(false);

  /** 이름 대조 사전 — 우리 반 학생 + 쿨메신저 교직원 명단을 합친다 */
  const [staffNames, setStaffNames] = useState<readonly string[]>([]);
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

  const handleSubmit = useCallback(
    async (items: readonly CoolImportItem[]) => {
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
      }
    },
    [addEvent, addTodo],
  );

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="쿨메신저에서 가져오기"
        className={`${VARIANT_CLASS[variant]} ${className}`}
      >
        <span className="material-symbols-outlined text-icon-md">forward_to_inbox</span>
        <span className={hideLabelOnNarrow ? 'hidden lg:inline' : undefined}>쿨메신저</span>
      </button>

      {open && (
        <CoolImportModal
          isOpen={open}
          onClose={() => setOpen(false)}
          loadMessages={loadMessages}
          loadMessage={loadMessage}
          roster={roster}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
