/**
 * 서명받기 명렬(Roster) 도메인 엔티티.
 *
 * 순수 도메인 — React/Supabase/Google 어떤 인프라도 import 하지 않는다.
 * 명렬은 서명 세션의 원본 대상자 목록 + 표시할 컬럼 정의를 보관한다.
 */

/** 컬럼 데이터 타입 */
export type ColumnType = 'text' | 'number' | 'signature' | 'datetime';

/** 명렬/세션의 컬럼 정의 */
export interface ColumnDef {
  /** 컬럼 식별 키 (rowData/fields의 key와 매칭) */
  readonly key: string;
  /** 사용자에게 보이는 라벨 */
  readonly label: string;
  /** 컬럼 데이터 타입 */
  readonly type: ColumnType;
  /** 시스템 기본 컬럼 여부 (예: 이름·서명 — 삭제/수정 제한 대상) */
  readonly builtin?: boolean;
  /** 표시 순서 (오름차순 정렬) */
  readonly order: number;
}

/** 명렬 구성원 1명 */
export interface RosterMember {
  /** 구성원 식별자 */
  readonly id: string;
  /** 이름 */
  readonly name: string;
  /** 소속 (학급/부서 등, 선택) */
  readonly affiliation?: string;
  /** 컬럼 key → 값 매핑 (builtin 외 추가 필드) */
  readonly fields: Record<string, string>;
}

/** 명렬 종류 */
export type SignatureRosterType = 'class' | 'teacher' | 'custom';

/** 서명받기 명렬 */
export interface SignatureRoster {
  /** 명렬 식별자 */
  readonly id: string;
  /** 소유 교사 식별자 */
  readonly ownerTeacherId: string;
  /** 명렬 이름 */
  readonly name: string;
  /** 명렬 종류 (학급/교사/사용자정의) */
  readonly type: SignatureRosterType;
  /** 컬럼 정의 목록 (order 기준 정렬) */
  readonly columns: readonly ColumnDef[];
  /** 구성원 목록 */
  readonly members: readonly RosterMember[];
  /** 생성 시각 (ISO 8601 문자열) */
  readonly createdAt: string;
  /** 수정 시각 (ISO 8601 문자열) */
  readonly updatedAt: string;
}
