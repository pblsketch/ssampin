/**
 * 집중 보기의 **학생 목록**(왼쪽 기둥, ADR-093 결정 1·4).
 *
 * 이름·번호·상태 점만으로 좁게 유지한다. 행의 체크 상자는 **초안 생성 대상 고르기**다(오너 요청: 한 명/전체 말고
 * 몇 명만 직접). 검색은 이름·번호. 상태 필터는 정보 바의 기존 필터를 그대로 쓰므로 여기서는 받은 목록만 그린다.
 *
 * 폭이 모자라면 `mode="selector"` 로 접혀 `학생 ▾` 선택 상자 한 줄이 된다(설계서 §2-3).
 */
import { useMemo, useState } from 'react';
import type { RecordDraftStatus } from '@domain/entities/RecordDraft';

export interface StudentListItem {
  readonly studentRef: string;
  readonly number: number;
  readonly name: string;
  /** null = 초안 없음. */
  readonly status: RecordDraftStatus | null;
  readonly needsReview: boolean;
  /** 초안 글이 있는가(빈 초안 레코드는 없음으로). */
  readonly written: boolean;
}

export interface RecordDraftStudentListProps {
  readonly items: readonly StudentListItem[];
  readonly selectedRef: string | null;
  readonly checkedRefs: ReadonlySet<string>;
  /** 체크 상자를 그리는가 — 실험실 스위치(내 AI)를 켠 선생님에게만(AI 초안 대상 고르기라서). */
  readonly showCheckboxes: boolean;
  readonly mode: 'list' | 'selector';
  readonly onSelect: (studentRef: string) => void;
  readonly onToggleChecked: (studentRef: string) => void;
  /** 목록에 **지금 보이는**(검색 뒤) 학생 중 미작성을 전부 고른다. 보이는 학생 키를 넘긴다. */
  readonly onCheckUnwritten: (shownRefs: readonly string[]) => void;
  readonly onClearChecked: () => void;
}

/** 상태 점 — 글 없음(빈 원) / 작성 중·검토 중(채운 원) / 검토 완료(✓) / 검토 필요(⚠). */
function StatusDot({ item }: { readonly item: StudentListItem }) {
  if (item.needsReview)
    return (
      <span aria-label="검토 필요" className="material-symbols-outlined text-sm text-amber-500">
        warning
      </span>
    );
  if (item.status === 'confirmed')
    return (
      <span aria-label="검토 완료" className="material-symbols-outlined text-sm text-emerald-500">
        check_circle
      </span>
    );
  if (item.written)
    return <span aria-label="작성 중" className="inline-block h-2 w-2 rounded-full bg-sp-accent" />;
  return (
    <span
      aria-label="초안 없음"
      className="inline-block h-2 w-2 rounded-full ring-1 ring-inset ring-sp-muted"
    />
  );
}

export function RecordDraftStudentList({
  items,
  selectedRef,
  checkedRefs,
  showCheckboxes,
  mode,
  onSelect,
  onToggleChecked,
  onCheckUnwritten,
  onClearChecked,
}: RecordDraftStudentListProps) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim();
    if (q.length === 0) return items;
    return items.filter((s) => s.name.includes(q) || String(s.number) === q);
  }, [items, query]);
  const checkedCount = items.filter((s) => checkedRefs.has(s.studentRef)).length;

  if (mode === 'selector') {
    return (
      <div
        className="flex items-center gap-2 border-b border-sp-border px-4 py-2"
        data-testid="student-selector"
      >
        <label className="flex items-center gap-1 text-xs text-sp-muted">
          학생
          <select
            aria-label="학생 선택"
            value={selectedRef ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded-lg border border-sp-border bg-sp-card px-2 py-1 text-sm font-semibold text-sp-text focus:border-sp-accent focus:outline-none"
          >
            {items.map((s) => (
              <option key={s.studentRef} value={s.studentRef}>
                {s.number}. {s.name}
                {checkedRefs.has(s.studentRef) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </label>
        {showCheckboxes && selectedRef !== null && (
          <label className="flex items-center gap-1 text-xs text-sp-muted">
            <input
              type="checkbox"
              checked={checkedRefs.has(selectedRef)}
              onChange={() => onToggleChecked(selectedRef)}
              aria-label={`${items.find((s) => s.studentRef === selectedRef)?.name ?? ''} 초안 생성 대상으로 고르기`}
              className="h-3.5 w-3.5 accent-current text-sp-accent"
            />
            AI 초안 대상
          </label>
        )}
        {showCheckboxes && checkedCount > 0 && (
          <span className="text-xs text-sp-accent">고른 {checkedCount}명</span>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex w-56 shrink-0 flex-col border-r border-sp-border"
      aria-label="학생 목록"
      data-testid="student-list"
    >
      <div className="flex flex-col gap-1.5 border-b border-sp-border px-2 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름·번호 찾기"
          aria-label="학생 찾기"
          className="w-full rounded-lg border border-sp-border bg-sp-bg px-2 py-1 text-xs text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
        />
        {showCheckboxes && (
          <div className="flex items-center gap-1 text-xs">
            {checkedCount > 0 ? (
              <>
                <span className="font-semibold text-sp-accent">고른 {checkedCount}명</span>
                <button
                  type="button"
                  onClick={onClearChecked}
                  className="ml-auto rounded-md px-1.5 py-0.5 text-sp-muted hover:text-sp-text"
                >
                  선택 해제
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onCheckUnwritten(shown.map((s) => s.studentRef))}
                title="목록에 보이는 학생 중 아직 초안이 없는 학생을 전부 고릅니다."
                className="rounded-md px-1.5 py-0.5 text-sp-muted hover:text-sp-text"
              >
                미작성 전체 고르기
              </button>
            )}
          </div>
        )}
      </div>
      {/* 평범한 목록이다 — 항목 안에 단추·체크 상자가 있어 listbox/option 역할을 붙이지 않는다(리뷰 지적 7). */}
      <ul className="min-h-0 flex-1 overflow-y-auto py-1" aria-label="학생">
        {shown.length === 0 && (
          <li className="px-3 py-6 text-center text-xs text-sp-muted">표시할 학생이 없습니다.</li>
        )}
        {shown.map((s) => {
          const on = s.studentRef === selectedRef;
          return (
            <li
              key={s.studentRef}
              aria-current={on ? 'true' : undefined}
              className={`flex items-center gap-2 px-2 py-1 ${on ? 'bg-blue-500/10' : 'hover:bg-sp-surface'}`}
            >
              {showCheckboxes && (
                <input
                  type="checkbox"
                  checked={checkedRefs.has(s.studentRef)}
                  onChange={() => onToggleChecked(s.studentRef)}
                  aria-label={`${s.name} 초안 생성 대상으로 고르기`}
                  className="h-3.5 w-3.5 shrink-0 accent-current text-sp-accent"
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(s.studentRef)}
                aria-label={`${s.number}번 ${s.name} 보기`}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left text-sm ${
                  on ? 'font-bold text-sp-text' : 'font-medium text-sp-text'
                }`}
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-sp-muted">
                  {s.number}
                </span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <StatusDot item={s} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
