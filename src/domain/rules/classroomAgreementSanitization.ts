import type {
  AgreementFinalItem,
  ClassroomAgreementSaveMode,
  ClassroomAgreementSavedSession,
  ClassroomAgreementSession,
} from '@domain/entities/ClassroomAgreement';

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
    scene: session.scene,
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
  finalItems: readonly AgreementFinalItem[],
): AgreementFinalItem[] {
  return finalItems.map((item) => ({
    ...item,
    authorLabels: item.showAuthors ? [...item.authorLabels] : [],
  }));
}
