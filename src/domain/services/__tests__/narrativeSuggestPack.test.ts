/**
 * AI 서사 초안 꾸러미(ADR-103 §5-5).
 *
 * 여기서 지키는 것:
 *  - 실명이 나가지 않는다(학생 이름·근거 본문·메모·주제 이름 전부 한 세션으로 가린다).
 *  - 초안 꾸러미와 **같은 제외 규칙을 같은 순서로** 쓴다: 선생님 제외 → 빈 내용 → 기재 금지 → 분량.
 *  - 근거는 **날짜순**으로 실린다(파일 저장 순서로 보내면 활동 나열이 된다 — ADR-083).
 *  - 그 틀 그 자리에 실제로 있는 카테고리만 목록으로 준다.
 */
import { describe, expect, it } from 'vitest';

import { buildNarrativeSuggestPack } from '@domain/services/narrativeSuggestPack';
import { rosterFromAll } from '@domain/rules/redactOutbound';

const ROSTER = rosterFromAll(
  [
    { name: '김지훈', studentNumber: 1 },
    { name: '박서연', studentNumber: 2 },
  ],
  [],
);

const base = {
  studentName: '김지훈',
  roster: ROSTER,
  frame: 'inquiry' as const,
  threadTitle: '할인 문구와 선택',
};

describe('buildNarrativeSuggestPack', () => {
  it('교사 메모 맥락은 익명화하고 제외 근거를 함께 해석한 메모는 보내지 않는다', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [
        { id: 'a', content: '자료의 차이를 비교함', createdAt: 1 },
        { id: 'b', content: '비공개 관찰', createdAt: 2, excludedFromAi: true },
      ],
      currentScenes: [
        { id: 's1', role: 'process', evidenceIds: ['a'], note: '김지훈이 비교 기준을 설명함' },
        { id: 's2', role: 'result', evidenceIds: ['a', 'b'], note: '제외 자료까지 종합한 해석' },
      ],
    });
    expect(pack.text).toContain('비교 기준을 설명함');
    expect(pack.text).not.toContain('김지훈');
    expect(pack.text).not.toContain('제외 자료까지 종합한 해석');
    expect(pack.text).not.toContain('비공개 관찰');
    expect(pack.text).toContain('앞 장면과의 이음말');
  });
  it('★근거를 날짜순으로 싣는다 — 파일 저장 순서가 아니다', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [
        { id: 'late', content: '나중 것', date: '2026-05-20', createdAt: 1 },
        { id: 'early', content: '먼저 것', date: '2026-05-01', createdAt: 2 },
      ],
    });
    expect(pack.numbered).toEqual(['early', 'late']);
    expect(pack.text.indexOf('먼저 것')).toBeLessThan(pack.text.indexOf('나중 것'));
  });

  it('★실명이 하나도 나가지 않는다 — 본문·메모 안의 다른 학생 이름까지', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [
        {
          id: 'e1',
          content: '박서연과 함께 조사했다',
          note: '김지훈이 자료를 맡았다',
          createdAt: 1,
        },
      ],
    });
    expect(pack.text).not.toContain('김지훈');
    expect(pack.text).not.toContain('박서연');
    expect(pack.mappings.length).toBeGreaterThan(0);
  });

  it('선생님 메모도 함께 실린다 — 요청서와 같은 재료를 본다', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [{ id: 'e1', content: '질문을 했다', note: '여기서 시작했다', createdAt: 1 }],
    });
    expect(pack.text).toContain('선생님 메모: 여기서 시작했다');
  });

  it('제외 규칙이 초안 꾸러미와 같다 — 선생님 제외·빈 내용·기재 금지', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [
        { id: 'off', content: '보내지 않을 것', excludedFromAi: true, createdAt: 1 },
        { id: 'empty', content: '   ', createdAt: 2 },
        { id: 'bad', content: '○○학원에서 배웠다', createdAt: 3 },
        { id: 'ok', content: '스스로 조사했다', createdAt: 4 },
      ],
    });
    expect(pack.numbered).toEqual(['ok']);
    expect(pack.exclusions.map((x) => x.reason).sort()).toEqual(['empty', 'prohibited', 'teacher']);
  });

  it('보낼 근거가 하나도 없으면 그 사실이 드러난다', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [{ id: 'off', content: 'x', excludedFromAi: true, createdAt: 1 }],
    });
    expect(pack.includedCount).toBe(0);
    expect(pack.text).toContain('보낼 수 있는 기록이 없습니다');
  });

  it('★탐구 틀이면 탐구 자리 이름과 그 자리 카테고리만 준다', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [{ id: 'e1', content: '질문을 했다', createdAt: 1 }],
    });
    expect(pack.text).toContain('동기:');
    expect(pack.text).toContain('첫 수행의 특징');
    // 생활 틀 전용 카테고리는 탐구 틀 목록에 없다.
    expect(pack.text).not.toContain('학습 태도');
  });

  it('★생활 틀이면 생활 자리 이름과 신설 카테고리를 준다', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      frame: 'life',
      evidences: [{ id: 'e1', content: '급식 당번을 도왔다', createdAt: 1 }],
    });
    expect(pack.text).toContain('특성:');
    expect(pack.text).toContain('성장:');
    expect(pack.text).toContain('학습 태도');
    expect(pack.text).toContain('변화');
  });

  it('앞 주제가 있으면 이음말도 묻는다 — 없으면 묻지 않는다', () => {
    const withPrev = buildNarrativeSuggestPack({
      ...base,
      evidences: [{ id: 'e1', content: '질문을 했다', createdAt: 1 }],
      previousThreadTitle: '기초 탐구',
    });
    expect(withPrev.text).toContain('이음 | 문장');
    const without = buildNarrativeSuggestPack({
      ...base,
      evidences: [{ id: 'e1', content: '질문을 했다', createdAt: 1 }],
    });
    expect(without.text).not.toContain('이음 | 문장');
  });

  it('평가 자리는 한 번만 쓰라고 못 박는다', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [{ id: 'e1', content: '질문을 했다', createdAt: 1 }],
    });
    expect(pack.text).toContain('한 번만');
  });

  it('평가 자리는 종합 판단 기록이 없으면 비우라고 하고, 초안에서 채운다고 말한다 (ADR-109)', () => {
    const pack = buildNarrativeSuggestPack({
      ...base,
      evidences: [{ id: 'e1', content: '질문을 했다', createdAt: 1 }],
    });
    expect(pack.text).toContain('기록번호 칸을 비워 두세요');
    expect(pack.text).toContain('초안을 쓸 때 기록 전체를 종합해 채웁니다');
    // 활동 기록까지 끌어가면 과정·결과 자리가 빈다.
    expect(pack.text).toContain('활동 장면을 적은 기록은 이 자리에 넣지 않습니다');
    expect(pack.text).not.toContain('기록은 넣지 않습니다.');
  });
});
