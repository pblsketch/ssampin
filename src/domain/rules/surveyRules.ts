import type {
  StudentPinMap,
  Survey,
  SurveyLocalData,
  SurveyLocalEntry,
  SurveyResponse,
} from '@domain/entities/Survey';
import { isStudentActive } from '@domain/rules/studentActivity';
import { numberActiveRoster, type RosterNumberSource } from '@domain/rules/rosterNumbering';

/**
 * 설문 명단 한 줄 — 담임(`studentNumber`)과 수업반(`number`)을 함께 받는다.
 * 두 화면이 같은 함수를 쓰므로 필드 이름이 다르다는 사실을 여기서 흡수한다.
 */
export interface SurveyRosterStudent extends RosterNumberSource {
  readonly id: string;
  readonly name: string;
}

/* ──────────────── 진행률 ──────────────── */

export interface SurveyProgress {
  completed: number;
  total: number;
  percentage: number;
}

/** 교사 체크 모드 진행률 */
export function getTeacherCheckProgress(
  _survey: Survey,
  localData: SurveyLocalData | undefined,
  totalStudents: number,
): SurveyProgress {
  if (!localData || totalStudents === 0) {
    return { completed: 0, total: totalStudents, percentage: 0 };
  }
  // 질문 1개 이상에 답변한 학생 수
  const answeredStudentIds = new Set(localData.entries.map((e) => e.studentId));
  const completed = answeredStudentIds.size;
  return {
    completed,
    total: totalStudents,
    percentage: Math.round((completed / totalStudents) * 100),
  };
}

/** 학생 응답 모드 진행률 */
export function getStudentResponseProgress(
  responses: readonly SurveyResponse[],
  totalStudents: number,
): SurveyProgress {
  if (totalStudents === 0) {
    return { completed: 0, total: totalStudents, percentage: 0 };
  }
  const uniqueStudents = new Set(responses.map((r) => r.studentNumber));
  const completed = uniqueStudents.size;
  return {
    completed,
    total: totalStudents,
    percentage: Math.round((completed / totalStudents) * 100),
  };
}

/* ──────────────── 집계 ──────────────── */

/** 질문별 응답 집계 (옵션별 카운트) */
export function aggregateAnswers(
  questionId: string,
  entries: readonly SurveyLocalEntry[],
  options: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const opt of options) {
    counts.set(opt, 0);
  }
  counts.set('미응답', 0);

  for (const entry of entries) {
    if (entry.questionId !== questionId) continue;
    const val = String(entry.value);
    if (counts.has(val)) {
      counts.set(val, (counts.get(val) ?? 0) + 1);
    }
  }
  return counts;
}

/* ──────────────── 내보내기 ──────────────── */

