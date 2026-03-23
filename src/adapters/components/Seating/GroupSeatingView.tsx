import { useState, useCallback } from 'react';
import type { SeatGroup } from '@domain/entities/Seating';
import { GROUP_COLORS } from '@domain/entities/Seating';
import { useStudentStore } from '@adapters/stores/useStudentStore';

/* ──────────────────────── 학생 칩 ──────────────────────── */

interface StudentChipProps {
  studentId: string;
  groupColor: string;
  isEditing: boolean;
  onRemove: () => void;
}

function StudentChip({ studentId, groupColor, isEditing, onRemove }: StudentChipProps) {
  const getStudent = useStudentStore((s) => s.getStudent);
  const student = getStudent(studentId);
  const studentNumber = student?.studentNumber;

  return (
    <div
      className="relative flex flex-col items-center gap-1"
      style={{ minWidth: '4rem' }}
    >
      {/* 원형 아바타 */}
      <div
        className="w-14 h-14 rounded-full border-2 flex items-center justify-center text-sm font-bold text-sp-text shadow-sm"
        style={{ borderColor: groupColor, background: groupColor + '18' }}
      >
        {student?.name?.charAt(0) ?? '?'}
      </div>
      {/* 이름 + 번호 */}
      <div className="flex flex-col items-center">
        <span className="text-[11px] font-medium text-sp-text leading-tight">
          {student?.name ?? '알 수 없음'}
        </span>
        {studentNumber !== undefined && (
          <span className="text-[9px] text-sp-muted font-mono">
            {String(studentNumber).padStart(2, '0')}번
          </span>
        )}
      </div>
      {/* 편집 모드: 제거 버튼 */}
      {isEditing && (
        <button
          onClick={onRemove}
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] hover:bg-red-600 transition-colors shadow-sm"
          title="모둠에서 제거"
        >
          ×
        </button>
      )}
    </div>
  );
}

/* ──────────────────────── 모둠 카드 ──────────────────────── */

interface GroupCardProps {
  group: SeatGroup;
  isEditing: boolean;
  onUpdate: (updated: SeatGroup) => void;
  onRemove: () => void;
}

