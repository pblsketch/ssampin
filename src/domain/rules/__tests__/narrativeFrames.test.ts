/**
 * 틀 자리표(ADR-103) — 여기서 지키는 것 셋.
 *
 * 1. **카탈로그 요소가 하나도 빠지지 않는다.** 재배치가 조용한 삭제로 변질되면 저장된 뼈대가
 *    갈 곳을 잃는다(§8 이 금지한 "조용한 강등").
 * 2. **카탈로그의 `role` 은 손대지 않는다.** 그 값은 폴백 경로가 읽는다 — 옮기면 저장된
 *    「내 작성 방식」의 요청서 문장이 조용히 달라진다.
 * 3. **평가 장면은 정확히 하나.** 뼈대는 설정 파일에 있어 주제 관문이 못 막는 두 번째 문이다.
 */
import { describe, it, expect } from 'vitest';
import {
  FRAME_SLOTS,
  builtInScaffolds,
  defaultModuleFor,
  defaultScaffoldScenes,
  frameForArea,
  frameRoleLabel,
  moduleFitsSlot,
  normalizeScaffoldScenes,
  sceneDisplayLabel,
  NARRATIVE_FRAME_ROLES,
} from '../narrativeFrames';
import { RECORD_FOCUSES, RECORD_MODULES } from '../recordStyleCatalog';
import type { RecordModuleId } from '../../entities/RecordWritingStyle';

describe('자리표는 카탈로그를 하나도 빠뜨리지 않는다', () => {
  it('두 틀을 합치면 요소 41개가 전부 들어 있다 (탐구 32 + 생활 10, 교사 판단 겹침)', () => {
    const inquiry = NARRATIVE_FRAME_ROLES.flatMap((r) => FRAME_SLOTS.inquiry[r]);
    const life = NARRATIVE_FRAME_ROLES.flatMap((r) => FRAME_SLOTS.life[r]);
    // 각 틀 안에서 같은 요소가 두 자리에 놓이면 안 된다.
    expect(new Set(inquiry).size).toBe(inquiry.length);
    expect(new Set(life).size).toBe(life.length);
    const all = Object.keys(RECORD_MODULES) as RecordModuleId[];
    // 기존 35 + 생활 틀 신설 6(ADR-103).
    expect(all).toHaveLength(41);
    const placed = new Set([...inquiry, ...life]);
    expect(all.filter((id) => !placed.has(id))).toEqual([]);
    // 탐구 32(=41 - 행특 전용 9), 생활 10(행특 9 + 교사 판단). 교사 판단은 두 틀이 나눠 쓴다.
    expect(inquiry).toHaveLength(32);
    expect(life).toHaveLength(10);
  });

  it('★생활 틀 자리는 특성·장면·성장·평가다 — 신설 6종이 자리마다 둘씩 붙는다', () => {
    // 자리 이름은 화면 전용이고, 저장값은 형광펜 4색 그대로다(motive·process·result·evaluation).
    expect(FRAME_SLOTS.life.motive).toEqual([
      'repeatedTrait',
      'learningAttitude',
      'careerInterest',
    ]);
    expect(FRAME_SLOTS.life.process).toEqual(['lifeScenes', 'classRole', 'characterRelation']);
    expect(FRAME_SLOTS.life.result).toEqual(['selfAndRelation', 'changeOverTime', 'regretPoint']);
    expect(FRAME_SLOTS.life.evaluation).toEqual(['teacherJudgement']);
  });

  it('★신설 6종은 어느 초점의 기본 구성에도 안 들어간다 (폴백 요청서 불변)', () => {
    const added: RecordModuleId[] = [
      'learningAttitude',
      'careerInterest',
      'classRole',
      'characterRelation',
      'changeOverTime',
      'regretPoint',
    ];
    for (const focus of RECORD_FOCUSES) {
      for (const id of added) {
        expect(focus.body).not.toContain(id);
        expect(focus.extras).not.toContain(id);
      }
    }
  });

  it('자리마다 최소 하나는 있다 — 기본 카테고리를 못 고르는 자리가 없다', () => {
    for (const frame of ['inquiry', 'life'] as const) {
      for (const role of NARRATIVE_FRAME_ROLES) {
        expect(FRAME_SLOTS[frame][role].length).toBeGreaterThan(0);
        expect(moduleFitsSlot(frame, role, defaultModuleFor(frame, role))).toBe(true);
      }
    }
  });
});

