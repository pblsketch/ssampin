/**
 * 「내 뼈대」 목록 규칙 검사(ADR-103).
 */
import { describe, expect, it } from 'vitest';

import type { RecordScaffold } from '@domain/rules/narrativeFrames';
import { builtInScaffolds } from '@domain/rules/narrativeFrames';
import {
  RECORD_SCAFFOLD_MAX,
  addScaffold,
  removeScaffold,
  renameScaffold,
  scaffoldChoices,
} from '@domain/rules/recordScaffoldStore';

const mine = (name: string, id = name): RecordScaffold => ({
  id,
  name,
  frame: 'inquiry',
  scenes: [
    { role: 'evaluation', moduleId: 'teacherJudgement' },
    { role: 'motive', moduleId: 'legacyMotive' },
  ],
});

describe('addScaffold', () => {
  it('이름을 붙여 저장하고 새 id 를 돌려준다', () => {
    const r = addScaffold([], {
      name: '  우리 반 흐름  ',
      frame: 'inquiry',
      scenes: [{ role: 'motive', moduleId: 'legacyMotive' }],
      now: 7,
    });
    expect(r.ok).toBe(true);
    expect(r.scaffolds[0]?.name).toBe('우리 반 흐름');
    expect(r.id).toBe('scaffold-7-1');
  });

  it('★저장할 때도 평가 장면을 하나로 맞춘다', () => {
    const r = addScaffold([], {
      name: 'A',
      frame: 'inquiry',
      scenes: [
        { role: 'evaluation', moduleId: 'teacherJudgement' },
        { role: 'motive', moduleId: 'legacyMotive' },
        { role: 'evaluation', moduleId: 'teacherJudgement' },
      ],
      now: 7,
    });
    expect(r.scaffolds[0]?.scenes.filter((s) => s.role === 'evaluation')).toHaveLength(1);
  });

  it('평가가 없던 배열에는 평가를 맨 앞에 세운다', () => {
    const r = addScaffold([], {
      name: 'A',
      frame: 'inquiry',
      scenes: [{ role: 'motive', moduleId: 'legacyMotive' }],
      now: 7,
    });
    expect(r.scaffolds[0]?.scenes[0]?.role).toBe('evaluation');
  });

  it('빈 이름·중복 이름·상한을 막는다', () => {
    expect(addScaffold([], { name: '  ', frame: 'inquiry', scenes: [], now: 1 }).error).toBe(
      'empty-name',
    );
    expect(
      addScaffold([mine('A')], { name: 'A', frame: 'inquiry', scenes: [], now: 1 }).error,
    ).toBe('duplicate-name');
    const full = Array.from({ length: RECORD_SCAFFOLD_MAX }, (_, i) => mine(`n${i}`, `id${i}`));
    expect(addScaffold(full, { name: '새것', frame: 'inquiry', scenes: [], now: 1 }).error).toBe(
      'full',
    );
  });
});

describe('renameScaffold · removeScaffold', () => {
  it('이름을 바꾼다', () => {
    const r = renameScaffold([mine('A')], 'A', '바뀐 이름');
    expect(r.ok).toBe(true);
    expect(r.scaffolds[0]?.name).toBe('바뀐 이름');
  });

  it('중복·빈 이름·없는 id 를 막는다', () => {
    expect(renameScaffold([mine('A'), mine('B')], 'A', 'B').error).toBe('duplicate-name');
    expect(renameScaffold([mine('A')], 'A', ' ').error).toBe('empty-name');
    expect(renameScaffold([mine('A')], 'zzz', 'C').error).toBe('not-found');
  });

  it('★내장 뼈대는 바꾸지도 지우지도 못한다', () => {
    const built = builtInScaffolds();
    const first = built[0]!;
    expect(renameScaffold(built, first.id, '내 마음대로').error).toBe('built-in');
    expect(removeScaffold(built, first.id).error).toBe('built-in');
  });

  it('내가 저장한 것은 지운다', () => {
    const r = removeScaffold([mine('A'), mine('B')], 'A');
    expect(r.ok).toBe(true);
    expect(r.scaffolds.map((s) => s.id)).toEqual(['B']);
  });
});

describe('scaffoldChoices', () => {
  it('내장이 먼저, 내 것이 뒤에 온다', () => {
    const built = builtInScaffolds();
    const r = scaffoldChoices(built, [mine('내 것')], 'inquiry');
    expect(r[0]?.builtIn).toBe(true);
    expect(r[r.length - 1]?.name).toBe('내 것');
  });

  it('★틀이 다른 뼈대는 보이지 않는다 — 행특 자리에 탐구 카테고리가 들어오면 자리와 어긋난다', () => {
    const built = builtInScaffolds();
    const life = scaffoldChoices(built, [mine('탐구용')], 'life');
    expect(life.every((s) => s.frame === 'life')).toBe(true);
    expect(life.map((s) => s.name)).not.toContain('탐구용');
    // 생활 틀 내장은 「한 해 생활과 관계 종합」 하나다.
    expect(life).toHaveLength(1);
  });
});
