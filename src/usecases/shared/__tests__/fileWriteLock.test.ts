import { describe, it, expect, beforeEach } from 'vitest';
import { withFileLock, resetFileWriteLocksForTest } from '../fileWriteLock';
import { SYNC_FILES, SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

/** 수동 해제 가능한 Promise — 임계구역이 겹치는 타이밍을 테스트가 직접 제어한다. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('withFileLock — 파일별 쓰기 직렬화', () => {
  beforeEach(() => {
    resetFileWriteLocksForTest();
  });

  it('같은 파일: 겹치는 읽기→변형→쓰기 임계구역 두 개가 직렬화되어 둘 다 반영된다', async () => {
    // 파일 역할을 하는 공유 상태 — 임계구역이 각자 읽고 통째로 다시 쓴다.
    let file: readonly string[] = [];
    const gate = deferred();

    // 임계구역 1: 읽기 → (지연) → c1 추가 저장. 락이 없다면 이 지연 동안
    // 임계구역 2가 같은 빈 스냅샷을 읽어 마지막 쓰기(c2)만 남는다(경합 재현 구조).
    const first = withFileLock('f', async () => {
      const snapshot = file;
      await gate.promise;
      file = [...snapshot, 'c1'];
    });
    const second = withFileLock('f', async () => {
      const snapshot = file;
      file = [...snapshot, 'c2'];
    });

    gate.resolve();
    await Promise.all([first, second]);
    expect(file).toEqual(['c1', 'c2']); // 락 없이는 ['c2']가 된다
  });

  it('같은 파일: 뒤 작업은 앞 작업이 끝난 뒤에 시작한다', async () => {
    const events: string[] = [];
    const gate = deferred();

    const first = withFileLock('f', async () => {
      events.push('first:start');
      await gate.promise;
      events.push('first:end');
    });
    const second = withFileLock('f', async () => {
      events.push('second:start');
    });

    // 앞 작업이 gate에 막혀 있는 동안 뒤 작업은 시작조차 못 한다.
    await Promise.resolve();
    expect(events).toEqual(['first:start']);

    gate.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('다른 파일: 서로 막지 않고 병렬로 돈다', async () => {
    const events: string[] = [];
    const gateA = deferred();

    const a = withFileLock('file-a', async () => {
      events.push('a:start');
      await gateA.promise;
      events.push('a:end');
    });
    const b = withFileLock('file-b', async () => {
      events.push('b:done');
    });

    // a가 막혀 있어도 b는 완료된다.
    await b;
    expect(events).toContain('b:done');
    expect(events).not.toContain('a:end');

    gateA.resolve();
    await a;
    expect(events).toEqual(['a:start', 'b:done', 'a:end']);
  });

  it('실패 격리: 앞 작업이 실패해도 뒤 작업은 실행되고, 실패는 호출자에게 전파된다', async () => {
    const boom = new Error('write failed');
    const first = withFileLock('f', async () => {
      throw boom;
    });
    const second = withFileLock('f', async () => 'ok');

    await expect(first).rejects.toBe(boom);
    await expect(second).resolves.toBe('ok');
  });

  it('반환값이 호출자에게 그대로 전달된다', async () => {
    const result = await withFileLock('f', async () => ({ saved: 42 }));
    expect(result).toEqual({ saved: 42 });
  });

  it('resetFileWriteLocksForTest 이후에도 정상 동작한다(테스트 격리)', async () => {
    await withFileLock('f', async () => undefined);
    resetFileWriteLocksForTest();
    await expect(withFileLock('f', async () => 'fresh')).resolves.toBe('fresh');
  });
});

describe('SYNC_FILE_KEYS — 락 키 정본 정합', () => {
  it('모든 락 키 값이 SYNC_REGISTRY 파생 SYNC_FILES에 존재한다(오타 방지)', () => {
    for (const key of Object.values(SYNC_FILE_KEYS)) {
      expect(SYNC_FILES).toContain(key);
    }
  });

  it('락 키 값은 각 도메인 리포지토리의 storage 키와 동일하다(계획 [lock-key] 확인)', () => {
    expect(SYNC_FILE_KEYS.studentRecords).toBe('student-records');
    expect(SYNC_FILE_KEYS.attendance).toBe('attendance');
    expect(SYNC_FILE_KEYS.observations).toBe('observations');
  });
});
