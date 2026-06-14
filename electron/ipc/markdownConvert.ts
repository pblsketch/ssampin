/**
 * 마크다운 변환기 IPC — 파일 선택/드롭 + kordoc 파싱을 메인 프로세스에서 수행한다.
 *
 * 채널:
 *  - `markdown-convert:pick-and-parse` : 다이얼로그로 파일 선택 → 파싱
 *  - `markdown-convert:parse-buffer`   : renderer가 드롭한 파일 bytes → 파싱
 * 흐름: Renderer → Main(파일 읽기/수신 → kordoc parse) → 마크다운 반환
 *
 * 보안/프라이버시:
 *  - 파일 경로 문자열·원본 bytes 는 renderer 에 노출하지 않는다(결과 마크다운만 반환).
 *  - 모든 처리는 로컬에서만 — 외부 네트워크 전송 없음(개인정보 보호가 이 도구의 존재 이유).
 *  - 파일 경로·원본 내용은 로그에 남기지 않는다(관측성에 PII 미포함).
 *
 * kordoc 은 esbuild external 로 두어 런타임에 node_modules(asar 내부)에서 require 된다.
 * (scripts/build-electron.mjs 참조)
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse, type ParseResult } from 'kordoc';
import { buildStoreZip, dedupeFilenames, sanitizeFilename } from '../lib/zipStore';

const MAX_BYTES = 50 * 1024 * 1024; // 50MB
const SUPPORTED_EXTENSIONS = ['hwp', 'hwpx', 'hwpml', 'pdf', 'xls', 'xlsx', 'docx'];

/** renderer 로 반환하는 결과(파일 경로/원본 bytes 미포함) */
export type PickAndParseResult =
  | { status: 'canceled' }
  | {
      status: 'ok';
      fileName: string;
      markdown: string;
      format: string;
      isImageBased: boolean;
      warnings: string[];
    }
  | { status: 'error'; code: string; message: string };

