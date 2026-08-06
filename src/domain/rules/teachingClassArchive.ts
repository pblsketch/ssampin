import type { TeachingClass } from '@domain/entities/TeachingClass';
import { academicTerm } from '@domain/rules/academicCalendar';

/**
 * 수업반 보관(아카이브) 규칙 — 판정·필터·전이의 단일 정본.
 *
 * - 보관 여부 판정은 반드시 isTeachingClassArchived()를 경유한다.
 *   `.archived` 직접 비교는 메타테스트(teachingClassArchive.callSites)가 금지한다.
 * - 보관은 파일을 옮기지도 지우지도 않는다 — 플래그 전이만 한다.
 * - updatedAt 스탬프는 여기서 하지 않는다(저장 경로의 기존 규칙이 담당).
 */

/** 이 수업반이 보관 상태인가. undefined는 활성으로 취급한다. */
export function isTeachingClassArchived(c: TeachingClass): boolean {
  return c.archived === true;
}

/** 활성(보관 안 된) 수업반만 반환. */
export function filterActiveClasses(list: readonly TeachingClass[]): TeachingClass[] {
  return list.filter((c) => !isTeachingClassArchived(c));
}

/** 보관된 수업반만 반환. */
export function filterArchivedClasses(list: readonly TeachingClass[]): TeachingClass[] {
  return list.filter((c) => isTeachingClassArchived(c));
}

/**
 * 보관 전이 — archived/archivedAt/archivedTerm을 세운다.
 * 개별 보관이 기본이다(그룹 형제를 함께 보관하지 않는다 — 오너 결정, plan v4).
 */
export function archiveTeachingClass(c: TeachingClass, now: Date): TeachingClass {
  return {
    ...c,
    archived: true,
    archivedAt: now.toISOString(),
    archivedTerm: academicTerm(now),
  };
}

/**
 * 보관 해제 — archived만 내린다. archivedAt/archivedTerm은 복원 이력으로 남긴다.
 * 복원 위치는 활성 목록 맨 아래: order = (활성 최대 order) + 1 (plan S1.2 확정 규칙).
 */
export function unarchiveTeachingClass(c: TeachingClass, maxActiveOrder: number): TeachingClass {
  return {
    ...c,
    archived: false,
    order: maxActiveOrder + 1,
  };
}

/**
 * 그룹 형제 반으로 쓰기(명단·좌석·학생 상태 동기화)를 전파해도 되는가.
 *
 * - 'independent' 형제는 전파 제외(기존 규칙 — syncGroupStudents만 지키던 것을 정본화)
 * - 보관된 형제는 전파 제외(보관 무결성 — 활성 반 편집이 보관된 반의 과거 명렬을 바꾸면 안 됨)
 *
 * 개별 보관이 기본이라 "형제 일부만 보관된 혼합 상태"가 정상 경로다 — 이 술어는
 * 예외 방어선이 아니라 상시 동작하는 핵심 로직이다(plan v4 ㉒).
 */
export function shouldPropagateToSibling(sibling: TeachingClass): boolean {
  if (sibling.studentSyncMode === 'independent') return false;
  return !isTeachingClassArchived(sibling);
}
