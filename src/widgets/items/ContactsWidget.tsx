import { useEffect, useMemo, useState } from 'react';
import { useStaffContactStore } from '@adapters/stores/useStaffContactStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  filterContactEntries,
  formatPhoneNumber,
  guardianEntriesOf,
  sortContactEntries,
  staffToEntry,
  studentToEntry,
  type ContactEntry,
} from '@domain/rules/contactRules';

/** 카드가 좁으므로 몇 줄만 보여준다. 모달로 키우면 더 보여준다. */
const COMPACT_LIMIT = 6;
const EXPANDED_LIMIT = 30;

const KIND_ICON: Record<ContactEntry['kind'], string> = {
  staff: 'badge',
  student: 'person',
  guardian: 'escalator_warning',
};

interface ContactsWidgetProps {
  /** false 일 때(모달 확장 뷰) 더 많은 줄을 보여준다. 기본 true(작은 카드 뷰). */
  isCompactMode?: boolean;
}

/**
 * 연락처 위젯 — "전화해야 하는데 번호가 뭐였지"를 대시보드에서 바로 해결한다.
 *
 * **검색하기 전에는 교직원 즐겨찾기만 보여준다.** 이 위젯은 대시보드와 바탕화면
 * 위젯 모드에 늘 떠 있을 수 있어서, 학생·보호자 번호가 가만히 있어도 보이면
 * 화면 공유나 옆자리 눈에 그대로 노출된다. 학생·보호자는 **선생님이 직접 검색했을
 * 때만** 결과에 나온다.
 */
export function ContactsWidget({ isCompactMode = true }: ContactsWidgetProps = {}) {
  const [query, setQuery] = useState('');

  const contacts = useStaffContactStore((s) => s.contacts);
  const loadStaff = useStaffContactStore((s) => s.load);
  const students = useStudentStore((s) => s.students);
  const loadStudents = useStudentStore((s) => s.load);
  const show = useToastStore((s) => s.show);

  useEffect(() => {
    void loadStaff();
    void loadStudents();
  }, [loadStaff, loadStudents]);

  const limit = isCompactMode ? COMPACT_LIMIT : EXPANDED_LIMIT;
  const searching = query.trim() !== '';

  /** 검색 중일 때만 학생·보호자까지 훑는다(위 주석의 노출 정책). */
  const rows = useMemo<ContactEntry[]>(() => {
    const staffEntries = contacts.map(staffToEntry);

    if (!searching) {
      return sortContactEntries(staffEntries.filter((e) => e.favorite)).slice(0, limit);
    }

    const studentEntries = students
      .map(studentToEntry)
      .filter((e): e is ContactEntry => e !== null);
    const guardianEntries = students.flatMap(guardianEntriesOf);

    return filterContactEntries(
      [...staffEntries, ...studentEntries, ...guardianEntries],
      query,
    ).slice(0, limit);
  }, [contacts, students, query, searching, limit]);

  const copy = async (entry: ContactEntry): Promise<void> => {
    if (entry.phone === undefined) return;
    try {
      await navigator.clipboard.writeText(entry.phone);
      show(`${entry.name} 번호를 복사했습니다`, 'success');
    } catch {
      show('번호를 복사하지 못했습니다', 'error');
    }
  };

  const emptyHint = (): string => {
    if (searching) return '찾는 연락처가 없습니다';
    if (contacts.length === 0) return '연락처 화면에서 교직원을 등록해보세요';
    return '자주 찾는 사람에 별(★)을 달아두면 여기 바로 뜹니다';
  };

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="relative shrink-0">
        <span className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base text-sp-muted">
          search
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·번호로 찾기"
          aria-label="연락처 검색"
          className="min-h-6 min-w-6 w-full rounded-lg border border-sp-border bg-sp-surface py-1.5 pl-8 pr-2 text-sm text-sp-text placeholder-sp-muted transition-colors focus:border-sp-accent focus:outline-none"
        />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-2 text-center">
          <span className="material-symbols-outlined text-2xl text-sp-muted">contacts</span>
          <p className="text-xs leading-relaxed text-sp-muted">{emptyHint()}</p>
        </div>
      ) : (
        <ul className="flex-1 space-y-1 overflow-y-auto">
          {rows.map((entry) => (
            <li key={entry.key}>
              <button
                type="button"
                onClick={() => void copy(entry)}
                title={entry.phone !== undefined ? '번호 복사' : '등록된 번호 없음'}
                className="flex min-h-6 min-w-6 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sp-surface"
              >
                <span className="material-symbols-outlined shrink-0 text-base text-sp-muted">
                  {KIND_ICON[entry.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-sp-text">
                    {entry.favorite && <span className="mr-1 text-amber-400">★</span>}
                    {entry.name}
                  </span>
                  {entry.subtitle !== '' && (
                    <span className="block truncate text-[11px] text-sp-muted">
                      {entry.subtitle}
                    </span>
                  )}
                </span>
                {entry.phone !== undefined && (
                  <span className="shrink-0 font-mono text-xs text-sp-muted">
                    {formatPhoneNumber(entry.phone)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 검색 중에만, 잘린 결과가 있다는 사실을 숨기지 않는다. */}
      {searching && rows.length === limit && (
        <p className="shrink-0 text-center text-[11px] text-sp-muted">
          상위 {limit}명만 표시합니다
        </p>
      )}
    </div>
  );
}
