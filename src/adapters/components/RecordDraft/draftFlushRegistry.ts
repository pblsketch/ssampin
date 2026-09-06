/**
 * 초안 자동저장 대기분 flush 등록소 (계획 §4.3).
 *
 * 초안 입력칸은 700ms 뒤에 저장한다. 그 사이에 [근거 보드에서 보기] 같은 이동을 누르면
 * **아직 저장 안 된 글을 두고 화면이 바뀐다.** 그래서 이동 전에 대기분을 밀어 넣고
 * **성공을 기다린다.** 실패하면 이동하지 않고 원래 화면에 머문다.
 *
 * 왜 등록소인가: 저장을 아는 것은 입력칸(자식)인데, 이동을 결정하는 것은 상위 화면이다.
 * 상위가 자식마다 ref 를 들고 있으면 칸이 늘 때마다 배선이 늘어난다. 칸이 스스로 등록한다.
 */

/** 대기분을 저장하고 **성공 여부**를 돌려준다. 저장할 것이 없으면 true. */
export type DraftFlushFn = () => Promise<boolean>;

const pending = new Set<DraftFlushFn>();

/** 입력칸이 마운트될 때 등록한다. 반환값을 언마운트에서 부르면 등록이 풀린다. */
export function registerDraftFlush(fn: DraftFlushFn): () => void {
  pending.add(fn);
  return () => {
    pending.delete(fn);
  };
}

/**
 * 등록된 대기분을 **전부** 밀어 넣는다. 하나라도 실패하면 false.
 *
 * ★실패해도 나머지를 건너뛰지 않는다. 한 칸이 한도 초과로 막혔다고 다른 칸의 글까지
 *   저장 안 된 채로 두면 유실이 커진다. 전부 시도하고 결과만 모은다.
 */
export async function flushAllDrafts(): Promise<boolean> {
  if (pending.size === 0) return true;
  const results = await Promise.all(
    [...pending].map(async (fn) => {
      try {
        return await fn();
      } catch {
        return false;
      }
    }),
  );
  return results.every(Boolean);
}

/** 테스트 전용 — 등록소를 비운다. 프로덕션 호출 금지. */
export function resetDraftFlushRegistryForTest(): void {
  pending.clear();
}
