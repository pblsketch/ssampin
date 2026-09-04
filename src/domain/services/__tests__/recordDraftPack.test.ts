import { describe, it, expect } from 'vitest';
import {
  buildRecordDraftPack,
  summarizeExclusions,
  DRAFT_PACK_MAX_EVIDENCE_CHARS,
  type DraftPackEvidence,
  type DraftPackInput,
} from '@domain/services/recordDraftPack';

function ev(p: Partial<DraftPackEvidence> & { id: string }): DraftPackEvidence {
  return { content: '수업에서 질문을 자주 했다.', ...p };
}

function input(p: Partial<DraftPackInput> = {}): DraftPackInput {
  return {
    studentAlias: '［이름1］',
    areaLabel: '교과 세부능력 및 특기사항',
    evidences: [ev({ id: 'e1' })],
    ...p,
  };
}

describe('꾸러미 기본 모양', () => {
  it('학생은 별칭으로만 들어간다 — 실명이 들어갈 자리가 없다', () => {
    const pack = buildRecordDraftPack(input());
    expect(pack.text).toContain('［이름1］');
    expect(pack.text).toContain('교과 세부능력');
  });

  it('주제를 고르면 함께 싣는다', () => {
    const pack = buildRecordDraftPack(input({ threadTitle: '기후 변화 탐구' }));
    expect(pack.text).toContain('기후 변화 탐구');
  });

  it('날짜가 있으면 근거 줄에 붙인다', () => {
    const pack = buildRecordDraftPack(input({ evidences: [ev({ id: 'e1', date: '2026-05-03' })] }));
    expect(pack.text).toContain('(2026-05-03)');
  });

  it('선생님 지시(2층)는 근거 뒤에 온다', () => {
    const pack = buildRecordDraftPack(input({ teacherPrompt: '문장을 짧게 써 주세요.' }));
    expect(pack.text.indexOf('근거 자료:')).toBeLessThan(pack.text.indexOf('선생님 지시:'));
  });

  it('★근거로 되짚으라는 지시가 맨 끝에 온다 — 실측에서 뒤쪽에 둘 때만 효과가 있었다', () => {
    const pack = buildRecordDraftPack(input({ teacherPrompt: '짧게' }));
    const tail = pack.text.slice(-200);
    expect(tail).toContain('어느 줄에서 나왔는지');
    expect(tail).toContain('근거에 없는 내용은 쓰지 마세요');
  });
});

describe('성취기준은 키워드만 — 원문은 앱 밖으로 안 나간다', () => {
  it('키워드를 실으면 그 줄이 생긴다', () => {
    const pack = buildRecordDraftPack(input({ standardKeywords: ['탄소중립', '자료 해석'] }));
    expect(pack.text).toContain('성취기준 키워드: 탄소중립, 자료 해석');
  });

  it('키워드가 없으면 그 줄 자체가 없다', () => {
    expect(buildRecordDraftPack(input()).text).not.toContain('성취기준');
    expect(buildRecordDraftPack(input({ standardKeywords: [] })).text).not.toContain('성취기준');
  });
});

describe('★기재 금지 항목은 프롬프트가 아니라 여기서 뺀다', () => {
  it('금지 항목이 든 근거는 꾸러미에 실리지 않는다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'e1', content: '교내 수학경시대회에서 금상을 받았다.' }),
          ev({ id: 'e2', content: '모둠 활동에서 자료를 정리했다.' }),
        ],
      }),
    );
    expect(pack.text).not.toContain('경시대회');
    expect(pack.text).toContain('모둠 활동');
    expect(pack.includedCount).toBe(1);
  });

  it('왜 빠졌는지 갈래를 함께 돌려준다 — 화면이 사유를 말할 수 있게', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1', content: '교내 수학경시대회에서 금상을 받았다.' })] }),
    );
    const x = pack.exclusions[0];
    expect(x?.evidenceId).toBe('e1');
    expect(x?.reason).toBe('prohibited');
    expect((x?.categories ?? []).length).toBeGreaterThan(0);
  });

  it('선생님이 뺀 것이 금지 판정보다 먼저다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [ev({ id: 'e1', content: '교내 대회 수상', excludedFromAi: true })],
      }),
    );
    expect(pack.exclusions[0]?.reason).toBe('teacher');
  });

  it('빈 근거는 내용 없음으로 뺀다', () => {
    const pack = buildRecordDraftPack(input({ evidences: [ev({ id: 'e1', content: '   ' })] }));
    expect(pack.exclusions[0]?.reason).toBe('empty');
    expect(pack.includedCount).toBe(0);
  });

  it('실을 근거가 하나도 없으면 그렇게 적는다 — 빈 목록을 주고 지어내게 하지 않는다', () => {
    const pack = buildRecordDraftPack(input({ evidences: [] }));
    expect(pack.text).toContain('보낼 수 있는 근거가 없습니다');
    expect(pack.includedCount).toBe(0);
  });
});

