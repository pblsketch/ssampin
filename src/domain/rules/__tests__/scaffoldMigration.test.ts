/**
 * 옛 작성 방식 → 뼈대 옮기기 검사(ADR-103).
 *
 * ★여기서 지키는 것은 "뜻이 어디로 갔는지 말할 수 있는가"다. 조용히 바뀌는 값이 하나라도 있으면
 *   선생님은 초안이 왜 달라졌는지 진단할 수 없다(계획서 §8).
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RECORD_WRITING_STYLE,
  type RecordStylePreset,
  type RecordWritingStyle,
} from '@domain/entities/RecordWritingStyle';
import {
  frameOfFocus,
  isDefaultStyle,
  migrateStylesToScaffolds,
  scaffoldScenesFromStyle,
} from '@domain/rules/scaffoldMigration';

const style = (over: Partial<RecordWritingStyle> = {}): RecordWritingStyle => ({
  ...DEFAULT_RECORD_WRITING_STYLE,
  ...over,
});

const preset = (name: string, s: RecordWritingStyle): RecordStylePreset => ({
  id: `p-${name}`,
  name,
  style: s,
  catalogVersion: 2,
  createdAt: 1,
  updatedAt: 1,
});

it('추가 지시만 있던 기본 작성 방식도 안내한다', () => {
  const migrated = migrateStylesToScaffolds({
    styles: { subject: style({ instruction: '교사 관찰 중심으로' }) },
    now: 1,
  });
  expect(migrated.notices.some((notice) => notice.includes('추가 지시'))).toBe(true);
});

describe('scaffoldScenesFromStyle — 작성 방식 하나를 장면 배열로', () => {
  it('기본값은 평가가 맨 앞이고 동기·과정·결과가 뒤따른다', () => {
    const scenes = scaffoldScenesFromStyle(DEFAULT_RECORD_WRITING_STYLE);
    expect(scenes.map((s) => s.role)).toEqual(['evaluation', 'motive', 'process', 'result']);
    expect(scenes.map((s) => s.moduleId)).toEqual([
      'teacherJudgement',
      'legacyMotive',
      'legacyProcess',
      'legacyResult',
    ]);
  });

  it('수행으로 여는 방식은 평가가 맨 뒤로 간다', () => {
    const scenes = scaffoldScenesFromStyle(style({ opening: 'performance' }));
    expect(scenes[scenes.length - 1]?.role).toBe('evaluation');
    expect(scenes[0]?.role).toBe('motive');
  });

  it('질문으로 여는 방식은 첫 동기 장면을 맨 앞에 세우고 평가를 맨 뒤로 보낸다', () => {
    // 피드백·수정 초점은 본문이 동기(첫 수행) → 과정 둘 → 결과 순서다.
    const scenes = scaffoldScenesFromStyle(style({ focus: 'feedbackRevise', opening: 'question' }));
    expect(scenes[0]?.moduleId).toBe('firstAttempt');
    expect(scenes[scenes.length - 1]?.role).toBe('evaluation');
  });

  it('뺀 요소는 빠지고 더한 요소는 뒤에 붙는다', () => {
    const scenes = scaffoldScenesFromStyle(
      style({ disabledModules: ['legacyProcess'], extraModules: ['conceptUsed'] }),
    );
    const ids = scenes.map((s) => s.moduleId);
    expect(ids).not.toContain('legacyProcess');
    expect(ids[ids.length - 1]).toBe('conceptUsed');
  });

  it('그 초점이 허락하지 않은 요소를 더해 두었어도 넣지 않는다', () => {
    const scenes = scaffoldScenesFromStyle(style({ extraModules: ['makingExecution'] }));
    expect(scenes.map((s) => s.moduleId)).not.toContain('makingExecution');
  });

  it('★행동특성은 생활 틀의 자리표를 따른다 — 카탈로그 색으로 세 장면이 과정에 몰리지 않는다', () => {
    expect(frameOfFocus('lifeRelation')).toBe('life');
    const scenes = scaffoldScenesFromStyle(style({ focus: 'lifeRelation' }));
    expect(scenes.map((s) => s.role)).toEqual(['evaluation', 'motive', 'process', 'result']);
    expect(scenes.map((s) => s.moduleId)).toEqual([
      'teacherJudgement',
      'repeatedTrait',
      'lifeScenes',
      'selfAndRelation',
    ]);
  });

  it('평가 장면은 어느 경우에도 정확히 하나다', () => {
    for (const opening of ['evaluation', 'performance', 'question'] as const) {
      const scenes = scaffoldScenesFromStyle(style({ opening }));
      expect(scenes.filter((s) => s.role === 'evaluation')).toHaveLength(1);
    }
  });
});

describe('isDefaultStyle', () => {
  it('기본값은 옮길 것이 없다', () => {
    expect(isDefaultStyle(DEFAULT_RECORD_WRITING_STYLE)).toBe(true);
    expect(isDefaultStyle(style({ disabledModules: [] }))).toBe(true);
  });

  it('한 축이라도 다르면 옮긴다', () => {
    expect(isDefaultStyle(style({ opening: 'question' }))).toBe(false);
    expect(isDefaultStyle(style({ grouping: 'single' }))).toBe(false);
    expect(isDefaultStyle(style({ extraModules: ['conceptUsed'] }))).toBe(false);
  });
});

describe('migrateStylesToScaffolds — 한 번만', () => {
  it('옮긴 적이 있으면 아무것도 하지 않는다', () => {
    const r = migrateStylesToScaffolds({
      presets: [preset('내 방식', style({ opening: 'question' }))],
      migratedAt: 5,
      now: 10,
    });
    expect(r.changed).toBe(false);
    expect(r.scaffolds).toHaveLength(0);
    expect(r.notices).toHaveLength(0);
  });

  it('저장된 것이 하나도 없어도 옮기기는 성립한다(빈 결과 + 알릴 것 없음)', () => {
    const r = migrateStylesToScaffolds({ now: 10 });
    expect(r.changed).toBe(true);
    expect(r.scaffolds).toHaveLength(0);
    expect(r.notices).toHaveLength(0);
    expect(r.areaScaffolds).toEqual({});
  });

  it('내 작성 방식은 같은 이름의 뼈대가 된다', () => {
    const r = migrateStylesToScaffolds({
      presets: [preset('우리 반 탐구', style({ focus: 'compareJudge' }))],
      now: 10,
    });
    expect(r.scaffolds).toHaveLength(1);
    expect(r.scaffolds[0]?.name).toBe('우리 반 탐구');
    expect(r.scaffolds[0]?.frame).toBe('inquiry');
    expect(r.scaffolds[0]?.id).toBe('scaffold-10-1');
  });

  it('이름이 겹치면 번호를 붙여 갈라 둔다', () => {
    const r = migrateStylesToScaffolds({
      presets: [preset('같은 이름', style()), preset('같은 이름', style({ opening: 'question' }))],
      now: 10,
    });
    expect(r.scaffolds.map((s) => s.name)).toEqual(['같은 이름', '같은 이름 (2)']);
  });

  it('영역별 마지막 선택이 비기본이면 그 영역 뼈대로 옮기고 한 번 알린다', () => {
    const r = migrateStylesToScaffolds({
      styles: { subject: style({ focus: 'designCreate' }), behavior: DEFAULT_RECORD_WRITING_STYLE },
      now: 10,
    });
    expect(Object.keys(r.areaScaffolds)).toEqual(['subject']);
    expect(r.scaffolds).toHaveLength(1);
    expect(r.areaScaffolds['subject']).toBe(r.scaffolds[0]?.id);
    expect(r.notices[0]).toContain('뼈대로 옮겼습니다');
    // 기본값 영역은 옮길 것이 없다.
    expect(r.notices.join(' ')).not.toContain('behavior');
  });

  it('★묶는 방식이 반대로 바뀌는 것은 말로 알린다 — 같은 사유는 한 번만', () => {
    const r = migrateStylesToScaffolds({
      presets: [
        preset('A', style({ grouping: 'byAchievement' })),
        preset('B', style({ grouping: 'byAchievement' })),
        preset('C', style({ grouping: 'single' })),
      ],
      now: 10,
    });
    const joined = r.notices.join('\n');
    expect(joined).toContain('성취기준별로 묶기');
    expect(joined).toContain('하나씩 따로 쓰기');
    expect(r.notices.filter((n) => n.includes('성취기준별로 묶기'))).toHaveLength(1);
  });

  it('묶는 방식이 기본(이어 쓰기)이면 알릴 것이 없다', () => {
    const r = migrateStylesToScaffolds({
      presets: [preset('A', style({ opening: 'question' }))],
      now: 10,
    });
    expect(r.notices).toHaveLength(0);
  });

  it('추가 지시는 뼈대에 담기지 않고 어디에 적을지 알린다', () => {
    const r = migrateStylesToScaffolds({
      presets: [preset('A', style({ instruction: '실험 안전 수칙을 꼭 넣어 주세요' }))],
      now: 10,
    });
    expect(JSON.stringify(r.scaffolds)).not.toContain('실험 안전');
    expect(r.notices.join('\n')).toContain('「+ 한마디」');
  });

  it('이미 갖고 있던 뼈대는 지우지 않고 뒤에 붙인다', () => {
    const r = migrateStylesToScaffolds({
      scaffolds: [{ id: 'keep', name: '먼저 있던 것', frame: 'inquiry', scenes: [] }],
      presets: [preset('나중 것', style())],
      now: 10,
    });
    expect(r.scaffolds.map((s) => s.id)).toEqual(['keep', 'scaffold-10-1']);
  });
});
