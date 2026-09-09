/**
 * 요청서에 실리는 작성 구성 — ADR-099.
 *
 * ★가장 중요한 검사는 첫 묶음이다: **기본값이면 예전과 글자 하나까지 같아야 한다.**
 *   여기가 깨지면 "고르지 않은 선생님"의 초안 품질이 조용히 달라진다.
 */
import { describe, expect, it } from 'vitest';

import {
  buildLengthAdjustPack,
  buildNarrativeRemarkPack,
  buildRecordDraftPack,
  summarizeDraftPackNotes,
  type DraftPackInput,
} from '@domain/services/recordDraftPack';
import { DEFAULT_RECORD_WRITING_STYLE } from '@domain/entities/RecordWritingStyle';
import type { KeywordGroup } from '@domain/privacy/types';

const roster: readonly KeywordGroup[] = [{ label: '이름', values: ['김지훈', '박서연'] }];

const input = (over: Partial<DraftPackInput> = {}): DraftPackInput => ({
  studentName: '김지훈',
  roster,
  areaLabel: '과목별 세부능력 및 특기사항',
  evidences: [
    { id: 'e1', content: '두 매체의 인물 묘사를 견주어 비평문을 씀.', date: '2026-05-02' },
    { id: 'e2', content: '동료 의견을 받아 결론 문단을 다시 씀.', date: '2026-05-20' },
  ],
  ...over,
});

describe('기본값이면 요청서가 예전과 같다', () => {
  it('style 을 안 주었을 때와 기본값을 주었을 때가 완전히 같다', () => {
    const without = buildRecordDraftPack(input()).text;
    const withDefault = buildRecordDraftPack(input({ style: DEFAULT_RECORD_WRITING_STYLE })).text;
    expect(withDefault).toBe(without);
  });

  it('기본값 요청서에는 「작성 구성」 이 없고 옛 문장이 그대로 있다', () => {
    const text = buildRecordDraftPack(input({ style: DEFAULT_RECORD_WRITING_STYLE })).text;
    expect(text).not.toContain('작성 구성');
    expect(text).toContain('순서는 반드시 [평가] → [동기] → [과정] → [결과] 입니다.');
    expect(text).toContain('활동을 나열하지 말고 하나의 탐구 흐름으로 이어 주세요.');
  });
});

describe('고른 구성이 실제로 요청서에 실린다', () => {
  const text = buildRecordDraftPack(
    input({ style: { focus: 'feedbackRevise', opening: 'performance', grouping: 'single' } }),
  ).text;

  it('구성 블록이 붙고 요소 이름이 차례로 적힌다', () => {
    expect(text).toContain('작성 구성');
    expect(text).toContain('1. [과정] 첫 수행의 특징');
    expect(text.indexOf('첫 수행의 특징')).toBeLessThan(text.indexOf('달라진 수행'));
  });

  it('교사 판단이 맨 뒤로 가고 어미 요구가 사라진다', () => {
    expect(text).toContain('교사 판단');
    expect(text).not.toContain('~하는 학생임.');
    expect(text).toContain('교사 평가는 마지막 문단입니다.');
  });

  it('표식 지시가 순서를 다시 못 박지 않고 구성에 넘긴다 — 두 지시가 싸우면 안 된다', () => {
    expect(text).not.toContain('순서는 반드시 [평가] → [동기] → [과정] → [결과] 입니다.');
    expect(text).toContain('순서는 위 「작성 구성」에 적힌 차례를 따릅니다.');
  });

  it('"하나의 탐구 흐름" 지시가 빠진다 — 묶는 방식과 정반대일 수 있다', () => {
    expect(text).not.toContain('하나의 탐구 흐름으로 이어 주세요');
    expect(text).toContain('근거에 없는 내용은 쓰지 마세요.');
  });

  it('성취별 묶기를 고르면 하나로 잇지 말라고 나간다', () => {
    const t = buildRecordDraftPack(
      input({ style: { focus: 'collaborate', opening: 'evaluation', grouping: 'byAchievement' } }),
    ).text;
    expect(t).toContain('하나의 이야기로 잇지 않습니다');
  });
});

