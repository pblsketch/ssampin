/**
 * RosterCopyAction.tsx
 *
 * 담임반 명렬을 선택한 수업반에 일괄 복사하는 설정 액션.
 *
 * Phase 5 — 담임반과 수업반 명렬이 분리된 4 시스템(H-5) 중 사용자 명시
 * 호출로 통합 가능한 워크플로 제공.
 *
 * 디자인: `docs/02-design/features/roster-data-consistency.design.md` §7.2
 */

import { useEffect, useMemo, useState } from 'react';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { isStudentActive } from '@domain/rules/studentActivity';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';

export function RosterCopyAction() {
  const students = useStudentStore((s) => s.students);
  const studentsLoaded = useStudentStore((s) => s.loaded);
  const loadStudents = useStudentStore((s) => s.load);
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);
  const updateClass = useTeachingClassStore((s) => s.updateClass);
  const showToast = useToastStore((s) => s.show);

  const [targetId, setTargetId] = useState<string>('');
  const [confirming, setConfirming] = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!studentsLoaded) void loadStudents();
    if (!tcLoaded) void loadTc();
  }, [studentsLoaded, loadStudents, tcLoaded, loadTc]);

  const activeHomeroomStudents = useMemo(() => students.filter(isStudentActive), [students]);

  const targetClass = useMemo(
    () => teachingClasses.find((c) => c.id === targetId) ?? null,
    [teachingClasses, targetId],
  );

  const handleCopy = async () => {
    if (!targetClass) return;
    setCopying(true);
    try {
      // 담임반 학생 → TeachingClassStudent 변환.
      // grade·classNum은 명시 안 함 — 수업반은 보통 단일 학년·반이라 불필요. 필요 시 수업반 명렬 탭에서 직접 편집.
      const tcStudents: TeachingClassStudent[] = activeHomeroomStudents.map((s) => ({
        number: s.studentNumber ?? 0,
        name: s.name,
      }));
      await updateClass({ ...targetClass, students: tcStudents });
      showToast(
        `${tcStudents.length}명을 ${targetClass.name}(${targetClass.subject})에 복사했습니다`,
        'success',
      );
      setConfirming(false);
      setTargetId('');
    } catch {
      showToast('명렬 복사에 실패했습니다', 'error');
    } finally {
      setCopying(false);
    }
  };

  if (teachingClasses.length === 0) {
    return (
      <div className="rounded-xl border border-sp-border bg-sp-surface/50 p-4 text-xs text-sp-muted">
        등록된 수업반이 없습니다. 수업 관리에서 먼저 수업반을 만든 뒤 사용하세요.
      </div>
    );
  }

  if (activeHomeroomStudents.length === 0) {
    return (
      <div className="rounded-xl border border-sp-border bg-sp-surface/50 p-4 text-xs text-sp-muted">
        담임반에 활성 학생이 없습니다. 명렬 관리에서 먼저 학생을 등록하세요.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sp-border bg-sp-card p-4 flex flex-col gap-3">
      <div>
        <h4 className="text-sm font-bold text-sp-text mb-1">담임반 → 수업반 명렬 복사</h4>
        <p className="text-xs text-sp-muted leading-relaxed">
          담임반 활성 학생{' '}
          <span className="text-sp-text font-semibold">{activeHomeroomStudents.length}명</span>을
          선택한 수업반에 복사합니다. 기존 수업반 명단은 교체됩니다 (학생기록·좌석은 그대로 유지).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            setConfirming(false);
          }}
          className="flex-1 bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
        >
          <option value="">대상 수업반 선택…</option>
          {/* 보관된 반은 복사 대상에서 제외 — 보관된 반에 새 데이터를 쓰면 안 된다 */}
          {filterActiveClasses(teachingClasses).map((c) => {
            const activeCount = c.students.filter(isStudentActive).length;
            return (
              <option key={c.id} value={c.id}>
                {c.name} · {c.subject} (현재 {activeCount}명)
              </option>
            );
          })}
        </select>
      </div>

      {targetClass && !confirming && (
        <button
          onClick={() => setConfirming(true)}
          className="self-start px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
        >
          복사하기
        </button>
      )}

      {targetClass && confirming && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 flex flex-col gap-2">
          <p className="text-xs text-amber-300 leading-relaxed">
            <span className="font-semibold">
              {targetClass.name}({targetClass.subject})
            </span>
            의 기존 명단 {targetClass.students.length}명이 담임반 명단으로 교체됩니다. 진행할까요?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void handleCopy()}
              disabled={copying}
              className="px-3 py-1.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-xs font-medium transition-colors disabled:opacity-40"
            >
              {copying ? '복사 중…' : '복사 진행'}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={copying}
              className="px-3 py-1.5 rounded-lg border border-sp-border text-xs text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
