import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type SignatureRequest,
} from '@domain/entities/SignatureRequest';
import { validateFirstReleaseScope } from '@domain/rules/signatureRequestRules';
import {
  ToolSignatureRequest,
  buildMissingSignatureListText,
  buildSignatureRequestDraftInput,
} from '@adapters/components/Tools/ToolSignatureRequest';
import { isSignaturePublicRoute } from './SignatureRequestPublicApp';
import { SIGNATURE_LEGAL_DISCLAIMER } from './signatureLegalCopy';

describe('signature request regression gates', () => {
  it('keeps the public signing route narrow and separate from teacher tool navigation', () => {
    expect(isSignaturePublicRoute('/sign/request-1', '')).toBe(true);
    expect(isSignaturePublicRoute('/', '?tool=signature-request&id=request-1')).toBe(true);
    expect(isSignaturePublicRoute('/', '?sign=request-1')).toBe(true);

    expect(isSignaturePublicRoute('/tools', '')).toBe(false);
    expect(isSignaturePublicRoute('/', '?page=tool-signature-request')).toBe(false);
    expect(isSignaturePublicRoute('/student', '?assignmentId=assignment-1')).toBe(false);

    const appSource = readFileSync('src/App.tsx', 'utf8');
    expect(appSource).toContain("page === 'tool-signature-request'");
    expect(appSource).toContain('if (isSignaturePublicMode())');
    expect(appSource).toContain('<SignatureRequestPublicApp');
  });

  it('preserves optional per-person link and PIN behavior without forcing secrets', () => {
    const base = {
      title: '연수 등록부 서명',
      templateKind: 'training-register' as const,
      sourceType: 'google-sheets' as const,
      templateUrl: 'https://docs.google.com/spreadsheets/d/template',
      textFields: [],
      signatureSlots: [],
      rosterText: '김교사\n이교사',
    };

    const openAccess = buildSignatureRequestDraftInput({
      ...base,
      uniqueLinksEnabled: false,
      pinEnabled: false,
    });
    expect(openAccess.access).toEqual({
      uniqueLinksEnabled: false,
      pinEnabled: false,
    });
    expect(openAccess.participantAccessSecrets).toEqual([]);

    const protectedAccess = buildSignatureRequestDraftInput({
      ...base,
      uniqueLinksEnabled: true,
      pinEnabled: true,
      tokenFactory: (_participant, index) => `token-${index + 1}`,
      pinFactory: (_participant, index) => `10000${index + 1}`,
    });
    expect(protectedAccess.participantAccessSecrets).toEqual([
      {
        participantId: 'participant-1-김교사',
        uniqueLinkToken: 'token-1',
        pin: '100001',
      },
      {
        participantId: 'participant-2-이교사',
        uniqueLinkToken: 'token-2',
        pin: '100002',
      },
    ]);
  });

  it('blocks legal-effect scope creep and renders only first-release caveats', () => {
    expect(validateFirstReleaseScope(SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE)).toEqual([]);
    expect(
      validateFirstReleaseScope({
        legalEffect: 'advanced',
        automaticReminders: true,
        strongIdentityRequired: true,
      } as unknown as typeof SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'legalEffectNotAllowed' }),
        expect.objectContaining({ code: 'automaticReminderNotAllowed' }),
        expect.objectContaining({ code: 'strongIdentityNotAllowed' }),
      ]),
    );

    const html = renderToString(
      createElement(ToolSignatureRequest, { onBack: () => {}, isFullscreen: false }),
    );
    expect(html).toContain('법적 전자서명 효력 보장 제외');
    expect(html).toContain('전자 확인 기록으로 충분한 학교 업무');
    expect(html).not.toContain('법적 효력을 보장합니다');
    expect(html).not.toContain('법적 전자서명으로 인정됩니다');
  });

  it('keeps the teacher UI in Korean and avoids hard-coded hex styling in the new tool', () => {
    const source = readFileSync('src/adapters/components/Tools/ToolSignatureRequest.tsx', 'utf8');
    const html = renderToString(
      createElement(ToolSignatureRequest, { onBack: () => {}, isFullscreen: false }),
    );

    expect(html).toContain('서명받기');
    expect(html).toContain('Google 양식 등록');
    expect(html).toContain('저장된 초안 · 제출 현황');
    expect(html).toContain('미서명/일부 서명/완료');
    expect(html).toContain('Google 결과 반영 상태');
    expect(html).toContain('Sheets 셀 이미지 자동 삽입은 공개 URL 검증 시에만');
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('Phase 2C US-2C-14: legal disclaimer 가 3 위치에서 동일 모듈을 import 한다', () => {
    // 1) 단일 진실 원천 카피 확인
    expect(SIGNATURE_LEGAL_DISCLAIMER).toBe(
      '이 서명은 행정용 의사 확인용입니다. 자필 서명과 동등한 법적 효력은 보장되지 않습니다.',
    );

    // 2) 3 위치 소스 파일이 signatureLegalCopy 를 import 한다
    const pdfUploadSource = readFileSync('src/signature/SignaturePdfUploadPanel.tsx', 'utf8');
    const consentTableSource = readFileSync('src/signature/PrivacyConsentTable.tsx', 'utf8');
    const toolSignatureSource = readFileSync(
      'src/adapters/components/Tools/ToolSignatureRequest.tsx',
      'utf8',
    );

    for (const [name, source] of [
      ['SignaturePdfUploadPanel (교사 발급 화면)', pdfUploadSource],
      ['PrivacyConsentTable (학생 동의 표 헤더)', consentTableSource],
      ['ToolSignatureRequest (결과 PDF 버튼 툴팁)', toolSignatureSource],
    ] as const) {
      expect(source, name).toMatch(/SIGNATURE_LEGAL_DISCLAIMER/);
      expect(source, name).toMatch(/signatureLegalCopy/);
    }

    // 3) 카피 문장 자체는 다른 곳에 하드코딩되지 않는다 (단일 정의)
    const hardcodedCopyRegex =
      /이 서명은 행정용 의사 확인용입니다\. 자필 서명과 동등한 법적 효력은 보장되지 않습니다\./;
    const legalCopySource = readFileSync('src/signature/signatureLegalCopy.ts', 'utf8');
    expect(legalCopySource).toMatch(hardcodedCopyRegex);
    // 정의 파일 외에는 import 만 사용 — 본문에 같은 문자열이 직접 박혀 있으면 회귀
    expect(pdfUploadSource).not.toMatch(hardcodedCopyRegex);
    expect(consentTableSource).not.toMatch(hardcodedCopyRegex);
    expect(toolSignatureSource).not.toMatch(hardcodedCopyRegex);
  });

  it('keeps missing-list copy text focused on unsigned and partially signed participants', () => {
    const request: SignatureRequest = {
      schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
      id: 'request-1',
      title: '결석계 서명',
      templateKind: 'absence-form',
      templateSource: {
        type: 'google-docs',
        url: 'https://docs.google.com/document/d/template',
      },
      mapping: {
        textFields: [],
        signatureSlots: [],
      },
      regions: [],
      regionVersion: 0,
      participants: [
        {
          id: 'participant-1',
          displayName: '홍길동',
          role: 'student',
          requiredSignatureKinds: ['student', 'parent'],
        },
        {
          id: 'participant-2',
          displayName: '김민서',
          role: 'student',
          requiredSignatureKinds: ['student', 'parent'],
        },
      ],
      submissions: [
        {
          id: 'submission-1',
          participantId: 'participant-2',
          signatureKind: 'student',
          signerName: '김민서',
          submittedAt: '2026-05-27T09:00:00.000Z',
          image: {
            storagePath: 'signature-images/request-1/participant-2/student.png',
            mimeType: 'image/png',
            sizeBytes: 900,
          },
        },
        {
          id: 'submission-2',
          participantId: 'participant-2',
          signatureKind: 'parent',
          signerName: '김보호',
          submittedAt: '2026-05-27T09:01:00.000Z',
          image: {
            storagePath: 'signature-images/request-1/participant-2/parent.png',
            mimeType: 'image/png',
            sizeBytes: 950,
          },
        },
      ],
      access: {
        uniqueLinksEnabled: true,
        pinEnabled: true,
      },
      scope: SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
      status: 'active',
      createdAt: '2026-05-27T08:00:00.000Z',
      updatedAt: '2026-05-27T09:01:00.000Z',
    };

    expect(buildMissingSignatureListText(request)).toBe(
      '결석계 서명 미서명 명단\n- 홍길동: 학생 서명, 학부모 서명',
    );
  });
});
