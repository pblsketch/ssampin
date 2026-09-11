/**
 * 구성 관문(ADR-103) — 장면이 「작성 구성」을 **만들어 내되**, 기본이면 아무것도 안 만든다.
 *
 * 여기서 지키는 것:
 *  - 부재·빈 배열·기본 뼈대는 `null`(요청서가 기준선과 같아진다)
 *  - 배치가 1건이라도 있으면 기본 뼈대라도 구성을 만든다(근거 관문이 구성 관문을 켠다)
 *  - 카탈로그의 `role` 은 손대지 않고 장면의 자리를 덮어쓴다
 *  - 판본이 모자라면 **아예 안 보낸다**(장면은 되돌릴 기존형이 없다)
 */
import { describe, it, expect } from 'vitest';
import {
  alignParagraphsToScenes,
  applyCompositionVersionGate,
  narrativeStyleStamp,
  resolveCompositionFromScenes,
  scenesMissingFromDraft,
} from '../narrativeComposition';
import { defaultScaffoldScenes } from '../narrativeFrames';
import { makeScene } from '../narrativeScenes';
import { RECORD_MODULES } from '../recordStyleCatalog';
import type { NarrativeScene } from '../../entities/InquiryThread';

const BASE: NarrativeScene[] = defaultScaffoldScenes().map((s, i) =>
  makeScene(`s${i}`, s.role, s.moduleId === undefined ? {} : { moduleId: s.moduleId }),
);

function compose(
  saved: readonly NarrativeScene[] | undefined,
  opts: { placedCount?: number; chained?: boolean; frame?: 'inquiry' | 'life' } = {},
) {
  return resolveCompositionFromScenes({
    saved,
    resolved: saved ?? [],
    frame: opts.frame ?? 'inquiry',
    chained: opts.chained ?? false,
    placedCount: opts.placedCount ?? 0,
  });
}

describe('구성 관문 — 기본이면 아무것도 만들지 않는다', () => {
  it('★장면이 없으면 null (기존 사용자 전원이 이 경우다)', () => {
    expect(compose(undefined)).toBeNull();
    expect(compose([])).toBeNull();
  });

  it('기본 뼈대만 깔고 근거를 안 놓았으면 null', () => {
    expect(compose(BASE)).toBeNull();
  });

  it('★근거가 1건이라도 놓이면 기본 뼈대라도 구성을 만든다', () => {
    const c = compose(BASE, { placedCount: 1 });
    expect(c).not.toBeNull();
    expect(c?.shouldEmitComposition).toBe(true);
    expect(c?.modules).toHaveLength(BASE.length);
  });

  it('주제가 이어져 있으면 배치가 0이어도 구성을 만든다 (이음말을 보내야 한다)', () => {
    expect(compose(BASE, { chained: true })).not.toBeNull();
  });

  it('메모를 적었으면 구성을 만든다', () => {
    const withNote = BASE.map((s, i) => (i === 1 ? { ...s, note: '내가 읽은 것' } : s));
    expect(compose(withNote)).not.toBeNull();
  });
});

describe('장면 → 요소', () => {
  it('장면의 자리가 요소의 역할을 덮어쓴다 (카탈로그는 그대로)', () => {
    // 카탈로그에서 `lessonContext` 는 process 다. 동기 자리에 놓으면 동기로 나가야 한다.
    const scenes = [
      makeScene('a', 'motive', { moduleId: 'lessonContext' }),
      makeScene('b', 'evaluation', { moduleId: 'teacherJudgement' }),
    ];
    const c = resolveCompositionFromScenes({
      saved: scenes,
      resolved: scenes,
      frame: 'inquiry',
      chained: false,
      placedCount: 1,
    });
    expect(c?.modules[0]?.role).toBe('motive');
    // 카탈로그 원본은 안 바뀐다 — 폴백 경로가 읽는 값이다.
    expect(RECORD_MODULES.lessonContext.role).toBe('process');
  });

  it('카테고리를 안 골랐으면 그 자리의 기본 요소를 쓴다', () => {
    const scenes = [makeScene('a', 'process')];
    const c = resolveCompositionFromScenes({
      saved: scenes,
      resolved: scenes,
      frame: 'life',
      chained: false,
      placedCount: 1,
    });
    expect(c?.modules[0]?.id).toBe('lifeScenes');
  });

  it('직접 적은 이름은 이름만 바꾸고 지침은 검증된 것을 그대로 쓴다', () => {
    const scenes = [makeScene('a', 'process', { moduleId: 'legacyProcess', label: '내 이름' })];
    const c = resolveCompositionFromScenes({
      saved: scenes,
      resolved: scenes,
      frame: 'inquiry',
      chained: false,
      placedCount: 1,
    });
    expect(c?.modules[0]?.label).toBe('내 이름');
    expect(c?.modules[0]?.purpose).toBe(RECORD_MODULES.legacyProcess.purpose);
  });

  it('첫 장면이 평가면 어미 요구가 켜진다', () => {
    const evalFirst = [makeScene('a', 'evaluation'), makeScene('b', 'process')];
    const evalLast = [makeScene('b', 'process'), makeScene('a', 'evaluation')];
    const mk = (sc: NarrativeScene[]) =>
      resolveCompositionFromScenes({
        saved: sc,
        resolved: sc,
        frame: 'inquiry',
        chained: false,
        placedCount: 1,
      });
    expect(mk(evalFirst)?.firstIsEvaluation).toBe(true);
    expect(mk(evalLast)?.firstIsEvaluation).toBe(false);
  });
});

