/**
 * 한국어 자연어 빠른입력 파서 — 순수 함수(외부 AI·런타임 LLM 불필요).
 *
 * "내일 3시 학년부 회의 !높음 #업무 매주 월수금" 한 줄에서 날짜/시간/우선순위/카테고리/반복을
 * 규칙 기반으로 추출하고, 본문엔 "학년부 회의"만 남긴다.
 *
 * 설계 원칙:
 *  - 인식 실패 시 전체를 text 로 보존(데이터 손실 0). 토큰을 못 찾으면 그 필드는 undefined.
 *  - 저장 형태 불변: 결과를 기존 addTodo(text, dueDate, priority, category, recurrence, time) 에 매핑할 뿐,
 *    Todo 엔티티 형태나 MCP 계약을 바꾸지 않는다.
 *  - 순수: today 를 주입받아 결정적으로 동작(테스트 가능).
 */
import type { TodoPriority, TodoRecurrence } from '@domain/entities/Todo';

/** Date → "YYYY-MM-DD"(로컬). todoRules.formatDate 와 동일 규칙(self-contained 유지). */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface QuickInputParseResult {
  /** 토큰을 제거한 본문(항상 존재 — 인식 실패 시 원문 트림). */
  readonly text: string;
  /** "YYYY-MM-DD" */
  readonly dueDate?: string;
  /**
   * 기간의 시작일 "YYYY-MM-DD". **"~부터 ~까지" 를 적었을 때만** 채워진다.
   *
   * 하루짜리 일에는 없다 — 시작일을 마음대로 채우면 "오늘 하루"라고 적은 일이
   * 달력에서 기간 막대로 그려져 사용자가 적지 않은 일정을 앱이 지어내는 셈이 된다.
   */
  readonly startDate?: string;
  /** "HH:mm" */
  readonly time?: string;
  readonly priority?: TodoPriority;
  /** `#태그` 로 인식된 카테고리 힌트(원문 토큰) — 호출부가 실제 카테고리 id 로 해석. */
  readonly categoryHint?: string;
  readonly recurrence?: TodoRecurrence;
}

/** 요일 한글 → 0(일)~6(토) */
const WEEKDAY: Readonly<Record<string, number>> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

/** 시간 프리셋(아침/점심/저녁/밤). */
const TIME_PRESET: Readonly<Record<string, string>> = {
  아침: '08:00',
  점심: '12:00',
  저녁: '18:00',
  밤: '20:00',
};

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 한 토큰을 본문에서 제거하기 위한 치환 헬퍼(첫 매치만). */
function strip(text: string, token: string): string {
  const idx = text.indexOf(token);
  if (idx === -1) return text;
  return text.slice(0, idx) + ' ' + text.slice(idx + token.length);
}

interface Matched<T> {
  readonly value: T;
  /** 본문에서 제거할 매치 문자열(원문 그대로). */
  readonly raw: string;
}

// ─────────────────────────── 우선순위 ───────────────────────────
function matchPriority(text: string): Matched<TodoPriority> | null {
  const m = /!\s*(높음|중간|보통|낮음|1|2|3|high|medium|low)/i.exec(text);
  if (!m) return null;
  const k = (m[1] ?? '').toLowerCase();
  let value: TodoPriority;
  if (k === '높음' || k === '1' || k === 'high') value = 'high';
  else if (k === '중간' || k === '보통' || k === '2' || k === 'medium') value = 'medium';
  else value = 'low';
  return { value, raw: m[0] };
}

// ─────────────────────────── 카테고리 ───────────────────────────
function matchCategory(text: string): Matched<string> | null {
  const m = /#\s*([^\s#!]+)/.exec(text);
  if (!m || !m[1]) return null;
  return { value: m[1], raw: m[0] };
}

// ─────────────────────────── 반복 ───────────────────────────
function parseDaysOfWeek(spec: string): number[] {
  const days: number[] = [];
  for (const ch of spec) {
    const d = WEEKDAY[ch];
    if (d !== undefined && !days.includes(d)) days.push(d);
  }
  return days.sort((a, b) => a - b);
}

