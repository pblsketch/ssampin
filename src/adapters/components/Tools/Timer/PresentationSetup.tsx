import { useEffect, useRef, useState } from 'react';
import type { TimerRosterInputMode, TimerRosterPresenter } from '@domain/rules/timerLocalState';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import { numberActiveRoster } from '@domain/rules/rosterNumbering';
import { CustomTimeModal } from './CustomTimeModal';
import { formatPresetLabel, TimerSwitch } from './TimerControls';
import { TimerSoundSettings } from './TimerSoundSettings';

/**
 * 발표 타이머 준비 화면(ADR-139, spec 4-1·4-2).
 * 명단 소스·발표자 추가·순서·발표 시간(직접 입력)·질문 시간·자동 진행·예고 알림·[명단 비우기].
 */

export const DURATION_PRESETS = [60, 120, 180, 300] as const;
export const QNA_PRESETS = [30, 60, 120] as const;

export interface PresentationSetupValue {
  readonly presenters: readonly TimerRosterPresenter[];
  /** 발표자 id → 발표 순서(1부터). */
  readonly order: ReadonlyMap<string, number>;
  readonly inputMode: TimerRosterInputMode;
  readonly durationSeconds: number;
  /** null = 질문 시간 꺼짐. */
  readonly qnaSeconds: number | null;
  readonly autoAdvance: boolean;
}

/** 번호순 순서 — 명단을 불러오면 자동으로 매긴다(spec 4-1). */
export function orderByNumber(
  presenters: readonly TimerRosterPresenter[],
  descending = false,
): Map<string, number> {
  const sorted = [...presenters].sort((a, b) =>
    descending ? (b.number ?? 0) - (a.number ?? 0) : (a.number ?? 0) - (b.number ?? 0),
  );
  return new Map(sorted.map((p, i) => [p.id, i + 1]));
}

function orderRandom(presenters: readonly TimerRosterPresenter[]): Map<string, number> {
  const shuffled = [...presenters];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return new Map(shuffled.map((p, i) => [p.id, i + 1]));
}

const chipBase = 'px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors';
const chipOff =
  'bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent';
const chipOn = 'bg-sp-accent text-sp-accent-fg border border-sp-accent';
const sourceOn = 'bg-sp-card border-sp-accent text-sp-accent';
const sourceOff =
  'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent';
const smallButton =
  'flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent text-xs font-medium transition-colors';

