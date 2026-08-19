/**
 * dataRoot fs 통합 테스트 — 실제 임시 디렉토리에서 위치 결정·이사·정리를 검증한다.
 *
 * 이 기능의 사고는 전부 "자료가 사라졌다" 형태로 나타나므로, 실패 경로에서
 * **원본이 온전한지**를 성공 경로만큼 비중 있게 확인한다.
 *
 * 핵심 AC:
 *  - AC-1: 포인터 없음 → 기본 위치
 *  - AC-2: 포인터가 가리키는 폴더가 없으면(외장 드라이브 미연결) 기본 위치로 폴백하되
 *          포인터는 지우지 않는다 — 드라이브를 다시 꽂으면 원래 위치로 돌아와야 한다
 *  - AC-3: 이사 후 새 위치에 자료가 그대로 있고, 원본은 지워지지 않고 보존된다
 *  - AC-4: 이미 쌤핀 자료가 있는 폴더·중첩 폴더·기본 폴더 안쪽은 거부한다
 *  - AC-5: 임시 파일 정리는 캐시만 지우고 자료와 로그인 세션(Local Storage)은 건드리지 않는다
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  CONTENT_DIRS,
  POINTER_FILENAME,
  __resetContentRootForTest,
  clearCaches,
  getContentRoot,
  getContentRootState,
  initContentRoot,
  measureUsage,
  moveContentTo,
  resetToDefault,
  validateTarget,
} from './dataRoot';

let tmp: string;
let defaultRoot: string;

const STUDENTS = JSON.stringify({ students: [{ id: 's1' }, { id: 's2' }] });
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

/** 기본 위치에 선생님 자료 + 캐시 + 로그인 세션을 심는다. */
function seed(root: string): void {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data', 'archives', '2025-1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'forms'), { recursive: true });
  fs.mkdirSync(path.join(root, 'obs-attachments'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'students.json'), STUDENTS, 'utf-8');
  fs.writeFileSync(
    path.join(root, 'data', 'archives', '2025-1', 'students.json'),
    STUDENTS,
    'utf-8',
  );
  fs.writeFileSync(path.join(root, 'forms', 'a.hwpx'), PNG);
  fs.writeFileSync(path.join(root, 'obs-attachments', 'att-1.png'), PNG);

  // 부산물 + 로그인 세션
  fs.mkdirSync(path.join(root, 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Cache', 'blob-1'), Buffer.alloc(2048, 7));
  fs.mkdirSync(path.join(root, 'Code Cache'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Code Cache', 'js-1'), Buffer.alloc(1024, 3));
  fs.mkdirSync(path.join(root, 'Local Storage'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Local Storage', 'token'), 'google-session', 'utf-8');
}

function writePointer(root: string, target: string): void {
  fs.writeFileSync(
    path.join(root, POINTER_FILENAME),
    JSON.stringify({ contentRoot: target, updatedAt: new Date().toISOString() }),
    'utf-8',
  );
}

beforeEach(() => {
  __resetContentRootForTest();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-dataroot-'));
  defaultRoot = path.join(tmp, 'userData');
  fs.mkdirSync(defaultRoot, { recursive: true });
  seed(defaultRoot);
});

afterEach(() => {
  __resetContentRootForTest();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('initContentRoot — 위치 결정', () => {
  test('AC-1: 포인터가 없으면 기본 위치를 쓴다', () => {
    const state = initContentRoot(defaultRoot);
    expect(state.reason).toBe('default');
    expect(state.contentRoot).toBe(path.resolve(defaultRoot));
    expect(state.configuredRoot).toBeNull();
  });

  test('포인터가 가리키는 폴더가 있으면 그 폴더를 쓴다', () => {
    const target = path.join(tmp, 'school-drive');
    fs.mkdirSync(target, { recursive: true });
    writePointer(defaultRoot, target);

    const state = initContentRoot(defaultRoot);
    expect(state.reason).toBe('custom');
    expect(state.contentRoot).toBe(path.resolve(target));
  });

  test('AC-2: 폴더가 없으면 기본 위치로 폴백하되 포인터는 보존한다', () => {
    const missing = path.join(tmp, 'unplugged-usb');
    writePointer(defaultRoot, missing);

    const state = initContentRoot(defaultRoot);
    expect(state.reason).toBe('fallback-missing');
    expect(state.contentRoot).toBe(path.resolve(defaultRoot));
    // 드라이브를 다시 꽂으면 원래 위치로 돌아와야 하므로 포인터를 지우면 안 된다
    expect(state.configuredRoot).toBe(path.resolve(missing));
    expect(fs.existsSync(path.join(defaultRoot, POINTER_FILENAME))).toBe(true);
  });

  test('포인터가 파일을 가리키면 폴백한다', () => {
    const notDir = path.join(tmp, 'a-file.txt');
    fs.writeFileSync(notDir, 'x', 'utf-8');
    writePointer(defaultRoot, notDir);

    expect(initContentRoot(defaultRoot).reason).toBe('fallback-invalid');
  });

  test('망가진 포인터 파일은 기본 위치로 조용히 흘린다', () => {
    fs.writeFileSync(path.join(defaultRoot, POINTER_FILENAME), '{ broken', 'utf-8');
    expect(initContentRoot(defaultRoot).reason).toBe('default');
  });

  test('init 이전 getContentRoot 호출은 조용히 넘어가지 않고 예외를 던진다', () => {
    __resetContentRootForTest();
    expect(() => getContentRoot()).toThrow();
  });
});

describe('validateTarget — 거부 규칙', () => {
  beforeEach(() => {
    initContentRoot(defaultRoot);
  });

  test('AC-4: 현재 위치와 같으면 거부', () => {
    const result = validateTarget(defaultRoot);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('same-location');
  });

  test('AC-4: 기본 폴더 안쪽은 거부 — 앱 삭제 시 자료까지 지워진다', () => {
    const inside = path.join(defaultRoot, 'somewhere');
    fs.mkdirSync(inside, { recursive: true });
    const result = validateTarget(inside);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('inside-default');
  });

  test('AC-4: 이미 쌤핀 자료가 있는 폴더는 거부 — 덮어쓰기 사고 방지', () => {
    const target = path.join(tmp, 'used');
    fs.mkdirSync(path.join(target, 'data'), { recursive: true });
    const result = validateTarget(target);
    expect(result.ok).toBe(false);
    expect(result.failure).toBe('occupied');
    expect(result.message).toContain('data');
  });

  test('빈 폴더는 통과', () => {
    const target = path.join(tmp, 'empty');
    fs.mkdirSync(target, { recursive: true });
    expect(validateTarget(target).ok).toBe(true);
  });
});

describe('moveContentTo — 이사', () => {
  let target: string;

  beforeEach(() => {
    initContentRoot(defaultRoot);
    target = path.join(tmp, 'school-drive');
    fs.mkdirSync(target, { recursive: true });
  });

  test('AC-3: 자료가 새 위치로 복사되고 보관함·첨부까지 따라간다', () => {
    const result = moveContentTo(target);
    expect(result.ok).toBe(true);

    expect(fs.readFileSync(path.join(target, 'data', 'students.json'), 'utf-8')).toBe(STUDENTS);
    // 학기 보관함(data 하위)과 관찰 첨부(data 밖)가 모두 옮겨져야 한다
    expect(fs.existsSync(path.join(target, 'data', 'archives', '2025-1', 'students.json'))).toBe(
      true,
    );
    expect(fs.readFileSync(path.join(target, 'obs-attachments', 'att-1.png'))).toEqual(PNG);
    expect(fs.readFileSync(path.join(target, 'forms', 'a.hwpx'))).toEqual(PNG);
  });

  test('AC-3: 원본은 지우지 않고 .moved-* 로 보존한다', () => {
    const result = moveContentTo(target);
    expect(result.ok).toBe(true);
    expect(result.preservedOriginals?.length).toBeGreaterThan(0);

    // 원래 이름은 비었지만 자료 자체는 디스크에 남아 있어야 한다
    expect(fs.existsSync(path.join(defaultRoot, 'data'))).toBe(false);
    const parked = fs.readdirSync(defaultRoot).filter((n) => n.startsWith('data.moved-'));
    expect(parked.length).toBe(1);
    const parkedName = parked[0];
    expect(parkedName).toBeDefined();
    expect(
      fs.readFileSync(path.join(defaultRoot, parkedName as string, 'students.json'), 'utf-8'),
    ).toBe(STUDENTS);
  });

  test('이사 후 포인터가 기록되고 다음 실행에서 새 위치를 읽는다', () => {
    expect(moveContentTo(target).ok).toBe(true);

    __resetContentRootForTest();
    const state = initContentRoot(defaultRoot);
    expect(state.reason).toBe('custom');
    expect(state.contentRoot).toBe(path.resolve(target));
  });

  test('캐시와 로그인 세션은 따라가지 않는다 — 재로그인이 필요 없어야 한다', () => {
    expect(moveContentTo(target).ok).toBe(true);

    expect(fs.existsSync(path.join(target, 'Cache'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'Local Storage'))).toBe(false);
    expect(fs.readFileSync(path.join(defaultRoot, 'Local Storage', 'token'), 'utf-8')).toBe(
      'google-session',
    );
  });

  test('거부되는 대상이면 원본을 건드리지 않는다', () => {
    const occupied = path.join(tmp, 'used');
    fs.mkdirSync(path.join(occupied, 'data'), { recursive: true });

    const result = moveContentTo(occupied);
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(path.join(defaultRoot, 'data', 'students.json'), 'utf-8')).toBe(
      STUDENTS,
    );
    expect(getContentRoot()).toBe(path.resolve(defaultRoot));
  });
});

describe('resetToDefault — 되돌리기', () => {
  test('포인터를 지우고 기본 위치 상태로 돌아온다', () => {
    const target = path.join(tmp, 'school-drive');
    fs.mkdirSync(target, { recursive: true });
    initContentRoot(defaultRoot);
    expect(moveContentTo(target).ok).toBe(true);

    resetToDefault();
    expect(getContentRootState().reason).toBe('default');
    expect(fs.existsSync(path.join(defaultRoot, POINTER_FILENAME))).toBe(false);
  });
});

describe('clearCaches / measureUsage — 임시 파일 정리', () => {
  beforeEach(() => {
    initContentRoot(defaultRoot);
  });

  test('AC-5: 캐시만 지우고 자료·로그인 세션은 남긴다', () => {
    const before = measureUsage();
    expect(before.cacheBytes).toBe(2048 + 1024);
    expect(before.contentBytes).toBeGreaterThan(0);

    const result = clearCaches();
    expect(result.ok).toBe(true);
    expect(result.freedBytes).toBe(2048 + 1024);

    expect(fs.existsSync(path.join(defaultRoot, 'Cache'))).toBe(false);
    expect(fs.existsSync(path.join(defaultRoot, 'Code Cache'))).toBe(false);
    // 자료와 로그인 세션은 그대로
    expect(fs.readFileSync(path.join(defaultRoot, 'data', 'students.json'), 'utf-8')).toBe(
      STUDENTS,
    );
    expect(fs.existsSync(path.join(defaultRoot, 'Local Storage', 'token'))).toBe(true);

    expect(measureUsage().cacheBytes).toBe(0);
  });

  test('자료를 옮긴 뒤에도 캐시는 기본 위치 기준으로 측정·정리한다', () => {
    const target = path.join(tmp, 'school-drive');
    fs.mkdirSync(target, { recursive: true });
    expect(moveContentTo(target).ok).toBe(true);

    const usage = measureUsage();
    expect(usage.cacheBytes).toBe(2048 + 1024);
    // 자료 용량은 새 위치 기준
    expect(usage.contentBytes).toBeGreaterThan(0);
    expect(usage.contentDirs.map((d) => d.name)).toEqual([...CONTENT_DIRS]);
  });
});
