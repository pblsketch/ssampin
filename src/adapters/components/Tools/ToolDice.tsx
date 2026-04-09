import { useState, useCallback, useEffect, useRef } from 'react';
import { ToolLayout } from './ToolLayout';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useToolSound } from '@adapters/hooks/useToolSound';

interface ToolDiceProps {
  onBack: () => void;
  isFullscreen: boolean;
}

// Face rotations to show each face value toward the camera
// Face assignments: front=1, back=2, right=3, left=4, top=5, bottom=6
const FACE_ROTATIONS: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 90, y: 0 },
};

// Dot layout for each face value
const DOT_LAYOUTS: Record<number, { top: string; left: string }[]> = {
  1: [
    { top: '50%', left: '50%' },
  ],
  2: [
    { top: '25%', left: '75%' },
    { top: '75%', left: '25%' },
  ],
  3: [
    { top: '25%', left: '75%' },
    { top: '50%', left: '50%' },
    { top: '75%', left: '25%' },
  ],
  4: [
    { top: '25%', left: '25%' },
    { top: '25%', left: '75%' },
    { top: '75%', left: '25%' },
    { top: '75%', left: '75%' },
  ],
  5: [
    { top: '25%', left: '25%' },
    { top: '25%', left: '75%' },
    { top: '50%', left: '50%' },
    { top: '75%', left: '25%' },
    { top: '75%', left: '75%' },
  ],
  6: [
    { top: '25%', left: '25%' },
    { top: '25%', left: '75%' },
    { top: '50%', left: '25%' },
    { top: '50%', left: '75%' },
    { top: '75%', left: '25%' },
    { top: '75%', left: '75%' },
  ],
};

interface DiceFaceProps {
  value: number;
}

function DiceFace({ value }: DiceFaceProps) {
  const dots = DOT_LAYOUTS[value] ?? [];
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#243044',
        borderRadius: '14px',
        border: '1.5px solid #2a3548',
        position: 'relative',
        boxShadow: 'inset 0 0 12px rgba(0,0,0,0.4)',
      }}
    >
      {dots.map((dot, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: '18%',
            height: '18%',
            borderRadius: '50%',
            backgroundColor: '#e2e8f0',
            top: dot.top,
            left: dot.left,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        />
      ))}
    </div>
  );
}

interface Dice3DProps {
  value: number;
  isRolling: boolean;
  rollId: number;
  size: number;
}

function Dice3D({ value, isRolling, rollId, size }: Dice3DProps) {
  const half = size / 2;
  const rotation = FACE_ROTATIONS[value] ?? { x: 0, y: 0 };

  // During roll: add multiple full rotations + random tumble, then settle on face
  const extraX = isRolling ? 720 + Math.floor(Math.random() * 3) * 360 : 0;
  const extraY = isRolling ? 720 + Math.floor(Math.random() * 3) * 360 : 0;

  const finalX = rotation.x + (isRolling ? extraX : 0);
  const finalY = rotation.y + (isRolling ? extraY : 0);

  return (
    <div
      style={{
        width: size,
        height: size,
        perspective: size * 3,
      }}
    >
      <div
        key={rollId}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: `rotateX(${finalX}deg) rotateY(${finalY}deg)`,
          transition: isRolling
            ? 'transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
            : `transform 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)`,
        }}
      >
        {/* Front face — value 1 */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: `translateZ(${half}px)`,
            backfaceVisibility: 'hidden',
          }}
        >
          <DiceFace value={1} />
        </div>

        {/* Back face — value 2 */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: `rotateY(180deg) translateZ(${half}px)`,
            backfaceVisibility: 'hidden',
          }}
        >
          <DiceFace value={2} />
        </div>

        {/* Right face — value 3 */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: `rotateY(90deg) translateZ(${half}px)`,
            backfaceVisibility: 'hidden',
          }}
        >
          <DiceFace value={3} />
        </div>

        {/* Left face — value 4 */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: `rotateY(-90deg) translateZ(${half}px)`,
            backfaceVisibility: 'hidden',
          }}
        >
          <DiceFace value={4} />
        </div>

        {/* Top face — value 5 */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: `rotateX(90deg) translateZ(${half}px)`,
            backfaceVisibility: 'hidden',
          }}
        >
          <DiceFace value={5} />
        </div>

        {/* Bottom face — value 6 */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: `rotateX(-90deg) translateZ(${half}px)`,
            backfaceVisibility: 'hidden',
          }}
        >
          <DiceFace value={6} />
        </div>
      </div>
    </div>
  );
}

type DiceCount = 1 | 2 | 3;

