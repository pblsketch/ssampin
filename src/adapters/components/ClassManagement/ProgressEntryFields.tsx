import { CalendarPicker } from '@adapters/components/common/CalendarPicker';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { PeriodTime } from '@domain/valueObjects/PeriodTime';

/**
 * 진도 입력 필드 본문 (완전 controlled, 버튼·컨테이너·저장 로직 없음).
 *
 * ProgressTab의 추가 폼과 진도 캘린더의 빠른 입력이 공유한다.
 * 고정 classId를 가정하지 않으므로, 부모(chrome)가 classId·onSubmit·레이아웃·버튼을 소유한다.
 */

export interface ProgressEntryFieldValues {
  readonly date: string;
  readonly period: number;
  readonly unit: string;
  readonly lesson: string;
  readonly note: string;
}

interface ProgressEntryFieldsProps {
  values: ProgressEntryFieldValues;
  onChange: (patch: Partial<ProgressEntryFieldValues>) => void;
  /** 해당 반이 배정된 교시(1-based) — ✦ 마커 표시용 */
  matchingPeriods: readonly number[];
  /** 수업이 있는 요일 (CalendarPicker 강조용, JS getDay) */
  lessonDays?: readonly number[];
  /** 과목/반 강조 색상 (CalendarPicker) */
  accentColor?: { text: string; bg: string; bgSolid: string };
  /** 선택 가능한 최대 교시 수 */
  maxPeriods: number;
  /** 교시 이름 표시용 */
  periodTimes?: readonly PeriodTime[];
  /** 날짜 변경 시 교시 자동 선택 등 부모 훅이 필요할 때 (없으면 onChange({date})만) */
  onDateChange?: (date: string) => void;
  /** 컴팩트 간격 (모달/좁은 폼용) */
  compact?: boolean;
}

export function ProgressEntryFields({
  values,
  onChange,
  matchingPeriods,
  lessonDays,
  accentColor,
  maxPeriods,
  periodTimes,
  onDateChange,
  compact = false,
}: ProgressEntryFieldsProps) {
  const inputPad = compact ? 'px-2.5 py-1' : 'px-3 py-1.5';
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-sp-muted mb-1">날짜</label>
          <CalendarPicker
            value={values.date}
            onChange={(date) => (onDateChange ? onDateChange(date) : onChange({ date }))}
            lessonDays={lessonDays}
            accentColor={accentColor}
          />
        </div>
        <div>
          <label className="block text-xs text-sp-muted mb-1">교시</label>
          <select
            value={values.period}
            onChange={(e) => onChange({ period: Number(e.target.value) })}
            className={`w-full ${inputPad} bg-sp-card border border-sp-border rounded-lg
                       text-sp-text text-sm focus:outline-none focus:border-sp-accent`}
          >
            {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((p) => {
              const isMatch = matchingPeriods.includes(p);
              return (
                <option key={p} value={p}>
                  {resolvePeriodLabel(p, periodTimes)}
                  {isMatch ? ' ✦' : ''}
                </option>
              );
            })}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-sp-muted mb-1">단원</label>
        <input
          type="text"
          value={values.unit}
          onChange={(e) => onChange({ unit: e.target.value })}
          placeholder="예: 1단원 - 문학의 이해"
          className={`w-full ${inputPad} bg-sp-card border border-sp-border rounded-lg
                     text-sp-text text-sm focus:outline-none focus:border-sp-accent
                     placeholder:text-sp-muted`}
        />
      </div>
      <div>
        <label className="block text-xs text-sp-muted mb-1">차시/주제</label>
        <input
          type="text"
          value={values.lesson}
          onChange={(e) => onChange({ lesson: e.target.value })}
          placeholder="예: 1차시 - 소설의 구성요소"
          className={`w-full ${inputPad} bg-sp-card border border-sp-border rounded-lg
                     text-sp-text text-sm focus:outline-none focus:border-sp-accent
                     placeholder:text-sp-muted`}
        />
      </div>
      <div>
        <label className="block text-xs text-sp-muted mb-1">비고 (선택)</label>
        <input
          type="text"
          value={values.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="예: 모둠 활동 포함"
          className={`w-full ${inputPad} bg-sp-card border border-sp-border rounded-lg
                     text-sp-text text-sm focus:outline-none focus:border-sp-accent
                     placeholder:text-sp-muted`}
        />
      </div>
    </div>
  );
}
