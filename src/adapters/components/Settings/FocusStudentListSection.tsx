/**
 * 설정 → 관찰 기록 알림 → '관심 학생'(ADR-137).
 *
 * - 반 카드의 칸 메뉴에서 [관심 학생으로] 지정한 학생을 늘 펼쳐 보여 준다(접지 않는다).
 * - 알림을 꺼 둬도 흐려지지 않는다 — 응원·잔디를 끄면 새로 지정할 수는 없지만 여기서 풀 수는 있다.
 * - [풀기]는 누르는 즉시 저장한다(화면 아래 [저장]을 기다리지 않는다). 그래서 목록은 편집 중인
 *   초안이 아니라 **지금 저장된 값**을 읽고, [저장]은 그 사이 바뀐 목록을 덮지 않는다.
 * - 명렬에서 사라진 학생(전출·반 보관)도 "명렬에서 찾지 못한 학생"으로 보여 주고 풀 수 있다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { buildFocusRows } from '@adapters/hooks/reminderExclusionRows';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import { SettingsSection } from './shared/SettingsSection';

export function FocusStudentListSection(): JSX.Element {
  const rr = useSettingsStore((s) => s.settings.recordReminder) ?? DEFAULT_REMINDER_SETTINGS;
  const className = useSettingsStore((s) => s.settings.className);
  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    void useStudentStore.getState().load();
    void useTeachingClassStore.getState().load();
  }, []);

  const rows = useMemo(
    () =>
      buildFocusRows({
        reminder: rr,
        homeroomTitle: className?.trim() ? className.trim() : '담임반',
        students,
        // 보관한 반은 지금 명렬이 아니다 — 그 반 관심 학생은 '명렬에서 찾지 못한 학생'으로(spec §4).
        classes: filterActiveClasses(classes),
      }),
    [rr, className, students, classes],
  );

  const release = async (key: string): Promise<void> => {
    setBusyKey(key);
    try {
      await useSettingsStore.getState().setReminderFocus(key, false);
    } catch {
      useToastStore.getState().show('저장하지 못했어요. 잠시 뒤 다시 해 주세요.', 'error');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <SettingsSection
      icon="person_search"
      iconColor="bg-sp-surface text-sp-muted"
      title="관심 학생"
      description="더 자주 챙길 학생이에요. 공백 문턱이 절반으로 줄어요."
    >
      {rows.length === 0 ? (
        <p className="text-xs text-sp-muted">
          아직 지정한 학생이 없어요. 반 카드의 칸 메뉴에서 관심 학생으로 지정할 수 있어요.
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
              <button
                type="button"
                onClick={() => void release(row.key)}
                disabled={busyKey === row.key}
                aria-label={`${row.label.length > 0 ? `${row.label}번 ` : ''}관심 학생 풀기`}
                className="shrink-0 rounded-lg border border-sp-border px-2.5 py-1 text-xs text-sp-text transition-colors hover:border-sp-accent disabled:cursor-wait disabled:opacity-60"
              >
                풀기
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
