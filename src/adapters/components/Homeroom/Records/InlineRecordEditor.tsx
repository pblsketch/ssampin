import { useEffect, useState, useMemo } from 'react';
import { RECORD_COLOR_MAP } from '@adapters/stores/useStudentRecordsStore';
import { ATTENDANCE_TYPES, ATTENDANCE_REASONS } from '@domain/valueObjects/RecordCategory';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { GRAY_COLOR, getSubcategoryChipClass } from './recordUtils';

export interface InlineRecordEditorProps {
  record: StudentRecord;
  categories: readonly RecordCategoryItem[];
  editContent: string;
  setEditContent: (v: string) => void;
  editCategory: string;
  setEditCategory: (v: string) => void;
  editSubcategory: string;
  setEditSubcategory: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  compact?: boolean;
}

export function InlineRecordEditor({
  categories,
  editContent,
  setEditContent,
  editCategory,
  setEditCategory,
  editSubcategory,
  setEditSubcategory,
  onSave,
  onCancel,
  compact,
}: InlineRecordEditorProps) {
  const cat = useMemo(() => categories.find((c) => c.id === editCategory), [editCategory, categories]);
  const isAttendance = editCategory === 'attendance';

  // Local attendance 2-level state
  const [localAttType, setLocalAttType] = useState('');
  const [localAttReason, setLocalAttReason] = useState('');

  // Initialize attendance state from editSubcategory when category switches to attendance
  useEffect(() => {
    if (!isAttendance) { setLocalAttType(''); setLocalAttReason(''); return; }
    const match = editSubcategory.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      setLocalAttType(match[1] ?? '');
      setLocalAttReason(match[2] ?? '');
    } else {
      setLocalAttType('');
      setLocalAttReason('');
    }
    // Only re-parse when category changes to attendance or on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editCategory]);

  const chipSize = compact ? 'text-detail px-2 py-0.5' : 'px-2.5 py-1 text-xs';

  return (
    <div className={compact
      ? 'bg-sp-surface/80 border border-sp-accent/30 rounded-lg p-2 space-y-1.5 animate-fade-in'
      : 'bg-sp-surface/80 border border-sp-accent/30 rounded-xl p-3 space-y-2.5 animate-fade-in'
    }>
      {/* 카테고리 */}
      <div>
        <p className={`text-sp-muted mb-1 ${compact ? 'text-caption' : 'text-detail'}`}>카테고리</p>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const isSelected = c.id === editCategory;
            const colorSet = RECORD_COLOR_MAP[c.color] ?? GRAY_COLOR;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setEditCategory(c.id);
                  setEditSubcategory('');
                  setLocalAttType('');
                  setLocalAttReason('');
                }}
                className={`${chipSize} rounded-lg font-medium transition-all cursor-pointer select-none ${
                  isSelected ? colorSet.activeBg : colorSet.inactiveBg
                }`}
              >
                {c.name.split(' (')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 세부 항목 */}
      {cat && (
        <div>
          <p className={`text-sp-muted mb-1 ${compact ? 'text-caption' : 'text-detail'}`}>세부 항목</p>
          {isAttendance ? (
            <div className="space-y-1.5">
              {/* 출결 유형 */}
              <div className="flex flex-wrap gap-1.5">
                {ATTENDANCE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setLocalAttType(t);
                      setLocalAttReason('');
                      setEditSubcategory('');
                    }}
                    className={getSubcategoryChipClass(cat.color, localAttType === t).replace(
                      compact ? '' : '',
                      ''
                    ) + (compact ? ' !text-detail !px-2 !py-0.5' : '')}
                  >
                    {localAttType === t && <span className="mr-0.5">✓</span>}{t}
                  </button>
                ))}
              </div>
              {/* 출결 사유 (유형 선택 시만) */}
              {localAttType && (
                <div className="ml-2 pl-3 border-l-2 border-red-500/30">
                  <p className="text-detail text-sp-muted mb-1">사유</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ATTENDANCE_REASONS.map((r) => {
                      const isReasonSelected = localAttReason === r;
                      return (
                        <button
                          key={r}
                          onClick={() => {
                            setLocalAttReason(r);
                            setEditSubcategory(`${localAttType} (${r})`);
                          }}
                          className={getSubcategoryChipClass(cat.color, isReasonSelected) + (compact ? ' !text-detail !px-2 !py-0.5' : '')}
                        >
                          {isReasonSelected && <span className="mr-0.5">✓</span>}{r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {cat.subcategories.map((sub) => {
                const isSelected = editSubcategory === sub;
                return (
                  <button
                    key={sub}
                    onClick={() => setEditSubcategory(sub)}
                    className={getSubcategoryChipClass(cat.color, isSelected) + (compact ? ' !text-detail !px-2 !py-0.5' : '')}
                  >
                    {isSelected && <span className="mr-0.5">✓</span>}{sub}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 메모 */}
      <div>
        <p className={`text-sp-muted mb-1 ${compact ? 'text-caption' : 'text-detail'}`}>메모</p>
        <input
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          placeholder="메모 (선택)"
          className="w-full bg-sp-surface border border-sp-border rounded-lg text-sm text-sp-text px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-sp-accent"
        />
      </div>

      {/* 액션 버튼 */}
      <div className="flex justify-end gap-2 mt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-sp-muted hover:text-sp-text hover:bg-sp-surface"
        >취소</button>
        <button
          onClick={onSave}
          disabled={!editSubcategory}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sp-accent text-white hover:bg-sp-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
        >저장</button>
      </div>
    </div>
  );
}
