/**
 * 성취기준 고르기·좁히기·찾기 규칙 (순수 함수, 외부 의존성 없음).
 *
 * 자료는 `src/domain/data/curriculumStandards.*.json` 에 **미리 실려 있다.** 이 파일의 함수는
 * 그 자료를 인자로 받기만 하고 직접 읽지 않는다 — 그래야 도메인이 파일·네트워크를 모른 채로 있고,
 * 시험도 작은 표본으로 돌릴 수 있다.
 *
 * ⚠️ 성취기준 **원문**은 화면 표시와 복사 검사에만 쓴다. AI 로 나가는 것은 `keywords` 뿐이다.
 */
import type { CurriculumStandard, StandardSchoolLevel } from '../data/curriculumStandards.types';

/* ──────────────────── 2022 개정이 적용된 학년인가 ──────────────────── */

/**
 * 2022 개정 교육과정이 **처음 적용되는 학년도**.
 *
 * 교육부 고시 제2022-33호 부칙의 시행 일정 그대로다:
 *   2024. 3. 1. 초1·2 / 2025. 3. 1. 초3·4·중1·고1 / 2026. 3. 1. 초5·6·중2·고2 / 2027. 3. 1. 중3·고3
 *
 * 그래서 **2026학년도 지금 중3·고3은 아직 2015 개정**이고, 이 앱이 싣고 있는 자료에는 그 학년의
 * 성취기준이 아예 없다. 없는 것을 있는 척 보여 주지 않으려고 이 판정이 필요하다.
 */
export function firstYearOf2022Revision(
  schoolLevel: StandardSchoolLevel,
  grade: number,
): number | null {
  if (!Number.isInteger(grade) || grade < 1) return null;
  if (schoolLevel === 'elementary') {
    if (grade > 6) return null;
    // 초1·2 = 2024, 초3·4 = 2025, 초5·6 = 2026
    return 2024 + Math.floor((grade - 1) / 2);
  }
  if (grade > 3) return null;
  // 중·고 1학년 = 2025, 2학년 = 2026, 3학년 = 2027
  return 2024 + grade;
}

/** 그 학년도의 그 학년이 2022 개정을 쓰는가. 학년을 모르면(`null`) 판단하지 않고 `true` 로 둔다. */
export function isRevision2022Applied(
  schoolLevel: StandardSchoolLevel,
  grade: number | null | undefined,
  academicYear: number,
): boolean {
  if (grade == null) return true; // 학년을 모르면 목록을 막지 않는다
  const first = firstYearOf2022Revision(schoolLevel, grade);
  if (first === null) return true;
  return academicYear >= first;
}

/**
 * 2015 개정 학년에게 보여 줄 안내 문구. 화면 여러 곳이 같은 말을 쓰게 한 곳에 둔다.
 * "없다"를 오류가 아니라 사실로 말한다 — 교사가 직접 적을 수 있다는 것까지 한 문장에 담는다.
 */
export const REVISION_2015_NOTICE = '이 학년은 2022 개정 자료가 없습니다 — 직접 입력해 주세요.';

/* ──────────────────── 학년 → 학년군 ──────────────────── */

/**
 * 그 학년이 쓰는 학년군. 목록을 좁히는 데 쓰되 **약하게** 쓴다(§ narrowStandards 주석 참조).
 * 고교는 공통과목(`10`)과 선택과목(`10-12`)이 갈리는데, 2학년이 공통국어2를 듣는 일도 있어서
 * 한 학년에 하나만 주지 않는다.
 */
export function gradeBandsFor(
  schoolLevel: StandardSchoolLevel,
  grade: number | null | undefined,
): readonly string[] {
  if (schoolLevel === 'middle') return ['7-9'];
  if (schoolLevel === 'high') return ['10', '10-12'];
  if (grade == null) return ['1-2', '3-4', '5-6'];
  if (grade <= 2) return ['1-2'];
  if (grade <= 4) return ['3-4'];
  return ['5-6'];
}