function GroupCard({ group, isEditing, onUpdate, onRemove }: GroupCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(group.name);

  const handleNameBlur = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== group.name) {
      onUpdate({ ...group, name: trimmed });
    } else {
      setNameValue(group.name);
    }
  }, [nameValue, group, onUpdate]);

  const handleRemoveStudent = useCallback(
    (sid: string) => {
      onUpdate({
        ...group,
        studentIds: group.studentIds.filter((id) => id !== sid),
      });
    },
    [group, onUpdate],
  );

  const handleMaxSizeChange = useCallback(
    (delta: number) => {
      const newMax = Math.max(2, Math.min(10, group.maxSize + delta));
      if (newMax !== group.maxSize) {
        onUpdate({ ...group, maxSize: newMax });
      }
    },
    [group, onUpdate],
  );

  return (
    <div
      className="rounded-2xl border-2 p-4 min-h-[200px] transition-all"
      style={{ borderColor: group.color + '60', background: group.color + '08' }}
    >
      {/* 모둠 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full shrink-0"
            style={{ background: group.color }}
          />
          {isEditing && editingName ? (
            <input
              className="text-sm font-bold bg-transparent border-b border-sp-border text-sp-text w-24 focus:outline-none focus:border-sp-accent"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              autoFocus
            />
          ) : (
            <span
              className={`text-sm font-bold text-sp-text ${isEditing ? 'cursor-pointer hover:text-sp-accent' : ''}`}
              onClick={() => { if (isEditing) { setEditingName(true); setNameValue(group.name); } }}
            >
              {group.name}
            </span>
          )}
          <span className="text-[10px] text-sp-muted">
            {group.studentIds.length}/{group.maxSize}
          </span>
          {/* 편집 모드: 인원 수 조절 */}
          {isEditing && (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                onClick={() => handleMaxSizeChange(-1)}
                disabled={group.maxSize <= 2}
                className="w-4 h-4 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-30 text-[10px] text-sp-muted transition-colors"
              >
                −
              </button>
              <button
                onClick={() => handleMaxSizeChange(1)}
                disabled={group.maxSize >= 10}
                className="w-4 h-4 flex items-center justify-center rounded border border-sp-border bg-sp-card hover:bg-slate-700 disabled:opacity-30 text-[10px] text-sp-muted transition-colors"
              >
                +
              </button>
            </div>
          )}
        </div>
        {isEditing && (
          <button
            onClick={onRemove}
            className="text-sp-muted hover:text-red-400 transition-colors"
            title="모둠 삭제"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        )}
      </div>

      {/* 학생 목록 — 칩 형태 */}
      <div className="flex flex-wrap gap-3 justify-center">
        {group.studentIds.map((sid) => (
          <StudentChip
            key={sid}
            studentId={sid}
            groupColor={group.color}
            isEditing={isEditing}
            onRemove={() => handleRemoveStudent(sid)}
          />
        ))}
        {/* 빈 슬롯 표시 */}
        {Array.from({ length: Math.max(0, group.maxSize - group.studentIds.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-14 h-14 rounded-full border-2 border-dashed flex items-center justify-center"
            style={{ borderColor: group.color + '30' }}
          >
            <span className="text-sp-muted text-[9px]">빈자리</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────── 미배정 학생 ──────────────────────── */

interface UnassignedStudentsProps {
  groups: readonly SeatGroup[];
  allStudentIds: string[];
  isEditing: boolean;
  onAssignToGroup: (studentId: string, groupId: string) => void;
}

function UnassignedStudents({ groups, allStudentIds, isEditing, onAssignToGroup }: UnassignedStudentsProps) {
  const assignedIds = new Set(groups.flatMap((g) => [...g.studentIds]));
  const unassigned = allStudentIds.filter((id) => !assignedIds.has(id));
  const getStudent = useStudentStore((s) => s.getStudent);

  if (unassigned.length === 0) return null;

  return (
    <div className="mt-6 rounded-xl border border-sp-border/50 bg-sp-card/50 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="material-symbols-outlined text-sp-highlight text-base">person_off</span>
        <span className="text-sm font-medium text-sp-highlight">미배정 학생 ({unassigned.length}명)</span>
      </div>
      <div className="flex flex-wrap gap-3">
        {unassigned.map((sid) => {
          const student = getStudent(sid);
          return (
            <div key={sid} className="flex items-center gap-2 bg-sp-surface rounded-lg px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs text-sp-muted">
                {student?.name?.charAt(0) ?? '?'}
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-sp-text">{student?.name ?? '알 수 없음'}</span>
                {student?.studentNumber !== undefined && (
                  <span className="text-[9px] text-sp-muted font-mono">{String(student.studentNumber).padStart(2, '0')}번</span>
                )}
              </div>
              {isEditing && groups.length > 0 && (
                <select
                  className="ml-2 text-[10px] bg-sp-bg border border-sp-border rounded px-1 py-0.5 text-sp-muted focus:outline-none focus:border-sp-accent"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      onAssignToGroup(sid, e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="" disabled>배정...</option>
                  {groups.filter(g => g.studentIds.length < g.maxSize).map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────────── 메인: GroupSeatingView ──────────────────────── */

interface GroupSeatingViewProps {
  groups: readonly SeatGroup[];
  isEditing: boolean;
  onUpdateGroups: (groups: SeatGroup[]) => void;
  onShuffleGroups: (groupCount: number, maxSize: number) => void;
}

export function GroupSeatingView({ groups, isEditing, onUpdateGroups, onShuffleGroups }: GroupSeatingViewProps) {
  const students = useStudentStore((s) => s.students);
  const allActiveStudentIds = students.filter((s) => !s.isVacant).map((s) => s.id);

  const handleUpdateGroup = useCallback(
    (updated: SeatGroup) => {
      const newGroups = groups.map((g) => (g.id === updated.id ? updated : g));
      onUpdateGroups([...newGroups] as SeatGroup[]);
    },
    [groups, onUpdateGroups],
  );

  const handleRemoveGroup = useCallback(
    (groupId: string) => {
      onUpdateGroups(groups.filter((g) => g.id !== groupId) as SeatGroup[]);
    },
    [groups, onUpdateGroups],
  );

  const handleAddGroup = useCallback(() => {
    const newGroup: SeatGroup = {
      id: `grp-${Date.now()}`,
      name: `${groups.length + 1}모둠`,
      color: GROUP_COLORS[groups.length % GROUP_COLORS.length]!,
      studentIds: [],
      maxSize: 6,
    };
    onUpdateGroups([...groups, newGroup] as SeatGroup[]);
  }, [groups, onUpdateGroups]);

  const handleAssignToGroup = useCallback(
    (studentId: string, groupId: string) => {
      const newGroups = groups.map((g) => {
        if (g.id === groupId && g.studentIds.length < g.maxSize) {
          return { ...g, studentIds: [...g.studentIds, studentId] };
        }
        return g;
      });
      onUpdateGroups([...newGroups] as SeatGroup[]);
    },
    [groups, onUpdateGroups],
  );

  const [showShuffleModal, setShowShuffleModal] = useState(false);
  const [shuffleGroupCount, setShuffleGroupCount] = useState(
    groups.length > 0 ? groups.length : Math.max(1, Math.ceil(allActiveStudentIds.length / 6)),
  );
  const [shuffleMaxSize, setShuffleMaxSize] = useState(6);

  return (
    <div className="w-full max-w-6xl mx-auto pb-8">
      {/* 모둠 설정 버튼 (편집 모드) */}
      {isEditing && (
        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={() => setShowShuffleModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm font-medium text-sp-text transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-base">settings</span>
            모둠 설정
          </button>
        </div>
      )}

      {/* 모둠 그리드 — 2~3열 반응형 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            group={group}
            isEditing={isEditing}
            onUpdate={handleUpdateGroup}
            onRemove={() => handleRemoveGroup(group.id)}
          />
        ))}
      </div>

      {/* 편집 모드: 모둠 추가 버튼 */}
      {isEditing && (
        <button
          onClick={handleAddGroup}
          className="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-sp-border text-sp-muted hover:border-sp-accent hover:text-sp-accent transition-colors text-sm"
        >
          + 모둠 추가
        </button>
      )}

      {/* 미배정 학생 */}
      <UnassignedStudents
        groups={groups}
        allStudentIds={allActiveStudentIds}
        isEditing={isEditing}
        onAssignToGroup={handleAssignToGroup}
      />

      {/* 모둠 설정 모달 */}
      {showShuffleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-sp-card border border-sp-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-sp-text mb-4">모둠 설정</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-sp-muted mb-1">모둠 수</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShuffleGroupCount(Math.max(1, shuffleGroupCount - 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-sp-border bg-sp-surface hover:bg-slate-700 text-sp-text transition-colors"
                  >
                    −
                  </button>
                  <span className="text-lg font-bold text-sp-text w-8 text-center">{shuffleGroupCount}</span>
                  <button
                    onClick={() => setShuffleGroupCount(Math.min(12, shuffleGroupCount + 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-sp-border bg-sp-surface hover:bg-slate-700 text-sp-text transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs text-sp-muted mb-1">모둠당 최대 인원</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShuffleMaxSize(Math.max(2, shuffleMaxSize - 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-sp-border bg-sp-surface hover:bg-slate-700 text-sp-text transition-colors"
                  >
                    −
                  </button>
                  <span className="text-lg font-bold text-sp-text w-8 text-center">{shuffleMaxSize}</span>
                  <button
                    onClick={() => setShuffleMaxSize(Math.min(10, shuffleMaxSize + 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-lg border border-sp-border bg-sp-surface hover:bg-slate-700 text-sp-text transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="text-xs text-sp-muted">
                {allActiveStudentIds.length}명의 학생을 {shuffleGroupCount}개 모둠에 랜덤 배정합니다.
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowShuffleModal(false)}
                className="px-4 py-2 rounded-lg border border-sp-border bg-sp-card hover:bg-slate-700 text-sm text-sp-text transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onShuffleGroups(shuffleGroupCount, shuffleMaxSize);
                  setShowShuffleModal(false);
                }}
                className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
