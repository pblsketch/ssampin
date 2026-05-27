import type {
  SignatureKind,
  SignatureMappingTarget,
  SignatureParticipant,
  SignatureParticipantProgress,
  SignatureParticipantStatus,
  SignatureRequest,
  SignatureRequestFirstReleaseScope,
  SignatureRequestProgress,
  SignatureSubmission,
  SignatureTemplateMapping,
} from '@domain/entities/SignatureRequest';

export type SignatureRequestValidationCode =
  | 'missingTitle'
  | 'missingTemplateUrl'
  | 'missingSignatureSlot'
  | 'missingParticipant'
  | 'emptyMappingTarget'
  | 'unknownRequiredSignatureKind'
  | 'missingUniqueLinkTokenHash'
  | 'missingPinHash'
  | 'duplicateParticipantName'
  | 'legalEffectNotAllowed'
  | 'automaticReminderNotAllowed'
  | 'strongIdentityNotAllowed';

export type SignatureRequestValidationSeverity = 'error' | 'warning';

export interface SignatureRequestValidationIssue {
  readonly code: SignatureRequestValidationCode;
  readonly severity: SignatureRequestValidationSeverity;
  readonly message: string;
  readonly target: 'title' | 'templateSource' | 'mapping' | 'participants' | 'access' | 'scope';
}

