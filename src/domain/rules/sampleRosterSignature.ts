import type { Student } from '@domain/entities/Student';

/**
 * 샘플 명렬 서명 (Signature).
 *
 * 신규 설치/마이그레이션 시점에 자동 시드되는 데모용 35명 기본 명렬과
 * "정확히 동일한 식별 정보(id·name·studentNumber)"를 가진 동결 상수다.
 *
 * 용도:
 *   - 사용자가 명렬을 한 번도 손대지 않았는지(=샘플 그대로 떠있는지)
 *     판정하는 가드(`isSampleRoster`)의 비교 기준.
 *   - 마이그레이션 시 "샘플 그대로면 한 번만 정리한다"는 멱등성 보장.
 *
 * 주의:
 *   - 본 시그니처는 `Student` 엔티티 중 식별에 의미 있는 3필드만 포함한다.
 *     phone / parentPhone / isVacant 같은 빈 기본값 필드는 사용자 입력 여부와
 *     무관하므로 비교 기준에서 제외한다.
 *   - `useStudentStore.ts`의 SAMPLE_STUDENTS와 id·name·studentNumber가
 *     정확히 일치해야 한다. 둘 중 한쪽만 바뀌면 가드가 깨진다.
 */
export const SAMPLE_ROSTER_SIGNATURE: readonly {
  readonly id: string;
  readonly name: string;
  readonly studentNumber: number;
}[] = Object.freeze([
  Object.freeze({ id: 's01', name: '김민지', studentNumber: 1 }),
  Object.freeze({ id: 's02', name: '이서연', studentNumber: 2 }),
  Object.freeze({ id: 's03', name: '박지민', studentNumber: 3 }),
  Object.freeze({ id: 's04', name: '최예은', studentNumber: 4 }),
  Object.freeze({ id: 's05', name: '정수빈', studentNumber: 5 }),
  Object.freeze({ id: 's06', name: '강민수', studentNumber: 6 }),
  Object.freeze({ id: 's07', name: '조현우', studentNumber: 7 }),
  Object.freeze({ id: 's08', name: '윤서준', studentNumber: 8 }),
  Object.freeze({ id: 's09', name: '장민혁', studentNumber: 9 }),
  Object.freeze({ id: 's10', name: '임도윤', studentNumber: 10 }),
  Object.freeze({ id: 's11', name: '한지우', studentNumber: 11 }),
  Object.freeze({ id: 's12', name: '송예준', studentNumber: 12 }),
  Object.freeze({ id: 's13', name: '오시우', studentNumber: 13 }),
  Object.freeze({ id: 's14', name: '서준우', studentNumber: 14 }),
  Object.freeze({ id: 's15', name: '신은우', studentNumber: 15 }),
  Object.freeze({ id: 's16', name: '백승우', studentNumber: 16 }),
  Object.freeze({ id: 's17', name: '권진우', studentNumber: 17 }),
  Object.freeze({ id: 's18', name: '황지호', studentNumber: 18 }),
  Object.freeze({ id: 's19', name: '안민재', studentNumber: 19 }),
  Object.freeze({ id: 's20', name: '유건우', studentNumber: 20 }),
  Object.freeze({ id: 's21', name: '홍성현', studentNumber: 21 }),
  Object.freeze({ id: 's22', name: '전민성', studentNumber: 22 }),
  Object.freeze({ id: 's23', name: '고우진', studentNumber: 23 }),
  Object.freeze({ id: 's24', name: '문지훈', studentNumber: 24 }),
  Object.freeze({ id: 's25', name: '양준영', studentNumber: 25 }),
  Object.freeze({ id: 's26', name: '손민규', studentNumber: 26 }),
  Object.freeze({ id: 's27', name: '배현준', studentNumber: 27 }),
  Object.freeze({ id: 's28', name: '조민준', studentNumber: 28 }),
  Object.freeze({ id: 's29', name: '류승민', studentNumber: 29 }),
  Object.freeze({ id: 's30', name: '서동현', studentNumber: 30 }),
  Object.freeze({ id: 's31', name: '남궁민', studentNumber: 31 }),
  Object.freeze({ id: 's32', name: '나경훈', studentNumber: 32 }),
  Object.freeze({ id: 's33', name: '박효준', studentNumber: 33 }),
  Object.freeze({ id: 's34', name: '허지훈', studentNumber: 34 }),
  Object.freeze({ id: 's35', name: '황민혁', studentNumber: 35 }),
]);

/**
 * 주어진 명렬이 "샘플 그대로"인지 판정한다 (가드 A·B·C 통합).
 *
 * 다음 세 조건을 모두 만족할 때만 true:
 *   A. 총 인원이 정확히 35명
 *   B. 모든 학생의 `id`가 시그니처와 같은 인덱스에서 정확히 일치
 *   C. 모든 학생의 `name`·`studentNumber`가 시그니처와 정확히 일치
 *
 * 순서가 다르거나, 한 명이라도 이름/번호/id가 바뀌었으면 false.
 * 순수 함수(외부 상태 의존 없음).
 *
 * @param students 검사할 명렬 (읽기 전용)
 * @returns 샘플 시그니처와 완전 일치하면 true
 */
export function isSampleRoster(students: readonly Student[]): boolean {
  // 가드 A — 길이
  if (students.length !== SAMPLE_ROSTER_SIGNATURE.length) {
    return false;
  }
  // 가드 B·C — 인덱스별 id·name·studentNumber 정확 매칭
  for (let i = 0; i < SAMPLE_ROSTER_SIGNATURE.length; i++) {
    const expected = SAMPLE_ROSTER_SIGNATURE[i];
    const actual = students[i];
    // noUncheckedIndexedAccess 보호 — 길이 체크 이후라 실제로는 항상 존재
    if (!expected || !actual) {
      return false;
    }
    if (actual.id !== expected.id) {
      return false;
    }
    if (actual.name !== expected.name) {
      return false;
    }
    if (actual.studentNumber !== expected.studentNumber) {
      return false;
    }
  }
  return true;
}

/**
 * 명렬에 "사용자가 손댄 흔적"이 한 군데라도 있는지 검사한다 (가드 E).
 *
 * 다음 5개 필드 중 하나라도 truthy(빈 문자열·undefined·null 아닌 값)이면 true:
 *   - phone (학생 연락처)
 *   - parentPhone (보호자1 연락처)
 *   - parentPhone2 (보호자2 연락처)
 *   - birthDate (생년월일)
 *   - statusNote (재적 상태 변경 사유 메모)
 *
 * 이 흔적이 있으면 "사용자가 데모로 보지 않고 실제 명렬로 쓴 것"으로 간주해
 * 자동 정리 대상에서 제외한다. 순수 함수.
 *
 * @param students 검사할 명렬
 * @returns 사용자 입력 흔적이 1개 이상 있으면 true
 */
export function hasUserDataMarks(students: readonly Student[]): boolean {
  for (const student of students) {
    if (student.phone) {
      return true;
    }
    if (student.parentPhone) {
      return true;
    }
    if (student.parentPhone2) {
      return true;
    }
    if (student.birthDate) {
      return true;
    }
    if (student.statusNote) {
      return true;
    }
  }
  return false;
}
