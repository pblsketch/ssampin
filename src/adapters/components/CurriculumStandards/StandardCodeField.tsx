/**
 * 성취기준 칸 — 진도·과제·루브릭 편집이 함께 쓰는 작은 입력 묶음.
 *
 * 호스트 화면(진도 입력 폼 등)은 이미 빽빽하므로 여기서는 **고른 것만 칩으로** 보이고,
 * 고르는 일은 창(`StandardPickerModal`)에서 한다.
 *
 * 2015 개정 학년(2026학년도 중3·고3)에는 목록을 띄우지 않는다. 그 학년은 2022 개정 자료가
 * 아예 없기 때문이다 — 없는 것을 있는 척 보여 주는 대신 **그대로 말하고 직접 적게** 한다.
 */
import { useMemo, useState } from 'react';
import { academicTerm, schoolYearOf } from '@domain/rules/academicCalendar';
import {
  isRevision2022Applied,
  looksLikeStandardCode,
  normalizeStandardCode,
  REVISION_2015_NOTICE,
  type StandardScope,
} from '@domain/rules/curriculumStandardRules';
import { StandardPickerModal } from './StandardPickerModal';

interface StandardCodeFieldProps {
  /** 선택된 성취기준 코드 */
  codes: readonly string[] | undefined;
  onCodesChange: (codes: string[]) => void;
  /**
   * 2022 개정 자료가 없는 학년에서 교사가 직접 적은 성취기준.
   * 넘기지 않으면 직접 적는 칸을 만들지 않는다.
   */
  standardText?: string | undefined;
  onStandardTextChange?: (text: string) => void;
  scope: StandardScope;
  /** 창 안에 보여 줄 맥락 한 줄 (예: '2학년 수학') */
  contextLabel?: string;
  /** 좁은 폼(모달 안 등)에서 간격을 줄인다 */
  compact?: boolean;
}

export function StandardCodeField({
  codes,
  onCodesChange,
  standardText,
  onStandardTextChange,
  scope,
  contextLabel,
  compact = false,
}: StandardCodeFieldProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manual, setManual] = useState('');

  const academicYear = useMemo(() => schoolYearOf(academicTerm()) ?? new Date().getFullYear(), []);
  const has2022 = isRevision2022Applied(scope.schoolLevel, scope.grade, academicYear);
  const selected = codes ?? [];

  function addManual() {
    const value = manual.trim();
    if (value.length === 0) return;
    const key = normalizeStandardCode(value);
    if (selected.some((c) => normalizeStandardCode(c) === key)) {
      setManual('');
      return;
    }
    onCodesChange([...selected, value]);
    setManual('');
  }

  function remove(code: string) {
    const key = normalizeStandardCode(code);
    onCodesChange(selected.filter((c) => normalizeStandardCode(c) !== key));
  }

  const inputPad = compact ? 'px-2.5 py-1' : 'px-3 py-1.5';

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label className="text-xs text-sp-muted">성취기준 (선택)</label>
        {has2022 && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="ml-auto flex items-center gap-1 text-xs text-sp-accent
                       transition-opacity hover:opacity-80"
          >
            <span aria-hidden className="material-symbols-outlined text-sm">
              checklist
            </span>
            고르기
          </button>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="mb-1.5 flex flex-wrap gap-1.5">
          {selected.map((code) => (
            <li key={code}>
              <span
                className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full
                           bg-sp-accent/15 text-sp-accent text-xs font-medium"
              >
                {code}
                <button
                  type="button"
                  onClick={() => remove(code)}
                  aria-label={`${code} 빼기`}
                  className="leading-none opacity-70 transition-opacity hover:opacity-100"
                >
                  <span aria-hidden className="material-symbols-outlined text-sm align-middle">
                    close
                  </span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {!has2022 && (
        <div className="mb-1.5">
          <p className="text-xs text-sp-highlight">{REVISION_2015_NOTICE}</p>
          <div className="mt-1.5 flex gap-1.5">
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addManual();
                }
              }}
              placeholder="예: [9국01-05]"
              className={`flex-1 ${inputPad} bg-sp-card border border-sp-border rounded-lg
                         text-sp-text text-sm focus:outline-none focus:border-sp-accent
                         placeholder:text-sp-muted`}
            />
            <button
              type="button"
              onClick={addManual}
              disabled={manual.trim().length === 0}
              className="px-3 rounded-lg border border-sp-border text-sm text-sp-text
                         transition-colors hover:border-sp-accent disabled:opacity-40"
            >
              넣기
            </button>
          </div>
          {manual.trim().length > 0 && !looksLikeStandardCode(manual) && (
            <p className="mt-1 text-[11px] text-sp-muted">
              성취기준 코드 모양이 아닙니다. 그대로 넣어도 되고, 아래 칸에 문장으로 적어도 됩니다.
            </p>
          )}
          {onStandardTextChange !== undefined && (
            <textarea
              value={standardText ?? ''}
              onChange={(e) => onStandardTextChange(e.target.value)}
              rows={2}
              placeholder="성취기준 문장을 직접 적어도 됩니다 (선택)"
              className={`mt-1.5 w-full ${inputPad} bg-sp-card border border-sp-border rounded-lg
                         text-sp-text text-sm focus:outline-none focus:border-sp-accent
                         placeholder:text-sp-muted resize-none`}
            />
          )}
        </div>
      )}

      {has2022 && selected.length === 0 && (
        <p className="text-[11px] text-sp-muted">
          붙여 두면 이 수업에서 무엇을 배웠는지가 기록에 남습니다.
        </p>
      )}

      {pickerOpen && (
        <StandardPickerModal
          selected={selected}
          scope={scope}
          contextLabel={contextLabel}
          onClose={() => setPickerOpen(false)}
          onConfirm={(next) => {
            onCodesChange(next);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}
