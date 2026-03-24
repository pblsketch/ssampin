import { useState, useCallback, useEffect, useRef } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getCellDotColor } from '@adapters/presenters/timetablePresenter';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ClassListProps {
  onAddClass: () => void;
}

/* ── 드래그 가능한 학급 아이템 ── */
function SortableClassItem({
  cls,
  isSelected,
  onSelect,
  isEditing,
  editName,
  editSubject,
  onEditNameChange,
  onEditSubjectChange,
  onSaveEdit,
  onCancelEdit,
  menuOpenId,
  onToggleMenu,
  onStartEdit,
  confirmDeleteId,
  onConfirmDelete,
  onDelete,
  onCancelDelete,
  menuRef,
  subjectColors,
  classroomColors,
  colorBy,
}: {
  cls: TeachingClass;
  isSelected: boolean;
  onSelect: (id: string) => void;
  isEditing: boolean;
  editName: string;
  editSubject: string;
  onEditNameChange: (v: string) => void;
  onEditSubjectChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  menuOpenId: string | null;
  onToggleMenu: (id: string) => void;
  onStartEdit: (id: string) => void;
  confirmDeleteId: string | null;
  onConfirmDelete: (id: string) => void;
  onDelete: (id: string) => void;
  onCancelDelete: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  subjectColors: SubjectColorMap | undefined;
  classroomColors: SubjectColorMap | undefined;
  colorBy: 'subject' | 'classroom';
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cls.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  if (isEditing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="p-3 rounded-xl bg-sp-card border border-sp-border space-y-2"
      >
        <input
          type="text"
          value={editName}
          onChange={(e) => onEditNameChange(e.target.value)}
          placeholder="학급명"
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
        />
        <input
          type="text"
          value={editSubject}
          onChange={(e) => onEditSubjectChange(e.target.value)}
          placeholder="과목"
          className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
        />
        <div className="flex gap-2">
          <button
            onClick={onSaveEdit}
            className="flex-1 text-xs bg-sp-accent text-white rounded-lg py-1.5 hover:bg-sp-accent/80 transition-colors"
          >
            저장
          </button>
          <button
            onClick={onCancelEdit}
            className="flex-1 text-xs bg-sp-border text-sp-muted rounded-lg py-1.5 hover:bg-sp-border/80 transition-colors"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* 드래그 핸들 */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity z-10"
      >
        <span className="material-symbols-outlined text-sp-muted text-sm">drag_indicator</span>
      </div>

      <button
        onClick={() => onSelect(cls.id)}
        className={`w-full flex items-center gap-3 pl-7 pr-10 py-2.5 rounded-xl transition-all text-left ${
          isSelected
            ? 'bg-sp-accent/10 border-l-2 border-sp-accent'
            : 'hover:bg-sp-text/5 border-l-2 border-transparent'
        }`}
      >
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${getCellDotColor(cls.subject, cls.name, colorBy, subjectColors, classroomColors)}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isSelected ? 'text-sp-text' : 'text-sp-muted'}`}>
            {cls.name}
          </p>
          <p className="text-xs text-sp-muted/70 truncate">{cls.subject}</p>
        </div>
        <span className="text-caption text-sp-muted bg-sp-bg px-1.5 py-0.5 rounded-full shrink-0">
          {cls.students.length}명
        </span>
      </button>

      {/* 더보기 버튼 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleMenu(cls.id);
        }}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${
          isSelected || menuOpenId === cls.id
            ? 'opacity-100 hover:bg-sp-text/10'
            : 'opacity-40 hover:opacity-100 hover:bg-sp-text/10'
        }`}
      >
        <span className="material-symbols-outlined text-sp-muted text-base">more_vert</span>
      </button>

      {/* 컨텍스트 메뉴 */}
      {menuOpenId === cls.id && (
        <div ref={menuRef as React.RefObject<HTMLDivElement>} className="absolute right-2 top-full mt-1 z-20 bg-sp-card border border-sp-border rounded-xl shadow-lg py-1 min-w-[100px]">
          <button
            onClick={() => onStartEdit(cls.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            편집
          </button>
          <button
            onClick={() => onConfirmDelete(cls.id)}
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
          <p className="text-caption text-sp-muted mb-3">
            진도 기록과 출석 기록도 함께 삭제됩니다.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onDelete(cls.id)}
              className="flex-1 text-xs bg-red-500 text-white rounded-lg py-1.5 hover:bg-red-600 transition-colors"
            >
              삭제
            </button>
            <button
              onClick={onCancelDelete}
              className="flex-1 text-xs bg-sp-border text-sp-muted rounded-lg py-1.5 hover:bg-sp-border/80 transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 메인 ClassList ── */
export function ClassList({ onAddClass }: ClassListProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const selectedClassId = useTeachingClassStore((s) => s.selectedClassId);
  const selectClass = useTeachingClassStore((s) => s.selectClass);
  const updateClass = useTeachingClassStore((s) => s.updateClass);
  const deleteClass = useTeachingClassStore((s) => s.deleteClass);
  const reorderClasses = useTeachingClassStore((s) => s.reorderClasses);
  const subjectColors = useSettingsStore((s) => s.settings.subjectColors);
  const classroomColors = useSettingsStore((s) => s.settings.classroomColors);
  const colorBy = useSettingsStore((s) => s.settings.timetableColorBy ?? 'classroom');

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  useEffect(() => {
    if (!menuOpenId) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = classes.findIndex((c) => c.id === active.id);
    const newIndex = classes.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(classes.map((c) => c.id), oldIndex, newIndex);
    void reorderClasses(reordered);
  }, [classes, reorderClasses]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {classes.length === 0 && (
          <p className="text-sp-muted text-xs text-center py-8">
            등록된 학급이 없습니다
          </p>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={classes.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {classes.map((cls) => (
              <SortableClassItem
                key={cls.id}
                cls={cls}
                isSelected={selectedClassId === cls.id}
                onSelect={handleSelect}
                isEditing={editingId === cls.id}
                editName={editName}
                editSubject={editSubject}
                onEditNameChange={setEditName}
                onEditSubjectChange={setEditSubject}
                onSaveEdit={() => void saveEdit()}
                onCancelEdit={cancelEdit}
                menuOpenId={menuOpenId}
                onToggleMenu={(id) => setMenuOpenId(menuOpenId === id ? null : id)}
                onStartEdit={startEdit}
                confirmDeleteId={confirmDeleteId}
                onConfirmDelete={(id) => {
                  setConfirmDeleteId(id);
                  setMenuOpenId(null);
                }}
                onDelete={(id) => void handleDelete(id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
                menuRef={menuRef}
                subjectColors={subjectColors}
                classroomColors={classroomColors}
                colorBy={colorBy}
              />
            ))}
          </SortableContext>
        </DndContext>
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
