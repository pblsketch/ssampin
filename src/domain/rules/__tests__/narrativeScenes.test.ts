/**
 * 장면 읽기 정본(ADR-103) — 두 파일(주제·근거)에 걸친 불변식을 **여기 한 곳에서** 지킨다.
 *
 * 쓰기 관문에서 못 막는 것들이라 이 검사가 유일한 방어선이다:
 *  - 다른 주제로 옮겨진 근거가 옛 장면 자리에 **되살아나는** 것
 *  - 아직 안 내려온 근거를 "없어졌다"고 단정하는 것
 *  - 평가 장면이 0개·2개가 되는 것
 *  - 주제 연결이 고리를 이뤄 무한히 도는 것
 */
import { describe, it, expect } from 'vitest';
import {
  chainOf,
  isDefaultScenes,
  makeScene,
  placedCount,
  scenesOf,
  sceneMarkOf,
  VIRTUAL_EVALUATION_SCENE_ID,
} from '../narrativeScenes';
import { defaultScaffoldScenes } from '../narrativeFrames';
import type { InquiryThread, NarrativeScene } from '../../entities/InquiryThread';

type Ev = { id: string; threadId?: string; date?: string; createdAt?: number };

const ev = (id: string, p: Partial<Ev> = {}): Ev => ({ id, threadId: 't1', ...p });

function thread(
  scenes: readonly NarrativeScene[],
  id = 't1',
): Pick<InquiryThread, 'id' | 'scenes'> {
  return { id, scenes };
}

function scene(id: string, role: NarrativeScene['role'], evidenceIds: string[]): NarrativeScene {
  return { id, role, evidenceIds };
}

describe('scenesOf — 소유가 어긋난 근거는 없는 것처럼 다룬다', () => {
  it('다른 주제로 옮겨진 근거는 옛 장면에 그리지 않는다 (되살아남 방지)', () => {
    const r = scenesOf(
      thread([scene('s1', 'evaluation', []), scene('s2', 'process', ['e1', 'e2'])]),
      [ev('e1'), ev('e2', { threadId: 't-other' })],
      'inquiry',
    );
    expect(r.scenes[1]?.evidences.map((e) => e.id)).toEqual(['e1']);
    expect(r.placedCount).toBe(1);
  });

  it('아직 안 내려온 근거(파일에 없는 id)도 조용히 건너뛴다 — 삭제로 단정하지 않는다', () => {
    const r = scenesOf(
      thread([scene('s1', 'evaluation', []), scene('s2', 'process', ['e1', '아직-없음'])]),
      [ev('e1')],
      'inquiry',
    );
    expect(r.scenes[1]?.evidences.map((e) => e.id)).toEqual(['e1']);
  });

  it('★같은 근거를 두 장면에 이을 수 있다 — 카드는 첫 장면에만 그린다', () => {
    const r = scenesOf(
      thread([
        scene('s1', 'evaluation', []),
        scene('s2', 'motive', ['e1']),
        scene('s3', 'process', ['e1']),
      ]),
      [ev('e1')],
      'inquiry',
    );
    // 두 장면 모두 이 자료를 가리킨다(하나의 보고서에 과정과 결과가 함께 있는 경우).
    expect(r.scenes[1]?.evidences.map((e) => e.id)).toEqual(['e1']);
    expect(r.scenes[2]?.evidences.map((e) => e.id)).toEqual(['e1']);
    // 카드가 사는 자리는 처음 가리킨 장면 하나뿐이다 — 자료를 복제하지 않는다.
    expect([...(r.scenes[1]?.ownIds ?? [])]).toEqual(['e1']);
    expect([...(r.scenes[2]?.ownIds ?? [])]).toEqual([]);
    expect(r.primarySceneOf.get('e1')).toBe('s2');
    expect([...r.sharedIds]).toEqual(['e1']);
    // 관문이 보는 수는 **서로 다른 근거의 수**다 — 겹친 연결이 수를 부풀리지 않는다.
    expect(r.placedCount).toBe(1);
  });

  it('한 장면 안에 같은 근거가 두 번 적혀 있으면 한 번만 그린다', () => {
    const r = scenesOf(
      thread([scene('s1', 'evaluation', []), scene('s2', 'process', ['e1', 'e1'])]),
      [ev('e1')],
      'inquiry',
    );
    expect(r.scenes[1]?.evidences.map((e) => e.id)).toEqual(['e1']);
    expect(r.sharedIds.size).toBe(0);
  });

  it('장면에 안 놓인 이 주제 근거는 unplaced 로, 날짜순으로 돌려준다', () => {
    const r = scenesOf(
      thread([scene('s1', 'evaluation', []), scene('s2', 'process', ['e2'])]),
      [
        ev('e1', { date: '2026-05-05' }),
        ev('e2', { date: '2026-01-01' }),
        ev('e3', { createdAt: 10 }),
        ev('e0', { date: '2026-03-03' }),
        ev('x', { threadId: 't-other' }),
      ],
      'inquiry',
    );
    // 날짜 있는 것 먼저(오름차순), 무날짜는 뒤. 남의 주제 근거는 아예 안 나온다.
    expect(r.unplaced.map((e) => e.id)).toEqual(['e0', 'e1', 'e3']);
  });
});

