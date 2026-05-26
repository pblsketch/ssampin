import { describe, expect, it } from 'vitest';
import { formatAgreementSentence, validateAgreementDraft } from './classroomAgreementRules';
import type { AgreementValidationIssueCode } from '@domain/entities/ClassroomAgreement';

function issueCodes(ifText: string, thenText: string): readonly AgreementValidationIssueCode[] {
  return validateAgreementDraft({ ifText, thenText }).map((issue) => issue.code);
}

describe('validateAgreementDraft', () => {
  it('구체적인 만약-그러면 문장은 경고가 없다', () => {
    expect(
      validateAgreementDraft({
        ifText: '만약 수업 시작 종이 울리면',
        thenText: '우리는 자리에 앉아 책과 노트를 펼친다',
      }),
    ).toEqual([]);
  });

  it('추상 표현을 찾는다', () => {
    const codes = issueCodes('만약 모둠 활동을 하면', '우리는 서로 배려하기');
    expect(codes).toContain('abstractPhrase');
    expect(codes).toContain('vagueThen');
  });

  it('"하지 않는다" 중심 표현을 찾는다', () => {
    expect(issueCodes('만약 친구가 발표하고 있으면', '우리는 떠들지 않는다')).toContain(
      'negativeOnly',
    );
  });

  it('한 문장에 행동이 너무 많은 경우를 찾는다', () => {
    expect(
      issueCodes(
        '만약 쉬는 시간이 끝나면',
        '우리는 자리에 앉고, 책을 꺼내고, 공책을 펴고, 그리고 선생님을 본다',
      ),
    ).toContain('tooManyActions');
  });

  it('만약 상황이 너무 넓은 경우를 찾는다', () => {
    expect(issueCodes('문제가 생기면', '우리는 손을 들고 선생님에게 말한다')).toContain('vagueIf');
  });

  it('그러면 행동이 너무 넓은 경우를 찾는다', () => {
    const codes = issueCodes('만약 의견이 다르면', '우리는 협력하기');
    expect(codes).toContain('vagueThen');
    expect(codes).toContain('missingObservableAction');
  });

  it('장기 결과만 말하는 표현을 찾는다', () => {
    expect(issueCodes('만약 과제가 어려우면', '우리는 문제를 해결한다')).toContain(
      'longTermOutcome',
    );
  });

  it('눈에 보이는 행동이 없는 표현을 찾는다', () => {
    expect(issueCodes('만약 모둠 의견이 다르면', '우리는 마음을 모은다')).toContain(
      'missingObservableAction',
    );
  });
});

describe('formatAgreementSentence', () => {
  it('완성 문장을 쉼표와 마침표로 정리한다', () => {
    expect(
      formatAgreementSentence({
        ifText: '만약 친구가 말하는 중에 내 생각이 떠오르면.',
        thenText: '우리는 말을 끊지 않고 손을 들거나 메모한다.',
      }),
    ).toBe(
      '만약 친구가 말하는 중에 내 생각이 떠오르면, 우리는 말을 끊지 않고 손을 들거나 메모한다.',
    );
  });
});
