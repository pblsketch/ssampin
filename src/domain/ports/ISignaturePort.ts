/**
 * 서명받기 포트 — UseCase에서 서명 세션 생명주기를 다룰 때 사용.
 *
 * 순수 도메인 인터페이스 — 구현(Supabase/Edge Function 등)은 추후 infra가 담당.
 * 모든 메서드는 Promise를 반환하며 입력/출력 타입을 명시한다.
 */

import type { ColumnDef, RosterMember } from '../entities/SignatureRoster';
import type {
  SignatureSessionPublic,
  SignatureSessionStatus,
  TrustMode,
} from '../entities/SignatureSession';
import type { SignatureStatusRow } from '../entities/SignatureEntry';

/** createSession 입력 */
export interface CreateSignatureSessionInput {
  /** 소유 교사 식별자 */
  readonly ownerTeacherId: string;
  /** 세션 제목 */
  readonly title: string;
  /** 공개 페이지 상단 안내 문구 (선택) */
  readonly headerText?: string;
  /** 신뢰 모드 설정 */
  readonly trustMode: TrustMode;
  /** 접근 코드 (trustMode.accessCodeEnabled 시 필수 — 서버는 해시로만 저장) */
  readonly accessCode?: string;
  /** 컬럼 정의 목록 */
  readonly columns: readonly ColumnDef[];
  /** 세션에 복사할 명렬 스냅샷 */
  readonly rosterSnapshot: readonly RosterMember[];
  /** 만료 시각 (ISO 8601 문자열, 선택) */
  readonly expiresAt?: string;
}

/** createSession 출력 */
export interface CreateSignatureSessionResult {
  /** 생성된 세션 식별자 */
  readonly sessionId: string;
}

/** publishSession 출력 — 관리 키와 공개 단축 링크 */
export interface PublishSignatureSessionResult {
  /** 세션 식별자 */
  readonly sessionId: string;
  /** 교사 전용 관리 키 (현황 조회/삭제 권한) */
  readonly adminKey: string;
  /** 공개 단축 링크 코드 */
  readonly shortLinkCode: string;
}

/** submitSignature 입력 (공개 페이지 제출) */
export interface SubmitSignatureInput {
  /** 대상 세션 식별자 */
  readonly sessionId: string;
  /** 명렬 구성원 참조 (자유 제출 시 빈 문자열) */
  readonly memberRef: string;
  /** 서명자가 입력/확인한 이름 */
  readonly signerName: string;
  /** 컬럼 key → 입력값 매핑 (signature 컬럼 제외) */
  readonly rowData: Record<string, string>;
  /** 서명 이미지 데이터 (base64 data URL 등 — 업로드는 구현체가 처리) */
  readonly signatureImage: string;
  /** 접근 코드 (trustMode.accessCodeEnabled 시 필수) */
  readonly accessCode?: string;
}

/** submitSignature 출력 */
export interface SubmitSignatureResult {
  /** 생성된 제출 식별자 */
  readonly entryId: string;
  /** 업로드된 서명 이미지 공개 URL */
  readonly signaturePublicUrl: string;
  /** 서명 시각 (ISO 8601 문자열) */
  readonly signedAt: string;
}

/** 교사용 상세 현황 응답 */
export interface SignatureStatusResult {
  readonly sessionId: string;
  readonly status: SignatureSessionStatus;
  readonly totalCount: number;
  readonly signedCount: number;
  readonly members: readonly SignatureStatusRow[];
  readonly closedAt?: string;
  readonly signatureRetentionDays?: number;
  readonly signatureCleanupAfter?: string;
  readonly signatureImagesDeletedAt?: string;
}

/** 세션 마감 결과 */
export interface CloseSignatureSessionResult {
  readonly status: SignatureSessionStatus;
  readonly closedAt?: string;
  readonly signatureRetentionDays: number;
  readonly signatureCleanupAfter?: string;
  readonly signatureImagesDeletedAt?: string;
}

/** 세션 다시 열기 결과 */
export interface ReopenSignatureSessionResult {
  readonly status: SignatureSessionStatus;
  readonly closedAt?: string;
  readonly signatureRetentionDays: number;
  readonly signatureCleanupAfter?: string;
  readonly signatureImagesDeletedAt?: string;
}

/** 서명 이미지만 삭제한 결과 */
export interface DeleteSignatureImagesResult {
  readonly status: SignatureSessionStatus;
  readonly removedStorageObjects: number;
  readonly signatureImagesDeletedAt: string;
}

/** 서명받기 포트 */
export interface ISignaturePort {
  /** 세션 생성 (draft 상태) */
  createSession(input: CreateSignatureSessionInput): Promise<CreateSignatureSessionResult>;

  /** 세션 공개 — 관리 키와 단축 링크 발급 (active 전환) */
  publishSession(sessionId: string): Promise<PublishSignatureSessionResult>;

  /** 공개 페이지용 세션 조회 (PII·admin_key 제외) */
  getPublicSession(sessionId: string): Promise<SignatureSessionPublic>;

  /** 공개 제출 — 서명 1건 등록 */
  submitSignature(input: SubmitSignatureInput): Promise<SubmitSignatureResult>;

  /** 교사 현황 보드 조회 (관리 키 검증) */
  getStatus(sessionId: string, adminKey: string): Promise<readonly SignatureStatusRow[]>;

  /** 교사용 상세 현황 조회 (세션 상태·보관 일정 포함) */
  getStatusDetails(sessionId: string, adminKey: string): Promise<SignatureStatusResult>;

  /** 세션 마감 (참여자 추가 제출 차단 + 이미지 보관기간 시작) */
  closeSession(
    sessionId: string,
    adminKey: string,
    retentionDays: number,
  ): Promise<CloseSignatureSessionResult>;

  /** 마감된 세션 다시 열기 (이미지가 삭제된 세션은 복구 불가) */
  reopenSession(sessionId: string, adminKey: string): Promise<ReopenSignatureSessionResult>;

  /** 마감된 세션의 서명 이미지만 삭제 (현황 행은 유지) */
  deleteSignatureImages(sessionId: string, adminKey: string): Promise<DeleteSignatureImagesResult>;

  /** 세션 삭제 (관리 키 검증) */
  deleteSession(sessionId: string, adminKey: string): Promise<void>;
}
