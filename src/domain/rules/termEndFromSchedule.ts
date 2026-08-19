/**
 * 학사일정에서 **학기 종료일**을 찾아내는 규칙 — `termStartFromSchedule`의 반대쪽 끝.
 *
 * 학기 총 수업 차시를 세려면 시작과 끝이 둘 다 필요한데, 앱은 끝을 스스로 알 수 없다
 * (ADR-037). 하지만 **학교가 올린 학사일정에는 방학식·종업식이 그대로 들어 있다.**
 * 나이스 학사일정 동기화를 켠 학교라면 '2026-12-31 겨울방학식'처럼 정확한 날짜가 이미
 * 앱 안에 있다.
 *
 * 개학일 규칙과 똑같이 **자동 적용은 하지 않는다.** 행사명은 학교마다 제각각이고, 무엇보다
 * 이 값 하나가 학기 전체 차시 숫자를 좌우한다. 이 규칙은 후보를 찾아 주기만 하고 확정은
 * 사용자가 한다.
 *
 * ⚠️ 방학식·종업식은 **등교일이다.** 그날 수업이 있었는지와 별개로, 학기가 거기서 끝난다는
 * 표지일 뿐이다. 수업일 판정에서 이 행사들을 자동 제외하지 않는 이유는
 * `lessonDayExclusion`에 적혀 있다 — 그러지 않으면 학기 마지막 등교일이 사라지면서 동시에
 * 종료일이 되는 자기 모순이 생긴다.
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

export interface TermEndCandidate {
  /** 학기 라벨('2026-2'). */
  readonly term: string;
  /** 종료일('2026-12-31'). */
  readonly endIso: string;
  /** 근거가 된 행사명 — 사용자에게 "왜 이 날짜인지" 보여준다. */
  readonly sourceLabel: string;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 학기 끝을 뜻하는 행사명인가.
 *
 * 받아들이는 것: '여름방학식'·'겨울방학식'·'종업식'·'방학' 시작을 알리는 항목.
 * 버리는 것: **'개학'이 함께 적힌 항목**('방학·개학 안내'처럼 둘이 한 줄에 있는 경우).
 * 그런 항목은 시작인지 끝인지 이름만으로 갈리지 않으므로 버린다(추측 금지 — 확실한 것만
 * 후보로 올린다. `termStartFromSchedule`이 반대 방향으로 같은 판단을 한다).
 *
 * '졸업식'은 받지 않는다 — 3학년만 해당하는 행사라 학기 종료일과 다를 수 있고, 앱은 반의
 * 학년을 모른다.
 */
function isTermClosingEvent(name: string): boolean {
  const n = name.replace(/\s+/g, '');
  if (n.includes('개학') || n.includes('등교개시')) return false; // 시작·끝 혼재 → 판단 보류
  return n.includes('방학') || n.includes('종업');
}

/**
 * 행사가 가리키는 학기 라벨. 판단할 수 없으면 null.
 *
 * 이름에 학기가 적혀 있으면 그대로 믿고, 없으면 **날짜의 월**로만 좁게 판단한다:
 *  - 7월 → 그 학년도 1학기의 끝(여름방학)
 *  - 12월~2월 → 그 학년도 2학기의 끝(겨울방학·종업)
 *  - 그 밖의 달은 버린다. 특히 **8월은 받지 않는다** — 대부분 2학기 개학이 있는 달이라
 *    '방학'이 들어간 행사가 끝이 아니라 시작 쪽 안내인 경우가 많다.
 */
function termOfClosing(dateIso: string, name: string): string | null {
  const m = ISO_DATE_RE.exec(dateIso);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const n = name.replace(/\s+/g, '');

  // 학년도는 3월 시작 — 1~2월 행사는 직전 학년도 소속이다.
  const academicYear = month <= 2 ? year - 1 : year;

  if (n.includes('2학기')) return `${academicYear}-2`;
  if (n.includes('1학기')) return `${academicYear}-1`;

  if (month === 7) return `${academicYear}-1`;
  if (month === 12 || month === 1 || month === 2) return `${academicYear}-2`;
  return null;
}

/**
 * 학사일정에서 학기별 종료일 후보를 뽑는다.
 *
 * 같은 학기에 끝으로 보이는 행사가 여럿이면 **가장 이른 날짜**를 택한다 — 개학일 규칙과
 * 반대 방향이 아니라 같은 이유다. 우리가 원하는 건 "정규 수업이 멈추는 날"이고, 겨울방학식
 * 뒤에 오는 종업식은 수업이 없는 하루짜리 등교일이기 때문이다.
 *
 * @param onlyTerms 지정하면 그 학기들만 결과에 담는다.
 */
export function findTermEndCandidates(
  events: readonly ScheduleEventLike[],
  onlyTerms?: readonly string[],
): readonly TermEndCandidate[] {
  const best = new Map<string, TermEndCandidate>();

  for (const e of events) {
    const name = e.neisEventName ?? e.title;
    if (typeof name !== 'string' || !isTermClosingEvent(name)) continue;
    if (!ISO_DATE_RE.test(e.date)) continue;

    const term = termOfClosing(e.date, name);
    if (term === null) continue;
    if (onlyTerms !== undefined && !onlyTerms.includes(term)) continue;

    const prev = best.get(term);
    if (prev === undefined || e.date < prev.endIso) {
      best.set(term, { term, endIso: e.date, sourceLabel: name });
    }
  }

  return [...best.values()].sort((a, b) => a.term.localeCompare(b.term));
}

/**
 * 그 학기의 종료일 후보 하나. 이미 등록된 학기는 null(다시 제안하지 않는다).
 */
export function findTermEndCandidate(
  events: readonly ScheduleEventLike[],
  term: string,
  termEndDates: Readonly<Record<string, string>> | undefined,
): TermEndCandidate | null {
  if (termEndDates?.[term] !== undefined) return null;
  return findTermEndCandidates(events, [term])[0] ?? null;
}
