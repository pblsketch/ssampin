import { describe, expect, it } from 'vitest';
import type { SignatureRequest } from '@domain/entities/SignatureRequest';
import {
  SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
  SIGNATURE_REQUEST_SCHEMA_VERSION,
} from '@domain/entities/SignatureRequest';
import {
  getParticipantSignatureStatus,
  getSignatureRequestProgress,
  validateSignatureRequest,
} from './signatureRequestRules';

function createRequest(overrides: Partial<SignatureRequest> = {}): SignatureRequest {
  return {
    schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
    id: 'sig-1',
    title: '3월 연수 등록부',
    templateKind: 'training-register',
    templateSource: {
      type: 'google-sheets',
      url: 'https://docs.google.com/spreadsheets/d/example/edit',
      fileId: 'example',
      title: '연수 등록부',
    },
    mapping: {
      textFields: [
        {
          id: 'field-name',
          key: 'recipientName',
          label: '이름',
          required: true,
          target: { type: 'generated-table-column', value: '이름' },
        },
      ],
      signatureSlots: [
        {
          id: 'slot-recipient',
          kind: 'recipient',
          label: '대상자 서명',
          required: true,
          target: { type: 'generated-table-column', value: '서명' },
        },
      ],
    },
    participants: [
      {
        id: 'p1',
        displayName: '김교사',
        role: 'teacher',
        requiredSignatureKinds: ['recipient'],
      },
    ],
    submissions: [],
    access: {
      uniqueLinksEnabled: false,
      pinEnabled: false,
    },
    scope: SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
    status: 'draft',
    createdAt: '2026-05-27T08:00:00.000Z',
    updatedAt: '2026-05-27T08:00:00.000Z',
    ...overrides,
  };
}

describe('validateSignatureRequest', () => {
  it('사용자 제작 Google 양식과 서명 위치가 있으면 통과한다', () => {
    expect(validateSignatureRequest(createRequest())).toEqual([]);
  });

  it('고정 양식이 아니라 템플릿 URL과 서명 위치를 요구한다', () => {
    const issues = validateSignatureRequest(
      createRequest({
        title: ' ',
        templateSource: { type: 'google-sheets', url: ' ' },
        mapping: { textFields: [], signatureSlots: [] },
        participants: [],
      }),
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'missingTitle',
        'missingTemplateUrl',
        'missingSignatureSlot',
        'missingParticipant',
      ]),
    );
  });

  it('Sheets 셀 매핑은 시트 이름과 셀 주소가 모두 필요하다', () => {
    const issues = validateSignatureRequest(
      createRequest({
        mapping: {
          textFields: [],
          signatureSlots: [
            {
              id: 'slot-parent',
              kind: 'parent',
              label: '학부모 서명',
              required: true,
              target: { type: 'sheets-cell', value: ' ' },
            },
          ],
        },
        participants: [
          {
            id: 'p1',
            displayName: '김민수 보호자',
            role: 'parent',
            requiredSignatureKinds: ['parent'],
          },
        ],
      }),
    );

    expect(issues.map((issue) => issue.code)).toContain('emptyMappingTarget');
  });

  it('참여자에게 필요한 서명 종류가 템플릿에 없으면 오류를 낸다', () => {
    const issues = validateSignatureRequest(
      createRequest({
        participants: [
          {
            id: 'p1',
            displayName: '김민수',
            role: 'student',
            requiredSignatureKinds: ['student', 'parent'],
          },
        ],
      }),
    );

    expect(issues.map((issue) => issue.code)).toContain('unknownRequiredSignatureKind');
  });

  it('개인별 링크와 PIN 옵션을 켜면 각 대상자의 해시가 필요하다', () => {
    const issues = validateSignatureRequest(
      createRequest({
        access: {
          uniqueLinksEnabled: true,
          pinEnabled: true,
        },
      }),
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['missingUniqueLinkTokenHash', 'missingPinHash']),
    );
  });

  it('1차 범위 밖의 법적 효력/자동 리마인드/강한 인증 플래그를 거부한다', () => {
    const issues = validateSignatureRequest(
      createRequest({
        scope: {
          legalEffect: 'advanced' as 'none',
          automaticReminders: true as false,
          strongIdentityRequired: true as false,
        },
      }),
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'legalEffectNotAllowed',
        'automaticReminderNotAllowed',
        'strongIdentityNotAllowed',
      ]),
    );
  });
});

describe('signature progress rules', () => {
  it('학생과 학부모 서명이 모두 필요한 결석계의 부분 완료를 계산한다', () => {
    const request = createRequest({
      templateKind: 'absence-form',
      mapping: {
        textFields: [],
        signatureSlots: [
          {
            id: 'slot-student',
            kind: 'student',
            label: '학생 서명',
            required: true,
            target: { type: 'sheets-cell', sheetName: '결석계', value: 'B10' },
          },
          {
            id: 'slot-parent',
            kind: 'parent',
            label: '학부모 서명',
            required: true,
            target: { type: 'sheets-cell', sheetName: '결석계', value: 'B11' },
          },
        ],
      },
      participants: [
        {
          id: 'p1',
          displayName: '김민수',
          role: 'student',
          studentNumber: 3,
          requiredSignatureKinds: ['student', 'parent'],
        },
      ],
      submissions: [
        {
          id: 'sub-1',
          participantId: 'p1',
          signatureKind: 'student',
          signerName: '김민수',
          submittedAt: '2026-05-27T08:10:00.000Z',
          image: {
            storagePath: 'signature/sig-1/p1/student.png',
            mimeType: 'image/png',
            sizeBytes: 3200,
          },
        },
      ],
    });

    expect(getParticipantSignatureStatus(request.participants[0]!, request.submissions)).toEqual({
      participantId: 'p1',
      status: 'partiallySigned',
      submitted: 1,
      required: 2,
    });
    expect(getSignatureRequestProgress(request)).toMatchObject({
      signedParticipants: 0,
      partialParticipants: 1,
      unsignedParticipants: 0,
      submittedSignatures: 1,
      requiredSignatures: 2,
      percentage: 50,
    });
  });

  it('중복 제출은 같은 참여자와 서명 종류 기준으로 한 번만 계산한다', () => {
    const request = createRequest({
      submissions: [
        {
          id: 'sub-1',
          participantId: 'p1',
          signatureKind: 'recipient',
          signerName: '김교사',
          submittedAt: '2026-05-27T08:10:00.000Z',
          image: {
            storagePath: 'signature/sig-1/p1/recipient.png',
            mimeType: 'image/png',
            sizeBytes: 2000,
          },
        },
        {
          id: 'sub-2',
          participantId: 'p1',
          signatureKind: 'recipient',
          signerName: '김교사',
          submittedAt: '2026-05-27T08:11:00.000Z',
          image: {
            storagePath: 'signature/sig-1/p1/recipient-resubmit.png',
            mimeType: 'image/png',
            sizeBytes: 2100,
          },
        },
      ],
    });

    expect(getSignatureRequestProgress(request)).toMatchObject({
      signedParticipants: 1,
      submittedSignatures: 1,
      requiredSignatures: 1,
      percentage: 100,
    });
  });
});
