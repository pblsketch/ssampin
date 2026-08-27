import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { getCellDotColor } from '@adapters/presenters/timetablePresenter';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { SubjectColorMap } from '@domain/valueObjects/SubjectColor';
import { filterActiveClasses, filterArchivedClasses } from '@domain/rules/teachingClassArchive';
import { ArchivedClassesSection } from './ArchivedClassesSection';
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog';
import { ArchivedTermNotice } from '@adapters/components/SchoolYearWizard/ArchivedTermNotice';
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
  onBeforeSelect?: () => Promise<boolean> | boolean;
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
  onArchive,
  confirmDeleteId,
  onConfirmDelete,
  onDelete,
  onCancelDelete,
  menuRef,
  subjectColors,
  classroomColors,
  colorBy,
  selectMode,
  isChecked,
  onToggleCheck,
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
  onArchive: (id: string) => void;
  confirmDeleteId: string | null;
  onConfirmDelete: (id: string) => void;
  onDelete: (id: string) => void;
  onCancelDelete: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  subjectColors: SubjectColorMap | undefined;
  classroomColors: SubjectColorMap | undefined;
  colorBy: 'subject' | 'classroom';
  /** 다중 선택(일괄 보관) 모드 — 드래그 재정렬은 비활성된다 */
  selectMode: boolean;
  isChecked: boolean;
  onToggleCheck: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cls.id,
    disabled: selectMode, // 선택 모드 중에는 드래그 재정렬 비활성 (체크와 충돌 방지)
  });

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
      {/* 드래그 핸들 (선택 모드에서는 체크박스가 이 자리를 대신한다) */}
      {!selectMode && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-8 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity z-10"
        >
          <span className="material-symbols-outlined text-sp-muted text-sm">drag_indicator</span>
        </div>
      )}
      {selectMode && (
        <span
          aria-hidden="true"
          className="absolute left-0.5 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center pointer-events-none"
        >
          <span
            className={`material-symbols-outlined text-lg ${isChecked ? 'text-sp-accent' : 'text-sp-muted'}`}
          >
            {isChecked ? 'check_box' : 'check_box_outline_blank'}
          </span>
        </span>
      )}

      <button
        onClick={() => (selectMode ? onToggleCheck(cls.id) : onSelect(cls.id))}
        aria-pressed={selectMode ? isChecked : undefined}
        className={`w-full flex items-center gap-3 pl-7 pr-10 py-2.5 rounded-xl transition-all text-left ${
          selectMode && isChecked
            ? 'bg-sp-surface ring-1 ring-sp-accent border-l-[3px] border-transparent'
            : isSelected && !selectMode
              ? 'bg-sp-accent/15 border-l-[3px] border-sp-accent ring-1 ring-sp-accent/25'
              : 'hover:bg-sp-text/5 border-l-[3px] border-transparent'
        }`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${getCellDotColor(cls.subject, cls.name, colorBy, subjectColors, classroomColors)}`}
        />
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${isSelected ? 'text-sp-text' : 'text-sp-muted'}`}
          >
            {cls.name}
          </p>
          <p className="text-xs text-sp-muted/70 truncate">{cls.subject}</p>
        </div>
        {isSelected ? (
          <span className="flex items-center gap-1 shrink-0">
            <span className="material-symbols-outlined text-icon-sm text-sp-accent">
              check_circle
            </span>
            <span className="text-caption text-sp-accent font-medium bg-sp-accent/10 px-1.5 py-0.5 rounded-full">
              {cls.students.length}명
            </span>
          </span>
        ) : (
          <span className="text-caption text-sp-muted bg-sp-bg px-1.5 py-0.5 rounded-full shrink-0">
            {cls.students.length}명
          </span>
        )}
      </button>

      {/* 더보기 버튼 (선택 모드에서는 숨김 — 개별 액션 대신 일괄 보관 바를 쓴다) */}
      {!selectMode && (
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
      )}

      {/* 컨텍스트 메뉴 — 보관(캐비닛)과 삭제(파괴)는 아이콘·색·위치로 분리한다 */}
      {menuOpenId === cls.id && !selectMode && (
        <div
          ref={menuRef as React.RefObject<HTMLDivElement>}
          data-sp-floating
          className="absolute right-2 top-full mt-1 z-20 bg-sp-card border border-sp-border rounded-xl shadow-lg py-1 min-w-[128px]"
        >
          <button
            onClick={() => onArchive(cls.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sp-text hover:bg-sp-surface transition-colors"
          >
            <span className="material-symbols-outlined text-sm text-sp-muted">inventory_2</span>
            보관
          </button>
          <button
            onClick={() => onStartEdit(cls.id)}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sp-text hover:bg-sp-text/5 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">edit</span>
            편집
          </button>
          <div className="my-1 border-t border-sp-border" />
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
        <div
          data-sp-floating
          className="absolute right-0 top-full mt-1 z-20 bg-sp-card border border-sp-border rounded-xl shadow-lg p-3 min-w-[180px]"
        >
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
export function ClassList({ onAddClass, onBeforeSelect }: ClassListProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const selectedClassId = useTeachingClassStore((s) => s.selectedClassId);
  const selectClass = useTeachingClassStore((s) => s.selectClass);
  const updateClass = useTeachingClassStore((s) => s.updateClass);
  const deleteClass = useTeachingClassStore((s) => s.deleteClass);
  const reorderClasses = useTeachingClassStore((s) => s.reorderClasses);
  const archiveClasses = useTeachingClassStore((s) => s.archiveClasses);
  const unarchiveClass = useTeachingClassStore((s) => s.unarchiveClass);
  const showToast = useToastStore((s) => s.show);
  const subjectColors = useSettingsStore((s) => s.settings.subjectColors);
  const classroomColors = useSettingsStore((s) => s.settings.classroomColors);
  const colorBy = useSettingsStore((s) => s.settings.timetableColorBy ?? 'classroom');

  // 활성/보관 분리 — 판정은 도메인 규칙만 사용 (archived 필드 직접 비교 금지)
  const activeClasses = useMemo(() => filterActiveClasses(classes), [classes]);
  const archivedClasses = useMemo(() => filterArchivedClasses(classes), [classes]);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // 다중 선택(일괄 보관) 모드
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(() => new Set());
  // 보관 확인 다이얼로그 대상 (1개 = 단건 kebab, 여러 개 = 일괄)
  const [archiveTargetIds, setArchiveTargetIds] = useState<readonly string[] | null>(null);
  // 하단 보관 섹션 펼침 여부
  const [showArchived, setShowArchived] = useState(false);
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

  const handleSelect = useCallback(
    async (id: string) => {
      if (id === selectedClassId) {
        setMenuOpenId(null);
        return;
      }
      const canSelect = await onBeforeSelect?.();
      if (canSelect === false) return;
      selectClass(id);
      setMenuOpenId(null);
    },
    [onBeforeSelect, selectClass, selectedClassId],
  );

  const startEdit = useCallback(
    (id: string) => {
      const cls = classes.find((c) => c.id === id);
      if (!cls) return;
      setEditingId(id);
      setEditName(cls.name);
      setEditSubject(cls.subject);
      setMenuOpenId(null);
    },
    [classes],
  );

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

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteClass(id);
      setConfirmDeleteId(null);
      setMenuOpenId(null);
    },
    [deleteClass],
  );

  /* ── 보관(아카이브) ── */

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setCheckedIds(new Set());
  }, []);

  const toggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // kebab "보관" — 확인 다이얼로그를 띄운다 (즉시 실행하지 않는다)
  const requestArchive = useCallback((id: string) => {
    setArchiveTargetIds([id]);
    setMenuOpenId(null);
  }, []);

  // 액션 바 "선택한 N개 보관" — 같은 다이얼로그를 일괄 모드로 띄운다
  const requestBulkArchive = useCallback(() => {
    if (checkedIds.size === 0) return;
    setArchiveTargetIds([...checkedIds]);
  }, [checkedIds]);

  const archiveTargets = useMemo(() => {
    if (!archiveTargetIds) return null;
    return archiveTargetIds
      .map((id) => classes.find((c) => c.id === id))
      .filter((c): c is TeachingClass => c !== undefined);
  }, [archiveTargetIds, classes]);

  // 단건 보관 시 활성으로 남는 같은 그룹(교실) 형제 수 — 확인 문구 "다른 과목 N개는 계속 활성"
  const activeSiblingCount = useMemo(() => {
    if (!archiveTargets || archiveTargets.length !== 1) return 0;
    const target = archiveTargets[0];
    if (!target?.groupId) return 0;
    return activeClasses.filter((c) => c.groupId === target.groupId && c.id !== target.id).length;
  }, [archiveTargets, activeClasses]);

  const confirmArchive = useCallback(async () => {
    if (!archiveTargets || archiveTargets.length === 0) return;
    const ids = archiveTargets.map((c) => c.id);
    // 단건도 archiveClasses 경유 = 저장·업로드 각 1회 (S1.2 AC-9)
    await archiveClasses(ids);
    setArchiveTargetIds(null);
    exitSelectMode();
    const first = archiveTargets[0];
    const label =
      archiveTargets.length === 1 && first
        ? `'${first.name}(${first.subject})'을 보관했어요`
        : `수업반 ${archiveTargets.length}개를 보관했어요`;
    showToast(`${label} — 기록은 그대로 남아 있어요`, 'success', {
      label: '보관함 보기',
      onClick: () => setShowArchived(true),
    });
  }, [archiveTargets, archiveClasses, exitSelectMode, showToast]);

  // 보관 해제 — 가역 작업이라 확인 없이 즉시 실행 + 토스트 (plan §4 S1.3)
  const handleUnarchive = useCallback(
    async (id: string) => {
      const target = classes.find((c) => c.id === id);
      await unarchiveClass(id);
      const label = target ? `'${target.name}(${target.subject})'` : '수업반';
      showToast(`${label} 보관을 해제했어요 — 활성 목록 맨 아래에 있어요`);
    },
    [classes, unarchiveClass, showToast],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // 재정렬 대상은 활성 반뿐 — 보관된 반 id는 넘기지 않는다(스토어가 원본 유지, 함정 ⑩)
      const oldIndex = activeClasses.findIndex((c) => c.id === active.id);
      const newIndex = activeClasses.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(
        activeClasses.map((c) => c.id),
        oldIndex,
        newIndex,
      );
      void reorderClasses(reordered);
    },
    [activeClasses, reorderClasses],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {/* 다중 선택 컨트롤 — 학기 전환처럼 여러 반을 한 번에 정리하는 흐름 */}
        {activeClasses.length > 1 && !selectMode && (
          <div className="flex justify-end px-1">
            <button
              onClick={() => setSelectMode(true)}
              title="여러 반을 골라 한 번에 보관해요"
              className="flex items-center gap-1 text-caption text-sp-muted hover:text-sp-text transition-colors"
            >
              <span className="material-symbols-outlined text-sm">checklist</span>
              선택
            </button>
          </div>
        )}
        {selectMode && (
          <div className="rounded-lg border border-sp-border bg-sp-surface px-2 py-1.5 flex items-center gap-1.5">
            <span className="text-caption font-medium text-sp-text flex-1">
              {checkedIds.size}개 선택
            </span>
            <button
              onClick={requestBulkArchive}
              disabled={checkedIds.size === 0}
              className="flex items-center gap-1 text-caption font-sp-semibold bg-sp-accent text-sp-accent-fg rounded-md px-2 py-1 hover:brightness-110 transition-all disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">inventory_2</span>
              선택한 {checkedIds.size}개 보관
            </button>
            <button
              onClick={exitSelectMode}
              className="text-caption text-sp-muted hover:text-sp-text px-1 transition-colors"
            >
              취소
            </button>
          </div>
        )}

        {classes.length === 0 && (
          <div className="py-8 space-y-4">
            <p className="text-sp-muted text-xs text-center">등록된 학급이 없습니다</p>
            {/* S2.5 — 학년도 전환 직후엔 "없음"만 단독으로 두지 않는다(보관 사실 안내) */}
            <ArchivedTermNotice />
          </div>
        )}

        {/* 모든 반이 보관된 경우 — 죽은 화면 금지: 보관 섹션으로 안내한다 */}
        {classes.length > 0 && activeClasses.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <span className="material-symbols-outlined text-3xl text-sp-muted opacity-60">
              inventory_2
            </span>
            <p className="text-xs text-sp-muted">모든 수업반이 보관되어 있어요</p>
            <button
              onClick={() => setShowArchived(true)}
              className="text-xs text-sp-accent hover:underline"
            >
              보관된 수업반 보기
            </button>
          </div>
        )}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={activeClasses.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            {activeClasses.map((cls) => (
              <SortableClassItem
                key={cls.id}
                cls={cls}
                isSelected={selectedClassId === cls.id}
                onSelect={(id) => void handleSelect(id)}
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
                onArchive={requestArchive}
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
                selectMode={selectMode}
                isChecked={checkedIds.has(cls.id)}
                onToggleCheck={toggleCheck}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* 보관된 수업반 — 학기 → 교실 2단 그룹, 어떤 항목도 숨기지 않는다 */}
        {archivedClasses.length > 0 && (
          <ArchivedClassesSection
            archivedClasses={archivedClasses}
            selectedClassId={selectedClassId}
            open={showArchived}
            onToggle={() => setShowArchived((v) => !v)}
            onSelect={(id) => void handleSelect(id)}
            onUnarchive={(id) => void handleUnarchive(id)}
          />
        )}
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

      {/* 보관 확인 다이얼로그 (단건·일괄 공용) */}
      {archiveTargets && archiveTargets.length > 0 && (
        <ArchiveConfirmDialog
          targets={archiveTargets}
          activeSiblingCount={activeSiblingCount}
          onConfirm={() => void confirmArchive()}
          onCancel={() => setArchiveTargetIds(null)}
        />
      )}
    </div>
  );
}
