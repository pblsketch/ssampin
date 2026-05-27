import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_GOOGLE_SPIKE_SOURCES,
  buildSheetsImageFormula,
  checkSheetsImageFormulaFeasibility,
  extractGoogleFileId,
  planSignatureGoogleWriteback,
} from './SignatureGoogleTemplatePlanner';
import type { SignatureTemplateMapping } from '@domain/entities/SignatureRequest';

describe('SignatureGoogleTemplatePlanner', () => {
  it('extracts Docs and Sheets file ids from common Google URLs', () => {
    expect(extractGoogleFileId('https://docs.google.com/document/d/doc123/edit')).toBe('doc123');
    expect(extractGoogleFileId('https://docs.google.com/spreadsheets/d/sheet_123/edit')).toBe(
      'sheet_123',
    );
    expect(extractGoogleFileId('https://drive.google.com/open?id=file-123')).toBe('file-123');
    expect(extractGoogleFileId('not a url')).toBeNull();
  });

  it('allows Sheets IMAGE formula only for durable public non-Drive URLs', () => {
    expect(
      buildSheetsImageFormula({
        url: 'https://cdn.example.com/signature.png',
        durability: 'durable-public',
      }).formula,
    ).toBe('=IMAGE("https://cdn.example.com/signature.png",4,60,180)');

    expect(
      checkSheetsImageFormulaFeasibility({
        url: 'https://drive.google.com/file/d/abc/view',
        durability: 'durable-public',
      }),
    ).toMatchObject({ feasible: false });

    expect(
      checkSheetsImageFormulaFeasibility({
        url: 'https://example.supabase.co/storage/v1/object/sign/signature.png?token=short',
        durability: 'signed-short-lived',
      }),
    ).toMatchObject({ feasible: false });
  });

  it('plans Docs inline image insertion with signed URL and Sheets warning for the same URL', () => {
    const mapping: SignatureTemplateMapping = {
      textFields: [
        {
          id: 'name',
          key: 'recipientName',
          label: '이름',
          required: true,
          target: { type: 'docs-placeholder', value: '{{이름}}' },
        },
      ],
      signatureSlots: [
        {
          id: 'slot',
          kind: 'recipient',
          label: '서명',
          required: true,
          target: { type: 'docs-placeholder', value: '{{서명}}' },
        },
      ],
    };
    const docsPlan = planSignatureGoogleWriteback({
      templateSource: {
        type: 'google-docs',
        url: 'https://docs.google.com/document/d/doc123/edit',
      },
      mapping,
      submissions: [
        {
          id: 'sub-1',
          participantId: 'p1',
          signatureKind: 'recipient',
          signerName: '김교사',
          submittedAt: '2026-05-27T00:00:00.000Z',
          imageUrl: {
            url: 'https://example.supabase.co/storage/v1/object/sign/signature.png?token=short',
            durability: 'signed-short-lived',
          },
        },
      ],
    });

    expect(docsPlan.resultCopy).toMatchObject({ api: 'drive.files.copy', feasible: true });
    expect(docsPlan.docsBatchRequests.map((request) => request.requestType)).toEqual([
      'replaceAllText',
      'insertInlineImage',
    ]);

    const sheetsPlan = planSignatureGoogleWriteback({
      templateSource: {
        type: 'google-sheets',
        url: 'https://docs.google.com/spreadsheets/d/sheet123/edit',
      },
      mapping: {
        textFields: [],
        signatureSlots: [
          {
            ...mapping.signatureSlots[0]!,
            target: { type: 'sheets-cell', sheetName: '응답', value: 'D2' },
          },
        ],
      },
      submissions: docsPlan.docsBatchRequests[1]?.imageUrl
        ? [
            {
              id: 'sub-1',
              participantId: 'p1',
              signatureKind: 'recipient',
              signerName: '김교사',
              submittedAt: '2026-05-27T00:00:00.000Z',
              imageUrl: {
                url: docsPlan.docsBatchRequests[1].imageUrl,
                durability: 'signed-short-lived',
              },
            },
          ]
        : [],
    });

    expect(sheetsPlan.sheetsValueUpdates).toEqual([]);
    expect(sheetsPlan.warnings.join('\n')).toContain('signed URL');
  });

  it('keeps primary-source links next to the spike planner', () => {
    expect(SIGNATURE_GOOGLE_SPIKE_SOURCES).toContain(
      'https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/request',
    );
    expect(SIGNATURE_GOOGLE_SPIKE_SOURCES).toContain(
      'https://support.google.com/docs/answer/3093333',
    );
  });
});
