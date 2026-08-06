/**
 * archiveViewerData — 보관함 뷰어(P3 S3.2)의 관대(lenient) 파서·요약 순수 모듈.
 *
 * 아카이브 JSON은 과거 앱 버전이 쓴 파일이라 필드 부재를 허용해야 한다(ADR-030 Consequences).
 * 여기의 파서는 절대 throw하지 않고, 알 수 없는 형태는 건너뛰거나 빈 결과를 돌려준다.
 * 표시 전용 — 라이브 스토어·저장 경로와 무관하다(읽기만, 쓰기 0).
 */

/* ── 공통 유틸 ── */

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asArray(v: unknown): readonly unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 봉투 루트가 배열이면 그대로, 객체면 지정 키의 배열을 취한다(구버전 형태 흡수). */
function recordsOf(raw: unknown, key: string): readonly unknown[] {
  if (Array.isArray(raw)) return raw;
  const rec = asRecord(raw);
  if (!rec) return [];
  return asArray(rec[key]);
}

/* ── 명렬 (students.json — 배열 루트) ── */

export interface ArchivedStudentView {
  readonly id: string;
  readonly number: number | null;
  readonly name: string;
  readonly status: string;
}

export function parseArchivedStudents(raw: unknown): readonly ArchivedStudentView[] {
  return recordsOf(raw, 'students')
    .map((v) => {
      const rec = asRecord(v);
      if (!rec) return null;
      const name = str(rec['name']);
      if (!name) return null;
      return {
        id: str(rec['id']) || name,
        number: num(rec['studentNumber']),
        name,
        status: str(rec['status']) || 'active',
      };
    })
    .filter((s): s is ArchivedStudentView => s !== null)
    .sort((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
}

/* ── 수업반 (teaching-classes.json) — 이름 해석용 보조 ── */

export interface ArchivedClassLookup {
  /** classId → "반 이름 · 과목" */
  readonly classLabel: ReadonlyMap<string, string>;
  /** `${classId}|${studentKey}` → 학생 이름 */
  readonly studentName: ReadonlyMap<string, string>;
}

export function buildArchivedClassLookup(raw: unknown): ArchivedClassLookup {
  const classLabel = new Map<string, string>();
  const studentName = new Map<string, string>();
  const rec = asRecord(raw);
  for (const v of asArray(rec?.['classes'])) {
    const cls = asRecord(v);
    if (!cls) continue;
    const id = str(cls['id']);
    if (!id) continue;
    const name = str(cls['name']);
    const subject = str(cls['subject']);
    classLabel.set(id, subject ? `${name} · ${subject}` : name);
    for (const sv of asArray(cls['students'])) {
      const s = asRecord(sv);
      if (!s) continue;
      const number = num(s['number']);
      if (number === null) continue;
      const grade = num(s['grade']);
      const classNum = num(s['classNum']);
      const key =
        grade !== null && classNum !== null ? `${grade}-${classNum}-${number}` : String(number);
      const sName = str(s['name']);
      if (sName) studentName.set(`${id}|${key}`, sName);
    }
  }
  return { classLabel, studentName };
}

/* ── 담임 누가기록 (student-records.json) ── */

export interface ArchivedStudentRecordView {
  readonly id: string;
  readonly studentId: string;
  readonly category: string;
  readonly subcategory: string;
  readonly content: string;
  readonly date: string;
}

export function parseArchivedStudentRecords(raw: unknown): readonly ArchivedStudentRecordView[] {
  return recordsOf(raw, 'records')
    .map((v) => {
      const rec = asRecord(v);
      if (!rec) return null;
      const id = str(rec['id']);
      if (!id) return null;
      return {
        id,
        studentId: str(rec['studentId']),
        category: str(rec['category']),
        subcategory: str(rec['subcategory']),
        content: str(rec['content']),
        date: str(rec['date']),
      };
    })
    .filter((r): r is ArchivedStudentRecordView => r !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ── 교과 관찰기록 (observations.json) ── */

export interface ArchivedObservationView {
  readonly id: string;
  readonly studentId: string;
  readonly classId: string;
  readonly date: string;
  readonly content: string;
  readonly tags: readonly string[];
}

export function parseArchivedObservations(raw: unknown): readonly ArchivedObservationView[] {
  return recordsOf(raw, 'records')
    .map((v): ArchivedObservationView | null => {
      const rec = asRecord(v);
      if (!rec) return null;
      const id = str(rec['id']);
      if (!id) return null;
      return {
        id,
        studentId: str(rec['studentId']),
        classId: str(rec['classId']),
        date: str(rec['date']),
        content: str(rec['content']),
        tags: asArray(rec['tags']).map(str).filter(Boolean),
      };
    })
    .filter((r): r is ArchivedObservationView => r !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ── 관찰 첨부 메타 (observation-attachments.json) ── */

export interface ArchivedAttachmentView {
  readonly id: string;
  readonly observationId: string;
  /** 아카이브 내 상대 경로 — archive:read fileKey로 그대로 사용 */
  readonly storageRef: string;
  readonly mimeType: string;
}

export function parseArchivedAttachments(raw: unknown): readonly ArchivedAttachmentView[] {
  return recordsOf(raw, 'attachments')
    .map((v) => {
      const rec = asRecord(v);
      if (!rec) return null;
      const id = str(rec['id']);
      const storageRef = str(rec['storageRef']);
      if (!id || !storageRef) return null;
      return {
        id,
        observationId: str(rec['observationId']),
        storageRef,
        mimeType: str(rec['mimeType']) || 'image/png',
      };
    })
    .filter((a): a is ArchivedAttachmentView => a !== null);
}

/* ── 출결 통계 (attendance.json) ── */

const ATTENDANCE_STATUS_LABEL: Record<string, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
  early: '조퇴',
  earlyLeave: '조퇴',
  result: '결과',
  etc: '기타',
};

export interface ArchivedAttendanceSummary {
  readonly recordCount: number;
  readonly firstDate: string;
  readonly lastDate: string;
  /** 상태 라벨 → 학생-엔트리 수 (라벨 미상은 원문 그대로) */
  readonly statusCounts: ReadonlyArray<{ readonly label: string; readonly count: number }>;
  /** classId → 기록 수 */
  readonly perClass: ReadonlyArray<{ readonly classId: string; readonly count: number }>;
}

export function summarizeArchivedAttendance(raw: unknown): ArchivedAttendanceSummary {
  const records = recordsOf(raw, 'records');
  const statusMap = new Map<string, number>();
  const classMap = new Map<string, number>();
  let firstDate = '';
  let lastDate = '';
  let recordCount = 0;
  for (const v of records) {
    const rec = asRecord(v);
    if (!rec) continue;
    recordCount += 1;
    const date = str(rec['date']);
    if (date) {
      if (!firstDate || date < firstDate) firstDate = date;
      if (!lastDate || date > lastDate) lastDate = date;
    }
    const classId = str(rec['classId']) || '(반 미상)';
    classMap.set(classId, (classMap.get(classId) ?? 0) + 1);
    for (const sv of asArray(rec['students'])) {
      const s = asRecord(sv);
      if (!s) continue;
      const rawStatus = str(s['status']) || '기타';
      const label = ATTENDANCE_STATUS_LABEL[rawStatus] ?? rawStatus;
      statusMap.set(label, (statusMap.get(label) ?? 0) + 1);
    }
  }
  return {
    recordCount,
    firstDate,
    lastDate,
    statusCounts: [...statusMap.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count),
    perClass: [...classMap.entries()]
      .map(([classId, count]) => ({ classId, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ── 진도 (curriculum-progress.json) ── */

const PROGRESS_STATUS_LABEL: Record<string, string> = {
  planned: '계획',
  completed: '완료',
  skipped: '건너뜀',
};

export interface ArchivedProgressView {
  readonly id: string;
  readonly classId: string;
  readonly date: string;
  readonly period: number | null;
  readonly unit: string;
  readonly lesson: string;
  readonly statusLabel: string;
}

export function parseArchivedProgress(raw: unknown): readonly ArchivedProgressView[] {
  return recordsOf(raw, 'entries')
    .map((v, index) => {
      const rec = asRecord(v);
      if (!rec) return null;
      const rawStatus = str(rec['status']);
      return {
        id: str(rec['id']) || `entry-${index}`,
        classId: str(rec['classId']),
        date: str(rec['date']),
        period: num(rec['period']),
        unit: str(rec['unit']),
        lesson: str(rec['lesson']),
        statusLabel: PROGRESS_STATUS_LABEL[rawStatus] ?? (rawStatus || '—'),
      };
    })
    .filter((r): r is ArchivedProgressView => r !== null)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ── 검색 · 삭제 게이트 ── */

/** 검색어가 비어 있으면 전부, 아니면 대소문자 무시 부분 일치. */
export function matchesSearch(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return text.toLowerCase().includes(q);
}

/** 삭제 확인 문구 — 이 문구를 정확히 입력해야만 삭제 버튼이 활성화된다(S3.3 2단계 게이트). */
export function deleteConfirmPhrase(termLabel: string): string {
  return `${termLabel} 삭제`;
}

export function isDeleteConfirmed(input: string, termLabel: string): boolean {
  return input.trim() === deleteConfirmPhrase(termLabel);
}
