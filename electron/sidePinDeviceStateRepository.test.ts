/**
 * 옆핀 기기 상태 파일 저장·복구 테스트 — 기획서 AC-21.
 *
 * 실제 파일로 시험한다. 임시 폴더를 만들어 쓰고 끝나면 지운다.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DEFAULT_SIDE_PIN_DEVICE_STATE,
  SIDE_PIN_DEVICE_STATE_BACKUP_FILENAME,
  SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
  SIDE_PIN_DEVICE_STATE_FILENAME,
  SIDE_PIN_WIDTH_DEFAULT,
  SIDE_PIN_WIDTH_MAX,
  loadSidePinDeviceState,
  saveSidePinDeviceState,
  type SidePinDeviceState,
} from './sidePinDeviceState';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidepin-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const SAMPLE: SidePinDeviceState = {
  schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
  displayId: '12345',
  displayHint: null,
  panelWidth: 420,
  railPosition: 0.6,
  hideOnPresentation: true,
};

function primaryFile(): string {
  return path.join(dir, SIDE_PIN_DEVICE_STATE_FILENAME);
}
function backupFile(): string {
  return path.join(dir, SIDE_PIN_DEVICE_STATE_BACKUP_FILENAME);
}

describe('저장과 읽기', () => {
  test('저장한 값을 그대로 읽는다', () => {
    expect(saveSidePinDeviceState(dir, SAMPLE)).toBe('saved');

    expect(loadSidePinDeviceState(dir)).toEqual(SAMPLE);
  });

  test('본 파일과 예비 사본을 둘 다 남긴다', () => {
    saveSidePinDeviceState(dir, SAMPLE);

    expect(fs.existsSync(primaryFile())).toBe(true);
    expect(fs.existsSync(backupFile())).toBe(true);
  });

  test('임시 파일을 남기지 않는다', () => {
    saveSidePinDeviceState(dir, SAMPLE);

    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  test('폴더가 없어도 만들어서 저장한다', () => {
    const nested = path.join(dir, 'a', 'b');

    expect(saveSidePinDeviceState(nested, SAMPLE)).toBe('saved');
    expect(loadSidePinDeviceState(nested)).toEqual(SAMPLE);
  });

  test('범위 밖 값은 저장 전에 정규화된다', () => {
    saveSidePinDeviceState(dir, {
      schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
      displayId: '1',
      displayHint: null,
      panelWidth: 9999,
      railPosition: 99,
    });

    expect(loadSidePinDeviceState(dir).panelWidth).toBe(SIDE_PIN_WIDTH_MAX);
    expect(loadSidePinDeviceState(dir).railPosition).toBe(1);
  });
});

describe('AC-21 — 누락·파손·구버전 복구', () => {
  test('파일이 없으면 기본값', () => {
    expect(loadSidePinDeviceState(dir)).toEqual(DEFAULT_SIDE_PIN_DEVICE_STATE);
  });

  test('본 파일이 깨졌으면 예비 사본으로 되살린다', () => {
    saveSidePinDeviceState(dir, SAMPLE);
    fs.writeFileSync(primaryFile(), '{{망가진 JSON', 'utf-8');

    expect(loadSidePinDeviceState(dir)).toEqual(SAMPLE);
  });

  test('본 파일이 사라져도 예비 사본으로 되살린다', () => {
    saveSidePinDeviceState(dir, SAMPLE);
    fs.rmSync(primaryFile());

    expect(loadSidePinDeviceState(dir)).toEqual(SAMPLE);
  });

  test('둘 다 깨졌으면 기본값 — 예외를 던지지 않는다', () => {
    saveSidePinDeviceState(dir, SAMPLE);
    fs.writeFileSync(primaryFile(), '깨짐', 'utf-8');
    fs.writeFileSync(backupFile(), '이것도 깨짐', 'utf-8');

    expect(() => loadSidePinDeviceState(dir)).not.toThrow();
    expect(loadSidePinDeviceState(dir)).toEqual(DEFAULT_SIDE_PIN_DEVICE_STATE);
  });

  test('구버전·범위 밖 값이 담긴 파일은 정규화해서 읽는다', () => {
    fs.writeFileSync(
      primaryFile(),
      JSON.stringify({ schemaVersion: 0, displayId: 777, panelWidth: -50 }),
      'utf-8',
    );

    expect(loadSidePinDeviceState(dir)).toEqual({
      schemaVersion: SIDE_PIN_DEVICE_STATE_SCHEMA_VERSION,
      displayId: '777',
      displayHint: null,
      panelWidth: 360,
      railPosition: DEFAULT_SIDE_PIN_DEVICE_STATE.railPosition,
      // 칸이 없던 옛 파일(스키마 0)에서 올라왔다 — 발표 중 숨기기는 켜짐으로 채운다
      hideOnPresentation: true,
    });
  });

  test('배열이나 원시값이 들어 있어도 기본값으로 넘어간다', () => {
    fs.writeFileSync(primaryFile(), '42', 'utf-8');

    expect(loadSidePinDeviceState(dir).panelWidth).toBe(SIDE_PIN_WIDTH_DEFAULT);
  });
});

describe('AC-21 — 저장 실패 구분', () => {
  test('본 파일 저장에 실패하면 failed이고 기존 파일이 남는다', () => {
    saveSidePinDeviceState(dir, SAMPLE);
    const before = fs.readFileSync(primaryFile(), 'utf-8');

    // 이름 바꾸기가 실패하는 상황을 만든다
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM');
    });

    const result = saveSidePinDeviceState(dir, { ...SAMPLE, panelWidth: 380 });

    expect(result).toBe('failed');
    expect(fs.readFileSync(primaryFile(), 'utf-8')).toBe(before);
  });

  test('본 파일은 됐는데 예비 사본만 실패하면 경고이고 값은 지켜진다', () => {
    let calls = 0;
    const realRename = fs.renameSync.bind(fs);
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      calls += 1;
      // 두 번째(예비 사본) 이름 바꾸기만 실패시킨다
      if (calls === 2) throw new Error('EPERM');
      realRename(from, to);
    });

    const result = saveSidePinDeviceState(dir, SAMPLE);

    expect(result).toBe('saved-with-backup-warning');
    // 값은 본 파일에 남아 있어야 한다
    vi.restoreAllMocks();
    expect(loadSidePinDeviceState(dir)).toEqual(SAMPLE);
  });

  test('내용이 잘려서 쓰이면 기존 파일을 덮지 않는다', () => {
    saveSidePinDeviceState(dir, SAMPLE);
    const before = fs.readFileSync(primaryFile(), 'utf-8');

    // 확인 단계에서 다른 내용이 읽히는 상황(디스크 꽉 참 등)을 만든다
    vi.spyOn(fs, 'readFileSync').mockReturnValue('잘린 내용');

    const result = saveSidePinDeviceState(dir, { ...SAMPLE, panelWidth: 380 });

    expect(result).toBe('failed');
    vi.restoreAllMocks();
    expect(fs.readFileSync(primaryFile(), 'utf-8')).toBe(before);
  });
});
