import type { TeachingClass } from '@domain/entities/TeachingClass';

/**
 * 수업반 표시 순서 규칙 — 데스크톱·모바일이 공유하는 단일 정본.
 *
 * ## 왜 별도 규칙인가
 *
 * 재배치(`ManageTeachingClasses.reorder`)는 저장 파일의 **배열 순서를 바꾸지 않는다.**
 * 각 반의 `order` 숫자만 갱신한다. 배열을 통째로 재구성하면 재배치 목록에 없는 반
 * (= 보관된 반)이 파일에서 통째로 사라지기 때문이다
 * (teachingClassArchiveStore.test.ts 함정 ⑩이 이 회귀를 막고 있다).
 *
 * 따라서 **표시 순서의 진실은 `order` 필드이고, 배열 순서는 신뢰할 수 없는 값이다.**
 * 목록을 화면에 내보내는 쪽은 반드시 이 함수를 거쳐야 한다.
 *
 * 과거에 모바일이 이 규칙 없이 배열 순서를 그대로 그려서, PC에서 반 순서를 바꿔도
 * 휴대폰에는 반영되지 않는 사용자 신고가 있었다(2026-08-24).
 *
 * ## 순서
 * 1. `order` 오름차순 (없으면 맨 뒤)
 * 2. 동률이면 `createdAt` 오름차순 (생성순 폴백)
 */
export function sortTeachingClasses(list: readonly TeachingClass[]): TeachingClass[] {
  return [...list].sort((a, b) => {
    const orderA = a.order ?? Infinity;
    const orderB = b.order ?? Infinity;
    if (orderA !== orderB) return orderA - orderB;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
