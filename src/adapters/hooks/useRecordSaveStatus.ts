import { useState, useCallback, useRef } from 'react';

/**
 * 저장 상태 머신 — 담임/교과 양쪽 기록 입력에서 공유.
 *
 * 상태 전이:
 *   idle → dirty(변경됨) → saving(저장중) → saved(저장됨✓)
 *                                          → error(저장 실패)
 *   saved/error → dirty(재변경 시)
 *
 * 사용 원칙:
 * - markDirty(): 입력값 변경 시 호출 → dirty 상태로 전이.
 * - wrapSave(fn): 실제 저장 함수를 감싸서 saving→saved/error 전이 처리.
 * - reset(): 폼 초기화(저장 완료·리셋) 시 idle로.
 */

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface UseRecordSaveStatusReturn {
  saveStatus: SaveStatus;
  markDirty: () => void;
  /**
   * 저장 함수 fn을 실행하면서 상태 전이를 처리. fn이 throw하면 error 상태.
   * **반환값 = 성공 여부.** 호출부는 이 값으로 폼 리셋 여부를 정한다 — 실패했는데 리셋하면
   * 교사가 쓴 본문이 사라진다(계획 §5.2).
   */
  wrapSave: (fn: () => Promise<void>) => Promise<boolean>;
  reset: () => void;
  /** 현재 dirty 또는 error(미저장 변경)인지 */
  isDirty: () => boolean;
}

export function useRecordSaveStatus(): UseRecordSaveStatusReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // 저장 중 추가 dirty 변경이 들어왔는지 추적 (저장 완료 후 즉시 dirty 로 복귀)
  const dirtyDuringSaveRef = useRef(false);

  const markDirty = useCallback(() => {
    setSaveStatus((prev) => {
      if (prev === 'saving') {
        dirtyDuringSaveRef.current = true;
        return prev; // 저장 중에는 상태 바꾸지 않음 — 완료 후 dirty 로 복귀
      }
      return 'dirty';
    });
  }, []);

  const wrapSave = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    dirtyDuringSaveRef.current = false;
    setSaveStatus('saving');
    try {
      await fn();
      setSaveStatus(dirtyDuringSaveRef.current ? 'dirty' : 'saved');
      return true;
    } catch {
      setSaveStatus('error');
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    dirtyDuringSaveRef.current = false;
    setSaveStatus('idle');
  }, []);

  const isDirty = useCallback((): boolean => {
    return saveStatus === 'dirty' || saveStatus === 'error';
  }, [saveStatus]);

  return { saveStatus, markDirty, wrapSave, reset, isDirty };
}
