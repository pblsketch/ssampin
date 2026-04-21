import type { PdfOptions, PdfPageSize } from './types';

/**
 * 현재 렌더된 화면을 PDF로 저장.
 *
 * - Electron 환경: `window.electronAPI.printToPDF()` → `webContents.printToPDF()`.
 *   pageSize / landscape / marginsType 을 IPC 로 전달한다.
 * - 브라우저 환경: `window.print()` 호출 후 null 반환. 옵션은 무시됨 (브라우저 인쇄
 *   다이얼로그에서 사용자가 직접 설정).
 *
 * `PdfOptions.title` 와 `PdfOptions.author` 는 Electron `printToPDF` 가 지원하지
 * 않으므로 현재는 무시된다. 필요 시 추후 pdf-lib 으로 메타데이터 후처리 추가 검토.
 */
export async function printCurrentView(
  options?: PdfOptions,
): Promise<ArrayBuffer | null> {
  if (typeof window === 'undefined') {
    throw new Error('printCurrentView: window 객체가 필요합니다 (renderer 전용).');
  }

  if (window.electronAPI) {
    const ipcOptions = toIpcOptions(options);
    return ipcOptions
      ? window.electronAPI.printToPDF(ipcOptions)
      : window.electronAPI.printToPDF();
  }

  window.print();
  return null;
}

function toIpcOptions(options?: PdfOptions) {
  if (!options) return undefined;

  const pageSize = normalizePageSize(options.pageSize);
  const hasAny =
    pageSize !== undefined ||
    options.landscape !== undefined ||
    options.marginsType !== undefined;

  if (!hasAny) return undefined;

  return {
    ...(pageSize !== undefined ? { pageSize } : {}),
    ...(options.landscape !== undefined ? { landscape: options.landscape } : {}),
    ...(options.marginsType !== undefined
      ? { marginsType: options.marginsType }
      : {}),
  };
}

function normalizePageSize(
  size: PdfPageSize | undefined,
):
  | 'A3'
  | 'A4'
  | 'A5'
  | 'Letter'
  | 'Legal'
  | 'Tabloid'
  | { width: number; height: number }
  | undefined {
  if (size === undefined) return undefined;
  // types.ts 의 PdfPageSize 유니언은 IPC 시그니처와 동일하므로 그대로 전달 가능.
  return size;
}
