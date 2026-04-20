import { useMemo, useState } from 'react';
import type { MultiSurveyResultData } from '@domain/entities/ToolResult';
import type { MultiSurveyTemplateQuestion } from '@domain/entities/ToolTemplate';
import {
  serializeAnswerCell,
  formatSubmissionLabel,
} from '@domain/rules/toolResultSerialization';

interface TableTabProps {
  data: MultiSurveyResultData;
}

type SortColumn = { kind: 'respondent' } | { kind: 'question'; questionId: string } | null;
type SortDir = 'asc' | 'desc';

interface FilterOption {
  questionId: string;
  optionId: string;
}

const CELL_TRUNCATE_LENGTH = 40;

export function TableTab({ data }: TableTabProps) {
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filterOption, setFilterOption] = useState<FilterOption | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 원본 인덱스 보존용 배열 — formatSubmissionLabel(originalIdx) 계산에 필요
  const indexed = useMemo(
    () => data.submissions.map((s, idx) => ({ submission: s, originalIndex: idx })),
    [data.submissions],
  );

  // 필터 적용
  const filtered = useMemo(() => {
    let arr = indexed;

    if (filterOption) {
      arr = arr.filter((item) => {
        const ans = item.submission.answers.find(
          (a) => a.questionId === filterOption.questionId,
        );
        if (!ans) return false;
        if (typeof ans.value === 'string') return ans.value === filterOption.optionId;
        if (Array.isArray(ans.value)) return ans.value.includes(filterOption.optionId);
        return false;
      });
    }

    if (searchKeyword.trim() !== '') {
      const kw = searchKeyword.trim().toLowerCase();
      arr = arr.filter((item) => {
        for (const q of data.questions) {
          if (q.type !== 'text') continue;
          const ans = item.submission.answers.find((a) => a.questionId === q.id);
          if (ans && typeof ans.value === 'string' && ans.value.toLowerCase().includes(kw)) {
            return true;
          }
        }
        return false;
      });
    }

    return arr;
  }, [indexed, filterOption, searchKeyword, data.questions]);

  // 정렬 적용
  const sorted = useMemo(() => {
    if (!sortColumn) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortColumn.kind === 'respondent') {
        cmp = a.originalIndex - b.originalIndex;
      } else {
        const q = data.questions.find((x) => x.id === sortColumn.questionId);
        if (!q) return 0;
        const ansA = a.submission.answers.find((x) => x.questionId === q.id);
        const ansB = b.submission.answers.find((x) => x.questionId === q.id);
        const { raw: rawA } = serializeAnswerCell(q, ansA);
        const { raw: rawB } = serializeAnswerCell(q, ansB);
        if (rawA === null && rawB === null) cmp = 0;
        else if (rawA === null) cmp = 1;
        else if (rawB === null) cmp = -1;
        else if (typeof rawA === 'number' && typeof rawB === 'number') cmp = rawA - rawB;
        else cmp = String(rawA).localeCompare(String(rawB));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortColumn, sortDir, data.questions]);

  const handleSortClick = (column: SortColumn) => {
    if (!column) return;
    if (
      sortColumn &&
      sortColumn.kind === column.kind &&
      (column.kind === 'respondent' ||
        (sortColumn.kind === 'question' &&
          column.kind === 'question' &&
          sortColumn.questionId === column.questionId))
    ) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDir('asc');
    }
  };

  // Grid template columns
  const gridTemplateColumns = useMemo(() => {
    return `120px repeat(${data.questions.length}, minmax(140px, 1fr))`;
  }, [data.questions.length]);

  const isSorted = (column: SortColumn) => {
    if (!sortColumn || !column) return false;
    if (sortColumn.kind !== column.kind) return false;
    if (column.kind === 'respondent') return true;
    return sortColumn.kind === 'question' && column.kind === 'question' &&
      sortColumn.questionId === column.questionId;
  };

  const hasTextQuestion = data.questions.some((q) => q.type === 'text');

  return (
    <div className="flex h-full flex-col">
      {/* 상단 필터 바 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-sp-border bg-sp-card px-5 py-2.5">
        {hasTextQuestion && (
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="텍스트 응답 검색..."
            className="h-8 rounded-md border border-sp-border bg-sp-surface px-3 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
        )}
        <FilterSelector
          data={data}
          value={filterOption}
          onChange={setFilterOption}
        />
        {(filterOption || searchKeyword) && (
          <button
            type="button"
            onClick={() => {
              setFilterOption(null);
              setSearchKeyword('');
            }}
            className="h-8 rounded-md border border-sp-border bg-sp-surface px-3 text-xs text-sp-muted transition hover:text-sp-text"
          >
            필터 해제
          </button>
        )}
        <span className="ml-auto text-xs text-sp-muted">
          {sorted.length} / {data.submissions.length}명
        </span>
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto p-5">
        <div className="min-w-fit">
          {/* 헤더 */}
          <div
            className="sticky top-0 z-10 grid gap-px bg-sp-border"
            style={{ gridTemplateColumns }}
          >
            <HeaderCell
              label="응답자"
              sorted={isSorted({ kind: 'respondent' })}
              sortDir={sortDir}
              onClick={() => handleSortClick({ kind: 'respondent' })}
            />
            {data.questions.map((q, i) => (
              <HeaderCell
                key={q.id}
                label={`Q${i + 1}. ${q.question}`}
                sorted={isSorted({ kind: 'question', questionId: q.id })}
                sortDir={sortDir}
                onClick={() => handleSortClick({ kind: 'question', questionId: q.id })}
              />
            ))}
          </div>
          {/* 본문 */}
          {sorted.length === 0 ? (
            <div className="rounded-b-lg border border-t-0 border-sp-border bg-sp-card p-8 text-center text-sm text-sp-muted">
              조건에 맞는 응답이 없어요
            </div>
          ) : (
            <div className="grid gap-px bg-sp-border" style={{ gridTemplateColumns }}>
              {sorted.map((item) => (
                <RowContent
                  key={item.submission.id}
                  originalIndex={item.originalIndex}
                  submission={item.submission}
                  questions={data.questions}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 내부 컴포넌트 ── */

function HeaderCell({
  label,
  sorted,
  sortDir,
  onClick,
}: {
  label: string;
  sorted: boolean;
  sortDir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 bg-sp-card px-3 py-2 text-left text-xs font-semibold transition hover:bg-sp-surface ${
        sorted ? 'text-sp-accent' : 'text-sp-text'
      }`}
      title={label}
    >
      <span className="line-clamp-2 flex-1">{label}</span>
      {sorted && (
        <span aria-hidden className="text-sp-accent">
          {sortDir === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </button>
  );
}

function RowContent({
  originalIndex,
  submission,
  questions,
}: {
  originalIndex: number;
  submission: MultiSurveyResultData['submissions'][number];
  questions: readonly MultiSurveyTemplateQuestion[];
}) {
  return (
    <>
      <div className="bg-sp-card px-3 py-2 text-xs text-sp-text">
        {formatSubmissionLabel(originalIndex)}
      </div>
      {questions.map((q) => {
        const ans = submission.answers.find((a) => a.questionId === q.id);
        const { display, raw } = serializeAnswerCell(q, ans);
        const isEmpty = raw === null;
        const truncated =
          display.length > CELL_TRUNCATE_LENGTH
            ? display.slice(0, CELL_TRUNCATE_LENGTH) + '…'
            : display;
        return (
          <div
            key={q.id}
            className={`px-3 py-2 text-xs ${
              isEmpty ? 'bg-sp-surface text-sp-muted italic' : 'bg-sp-card text-sp-text'
            }`}
            title={display.length > CELL_TRUNCATE_LENGTH ? display : undefined}
          >
            {isEmpty ? '—' : truncated}
          </div>
        );
      })}
    </>
  );
}

function FilterSelector({
  data,
  value,
  onChange,
}: {
  data: MultiSurveyResultData;
  value: FilterOption | null;
  onChange: (v: FilterOption | null) => void;
}) {
  const choiceQuestions = data.questions.filter(
    (q) => q.type === 'single-choice' || q.type === 'multi-choice',
  );
  if (choiceQuestions.length === 0) return null;

  const selectValue = value ? `${value.questionId}:${value.optionId}` : '';

  return (
    <select
      value={selectValue}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') {
          onChange(null);
          return;
        }
        const [questionId, optionId] = v.split(':');
        if (questionId && optionId) onChange({ questionId, optionId });
      }}
      className="h-8 rounded-md border border-sp-border bg-sp-surface px-2 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
    >
      <option value="">선택지 필터...</option>
      {choiceQuestions.map((q) => (
        <optgroup key={q.id} label={`Q${data.questions.indexOf(q) + 1}. ${q.question}`}>
          {q.options.map((o) => (
            <option key={`${q.id}:${o.id}`} value={`${q.id}:${o.id}`}>
              {o.text}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
