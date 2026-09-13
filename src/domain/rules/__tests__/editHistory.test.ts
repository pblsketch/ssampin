import { describe, it, expect, vi } from 'vitest';
import { EditHistory } from '../editHistory';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe('편집 이력', () => {
  it('여러 저장을 한 번에 취소하고 다시 실행하며 새 편집이면 redo를 비운다', async () => {
    let value = 0;
    const history = new EditHistory(
      () => value,
      (a, b) => a === b,
      async (_expected, target) => {
        value = target;
      },
      () => {},
    );
    await history.run('묶음', async () => {
      value = 1;
      await history.run('안쪽', async () => {
        value = 2;
      });
    });
    await history.travel('undo');
    expect(value).toBe(0);
    expect(history.canUndo).toBe(false);
    await history.travel('redo');
    expect(value).toBe(2);
    await history.travel('undo');
    await history.run('변경 없음', async () => {});
    expect(history.canRedo).toBe(true);
    await history.run('새 편집', async () => {
      value = 3;
    });
    expect(history.canRedo).toBe(false);
  });
  it('저장 실패 때 남은 변경도 기록하며 복원 실패는 커서를 이동하지 않는다', async () => {
    let value = 0;
    const apply = vi.fn(async (_expected: number, target: number) => {
      value = target;
    });
    const history = new EditHistory(
      () => value,
      (a, b) => a === b,
      apply,
      () => {},
    );
    await expect(
      history.run('부분 저장', async () => {
        value = 1;
        throw new Error('실패');
      }),
    ).rejects.toThrow();
    apply.mockRejectedValueOnce(new Error('복원 실패'));
    await expect(history.travel('undo')).rejects.toThrow('복원 실패');
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    await history.travel('undo');
    expect(value).toBe(0);
  });
  it('겹쳐 들어온 저장이 뒤늦게 끝나도 모든 변경을 포함한다', async () => {
    let value = 0;
    const a = deferred(),
      b = deferred();
    const history = new EditHistory(
      () => value,
      (a, b) => a === b,
      async (_e, t) => {
        value = t;
      },
      () => {},
    );
    const first = history.run('첫 작업', async () => {
      await a.promise;
      value = 1;
    });
    const second = history.run('둘째 작업', async () => {
      await b.promise;
      value = 2;
    });
    a.resolve();
    await first;
    expect(history.busy).toBe(true);
    b.resolve();
    await second;
    await history.travel('undo');
    expect(value).toBe(0);
    await history.travel('redo');
    expect(value).toBe(2);
  });
  it('보관 상한을 넘긴 오래된 작업만 지운다', async () => {
    let value = 0;
    const h = new EditHistory(
      () => value,
      (a, b) => a === b,
      async (_e, t) => {
        value = t;
      },
      () => {},
      2,
    );
    for (let i = 1; i <= 3; i++)
      await h.run('편집', async () => {
        value = i;
      });
    await h.travel('undo');
    await h.travel('undo');
    expect(value).toBe(1);
    expect(h.canUndo).toBe(false);
  });
});
