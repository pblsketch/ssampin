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
import {
  parse,
  markdownToHwpx,
  type ParseResult,
  type DocumentMetadata,
  type OutlineItem,
} from 'kordoc';
import JSZip from 'jszip';
import { buildStoreZip, dedupeFilenames, sanitizeFilename } from '../lib/zipStore';
import { friendlyParseFailure, hasNoExtractableText } from './markdownConvertErrors';
import {
  decodePlainText,
  isPlainTextFile,
  looksMojibake,
  plainTextFormat,
} from './plainTextDecode';

const MAX_BYTES = 50 * 1024 * 1024; // 50MB
const SUPPORTED_EXTENSIONS = ['hwp', 'hwpx', 'hwpml', 'pdf', 'xls', 'xlsx', 'docx', 'txt', 'md'];
const MAX_OUTLINE_ITEMS = 100;

/** 문서 정보(존재값만). 표시 전용 — 마스킹 본문/저장 결과에 주입하지 않는다. */
export interface MarkdownDocMetadata {
  title?: string;
  author?: string;
  creator?: string;
  createdAt?: string;
  pageCount?: number;
  version?: string;
}

/** 문서 목차 항목 */
export interface MarkdownOutlineItem {
  level: number;
  text: string;
}

/** 텍스트 추출 품질 사유 — domain TextQualityReason 과 동일 어휘(IPC 경계용 재선언) */
export type MarkdownTextQualityReason =
  | 'image_based'
  | 'low_text'
  | 'high_pua'
  | 'high_control'
  | 'high_replacement';

export interface MarkdownTextQuality {
  needsReview: boolean;
  reason?: MarkdownTextQualityReason;
}

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
      /** 문서 정보(있으면). 표시 전용. */
      metadata?: MarkdownDocMetadata;
      /** 문서 목차(있으면). */
      outline?: MarkdownOutlineItem[];
      /** 텍스트 추출 품질 신호(주로 PDF). 없으면 양호로 간주. */
      textQuality?: MarkdownTextQuality;
    }
  | { status: 'error'; code: string; message: string };

