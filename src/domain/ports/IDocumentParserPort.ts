/**
 * 문서 파싱 포트 — 도메인이 정의하고 infrastructure(electron main + kordoc)가 구현한다.
 *
 * 파싱은 반드시 로컬에서만 수행한다(개인정보가 기기 밖으로 나가지 않는다).
 * domain 레이어이므로 kordoc 등 외부 타입을 import 하지 않는다.
 */

/** 문서 메타데이터(존재하는 값만 채워짐). 표시 전용 — 마스킹 본문/내보내기에 주입하지 않는다. */
export interface ParsedDocMetadata {
  readonly title?: string;
  readonly author?: string;
  /** 작성 프로그램(예: '한글 2020') */
  readonly creator?: string;
  /** 작성일시(원본에 기록된 문자열 그대로) */
  readonly createdAt?: string;
  /** 페이지/섹션/시트 수 */
  readonly pageCount?: number;
  /** 문서 포맷 버전 */
  readonly version?: string;
}

/** 문서 목차 항목(헤딩 트리). */
export interface ParsedDocOutlineItem {
  /** 헤딩 수준(1~6) */
  readonly level: number;
  readonly text: string;
}

/**
 * 텍스트 추출 품질 신호. needsReview 가 true 면 사용자 확인을 권한다.
 * reason 은 도메인 자체 어휘(외부 라이브러리 타입을 들이지 않는다).
 * - image_based: 스캔/이미지 문서라 글자 자체가 없음
 * - low_text: 추출된 글자가 너무 적음
 * - high_pua/high_control/high_replacement: 글자가 깨져 추출됨(인코딩 손상)
 */
export type TextQualityReason =
  | 'image_based'
  | 'low_text'
  | 'high_pua'
  | 'high_control'
  | 'high_replacement';

export interface ParsedTextQuality {
  readonly needsReview: boolean;
  readonly reason?: TextQualityReason;
}

/** 파싱된 문서 */
export interface ParsedDocument {
  /** 추출된 마크다운 */
  readonly markdown: string;
  /** 감지된 형식(예: 'hwpx' | 'hwp' | 'pdf' | 'xlsx' | 'docx' | 'unknown') */
  readonly format: string;
  /** 이미지로만 된 문서(스캔 PDF 등) — 텍스트 추출 불가 안내용 */
  readonly isImageBased: boolean;
  /** 파싱 중 경고 메시지(있으면) */
  readonly warnings: readonly string[];
  /** 문서 정보(있으면). 표시 전용. */
  readonly metadata?: ParsedDocMetadata;
  /** 문서 목차(있으면). */
  readonly outline?: readonly ParsedDocOutlineItem[];
  /** 텍스트 추출 품질 신호(주로 PDF). 없으면 양호로 간주. */
  readonly textQuality?: ParsedTextQuality;
}

/** 파일 선택 + 파싱 결과 */
export type ParseOutcome =
  | { readonly status: 'canceled' }
  | { readonly status: 'ok'; readonly fileName: string; readonly document: ParsedDocument }
  | { readonly status: 'error'; readonly code: string; readonly message: string };

export interface IDocumentParserPort {
  /**
   * 파일 선택 다이얼로그를 열고, 선택한 문서를 마크다운으로 파싱한다.
   * 원본 파일 경로·바이트는 호출자에게 노출하지 않는다(결과 마크다운만 반환).
   */
  pickAndParse(): Promise<ParseOutcome>;

  /**
   * 여러 파일을 선택해 각각 파싱한다(동시 변환). 취소 시 빈 배열.
   * 각 항목은 ok 또는 error(개별 실패)다.
   */
  pickAndParseMulti(): Promise<ParseOutcome[]>;

  /**
   * 드롭/직접 전달된 파일 bytes 를 마크다운으로 파싱한다(로컬).
   */
  parseBytes(bytes: Uint8Array, fileName: string): Promise<ParseOutcome>;
}
