import { describe, expect, it } from 'vitest';
import {
  isLikelyPresentationId,
  parseGoogleSlidesUrl,
} from './googleSlidesUrl';

const VALID_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_abcdefg';

describe('parseGoogleSlidesUrl', () => {
  it('표준 edit URL 통과', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/${VALID_ID}/edit`,
    );
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  it('edit#slide=id.X URL 통과', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/${VALID_ID}/edit#slide=id.g123`,
    );
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  it('?usp=sharing 쿼리 무시', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/${VALID_ID}/edit?usp=sharing`,
    );
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  it('preview URL 통과', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/${VALID_ID}/preview`,
    );
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  it('trailing slash 변형 통과', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/${VALID_ID}/`,
    );
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  it('trailing /edit 없는 형태 통과', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/${VALID_ID}`,
    );
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  it('presentationId만 직접 입력', () => {
    const r = parseGoogleSlidesUrl(VALID_ID);
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  it('앞뒤 공백 trim', () => {
    const r = parseGoogleSlidesUrl(`  ${VALID_ID}  `);
    expect(r).toEqual({ ok: true, presentationId: VALID_ID });
  });

  // ─────────────────────────────────────────────────────────────
  // 거부 케이스
  // ─────────────────────────────────────────────────────────────

  it('빈 입력 거부', () => {
    expect(parseGoogleSlidesUrl('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseGoogleSlidesUrl('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('docs.google.com 외 호스트 거부', () => {
    const r = parseGoogleSlidesUrl(
      `https://evil.example.com/presentation/d/${VALID_ID}/edit`,
    );
    expect(r).toEqual({ ok: false, reason: 'wrong-host' });
  });

  it('Google Drive URL은 거부 (presentation 경로 아님)', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/document/d/${VALID_ID}/edit`,
    );
    expect(r).toEqual({ ok: false, reason: 'wrong-path' });
  });

  it('id가 짧으면 거부 (짧은 도메인 ID 차단)', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/short/edit`,
    );
    expect(r).toEqual({ ok: false, reason: 'invalid-id' });
  });

  it('URL 형식 깨짐 거부', () => {
    expect(parseGoogleSlidesUrl('not a url at all')).toEqual({
      ok: false,
      reason: 'invalid-url',
    });
  });

  it('한글이 섞인 ID 거부', () => {
    const r = parseGoogleSlidesUrl(
      `https://docs.google.com/presentation/d/한글ID12345678901234567890/edit`,
    );
    expect(r).toEqual({ ok: false, reason: 'invalid-id' });
  });

  it('호스트 대소문자 무관 (정규화)', () => {
    const r = parseGoogleSlidesUrl(
      `https://DOCS.Google.COM/presentation/d/${VALID_ID}/edit`,
    );
    expect(r.ok).toBe(true);
  });
});

describe('isLikelyPresentationId', () => {
  it('정상 ID true', () => {
    expect(isLikelyPresentationId(VALID_ID)).toBe(true);
  });

  it('너무 짧은 ID false', () => {
    expect(isLikelyPresentationId('short')).toBe(false);
  });

  it('한글 포함 false', () => {
    expect(isLikelyPresentationId('한글한글한글한글한글한글한글한글한글한글')).toBe(false);
  });

  it('URL 입력은 false', () => {
    expect(
      isLikelyPresentationId('https://docs.google.com/presentation/d/' + VALID_ID),
    ).toBe(false);
  });
});
