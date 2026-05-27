import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { disabledSignaturePublicClient } from './SignatureRequestPublicClient';
import {
  SignatureRequestPublicApp,
  createSignaturePublicSubmissionDraft,
  getSignaturePublicRouteFromLocation,
  isSignaturePublicRoute,
} from './SignatureRequestPublicApp';

describe('SignatureRequestPublicApp route and skeleton', () => {
  it('detects /sign/[id] and query-based signature request routes', () => {
    expect(isSignaturePublicRoute('/sign/request-1', '')).toBe(true);
    expect(isSignaturePublicRoute('/student.html', '?tool=signature-request&id=request-1')).toBe(
      true,
    );
    expect(isSignaturePublicRoute('/student.html', '?sign=request-1')).toBe(true);
    expect(isSignaturePublicRoute('/student.html', '?tool=survey')).toBe(false);
  });

  it('extracts request id and token from the public URL', () => {
    expect(
      getSignaturePublicRouteFromLocation({
        pathname: '/sign/request%201',
        search: '?token=abc123',
      }),
    ).toEqual({
      requestId: 'request 1',
      token: 'abc123',
    });
  });

  it('keeps production writes disabled until Supabase contracts are added', async () => {
    await expect(
      disabledSignaturePublicClient.loadRequest({ requestId: 'request-1' }),
    ).resolves.toMatchObject({
      status: 'not-configured',
    });
    await expect(
      disabledSignaturePublicClient.submitSignature(
        createSignaturePublicSubmissionDraft({
          requestId: 'request-1',
          participantId: 'participant-1',
          signatureKind: 'student',
          signerName: '홍길동',
          signatureImageDataUrl: 'data:image/png;base64,test',
          now: () => '2026-05-27T00:00:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({
      status: 'not-configured',
    });
  });

  it('creates a typed submission draft with trimmed signer name and timestamp', () => {
    expect(
      createSignaturePublicSubmissionDraft({
        requestId: 'request-1',
        token: 'token-1',
        pin: '1234',
        signatureKind: 'parent',
        signerName: '  학부모  ',
        signatureImageDataUrl: 'data:image/webp;base64,signature',
        now: () => '2026-05-27T00:00:00.000Z',
      }),
    ).toEqual({
      requestId: 'request-1',
      participantId: undefined,
      token: 'token-1',
      pin: '1234',
      signatureKind: 'parent',
      signerName: '학부모',
      signatureImageDataUrl: 'data:image/webp;base64,signature',
      submittedAt: '2026-05-27T00:00:00.000Z',
    });
  });

  it('renders participant selection, PIN, signature capture, and submit states', () => {
    const html = renderToString(<SignatureRequestPublicApp route={{ requestId: 'request-1' }} />);

    expect(html).toContain('서명 대상자 선택');
    expect(html).toContain('PIN');
    expect(html).toContain('서명 이미지 만들기');
    expect(html).toContain('서명 제출');
  });

  it('registers the public signature app before normal teacher app modes', () => {
    const appSource = readFileSync('src/App.tsx', 'utf8');

    expect(appSource).toContain('isSignaturePublicMode');
    expect(appSource).toContain('SignatureRequestPublicApp');
    expect(appSource.indexOf('if (isSignaturePublicMode())')).toBeLessThan(
      appSource.indexOf('if (isStickerPickerMode())'),
    );
  });
});
