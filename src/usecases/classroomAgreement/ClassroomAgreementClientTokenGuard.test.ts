import { describe, expect, it } from 'vitest';
import { CLASSROOM_AGREEMENT_PROTOCOL_VERSION } from '@shared/wsProtocol/classroomAgreement';
import { shouldRejectClientMessageForBoundToken } from './ClassroomAgreementClientTokenGuard';

const TOKEN_A = '11111111-1111-4111-8111-111111111111';
const TOKEN_B = '22222222-2222-4222-8222-222222222222';

describe('shouldRejectClientMessageForBoundToken', () => {
  it('allows join messages before a WebSocket has a bound token', () => {
    expect(
      shouldRejectClientMessageForBoundToken(
        {
          type: 'join-session',
          protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
          displayName: 'student',
        },
        undefined,
      ),
    ).toBe(false);
  });

  it('rejects action messages with no bound token or a different token', () => {
    const message = {
      type: 'submit-proposal',
      studentToken: TOKEN_A,
      clientMessageId: 'message-1',
      ifText: 'If the bell rings',
      thenText: 'we open notebooks',
    } as const;

    expect(shouldRejectClientMessageForBoundToken(message, undefined)).toBe(true);
    expect(shouldRejectClientMessageForBoundToken(message, TOKEN_B)).toBe(true);
    expect(shouldRejectClientMessageForBoundToken(message, TOKEN_A)).toBe(false);
  });
});
