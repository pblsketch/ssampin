/**
 * 빠른 학생 기록 허브의 읽기 모델 — 순수 규칙.
 *
 * ★이 파일이 지키는 것: **저장 위치를 추측하지 않는다.** 선생님은 학생을 먼저 찾지만,
 * 그 기록이 담임 누가기록으로 갈지 어느 수업반의 관찰기록으로 갈지는 화면에서 직접 고른다.
 * 그래서 여기서는 "고를 수 있는 맥락 목록"만 만들고, 어느 하나를 기본값으로 정하지 않는다.
 *
 * ★학생 동일성 판정이 이 파일의 핵심 위험이다. 담임 명렬의 학생과 수업반 명단의 학생은
 * 서로 다른 저장소에 서로 다른 식별자로 있다(담임=`Student.id`, 수업반=`studentKey`).
 * 이름만 견주면 동명이인이 한 사람으로 합쳐지고, 그러면 **남의 기록칸에 저장**된다.
 * 그래서 합치는 기준은 `반 별칭 + 번호 + 이름`이 **모두** 같을 때뿐이다. 반을 알 수 없으면
 * 합치지 않고 두 줄로 남긴다 — 줄이 둘인 것은 불편할 뿐이지만, 잘못 합친 것은 사고다.
 *
 * 도메인이므로 외부 패키지·다른 레이어를 import 하지 않는다.
 */

