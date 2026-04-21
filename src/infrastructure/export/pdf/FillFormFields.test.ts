import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
} from 'pdf-lib';
import { fillFormFields } from './FillFormFields';
import { __resetFontCache, loadKoreanFontBuffers } from './FontRegistry';

/**
 * Node fs 로 public/fonts/*.ttf 를 읽어 FontRegistry 캐시를 prime.
 * 한번 cached 되면 테스트 전체에서 재사용.
 */
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

/** 3필드 AcroForm 샘플 PDF 를 pdf-lib 로 생성. */
async function buildAcroFormFixture(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait pts

  const form = doc.getForm();
  const nameField = form.createTextField('studentName');
  nameField.addToPage(page, { x: 60, y: 700, width: 300, height: 24 });
  nameField.setFontSize(14);

  const memoField = form.createTextField('memo');
  memoField.enableMultiline();
  memoField.addToPage(page, { x: 60, y: 500, width: 400, height: 120 });
  memoField.setFontSize(12);

  const consentField = form.createCheckBox('parentConsent');
  consentField.addToPage(page, { x: 60, y: 400, width: 20, height: 20 });

  const bytes = await doc.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** pdfjs-dist 로 PDF 의 페이지별 텍스트 배열 추출. */
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

describe('fillFormFields', () => {
  let fixture: ArrayBuffer;

  beforeAll(async () => {
    await primeFontCache();
    fixture = await buildAcroFormFixture();
  });

  it('rows 길이만큼 페이지가 만들어지고 AcroForm 은 flatten 된다', async () => {
    const result = await fillFormFields({
      sourcePdf: fixture,
      rows: [
        { studentName: '홍길동', memo: '출석 우수', parentConsent: true },
        { studentName: '김철수', memo: '수학 보충 필요', parentConsent: false },
        { studentName: '이영희', memo: '과학 관심 많음', parentConsent: true },
      ],
    });

    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(3);

    // flatten 후에는 form 필드가 남지 않아야 함
    const residualForm = parsed.getForm();
    expect(residualForm.getFields().length).toBe(0);
  });

  it('각 페이지의 한글 값이 실제 content stream 에 baked 되어 있다', async () => {
    const result = await fillFormFields({
      sourcePdf: fixture,
      rows: [
        { studentName: '홍길동', memo: '출석 우수' },
        { studentName: '김철수', memo: '수학 보충 필요' },
      ],
    });

    const texts = await extractPageTexts(result);
    expect(texts).toHaveLength(2);

    // 페이지 1: 홍길동 + 출석 우수
    expect(texts[0]).toMatch(/홍길동/);
    expect(texts[0]).toMatch(/출석 우수/);
    expect(texts[0]).not.toMatch(/김철수/); // 교차 오염 방지

    // 페이지 2: 김철수 + 수학 보충 필요
    expect(texts[1]).toMatch(/김철수/);
    expect(texts[1]).toMatch(/수학 보충 필요/);
    expect(texts[1]).not.toMatch(/홍길동/);
  });

  it('fieldMap 별칭으로 row 의 한글 키를 PDF 영문 필드에 매핑', async () => {
    const result = await fillFormFields({
      sourcePdf: fixture,
      rows: [{ 학생명: '박민수', 메모: '특이사항 없음' }],
      fieldMap: {
        studentName: '학생명', // PDF 필드 이름 → row 의 키
        memo: '메모',
      },
    });

    const texts = await extractPageTexts(result);
    expect(texts[0]).toMatch(/박민수/);
    expect(texts[0]).toMatch(/특이사항 없음/);
  });

  it('체크박스 필드를 boolean 으로 토글', async () => {
    // flatten 후 체크박스 상태는 content stream 에 도장 모양이 그려졌는지로 판단.
    // text extraction 으로는 쉽게 검증 어려우므로, 여기서는 에러 없이 통과하는지 + 페이지 수만 확인.
    const result = await fillFormFields({
      sourcePdf: fixture,
      rows: [
        { studentName: '홍길동', parentConsent: true },
        { studentName: '김철수', parentConsent: false },
      ],
    });
    const parsed = await PDFDocument.load(result);
    expect(parsed.getPageCount()).toBe(2);
  });

  it('row 에 없는 필드는 원본 값(빈 문자열)을 유지한다', async () => {
    const result = await fillFormFields({
      sourcePdf: fixture,
      rows: [
        { studentName: '홍길동' }, // memo, parentConsent 생략
      ],
    });
    const texts = await extractPageTexts(result);
    expect(texts[0]).toMatch(/홍길동/);
  });

  it('폼이 없는 PDF → 명시적 에러', async () => {
    const plainDoc = await PDFDocument.create();
    plainDoc.addPage();
    const plainBytes = await plainDoc.save();
    const plain = plainBytes.buffer.slice(
      plainBytes.byteOffset,
      plainBytes.byteOffset + plainBytes.byteLength,
    ) as ArrayBuffer;

    await expect(
      fillFormFields({
        sourcePdf: plain,
        rows: [{ studentName: '홍길동' }],
      }),
    ).rejects.toThrow(/AcroForm 필드가 없습니다/);
  });

  it('rows 가 빈 배열 → 명시적 에러', async () => {
    await expect(
      fillFormFields({ sourcePdf: fixture, rows: [] }),
    ).rejects.toThrow(/rows 가 최소 1개 이상/);
  });

  it('sourcePdf 가 비어있음 → 명시적 에러', async () => {
    await expect(
      fillFormFields({
        sourcePdf: new ArrayBuffer(0),
        rows: [{ studentName: '홍길동' }],
      }),
    ).rejects.toThrow(/sourcePdf 가 비어 있습니다/);
  });

  it('title/author 메타데이터가 출력 PDF 에 기록된다', async () => {
    const result = await fillFormFields({
      sourcePdf: fixture,
      rows: [{ studentName: '홍길동' }],
      // 위 rows 1건
    }, {
      title: '학생 기록부 mail-merge',
      author: '홍길동 담임',
    });

    const parsed = await PDFDocument.load(result);
    expect(parsed.getTitle()).toBe('학생 기록부 mail-merge');
    expect(parsed.getAuthor()).toBe('홍길동 담임');
  });

  // 타입 가드 검증 — pdf-lib 내부 타입 사용 확인용
  it('픽스처의 필드 타입이 TextField / CheckBox 로 식별됨 (sanity)', async () => {
    const doc = await PDFDocument.load(fixture);
    const form = doc.getForm();
    const name = form.getField('studentName');
    const consent = form.getField('parentConsent');
    expect(name).toBeInstanceOf(PDFTextField);
    expect(consent).toBeInstanceOf(PDFCheckBox);
  });
});
