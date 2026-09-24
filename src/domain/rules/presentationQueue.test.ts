import { describe, it, expect } from 'vitest';
import {
  arrowAction,
  canDeferCurrent,
  classroomNextAction,
  completeCurrent,
  currentPresenterId,
  deferCurrent,
  isPresentationBusy,
  isRunFinished,
  skipCurrent,
  spaceAction,
  startPresentationRun,
  talkUsage,
  type PresentationPhase,
} from './presentationQueue';

const ALL_PHASES: readonly PresentationPhase[] = [
  'setup',
  'talk',
  'talk-paused',
  'talk-ended',
  'qna',
  'qna-paused',
  'qna-ended',
  'all-done',
];

describe('상태와 키 (spec 4-4 표)', () => {
  it('진행 중은 준비·발표 완료를 뺀 전부', () => {
    const busy = ALL_PHASES.filter(isPresentationBusy);
    expect(busy).toEqual(['talk', 'talk-paused', 'talk-ended', 'qna', 'qna-paused', 'qna-ended']);
  });

  it('Space', () => {
    expect(spaceAction('setup', false)).toBe('start');
    expect(spaceAction('talk', false)).toBe('pause');
    expect(spaceAction('talk-paused', false)).toBe('resume');
    expect(spaceAction('talk-ended', true)).toBe('startQna');
    expect(spaceAction('talk-ended', false)).toBe('next');
    expect(spaceAction('qna', true)).toBe('pause');
    expect(spaceAction('qna-paused', true)).toBe('resume');
    expect(spaceAction('qna-ended', true)).toBe('next');
    expect(spaceAction('all-done', true)).toBe('none');
  });

  it('→', () => {
    expect(arrowAction('setup')).toBe('none');
    expect(arrowAction('talk')).toBe('finishTalk');
    expect(arrowAction('talk-paused')).toBe('finishTalk');
    expect(arrowAction('talk-ended')).toBe('next');
    expect(arrowAction('qna')).toBe('finishQna');
    expect(arrowAction('qna-paused')).toBe('finishQna');
    expect(arrowAction('qna-ended')).toBe('next');
    expect(arrowAction('all-done')).toBe('none');
  });

  it('교실 화면 다음 단추 — 발표 끝에서는 질문 시간을 먼저', () => {
    expect(classroomNextAction('talk', true)).toBe('finishTalk');
    expect(classroomNextAction('talk-ended', true)).toBe('startQna');
    expect(classroomNextAction('talk-ended', false)).toBe('next');
    expect(classroomNextAction('qna', true)).toBe('finishQna');
    expect(classroomNextAction('qna-ended', true)).toBe('next');
  });
});

describe('실행 순서', () => {
  it('준비 순서를 복사해서 시작한다', () => {
    const setup = ['a', 'b', 'c'];
    const run = startPresentationRun(setup);
    expect(run.order).toEqual(setup);
    expect(run.order).not.toBe(setup);
  });

  it('[나중에]는 맨 뒤로 보내고, 한 학생은 한 번만', () => {
    let run = startPresentationRun(['a', 'b', 'c']);
    expect(canDeferCurrent(run)).toBe(true);
    run = deferCurrent(run);
    expect(run.order).toEqual(['b', 'c', 'a']);
    expect(currentPresenterId(run)).toBe('b');
    run = completeCurrent(run, { usedSeconds: 170, overSeconds: 0 });
    run = completeCurrent(run, { usedSeconds: 175, overSeconds: 0 });
    // a 의 차례가 다시 왔다 — 이미 미뤘고, 남은 학생도 자기뿐이다.
    expect(currentPresenterId(run)).toBe('a');
    expect(canDeferCurrent(run)).toBe(false);
    expect(deferCurrent(run)).toBe(run);
  });

  it('남은 학생이 자기뿐이면 미룰 수 없다', () => {
    const run = startPresentationRun(['only']);
    expect(canDeferCurrent(run)).toBe(false);
  });

  it('미루기 전 흐른 시간은 기록되지 않는다', () => {
    let run = startPresentationRun(['a', 'b']);
    run = deferCurrent(run);
    expect(run.records).toEqual([]);
  });

  it('[건너뛰기]는 기록에 건너뜀', () => {
    let run = startPresentationRun(['a', 'b']);
    run = skipCurrent(run);
    expect(run.records).toEqual([
      { presenterId: 'a', status: 'skipped', usedSeconds: 0, overSeconds: 0 },
    ]);
    expect(currentPresenterId(run)).toBe('b');
  });

  it('기록은 실제로 끝난 차례대로 쌓인다', () => {
    let run = startPresentationRun(['a', 'b', 'c']);
    run = deferCurrent(run);
    run = completeCurrent(run, { usedSeconds: 100, overSeconds: 0 });
    run = skipCurrent(run);
    run = completeCurrent(run, { usedSeconds: 215, overSeconds: 35 });
    expect(run.records.map((r) => r.presenterId)).toEqual(['b', 'c', 'a']);
    expect(isRunFinished(run)).toBe(true);
    expect(currentPresenterId(run)).toBeNull();
  });
});

describe('talkUsage — 발표에 쓴 시간', () => {
  it('시간 다 됨: 발표 시간 + 초과', () => {
    expect(
      talkUsage({
        durationSeconds: 180,
        reason: 'time-up',
        remainingAtEnd: 0,
        overtimeSeconds: 35,
      }),
    ).toEqual({ usedSeconds: 215, overSeconds: 35 });
  });

  it('[발표 마침]: 실제 흐른 시간, 초과 없음', () => {
    expect(
      talkUsage({
        durationSeconds: 180,
        reason: 'finished-early',
        remainingAtEnd: 50,
        overtimeSeconds: 99,
      }),
    ).toEqual({ usedSeconds: 130, overSeconds: 0 });
  });

  it('자동 진행이면 초과 0 을 넘겨 기다린 2초를 세지 않는다', () => {
    expect(
      talkUsage({ durationSeconds: 120, reason: 'time-up', remainingAtEnd: 0, overtimeSeconds: 0 }),
    ).toEqual({ usedSeconds: 120, overSeconds: 0 });
  });
});
