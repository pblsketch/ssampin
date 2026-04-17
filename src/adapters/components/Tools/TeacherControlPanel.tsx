/**
 * TeacherControlPanel — 교사 주도 라이브 설문 제어 패널
 *
 * 3개 도구(ToolPoll / ToolSurvey / ToolMultiSurvey)에서 공유하는 메인 라이브 화면.
 * stepMode=true일 때 기존 LIVE+QR+Q1/Q2 리스트 카드를 대체한다.
 *
 * 4블록 구조:
 *   [1] 헤더 바  — phase 배지, 문항 진행도, 접속 수, 초대 버튼, 세션 종료
 *   [2] 메인    — 현재 문항(큰 텍스트) + 선택지(open) 또는 집계(revealed)
 *   [3] 진행 바  — 응답률 + 미답변 이름 태그
 *   [4] 액션 바  — 다음 단계 주 버튼 + 보조 버튼
 *
 * IPC 호출은 하지 않고 모든 액션은 props 콜백으로 위임한다.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import type { MultiSurveyQuestion } from '@domain/entities/MultiSurvey';
import { useToolKeydown } from '@adapters/hooks/useToolKeydown';

// ─────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────

export interface RosterEntry {
  sessionId: string;
  nickname: string;
  answeredCurrent: boolean;
}

export interface TextAnswerEntry {
  sessionId: string;
  nickname: string;
  text: string;
}

export interface TeacherControlPanelProps {
  phase: 'lobby' | 'open' | 'revealed' | 'ended';
  currentQuestionIndex: number;
  totalQuestions: number;
  totalConnected: number;
  totalAnswered: number;
  /** phase in {open, revealed} 일 때 있음 */
  currentQuestion?: MultiSurveyQuestion;
  /** phase=revealed 일 때 있음 */
  aggregated?: AggregatedResult;
  roster: RosterEntry[];
  /** text 문항 REVEALED 시 교사 전용 이름-답변 매핑 */
  textAnswerDetail?: TextAnswerEntry[];
  onActivate: () => void;
  onReveal: () => void;
  onAdvance: () => void;
  onPrev: () => void;
  onReopen: () => void;
  onEnd: () => void;

  // ── 학생 초대 모달용 (신규) ──
  /** QR 코드·URL 표시용 우선 URL (보통 shortUrl ?? tunnelUrl) */
  liveDisplayUrl?: string;
  /** 전체 주소(긴 URL). 터널 원본. */
  liveFullUrl?: string;
  /** 짧은 주소. 있으면 별도 복사 가능 영역에 노출 */
  liveShortUrl?: string;
  /** 아직 터널 URL을 받는 중이면 true */
  liveTunnelLoading?: boolean;
}

// ─────────────────────────────────────────────────────────
// 내부 헬퍼 타입 가드
// ─────────────────────────────────────────────────────────

function isChoiceAggregate(
  agg: AggregatedResult,
): agg is AggregatedSingleMulti {
  return 'counts' in agg && 'total' in agg;
}

function isScaleAggregate(
  agg: AggregatedResult,
): agg is AggregatedScale {
  return 'avg' in agg && 'distribution' in agg;
}

function isTextAggregate(
  agg: AggregatedResult,
): agg is AggregatedText {
  return 'answers' in agg;
}

// ─────────────────────────────────────────────────────────
// Phase 배지
// ─────────────────────────────────────────────────────────

interface PhaseBadgeProps {
  phase: TeacherControlPanelProps['phase'];
}

