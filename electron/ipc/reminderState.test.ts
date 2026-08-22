import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  EMPTY_PERSISTED_STATE,
  initReminderState,
  readReminderState,
  writeReminderState,
  __resetReminderStateForTest,
} from './reminderState';
import type { ReminderScheduleItem } from './reminderCore';

/**
 * 스냅샷 파일 왕복 — `notify-state.json`.
 *
 * 이 파일이 하는 일은 하나다: **메인 화면이 파괴된 채로 앱을 켜도 할 일 알람이 울리게 하는 것.**
 * 그래서 "정상 왕복"만큼 **"이상한 파일을 만났을 때 앱이 안 죽는가"** 를 함께 잠근다.
 * 알림이 안 오는 건 나쁘지만 앱이 죽는 건 더 나쁘다.
 */

const NOW = 1_800_000_000_000;

const item = (over: Partial<ReminderScheduleItem> = {}): ReminderScheduleItem => ({
  reminderId: 'todo:t1:1800000600000',
  fireAt: NOW + 600_000,
  expiresAt: NOW + 7_800_000,
  title: '할 일 알림',
  body: '확인할 일이 1건 있습니다',
  studentDedupKey: 'todo:t1:2026-08-25',
  ...over,
});

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-notify-'));
  initReminderState(dir);
});

afterEach(() => {
  __resetReminderStateForTest();
  fs.rmSync(dir, { recursive: true, force: true });
});

const statePath = () => path.join(dir, 'notify-state.json');

describe('정상 왕복', () => {
  it('쓴 것을 그대로 읽는다', () => {
    const ok = writeReminderState({
      todo: [item()],
      fired: [{ reminderId: 'todo:old:1', firedAt: NOW - 1000, source: 'todo' }],
      savedAt: NOW,
    });
    expect(ok).toBe(true);

    const read = readReminderState(NOW);
    expect(read.todo).toHaveLength(1);
    expect(read.todo[0]!.reminderId).toBe('todo:t1:1800000600000');
    expect(read.fired).toHaveLength(1);
    expect(read.savedAt).toBe(NOW);
  });

  it('임시 파일을 남기지 않는다 (원자적 쓰기)', () => {
    writeReminderState({ todo: [item()], fired: [], savedAt: NOW });
    expect(fs.existsSync(path.join(dir, 'notify-state.tmp.json'))).toBe(false);
    expect(fs.existsSync(statePath())).toBe(true);
  });
});

describe('이상한 파일 — 전부 빈 상태로 조용히 폴백', () => {
  it('파일이 없으면 빈 상태', () => {
    expect(readReminderState(NOW)).toEqual(EMPTY_PERSISTED_STATE);
  });

  it('깨진 JSON 이면 빈 상태 (던지지 않는다)', () => {
    fs.writeFileSync(statePath(), '{ 여기서 끊', 'utf-8');
    expect(() => readReminderState(NOW)).not.toThrow();
    expect(readReminderState(NOW).todo).toEqual([]);
  });

  it('JSON 은 멀쩡한데 형태가 다르면 빈 상태', () => {
    fs.writeFileSync(statePath(), JSON.stringify([1, 2, 3]), 'utf-8');
    expect(readReminderState(NOW).todo).toEqual([]);

    fs.writeFileSync(statePath(), JSON.stringify({ todo: '세 건', fired: 7 }), 'utf-8');
    expect(readReminderState(NOW)).toMatchObject({ todo: [], fired: [] });
  });

  it('초기화 전에는 읽기·쓰기가 조용히 아무것도 하지 않는다', () => {
    __resetReminderStateForTest();
    expect(readReminderState(NOW)).toEqual(EMPTY_PERSISTED_STATE);
    expect(writeReminderState({ todo: [item()], fired: [], savedAt: NOW })).toBe(false);
  });
});

describe('복원 항목은 형태 검사를 다시 통과해야 한다', () => {
  it('필드가 빠진 항목은 되살리지 않는다', () => {
    // 사용자가 옛 버전으로 되돌렸거나 필드가 바뀐 상황 — JSON 은 멀쩡하다.
    fs.writeFileSync(
      statePath(),
      JSON.stringify({
        todo: [item(), { reminderId: 'todo:t2:1', fireAt: '언제' }, { title: '제목만' }],
        fired: [],
        savedAt: NOW,
      }),
      'utf-8',
    );

    const read = readReminderState(NOW);
    expect(read.todo).toHaveLength(1);
    expect(read.todo[0]!.reminderId).toBe('todo:t1:1800000600000');
  });

  it('발화 이력에서 오래된 줄은 정리된다', () => {
    const old = NOW - 40 * 24 * 60 * 60 * 1000; // 40일 전
    fs.writeFileSync(
      statePath(),
      JSON.stringify({
        todo: [],
        fired: [
          { reminderId: 'todo:old:1', firedAt: old, source: 'todo' },
          { reminderId: 'todo:new:1', firedAt: NOW - 1000, source: 'todo' },
          { reminderId: 'todo:broken:1' },
        ],
        savedAt: NOW,
      }),
      'utf-8',
    );

    const read = readReminderState(NOW);
    expect(read.fired.map((e) => e.reminderId)).toEqual(['todo:new:1']);
  });
});