function matchRecurrence(text: string): Matched<TodoRecurrence> | null {
  // 매주 월수금 / 매주 월,수,금 / 매주 월요일
  const weeklyDays = /매주\s*((?:[월화수목금토일]\s*,?\s*)+)요?일?/.exec(text);
  if (weeklyDays && weeklyDays[1]) {
    const days = parseDaysOfWeek(weeklyDays[1]);
    if (days.length > 0) {
      return { value: { type: 'weekly', interval: 1, daysOfWeek: days }, raw: weeklyDays[0] };
    }
  }
  if (/매주\s*평일|평일\s*마다|매\s*평일/.test(text)) {
    const m = /매주\s*평일|평일\s*마다|매\s*평일/.exec(text)!;
    return { value: { type: 'weekdays', interval: 1 }, raw: m[0] };
  }
  if (/격주/.test(text)) {
    return { value: { type: 'weekly', interval: 2 }, raw: '격주' };
  }
  if (/매주/.test(text)) {
    return { value: { type: 'weekly', interval: 1 }, raw: '매주' };
  }
  if (/매달|매월/.test(text)) {
    const m = /매달|매월/.exec(text)!;
    return { value: { type: 'monthly', interval: 1 }, raw: m[0] };
  }
  if (/매년|매해/.test(text)) {
    const m = /매년|매해/.exec(text)!;
    return { value: { type: 'yearly', interval: 1 }, raw: m[0] };
  }
  if (/매일|날마다/.test(text)) {
    const m = /매일|날마다/.exec(text)!;
    return { value: { type: 'daily', interval: 1 }, raw: m[0] };
  }
  return null;
}

// ─────────────────────────── 시간 ───────────────────────────

/**
 * "반"과 "N분" 중 적힌 쪽을 분으로 바꾼다. 둘 다 없으면 정각(0분).
 *
 * 범위를 벗어난 분("3시 90분")은 `null` 을 돌려 **그 시각 자체를 인식하지 않는다.**
 * "3시"만 떼어 15:00 으로 읽으면 사용자가 적은 "90분"이 조용히 사라져, 화면에는 인식된
 * 것처럼 보이는데 실제 값은 다른 상태가 된다. 차라리 인식하지 않고 원문을 남긴다.
 */
function minutesOf(half: string | undefined, minuteDigits: string | undefined): number | null {
  if (half !== undefined) return 30;
  if (minuteDigits === undefined) return 0;
  const m = Number(minuteDigits);
  return m <= 59 ? m : null;
}

function matchTime(text: string): Matched<string> | null {
  // HH:MM
  const hm = /\b(\d{1,2}):(\d{2})\b/.exec(text);
  if (hm) {
    const h = Number(hm[1]);
    const min = Number(hm[2]);
    if (h <= 23 && min <= 59) return { value: `${pad2(h)}:${pad2(min)}`, raw: hm[0] };
  }
  // 오전/오후 N시(반 | M분)
  const ampm = /(오전|오후)\s*(\d{1,2})\s*시(?:\s*(반)|\s*(\d{1,2})\s*분)?/.exec(text);
  if (ampm) {
    let h = Number(ampm[2]);
    const min = minutesOf(ampm[3], ampm[4]);
    if (h >= 1 && h <= 12 && min !== null) {
      if (ampm[1] === '오후') h = h === 12 ? 12 : h + 12;
      else h = h === 12 ? 0 : h; // 오전 12시 = 00시
      return { value: `${pad2(h)}:${pad2(min)}`, raw: ampm[0] };
    }
  }
  // 맨 N시(반 | M분) — 1~6시는 오후로 해석(학교 일과 맥락), 7~23시는 그대로.
  const bare = /(\d{1,2})\s*시(?:\s*(반)|\s*(\d{1,2})\s*분)?/.exec(text);
  if (bare) {
    let h = Number(bare[1]);
    const min = minutesOf(bare[2], bare[3]);
    if (h >= 1 && h <= 23 && min !== null) {
      if (h >= 1 && h <= 6) h += 12;
      return { value: `${pad2(h)}:${pad2(min)}`, raw: bare[0] };
    }
  }
  // 프리셋(아침/점심/저녁/밤)
  for (const [word, value] of Object.entries(TIME_PRESET)) {
    if (text.includes(word)) return { value, raw: word };
  }
  return null;
}

// ─────────────────────────── 날짜 ───────────────────────────

/**
 * 날짜 하나를 나타내는 표현들. **적힌 순서가 곧 우선순위다** — 위에서부터 찾는다.
 *
 * 순서를 바꾸면 안 되는 곳이 있다. `\d일 뒤` 는 맨 뒤의 `\d일`(그 달의 며칠)보다
 * **먼저** 와야 "3일 뒤"가 "3일"로 잘리지 않는다.
 */
