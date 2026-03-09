import { useMemo } from 'react';
import type { StudentInfo } from '@domain/entities/Assignment';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

export interface StudentListOption {
  readonly type: 'class';
  readonly name: string;
  readonly students: StudentInfo[];
}

/**
 * 과제 대상 선택용 학급 명단 훅
 * MVP: 학급 명단만 지원 (수업별 명단은 Phase 4)
 */
export function useStudentLists(): StudentListOption[] {
  const students = useStudentStore((s) => s.students);
  const className = useSettingsStore((s) => s.settings.className);

  return useMemo(() => {
    // 학급 이름이 없으면 빈 배열
    if (!className) return [];

    // isVacant 제외, 배열 인덱스+1로 번호 부여
    const activeStudents = students.filter((s) => !s.isVacant);

    if (activeStudents.length === 0) return [];

    const studentInfos: StudentInfo[] = activeStudents.map((s, index) => ({
      id: s.id,
      number: index + 1,
      name: s.name,
    }));

    return [{
      type: 'class' as const,
      name: className,
      students: studentInfos,
    }];
  }, [students, className]);
}
