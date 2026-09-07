/**
 * 부서 일정 — 표 붙여넣기 읽기 (066)
 *
 * 계획서: .omc/plans/staffroom-submission-plan.md (D4 · S6-2)
 * 출처 아이디어: github.com/cando8442/school-work-links (MIT) — 설계 판단만 참고
 *
 * ── 왜 파일 업로드가 아니라 붙여넣기인가 ────────────────────────────
 * 원본 오픈소스의 주석이 그 이유를 그대로 적어 두었다 —
 * *"파일을 올리는 것보다 붙여넣기가 튼튼합니다. 파일 모양이 바뀌어도 깨지지
 * 않기 때문입니다."* 한글·엑셀·구글시트 어디서 복사하든 탭이나 쉼표로 갈린
 * 글자가 오고, 그건 형식이 바뀌어도 그대로다.
 *
 * ── ★ 왜 서버가 아니라 여기서 읽는가 ───────────────────────────────
 * 붙여넣은 것을 **왕복 없이 즉시 미리 보여줘야** 하기 때문이다. 사람이 눈으로
 * 확인하고 올리는 것이 이 기능의 안전장치인데(AC-B3), 미리보기마다 서버를
 * 부르면 글자를 고칠 때마다 왕복이 생긴다.
 *
 * ── ★ 기준 학년도를 인자로 받는 이유 ───────────────────────────────
 * "3월 2일"처럼 연도가 없는 표기가 흔하다. 그런데 domain 레이어는 외부를
 * import 할 수 없어 오늘이 몇 학년도인지 스스로 알 수 없다. 부르는 쪽이
 * 학기 정본(ADR-046)에서 받아 넘긴다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */

/** 읽어낸 일정 한 줄 */
export interface PastedScheduleRow {
  /** YYYY-MM-DD */
  readonly startsOn: string;
  readonly title: string;
  readonly place: string;
  readonly memo: string;
}

export interface PastedScheduleResult {
  readonly rows: readonly PastedScheduleRow[];
  /**
   * 날짜를 못 읽어 버린 줄 수.
   *
   * ★ 조용히 버리지 않는다. 20줄을 붙여넣었는데 12줄만 들어가면 무엇이
   *   빠졌는지 알 길이 없고, 사람은 대개 알아채지 못한 채 넘어간다.
   */
  readonly droppedLines: number;
}

/** 한 번에 올릴 수 있는 줄 수 */
export const STAFFROOM_PASTE_MAX_ROWS = 200;

/** 제목 최대 길이 — 부서 일정 제목과 같은 값 */
const TITLE_MAX = 100;
const TEXT_MAX = 200;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 그 해 그 달에 실제로 있는 날인가.
 *
 * 형식만 보면 2026-02-31 같은 없는 날이 통과한다. 되돌려 맞춰 확인한다.
 * ★ UTC 로 따진다 — 현지 시각으로 읽으면 한국(UTC+9)에서 되돌릴 때 전날이
 *   나와 멀쩡한 날짜가 전부 거부된다(`staffRoomRoomRules.isDateString` 과 같은 이유).
 */
function isRealDate(year: number, month: number, day: number): boolean {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * 학년도 기준으로 연도를 고른다.
 *
 * 3월부터 12월까지는 그 학년도, 1월과 2월은 **다음 해**다. 2026학년도 표에
 * "2월 10일 졸업식"이 있으면 그건 2027년 2월이다.
 */
function yearFor(month: number, schoolYear: number): number {
  return month >= 3 ? schoolYear : schoolYear + 1;
}

/**
 * 여러 날짜 표기를 YYYY-MM-DD 로 바꾼다. 못 읽으면 빈 문자열.
 *
 * 받아들이는 모양 — 학교 표에서 실제로 오는 것들이다:
 *   2026-03-02 · 2026.3.2 · 2026/3/2 · 2026년 3월 2일 · 3월 2일 · 3/2 · 3.2
 */
export function parsePastedDate(raw: string, schoolYear: number): string {
  const text = raw.trim().replace(/\s+/g, '');
  if (text === '') return '';

  const build = (y: number, m: number, d: number): string =>
    isRealDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : '';

  // 연도가 있는 것 — 학년도를 따지지 않는다. 적힌 그대로다.
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(text);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  m = /^(\d{4})년(\d{1,2})월(\d{1,2})일/.exec(text);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));

  // 연도가 없는 것 — 학년도로 채운다
  m = /^(\d{1,2})월(\d{1,2})일/.exec(text);
  if (m) {
    const month = Number(m[1]);
    return build(yearFor(month, schoolYear), month, Number(m[2]));
  }

  m = /^(\d{1,2})[-./](\d{1,2})$/.exec(text);
  if (m) {
    const month = Number(m[1]);
    return build(yearFor(month, schoolYear), month, Number(m[2]));
  }

  return '';
}

/**
 * 붙여넣은 표를 읽는다.
 *
 * 칸 수로 뜻을 정한다 — 학교 표는 대개 이 셋 중 하나다:
 *   2칸  날짜 / 제목
 *   3칸  날짜 / 제목 / 장소
 *   4칸+ 날짜 / 제목 / 장소 / 메모(나머지는 메모로 합친다)
 *
 * ★ 첫 칸이 날짜로 안 읽히는 줄은 버리고 **수를 센다.** 표 머리글("날짜 | 내용")도
 *   여기서 자연스럽게 걸러지고, 그것도 세어져 "읽지 못한 줄"에 포함된다 —
 *   1~2줄쯤 나오는 것은 정상이라고 화면이 안내한다.
 */
export function parsePastedSchedule(text: string, schoolYear: number): PastedScheduleResult {
  const rows: PastedScheduleRow[] = [];
  let droppedLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue; // 빈 줄은 버린 것으로 세지 않는다

    // 탭이 있으면 탭으로 — 엑셀·구글시트에서 복사하면 탭이 온다.
    // 없으면 쉼표. 제목에 쉼표가 들어 있으면 어차피 탭으로 오는 경우가 대부분이다.
    const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((c) => c.trim());

    const startsOn = parsePastedDate(cells[0] ?? '', schoolYear);
    if (startsOn === '') {
      droppedLines += 1;
      continue;
    }

    const rest = cells.slice(1).filter((c) => c !== '');
    if (rest.length === 0) {
      droppedLines += 1; // 날짜만 있고 내용이 없으면 일정이 아니다
      continue;
    }

    rows.push({
      startsOn,
      title: (rest[0] ?? '').slice(0, TITLE_MAX),
      place: (rest[1] ?? '').slice(0, TEXT_MAX),
      memo: rest.slice(2).join(' ').slice(0, TEXT_MAX),
    });

    if (rows.length >= STAFFROOM_PASTE_MAX_ROWS) break;
  }

  return { rows: dedupe(rows), droppedLines };
}

/**
 * 같은 날 같은 제목은 한 번만.
 *
 * 표를 두 번 붙여넣거나 학사일정과 부서 표에 같은 행사가 겹쳐 적힌 경우가 흔하다.
 * 장소·메모가 다르면 **먼저 온 것을 남긴다** — 나중 것으로 덮으면 사람이
 * 미리보기에서 본 것과 저장된 것이 달라진다.
 */
function dedupe(rows: readonly PastedScheduleRow[]): PastedScheduleRow[] {
  const seen = new Set<string>();
  const out: PastedScheduleRow[] = [];
  for (const row of rows) {
    const key = `${row.startsOn}|${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
