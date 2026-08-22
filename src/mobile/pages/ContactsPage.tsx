import { useEffect, useMemo, useState } from 'react';
import { useMobileStaffContactStore } from '@mobile/stores/useMobileStaffContactStore';
import { useMobileStudentStore } from '@mobile/stores/useMobileStudentStore';
import {
  filterContactEntries,
  formatPhoneNumber,
  guardianEntriesOf,
  staffToEntry,
  studentToEntry,
  telHref,
  type ContactEntry,
} from '@domain/rules/contactRules';

interface Props {
  onBack: () => void;
}

type ContactTab = 'staff' | 'student' | 'guardian';

const TAB_LABELS: Record<ContactTab, string> = {
  staff: '교직원',
  student: '학생',
  guardian: '보호자',
};

const KIND_ICON: Record<ContactEntry['kind'], string> = {
  staff: 'badge',
  student: 'person',
  guardian: 'escalator_warning',
};

/** 한 줄 — 누르면 바로 전화가 걸린다(모바일의 존재 이유). */
function ContactRow({ entry }: { entry: ContactEntry }) {
  const href = telHref(entry.phone);

  const body = (
    <>
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/5 shrink-0">
        <span className="material-symbols-outlined text-sp-muted text-icon-lg">
          {KIND_ICON[entry.kind]}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sp-text font-medium text-sm truncate">
          {entry.favorite && <span className="text-sp-warning mr-1">★</span>}
          {entry.name}
        </p>
        <p className="text-sp-muted text-xs truncate">
          {entry.phone !== undefined ? formatPhoneNumber(entry.phone) : entry.subtitle}
        </p>
      </div>
      {href !== null && (
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-sp-surface shrink-0">
          <span className="material-symbols-outlined text-sp-success text-icon-lg">call</span>
        </div>
      )}
    </>
  );

  if (href === null) {
    return (
      <div
        className="flex items-center gap-3 w-full px-4 py-3 glass-card"
        style={{ minHeight: 44 }}
      >
        {body}
      </div>
    );
  }

  return (
    <a
      href={href}
      className="flex items-center gap-3 w-full px-4 py-3 glass-card active:scale-[0.98] transition-transform"
      style={{ minHeight: 44 }}
    >
      {body}
    </a>
  );
}

export function ContactsPage({ onBack }: Props) {
  const [tab, setTab] = useState<ContactTab>('staff');
  const [query, setQuery] = useState('');

  const contacts = useMobileStaffContactStore((s) => s.contacts);
  const staffLoaded = useMobileStaffContactStore((s) => s.loaded);
  const students = useMobileStudentStore((s) => s.students);
  const studentsLoaded = useMobileStudentStore((s) => s.loaded);

  useEffect(() => {
    void useMobileStaffContactStore.getState().load();
    void useMobileStudentStore.getState().load();
  }, []);

  const entries = useMemo<ContactEntry[]>(() => {
    if (tab === 'staff') return contacts.map(staffToEntry);
    if (tab === 'student') {
      return students.map(studentToEntry).filter((e): e is ContactEntry => e !== null);
    }
    return students.flatMap(guardianEntriesOf);
  }, [tab, contacts, students]);

  const visible = useMemo(() => filterContactEntries(entries, query), [entries, query]);

  const loaded = tab === 'staff' ? staffLoaded : studentsLoaded;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">연락처</h2>
      </header>

      <div className="px-4 pt-3 pb-2 space-y-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-black/5">
          {(Object.keys(TAB_LABELS) as ContactTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                tab === t ? 'bg-sp-accent text-white' : 'text-sp-muted'
              }`}
              style={{ minHeight: 44 }}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·번호로 찾기 (초성도 됩니다)"
          className="w-full bg-black/5 rounded-xl px-4 py-3 text-sm text-sp-text placeholder-sp-muted focus:outline-none"
          style={{ minHeight: 44 }}
        />
      </div>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">
            progress_activity
          </span>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <span className="material-symbols-outlined text-sp-muted text-4xl">contact_phone</span>
          <p className="text-sp-muted text-sm leading-relaxed">
            {query !== '' ? (
              '찾는 연락처가 없어요.'
            ) : (
              <>
                연락처가 없어요.
                <br />
                PC 앱에서 등록한 뒤 동기화하세요.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {visible.map((entry) => (
            <ContactRow key={entry.key} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
