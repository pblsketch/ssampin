/**
 * @vitest-environment jsdom
 *
 * ADR-137 — 이 컴퓨터에만 두는 그날 상태. 두 창이 같은 날 따로 진행해도 이미 고른 학생·알린 표시를
 * 지우지 않고, 쉬기는 아직 열어 보지 않은 그날 말을 거둔다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  REST_KEY,
  TALK_KEY,
  TODAY_STUDENTS_KEY,
  isRestingToday,
  useObservationDayStore,
} from './useObservationDayStore';
import { emptyTodayStudents } from '@domain/rules/todayStudents';
import { EMPTY_TALK_STATE, decideTalk, hasNotified } from '@domain/rules/proactiveTalk';

const TODAY = '2026-09-25';

beforeEach(() => {
  window.localStorage.clear();
  useObservationDayStore.getState().refresh();
});

describe('오늘 챙길 학생 — 두 창', () => {
  it('다른 창이 먼저 고른 수업반을 지우지 않고 합친다', () => {
    // 위젯 창이 먼저 1교시 반을 골라 저장해 둔 상태
    window.localStorage.setItem(
      TODAY_STUDENTS_KEY,
      JSON.stringify({
        ...emptyTodayStudents(TODAY),
        subject: [{ classId: 'c1', ref: '3' }],
        judgedClassIds: ['c1'],
      }),
    );
    // 이 창은 옛 값(없음)을 들고 있다가 담임을 고른다
    useObservationDayStore.getState().updateTodayStudents((prev) => ({
      ...(prev ?? emptyTodayStudents(TODAY)),
      homeroomPicked: true,
      homeroom: ['h1'],
    }));
    const saved = JSON.parse(window.localStorage.getItem(TODAY_STUDENTS_KEY) ?? 'null');
    expect(saved.homeroom).toEqual(['h1']);
    expect(saved.subject).toEqual([{ classId: 'c1', ref: '3' }]);
    expect(useObservationDayStore.getState().todayStudents?.subject).toHaveLength(1);
  });

  it('바뀐 것이 없으면 쓰지 않는다', () => {
    useObservationDayStore
      .getState()
      .updateTodayStudents((prev) => prev ?? emptyTodayStudents(TODAY));
    const written = window.localStorage.getItem(TODAY_STUDENTS_KEY);
    useObservationDayStore.getState().updateTodayStudents((prev) => prev as never);
    expect(window.localStorage.getItem(TODAY_STUDENTS_KEY)).toBe(written);
  });

  it('같은 내용이면 값을 바꾸지 않는다 — 매분 다시 읽어도 화면이 다시 그려지지 않게', () => {
    useObservationDayStore
      .getState()
      .updateTodayStudents((prev) => prev ?? emptyTodayStudents(TODAY));
    const before = useObservationDayStore.getState();
    useObservationDayStore.getState().updateTodayStudents((prev) => prev as never);
    useObservationDayStore.getState().updateTalk((prev) => prev);
    useObservationDayStore.getState().refresh();
    const after = useObservationDayStore.getState();
    expect(after.todayStudents).toBe(before.todayStudents);
    expect(after.talk).toBe(before.talk);
  });
});

describe('오늘은 쉴게요', () => {
  it('쉬면 열어 보지 않은 그날 말을 거두고 알린 표시를 되돌린다 — 다시 켜기는 쉬기만 푼다', () => {
    const weekly = { kind: 'weekly', key: '2026-09-21' };
    window.localStorage.setItem(
      TALK_KEY,
      JSON.stringify(decideTalk(EMPTY_TALK_STATE, TODAY, [weekly])),
    );
    useObservationDayStore.getState().refresh();

    useObservationDayStore.getState().restToday(TODAY);
    const s = useObservationDayStore.getState();
    expect(isRestingToday(s.restDay, TODAY)).toBe(true);
    expect(s.talk.talk).toBeNull();
    expect(hasNotified(s.talk, weekly)).toBe(false);
    expect(JSON.parse(window.localStorage.getItem(REST_KEY) ?? 'null')).toEqual({ day: TODAY });

    useObservationDayStore.getState().clearRest();
    expect(useObservationDayStore.getState().restDay).toBeNull();
    expect(window.localStorage.getItem(REST_KEY)).toBeNull();
    // 같은 날 다시 켜도 그날 판단은 끝난 채다
    expect(useObservationDayStore.getState().talk.decidedDate).toBe(TODAY);
  });

  it('다음 날에는 쉬지 않는다', () => {
    useObservationDayStore.getState().restToday(TODAY);
    expect(isRestingToday(useObservationDayStore.getState().restDay, '2026-09-26')).toBe(false);
  });

  it('깨진 값이 들어 있어도 멈추지 않는다', () => {
    window.localStorage.setItem(REST_KEY, '{깨짐');
    window.localStorage.setItem(TALK_KEY, '[]');
    window.localStorage.setItem(TODAY_STUDENTS_KEY, '"x"');
    useObservationDayStore.getState().refresh();
    const s = useObservationDayStore.getState();
    expect(s.restDay).toBeNull();
    expect(s.todayStudents).toBeNull();
    expect(s.talk).toEqual(EMPTY_TALK_STATE);
  });
});