export function ToolDice({ onBack, isFullscreen }: ToolDiceProps) {
  const { track } = useAnalytics();
  const { playProgress, playResult } = useToolSound('dice');
  useEffect(() => {
    track('tool_use', { tool: 'dice' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [diceCount, setDiceCount] = useState<DiceCount>(1);
  const [results, setResults] = useState<number[]>([1]);
  const [isRolling, setIsRolling] = useState(false);
  const [history, setHistory] = useState<number[][]>([]);
  const [rollId, setRollId] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roll = useCallback(() => {
    if (isRolling) return;

    const newResults = Array.from({ length: diceCount }, () =>
      Math.floor(Math.random() * 6) + 1,
    );

    setIsRolling(true);
    setRollId((prev) => prev + 1);
    playProgress();

    // After animation completes, update results and stop rolling state
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setResults(newResults);
      setIsRolling(false);
      playResult();
      setHistory((prev) => [newResults, ...prev].slice(0, 10));
    }, 1500);
  }, [isRolling, diceCount]);

  const handleDiceCountChange = useCallback(
    (count: DiceCount) => {
      if (isRolling) return;
      setDiceCount(count);
      // Reset results to default for the new count
      setResults(Array.from({ length: count }, () => 1));
    },
    [isRolling],
  );

  const diceSize = diceCount === 1 ? 120 : 96;
  const sum = results.reduce((a, b) => a + b, 0);

  return (
    <ToolLayout title="주사위" emoji="🎲" onBack={onBack} isFullscreen={isFullscreen}>
      <div className="w-full h-full flex flex-col items-center gap-6 overflow-auto py-4">

        {/* Dice count selector */}
        <div className="flex items-center gap-2">
          <span className="text-sp-muted text-sm mr-1">주사위 수:</span>
          {([1, 2, 3] as DiceCount[]).map((count) => (
            <button
              key={count}
              onClick={() => handleDiceCountChange(count)}
              disabled={isRolling}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all disabled:cursor-not-allowed ${
                diceCount === count
                  ? 'bg-sp-accent text-white shadow-lg shadow-sp-accent/30'
                  : 'bg-sp-card border border-sp-border text-sp-muted hover:border-sp-accent hover:text-sp-text'
              }`}
            >
              {count}개
            </button>
          ))}
        </div>

        {/* 3D Dice display */}
        <div
          className="flex items-center justify-center gap-6 flex-wrap"
          style={{ minHeight: 140 }}
        >
          {Array.from({ length: diceCount }, (_, i) => (
            <div key={i} className="flex flex-col items-center gap-2">
              <Dice3D
                value={results[i] ?? 1}
                isRolling={isRolling}
                rollId={rollId}
                size={diceSize}
              />
              {diceCount > 1 && !isRolling && (
                <span
                  className="text-sp-highlight font-bold text-lg"
                  style={{ animation: 'resultPop 0.4s ease-out' }}
                >
                  {results[i]}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Single die result or sum */}
        {!isRolling && (
          <div
            className="text-center"
            style={{ animation: 'resultPop 0.4s ease-out' }}
          >
            {diceCount === 1 ? (
              <p className="text-5xl font-bold text-sp-highlight">{results[0]}</p>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <p className="text-sp-muted text-sm">합계</p>
                <p className="text-5xl font-bold text-sp-highlight">{sum}</p>
              </div>
            )}
          </div>
        )}

        {/* Roll button */}
        <button
          onClick={roll}
          disabled={isRolling}
          className="px-10 py-4 rounded-2xl bg-gradient-to-r from-sp-accent to-blue-400 text-white text-xl font-bold shadow-lg hover:from-blue-400 hover:to-sp-accent transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transform select-none"
        >
          {isRolling ? '던지는 중...' : '🎲 던지기!'}
        </button>

        {/* History */}
        {history.length > 0 && (
          <div className="w-full max-w-lg px-4">
            <div className="bg-sp-card border border-sp-border rounded-xl p-3">
              <p className="text-xs text-sp-muted mb-2 font-medium">최근 기록</p>
              <div className="flex flex-wrap gap-2">
                {history.map((roll, i) => {
                  const rollSum = roll.reduce((a, b) => a + b, 0);
                  const label =
                    roll.length === 1
                      ? `${roll[0]}`
                      : `${roll.join(', ')} → ${rollSum}`;
                  return (
                    <span
                      key={i}
                      className={`px-3 py-1 rounded-full text-sm font-medium border transition-all ${
                        i === 0
                          ? 'bg-sp-highlight/20 border-sp-highlight text-sp-highlight'
                          : 'bg-sp-surface border-sp-border text-sp-muted'
                      }`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes resultPop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </ToolLayout>
  );
}
