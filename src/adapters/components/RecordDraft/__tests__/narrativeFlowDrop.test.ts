/**
 * 흐름 보기의 놓는 곳 이름표(ADR-103).
 *
 * 여기서 지키는 것: 보드와 **같은 이름표를 재사용**하고, 새 이름표는 되읽을 때 잘리지 않는다.
 */
import { describe, expect, it } from 'vitest';

import { parseNarrativeDropId, sceneDropId, unplacedDropId } from '../narrativeFlowDrop';
import { UNCLASSIFIED_DROP_ID, threadDropId } from '../EvidenceColumn';
import { VIRTUAL_EVALUATION_SCENE_ID } from '@domain/rules/narrativeScenes';

describe('parseNarrativeDropId', () => {
  it('장면 이름표를 되읽는다', () => {
    expect(parseNarrativeDropId(sceneDropId('t1', 's1'))).toEqual({
      kind: 'scene',
      threadId: 't1',
      sceneId: 's1',
    });
  });

  it('★장면 id 에 쌍점이 있어도 잘리지 않는다 (가상 평가 장면)', () => {
    const id = sceneDropId('t1', VIRTUAL_EVALUATION_SCENE_ID);
    expect(parseNarrativeDropId(id)).toEqual({
      kind: 'scene',
      threadId: 't1',
      sceneId: VIRTUAL_EVALUATION_SCENE_ID,
    });
  });

  it('"아직 안 놓음" 이름표를 되읽는다', () => {
    expect(parseNarrativeDropId(unplacedDropId('t2'))).toEqual({
      kind: 'unplaced',
      threadId: 't2',
    });
  });

  it('★보드와 공유하는 이름표 셋은 흐름 것이 아니라고 답한다 — 호스트가 지금처럼 다룬다', () => {
    expect(parseNarrativeDropId(UNCLASSIFIED_DROP_ID)).toBeNull();
    expect(parseNarrativeDropId(threadDropId('t1'))).toBeNull();
    expect(parseNarrativeDropId('drop:new')).toBeNull();
  });

  it('망가진 이름표는 null 이다 — 반쪽 값으로 저장하지 않는다', () => {
    expect(parseNarrativeDropId('drop:scene:')).toBeNull();
    expect(parseNarrativeDropId('drop:scene:t1')).toBeNull();
    expect(parseNarrativeDropId('drop:scene:t1:')).toBeNull();
    expect(parseNarrativeDropId('drop:scene::s1')).toBeNull();
    expect(parseNarrativeDropId('drop:unplaced:')).toBeNull();
    expect(parseNarrativeDropId('아무말')).toBeNull();
  });
});
