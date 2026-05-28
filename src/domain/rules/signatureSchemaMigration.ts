/**
 * Phase 2C v2 (PRD US-2C-02): v1 → v2 schema migration shim.
 *
 * 운영 publish 는 0건이지만, 로컬 (`localStorage` / 디스크 JSON) 에 저장된
 * 미공개 draft 는 4가지 legacy mapping target 타입 — `'docs-placeholder'` /
 * `'sheets-cell'` / `'sheets-named-range'` / `'generated-table-column'` — 을
 * 그대로 가질 수 있다. 이 모듈은 그런 v1 draft 를 v2 로 안전하게 coerce 한다.
 *
 * 변환 규칙:
 *   - `request.schemaVersion` 을 `1` → `2` 로 갱신
 *   - `request.mapping` 을 빈 객체 `{ textFields: [], signatureSlots: [] }` 로 coerce
 *     (legacy slot 의 target 좌표 정보는 PDF 오버레이 region 모델과 호환되지 않으므로
 *     모두 폐기. 교사가 새 PDF 양식을 업로드해서 region 을 다시 그려야 한다.)
 *   - `request.regions` 를 빈 배열로 초기화
 *   - `request.regionVersion` 을 0 으로 초기화
 *   - `request.participants` / `submissions` / `templateSource` / `access` / `scope` /
 *     `status` / 타임스탬프 / `resultFileUrl` 등 다른 필드는 그대로 보존
 */

import {
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type LegacyLocalSignatureRequestDraft,
  type LegacySignatureRequest,
  type LocalSignatureRequestDraft,
  type SignatureRequest,
} from '@domain/entities/SignatureRequest';

export interface LegacyMigrationNotice {
  readonly code: 'mapping-coerced';
  readonly severity: 'info';
  /**
   * UI 에 토스트로 표시할 한국어 메시지. PRD AC-1 에서 명시된 카피.
   */
  readonly message: string;
  /**
   * coerce 직전의 legacy mapping target 타입 분포. UI 가 사용자에게 "어떤 유형이
   * 폐기되었는지" 알릴 때 활용할 수 있도록 제공.
   */
  readonly droppedTargetTypes: readonly (
    | 'docs-placeholder'
    | 'sheets-cell'
    | 'sheets-named-range'
    | 'generated-table-column'
  )[];
}

const MIGRATION_TOAST_MESSAGE =
  '이전 양식의 영역 매핑이 PDF 오버레이로 교체됐어요. 새 양식을 다시 등록해 주세요.';

/**
 * v1 `SignatureRequest` 를 v2 로 변환한다. 매핑은 폐기되고 participants 는 보존된다.
 */
export function migrateV1ToV2(legacy: LegacySignatureRequest): SignatureRequest {
  return {
    schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
    id: legacy.id,
    title: legacy.title,
    description: legacy.description,
    templateKind: legacy.templateKind,
    templateSource: legacy.templateSource,
    mapping: { textFields: [], signatureSlots: [] },
    regions: [],
    regionVersion: 0,
    participants: legacy.participants,
    submissions: legacy.submissions,
    access: legacy.access,
    scope: legacy.scope,
    status: legacy.status,
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt,
    dueAt: legacy.dueAt,
    resultFileUrl: legacy.resultFileUrl,
  };
}

/**
 * `LocalSignatureRequestDraft` 컨테이너 단위로 v1 → v2 변환. participantAccessSecrets 는
 * 스키마 변동이 없으므로 그대로 보존.
 */
export function migrateLocalDraftV1ToV2(
  legacy: LegacyLocalSignatureRequestDraft,
): LocalSignatureRequestDraft {
  return {
    request: migrateV1ToV2(legacy.request),
    participantAccessSecrets: legacy.participantAccessSecrets,
  };
}

/**
 * 입력 draft 가 v1 인지 판정한다 (런타임 데이터에 대한 휴리스틱). 저장소 load 결과의
 * `schemaVersion` 만으로 판정한다 — JSON 직렬화 후 undefined / number / 'string' 등
 * 다양한 형태로 들어올 수 있으므로 `=== 1` 비교가 충분.
 */
export function isLegacyDraft(
  draft: LocalSignatureRequestDraft | LegacyLocalSignatureRequestDraft,
): draft is LegacyLocalSignatureRequestDraft {
  return draft.request.schemaVersion === 1;
}

/**
 * legacy draft 의 mapping 에서 사용된 target 타입을 수집. UI 토스트에 "어떤 유형이
 * 폐기됐는지" 표시할 때 사용.
 */
export function collectLegacyTargetTypes(
  legacy: LegacySignatureRequest,
): readonly LegacyMigrationNotice['droppedTargetTypes'][number][] {
  const seen = new Set<LegacyMigrationNotice['droppedTargetTypes'][number]>();
  for (const field of legacy.mapping.textFields) {
    seen.add(field.target.type);
  }
  for (const slot of legacy.mapping.signatureSlots) {
    seen.add(slot.target.type);
  }
  return Array.from(seen);
}

/**
 * legacy draft 1개에 대한 토스트 알림 payload 를 만든다. mapping 이 비어 있어 폐기할
 * 정보가 없는 경우에도 알림을 반환한다 (사용자가 PDF 업로드 단계를 의식하도록).
 */
export function buildLegacyMigrationNotice(legacy: LegacySignatureRequest): LegacyMigrationNotice {
  return {
    code: 'mapping-coerced',
    severity: 'info',
    message: MIGRATION_TOAST_MESSAGE,
    droppedTargetTypes: collectLegacyTargetTypes(legacy),
  };
}