const DATE_TOKEN_PATTERNS: readonly RegExp[] = [
  /모레|내일모레/,
  /글피/,
  /오늘/,
  /내일|낼/,
  /(\d{1,3})\s*일\s*(뒤|후)/,
  /(이번주|다음주|담주|다다음주)?\s*([월화수목금토일])요일?/,
  /(\d{1,2})\s*월\s*(\d{1,2})\s*일/,
];

/**
 * 찾아 놓은 날짜 표현 하나를 실제 날짜로 바꾼다.
 *
 * @param monthHint 그 달의 며칠만 적힌 표현("27일")을 풀 때 쓸 기준 날짜.
 *   기간의 뒷쪽("8월 24일부터 **27일**까지")에서만 넘어온다. 없으면 이 형태를 인식하지
 *   않는다 — 단독으로 쓰인 "27일"까지 날짜로 보면 "27일 남았다" 같은 문장이 오인식된다.
 * @returns "YYYY-MM-DD". 풀 수 없으면 null.
 */
function resolveDateToken(token: string, today: Date, monthHint: Date | null): string | null {
  if (/모레|내일모레/.test(token)) return formatDate(addDays(today, 2));
  if (/글피/.test(token)) return formatDate(addDays(today, 3));
  if (/오늘/.test(token)) return formatDate(today);
  if (/내일|낼/.test(token)) return formatDate(addDays(today, 1));

  const after = /(\d{1,3})\s*일\s*(뒤|후)/.exec(token);
  if (after && after[1]) return formatDate(addDays(today, Number(after[1])));

  // (이번주|다음주|다다음주)? 요일 — base = 이번 주 기준 해당 요일까지의 일수(오늘이면 0).
  const wk = /(이번주|다음주|담주|다다음주)?\s*([월화수목금토일])요일?/.exec(token);
  if (wk && wk[2]) {
    const target = WEEKDAY[wk[2]]!;
    const base = (target - today.getDay() + 7) % 7;
    const which = wk[1];
    let delta = base;
    if (which === '다음주' || which === '담주') delta = base + 7;
    else if (which === '다다음주') delta = base + 14;
    // '이번주' 또는 수식어 없음 → base(다음 도래 요일, 오늘이면 오늘).
    return formatDate(addDays(today, delta));
  }

  const md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(token);
  if (md && md[1] && md[2]) {
    const month = Number(md[1]);
    const day = Number(md[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = today.getFullYear();
      const candidate = new Date(year, month - 1, day);
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (candidate.getTime() < todayMidnight.getTime()) {
        year += 1; // 이미 지난 월/일 → 내년
      }
      const valid = new Date(year, month - 1, day);
      if (valid.getMonth() === month - 1 && valid.getDate() === day) return formatDate(valid);
    }
    return null;
  }

  // 그 달의 며칠만 적힌 형태 — 기준 날짜가 있을 때만 푼다.
  if (monthHint !== null) {
    const dayOnly = /^\s*(\d{1,2})\s*일\s*$/.exec(token);
    if (dayOnly && dayOnly[1]) {
      const day = Number(dayOnly[1]);
      if (day >= 1 && day <= 31) {
        let candidate = new Date(monthHint.getFullYear(), monthHint.getMonth(), day);
        // 기준보다 이르면 다음 달이다("8월 30일부터 2일까지" → 9월 2일).
        if (candidate.getTime() < monthHint.getTime()) {
          candidate = new Date(monthHint.getFullYear(), monthHint.getMonth() + 1, day);
        }
        if (candidate.getDate() === day) return formatDate(candidate);
      }
    }
  }

  return null;
}

function matchDate(text: string, today: Date): Matched<string> | null {
  for (const re of DATE_TOKEN_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const value = resolveDateToken(m[0], today, null);
    if (value !== null) return { value, raw: m[0] };
  }
  return null;
}

// ─────────────────────────── 기간 ───────────────────────────

/** 날짜 표현 하나(찾기용). `DATE_TOKEN_PATTERNS` 와 같은 순서 + 맨 뒤에 "며칠"을 더한다. */
const DATE_EXPR =
  '(?:모레|내일모레|글피|오늘|내일|낼' +
  '|\\d{1,3}\\s*일\\s*(?:뒤|후)' +
  '|(?:이번주|다음주|담주|다다음주)?\\s*[월화수목금토일]요일?' +
  '|\\d{1,2}\\s*월\\s*\\d{1,2}\\s*일' +
  '|\\d{1,2}\\s*일)';

/**
 * "A부터 B까지" 같은 **기간**을 찾는다.
 *
 * 왜 따로 두는가: 이걸 모르면 "오늘부터 내일까지"에서 "오늘"만 떼어 가고 본문에
 * **"부터 내일까지"** 라는 부스러기가 남는다. 날짜도 하루로만 잡힌다(실제 신고 사례).
 *
 * 뒷쪽에 "27일"처럼 며칠만 적는 경우가 흔해서, 앞쪽 날짜를 기준으로 풀어 준다.
 */
function matchDateRange(text: string, today: Date): Matched<{ start: string; end: string }> | null {
  const patterns = [
    new RegExp(`(${DATE_EXPR})\\s*(?:부터|에서)\\s*(${DATE_EXPR})\\s*까지`),
    new RegExp(`(${DATE_EXPR})\\s*(?:부터|에서)\\s*(${DATE_EXPR})`),
    new RegExp(`(${DATE_EXPR})\\s*~\\s*(${DATE_EXPR})`),
  ];

  for (const re of patterns) {
    const m = re.exec(text);
    if (!m || !m[1] || !m[2]) continue;

    const start = resolveDateToken(m[1], today, null);
    if (start === null) continue;

    // 뒷쪽은 앞쪽을 기준으로 푼다 — "27일"이 몇 월인지는 앞쪽이 정한다.
    const startDate = new Date(`${start}T00:00:00`);
    const end = resolveDateToken(m[2], today, startDate);
    if (end === null) continue;

    // 끝이 시작보다 이르면 기간으로 보지 않는다. 사용자가 뭘 뜻했는지 알 수 없으므로
    // 넘겨짚지 않고 원문을 남긴 뒤 하루짜리 인식에 맡긴다.
    if (end < start) continue;

    return { value: { start, end }, raw: m[0] };
  }
  return null;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 한 줄 빠른입력을 파싱. 인식된 토큰은 본문에서 제거하고, 못 찾은 필드는 undefined.
 * 순서(우선순위·카테고리·반복·시간·날짜)대로 추출하며 각 토큰을 원문에서 제거한다.
 */
export function parseQuickInput(raw: string, today: Date = new Date()): QuickInputParseResult {
  const original = raw;
  let working = ` ${raw} `;

  const priority = matchPriority(working);
  if (priority) working = strip(working, priority.raw);

  const category = matchCategory(working);
  if (category) working = strip(working, category.raw);

  const recurrence = matchRecurrence(working);
  if (recurrence) working = strip(working, recurrence.raw);

  const time = matchTime(working);
  if (time) working = strip(working, time.raw);

  // 기간을 **하루짜리보다 먼저** 본다. 나중에 보면 "오늘부터 내일까지"에서 "오늘"이
  // 먼저 떨어져 나가 본문에 "부터 내일까지" 부스러기가 남는다.
  const range = matchDateRange(working, today);
  if (range) working = strip(working, range.raw);

  const date = range ? null : matchDate(working, today);
  if (date) working = strip(working, date.raw);

  const text = collapse(working);

  const result: {
    text: string;
    dueDate?: string;
    startDate?: string;
    time?: string;
    priority?: TodoPriority;
    categoryHint?: string;
    recurrence?: TodoRecurrence;
  } = {
    // 본문이 비면(전체가 토큰이었으면) 데이터 손실 방지를 위해 원문 트림으로 폴백.
    text: text.length > 0 ? text : original.trim(),
  };
  if (range) {
    result.startDate = range.value.start;
    result.dueDate = range.value.end;
  }
  if (date) result.dueDate = date.value;
  if (time) result.time = time.value;
  if (priority) result.priority = priority.value;
  if (category) result.categoryHint = category.value;
  if (recurrence) result.recurrence = recurrence.value;
  return result;
}

/** 인식된 토큰이 하나라도 있는지(미리보기 칩 표시 여부 판단용). */
export function hasRecognizedTokens(r: QuickInputParseResult): boolean {
  return (
    r.dueDate !== undefined ||
    r.startDate !== undefined ||
    r.time !== undefined ||
    r.priority !== undefined ||
    r.categoryHint !== undefined ||
    r.recurrence !== undefined
  );
}
