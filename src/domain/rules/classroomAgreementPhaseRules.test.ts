import { describe, expect, it } from 'vitest';
import {
  canStudentActInClassroomAgreement,
  reduceClassroomAgreementPhase,
  type ClassroomAgreementStudentAction,
} from './classroomAgreementPhaseRules';
import type {
  ClassroomAgreementPhase,
  ClassroomAgreementSettings,
} from '@domain/entities/ClassroomAgreement';

const CLOSED_REVIEW_SETTINGS: Pick<ClassroomAgreementSettings, 'allowProposalsDuringReview'> = {
  allowProposalsDuringReview: false,
};

const OPEN_REVIEW_SETTINGS: Pick<ClassroomAgreementSettings, 'allowProposalsDuringReview'> = {
  allowProposalsDuringReview: true,
};

function accepted(
  phase: ClassroomAgreementPhase,
  action: ClassroomAgreementStudentAction,
): boolean {
  return canStudentActInClassroomAgreement({
    phase,
    action,
    settings: CLOSED_REVIEW_SETTINGS,
  }).accepted;
}

describe('canStudentActInClassroomAgreement', () => {
  it('setup에서는 학생 접속과 대기 신호만 받고 제출은 받지 않는다', () => {
    expect(accepted('setup', 'join-session')).toBe(true);
    expect(accepted('setup', 'heartbeat')).toBe(true);
    expect(accepted('setup', 'submit-proposal')).toBe(false);
    expect(accepted('setup', 'submit-refinement-vote')).toBe(false);
    expect(accepted('setup', 'submit-priority-vote')).toBe(false);
  });

  it('collecting에서는 join/proposal만 받는다', () => {
    expect(accepted('collecting', 'join-session')).toBe(true);
    expect(accepted('collecting', 'submit-proposal')).toBe(true);
    expect(accepted('collecting', 'submit-refinement-vote')).toBe(false);
    expect(accepted('collecting', 'submit-priority-vote')).toBe(false);
  });

  it('teacherReview에서는 기본적으로 proposal을 닫는다', () => {
    expect(accepted('teacherReview', 'join-session')).toBe(true);
    expect(accepted('teacherReview', 'submit-proposal')).toBe(false);
  });

  it('teacherReview에서 allowProposalsDuringReview가 true이면 proposal을 받는다', () => {
    expect(
      canStudentActInClassroomAgreement({
        phase: 'teacherReview',
        action: 'submit-proposal',
        settings: OPEN_REVIEW_SETTINGS,
      }).accepted,
    ).toBe(true);
  });

  it('refinementVoting에서는 보완 투표만 받는다', () => {
    expect(accepted('refinementVoting', 'join-session')).toBe(true);
    expect(accepted('refinementVoting', 'submit-refinement-vote')).toBe(true);
    expect(accepted('refinementVoting', 'submit-proposal')).toBe(false);
    expect(accepted('refinementVoting', 'submit-priority-vote')).toBe(false);
  });

  it('priorityVoting에서는 우선순위 투표만 받는다', () => {
    expect(accepted('priorityVoting', 'join-session')).toBe(true);
    expect(accepted('priorityVoting', 'submit-priority-vote')).toBe(true);
    expect(accepted('priorityVoting', 'submit-proposal')).toBe(false);
    expect(accepted('priorityVoting', 'submit-refinement-vote')).toBe(false);
  });

  it('finalized에서는 신규 입력을 거부하고 join/heartbeat만 허용한다', () => {
    expect(accepted('finalized', 'join-session')).toBe(true);
    expect(accepted('finalized', 'heartbeat')).toBe(true);
    expect(accepted('finalized', 'submit-proposal')).toBe(false);
    expect(accepted('finalized', 'submit-refinement-vote')).toBe(false);
    expect(accepted('finalized', 'submit-priority-vote')).toBe(false);
  });
});

describe('reduceClassroomAgreementPhase', () => {
  it('기본 전진 흐름을 허용한다', () => {
    expect(reduceClassroomAgreementPhase({ phase: 'setup', command: 'start-collecting' })).toEqual({
      accepted: true,
      phase: 'collecting',
    });
    expect(
      reduceClassroomAgreementPhase({
        phase: 'collecting',
        command: 'start-teacher-review',
      }),
    ).toEqual({ accepted: true, phase: 'teacherReview' });
    expect(
      reduceClassroomAgreementPhase({
        phase: 'teacherReview',
        command: 'start-refinement-voting',
      }),
    ).toEqual({ accepted: true, phase: 'refinementVoting' });
    expect(
      reduceClassroomAgreementPhase({
        phase: 'teacherReview',
        command: 'start-priority-voting',
      }),
    ).toEqual({ accepted: true, phase: 'priorityVoting' });
    expect(reduceClassroomAgreementPhase({ phase: 'priorityVoting', command: 'finalize' })).toEqual(
      { accepted: true, phase: 'finalized' },
    );
  });

  it('refinementVoting 이후 후보 정리를 위해 teacherReview로 돌아갈 수 있다', () => {
    expect(
      reduceClassroomAgreementPhase({
        phase: 'refinementVoting',
        command: 'start-teacher-review',
      }),
    ).toEqual({ accepted: true, phase: 'teacherReview' });
  });

  it('단계형 교사 화면의 뒤로가기와 투표 하위 단계 이동을 허용한다', () => {
    expect(
      reduceClassroomAgreementPhase({
        phase: 'teacherReview',
        command: 'start-collecting',
      }),
    ).toEqual({ accepted: true, phase: 'collecting' });
    expect(
      reduceClassroomAgreementPhase({
        phase: 'refinementVoting',
        command: 'start-priority-voting',
      }),
    ).toEqual({ accepted: true, phase: 'priorityVoting' });
    expect(
      reduceClassroomAgreementPhase({
        phase: 'priorityVoting',
        command: 'start-teacher-review',
      }),
    ).toEqual({ accepted: true, phase: 'teacherReview' });
  });

  it('잘못된 전이를 거부한다', () => {
    expect(
      reduceClassroomAgreementPhase({
        phase: 'setup',
        command: 'start-priority-voting',
      }),
    ).toEqual({ accepted: false, phase: 'setup', reason: 'invalid-transition' });
  });
});
