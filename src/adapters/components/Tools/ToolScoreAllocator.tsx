import { useState, useEffect, useCallback, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { ExamItem, ItemType } from '@domain/entities/ExamPaper';
import {
  ITEM_TYPE_LABELS,
  DEFAULT_FULL_SCORE,
  DEFAULT_DIFFICULTY_RATIO,
} from '@domain/entities/ExamPaper';
import {
  sumPoints,
  remaining,
  subtotalByType,
  itemCountByType,
  writtenRatio,
  meetsWrittenTarget,
  validatePaper,
  suggestDifficultyRows,
  countsFromRatio,
  toCents,
  fromCents,
} from '@domain/rules/examAllocationRules';

interface ToolScoreAllocatorProps {
  onBack: () => void;
  isFullscreen: boolean;
}

/** 단일 초안 자동저장 (로컬). 과한 repository/DI 없이 도구 한정 경량 저장. */
const STORAGE_KEY = 'ssampin:exam-allocator-draft';

interface DraftState {
  fullScore: number;
  targetWrittenRatio: number | null;
  items: ExamItem[];
}

function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftState>;
    if (!Array.isArray(parsed.items)) return null;
    return {
      fullScore: typeof parsed.fullScore === 'number' ? parsed.fullScore : DEFAULT_FULL_SCORE,
      targetWrittenRatio:
        typeof parsed.targetWrittenRatio === 'number' ? parsed.targetWrittenRatio : null,
      items: parsed.items,
    };
  } catch {
    return null;
  }
}