function PhaseBadge({ phase }: PhaseBadgeProps) {
  const styles: Record<TeacherControlPanelProps['phase'], string> = {
    lobby:    'bg-sp-muted/20 text-sp-muted',
    open:     'bg-blue-500/20 text-blue-400',
    revealed: 'bg-sp-highlight/20 text-sp-highlight',
    ended:    'bg-green-500/20 text-green-400',
  };
  const labels: Record<TeacherControlPanelProps['phase'], string> = {
    lobby:    '대기',
    open:     '응답 받는 중',
    revealed: '결과 공개',
    ended:    '종료',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${styles[phase]}`}
    >
      {labels[phase]}
    </span>
  );
}

// ─────────────────────────────────────────────────────────
// StudentInviteModal — 학생 초대 모달 (QR + URL)
// ─────────────────────────────────────────────────────────

interface StudentInviteModalProps {
  open: boolean;
  onClose: () => void;
  displayUrl: string;
  fullUrl?: string;
  shortUrl?: string;
  tunnelLoading: boolean;
  totalConnected: number;
  roster: RosterEntry[];
}

function StudentInviteModal({
  open,
  onClose,
  displayUrl,
  fullUrl,
  shortUrl,
  tunnelLoading,
  totalConnected,
  roster,
}: StudentInviteModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Escape 키로 닫기 (모달이 열려 있고 활성 슬롯일 때만)
  useToolKeydown((e) => {
    if (!open) return;
    if (e.key === 'Escape') onClose();
  }, [open, onClose]);

  // QR 렌더
  useEffect(() => {
    if (!open || !canvasRef.current || !displayUrl) return;
    QRCode.toCanvas(canvasRef.current, displayUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).catch(() => { /* noop */ });
  }, [open, displayUrl]);

  const handleCopy = useCallback((key: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
    });
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="학생 초대"
    >
      <div
        className="bg-sp-surface border border-sp-border rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-sp-text">학생 초대하기</h3>
            <p className="text-sm text-sp-muted mt-0.5">
              QR을 스캔하거나 아래 주소로 접속하세요
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-sp-muted hover:text-sp-text text-2xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* QR 코드 */}
        <div className="bg-white rounded-xl p-4 flex items-center justify-center mb-4">
          {tunnelLoading && !displayUrl ? (
            <div className="w-[280px] h-[280px] flex items-center justify-center text-gray-500 text-sm">
              <span className="animate-spin mr-2">⏳</span>
              QR 준비 중...
            </div>
          ) : displayUrl ? (
            <canvas ref={canvasRef} />
          ) : (
            <div className="w-[280px] h-[280px] flex items-center justify-center text-gray-500 text-sm text-center px-4">
              접속 주소를 생성할 수 없습니다.<br />
              Wi-Fi 연결을 확인해주세요.
            </div>
          )}
        </div>

        {/* 주소 정보 */}
        <div className="space-y-3">
          {shortUrl && (
            <div>
              <p className="text-xs text-sp-muted mb-1">짧은 주소</p>
              <div className="flex items-center gap-2 bg-sp-bg border border-sp-border rounded-lg px-3 py-2">
                <p className="flex-1 text-sp-accent font-bold text-base font-mono truncate">
                  {shortUrl}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy('short', shortUrl)}
                  className="shrink-0 text-xs px-2 py-1 rounded-md bg-sp-accent/10 text-sp-accent hover:bg-sp-accent/20 transition-colors"
                >
                  {copiedKey === 'short' ? '복사됨!' : '복사'}
                </button>
              </div>
            </div>
          )}

          {fullUrl && fullUrl !== shortUrl && (
            <div>
              <p className="text-xs text-sp-muted mb-1">전체 주소</p>
              <div className="flex items-center gap-2 bg-sp-bg border border-sp-border rounded-lg px-3 py-2">
                <p className="flex-1 text-sp-text text-xs font-mono truncate">
                  {fullUrl}
                </p>
                <button
                  type="button"
                  onClick={() => handleCopy('full', fullUrl)}
                  className="shrink-0 text-xs px-2 py-1 rounded-md bg-sp-card text-sp-muted hover:text-sp-text transition-colors"
                >
                  {copiedKey === 'full' ? '복사됨!' : '복사'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 현재 접속 중인 학생 */}
        <div className="mt-4 pt-4 border-t border-sp-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-sp-text">
              대기 중인 학생
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-sp-accent/20 text-sp-accent font-bold">
              {totalConnected}명
            </span>
          </div>
          {roster.length === 0 ? (
            <p className="text-sm text-sp-muted text-center py-3">
              학생이 QR을 스캔하거나 주소로 접속하면 여기에 표시됩니다
            </p>
          ) : (
            <div
              className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto"
              role="list"
              aria-label="접속한 학생 목록"
            >
              {roster.map((entry) => (
                <span
                  key={entry.sessionId}
                  role="listitem"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sp-card border border-sp-border text-xs text-sp-text"
                >
                  {entry.nickname}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-lg bg-sp-card hover:bg-sp-card/70 border border-sp-border text-sp-text font-medium transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 선택형 옵션 뷰 (open 단계)
//
// ⚠️ OPEN phase에서는 응답의 옵션별 분포를 절대 노출하지 않는다.
// 교사가 "누가 뭘 골랐는지" 실시간으로 추측 가능해지면 학생 답변의
// 익명성/공정성이 깨지기 때문. 옵션 텍스트만 평범한 카드로 보여준다.
// 총 응답 수는 하단 진행 바(블록 3)에 표시된다.
// ─────────────────────────────────────────────────────────

interface ChoiceOpenViewProps {
  question: MultiSurveyQuestion;
}

function ChoiceOpenView({ question }: ChoiceOpenViewProps) {
  const options = question.options ?? [];

  if (options.length === 0) {
    return (
      <p className="text-sm text-sp-muted text-center py-4">선택지 정보가 없습니다.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" role="list" aria-label="선택지 목록">
      {options.map((opt, idx) => (
        <div
          key={opt.id}
          role="listitem"
          className="p-4 rounded-xl bg-sp-card border-2 border-sp-border flex items-center gap-3 transition-colors"
        >
          <span className="shrink-0 w-8 h-8 rounded-lg bg-sp-accent/15 text-sp-accent font-bold flex items-center justify-center text-sm">
            {idx + 1}
          </span>
          <span className="flex-1 text-base text-sp-text font-medium truncate">
            {opt.text}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 선택형 옵션 뷰 (revealed 단계 — 막대 차트)
// ─────────────────────────────────────────────────────────

interface ChoiceRevealedViewProps {
  question: MultiSurveyQuestion;
  aggregate: AggregatedSingleMulti;
}

function ChoiceRevealedView({ question, aggregate }: ChoiceRevealedViewProps) {
  const options = question.options ?? [];
  const { counts, total } = aggregate;

  let maxCount = 0;
  for (const id of Object.keys(counts)) {
    const c = counts[id] ?? 0;
    if (c > maxCount) maxCount = c;
  }

  return (
    <div className="space-y-2.5" role="list" aria-label="선택 문항 집계">
      {options.map((opt, idx) => {
        const count = counts[opt.id] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const barWidth = total > 0 ? Math.round((count / total) * 100) : 0;
        const isTop = maxCount > 0 && count === maxCount;

        return (
          <div
            key={opt.id}
            role="listitem"
            className={`relative overflow-hidden rounded-xl p-4 bg-sp-card border-2 ${
              isTop ? 'border-sp-highlight' : 'border-sp-border'
            }`}
          >
            {/* 배경 차트 바 */}
            <div
              className="absolute inset-y-0 left-0 bg-sp-accent/25 transition-all duration-700 ease-out"
              style={{ width: `${barWidth}%` }}
              aria-hidden="true"
            />
            <div className="relative flex items-center gap-3">
              <span
                className={`shrink-0 w-8 h-8 rounded-lg font-bold flex items-center justify-center text-sm ${
                  isTop ? 'bg-sp-highlight text-sp-bg' : 'bg-sp-accent/15 text-sp-accent'
                }`}
              >
                {idx + 1}
              </span>
              <span className="flex-1 text-base text-sp-text font-medium truncate">
                {opt.text}
                {isTop && total > 0 && (
                  <span className="ml-2 text-xs text-sp-highlight">★ 최다</span>
                )}
              </span>
              <span className="shrink-0 text-sm font-bold text-sp-text tabular-nums">
                {count}명
              </span>
              <span className="shrink-0 text-sm font-bold text-sp-muted tabular-nums w-12 text-right">
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
      {options.length === 0 && (
        <p className="text-sm text-sp-muted text-center py-4">선택지 정보가 없습니다.</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 스케일 뷰 (revealed)
// ─────────────────────────────────────────────────────────

interface ScaleRevealedViewProps {
  question: MultiSurveyQuestion;
  aggregate: AggregatedScale;
}

function ScaleRevealedView({ question, aggregate }: ScaleRevealedViewProps) {
  const { avg, distribution, total } = aggregate;
  const min = question.scaleMin ?? 1;
  const max = question.scaleMax ?? 5;
  const minLabel = question.scaleMinLabel ?? String(min);
  const maxLabel = question.scaleMaxLabel ?? String(max);

  const maxDistCount = Object.values(distribution).reduce(
    (acc, v) => Math.max(acc, v ?? 0),
    0,
  );

  const values: number[] = [];
  for (let v = min; v <= max; v += 1) values.push(v);

  return (
    <div className="space-y-4">
      <div className="text-center" aria-label={`평균: ${avg.toFixed(1)}`}>
        <span className="text-5xl font-bold text-sp-accent tabular-nums">
          {total > 0 ? avg.toFixed(1) : '-'}
        </span>
        <span className="text-sp-muted text-lg ml-1">/ {max}</span>
        <p className="text-sp-muted text-sm mt-1">평균 점수 · 총 {total}명 응답</p>
      </div>

      <div>
        <div className="flex justify-between mb-1 px-1 text-xs text-sp-muted">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
        <div className="flex items-end gap-2 h-28" role="list" aria-label="척도 분포">
          {values.map((v) => {
            const count = distribution[v] ?? 0;
            const heightPct = maxDistCount > 0
              ? Math.round((count / maxDistCount) * 100)
              : 0;
            return (
              <div
                key={v}
                role="listitem"
                className="flex-1 flex flex-col items-center gap-1"
                aria-label={`${v}점: ${count}명`}
              >
                <span className="text-xs text-sp-text font-semibold tabular-nums">{count}</span>
                <div className="w-full flex-1 flex flex-col justify-end bg-sp-card rounded-lg overflow-hidden">
                  <div
                    className="w-full bg-gradient-to-t from-sp-accent to-sp-highlight transition-all duration-700 ease-out"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-sm text-sp-text font-bold">{v}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 주관식 뷰 (revealed — 이름/무기명 토글)
// ─────────────────────────────────────────────────────────

interface TextRevealedViewProps {
  aggregate: AggregatedText;
  detail?: TextAnswerEntry[];
}

function TextRevealedView({ aggregate, detail }: TextRevealedViewProps) {
  const [showNames, setShowNames] = useState(true);

  const hasDetail = detail !== undefined && detail.length > 0;
  const hasAnon = aggregate.answers.length > 0;

  if (!hasDetail && !hasAnon) {
    return (
      <p className="text-sm text-sp-muted text-center py-4">아직 답변이 없습니다.</p>
    );
  }

  return (
    <div className="space-y-2">
      {hasDetail && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <span className="text-sp-muted">교사 전용:</span>
          <button
            type="button"
            onClick={() => setShowNames(true)}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              showNames
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            이름 표시
          </button>
          <span className="text-sp-border">|</span>
          <button
            type="button"
            onClick={() => setShowNames(false)}
            className={`px-2 py-0.5 rounded-md transition-colors ${
              !showNames
                ? 'bg-sp-accent/20 text-sp-accent'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            무기명
          </button>
        </div>
      )}

      {showNames && hasDetail ? (
        <div
          className="max-h-80 overflow-y-auto space-y-2 pr-1"
          role="list"
          aria-label="주관식 답변 (이름 포함)"
        >
          {detail.map((entry) => (
            <div
              key={entry.sessionId}
              role="listitem"
              className="bg-sp-card rounded-xl p-3 border border-sp-border"
            >
              <p className="text-xs font-bold text-sp-accent mb-1">
                {entry.nickname}
              </p>
              <p className="text-base text-sp-text leading-relaxed break-words">
                {entry.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="max-h-80 overflow-y-auto space-y-2 pr-1"
          role="list"
          aria-label="주관식 답변 (무기명)"
        >
          {aggregate.answers.map((text, idx) => (
            <div
              key={idx}
              role="listitem"
              className="bg-sp-card rounded-xl p-3 border border-sp-border text-base text-sp-text leading-relaxed break-words"
            >
              {text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────

export function TeacherControlPanel({
  phase,
  currentQuestionIndex,
  totalQuestions,
  totalConnected,
  totalAnswered,
  currentQuestion,
  aggregated,
  roster,
  textAnswerDetail,
  onActivate,
  onReveal,
  onAdvance,
  onPrev,
  onReopen,
  onEnd,
  liveDisplayUrl,
  liveFullUrl,
  liveShortUrl,
  liveTunnelLoading,
}: TeacherControlPanelProps) {
  // ── 세션 종료 2단 확인 ──
  const [endConfirmActive, setEndConfirmActive] = useState(false);
  // ── 학생 초대 모달 열림 여부 ──
  const [inviteOpen, setInviteOpen] = useState(false);

  const handleEndClick = useCallback(() => {
    if (endConfirmActive) {
      setEndConfirmActive(false);
      onEnd();
    } else {
      setEndConfirmActive(true);
    }
  }, [endConfirmActive, onEnd]);

  useEffect(() => {
    if (!endConfirmActive) return;
    const timer = setTimeout(() => setEndConfirmActive(false), 5000);
    return () => clearTimeout(timer);
  }, [endConfirmActive]);

  useEffect(() => {
    setEndConfirmActive(false);
  }, [phase]);

  // ── 파생 상태 ──
  const unansweredRoster = roster.filter((r) => !r.answeredCurrent);
  const answeredPct = totalConnected > 0
    ? Math.round((totalAnswered / totalConnected) * 100)
    : 0;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const isAllAnswered = totalConnected > 0 && totalAnswered >= totalConnected;
  const canInvite = Boolean(liveDisplayUrl) || Boolean(liveTunnelLoading);

  // ─────────────────────────────────────────────
  // 렌더링
  // ─────────────────────────────────────────────

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col h-full min-h-0 gap-4">
      {/* ──────── [블록 1] 헤더 바 ──────── */}
      <div className="shrink-0 flex items-center gap-3 bg-sp-surface border border-sp-border rounded-xl px-4 py-3">
        <PhaseBadge phase={phase} />
        {phase !== 'lobby' && phase !== 'ended' && (
          <span className="text-sm text-sp-muted">
            문항 <span className="text-sp-text font-bold tabular-nums">{currentQuestionIndex + 1}</span>
            <span className="text-sp-muted"> / {totalQuestions}</span>
          </span>
        )}
        <div className="flex-1" />

        <span
          className="flex items-center gap-1.5 text-sm text-sp-muted"
          aria-live="polite"
        >
          <span className="text-green-400">●</span>
          접속 <span className="text-sp-text font-bold tabular-nums">{totalConnected}</span>명
        </span>

        {canInvite && (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sp-accent/15 border border-sp-accent/30 text-sp-accent text-sm font-medium hover:bg-sp-accent/25 transition-colors min-h-[44px]"
            aria-label="학생 추가 초대"
          >
            <span aria-hidden="true">➕</span> 학생 초대
          </button>
        )}

        <button
          type="button"
          onClick={handleEndClick}
          aria-label={endConfirmActive ? '한 번 더 클릭하면 종료됩니다' : '세션 종료'}
          className={`text-sm px-3 py-1.5 rounded-lg border transition-colors min-h-[44px] ${
            endConfirmActive
              ? 'border-red-500/60 bg-red-500/15 text-red-300 font-semibold'
              : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          }`}
        >
          {endConfirmActive ? '한 번 더' : '✕ 종료'}
        </button>
      </div>

      {/* ──────── [블록 2] 현재 문항 / 집계 ──────── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-sp-surface border border-sp-border rounded-2xl p-6 md:p-8 flex flex-col gap-5">
        {phase === 'lobby' && (
          <LobbyBlock
            roster={roster}
            totalQuestions={totalQuestions}
          />
        )}

        {phase === 'open' && currentQuestion && (
          <OpenBlock
            index={currentQuestionIndex}
            question={currentQuestion}
          />
        )}

        {phase === 'revealed' && currentQuestion && (
          <RevealedBlock
            index={currentQuestionIndex}
            question={currentQuestion}
            aggregated={aggregated}
            textDetail={textAnswerDetail}
          />
        )}

        {phase === 'ended' && (
          <EndedBlock totalConnected={totalConnected} totalQuestions={totalQuestions} />
        )}
      </div>

      {/* ──────── [블록 3] 진행 바 ──────── */}
      {(phase === 'open' || phase === 'revealed') && (
        <div className="shrink-0 bg-sp-surface border border-sp-border rounded-xl px-4 py-3 flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-sp-text tabular-nums">
              {totalAnswered}
            </span>
            <span className="text-sm text-sp-muted">
              / {totalConnected} 답변 완료
            </span>
            <span className="ml-auto text-sm font-bold text-sp-accent tabular-nums">
              {answeredPct}%
            </span>
          </div>

          <div className="h-2 bg-sp-border rounded-full overflow-hidden" aria-hidden="true">
            <div
              className="h-full bg-gradient-to-r from-sp-accent to-sp-highlight transition-all duration-500"
              style={{ width: `${answeredPct}%` }}
            />
          </div>

          {phase === 'open' && (
            isAllAnswered ? (
              <div className="inline-flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-1.5">
                <span>✨</span>
                <span className="font-medium">전원 답변 완료! 결과를 공개해 보세요.</span>
              </div>
            ) : unansweredRoster.length > 0 ? (
              <details className="group">
                <summary className="text-xs text-sp-muted cursor-pointer hover:text-sp-text transition-colors list-none flex items-center gap-1">
                  <span className="group-open:rotate-90 transition-transform">▸</span>
                  미답변 {unansweredRoster.length}명 보기
                </summary>
                <div
                  className="flex flex-wrap gap-1.5 mt-2"
                  role="list"
                  aria-label="미답변 학생 목록"
                >
                  {unansweredRoster.map((entry) => (
                    <span
                      key={entry.sessionId}
                      role="listitem"
                      className="text-xs text-sp-muted bg-sp-card px-2 py-0.5 rounded border border-sp-border"
                    >
                      {entry.nickname}
                    </span>
                  ))}
                </div>
              </details>
            ) : null
          )}
        </div>
      )}

      {/* ──────── [블록 4] 주 액션 버튼 ──────── */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap">
        {phase === 'lobby' && (
          <>
            <button
              type="button"
              onClick={onActivate}
              disabled={roster.length === 0}
              aria-label={
                roster.length === 0
                  ? '학생이 없습니다. 시작할 수 없습니다'
                  : '세션 시작'
              }
              className={`flex-1 bg-sp-accent hover:bg-sp-accent/90 text-white px-6 py-4 rounded-xl font-bold text-lg transition min-h-[56px] shadow-lg shadow-sp-accent/20 ${
                roster.length === 0 ? 'opacity-50 cursor-not-allowed shadow-none' : ''
              }`}
            >
              ▶ 시작하기
            </button>
          </>
        )}

        {phase === 'open' && (
          <>
            <button
              type="button"
              onClick={onReveal}
              aria-label="결과 공개"
              className="flex-1 bg-sp-accent hover:bg-sp-accent/90 text-white px-6 py-4 rounded-xl font-bold text-lg transition min-h-[56px] shadow-lg shadow-sp-accent/20"
            >
              📊 결과 공개 ▶
            </button>
            {currentQuestionIndex > 0 && (
              <button
                type="button"
                onClick={onPrev}
                aria-label="이전 문항으로"
                className="border border-sp-border hover:bg-sp-card text-sp-text px-4 py-3 rounded-xl transition min-h-[56px] text-sm font-medium"
              >
                ◀ 이전
              </button>
            )}
          </>
        )}

        {phase === 'revealed' && (
          <>
            {isLastQuestion ? (
              <button
                type="button"
                onClick={onAdvance}
                aria-label="세션 종료 (마지막 문항)"
                className="flex-1 bg-sp-accent hover:bg-sp-accent/90 text-white px-6 py-4 rounded-xl font-bold text-lg transition min-h-[56px] shadow-lg shadow-sp-accent/20"
              >
                🏁 설문 종료
              </button>
            ) : (
              <button
                type="button"
                onClick={onAdvance}
                aria-label="다음 문항으로"
                className="flex-1 bg-sp-accent hover:bg-sp-accent/90 text-white px-6 py-4 rounded-xl font-bold text-lg transition min-h-[56px] shadow-lg shadow-sp-accent/20"
              >
                ▶ 다음 문항
              </button>
            )}
            {currentQuestionIndex > 0 && (
              <button
                type="button"
                onClick={onPrev}
                aria-label="이전 문항으로"
                className="border border-sp-border hover:bg-sp-card text-sp-text px-4 py-3 rounded-xl transition min-h-[56px] text-sm font-medium"
              >
                ◀ 이전
              </button>
            )}
            <button
              type="button"
              onClick={onReopen}
              aria-label="응답 더 받기"
              className="border border-sp-highlight/40 text-sp-highlight hover:bg-sp-highlight/10 px-4 py-3 rounded-xl transition min-h-[56px] text-sm font-medium"
            >
              🔄 응답 더 받기
            </button>
          </>
        )}

        {phase === 'ended' && (
          <button
            type="button"
            onClick={onEnd}
            aria-label="닫기"
            className="flex-1 bg-sp-card border border-sp-border hover:bg-sp-card/70 text-sp-text px-6 py-4 rounded-xl font-bold text-lg transition min-h-[56px]"
          >
            닫기
          </button>
        )}
      </div>

      {/* 학생 초대 모달 */}
      {canInvite && (
        <StudentInviteModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          displayUrl={liveDisplayUrl ?? ''}
          fullUrl={liveFullUrl}
          shortUrl={liveShortUrl}
          tunnelLoading={Boolean(liveTunnelLoading)}
          totalConnected={totalConnected}
          roster={roster}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Phase별 블록 컴포넌트
// ─────────────────────────────────────────────────────────

interface LobbyBlockProps {
  roster: RosterEntry[];
  totalQuestions: number;
}

function LobbyBlock({ roster, totalQuestions }: LobbyBlockProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-4 py-6">
      <div className="text-5xl" aria-hidden="true">🎯</div>
      <h2 className="text-2xl md:text-3xl font-bold text-sp-text">
        설문을 시작할 준비가 되었어요
      </h2>
      <p className="text-sp-muted">
        총 <span className="text-sp-text font-bold">{totalQuestions}개</span> 문항 ·
        학생 접속 대기 중
      </p>

      <div className="w-full max-w-2xl mt-4">
        {roster.length > 0 ? (
          <>
            <p className="text-sm text-sp-muted mb-3">
              접속한 학생 <span className="text-sp-text font-bold">{roster.length}명</span>
            </p>
            <div
              className="flex flex-wrap gap-2 justify-center"
              role="list"
              aria-label="접속한 학생 목록"
            >
              {roster.map((entry) => (
                <span
                  key={entry.sessionId}
                  role="listitem"
                  className="px-3 py-1.5 rounded-full bg-sp-card border border-sp-border text-sm text-sp-text"
                >
                  {entry.nickname}
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-sp-muted">
            아직 접속한 학생이 없습니다.<br />
            우측 상단 "학생 초대" 버튼에서 QR을 학생들에게 보여주세요.
          </p>
        )}
      </div>
    </div>
  );
}

interface OpenBlockProps {
  index: number;
  question: MultiSurveyQuestion;
}

function OpenBlock({ index, question }: OpenBlockProps) {
  return (
    <div className="space-y-5">
      {/* 문항 번호 + 텍스트 */}
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1 px-3 py-1 bg-sp-accent/10 text-sp-accent text-sm font-bold rounded-full">
          Q{index + 1}
        </span>
        <h2 className="text-2xl md:text-3xl font-bold text-sp-text leading-relaxed">
          {question.question}
        </h2>
      </div>

      {/* 타입별 본문 —
          OPEN 단계에서는 익명성 보호를 위해 선택지·스케일·텍스트 모두
          "정적 프리뷰"만 노출한다. 실시간 집계는 REVEALED 단계에서만 공개. */}
      {question.type === 'single-choice' || question.type === 'multi-choice' ? (
        <ChoiceOpenView question={question} />
      ) : question.type === 'scale' ? (
        <ScaleOpenView question={question} />
      ) : question.type === 'text' ? (
        <TextOpenView />
      ) : null}
    </div>
  );
}

function ScaleOpenView({ question }: { question: MultiSurveyQuestion }) {
  const min = question.scaleMin ?? 1;
  const max = question.scaleMax ?? 5;
  const minLabel = question.scaleMinLabel ?? String(min);
  const maxLabel = question.scaleMaxLabel ?? String(max);

  const values: number[] = [];
  for (let v = min; v <= max; v += 1) values.push(v);

  return (
    <div className="space-y-3">
      <p className="text-sm text-sp-muted">
        학생들이 <span className="text-sp-text font-medium">{min} ~ {max}</span> 사이 점수를 선택하고 있어요.
      </p>
      <div className="flex items-center gap-2 justify-center">
        {values.map((v) => (
          <div
            key={v}
            className="w-12 h-12 rounded-xl bg-sp-card border-2 border-sp-border flex items-center justify-center text-lg font-bold text-sp-text"
          >
            {v}
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-sp-muted px-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

function TextOpenView() {
  return (
    <div className="py-8 text-center text-sp-muted space-y-2">
      <div className="text-4xl" aria-hidden="true">✍️</div>
      <p className="text-base">학생들이 답변을 입력하고 있어요</p>
      <p className="text-sm">결과 공개 시 모든 답변이 여기에 표시됩니다.</p>
    </div>
  );
}

interface RevealedBlockProps {
  index: number;
  question: MultiSurveyQuestion;
  aggregated?: AggregatedResult;
  textDetail?: TextAnswerEntry[];
}

function RevealedBlock({ index, question, aggregated, textDetail }: RevealedBlockProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-sp-highlight/15 text-sp-highlight text-sm font-bold rounded-full">
            Q{index + 1}
          </span>
          <span className="text-xs text-sp-muted">결과 공개</span>
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-sp-text leading-relaxed">
          {question.question}
        </h2>
      </div>

      {!aggregated ? (
        <p className="text-sm text-sp-muted text-center py-4">집계 결과를 불러오는 중...</p>
      ) : isChoiceAggregate(aggregated) ? (
        <ChoiceRevealedView question={question} aggregate={aggregated} />
      ) : isScaleAggregate(aggregated) ? (
        <ScaleRevealedView question={question} aggregate={aggregated} />
      ) : isTextAggregate(aggregated) ? (
        <TextRevealedView aggregate={aggregated} detail={textDetail} />
      ) : null}
    </div>
  );
}

interface EndedBlockProps {
  totalConnected: number;
  totalQuestions: number;
}

function EndedBlock({ totalConnected, totalQuestions }: EndedBlockProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
      <div className="text-5xl" aria-hidden="true">🎉</div>
      <h2 className="text-2xl md:text-3xl font-bold text-sp-text">
        수고하셨습니다!
      </h2>
      <p className="text-sp-muted">
        총 <span className="text-sp-text font-bold">{totalConnected}명</span>이
        <span className="text-sp-text font-bold"> {totalQuestions}개</span> 문항에 참여했어요.
      </p>
      <p className="text-xs text-sp-muted mt-2">
        세션을 종료하면 결과 화면으로 이동합니다.
      </p>
    </div>
  );
}

export default TeacherControlPanel;
