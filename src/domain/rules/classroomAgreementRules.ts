import type { AgreementValidationIssue } from '@domain/entities/ClassroomAgreement';

export const CLASSROOM_AGREEMENT_MAX_IF_LENGTH = 120;
export const CLASSROOM_AGREEMENT_MAX_THEN_LENGTH = 160;

const ABSTRACT_PHRASES = [
  '잘하기',
  '잘 한다',
  '잘한다',
  '열심히',
  '배려하기',
  '배려한다',
  '존중하기',
  '존중한다',
  '협력하기',
  '협력한다',
  '조심하기',
  '조심한다',
  '착하게',
  '바르게',
] as const;

const NEGATIVE_PATTERNS = [
  /하지\s*않는다/,
  /하지\s*말자/,
  /지\s*않는다/,
  /안\s*한다/,
  /않기/,
  /금지/,
  /말자/,
] as const;

const VAGUE_IF_PATTERNS = [
  /^만약\s*문제가\s*생기면$/,
  /^문제가\s*생기면$/,
  /^만약\s*수업\s*중이면$/,
  /^수업\s*중이면$/,
  /^상황이\s*생기면$/,
  /^그럴\s*때$/,
] as const;

const LONG_TERM_OUTCOME_PATTERNS = [
  /완성한다/,
  /해결한다/,
  /성공한다/,
  /잘한다/,
  /좋은\s*결과/,
] as const;

const OBSERVABLE_ACTION_PATTERNS = [
  /앉/,
  /펼친/,
  /꺼낸/,
  /손을\s*든/,
  /손들/,
  /메모/,
  /쓴다/,
  /말한다/,
  /읽는다/,
  /듣는다/,
  /정리/,
  /제출/,
  /이동/,
  /확인/,
  /다시\s*말/,
  /기다린/,
  /나눈/,
] as const;

const ACTION_CONNECTOR_PATTERNS = [/그리고/g, /또/g, /그다음/g, /다음/g, /후에/g, /뒤에/g] as const;

export interface AgreementDraftInput {
  readonly ifText: string;
  readonly thenText: string;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function createIssue(
  issue: Omit<AgreementValidationIssue, 'severity'> & {
    readonly severity?: AgreementValidationIssue['severity'];
  },
): AgreementValidationIssue {
  return {
    severity: issue.severity ?? 'warning',
    ...issue,
  };
}

function findAbstractPhrase(text: string): string | undefined {
  return ABSTRACT_PHRASES.find((phrase) => text.includes(phrase));
}

function hasNegativeOnlyPattern(text: string): boolean {
  return NEGATIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function isVagueIfText(text: string): boolean {
  if (text.length < 6) return true;
  return VAGUE_IF_PATTERNS.some((pattern) => pattern.test(text));
}

function isVagueThenText(text: string): boolean {
  if (text.length < 8) return true;
  const stripped = text.replace(/^우리는\s*/, '');
  return ABSTRACT_PHRASES.some(
    (phrase) => stripped === phrase || stripped === `${phrase}.` || stripped.includes(phrase),
  );
}

function hasLongTermOutcome(text: string): boolean {
  return LONG_TERM_OUTCOME_PATTERNS.some((pattern) => pattern.test(text));
}

function hasObservableAction(text: string): boolean {
  return OBSERVABLE_ACTION_PATTERNS.some((pattern) => pattern.test(text));
}

function countActionConnectors(text: string): number {
  const commaCount = (text.match(/[,，]/g) ?? []).length;
  const connectorCount = ACTION_CONNECTOR_PATTERNS.reduce((sum, pattern) => {
    return sum + (text.match(pattern) ?? []).length;
  }, 0);
  return commaCount + connectorCount;
}

export function formatAgreementSentence(input: AgreementDraftInput): string {
  const ifText = normalizeText(input.ifText).replace(/[.。]+$/, '');
  const thenText = normalizeText(input.thenText).replace(/[.。]+$/, '');
  return `${ifText}, ${thenText}.`;
}

export function validateAgreementDraft(
  input: AgreementDraftInput,
): readonly AgreementValidationIssue[] {
  const ifText = normalizeText(input.ifText);
  const thenText = normalizeText(input.thenText);
  const issues: AgreementValidationIssue[] = [];

  const abstractIf = findAbstractPhrase(ifText);
  if (abstractIf) {
    issues.push(
      createIssue({
        code: 'abstractPhrase',
        target: 'ifText',
        matchedText: abstractIf,
        message: `"${abstractIf}"처럼 넓은 표현보다 눈에 보이는 장면을 적어보세요.`,
      }),
    );
  }

  const abstractThen = findAbstractPhrase(thenText);
  if (abstractThen) {
    issues.push(
      createIssue({
        code: 'abstractPhrase',
        target: 'thenText',
        matchedText: abstractThen,
        message: `"${abstractThen}" 대신 바로 볼 수 있는 행동을 적어보세요.`,
      }),
    );
  }

  if (hasNegativeOnlyPattern(thenText)) {
    issues.push(
      createIssue({
        code: 'negativeOnly',
        target: 'thenText',
        message: '"하지 않는다"보다 "무엇을 한다" 형태로 바꾸면 실행하기 쉽습니다.',
      }),
    );
  }

  if (countActionConnectors(thenText) >= 3) {
    issues.push(
      createIssue({
        code: 'tooManyActions',
        target: 'thenText',
        message: '한 문장에 행동이 많습니다. 1~2분 안에 시작할 행동 하나로 줄여보세요.',
      }),
    );
  }

  if (isVagueIfText(ifText)) {
    issues.push(
      createIssue({
        code: 'vagueIf',
        target: 'ifText',
        message: '"만약" 상황을 더 구체적인 장면이나 신호로 적어보세요.',
      }),
    );
  }

  if (isVagueThenText(thenText)) {
    issues.push(
      createIssue({
        code: 'vagueThen',
        target: 'thenText',
        message: '"그러면" 행동을 손, 말, 이동, 정리처럼 보이는 행동으로 적어보세요.',
      }),
    );
  }

  if (hasLongTermOutcome(thenText)) {
    issues.push(
      createIssue({
        code: 'longTermOutcome',
        target: 'thenText',
        message: '결과보다 지금 바로 시작할 수 있는 첫 행동으로 바꿔보세요.',
      }),
    );
  }

  if (!hasObservableAction(thenText)) {
    issues.push(
      createIssue({
        code: 'missingObservableAction',
        target: 'thenText',
        message: '학생이 실제로 하는 모습이 보이는 행동을 넣어보세요.',
      }),
    );
  }

  if (ifText.length > CLASSROOM_AGREEMENT_MAX_IF_LENGTH) {
    issues.push(
      createIssue({
        code: 'vagueIf',
        target: 'ifText',
        severity: 'info',
        message: '상황 문장이 깁니다. 학생들이 바로 떠올릴 수 있게 짧게 다듬어보세요.',
      }),
    );
  }

  if (thenText.length > CLASSROOM_AGREEMENT_MAX_THEN_LENGTH) {
    issues.push(
      createIssue({
        code: 'tooManyActions',
        target: 'thenText',
        severity: 'info',
        message: '행동 문장이 깁니다. 게시용 카드에 들어가도록 짧게 다듬어보세요.',
      }),
    );
  }

  return issues;
}
