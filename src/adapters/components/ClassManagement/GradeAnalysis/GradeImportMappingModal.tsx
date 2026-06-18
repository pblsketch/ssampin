/**
 * 성적 엑셀 수동 컬럼 매핑 모달.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§8.1)
 * 자동 인식 실패 시(NEIS·채점프로그램 양식이 제각각) 교사가 원본 미리보기를 보며
 * 헤더 행과 번호/이름/점수 열을 직접 지정한다. 지정 결과는 도메인 파서가 그대로 사용한다.
 */
import { useMemo, useState } from 'react';
import type { DetectedGradeColumns } from '@domain/rules/gradeImportRules';

interface GradeImportMappingModalProps {
  /** 원본 행렬(상위 일부). 0-based. */
  readonly rawRows: readonly (readonly unknown[])[];
  readonly onApply: (columns: DetectedGradeColumns) => void;
  readonly onClose: () => void;
}

const NONE = -1;

function cellText(value: unknown): string {
  const s = String(value ?? '').trim();
  return s.length > 14 ? `${s.slice(0, 14)}…` : s;
}

export function GradeImportMappingModal({
  rawRows,
  onApply,
  onClose,
}: GradeImportMappingModalProps) {
  const columnCount = useMemo(
    () => rawRows.reduce((max, row) => Math.max(max, row.length), 0),
    [rawRows],
  );
  const colIndexes = useMemo(() => Array.from({ length: columnCount }, (_, i) => i), [columnCount]);

  const [headerRow, setHeaderRow] = useState(0);
  const [numCol, setNumCol] = useState(NONE);
  const [nameCol, setNameCol] = useState(NONE);
  const [scoreCol, setScoreCol] = useState(NONE);

  const canApply = scoreCol !== NONE && (numCol !== NONE || nameCol !== NONE);

  function colLabel(index: number): string {
    const header = rawRows[headerRow]?.[index];
    const text = cellText(header);
    return text === '' ? `${index + 1}열` : `${index + 1}열 (${text})`;
  }

  return (
    <>
      <div className="fixed inset-0 z-sp-modal bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-sp-modal flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-2xl pointer-events-auto p-6 flex flex-col gap-4 max-h-[85vh]">
          <div>
            <h3 className="text-base font-bold text-sp-text flex items-center gap-2">
              <span className="material-symbols-outlined text-base">view_column</span>열 직접 지정
            </h3>
            <p className="text-xs text-sp-muted mt-1 leading-relaxed">
              자동 인식이 되지 않아 직접 지정이 필요해요. 아래 미리보기에서 헤더 행과 번호·이름·점수
              열을 골라주세요. (점수 + 번호 또는 이름은 필수)
            </p>
          </div>

          {/* 매핑 선택 */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-sp-muted">헤더 행</span>
              <select
                value={headerRow}
                onChange={(e) => setHeaderRow(Number(e.target.value))}
                className="bg-sp-surface border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none"
              >
                {rawRows.map((_, i) => (
                  <option key={i} value={i}>
                    {i + 1}행
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['번호', numCol, setNumCol],
                ['이름', nameCol, setNameCol],
                ['점수', scoreCol, setScoreCol],
              ] as const
            ).map(([label, value, setter]) => (
              <label key={label} className="flex flex-col gap-1">
                <span className="text-xs text-sp-muted">
                  {label}
                  {label === '점수' && <span className="text-red-400"> *</span>}
                </span>
                <select
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  className="bg-sp-surface border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none min-w-[8rem]"
                >
                  <option value={NONE}>선택 안 함</option>
                  {colIndexes.map((i) => (
                    <option key={i} value={i}>
                      {colLabel(i)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {/* 원본 미리보기 */}
          <div className="overflow-auto border border-sp-border rounded-lg">
            <table className="text-xs">
              <tbody>
                {rawRows.slice(0, 12).map((row, r) => (
                  <tr key={r} className={r === headerRow ? 'bg-sp-accent/10' : ''}>
                    <td className="px-2 py-1 text-sp-muted border-r border-sp-border sticky left-0 bg-sp-card">
                      {r + 1}
                    </td>
                    {colIndexes.map((c) => (
                      <td
                        key={c}
                        className="px-2 py-1 text-sp-text whitespace-nowrap border-r border-sp-border/40"
                      >
                        {cellText(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-surface transition-colors text-sm"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => onApply({ num: numCol, name: nameCol, score: scoreCol, headerRow })}
              className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm"
            >
              적용
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
