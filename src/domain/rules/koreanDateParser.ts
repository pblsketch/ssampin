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
function matchTime(text: string): Matched<string> | null {
  // HH:MM
  const hm = /\b(\d{1,2}):(\d{2})\b/.exec(text);
  if (hm) {
    const h = Number(hm[1]);
    const min = Number(hm[2]);
    if (h <= 23 && min <= 59) return { value: `${pad2(h)}:${pad2(min)}`, raw: hm[0] };
  }
  // 오전/오후 N시(반)
  const ampm = /(오전|오후)\s*(\d{1,2})\s*시(\s*반)?/.exec(text);
  if (ampm) {
    let h = Number(ampm[2]);
    const half = ampm[3] ? 30 : 0;
    if (h >= 1 && h <= 12) {
      if (ampm[1] === '오후') h = h === 12 ? 12 : h + 12;
      else h = h === 12 ? 0 : h; // 오전 12시 = 00시
      return { value: `${pad2(h)}:${pad2(half)}`, raw: ampm[0] };
    }
  }
  // 맨 N시(반) — 1~6시는 오후로 해석(학교 일과 맥락), 7~23시는 그대로.
  const bare = /(\d{1,2})\s*시(\s*반)?/.exec(text);
  if (bare) {
    let h = Number(bare[1]);
    const half = bare[2] ? 30 : 0;
    if (h >= 1 && h <= 23) {
      if (h >= 1 && h <= 6) h += 12;
      return { value: `${pad2(h)}:${pad2(half)}`, raw: bare[0] };
    }
  }
  // 프리셋(아침/점심/저녁/밤)
  for (const [word, value] of Object.entries(TIME_PRESET)) {
    if (text.includes(word)) return { value, raw: word };
  }
  return null;
}

// ─────────────────────────── 날짜 ───────────────────────────
function matchDate(text: string, today: Date): Matched<string> | null {
  // 상대 단어
  const rel: ReadonlyArray<readonly [RegExp, number]> = [
    [/모레|내일모레/, 2],
    [/글피/, 3],
    [/오늘/, 0],
    [/내일|낼/, 1],
  ];
  for (const [re, offset] of rel) {
    const m = re.exec(text);
    if (m) return { value: formatDate(addDays(today, offset)), raw: m[0] };
  }

  // N일 뒤/후
  const after = /(\d{1,3})\s*일\s*(뒤|후)/.exec(text);
  if (after && after[1]) {
    return { value: formatDate(addDays(today, Number(after[1]))), raw: after[0] };
  }

  // (이번주|다음주|다다음주)? 요일 — base = 이번 주 기준 해당 요일까지의 일수(오늘이면 0).
  const wk = /(이번주|다음주|담주|다다음주)?\s*([월화수목금토일])요일?/.exec(text);
  if (wk && wk[2]) {
    const target = WEEKDAY[wk[2]]!;
    const cur = today.getDay();
    const base = (target - cur + 7) % 7;
    const which = wk[1];
    let delta = base;
    if (which === '다음주' || which === '담주') delta = base + 7;
    else if (which === '다다음주') delta = base + 14;
    // '이번주' 또는 수식어 없음 → base(다음 도래 요일, 오늘이면 오늘).
    return { value: formatDate(addDays(today, delta)), raw: wk[0] };
  }

  // N월 N일
  const md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(text);
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
      if (valid.getMonth() === month - 1 && valid.getDate() === day) {
        return { value: formatDate(valid), raw: md[0] };
      }
    }
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

  const date = matchDate(working, today);
  if (date) working = strip(working, date.raw);

  const text = collapse(working);

  const result: {
    text: string;
    dueDate?: string;
    time?: string;
    priority?: TodoPriority;
    categoryHint?: string;
    recurrence?: TodoRecurrence;
  } = {
    // 본문이 비면(전체가 토큰이었으면) 데이터 손실 방지를 위해 원문 트림으로 폴백.
    text: text.length > 0 ? text : original.trim(),
  };
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
    r.time !== undefined ||
    r.priority !== undefined ||
    r.categoryHint !== undefined ||
    r.recurrence !== undefined
  );
}
