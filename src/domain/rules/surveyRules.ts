import type {
  StudentPinMap,
  Survey,
  SurveyLocalData,
  SurveyLocalEntry,
  SurveyResponse,
} from '@domain/entities/Survey';
import type { Student } from '@domain/entities/Student';

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
  students: readonly Student[],
  studentMemos?: Readonly<Record<string, string>>,
): string {
  const studentMap = new Map(students.map((s) => [s.id, s]));
  const lines: string[] = [`[${survey.title}]`];

  for (const q of survey.questions) {
    lines.push(`Q${survey.questions.indexOf(q) + 1}. ${q.label}`);
    const qEntries = entries.filter((e) => e.questionId === q.id);

    if (q.type === 'yesno') {
      const yes = qEntries.filter((e) => e.value === 'yes');
      const no = qEntries.filter((e) => e.value === 'no');
      const answered = new Set(qEntries.map((e) => e.studentId));
      const unanswered = students.filter((s) => !s.isVacant && !answered.has(s.id));

      const formatNames = (ids: readonly { studentId: string }[]) =>
        ids.map((e) => {
          const s = studentMap.get(e.studentId);
          return s ? `${students.indexOf(s) + 1}${s.name}` : '';
        }).filter(Boolean).join(', ');

      lines.push(`○ (${yes.length}명): ${formatNames(yes)}`);
      lines.push(`× (${no.length}명): ${formatNames(no)}`);
      if (unanswered.length > 0) {
        lines.push(`미응답 (${unanswered.length}명): ${unanswered.map((s) => `${students.indexOf(s) + 1}${s.name}`).join(', ')}`);
      }
    } else if (q.type === 'choice' && q.options) {
      for (const opt of q.options) {
        const matched = qEntries.filter((e) => String(e.value) === opt);
        const names = matched.map((e) => {
          const s = studentMap.get(e.studentId);
          return s ? `${students.indexOf(s) + 1}${s.name}` : '';
        }).filter(Boolean).join(', ');
        lines.push(`${opt} (${matched.length}명): ${names}`);
      }
    } else {
      for (const entry of qEntries) {
        const s = studentMap.get(entry.studentId);
        if (s) {
          lines.push(`${students.indexOf(s) + 1}${s.name}: ${String(entry.value)}`);
        }
      }
    }
    lines.push('');
  }

  if (studentMemos) {
    const memoLines = students
      .filter((s) => !s.isVacant && studentMemos[s.id])
      .map((s, _i) => {
        const idx = students.filter((st) => !st.isVacant).indexOf(s);
        return `${idx + 1}${s.name}: ${studentMemos[s.id]}`;
      });
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
  students: readonly Student[],
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

  const rows = students
    .filter((s) => !s.isVacant)
    .map((s, idx) => {
      const row: Record<string, string> = {
        number: String(idx + 1),
        name: s.name,
      };
      survey.questions.forEach((q, i) => {
        const entry = entries.find(
          (e) => e.studentId === s.id && e.questionId === q.id,
        );
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
 * 학생 수만큼 중복 없는 4자리 PIN 생성
 * @param count 학생 수 (1~50)
 * @returns Record<studentNumber, pin> (1-indexed)
 */
export function generateStudentPins(count: number): StudentPinMap {
  const pins = new Set<string>();
  while (pins.size < count) {
    const pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    pins.add(pin);
  }
  const result: Record<number, string> = {};
  const pinArray = [...pins];
  for (let i = 0; i < count; i++) {
    result[i + 1] = pinArray[i]!;
  }
  return result;
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
