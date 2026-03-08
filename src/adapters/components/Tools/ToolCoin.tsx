import { useState, useCallback, useEffect, useRef } from 'react';
import { ToolLayout } from './ToolLayout';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

interface ToolCoinProps {
  onBack: () => void;
  isFullscreen: boolean;
}

interface CoinStats {
  heads: number;
  tails: number;
}

type CoinResult = 'heads' | 'tails' | null;

const BASE_SPINS = 6; // number of full 360-degree rotations before landing

export function ToolCoin({ onBack, isFullscreen }: ToolCoinProps) {
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'coin' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [rotation, setRotation] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<CoinResult>(null);
  const [showResult, setShowResult] = useState(false);
  const [stats, setStats] = useState<CoinStats>({ heads: 0, tails: 0 });

  // Track cumulative rotation so we always spin forward
  const cumulativeRotationRef = useRef(0);
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFlip = useCallback(() => {
    if (isFlipping) return;

    // Determine result
    const isHeads = Math.random() < 0.5;
    const nextResult: CoinResult = isHeads ? 'heads' : 'tails';

    // Calculate new rotation
    // BASE_SPINS full rotations for the spin animation
    const fullSpins = BASE_SPINS * 360;
    // Heads: ends at even multiple of 360 (front face visible)
    // Tails: ends at 180 degrees off from front (back face visible)
    const landingAngle = isHeads ? 0 : 180;
    // Make sure we always rotate forward from current position
    // We need the landing angle relative to the current cumulative rotation
    const currentNormalized = ((cumulativeRotationRef.current % 360) + 360) % 360;
    // Calculate how much extra rotation to reach the desired landing angle going forward
    let extraToLanding = landingAngle - currentNormalized;
    if (extraToLanding <= 0) {
      extraToLanding += 360;
    }
    const newRotation = cumulativeRotationRef.current + fullSpins + extraToLanding;

    cumulativeRotationRef.current = newRotation;

    setIsFlipping(true);
    setShowResult(false);
    setResult(null);
    setRotation(newRotation);

    // Animation duration matches CSS transition (1500ms)
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current);
    }
    flipTimerRef.current = setTimeout(() => {
      setIsFlipping(false);
      setResult(nextResult);
      setShowResult(true);
      setStats((prev) => ({
        heads: prev.heads + (nextResult === 'heads' ? 1 : 0),
        tails: prev.tails + (nextResult === 'tails' ? 1 : 0),
      }));
    }, 1550);
  }, [isFlipping]);

  const handleResetStats = useCallback(() => {
    setStats({ heads: 0, tails: 0 });
  }, []);

  const total = stats.heads + stats.tails;
  const headsPercent = total > 0 ? Math.round((stats.heads / total) * 100) : 50;
  const tailsPercent = total > 0 ? Math.round((stats.tails / total) * 100) : 50;

  return (
    <ToolLayout title="동전 던지기" emoji="🪙" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-8 py-4">

        {/* Coin 3D container */}
        <div className="flex flex-col items-center gap-6">
          <div style={{ perspective: '1000px' }}>
            <div
              className="relative w-40 h-40 md:w-56 md:h-56"
              style={{
                transformStyle: 'preserve-3d',
                transition: isFlipping
                  ? 'transform 1.5s cubic-bezier(0.33, 0, 0.1, 1)'
                  : 'transform 0.1s ease-out',
                transform: `rotateY(${rotation}deg)`,
              }}
            >
              {/* Front face — gold (앞) */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  background: 'linear-gradient(135deg, #fde68a 0%, #fbbf24 35%, #f59e0b 65%, #d97706 100%)',
                  border: '4px solid #b45309',
                  boxShadow:
                    'inset 0 4px 8px rgba(255,255,255,0.4), inset 0 -4px 8px rgba(0,0,0,0.2), 0 8px 24px rgba(245,158,11,0.5)',
                }}
              >
                <div className="flex flex-col items-center gap-1 select-none">
                  <span
                    className="text-5xl md:text-6xl font-bold"
                    style={{ color: '#78350f', textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
                  >
                    앞
                  </span>
                  <span className="text-2xl md:text-3xl" style={{ color: '#92400e' }}>
                    ⊙
                  </span>
                </div>
              </div>

              {/* Back face — silver (뒤) */}
              <div
                className="absolute inset-0 rounded-full flex items-center justify-center"
                style={{
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 35%, #94a3b8 65%, #64748b 100%)',
                  border: '4px solid #475569',
                  boxShadow:
                    'inset 0 4px 8px rgba(255,255,255,0.5), inset 0 -4px 8px rgba(0,0,0,0.15), 0 8px 24px rgba(100,116,139,0.4)',
                }}
              >
                <div className="flex flex-col items-center gap-1 select-none">
                  <span
                    className="text-5xl md:text-6xl font-bold"
                    style={{ color: '#1e293b', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
                  >
                    뒤
                  </span>
                  <span className="text-2xl md:text-3xl" style={{ color: '#334155' }}>
                    ✕
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Result text */}
          <div className="h-16 flex items-center justify-center">
            {showResult && result !== null && (
              <div
                className="text-4xl font-bold"
                style={{
                  color: result === 'heads' ? '#f59e0b' : '#94a3b8',
                  animation: 'coinResultFadeIn 0.4s ease-out forwards',
                }}
              >
                {result === 'heads' ? '앞면!' : '뒷면!'}
              </div>
            )}
            {isFlipping && (
              <div className="text-sp-muted text-lg animate-pulse">던지는 중...</div>
            )}
            {!isFlipping && !showResult && (
              <div className="text-sp-muted text-base">버튼을 눌러 동전을 던져보세요</div>
            )}
          </div>
        </div>

        {/* Flip button */}
        <button
          onClick={handleFlip}
          disabled={isFlipping}
          className={`px-10 py-4 rounded-2xl text-xl font-bold transition-all shadow-lg active:scale-95 ${
            isFlipping
              ? 'bg-sp-card text-sp-muted border border-sp-border cursor-not-allowed'
              : 'bg-gradient-to-r from-sp-accent to-blue-400 text-white hover:from-blue-400 hover:to-sp-accent shadow-blue-500/30'
          }`}
        >
          {isFlipping ? '던지는 중...' : '🪙 던지기!'}
        </button>

        {/* Statistics */}
        <div className="w-full bg-sp-card rounded-xl border border-sp-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-sp-muted uppercase tracking-wider">통계</h3>
            <button
              onClick={handleResetStats}
              className="text-xs text-sp-muted hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/5"
            >
              통계 초기화
            </button>
          </div>

          {/* Stat numbers */}
          <div className="flex justify-around mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#f59e0b' }}>
                {stats.heads}
              </div>
              <div className="text-xs text-sp-muted mt-1">앞면 ({headsPercent}%)</div>
            </div>
            <div className="w-px bg-sp-border" />
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#94a3b8' }}>
                {stats.tails}
              </div>
              <div className="text-xs text-sp-muted mt-1">뒷면 ({tailsPercent}%)</div>
            </div>
          </div>

          {/* Bar graph */}
          <div className="space-y-2">
            {/* Heads bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-sp-muted w-6 text-right shrink-0">앞</span>
              <div className="flex-1 h-3 rounded-full bg-sp-surface overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${total === 0 ? 50 : headsPercent}%`,
                    background: 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                  }}
                />
              </div>
              <span className="text-xs text-sp-muted w-8 shrink-0">{headsPercent}%</span>
            </div>

            {/* Tails bar */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-sp-muted w-6 text-right shrink-0">뒤</span>
              <div className="flex-1 h-3 rounded-full bg-sp-surface overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${total === 0 ? 50 : tailsPercent}%`,
                    background: 'linear-gradient(90deg, #94a3b8, #64748b)',
                  }}
                />
              </div>
              <span className="text-xs text-sp-muted w-8 shrink-0">{tailsPercent}%</span>
            </div>
          </div>

          {total > 0 && (
            <p className="text-center text-xs text-sp-muted mt-3">총 {total}회 던짐</p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes coinResultFadeIn {
          0% { opacity: 0; transform: scale(0.7) translateY(8px); }
          60% { transform: scale(1.1) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </ToolLayout>
  );
}
