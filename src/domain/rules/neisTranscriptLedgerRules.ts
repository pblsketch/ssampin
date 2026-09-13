import type { StudentTranscript, TranscriptSubjectRow } from '@domain/entities/ImportedTranscript';
import { subjectCategoryOf } from '@domain/services/transcriptAnalysis';
import {
  buildSubjectRow,
  fieldOf,
  parseScoreCell,
  type TranscriptFieldKey,
  type TranscriptGrid,
} from './neisTranscriptImportRules';

const text = (value: unknown): string => String(value ?? '').trim();
const norm = (value: unknown): string => text(value).replace(/\s/g, '');
const empty = (value: unknown): boolean => ['', '-', '—'].includes(norm(value));

export interface TranscriptLedgerLayout {
  readonly kind: 'ledger';
  readonly headerRow: number;
  readonly numCol: number;
  readonly nameCol: number;
  readonly fieldCol: number;
  readonly classCol?: number;
  readonly subjects: readonly { subject: string; col: number }[];
}

export function detectTranscriptLedgerLayouts(grid: TranscriptGrid): TranscriptLedgerLayout[] {
  const layouts: TranscriptLedgerLayout[] = [];
  grid.forEach((row, headerRow) => {
    const fieldCol = row.findIndex((cell) => norm(cell) === '교과목');
    if (fieldCol < 0) return;
    let numCol = -1;
    let nameCol = -1;
    let classCol: number | undefined;
    for (let r = headerRow; r >= Math.max(0, headerRow - 2); r -= 1) {
      const head = grid[r] ?? [];
      for (let c = 0; c < fieldCol; c += 1) {
        if (norm(head[c]) === '반' && classCol === undefined) classCol = c;
        if (['번호', '출석번호', '학번'].includes(norm(head[c])) && numCol < 0) numCol = c;
        if (['성명', '이름', '학생명'].includes(norm(head[c])) && nameCol < 0) nameCol = c;
      }
    }
    if (numCol < 0 || nameCol < 0) return;
    const subjects: { subject: string; col: number }[] = [];
    for (let c = fieldCol + 1; c < row.length; c += 1) {
      const value = text(row[c]);
      if (
        !value ||
        ['합계', '총점', '평균', '비고', '석차', '이수학점', '이수단위'].includes(norm(value))
      )
        continue;
      const subject = value
        .replace(/\s*[（(]\s*\d+(?:\.\d+)?\s*(?:학점|단위)?\s*[）)]\s*$/, '')
        .trim();
      if (subject) subjects.push({ subject, col: c });
    }
    if (subjects.length)
      layouts.push({ kind: 'ledger', headerRow, numCol, nameCol, fieldCol, classCol, subjects });
  });
  return layouts;
}

export class TranscriptConflictError extends Error {
  constructor(
    message = '학생 번호·이름 또는 같은 과목의 성적이 서로 달라요. 한 학급·한 학기 자료인지 확인해 주세요. 기존 성적은 바뀌지 않았어요.',
  ) {
    super(message);
  }
}

/** 반복 인쇄 구간은 합치되, 서로 다른 학생이나 성적을 마지막 값으로 덮지 않는다. */
export function mergeTranscriptStudents(
  students: readonly StudentTranscript[],
): StudentTranscript[] {
  const result = new Map<string, StudentTranscript>();
  for (const student of students) {
    const previous = result.get(student.studentKey);
    if (
      previous &&
      (previous.studentName !== student.studentName || previous.term !== student.term)
    ) {
      throw new TranscriptConflictError();
    }
    const subjects = new Map<string, TranscriptSubjectRow>();
    for (const subject of [...(previous?.subjects ?? []), ...student.subjects]) {
      const prior = subjects.get(subject.subject);
      if (prior) {
        for (const key of Object.keys(subject) as (keyof TranscriptSubjectRow)[]) {
          if (
            subject[key] !== undefined &&
            prior[key] !== undefined &&
            subject[key] !== prior[key]
          ) {
            throw new TranscriptConflictError();
          }
        }
      }
      subjects.set(subject.subject, {
        ...prior,
        ...Object.fromEntries(Object.entries(subject).filter(([, value]) => value !== undefined)),
      } as TranscriptSubjectRow);
    }
    result.set(student.studentKey, { ...student, subjects: [...subjects.values()] });
  }
  return [...result.values()];
}

