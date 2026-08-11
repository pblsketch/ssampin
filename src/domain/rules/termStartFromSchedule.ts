/**
 * 학사일정에서 개학일을 찾아내는 규칙.
 *
 * 앱은 개학일을 스스로 알 수 없지만(ADR-037), **학교가 올린 학사일정에는 개학식이 그대로 들어
 * 있다.** 나이스 학사일정 동기화를 켠 학교라면 '2026-08-11 개학식'처럼 정확한 날짜가 이미 앱
 * 안에 있다. 이건 시간표 신호(`termSignalFromTimetable`)보다 두 가지 면에서 낫다:
 *
 *  - **정확하다.** 시간표 신호는 "이 주에는 이미 2학기였다"는 하한선만 주지만, 학사일정은
 *    개학일 자체를 준다.
 *  - **더 넓게 먹힌다.** 나이스에 시간표를 올리지 않은 학교에서는 시간표 신호가 아예 나오지
 *    않는다. 학사일정은 그런 학교에서도 있다.
 *
 * 그래도 **자동 적용은 하지 않는다.** 행사명은 학교마다 제각각이라("개학식"·"2학기 개학"·
 * "등교개시일") 오탐 여지가 있고, 앱이 학사 구간을 단정하지 않는다는 원칙은 그대로다.
 * 이 규칙은 후보를 찾아 주기만 하고 확정은 사용자가 한다.
 */

/** 판정에 필요한 최소 정보 — SchoolEvent 전체를 도메인 규칙에 묶지 않는다. */
export interface ScheduleEventLike {
  /** 'YYYY-MM-DD' */
  readonly date: string;
  /** 표시 제목(사용자 편집분 포함). */
  readonly title: string;
  /** 나이스 원본 행사명 — 있으면 이쪽이 더 정확하다. */
  readonly neisEventName?: string;
}

export interface TermStartCandidate {
  /** 학기 라벨('2026-2'). */
  readonly term: string;
  /** 개학일('2026-08-11'). */
  readonly startIso: string;
  /** 근거가 된 행사명 — 사용자에게 "왜 이 날짜인지" 보여준다. */
  readonly sourceLabel: string;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 개학을 뜻하는 행사명인가.
 *
 * '개학'을 포함하되 방학 시작을 뜻하는 말은 제외한다 — '여름방학식'에는 개학이 없지만
 * '방학·개학 안내'처럼 둘이 함께 적힌 항목이 있어 이름만으로는 갈리지 않는 경우가 있다.
 * 그런 모호한 항목은 버린다(추측 금지 — 확실한 것만 후보로 올린다).
 */
function isOpeningCeremony(name: string): boolean {
  const n = name.replace(/\s+/g, '');
  if (!n.includes('개학') && !n.includes('등교개시')) return false;
  if (n.includes('방학')) return false; // '방학·개학' 혼재 항목은 판단 보류
  return true;
}

/**
 * 행사가 가리키는 학기 라벨. 판단할 수 없으면 null.
 *
 * 이름에 학기가 적혀 있으면 그대로 믿고, 없으면 **날짜의 월**로만 좁게 판단한다:
 *  - 8~9월 개학 → 그 학년도 2학기
 *  - 3월 개학 → 그 학년도 1학기
 *  - 그 밖의 달은 버린다. 특히 **2월 개학은 학기 시작이 아니다**(겨울방학 뒤 2학기 재개).
 *    여기서 2월을 받아들이면 봄방학 직전을 새 학기로 오인한다.
 */
function termOfOpening(dateIso: string, name: string): string | null {
  const m = ISO_DATE_RE.exec(dateIso);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const n = name.replace(/\s+/g, '');

  // 학년도는 3월 시작 — 1~2월 행사는 직전 학년도 소속이다.
  const academicYear = month <= 2 ? year - 1 : year;

  if (n.includes('2학기')) return `${academicYear}-2`;
  if (n.includes('1학기')) return `${academicYear}-1`;

  if (month === 8 || month === 9) return `${academicYear}-2`;
  if (month === 3) return `${academicYear}-1`;
  return null;
}

/**
 * 학사일정에서 학기별 개학일 후보를 뽑는다.
 *
 * 같은 학기에 개학으로 보이는 행사가 여럿이면 **가장 이른 날짜**를 택한다 — 개학식 뒤에
 * 이어지는 관련 행사가 아니라 실제 시작일을 원하기 때문이다.
 *
 * @param onlyTerms 지정하면 그 학기들만 결과에 담는다(관심 없는 학기를 훑지 않게).
 */
export function findTermStartCandidates(
  events: readonly ScheduleEventLike[],
  onlyTerms?: readonly string[],
): readonly TermStartCandidate[] {
  const best = new Map<string, TermStartCandidate>();

  for (const e of events) {
    const name = e.neisEventName ?? e.title;
    if (typeof name !== 'string' || !isOpeningCeremony(name)) continue;
    if (!ISO_DATE_RE.test(e.date)) continue;

    const term = termOfOpening(e.date, name);
    if (term === null) continue;
    if (onlyTerms !== undefined && !onlyTerms.includes(term)) continue;

    const prev = best.get(term);
    if (prev === undefined || e.date < prev.startIso) {
      best.set(term, { term, startIso: e.date, sourceLabel: name });
    }
  }

  return [...best.values()].sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * 그 학기의 개학일 후보 하나. 이미 등록된 학기는 null(다시 제안하지 않는다).
 */
export function findTermStartCandidate(
  events: readonly ScheduleEventLike[],
  term: string,
  termStartDates: Readonly<Record<string, string>> | undefined,
): TermStartCandidate | null {
  if (termStartDates?.[term] !== undefined) return null;
  return findTermStartCandidates(events, [term])[0] ?? null;
}
