import type { FormFormat } from '@domain/entities/FormTemplate';
import type { IPrinterAdapter } from '@domain/ports/IFormPorts';

/**
 * Phase 1: PDF 만 지원.
 * userData 경계 안쪽 `forms/_print/` 에 임시 파일을 쓴 뒤 기본 PDF 뷰어로 연다.
 * 사용자가 뷰어에서 Ctrl+P 로 인쇄하는 흐름.
 * HWPX/Excel 은 Phase 1 에서 "지원되지 않음" → 상위 UI 에서 안내.
 */
export class ElectronPrinterAdapter implements IPrinterAdapter {
  async print(bytes: Uint8Array, format: FormFormat, filename: string): Promise<void> {
    const api = window.electronAPI;
    if (!api?.forms) {
      throw new Error('Electron 환경에서만 인쇄할 수 있습니다.');
    }

    if (format !== 'pdf') {
      // Phase 1 제약 — UI 에서 catch 하여 안내 토스트 표시
      throw new Error('PHASE1_PRINT_UNSUPPORTED');
    }

    // 파일명 sanitize (경로 구분자 제거)
    const safeBase = filename.replace(/[\\/:*?"<>|]/g, '_');
    const relPath = `forms/_print/${Date.now()}_${safeBase.endsWith('.pdf') ? safeBase : `${safeBase}.pdf`}`;

    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    await api.forms.writeBinary(relPath, ab as ArrayBuffer);

    // openFile 은 절대 경로를 기대하지만 본 어댑터는 상대경로만 알고 있음 →
    // preload 의 openPath 는 절대경로용이므로 상대경로를 절대경로로 변환하려면
    // main 에 별도 API 가 필요. Phase 1 에서는 writeBinary 가 userData 기준으로 기록됨을
    // 활용하고, 실제 "파일 열기" 는 UI 에서 readBinary 후 Blob URL 로 새 창을 여는 방식으로
    // 대체하거나, 향후 `forms:openFile` 전용 IPC 를 추가한다.
    // → Phase 1 MVP: 임시 파일 경로 알림만 남기고 UI 에서 안내.
    console.log(`[ElectronPrinterAdapter] PDF 임시 저장 완료: ${relPath}`);
  }
}
