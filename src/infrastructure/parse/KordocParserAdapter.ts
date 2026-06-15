/**
 * IDocumentParserPort 구현 — 실제 파싱은 Electron 메인 프로세스(kordoc)에 IPC로 위임한다.
 *
 * 파일 경로·원본 bytes는 메인이 보유하고 renderer로 넘기지 않는다(결과 마크다운만 수신).
 * 데스크톱 앱이 아니면(브라우저 dev) 사용 불가 — 명확한 안내 에러를 반환.
 */
import type { IDocumentParserPort, ParseOutcome } from '@domain/ports/IDocumentParserPort';

/** electronAPI.markdownConvert 가 반환하는 raw 결과(전역 타입과 동일 구조 — 앰비언트 의존 제거) */
type RawResult =
  | { status: 'canceled' }
  | {
      status: 'ok';
      fileName: string;
      markdown: string;
      format: string;
      isImageBased: boolean;
      warnings: string[];
      metadata?: {
        title?: string;
        author?: string;
        creator?: string;
        createdAt?: string;
        pageCount?: number;
        version?: string;
      };
      outline?: Array<{ level: number; text: string }>;
      textQuality?: {
        needsReview: boolean;
        reason?: 'image_based' | 'low_text' | 'high_pua' | 'high_control' | 'high_replacement';
      };
    }
  | { status: 'error'; code: string; message: string };

export class KordocParserAdapter implements IDocumentParserPort {
  async pickAndParse(): Promise<ParseOutcome> {
    const api = typeof window !== 'undefined' ? window.electronAPI?.markdownConvert : undefined;
    if (!api) {
      return {
        status: 'error',
        code: 'NOT_AVAILABLE',
        message: '이 기능은 쌤핀 데스크톱 앱에서만 사용할 수 있어요.',
      };
    }
    return mapResult(await api.pickAndParse());
  }

  async pickAndParseMulti(): Promise<ParseOutcome[]> {
    const api = typeof window !== 'undefined' ? window.electronAPI?.markdownConvert : undefined;
    if (!api?.pickAndParseMulti) {
      return [
        {
          status: 'error',
          code: 'NOT_AVAILABLE',
          message: '이 기능은 쌤핀 데스크톱 앱에서만 사용할 수 있어요.',
        },
      ];
    }
    const results = await api.pickAndParseMulti();
    return results.map(mapResult);
  }

  async parseBytes(bytes: Uint8Array, fileName: string): Promise<ParseOutcome> {
    const api = typeof window !== 'undefined' ? window.electronAPI?.markdownConvert : undefined;
    if (!api?.parseBuffer) {
      return {
        status: 'error',
        code: 'NOT_AVAILABLE',
        message: '이 기능은 쌤핀 데스크톱 앱에서만 사용할 수 있어요.',
      };
    }
    return mapResult(await api.parseBuffer(bytes, fileName));
  }
}

function mapResult(r: RawResult): ParseOutcome {
  if (r.status === 'canceled') return { status: 'canceled' };
  if (r.status === 'error') return { status: 'error', code: r.code, message: r.message };
  return {
    status: 'ok',
    fileName: r.fileName,
    document: {
      markdown: r.markdown,
      format: r.format,
      isImageBased: r.isImageBased,
      warnings: r.warnings,
      metadata: r.metadata,
      outline: r.outline,
      textQuality: r.textQuality,
    },
  };
}
