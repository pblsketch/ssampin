import { describe, it, expect } from 'vitest';
import {
  buildLengthAdjustPack,
  buildRecordDraftPack,
  summarizeExclusions,
  DRAFT_PACK_MAX_EVIDENCE_CHARS,
  type DraftPackEvidence,
  type DraftPackInput,
} from '@domain/services/recordDraftPack';
import { rosterFromAll } from '@domain/rules/redactOutbound';

function ev(p: Partial<DraftPackEvidence> & { id: string }): DraftPackEvidence {
  return { content: '수업에서 질문을 자주 했다.', ...p };
}

const ROSTER = rosterFromAll(
  [
    { name: '김지훈', studentNumber: 15 },
    { name: '박서연', studentNumber: 3 },
  ],
  [],
);

function input(p: Partial<DraftPackInput> = {}): DraftPackInput {
  return {
    studentName: '김지훈',
    roster: ROSTER,
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

describe('★실명은 꾸러미 안에서 가려진다 — 부르는 쪽을 믿지 않는다 (UltraQA P0)', () => {
  it('학생 이름이 별칭으로 바뀌고 실명은 본문에 없다', () => {
    const pack = buildRecordDraftPack(input());
    expect(pack.studentAlias).toBe('［이름1］');
    expect(pack.text).toContain('학생: ［이름1］');
    expect(pack.text).not.toContain('김지훈');
  });

  it('★근거 본문에 적힌 다른 학생 이름도 가려진다', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '박서연과 함께 자료를 정리했다.' }] }),
    );
    expect(pack.text).not.toContain('박서연');
    expect(pack.text).toContain('［이름2］');
  });

  it('근거 본문의 본인 이름은 첫 줄과 같은 별칭이다 — 세션 하나로 가리기 때문', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '김지훈이 발표를 맡았다.' }] }),
    );
    expect(pack.text).toContain('［이름1］이 발표를 맡았다');
    expect(pack.text.split('［이름1］').length - 1).toBe(2); // 첫 줄 + 근거
  });

  it('주제 제목과 선생님 지시도 가려진다', () => {
    const pack = buildRecordDraftPack(
      input({ threadTitle: '박서연과의 공동 탐구', teacherPrompt: '김지훈 중심으로 써 주세요' }),
    );
    expect(pack.text).not.toContain('박서연');
    expect(pack.text).not.toContain('김지훈');
  });

  it('학번(15번)도 가려진다', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '15번 학생이 질문을 만들었다.' }] }),
    );
    expect(pack.text).not.toContain('15번');
  });

  it('★명단에 이 학생이 빠져 있어도(호출부 실수) 실명은 안 나간다', () => {
    const pack = buildRecordDraftPack(input({ roster: [] }));
    expect(pack.text).not.toContain('김지훈');
    expect(pack.studentAlias).toBe('［이름1］');
  });

  it('되돌릴 대응표를 돌려준다 — 저장 전에 이름으로 되돌리는 데 쓴다', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '박서연과 협력했다.' }] }),
    );
    expect(pack.mappings.map((m) => `${m.alias}=${m.original}`)).toEqual([
      '［이름1］=김지훈',
      '［이름2］=박서연',
    ]);
  });

  it('기재 금지 검사는 가리기 전 원문으로 한다 — 가린 뒤엔 단어가 바뀔 수 있다', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '박서연이 교내 수학경시대회 금상.' }] }),
    );
    expect(pack.exclusions.map((x) => x.reason)).toEqual(['prohibited']);
  });
});

// ── 분량 조절 꾸러미 ───────────────────────────────────────────────────────────

