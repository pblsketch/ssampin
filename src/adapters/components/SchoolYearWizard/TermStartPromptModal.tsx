/**
 * 8월 접속 시 "2학기가 시작됐나요?" 확인 팝업.
 *
 * 개학일 설정을 만들어 둬도 **학기가 틀린 줄 모르는 선생님은 설정에 들어올 이유가 없다.**
 * 그래서 앱이 먼저 묻는다 — 단, 앱이 어느 쪽인지 확신할 수 없는 8월에만, 한 학기에 한 번만
 * (판정은 `domain/rules/termStartPrompt`).
 *
 * 묻는 김에 **학사일정에서 찾은 개학일을 기본값으로 채워** 두므로, 대개는 날짜를 확인하고
 * 버튼 한 번 누르면 끝난다. 학사일정이 없으면 빈 칸에서 직접 고르거나 그냥 넘길 수 있다.
 */

import { useCallback, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { formatTermKo } from '@domain/rules/academicCalendar';
import { toLocalIsoDate } from '@domain/rules/schoolTermStart';
import { decideTermStartPrompt } from '@domain/rules/termStartPrompt';
import { findTermStartCandidates } from '@domain/rules/termStartFromSchedule';
import { useCurrentTerm } from '@adapters/hooks/useCurrentTerm';

/** 'YYYY-MM-DD' → '8월 18일' */
function formatMonthDayKo(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m === null ? iso : `${Number(m[1])}월 ${Number(m[2])}일`;
}

export function TermStartPromptModal() {
  const settings = useSettingsStore((s) => s.settings);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const updateSettings = useSettingsStore((s) => s.update);
  const events = useEventsStore((s) => s.events);
  const showToast = useToastStore((s) => s.show);
  const currentTerm = useCurrentTerm();

  const todayIso = toLocalIsoDate(new Date());

  const decision = useMemo(
    () =>
      settingsLoaded
        ? decideTermStartPrompt({
            todayIso,
            currentTerm,
            termStartDates: settings.termStartDates,
            skippedTerm: settings.termStartPromptSkipped,
          })
        : ({ kind: 'none' } as const),
    [
      settingsLoaded,
      todayIso,
      currentTerm,
      settings.termStartDates,
      settings.termStartPromptSkipped,
    ],
  );

  const askTerm = decision.kind === 'ask' ? decision.term : null;

  /** 학사일정에서 찾은 개학일 — 있으면 기본값. */
  const candidate = useMemo(() => {
    if (askTerm === null) return null;
    return (
      findTermStartCandidates(
        events.map((e) => ({ date: e.date, title: e.title, neisEventName: e.neis?.eventName })),
        [askTerm],
      )[0] ?? null
    );
  }, [events, askTerm]);

  /** null이면 아직 후보를 반영하기 전 — 렌더 시 후보로 초기화한다. */
  const [picked, setPicked] = useState<string | null>(null);
  const startDate = picked ?? candidate?.startIso ?? '';

  const [saving, setSaving] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (askTerm === null || startDate === '') return;
    setSaving(true);
    try {
      await updateSettings({
        termStartDates: { ...(settings.termStartDates ?? {}), [askTerm]: startDate },
      });
      showToast(`${formatTermKo(askTerm)} 기준으로 맞췄어요`);
    } finally {
      setSaving(false);
    }
  }, [askTerm, startDate, settings.termStartDates, updateSettings, showToast]);

  const handleSkip = useCallback(() => {
    if (askTerm === null) return;
    void updateSettings({ termStartPromptSkipped: askTerm });
  }, [askTerm, updateSettings]);

  if (askTerm === null) return null;

  return (
    <Modal isOpen onClose={handleSkip} title="학기 확인" size="sm" srOnlyTitle>
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-sp-surface p-3">
            <span aria-hidden className="material-symbols-outlined text-3xl text-sp-accent">
              calendar_month
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-sp-text">
              {formatTermKo(askTerm)}가 시작됐나요?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-sp-muted">
              학교마다 개학일이 달라서 쌤핀이 혼자 알 수는 없어요. 개학일을 알려 주시면 시간표 갱신
              안내와 &lsquo;이번 학기&rsquo; 통계가 그 날짜에 맞춰져요.
            </p>

            {candidate !== null && (
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-sp-muted">
                <span aria-hidden className="material-symbols-outlined text-sm text-sp-accent">
                  event_available
                </span>
                <span>
                  학사일정의 &lsquo;{candidate.sourceLabel}&rsquo;(
                  {formatMonthDayKo(candidate.startIso)})에서 찾은 날짜예요.
                </span>
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label htmlFor="term-prompt-date" className="text-sm text-sp-muted">
                개학일
              </label>
              <input
                id="term-prompt-date"
                type="date"
                value={startDate}
                onChange={(e) => setPicked(e.target.value)}
                className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                style={{ colorScheme: 'light dark' }}
              />
              <button
                type="button"
                onClick={() => setPicked(todayIso)}
                className="rounded-lg border border-sp-border px-3 py-1.5 text-xs font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
              >
                오늘부터
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={startDate === '' || saving}
                className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95 disabled:opacity-40"
              >
                {saving ? '맞추는 중…' : '네, 이 날짜로 맞춰 주세요'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
              >
                아직이에요
              </button>
            </div>
            <p className="mt-3 text-xs text-sp-muted">
              나중에 설정 &gt; 학년도/학기에서 언제든 바꿀 수 있어요.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
