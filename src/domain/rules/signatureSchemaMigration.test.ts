import { describe, expect, it } from 'vitest';
import {
  SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
  type LegacyLocalSignatureRequestDraft,
  type LegacySignatureRequest,
  type LegacySignatureMappingTargetType,
} from '@domain/entities/SignatureRequest';
import {
  buildLegacyMigrationNotice,
  collectLegacyTargetTypes,
  isLegacyDraft,
  migrateLocalDraftV1ToV2,
  migrateV1ToV2,
} from './signatureSchemaMigration';

function makeLegacyRequest(overrides: {
  targetType: LegacySignatureMappingTargetType | null;
  id?: string;
}): LegacySignatureRequest {
  const baseMappingTarget = overrides.targetType
    ? {
        textFields: [
          {
            id: 'field-1',
            key: 'recipientName' as const,
            label: '이름',
            required: true,
            target: {
              type: overrides.targetType,
              value: overrides.targetType === 'docs-placeholder' ? '{{이름}}' : '이름',
            },
          },
        ],
        signatureSlots: [
          {
            id: 'slot-1',
            kind: 'recipient' as const,
            label: '서명',
            required: true,
            target: {
              type: overrides.targetType,
              value: overrides.targetType === 'docs-placeholder' ? '{{서명}}' : '서명',
            },
          },
        ],
      }
    : { textFields: [], signatureSlots: [] };

  return {
    schemaVersion: 1,
    id: overrides.id ?? 'legacy-req-1',
    title: '이전 양식 (v1)',
    description: '학부모 서명 필요',
    templateKind: 'training-register',
    templateSource: {
      type: 'google-sheets',
      url: 'https://docs.google.com/spreadsheets/d/legacy',
    },
    mapping: baseMappingTarget,
    participants: [
      {
        id: 'p1',
        displayName: '김교사',
        role: 'teacher',
        studentNumber: 1,
        className: '아산중학교',
        requiredSignatureKinds: ['recipient'],
      },
      {
        id: 'p2',
        displayName: '이환경',
        role: 'teacher',
        studentNumber: 2,
        requiredSignatureKinds: ['recipient'],
      },
    ],
    submissions: [],
    access: { uniqueLinksEnabled: true, pinEnabled: false },
    scope: SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE,
    status: 'draft',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    dueAt: '2026-05-30T00:00:00.000Z',
    resultFileUrl: 'https://docs.google.com/spreadsheets/d/legacy/edit',
  };
}

describe('migrateV1ToV2 — 4가지 legacy target 타입 cascade', () => {
  it('docs-placeholder v1 draft 를 v2 로 coerce 한다 (mapping 폐기 + participants 보존)', () => {
    const legacy = makeLegacyRequest({ targetType: 'docs-placeholder' });
    const migrated = migrateV1ToV2(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.mapping).toEqual({ textFields: [], signatureSlots: [] });
    expect(migrated.regions).toEqual([]);
    expect(migrated.regionVersion).toBe(0);
    expect(migrated.participants).toEqual(legacy.participants);
    expect(migrated.resultFileUrl).toBe(legacy.resultFileUrl);
    expect(migrated.dueAt).toBe(legacy.dueAt);
  });

  it('sheets-cell v1 draft 를 v2 로 coerce 한다', () => {
    const legacy = makeLegacyRequest({ targetType: 'sheets-cell' });
    const migrated = migrateV1ToV2(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.mapping.signatureSlots).toHaveLength(0);
    expect(migrated.mapping.textFields).toHaveLength(0);
    expect(migrated.participants).toHaveLength(2);
  });

  it('sheets-named-range v1 draft 를 v2 로 coerce 한다', () => {
    const legacy = makeLegacyRequest({ targetType: 'sheets-named-range' });
    const migrated = migrateV1ToV2(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.mapping).toEqual({ textFields: [], signatureSlots: [] });
    expect(migrated.participants[0]?.displayName).toBe('김교사');
  });

  it('generated-table-column v1 draft 를 v2 로 coerce 한다', () => {
    const legacy = makeLegacyRequest({ targetType: 'generated-table-column' });
    const migrated = migrateV1ToV2(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.mapping.signatureSlots).toEqual([]);
    expect(migrated.regions).toEqual([]);
    expect(migrated.regionVersion).toBe(0);
  });

  it('이미 mapping 이 비어 있는 v1 draft 도 안전하게 v2 로 변환된다', () => {
    const legacy = makeLegacyRequest({ targetType: null });
    const migrated = migrateV1ToV2(legacy);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.mapping).toEqual({ textFields: [], signatureSlots: [] });
    expect(migrated.participants).toHaveLength(2);
  });
});

describe('LegacyMigrationNotice 빌더', () => {
  it('drop 된 target 타입 목록을 수집한다', () => {
    const legacy = makeLegacyRequest({ targetType: 'sheets-cell' });
    expect(collectLegacyTargetTypes(legacy)).toEqual(['sheets-cell']);
  });

  it('mapping 이 비어 있으면 drop 된 target 타입이 없다', () => {
    const legacy = makeLegacyRequest({ targetType: null });
    expect(collectLegacyTargetTypes(legacy)).toEqual([]);
  });

  it('UI 토스트에 표시할 한국어 메시지를 만든다', () => {
    const legacy = makeLegacyRequest({ targetType: 'docs-placeholder' });
    const notice = buildLegacyMigrationNotice(legacy);

    expect(notice.code).toBe('mapping-coerced');
    expect(notice.severity).toBe('info');
    expect(notice.message).toBe(
      '이전 양식의 영역 매핑이 PDF 오버레이로 교체됐어요. 새 양식을 다시 등록해 주세요.',
    );
    expect(notice.droppedTargetTypes).toEqual(['docs-placeholder']);
  });
});

describe('isLegacyDraft 판정', () => {
  it('schemaVersion === 1 draft 를 legacy 로 판정한다', () => {
    const legacy: LegacyLocalSignatureRequestDraft = {
      request: makeLegacyRequest({ targetType: 'generated-table-column' }),
      participantAccessSecrets: [],
    };
    expect(isLegacyDraft(legacy)).toBe(true);
  });

  it('schemaVersion === 2 draft 는 legacy 가 아니다', () => {
    const legacy = makeLegacyRequest({ targetType: 'generated-table-column' });
    const migrated = migrateLocalDraftV1ToV2({
      request: legacy,
      participantAccessSecrets: [],
    });
    expect(isLegacyDraft(migrated)).toBe(false);
  });
});

describe('migrateLocalDraftV1ToV2 컨테이너 변환', () => {
  it('participantAccessSecrets 는 그대로 보존된다', () => {
    const legacy: LegacyLocalSignatureRequestDraft = {
      request: makeLegacyRequest({ targetType: 'sheets-cell' }),
      participantAccessSecrets: [
        { participantId: 'p1', uniqueLinkToken: 'tok-a', pin: '1234' },
        { participantId: 'p2', uniqueLinkToken: 'tok-b' },
      ],
    };
    const migrated = migrateLocalDraftV1ToV2(legacy);

    expect(migrated.request.schemaVersion).toBe(2);
    expect(migrated.participantAccessSecrets).toEqual([
      { participantId: 'p1', uniqueLinkToken: 'tok-a', pin: '1234' },
      { participantId: 'p2', uniqueLinkToken: 'tok-b' },
    ]);
  });
});