/** ArrayBuffer → kordoc 파싱 → 결과 매핑(공통). 크기 검사 포함. */
async function parseArrayBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string,
): Promise<PickAndParseResult> {
  try {
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return {
        status: 'error',
        code: 'TOO_LARGE',
        message: `파일이 너무 큽니다. (최대 ${MAX_BYTES / 1024 / 1024}MB)`,
      };
    }
    const parsed: ParseResult = await parse(arrayBuffer);
    if (!parsed.success) {
      return { status: 'error', code: parsed.code ?? 'PARSE_ERROR', message: parsed.error };
    }
    return {
      status: 'ok',
      fileName,
      markdown: parsed.markdown,
      format: parsed.fileType,
      isImageBased: parsed.isImageBased ?? false,
      warnings: (parsed.warnings ?? []).map((w) => w.message),
    };
  } catch (e) {
    return {
      status: 'error',
      code: 'READ_OR_PARSE_FAILED',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export function registerMarkdownConvertHandlers(mainWindow: BrowserWindow | null): void {
  // 다이얼로그 선택 → 파싱
  ipcMain.handle('markdown-convert:pick-and-parse', async (): Promise<PickAndParseResult> => {
    const parent = mainWindow ?? BrowserWindow.getFocusedWindow();
    const dialogOptions = {
      title: '변환할 문서 선택',
      filters: [
        { name: '문서 파일 (한글·PDF·엑셀·워드)', extensions: SUPPORTED_EXTENSIONS },
        { name: '모든 파일', extensions: ['*'] },
      ],
      properties: ['openFile' as const],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return { status: 'canceled' };
    }

    const filePath = result.filePaths[0]!;
    let buf: Buffer;
    try {
      const fileStat = statSync(filePath);
      if (fileStat.size > MAX_BYTES) {
        return {
          status: 'error',
          code: 'TOO_LARGE',
          message: `파일이 너무 큽니다. (최대 ${MAX_BYTES / 1024 / 1024}MB)`,
        };
      }
      buf = readFileSync(filePath);
    } catch (e) {
      return {
        status: 'error',
        code: 'READ_FAILED',
        message: e instanceof Error ? e.message : String(e),
      };
    }
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return parseArrayBuffer(arrayBuffer, basename(filePath));
  });

  // 다중 선택 → 각각 파싱 (여러 문서 동시 변환)
  ipcMain.handle(
    'markdown-convert:pick-and-parse-multi',
    async (): Promise<PickAndParseResult[]> => {
      const parent = mainWindow ?? BrowserWindow.getFocusedWindow();
      const dialogOptions = {
        title: '변환할 문서 선택 (여러 개 선택 가능)',
        filters: [
          { name: '문서 파일 (한글·PDF·엑셀·워드)', extensions: SUPPORTED_EXTENSIONS },
          { name: '모든 파일', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

      if (result.canceled || result.filePaths.length === 0) return [];

      const out: PickAndParseResult[] = [];
      for (const filePath of result.filePaths) {
        try {
          const fileStat = statSync(filePath);
          if (fileStat.size > MAX_BYTES) {
            out.push({
              status: 'error',
              code: 'TOO_LARGE',
              message: `${basename(filePath)}: 파일이 너무 큽니다. (최대 ${MAX_BYTES / 1024 / 1024}MB)`,
            });
            continue;
          }
          const buf = readFileSync(filePath);
          const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          out.push(await parseArrayBuffer(ab, basename(filePath)));
        } catch (e) {
          out.push({
            status: 'error',
            code: 'READ_FAILED',
            message: `${basename(filePath)}: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }
      return out;
    },
  );

  // 드롭한 파일 bytes → 파싱 (renderer가 File.arrayBuffer()로 읽어 전달)
  ipcMain.handle(
    'markdown-convert:parse-buffer',
    async (_event, args: { bytes: Uint8Array; fileName: string }): Promise<PickAndParseResult> => {
      if (!args || !args.bytes || typeof args.fileName !== 'string') {
        return { status: 'error', code: 'BAD_ARGS', message: '잘못된 파일 데이터입니다.' };
      }
      const bytes =
        args.bytes instanceof Uint8Array
          ? args.bytes
          : new Uint8Array(args.bytes as unknown as ArrayBufferLike);
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      return parseArrayBuffer(arrayBuffer, basename(args.fileName));
    },
  );

  // 개별 저장 — 각 파일을 개별 .md 로 묶은 ZIP 한 개로 내보낸다(저장창 1회, 외부 의존성 0).
  ipcMain.handle(
    'markdown-convert:save-zip',
    async (
      _event,
      args: { files: Array<{ name: string; text: string }>; zipName?: string },
    ): Promise<
      { status: 'canceled' } | { status: 'saved' } | { status: 'error'; message: string }
    > => {
      if (!args || !Array.isArray(args.files) || args.files.length === 0) {
        return { status: 'error', message: '저장할 파일이 없습니다.' };
      }
      const parent = mainWindow ?? BrowserWindow.getFocusedWindow();
      const baseZip =
        typeof args.zipName === 'string' && args.zipName.trim().length > 0
          ? args.zipName.trim()
          : '변환결과.zip';
      const defaultPath = baseZip.toLowerCase().endsWith('.zip') ? baseZip : `${baseZip}.zip`;
      const dialogOptions = {
        title: 'ZIP 파일로 저장',
        defaultPath,
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
      };
      const result = parent
        ? await dialog.showSaveDialog(parent, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);
      if (result.canceled || !result.filePath) return { status: 'canceled' };
      try {
        const names = dedupeFilenames(
          args.files.map((f) => {
            const raw = sanitizeFilename(
              typeof f.name === 'string' ? f.name : 'converted.md',
              'converted.md',
            );
            return raw.toLowerCase().endsWith('.md') ? raw : `${raw}.md`;
          }),
        );
        const entries = args.files.map((f, i) => ({
          filename: names[i] ?? `converted_${i + 1}.md`,
          data: Buffer.from(typeof f.text === 'string' ? f.text : '', 'utf8'),
        }));
        writeFileSync(result.filePath, buildStoreZip(entries));
        return { status: 'saved' };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );
}