/**
 * 수업반의 학년을 알아낸다 — 성취기준 목록을 좁히는 데 쓴다.
 *
 * 수업반에는 학년 칸이 따로 없다. 그래서 두 군데를 순서대로 본다:
 *  ① **명단에 적힌 학년** — 여러 반이 섞인 수업반이라도 가장 많은 학년을 그 반의 학년으로 본다.
 *     교사가 직접 넣은 값이라 이름보다 믿을 만하다.
 *  ② **반 이름 앞의 숫자** — `2-5`, `3학년 1반` 처럼 쓰는 관행. 1~6 만 학년으로 인정한다.
 * 둘 다 없으면 `null` 이고, 그러면 학년으로 좁히지 않는다(막지 않는다).
 */
export function inferClassGrade(
  className: string,
  studentGrades: readonly (number | undefined)[] = [],
): number | null {
  const tally = new Map<number, number>();
  for (const g of studentGrades) {
    if (g === undefined || !Number.isInteger(g) || g < 1 || g > 6) continue;
    tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [g, n] of tally) {
    if (n > bestN) {
      best = g;
      bestN = n;
    }
  }
  if (best !== null) return best;

  const m = /(?:^|\D)([1-6])\s*(?:학년|-)/.exec(className.trim());
  return m ? Number(m[1]) : null;
}

/* ──────────────────── 과목 맞추기 ──────────────────── */

