import { describe, expect, it } from 'vitest';
import { buildRecordDraftPack } from '../recordDraftPack';
import { recordDraftDetailForModel } from '../../rules/recordDraftDetail';

const evidence = {
  id: 'e1',
  content: '홍보 자료의 처리 조건을 연구 자료와 비교해 근거를 수정함. '.repeat(30),
};
const input = {
  studentName: '학생',
  roster: [],
  areaLabel: '교과 세특',
  evidences: [evidence],
  targetBytes: 1500,
};

describe('모델별 구체적인 근거 서술 기본값', () => {
  it.each(['gpt-5.6-terra', 'gpt-5.6-luna'])('Codex %s에만 기본 적용한다', (model) => {
    expect(recordDraftDetailForModel('codex', model)).toBe('grounded');
    expect(recordDraftDetailForModel('claude', model)).toBeUndefined();
  });

  it.each(['gpt-5.6-sol', 'gpt-6-astra', '', undefined])(
    '다른 모델 %s에는 적용하지 않는다',
    (model) => {
      expect(recordDraftDetailForModel('codex', model)).toBeUndefined();
    },
  );

  it('상세 지시는 교사 지시 앞에 두고 실제 목표와 원문을 보존한다', () => {
    const before = JSON.stringify(input);
    const pack = buildRecordDraftPack({
      ...input,
      targetBytes: 900,
      detail: 'grounded',
      teacherPrompt: '이번에는 간결하게 쓰세요.',
    });
    expect(pack.text).toContain('구체적으로 쓰기:');
    expect(pack.text.indexOf('구체적으로 쓰기:')).toBeLessThan(pack.text.indexOf('선생님 지시:'));
    expect(pack.text).toContain('900바이트');
    expect(pack.text).not.toContain('1,500바이트');
    expect(pack.text).not.toContain('7~8문장');
    expect(pack.text).toContain('명제의 부정어와 조건을 보존');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('상세 설정이 있어도 실제 전송 근거가 얇거나 모두 제외되면 늘리도록 요구하지 않는다', () => {
    for (const evidences of [
      [],
      [{ id: 'thin', content: '질문함.' }],
      [{ ...evidence, excludedFromAi: true }],
    ]) {
      const pack = buildRecordDraftPack({ ...input, evidences, detail: 'grounded' });
      expect(pack.text).not.toContain('구체적으로 쓰기:');
    }
  });

  it('설정 없는 기존 요청서는 상세 지시를 추가하지 않는다', () => {
    expect(buildRecordDraftPack(input).text).not.toContain('구체적으로 쓰기:');
  });
});