export function parseTranscriptLedger(
  grid: TranscriptGrid,
  layouts: readonly TranscriptLedgerLayout[],
  term: string,
): StudentTranscript[] {
  const students: StudentTranscript[] = [];
  const classNumbers = new Set<string>();
  for (const row of grid) {
    for (const match of row
      .map(text)
      .join(' ')
      .matchAll(/\d+\s*학년\s*(\d+)\s*반/g))
      classNumbers.add(String(Number(match[1])));
  }
  for (let section = 0; section < layouts.length; section += 1) {
    const layout = layouts[section]!;
    const end = layouts[section + 1]?.headerRow ?? grid.length;
    let active:
      | {
          key: string;
          name: string;
          values: Map<number, Map<TranscriptFieldKey, unknown>>;
          scores: Map<number, string>;
        }
      | undefined;
    const means = new Map<number, unknown>();
    // 과목평균은 학생 묶음 뒤에도 나오므로 같은 표 안에서 먼저 모은다.
    for (let r = layout.headerRow + 1; r < end; r += 1) {
      const row = grid[r] ?? [];
      if (row.some((cell, col) => col <= layout.fieldCol && norm(cell) === '과목평균')) {
        for (const { col } of layout.subjects) if (!empty(row[col])) means.set(col, row[col]);
      }
    }
    const flush = (): void => {
      if (!active) return;
      const subjects: TranscriptSubjectRow[] = [];
      for (const { col, subject } of layout.subjects) {
        const values = active.values.get(col) ?? new Map<TranscriptFieldKey, unknown>();
        if (!values.has('과목평균') && means.has(col)) values.set('과목평균', means.get(col));
        const cells: unknown[] = [];
        const cols: Partial<Record<TranscriptFieldKey, number>> = {};
        values.forEach((value, key) => {
          cols[key] = cells.length;
          cells.push(value);
        });
        const built = buildSubjectRow(cells, { subject, cols }, '');
        const scoreText = active.scores.get(col);
        if (built || scoreText)
          subjects.push({
            ...(built ?? { subject, category: subjectCategoryOf(subject) }),
            ...(scoreText ? { scoreText } : {}),
          });
      }
      if (subjects.length)
        students.push({ studentKey: active.key, studentName: active.name, term, subjects });
      active = undefined;
    };
    for (let r = layout.headerRow + 1; r < end; r += 1) {
      const row = grid[r] ?? [];
      const label = norm(row[layout.fieldCol]);
      const statistic = row.some(
        (cell, col) =>
          col <= layout.fieldCol &&
          ['과목평균', '표준편차', '성취도별분포비율', '평균'].includes(norm(cell)),
      );
      if (statistic) {
        flush();
        continue;
      }
      const number = norm(row[layout.numCol]);
      const name = text(row[layout.nameCol]);
      const validNumber = /^\d+$/.test(number) && Number(number) > 0;
      if (validNumber && layout.classCol !== undefined) {
        const classValue = norm(row[layout.classCol]).replace(/반$/, '');
        if (/^\d+$/.test(classValue)) classNumbers.add(String(Number(classValue)));
        if (classNumbers.size > 1) throw new TranscriptConflictError();
      }
      const continuation =
        active &&
        (!number || (validNumber && active.key === String(Number(number)))) &&
        (!name || name === active.name);
      if (continuation) {
        // 번호와 이름 중 한쪽만 세로 병합된 파일도 같은 학생으로 이어 읽는다.
      } else if (validNumber && name && !['성명', '이름'].includes(norm(name))) {
        const key = String(Number(number));
        if (!active || active.key !== key || active.name !== name) {
          flush();
          active = { key, name, values: new Map(), scores: new Map() };
        }
      } else if (number || name) {
        // 통계·제목·불완전한 학생 행을 넘어 이전 학생에게 값을 붙이지 않는다.
        flush();
        if (
          (fieldOf(label) || label === '합계' || label === '총점') &&
          layout.subjects.some(({ col }) => !empty(row[col]))
        ) {
          throw new TranscriptConflictError(
            '학생 번호나 이름이 빠진 성적 행이 있어요. 번호·성명을 확인해 주세요. 기존 성적은 바뀌지 않았어요.',
          );
        }
        continue;
      }
      if (!active) {
        if (
          (fieldOf(label) || label === '합계' || label === '총점') &&
          !label.includes('분포') &&
          layout.subjects.some(({ col }) => !empty(row[col]))
        ) {
          throw new TranscriptConflictError(
            '어느 학생의 성적인지 확인할 수 없는 행이 있어요. 번호·성명과 빈 행을 확인해 주세요.',
          );
        }
        continue;
      }
      if (label.includes('분포') || ['과목평균', '표준편차', '평균', '합계평균'].includes(label)) {
        flush();
        continue;
      }
      let field = fieldOf(label);
      const isScore = label === '합계' || label === '총점' || label.includes('원점수');
      if (!field && !isScore) {
        if (!label) flush();
        continue;
      }
      for (const { col } of layout.subjects) {
        const cell = row[col];
        if (empty(cell)) continue;
        const values = active.values.get(col) ?? new Map<TranscriptFieldKey, unknown>();
        active.values.set(col, values);
        let value: unknown = cell;
        if (isScore) {
          const combined = text(cell).match(/^\d+(?:\.\d+)?\s*[（(]\s*(\d+(?:\.\d+)?)\s*[）)]$/);
          if (!label.includes('원점수')) {
            const previous = active.scores.get(col);
            if (previous && previous !== text(cell)) throw new TranscriptConflictError();
            active.scores.set(col, text(cell));
            continue;
          }
          field = '원점수';
          if (combined && ['합계(원점수)', '총점(원점수)'].includes(label))
            value = Number(combined[1]);
        }
        if (field) {
          if (field === '원점수' && parseScoreCell(value).rawScore === undefined) {
            const previous = active.scores.get(col);
            if (previous && previous !== text(cell)) throw new TranscriptConflictError();
            active.scores.set(col, text(cell));
            continue;
          }
          const normalized = norm(value);
          if (field === '성취도' && !/^(?:[A-E]|P|이수|미이수)(?:\(\d+\))?$/.test(normalized)) {
            throw new TranscriptConflictError(
              '성취도 값을 읽을 수 없는 행이 있어요. A~E 또는 이수 여부 표기를 확인해 주세요.',
            );
          }
          if (field === '석차등급' && !/^[1-9]$/.test(normalized)) {
            throw new TranscriptConflictError(
              '석차등급 값을 읽을 수 없는 행이 있어요. 등급은 1~9, 미산출은 빈칸이나 —로 표시해 주세요.',
            );
          }
          if (field === '성취도') value = normalized;
          if (values.has(field) && norm(values.get(field)) !== norm(value))
            throw new TranscriptConflictError();
          values.set(field, value);
        }
      }
    }
    flush();
  }
  return mergeTranscriptStudents(students);
}