/** 비교용으로 다듬기 — 공백·가운뎃점·괄호 안 설명을 지운다. `기술⋅가정` 과 `기술·가정` 을 같게 본다. */
function normalizeSubject(value: string): string {
  return value
    .replace(/\([^)]*\)/g, '')
    .replace(/[·⋅・~∼-]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/**
 * 수업반 과목 이름과 성취기준 과목이 같은 것을 가리키는가.
 *
 * 교사가 수업반에 적는 과목 이름은 자유 문자열이라 `수학`, `공통수학1`, `2학년 수학` 처럼 제각각이다.
 * 그래서 **정확히 같은가**만 보지 않고 한쪽이 다른 쪽을 품고 있어도 같은 것으로 본다.
 * 대신 두 글자 미만은 아무 데나 걸리므로 품기 검사에서 뺀다(`수` 가 `수학`·`체수`에 다 걸린다).
 */
export function subjectMatches(classSubject: string, standardSubject: string): boolean {
  const a = normalizeSubject(classSubject);
  const b = normalizeSubject(standardSubject);
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  if (a.length < 2 || b.length < 2) return false;
  return a.includes(b) || b.includes(a);
}

/* ──────────────────── 목록 좁히기 ──────────────────── */

export interface StandardScope {
  readonly schoolLevel: StandardSchoolLevel;
  /** 수업반 과목 이름(자유 문자열). 없으면 과목으로 좁히지 않는다. */
  readonly subject?: string;
  /** 학년. 없으면 학년군으로 좁히지 않는다. */
  readonly grade?: number | null;
}

/**
 * 과목·학년으로 목록을 좁힌다.
 *
 * 좁히기의 세기가 다르다는 것이 요점이다:
 *  - **학교급**은 세게 — 자료 파일 자체가 학교급으로 나뉘어 있다.
 *  - **과목**은 세게 — 맞는 과목이 하나라도 있으면 그것만 남긴다. 없으면(이름이 특이하면)
 *    막지 않고 전부 돌려준다. "내 과목이 없다"보다 "많지만 찾을 수 있다"가 낫다.
 *  - **학년군**은 약하게 — 맞는 것을 **앞으로 올릴 뿐** 나머지를 지우지 않는다.
 *    고2가 공통국어2(학년군 `10`)를 가르치는 일이 실제로 있기 때문이다.
 */
export function narrowStandards(
  all: readonly CurriculumStandard[],
  scope: StandardScope,
): readonly CurriculumStandard[] {
  const byLevel = all.filter((s) => s.schoolLevel === scope.schoolLevel);

  let pool = byLevel;
  const subject = scope.subject?.trim();
  if (subject !== undefined && subject.length > 0) {
    const matched = byLevel.filter(
      (s) => subjectMatches(subject, s.subject) || subjectMatches(subject, s.subjectGroup),
    );
    if (matched.length > 0) pool = matched;
  }

  const bands = new Set(gradeBandsFor(scope.schoolLevel, scope.grade));
  const preferred: CurriculumStandard[] = [];
  const rest: CurriculumStandard[] = [];
  for (const s of pool) (bands.has(s.gradeBand) ? preferred : rest).push(s);
  return [...preferred, ...rest];
}

/**
 * 찾기 — 코드·원문·과목·영역·키워드에 걸리는 **부분 문자열** 검사다.
 *
 * 형태소 분석이나 뜻풀이는 하지 않는다(런타임 비용 0 원칙). 그래서 "함수"는 잘 찾고
 * "그래프 그리기"는 못 찾는다 — 찾기는 **보조**이고, 고르는 주된 길은 과목·영역으로 좁힌 목록이다.
 */
export function searchStandards(
  pool: readonly CurriculumStandard[],
  query: string,
  limit = 200,
): readonly CurriculumStandard[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return pool.slice(0, limit);
  const compact = q.replace(/\s+/g, '');
  const out: CurriculumStandard[] = [];
  for (const s of pool) {
    if (out.length >= limit) break;
    const haystack = `${s.code}${s.subject}${s.domain}${s.text}${s.keywords.join('')}`
      .toLowerCase()
      .replace(/\s+/g, '');
    if (haystack.includes(compact)) out.push(s);
  }
  return out;
}

/** 영역 목록 — 화면이 "영역으로 접어 보기"를 만들 때 쓴다. 등장 순서를 지킨다. */
export function domainsOf(pool: readonly CurriculumStandard[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of pool) {
    if (s.domain.length === 0 || seen.has(s.domain)) continue;
    seen.add(s.domain);
    out.push(s.domain);
  }
  return out;
}

/* ──────────────────── 코드로 찾기 ──────────────────── */

/** 대괄호가 있든 없든, 사이에 공백이 있든 없든 같은 코드로 본다. */
export function normalizeStandardCode(code: string): string {
  return code.replace(/[[\]\s]/g, '').toUpperCase();
}

/** 성취기준 코드처럼 생겼는가 — 교사가 손으로 적은 값을 받아들일지 판단할 때. */
export function looksLikeStandardCode(value: string): boolean {
  return /^\[?\s*\d{1,2}\s*[가-힣A-Za-z]{1,6}\s*\d{0,2}\s*-?\s*\d{1,2}\s*-\s*\d{1,2}\s*\]?$/.test(
    value.trim(),
  );
}

/** 코드 → 성취기준 찾아보기 표. 화면이 한 번 만들어 두고 다시 쓴다. */
export function indexByCode(
  all: readonly CurriculumStandard[],
): ReadonlyMap<string, CurriculumStandard> {
  const map = new Map<string, CurriculumStandard>();
  for (const s of all) map.set(normalizeStandardCode(s.code), s);
  return map;
}

/** 코드 목록 → 성취기준 목록. 번들에 없는 코드(교사가 손으로 적은 것 등)는 건너뛴다. */
export function standardsForCodes(
  index: ReadonlyMap<string, CurriculumStandard>,
  codes: readonly string[] | undefined,
): readonly CurriculumStandard[] {
  if (codes === undefined || codes.length === 0) return [];
  const out: CurriculumStandard[] = [];
  for (const code of codes) {
    const hit = index.get(normalizeStandardCode(code));
    if (hit) out.push(hit);
  }
  return out;
}

/**
 * 코드 목록 → **키워드만** 모으기. 주제 이름 후보·매칭 키워드로 나가는 유일한 통로다.
 *
 * 여기서 원문을 함께 내보내지 않는 것이 핵심이다 — 이 함수의 결과는 `topicKeywordSources` 를
 * 거쳐 AI 근거에까지 실리기 때문이다.
 */
export function standardKeywords(
  index: ReadonlyMap<string, CurriculumStandard>,
  codes: readonly string[] | undefined,
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of standardsForCodes(index, codes)) {
    for (const k of s.keywords) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
