import type {
  LastRecordDateProvider,
  NameExposure,
  RankedStudent,
  ReminderScheduleItem,
  ReminderSettings,
  ReminderStudent,
  ReminderTarget,
} from '../entities/RecordReminder';

/**
 * 학생 관찰 기록 알림 — 순수 도메인 규칙.
 *
 * 감지(공백)·선정(오래된 순 + 관심/제외)·로테이션·방해금지·문구·forward 스케줄 계산을
 * 부작용 없는 순수함수로 제공한다. 모든 시각 의존 함수는 `now: Date` 를 주입받아 결정론을 보장한다.
 * 저장처(담임/수업반)는 `LastRecordDateProvider` 주입으로 은닉한다.
 */

/** 질문 프롬프트 후보 — rotationIndex 로 순환해 매번 같은 문구가 뜨지 않게 한다. */
export const REMINDER_PROMPTS: readonly string[] = [
  '요즘 {name} 학생은 학교에서 어떤 모습이었나요?',
  '{name} 학생, 최근에 눈에 띈 점이 있었나요?',
  '{name} 학생은 요즘 어떻게 지내나요?',
  '오늘 {name} 학생을 관찰한 게 있다면 남겨볼까요?',
];

/**
 * 빈 슬롯을 가리키는 문구 후보 — 슬롯 현황을 아는 경우에만 쓴다.
 *
 * ★이것은 **문구만** 바꾼다. 누구를 부를지는 그대로다(공백 오래된 순).
 * 슬롯이 비었다고 어제 기록한 학생을 다시 부르면 성가시고, 그러면 알림을 꺼 버린다 —
 * 알림이 꺼지면 기록 누적 자체가 멈춘다(설계서 §6).
 */
export const SLOT_REMINDER_PROMPTS: readonly string[] = [
  "{name} 학생, 요즘 '{slot}' 장면이 안 보이네요. 있었나요?",
  "{name} 학생의 '{slot}' 을(를) 보여 준 순간이 있었나요?",
  "{name} 학생, '{slot}' 쪽 기록이 아직 없어요.",
];

/** 'YYYY-MM-DD' 문자열을 로컬 자정 기준 Date 로 파싱. */
function parseDateStr(dateStr: string): Date | null {
  const parts = dateStr.split('-').map(Number);
  const [y, m, d] = parts;
  if (y === undefined || m === undefined || d === undefined) return null;
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return new Date(y, m - 1, d);
}

