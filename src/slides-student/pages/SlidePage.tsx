/**
 * 학생 SPA 슬라이드 화면.
 *
 * - 슬라이드 이미지 표시 (HTTP)
 * - 활성 활동 영역에 응답 UI (PollResponse / TextResponse / WordCloudResponse)
 * - 이미 응답한 활동 → "응답 완료" 배지 + 재응답 차단
 * - 교사 disconnect 시 빨간 배너
 *
 * Plan §2-1 학생 화면 흐름.
 */

import {
  PollResponse,
  TextResponse,
  WordCloudResponse,
} from '../components/ResponseComponents';
import type { ConnectionState } from '../wsClient';

interface SlideShape {
  readonly id: string;
  readonly pageNumber: number;
  readonly imagePath: string;
  readonly overlays: unknown[];
}

interface OverlayPosition {
  readonly xPercent: number;
  readonly yPercent: number;
  readonly widthPercent: number;
  readonly heightPercent: number;
}

export interface SlideViewState {
  readonly position: OverlayPosition;
}

export interface SlidePageProps {
  readonly slide: SlideShape | null;
  readonly activeOverlay: {
    overlayId: string;
    config: unknown;
    position: OverlayPosition;
  } | null;
  readonly myResponses: ReadonlySet<string>;
  readonly teacherConnected: boolean;
  readonly connectionState: ConnectionState;
  readonly responseStatusByOverlay: ReadonlyMap<
    string,
    'recorded' | 'late' | 'rejected'
  >;
  readonly onSubmit: (overlayId: string, data: unknown) => void;
}

export function SlidePage({
  slide,
  activeOverlay,
  myResponses,
  teacherConnected,
  connectionState,
  responseStatusByOverlay,
  onSubmit,
}: SlidePageProps): JSX.Element {
  const hasActive = activeOverlay != null;
  const alreadyResponded = activeOverlay
    ? myResponses.has(activeOverlay.overlayId)
    : false;
  const responseStatus = activeOverlay
    ? responseStatusByOverlay.get(activeOverlay.overlayId)
    : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      {/* 상단 배너 */}
      {!teacherConnected && (
        <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-400/40 text-xs text-amber-200 text-center">
          선생님 연결을 확인 중이에요…
        </div>
      )}
      {connectionState === 'reconnecting' && (
        <div className="px-4 py-2 bg-red-500/15 border-b border-red-400/40 text-xs text-red-200 text-center">
          연결 다시 시도 중…
        </div>
      )}

      {/* 슬라이드 영역 */}
      <main className="flex-1 flex flex-col">
        <div className="relative w-full bg-slate-900" style={{ aspectRatio: '16 / 9' }}>
          {slide ? (
            <img
              src={slide.imagePath}
              alt={`슬라이드 ${slide.pageNumber}`}
              className="absolute inset-0 w-full h-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
              슬라이드 준비 중…
            </div>
          )}

          {/* 활성 활동 — position 기반 오버레이 (% → CSS) */}
          {hasActive && activeOverlay && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${activeOverlay.position.xPercent}%`,
                top: `${activeOverlay.position.yPercent}%`,
                width: `${activeOverlay.position.widthPercent}%`,
                height: `${activeOverlay.position.heightPercent}%`,
              }}
              aria-hidden
            >
              <div className="w-full h-full rounded-xl border-2 border-blue-400/60 bg-blue-500/15 backdrop-blur-sm" />
            </div>
          )}
        </div>

        {/* 응답 영역 — 슬라이드 아래에 풀 너비 (모바일 터치 영역 우선) */}
        {hasActive && activeOverlay && (
          <section className="px-4 py-5 bg-slate-900 border-t border-slate-800">
            {alreadyResponded || responseStatus === 'recorded' || responseStatus === 'late' ? (
              <ResponseDoneBadge status={responseStatus ?? 'recorded'} />
            ) : (
              <ResponseFormForOverlay
                overlayId={activeOverlay.overlayId}
                config={activeOverlay.config}
                disabled={!teacherConnected}
                onSubmit={(data) => onSubmit(activeOverlay.overlayId, data)}
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function ResponseDoneBadge({
  status,
}: {
  status: 'recorded' | 'late' | 'rejected';
}): JSX.Element {
  if (status === 'rejected') {
    return (
      <div className="text-center text-sm text-red-300 py-4">
        응답이 처리되지 못했어요. 새로고침 후 다시 시도해 주세요.
      </div>
    );
  }
  return (
    <div className="text-center py-6">
      <div className="text-3xl mb-2" aria-hidden>
        ✅
      </div>
      <div className="text-sm font-bold text-slate-100">응답 완료</div>
      {status === 'late' && (
        <div className="mt-1 text-xs text-amber-300">
          살짝 늦었지만 처리됐어요
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 활동 타입별 분기
// ─────────────────────────────────────────────────────────────
interface OverlayConfigPoll {
  readonly type: 'poll';
  readonly question: string;
  readonly options: readonly { id: string; label: string }[];
  readonly multiSelect: boolean;
}

interface OverlayConfigText {
  readonly type: 'text';
  readonly prompt: string;
  readonly maxLength: number;
}

interface OverlayConfigWordCloud {
  readonly type: 'wordcloud';
  readonly prompt: string;
  readonly maxKeywords: number;
}

function ResponseFormForOverlay({
  overlayId: _overlayId,
  config,
  disabled,
  onSubmit,
}: {
  overlayId: string;
  config: unknown;
  disabled: boolean;
  onSubmit: (data: unknown) => void;
}): JSX.Element {
  if (!isObject(config) || typeof config.type !== 'string') {
    return <UnsupportedActivityNotice />;
  }
  if (config.type === 'poll') {
    const poll = config as unknown as OverlayConfigPoll;
    return (
      <PollResponse
        question={poll.question}
        options={poll.options}
        multiSelect={poll.multiSelect}
        disabled={disabled}
        onSubmit={onSubmit}
      />
    );
  }
  if (config.type === 'text') {
    const text = config as unknown as OverlayConfigText;
    return (
      <TextResponse
        prompt={text.prompt}
        maxLength={text.maxLength}
        disabled={disabled}
        onSubmit={onSubmit}
      />
    );
  }
  if (config.type === 'wordcloud') {
    const wc = config as unknown as OverlayConfigWordCloud;
    return (
      <WordCloudResponse
        prompt={wc.prompt}
        maxKeywords={wc.maxKeywords}
        disabled={disabled}
        onSubmit={onSubmit}
      />
    );
  }
  return <UnsupportedActivityNotice />;
}

function UnsupportedActivityNotice(): JSX.Element {
  return (
    <div className="text-center text-sm text-slate-400 py-6">
      이 활동 유형은 아직 지원되지 않아요. 화면을 그대로 두세요.
    </div>
  );
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