describe('보호 계약은 그대로다', () => {
  it('구성을 골라도 기재 금지 근거는 여전히 빠진다', () => {
    const pack = buildRecordDraftPack(
      input({
        style: { focus: 'collaborate', opening: 'performance', grouping: 'connected' },
        evidences: [
          { id: 'e1', content: '모둠 발표에서 자료 정리를 맡음.' },
          { id: 'bad', content: 'TOEIC 900점을 받았다고 함.' },
        ],
      }),
    );
    expect(pack.exclusions.map((x) => x.reason)).toContain('prohibited');
    expect(pack.text).not.toContain('TOEIC');
  });

  it('추가 지시 속 실명도 별칭으로 바뀐다', () => {
    const pack = buildRecordDraftPack(
      input({
        style: { focus: 'collaborate', opening: 'performance', grouping: 'connected' },
        teacherPrompt: '박서연과 함께한 대목을 강조해 주세요.',
      }),
    );
    expect(pack.text).not.toContain('박서연');
    expect(pack.text).toContain('선생님 지시:');
  });

  it('선생님 지시는 구성 블록보다 뒤에 온다 — 손으로 적은 말이 강조점을 조절한다', () => {
    const pack = buildRecordDraftPack(
      input({
        style: { focus: 'collaborate', opening: 'performance', grouping: 'connected' },
        teacherPrompt: '문장을 짧게',
      }),
    );
    expect(pack.text.indexOf('작성 구성')).toBeLessThan(pack.text.indexOf('선생님 지시:'));
  });

  it('근거가 하나도 없어도 요청서는 만들어진다 — 관찰 본문 입력을 막지 않는다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [],
        style: { focus: 'collaborate', opening: 'evaluation', grouping: 'single' },
      }),
    );
    expect(pack.includedCount).toBe(0);
    expect(pack.text).toContain('(보낼 수 있는 근거가 없습니다)');
  });

  it('수업 맥락 요소는 "학생이 했다"로 바꾸지 말라는 말을 달고 나간다', () => {
    const t = buildRecordDraftPack(
      input({
        style: {
          focus: 'collaborate',
          opening: 'evaluation',
          grouping: 'single',
          extraModules: ['lessonContext'],
        },
      }),
    ).text;
    expect(t).toContain('수업 목표나 과제 안내를 학생이 해낸 일로 바꾸지 않습니다.');
  });
});

describe('분량 조절과 [다시 표시]는 구성을 싣지 않는다', () => {
  const adjust = buildLengthAdjustPack({
    kind: 'shrink',
    studentName: '김지훈',
    roster,
    areaLabel: '과목별 세부능력 및 특기사항',
    sourceText: '자료의 분모를 따져 묻는 학생임. 두 매체를 견주어 비평문을 썼음.',
    targetBytes: 1500,
  });

  it('줄이기 요청서에 「작성 구성」 이 없다', () => {
    expect(adjust.text).not.toContain('작성 구성');
  });

  it('줄이기·[다시 표시]는 순서를 요구하지 않는다 — 다른 구성으로 쓴 글을 다시 짜면 안 된다', () => {
    expect(adjust.text).toContain('이미 쓰인 글의 차례를 그대로 두고 표식만 붙입니다.');
    expect(adjust.text).not.toContain('순서는 반드시');
    const remark = buildNarrativeRemarkPack({ content: '어떤 글.', roster });
    expect(remark.text).toContain('이미 쓰인 글의 차례를 그대로 두고 표식만 붙입니다.');
    expect(remark.text).not.toContain('순서는 반드시');
  });
});

describe('금지어 대체 — 낱말만 걸린 근거를 살린다 (2026-09-09)', () => {
  it("'체육대회' 근거가 '체육행사'로 바뀌어 실리고, 무엇을 바꿨는지 알린다", () => {
    const pack = buildRecordDraftPack(
      input({
        areaLabel: '행동특성 및 종합의견',
        evidences: [
          {
            id: 'e1',
            content: '체육대회 준비물이 부족하자 자기 것을 먼저 빌려주고 마지막에 챙김.',
          },
        ],
      }),
    );
    expect(pack.includedCount).toBe(1);
    expect(pack.exclusions).toEqual([]);
    expect(pack.text).toContain('체육행사');
    expect(pack.text).not.toContain('체육대회');
    expect(pack.substitutions).toEqual([{ evidenceId: 'e1', from: '체육대회', to: '체육행사' }]);
  });

  it('바꾼 사실과 주의를 미리보기 한 줄에 적는다 — 조용히 바꾸지 않는다', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '체육대회 준비를 도움.' }] }),
    );
    const note = summarizeDraftPackNotes(pack);
    expect(note).toContain('체육대회 → 체육행사');
    expect(note).toContain('시상이 계획됐던 행사라면');
  });

  it('수상 결과가 함께 있으면 바꾸지 않고 그대로 뺀다', () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '체육대회에서 최우수상을 받음.' }] }),
    );
    expect(pack.includedCount).toBe(0);
    expect(pack.substitutions).toEqual([]);
    expect(pack.exclusions[0]?.reason).toBe('prohibited');
  });

  it("살릴 수 없는 '대회' 근거에는 고쳐 적는 법을 함께 알린다", () => {
    const pack = buildRecordDraftPack(
      input({ evidences: [{ id: 'e1', content: '교내 독서대회에 참여함.' }] }),
    );
    expect(pack.includedCount).toBe(0);
    expect(summarizeDraftPackNotes(pack)).toContain('이름을 바꿔 적으시면');
  });

  it('분량 조절(채우기)도 같은 구제를 쓴다 — 화면마다 다르게 취급하지 않는다', () => {
    const pack = buildLengthAdjustPack({
      kind: 'expand',
      studentName: '김지훈',
      roster,
      areaLabel: '행동특성 및 종합의견',
      sourceText: '맡은 자리 너머까지 교실을 살피는 학생임.',
      targetBytes: 1500,
      evidences: [{ id: 'e1', content: '체육대회 준비물을 먼저 빌려줌.' }],
    });
    expect(pack.text).toContain('체육행사');
    expect(pack.substitutions).toHaveLength(1);
  });
});
