import type { ClassroomAgreementClientMessage } from '@shared/wsProtocol/classroomAgreement';

export function shouldRejectClientMessageForBoundToken(
  msg: ClassroomAgreementClientMessage,
  boundStudentToken: string | undefined,
): boolean {
  if (msg.type === 'join-session') return false;
  if (!boundStudentToken) return true;
  return msg.studentToken !== boundStudentToken;
}