/** Date → 'YYYY-MM-DD' (로컬). */
export function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 로컬 자정 기준으로 두 날짜 사이의 일수 차이(정수). */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** 'HH:mm' → 자정 이후 분(minute). 파싱 실패 시 null. */
function toMinutes(hhmm: string): number | null {
  const parts = hhmm.split(':').map(Number);
  const [h, m] = parts;
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * 마지막 기록 후 경과 일수. 기록 전무면 `Number.POSITIVE_INFINITY`.
 * (같은 날 기록은 0.)
 */
export function daysSinceLastRecord(
  provider: LastRecordDateProvider,
  studentId: string,
  now: Date,
): number {
  const last = provider(studentId);
  if (!last) return Number.POSITIVE_INFINITY;
  const lastDate = parseDateStr(last);
  if (!lastDate) return Number.POSITIVE_INFINITY;
  return Math.max(0, daysBetween(lastDate, now));
}

/**
 * 학생을 '공백 오래된 순'으로 정렬한다.
 * - 제외 학생(excludedStudentIds)은 결과에서 뺀다.
 * - 1차 정렬: 경과 일수 내림차순(오래 안 본 학생 먼저).
 * - 2차 정렬: 관심 학생(focusedStudentIds) 우선.
 * - 3차 정렬: 이름 오름차순(결정론).
 */
export function rankStalestStudents(
  students: readonly ReminderStudent[],
  provider: LastRecordDateProvider,
  config: Pick<ReminderSettings, 'excludedStudentIds' | 'focusedStudentIds'>,
  now: Date,
): RankedStudent[] {
  const excluded = new Set(config.excludedStudentIds);
  const focused = new Set(config.focusedStudentIds);
  return students
    .filter((s) => !excluded.has(s.id))
    .map((student) => ({
      student,
      lastRecordDate: provider(student.id),
      daysSinceLastRecord: daysSinceLastRecord(provider, student.id, now),
    }))
    .sort((a, b) => {
      if (a.daysSinceLastRecord !== b.daysSinceLastRecord) {
        return b.daysSinceLastRecord - a.daysSinceLastRecord;
      }
      const af = focused.has(a.student.id) ? 0 : 1;
      const bf = focused.has(b.student.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return a.student.name.localeCompare(b.student.name);
    });
}

/**
 * 배열을 cursor 위치부터 순회하도록 회전한다(전원 순회 공정성).
 * cursor 는 임의 정수 허용(음수·초과값은 modulo 로 보정).
 */
export function applyRotation<T>(items: readonly T[], cursor: number): T[] {
  if (items.length === 0) return [];
  const start = ((cursor % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** 관심 학생은 공백 임계를 절반으로 낮춘다(더 자주 챙김). 최소 1일. */
function effectiveStaleDays(studentId: string, config: ReminderSettings): number {
  if (config.focusedStudentIds.includes(studentId)) {
    return Math.max(1, Math.floor(config.staleDays / 2));
  }
  return config.staleDays;
}

/**
 * '지금 물어봐야 할' 학생을 고른다.
 * - 각 학생의 (관심 여부 반영) 공백 임계를 넘긴 학생만.
 * - 오래된 순(rankStalestStudents) → cursor 로테이션 → perNudge 만큼.
 */
export function pickDueStudents(
  students: readonly ReminderStudent[],
  provider: LastRecordDateProvider,
  config: ReminderSettings,
  cursor: number,
  now: Date,
): RankedStudent[] {
  const ranked = rankStalestStudents(students, provider, config, now).filter(
    (r) => r.daysSinceLastRecord >= effectiveStaleDays(r.student.id, config),
  );
  const rotated = applyRotation(ranked, cursor);
  return rotated.slice(0, Math.max(0, config.perNudge));
}

/**
 * now 가 방해금지 구간에 속하는지. 자정 넘김(예: 22:00~07:00) 처리.
 * start/end 중 하나라도 null 이면 방해금지 미설정 → false.
 */
export function isWithinDoNotDisturb(now: Date, start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s === e) return false; // 빈 구간
  if (s < e) return cur >= s && cur < e; // 같은 날 구간
  return cur >= s || cur < e; // 자정 넘김 구간
}

/** 프롬프트 문구를 rotationIndex 로 순환 선택하고 {name} 치환. */
export function resolvePromptText(rotationIndex: number, studentName: string): string {
  const idx =
    ((rotationIndex % REMINDER_PROMPTS.length) + REMINDER_PROMPTS.length) % REMINDER_PROMPTS.length;
  return (REMINDER_PROMPTS[idx] ?? REMINDER_PROMPTS[0]!).replace('{name}', studentName);
}

/**
 * 빈 슬롯이 있으면 그걸 가리키는 문구를, 없으면 기존 문구를 돌려준다.
 *
 * `emptySlot` 은 호출자가 `emptySlots()` 로 구한 **기본 어휘** 중 하나다 — 교사가 직접
 * 추가한 슬롯은 재촉하지 않는다(직접 만든 칸을 "왜 안 채웠냐"고 물으면 알림을 끈다).
 * 슬롯 정보를 모르면 `undefined` 를 넘겨 기존 문구로 폴백한다.
 */
export function resolveSlotPromptText(
  rotationIndex: number,
  studentName: string,
  emptySlot: string | undefined,
): string {
  if (!emptySlot) return resolvePromptText(rotationIndex, studentName);
  const pool = SLOT_REMINDER_PROMPTS;
  const idx = ((rotationIndex % pool.length) + pool.length) % pool.length;
  return (pool[idx] ?? pool[0]!).replace('{name}', studentName).replace('{slot}', emptySlot);
}

/**
 * 아직 주제(탐구 흐름)로 안 묶은 근거가 쌓였을 때 문구 뒤에 덧붙이는 꼬리.
 *
 * ★**문구만** 바꾼다. 누구를 부를지는 그대로다(ADR-072 결정 6 — 큰 배치 작업을 만들지 않는다).
 * 주제 묶기는 학기말 배치가 되기 쉬운 일이라, 알림이 지나가는 길에 "N건 남았다"고 조금씩
 * 재촉하는 정도로만 둔다. 이 꼬리 때문에 알림이 더 자주 뜨지도, 다른 학생이 불려 나오지도 않는다.
 *
 * ★건수만 적는다. "몇 %를 묶었다" 같은 채움률·순위는 만들지 않는다.
 * 0건이거나 이상한 수면 **빈 문자열**을 돌려준다 — 붙일 말이 없으면 문구를 건드리지 않는다.
 */
export function unclassifiedEvidenceSuffix(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return ` · 미분류 근거 ${Math.floor(count)}건`;
}

/** 알림 문구에 "미분류 근거 N건" 꼬리를 붙인다. 0건이면 원문 그대로. */
export function appendUnclassifiedEvidence(promptText: string, count: number): string {
  return `${promptText}${unclassifiedEvidenceSuffix(count)}`;
}

/** nameExposure 정책에 따라 알림 본문용 이름을 마스킹한다. */
export function maskName(name: string, exposure: NameExposure): string {
  if (exposure === 'full') return name;
  if (exposure === 'none') return '';
  // initial: 성 1글자 + '○○'
  const first = [...name.trim()][0] ?? '';
  return first ? `${first}○○` : '';
}

/** 피로 dedup 키 — 같은 학생·같은 날은 어느 기기에서든 1회로 수렴. */
export function studentDedupKey(studentId: string, dateStr: string): string {
  return `${studentId}:${dateStr}`;
}

/**
 * 발화 장부에서 오래된 키(keepDays 이전 날짜)를 제거한다(무한 증가 방지).
 * 키는 `studentId:YYYY-MM-DD` 형식이며 마지막 ':' 뒤가 날짜다.
 */
export function pruneFiredKeys(keys: readonly string[], now: Date, keepDays: number): string[] {
  const cutoff = formatDateStr(addDays(now, -Math.max(0, keepDays)));
  return keys.filter((k) => {
    const date = k.slice(k.lastIndexOf(':') + 1);
    return date >= cutoff;
  });
}

/** 알림 본문 생성 — 이름 노출 여부에 따라 무명 문구 또는 프롬프트. */
function buildBody(
  student: ReminderStudent,
  config: ReminderSettings,
  rotationIndex: number,
): string {
  const masked = maskName(student.name, config.nameExposure);
  if (!masked) return '기록할 학생이 있어요';
  return resolvePromptText(rotationIndex, masked);
}

/** 해당 요일이 알림 대상인지 (weekdays 빈 배열이면 매일). */
function isEligibleWeekday(date: Date, weekdays: readonly number[]): boolean {
  if (weekdays.length === 0) return true;
  return weekdays.includes(date.getDay());
}

/**
 * 각 후보 학생의 **다음 발화 시각(fireAt)** 을 forward-looking 으로 미리 계산한다(M1).
 *
 * "오늘 due 인 학생"만이 아니라, 아직 due 가 아니지만 horizon 안에 공백 임계를 넘길 학생까지
 * 포함해 미래 timestamp 를 미리 예약한다. 렌더러가 죽어있는 동안(위젯/아이콘+절전) main 이
 * 이 예약을 그대로 발화하므로, 자정을 넘겨 임계에 도달하는 학생도 놓치지 않는다.
 *
 * @param students   대상 학생
 * @param provider   마지막 기록일 provider
 * @param config     리마인더 설정
 * @param firedKeys  이미 발화한 dedup 키 집합(`studentId:date`) — 중복 발화 방지
 * @param cursor     로테이션 커서
 * @param now        기준 시각(주입)
 * @param idFactory  reminderId 생성기(주입 — 결정론 테스트 용이)
 */
export function buildForwardSchedule(
  students: readonly ReminderStudent[],
  provider: LastRecordDateProvider,
  config: ReminderSettings,
  firedKeys: ReadonlySet<string>,
  cursor: number,
  now: Date,
  idFactory: (studentId: string, dateStr: string) => string,
): ReminderScheduleItem[] {
  const time = toMinutes(config.time);
  if (time === null) return [];
  const target: ReminderTarget = config.targets[0] ?? 'homeroom';

  const excluded = new Set(config.excludedStudentIds);
  const rotated = applyRotation(
    students.filter((s) => !excluded.has(s.id)),
    cursor,
  );

  // 후보별 '다음 발화 날짜' 산출
  interface Candidate {
    readonly student: ReminderStudent;
    readonly fireDate: Date;
    readonly fireAt: number;
    readonly rotationIndex: number;
  }
  const candidates: Candidate[] = [];

  rotated.forEach((student, rotationIndex) => {
    const last = provider(student.id);
    const stale = effectiveStaleDays(student.id, config);
    // due 가 되는 날짜: 마지막 기록 + 임계일. 기록 전무면 오늘.
    let dueDate: Date;
    if (!last) {
      dueDate = now;
    } else {
      const lastDate = parseDateStr(last);
      dueDate = lastDate ? addDays(lastDate, stale) : now;
    }

    // horizon 안에서 dueDate 이후(그리고 오늘 이후)의 첫 유효 발화 시각을 찾는다.
    for (let offset = 0; offset <= config.horizonDays; offset++) {
      const day = addDays(now, offset);
      if (daysBetween(day, dueDate) > 0) continue; // 아직 due 전
      if (!isEligibleWeekday(day, config.weekdays)) continue;
      const fireAt = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        Math.floor(time / 60),
        time % 60,
      ).getTime();
      if (fireAt <= now.getTime()) continue; // 이미 지난 시각
      if (
        isWithinDoNotDisturb(new Date(fireAt), config.doNotDisturbStart, config.doNotDisturbEnd)
      ) {
        continue;
      }
      const dedup = studentDedupKey(student.id, formatDateStr(day));
      if (firedKeys.has(dedup)) continue;
      candidates.push({ student, fireDate: day, fireAt, rotationIndex });
      break;
    }
  });

  // fireAt 오름차순 정렬
  candidates.sort((a, b) => a.fireAt - b.fireAt);

  // 날짜별 dailyFireCap 상한 적용 (perNudge는 인앱 팝업 배치 크기이지 OS 토스트 상한이 아님).
  // 이미 발화한 키(firedKeys)를 그 날짜 카운트에 먼저 반영해, 오늘 이미 cap만큼 쐈다면 추가 예약을 막는다.
  const cap = Math.max(1, config.dailyFireCap);
  const perDayCount = new Map<string, number>();
  for (const key of firedKeys) {
    const date = key.slice(key.lastIndexOf(':') + 1);
    perDayCount.set(date, (perDayCount.get(date) ?? 0) + 1);
  }
  const result: ReminderScheduleItem[] = [];
  for (const c of candidates) {
    const dayKey = formatDateStr(c.fireDate);
    const count = perDayCount.get(dayKey) ?? 0;
    if (count >= cap) continue;
    perDayCount.set(dayKey, count + 1);
    result.push({
      reminderId: idFactory(c.student.id, dayKey),
      fireAt: c.fireAt,
      title: '관찰 기록 알림',
      body: buildBody(c.student, config, c.rotationIndex),
      target,
      studentDedupKey: studentDedupKey(c.student.id, dayKey),
    });
  }
  return result;
}