describe('제외 요약 문구', () => {
  it('빠진 게 없으면 빈 문자열', () => {
    expect(summarizeExclusions([])).toBe('');
  });

  it('건수와 사유를 한국어로 요약한다', () => {
    const text = summarizeExclusions([
      { evidenceId: 'a', reason: 'prohibited' },
      { evidenceId: 'b', reason: 'teacher' },
    ]);
    expect(text).toContain('제외됨 2건');
    expect(text).toContain('기재 금지');
    expect(text).toContain('선생님이');
  });

  it('같은 사유는 한 번만 적는다', () => {
    const text = summarizeExclusions([
      { evidenceId: 'a', reason: 'empty' },
      { evidenceId: 'b', reason: 'empty' },
    ]);
    expect(text).toContain('제외됨 2건');
    expect(text.match(/비어 있음/g)).toHaveLength(1);
  });
});

describe('★꾸러미 어디에도 실명이 없다', () => {
  it('명단 이름이 꾸러미 전체에 0건이다', () => {
    const names = ['김지훈', '박서연', '이도윤'];
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'e1', content: '［이름1］ 학생이 발표를 맡았다.' }),
          ev({ id: 'e2', content: '모둠에서 ［이름2］ 와 자료를 나눴다.' }),
        ],
        teacherPrompt: '［이름1］ 의 성장을 중심으로',
      }),
    );
    for (const n of names) expect(pack.text).not.toContain(n);
    expect(pack.text).toContain('［이름1］');
  });
});

describe('★분량 상한 — 넘치면 실행 자체가 실패한다(윈도우 명령줄 32,767자)', () => {
  /** 두 개는 못 들어가는 길이 — 하나만 실리면 상한 안, 둘이면 넘는다. */
  const huge = 'ㄱ'.repeat(Math.floor(DRAFT_PACK_MAX_EVIDENCE_CHARS * 0.6));

  it('상한을 넘는 근거는 빼고, 뺐다고 말한다', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1', content: huge }), ev({ id: 'e2', content: huge })] }),
    );

    expect(pack.includedCount).toBe(1);
    expect(pack.exclusions).toEqual([{ evidenceId: 'e2', reason: 'too-long' }]);
    expect(summarizeExclusions(pack.exclusions)).toContain('분량');
  });

  it('★뒤에 있는 짧은 근거는 살린다 — 하나 길다고 나머지를 통째로 버리지 않는다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'e1', content: huge }),
          ev({ id: 'e2', content: huge }),
          ev({ id: 'e3', content: '모둠에서 자료를 정리했다.' }),
        ],
      }),
    );

    expect(pack.includedCount).toBe(2);
    expect(pack.text).toContain('모둠에서 자료를 정리했다');
  });

  it('평범한 분량은 아무것도 빼지 않는다', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      ev({ id: `e${i}`, content: '수업에서 스스로 질문을 만들어 왔다.' }),
    );
    const pack = buildRecordDraftPack(input({ evidences: many }));

    expect(pack.includedCount).toBe(30);
    expect(pack.exclusions).toEqual([]);
  });
});
