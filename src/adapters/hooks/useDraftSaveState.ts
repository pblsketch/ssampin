/**
 * useDraftSaveState — 저장 표시가 **실제 편집 상태와 어긋나지 않게** 한다.
 *
 * 무엇을 막는가: 옛 편집기는 저장하면 `저장했어요.` 를 띄우고 그대로 뒀다.
 * 그 뒤로 아무리 고쳐도 문구가 그대로라, 선생님은 저장되지 않은 내용을 저장된 것으로 본다.
 *
 * 핵심은 **저장을 요청한 시점의 내용**을 기억하는 것이다.
 * 저장 중에 새로 친 글자는 저장 요청에 담기지 않았으므로 `저장하지 않은 변경`으로 남아야 한다.
 */

import { useCallback, useRef, useState } from 'react';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'failed';

export interface DraftSaveState {
  readonly state: SaveState;
  /** 선생님에게 그대로 보여 줄 문구 */
  readonly label: string;
  /** 저장하지 않은 변경이 있는가 (나가기 확인용) */
  readonly dirty: boolean;
  /**
   * 저장 실행. `save` 는 실제 저장 동작이고 성공 여부를 돌려준다.
   * 저장 시점의 내용(`snapshot`)을 기억해 두었다가, 저장이 끝난 뒤
   * 지금 내용과 견주어 그 사이에 더 고친 게 있으면 `dirty` 로 남긴다.
   */
  readonly runSave: (snapshot: string, save: () => boolean) => boolean;
  /** 현재 내용을 알려 준다 — 원본과 같으면 `saved`, 다르면 `dirty` */
  readonly sync: (current: string, original: string) => void;
}

const LABELS: Readonly<Record<SaveState, string>> = {
  saved: '저장됨',
  dirty: '저장하지 않은 변경',
  saving: '저장 중…',
  failed: '저장하지 못함',
};

export function useDraftSaveState(): DraftSaveState {
  const [state, setState] = useState<SaveState>('saved');
  /** 저장을 요청한 시점의 내용. 저장이 끝난 뒤 지금 내용과 견준다. */
  const savedSnapshot = useRef<string | null>(null);
  const latest = useRef<string>('');

  const runSave = useCallback((snapshot: string, save: () => boolean): boolean => {
    setState('saving');
    let ok = false;
    try {
      ok = save();
    } catch {
      ok = false;
    }
    if (!ok) {
      // 실패해도 입력 내용은 그대로 둔다 — 화면은 손대지 않는다.
      // 저장된 것으로 기억하지도 않는다. 다시 저장할 때까지 `저장하지 못함` 으로 남는다.
      setState('failed');
      return false;
    }
    savedSnapshot.current = snapshot;
    // 저장하는 사이에 더 고쳤으면 아직 저장되지 않은 변경이 남아 있다.
    setState(latest.current === snapshot ? 'saved' : 'dirty');
    return true;
  }, []);

  const sync = useCallback((current: string, original: string): void => {
    const changed = latest.current !== current;
    latest.current = current;
    setState((prev) => {
      if (prev === 'saving') return prev;
      // 저장에 실패한 채로 두면 "저장된 것 같다"는 오해가 생긴다.
      // 다시 고치면 `저장하지 않은 변경`, 그대로면 `저장하지 못함` 을 유지한다.
      if (prev === 'failed') return changed ? 'dirty' : 'failed';
      if (savedSnapshot.current !== null) {
        return current === savedSnapshot.current ? 'saved' : 'dirty';
      }
      return current === original ? 'saved' : 'dirty';
    });
  }, []);

  return {
    state,
    label: LABELS[state],
    dirty: state === 'dirty' || state === 'failed',
    runSave,
    sync,
  };
}
