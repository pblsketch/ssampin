import type { FormFormat } from '@domain/entities/FormTemplate';
import type { IPrinterAdapter } from '@domain/ports/IFormPorts';

/**
 * 서식 "바로 인쇄" 어댑터 — 포맷별 분기:
 *  - PDF: Electron 메인 프로세스가 hidden BrowserWindow 로 PDF 를 열어 OS 인쇄 대화상자를 직접 표시.
 *         (OS 연결 프로그램 의존 제거 — 어떤 환경에서도 인쇄 가능)
 *  - HWPX/Excel: userData/forms/_print 에 임시 저장 후 shell.openPath 로 연결 프로그램 실행.
 *                사용자는 한글/Excel 에서 Ctrl+P 로 인쇄.
 */
export class ElectronPrinterAdapter implements IPrinterAdapter {
  async print(bytes: Uint8Array, format: FormFormat, filename: string): Promise<void> {
    const api = window.electronAPI;
    if (!api?.forms) {
      throw new Error('Electron 환경에서만 인쇄할 수 있습니다.');
    }
    // 구버전 preload 캐시 감지 — 재설치 없이 업데이트만 한 경우를 대비
    if (typeof api.forms.openFile !== 'function') {
      throw new Error(
        '현재 설치된 앱이 최신 버전 파일과 맞지 않습니다. 앱을 완전히 종료한 뒤 최신 설치 파일로 다시 설치해 주세요.',
      );
    }
    // PDF 직접 인쇄 기능(printPdf)이 없는 구버전 preload 도 같은 방식으로 안내
    if (format === 'pdf' && typeof api.forms.printPdf !== 'function') {
      throw new Error(
        '현재 설치된 앱이 최신 PDF 인쇄 기능을 지원하지 않습니다. 앱을 완전히 종료한 뒤 최신 설치 파일로 다시 설치해 주세요.',
      );
    }

    const ext = format === 'excel' ? 'xlsx' : format;
    const safeBase = filename.replace(/[\\/:*?"<>|]/g, '_');
    const base = safeBase.toLowerCase().endsWith(`.${ext}`) ? safeBase : `${safeBase}.${ext}`;
    const relPath = `forms/_print/${Date.now()}_${base}`;

    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    try {
      await api.forms.writeBinary(relPath, ab as ArrayBuffer);
    } catch (err) {
      throw new Error(
        `임시 파일 저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (format === 'pdf') {
      // PDF: Electron 내장 PDF 뷰어 + webContents.print() 로 OS 인쇄 대화상자 표시
      try {
        await api.forms.printPdf!(relPath);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`PDF 인쇄 대화상자를 열지 못했습니다. (상세: ${detail})`);
      }
      return;
    }

    // HWPX / Excel: OS 연결 프로그램에서 열기 (사용자가 Ctrl+P 로 인쇄)
    try {
      await api.forms.openFile(relPath);
    } catch (err) {
      // shell.openPath 실패: 연결 프로그램 없음(HWPX→한글 미설치, 등)이 가장 흔함
      const detail = err instanceof Error ? err.message : String(err);
      if (format === 'hwpx') {
        throw new Error(
          `HWPX 파일을 열 수 없습니다. 한글(HWP) 또는 한글뷰어가 설치되어 있는지 확인하세요. (상세: ${detail})`,
        );
      }
      if (format === 'excel') {
        throw new Error(
          `Excel 파일을 열 수 없습니다. Microsoft Excel 또는 호환 프로그램 설치를 확인하세요. (상세: ${detail})`,
        );
      }
      throw new Error(`파일을 열 수 없습니다. (상세: ${detail})`);
    }
  }
}
