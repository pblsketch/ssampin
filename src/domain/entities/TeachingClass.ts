import type { StudentStatus } from './Student';

export interface TeachingClassStudent {
  readonly number: number;
  readonly name: string;
  readonly memo?: string;
  /** 학년 (소속 반이 다른 학생이 섞인 수업반용) */
  readonly grade?: number;
  /** 반 (소속 반이 다른 학생이 섞인 수업반용) */
  readonly classNum?: number;
  /** 결번 여부 (하위호환용 — 새 로직은 status 기반) */
  readonly isVacant?: boolean;
  /** 재적 상태 (미설정 시 'active' 취급) */
  readonly status?: StudentStatus;
  /** 상태 변경 사유 메모 */
  readonly statusNote?: string;
  /** 상태 변경일 (YYYY-MM-DD) */
  readonly statusChangedAt?: string;
}

/** 학생 복합 키 (학년-반-번호) — 같은 번호의 다른 반 학생 구분용 */
export function studentKey(s: { number: number; grade?: number; classNum?: number }): string {
  if (s.grade != null && s.classNum != null) {
    return `${s.grade}-${s.classNum}-${s.number}`;
  }
  return String(s.number);
}

import type { OddColumnMode } from '@domain/rules/seatingLayoutRules';

/** 수업반 전용 좌석 배치 데이터 */
export interface TeachingClassSeating {
  readonly rows: number;
  readonly cols: number;
  /** seats[row][col] = studentKey(학생) | null */
  readonly seats: readonly (readonly (string | null)[])[];
  readonly pairMode?: boolean;
  /** 짝꿍 모드에서 홀수 열 처리: 'single'=1명 따로 (기본), 'triple'=3명 함께 */
  readonly oddColumnMode?: OddColumnMode;
}

export interface TeachingClass {
  readonly id: string;
  readonly name: string;
  readonly subject: string;
  readonly students: readonly TeachingClassStudent[];
  readonly seating?: TeachingClassSeating;
  readonly order?: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeachingClassesData {
  readonly classes: readonly TeachingClass[];
}
