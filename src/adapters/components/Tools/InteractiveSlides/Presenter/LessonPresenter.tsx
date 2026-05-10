/**
 * LessonPresenter — 수업 진행 화면 (Plan §2-1 ③ 단계).
 *
 * - 슬라이드 + 활동 영역 (read-only)
 * - 점진적 노출 컨트롤 바 (활동 유무 / 활동 상태별 분기)
 * - 우측 학생 명부 패널
 * - 활성화 / 종료 / 수업 종료 확인 다이얼로그
 * - 외부 인터넷 노출 시 빨간 배지
 */

import { useEffect, useMemo, useState } from 'react';
import type {
  AggregatedResultData,
  InteractiveLesson,
  ResultsVisibility,
  Slide,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import type { OverlayId } from '@domain/valueObjects/InteractiveSlidesIds';
import { useSlidesSessionStore } from '@adapters/stores/useSlidesSessionStore';
import { useInteractiveLessonStore } from '@adapters/stores/useInteractiveLessonStore';
import { SlideCanvas, overlayTypeIcon, overlayTypeLabel } from '../Editor/SlideCanvas';
import {
  ActivateConfirmDialog,
  DeactivateConfirmDialog,
  EndLessonConfirmDialog,
} from './dialogs';

export interface LessonPresenterProps {
  readonly lesson: InteractiveLesson;
  readonly onSessionEnd: () => void;
}

export function LessonPresenter({
  lesson,
  onSessionEnd,
}: LessonPresenterProps): JSX.Element {
  const currentSlideIndex = useSlidesSessionStore((s) => s.currentSlideIndex);
  const accessMode = useSlidesSessionStore((s) => s.accessMode);
  const status = useSlidesSessionStore((s) => s.status);
  const totalOnline = useSlidesSessionStore((s) => s.totalOnline);
  const students = useSlidesSessionStore((s) => s.students);
  const liveResults = useSlidesSessionStore((s) => s.liveResults);
  const liveRespondCounts = useSlidesSessionStore((s) => s.liveRespondCounts);
  const closedResults = useSlidesSessionStore((s) => s.closedResults);
  const resultsVisibility = useSlidesSessionStore((s) => s.resultsVisibility);
  const setResultsVisibility = useSlidesSessionStore((s) => s.setResultsVisibility);
  const advanceSlide = useSlidesSessionStore((s) => s.advanceSlide);
  const activateOverlay = useSlidesSessionStore((s) => s.activateOverlay);
  const deactivateOverlay = useSlidesSessionStore((s) => s.deactivateOverlay);
  const endLesson = useSlidesSessionStore((s) => s.endLesson);
  const cloneOverlayForRecreate = useInteractiveLessonStore(
    (s) => s.cloneOverlayForRecreate,
  );

  const [pendingActivate, setPendingActivate] = useState<OverlayId | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<OverlayId | null>(null);
  const [pendingEnd, setPendingEnd] = useState(false);
  const [showRoster, setShowRoster] = useState(true);

  // 교사 heartbeat 5초 주기 (Plan §7.4) — 10초 누락 시 학생에게 disconnected broadcast
  useEffect(() => {
    const api = window.electronAPI?.interactiveSlides;
    if (!api?.teacherHeartbeat) return;
    void api.teacherHeartbeat(); // 즉시 1회
    const id = setInterval(() => void api.teacherHeartbeat(), 5_000);
    return () => clearInterval(id);
  }, []);

  const currentSlide: Slide | undefined = lesson.slides[currentSlideIndex];

  // 활성 오버레이 ID 집합 (liveResults 키로 추론 — 활성 + 진행 중 활동)
  const activeOverlayIdsOnSlide = useMemo<ReadonlySet<OverlayId>>(() => {
    if (!currentSlide) return new Set();
    const set = new Set<OverlayId>();
    for (const overlay of currentSlide.overlays) {
      if (closedResults.has(overlay.id)) continue;
      // liveRespondCounts에 들어있으면 활성 (또는 일단 응답 받기 시작)
      // 더 정확한 판정은 store에 activeOverlayIds 별도 필드 추가 시 가능
      if (liveRespondCounts.has(overlay.id) || liveResults.has(overlay.id)) {
        set.add(overlay.id);
      }
    }
    return set;
  }, [currentSlide, closedResults, liveRespondCounts, liveResults]);

  const activeOverlayIdGlobal = useMemo<OverlayId | null>(() => {
    // Phase 1: 슬라이드당 1개 활성 → 첫 번째만
    return activeOverlayIdsOnSlide.values().next().value ?? null;
  }, [activeOverlayIdsOnSlide]);

  const handlePrev = (): void => {
    if (currentSlideIndex > 0) void advanceSlide(currentSlideIndex - 1);
  };
  const handleNext = (): void => {
    if (currentSlideIndex < lesson.slides.length - 1)
      void advanceSlide(currentSlideIndex + 1);
  };

  const handleActivateConfirmed = (): void => {
    if (!pendingActivate) return;
    void activateOverlay(pendingActivate);
    setPendingActivate(null);
  };

  const handleDeactivateConfirmed = (): void => {
    if (!pendingDeactivate) return;
    void deactivateOverlay(pendingDeactivate);
    setPendingDeactivate(null);
  };

  const handleCloseAndRecreate = (): void => {
    if (!pendingDeactivate) return;
    void deactivateOverlay(pendingDeactivate);
    void cloneOverlayForRecreate(lesson.id, pendingDeactivate);
    setPendingDeactivate(null);
  };

  const handleEndConfirmed = async (): Promise<void> => {
    await endLesson();
    onSessionEnd();
  };

  // 키보드 단축키 (← → 슬라이드 전환)
  // 단순화: window keyDown 등록 생략. UX [10]에서는 Kbd 컴포넌트로 안내 표시 가능.

  return (
    <div className="flex flex-col h-full bg-sp-bg text-sp-text">
      <PresenterTopBar accessMode={accessMode} status={status} />

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative p-4 min-h-0">
            {currentSlide ? (
              <SlideCanvas
                slide={currentSlide}
                mode="present"
                activeOverlayIds={activeOverlayIdsOnSlide}
                liveResults={liveResults}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sp-muted">
                슬라이드가 없습니다.
              </div>
            )}
          </div>

          <PresenterControlBar
            currentIndex={currentSlideIndex}
            totalSlides={lesson.slides.length}
            currentSlide={currentSlide ?? null}
            activeOverlayId={activeOverlayIdGlobal}
            closedResults={closedResults}
            resultsVisibility={resultsVisibility}
            liveRespondCounts={liveRespondCounts}
            onPrev={handlePrev}
            onNext={handleNext}
            onActivateOverlay={(id) => setPendingActivate(id)}
            onDeactivateOverlay={(id) => setPendingDeactivate(id)}
            onChangeVisibility={setResultsVisibility}
            onEndLesson={() => setPendingEnd(true)}
            onToggleRoster={() => setShowRoster((v) => !v)}
          />
        </main>

        {showRoster && (
          <StudentRosterPanel
            totalOnline={totalOnline}
            students={students}
            onClose={() => setShowRoster(false)}
          />
        )}
      </div>

      <ActivateConfirmDialog
        isOpen={pendingActivate !== null}
        onClose={() => setPendingActivate(null)}
        onConfirm={handleActivateConfirmed}
      />
      <DeactivateConfirmDialog
        isOpen={pendingDeactivate !== null}
        onClose={() => setPendingDeactivate(null)}
        onConfirm={handleDeactivateConfirmed}
        onCloseAndRecreate={handleCloseAndRecreate}
      />
      <EndLessonConfirmDialog
        isOpen={pendingEnd}
        onClose={() => setPendingEnd(false)}
        onConfirm={() => void handleEndConfirmed()}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PresenterTopBar — 외부 노출 / 끊김 상태 배지
// ─────────────────────────────────────────────────────────────
interface PresenterTopBarProps {
  readonly accessMode: 'lan' | 'tunnel' | null;
  readonly status: string;
}

function PresenterTopBar({
  accessMode,
  status,
}: PresenterTopBarProps): JSX.Element | null {
  const hasNotice = accessMode === 'tunnel' || status === 'archived';
  if (!hasNotice) return null;

  return (
    <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-400/40 text-xs text-amber-200">
      {accessMode === 'tunnel' && (
        <span>🌐 외부 인터넷 노출 중 — 학생 PII가 인터넷 경유</span>
      )}
      {status === 'archived' && (
        <span className="ml-3">⏹ 수업이 종료되었습니다</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PresenterControlBar — 점진적 노출
// ─────────────────────────────────────────────────────────────
interface PresenterControlBarProps {
  readonly currentIndex: number;
  readonly totalSlides: number;
  readonly currentSlide: Slide | null;
  readonly activeOverlayId: OverlayId | null;
  readonly closedResults: ReadonlyMap<OverlayId, unknown>;
  readonly resultsVisibility: ResultsVisibility;
  readonly liveRespondCounts: ReadonlyMap<
    OverlayId,
    { respondCount: number; totalCount: number }
  >;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onActivateOverlay: (overlayId: OverlayId) => void;
  readonly onDeactivateOverlay: (overlayId: OverlayId) => void;
  readonly onChangeVisibility: (v: ResultsVisibility) => void;
  readonly onEndLesson: () => void;
  readonly onToggleRoster: () => void;
}

function PresenterControlBar({
  currentIndex,
  totalSlides,
  currentSlide,
  activeOverlayId,
  closedResults,
  resultsVisibility,
  liveRespondCounts,
  onPrev,
  onNext,
  onActivateOverlay,
  onDeactivateOverlay,
  onChangeVisibility,
  onEndLesson,
  onToggleRoster,
}: PresenterControlBarProps): JSX.Element {
  // 활동 상태 판정
  const slideOverlays: readonly SlideOverlay[] = currentSlide?.overlays ?? [];
  const hasOverlays = slideOverlays.length > 0;

  // 활성 활동 (Phase 1: 슬라이드당 1개)
  const activeOverlay = activeOverlayId
    ? slideOverlays.find((o) => o.id === activeOverlayId) ?? null
    : null;

  // 비활성 + 닫히지 않은 활동 (시작 가능)
  const startable = slideOverlays.filter(
    (o) => o.id !== activeOverlayId && !closedResults.has(o.id),
  );

  // 닫힌 활동 (결과 보기 가능)
  const closedOnSlide = slideOverlays.filter((o) => closedResults.has(o.id));

  const respondCounts = activeOverlayId
    ? liveRespondCounts.get(activeOverlayId)
    : undefined;

  return (
    <footer className="flex items-center gap-3 px-4 py-3 bg-sp-card/90 backdrop-blur-sm border-t border-sp-border">
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sm hover:border-sp-accent disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ◀ 이전
      </button>
      <div className="text-sm text-sp-text font-mono">
        {totalSlides > 0 ? `${currentIndex + 1} / ${totalSlides}` : '0 / 0'}
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={currentIndex >= totalSlides - 1}
        className="px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sm hover:border-sp-accent disabled:opacity-30 disabled:cursor-not-allowed"
      >
        다음 ▶
      </button>

      {/* 활동 컨트롤 — 점진적 노출 */}
      {hasOverlays && (
        <div className="flex items-center gap-2 ml-3 pl-3 border-l border-sp-border">
          {activeOverlay && (
            <>
              <span className="text-xs text-sp-muted" aria-hidden>
                {overlayTypeIcon(activeOverlay.type)}
              </span>
              <span className="text-xs text-sp-text">
                {overlayTypeLabel(activeOverlay.type)} 진행 중
              </span>
              {respondCounts && (
                <span className="text-xs text-sp-muted">
                  · {respondCounts.respondCount}/{respondCounts.totalCount} 응답
                </span>
              )}
              <ResultsVisibilityRadio
                value={resultsVisibility}
                onChange={onChangeVisibility}
              />
              <button
                type="button"
                onClick={() => onDeactivateOverlay(activeOverlay.id)}
                className="px-3 py-1.5 bg-amber-500/20 border border-amber-400/50 text-amber-200 rounded-lg text-xs hover:bg-amber-500/30"
              >
                활동 종료
              </button>
            </>
          )}

          {!activeOverlay && startable.length > 0 && (
            <>
              {startable.map((overlay) => (
                <button
                  key={overlay.id}
                  type="button"
                  onClick={() => onActivateOverlay(overlay.id)}
                  className="px-3 py-1.5 bg-sp-accent text-white rounded-lg text-xs font-bold hover:bg-sp-accent/90"
                >
                  {overlayTypeIcon(overlay.type)} {overlayTypeLabel(overlay.type)} 시작
                </button>
              ))}
            </>
          )}

          {!activeOverlay && startable.length === 0 && closedOnSlide.length > 0 && (
            <span className="text-xs text-sp-muted">
              {overlayTypeIcon(closedOnSlide[0]!.type)}{' '}
              {overlayTypeLabel(closedOnSlide[0]!.type)} 종료됨
            </span>
          )}
        </div>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={onToggleRoster}
        className="px-3 py-2 bg-sp-bg border border-sp-border rounded-lg text-sm hover:border-sp-accent"
        aria-label="학생 명부 보기 토글"
      >
        👥 명부
      </button>
      <button
        type="button"
        onClick={onEndLesson}
        className="px-3 py-2 bg-sp-bg border border-red-400/50 text-red-300 rounded-lg text-sm hover:bg-red-500/10"
      >
        수업 종료
      </button>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────
// ResultsVisibilityRadio — 비공개/익명/전체
// ─────────────────────────────────────────────────────────────
interface ResultsVisibilityRadioProps {
  readonly value: ResultsVisibility;
  readonly onChange: (v: ResultsVisibility) => void;
}

const VISIBILITY_LABELS: Record<ResultsVisibility, { label: string; icon: string }> = {
  hidden: { label: '비공개', icon: '🔒' },
  anonymous: { label: '익명', icon: '👤' },
  full: { label: '전체', icon: '👁' },
};

function ResultsVisibilityRadio({
  value,
  onChange,
}: ResultsVisibilityRadioProps): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="결과 공개 모드"
      className="inline-flex bg-sp-bg border border-sp-border rounded-lg overflow-hidden"
    >
      {(['hidden', 'anonymous', 'full'] as const).map((v) => {
        const isActive = v === value;
        const { label, icon } = VISIBILITY_LABELS[v];
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(v)}
            className={`px-2.5 py-1 text-xs ${
              isActive
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text'
            }`}
            title={label}
          >
            <span aria-hidden>{icon}</span>
            <span className="ml-1 hidden xl:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StudentRosterPanel — 우측 학생 명부
// ─────────────────────────────────────────────────────────────
interface StudentRosterPanelProps {
  readonly totalOnline: number;
  readonly students: ReadonlyMap<string, { studentName: string; online: boolean }>;
  readonly onClose: () => void;
}

function StudentRosterPanel({
  totalOnline,
  students,
  onClose,
}: StudentRosterPanelProps): JSX.Element {
  const list = Array.from(students.values()).sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.studentName.localeCompare(b.studentName);
  });

  return (
    <aside className="w-[280px] flex-shrink-0 bg-sp-surface border-l border-sp-border flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-sp-border">
        <div>
          <div className="text-xs text-sp-muted">접속 중</div>
          <div className="text-base font-bold text-sp-text">{totalOnline}명</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-sp-muted hover:text-sp-text"
          aria-label="명부 닫기"
        >
          ✕
        </button>
      </header>

      {list.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-sp-muted px-4 text-center">
          학생들이 입장하면 여기에 나타나요.
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto p-2 space-y-1">
          {list.map((s, idx) => (
            <li
              key={`${s.studentName}-${idx}`}
              className="flex items-center gap-2 px-3 py-1.5 bg-sp-bg rounded-lg"
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.online ? 'bg-emerald-400' : 'bg-sp-muted'
                }`}
                aria-hidden
              />
              <span className="text-sm text-sp-text truncate">
                {s.studentName}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// 미사용 import 차단용 (AggregatedResultData는 향후 PollResultChart 등에서 활용 예정)
void ({} as AggregatedResultData);
