import { useState, useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import {
  getRestorableHiddenEvents,
  countByReason,
  willReappearAsDuplicate,
  type HiddenEventItem,
} from '@domain/rules/hiddenEventRules';
import {
  getCategoryInfo,
  getCategoryDisplayName,
  countGoogleCategories,
} from '@adapters/presenters/categoryPresenter';
import { Modal } from '@adapters/components/common/Modal';
import { Notice } from '@adapters/components/common/Notice';

interface Props {
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  /** 되돌리기 실행 — 실제로 되돌린 개수를 돌려준다 */
  onRestore: (ids: readonly string[]) => Promise<number>;
  onClose: () => void;
}

/** 'YYYY-MM-DD' → '10월 5일 (월)' */
function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const day = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${day})`;
}

const REASON_LABEL: Readonly<Record<HiddenEventItem['reason'], string>> = {
  manual: '직접 치움',
  duplicate: '중복이라 접힘',
  unknown: '숨김',
};

/**
 * 숨긴 일정 다시 보기.
 *
 * 왜 필요한가 (2026-08-21) — 쌤핀에는 일정을 숨기는 길이 둘 있는데(학사일정 "삭제", 중복 정리)
 * 다시 꺼내는 길이 없었다. 자료는 남아 있어도 선생님 입장에선 지워진 것과 같았고, 그래서 중복
 * 정리 안내에서 "언제든 되돌릴 수 있다"는 말을 빼야 했다. 이 화면이 그 약속을 되살린다.
 *
 * 되돌리기를 막지 않는다 — 중복이라 접은 것을 되돌리면 달력에 다시 두 줄로 보이지만, 그건
 * 선생님이 판단할 일이다. 다만 **모르고 누르는 일은 없게** 그 줄에 미리 표시해 둔다.
 */
export function HiddenEventsModal({ events, categories, onRestore, onClose }: Props) {
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [isRestoringAll, setIsRestoringAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const items = useMemo(() => getRestorableHiddenEvents(events), [events]);
  const counts = useMemo(() => countByReason(items), [items]);
  const googleCount = useMemo(() => countGoogleCategories(categories), [categories]);

  const categoryLabel = (event: SchoolEvent): string =>
    getCategoryDisplayName(getCategoryInfo(event.category, categories), googleCount);

  const handleRestoreOne = async (id: string) => {
    setWorkingId(id);
    await onRestore([id]);
    setWorkingId(null);
  };

  const handleRestoreAll = async () => {
    setIsRestoringAll(true);
    await onRestore(items.map((i) => i.event.id));
    setIsRestoringAll(false);
    setConfirmAll(false);
  };

  return (
    <Modal isOpen onClose={onClose} title="숨긴 일정 다시 보기" srOnlyTitle size="md">
      <div className="flex flex-col min-h-0">
        <div className="px-6 py-5 border-b border-sp-border shrink-0">
          <h3 className="text-lg font-bold text-sp-text">숨긴 일정 다시 보기</h3>
          <p className="text-sm text-sp-muted mt-1 break-keep">
            달력에서 감춰 둔 일정입니다. 지운 것이 아니라서 언제든 다시 꺼낼 수 있어요.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-sp-muted">숨긴 일정이 없습니다.</p>
          </div>
        ) : (
          <>
            {counts.duplicate > 0 && (
              <div className="px-6 pt-4 shrink-0">
                <Notice variant="info" size="md">
                  <span className="font-bold">중복이라 접힘</span> 으로 표시된 {counts.duplicate}
                  건을 되돌리면 달력에 그 일정이 다시 두 줄로 보입니다.
                </Notice>
              </div>
            )}

            <div className="px-6 py-4 max-h-[340px] overflow-y-auto flex flex-col gap-2">
              {items.map((item) => {
                const { event } = item;
                const isWorking = workingId === event.id;

                return (
                  <div
                    key={event.id}
                    className="rounded-xl border border-sp-border bg-sp-card/60 px-4 py-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-xs text-sp-muted tabular-nums shrink-0">
                          {formatDayLabel(event.date)}
                        </span>
                        <span className="text-sm font-bold text-sp-text truncate">
                          {event.title}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs min-w-0">
                        <span
                          className={
                            willReappearAsDuplicate(item)
                              ? 'text-sp-warning font-medium shrink-0'
                              : 'text-sp-muted shrink-0'
                          }
                        >
                          {REASON_LABEL[item.reason]}
                        </span>
                        <span className="text-sp-muted/60 shrink-0">·</span>
                        <span className="text-sp-muted/70 truncate">{categoryLabel(event)}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleRestoreOne(event.id)}
                      disabled={isWorking || isRestoringAll}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-sp-surface text-sp-text hover:bg-sp-accent hover:text-sp-accent-fg border border-sp-border text-xs font-bold transition-colors disabled:opacity-50"
                    >
                      {isWorking ? '되돌리는 중...' : '다시 보기'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="px-6 py-4 border-t border-sp-border flex justify-between items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border text-sm font-medium transition-colors"
          >
            닫기
          </button>

          {items.length > 1 &&
            (confirmAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-sp-muted">{items.length}건 모두 되돌릴까요?</span>
                <button
                  type="button"
                  onClick={() => setConfirmAll(false)}
                  className="px-3 py-2 rounded-xl bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border text-xs font-medium transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void handleRestoreAll()}
                  disabled={isRestoringAll}
                  className="px-4 py-2 rounded-xl bg-sp-accent text-sp-accent-fg hover:bg-sp-accent/90 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isRestoringAll ? '되돌리는 중...' : '모두 되돌리기'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmAll(true)}
                className="px-5 py-2.5 rounded-xl bg-sp-surface text-sp-text hover:bg-sp-surface/80 border border-sp-border text-sm font-medium transition-colors"
              >
                {items.length}건 모두 되돌리기
              </button>
            ))}
        </div>
      </div>
    </Modal>
  );
}