describe('★카탈로그의 role 은 이 기능이 손대지 않는다 (폴백 요청서 불변)', () => {
  it('폴백이 읽는 다섯 요소는 여전히 process 다', () => {
    for (const id of [
      'lessonContext',
      'firstAttempt',
      'repeatedTrait',
      'lifeScenes',
      'selfAndRelation',
    ] as const) {
      expect(RECORD_MODULES[id].role).toBe('process');
    }
  });
});

describe('틀은 영역이 정한다 — 선생님이 고르지 않는다', () => {
  it('행동특성이면 생활 틀, 나머지는 탐구 틀', () => {
    expect(frameForArea('behavior')).toBe('life');
    for (const a of ['subject', 'subjectDev', 'autonomy', 'career', 'club']) {
      expect(frameForArea(a)).toBe('inquiry');
    }
  });

  it('자리 이름은 틀마다 다르고 저장값은 같다', () => {
    expect(frameRoleLabel('inquiry', 'motive')).toBe('동기');
    expect(frameRoleLabel('life', 'motive')).toBe('특성');
    expect(frameRoleLabel('life', 'result')).toBe('성장');
    // 평가는 두 틀에서 같은 이름이다.
    expect(frameRoleLabel('life', 'evaluation')).toBe(frameRoleLabel('inquiry', 'evaluation'));
  });
});

describe('뼈대 정규화 — 평가 장면은 정확히 하나', () => {
  it('평가가 없으면 맨 앞에 세운다', () => {
    const out = normalizeScaffoldScenes('inquiry', [
      { role: 'motive', moduleId: 'legacyMotive' },
      { role: 'process', moduleId: 'legacyProcess' },
    ]);
    expect(out.map((s) => s.role)).toEqual(['evaluation', 'motive', 'process']);
  });

  it('평가가 둘이면 첫 것만 남기고 자리는 지킨다', () => {
    const out = normalizeScaffoldScenes('inquiry', [
      { role: 'motive', moduleId: 'legacyMotive' },
      { role: 'evaluation', moduleId: 'teacherJudgement' },
      { role: 'result', moduleId: 'legacyResult' },
      { role: 'evaluation', moduleId: 'teacherJudgement' },
    ]);
    expect(out.map((s) => s.role)).toEqual(['motive', 'evaluation', 'result']);
  });

  it('평가가 맨 뒤였으면 맨 뒤에 남는다 (시작 방식이 흡수된 자리)', () => {
    const out = normalizeScaffoldScenes('inquiry', [
      { role: 'motive', moduleId: 'legacyMotive' },
      { role: 'result', moduleId: 'legacyResult' },
      { role: 'evaluation', moduleId: 'teacherJudgement' },
    ]);
    expect(out.map((s) => s.role)).toEqual(['motive', 'result', 'evaluation']);
  });
});

describe('내장 뼈대는 초점 카탈로그가 정본이다', () => {
  it('7종이고 이름이 초점 이름과 같다', () => {
    const built = builtInScaffolds();
    expect(built).toHaveLength(7);
    expect(built.every((s) => s.builtIn === true)).toBe(true);
    expect(built.map((s) => s.name)).toContain('질문에서 출발한 탐구 흐름 (기본)');
  });

  it('행특 뼈대만 생활 틀이다', () => {
    const life = builtInScaffolds().filter((s) => s.frame === 'life');
    expect(life).toHaveLength(1);
    expect(life[0]?.id).toBe('builtin:lifeRelation');
  });

  it('모든 내장 뼈대에 평가 장면이 정확히 하나 있다', () => {
    for (const s of builtInScaffolds()) {
      expect(s.scenes.filter((x) => x.role === 'evaluation')).toHaveLength(1);
    }
  });

  it('기본 뼈대는 평가 → 동기 → 과정 → 결과 다 (오늘의 기본 순서)', () => {
    expect(defaultScaffoldScenes().map((s) => s.moduleId)).toEqual([
      'teacherJudgement',
      'legacyMotive',
      'legacyProcess',
      'legacyResult',
    ]);
  });
});

describe('장면 이름', () => {
  it('직접 적은 이름 > 카테고리 이름 > 자리 이름 순으로 쓴다', () => {
    expect(
      sceneDisplayLabel('inquiry', { id: 's', role: 'process', label: '내 이름', evidenceIds: [] }),
    ).toBe('내 이름');
    expect(
      sceneDisplayLabel('inquiry', {
        id: 's',
        role: 'process',
        moduleId: 'feedbackReceived',
        evidenceIds: [],
      }),
    ).toBe(RECORD_MODULES.feedbackReceived.label);
    expect(sceneDisplayLabel('life', { id: 's', role: 'result', evidenceIds: [] })).toBe('성장');
  });
});
