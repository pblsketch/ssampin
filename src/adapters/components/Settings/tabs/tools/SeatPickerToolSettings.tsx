import { useEffect, useMemo, useState } from 'react';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSeatPickerConfigStore } from '@adapters/stores/useSeatPickerConfigStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { SeatPickerScope } from '@domain/entities/SeatPickerConfig';
import type { Student } from '@domain/entities/Student';

/**
 * 설정 > 도구 > 자리 뽑기
 * - 비공개 사전 배정 관리 UI
 */
export function SeatPickerToolSettings() {
  const seating = useSeatingStore((s) => s.seating);
  const seatingLoaded = useSeatingStore((s) => s.loaded);
  const loadSeating = useSeatingStore((s) => s.load);
  const students = useStudentStore((s) => s.students);
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);
  const cfgLoaded = useSeatPickerConfigStore((s) => s.loaded);
  const loadCfg = useSeatPickerConfigStore((s) => s.load);
  const getPrivateAssignmentsForScope = useSeatPickerConfigStore((s) => s.getPrivateAssignmentsForScope);
  const setPrivateAssignment = useSeatPickerConfigStore((s) => s.setPrivateAssignment);
  const removePrivateAssignment = useSeatPickerConfigStore((s) => s.removePrivateAssignment);
  const clearScope = useSeatPickerConfigStore((s) => s.clearScope);
  const showToast = useToastStore((s) => s.show);

  const [scope, setScope] = useState<SeatPickerScope>('homeroom');
  const [pickerSeatKey, setPickerSeatKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!seatingLoaded) loadSeating();
    if (!tcLoaded) loadTc();
    if (!cfgLoaded) loadCfg();
  }, [seatingLoaded, loadSeating, tcLoaded, loadTc, cfgLoaded, loadCfg]);

  const selectedTc = scope === 'homeroom'
    ? null
    : teachingClasses.find((c) => `tc-${c.id}` === scope) ?? null;

  const activeStudents = useMemo<Student[]>(() => {
    if (scope === 'homeroom') {
      return students.filter((s) => !s.isVacant);
    }
    if (!selectedTc) return [];
    return selectedTc.students
      .filter((s) => !s.isVacant)
      .map((s) => ({
        id: `tc-${selectedTc.id}-${s.number}`,
        studentNumber: s.number,
        name: s.name?.trim() ? s.name : `${s.number}번`,
        isVacant: false,
      }));
  }, [scope, students, selectedTc]);

  const rows = scope === 'homeroom' ? seating.rows : selectedTc?.seating?.rows ?? 0;
  const cols = scope === 'homeroom' ? seating.cols : selectedTc?.seating?.cols ?? 0;
  const hasGrid = rows > 0 && cols > 0;

  const privateAssignments = getPrivateAssignmentsForScope(scope);
  const byKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of privateAssignments) m.set(a.seatKey, a.studentId);
    return m;
  }, [privateAssignments]);
  const fixedStudentIds = useMemo(() => new Set(byKey.values()), [byKey]);

  const studentById = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of activeStudents) m.set(s.id, s);
    return m;
  }, [activeStudents]);

  const scopeLabel = scope === 'homeroom' ? '학급' : (selectedTc?.name ?? '수업반');

  const handleSelectStudent = async (seatKey: string, studentId: string) => {
    try {
      await setPrivateAssignment(scope, seatKey, studentId);
      setPickerSeatKey(null);
    } catch {
      showToast('저장에 실패했습니다', 'error');
    }
  };

  const handleRemove = async (seatKey: string) => {
    try {
      await removePrivateAssignment(scope, seatKey);
      setPickerSeatKey(null);
    } catch {
      showToast('저장에 실패했습니다', 'error');
    }
  };

  const handleClearAll = async () => {
    try {
      await clearScope(scope);
      setConfirmClear(false);
      showToast('사전 배정을 모두 해제했습니다', 'success');
    } catch {
      showToast('해제에 실패했습니다', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 shrink-0">
          <span className="text-2xl leading-none">🪑</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-sp-text">자리 뽑기</h3>
          <p className="text-xs text-sp-muted mt-0.5 leading-relaxed">
            비공개 사전 배정 · 학생이 보지 못하는 이 화면에서 일부 학생의 좌석을 미리 정해두면,
            자리 뽑기 진행 중에 해당 학생이 카드를 뽑는 연출을 거쳐 자연스럽게 그 자리에 배정됩니다.
          </p>
        </div>
      </header>

      {/* Scope selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-sp-muted uppercase tracking-wide">대상</p>
        <div className="flex flex-wrap gap-1.5">
          <ScopeChip
            active={scope === 'homeroom'}
            onClick={() => { setScope('homeroom'); setPickerSeatKey(null); }}
            icon="👩‍🎓"
            label="학급 자리 배치"
          />
          {teachingClasses.map((tc) => {
            const id: SeatPickerScope = `tc-${tc.id}`;
            const count = (tc.students ?? []).filter((s) => !s.isVacant).length;
            return (
              <ScopeChip
                key={tc.id}
                active={scope === id}
                onClick={() => { setScope(id); setPickerSeatKey(null); }}
                icon="📚"
                label={tc.name}
                sub={tc.subject}
                meta={`${count}명`}
              />
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="rounded-xl border border-sp-border bg-sp-surface/40 overflow-hidden">
        {/* Body header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-sp-border bg-sp-surface/60">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-sp-muted truncate">{scopeLabel}</span>
            <span className="text-sp-muted/50">·</span>
            <span className="text-sp-text font-medium">
              사전 배정 <span className="text-purple-300">{privateAssignments.length}</span>명
            </span>
            <span className="text-sp-muted/50">/</span>
            <span className="text-sp-muted">총 {activeStudents.length}명</span>
          </div>
          {privateAssignments.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-xs font-medium text-red-400 hover:text-red-300"
            >
              모두 해제
            </button>
          )}
        </div>

        {/* Body content */}
        <div className="p-5">
          {scope !== 'homeroom' && !selectedTc ? (
            <EmptyNotice tone="warning" text="수업반을 선택하세요." />
          ) : activeStudents.length === 0 ? (
            <EmptyNotice
              tone="warning"
              text={scope === 'homeroom'
                ? '학급에 등록된 학생이 없습니다.'
                : '이 수업반에 등록된 학생이 없습니다.'}
            />
          ) : !hasGrid ? (
            <EmptyNotice
              tone="warning"
              text={scope === 'homeroom'
                ? '좌석 탭에서 먼저 행/열을 지정하세요.'
                : '이 수업반의 좌석 배치가 아직 없습니다. 자리 뽑기에서 한 번 진행하여 배치한 뒤 이용하세요.'}
            />
          ) : (
            <div className="space-y-3">
              {/* 교탁 bar */}
              <div className="bg-sp-surface border border-sp-border rounded-md py-1 px-4 text-center">
                <span className="text-sp-muted text-caption font-semibold tracking-widest">교탁</span>
              </div>

              {/* Grid */}
              <div
                className="grid gap-1.5 mx-auto"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  maxWidth: `${cols * 60}px`,
                }}
              >
                {Array.from({ length: rows }, (_, r) =>
                  Array.from({ length: cols }, (_, c) => {
                    const key = `${r}-${c}`;
                    const assignedId = byKey.get(key);
                    const assignedStudent = assignedId ? studentById.get(assignedId) : undefined;
                    const isPicker = pickerSeatKey === key;

                    return (
                      <div key={key} className="relative">
                        <button
                          type="button"
                          onClick={() => {
                            if (assignedId) {
                              void handleRemove(key);
                            } else {
                              setPickerSeatKey(isPicker ? null : key);
                            }
                          }}
                          className={`w-full aspect-square rounded-md flex flex-col items-center justify-center text-center transition-all ${
                            assignedStudent
                              ? 'bg-purple-500/20 border border-purple-500/50 text-purple-200 hover:bg-purple-500/30 shadow-sm shadow-purple-500/10'
                              : isPicker
                                ? 'bg-purple-500/10 border border-purple-500/40 text-sp-muted ring-1 ring-purple-500/30'
                                : 'bg-sp-card border border-sp-border text-sp-muted/60 hover:bg-purple-500/5 hover:border-purple-500/30 hover:text-sp-muted'
                          }`}
                        >
                          {assignedStudent ? (
                            <>
                              <span className="text-[9px] leading-none opacity-70">🤫</span>
                              <span className="truncate w-full text-caption font-semibold leading-tight px-0.5 mt-0.5">
                                {assignedStudent.name}
                              </span>
                            </>
                          ) : (
                            <span className="text-[9px] leading-none">{r + 1},{c + 1}</span>
                          )}
                        </button>

                        {isPicker && !assignedId && (
                          <div className="absolute z-30 top-full left-0 mt-1 w-40 max-h-48 overflow-auto bg-sp-card border border-sp-border rounded-lg shadow-xl ring-1 ring-black/20">
                            {activeStudents
                              .filter((s) => !fixedStudentIds.has(s.id))
                              .sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0))
                              .map((s) => (
                                <button
                                  type="button"
                                  key={s.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleSelectStudent(key, s.id);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-sp-text hover:bg-purple-500/20 transition-colors"
                                >
                                  {s.studentNumber ?? '-'}번 {s.name}
                                </button>
                              ))}
                            {activeStudents.filter((s) => !fixedStudentIds.has(s.id)).length === 0 && (
                              <div className="px-3 py-2 text-xs text-sp-muted">배정 가능한 학생 없음</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }),
                )}
              </div>

              {/* Hint */}
              <p className="text-detail text-sp-muted/70 text-center pt-1">
                빈 좌석을 눌러 학생을 배정 · 배정된 좌석을 누르면 해제
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Clear confirm */}
      {confirmClear && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" aria-hidden="true">
          <div className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold text-sp-text mb-2">사전 배정 모두 해제</h3>
            <p className="text-sm text-sp-muted mb-6">
              {scopeLabel}의 비공개 사전 배정을 모두 해제합니다.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-medium"
              >
                해제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  icon,
  label,
  sub,
  meta,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  sub?: string;
  meta?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        active
          ? 'bg-sp-accent/15 border-sp-accent text-sp-accent'
          : 'bg-sp-surface border-sp-border text-sp-muted hover:border-sp-accent/40 hover:text-sp-text'
      }`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span>{label}</span>
      {sub && <span className="text-sp-muted/70 font-normal">· {sub}</span>}
      {meta && <span className="text-sp-muted/60 font-normal ml-1">({meta})</span>}
    </button>
  );
}

function EmptyNotice({ tone, text }: { tone: 'warning' | 'info'; text: string }) {
  const cls = tone === 'warning'
    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
    : 'bg-blue-500/10 border-blue-500/30 text-blue-300';
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {text}
    </div>
  );
}
