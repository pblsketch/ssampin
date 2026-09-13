import { describe, expect, it } from 'vitest';

import type { NarrativeScene } from '@domain/entities/InquiryThread';
import {
  countLeadInChecks,
  markLeadInRecheck,
  placeSceneAfter,
  stepScene,
} from '@domain/rules/narrativeSceneOrder';

const scene = (id: string, patch: Partial<NarrativeScene> = {}): NarrativeScene => ({
  id,
  role: 'process',
  evidenceIds: [],
  ...patch,
});

/** A → B → C → D, B·C·D 에 이음말이 있다. */
const base = (): readonly NarrativeScene[] => [
  scene('A', { role: 'evaluation' }),
  scene('B', { leadIn: 'A에서 B로' }),
  scene('C', { leadIn: 'B에서 C로' }),
  scene('D', { leadIn: 'C에서 D로', role: 'result' }),
];

describe('placeSceneAfter', () => {
  it('A 다음에 D 를 놓으면 A → D → B → C 가 된다', () => {
    const out = placeSceneAfter(base(), 'A', 'D');
    expect(out?.scenes.map((s) => s.id)).toEqual(['A', 'D', 'B', 'C']);
  });

  it('앞 장면이 달라진 이음말에만 확인 표시를 붙인다', () => {
    const out = placeSceneAfter(base(), 'A', 'D');
    // D 의 앞은 C→A, B 의 앞은 A→D 로 바뀐다. C 의 앞은 B 그대로다.
    expect(out?.recheckedIds.slice().sort()).toEqual(['B', 'D']);
    const byId = new Map(out!.scenes.map((s) => [s.id, s]));
    expect(byId.get('C')?.leadInNeedsCheck).toBeUndefined();
    expect(byId.get('D')?.leadInNeedsCheck).toBe(true);
  });

  it('이음말을 지우지 않는다 — 글은 그대로 두고 확인만 요청한다', () => {
    const out = placeSceneAfter(base(), 'A', 'D');
    const byId = new Map(out!.scenes.map((s) => [s.id, s]));
    expect(byId.get('D')?.leadIn).toBe('C에서 D로');
    expect(byId.get('B')?.leadIn).toBe('A에서 B로');
  });

  it('근거·메모·장면 id 는 하나도 바뀌지 않는다', () => {
    const scenes = [
      scene('A', { role: 'evaluation', note: '판단' }),
      scene('B', { evidenceIds: ['e1', 'e2'], note: '비교' }),
      scene('C', { evidenceIds: ['e2'], evidenceFocus: [{ evidenceId: 'e2', note: '결론' }] }),
    ];
    const out = placeSceneAfter(scenes, 'A', 'C');
    expect(out?.scenes.map((s) => s.evidenceIds)).toEqual([[], ['e2'], ['e1', 'e2']]);
    expect(out?.scenes[1]?.evidenceFocus).toEqual([{ evidenceId: 'e2', note: '결론' }]);
    expect(out?.scenes.map((s) => s.note)).toEqual(['판단', undefined, '비교']);
  });

  it('자기 자신·없는 장면·이미 바로 다음이면 아무것도 하지 않는다', () => {
    expect(placeSceneAfter(base(), 'A', 'A')).toBeNull();
    expect(placeSceneAfter(base(), 'A', '없음')).toBeNull();
    expect(placeSceneAfter(base(), '없음', 'B')).toBeNull();
    expect(placeSceneAfter(base(), 'A', 'B')).toBeNull();
  });

  it('뒤에서 앞으로도 옮긴다 — D 다음에 A 를 놓으면 B → C → D → A', () => {
    const out = placeSceneAfter(base(), 'D', 'A');
    expect(out?.scenes.map((s) => s.id)).toEqual(['B', 'C', 'D', 'A']);
  });

  it('★맨 앞으로 온 장면에는 확인 표시를 붙이지 않는다 — 풀 길이 없는 표시를 만들지 않는다', () => {
    // D 다음에 A 를 놓으면 B 가 첫 장면이 된다.
    const out = placeSceneAfter(base(), 'D', 'A');
    const byId = new Map(out!.scenes.map((s) => [s.id, s]));
    expect(byId.get('B')?.leadInNeedsCheck).toBeUndefined();
    expect(byId.get('B')?.leadIn).toBe('A에서 B로');
  });
});

describe('stepScene', () => {
  it('한 칸 뒤로 밀면 차례가 바뀌고 같은 검토 규칙을 지난다', () => {
    const out = stepScene(base(), 'B', 1);
    expect(out?.scenes.map((s) => s.id)).toEqual(['A', 'C', 'B', 'D']);
    expect(out?.recheckedIds.slice().sort()).toEqual(['B', 'C', 'D']);
  });

  it('끝에서 더 밀면 null — 저장하지 않는다', () => {
    expect(stepScene(base(), 'A', -1)).toBeNull();
    expect(stepScene(base(), 'D', 1)).toBeNull();
    expect(stepScene(base(), '없음', 1)).toBeNull();
  });
});

describe('markLeadInRecheck', () => {
  it('이음말이 없는 장면은 앞이 바뀌어도 확인 대상이 아니다', () => {
    const before = [scene('A'), scene('B'), scene('C')];
    const out = markLeadInRecheck(before, [before[2]!, before[0]!, before[1]!]);
    expect(out.recheckedIds).toEqual([]);
    expect(out.scenes.every((s) => s.leadInNeedsCheck === undefined)).toBe(true);
  });

  it('차례가 그대로면 아무것도 붙지 않는다', () => {
    const before = base();
    const out = markLeadInRecheck(before, before);
    expect(out.recheckedIds).toEqual([]);
  });
});

describe('countLeadInChecks', () => {
  it('확인 대기 중인 이음말 수를 센다', () => {
    const out = placeSceneAfter(base(), 'A', 'D');
    expect(countLeadInChecks(out!.scenes)).toBe(2);
    expect(countLeadInChecks(base())).toBe(0);
  });
});
