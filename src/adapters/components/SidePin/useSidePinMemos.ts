/**
 * 옆핀 메모 목록을 화면에 공급하는 훅.
 *
 * 옆핀 창은 메인 창과 **다른 창**이라 자기 몫의 메모를 스스로 불러와야 한다.
 * 그리고 메인 창이나 위젯에서 메모를 고치면 그 사실을 알아야 한다 — Electron이
 * 파일이 바뀔 때마다 `data:changed`를 모든 창에 보내므로, 그때 다시 읽는다.
 * 이 구독이 없으면 옆핀만 옛날 목록을 붙들고 있어 "저장했는데 반영이 안 된다"가 된다.
 *
 * 무엇을 몇 개 보여줄지는 여기서 정하지 않는다. `selectSidePinMemos`가 정본이고,
 * 이 훅은 저장소와 그 규칙을 잇기만 한다.
 */
import { useEffect, useMemo } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { selectSidePinMemos, type SidePinMemoListItem } from '@usecases/sidePin/SelectSidePinMemos';

/** 메모가 담긴 데이터 파일 이름 — 이 파일이 바뀔 때만 다시 읽는다 */
const MEMO_DATA_FILE = 'memos';

export interface UseSidePinMemosResult {
  readonly items: readonly SidePinMemoListItem[];
  /** 처음 불러오기가 끝났는가. 끝나기 전에는 "메모 없음"을 보여주면 안 된다 */
  readonly loaded: boolean;
  /**
   * 보관하지 않은 메모의 전체 개수.
   *
   * 목록은 5개까지만 보여주므로, 이 값이 더 크면 "여기 보이는 게 전부가 아니다"를
   * 알려야 한다. 그러지 않으면 6번째 메모가 사라진 것처럼 보인다.
   */
  readonly totalActive: number;
}

/**
 * @param locked 잠금·절전 등 보호 상태. 참이면 내용을 아예 만들지 않는다.
 */
export function useSidePinMemos(locked: boolean): UseSidePinMemosResult {
  const memos = useMemoStore((state) => state.memos);
  const loaded = useMemoStore((state) => state.loaded);
  const load = useMemoStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDataChanged) return;
    return api.onDataChanged((filename: string) => {
      if (filename !== MEMO_DATA_FILE) return;
      // force로 읽어야 한다. 이미 불러온 적이 있다는 이유로 건너뛰면
      // 다른 창의 수정이 영원히 반영되지 않는다.
      void load(true);
    });
  }, [load]);

  const items = useMemo(() => selectSidePinMemos({ memos, locked }), [memos, locked]);
  const totalActive = useMemo(() => memos.filter((memo) => !memo.archived).length, [memos]);

  return { items, loaded, totalActive };
}
