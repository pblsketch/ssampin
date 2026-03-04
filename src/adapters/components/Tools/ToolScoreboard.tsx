import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ToolLayout } from './ToolLayout';
import type { KeyboardShortcut } from './types';
import type { Team } from '@domain/entities/Team';
import { getRanking } from '@domain/rules/scoreRules';

interface ToolScoreboardProps {
  onBack: () => void;
  isFullscreen: boolean;
}

type ViewMode = 'setup' | 'scoreboard';

const PRESET_COLORS = [
  '#ef4444', // 빨
  '#f97316', // 주
  '#eab308', // 노
  '#22c55e', // 초
  '#3b82f6', // 파
  '#6366f1', // 남
  '#a855f7', // 보
  '#ec4899', // 분홍
  '#06b6d4', // 하늘
  '#84cc16', // 라임
];

function makeDefaultTeams(count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${Date.now()}-${i}`,
    name: `${i + 1}팀`,
    color: PRESET_COLORS[i % PRESET_COLORS.length]!,
    score: 0,
  }));
}

function getRankEmoji(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}위`;
}

/** Hex color → rgba string with alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ───────────────────── Setup View ───────────────────── */

interface SetupViewProps {
  teams: Team[];
  teamCount: number;
  isFullscreen: boolean;
  onTeamCountChange: (count: number) => void;
  onTeamNameChange: (id: string, name: string) => void;
  onTeamColorChange: (id: string, color: string) => void;
  onStart: () => void;
}

function SetupView({
  teams,
  teamCount,
  isFullscreen,
  onTeamCountChange,
  onTeamNameChange,
  onTeamColorChange,
  onStart,
}: SetupViewProps) {
  return (
    <div className={`w-full max-w-2xl mx-auto flex flex-col ${isFullscreen ? 'h-full min-h-0 gap-3' : 'gap-6'}`}>
      {/* Team count stepper */}
      <div className="flex items-center justify-center gap-4 shrink-0">
        <span className="text-sp-muted text-sm font-medium">팀 수</span>
        <div className="flex items-center gap-2 bg-sp-card border border-sp-border rounded-xl px-2 py-1">
          <button
            onClick={() => onTeamCountChange(teamCount - 1)}
            disabled={teamCount <= 2}
            className="w-9 h-9 rounded-lg bg-sp-bg text-sp-muted hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            −
          </button>
          <span className="w-10 text-center text-xl font-bold text-white font-mono">
            {teamCount}
          </span>
          <button
            onClick={() => onTeamCountChange(teamCount + 1)}
            disabled={teamCount >= 10}
            className="w-9 h-9 rounded-lg bg-sp-bg text-sp-muted hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-lg font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          >
            +
          </button>
        </div>
      </div>

      {/* Team rows */}
      <div className={`flex flex-col gap-2 pr-1 ${isFullscreen ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-[420px] overflow-y-auto'}`}>
        {teams.map((team, idx) => (
          <div
            key={team.id}
            className={`flex items-center gap-3 bg-sp-card border border-sp-border rounded-xl px-4 ${isFullscreen ? 'py-2' : 'py-3'}`}
          >
            {/* Index label */}
            <span className="text-sp-muted text-sm font-medium w-5 shrink-0">
              {idx + 1}
            </span>

            {/* Color palette */}
            <div className="flex gap-1.5 shrink-0">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => onTeamColorChange(team.id, color)}
                  className={`rounded-full transition-all shrink-0 ${isFullscreen ? 'w-5 h-5' : 'w-6 h-6'}`}
                  style={{
                    backgroundColor: color,
                    boxShadow:
                      team.color === color
                        ? `0 0 0 2px #131a2b, 0 0 0 4px ${color}`
                        : 'none',
                    transform: team.color === color ? 'scale(1.15)' : 'scale(1)',
                  }}
                  title={color}
                />
              ))}
            </div>

            {/* Name input */}
            <input
              type="text"
              value={team.name}
              onChange={(e) => onTeamNameChange(team.id, e.target.value)}
              maxLength={20}
              className="flex-1 min-w-0 bg-sp-bg border border-sp-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors"
              placeholder={`${idx + 1}팀`}
            />
          </div>
        ))}
      </div>

      {/* Start button */}
      <button
        onClick={onStart}
        className="w-full py-3.5 rounded-xl bg-sp-accent text-white font-bold text-lg hover:bg-sp-accent/80 transition-colors shadow-lg shadow-sp-accent/20 shrink-0"
      >
        게임 시작!
      </button>
    </div>
  );
}

