import type {
  AgreementFinalItem,
  AgreementFinalScene,
  ClassroomAgreementClassContext,
  ClassroomAgreementSaveMode,
  ClassroomAgreementSavedSession,
  ClassroomAgreementScene,
  ClassroomAgreementSession,
} from '@domain/entities/ClassroomAgreement';
import { CLASSROOM_AGREEMENT_SCHEMA_VERSION } from '@domain/entities/ClassroomAgreement';

export interface SanitizeClassroomAgreementSaveOptions {
  readonly saveMode?: ClassroomAgreementSaveMode;
  readonly savedAt?: number;
}

export function sanitizeClassroomAgreementSessionForSave(
  session: ClassroomAgreementSession,
  options: SanitizeClassroomAgreementSaveOptions = {},
): ClassroomAgreementSavedSession {
  const saveMode = options.saveMode ?? session.settings.saveMode;
  const base: ClassroomAgreementSavedSession = {
    schemaVersion: session.schemaVersion,
    id: session.id,
    title: session.title,
    agreementType: session.agreementType,
    classContext: session.classContext,
    scenes: [...session.scenes],
    saveMode,
    finalItems: sanitizeFinalItemsForSave(session.finalItems),
    savedAt: options.savedAt ?? Date.now(),
  };

  if (saveMode === 'finalOnly') {
    return base;
  }

  return {
    ...base,
    process: {
      participants: [...session.participants],
      proposals: [...session.proposals],
      candidates: session.candidates.map((candidate) => ({
        ...candidate,
        sourceProposalIds: [...candidate.sourceProposalIds],
        authorLabels: [...candidate.authorLabels],
        validationIssues: [...candidate.validationIssues],
        refinementVotes: [...candidate.refinementVotes],
        priorityVotes: [...candidate.priorityVotes],
      })),
    },
  };
}

export function sanitizeFinalItemsForSave(
  finalItems: readonly AgreementFinalScene[],
): AgreementFinalScene[] {
  return finalItems.map((scene) => ({
    ...scene,
    items: scene.items.map((item) => ({
      ...item,
      authorLabels: item.showAuthors ? [...item.authorLabels] : [],
    })),
  }));
}

interface LegacyClassroomAgreementSavedSessionV1 {
  readonly schemaVersion?: number;
  readonly id?: string;
  readonly title?: string;
  readonly agreementType?: ClassroomAgreementSavedSession['agreementType'];
  readonly scene?: string;
  readonly scenes?: readonly ClassroomAgreementScene[];
  readonly classContext?: ClassroomAgreementClassContext;
  readonly saveMode?: ClassroomAgreementSaveMode;
  readonly finalItems?: readonly (AgreementFinalScene | AgreementFinalItem)[];
  readonly savedAt?: number;
  readonly process?: ClassroomAgreementSavedSession['process'];
}

const DEFAULT_AGREEMENT_TYPE: ClassroomAgreementSavedSession['agreementType'] = 'class-rule';
const DEFAULT_SAVE_MODE: ClassroomAgreementSaveMode = 'finalOnly';
const DEFAULT_CLASS_CONTEXT: ClassroomAgreementClassContext = {
  kind: 'manual',
  label: '우리 반',
};
const FALLBACK_SCENE_LABEL = '수업 시작';

function isFinalScene(
  value: AgreementFinalScene | AgreementFinalItem,
): value is AgreementFinalScene {
  return Array.isArray((value as AgreementFinalScene).items);
}

function migrateLegacyFinalItems(
  raw: readonly (AgreementFinalScene | AgreementFinalItem)[] | undefined,
  legacyScene: string | undefined,
): AgreementFinalScene[] {
  if (!raw || raw.length === 0) return [];

  if (raw.every(isFinalScene)) {
    return (raw as readonly AgreementFinalScene[]).map((scene) => ({
      sceneId: scene.sceneId,
      sceneLabel: scene.sceneLabel,
      items: scene.items.map((item) => ({
        ...item,
        sceneId: item.sceneId ?? scene.sceneId,
        authorLabels: [...(item.authorLabels ?? [])],
      })),
    }));
  }

  const items = raw.filter((value): value is AgreementFinalItem => !isFinalScene(value));
  const sceneLabel = legacyScene?.trim() ? legacyScene.trim() : FALLBACK_SCENE_LABEL;
  const sceneId = `legacy-scene-${sceneLabel}`;
  return [
    {
      sceneId,
      sceneLabel,
      items: items.map((item) => ({
        ...item,
        sceneId: item.sceneId ?? sceneId,
        authorLabels: [...(item.authorLabels ?? [])],
      })),
    },
  ];
}

function deriveScenesFromFinalItems(
  finalItems: readonly AgreementFinalScene[],
): ClassroomAgreementScene[] {
  if (finalItems.length === 0) {
    return [{ id: `legacy-scene-${FALLBACK_SCENE_LABEL}`, label: FALLBACK_SCENE_LABEL, order: 1 }];
  }
  return finalItems.map((scene, index) => ({
    id: scene.sceneId,
    label: scene.sceneLabel,
    order: index + 1,
  }));
}

export function normalizeStoredSavedSession(raw: unknown): ClassroomAgreementSavedSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const legacy = raw as LegacyClassroomAgreementSavedSessionV1;
  if (!legacy.id || !legacy.title) return null;

  const finalItems = migrateLegacyFinalItems(legacy.finalItems, legacy.scene);
  const scenes =
    Array.isArray(legacy.scenes) && legacy.scenes.length > 0
      ? legacy.scenes.map((scene) => ({ ...scene }))
      : deriveScenesFromFinalItems(finalItems);

  const normalized: ClassroomAgreementSavedSession = {
    schemaVersion: CLASSROOM_AGREEMENT_SCHEMA_VERSION,
    id: legacy.id,
    title: legacy.title,
    agreementType: legacy.agreementType ?? DEFAULT_AGREEMENT_TYPE,
    classContext: legacy.classContext ?? DEFAULT_CLASS_CONTEXT,
    scenes,
    saveMode: legacy.saveMode ?? DEFAULT_SAVE_MODE,
    finalItems,
    savedAt: typeof legacy.savedAt === 'number' ? legacy.savedAt : Date.now(),
    ...(legacy.process ? { process: legacy.process } : {}),
  };

  return normalized;
}

export function normalizeStoredSavedSessions(
  raw: readonly unknown[] | undefined,
): ClassroomAgreementSavedSession[] {
  if (!raw) return [];
  const result: ClassroomAgreementSavedSession[] = [];
  for (const item of raw) {
    const normalized = normalizeStoredSavedSession(item);
    if (normalized) result.push(normalized);
  }
  return result;
}
