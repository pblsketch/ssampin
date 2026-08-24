import { create } from 'zustand';
import { coolImportHistoryRepository } from '@adapters/di/container';
import type { CoolImportHistory, CoolImportItem } from '@domain/entities/CoolMessage';
import {
  EMPTY_COOL_HISTORY,
  addRecords,
  importedKeySet,
  importedMessageKeys,
  sanitizeHistory,
} from '@domain/rules/coolImportHistory';

/**
 * 쿨메신저에서 이미 가져온 항목 기록.
 *
 * 이게 없으면 목록을 다시 열었을 때 **이미 등록한 쪽지를 구분할 수 없다.**
 * 무심코 또 누르면 일정이 두 개가 된다.
 *
 * 파일 하나에 담기는 작은 기록이라 오래된 것은 자동으로 정리한다(400일).
 */
interface CoolImportHistoryState {
  readonly history: CoolImportHistory;
  readonly loaded: boolean;
  load: () => Promise<void>;
  /** 등록에 성공한 항목들을 기록한다 */
  remember: (items: readonly CoolImportItem[]) => Promise<void>;
  /** 이미 가져온 항목인지 (쪽지+시각+대상) */
  isImported: (key: string) => boolean;
  /** 이 쪽지에서 무언가 가져간 적이 있는지 (목록 '가져옴' 배지) */
  hasImportedFrom: (messageKey: number) => boolean;

  /**
   * 이번 실행에서 알림 배너를 접었는지. **저장하지 않는다** — 껐다 켜면 다시 본다.
   * 모듈 전역 변수로 두면 창이 여러 개일 때 새어나가고 테스트에서도 남는다.
   */
  readonly bannerDismissed: boolean;
  dismissBanner: () => void;
}

export const useCoolImportHistoryStore = create<CoolImportHistoryState>((set, get) => {
  /**
   * 조회용 Set 캐시 — history 가 **다른 객체로 바뀌었을 때만** 다시 만든다.
   *
   * `isImported` 는 가져오기 창에서 날짜 후보 카드마다, `hasImportedFrom` 은 쪽지 목록
   * 줄마다 불린다. 호출마다 기록 전체를 돌며 Set 을 새로 만들면 렌더 한 번에
   * (기록 수 × 카드 수)만큼 낭비된다(2026-08-24 UltraQA P2). history 는 항상 통째로
   * 교체되므로(불변) 객체 동일성 비교만으로 신선도가 보장된다.
   */
  let cachedFor: CoolImportHistory | null = null;
  let cachedKeys: ReadonlySet<string> = new Set();
  let cachedMessageKeys: ReadonlySet<number> = new Set();
  const refreshCache = (history: CoolImportHistory): void => {
    if (cachedFor === history) return;
    cachedFor = history;
    cachedKeys = importedKeySet(history);
    cachedMessageKeys = importedMessageKeys(history);
  };

  return {
    history: EMPTY_COOL_HISTORY,
    loaded: false,

    load: async () => {
      try {
        const raw = await coolImportHistoryRepository.load();
        set({ history: sanitizeHistory(raw), loaded: true });
      } catch {
        // 기록을 못 읽어도 기능은 살아야 한다 — 중복 표시만 못 할 뿐이다
        set({ history: EMPTY_COOL_HISTORY, loaded: true });
      }
    },

    remember: async (items) => {
      if (items.length === 0) return;
      const next = addRecords(get().history, items, new Date());
      set({ history: next });
      try {
        await coolImportHistoryRepository.save(next);
      } catch {
        // 저장 실패해도 등록 자체는 이미 끝났다. 다음 실행에서 중복 표시가 빠질 뿐이다.
      }
    },

    isImported: (key) => {
      refreshCache(get().history);
      return cachedKeys.has(key);
    },
    hasImportedFrom: (messageKey) => {
      refreshCache(get().history);
      return cachedMessageKeys.has(messageKey);
    },

    bannerDismissed: false,
    dismissBanner: () => set({ bannerDismissed: true }),
  };
});
