import { CalendarPicker } from '@adapters/components/common/CalendarPicker';
import { StandardCodeField } from '@adapters/components/CurriculumStandards/StandardCodeField';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import type { StandardScope } from '@domain/rules/curriculumStandardRules';
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
  /**
   * 이 차시가 다루는 성취기준 코드. `unit`·`lesson` 은 자유 문자열이라 "무엇을 배우는 장면인가"를
   * 기계가 알 수 없었다. 선택 — 안 붙여도 진도는 그대로 돈다.
   */
  readonly standardCodes?: readonly string[];
  /** 2022 개정 자료가 없는 학년(2026 중3·고3)에서 직접 적은 성취기준 문장. */
  readonly standardText?: string;
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
  /**
   * 차시 칸 옆에 붙는 **참고 표시**(예: '이번 학기 13번째 수업').
   *
   * ⚠️ 이 값은 절대 입력칸에 들어가지 않는다. 앱이 센 누적 차시를 값으로 넣으면 대단원·소단원
   * 단위로 차시를 세는 선생님에게 틀린 숫자를 강요하게 된다. 참고로만 보여주고 판단은 맡긴다.
   */
  lessonOrdinalHint?: string | null;
  /** 이전/다음 수업일로 이동 — 수업 없는 날·공휴일을 건너뛴다. null이면 버튼을 막는다. */
  onStepLessonDate?: (direction: 'prev' | 'next') => void;
  /** 그 방향에 갈 수 있는 수업일이 있는가. 없으면 버튼 비활성화. */
  canStepLessonDate?: { prev: boolean; next: boolean };
  /** 컴팩트 간격 (모달/좁은 폼용) */
  compact?: boolean;
  /**
   * 성취기준 고르기를 붙일 범위(학교급·과목·학년). **넘기지 않으면 칸 자체가 안 나온다** —
   * 어느 반의 수업인지 모르면 목록을 과목·학년으로 좁힐 수 없고, 좁히지 않은 3,838건짜리
   * 목록은 없는 것만 못하기 때문이다.
   */
  standardScope?: StandardScope;
  /** 성취기준 칸에 보여 줄 맥락 한 줄 (예: '2학년 수학') */
  standardContextLabel?: string;
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
  lessonOrdinalHint,
  onStepLessonDate,
  canStepLessonDate,
  compact = false,
  standardScope,
  standardContextLabel,
}: ProgressEntryFieldsProps) {
  const inputPad = compact ? 'px-2.5 py-1' : 'px-3 py-1.5';
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 flex items-center gap-1">
            <label className="text-xs text-sp-muted">날짜</label>
            {onStepLessonDate !== undefined && (
              <span className="ml-auto flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label="이전 수업일로"
                  title="이전 수업일로 (수업 없는 날은 건너뜁니다)"
                  disabled={canStepLessonDate?.prev === false}
                  onClick={() => onStepLessonDate('prev')}
                  className="rounded-lg border border-sp-border px-1 leading-none text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95 disabled:opacity-30"
                >
                  <span aria-hidden className="material-symbols-outlined text-sm align-middle">
                    chevron_left
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="다음 수업일로"
                  title="다음 수업일로 (수업 없는 날은 건너뜁니다)"
                  disabled={canStepLessonDate?.next === false}
                  onClick={() => onStepLessonDate('next')}
                  className="rounded-lg border border-sp-border px-1 leading-none text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95 disabled:opacity-30"
                >
                  <span aria-hidden className="material-symbols-outlined text-sm align-middle">
                    chevron_right
                  </span>
                </button>
              </span>
            )}
          </div>
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
        <div className="mb-1 flex items-baseline gap-2">
          <label className="text-xs text-sp-muted">차시/주제</label>
          {lessonOrdinalHint != null && lessonOrdinalHint !== '' && (
            // 참고 표시 — 입력값이 아니다. 선생님마다 차시를 세는 단위가 다르다.
            <span className="text-[11px] text-sp-muted opacity-80">{lessonOrdinalHint}</span>
          )}
        </div>
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
      {standardScope !== undefined && (
        <StandardCodeField
          codes={values.standardCodes}
          onCodesChange={(standardCodes) => onChange({ standardCodes })}
          standardText={values.standardText}
          onStandardTextChange={(standardText) => onChange({ standardText })}
          scope={standardScope}
          contextLabel={standardContextLabel}
          compact={compact}
        />
      )}
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
