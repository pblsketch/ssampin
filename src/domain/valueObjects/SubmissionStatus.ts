export type SubmissionStatus = 'submitted' | 'late' | 'missing';

export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  'submitted',
  'late',
  'missing',
] as const;

/** 제출 상태 판정 */
export function getSubmissionStatus(
  hasSubmitted: boolean,
  isLate: boolean,
): SubmissionStatus {
  if (!hasSubmitted) {
    return 'missing';
  }
  return isLate ? 'late' : 'submitted';
}
