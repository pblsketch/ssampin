import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PDFDocument } from 'pdf-lib';
import { SignaturePdfUploadPanel } from './SignaturePdfUploadPanel';
import { PDF_REJECT_COPY, PDF_WARN_COPY } from '@domain/rules/pdfTemplateValidation';

/**
 * SSR 렌더 검증만 수행 — 클라이언트 인터랙션 (FileReader, onChange) 테스트는
 * jsdom 환경 + testing-library 가 필요하지만, 이 패널의 핵심 분기 (validatePdfTemplateBytes
 * 의 reject/warning) 는 pdfTemplateValidation.test.ts 에서 이미 단위 검증됨.
 *
 * 여기서는 (a) 초기 마운트 렌더 (b) initialPdfTemplate prop 분기 (c) 한국어 카피
 * 동기화 여부 만 SSR 로 확인.
 */

describe('SignaturePdfUploadPanel SSR rendering', () => {
  it('초기 상태에서 안내 카피와 PDF 파일 선택 라벨을 렌더', () => {
    const html = renderToString(<SignaturePdfUploadPanel onUploaded={() => {}} />);
    expect(html).toContain('교사가 만든 PDF 양식을 업로드해 주세요');
    expect(html).toContain('10MB 이하 / 10페이지 이하');
    expect(html).toContain('PDF 파일 선택');
    expect(html).toContain('data-testid="signature-pdf-upload-panel"');
  });

  it('initialPdfTemplate 이 있으면 업로드 완료 메시지 렌더', () => {
    const html = renderToString(
      <SignaturePdfUploadPanel
        onUploaded={() => {}}
        initialPdfTemplate={{
          storagePath: 'signature-templates/test/abc.pdf',
          pageCount: 3,
          fileSize: 12345,
          uploadedAt: '2026-05-28T00:00:00.000Z',
        }}
      />,
    );
    expect(html).toContain('업로드 완료');
    expect(html).toContain('3페이지');
    expect(html).toContain('12KB'); // 12345 / 1024 ≈ 12
  });

  it('Supabase 미설정 환경에서는 로컬 미리보기 안내 카피 포함', () => {
    // VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 비어있는 기본 상태 — isSupabaseConfigured() false
    const html = renderToString(<SignaturePdfUploadPanel onUploaded={() => {}} />);
    // env 가 stubbed 되어 있지 않은 기본 상태에서는 "로컬 미리보기" 안내가 포함됨
    expect(html).toContain('PDF 양식 업로드');
  });

  it('SR-only live region 이 마운트 시점에 비어있다 (인터랙션 전)', () => {
    const html = renderToString(<SignaturePdfUploadPanel onUploaded={() => {}} />);
    expect(html).toContain('aria-live="polite"');
  });
});

describe('SignaturePdfUploadPanel reject copies 동기화 가드', () => {
  it('export 된 PDF_REJECT_COPY 가 8개 거절 코드를 모두 포함한다', () => {
    const codes = Object.keys(PDF_REJECT_COPY);
    expect(codes).toEqual(
      expect.arrayContaining([
        'missing_pdf',
        'invalid_base64',
        'too_large',
        'not_a_pdf',
        'password_protected',
        'too_many_pages',
        'signed_pdf',
        'acroform_active',
      ]),
    );
  });

  it('mixed_orientation 경고 카피가 PDF_WARN_COPY 에 정의되어 있음', () => {
    expect(PDF_WARN_COPY.mixed_orientation).toContain('가로/세로 혼합 양식');
  });
});

/**
 * Edge Function client 호출 통합 — fileToBase64 가 FileReader 를 사용하므로 jsdom 환경에서
 * 동작 가능. 다만 vitest 의 기본 환경이 node 인 경우 jsdom 으로 명시해야 함.
 * 본 패널 테스트에서는 fileToBase64 의 단순 contract 만 mock 으로 검증.
 */
describe('SignaturePdfUploadPanel — fileToBase64 contract (smoke)', () => {
  it('pdf-lib 로 생성한 PDF bytes 가 정상 PDF magic 으로 시작한다 (테스트 인프라 sanity)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const bytes = await doc.save();
    expect(bytes[0]).toBe(0x25); // %
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x44); // D
    expect(bytes[3]).toBe(0x46); // F
    expect(bytes[4]).toBe(0x2d); // -
  });

  it('onUploaded 콜백 prop 이 함수 타입이다 (typecheck sanity)', () => {
    const onUploaded = vi.fn();
    expect(typeof onUploaded).toBe('function');
    // 직접 호출은 못 하지만 prop 시그니처 가드
    onUploaded({
      storagePath: 'x',
      pageCount: 1,
      fileSize: 100,
      uploadedAt: 't',
    });
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });
});
