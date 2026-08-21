import { useState, useMemo } from 'react';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { findDuplicateEventGroups, countDuplicateEvents } from '@domain/rules/eventDuplicateRules';
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
  /** 숨김 처리 실행 — 처리된 개수를 돌려준다 */
  onCleanup: (ids: readonly string[]) => Promise<number>;
  onClose: () => void;
}

/** 'YYYY-MM-DD' → '10월 5일 (월)' */
function formatDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const day = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${day})`;
}

/**
 * 중복 일정 정리 — 같은 날 같은 이름으로 여러 번 들어온 일정을 한 줄로 줄인다.
 *
 * 왜 "삭제"가 아니라 "정리(숨김)"인가 — 접는 대상은 구글·NEIS 에서 자동으로 들어온 사본이라
 * 지워도 다음 동기화 때 되살아난다. 숨김은 동기화가 존중하므로 다시 나타나지 않고, 자료도
 * 남는다. 그래서 문구도 "삭제"라고 쓰지 않는다.
 *
 * 다만 **앱에는 숨김을 되돌리는 버튼이 아직 없다**(2026-08-21 확인). NEIS 일정 삭제도 같은
 * 숨김을 쓰는데 마찬가지다. 그래서 안내 문구에 "언제든 되돌릴 수 있다"고 쓰지 않는다 —
 * 실제 복구 경로는 설정 → 백업/복원뿐이다. 숨김 해제 화면은 별도 과제.
 */
export function DuplicateCleanupModal({ events, categories, onCleanup, onClose }: Props) {
  const [isWorking, setIsWorking] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  const groups = useMemo(() => findDuplicateEventGroups(events), [events]);
  const total = useMemo(() => countDuplicateEvents(groups), [groups]);
  const googleCount = useMemo(() => countGoogleCategories(categories), [categories]);

  const categoryLabel = (event: SchoolEvent): string =>
    getCategoryDisplayName(getCategoryInfo(event.category, categories), googleCount);

  const handleCleanup = async () => {
    setIsWorking(true);
    const ids = groups.flatMap((g) => g.duplicates.map((e) => e.id));
    const count = await onCleanup(ids);
    setIsWorking(false);
    setDoneCount(count);
  };

  return (
    <Modal isOpen onClose={onClose} title="중복 일정 정리" srOnlyTitle size="md">
      <div className="flex flex-col min-h-0">
        <div className="px-6 py-5 border-b border-sp-border shrink-0">
          <h3 className="text-lg font-bold text-sp-text">중복 일정 정리</h3>
          <p className="text-sm text-sp-muted mt-1 break-keep">
            같은 날, 같은 이름으로 여러 번 들어온 일정을 한 줄로 줄입니다.
          </p>
        </div>

        {doneCount !== null ? (
          <div className="px-6 py-8">
            <Notice variant="success" size="md" title={`${doneCount}건을 정리했어요`}>
              달력에서 겹쳐 보이던 줄이 하나로 줄었습니다. 정리한 일정은 지운 것이 아니라 숨긴
              것이라 자료는 그대로 남아 있어요 — 되돌리려면 설정 → 백업/복원을 쓰셔야 합니다.
            </Notice>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-sp-muted">겹치는 일정이 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="px-6 pt-4 shrink-0">
              <Notice variant="info" size="md">
                남기는 일정은{' '}
                <span className="font-bold">선생님이 직접 만든 것 → 학사일정(NEIS)</span> 순서로
                고릅니다. 접히는 쪽은 구글에서 되돌아온 사본이라 없어도 달력이 비지 않아요. 지우는
                것이 아니라 숨기는 것이라 자료 자체는 그대로 남습니다.
              </Notice>
            </div>

            <div className="px-6 py-4 max-h-[340px] overflow-y-auto flex flex-col gap-2">
              {groups.map((group) => (
                <div
                  key={group.key}
                  className="rounded-xl border border-sp-border bg-sp-card/60 px-4 py-3"
                >
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-xs text-sp-muted tabular-nums shrink-0">
                      {formatDayLabel(group.keep.date)}
                    </span>
                    <span className="text-sm font-bold text-sp-text truncate">
                      {group.keep.title}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="material-symbols-outlined text-icon text-sp-success">
                        check
                      </span>
                      <span className="text-sp-text font-medium">남김</span>
                      <span className="text-sp-muted truncate">{categoryLabel(group.keep)}</span>
                    </div>
                    {group.duplicates.map((dup) => (
                      <div key={dup.id} className="flex items-center gap-2 text-xs">
                        <span className="material-symbols-outlined text-icon text-sp-muted">
                          visibility_off
                        </span>
                        <span className="text-sp-muted">숨김</span>
                        <span className="text-sp-muted/70 truncate">{categoryLabel(dup)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="px-6 py-4 border-t border-sp-border flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border text-sm font-medium transition-colors"
          >
            닫기
          </button>
          {doneCount === null && groups.length > 0 && (
            <button
              type="button"
              onClick={handleCleanup}
              disabled={isWorking}
              className="px-5 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg hover:bg-sp-accent/90 text-sm font-bold transition-colors disabled:opacity-50 shadow-sp-md"
            >
              {isWorking ? '정리하는 중...' : `${total}건 정리하기`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
