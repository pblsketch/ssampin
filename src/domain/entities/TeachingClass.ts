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
  /** 담임 학급 그룹 식별자. 같은 groupId = 같은 교실의 여러 과목 */
  readonly groupId?: string;
  readonly students: readonly TeachingClassStudent[];
  readonly seating?: TeachingClassSeating;
  readonly order?: number;
  /**
   * Phase 6 — 그룹 내 명단 동기화 모드 (groupId 있을 때만 의미).
   *
   * - 'shared'(기본/undefined): 같은 groupId 클래스끼리 students 자동 동기화
   * - 'independent': 이 과목은 다른 명단 사용. 그룹 동기화 무시.
   *   사용 케이스: 영어 수준별 분반, 음악 선택반 등.
   */
  readonly studentSyncMode?: 'shared' | 'independent';
  /**
   * 보관(아카이브) 여부 — true면 활성 목록·"새로 기록할 대상" 선택 표면에서 숨긴다.
   * 반드시 optional(undefined=활성): 기존 저장 파일과의 하위호환·구버전 왕복 보존 전제.
   * 판정은 isTeachingClassArchived()만 사용한다(직접 비교 금지 — 메타테스트로 강제).
   */
  readonly archived?: boolean;
  /** 보관 시각 (ISO 8601). 보관 해제해도 지우지 않는다(복원 이력). */
  readonly archivedAt?: string;
  /** 보관 시점 학기 라벨('2026-1') — 보관함 그룹핑 키. 해제해도 지우지 않는다. */
  readonly archivedTerm?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface TeachingClassesData {
  readonly classes: readonly TeachingClass[];
}