/** 클립보드 포맷 (카톡 전달용) */
export function formatSurveyForClipboard(
  survey: Survey,
  entries: readonly SurveyLocalEntry[],
  students: readonly SurveyRosterStudent[],
  studentMemos?: Readonly<Record<string, string>>,
): string {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  // ★번호는 배열 위치가 아니라 명렬표의 실제 출석번호다(2026-09-08 검토 C).
  const numbered = numberActiveRoster(students);
  const numberOf = new Map(numbered.map((e) => [e.student.id, e.number]));
  const label = (s: SurveyRosterStudent): string => `${numberOf.get(s.id) ?? '?'}${s.name}`;
  const lines: string[] = [`[${survey.title}]`];

  for (const q of survey.questions) {
    lines.push(`Q${survey.questions.indexOf(q) + 1}. ${q.label}`);
    const qEntries = entries.filter((e) => e.questionId === q.id);

    if (q.type === 'yesno') {
      const yes = qEntries.filter((e) => e.value === 'yes');
      const no = qEntries.filter((e) => e.value === 'no');
      const answered = new Set(qEntries.map((e) => e.studentId));
      const unanswered = students.filter((s) => isStudentActive(s) && !answered.has(s.id));

      const formatNames = (ids: readonly { studentId: string }[]) =>
        ids
          .map((e) => {
            const s = studentMap.get(e.studentId);
            return s ? label(s) : '';
          })
          .filter(Boolean)
          .join(', ');

      lines.push(`○ (${yes.length}명): ${formatNames(yes)}`);
      lines.push(`× (${no.length}명): ${formatNames(no)}`);
      if (unanswered.length > 0) {
        lines.push(`미응답 (${unanswered.length}명): ${unanswered.map(label).join(', ')}`);
      }
    } else if (q.type === 'choice' && q.options) {
      for (const opt of q.options) {
        const matched = qEntries.filter((e) => String(e.value) === opt);
        const names = matched
          .map((e) => {
            const s = studentMap.get(e.studentId);
            return s ? label(s) : '';
          })
          .filter(Boolean)
          .join(', ');
        lines.push(`${opt} (${matched.length}명): ${names}`);
      }
    } else {
      for (const entry of qEntries) {
        const s = studentMap.get(entry.studentId);
        if (s) {
          lines.push(`${label(s)}: ${String(entry.value)}`);
        }
      }
    }
    lines.push('');
  }

  if (studentMemos) {
    const memoLines = students
      .filter((s) => isStudentActive(s) && studentMemos[s.id])
      .map((s) => `${label(s)}: ${studentMemos[s.id]}`);
    if (memoLines.length > 0) {
      lines.push('[메모]');
      lines.push(...memoLines);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** CSV 포맷 */
export function formatSurveyForCSV(
  survey: Survey,
  entries: readonly SurveyLocalEntry[],
  students: readonly SurveyRosterStudent[],
  studentMemos?: Readonly<Record<string, string>>,
): { columns: { key: string; label: string }[]; rows: Record<string, string>[] } {
  const columns = [
    { key: 'number', label: '번호' },
    { key: 'name', label: '이름' },
    ...survey.questions.map((q, i) => ({
      key: `q${i}`,
      label: `Q${i + 1}.${q.label}`,
    })),
    { key: 'memo', label: '메모' },
  ];

  // ★번호는 명렬표의 실제 출석번호다. 예전에는 비활성 학생을 거른 뒤 `idx + 1` 을 써서
  //   2번이 전출하면 3번 학생 줄에 "2"가 찍혔다(2026-09-08 검토 C).
  const rows = numberActiveRoster(students).map(({ student: s, number }) => {
    const row: Record<string, string> = {
      number: String(number),
      name: s.name,
    };
    survey.questions.forEach((q, i) => {
      const entry = entries.find((e) => e.studentId === s.id && e.questionId === q.id);
      row[`q${i}`] = entry ? String(entry.value) : '-';
    });
    row['memo'] = studentMemos?.[s.id] ?? '';
    return row;
  });

  return { columns, rows };
}

/* ──────────────── 필터 ──────────────── */

export function getActiveSurveys(surveys: readonly Survey[]): Survey[] {
  return surveys.filter((s) => !s.isArchived);
}

export function getArchivedSurveys(surveys: readonly Survey[]): Survey[] {
  return surveys.filter((s) => s.isArchived);
}

/* ──────────────── PIN 코드 (사칭 방지) ──────────────── */

/**
 * 응답 대상 **번호마다** 중복 없는 4자리 PIN 생성.
 *
 * ★인원수가 아니라 **번호 목록**을 받는다. 예전에는 `1..인원수` 로 만들어서, 33번까지 있는 반에
 *   결번 2명이 있으면 32·33번 학생에게 PIN 이 없고 결번 번호에 PIN 이 생겼다(2026-09-08 검토 D).
 *
 * @param studentNumbers 응답할 수 있는 실제 출석번호 목록
 * @returns Record<출석번호, pin>
 */
export function generateStudentPins(studentNumbers: readonly number[]): StudentPinMap {
  const targets = [...new Set(studentNumbers)].filter((n) => Number.isFinite(n) && n > 0);
  const pins = new Set<string>();
  while (pins.size < targets.length) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    pins.add(pin);
  }
  const result: Record<number, string> = {};
  const pinArray = [...pins];
  targets.forEach((num, i) => {
    result[num] = pinArray[i]!;
  });
  return result;
}

/**
 * 이 설문이 실제로 받는 번호 목록. 새 설문은 `targetNumbers`, 구형 설문은 `1..targetCount`.
 * 학생 화면·교사 화면·PIN 이 전부 이 함수를 본다.
 */
export function surveyAnswerableNumbers(survey: {
  readonly targetNumbers?: readonly number[];
  readonly targetCount?: number;
}): number[] {
  if (survey.targetNumbers !== undefined && survey.targetNumbers.length > 0) {
    return [...survey.targetNumbers].sort((a, b) => a - b);
  }
  return Array.from({ length: survey.targetCount ?? 0 }, (_, i) => i + 1);
}

/**
 * PIN 검증
 * @returns true if PIN matches
 */
export function verifyStudentPin(
  pins: StudentPinMap | undefined,
  studentNumber: number,
  inputPin: string,
): boolean {
  if (!pins) return true;
  return pins[studentNumber] === inputPin;
}