function issue(
  code: SignatureRequestValidationCode,
  target: SignatureRequestValidationIssue['target'],
  message: string,
  severity: SignatureRequestValidationSeverity = 'error',
): SignatureRequestValidationIssue {
  return { code, target, message, severity };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function isTargetEmpty(target: SignatureMappingTarget): boolean {
  if (isBlank(target.value)) return true;
  if (target.type === 'sheets-cell' || target.type === 'sheets-named-range') {
    return !target.sheetName || isBlank(target.sheetName);
  }
  return false;
}

function uniqueRequiredKinds(participant: SignatureParticipant): readonly SignatureKind[] {
  return [...new Set(participant.requiredSignatureKinds)];
}

function signatureKey(participantId: string, kind: SignatureKind): string {
  return `${participantId}:${kind}`;
}

export function validateSignatureRequest(
  request: SignatureRequest,
): readonly SignatureRequestValidationIssue[] {
  const issues: SignatureRequestValidationIssue[] = [];

  if (isBlank(request.title)) {
    issues.push(issue('missingTitle', 'title', '서명 요청 제목을 입력해야 합니다.'));
  }

  if (isBlank(request.templateSource.url)) {
    issues.push(
      issue(
        'missingTemplateUrl',
        'templateSource',
        '사용자가 만든 Google 양식 URL을 등록해야 합니다.',
      ),
    );
  }

  if (request.mapping.signatureSlots.length === 0) {
    issues.push(
      issue('missingSignatureSlot', 'mapping', '최소 1개 이상의 서명 위치를 매핑해야 합니다.'),
    );
  }

  if (request.participants.length === 0) {
    issues.push(issue('missingParticipant', 'participants', '서명 대상자 명단이 필요합니다.'));
  }

  issues.push(...validateMappingTargets(request.mapping));
  issues.push(...validateParticipantRequirements(request));
  issues.push(...validateFirstReleaseScope(request.scope));

  return issues;
}

export function validateMappingTargets(
  mapping: SignatureTemplateMapping,
): readonly SignatureRequestValidationIssue[] {
  const issues: SignatureRequestValidationIssue[] = [];
  for (const field of mapping.textFields) {
    if (isTargetEmpty(field.target)) {
      issues.push(
        issue(
          'emptyMappingTarget',
          'mapping',
          `${field.label} 필드의 템플릿 위치가 비어 있습니다.`,
        ),
      );
    }
  }
  for (const slot of mapping.signatureSlots) {
    if (isTargetEmpty(slot.target)) {
      issues.push(
        issue('emptyMappingTarget', 'mapping', `${slot.label} 서명 위치가 비어 있습니다.`),
      );
    }
  }
  return issues;
}

export function validateParticipantRequirements(
  request: SignatureRequest,
): readonly SignatureRequestValidationIssue[] {
  const issues: SignatureRequestValidationIssue[] = [];
  const mappedKinds = new Set(request.mapping.signatureSlots.map((slot) => slot.kind));
  const seenNames = new Set<string>();

  for (const participant of request.participants) {
    const normalizedName = participant.displayName.trim();
    if (normalizedName.length === 0) {
      issues.push(
        issue('missingParticipant', 'participants', '이름이 비어 있는 서명 대상자가 있습니다.'),
      );
    } else if (seenNames.has(normalizedName)) {
      issues.push(
        issue(
          'duplicateParticipantName',
          'participants',
          `"${normalizedName}" 대상자가 중복되어 있습니다. 동명이인이면 번호나 구분값을 추가하세요.`,
          'warning',
        ),
      );
    }
    seenNames.add(normalizedName);

    for (const kind of uniqueRequiredKinds(participant)) {
      if (!mappedKinds.has(kind)) {
        issues.push(
          issue(
            'unknownRequiredSignatureKind',
            'mapping',
            `${participant.displayName}에게 필요한 ${kind} 서명 위치가 템플릿에 없습니다.`,
          ),
        );
      }
    }

    if (request.access.uniqueLinksEnabled && !participant.uniqueLinkTokenHash) {
      issues.push(
        issue(
          'missingUniqueLinkTokenHash',
          'access',
          `${participant.displayName}의 개인별 고유 링크 토큰 해시가 필요합니다.`,
        ),
      );
    }

    if (request.access.pinEnabled && !participant.pinHash) {
      issues.push(
        issue('missingPinHash', 'access', `${participant.displayName}의 PIN 해시가 필요합니다.`),
      );
    }
  }

  return issues;
}

export function validateFirstReleaseScope(
  scope: SignatureRequestFirstReleaseScope,
): readonly SignatureRequestValidationIssue[] {
  const issues: SignatureRequestValidationIssue[] = [];
  if (scope.legalEffect !== 'none') {
    issues.push(
      issue('legalEffectNotAllowed', 'scope', '1차 버전은 법적 전자서명 효력을 보장하지 않습니다.'),
    );
  }
  if (scope.automaticReminders !== false) {
    issues.push(
      issue(
        'automaticReminderNotAllowed',
        'scope',
        '1차 버전에는 자동 리마인드를 포함하지 않습니다.',
      ),
    );
  }
  if (scope.strongIdentityRequired !== false) {
    issues.push(
      issue(
        'strongIdentityNotAllowed',
        'scope',
        '1차 버전에는 휴대폰 인증이나 Google 로그인 필수화를 포함하지 않습니다.',
      ),
    );
  }
  return issues;
}

export function getParticipantSignatureStatus(
  participant: SignatureParticipant,
  submissions: readonly SignatureSubmission[],
): SignatureParticipantProgress {
  const requiredKinds = uniqueRequiredKinds(participant);
  const submittedKeys = new Set(
    submissions
      .filter((submission) => submission.participantId === participant.id)
      .map((submission) => signatureKey(submission.participantId, submission.signatureKind)),
  );
  const submitted = requiredKinds.filter((kind) =>
    submittedKeys.has(signatureKey(participant.id, kind)),
  ).length;
  const required = requiredKinds.length;
  let status: SignatureParticipantStatus = 'unsigned';
  if (required > 0 && submitted >= required) {
    status = 'signed';
  } else if (submitted > 0) {
    status = 'partiallySigned';
  }
  return {
    participantId: participant.id,
    status,
    submitted,
    required,
  };
}

export function getSignatureRequestProgress(request: SignatureRequest): SignatureRequestProgress {
  const participantProgress = request.participants.map((participant) =>
    getParticipantSignatureStatus(participant, request.submissions),
  );
  const signedParticipants = participantProgress.filter((item) => item.status === 'signed').length;
  const partialParticipants = participantProgress.filter(
    (item) => item.status === 'partiallySigned',
  ).length;
  const unsignedParticipants = participantProgress.filter(
    (item) => item.status === 'unsigned',
  ).length;
  const submittedSignatures = participantProgress.reduce((sum, item) => sum + item.submitted, 0);
  const requiredSignatures = participantProgress.reduce((sum, item) => sum + item.required, 0);
  const percentage =
    requiredSignatures === 0 ? 0 : Math.round((submittedSignatures / requiredSignatures) * 100);

  return {
    signedParticipants,
    partialParticipants,
    unsignedParticipants,
    submittedSignatures,
    requiredSignatures,
    percentage,
  };
}
