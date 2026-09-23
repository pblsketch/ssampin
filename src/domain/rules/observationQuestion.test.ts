import { describe, it, expect } from 'vitest';
import {
  SCENE_QUESTIONS,
  emptyDefaultScenesThisTerm,
  pickQuestionScene,
  sceneQuestionText,
} from './observationQuestion';
import { HOMEROOM_SLOTS, TEACHING_SLOTS } from './observationSlots';

describe('질문 한 줄', () => {
  it('이번 학기 기록만 보고 빈 기본 장면을 찾는다(선생님이 더한 장면은 묻지 않는다)', () => {
    const empty = emptyDefaultScenesThisTerm(
      [
        { date: '2026-05-01', slots: ['질문'] }, // 지난 학기
        { date: '2026-09-01', slots: ['시도', '내가 만든 장면'] },
        { date: '2026-12-01', slots: ['융합'] }, // 오늘 뒤 — 세지 않는다
      ],
      'teaching',
      '2026-08-18',
      '2026-09-23',
    );
    expect(empty).toEqual(['질문', '시행착오', '산출물', '피드백', '융합']);
  });

  it('빈 장면이 없으면 묻지 않는다', () => {
    expect(pickQuestionScene([], '2026-09-23', 's1')).toBeNull();
  });

  it('같은 학생이라도 날마다 돌아가며 묻는다', () => {
    const scenes = ['질문', '시도', '시행착오'];
    const seen = new Set<string | null>();
    for (const day of ['2026-09-21', '2026-09-22', '2026-09-23']) {
      seen.add(pickQuestionScene(scenes, day, 's1'));
    }
    expect(seen.size).toBe(3);
    expect(pickQuestionScene(scenes, '2026-09-23', 's1')).toBe(
      pickQuestionScene(scenes, '2026-09-23', 's1'),
    );
  });

  it('기본 장면마다 질문 문구가 있고 이름이 들어간다', () => {
    for (const scene of [...TEACHING_SLOTS, ...HOMEROOM_SLOTS]) {
      expect(SCENE_QUESTIONS[scene]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(sceneQuestionText('시행착오', ' 가람 ')).toBe(
      '가람 학생이 막혔다가 다시 해 본 순간이 있었나요?',
    );
    expect(sceneQuestionText('없는 장면', '가람')).toBeNull();
  });
});
