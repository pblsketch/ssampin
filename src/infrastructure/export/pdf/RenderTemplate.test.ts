import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { renderTemplate } from './RenderTemplate';
import { __resetFontCache, loadKoreanFontBuffers } from './FontRegistry';
import type { PdfTemplateInput } from './types';

async function primeFontCache(): Promise<void> {
  __resetFontCache();
  const root = process.cwd();
  const fsFetcher = async (url: string): Promise<ArrayBuffer> => {
    const buf = await readFile(join(root, 'public', url));
    const copy = new ArrayBuffer(buf.byteLength);
    new Uint8Array(copy).set(buf);
    return copy;
  };
  await loadKoreanFontBuffers(fsFetcher, '');
}

async function extractPageTexts(pdfBytes: ArrayBuffer): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const results: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ');
    results.push(text);
  }
  return results;
}

/**
 * 최소 템플릿: A4 portrait, padding 20 (4변 모두), 필드 2개 (title + body).
 *
 * POC 교훈: 필드 y + height 가 페이지 height - paddingBottom 을 초과하면
 * 자동으로 다음 페이지로 밀림. 여기서는 모든 필드를 안전 범위 내에 배치.
 */
const MINIMAL_TEMPLATE = {
  basePdf: {
    width: 210,
    height: 297,
    padding: [20, 20, 20, 20],
  },
  schemas: [
    [
      {
        name: 'title',
        type: 'text',
        position: { x: 20, y: 25 },
        width: 170,
        height: 12,
        fontSize: 18,
        fontName: 'NotoSansKR-Bold',
        fontColor: '#000000',
      },
      {
        name: 'body',
        type: 'text',
        position: { x: 20, y: 50 },
        width: 170,
        height: 60,
        fontSize: 11,
        fontName: 'NotoSansKR',
        fontColor: '#333333',
      },
    ],
  ],
};

describe('renderTemplate', () => {
  beforeAll(async () => {
    await primeFontCache();
  });

  it('inputs 개수만큼 페이지가 생성되고 한글이 정확히 렌더된다', async () => {
    const input: PdfTemplateInput = {
      template: MINIMAL_TEMPLATE,
      inputs: [
        { title: '학생 기록부 1번', body: '홍길동 - 출석 우수, 국어 90점' },
        { title: '학생 기록부 2번', body: '김철수 - 수학 관심, 과학 실험 적극적' },
      ],
    };

    const pdfBytes = await renderTemplate(input);

    // PDF 헤더 검증
    const header = new TextDecoder('ascii').decode(
      new Uint8Array(pdfBytes).slice(0, 5),
    );
    expect(header).toBe('%PDF-');

    // pdf-lib 재파싱 가능 여부 + 페이지 수
    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getPageCount()).toBe(2);

    // 페이지별 한글 텍스트 추출 검증
    const texts = await extractPageTexts(pdfBytes);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/학생 기록부 1번/);
    expect(texts[0]).toMatch(/홍길동/);
    expect(texts[0]).not.toMatch(/김철수/);
    expect(texts[1]).toMatch(/학생 기록부 2번/);
    expect(texts[1]).toMatch(/김철수/);
    expect(texts[1]).toMatch(/과학 실험/);
    expect(texts[1]).not.toMatch(/홍길동/);
  });

  it('options.title/author 를 PDF 메타데이터에 기록', async () => {
    const input: PdfTemplateInput = {
      template: MINIMAL_TEMPLATE,
      inputs: [{ title: '메모', body: '내용' }],
    };

    const pdfBytes = await renderTemplate(input, {
      title: '2026학년도 담임 기록부',
      author: '홍길동 선생님',
    });

    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getTitle()).toBe('2026학년도 담임 기록부');
    expect(parsed.getAuthor()).toBe('홍길동 선생님');
  });

  it('options.author 만 생략 시 기본값 "쌤핀"', async () => {
    const input: PdfTemplateInput = {
      template: MINIMAL_TEMPLATE,
      inputs: [{ title: '메모', body: '내용' }],
    };

    const pdfBytes = await renderTemplate(input, { title: '제목만' });

    const parsed = await PDFDocument.load(pdfBytes);
    expect(parsed.getTitle()).toBe('제목만');
    expect(parsed.getAuthor()).toBe('쌤핀');
  });

  it('template 이 없으면 명시적 throw', async () => {
    await expect(
      renderTemplate({
        template: undefined as unknown as PdfTemplateInput['template'],
        inputs: [{}],
      }),
    ).rejects.toThrow(/template 이 필요합니다/);
  });

  it('inputs 가 빈 배열 → 명시적 throw', async () => {
    await expect(
      renderTemplate({ template: MINIMAL_TEMPLATE, inputs: [] }),
    ).rejects.toThrow(/inputs 가 최소 1개 이상/);
  });

  it('rare char "쌤" 포함 텍스트도 렌더 (KS X 1001 외 커버리지)', async () => {
    const pdfBytes = await renderTemplate({
      template: MINIMAL_TEMPLATE,
      inputs: [{ title: '쌤핀', body: '쌤핀(SsamPin)은 교사용 앱입니다.' }],
    });

    const texts = await extractPageTexts(pdfBytes);
    expect(texts[0]).toMatch(/쌤핀/);
    expect(texts[0]).toMatch(/쌤핀\(SsamPin\)/);
  });
});