function saveDraft(state: DraftState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패는 무시 (시크릿 모드 등). 화면 동작에는 영향 없음.
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `item-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

const TYPE_OPTIONS: readonly ItemType[] = ['choice', 'short', 'essay'];

/** 난이도 라벨 (오름차순: index 0 = 하). */
const DIFF_LABELS = ['하', '중', '상'] as const;
/** 화면 표시 순서 (상 → 중 → 하). */
const DISPLAY_ORDER: readonly number[] = [2, 1, 0];

/** 난이도 1단계 직접 입력 칸. */
interface TierRow {
  points: number;
  count: number;
}

/** 유형 1개의 난이도 배분 구성. */
interface BlockState {
  /** 자동 채우기용 목표 총배점. */
  autoTotal: number;
  /** 자동 채우기용 목표 문항수. */
  autoCount: number;
  /** 난이도 문항수 비율 (상·중·하). */
  ratio: { high: number; mid: number; low: number };
  /** 난이도별 직접 입력 칸 (오름차순 [하, 중, 상]). */
  rows: TierRow[];
}

function emptyRows(): TierRow[] {
  return [
    { points: 0, count: 0 },
    { points: 0, count: 0 },
    { points: 0, count: 0 },
  ];
}

function suggestRows(
  total: number,
  count: number,
  step: number,
  b: BlockState['ratio'],
): TierRow[] {
  const rows = suggestDifficultyRows({
    total,
    count,
    step,
    ratio: [b.low, b.mid, b.high],
  }).map((r) => ({ points: r.points, count: r.count }));
  while (rows.length < 3) rows.push({ points: 0, count: 0 });
  return rows;
}

const DEFAULT_RATIO: BlockState['ratio'] = {
  high: DEFAULT_DIFFICULTY_RATIO[2],
  mid: DEFAULT_DIFFICULTY_RATIO[1],
  low: DEFAULT_DIFFICULTY_RATIO[0],
};

function defaultBlocks(): Record<ItemType, BlockState> {
  return {
    choice: {
      autoTotal: 70,
      autoCount: 20,
      ratio: { ...DEFAULT_RATIO },
      rows: suggestRows(70, 20, 1, DEFAULT_RATIO),
    },
    short: { autoTotal: 20, autoCount: 5, ratio: { ...DEFAULT_RATIO }, rows: emptyRows() },
    essay: { autoTotal: 10, autoCount: 2, ratio: { ...DEFAULT_RATIO }, rows: emptyRows() },
  };
}

export function ToolScoreAllocator({ onBack, isFullscreen }: ToolScoreAllocatorProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'score-allocator' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = useMemo(() => loadDraft(), []);
  const [fullScore, setFullScore] = useState<number>(initial?.fullScore ?? DEFAULT_FULL_SCORE);
  const [targetWrittenRatio, setTargetWrittenRatio] = useState<number | null>(
    initial?.targetWrittenRatio ?? null,
  );
  const [items, setItems] = useState<ExamItem[]>(initial?.items ?? []);

  // 난이도 배분 패널 상태
  const [step, setStep] = useState<number>(1); // 배점간격 (자유 입력, 자동 채우기에 사용)
  const [blocks, setBlocks] = useState<Record<ItemType, BlockState>>(defaultBlocks);

  // 단일 초안 자동저장 (문항만 — 구성 패널은 휘발)
  useEffect(() => {
    saveDraft({ fullScore, targetWrittenRatio, items });
  }, [fullScore, targetWrittenRatio, items]);

  // 파생 계산 — 모든 산술은 도메인 규칙(examAllocationRules)만 통과
  const total = useMemo(() => sumPoints(items), [items]);
  const rest = useMemo(() => remaining(items, fullScore), [items, fullScore]);
  const subtotals = useMemo(() => subtotalByType(items), [items]);
  const counts = useMemo(() => itemCountByType(items), [items]);
  const ratio = useMemo(() => writtenRatio(items, fullScore), [items, fullScore]);
  const ratioOk = useMemo(
    () => meetsWrittenTarget(items, fullScore, targetWrittenRatio ?? undefined),
    [items, fullScore, targetWrittenRatio],
  );
  const issues = useMemo(() => validatePaper({ fullScore, items }), [fullScore, items]);

  const addItem = useCallback((type: ItemType, points: number) => {
    setItems((prev) => {
      const nextNumber = prev.length === 0 ? 1 : Math.max(...prev.map((i) => i.number)) + 1;
      return [...prev, { id: newId(), number: nextNumber, type, points }];
    });
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<ExamItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  // ── 난이도 배분 구성 헬퍼 ──
  const updateBlock = useCallback((type: ItemType, patch: Partial<BlockState>) => {
    setBlocks((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }, []);

  const updateRow = useCallback((type: ItemType, idx: number, patch: Partial<TierRow>) => {
    setBlocks((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        rows: prev[type].rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
      },
    }));
  }, []);

  const updateRatio = useCallback(
    (type: ItemType, key: keyof BlockState['ratio'], value: number) => {
      setBlocks((prev) => ({
        ...prev,
        [type]: { ...prev[type], ratio: { ...prev[type].ratio, [key]: value } },
      }));
    },
    [],
  );

  const autoFill = useCallback(
    (type: ItemType) => {
      setBlocks((prev) => {
        const b = prev[type];
        return {
          ...prev,
          [type]: { ...b, rows: suggestRows(b.autoTotal, b.autoCount, step, b.ratio) },
        };
      });
    },
    [step],
  );

  // 유형별 구성 소계 (정수 센티 연산으로 드리프트 0)
  const blockCents = useCallback(
    (b: BlockState) => b.rows.reduce((acc, r) => acc + toCents(r.points) * r.count, 0),
    [],
  );
  const blockCount = useCallback(
    (b: BlockState) => b.rows.reduce((acc, r) => acc + r.count, 0),
    [],
  );

  const composedTotal = useMemo(
    () => fromCents(TYPE_OPTIONS.reduce((acc, t) => acc + blockCents(blocks[t]), 0)),
    [blocks, blockCents],
  );
  const composedCount = useMemo(
    () => TYPE_OPTIONS.reduce((acc, t) => acc + blockCount(blocks[t]), 0),
    [blocks, blockCount],
  );
  const composedRest = useMemo(
    () => fromCents(toCents(fullScore) - toCents(composedTotal)),
    [fullScore, composedTotal],
  );

  // 객관식 ↔ 서답형 권장 분할 (서답형 목표 비율 기준)
  const splitHint = useMemo(() => {
    if (targetWrittenRatio == null) return null;
    const written = Math.round((fullScore * targetWrittenRatio) / 100);
    return { choice: fullScore - written, written };
  }, [targetWrittenRatio, fullScore]);

  // 구성된 모든 유형의 문항을 한 번에 추가
  const generateAll = useCallback(() => {
    setItems((prev) => {
      let number = prev.length === 0 ? 0 : Math.max(...prev.map((i) => i.number));
      const added: ExamItem[] = [];
      for (const type of TYPE_OPTIONS) {
        blocks[type].rows.forEach((row, i) => {
          if (row.points <= 0 || row.count <= 0) return;
          const difficulty = DIFF_LABELS[i];
          for (let j = 0; j < row.count; j += 1) {
            number += 1;
            added.push({ id: newId(), number, type, points: row.points, difficulty });
          }
        });
      }
      return [...prev, ...added];
    });
  }, [blocks]);

  const restColor =
    rest === 0 ? 'text-emerald-400' : rest > 0 ? 'text-sp-highlight' : 'text-red-400';
  const restLabel = rest === 0 ? '딱 맞음' : rest > 0 ? `${rest}점 부족` : `${-rest}점 초과`;

  const inputCls =
    'bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sp-text text-sm focus:border-sp-accent outline-none';

  return (
    <ToolLayout title="배점 계산기" emoji="🧮" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="w-full h-full overflow-auto px-4 py-4 flex flex-col gap-4 max-w-4xl mx-auto">
        {/* 요약 바 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-sp-card border border-sp-border rounded-xl p-4">
            <label className="text-xs text-sp-muted block mb-1">만점</label>
            <input
              type="number"
              min={0}
              value={fullScore}
              onChange={(e) => setFullScore(Number(e.target.value) || 0)}
              className="w-full bg-sp-surface border border-sp-border rounded-lg px-3 py-2 text-sp-text text-lg font-bold focus:border-sp-accent outline-none"
            />
          </div>
          <div className="bg-sp-card border border-sp-border rounded-xl p-4">
            <span className="text-xs text-sp-muted block mb-1">합계 / 잔여</span>
            <p className="text-lg font-bold text-sp-text">
              {total}
              <span className="text-sp-muted text-sm font-normal"> / {fullScore}점</span>
            </p>
            <p className={`text-sm font-semibold ${restColor}`}>{restLabel}</p>
          </div>
          <div className="bg-sp-card border border-sp-border rounded-xl p-4">
            <span className="text-xs text-sp-muted block mb-1">서답형 비율</span>
            <p className={`text-lg font-bold ${ratioOk ? 'text-sp-text' : 'text-red-400'}`}>
              {ratio}%
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-xs text-sp-muted">목표</span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="미설정"
                value={targetWrittenRatio ?? ''}
                onChange={(e) =>
                  setTargetWrittenRatio(e.target.value === '' ? null : Number(e.target.value))
                }
                className="w-16 bg-sp-surface border border-sp-border rounded-md px-2 py-0.5 text-sp-text text-xs focus:border-sp-accent outline-none"
              />
              <span className="text-xs text-sp-muted">%</span>
            </div>
          </div>
        </div>

        {/* 유형별 소계 (확정된 문항 기준) — 좁은 창에선 1열로 쌓아 카드 짓눌림 방지 (반응형 패턴 D) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TYPE_OPTIONS.map((type) => (
            <div key={type} className="bg-sp-surface border border-sp-border rounded-lg px-3 py-2">
              <p className="text-xs text-sp-muted">{ITEM_TYPE_LABELS[type]}</p>
              <p className="text-sm font-semibold text-sp-text">
                {counts[type]}문항
                <span className="text-sp-muted font-normal"> · {subtotals[type]}점</span>
              </p>
            </div>
          ))}
        </div>

        {/* 난이도 배분 */}
        <div className="bg-sp-card border border-sp-border rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
            <p className="text-sm font-semibold text-sp-text">난이도 배분</p>
            <label className="flex items-center gap-2 text-xs text-sp-muted">
              배점간격
              <input
                type="number"
                min={0.1}
                max={1}
                step={0.1}
                value={step}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setStep(v > 0 ? v : 0.1);
                }}
                className="w-20 bg-sp-surface border border-sp-border rounded-lg px-2 py-1 text-sp-text text-sm focus:border-sp-accent outline-none"
              />
              <span>점</span>
            </label>
          </div>
          <p className="text-xs text-sp-muted mb-3">
            유형(선택형·단답형·서술형)별로 난이도 배점을 채운 뒤 한 번에 추가하세요. 난이도가 한
            단계 오를수록 배점이 오르고, 문항 수는 상·중·하 비율대로 나눕니다. 칸을 직접 고칠 수
            있습니다.
          </p>

          {splitHint && (
            <div className="flex items-center gap-2 flex-wrap text-xs text-sp-muted mb-3">
              <span>
                서답형 목표 {targetWrittenRatio}% → 선택형{' '}
                <b className="text-sp-text">{splitHint.choice}점</b> · 서답형{' '}
                <b className="text-sp-text">{splitHint.written}점</b> 권장
              </span>
              <button
                type="button"
                onClick={() => updateBlock('choice', { autoTotal: splitHint.choice })}
                className="text-sp-accent hover:underline"
              >
                선택형에 적용
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {TYPE_OPTIONS.map((type) => {
              const block = blocks[type];
              const subtotal = fromCents(blockCents(block));
              const cnt = blockCount(block);
              // 비율대로 나눴을 때 실제 문항수 미리보기 (오름차순 [하, 중, 상])
              const [splitLow, splitMid, splitHigh] = countsFromRatio(block.autoCount, [
                block.ratio.low,
                block.ratio.mid,
                block.ratio.high,
              ]);
              return (
                <div key={type} className="rounded-lg border border-sp-border p-3">
                  {/* 블록 헤더 + 소계 */}
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-sp-text">{ITEM_TYPE_LABELS[type]}</p>
                    <p className="text-xs text-sp-muted">
                      소계 <b className="text-sp-text">{subtotal}점</b> · {cnt}문항
                    </p>
                  </div>

                  {/* 자동 채우기 입력 */}
                  <div className="flex flex-wrap items-end gap-2 mb-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-sp-muted">총배점</span>
                      <input
                        type="number"
                        min={0}
                        value={block.autoTotal}
                        onChange={(e) =>
                          updateBlock(type, { autoTotal: Number(e.target.value) || 0 })
                        }
                        className={`w-20 ${inputCls}`}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-sp-muted">문항수</span>
                      <input
                        type="number"
                        min={0}
                        value={block.autoCount}
                        onChange={(e) =>
                          updateBlock(type, {
                            autoCount: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          })
                        }
                        className={`w-16 ${inputCls}`}
                      />
                    </label>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] text-sp-muted">
                        난이도 문항수 비율 (상 : 중 : 하)
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={block.ratio.high}
                          onChange={(e) =>
                            updateRatio(type, 'high', Math.max(0, Number(e.target.value) || 0))
                          }
                          aria-label={`${ITEM_TYPE_LABELS[type]} 상 난이도 비율`}
                          className={`w-12 ${inputCls}`}
                        />
                        <span className="text-sp-muted text-sm">:</span>
                        <input
                          type="number"
                          min={0}
                          value={block.ratio.mid}
                          onChange={(e) =>
                            updateRatio(type, 'mid', Math.max(0, Number(e.target.value) || 0))
                          }
                          aria-label={`${ITEM_TYPE_LABELS[type]} 중 난이도 비율`}
                          className={`w-12 ${inputCls}`}
                        />
                        <span className="text-sp-muted text-sm">:</span>
                        <input
                          type="number"
                          min={0}
                          value={block.ratio.low}
                          onChange={(e) =>
                            updateRatio(type, 'low', Math.max(0, Number(e.target.value) || 0))
                          }
                          aria-label={`${ITEM_TYPE_LABELS[type]} 하 난이도 비율`}
                          className={`w-12 ${inputCls}`}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => autoFill(type)}
                      className="px-3 py-2 rounded-lg border border-sp-accent text-sp-accent text-sm font-medium hover:bg-sp-accent/10 transition-all"
                    >
                      자동 채우기
                    </button>
                  </div>

                  <p className="text-[11px] text-sp-muted mb-2">
                    비율대로 나누면 → 상 <b className="text-sp-text">{splitHigh ?? 0}</b> · 중{' '}
                    <b className="text-sp-text">{splitMid ?? 0}</b> · 하{' '}
                    <b className="text-sp-text">{splitLow ?? 0}</b>문항 (총 {block.autoCount}문항 ·
                    [자동 채우기] 누르면 적용)
                  </p>

                  {/* 난이도별 직접 입력 (상·중·하) */}
                  <div className="grid grid-cols-3 gap-2">
                    {DISPLAY_ORDER.map((i) => {
                      const row = block.rows[i];
                      if (!row) return null;
                      const label = DIFF_LABELS[i];
                      return (
                        <div
                          key={i}
                          className="bg-sp-surface border border-sp-border rounded-lg px-2 py-1.5"
                        >
                          <p className="text-xs font-semibold text-sp-text mb-1">{label}</p>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={row.points}
                              onChange={(e) =>
                                updateRow(type, i, { points: Number(e.target.value) || 0 })
                              }
                              aria-label={`${ITEM_TYPE_LABELS[type]} ${label} 배점`}
                              className="w-full bg-sp-card border border-sp-border rounded-md px-2 py-1 text-sp-text text-sm focus:border-sp-accent outline-none"
                            />
                            <span className="text-[11px] text-sp-muted shrink-0">점 ×</span>
                            <input
                              type="number"
                              min={0}
                              value={row.count}
                              onChange={(e) =>
                                updateRow(type, i, {
                                  count: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                                })
                              }
                              aria-label={`${ITEM_TYPE_LABELS[type]} ${label} 문항수`}
                              className="w-12 bg-sp-card border border-sp-border rounded-md px-2 py-1 text-sp-text text-sm focus:border-sp-accent outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 구성 합계 + 한 번에 추가 */}
          <div className="flex items-center justify-between flex-wrap gap-2 mt-3 pt-3 border-t border-sp-border">
            <p className="text-sm text-sp-muted">
              구성 합계{' '}
              <b className="text-sp-text">
                {composedTotal}점 / {composedCount}문항
              </b>
              <span
                className={`ml-2 font-semibold ${
                  composedRest === 0
                    ? 'text-emerald-400'
                    : composedRest > 0
                      ? 'text-sp-highlight'
                      : 'text-red-400'
                }`}
              >
                {composedRest === 0
                  ? '만점과 딱 맞음'
                  : composedRest > 0
                    ? `만점보다 ${composedRest}점 부족`
                    : `만점보다 ${-composedRest}점 초과`}
              </span>
            </p>
            <button
              type="button"
              onClick={generateAll}
              disabled={composedCount === 0}
              className="px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-semibold hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              문항 추가
            </button>
          </div>
        </div>

        {/* 문항 리스트 */}
        <div className="bg-sp-card border border-sp-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-sp-text">문항 ({items.length})</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => addItem('choice', 0)}
                className="px-3 py-1.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface text-xs font-medium transition-all"
              >
                + 문항 1개
              </button>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-3 py-1.5 rounded-lg border border-sp-border text-sp-muted hover:text-red-400 text-xs font-medium transition-all"
                >
                  모두 지우기
                </button>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-sp-border p-8 text-center">
              <p className="text-sp-muted text-sm">
                아직 문항이 없습니다. 위 난이도 배분으로 한 번에 추가하거나, 문항을 하나씩 더하세요.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 bg-sp-surface border border-sp-border rounded-lg px-3 py-2"
                >
                  <span className="w-8 text-center text-sm font-semibold text-sp-muted shrink-0">
                    {item.number}
                  </span>
                  <select
                    value={item.type}
                    onChange={(e) => updateItem(item.id, { type: e.target.value as ItemType })}
                    className="bg-sp-card border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none"
                  >
                    {TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {ITEM_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  {item.difficulty && (
                    <span className="text-xs text-sp-muted shrink-0 w-5 text-center">
                      {item.difficulty}
                    </span>
                  )}
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={item.points}
                    onChange={(e) => updateItem(item.id, { points: Number(e.target.value) || 0 })}
                    className="w-24 bg-sp-card border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none"
                  />
                  <span className="text-xs text-sp-muted">점</span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`${item.number}번 문항 삭제`}
                    className="ml-auto text-sp-muted hover:text-red-400 transition-colors p-1"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 검증 메시지 */}
        {issues.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-400 mb-1">확인이 필요합니다</p>
            <ul className="list-disc list-inside text-sm text-sp-text/90 space-y-0.5">
              {issues.map((issue, i) => (
                <li key={i}>{issue.message}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
