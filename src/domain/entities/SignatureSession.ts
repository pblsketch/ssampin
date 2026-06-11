/**
 * 서명받기 세션(Session) 도메인 엔티티.
 *
 * 순수 도메인 — React/Supabase/Google 어떤 인프라도 import 하지 않는다.
 * 세션은 교사가 공개 링크로 서명을 수집하는 단위이며,
 * 명렬을 스냅샷으로 복사해 보관한다 (원본 명렬 변경과 독립).
 */

import type { ColumnDef, RosterMember } from './SignatureRoster';

/** 서명 데이터 스키마 버전 (마이그레이션/회귀가드 기준) */
export const SIGNATURE_SCHEMA_VERSION = 1;

/** 신뢰 모드 — 중복/접근 제어 정책 */
export interface TrustMode {
  /** 한 번 서명한 대상자의 재서명 잠금 여부 */
  readonly dedupLock: boolean;
  /** 접근 코드 입력 요구 여부 */
  readonly accessCodeEnabled: boolean;
}

/** 세션 상태 */
export type SignatureSessionStatus = 'draft' | 'active' | 'closed';

/** 서명받기 세션 (교사/내부 전체 뷰) */
export interface SignatureSession {
  /** 세션 식별자 */
  readonly id: string;
  /** 소유 교사 식별자 */
  readonly ownerTeacherId: string;
  /** 세션 제목 */
  readonly title: string;
  /** 공개 페이지 상단 안내 문구 (선택) */
  readonly headerText?: string;
  /** 신뢰 모드 설정 */
  readonly trustMode: TrustMode;
  /** 컬럼 정의 목록 (명렬에서 복사, order 기준 정렬) */
  readonly columns: readonly ColumnDef[];
  /** 세션 생성 시점의 명렬 스냅샷 */
  readonly rosterSnapshot: readonly RosterMember[];
  /** 공개 단축 링크 코드 (publish 후 부여) */
  readonly shortLinkCode?: string;
  /** 결과가 기록되는 Google Sheet 식별자 (생성 후 부여) */
  readonly driveSpreadsheetId?: string;
  /** 세션 상태 */
  readonly status: SignatureSessionStatus;
  /** 생성 시각 (ISO 8601 문자열) */
  readonly createdAt: string;
  /** 만료 시각 (ISO 8601 문자열, 선택) */
  readonly expiresAt?: string;
}

/**
 * 공개 페이지용 세션 뷰.
 *
 * admin_key·driveSpreadsheetId·소유자 등 민감 정보(PII)를 제외하고,
 * 서명자가 보아야 할 최소 정보(제목·안내·컬럼·이름/소속 목록·신뢰모드)만 노출한다.
 */
export interface SignatureSessionPublic {
  /** 세션 제목 */
  readonly title: string;
  /** 공개 페이지 상단 안내 문구 (선택) */
  readonly headerText?: string;
  /** 컬럼 정의 목록 (order 기준 정렬) */
  readonly columns: readonly ColumnDef[];
  /** 서명 대상자 이름/소속 목록 (서명 외 추가 필드 미포함) */
  readonly members: readonly SignaturePublicMember[];
  /** 신뢰 모드 설정 */
  readonly trustMode: TrustMode;
}

/** 공개 페이지에 노출되는 대상자 최소 정보 */
export interface SignaturePublicMember {
  /** 구성원 식별자 (서명 제출 시 참조용) */
  readonly id: string;
  /** 이름 */
  readonly name: string;
  /** 소속 (선택) */
  readonly affiliation?: string;
}
