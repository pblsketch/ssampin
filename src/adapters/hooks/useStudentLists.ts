import { useMemo, useEffect } from 'react';
import type { StudentInfo } from '@domain/entities/Assignment';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';

export interface StudentListOption {
  readonly type: 'class' | 'teaching';
  readonly name: string;
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

    // 1. 담임반 (기존 로직)
    if (className) {
      const activeStudents = students.filter((s) => !s.isVacant);
      if (activeStudents.length > 0) {
        lists.push({
          type: 'class',
          name: className,
          students: activeStudents.map((s, index) => ({
            id: s.id,
            number: index + 1,
            name: s.name,
          })),
        });
      }
    }

    // 2. 수업반 (수업 관리에서 등록한 반)
    for (const tc of teachingClasses) {
      const activeStudentsInClass = tc.students.filter((s) => !s.isVacant);
      if (activeStudentsInClass.length > 0) {
        lists.push({
          type: 'teaching',
          name: `${tc.name} (${tc.subject})`,
          students: activeStudentsInClass.map((s) => ({
            id: `tc-${tc.id}-${s.grade ?? 0}-${s.classNum ?? 0}-${s.number}`,
            number: s.number,
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
