import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefCallback,
} from 'react';
import type { Sticker } from '@domain/entities/Sticker';
import { searchStickers, groupByPack, getRecent } from '@domain/rules/stickerRules';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { IconButton } from '@adapters/components/common/IconButton';
import { Kbd } from '@adapters/components/common/Kbd';
import { StickerThumbnail } from './StickerThumbnail';
import './stickerElectronTypes';

interface StickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
}

const GRID_COLS = 5;
const SEARCH_DEBOUNCE_MS = 150;

interface FlatSection {
  readonly key: string;
  readonly title: string;
  readonly icon: string;
  readonly stickers: readonly Sticker[];
}

/**
 * 글로벌 이모티콘 피커.
 *
 * - 검색창 + 최근 사용 + 팩별 섹션
 * - 키보드 내비게이션: ↑↓←→ Enter Esc Tab /
 * - 선택 시 클립보드 복사 + 자동 붙여넣기 + closePicker
 * - 빈 상태: 등록 0개 / 검색 0건 각각 분리
 *
 * 5×N 그리드. 검색 모드일 때는 단일 "검색 결과" 섹션만 노출.
 */
export function StickerPicker({ isOpen, onClose }: StickerPickerProps): JSX.Element | null {
  const data = useStickerStore((s) => s.data);
  const loaded = useStickerStore((s) => s.loaded);

  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isClosing, setIsClosing] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const thumbRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // 디바운스
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(rawQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // 열릴 때마다 상태 초기화 + auto-focus
  useEffect(() => {
    if (!isOpen) return;
    setRawQuery('');
    setDebouncedQuery('');
    setFocusedIndex(0);
    setIsClosing(false);
    const t = setTimeout(() => searchInputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [isOpen]);

  // 섹션 빌드
  const sections = useMemo<FlatSection[]>(() => {
    if (!loaded) return [];
    const stickers = data.stickers;
    const trimmedQuery = debouncedQuery.trim();

    if (trimmedQuery.length > 0) {
      const filtered = searchStickers(stickers, trimmedQuery);
      return [{ key: 'search', title: '검색 결과', icon: 'search', stickers: filtered }];
    }

    const result: FlatSection[] = [];
    const recent = getRecent(stickers, data.settings.recentMaxCount);
    if (recent.length > 0) {
      result.push({ key: 'recent', title: '최근 사용', icon: 'schedule', stickers: recent });
    }
    const groups = groupByPack(stickers, data.packs);
    for (const { pack, stickers: items } of groups) {
      result.push({
        key: `pack-${pack.id}`,
        title: pack.name,
        icon: 'folder',
        stickers: items,
      });
    }
    return result;
  }, [loaded, data, debouncedQuery]);

  // 평탄화된 포커스 인덱스 → sticker
  const flatList = useMemo(() => sections.flatMap((s) => s.stickers), [sections]);
  const totalStickers = flatList.length;

  useEffect(() => {
    if (focusedIndex >= totalStickers) {
      setFocusedIndex(Math.max(0, totalStickers - 1));
    }
  }, [focusedIndex, totalStickers]);

  // ────────────────────────────────────────────────────────
  // 선택 (paste flow)
  // ────────────────────────────────────────────────────────

  const handlePick = useCallback(
    async (stickerId: string) => {
      if (isClosing) return;
      setIsClosing(true);

      try {
        const settings = useStickerStore.getState().data.settings;
        const api = window.electronAPI?.sticker;

        if (!api) {
          // 브라우저 dev mode 폴백 — 토스트만
          useToastStore.getState().show('데스크톱 앱에서만 자동 붙여넣기가 동작해요.', 'info');
          onClose();
          return;
        }

        const result = await api.paste(stickerId, settings.restorePreviousClipboard);

        if (result.ok) {
          // 성공한 경우에만 사용 기록 — 실패한 paste로 카운트가 부풀려지지 않도록.
          // fire-and-forget: 피커 닫힘 애니메이션을 metadata 저장이 막지 않게 한다.
          void useStickerStore.getState().recordUsage(stickerId);

          if (result.autoPasted) {
            // 성공 — 메인 윈도우에서 토스트 안 띄움 (피커가 이미 닫혔고, 카톡 등 외부 앱에 포커스)
          } else if (result.reason === 'accessibility-denied') {
            // macOS Phase 2 — 접근성 권한 미허용: 권한 허용하기 버튼이 있는 토스트 표시.
            // 사용자가 "권한 허용하기" 클릭 시 시스템 다이얼로그 + 보안 패널 자동 오픈.
            useToastStore.getState().show(
              'macOS 접근성 권한이 필요해요. 권한을 허용하면 자동 붙여넣기가 동작해요.',
              'info',
              {
                label: '권한 허용하기',
                onClick: () => {
                  const requestPerm =
                    window.electronAPI?.sticker?.requestAccessibilityPermission;
                  if (typeof requestPerm !== 'function') {
                    // 폴백 — 클립보드는 채워져 있으므로 수동 Cmd+V 안내
                    useToastStore
                      .getState()
                      .show(
                        '이모티콘이 복사됐어요. Cmd+V로 붙여넣어주세요.',
                        'info',
                      );
                    return;
                  }
                  void requestPerm()
                    .then((permResult) => {
                      if (permResult.granted) {
                        useToastStore
                          .getState()
                          .show(
                            '권한이 허용되었어요! 다시 시도해 주세요.',
                            'success',
                          );
                      } else {
                        useToastStore
                          .getState()
                          .show(
                            '시스템 환경설정 → 보안 및 개인정보 → 접근성에서 쌤핀을 추가해 주세요.',
                            'info',
                          );
                      }
                    })
                    .catch(() => {
                      useToastStore
                        .getState()
                        .show(
                          '권한 요청 중 오류가 발생했어요. 시스템 환경설정에서 직접 허용해 주세요.',
                          'error',
                        );
                    });
                },
              },
            );
          } else if (result.reason === 'unsupported-platform') {
            useToastStore
              .getState()
              .show(
                '이 운영체제는 자동 붙여넣기를 지원하지 않아요. 클립보드에서 직접 붙여넣어주세요.',
                'info',
              );
          } else {
            // Windows: nut-js 미설치 / macOS: osascript 실패 등 — 수동 폴백.
            // OS에 맞춰 Ctrl+V / Cmd+V 안내. 키조합은 nav.userAgent 대신 reason만 가지고는
            // 정확히 모르므로 일반 표현 사용.
            useToastStore
              .getState()
              .show(
                '이모티콘이 복사됐어요. 붙여넣기(Ctrl+V / Cmd+V) 해주세요.',
                'info',
              );
          }
        } else {
          useToastStore
            .getState()
            .show(
              result.reason ?? '붙여넣기에 실패했어요. 클립보드에서 직접 붙여넣어주세요.',
              'error',
            );
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[StickerPicker] paste 실패:', err);
        useToastStore.getState().show('이모티콘 붙여넣기 중 오류가 발생했어요.', 'error');
      } finally {
        onClose();
      }
    },
    [isClosing, onClose],
  );

  // ────────────────────────────────────────────────────────
  // 키보드 내비게이션
  // ────────────────────────────────────────────────────────

  const moveFocusBy = useCallback(
    (delta: number) => {
      if (totalStickers === 0) return;
      const next = Math.max(0, Math.min(totalStickers - 1, focusedIndex + delta));
      setFocusedIndex(next);
      const sticker = flatList[next];
      if (sticker) {
        thumbRefs.current.get(sticker.id)?.focus();
      }
    },
    [flatList, focusedIndex, totalStickers],
  );

  const focusFirstThumb = useCallback(() => {
    if (totalStickers === 0) return;
    setFocusedIndex(0);
    thumbRefs.current.get(flatList[0]!.id)?.focus();
  }, [flatList, totalStickers]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      const target = e.target as HTMLElement;
      const inSearchBox = target === searchInputRef.current;

      if (inSearchBox) {
        if (e.key === 'ArrowDown' || e.key === 'Tab') {
          if (totalStickers > 0) {
            e.preventDefault();
            focusFirstThumb();
          }
          return;
        }
        if (e.key === 'Enter' && totalStickers > 0) {
          e.preventDefault();
          const sticker = flatList[0];
          if (sticker) void handlePick(sticker.id);
          return;
        }
        return;
      }

      // 그리드 안에서
      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveFocusBy(1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveFocusBy(-1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocusBy(GRID_COLS);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (focusedIndex < GRID_COLS) {
          // 첫 행에서 ↑ → 검색창으로 복귀
          searchInputRef.current?.focus();
        } else {
          moveFocusBy(-GRID_COLS);
        }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const sticker = flatList[focusedIndex];
        if (sticker) void handlePick(sticker.id);
        return;
      }
    },
    [flatList, focusFirstThumb, focusedIndex, handlePick, moveFocusBy, onClose, totalStickers],
  );

  // 외부 클릭으로 닫기
  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const setThumbRef = (id: string): RefCallback<HTMLButtonElement> => (el) => {
    if (el) thumbRefs.current.set(id, el);
    else thumbRefs.current.delete(id);
  };

  const trimmedQuery = debouncedQuery.trim();
  const isSearching = trimmedQuery.length > 0;
  const showEmpty = loaded && totalStickers === 0 && !isSearching;
  const showNoResults = loaded && totalStickers === 0 && isSearching;

  return (
    <div
      onMouseDown={handleBackdropMouseDown}
      className={[
        'h-screen w-screen flex flex-col bg-transparent',
        'animate-fade-in motion-reduce:animate-none',
        isClosing ? 'pointer-events-none opacity-0 transition-opacity duration-sp-base' : '',
      ].filter(Boolean).join(' ')}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="이모티콘 피커"
        onKeyDown={handleKeyDown}
        className={[
          'flex-1 min-h-0 w-full flex flex-col',
          'bg-sp-card border border-sp-border rounded-xl shadow-sp-lg ring-1 ring-white/5',
          'overflow-hidden',
          'animate-scale-in motion-reduce:animate-none',
        ].join(' ')}
      >
        {/* 헤더 — CommandPalette 패턴: 검색 input 자체가 헤더 */}
        <div className="relative flex items-center border-b border-sp-border shrink-0">
          <span
            aria-hidden="true"
            className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-sp-muted pointer-events-none select-none"
          >
            sentiment_very_satisfied
          </span>
          <input
            ref={searchInputRef}
            type="search"
            role="searchbox"
            autoComplete="off"
            spellCheck={false}
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="이름이나 태그로 찾기"
            aria-label="이모티콘 검색"
            className="h-[52px] w-full bg-transparent pl-12 pr-12 text-[15px] text-sp-text placeholder:text-sp-muted outline-none"
          />
          {isSearching && (
            <p role="status" aria-live="polite" className="sr-only">
              {`검색 결과 ${totalStickers}개`}
            </p>
          )}
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <IconButton
              icon="close"
              label="피커 닫기"
              variant="ghost"
              size="sm"
              onClick={onClose}
            />
          </div>
        </div>

        {/* 콘텐츠 */}
        <div
          role="grid"
          aria-rowcount={Math.ceil(totalStickers / GRID_COLS) || 1}
          aria-colcount={GRID_COLS}
          className="flex-1 overflow-y-auto overscroll-contain"
        >
          {!loaded && (
            <div className="px-4 py-12 flex flex-col items-center gap-3 text-sp-muted">
              <span className="material-symbols-outlined icon-xl animate-pulse">
                hourglass_empty
              </span>
              <p className="text-sm">이모티콘 불러오는 중...</p>
            </div>
          )}

          {showEmpty && <PickerEmptyState onClose={onClose} />}
          {showNoResults && <PickerNoResults query={trimmedQuery} />}

          {sections.map((section) => (
            <PickerSection
              key={section.key}
              section={section}
              flatStartIndex={flatList.indexOf(section.stickers[0]!)}
              focusedIndex={focusedIndex}
              setThumbRef={setThumbRef}
              onPick={handlePick}
            />
          ))}
        </div>

        {/* 푸터 (단축키 힌트) — CommandPalette 패턴 + 공용 Kbd */}
        {loaded && totalStickers > 0 && (
          <div className="shrink-0 border-t border-sp-border px-4 py-2 flex items-center gap-3 text-detail text-sp-muted bg-sp-bg/30 font-sp-medium">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <Kbd>←</Kbd>
              <Kbd>→</Kbd>
              <span className="ml-1">이동</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd>
              <span className="ml-1">선택</span>
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd>
              <span className="ml-1">닫기</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────────────────────

interface PickerSectionProps {
  section: FlatSection;
  flatStartIndex: number;
  focusedIndex: number;
  setThumbRef: (id: string) => RefCallback<HTMLButtonElement>;
  onPick: (id: string) => void;
}

function PickerSection({
  section,
  flatStartIndex,
  focusedIndex,
  setThumbRef,
  onPick,
}: PickerSectionProps): JSX.Element {
  return (
    <section>
      <header
        className={[
          'px-4 pt-3 pb-1 flex items-center gap-2',
          'text-detail font-sp-semibold uppercase tracking-wider text-sp-muted select-none',
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className="material-symbols-outlined icon-sm text-sp-muted"
        >
          {section.icon}
        </span>
        <span>{section.title}</span>
        <span className="ml-auto text-detail font-normal normal-case tracking-normal">
          {section.stickers.length}개
        </span>
      </header>
      <div
        role="row"
        className="grid grid-cols-5 gap-2 p-3"
      >
        {section.stickers.map((sticker, i) => {
          const flatIdx = flatStartIndex + i;
          return (
            <StickerThumbnail
              key={sticker.id}
              ref={setThumbRef(sticker.id)}
              sticker={sticker}
              size={64}
              focused={flatIdx === focusedIndex}
              onClick={() => onPick(sticker.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

function PickerEmptyState({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="px-6 py-10 flex flex-col items-center text-center gap-4">
      <div className="text-5xl select-none" aria-hidden="true">
        😎
      </div>
      <div>
        <p className="text-sm font-sp-semibold text-sp-text">아직 이모티콘이 없어요!</p>
        <p className="text-detail text-sp-muted mt-1.5 leading-relaxed">
          쌤도구 → 내 이모티콘에서<br />
          나만의 이모티콘을 만들어볼까요?
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          // openManager가 있으면 메인 창을 tool-sticker로 이동시키고,
          // 없으면(브라우저 dev 모드) 그냥 피커만 닫는다 — graceful degrade.
          const openManager = window.electronAPI?.sticker?.openManager;
          if (typeof openManager === 'function') {
            void openManager().catch(() => {
              // 호출 실패는 사용자 흐름을 막지 않음
            });
          }
          onClose();
        }}
        className={[
          'mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg',
          'bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold',
          'hover:bg-sp-accent/90 active:scale-95',
          'transition-all duration-sp-base ease-sp-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-card',
        ].join(' ')}
      >
        <span className="material-symbols-outlined icon-sm">construction</span>
        쌤도구 열기
      </button>
    </div>
  );
}

function PickerNoResults({ query }: { query: string }): JSX.Element {
  return (
    <div className="px-4 py-8 text-center text-sm text-sp-muted">
      <span className="text-sp-text">{`"${query}"`}</span>와 일치하는 이모티콘이 없어요
    </div>
  );
}
