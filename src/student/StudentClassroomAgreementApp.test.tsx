import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  buildClassroomAgreementWsUrl,
  buildJoinSessionMessage,
  buildPriorityVoteMessage,
  buildRefinementVoteMessage,
  StudentClassroomAgreementApp,
} from './StudentClassroomAgreementApp';
import { CLASSROOM_AGREEMENT_PROTOCOL_VERSION } from '@shared/wsProtocol/classroomAgreement';

describe('StudentClassroomAgreementApp', () => {
  it('renders real name or nickname join copy without generated-writing wording', () => {
    const html = renderToString(<StudentClassroomAgreementApp />);

    expect(html).toContain('실명 또는 닉네임');
    expect(html).toContain('함께 지킬 수 있는 약속을 제안');
    expect(html).not.toContain('AI 추천');
    expect(html).not.toContain('자동 생성');
  });

  it('builds websocket URL from the current student link', () => {
    expect(buildClassroomAgreementWsUrl({ protocol: 'http:', host: 'localhost:3210' })).toBe(
      'ws://localhost:3210',
    );
    expect(buildClassroomAgreementWsUrl({ protocol: 'https:', host: 'example.test' })).toBe(
      'wss://example.test',
    );
  });

  it('builds join-session messages with trimmed display names and previous token', () => {
    const previousToken = '11111111-1111-4111-8111-111111111111';
    expect(buildJoinSessionMessage(' 민수 ', previousToken)).toEqual({
      type: 'join-session',
      protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
      displayName: '민수',
      previousToken,
    });
  });

  it('builds refinement and priority vote messages', () => {
    const token = '11111111-1111-4111-8111-111111111111';
    expect(buildRefinementVoteMessage(token, 'candidate-1', 'agree')).toMatchObject({
      type: 'submit-refinement-vote',
      studentToken: token,
      candidateId: 'candidate-1',
      value: 'agree',
    });
    expect(buildPriorityVoteMessage(token, ['candidate-1', 'candidate-2'])).toMatchObject({
      type: 'submit-priority-vote',
      studentToken: token,
      candidateIds: ['candidate-1', 'candidate-2'],
    });
  });
});
