import { describe, expect, it } from 'vitest';
import {
  CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
  ClassroomAgreementClientMessageSchema,
  ClassroomAgreementServerMessageSchema,
} from './classroomAgreement';

const STUDENT_TOKEN = '123e4567-e89b-42d3-a456-426614174000';

describe('ClassroomAgreementClientMessageSchema', () => {
  it('join-session 메시지를 검증한다', () => {
    const result = ClassroomAgreementClientMessageSchema.safeParse({
      type: 'join-session',
      protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
      displayName: '민준',
    });
    expect(result.success).toBe(true);
  });

  it('제안 메시지의 긴 문장을 거부한다', () => {
    const result = ClassroomAgreementClientMessageSchema.safeParse({
      type: 'submit-proposal',
      studentToken: STUDENT_TOKEN,
      clientMessageId: 'm1',
      ifText: '만약 수업 시작 종이 울리면',
      thenText: '가'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('우선순위 투표는 후보 id 1개 이상을 요구한다', () => {
    const result = ClassroomAgreementClientMessageSchema.safeParse({
      type: 'submit-priority-vote',
      studentToken: STUDENT_TOKEN,
      clientMessageId: 'm2',
      candidateIds: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('ClassroomAgreementServerMessageSchema', () => {
  it('input-rejected 메시지를 검증한다', () => {
    const result = ClassroomAgreementServerMessageSchema.safeParse({
      type: 'input-rejected',
      code: 'wrong-phase',
      message: '지금은 제출 단계가 아닙니다.',
    });
    expect(result.success).toBe(true);
  });

  it('알 수 없는 거부 코드는 거부한다', () => {
    const result = ClassroomAgreementServerMessageSchema.safeParse({
      type: 'input-rejected',
      code: 'unknown',
      message: '거부되었습니다.',
    });
    expect(result.success).toBe(false);
  });
});
