import { useState, useMemo, useEffect } from 'react';
import type { TimetableOverride, TimetableOverrideKind, TimetableOverrideScope } from '@domain/entities/Timetable';
import { Modal } from '@adapters/components/common/Modal';

const REASON_PRESETS = ['수업 교환', '자습', '시험', '행사', '보충수업', '출장', '기타'] as const;

const KIND_OPTIONS: readonly {
  readonly key: TimetableOverrideKind;
  readonly label: string;
  readonly desc: string;
  readonly icon: string;
}[] = [
  { key: 'swap', label: '수업 교체', desc: '다른 교시와 맞바꿈', icon: 'swap_horiz' },
  { key: 'substitute', label: '보강', desc: '다른 교사/과목으로 대체', icon: 'person_add' },
  { key: 'cancel', label: '자습/공강', desc: '수업 없음', icon: 'event_busy' },
  { key: 'custom', label: '기타', desc: '자유 입력', icon: 'edit_note' },
];

// --------- Props (Discriminated Union) ---------
interface TempChangeModalBaseProps {
  date: string;
  period: number;
  currentSubject: string;
  currentClassroom?: string;
  onClose: () => void;
}

/** create 모드에서 swap일 때 호출. 두 개의 변경을 원자적으로 저장할지 여부는 호출측 결정. */
export interface SwapInput {
  readonly slotA: { date: string; period: number; subject: string; classroom?: string };
  readonly slotB: { date: string; period: number; subject: string; classroom?: string };
  readonly reason?: string;
}

/** 단일 변동(substitute/cancel/custom) 저장 payload */
export interface SingleOverrideInput {
  readonly date: string;
  readonly period: number;
  readonly subject: string;
  readonly classroom?: string;
  readonly reason?: string;
  readonly kind: TimetableOverrideKind;
  readonly substituteTeacher?: string;
  readonly scope: TimetableOverrideScope;
}

interface TempChangeModalCreateProps extends TempChangeModalBaseProps {
  mode?: 'create';
  slotEditable?: boolean;
  maxPeriods?: number;
  /** 모달 생성 시 초기 scope (셀 우클릭일 때 활성 탭을 반영). 기본 'both'. */
  defaultScope?: TimetableOverrideScope;
  resolveBaseSubject?: (date: string, period: number) => string;
  resolveBaseClassroom?: (date: string, period: number) => string;
  /** substitute/cancel/custom 단일 변동 저장 */
  onSaveSingle: (input: SingleOverrideInput) => void;
  /** swap (두 변동 페어 저장) */
  onSaveSwap: (input: SwapInput & { scope: TimetableOverrideScope }) => void;
}

interface TempChangeModalEditProps extends TempChangeModalBaseProps {
  mode: 'edit';
  initialOverride: TimetableOverride;
  /** 편집 모드에서도 날짜/교시 변경 가능. 슬롯 자체가 바뀌면 내부적으로 delete+add 처리. */
  maxPeriods?: number;
  resolveBaseSubject?: (date: string, period: number) => string;
  resolveBaseClassroom?: (date: string, period: number) => string;
  onSaveEdit: (
    oldId: string,
    input: SingleOverrideInput,
  ) => void;
}

export type TempChangeModalProps = TempChangeModalCreateProps | TempChangeModalEditProps;

function formatDotted(dateStr: string): string {
  return dateStr.replace(/-/g, '.');
}

