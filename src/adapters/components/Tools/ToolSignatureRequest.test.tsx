import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  ToolSignatureRequest,
  buildMissingSignatureListText,
  buildDefaultSignatureSlots,
  buildDefaultTextFields,
  buildSignatureRequestDraftInput,
  buildSignatureRequestStatusView,
  getGoogleResultSyncStatusView,
  parseSignatureRosterLines,
} from './ToolSignatureRequest';
import {
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type SignatureRequest,
} from '@domain/entities/SignatureRequest';

describe('ToolSignatureRequest template workflow', () => {
  it('renders the Google template, mapping, roster, and draft-save workflow', () => {
    const html = renderToString(<ToolSignatureRequest onBack={() => {}} isFullscreen={false} />);

    expect(html).toContain('Google Docs/Sheets URL');
    expect(html).toContain('필드와 서명 이미지 위치 매핑');
    expect(html).toContain('명단과 접근 방식');
    expect(html).toContain('저장된 초안 · 제출 현황');
    expect(html).toContain('법적 전자서명 효력 보장 제외');
    expect(html).toContain('Sheets 셀 이미지 자동 삽입은 공개 URL 검증 시에만');
    expect(html).toContain('이 기기에 저장');
  });

  it('parses numbered students and staff from a teacher roster', () => {
    const participants = parseSignatureRosterLines('1 홍길동\n2 김민서\n김교사', 'absence-form');

    expect(participants).toHaveLength(3);
    expect(participants[0]).toMatchObject({
      displayName: '홍길동',
      role: 'student',
      studentNumber: 1,
      requiredSignatureKinds: ['student', 'parent'],
    });
    expect(participants[2]).toMatchObject({
      displayName: '김교사',
      role: 'teacher',
      requiredSignatureKinds: ['student', 'parent'],
    });
  });

  it('builds a draft input that preserves template URL, mappings, and local access tokens', () => {
    const textFields = buildDefaultTextFields('absence-form', 'google-docs');
    const signatureSlots = buildDefaultSignatureSlots('absence-form', 'google-docs');
    const input = buildSignatureRequestDraftInput({
      title: '  결석계 서명  ',
      description: '학부모 서명 필요',
      templateKind: 'absence-form',
      sourceType: 'google-docs',
      templateUrl: '  https://docs.google.com/document/d/template  ',
      textFields,
      signatureSlots,
      rosterText: '1 홍길동',
      uniqueLinksEnabled: true,
      pinEnabled: true,
      tokenFactory: (participant) => `token-${participant.id}`,
      pinFactory: () => '1234',
    });

    expect(input.title).toBe('  결석계 서명  ');
    expect(input.templateSource).toEqual({
      type: 'google-docs',
      url: 'https://docs.google.com/document/d/template',
    });
    expect(input.mapping?.signatureSlots.map((slot) => slot.kind)).toEqual(['student', 'parent']);
    expect(input.mapping?.signatureSlots[0]?.target).toMatchObject({
      type: 'docs-placeholder',
      value: '{{학생 서명}}',
    });
    expect(input.participants?.[0]).toMatchObject({
      displayName: '홍길동',
      requiredSignatureKinds: ['student', 'parent'],
    });
    expect(input.participantAccessSecrets).toEqual([
      {
        participantId: 'participant-1-홍길동',
        uniqueLinkToken: 'token-participant-1-홍길동',
        pin: '1234',
      },
    ]);
  });

  it('builds participant progress, missing-list text, and Google sync status for teacher follow-up', () => {
    const request: SignatureRequest = {
      schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
      id: 'signature-request-1',
      title: '5월 결석계 서명',
      templateKind: 'absence-form',
      templateSource: {
        type: 'google-sheets',
        url: 'https://docs.google.com/spreadsheets/d/template',
      },
      mapping: {
        textFields: [],
        signatureSlots: [
          {
            id: 'slot-student',
            kind: 'student',
            label: '학생 서명',
            target: { type: 'generated-table-column', value: '학생 서명' },
            required: true,
          },
          {
            id: 'slot-parent',
            kind: 'parent',
            label: '학부모 서명',
            target: { type: 'generated-table-column', value: '학부모 서명' },
            required: true,
          },
        ],
      },
      participants: [
        {
          id: 'participant-1',
          displayName: '홍길동',
          role: 'student',
          studentNumber: 1,
          requiredSignatureKinds: ['student', 'parent'],
        },
        {
          id: 'participant-2',
          displayName: '김민서',
          role: 'student',
          studentNumber: 2,
          requiredSignatureKinds: ['student', 'parent'],
        },
      ],
      submissions: [
        {
          id: 'submission-1',
          participantId: 'participant-1',
          signatureKind: 'student',
          signerName: '홍길동',
          submittedAt: '2026-05-27T09:00:00.000Z',
          image: {
            storagePath: 'signature-images/request/participant-1/student.png',
            mimeType: 'image/png',
            sizeBytes: 1200,
          },
        },
        {
          id: 'submission-2',
          participantId: 'participant-2',
          signatureKind: 'student',
          signerName: '김민서',
          submittedAt: '2026-05-27T09:05:00.000Z',
          image: {
            storagePath: 'signature-images/request/participant-2/student.png',
            mimeType: 'image/png',
            sizeBytes: 1100,
          },
        },
        {
          id: 'submission-3',
          participantId: 'participant-2',
          signatureKind: 'parent',
          signerName: '김보호',
          submittedAt: '2026-05-27T09:06:00.000Z',
          image: {
            storagePath: 'signature-images/request/participant-2/parent.png',
            mimeType: 'image/png',
            sizeBytes: 1300,
          },
        },
      ],
      access: {
        uniqueLinksEnabled: true,
        pinEnabled: false,
      },
      scope: {
        legalEffect: 'none',
        automaticReminders: false,
        strongIdentityRequired: false,
      },
      status: 'active',
      createdAt: '2026-05-27T08:00:00.000Z',
      updatedAt: '2026-05-27T09:06:00.000Z',
      resultFileUrl: 'https://docs.google.com/spreadsheets/d/result',
    };

    const statusView = buildSignatureRequestStatusView(request);
    expect(statusView).toMatchObject({
      totalParticipants: 2,
      signedParticipants: 1,
      partialParticipants: 1,
      unsignedParticipants: 0,
      submittedSignatures: 3,
      requiredSignatures: 4,
      percentage: 75,
    });
    expect(statusView.participantRows[0]).toMatchObject({
      displayName: '홍길동',
      statusLabel: '일부 서명',
      missingSignatureLabels: ['학부모 서명'],
    });

    expect(buildMissingSignatureListText(request)).toBe(
      '5월 결석계 서명 미서명 명단\n- 홍길동: 학부모 서명',
    );
    expect(getGoogleResultSyncStatusView(request)).toMatchObject({
      label: '부분 반영 필요',
      canOpenResultFile: true,
    });
    expect(
      getGoogleResultSyncStatusView({
        ...request,
        status: 'draft',
        resultFileUrl: undefined,
      }),
    ).toMatchObject({
      label: '초안 준비 중',
      canOpenResultFile: false,
    });
  });
});
