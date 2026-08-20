/**
 * 사진 명렬표의 이름 칸을 읽는 규칙.
 *
 * 나이스는 명렬표 종류에 따라 이름 칸을 두 가지로 쓴다.
 *
 * | 종류 | 이름 칸 | 예 |
 * |---|---|---|
 * | 담임(학급) 사진 명렬표 | `N번  이름` | `1번  강나영` |
 * | 교과별 수강학생 사진 명렬표 | `G학년 C반 N번  이름` | `3학년 1반 2번  권지민` |
 *
 * 수업반은 여러 반 학생이 섞이므로 소속이 함께 적힌다. 그리고 그 조합(학년-반-번호)은
 * **앱이 수업반 학생을 구분할 때 이미 쓰는 키와 정확히 같다**(`studentKey`).
 * 덕분에 파일만으로 어느 학생인지 정확히 짚을 수 있다.
 *
 * ⚠️ 두 파서(한글·엑셀)가 같은 규칙을 써야 한다. 규칙이 두 벌이면 한쪽만 고쳐져
 * "엑셀은 되는데 한글은 안 되는" 식으로 갈라진다.
 */

export interface RosterNameCell {
  readonly studentNumber: number;
  readonly name: string;
  /** 수업반 명렬표에만 있다 */
  readonly grade?: number;
  readonly classNum?: number;
}

/** `3학년 1반 2번  권지민` — 수업반(교과별 수강학생) */
const TEACHING_CLASS_PATTERN = /^(\d+)\s*학년\s*(\d+)\s*반\s*(\d+)\s*번\s*(.+)$/;
/** `1번  강나영` — 담임(학급) */
const HOMEROOM_PATTERN = /^(\d+)\s*번\s*(.+)$/;

/**
 * 이름 칸 하나를 해석한다. 형태가 맞지 않으면 `null`
 * (제목·학교명·머리글 같은 칸을 걸러 내는 역할도 겸한다).
 */
export function parseRosterNameCell(text: string): RosterNameCell | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  // 수업반 형태를 먼저 본다 — 담임 규칙이 `3학년 1반 2번 …` 의 앞부분을 잘못 삼키지 않도록.
  const teaching = TEACHING_CLASS_PATTERN.exec(trimmed);
  if (teaching) {
    return {
      grade: Number(teaching[1]),
      classNum: Number(teaching[2]),
      studentNumber: Number(teaching[3]),
      name: teaching[4]!.trim(),
    };
  }

  const homeroom = HOMEROOM_PATTERN.exec(trimmed);
  if (homeroom) {
    return {
      studentNumber: Number(homeroom[1]),
      name: homeroom[2]!.trim(),
    };
  }

  return null;
}

/** 읽어 낸 이름 칸이 수업반 명렬표의 것인지 */
export function isTeachingClassNameCell(cell: RosterNameCell): boolean {
  return cell.grade !== undefined && cell.classNum !== undefined;
}