describe('★분량 조절 꾸러미 — 조절 대상 본문 자체가 밖으로 나간다', () => {
  const SOURCE = '김지훈은 미세플라스틱 탐구에서 박서연과 함께 자료를 모았다.';

  function adjustInput(
    p: Partial<Parameters<typeof buildLengthAdjustPack>[0]> = {},
  ): Parameters<typeof buildLengthAdjustPack>[0] {
    return {
      kind: 'shrink',
      studentName: '김지훈',
      roster: ROSTER,
      areaLabel: '교과 세부능력 및 특기사항',
      sourceText: SOURCE,
      targetBytes: 1500,
      ...p,
    };
  }

  it('★본문 속 실명이 전부 가려진다 — 이 학생도, 근거에 나온 다른 학생도', () => {
    const pack = buildLengthAdjustPack(adjustInput());
    expect(pack.text).not.toContain('김지훈');
    expect(pack.text).not.toContain('박서연');
    expect(pack.text).toContain('［이름1］');
    // 같은 세션이므로 학생마다 다른 번호를 받는다.
    expect(pack.text).toContain('［이름2］');
  });

  it('줄이기는 근거 블록과 "근거만 보고 쓰세요"를 아예 붙이지 않는다', () => {
    const pack = buildLengthAdjustPack(adjustInput({ kind: 'shrink' }));
    expect(pack.text).not.toContain('근거 자료:');
    expect(pack.text).not.toContain('보낼 수 있는 근거가 없습니다');
    expect(pack.text).toContain('줄일 글:');
    expect(pack.text).toContain('새로운 활동이나 성과를 덧붙이지 마세요');
  });

  it('보충하기는 근거를 싣고 지어내기 금지를 맨 끝에 둔다', () => {
    const pack = buildLengthAdjustPack(
      adjustInput({ kind: 'expand', evidences: [ev({ id: 'e1' })] }),
    );
    expect(pack.text).toContain('근거 자료:');
    expect(pack.includedCount).toBe(1);
    // ★최신성 효과 — 표식 지시가 앞, 지어내기 금지가 맨 끝이어야 한다.
    const markAt = pack.text.indexOf('[동기]');
    const banAt = pack.text.indexOf('근거 자료에 없는 내용은 한 문장도 쓰지 마세요');
    expect(markAt).toBeGreaterThan(-1);
    expect(banAt).toBeGreaterThan(markAt);
  });

  it('★목표는 상한과 하한을 함께 준다 — 상한만 주면 900바이트도 "지킨 것"이 된다', () => {
    const pack = buildLengthAdjustPack(adjustInput());
    expect(pack.text).toMatch(/목표 분량: [\d,]+ ~ [\d,]+바이트/);
    expect(pack.text).toContain('가능한 한 위쪽에 가깝게');
    // 별칭 보정이 상한·하한에 같은 방향으로 들어갔다.
    expect(pack.modelTargetBytes - pack.finalTargetBytes).toBe(pack.modelFloorBytes - 1425);
  });

  it('★기재 금지 항목은 세어서 알려 주되 문장을 지우지 않는다 (오너 결정 4)', () => {
    const pack = buildLengthAdjustPack(
      adjustInput({ sourceText: '김지훈은 전국과학대회에서 최우수상을 받았다.' }),
    );
    expect(pack.sourceProhibited.length).toBeGreaterThan(0);
    // ★자동으로 지우면 "조용한 문장 소실"이 된다. 본문은 그대로 실린다.
    expect(pack.text).toContain('최우수상');
  });

  it('금지 항목이 없으면 빈 목록이다', () => {
    expect(buildLengthAdjustPack(adjustInput()).sourceProhibited).toEqual([]);
  });

  it('보충하기의 근거는 기존과 같은 순서로 걸러진다 (근거는 빼는 게 맞다)', () => {
    const pack = buildLengthAdjustPack(
      adjustInput({
        kind: 'expand',
        evidences: [
          ev({ id: 'e1', content: '전국대회에서 대상을 받았다.' }),
          ev({ id: 'e2', excludedFromAi: true }),
          ev({ id: 'e3', content: '  ' }),
        ],
      }),
    );
    expect(pack.includedCount).toBe(0);
    expect(pack.exclusions.map((x) => x.reason).sort()).toEqual(['empty', 'prohibited', 'teacher']);
  });
});

describe('과목 이름 (오너 검토 2026-09-09: 어떤 수업에서의 일인지 밝히려면 과목을 알아야 한다)', () => {
  it('과목이 있으면 영역 다음 줄에 붙는다', () => {
    const pack = buildRecordDraftPack(input({ subject: '물리학Ⅰ' }));
    const at = pack.text.indexOf('영역: 교과 세부능력 및 특기사항');
    expect(at).toBeGreaterThanOrEqual(0);
    // 바로 다음 줄이 과목이다.
    expect(pack.text.slice(at).split(String.fromCharCode(10))[1]).toBe('과목: 물리학Ⅰ');
  });

  it('과목이 없거나 비어 있으면 줄 자체가 없다 (행특·자율에서 예전과 같은 요청서)', () => {
    expect(buildRecordDraftPack(input()).text).not.toContain('과목:');
    expect(buildRecordDraftPack(input({ subject: '  ' })).text).not.toContain('과목:');
  });

  it('과목 이름도 가리기를 거친다 (선생님이 적은 자유 문자열이다)', () => {
    const pack = buildRecordDraftPack(input({ subject: '박서연 반 물리' }));
    expect(pack.text).not.toContain('박서연');
  });
});
