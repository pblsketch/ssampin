/**
 * 설정 → 관찰 기록 알림 → '제외 학생'(ADR-135).
 *
 * - 반 카드의 칸 메뉴에서 [당분간 빼기]한 학생을 늘 펼쳐 보여 준다(접지 않는다).
 * - 알림을 꺼 둬도 흐려지지 않는다 — 빼기는 알림과 한 바퀴 둘 다에 쓰인다.
 * - [다시 넣기]는 누르는 즉시 저장한다(화면 아래 [저장]을 기다리지 않는다). 그래서 목록은 편집 중인
 *   초안이 아니라 **지금 저장된 값**을 읽는다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { buildExclusionRows } from '@adapters/hooks/reminderExclusionRows';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import { toLocalDateString } from '@shared/utils/localDate';
import { SettingsSection } from './shared/SettingsSection';

function untilText(until: string | null): string {
  if (until === null) return '다시 넣을 때까지';
  const [, m, d] = until.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일까지`;
}

export function ExclusionListSection(): JSX.Element {
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const className = useSettingsStore((s) => s.settings.className);
  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const today = toLocalDateString(new Date());

  useEffect(() => {
    void useStudentStore.getState().load();
    void useTeachingClassStore.getState().load();
  }, []);

  const rows = useMemo(
    () =>
      buildExclusionRows({
        reminder: rr,
        homeroomTitle: className?.trim() ? className.trim() : '담임반',
        students,
        classes,
        today,
      }),
    [rr, className, students, classes, today],
  );

  const putBack = async (key: string): Promise<void> => {
    setBusyKey(key);
    try {
      await useSettingsStore.getState().removeReminderExclusion(key);
    } catch {
      useToastStore.getState().show('저장하지 못했어요. 잠시 뒤 다시 해 주세요.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <SettingsSection
      icon="person_off"
      iconColor="bg-sp-surface text-sp-muted"
      title="제외 학생"
      description="반 카드의 칸 메뉴에서 잠시 뺀 학생이에요. 기간이 지나면 저절로 다시 들어가요."
    >
      {rows.length === 0 ? (
        <p className="text-xs text-sp-muted">
          아직 뺀 학생이 없어요. 반 카드의 칸 메뉴에서 뺄 수 있어요.
        </p>
      ) : (
        <ul className="divide-y divide-sp-border">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-28 shrink-0 truncate text-sp-muted">
                {row.group.length > 0 ? row.group : '지금 명렬에 없는 반'}
              </span>
              <span className="w-12 shrink-0 text-sp-muted">
                {row.label.length > 0 ? `${row.label}번` : ''}
              </span>
              <span className="min-w-0 flex-1 truncate text-sp-text">
                {row.missing ? '명렬에서 찾지 못한 학생' : row.displayName}
              </span>
              <span className="shrink-0 text-xs text-sp-muted">{untilText(row.until)}</span>
              <button
                type="button"
                onClick={() => void putBack(row.key)}
                disabled={busyKey === row.key}
                className="shrink-0 rounded-lg border border-sp-border px-2.5 py-1 text-xs text-sp-text transition-colors hover:border-sp-accent disabled:cursor-wait disabled:opacity-60"
              >
                다시 넣기
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
