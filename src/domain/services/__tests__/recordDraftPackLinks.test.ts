/**
 * 요청서에 실리는 「근거 사이 연결」(ADR-106).
 *
 * 여기서 지키는 것:
 *  - 연결이 하나도 없으면 요청서는 예전과 **글자 하나까지** 같다(기준선 불변).
 *  - 연결이 있으면 근거에 번호가 붙고, 차례는 연결을 따른다(분기·합류 모두). 연결 줄은 실린 번호만 가리킨다.
 *  - 빠진 근거(선생님 제외·금지어)를 가리키는 연결은 조용히 빠지고 `linkCount` 에 안 센다.
 *  - 고리는 `cyclicLinks` 로 알린다.
 *  - AI 가 적은 설명은 그렇다고 밝힌다. 설명 없는 연결을 인과로 단정하지 말라는 지시가 붙는다.
 *  - 장면이 있으면 장면 차례가 우선이고 연결 줄은 그 번호를 쓴다.
 */
import { describe, it, expect } from 'vitest';
import {
  buildRecordDraftPack,
  type DraftPackEvidence,
  type DraftPackInput,
} from '@domain/services/recordDraftPack';
import { rosterFromAll } from '@domain/rules/redactOutbound';
import { resolveCompositionFromScenes } from '@domain/rules/narrativeComposition';
import { makeScene } from '@domain/rules/narrativeScenes';

const ROSTER = rosterFromAll([{ name: '김지훈', studentNumber: 15 }], []);

function ev(p: Partial<DraftPackEvidence> & { id: string }): DraftPackEvidence {
  return { content: `근거 ${p.id} 내용`, ...p };
}

function input(p: Partial<DraftPackInput> = {}): DraftPackInput {
  return {
    studentName: '김지훈',
    roster: ROSTER,
    areaLabel: '교과 세부능력 및 특기사항',
    evidences: [],
    ...p,
  };
}

describe('연결이 없을 때', () => {
  it('links 칸이 비어 있거나 없으면 요청서가 같다', () => {
    const a = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1', date: '2026-05-01' }), ev({ id: 'e2' })] }),
    );
    const b = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1', date: '2026-05-01', links: [] }), ev({ id: 'e2' })] }),
    );
    expect(b.text).toBe(a.text);
    expect(a.linkCount).toBe(0);
    expect(a.cyclicLinks).toBe(false);
    expect(a.text).not.toContain('근거 사이 연결');
    expect(a.text).toContain('- (2026-05-01) 근거 e1 내용'); // 번호 없는 옛 줄 모양
  });

  it('상대가 꾸러미에 없는 연결만 있으면 역시 예전과 같다', () => {
    const a = buildRecordDraftPack(input({ evidences: [ev({ id: 'e1' })] }));
    const b = buildRecordDraftPack(
      input({ evidences: [ev({ id: 'e1', links: [{ toId: 'ghost' }] })] }),
    );
    expect(b.text).toBe(a.text);
  });
});

