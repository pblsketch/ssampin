import type {
  PdfExporter,
  PdfFormFillInput,
  PdfOptions,
  PdfTemplateInput,
} from './pdf/types';

export type {
  PdfExporter,
  PdfFormFillInput,
  PdfOptions,
  PdfPageSize,
  PdfTemplateInput,
  PdfTemplateSchema,
} from './pdf/types';

/**
 * PdfExporter 팩토리.
 *
 * 계획서 §5-2 — 동적 import 로 트리쉐이킹.
 * 각 메서드는 호출 시점에만 해당 구현 모듈을 로드하므로,
 * pdfme 나 pdf-lib 를 쓰지 않는 기능(예: 대시보드 인쇄만 사용)은 해당 청크를 로드하지 않는다.
 */
export function createPdfExporter(): PdfExporter {
  return {
    printCurrentView: (opts?: PdfOptions) =>
      import('./pdf/PrintCurrentView').then((m) => m.printCurrentView(opts)),
    renderTemplate: (inp: PdfTemplateInput, opts?: PdfOptions) =>
      import('./pdf/RenderTemplate').then((m) => m.renderTemplate(inp, opts)),
    fillFormFields: (inp: PdfFormFillInput, opts?: PdfOptions) =>
      import('./pdf/FillFormFields').then((m) => m.fillFormFields(inp, opts)),
  };
}

/**
 * 하위 호환: 기존 `exportToPdf()` 호출부 유지용 래퍼.
 *
 * @deprecated `createPdfExporter().printCurrentView()` 를 사용하세요.
 * 호출처 전수 조사 결과 (2026-04-21) 실사용처가 없으므로 차기 메이저 버전에서 제거 예정.
 */
export async function exportToPdf(): Promise<ArrayBuffer | null> {
  return createPdfExporter().printCurrentView();
}
