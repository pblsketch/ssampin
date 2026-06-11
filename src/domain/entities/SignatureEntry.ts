/**
 * 서명받기 제출 결과(Entry) 도메인 엔티티.
 *
 * 순수 도메인 — React/Supabase/Google 어떤 인프라도 import 하지 않는다.
 * Entry는 공개 페이지에서 1명이 제출한 서명 1건을 표현한다.
 */

/** 서명 제출 1건 */
export interface SignatureEntry {
  /** 제출 식별자 */
  readonly id: string;
  /** 소속 세션 식별자 */
  readonly sessionId: string;
  /** 명렬 구성원 참조 (RosterMember.id, 자유 제출 시 빈 문자열) */
  readonly memberRef: string;
  /** 컬럼 key → 입력값 매핑 (signature 컬럼은 공개 URL 보관 안 함 — signaturePublicUrl 사용) */
  readonly rowData: Record<string, string>;
  /** 서명자가 입력/확인한 이름 */
  readonly signerName: string;
  /** 서명 이미지 공개 URL (=IMAGE 주입 대상) */
  readonly signaturePublicUrl: string;
  /** 서명 시각 (ISO 8601 문자열) */
  readonly signedAt: string;
}

/**
 * 교사 현황 보드용 행.
 *
 * 명렬 대상자별 서명 완료 여부를 한눈에 보여주기 위한 파생 뷰.
 */
export interface SignatureStatusRow {
  /** 명렬 구성원 참조 (RosterMember.id) */
  readonly memberRef: string;
  /** 이름 */
  readonly name: string;
  /** 소속 (선택) */
  readonly affiliation?: string;
  /** 서명 완료 여부 */
  readonly signed: boolean;
  /** 서명 시각 (완료 시, ISO 8601 문자열) */
  readonly signedAt?: string;
  /**
   * 서명 이미지 공개 URL (서명 완료자만).
   *
   * 시트/Excel 등록부의 서명 셀(`=IMAGE(url)` / addImage) 주입 대상.
   * 교사(admin_key 보유자)에게만 노출되며, URL은 obscurity-public이다.
   * 미서명자는 undefined.
   */
  readonly signaturePublicUrl?: string;
}
