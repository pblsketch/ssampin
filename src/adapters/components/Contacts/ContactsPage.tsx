import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { useToastStore } from '@adapters/components/common/Toast';
import { useStaffContactStore } from '@adapters/stores/useStaffContactStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import type { StaffContact } from '@domain/entities/StaffContact';
import {
  filterContactEntries,
  guardianEntriesOf,
  staffToEntry,
  studentToEntry,
  type ContactEntry,
} from '@domain/rules/contactRules';
import { ContactRow } from './ContactRow';
import { StaffContactEditModal } from './StaffContactEditModal';
import { StaffExcelImportModal } from './StaffExcelImportModal';

type ContactTab = 'staff' | 'student' | 'guardian';

const TAB_LABELS: Record<ContactTab, string> = {
  staff: '교직원',
  student: '학생',
  guardian: '보호자',
};

export function ContactsPage() {
  const [tab, setTab] = useState<ContactTab>('staff');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<StaffContact | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const contacts = useStaffContactStore((s) => s.contacts);
  const loadStaff = useStaffContactStore((s) => s.load);
  const addStaff = useStaffContactStore((s) => s.add);
  const updateStaff = useStaffContactStore((s) => s.update);
  const removeStaff = useStaffContactStore((s) => s.remove);
  const toggleFavorite = useStaffContactStore((s) => s.toggleFavorite);
  const importRows = useStaffContactStore((s) => s.importRows);

  const students = useStudentStore((s) => s.students);
  const loadStudents = useStudentStore((s) => s.load);
  const show = useToastStore((s) => s.show);

  useEffect(() => {
    void loadStaff();
    void loadStudents();
  }, [loadStaff, loadStudents]);

  const entries = useMemo<ContactEntry[]>(() => {
    if (tab === 'staff') return contacts.map(staffToEntry);
    if (tab === 'student') {
      return students.map(studentToEntry).filter((e): e is ContactEntry => e !== null);
    }
    return students.flatMap(guardianEntriesOf);
  }, [tab, contacts, students]);

  const visible = useMemo(() => filterContactEntries(entries, query), [entries, query]);

  const openAdd = (): void => {
    setEditing(null);
    setEditOpen(true);
  };

  const openEdit = (id: string): void => {
    setEditing(contacts.find((c) => c.id === id) ?? null);
    setEditOpen(true);
  };

  const handleDelete = async (id: string, name: string): Promise<void> => {
    if (!window.confirm(`${name} 연락처를 지울까요?`)) return;
    await removeStaff(id);
    show(`${name} 연락처를 지웠습니다`, 'info');
  };

  const emptyMessage = (): { icon: string; title: string; hint: string } => {
    if (query !== '') {
      return {
        icon: 'search_off',
        title: '검색 결과가 없습니다',
        hint: '다른 이름이나 번호로 찾아보세요',
      };
    }
    if (tab === 'staff') {
      return {
        icon: 'contact_page',
        title: '등록된 교직원 연락처가 없습니다',
        hint: '엑셀로 한 번에 등록하거나, 직접 추가해보세요',
      };
    }
    return {
      icon: 'contact_phone',
      title:
        tab === 'student' ? '등록된 학생 연락처가 없습니다' : '등록된 보호자 연락처가 없습니다',
      hint: '담임 업무 › 명렬 관리에서 연락처를 입력하면 여기에 모입니다',
    };
  };

  const empty = emptyMessage();

  return (
    <div className="flex flex-col h-full -m-8">
      <PageHeader
        icon="contacts"
        iconIsMaterial
        title="연락처"
        leftAddon={
          <span className="text-sp-muted text-sm font-sp-medium">
            교직원·학생·보호자 연락처를 한곳에서
          </span>
        }
        rightActions={
          tab === 'staff' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-sp-surface border border-sp-border text-sp-text hover:border-sp-accent transition-colors"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                엑셀로 등록
              </button>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-sp-accent text-white hover:brightness-110 transition-all"
              >
                <span className="material-symbols-outlined text-base">person_add</span>
                추가
              </button>
            </div>
          ) : null
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-8 space-y-4">
        {/* 탭 + 검색 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-sp-surface/60 border border-sp-border/50">
            {(Object.keys(TAB_LABELS) as ContactTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  tab === t
                    ? 'bg-sp-accent text-white'
                    : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sp-muted text-lg pointer-events-none">
              search
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·부서·번호로 찾기 (초성도 됩니다)"
              className="w-full bg-sp-surface border border-sp-border rounded-lg pl-10 pr-3 py-2.5 text-sm text-sp-text placeholder-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors"
            />
          </div>

          <span className="text-sp-muted text-sm shrink-0">{visible.length}명</span>
        </div>

        {/* 학생·보호자 탭 안내 — 여기서는 고칠 수 없다는 걸 분명히 알린다. */}
        {tab !== 'staff' && (
          <p className="text-sp-muted text-xs px-1">
            학생·보호자 연락처는 <span className="text-sp-text">담임 업무 › 명렬 관리</span>에서
            입력합니다. 여기서는 찾아보기만 할 수 있습니다.
          </p>
        )}

        {/* 목록 */}
        {visible.length === 0 ? (
          <div className="py-16 text-center">
            <span className="material-symbols-outlined text-5xl text-sp-muted/40 mb-3 block">
              {empty.icon}
            </span>
            <p className="text-sp-text">{empty.title}</p>
            <p className="text-sp-muted text-sm mt-1">{empty.hint}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((entry) => (
              <ContactRow
                key={entry.key}
                entry={entry}
                actions={
                  entry.kind === 'staff' ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(entry.sourceId)}
                        title={entry.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          entry.favorite
                            ? 'text-amber-400 hover:bg-amber-500/10'
                            : 'text-sp-muted hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg">star</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(entry.sourceId)}
                        title="수정"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sp-muted hover:text-sp-accent hover:bg-sp-accent/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(entry.sourceId, entry.name)}
                        title="삭제"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sp-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  ) : null
                }
              />
            ))}
          </div>
        )}
      </div>

      <StaffContactEditModal
        isOpen={editOpen}
        contact={editing}
        onClose={() => setEditOpen(false)}
        onSubmit={async (draft) => {
          if (editing === null) {
            await addStaff(draft);
            show(`${draft.name} 연락처를 추가했습니다`, 'success');
          } else {
            await updateStaff(editing.id, draft);
            show(`${draft.name} 연락처를 수정했습니다`, 'success');
          }
        }}
      />

      <StaffExcelImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        existingCount={contacts.length}
        onImport={(result, mode) => importRows(result.rows, mode)}
      />
    </div>
  );
}
