import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import type { KeyboardShortcut } from './types';
import { PresetSelector } from './PresetSelector';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { shuffleArray, pickRandom } from '@domain/rules/randomRules';

interface ToolRandomProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type PickMode = 'single' | 'multiple' | 'order';
type DataSource = 'students' | 'range' | 'custom';

interface RangeConfig {
  start: number;
  end: number;
}

export function ToolRandom({ onBack, isFullscreen }: ToolRandomProps) {
  // --- Mode & Data Source ---
  const [mode, setMode] = useState<PickMode>('single');
  const [dataSource, setDataSource] = useState<DataSource>('students');

  // --- Data Source State ---
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [rangeConfig, setRangeConfig] = useState<RangeConfig>({ start: 1, end: 35 });
  const [customText, setCustomText] = useState('');

  // --- Seating Store ---
  const students = useStudentStore((s) => s.students);
  const loaded = useStudentStore((s) => s.loaded);
  const loadStudents = useStudentStore((s) => s.load);

  // --- Pick State ---
  const [pickedItems, setPickedItems] = useState<string[]>([]);
  const [excludePicked, setExcludePicked] = useState(true);
  const [multipleCount, setMultipleCount] = useState(3);

  // --- Animation State ---
  const [isAnimating, setIsAnimating] = useState(false);
  const [slotDisplay, setSlotDisplay] = useState<string>('');
  const [result, setResult] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);

  // --- Refs ---
  const animationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef(50);
  const stepCountRef = useRef(0);

  // Load student store on mount
  useEffect(() => {
    if (!loaded) {
      loadStudents();
    }
  }, [loaded, loadStudents]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
    };
  }, []);

  // Build the pool of items based on data source
  const getPool = useCallback((): string[] => {
    switch (dataSource) {
      case 'students': {
        const activeStudents = students.filter((s) => !s.isVacant && !excludedIds.has(s.id));
        return activeStudents.map((s) => s.name || `${s.studentNumber ?? 0}번`);
      }
      case 'range': {
        const items: string[] = [];
        const start = Math.min(rangeConfig.start, rangeConfig.end);
        const end = Math.max(rangeConfig.start, rangeConfig.end);
        for (let i = start; i <= end; i++) {
          items.push(`${i}번`);
        }
        return items;
      }
      case 'custom': {
        return customText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
      }
    }
  }, [dataSource, students, excludedIds, rangeConfig, customText]);

  // Reset state when mode or data source changes
  useEffect(() => {
    setResult([]);
    setShowResult(false);
    setPickedItems([]);
    setSlotDisplay('');
    setRevealedCount(0);
  }, [mode, dataSource]);

  // --- Slot machine animation for single pick ---
  const runSlotAnimation = useCallback((pool: string[], onComplete: (picked: string) => void) => {
    if (pool.length === 0) return;

    setIsAnimating(true);
    setShowResult(false);
    speedRef.current = 50;
    stepCountRef.current = 0;

    const totalSteps = 30;

    const tick = () => {
      stepCountRef.current += 1;
      const idx = Math.floor(Math.random() * pool.length);
      setSlotDisplay(pool[idx] ?? '');

      if (stepCountRef.current >= totalSteps) {
        // Final pick
        if (animationRef.current) {
          clearInterval(animationRef.current);
          animationRef.current = null;
        }
        const [picked] = pickRandom(pool, 1);
        if (picked !== undefined) {
          setSlotDisplay(picked);
          onComplete(picked);
        }
        setIsAnimating(false);
        return;
      }

      // Gradually slow down
      if (stepCountRef.current > totalSteps * 0.6) {
        speedRef.current = Math.min(300, speedRef.current + 25);
      } else if (stepCountRef.current > totalSteps * 0.3) {
        speedRef.current = Math.min(300, speedRef.current + 10);
      }

      // Restart with new speed
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
      animationRef.current = setInterval(tick, speedRef.current);
    };

    animationRef.current = setInterval(tick, speedRef.current);
  }, []);

  // --- Handle pick ---
  const handlePick = useCallback(() => {
    if (isAnimating) return;

    const pool = excludePicked
      ? getPool().filter((item) => !pickedItems.includes(item))
      : getPool();

    if (pool.length === 0) return;

    switch (mode) {
      case 'single': {
        runSlotAnimation(pool, (picked) => {
          setResult([picked]);
          setShowResult(true);
          setPickedItems((prev) => [...prev, picked]);
        });
        break;
      }
      case 'multiple': {
        const count = Math.min(multipleCount, pool.length);
        setIsAnimating(true);
        setShowResult(false);

        // Brief suspense animation
        speedRef.current = 50;
        stepCountRef.current = 0;
        const totalSteps = 20;

        const tick = () => {
          stepCountRef.current += 1;
          const randomItems = pickRandom(pool, count);
          setSlotDisplay(randomItems.join(', '));

          if (stepCountRef.current >= totalSteps) {
            if (animationRef.current) {
              clearInterval(animationRef.current);
              animationRef.current = null;
            }
            const picked = pickRandom(pool, count);
            setResult(picked);
            setSlotDisplay('');
            setShowResult(true);
            setIsAnimating(false);
            setPickedItems((prev) => [...prev, ...picked]);
            return;
          }

          if (stepCountRef.current > totalSteps * 0.5) {
            speedRef.current = Math.min(300, speedRef.current + 20);
          }

          if (animationRef.current) {
            clearInterval(animationRef.current);
          }
          animationRef.current = setInterval(tick, speedRef.current);
        };

        animationRef.current = setInterval(tick, speedRef.current);
        break;
      }
      case 'order': {
        setIsAnimating(true);
        setShowResult(false);
        setRevealedCount(0);

        // Brief suspense
        speedRef.current = 50;
        stepCountRef.current = 0;
        const totalSteps = 15;

        const tick = () => {
          stepCountRef.current += 1;
          const randomItems = shuffleArray(pool);
          setSlotDisplay(randomItems.slice(0, 3).join(', ') + '...');

          if (stepCountRef.current >= totalSteps) {
            if (animationRef.current) {
              clearInterval(animationRef.current);
              animationRef.current = null;
            }
            const shuffled = shuffleArray(pool);
            setResult(shuffled);
            setSlotDisplay('');
            setShowResult(true);
            setIsAnimating(false);

            // Stagger reveal
            let revealIdx = 0;
            const revealInterval = setInterval(() => {
              revealIdx += 1;
              setRevealedCount(revealIdx);
              if (revealIdx >= shuffled.length) {
                clearInterval(revealInterval);
              }
            }, 150);
            return;
          }

          if (stepCountRef.current > totalSteps * 0.5) {
            speedRef.current = Math.min(250, speedRef.current + 15);
          }

          if (animationRef.current) {
            clearInterval(animationRef.current);
          }
          animationRef.current = setInterval(tick, speedRef.current);
        };

        animationRef.current = setInterval(tick, speedRef.current);
        break;
      }
    }
  }, [isAnimating, mode, excludePicked, getPool, pickedItems, multipleCount, runSlotAnimation]);

  // --- Reset ---
  const handleReset = useCallback(() => {
    if (animationRef.current) {
      clearInterval(animationRef.current);
      animationRef.current = null;
    }
    setPickedItems([]);
    setResult([]);
    setShowResult(false);
    setSlotDisplay('');
    setIsAnimating(false);
    setRevealedCount(0);
  }, []);

  // --- Toggle student exclusion ---
  const toggleStudentExclusion = useCallback((studentId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }, []);

  // --- Available count ---
  const availablePool = excludePicked
    ? getPool().filter((item) => !pickedItems.includes(item))
    : getPool();
  const poolTotal = getPool().length;
  const canPick = availablePool.length > 0 && !isAnimating;

  // --- Size classes based on fullscreen ---
  const resultTextSize = isFullscreen ? 'text-7xl' : 'text-6xl';
  const subTextSize = isFullscreen ? 'text-2xl' : 'text-lg';

  // Custom items for PresetSelector
  const customItems = useMemo(() =>
    customText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0),
    [customText],
  );

  const handleLoadPreset = useCallback((items: readonly string[]) => {
    setCustomText(items.join('\n'));
    setDataSource('custom');
    setPickedItems([]);
    setResult([]);
    setShowResult(false);
    setSlotDisplay('');
    setRevealedCount(0);
  }, []);

  const randomShortcuts = useMemo<KeyboardShortcut[]>(() => [
    { key: ' ', label: '뽑기', description: '랜덤 뽑기 실행', handler: handlePick },
    { key: 'Enter', label: '뽑기', description: '랜덤 뽑기 실행', handler: handlePick },
    { key: 'r', label: '초기화', description: '전체 초기화', handler: handleReset },
  ], [handlePick, handleReset]);

  return (
    <ToolLayout title="랜덤 뽑기" emoji="🎲" onBack={onBack} isFullscreen={isFullscreen} shortcuts={randomShortcuts}>
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        {/* Mode Tabs */}
        <div className="flex gap-2 justify-center">
          {([
            { key: 'single' as const, label: '🎯 1명 뽑기' },
            { key: 'multiple' as const, label: '👥 N명 뽑기' },
            { key: 'order' as const, label: '📋 순서 정하기' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMode(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === tab.key
                  ? 'bg-sp-accent text-white shadow-lg shadow-blue-500/20'
                  : 'bg-sp-card text-sp-muted hover:text-white hover:bg-sp-card/80 border border-sp-border'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Data Source Selection */}
        <div className="bg-sp-card rounded-xl border border-sp-border p-4">
          <div className="flex gap-2 mb-4 justify-center">
            {([
              { key: 'students' as const, label: '👩\u200D🎓 우리 반 학생' },
              { key: 'range' as const, label: '🔢 번호 범위' },
              { key: 'custom' as const, label: '✏️ 직접 입력' },
            ]).map((src) => (
              <button
                key={src.key}
                onClick={() => setDataSource(src.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  dataSource === src.key
                    ? 'bg-sp-accent/20 text-sp-accent border border-sp-accent/40'
                    : 'bg-sp-surface text-sp-muted hover:text-white border border-sp-border'
                }`}
              >
                {src.label}
              </button>
            ))}
          </div>

          {/* Data Source Content */}
          {dataSource === 'students' && (
            <div>
              {students.length === 0 ? (
                <div className="text-center py-4 text-sp-muted text-sm">
                  먼저 학급 자리 배치에서 학생을 등록하세요
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {students
                    .filter((s) => !s.isVacant)
                    .map((student) => {
                      const isExcluded = excludedIds.has(student.id);
                      return (
                        <button
                          key={student.id}
                          onClick={() => toggleStudentExclusion(student.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            isExcluded
                              ? 'bg-sp-surface text-sp-muted/50 line-through border border-sp-border/50'
                              : 'bg-sp-accent/10 text-sp-accent border border-sp-accent/30 hover:bg-sp-accent/20'
                          }`}
                        >
                          {student.name || `${student.studentNumber ?? 0}번`}
                        </button>
                      );
                    })}
                </div>
              )}
              {students.length > 0 && (
                <div className="mt-2 text-xs text-sp-muted text-center">
                  클릭하여 제외/포함 ({students.filter((s) => !s.isVacant).length - excludedIds.size}명 참여)
                </div>
              )}
            </div>
          )}

          {dataSource === 'range' && (
            <div className="flex items-center gap-3 justify-center">
              <div className="flex items-center gap-2">
                <label className="text-sp-muted text-sm">시작</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={rangeConfig.start}
                  onChange={(e) => setRangeConfig((prev) => ({ ...prev, start: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-20 px-3 py-1.5 rounded-lg bg-sp-surface border border-sp-border text-white text-sm text-center focus:outline-none focus:border-sp-accent"
                />
              </div>
              <span className="text-sp-muted text-lg">~</span>
              <div className="flex items-center gap-2">
                <label className="text-sp-muted text-sm">끝</label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={rangeConfig.end}
                  onChange={(e) => setRangeConfig((prev) => ({ ...prev, end: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-20 px-3 py-1.5 rounded-lg bg-sp-surface border border-sp-border text-white text-sm text-center focus:outline-none focus:border-sp-accent"
                />
              </div>
              <span className="text-sp-muted text-xs ml-2">
                ({Math.abs(rangeConfig.end - rangeConfig.start) + 1}개)
              </span>
            </div>
          )}

          {dataSource === 'custom' && (
            <div>
              <div className="mb-3">
                <PresetSelector type="random" currentItems={customItems} onLoad={handleLoadPreset} />
              </div>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={'이름을 한 줄에 하나씩 입력하세요\n예:\n김민수\n박영희\n이지은'}
                className="w-full h-28 px-3 py-2 rounded-lg bg-sp-surface border border-sp-border text-white text-sm placeholder-sp-muted/50 resize-none focus:outline-none focus:border-sp-accent"
              />
              <div className="mt-1 text-xs text-sp-muted text-center">
                {customText.split('\n').filter((l) => l.trim().length > 0).length}개 항목
              </div>
            </div>
          )}
        </div>

        {/* N명 뽑기 count input */}
        {mode === 'multiple' && (
          <div className="flex items-center justify-center gap-3">
            <span className="text-sp-muted text-sm">뽑을 인원</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMultipleCount((prev) => Math.max(1, prev - 1))}
                className="w-8 h-8 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-sp-surface transition-all flex items-center justify-center"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={poolTotal}
                value={multipleCount}
                onChange={(e) => setMultipleCount(Math.max(1, Math.min(poolTotal, parseInt(e.target.value) || 1)))}
                className="w-14 px-2 py-1 rounded-lg bg-sp-surface border border-sp-border text-white text-sm text-center focus:outline-none focus:border-sp-accent"
              />
              <button
                onClick={() => setMultipleCount((prev) => Math.min(poolTotal, prev + 1))}
                className="w-8 h-8 rounded-lg bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-sp-surface transition-all flex items-center justify-center"
              >
                +
              </button>
            </div>
            <span className="text-sp-muted text-sm">명</span>
          </div>
        )}

        {/* Result Display Area */}
        <div className="bg-sp-card rounded-xl border border-sp-border p-8 min-h-[200px] flex flex-col items-center justify-center relative">
          {/* Slot animation display */}
          {isAnimating && !showResult && (
            <div className={`${resultTextSize} font-bold text-white animate-pulse text-center`}>
              {slotDisplay || '...'}
            </div>
          )}

          {/* No items state */}
          {!isAnimating && !showResult && result.length === 0 && (
            <div className="text-center">
              <p className="text-5xl mb-3">🎲</p>
              <p className="text-sp-muted text-sm">
                {poolTotal === 0
                  ? '뽑기 대상을 설정해주세요'
                  : mode === 'single'
                    ? '버튼을 눌러 1명을 뽑아보세요!'
                    : mode === 'multiple'
                      ? `버튼을 눌러 ${multipleCount}명을 뽑아보세요!`
                      : '버튼을 눌러 순서를 정해보세요!'}
              </p>
            </div>
          )}

          {/* Single pick result */}
          {showResult && mode === 'single' && result.length > 0 && (
            <div className="text-center">
              <div
                className={`${resultTextSize} font-bold text-white mb-2 px-8 py-4 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)] ring-2 ring-amber-400 transition-all`}
              >
                {result[0]}
              </div>
              <p className={`${subTextSize} text-amber-400 font-medium mt-3`}>
                당첨!
              </p>
            </div>
          )}

          {/* Multiple pick result */}
          {showResult && mode === 'multiple' && result.length > 0 && (
            <div className="flex flex-wrap gap-3 justify-center">
              {result.map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
                  className="flex flex-col items-center px-5 py-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.5)] ring-2 ring-amber-400"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <span className="text-amber-400 text-xs font-bold mb-1">#{idx + 1}</span>
                  <span className={`${isFullscreen ? 'text-4xl' : 'text-2xl'} font-bold text-white`}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Order result */}
          {showResult && mode === 'order' && result.length > 0 && (
            <div className="w-full max-h-[300px] overflow-y-auto pr-2">
              <div className="grid gap-1.5">
                {result.map((item, idx) => (
                  <div
                    key={`${item}-${idx}`}
                    className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300 ${
                      idx < revealedCount
                        ? 'bg-sp-surface border border-sp-border opacity-100 translate-x-0'
                        : 'opacity-0 translate-x-4'
                    }`}
                  >
                    <span className={`text-sm font-bold min-w-[2rem] text-center rounded-md px-1.5 py-0.5 ${
                      idx === 0
                        ? 'bg-amber-500/20 text-amber-400'
                        : idx === 1
                          ? 'bg-gray-400/20 text-gray-300'
                          : idx === 2
                            ? 'bg-orange-500/20 text-orange-400'
                            : 'bg-sp-card text-sp-muted'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className={`font-medium ${
                      idx === 0 ? 'text-amber-400 text-lg' : 'text-white'
                    }`}>
                      {item}
                    </span>
                    {idx === 0 && <span className="text-amber-400 ml-auto">👑</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <button
            onClick={handlePick}
            disabled={!canPick}
            className={`px-8 py-3 rounded-xl font-bold text-lg transition-all ${
              canPick
                ? 'bg-sp-accent text-white hover:bg-blue-500 shadow-lg shadow-blue-500/30 active:scale-95'
                : 'bg-sp-card text-sp-muted border border-sp-border cursor-not-allowed'
            }`}
          >
            {isAnimating
              ? '🎰 뽑는 중...'
              : mode === 'order'
                ? '🔀 순서 섞기!'
                : '🎲 뽑기!'}
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-3 rounded-xl text-sp-muted hover:text-white hover:bg-sp-card border border-sp-border transition-all text-sm"
          >
            전체 초기화
          </button>
        </div>

        {/* Options & Picked history (only for single / multiple modes) */}
        {(mode === 'single' || mode === 'multiple') && (
          <div className="bg-sp-card rounded-xl border border-sp-border p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <label className="text-sp-muted text-sm">이미 뽑힌 사람 제외</label>
                <button
                  onClick={() => setExcludePicked((prev) => !prev)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    excludePicked ? 'bg-sp-accent' : 'bg-sp-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      excludePicked ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <span className="text-xs text-sp-muted">
                {availablePool.length}/{poolTotal}명 남음
              </span>
            </div>
            {pickedItems.length > 0 && (
              <div>
                <p className="text-xs text-sp-muted mb-2">뽑힌 순서:</p>
                <div className="flex flex-wrap gap-1.5">
                  {pickedItems.map((item, idx) => (
                    <span
                      key={`picked-${item}-${idx}`}
                      className="px-2 py-0.5 rounded-md bg-sp-surface text-sp-muted text-xs border border-sp-border"
                    >
                      {idx + 1}. {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
