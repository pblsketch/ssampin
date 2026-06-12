/**
 * StudentAvatarGrid — 입장 학생 아바타 카드 그리드.
 *
 * - 신규 카드 pop-in 애니메이션 (scale 0.9 → 1, fadeIn) — sp-duration-base.
 * - prefers-reduced-motion 시 즉시 표시.
 *
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-accent / sp-duration-base
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';

interface StudentAvatarGridProps {
  readonly students: readonly StudentProfile[];
  /** DN-03: 최근 wave 보낸 학생 ID 집합. 포함된 학생 아바타에 pulse 효과. */
  readonly recentWaveStudentIds?: ReadonlySet<string>;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function AvatarCard({
  student,
  animate,
  isWaving,
}: {
  readonly student: StudentProfile;
  readonly animate: boolean;
  readonly isWaving: boolean;
}): JSX.Element {
  const [mounted, setMounted] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  const style: React.CSSProperties = animate
    ? {
        transition:
          'transform var(--sp-duration-base) var(--sp-ease-out), opacity var(--sp-duration-base) var(--sp-ease-out)',
        transform: mounted ? 'scale(1)' : 'scale(0.9)',
        opacity: mounted ? 1 : 0,
      }
    : { transform: 'scale(1)', opacity: 1 };

  return (
    <div
      className="flex flex-col items-center gap-2 rounded-xl border border-sp-border bg-sp-card p-4"
      style={style}
      aria-label={`참여 학생 ${student.nickname}${isWaving ? ' (인사 중)' : ''}`}
    >
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full bg-sp-accent text-[color:var(--sp-accent-fg)] font-sp-bold${isWaving ? ' animate-pulse' : ''}`}
        style={{ fontSize: 24 }}
        aria-hidden="true"
      >
        {student.nickname.slice(0, 1)}
      </div>
      <span className="font-sp-medium text-sp-text" style={{ fontSize: 14 }}>
        {student.nickname}
      </span>
    </div>
  );
}

function StudentAvatarGridImpl({
  students,
  recentWaveStudentIds,
}: StudentAvatarGridProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const seenIdsRef = useRef<Set<string>>(new Set());

  // 첫 렌더 시 이미 있던 학생은 즉시 표시, 이후 추가되는 학생만 pop-in 애니메이션.
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(students.map((s) => s.studentId));
    seenIdsRef.current = new Set(initialIdsRef.current);
  }

  return (
    <ul
      className="grid w-full gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
      aria-label="입장 학생 목록"
    >
      {students.map((s) => {
        const isNew = !seenIdsRef.current.has(s.studentId);
        if (isNew) seenIdsRef.current.add(s.studentId);
        const animate = !reducedMotion && isNew;
        const isWaving = recentWaveStudentIds?.has(s.studentId) ?? false;
        return (
          <li key={s.studentId}>
            <AvatarCard student={s} animate={animate} isWaving={isWaving} />
          </li>
        );
      })}
    </ul>
  );
}

export const StudentAvatarGrid = memo(StudentAvatarGridImpl);
