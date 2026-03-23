import type { TeachingClass } from '@domain/entities/TeachingClass';

/**
 * 시간표의 classroom/subject와 수업 관리의 학급을 유연하게 매칭
 *
 * 매칭 우선순위:
 * 1. 정확 일치 (cls.name === classroom)
 * 2. 포함 일치 (cls.name이 classroom을 포함하거나 반대)
 * 3. 숫자 매칭 (학년-반 숫자만 추출하여 비교)
 * 4. 과목 매칭 (과목이 같은 학급이 하나뿐일 때)
 */
export function findMatchingClass(
  classes: readonly TeachingClass[],
  classroom: string,
  subject?: string,
): TeachingClass | null {
  if (!classroom) return null;

  // 1순위: 정확 일치
  const exact = classes.find((cls) => cls.name === classroom);
  if (exact) return exact;

  // 2순위: 포함 일치
  const partial = classes.find(
    (cls) => cls.name.includes(classroom) || classroom.includes(cls.name),
  );
  if (partial) return partial;

  // 3순위: 숫자 매칭 (학년-반)
  const classroomNums = classroom.replace(/[^0-9-]/g, '');
  if (classroomNums) {
    const numMatch = classes.find((cls) => {
      const clsNums = cls.name.replace(/[^0-9-]/g, '');
      return clsNums === classroomNums && clsNums.length > 0;
    });
    if (numMatch) return numMatch;
  }

  // 4순위: 과목 매칭
  if (subject) {
    const subjectMatches = classes.filter((cls) =>
      cls.subject === subject ||
      cls.subject.includes(subject) ||
      subject.includes(cls.subject),
    );
    if (subjectMatches.length === 1) return subjectMatches[0]!;
  }

  return null;
}

/**
 * 과목명 유연 비교
 * "국어" ↔ "국어(심화)", "수학1" ↔ "수학" 등
 */
export function isSubjectMatch(scheduleSubject: string, classSubject: string): boolean {
  if (!scheduleSubject || !classSubject) return false;

  // 정확 일치
  if (scheduleSubject === classSubject) return true;

  // 포함 일치 (양방향)
  if (scheduleSubject.includes(classSubject) || classSubject.includes(scheduleSubject)) return true;

  // 괄호/숫자 제거 후 비교
  const normalize = (s: string) => s.replace(/[(\[（【].+?[)\]）】]/g, '').replace(/[0-9]/g, '').trim();
  if (normalize(scheduleSubject) === normalize(classSubject)) return true;

  return false;
}
