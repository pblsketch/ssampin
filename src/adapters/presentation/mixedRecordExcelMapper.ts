/**
 * mixedRecordExcelMapper.ts
 *
 * ClassRecordSearchView의 통합 기록(MixedRecord)을 엑셀 행 데이터로 변환하는 순수 매퍼.
 *
 * 설계 원칙:
 * - 컴포넌트(ClassRecordSearchView)에 직접 의존하지 않고 자체 표시 인터페이스를 정의한다.
 * - 교시 라벨은 도메인 정본(formatPeriodLabel)을 재사용한다. adapters → domain 은 허용 방향이며
 *   (docs/architecture-rules.md), 사본을 두면 교시 이름 기능이 엑셀에서만 빠지는 사고가 난다.
 * - 출결 status는 한글 라벨로 변환한다.
 * - present(출석) 행은 입력 데이터가 이미 제외했다고 간주하고 그대로 보존한다.
 *
 * Wave 2 버튼 배선 시 ClassRecordSearchView에서 mixedRecords를 이 인터페이스로 변환한 뒤
 * exportMixedRecordsToExcel에 전달하면 된다.
 */

// 평탄 행 타입(MixedRecordFlatRow)의 정본은 infra(ExcelExporter)에 있다.
// 매퍼는 그 입력 계약을 향해 변환하므로 infra 타입을 import 한다(adapters→infra, 허용).
import type { MixedRecordFlatRow } from '@infrastructure/export/ExcelExporter';
import { formatPeriodLabel } from '@domain/entities/Attendance';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

/** 출결 상태 한글 라벨 (attendanceStatusStyle.ts와 동일, 도메인 import 없이 복제) */
const ATTENDANCE_STATUS_KO: Record<string, string> = {
  present: '출석',
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

// ─── 입력 인터페이스 ────────────────────────────────────────────────────────

/** 출결 행 — ClassRecordSearchView의 AttendanceMixedRecord 표시 필드 */
export interface AttendanceExcelRow {
  readonly type: 'attendance';
  readonly date: string;
  readonly studentNumber: number;
  readonly studentName: string;
  /** 교시 번호 (0=조회, 9=종례, 1-8=교시) */
  readonly period: number;
  /** AttendanceStatus 문자열 값 */
  readonly status: string;
  readonly reason?: string;
  readonly memo?: string;
}

/** 특기사항(관찰) 행 — ClassRecordSearchView의 ObservationMixedRecord 표시 필드 */
export interface ObservationExcelRow {
  readonly type: 'observation';
  readonly date: string;
  readonly studentNumber: number;
  readonly studentName: string;
  readonly tags: readonly string[];
  readonly content: string;
}

/** 통합 기록 행 입력 타입 */
export type MixedExcelRow = AttendanceExcelRow | ObservationExcelRow;

// ─── 출력 인터페이스 ────────────────────────────────────────────────────────

// MixedRecordFlatRow 정의는 infra(`ExcelExporter`)로 이동했다 — 상단 import 참조.
// (인프라가 소비하는 입력 계약이라 정본을 infra 에 두고, 매퍼가 그 타입을 향해 변환한다.)

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────

// ─── 매퍼 ──────────────────────────────────────────────────────────────────

/**
 * MixedExcelRow 배열을 엑셀 평탄 행 배열로 변환한다.
 *
 * - 입력 순서를 보존한다(정렬은 호출처 책임).
 * - present 필터링은 이미 호출처에서 완료된 것으로 간주하고 그대로 통과시킨다.
 */
export function mapMixedRecordsToFlatRows(
  rows: readonly MixedExcelRow[],
  periodTimes?: readonly PeriodTime[],
): MixedRecordFlatRow[] {
  return rows.map((row): MixedRecordFlatRow => {
    if (row.type === 'attendance') {
      return {
        date: row.date,
        category: '출결',
        studentNumber: row.studentNumber,
        studentName: row.studentName,
        statusOrTags: ATTENDANCE_STATUS_KO[row.status] ?? row.status,
        reason: row.reason ?? '',
        content: row.memo ?? '',
        periodLabel: formatPeriodLabel(row.period, periodTimes),
      };
    } else {
      return {
        date: row.date,
        category: '특기사항',
        studentNumber: row.studentNumber,
        studentName: row.studentName,
        statusOrTags: row.tags.join(', '),
        reason: '',
        content: row.content,
        periodLabel: '',
      };
    }
  });
}
