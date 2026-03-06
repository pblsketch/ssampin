import { useState, useCallback } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';

interface ClassListProps {
  onAddClass: () => void;
}

/** 과목명 → Tailwind 색상 매핑 */
const SUBJECT_COLOR_MAP: Record<string, string> = {
  '국어': 'bg-yellow-400',
  '영어': 'bg-green-400',
  '수학': 'bg-blue-400',
  '과학': 'bg-purple-400',
  '사회': 'bg-orange-400',
  '체육': 'bg-red-400',
  '음악': 'bg-pink-400',
  '미술': 'bg-indigo-400',
  '창체': 'bg-teal-400',
};

function getSubjectColor(subject: string): string {
  return SUBJECT_COLOR_MAP[subject] ?? 'bg-sp-muted';
}

export function ClassList({ onAddClass }: ClassListProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const selectedClassId = useTeachingClassStore((s) => s.selectedClassId);
  const selectClass = useTeachingClassStore((s) => s.selectClass);
  const updateClass = useTeachingClassStore((s) => s.updateClass);
  const deleteClass = useTeachingClassStore((s) => s.deleteClass);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSelect = useCallback((id: string) => {
    selectClass(id);
    setMenuOpenId(null);
  }, [selectClass]);

  const startEdit = useCallback((id: string) => {
    const cls = classes.find((c) => c.id === id);
    if (!cls) return;
    setEditingId(id);
    setEditName(cls.name);
    setEditSubject(cls.subject);
    setMenuOpenId(null);
  }, [classes]);

  const saveEdit = useCallback(async () => {
    if (!editingId) return;
    const cls = classes.find((c) => c.id === editingId);
    if (!cls) return;
    const trimmedName = editName.trim();
    const trimmedSubject = editSubject.trim();
    if (!trimmedName || !trimmedSubject) return;
    await updateClass({
      ...cls,
      name: trimmedName,
      subject: trimmedSubject,
    });
    setEditingId(null);
  }, [editingId, editName, editSubject, classes, updateClass]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteClass(id);
    setConfirmDeleteId(null);
    setMenuOpenId(null);
  }, [deleteClass]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {classes.length === 0 && (
          <p className="text-sp-muted text-xs text-center py-8">
            등록된 학급이 없습니다
          </p>
        )}
        {classes.map((cls) => {
          const isSelected = selectedClassId === cls.id;
          const isEditing = editingId === cls.id;

          if (isEditing) {
            return (
              <div
                key={cls.id}
                className="p-3 rounded-xl bg-sp-card border border-sp-border space-y-2"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="학급명"
                  className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                />
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  placeholder="과목"
                  className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveEdit()}
                    className="flex-1 text-xs bg-sp-accent text-white rounded-lg py-1.5 hover:bg-sp-accent/80 transition-colors"
                  >
                    저장
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex-1 text-xs bg-sp-border text-sp-muted rounded-lg py-1.5 hover:bg-sp-border/80 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={cls.id} className="relative group">
              <button
                onClick={() => handleSelect(cls.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  isSelected
                    ? 'bg-sp-accent/10 border-l-2 border-sp-accent'
                    : 'hover:bg-white/5 border-l-2 border-transparent'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getSubjectColor(cls.subject)}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-sp-text' : 'text-sp-muted'}`}>
                    {cls.name}
                  </p>
                  <p className="text-xs text-sp-muted/70 truncate">{cls.subject}</p>
                </div>
                <span className="text-[10px] text-sp-muted bg-sp-bg px-1.5 py-0.5 rounded-full shrink-0">
                  {cls.students.length}명
                </span>
              </button>

              {/* 더보기 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId(menuOpenId === cls.id ? null : cls.id);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/10"
              >
                <span className="material-symbols-outlined text-sp-muted text-base">more_vert</span>
              </button>

              {/* 컨텍스트 메뉴 */}
              {menuOpenId === cls.id && (
                <div className="absolute right-2 top-full mt-1 z-20 bg-sp-card border border-sp-border rounded-xl shadow-lg py-1 min-w-[100px]">
                  <button
                    onClick={() => startEdit(cls.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sp-text hover:bg-white/5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">edit</span>
                    편집
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDeleteId(cls.id);
                      setMenuOpenId(null);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                    삭제
                  </button>
                </div>
              )}

              {/* 삭제 확인 다이얼로그 */}
              {confirmDeleteId === cls.id && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-sp-card border border-sp-border rounded-xl shadow-lg p-3 min-w-[180px]">
                  <p className="text-xs text-sp-text mb-2">
                    &apos;{cls.name}&apos; 학급을 삭제하시겠습니까?
                  </p>
                  <p className="text-[10px] text-sp-muted mb-3">
                    진도 기록과 출석 기록도 함께 삭제됩니다.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleDelete(cls.id)}
                      className="flex-1 text-xs bg-red-500 text-white rounded-lg py-1.5 hover:bg-red-600 transition-colors"
                    >
                      삭제
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 text-xs bg-sp-border text-sp-muted rounded-lg py-1.5 hover:bg-sp-border/80 transition-colors"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 추가 버튼 */}
      <div className="p-3 border-t border-sp-border">
        <button
          onClick={onAddClass}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sp-accent hover:bg-sp-accent/10 transition-colors text-sm"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          학급 추가
        </button>
      </div>
    </div>
  );
}