describe('★판본 문지기 — 장면은 되돌릴 기존형이 없다', () => {
  const c = compose(BASE, { placedCount: 1 });

  it('판본이 모자라면 아예 안 보낸다', () => {
    const r = applyCompositionVersionGate(c, 2);
    expect(r.composition).toBeNull();
    expect(r.downgraded).toBe(true);
  });

  it('판본이 충분하면 그대로 보낸다', () => {
    expect(applyCompositionVersionGate(c, 3).composition).not.toBeNull();
    expect(applyCompositionVersionGate(c, 3).downgraded).toBe(false);
  });

  it('판본을 아직 못 받았으면 막지 않는다 (실행 직전에 다시 본다)', () => {
    expect(applyCompositionVersionGate(c, undefined).downgraded).toBe(false);
  });

  it('원래 null 이면 강등도 없다', () => {
    expect(applyCompositionVersionGate(null, 2)).toEqual({ composition: null, downgraded: false });
  });
});

describe('판 발자국 — 자유 글은 담지 않는다', () => {
  const scenes = [
    makeScene('a', 'evaluation', { moduleId: 'teacherJudgement', note: '학생 이름이 적힌 메모' }),
    makeScene('b', 'process', { label: '내가 지은 이름' }),
  ];
  const stamp = narrativeStyleStamp(scenes, 'inquiry', false);

  it('자리 순서와 카탈로그 id 만 남는다', () => {
    expect(stamp.sceneRoles).toEqual(['evaluation', 'process']);
    expect(stamp.moduleIds).toEqual(['teacherJudgement', 'legacyProcess']);
    expect(stamp.frame).toBe('inquiry');
  });

  it('★장면 메모·직접 적은 이름은 한 글자도 들어가지 않는다 (판은 동기화된다)', () => {
    const dumped = JSON.stringify(stamp);
    expect(dumped).not.toContain('학생 이름이 적힌 메모');
    expect(dumped).not.toContain('내가 지은 이름');
  });

  it('평가 장면 위치가 시작 방식으로 적힌다', () => {
    expect(stamp.opening).toBe('evaluation');
    expect(narrativeStyleStamp([makeScene('b', 'process')], 'inquiry', false).opening).toBe(
      'performance',
    );
  });
});

describe('문단 ↔ 장면 왕복 (ADR-103 §5-4)', () => {
  const roles = ['evaluation', 'motive', 'process', 'result'] as const;

  it('차례가 그대로면 문단마다 장면 자리를 짚어 준다', () => {
    const marks = [{ role: 'evaluation' as const }, { role: 'motive' as const }];
    expect(alignParagraphsToScenes(marks, roles)).toEqual([0, 1]);
  });

  it('★건너뛴 자리가 있어도 짚는다 — "문단 수 = 장면 수"를 요구하지 않는다', () => {
    const marks = [{ role: 'evaluation' as const }, { role: 'result' as const }];
    expect(alignParagraphsToScenes(marks, roles)).toEqual([0, 3]);
    expect(scenesMissingFromDraft(marks, roles)).toEqual([1, 2]);
  });

  it('★뒤바뀐 문단은 null 이다 — 억지로 가까운 장면에 붙이지 않는다', () => {
    const marks = [{ role: 'result' as const }, { role: 'motive' as const }];
    expect(alignParagraphsToScenes(marks, roles)).toEqual([3, null]);
  });

  it('표식 없는 문단은 null 이고 커서를 움직이지 않는다', () => {
    const marks = [{ role: null }, { role: 'motive' as const }];
    expect(alignParagraphsToScenes(marks, roles)).toEqual([null, 1]);
  });

  it('같은 역할이 잇달아도 앞 자리부터 차례로 짚는다', () => {
    const twoProcess = ['process', 'process', 'result'] as const;
    const marks = [{ role: 'process' as const }, { role: 'process' as const }];
    expect(alignParagraphsToScenes(marks, twoProcess)).toEqual([0, 1]);
    expect(scenesMissingFromDraft(marks, twoProcess)).toEqual([2]);
  });

  it('문단이 하나도 없으면 장면 전부가 빠진 것이다', () => {
    expect(scenesMissingFromDraft([], roles)).toEqual([0, 1, 2, 3]);
  });
});