describe('scenesOf — 평가 장면은 정확히 하나', () => {
  it('평가가 없으면 맨 앞에 가상 장면을 보여 준다 (저장은 하지 않는다)', () => {
    const r = scenesOf(thread([scene('s2', 'process', [])]), [], 'inquiry');
    expect(r.scenes[0]?.virtual).toBe(true);
    expect(r.scenes[0]?.scene.id).toBe(VIRTUAL_EVALUATION_SCENE_ID);
    expect(r.scenes[0]?.scene.role).toBe('evaluation');
  });

  it('장면이 아예 없으면 가상 장면도 만들지 않는다 — 빈 줄기는 빈 줄기다', () => {
    expect(scenesOf(thread([]), [], 'inquiry').scenes).toEqual([]);
  });

  it('평가가 둘이면 첫 것만 그린다', () => {
    const r = scenesOf(
      thread([
        scene('s1', 'evaluation', []),
        scene('s2', 'process', []),
        scene('s3', 'evaluation', []),
      ]),
      [],
      'inquiry',
    );
    expect(r.scenes.map((x) => x.scene.role)).toEqual(['evaluation', 'process']);
  });

  it('생활 틀의 가상 평가도 교사 판단으로 채운다', () => {
    const r = scenesOf(thread([scene('s2', 'process', [])]), [], 'life');
    expect(r.scenes[0]?.scene.moduleId).toBe('teacherJudgement');
  });
});

describe('placedCount — 근거 관문의 판정값', () => {
  it('소유가 확인된 근거만 센다', () => {
    const t = thread([scene('s1', 'process', ['e1', 'e2', '없는id'])]);
    expect(placedCount(t, [ev('e1'), ev('e2', { threadId: 't-other' })])).toBe(1);
  });

  it('장면이 없으면 0 이다', () => {
    expect(placedCount(thread([]), [ev('e1')])).toBe(0);
  });
});

describe('isDefaultScenes — 구성 관문의 판정값', () => {
  const base = defaultScaffoldScenes().map((s, i) =>
    makeScene(`s${i}`, s.role, s.moduleId === undefined ? {} : { moduleId: s.moduleId }),
  );

  it('★부재·빈 배열은 기본이다 — 기존 사용자 주제가 전부 이 경우다', () => {
    expect(isDefaultScenes(undefined, { chained: false })).toBe(true);
    expect(isDefaultScenes([], { chained: false })).toBe(true);
  });

  it('기본 뼈대를 그대로 깔았으면 기본이다 (요청서가 기준선과 같아야 한다)', () => {
    expect(isDefaultScenes(base, { chained: false })).toBe(true);
  });

  it('메모를 하나라도 적었으면 기본이 아니다', () => {
    const withNote = base.map((s, i) => (i === 1 ? { ...s, note: '내가 읽은 것' } : s));
    expect(isDefaultScenes(withNote, { chained: false })).toBe(false);
  });

  it('장면 이름을 직접 적었으면 기본이 아니다', () => {
    const withLabel = base.map((s, i) => (i === 1 ? { ...s, label: '첫 수행' } : s));
    expect(isDefaultScenes(withLabel, { chained: false })).toBe(false);
  });

  it('순서를 바꾸거나 장면을 더하면 기본이 아니다', () => {
    expect(isDefaultScenes([...base].reverse(), { chained: false })).toBe(false);
    expect(isDefaultScenes([...base, makeScene('extra', 'process')], { chained: false })).toBe(
      false,
    );
  });

  it('주제가 이어져 있으면 기본이 아니다 — 이음말을 보내야 한다', () => {
    expect(isDefaultScenes(base, { chained: true })).toBe(false);
    expect(isDefaultScenes(undefined, { chained: true })).toBe(false);
  });
});

describe('chainOf — 어떤 고리에서도 멈춘다', () => {
  const t = (id: string, from?: string): InquiryThread => ({
    id,
    studentRef: 's1',
    title: id,
    keywords: [],
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
    ...(from === undefined ? {} : { link: { fromThreadId: from } }),
  });

  it('앞으로 거슬러 오르고 뒤로 내려간다', () => {
    const threads = [t('a'), t('b', 'a'), t('c', 'b')];
    expect(chainOf(threads, 'b').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('3단 고리에서도 끝난다 (길이를 세는 구현은 무한히 돈다)', () => {
    const threads = [t('a', 'c'), t('b', 'a'), t('c', 'b')];
    const out = chainOf(threads, 'a', 10).map((x) => x.id);
    expect(out.length).toBeLessThanOrEqual(3);
    expect(new Set(out).size).toBe(out.length);
  });

  it('뒤가 여럿으로 갈리면 시작점에서 멈춘다', () => {
    const threads = [t('a'), t('b', 'a'), t('c', 'a')];
    expect(chainOf(threads, 'a').map((x) => x.id)).toEqual(['a']);
  });

  it('상한을 넘으면 먼 쪽(앞)부터 떨어뜨린다', () => {
    const threads = [t('a'), t('b', 'a'), t('c', 'b'), t('d', 'c')];
    expect(chainOf(threads, 'd', 3).map((x) => x.id)).toEqual(['b', 'c', 'd']);
  });

  it('연결이 없으면 자기 하나다', () => {
    expect(chainOf([t('a')], 'a').map((x) => x.id)).toEqual(['a']);
    expect(chainOf([t('a')], '없는주제')).toEqual([]);
  });
});

describe('요청서 표식은 언제나 4종이다', () => {
  it('생활 틀 장면도 동기·과정·결과·평가 낱말로 나간다 (틀 이름은 화면 전용)', () => {
    expect(sceneMarkOf({ role: 'motive' })).toBe('동기');
    expect(sceneMarkOf({ role: 'process' })).toBe('과정');
    expect(sceneMarkOf({ role: 'result' })).toBe('결과');
    expect(sceneMarkOf({ role: 'evaluation' })).toBe('평가');
  });
});
