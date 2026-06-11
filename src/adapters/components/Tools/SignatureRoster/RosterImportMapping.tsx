/**
 * 서명받기 — 붙여넣기/CSV 임포트 미리보기 + 열 매핑 패널.
 *
 * 텍스트를 바로 명단으로 바꾸지 않고, 파싱된 그리드를 보여 주며
 * "몇 번째 칸 → 어느 열"인지 사용자가 확인·조정한 뒤 적용한다.
 * '새 열로 추가'를 고르면 적용 시점에 열 편집기에도 새 열이 생긴다
 * (붙여넣기/CSV ↔ 열 편집 양방향 연동의 핵심).
 */
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@domain/entities/SignatureRoster';
import {
  IMPORT_TARGET_IGNORE,
  IMPORT_TARGET_NEW,
  applyImportMapping,
  rosterInputColumns,
  suggestImportTargets,
  type ApplyImportResult,
  type ImportTarget,
  type ParsedRosterGrid,
} from './signatureRosterLogic';

const PREVIEW_ROW_LIMIT = 5;

interface RosterImportMappingProps {
  readonly grid: ParsedRosterGrid;
  readonly columns: readonly ColumnDef[];
  /** 출처 표기 (예: '붙여넣기', 'CSV 파일') */
  readonly sourceLabel: string;
  readonly onApply: (result: ApplyImportResult) => void;
  readonly onCancel: () => void;
}

export function RosterImportMapping({
  grid,
  columns,
  sourceLabel,
  onApply,
  onCancel,
}: RosterImportMappingProps) {
  const [targets, setTargets] = useState<ImportTarget[]>(() => suggestImportTargets(grid, columns));
  const [removeUnmapped, setRemoveUnmapped] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputColumns = useMemo(() => rosterInputColumns(columns), [columns]);

  // 이번 임포트에 안 쓰이는 기존 입력 열(이름 제외) — 열 편집과 동기화(제거) 후보.
  const unmappedInputColumns = useMemo(() => {
    const used = new Set(targets);
    return inputColumns.filter((c) => c.key !== 'name' && !used.has(c.key));
  }, [targets, inputColumns]);

  // 같은 열을 두 칸에 매핑하면 한쪽 값이 덮어써지므로 중복을 막는다.
  const duplicateLabels = useMemo(() => {
    const seen = new Map<string, number>();
    targets.forEach((t) => {
      if (t === IMPORT_TARGET_IGNORE || t === IMPORT_TARGET_NEW) return;
      seen.set(t, (seen.get(t) ?? 0) + 1);
    });
    const labelByKey = new Map(inputColumns.map((c) => [c.key, c.label]));
    return [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([key]) => labelByKey.get(key) ?? key);
  }, [targets, inputColumns]);

  const previewRows = grid.rows.slice(0, PREVIEW_ROW_LIMIT);

  const changeTarget = (index: number, value: ImportTarget) => {
    setError(null);
    setTargets((prev) => prev.map((t, i) => (i === index ? value : t)));
  };

  const handleApply = () => {
    if (duplicateLabels.length > 0) {
      setError(
        `'${duplicateLabels.join("', '")}' 열이 두 번 이상 선택됐어요. 한 칸에만 지정해 주세요.`,
      );
      return;
    }
    const result = applyImportMapping(grid, targets, columns, {
      removeUnmappedInputColumns: removeUnmapped && unmappedInputColumns.length > 0,
    });
    if (result.members.length === 0) {
      setError('이름으로 가져올 값이 없습니다. 이름이 들어 있는 칸을 "이름" 열로 지정해 주세요.');
      return;
    }
    onApply(result);
  };

  return (
    <div className="rounded-2xl border border-sp-accent/40 bg-sp-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-sp-accent">{sourceLabel} 미리보기</p>
          <h4 className="mt-1 text-lg font-bold text-sp-text">
            {grid.rows.length}명을 찾았어요 — 칸별로 들어갈 열을 확인해 주세요
          </h4>
          <p className="mt-1 text-xs leading-5 text-sp-muted">
            {grid.header
              ? '첫 줄을 제목 줄로 인식해 열을 자동으로 맞췄어요. 다르게 들어간 칸은 아래에서 바꿀 수 있어요.'
              : '첫 칸은 이름, 둘째 칸은 소속으로 추정했어요. 다르면 아래에서 바꿀 수 있어요.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-bold text-sp-muted transition hover:bg-sp-surface hover:text-sp-text"
        >
          취소
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {Array.from({ length: grid.width }, (_, index) => (
                <th key={index} className="border-b border-sp-border p-2 text-left align-top">
                  <select
                    value={targets[index] ?? IMPORT_TARGET_IGNORE}
                    onChange={(event) => changeTarget(index, event.target.value)}
                    className="w-full rounded-lg border border-sp-border bg-sp-surface px-2 py-1.5 text-xs font-bold text-sp-text focus:border-sp-accent focus:outline-none"
                  >
                    {inputColumns.map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ))}
                    <option value={IMPORT_TARGET_NEW}>
                      ＋ 새 열로 추가
                      {grid.header?.[index]?.trim() ? ` (${grid.header[index]?.trim()})` : ''}
                    </option>
                    <option value={IMPORT_TARGET_IGNORE}>가져오지 않음</option>
                  </select>
                  {grid.header && (
                    <p className="mt-1 truncate text-[11px] font-medium text-sp-muted">
                      원본 제목: {grid.header[index]?.trim() || '(없음)'}
                    </p>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: grid.width }, (_, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`border-b border-sp-border/50 p-2 text-xs ${
                      targets[cellIndex] === IMPORT_TARGET_IGNORE
                        ? 'text-sp-muted/50 line-through'
                        : 'text-sp-text'
                    }`}
                  >
                    {row[cellIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {grid.rows.length > PREVIEW_ROW_LIMIT && (
        <p className="mt-2 text-xs text-sp-muted">
          외 {grid.rows.length - PREVIEW_ROW_LIMIT}명이 더 있어요 (적용하면 전체가 들어가요).
        </p>
      )}

      {unmappedInputColumns.length > 0 && (
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-sp-border bg-sp-surface p-3">
          <input
            type="checkbox"
            checked={removeUnmapped}
            onChange={(event) => setRemoveUnmapped(event.target.checked)}
            className="mt-0.5 accent-sp-accent"
          />
          <span className="text-xs leading-5 text-sp-text">
            이번 명단에 없는{' '}
            <span className="font-bold">
              '{unmappedInputColumns.map((c) => c.label).join("', '")}'
            </span>{' '}
            열을 열 편집에서도 빼기
            <span className="mt-0.5 block text-sp-muted">
              체크를 풀면 열은 남고 값만 비워져요 (나중에 표에서 직접 채울 수 있어요).
            </span>
          </span>
        </label>
      )}

      {error && (
        <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-sp-border px-4 py-2.5 text-sm font-bold text-sp-text transition hover:bg-sp-surface"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="rounded-xl bg-sp-accent px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
        >
          {grid.rows.length}명 명단에 적용
        </button>
      </div>
    </div>
  );
}