/** kordoc 메타데이터 → 표시용 DTO(존재값만). */
function toDocMetadata(m: DocumentMetadata | undefined): MarkdownDocMetadata | undefined {
  if (!m) return undefined;
  const out: MarkdownDocMetadata = {};
  if (m.title) out.title = m.title;
  if (m.author) out.author = m.author;
  if (m.creator) out.creator = m.creator;
  if (m.createdAt) out.createdAt = m.createdAt;
  if (typeof m.pageCount === 'number') out.pageCount = m.pageCount;
  if (m.version) out.version = m.version;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** kordoc outline → 목차 DTO(빈 텍스트 제거, 최대 MAX_OUTLINE_ITEMS). */
function toOutline(o: OutlineItem[] | undefined): MarkdownOutlineItem[] | undefined {
  if (!o || o.length === 0) return undefined;
  const items = o
    .filter((it) => typeof it.text === 'string' && it.text.trim().length > 0)
    .slice(0, MAX_OUTLINE_ITEMS)
    .map((it) => ({ level: Math.max(1, Math.min(6, it.level || 1)), text: it.text.trim() }));
  return items.length > 0 ? items : undefined;
}

/** 추출 품질 신호 도출(이미지/저텍스트/깨짐). 양호하면 undefined. */
function toTextQuality(
  parsed: Extract<ParseResult, { success: true }>,
): MarkdownTextQuality | undefined {
  if (parsed.isImageBased) return { needsReview: true, reason: 'image_based' };
  const summary = parsed.qualitySummary;
  if (summary?.needsOcr) {
    const firstReason = (parsed.pageQuality ?? []).find(
      (p) => p.needsOcr && p.ocrReason,
    )?.ocrReason;
    const reason: MarkdownTextQualityReason =
      firstReason ?? (summary.highPuaPageCount > 0 ? 'high_pua' : 'low_text');
    return { needsReview: true, reason };
  }
  return undefined;
}

/**
 * kordoc markdownToHwpx 출력의 한글 줄나눔을 어절 단위로 교체.
 * kordoc 기본값 breakNonLatinWord="BREAK_WORD"(글자 단위)는 '감격스/럽습니다'처럼 낱말 중간에서
 * 끊겨 가독성이 나쁘다 → "KEEP_WORD"(어절 단위)로 바꾼다(header.xml 의 문단 스타일 정의).
 * mimetype 을 맨 앞 + 비압축(STORE)으로 유지해 한글(한컴) 호환을 보존한다. 실패 시 원본 그대로.
 */
async function fixHwpxLineBreak(input: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  try {
    const src = await JSZip.loadAsync(bytes);
    const names = Object.keys(src.files);
    const headerPath = names.find((p) => /Contents\/header\.xml$/i.test(p));
    if (!headerPath) return bytes;
    const headerFile = src.file(headerPath);
    if (!headerFile) return bytes;
    let headerXml = await headerFile.async('string');
    if (!headerXml.includes('breakNonLatinWord="BREAK_WORD"')) return bytes;
    headerXml = headerXml
      .split('breakNonLatinWord="BREAK_WORD"')
      .join('breakNonLatinWord="KEEP_WORD"');
    const out = new JSZip();
    for (const name of names) {
      const f = src.files[name];
      if (!f || f.dir) continue;
      if (name === headerPath) {
        out.file(name, headerXml);
      } else if (name === 'mimetype') {
        out.file(name, await f.async('uint8array'), { compression: 'STORE' });
      } else {
        out.file(name, await f.async('uint8array'));
      }
    }
    return await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  } catch {
    return bytes;
  }
}

/**
 * ArrayBuffer → kordoc 파싱 → 결과 매핑(공통). 크기 검사 포함.
 * 평가계획 불러오기(`ipc/schoolinfoEvaluation.ts`)가 다운로드한 hwp bytes 파싱에 재사용한다 —
 * 파싱 경로를 단일화해 markdown/isImageBased/textQuality 도출 규칙을 한 곳에서 관리한다.
 */
export async function parseArrayBuffer(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  filePath?: string,
): Promise<PickAndParseResult> {
  try {
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return {
        status: 'error',
        code: 'TOO_LARGE',
        message: `파일이 너무 큽니다. (최대 ${MAX_BYTES / 1024 / 1024}MB)`,
      };
    }
    // 평문(.txt·.md)은 kordoc 을 거치지 않는다 — 구조가 없는 바이트라 파서가
    // UNSUPPORTED_FORMAT 을 돌려준다. 여기서 해독해 곧장 마크다운 자리에 싣는다.
    if (isPlainTextFile(fileName)) {
      const text = decodePlainText(arrayBuffer);
      return {
        status: 'ok',
        fileName,
        markdown: text,
        // ★format·isImageBased·warnings 는 성공 계약의 **필수** 필드다. 빠뜨리면 화면이
        //   `[...o.document.warnings]` 에서 "warnings is not iterable" 로 죽는다(실제로 죽었다).
        //   ⚠️ `npx tsc --noEmit` 은 이것을 못 잡는다 — tsconfig.json 의 include 가 ["src"] 뿐이라
        //   electron/ 이 아예 검사 대상이 아니다. 여기 손댈 때는 반드시
        //   `npx tsc --noEmit -p tsconfig.electron.json` 으로 이 파일을 확인할 것.
        format: plainTextFormat(fileName),
        isImageBased: false,
        warnings: [],
        // 깨진 글자를 "본문"이라고 말하지 않는다 — 빈 결과보다 이쪽이 더 위험하다.
        // hasNoExtractableText 는 빈 문자열만 보므로 깨짐은 looksMojibake 가 따로 잡는다.
        ...(looksMojibake(text)
          ? { textQuality: { needsReview: true, reason: 'high_replacement' as const } }
          : hasNoExtractableText(text)
            ? { textQuality: { needsReview: true, reason: 'low_text' as const } }
            : {}),
      };
    }
    // filePath 는 메인 프로세스 내부 전용 — kordoc 의 배포용 한글 COM fallback 에만 쓰이고
    // renderer 로는 반환하지 않는다(아래 결과에 fileName=basename 만 포함). 입력은 ArrayBuffer 라
    // kordoc 이 디스크를 다시 읽지 않는다(filePath 는 COM 재시도에만 사용).
    const parsed: ParseResult = await parse(arrayBuffer, filePath ? { filePath } : undefined);
    if (!parsed.success) {
      const code = parsed.code ?? 'PARSE_ERROR';
      // 진단용: PII 없는 코드만 기록(원본 경로·내용은 로그에 남기지 않는 원칙 유지).
      console.warn(`[markdownConvert] 변환 실패 code=${code}`);
      // 원시 kordoc 문구 노출 금지 → 코드/파일종류별 친화 문구. 엑셀 구조 문제면 '다시 저장' 해결책 안내.
      return { status: 'error', code, message: friendlyParseFailure(code, fileName) };
    }
    // 파싱은 됐지만 추출된 글자가 사실상 없으면(빈 문서/이미지·표만 있는 문서) 빈 결과를 그대로 주지
    // 않고 품질 신호로 설명한다. kordoc 자체 품질 신호가 있으면 그것을 우선한다.
    const textQuality: MarkdownTextQuality | undefined =
      toTextQuality(parsed) ??
      (!(parsed.isImageBased ?? false) && hasNoExtractableText(parsed.markdown)
        ? { needsReview: true, reason: 'low_text' }
        : undefined);
    return {
      status: 'ok',
      fileName,
      markdown: parsed.markdown,
      format: parsed.fileType,
      isImageBased: parsed.isImageBased ?? false,
      warnings: (parsed.warnings ?? []).map((w) => w.message),
      metadata: toDocMetadata(parsed.metadata),
      outline: toOutline(parsed.outline),
      textQuality,
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
    const arrayBuffer = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
    // filePath 전달 → 배포용 잠긴 한글의 한컴 COM fallback 활성화(Windows+한컴 설치 환경 전용).
    return parseArrayBuffer(arrayBuffer, basename(filePath), filePath);
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
          const ab = buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength,
          ) as ArrayBuffer;
          // filePath 전달 → 배포용 잠긴 한글 COM fallback 활성화(Windows+한컴 전용).
          out.push(await parseArrayBuffer(ab, basename(filePath), filePath));
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

  // 마크다운 → 한글(.hwpx) 1개 저장 — kordoc markdownToHwpx 로 생성 후 저장 다이얼로그.
  // markdownToHwpx 는 메인 전용(렌더러 미노출). 경로는 메인 내부에서만 사용.
  ipcMain.handle(
    'markdown-convert:save-hwpx',
    async (
      _event,
      args: { markdown: string; suggestedName?: string },
    ): Promise<
      { status: 'canceled' } | { status: 'saved' } | { status: 'error'; message: string }
    > => {
      if (!args || typeof args.markdown !== 'string' || args.markdown.length === 0) {
        return { status: 'error', message: '내보낼 내용이 없습니다.' };
      }
      const parent = mainWindow ?? BrowserWindow.getFocusedWindow();
      const base =
        typeof args.suggestedName === 'string' && args.suggestedName.trim().length > 0
          ? args.suggestedName.trim()
          : '변환결과.hwpx';
      const defaultPath = base.toLowerCase().endsWith('.hwpx') ? base : `${base}.hwpx`;
      const dialogOptions = {
        title: '한글 문서로 저장',
        defaultPath,
        filters: [{ name: '한글 문서', extensions: ['hwpx'] }],
      };
      const result = parent
        ? await dialog.showSaveDialog(parent, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);
      if (result.canceled || !result.filePath) return { status: 'canceled' };
      try {
        const bytes = await markdownToHwpx(args.markdown);
        const fixed = await fixHwpxLineBreak(bytes);
        writeFileSync(result.filePath, Buffer.from(fixed));
        return { status: 'saved' };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );

  // 마크다운 여러 개 → 각각 .hwpx 로 변환해 묶은 ZIP 1개로 저장(저장창 1회).
  ipcMain.handle(
    'markdown-convert:save-hwpx-zip',
    async (
      _event,
      args: { files: Array<{ name: string; markdown: string }>; zipName?: string },
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
          : '변환결과(한글).zip';
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
              typeof f.name === 'string' ? f.name : 'converted.hwpx',
              'converted.hwpx',
            );
            return raw.toLowerCase().endsWith('.hwpx') ? raw : `${raw}.hwpx`;
          }),
        );
        const entries: Array<{ filename: string; data: Buffer }> = [];
        for (let i = 0; i < args.files.length; i++) {
          const f = args.files[i]!;
          const bytes = await markdownToHwpx(typeof f.markdown === 'string' ? f.markdown : '');
          const fixed = await fixHwpxLineBreak(bytes);
          entries.push({
            filename: names[i] ?? `converted_${i + 1}.hwpx`,
            data: Buffer.from(fixed),
          });
        }
        writeFileSync(result.filePath, buildStoreZip(entries));
        return { status: 'saved' };
      } catch (e) {
        return { status: 'error', message: e instanceof Error ? e.message : String(e) };
      }
    },
  );
}
