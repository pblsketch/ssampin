/**
 * 교직원 연락처 — 학교 안에서 연락할 사람들의 명부.
 *
 * 학생·보호자 연락처는 이미 Student 엔티티(phone / parentPhone / parentPhone2)가
 * 정본이므로 여기에 중복해서 두지 않는다. 연락처 화면은 두 출처를 화면에서만 합친다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/** 연락처 분류 — 교무실 조직도를 그대로 옮기지 않고, 찾을 때 쓰는 최소 구분만 둔다. */
export type StaffContactGroup =
  | 'sameGrade' // 같은 학년부
  | 'sameDept' // 같은 부서
  | 'office' // 행정실·교무실
  | 'external' // 교육청·외부 기관
  | 'etc';

export const STAFF_CONTACT_GROUP_LABELS: Record<StaffContactGroup, string> = {
  sameGrade: '같은 학년',
  sameDept: '같은 부서',
  office: '행정실·교무실',
  external: '교육청·외부',
  etc: '기타',
};

export interface StaffContact {
  readonly id: string;
  /** 이름 — 유일한 필수 항목. 나머지는 아는 것만 채운다. */
  readonly name: string;
  /** 직위 (예: 교사, 부장, 교감, 행정실장) */
  readonly position?: string;
  /** 부서 (예: 3학년부, 정보부) */
  readonly department?: string;
  /** 담당 과목 */
  readonly subject?: string;
  /** 담임 학급 표기 (예: "2-4") */
  readonly homeroom?: string;
  /** 휴대폰 */
  readonly mobile?: string;
  /** 내선/사무실 번호 */
  readonly officePhone?: string;
  readonly email?: string;
  /** 자유 메모 (예: "수요일 오후 출장 잦음") */
  readonly memo?: string;
  readonly group?: StaffContactGroup;
  /** 즐겨찾기 — 목록 맨 위로 올린다. */
  readonly favorite?: boolean;
  readonly createdAt: string; // ISO 8601
  readonly updatedAt?: string; // ISO 8601
}

export interface StaffContactsData {
  readonly contacts: readonly StaffContact[];
}