export function TempChangeModal(props: TempChangeModalProps) {
  const isEdit = props.mode === 'edit';
  const isCreate = !isEdit;
  // create에서 slotEditable 또는 edit에서는 언제나 슬롯 편집 가능
  const slotEditable = isEdit || (isCreate && (props as TempChangeModalCreateProps).slotEditable === true);

  // 변동 유형 (create 전용)
  const [kind, setKind] = useState<TimetableOverrideKind>(
    isEdit ? ((props as TempChangeModalEditProps).initialOverride.kind ?? 'custom') : 'substitute',
  );

  // 적용 범위 (교사/학급/공통)
  const [scope, setScope] = useState<TimetableOverrideScope>(
    isEdit
      ? ((props as TempChangeModalEditProps).initialOverride.scope ?? 'both')
      : ((props as TempChangeModalCreateProps).defaultScope ?? 'both'),
  );

  // 슬롯 A (모든 유형 공통 — 변경할 원래 수업)
  const [dateA, setDateA] = useState(props.date);
  const [periodA, setPeriodA] = useState(props.period);

  // 슬롯 B (swap 전용 — 맞바꿀 다른 슬롯)
  const [dateB, setDateB] = useState(props.date);
  const [periodB, setPeriodB] = useState(Math.max(1, props.period - 1));

  // swap 전용: 각 슬롯에서 "바뀌고 나서 들어갈 과목" (사용자가 직접 입력)
  // 기본값은 각자의 기본 시간표 과목으로 프리필
  const [swapSubjectA, setSwapSubjectA] = useState('');
  const [swapSubjectB, setSwapSubjectB] = useState('');

  const initial: Partial<TimetableOverride> = isEdit
    ? (props as TempChangeModalEditProps).initialOverride
    : {};

  const [subject, setSubject] = useState(
    isEdit ? (initial.subject ?? '') : props.currentSubject,
  );
  const [classroom, setClassroom] = useState(
    isEdit ? (initial.classroom ?? '') : (props.currentClassroom ?? ''),
  );
  const [reason, setReason] = useState(isEdit ? (initial.reason ?? '') : '');
  const [substituteTeacher, setSubstituteTeacher] = useState(
    isEdit ? (initial.substituteTeacher ?? '') : '',
  );

  const createProps = (isCreate ? (props as TempChangeModalCreateProps) : null);
  const editProps = (isEdit ? (props as TempChangeModalEditProps) : null);

  // resolveBaseSubject/Classroom은 create/edit 양쪽 모두 지원
  const resolveBaseSubject = createProps?.resolveBaseSubject ?? editProps?.resolveBaseSubject;
  const resolveBaseClassroom = createProps?.resolveBaseClassroom ?? editProps?.resolveBaseClassroom;

  const baseSubjectA = useMemo(() => {
    if (resolveBaseSubject) return resolveBaseSubject(dateA, periodA);
    return props.currentSubject;
  }, [resolveBaseSubject, dateA, periodA, props]);

  const baseSubjectB = useMemo(() => {
    if (!resolveBaseSubject) return '';
    return resolveBaseSubject(dateB, periodB);
  }, [resolveBaseSubject, dateB, periodB]);

  // swap 기본값을 기본 시간표에서 프리필 (A슬롯에는 B과목, B슬롯에는 A과목이 들어간다)
  useEffect(() => {
    if (kind !== 'swap') return;
    setSwapSubjectA(baseSubjectB);
    setSwapSubjectB(baseSubjectA);
  }, [kind, dateA, periodA, dateB, periodB, baseSubjectA, baseSubjectB]);

  const baseClassroomA = useMemo(() => {
    if (!resolveBaseClassroom) return '';
    return resolveBaseClassroom(dateA, periodA);
  }, [resolveBaseClassroom, dateA, periodA]);

  const maxPeriods = (createProps?.maxPeriods ?? editProps?.maxPeriods) ?? 10;

  // edit 모드에서도 유형 변경 UI는 숨김(기존 kind 유지). swap/substitute/cancel/custom 로직은 create 전용.
  const isSwap = isCreate && kind === 'swap';
  const isSubstitute = isCreate && kind === 'substitute';
  const isCancel = isCreate && kind === 'cancel';

  const handleSubmit = () => {
    if (isEdit) {
      editProps!.onSaveEdit(
        editProps!.initialOverride.id,
        {
          date: dateA,
          period: periodA,
          subject,
          classroom: classroom || undefined,
          reason: reason || undefined,
          kind: editProps!.initialOverride.kind ?? 'custom',
          substituteTeacher: substituteTeacher || undefined,
          scope,
        },
      );
      props.onClose();
      return;
    }
    if (isSwap) {
      createProps!.onSaveSwap({
        slotA: { date: dateA, period: periodA, subject: swapSubjectA, classroom: baseClassroomA || undefined },
        slotB: { date: dateB, period: periodB, subject: swapSubjectB, classroom: createProps?.resolveBaseClassroom?.(dateB, periodB) || undefined },
        reason: reason || '수업 교환',
        scope,
      });
    } else {
      const finalSubject = kind === 'cancel' ? '' : subject;
      createProps!.onSaveSingle({
        date: dateA,
        period: periodA,
        subject: finalSubject,
        classroom: classroom || undefined,
        reason: reason || undefined,
        kind,
        substituteTeacher: isSubstitute ? (substituteTeacher || undefined) : undefined,
        scope,
      });
    }
    props.onClose();
  };

  const submitDisabled = (() => {
    if (isEdit) return false;
    if (isSwap) {
      // 같은 슬롯 A=B는 교체 의미 없음. 양쪽 과목이 모두 비어있으면 교체 의미 없음
      if (dateA === dateB && periodA === periodB) return true;
      if (!swapSubjectA.trim() && !swapSubjectB.trim()) return true;
      return false;
    }
    if (isSubstitute && !subject.trim()) return true;
    return false;
  })();

  const titleText = isEdit ? '임시 시간표 수정' : '변동 시간표 추가';

  return (
    <Modal isOpen onClose={props.onClose} title={titleText} srOnlyTitle size="md">
      <div className="p-6 overflow-y-auto">
        <h3 className="text-base font-bold text-sp-text mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-400 text-lg">push_pin</span>
          {titleText}
        </h3>

        {/* 적용 범위 (항상 노출) */}
        <label className="block text-xs font-medium text-sp-muted mb-1.5">적용 범위</label>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {([
            { key: 'teacher', label: '교사 시간표', desc: '내 일정만' },
            { key: 'class', label: '학급 시간표', desc: '우리 반만' },
            { key: 'both', label: '양쪽 모두', desc: '교사·학급' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setScope(opt.key)}
              className={`px-2 py-2 rounded-lg border text-center transition-all ${
                scope === opt.key
                  ? 'bg-sp-accent/10 border-sp-accent'
                  : 'bg-sp-bg/50 border-sp-border hover:border-sp-muted'
              }`}
            >
              <div className={`text-xs font-bold ${scope === opt.key ? 'text-sp-accent' : 'text-sp-text'}`}>
                {opt.label}
              </div>
              <div className="text-caption text-sp-muted mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>

        {/* 변동 유형 선택 (create 전용) */}
        {isCreate && (
          <>
            <label className="block text-xs font-medium text-sp-muted mb-1.5">변동 유형</label>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setKind(opt.key)}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                    kind === opt.key
                      ? 'bg-sp-accent/10 border-sp-accent'
                      : 'bg-sp-bg/50 border-sp-border hover:border-sp-muted'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-base mt-0.5 ${
                      kind === opt.key ? 'text-sp-accent' : 'text-sp-muted'
                    }`}
                  >
                    {opt.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs font-bold ${
                        kind === opt.key ? 'text-sp-accent' : 'text-sp-text'
                      }`}
                    >
                      {opt.label}
                    </div>
                    <div className="text-caption text-sp-muted mt-0.5 leading-tight">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ============ 슬롯 A ============ */}
        <div className="mb-3 px-3 py-2.5 bg-sp-bg/40 border border-sp-border rounded-lg">
          <div className="text-xs font-bold text-sp-muted mb-2">
            {isSwap ? '① A 교시' : '변경 대상'}
          </div>

          {slotEditable ? (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-caption text-sp-muted mb-0.5">날짜</label>
                <input
                  type="date"
                  value={dateA}
                  onChange={(e) => setDateA(e.target.value)}
                  className="w-full bg-sp-bg border border-sp-border rounded-md px-2 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-caption text-sp-muted mb-0.5">교시</label>
                <select
                  value={periodA}
                  onChange={(e) => setPeriodA(Number(e.target.value))}
                  className="w-full bg-sp-bg border border-sp-border rounded-md px-2 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
                >
                  {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>{p}교시</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="text-xs text-sp-muted mb-1">
              {formatDotted(dateA)} · {periodA}교시
            </div>
          )}
          <div className="text-xs text-sp-text mb-2">
            원래 과목:{' '}
            <span className="font-semibold">{baseSubjectA || '(빈 교시)'}</span>
            {baseClassroomA && <span className="text-sp-muted ml-1">@{baseClassroomA}</span>}
          </div>
          {isSwap && (
            <>
              <label className="block text-caption text-sp-muted mb-0.5">A 교시에 들어올 과목</label>
              <input
                type="text"
                value={swapSubjectA}
                onChange={(e) => setSwapSubjectA(e.target.value)}
                placeholder="예: 수학"
                className="w-full bg-sp-bg border border-sp-border rounded-md px-2 py-1.5 text-sm text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none"
              />
            </>
          )}
        </div>

        {/* ============ 슬롯 B (swap 전용) ============ */}
        {isSwap && (
          <div className="mb-3 px-3 py-2.5 bg-sp-bg/40 border border-sp-border rounded-lg">
            <div className="text-xs font-bold text-sp-muted mb-2">② B 교시</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-caption text-sp-muted mb-0.5">날짜</label>
                <input
                  type="date"
                  value={dateB}
                  onChange={(e) => setDateB(e.target.value)}
                  className="w-full bg-sp-bg border border-sp-border rounded-md px-2 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-caption text-sp-muted mb-0.5">교시</label>
                <select
                  value={periodB}
                  onChange={(e) => setPeriodB(Number(e.target.value))}
                  className="w-full bg-sp-bg border border-sp-border rounded-md px-2 py-1.5 text-xs text-sp-text focus:border-sp-accent focus:outline-none"
                >
                  {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>{p}교시</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="text-xs text-sp-text mb-2">
              원래 과목:{' '}
              <span className="font-semibold">{baseSubjectB || '(빈 교시)'}</span>
            </div>
            <label className="block text-caption text-sp-muted mb-0.5">B 교시에 들어올 과목</label>
            <input
              type="text"
              value={swapSubjectB}
              onChange={(e) => setSwapSubjectB(e.target.value)}
              placeholder="예: 국어"
              className="w-full bg-sp-bg border border-sp-border rounded-md px-2 py-1.5 text-sm text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none"
            />

            {/* 미리보기 */}
            <div className="mt-2 px-2 py-1.5 bg-sp-accent/10 rounded text-detail text-sp-accent">
              🔄 A: {baseSubjectA || '(빈)'} → <strong>{swapSubjectA || '(비어있음)'}</strong>
              {' · '}
              B: {baseSubjectB || '(빈)'} → <strong>{swapSubjectB || '(비어있음)'}</strong>
            </div>
          </div>
        )}

        {/* ============ 유형별 입력 필드 ============ */}
        {!isEdit && isSwap && null /* swap은 과목 입력 불필요 */}

        {(!isCreate || !isSwap) && !isCancel && (
          <>
            {/* 변경할 과목 (substitute/custom/edit) */}
            <label className="block text-xs font-medium text-sp-muted mb-1">변경할 과목</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={isSubstitute ? '예: 수학' : '비우면 공강/자습'}
              className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 mb-3"
              autoFocus={!slotEditable}
            />

            {/* 보강 교사 (substitute 전용) */}
            {isSubstitute && (
              <>
                <label className="block text-xs font-medium text-sp-muted mb-1">보강 교사 (선택)</label>
                <input
                  type="text"
                  value={substituteTeacher}
                  onChange={(e) => setSubstituteTeacher(e.target.value)}
                  placeholder="대신 수업하는 선생님 이름"
                  className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 mb-3"
                />
              </>
            )}

            {/* 교실 */}
            <label className="block text-xs font-medium text-sp-muted mb-1">교실 (선택)</label>
            <input
              type="text"
              value={classroom}
              onChange={(e) => setClassroom(e.target.value)}
              placeholder="교실"
              className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/40 focus:border-sp-accent focus:outline-none focus:ring-1 focus:ring-sp-accent/50 mb-3"
            />
          </>
        )}

        {isCancel && (
          <div className="mb-3 px-3 py-2 bg-sp-accent/5 border border-sp-accent/30 rounded-lg text-xs text-sp-text">
            💤 이 교시는 <strong>자습/공강</strong>으로 표시됩니다.
          </div>
        )}

        {/* 사유 프리셋 (모든 모드) */}
        <label className="block text-xs font-medium text-sp-muted mb-1.5">변경 사유</label>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {REASON_PRESETS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason((prev) => (prev === r ? '' : r))}
              className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                reason === r
                  ? 'bg-sp-accent/20 border-sp-accent text-sp-accent font-medium'
                  : 'border-sp-border text-sp-muted hover:border-sp-muted hover:text-sp-text'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* 저장/취소 */}
        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="flex-1 py-2.5 text-sm font-bold bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-all active:scale-95 disabled:bg-sp-border disabled:text-sp-muted disabled:cursor-not-allowed"
          >
            {isEdit ? '저장' : isSwap ? '교체 등록' : '변동 등록'}
          </button>
          <button
            onClick={props.onClose}
            className="flex-1 py-2.5 text-sm font-bold bg-sp-surface border border-sp-border text-sp-muted rounded-lg hover:text-sp-text transition-all"
          >
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}
