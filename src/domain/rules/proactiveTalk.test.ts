import { describe, it, expect } from 'vitest';
import {
  EMPTY_TALK_STATE,
  arbitrateTalk,
  decideTalk,
  hasNotified,
  markTalkOpened,
  markToastShown,
  parseTalkState,
  pendingTalk,
  revokeTalkForRest,
} from './proactiveTalk';

const TODAY = '2026-12-31';
const weekly = { kind: 'weekly', key: '2026-12-28' };
const retro = { kind: 'retrospect', key: '2026-2' };
const moment = { kind: 'moment', key: 'vacation-eve' };

describe('먼저 거는 말 — 하루 한 번', () => {
  it('학기 돌아보기 > 한 주 정리 > 달력 순간, 진 쪽은 조각으로', () => {
    expect(arbitrateTalk([moment, weekly, retro])).toEqual({
      main: retro,
      folded: [weekly, moment],
    });
    expect(arbitrateTalk([])).toBeNull();
    // 모르는 종류는 맨 뒤
    expect(arbitrateTalk([{ kind: 'other', key: 'x' }, moment])?.main).toEqual(moment);
  });

  it('하루에 한 번 정하고, 말한 것·조각으로 들어간 것 모두 알린 것으로 친다', () => {
    const s1 = decideTalk(EMPTY_TALK_STATE, TODAY, [weekly, retro]);
    expect(s1.talk?.main).toEqual(retro);
    expect(hasNotified(s1, weekly)).toBe(true);
    expect(hasNotified(s1, retro)).toBe(true);
    expect(decideTalk(s1, TODAY, [moment])).toBe(s1);
    // 다음 날에는 이미 알린 것은 다시 말하지 않는다
    const s2 = decideTalk(s1, '2027-01-04', [weekly, moment]);
    expect(s2.talk?.main).toEqual(moment);
  });

  it('말할 것이 없던 날도 판단을 마친다', () => {
    const s = decideTalk(EMPTY_TALK_STATE, TODAY, []);
    expect(s.decidedDate).toBe(TODAY);
    expect(pendingTalk(s, TODAY)).toBeNull();
  });

  it('열어 볼 때까지 남고, 다음 날에는 사라진다', () => {
    const s = decideTalk(EMPTY_TALK_STATE, TODAY, [weekly]);
    expect(pendingTalk(s, TODAY)?.main).toEqual(weekly);
    expect(pendingTalk(s, '2027-01-01')).toBeNull();
    const opened = markTalkOpened(s, TODAY);
    expect(pendingTalk(opened, TODAY)).toBeNull();
    expect(markToastShown(s, TODAY).toastShown).toBe(true);
  });

  it('쉬는 날은 못 알린 것으로 친다 — 알린 표시를 되돌리되, 그날 다시 말하지 않는다', () => {
    const s = decideTalk(EMPTY_TALK_STATE, TODAY, [weekly]);
    const rested = revokeTalkForRest(s, TODAY);
    expect(rested.talk).toBeNull();
    expect(hasNotified(rested, weekly)).toBe(false);
    // 같은 날 [다시 켜기] 뒤 다시 판단해도 같은 말이 또 나가지 않는다
    expect(decideTalk(rested, TODAY, [weekly])).toBe(rested);
    expect(pendingTalk(rested, TODAY)).toBeNull();
    // 다음 등교일에는 다시 알릴 수 있다
    expect(decideTalk(rested, '2027-01-04', [weekly]).talk?.main).toEqual(weekly);
    // 이미 열어 본 말은 본 것이다
    const seen = revokeTalkForRest(markTalkOpened(s, TODAY), TODAY);
    expect(hasNotified(seen, weekly)).toBe(true);
  });

  it('처리만 하고 말하지 않은 대상은 다음 날 다시 알리지 않는다', () => {
    const s = decideTalk(EMPTY_TALK_STATE, TODAY, [], [weekly]);
    expect(s.talk).toBeNull();
    expect(hasNotified(s, weekly)).toBe(true);
    expect(decideTalk(s, '2027-01-04', [weekly]).talk).toBeNull();
  });

  it('같은 종류가 둘이면 더 최근 대상이 먼저다', () => {
    const older = { kind: 'weekly', key: '2026-12-21' };
    expect(arbitrateTalk([older, weekly])).toEqual({ main: weekly, folded: [older] });
  });

  it('깨진 저장값은 빈 상태', () => {
    expect(parseTalkState('x')).toEqual(EMPTY_TALK_STATE);
    const round = parseTalkState(
      JSON.parse(JSON.stringify(decideTalk(EMPTY_TALK_STATE, TODAY, [weekly]))),
    );
    expect(round.talk?.main).toEqual(weekly);
    expect(round.notified).toEqual(['weekly:2026-12-28']);
  });
});
