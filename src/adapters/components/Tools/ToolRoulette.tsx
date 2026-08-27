import { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import { ToolLayout } from './ToolLayout';
import type { KeyboardShortcut } from './types';
import { PresetSelector } from './PresetSelector';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import { filterActiveClasses } from '@domain/rules/teachingClassArchive';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useToolSound } from '@adapters/hooks/useToolSound';
import { secureRandom, pickIndexWithMemory } from '@domain/rules/randomRules';

interface ToolRouletteProps {
  onBack: () => void;
  isFullscreen: boolean;
}

const WHEEL_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#10b981',
  '#e11d48',
  '#0ea5e9',
  '#84cc16',
  '#d946ef',
  '#06b6d4',
  '#facc15',
  '#a855f7',
  '#fb923c',
  '#2dd4bf',
  '#f43f5e',
];

function buildArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngleDeg));
  const y1 = cy + r * Math.sin(toRad(startAngleDeg));
  const x2 = cx + r * Math.cos(toRad(endAngleDeg));
  const y2 = cy + r * Math.sin(toRad(endAngleDeg));
  const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function truncateName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1) + '…';
}

export function ToolRoulette({ onBack, isFullscreen }: ToolRouletteProps) {
  const { track } = useAnalytics();
  const { playProgress, playResult } = useToolSound('roulette');
  useEffect(() => {
    track('tool_use', { tool: 'roulette' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [items, setItems] = useState<string[]>(['항목 1', '항목 2', '항목 3']);
  const [inputMode, setInputMode] = useState<'students' | 'teachingClass' | 'custom'>('custom');
  const [showTcDropdown, setShowTcDropdown] = useState(false);
  const tcClasses = useTeachingClassStore((s) => s.classes);
  // 선택지 열거는 활성 반만 (보관된 반은 새 뽑기 대상 아님). 해석(find)은 전체 유지.
  const selectableTcClasses = useMemo(() => filterActiveClasses(tcClasses), [tcClasses]);
  const tcLoaded = useTeachingClassStore((s) => s.loaded);
  const loadTc = useTeachingClassStore((s) => s.load);
  const tcDropdownRef = useRef<HTMLDivElement>(null);
  const [newItemText, setNewItemText] = useState('');
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  // 인덱스 회피 메모리 (anti-repeat 항상 ON) + 사전 결정된 다음 winner
  const [historyIdx, setHistoryIdx] = useState<number[]>([]);
  const pendingIdxRef = useRef<number | null>(null);

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const wheelGroupRef = useRef<SVGGElement>(null);
  const winnerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (winnerTimerRef.current) clearTimeout(winnerTimerRef.current);
    };
  }, []);

  // Load teaching classes on mount
  useEffect(() => {
    if (!tcLoaded) loadTc();
  }, [tcLoaded, loadTc]);

  // Close TC dropdown on outside click
  useEffect(() => {
    if (!showTcDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (tcDropdownRef.current && !tcDropdownRef.current.contains(e.target as Node)) {
        setShowTcDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTcDropdown]);

  const loadStudents = useCallback(() => {
    const students = useStudentStore.getState().students.filter(isStudentActive);
    const names = students.map((s) => s.name).filter((n) => n.trim() !== '');
    if (names.length >= 2) {
      setItems(names.slice(0, 20));
      setInputMode('students');
      setWinner(null);
      setWinnerIndex(null);
      setHistory([]);
      setHistoryIdx([]);
    }
  }, []);

  const handleTcButtonClick = useCallback(() => {
    if (selectableTcClasses.length === 0) return;
    if (selectableTcClasses.length === 1) {
      // Only one class, load it directly
      const cls = selectableTcClasses[0]!;
      const names = cls.students
        .filter(isStudentActive)
        .map((s) => (s.name?.trim() ? s.name : `${s.number}번`))
        .filter((n) => n.trim() !== '');
      if (names.length >= 2) {
        setItems(names.slice(0, 20));
        setInputMode('teachingClass');
        setWinner(null);
        setWinnerIndex(null);
        setHistory([]);
      }
    } else {
      setShowTcDropdown((v) => !v);
    }
  }, [selectableTcClasses]);

  const loadTeachingClass = useCallback(
    (classId: string) => {
      const cls = tcClasses.find((c) => c.id === classId);
      if (!cls) return;
      const names = cls.students
        .filter(isStudentActive)
        .map((s) => (s.name?.trim() ? s.name : `${s.number}번`))
        .filter((n) => n.trim() !== '');
      if (names.length >= 2) {
        setItems(names.slice(0, 20));
        setInputMode('teachingClass');
        setWinner(null);
        setWinnerIndex(null);
        setHistory([]);
      }
      setShowTcDropdown(false);
    },
    [tcClasses],
  );

  const switchToCustom = useCallback(() => {
    setInputMode('custom');
  }, []);

  const addItem = useCallback(() => {
    const text = newItemText.trim();
    if (!text) return;
    if (items.length >= 20) return;
    setItems((prev) => [...prev, text]);
    setNewItemText('');
  }, [newItemText, items.length]);

  const removeItem = useCallback(
    (index: number) => {
      setItems((prev) => prev.filter((_, i) => i !== index));
      if (editingIndex === index) setEditingIndex(null);
    },
    [editingIndex],
  );

  const startEdit = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setEditText(items[index] ?? '');
    },
    [items],
  );

  const saveEdit = useCallback(() => {
    if (editingIndex === null) return;
    const trimmed = editText.trim();
    if (trimmed) {
      setItems((prev) => prev.map((item, i) => (i === editingIndex ? trimmed : item)));
    }
    setEditingIndex(null);
  }, [editingIndex, editText]);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') addItem();
    },
    [addItem],
  );

  const spin = useCallback(() => {
    if (isSpinning || items.length < 2) return;

    // ── 1. 인덱스 먼저 결정 (anti-repeat 항상 ON) ──
    const targetIdx = pickIndexWithMemory(items.length, { history: historyIdx });
    pendingIdxRef.current = targetIdx;

    // ── 2. 섹션 중앙각 + jitter 로 finalAngle 산출 ──
    // 섹션 i의 영역: [-90 + i*sectionAngle, -90 + (i+1)*sectionAngle] (SVG 좌표)
    // 회전 θ 적용 후 포인터(top, -90도) 아래에 섹션 i의 중앙이 오려면:
    //   θ ≡ -(i + 0.5) * sectionAngle  (mod 360)
    const sectionAngle = 360 / items.length;
    const baseFinal = (((-(targetIdx + 0.5) * sectionAngle) % 360) + 360) % 360;
    // 섹션 내부에서 약간 흔들림 (인접 섹션 경계는 안 침범)
    const jitterMax = sectionAngle * 0.3; // 섹션 폭의 ±30%
    const jitter = (secureRandom() - 0.5) * 2 * jitterMax;
    const finalAngle = (((baseFinal + jitter) % 360) + 360) % 360;

    // ── 3. 7~11 바퀴 + delta 로 newRotation 계산 ──
    const fullSpins = (7 + Math.floor(secureRandom() * 5)) * 360;
    const currentNormalized = ((rotation % 360) + 360) % 360;
    const delta = (((finalAngle - currentNormalized) % 360) + 360) % 360;
    const newRotation = rotation + fullSpins + delta;

    setRotation(newRotation);
    setIsSpinning(true);
    setWinner(null);
    setWinnerIndex(null);
    playProgress();
  }, [isSpinning, items.length, rotation, playProgress, historyIdx]);

  const handleTransitionEnd = useCallback(() => {
    if (!isSpinning) return;
    setIsSpinning(false);

    // 사전 결정된 인덱스를 그대로 사용 (재계산 안 함 → anti-repeat 양립)
    const idx = pendingIdxRef.current ?? 0;
    const safeIdx = items.length > 0 ? ((idx % items.length) + items.length) % items.length : 0;
    const winnerName = items[safeIdx] ?? items[0] ?? '';

    setWinnerIndex(safeIdx);
    setWinner(winnerName);
    setHistory((prev) => [winnerName, ...prev].slice(0, 10));
    setHistoryIdx((prev) => [safeIdx, ...prev].slice(0, 10));
    playResult();

    if (winnerTimerRef.current) clearTimeout(winnerTimerRef.current);
    winnerTimerRef.current = setTimeout(() => {
      setWinner(null);
    }, 2000);
  }, [isSpinning, items, playResult]);

  const handleLoadPreset = useCallback((presetItems: readonly string[]) => {
    setItems([...presetItems].slice(0, 20));
    setInputMode('custom');
    setWinner(null);
    setWinnerIndex(null);
    setHistory([]);
  }, []);

  const rouletteShortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      { key: ' ', label: '돌리기', description: '룰렛 돌리기', handler: spin },
      { key: 'Enter', label: '돌리기', description: '룰렛 돌리기', handler: spin },
    ],
    [spin],
  );

  const radius = isFullscreen ? 220 : 160;
  const cx = radius + 10;
  const cy = radius + 10;
  const svgSize = (radius + 10) * 2;
  const sectionAngle = items.length > 0 ? 360 / items.length : 360;

  return (
    <ToolLayout
      title="룰렛"
      emoji="🎯"
      onBack={onBack}
      isFullscreen={isFullscreen}
      shortcuts={rouletteShortcuts}
    >
      <div className="w-full h-full flex flex-col items-center gap-4 overflow-auto py-2">
        {/* Main area: input + wheel */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6 w-full max-w-5xl px-4">
          {/* Data Input Panel */}
          <div className="w-full lg:w-72 flex-shrink-0 bg-sp-card border border-sp-border rounded-xl p-4 flex flex-col gap-3">
            {/* Preset selector */}
            <PresetSelector type="roulette" currentItems={items} onLoad={handleLoadPreset} />

            {/* Mode buttons */}
            <div className="flex gap-1.5">
              <button
                onClick={loadStudents}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                  inputMode === 'students'
                    ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                    : 'bg-sp-surface border-sp-border text-sp-text hover:border-sp-accent hover:text-sp-accent'
                }`}
                title="우리 반 학생 불러오기"
              >
                <span>👩‍🎓</span>
                <span>우리 반</span>
              </button>
              <div className="relative flex-1" ref={tcDropdownRef}>
                <button
                  onClick={handleTcButtonClick}
                  disabled={selectableTcClasses.length === 0}
                  className={`w-full flex items-center justify-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                    inputMode === 'teachingClass'
                      ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                      : 'bg-sp-surface border-sp-border text-sp-text hover:border-sp-accent hover:text-sp-accent'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={
                    selectableTcClasses.length === 0
                      ? '수업관리에서 먼저 반을 등록하세요'
                      : '수업반 학생 불러오기'
                  }
                >
                  <span>📚</span>
                  <span>수업반</span>
                </button>
                {showTcDropdown && (
                  <div
                    data-sp-floating
                    className="absolute top-full left-0 right-0 mt-1 bg-sp-card border border-sp-border rounded-xl shadow-2xl z-50 py-1 max-h-48 overflow-y-auto"
                  >
                    {selectableTcClasses.map((tc) => {
                      const activeCount = tc.students.filter(isStudentActive).length;
                      return (
                        <button
                          key={tc.id}
                          onClick={() => loadTeachingClass(tc.id)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-sp-text/5 text-left transition-colors"
                        >
                          <span className="text-sm text-sp-text truncate">
                            {tc.name}
                            {tc.subject && <span className="text-sp-muted"> · {tc.subject}</span>}
                          </span>
                          <span className="text-caption text-sp-muted ml-2 shrink-0">
                            {activeCount}명
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={switchToCustom}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 rounded-lg border text-xs font-medium transition-all ${
                  inputMode === 'custom'
                    ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                    : 'bg-sp-surface border-sp-border text-sp-text hover:border-sp-accent hover:text-sp-accent'
                }`}
              >
                <span>✏️</span>
                <span>직접 입력</span>
              </button>
            </div>

            {/* Custom input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="항목 입력..."
                maxLength={10}
                disabled={items.length >= 20}
                className="flex-1 px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-sp-text placeholder-sp-muted text-sm focus:outline-none focus:border-sp-accent transition-colors disabled:opacity-40"
              />
              <button
                onClick={addItem}
                disabled={!newItemText.trim() || items.length >= 20}
                className="px-3 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-blue-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                추가
              </button>
            </div>

            {/* Item count info */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-sp-muted">{items.length} / 20개</span>
              {items.length < 2 && (
                <span className="text-xs text-red-400">최소 2개 항목이 필요합니다</span>
              )}
            </div>

            {/* Items list */}
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sp-surface border border-sp-border group"
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: WHEEL_COLORS[i % WHEEL_COLORS.length] }}
                  />
                  {editingIndex === i ? (
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      onBlur={saveEdit}
                      autoFocus
                      maxLength={10}
                      className="flex-1 text-sm text-sp-text bg-sp-card border border-sp-accent rounded px-1.5 py-0.5 focus:outline-none"
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm text-sp-text truncate cursor-pointer hover:text-sp-accent transition-colors"
                      onClick={() => startEdit(i)}
                      title="클릭하여 수정"
                    >
                      {item}
                    </span>
                  )}
                  <button
                    onClick={() => removeItem(i)}
                    className="text-sp-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                    title="삭제"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Wheel area */}
          <div className="flex-1 flex flex-col items-center gap-4">
            {/* Wheel + pointer */}
            <div className="relative flex items-center justify-center">
              {/* Pointer arrow at top */}
              <div
                className="absolute z-10 flex flex-col items-center"
                style={{ top: -4, left: '50%', transform: 'translateX(-50%)' }}
              >
                <svg width="28" height="36" viewBox="0 0 28 36" className="drop-shadow-lg">
                  <polygon
                    points="14,36 0,4 28,4"
                    fill="#f8fafc"
                    stroke="#1e293b"
                    strokeWidth="2"
                  />
                  <polygon points="14,30 4,8 24,8" fill="#f59e0b" />
                </svg>
              </div>

              {/* SVG Wheel */}
              <svg
                width={svgSize}
                height={svgSize}
                viewBox={`0 0 ${svgSize} ${svgSize}`}
                className="drop-shadow-2xl"
              >
                {/* Outer ring shadow */}
                <circle cx={cx} cy={cy} r={radius + 6} fill="#0a0e17" opacity={0.6} />
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius + 4}
                  fill="none"
                  stroke="#2a3548"
                  strokeWidth="2"
                />

                {/* Spinning group */}
                <g
                  ref={wheelGroupRef}
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: `${cx}px ${cy}px`,
                    // transition 을 항상 활성화 — 'none' ↔ '3.5s' 토글 시 Chromium 이
                    // transform 변경을 transition 활성화 전에 즉시 반영해 두 번째 spin 부터
                    // 보간이 사라지는 race condition 회피. mount 시 rotation=0 무변화라 부작용 없음.
                    transition: 'transform 3.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)',
                  }}
                  onTransitionEnd={handleTransitionEnd}
                >
                  {items.map((item, i) => {
                    // Start from top (-90 deg) going clockwise
                    const startAngle = -90 + i * sectionAngle;
                    const endAngle = startAngle + sectionAngle;
                    const midAngle = (startAngle + endAngle) / 2;
                    const midRad = (midAngle * Math.PI) / 180;
                    const textR = radius * 0.65;
                    const tx = cx + textR * Math.cos(midRad);
                    const ty = cy + textR * Math.sin(midRad);
                    const color = WHEEL_COLORS[i % WHEEL_COLORS.length] ?? '#3b82f6';
                    const isWinner = winnerIndex === i;
                    const maxChars = items.length <= 8 ? 5 : 4;

                    return (
                      <g key={i}>
                        <path
                          d={buildArcPath(cx, cy, radius, startAngle, endAngle)}
                          fill={isWinner ? lightenColor(color) : color}
                          stroke="#0a0e17"
                          strokeWidth="1.5"
                          style={{ transition: 'fill 0.3s ease' }}
                        />
                        <text
                          x={tx}
                          y={ty}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          transform={`rotate(${midAngle + 90}, ${tx}, ${ty})`}
                          fill="white"
                          fontSize={items.length <= 6 ? 14 : items.length <= 12 ? 12 : 10}
                          fontWeight="bold"
                          fontFamily="inherit"
                          style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                        >
                          {truncateName(item, maxChars)}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Center cap */}
                <circle cx={cx} cy={cy} r={18} fill="#131a2b" stroke="#2a3548" strokeWidth="2" />
                <circle cx={cx} cy={cy} r={8} fill="#3b82f6" />
              </svg>

              {/* Winner popup */}
              {winner !== null && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ animation: 'winnerPop 0.3s ease-out' }}
                >
                  <div className="bg-sp-surface/95 border-2 border-sp-highlight rounded-2xl px-6 py-4 shadow-2xl text-center backdrop-blur-sm">
                    <p className="text-sp-muted text-sm mb-1">당첨!</p>
                    <p className="text-sp-highlight text-2xl font-bold">{winner}</p>
                    <p className="text-2xl mt-1">🎉</p>
                  </div>
                </div>
              )}
            </div>

            {/* Spin button */}
            <button
              onClick={spin}
              disabled={isSpinning || items.length < 2}
              className="px-10 py-4 rounded-2xl bg-sp-accent text-sp-accent-fg text-xl font-bold shadow-sp-md hover:bg-sp-accent/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transform"
            >
              {isSpinning ? '돌아가는 중...' : '🎯 돌리기!'}
            </button>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="w-full max-w-5xl px-4">
            <div className="bg-sp-card border border-sp-border rounded-xl p-3">
              <p className="text-xs text-sp-muted mb-2 font-medium">최근 결과</p>
              <div className="flex flex-wrap gap-2">
                {history.map((h, i) => (
                  <span
                    key={i}
                    className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                      i === 0
                        ? 'bg-sp-highlight/20 border-sp-highlight text-sp-highlight'
                        : 'bg-sp-surface border-sp-border text-sp-muted'
                    }`}
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes winnerPop {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </ToolLayout>
  );
}

function lightenColor(hex: string): string {
  // Parse hex and lighten by mixing with white
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, r + 80);
  const lg = Math.min(255, g + 80);
  const lb = Math.min(255, b + 80);
  return `rgb(${lr}, ${lg}, ${lb})`;
}