import type { Student } from '@domain/entities/Student';
import type { TeachingClass, TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import { isStudentActive } from './studentActivity';
import { isTeachingClassArchived } from './teachingClassArchive';
import { classAlias } from './classNameAlias';

/** 기록이 실제로 저장될 곳의 종류. 담임 누가기록과 교과 관찰기록은 끝까지 섞지 않는다. */
export type QuickRecordContextKind = 'homeroom' | 'teaching';

export interface QuickRecordContext {
  readonly kind: QuickRecordContextKind;
  /** 담임은 항상 `'homeroom'`, 교과는 `TeachingClass.id`. */
  readonly contextId: string;
  /** 저장 경로가 쓰는 학생 식별자 — 담임은 `Student.id`, 교과는 `studentKey(...)`. */
  readonly studentRef: string;
  /** 화면 라벨. 예: `담임 · 2-3`, `국어 · 2-5`. */
  readonly label: string;
  readonly className: string;
  /** 교과 맥락에만 있다. */
  readonly subject?: string;
}

export interface QuickRecordCandidate {
  /** 합치기 기준이자 화면 key — `반별칭|번호|이름`. */
  readonly identity: string;
  readonly name: string;
  readonly number?: number;
  readonly contexts: readonly QuickRecordContext[];
}

/** 담임 명렬 — 담임이 아닌 선생님에게는 없다(null). */
export interface HomeroomSource {
  /** `settings.className` 그대로. */
  readonly className: string;
  /** `settings.grade` 그대로(없을 수 있다). */
  readonly grade?: string;
  readonly students: readonly Student[];
}

/**
 * 반 별칭 — "2학년 3반"과 "2-3"을 같은 반으로 본다(`classAlias`).
 * 학년과 반이 따로 있으면 `2-3` 꼴로 붙여서 견준다.
 */
function homeroomAlias(source: HomeroomSource): string {
  const grade = source.grade?.trim() ?? '';
  const name = source.className.trim();
  if (grade.length > 0 && /^\d{1,2}$/.test(grade)) return classAlias(`${grade}-${name}`);
  return classAlias(name);
}

/**
 * 수업반 학생이 속한 반의 별칭.
 * 학생이 학년·반을 직접 들고 있으면 그것이 정본이다(여러 반이 섞인 수업반).
 * 없으면 수업반 이름으로 본다 — 이름이 "공국2"처럼 학년-반 꼴이 아니면 그대로 남고,
 * 그 경우 담임 명렬과는 **합쳐지지 않는다**(같은 반인지 알 수 없다).
 */
function teachingStudentAlias(cls: TeachingClass, s: TeachingClassStudent): string {
  if (s.grade != null && s.classNum != null) return `${s.grade}-${s.classNum}`;
  return classAlias(cls.name);
}

function identityOf(alias: string, num: number | undefined, name: string): string {
  return `${alias}|${num ?? ''}|${name.trim()}`;
}

export interface BuildQuickRecordCandidatesParams {
  readonly homeroom?: HomeroomSource | null;
  readonly teachingClasses: readonly TeachingClass[];
}

/**
 * 오늘 기록할 수 있는 학생 후보와, 학생마다 **고를 수 있는 저장 위치**를 만든다.
 *
 * - 활성 학생만 담는다(전출·자퇴 학생에게 새 기록을 만들지 않는다).
 * - 보관된 수업반은 새 기록 대상이 아니므로 제외한다.
 * - 같은 학생이 여러 수업반에 있으면 수업반마다 **별개의 선택지**로 남긴다.
 */
export function buildQuickRecordCandidates({
  homeroom,
  teachingClasses,
}: BuildQuickRecordCandidatesParams): readonly QuickRecordCandidate[] {
  const map = new Map<string, { name: string; number?: number; contexts: QuickRecordContext[] }>();

  if (homeroom) {
    const alias = homeroomAlias(homeroom);
    // 반 이름을 아직 설정하지 않았으면 "담임 · " 뒤가 비어 보인다. 그럴 땐 "담임"만 쓴다.
    const label = alias.length > 0 ? `담임 · ${alias}` : '담임';
    for (const s of homeroom.students) {
      if (!isStudentActive(s)) continue;
      const id = identityOf(alias, s.studentNumber, s.name);
      const entry = map.get(id) ?? { name: s.name, number: s.studentNumber, contexts: [] };
      entry.contexts.push({
        kind: 'homeroom',
        contextId: 'homeroom',
        studentRef: s.id,
        label,
        className: alias,
      });
      map.set(id, entry);
    }
  }

  for (const cls of teachingClasses) {
    if (isTeachingClassArchived(cls)) continue;
    for (const s of cls.students) {
      if (!isStudentActive(s)) continue;
      const alias = teachingStudentAlias(cls, s);
      const id = identityOf(alias, s.number, s.name);
      const entry = map.get(id) ?? { name: s.name, number: s.number, contexts: [] };
      entry.contexts.push({
        kind: 'teaching',
        contextId: cls.id,
        studentRef: studentKey(s),
        label: `${cls.subject} · ${cls.name}`,
        className: cls.name,
        subject: cls.subject,
      });
      map.set(id, entry);
    }
  }

  return [...map.entries()]
    .map(([identity, v]) => ({
      identity,
      name: v.name,
      number: v.number,
      contexts: v.contexts as readonly QuickRecordContext[],
    }))
    .sort((a, b) => {
      const an = a.number ?? Number.MAX_SAFE_INTEGER;
      const bn = b.number ?? Number.MAX_SAFE_INTEGER;
      if (an !== bn) return an - bn;
      return a.name.localeCompare(b.name, 'ko');
    });
}

/** 이름 또는 번호로 거르기. 빈 검색어면 전체를 그대로 돌려준다. */
export function filterQuickRecordCandidates(
  candidates: readonly QuickRecordCandidate[],
  query: string,
): readonly QuickRecordCandidate[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return candidates;
  return candidates.filter(
    (c) => c.name.toLowerCase().includes(q) || (c.number != null && String(c.number).includes(q)),
  );
}

/** 여러 명 기록에서 쓰는 공통 맥락 — 학생마다 저장 대상이 다르므로 명단을 함께 들고 다닌다. */
export interface SharedQuickRecordContext {
  readonly kind: QuickRecordContextKind;
  readonly contextId: string;
  readonly label: string;
  readonly members: readonly {
    readonly identity: string;
    readonly name: string;
    readonly studentRef: string;
  }[];
}

/**
 * 고른 학생 **전원**에게 있는 맥락만 남긴다.
 *
 * ★공통이 아닌 맥락을 남기면 "3명에게 기록"이라 해 놓고 2명에게만 저장된다.
 * 공통 맥락이 하나도 없으면 빈 배열이고, 화면은 그 이유를 말해야 한다.
 */
export function sharedQuickRecordContexts(
  selected: readonly QuickRecordCandidate[],
): readonly SharedQuickRecordContext[] {
  if (selected.length === 0) return [];
  const first = selected[0]!;
  const out: SharedQuickRecordContext[] = [];
  for (const ctx of first.contexts) {
    const members: { identity: string; name: string; studentRef: string }[] = [];
    let complete = true;
    for (const cand of selected) {
      const match = cand.contexts.find((c) => c.kind === ctx.kind && c.contextId === ctx.contextId);
      if (!match) {
        complete = false;
        break;
      }
      members.push({ identity: cand.identity, name: cand.name, studentRef: match.studentRef });
    }
    if (complete) {
      out.push({ kind: ctx.kind, contextId: ctx.contextId, label: ctx.label, members });
    }
  }
  return out;
}

/**
 * 오늘 이 학생에게 남은 기록의 **종류**만. 건수는 담지 않는다.
 *
 * ★불가침: 기록량으로 학생을 줄 세우지 않는다. 그래서 boolean 두 개뿐이다.
 * 출결과 비출결(누가기록·특기사항)을 나눈 이유는, 체크 하나로 합치면 선생님이
 * "출석 확인했다"와 "관찰을 남겼다"를 구별하지 못하기 때문이다.
 */
export interface TodayRecordMark {
  readonly attendance: boolean;
  readonly note: boolean;
}

export interface BuildTodayMarksParams {
  readonly candidates: readonly QuickRecordCandidate[];
  /** 담임 누가기록 — `category === 'attendance'` 가 출결이다. */
  readonly homeroomRecords: readonly {
    readonly studentId: string;
    readonly category: string;
    readonly date: string;
  }[];
  /** 교과 관찰기록. */
  readonly observationRecords: readonly {
    readonly studentId: string;
    readonly classId: string;
    readonly date: string;
  }[];
  readonly today: string;
}

/**
 * 후보 학생별 오늘 기록 표시. 키는 `QuickRecordCandidate.identity`.
 *
 * ★수업반 출결을 담임 기록 사본으로 추정하지 않는다. 여기서 보는 것은 담임 맥락의 담임 기록과
 * 교과 맥락의 관찰기록뿐이고, 수업반 출결 정본은 각 수업반 화면이 그대로 갖는다.
 */
export function buildTodayRecordMarks({
  candidates,
  homeroomRecords,
  observationRecords,
  today,
}: BuildTodayMarksParams): ReadonlyMap<string, TodayRecordMark> {
  const homeroomToday = new Map<string, { attendance: boolean; note: boolean }>();
  for (const r of homeroomRecords) {
    if (r.date !== today) continue;
    const cur = homeroomToday.get(r.studentId) ?? { attendance: false, note: false };
    if (r.category === 'attendance') cur.attendance = true;
    else cur.note = true;
    homeroomToday.set(r.studentId, cur);
  }

  const observationToday = new Set<string>();
  for (const r of observationRecords) {
    if (r.date !== today) continue;
    observationToday.add(`${r.classId}|${r.studentId}`);
  }

  const out = new Map<string, TodayRecordMark>();
  for (const cand of candidates) {
    let attendance = false;
    let note = false;
    for (const ctx of cand.contexts) {
      if (ctx.kind === 'homeroom') {
        const hit = homeroomToday.get(ctx.studentRef);
        if (hit?.attendance === true) attendance = true;
        if (hit?.note === true) note = true;
      } else if (observationToday.has(`${ctx.contextId}|${ctx.studentRef}`)) {
        note = true;
      }
    }
    if (attendance || note) out.set(cand.identity, { attendance, note });
  }
  return out;
}

/** 오늘 시간표 한 칸 — 어느 수업반과 이어졌는지까지 붙인 뒤 이 모듈로 넘어온다. */
export interface TodayLesson {
  readonly period: number;
  readonly subject: string;
  readonly classroom: string;
  /** 시간표 칸과 이어진 수업반. 못 찾았으면 null(학생 명단을 못 보여준다). */
  readonly classId: string | null;
  /** 교시 시작·끝(자정부터의 분). `parseMinutes`로 만든다. */
  readonly startMinutes: number;
  readonly endMinutes: number;
}

export interface TodayLessonSplit {
  /** 지금 진행 중인 수업. 쉬는 시간·점심에는 null. */
  readonly current: TodayLesson | null;
  /** 아직 시작하지 않은 첫 수업. 오늘 남은 수업이 없으면 null. */
  readonly next: TodayLesson | null;
  /** 그 밖의 오늘 수업(이미 지난 것 포함) — 화면에서는 접어 둔다. */
  readonly rest: readonly TodayLesson[];
}

/**
 * 오늘 수업을 현재 / 다음 / 나머지로 가른다.
 *
 * ★교시 번호가 아니라 **시각**으로 가른다. 쉬는 시간과 점심에는 "현재 수업"이 없지만
 * "다음 수업"은 있어야 하는데, 교시 번호만 보면 그 상태를 표현할 수 없다.
 */
export function splitTodayLessons(
  lessons: readonly TodayLesson[],
  nowMinutes: number,
): TodayLessonSplit {
  const sorted = [...lessons].sort((a, b) => a.period - b.period);
  const current =
    sorted.find((l) => nowMinutes >= l.startMinutes && nowMinutes < l.endMinutes) ?? null;
  const next = sorted.find((l) => l.startMinutes > nowMinutes) ?? null;
  const rest = sorted.filter((l) => l !== current && l !== next);
  return { current, next, rest };
}

/**
 * 어떤 수업반의 활성 학생 후보만 — 현재/다음 수업 칩을 그릴 때 쓴다.
 * 그 수업반 맥락을 가진 후보만 남기므로, 담임 전용 후보가 섞이지 않는다.
 */
export function candidatesForClass(
  candidates: readonly QuickRecordCandidate[],
  classId: string,
): readonly QuickRecordCandidate[] {
  return candidates.filter((c) =>
    c.contexts.some((ctx) => ctx.kind === 'teaching' && ctx.contextId === classId),
  );
}
