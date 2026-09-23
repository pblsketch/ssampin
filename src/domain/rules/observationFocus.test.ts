import { describe, it, expect } from 'vitest';
import { DEFAULT_REMINDER_SETTINGS } from '../entities/RecordReminder';
import {
  isFocusedKey,
  refInScope,
  scopedReminderConfig,
  withFocus,
  withoutFocus,
} from './observationFocus';
import { effectiveStaleDays } from './recordReminderRules';
import { withLatestExclusions } from './reminderExclusion';

describe('관심 학생 반 범위', () => {
  it('담임 key 와 수업반 key 를 그 범위의 ref 로 바꾼다', () => {
    expect(refInScope('stu-1', { kind: 'homeroom' })).toBe('stu-1');
    expect(refInScope('subject:c1:2-3-5', { kind: 'homeroom' })).toBeNull();
    expect(refInScope('subject:c1:2-3-5', { kind: 'subject', classId: 'c1' })).toBe('2-3-5');
    expect(refInScope('subject:c2:2-3-5', { kind: 'subject', classId: 'c1' })).toBeNull();
    expect(refInScope('stu-1', { kind: 'subject', classId: 'c1' })).toBeNull();
  });

  it('그 반 범위로 좁힌 설정은 그 반 학생만 담는다', () => {
    const rr = {
      ...DEFAULT_REMINDER_SETTINGS,
      focusedStudentIds: ['stu-1', 'subject:c1:5', 'subject:c2:5'],
      excludedStudentIds: ['stu-9'],
    };
    const c1 = scopedReminderConfig(rr, { kind: 'subject', classId: 'c1' });
    expect(c1.focusedStudentIds).toEqual(['5']);
    expect(c1.excludedStudentIds).toEqual([]);
    const home = scopedReminderConfig(rr, { kind: 'homeroom' });
    expect(home.focusedStudentIds).toEqual(['stu-1']);
    expect(home.excludedStudentIds).toEqual(['stu-9']);
  });

  it('수업반 관심 학생은 그 반에서만 문턱이 절반이다', () => {
    const rr = { ...DEFAULT_REMINDER_SETTINGS, staleDays: 14, focusedStudentIds: ['subject:c1:5'] };
    expect(
      effectiveStaleDays('5', scopedReminderConfig(rr, { kind: 'subject', classId: 'c1' })),
    ).toBe(7);
    expect(
      effectiveStaleDays('5', scopedReminderConfig(rr, { kind: 'subject', classId: 'c2' })),
    ).toBe(14);
    // 범위 없는 설정을 그대로 넘기면 맞지 않는다 — 좁혀서 넘겨야 하는 까닭
    expect(effectiveStaleDays('5', rr)).toBe(14);
  });

  it('문턱 절반은 내림, 최소 1일', () => {
    const rr = { ...DEFAULT_REMINDER_SETTINGS, staleDays: 1, focusedStudentIds: ['s'] };
    expect(effectiveStaleDays('s', rr)).toBe(1);
    expect(effectiveStaleDays('s', { ...rr, staleDays: 21 })).toBe(10);
  });

  it('지정·풀기', () => {
    expect(withFocus(undefined, 'a')).toEqual(['a']);
    expect(withFocus(['a'], 'a')).toEqual(['a']);
    expect(withoutFocus(['a', 'b'], 'a')).toEqual(['b']);
    expect(isFocusedKey({ focusedStudentIds: ['a'] }, 'a')).toBe(true);
    expect(isFocusedKey(undefined, 'a')).toBe(false);
  });

  it('설정 [저장]은 그 사이 바뀐 관심 목록을 덮지 않는다', () => {
    const draft = { ...DEFAULT_REMINDER_SETTINGS, focusedStudentIds: ['old'], staleDays: 9 };
    const latest = { ...DEFAULT_REMINDER_SETTINGS, focusedStudentIds: ['new'] };
    const saved = withLatestExclusions(draft, latest);
    expect(saved.focusedStudentIds).toEqual(['new']);
    expect(saved.staleDays).toBe(9);
  });
});