/* ──────────────────── Bar Graph ──────────────────── */

interface BarGraphProps {
  teams: Team[];
  ranking: Map<string, number>;
  isFullscreen: boolean;
}

function BarGraph({ teams, ranking, isFullscreen }: BarGraphProps) {
  const totalScore = teams.reduce((sum, t) => sum + t.score, 0);
  const allZero = totalScore === 0;
  const bestRank = Math.min(...Array.from(ranking.values()));

  return (
    <div
      className={`w-full rounded-xl overflow-hidden flex ${
        isFullscreen ? 'h-16' : 'h-10'
      } bg-sp-card border border-sp-border`}
    >
      {teams.map((team) => {
        const widthPercent = allZero
          ? 100 / teams.length
          : (team.score / totalScore) * 100;
        const isLeader =
          !allZero && ranking.get(team.id) === bestRank;
        const showLabel = widthPercent > (isFullscreen ? 8 : 12);

        return (
          <div
            key={team.id}
            className="transition-all duration-500 ease-in-out flex items-center justify-center overflow-hidden relative"
            style={{
              width: `${widthPercent}%`,
              backgroundColor: hexToRgba(team.color, 0.35),
              minWidth: allZero ? undefined : '2px',
            }}
          >
            {showLabel && (
              <span
                className={`truncate px-2 font-medium select-none whitespace-nowrap ${
                  isFullscreen ? 'text-sm' : 'text-xs'
                }`}
                style={{ color: team.color }}
              >
                {isLeader && '👑 '}
                {team.name} {team.score}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────── Team Card ──────────────────── */

interface TeamCardProps {
  team: Team;
  rank: number;
  isAnimating: boolean;
  isFullscreen: boolean;
  onScoreChange: (teamId: string, delta: number) => void;
}

function TeamCard({
  team,
  rank,
  isAnimating,
  isFullscreen,
  onScoreChange,
}: TeamCardProps) {
  const scoreButtons: { label: string; delta: number; type: 'minus' | 'plus' }[] = [
    { label: '-5', delta: -5, type: 'minus' },
    { label: '-1', delta: -1, type: 'minus' },
    { label: '+1', delta: 1, type: 'plus' },
    { label: '+5', delta: 5, type: 'plus' },
    { label: '+10', delta: 10, type: 'plus' },
  ];

  return (
    <div
      className={`bg-sp-card border border-sp-border rounded-xl flex flex-col ${
        isFullscreen ? 'p-5' : 'p-4'
      }`}
      style={{ borderLeftWidth: '4px', borderLeftColor: team.color }}
    >
      {/* Header: name + rank */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="font-bold truncate"
          style={{ color: team.color }}
        >
          {team.name}
        </span>
        <span className="text-sm shrink-0">
          {getRankEmoji(rank)}
        </span>
      </div>

      {/* Score */}
      <div className="flex-1 flex items-center justify-center py-2">
        <span
          className={`font-bold font-mono transition-transform duration-300 select-none ${
            isFullscreen ? 'text-7xl' : 'text-5xl'
          } ${isAnimating ? 'scale-125' : 'scale-100'}`}
          style={{ color: team.color }}
        >
          {team.score}
        </span>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-center gap-1.5 mt-2">
        {scoreButtons.map((btn) => (
          <button
            key={btn.label}
            onClick={() => onScoreChange(team.id, btn.delta)}
            className={`rounded-lg font-medium transition-all active:scale-95 ${
              isFullscreen
                ? 'px-4 py-2 text-sm'
                : 'px-3 py-1.5 text-xs'
            } ${
              btn.type === 'minus'
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : ''
            }`}
            style={
              btn.type === 'plus'
                ? {
                    backgroundColor: hexToRgba(team.color, 0.2),
                    color: team.color,
                  }
                : undefined
            }
            onMouseEnter={(e) => {
              if (btn.type === 'plus') {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  hexToRgba(team.color, 0.3);
              }
            }}
            onMouseLeave={(e) => {
              if (btn.type === 'plus') {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                  hexToRgba(team.color, 0.2);
              }
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ──────────────── Scoreboard View ──────────────── */

interface ScoreboardViewProps {
  teams: Team[];
  isFullscreen: boolean;
  animatingIds: Set<string>;
  onScoreChange: (teamId: string, delta: number) => void;
  onReset: () => void;
  onSetup: () => void;
}

function ScoreboardView({
  teams,
  isFullscreen,
  animatingIds,
  onScoreChange,
  onReset,
  onSetup,
}: ScoreboardViewProps) {
  const ranking = getRanking(teams);
  const gridCols = teams.length >= 7 ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="w-full flex flex-col gap-5 h-full min-h-0">
      {/* Top bar graph */}
      <BarGraph teams={teams} ranking={ranking} isFullscreen={isFullscreen} />

      {/* Team cards grid */}
      <div className={`grid ${gridCols} gap-3 flex-1 min-h-0 overflow-y-auto`}>
        {teams.map((team) => (
          <TeamCard
            key={team.id}
            team={team}
            rank={ranking.get(team.id) ?? teams.length}
            isAnimating={animatingIds.has(team.id)}
            isFullscreen={isFullscreen}
            onScoreChange={onScoreChange}
          />
        ))}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-3 shrink-0 pb-1">
        <button
          onClick={onReset}
          className="px-5 py-2.5 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
        >
          🔄 점수 초기화
        </button>
        <button
          onClick={onSetup}
          className="px-5 py-2.5 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
        >
          ⚙️ 팀 설정
        </button>
      </div>
    </div>
  );
}

/* ──────────────── Main Component ──────────────── */

export function ToolScoreboard({ onBack, isFullscreen }: ToolScoreboardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('setup');
  const [teamCount, setTeamCount] = useState(4);
  const [teams, setTeams] = useState<Team[]>(() => makeDefaultTeams(4));
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const animTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup animation timers on unmount
  useEffect(() => {
    const timers = animTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Team count change → regenerate teams
  const handleTeamCountChange = useCallback((count: number) => {
    if (count < 2 || count > 10) return;
    setTeamCount(count);
    setTeams(makeDefaultTeams(count));
  }, []);

  const handleTeamNameChange = useCallback((id: string, name: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name } : t))
    );
  }, []);

  const handleTeamColorChange = useCallback((id: string, color: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, color } : t))
    );
  }, []);

  const handleStart = useCallback(() => {
    setViewMode('scoreboard');
  }, []);

  const handleScoreChange = useCallback((teamId: string, delta: number) => {
    setTeams((prev) =>
      prev.map((t) => {
        if (t.id !== teamId) return t;
        const newScore = Math.max(0, t.score + delta);
        return { ...t, score: newScore };
      })
    );

    // Trigger scale animation
    setAnimatingIds((prev) => {
      const next = new Set(prev);
      next.add(teamId);
      return next;
    });

    // Clear previous timer for this team if any
    const existing = animTimers.current.get(teamId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setAnimatingIds((prev) => {
        const next = new Set(prev);
        next.delete(teamId);
        return next;
      });
      animTimers.current.delete(teamId);
    }, 300);
    animTimers.current.set(teamId, timer);
  }, []);

  const handleReset = useCallback(() => {
    setTeams((prev) => prev.map((t) => ({ ...t, score: 0 })));
  }, []);

  const handleSetup = useCallback(() => {
    setViewMode('setup');
  }, []);

  const scoreShortcuts = useMemo<KeyboardShortcut[]>(() => {
    if (viewMode !== 'scoreboard') return [];
    const sc: KeyboardShortcut[] = [];
    teams.forEach((team, idx) => {
      if (idx >= 9) return;
      const keyNum = `${idx + 1}`;
      sc.push({
        key: keyNum,
        label: `${team.name} +1`,
        description: `${team.name}에 1점 추가`,
        handler: () => handleScoreChange(team.id, 1),
      });
      sc.push({
        key: keyNum,
        label: `${team.name} -1`,
        description: `${team.name}에서 1점 감소`,
        modifiers: { shift: true },
        handler: () => handleScoreChange(team.id, -1),
      });
    });
    return sc;
  }, [viewMode, teams, handleScoreChange]);

  return (
    <ToolLayout title="점수판" emoji="📊" onBack={onBack} isFullscreen={isFullscreen} shortcuts={scoreShortcuts}>
      {viewMode === 'setup' ? (
        <SetupView
          teams={teams}
          teamCount={teamCount}
          isFullscreen={isFullscreen}
          onTeamCountChange={handleTeamCountChange}
          onTeamNameChange={handleTeamNameChange}
          onTeamColorChange={handleTeamColorChange}
          onStart={handleStart}
        />
      ) : (
        <ScoreboardView
          teams={teams}
          isFullscreen={isFullscreen}
          animatingIds={animatingIds}
          onScoreChange={handleScoreChange}
          onReset={handleReset}
          onSetup={handleSetup}
        />
      )}
    </ToolLayout>
  );
}
