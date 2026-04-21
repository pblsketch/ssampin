/**
 * PDF Exporter 공개 타입 정의.
 *
 * Clean Architecture 상 infrastructure 레이어에 위치하지만,
 * 본 파일은 외부 의존성(pdf-lib, pdfme 등)을 import하지 않는 순수 타입 모듈이다.
 * adapters 레이어에서도 안전하게 import 가능.
 */

/** PDF 페이지 크기 옵션 (Electron printToPDF와 호환) */
export type PdfPageSize =
  | 'A4'
  | 'A3'
  | 'A5'
  | 'Letter'
  | 'Legal'
  | 'Tabloid'
  | { width: number; height: number };

/** 공통 PDF 생성 옵션 */
export interface PdfOptions {
  /** 기본 'A4' */
  pageSize?: PdfPageSize;
  /** 기본 false */
  landscape?: boolean;
  /** Electron 호환: 0=default, 1=none, 2=minimum */
  marginsType?: 0 | 1 | 2;
  /** PDF 메타데이터 Title */
  title?: string;
  /** 기본 '쌤핀' */
  author?: string;
}

/**
 * pdfme Template 스키마.
 *
 * @pdfme/common 의 Template 타입을 re-export 하지 않고 unknown 으로 둔다.
 * 이유: 계획서 §5-2 — adapters 레이어에서 pdfme 타입을 직접 보지 않도록 경계.
 * 실제 검증은 RenderTemplate.ts 내부에서 pdfme의 런타임 스키마 검증에 위임.
 */
export type PdfTemplateSchema = unknown;

/** 템플릿 렌더용 인풋 (pdfme 스키마 호환) */
export interface PdfTemplateInput {
  template: PdfTemplateSchema;
  /** 각 요소 = 1 페이지. 키는 템플릿의 필드명, 값은 주입 문자열. */
  inputs: Array<Record<string, string>>;
}

/** 폼 필드 채움 인풋 (AcroForm mail-merge) */
export interface PdfFormFillInput {
  /** AcroForm 이 있는 원본 PDF 바이너리 */
  sourcePdf: ArrayBuffer;
  /** 각 row = 1명분. 텍스트 필드는 string, 체크박스는 boolean. */
  rows: Array<Record<string, string | boolean>>;
  /**
   * 별칭 매핑 (선택).
   * 예: { '학생명': 'name' } → rows 의 'name' 값을 PDF 폼의 '학생명' 필드에 주입.
   */
  fieldMap?: Record<string, string>;
}

/** PdfExporter 공개 인터페이스 */
export interface PdfExporter {
  /**
   * 현재 렌더된 화면을 PDF로 저장.
   * - Electron 환경: webContents.printToPDF()
   * - 브라우저 환경: window.print() 호출 후 null 반환
   */
  printCurrentView(options?: PdfOptions): Promise<ArrayBuffer | null>;

  /**
   * 템플릿 + 데이터로 새 PDF 생성 (pdfme 기반).
   * 예: 학생 기록부 템플릿 + students[] → PDF
   */
  renderTemplate(input: PdfTemplateInput, options?: PdfOptions): Promise<ArrayBuffer>;

  /**
   * 기존 AcroForm PDF 에 값 주입 (pdf-lib 기반).
   * rows 길이만큼 페이지를 복제하며 각 페이지의 폼 필드를 채움.
   * 반환은 하나의 합쳐진 PDF ArrayBuffer.
   */
  fillFormFields(input: PdfFormFillInput, options?: PdfOptions): Promise<ArrayBuffer>;
}