describe('연결이 있을 때', () => {
  it('번호가 붙고 차례는 연결을 따른다 — 분기·합류를 직렬로 오해하지 않는다', () => {
    // 날짜는 거꾸로: d 가 가장 이르다. 연결 A→B, A→C, B→D, C→D.
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'd', date: '2026-03-01' }),
          ev({ id: 'c', date: '2026-03-02', links: [{ toId: 'd' }] }),
          ev({ id: 'b', date: '2026-03-03', links: [{ toId: 'd', note: '뒷받침' }] }),
          ev({
            id: 'a',
            date: '2026-03-04',
            links: [{ toId: 'b' }, { toId: 'c', note: '다른 모습' }],
          }),
        ],
      }),
    );
    const lines = pack.text.split('\n');
    const at = (s: string) => lines.findIndex((l) => l.includes(s));
    expect(at('1. (2026-03-04) 근거 a')).toBeGreaterThan(-1);
    expect(at('2. (2026-03-02) 근거 c')).toBeGreaterThan(-1);
    expect(at('3. (2026-03-03) 근거 b')).toBeGreaterThan(-1);
    expect(at('4. (2026-03-01) 근거 d')).toBeGreaterThan(-1);
    expect(pack.text).toContain('근거 사이 연결(선생님이 표시한 관련성):');
    expect(pack.text).toContain('- 1 → 3');
    expect(pack.text).toContain('- 1 → 2: 다른 모습');
    expect(pack.text).toContain('- 3 → 4: 뒷받침');
    expect(pack.text).toContain('- 2 → 4');
    expect(pack.text).toContain('인과관계로 단정하지 마세요');
    expect(pack.linkCount).toBe(4);
    expect(pack.cyclicLinks).toBe(false);
    expect(pack.includedCount).toBe(4);
  });

  it('빠진 근거를 가리키는 연결은 줄이 안 생기고 세지 않는다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'a', links: [{ toId: 'b' }, { toId: 'c' }] }),
          ev({ id: 'b', excludedFromAi: true }),
          ev({ id: 'c' }),
        ],
      }),
    );
    expect(pack.linkCount).toBe(1);
    expect(pack.text).toContain('- 1 → 2');
    expect(pack.text.match(/^- \d+ → \d+/gm)).toHaveLength(1);
  });

  it('고리는 cyclicLinks 로 알리고 근거는 하나도 빠지지 않는다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'a', date: '2026-01-01', links: [{ toId: 'b' }] }),
          ev({ id: 'b', date: '2026-01-02', links: [{ toId: 'a' }] }),
        ],
      }),
    );
    expect(pack.cyclicLinks).toBe(true);
    expect(pack.includedCount).toBe(2);
    expect(pack.linkCount).toBe(2);
  });

  it('AI 가 적은 설명은 그렇다고 밝히고, 설명도 가려진다', () => {
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'a', links: [{ toId: 'b', note: '김지훈이 달라짐', source: 'ai' }] }),
          ev({ id: 'b' }),
        ],
      }),
    );
    expect(pack.text).toContain('- 1 → 2: ［이름1］이 달라짐 (AI 가 제안한 설명)');
    expect(pack.text).not.toContain('김지훈');
  });

  it('장면이 있으면 장면 차례가 우선이고 연결 줄은 그 번호를 쓴다', () => {
    const saved = [
      makeScene('sc1', 'evaluation', { moduleId: 'teacherJudgement' }),
      makeScene('sc2', 'motive', { moduleId: 'legacyMotive' }),
      makeScene('sc3', 'process', { moduleId: 'legacyProcess' }),
    ];
    const resolved = [
      { ...saved[0]!, evidenceIds: [] as string[] },
      { ...saved[1]!, evidenceIds: ['b'] },
      { ...saved[2]!, evidenceIds: ['a'] },
    ];
    const composition = resolveCompositionFromScenes({
      saved: resolved,
      resolved,
      frame: 'inquiry',
      chained: false,
      placedCount: 2,
    });
    if (composition === null) throw new Error('테스트 전제: 구성이 만들어져야 한다');
    const pack = buildRecordDraftPack(
      input({
        evidences: [
          ev({ id: 'a', date: '2026-01-02', links: [{ toId: 'b', note: '변화' }] }),
          ev({ id: 'b', date: '2026-01-01' }),
        ],
        composition,
        scenes: resolved.map((sc) => ({
          sceneId: sc.id,
          mark: sc.role,
          label: sc.role,
          evidenceIds: sc.evidenceIds,
        })),
      }),
    );
    // 장면 경로의 번호(b 가 1번, a 가 2번)를 연결 줄이 그대로 쓴다 → 2 → 1.
    expect(pack.text).toContain('1. (2026-01-01) 근거 b');
    expect(pack.text).toContain('2. (2026-01-02) 근거 a');
    expect(pack.text).toContain('- 2 → 1: 변화');
    expect(pack.linkCount).toBe(1);
  });
});
