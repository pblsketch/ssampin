/**
 * 온라인 교무실 — 말머리 관리 (054, 관리자만)
 *
 * **글을 쓰는 자리 바로 옆에 둔다.** 설정 화면 깊은 곳에 넣으면 정작 필요한
 * 순간(글 목록을 보다가 "여기 말머리가 있으면 좋겠다"고 느낄 때)에 찾지 못한다.
 *
 * 지울 때 무슨 일이 벌어지는지 화면에서 미리 알린다 — 054 는 `ON DELETE SET NULL`
 * 이라 **글은 남고 말머리만 떨어진다.** 이걸 안 알리면 관리자가 "글까지 사라질까"
 * 무서워 정리를 못 하거나, 반대로 지웠다가 놀란다.
 */
import { useState } from 'react';
import { useStaffRoomBoardStore } from '@adapters/stores/useStaffRoomBoardStore';
import {
  normalizeStaffRoomCategoryName,
  STAFFROOM_CATEGORY_NAME_MAX_LENGTH,
  STAFFROOM_CATEGORY_MAX_COUNT,
} from '@domain/rules/staffRoomTaxonomy';

interface CategoryManagerProps {
  departmentId: string;
  onClose: () => void;
}

export function CategoryManager({ departmentId, onClose }: CategoryManagerProps): JSX.Element {
  const categories = useStaffRoomBoardStore((s) => s.categories);
  const addCategory = useStaffRoomBoardStore((s) => s.addCategory);
  const removeCategory = useStaffRoomBoardStore((s) => s.removeCategory);
  const error = useStaffRoomBoardStore((s) => s.error);

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  // 서버에 보내기 전에 화면에서 먼저 걸러 준다 — 왕복하고 나서 "못 쓴다"는 말을
  // 듣는 것보다, 누르기 전에 흐릿한 단추를 보는 편이 낫다.
  const normalized = normalizeStaffRoomCategoryName(name);
  const isFull = categories.length >= STAFFROOM_CATEGORY_MAX_COUNT;
  const canAdd = normalized !== null && !busy && !isFull;

  const handleAdd = async () => {
    if (!canAdd || normalized === null) return;
    setBusy(true);
    const ok = await addCategory(departmentId, normalized);
    setBusy(false);
    if (ok) setName('');
  };

  return (
    <div className="rounded-xl border border-sp-border bg-sp-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-sp-semibold text-sp-text">말머리 관리</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="말머리 관리 닫기"
          className="text-sp-muted transition-colors hover:text-sp-text"
        >
          <span className="material-symbols-outlined text-icon">close</span>
        </button>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-sp-muted">
        글 앞에 붙는 이름표예요. 미리 만들어 두면 글 쓸 때 골라 쓸 수 있어요.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-relaxed text-sp-text">
          {error}
        </p>
      )}

      {/* 만들기 */}
      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            if (e.target.value.length > STAFFROOM_CATEGORY_NAME_MAX_LENGTH) return;
            setName(e.target.value);
          }}
          onKeyDown={(e) => {
            // 한글 조합 중의 엔터는 "글자 확정"이지 "만들기"가 아니다.
            // 막지 않으면 "공지"를 치다가 "공ㅈ"가 만들어진다.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleAdd();
            }
          }}
          placeholder={isFull ? '더 만들 수 없어요' : '예: 공지, 회의록'}
          disabled={isFull}
          className="h-9 flex-1 rounded-lg border border-sp-border bg-sp-bg px-3 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!canAdd}
          className="h-9 shrink-0 rounded-lg bg-sp-accent px-3 text-xs font-sp-semibold text-white transition-all duration-sp-base ease-sp-out active:scale-95 disabled:opacity-40"
        >
          추가
        </button>
      </div>

      {isFull && (
        <p className="mt-1.5 text-xs text-sp-muted">
          말머리는 {STAFFROOM_CATEGORY_MAX_COUNT}개까지 만들 수 있어요. 안 쓰는 것을 지우고 만들어
          주세요.
        </p>
      )}

      {/* 목록 */}
      {categories.length === 0 ? (
        <p className="mt-4 text-xs text-sp-muted">아직 만든 말머리가 없어요.</p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sp-border bg-sp-card px-3 py-2"
            >
              <span className="text-sm text-sp-text">{c.name}</span>

              {confirming === c.id ? (
                <span className="flex flex-wrap items-center gap-2">
                  {/* 지우면 무슨 일이 벌어지는지 먼저 알린다 */}
                  <span className="text-xs text-sp-muted">
                    이 말머리를 쓰던 글은 그대로 남아요.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      void removeCategory(departmentId, c.id);
                    }}
                    className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs font-sp-medium text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    지우기
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded-lg border border-sp-border px-2.5 py-1 text-xs text-sp-muted transition-colors hover:text-sp-text"
                  >
                    취소
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(c.id)}
                  aria-label={`${c.name} 말머리 지우기`}
                  className="text-sp-muted transition-colors hover:text-sp-text"
                >
                  <span className="material-symbols-outlined text-icon">delete</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