export function PresentationSetup({
  value,
  onChange,
  onStart,
  onClear,
}: {
  readonly value: PresentationSetupValue;
  readonly onChange: (patch: Partial<PresentationSetupValue>) => void;
  readonly onStart: () => void;
  readonly onClear: () => void;
}): JSX.Element {
  const { presenters, order, inputMode, durationSeconds, qnaSeconds, autoAdvance } = value;
  const [newName, setNewName] = useState('');
  const [editingOrder, setEditingOrder] = useState<{ id: string; value: string } | null>(null);
  const [customKind, setCustomKind] = useState<'duration' | 'qna' | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const tcClasses = useTeachingClassStore((s) => s.classes);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);
  const [showTcDropdown, setShowTcDropdown] = useState(false);
  const tcDropdownRef = useRef<HTMLDivElement>(null);
  const presenterSeqRef = useRef(0);

  useEffect(() => {
    if (!tcLoaded) void loadTc();
  }, [tcLoaded, loadTc]);

  useEffect(() => {
    if (!showTcDropdown) return;
    const handleClick = (e: MouseEvent): void => {
      if (tcDropdownRef.current && !tcDropdownRef.current.contains(e.target as Node)) {
        setShowTcDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTcDropdown]);

  const applyRoster = (list: TimerRosterPresenter[], mode: TimerRosterInputMode): void => {
    if (list.length === 0) return;
    // 명단을 불러오면 번호순이 자동으로 지정된다 — 예전에는 "순서를 지정하세요 (0/25)"로 잠겼다.
    onChange({ presenters: list, order: orderByNumber(list), inputMode: mode });
  };

  const loadStudents = (): void => {
    const valid = numberActiveRoster(useStudentStore.getState().students).filter(
      ({ student }) => student.name.trim() !== '',
    );
    applyRoster(
      valid.map(({ student, number }) => ({ id: `s-${student.id}`, name: student.name, number })),
      'students',
    );
  };

  const loadTeachingClass = (classId: string): void => {
    const cls = tcClasses.find((c) => c.id === classId);
    setShowTcDropdown(false);
    if (!cls) return;
    applyRoster(
      cls.students.filter(isStudentActive).map((s, i) => ({
        id: `tc-${cls.id}-${i}`,
        name: s.name?.trim() ? s.name : `${s.number}번`,
        number: s.number,
      })),
      'teachingClass',
    );
  };

  const addPresenter = (): void => {
    const name = newName.trim();
    if (!name) return;
    presenterSeqRef.current += 1;
    const id = `c-${Date.now()}-${presenterSeqRef.current}`;
    const nextPresenters = [...presenters, { id, name }];
    const nextOrder = new Map(order);
    // 직접 입력: 입력 순서 = 발표 순서
    nextOrder.set(id, nextPresenters.length);
    onChange({ presenters: nextPresenters, order: nextOrder, inputMode: 'custom' });
    setNewName('');
  };

  const removePresenter = (id: string): void => {
    const nextOrder = new Map(order);
    nextOrder.delete(id);
    onChange({ presenters: presenters.filter((p) => p.id !== id), order: nextOrder });
  };

  const commitOrder = (id: string, raw: string): void => {
    const num = parseInt(raw, 10);
    const nextOrder = new Map(order);
    if (num >= 1 && num <= presenters.length) nextOrder.set(id, num);
    else if (!raw.trim()) nextOrder.delete(id);
    onChange({ order: nextOrder });
    setEditingOrder(null);
  };

  const hasNumbers = presenters.some((p) => p.number != null);
  const hasAllOrders = presenters.length > 0 && presenters.every((p) => order.has(p.id));
  const durationIsPreset = (DURATION_PRESETS as readonly number[]).includes(durationSeconds);
  const qnaIsPreset =
    qnaSeconds !== null && (QNA_PRESETS as readonly number[]).includes(qnaSeconds);

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-lg mx-auto">
      {/* 명단 소스 */}
      <div className="flex gap-2 w-full">
        <button
          type="button"
          onClick={() => {
            if (inputMode !== 'custom')
              onChange({ presenters: [], order: new Map(), inputMode: 'custom' });
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
            inputMode === 'custom' ? sourceOn : sourceOff
          }`}
        >
          <span className="material-symbols-outlined text-icon-md">edit</span>
          직접 입력
        </button>
        <button
          type="button"
          onClick={loadStudents}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
            inputMode === 'students' ? sourceOn : sourceOff
          }`}
        >
          <span className="material-symbols-outlined text-icon-md">group</span>
          우리반
        </button>
        <div className="relative flex-1" ref={tcDropdownRef}>
          <button
            type="button"
            onClick={() => {
              if (tcClasses.length === 1) loadTeachingClass(tcClasses[0]!.id);
              else if (tcClasses.length > 1) setShowTcDropdown((v) => !v);
            }}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
              inputMode === 'teachingClass' ? sourceOn : sourceOff
            }`}
          >
            <span className="material-symbols-outlined text-icon-md">school</span>
            수업반
          </button>
          {showTcDropdown && tcClasses.length > 1 && (
            <div
              data-sp-floating
              className="absolute top-full left-0 right-0 mt-1 z-20 bg-sp-card border border-sp-border rounded-xl shadow-lg overflow-hidden"
            >
              {tcClasses.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => loadTeachingClass(cls.id)}
                  className="w-full px-4 py-2.5 text-left text-sm text-sp-text hover:bg-sp-surface transition-colors"
                >
                  {cls.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 발표자 추가 */}
      <div className="flex gap-2 w-full">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addPresenter();
          }}
          placeholder="발표자 이름 입력"
          aria-label="발표자 이름"
          className="flex-1 px-4 py-2.5 bg-sp-bg border border-sp-border rounded-xl text-sm text-sp-text placeholder:text-sp-muted focus:border-sp-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={addPresenter}
          disabled={!newName.trim()}
          className="px-4 py-2.5 bg-sp-accent text-sp-accent-fg rounded-xl text-sm font-medium hover:brightness-110 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          추가
        </button>
      </div>

      {/* 발표자 목록과 순서 */}
      {presenters.length > 0 && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <span className="text-xs text-sp-muted">발표 순서</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {hasNumbers && (
                <>
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => onChange({ order: orderByNumber(presenters) })}
                  >
                    <span className="material-symbols-outlined text-sm">arrow_upward</span>
                    번호순
                  </button>
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => onChange({ order: orderByNumber(presenters, true) })}
                  >
                    <span className="material-symbols-outlined text-sm">arrow_downward</span>
                    번호역순
                  </button>
                </>
              )}
              <button
                type="button"
                className={smallButton}
                onClick={() => onChange({ order: orderRandom(presenters) })}
              >
                <span className="material-symbols-outlined text-sm">shuffle</span>
                무작위
              </button>
              <button
                type="button"
                className={smallButton}
                onClick={() => onChange({ order: new Map() })}
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                직접 지정
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl bg-sp-card border border-sp-border divide-y divide-sp-border">
            {presenters.map((p) => {
              const pos = order.get(p.id);
              return (
                <div key={p.id} className="flex items-center px-3 py-2">
                  {hasNumbers && (
                    <span className="w-8 text-center text-xs text-sp-muted font-mono">
                      {p.number ?? '–'}
                    </span>
                  )}
                  <span className="flex-1 pl-2 text-sm text-sp-text">{p.name}</span>
                  {editingOrder?.id === p.id ? (
                    <input
                      type="number"
                      min={1}
                      max={presenters.length}
                      value={editingOrder.value}
                      onChange={(e) => setEditingOrder({ id: p.id, value: e.target.value })}
                      onBlur={() => commitOrder(p.id, editingOrder.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitOrder(p.id, editingOrder.value);
                        else if (e.key === 'Escape') setEditingOrder(null);
                      }}
                      aria-label={`${p.name} 발표 순서`}
                      className="w-10 h-7 bg-sp-bg border border-sp-accent rounded-lg text-center text-xs font-mono text-sp-text focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setEditingOrder({ id: p.id, value: pos != null ? String(pos) : '' })
                      }
                      aria-label={`${p.name} 발표 순서 ${pos ?? '미지정'} — 눌러서 바꾸기`}
                      className={`w-10 h-7 rounded-lg text-xs font-mono transition-colors flex items-center justify-center border ${
                        pos != null
                          ? 'border-sp-accent text-sp-accent'
                          : 'bg-sp-bg border-sp-border text-sp-muted'
                      }`}
                    >
                      {pos ?? ''}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removePresenter(p.id)}
                    aria-label={`${p.name} 빼기`}
                    className="w-6 h-6 ml-1 rounded-full flex items-center justify-center text-sp-muted hover:text-sp-error transition-colors"
                  >
                    <span className="material-symbols-outlined text-icon-sm">close</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 발표 시간 */}
      <div className="w-full">
        <p className="text-xs text-sp-muted mb-2">발표 시간 (1인당)</p>
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((sec) => (
            <button
              key={sec}
              type="button"
              aria-pressed={durationSeconds === sec}
              onClick={() => onChange({ durationSeconds: sec })}
              className={`${chipBase} ${durationSeconds === sec ? chipOn : chipOff}`}
            >
              {formatPresetLabel(sec)}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={!durationIsPreset}
            onClick={() => setCustomKind('duration')}
            className={`${chipBase} ${!durationIsPreset ? chipOn : chipOff}`}
          >
            {durationIsPreset ? '직접 입력' : formatPresetLabel(durationSeconds)}
          </button>
        </div>
      </div>

      {/* 질문 시간 */}
      <div className="w-full p-4 rounded-xl bg-sp-card border border-sp-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-sp-text">
            발표 뒤 질문 시간
            <span className="block text-xs text-sp-muted">
              발표가 끝나면 선생님이 눌러 시작해요
            </span>
          </span>
          <TimerSwitch
            checked={qnaSeconds !== null}
            label="발표 뒤 질문 시간"
            onChange={(on) => onChange({ qnaSeconds: on ? 60 : null })}
          />
        </div>
        {qnaSeconds !== null && (
          <div className="flex flex-wrap gap-2">
            {QNA_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                aria-pressed={qnaSeconds === sec}
                onClick={() => onChange({ qnaSeconds: sec })}
                className={`${chipBase} ${qnaSeconds === sec ? chipOn : chipOff}`}
              >
                {formatPresetLabel(sec)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={!qnaIsPreset}
              onClick={() => setCustomKind('qna')}
              className={`${chipBase} ${!qnaIsPreset ? chipOn : chipOff}`}
            >
              {qnaIsPreset ? '직접 입력' : formatPresetLabel(qnaSeconds)}
            </button>
          </div>
        )}
      </div>

      {/* 자동 진행 */}
      <div className="flex items-center justify-between w-full px-1 gap-3">
        <span className="flex items-center gap-2 text-sm text-sp-text">
          <span className="material-symbols-outlined text-sp-muted text-icon-md">skip_next</span>
          <span>
            다음 발표자 자동 진행
            <span className="block text-xs text-sp-muted">
              {qnaSeconds !== null
                ? '질문 시간이 끝나고 2초 뒤에 넘어가요'
                : '발표 시간이 끝나고 2초 뒤에 넘어가요'}
            </span>
          </span>
        </span>
        <TimerSwitch
          checked={autoAdvance}
          label="다음 발표자 자동 진행"
          onChange={(next) => onChange({ autoAdvance: next })}
        />
      </div>

      <TimerSoundSettings preWarning="presentation" showRepeat={false} />

      <button
        type="button"
        onClick={onStart}
        disabled={!hasAllOrders}
        className="w-full py-4 rounded-xl bg-sp-accent text-sp-accent-fg text-lg font-bold hover:brightness-110 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span className="material-symbols-outlined text-icon-xl">play_arrow</span>
        {hasAllOrders
          ? `발표 시작 (${presenters.length}명)`
          : presenters.length === 0
            ? '발표자를 추가하세요'
            : `순서를 지정하세요 (${order.size}/${presenters.length})`}
      </button>

      {presenters.length > 0 && (
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="text-xs text-sp-muted hover:text-sp-error flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-icon-sm">delete_sweep</span>
          명단 비우기
        </button>
      )}

      {confirmClear && (
        <div
          className="w-full p-4 rounded-xl bg-sp-card border border-sp-error flex flex-col items-center gap-3"
          role="alertdialog"
          aria-label="명단 비우기"
        >
          <p className="text-sm text-sp-text">명단과 순서를 모두 지울까요? 되돌릴 수 없어요.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="px-4 py-2 rounded-lg border border-sp-border text-sm text-sp-muted hover:text-sp-text"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmClear(false);
                onClear();
              }}
              className="px-4 py-2 rounded-lg border border-sp-error text-sm text-sp-error font-medium"
            >
              비우기
            </button>
          </div>
        </div>
      )}

      {customKind !== null && (
        <CustomTimeModal
          title={customKind === 'duration' ? '발표 시간 직접 입력' : '질문 시간 직접 입력'}
          minSeconds={5}
          initialSeconds={customKind === 'duration' ? durationSeconds : (qnaSeconds ?? 60)}
          onClose={() => setCustomKind(null)}
          onConfirm={(seconds) => {
            if (customKind === 'duration') onChange({ durationSeconds: seconds });
            else onChange({ qnaSeconds: seconds });
            setCustomKind(null);
          }}
        />
      )}
    </div>
  );
}
