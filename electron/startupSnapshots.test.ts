/**
 * 시작 스냅샷 — 정리 정책과 대상(ADR-148). 실제 임시 폴더에 파일을 만들어 확인한다.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs, { readFileSync } from 'node:fs';
import os from 'node:os';
import path, { resolve } from 'node:path';
import {
  ADDED_STARTUP_SNAPSHOT_FILES,
  STARTUP_SNAPSHOT_FILES,
  createStartupSnapshots,
  pruneStartupSnapshots,
  startupSnapshotDir,
} from './startupSnapshots';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 11, 8, 30); // 로컬 2026-11-11 08:30
let dir = '';
let snapDir = '';

const putSnapshot = (name: string, ageDays: number): void => {
  const p = path.join(snapDir, name);
  fs.writeFileSync(p, '{"x":1}', 'utf-8');
  const t = new Date(NOW.getTime() - ageDays * DAY);
  fs.utimesSync(p, t, t);
};
const snapshots = (): string[] => fs.readdirSync(snapDir).sort();

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'startup-snap-'));
  snapDir = startupSnapshotDir(dir);
  fs.mkdirSync(snapDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('pruneStartupSnapshots', () => {
  test('14일이 지나도 파일마다 최근 7개는 남긴다', () => {
    // 앱을 한 달 넘게 안 켰다: 할 일 스냅샷 10개가 모두 30일 이상 지났다
    for (let d = 1; d <= 10; d += 1) {
      putSnapshot(`todos.2026-09-${String(d).padStart(2, '0')}.json`, 40 - d);
    }
    putSnapshot('memos.2026-09-01.json', 70);
    putSnapshot('memos.2026-09-02.json', 69);
    // 남은 임시 파일은 개수와 상관없이 14일 기준으로 지운다
    putSnapshot('todos.2026-09-03.tmp.json', 38);

    pruneStartupSnapshots(dir, NOW.getTime());

    expect(snapshots()).toEqual([
      'memos.2026-09-01.json',
      'memos.2026-09-02.json',
      'todos.2026-09-04.json',
      'todos.2026-09-05.json',
      'todos.2026-09-06.json',
      'todos.2026-09-07.json',
      'todos.2026-09-08.json',
      'todos.2026-09-09.json',
      'todos.2026-09-10.json',
    ]);
  });

  test('오늘보다 뒤 날짜의 스냅샷은 "최근 7개"에 넣지 않고 지우지도 않는다', () => {
    for (let d = 1; d <= 9; d += 1) putSnapshot(`todos.2026-09-0${d}.json`, 40 - d);
    // PC 시계가 앞서 있을 때 찍힌 것 — 오래됐어도 지우지 않고, 7개 자리도 차지하지 않는다
    putSnapshot('todos.2027-01-01.json', 30);
    putSnapshot('todos.2027-01-02.json', 30);

    pruneStartupSnapshots(dir, NOW.getTime());

    expect(snapshots()).toEqual([
      'todos.2026-09-03.json',
      'todos.2026-09-04.json',
      'todos.2026-09-05.json',
      'todos.2026-09-06.json',
      'todos.2026-09-07.json',
      'todos.2026-09-08.json',
      'todos.2026-09-09.json',
      'todos.2027-01-01.json',
      'todos.2027-01-02.json',
    ]);
  });

  test('최근 7개보다 오래돼도 14일이 안 지났으면 남긴다', () => {
    for (let d = 1; d <= 9; d += 1) putSnapshot(`events.2026-11-0${d}.json`, 10 - d);

    pruneStartupSnapshots(dir, NOW.getTime());

    expect(snapshots()).toHaveLength(9);
  });
});

describe('createStartupSnapshots', () => {
  test('새 대상 파일도 스냅샷을 만든다', () => {
    expect(ADDED_STARTUP_SNAPSHOT_FILES).toEqual([
      'students',
      'assignments',
      'class-schedule',
      'teacher-schedule',
      'seating',
      'consultations',
      'timetable-overrides',
      'record-drafts',
      'record-evidence',
    ]);
    const roster = '[{"id":"s1","name":"학생1","number":1}]';
    fs.writeFileSync(path.join(dir, 'students.json'), roster, 'utf-8');
    fs.writeFileSync(path.join(dir, 'consultations.json'), '\0'.repeat(64), 'utf-8');

    createStartupSnapshots(dir, ADDED_STARTUP_SNAPSHOT_FILES, NOW, { refreshBackup: false });

    expect(snapshots()).toEqual(['students.2026-11-11.json']);
    expect(readFileSync(path.join(snapDir, 'students.2026-11-11.json'), 'utf-8')).toBe(roster);
    // 더한 자료는 `.backup.json` 을 새로 쓰지 않는다(저장할 때마다 이미 쓰인다)
    expect(fs.existsSync(path.join(dir, 'students.backup.json'))).toBe(false);
  });

  test('그날 첫 스냅샷을 덮지 않고, 예전 9종은 백업도 새로 쓴다', () => {
    const morning = '{"todos":[{"id":"morning"}]}';
    fs.writeFileSync(path.join(dir, 'todos.json'), morning, 'utf-8');
    createStartupSnapshots(dir, STARTUP_SNAPSHOT_FILES, NOW);

    const afternoon = '{"todos":[{"id":"afternoon"}]}';
    fs.writeFileSync(path.join(dir, 'todos.json'), afternoon, 'utf-8');
    createStartupSnapshots(dir, STARTUP_SNAPSHOT_FILES, NOW);

    expect(readFileSync(path.join(snapDir, 'todos.2026-11-11.json'), 'utf-8')).toBe(morning);
    expect(readFileSync(path.join(dir, 'todos.backup.json'), 'utf-8')).toBe(afternoon);
  });

  test('main.ts 가 시작할 때 두 목록을 모두 찍고 정리한다(더한 자료는 창을 띄운 뒤)', () => {
    const main = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
    expect(main).toContain('createStartupSnapshots(dataDir, STARTUP_SNAPSHOT_FILES, now)');
    expect(main).toContain('pruneStartupSnapshots(dataDir, now.getTime())');
    expect(main).toContain('const files = [...ADDED_STARTUP_SNAPSHOT_FILES];');
    expect(main).toContain(
      'createStartupSnapshots(getDataDir(), [filename], now, { refreshBackup: false })',
    );
    expect(main).toMatch(/createStartupBackups\(\);\s*scheduleAddedStartupSnapshots\(\);/);
  });
});
