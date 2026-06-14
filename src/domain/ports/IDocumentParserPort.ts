/**
 * 문서 파싱 포트 — 도메인이 정의하고 infrastructure(electron main + kordoc)가 구현한다.
 *
 * 파싱은 반드시 로컬에서만 수행한다(개인정보가 기기 밖으로 나가지 않는다).
 * domain 레이어이므로 kordoc 등 외부 타입을 import 하지 않는다.
 */

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
