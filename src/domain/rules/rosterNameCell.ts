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

/**
 * 화면·짝짓기에서 학생 한 명을 가리키는 열쇠.
 *
 * ⚠️ **번호만으로는 안 된다.** 수업반 명렬표는 여러 반이 섞여 있어 `5번`이 두 명, `14번`이
 * 세 명일 수 있다. 번호만 열쇠로 쓰면 뒤 학생이 앞 학생을 덮어써서 **여러 학생에게 같은
 * 얼굴이 붙어 보인다** — 실제로 그렇게 터졌다(2026-08-20, 수업반 미리보기).
 */
export function rosterRowKey(cell: {
  readonly studentNumber: number;
  readonly grade?: number;
  readonly classNum?: number;
}): string {
  return cell.grade !== undefined && cell.classNum !== undefined
    ? `${cell.grade}-${cell.classNum}-${cell.studentNumber}`
    : `${cell.studentNumber}`;
}

/**
 * 사람에게 보여 줄 이름표.
 *
 * 수업반은 소속을 빼면 `5번 박지효`·`5번 김예림` 처럼 **같은 번호가 여러 번 보여**
 * 선생님이 잘못 들어간 줄 알게 된다. 소속이 있으면 함께 적는다.
 */
export function rosterRowLabel(cell: {
  readonly studentNumber: number;
  readonly name: string;
  readonly grade?: number;
  readonly classNum?: number;
}): string {
  return cell.grade !== undefined && cell.classNum !== undefined
    ? `${cell.grade}학년 ${cell.classNum}반 ${cell.studentNumber}번 ${cell.name}`
    : `${cell.studentNumber}번 ${cell.name}`;
}

/** 명렬표 순서 — 학년 → 반 → 번호 (번호만 있으면 번호순) */
export function compareRosterRows(
  a: { readonly studentNumber: number; readonly grade?: number; readonly classNum?: number },
  b: { readonly studentNumber: number; readonly grade?: number; readonly classNum?: number },
): number {
  return (
    (a.grade ?? 0) - (b.grade ?? 0) ||
    (a.classNum ?? 0) - (b.classNum ?? 0) ||
    a.studentNumber - b.studentNumber
  );
}
