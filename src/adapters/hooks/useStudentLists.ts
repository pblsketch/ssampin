import { useMemo, useEffect } from 'react';
import type { StudentInfo } from '@domain/entities/Assignment';
import { numberActiveRoster } from '@domain/rules/rosterNumbering';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';

export interface StudentListOption {
  readonly type: 'class' | 'teaching';
  readonly name: string;
  /** 수업반 UUID (type='teaching'일 때만). 담임반·수업반 이름 충돌 해결용 */
  readonly teachingClassId?: string;
  readonly students: StudentInfo[];
}

/**
 * 과제 대상 선택용 학급 명단 훅
 * 담임반 + 수업반(수업 관리에서 등록한 반) 모두 지원
 */
export function useStudentLists(): StudentListOption[] {
  const students = useStudentStore((s) => s.students);
  const loadStudents = useStudentStore((s) => s.load);
  const className = useSettingsStore((s) => s.settings.className);
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  const loadTeachingClasses = useTeachingClassStore((s) => s.load);

  // 담임반 + 수업반 데이터 로드 보장
  useEffect(() => {
    void loadStudents();
    void loadTeachingClasses();
  }, [loadStudents, loadTeachingClasses]);

  return useMemo(() => {
    const lists: StudentListOption[] = [];

    // 1. 담임반 — ★번호는 명렬표에 적힌 실제 출석번호를 쓴다.
    //    예전에는 비활성 학생을 걸러낸 뒤 `index + 1` 로 다시 매겼다. 2번이 전출하면 3번이 2번이 되어
    //    학생 제출 폼이 실제 학번을 넣었을 때 다른 이름이 뜨고 제출이 남의 칸에 붙었다(2026-09-08 검토 A).
    if (className) {
      const activeStudents = numberActiveRoster(students);
      if (activeStudents.length > 0) {
        lists.push({
          type: 'class',
          name: className,
          students: activeStudents.map(({ student, number }) => ({
            id: student.id,
            number,
            name: student.name,
          })),
        });
      }
    }

    // 2. 수업반 (수업 관리에서 등록한 반) — 보관된 반은 새 과제·설문 대상이 아니다
    for (const tc of filterActiveClasses(teachingClasses)) {
      const activeStudentsInClass = numberActiveRoster(tc.students);
      if (activeStudentsInClass.length > 0) {
        lists.push({
          type: 'teaching',
          name: `${tc.name} (${tc.subject})`,
          teachingClassId: tc.id,
          students: activeStudentsInClass.map(({ student: s, number }) => ({
            id: `tc-${tc.id}-${s.grade ?? 0}-${s.classNum ?? 0}-${number}`,
            number,
            name: s.name,
            grade: s.grade,
            classNum: s.classNum,
          })),
        });
      }
    }

    return lists;
  }, [students, className, teachingClasses]);
}
