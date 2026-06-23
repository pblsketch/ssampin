import type { AttendanceStatus } from '@domain/entities/Attendance';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import type { Student } from '@domain/entities/Student';

/**
 * 조회 화면 공용 표시 ViewModel.
 *
 * 담임(StudentRecord)과 수업(MixedRecord) 두 도메인 형태를 화면이 동일하게
 * 다룰 수 있도록 변환한 **도메인 무관 표시 타입**. 공용 부품(요약·카드 등)은
 * 원본 엔티티(StudentRecord | MixedRecord union)가 아니라 이 타입만 받는다
 * → 분기 은닉이 아닌 구조적 통일. 식별키는 원본 그대로 보존(저장/변환 안 함).
 */
export interface DisplayRecord {
  /** 리스트 key·학생 그룹핑 식별용 안정 키. */
  readonly key: string;
  /** YYYY-MM-DD */
  readonly date: string;
  /** 학생 식별(분포 집계용) — 원본 키 보존(담임=studentId, 수업=studentKey). */
  readonly studentKey: string;
  readonly studentName: string;
  readonly studentNumber?: number;
  /** 분포 차원. */
  readonly kind: 'attendance' | 'observation' | 'category';
  /** 분포 라벨(출결 / 특기사항 / 카테고리명). */
  readonly kindLabel: string;
  /** 출결 상태(출결 기록일 때). */
  readonly status?: AttendanceStatus;
  /** 관찰 태그(특기사항일 때). */
  readonly tags?: readonly string[];
  /** 본문(전문). */
  readonly content: string;
}

/**
 * 수업(교과) 통합 기록 표시 입력.
 * ClassRecordSearchView의 MixedRecord에 직접 의존하지 않도록 자체 표시 인터페이스를 둔다
 * (구조적으로 호환 — MixedRecord를 그대로 넘길 수 있다).
 */
export interface MixedDisplayInput {
  readonly type: 'attendance' | 'observation';
  readonly date: string;
  readonly studentKey: string;
  readonly studentName: string;
  readonly studentNumber: number;
  readonly status?: AttendanceStatus;
  readonly period?: number;
  readonly reason?: string;
  readonly memo?: string;
  readonly id?: string;
  readonly tags?: readonly string[];
  readonly content?: string;
}

/** 수업 통합 기록 → DisplayRecord. */
export function mixedRecordToDisplay(r: MixedDisplayInput): DisplayRecord {
  if (r.type === 'attendance') {
    return {
      key: `attendance-${r.date}-${r.studentKey}-${r.period ?? 0}`,
      date: r.date,
      studentKey: r.studentKey,
      studentName: r.studentName,
      studentNumber: r.studentNumber,
      kind: 'attendance',
      kindLabel: '출결',
      status: r.status,
      content: r.memo ?? '',
    };
  }
  return {
    key: `observation-${r.id ?? `${r.date}-${r.studentKey}`}`,
    date: r.date,
    studentKey: r.studentKey,
    studentName: r.studentName,
    studentNumber: r.studentNumber,
    kind: 'observation',
    kindLabel: '특기사항',
    tags: r.tags,
    content: r.content ?? '',
  };
}

/** 담임 변환 컨텍스트(이름·카테고리명 해석용). */
export interface StudentRecordDisplayCtx {
  readonly categories: readonly RecordCategoryItem[];
  readonly studentMap: ReadonlyMap<string, Student>;
}

/** 담임 누가기록(StudentRecord) → DisplayRecord. */
export function studentRecordToDisplay(
  r: StudentRecord,
  ctx: StudentRecordDisplayCtx,
): DisplayRecord {
  const student = ctx.studentMap.get(r.studentId);
  const isAttendance = r.category === 'attendance';
  const categoryName =
    ctx.categories.find((c) => c.id === r.category)?.name.split(' (')[0] ?? r.category;
  return {
    key: r.id,
    date: r.date,
    studentKey: r.studentId,
    studentName: student?.name ?? '?',
    studentNumber: student?.studentNumber,
    kind: isAttendance ? 'attendance' : 'category',
    kindLabel: isAttendance ? '출결' : categoryName,
    content: r.content ?? '',
  };
}
