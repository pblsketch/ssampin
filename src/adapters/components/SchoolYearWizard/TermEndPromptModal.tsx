/**
 * 진도 관리 화면 첫 진입 시 "이번 학기는 언제 끝나나요?" 확인 팝업.
 *
 * 학기 총 차시를 세려면 시작과 끝이 둘 다 필요한데, 앱은 끝을 알 수 없다(ADR-037 — 방학
 * 날짜는 학교마다 다르다). 그래서 개학일 팝업(`TermStartPromptModal`)과 **똑같은 방식**으로
 * 묻는다: 학사일정에서 찾은 방학식·종업식을 기본값으로 채워 두고, 사용자가 확인해야 저장한다.
 *
 * ## 왜 앱 시작이 아니라 진도 화면에서 묻나
 *
 * 종료일은 오직 진도 관리 화면에서만 쓰인다. 앱을 켤 때마다 물으면 진도를 안 쓰는 선생님에게는
 * 평생 필요 없는 잔소리가 된다. 그래서 **이 컴포넌트는 진도 화면 안에 마운트한다** —
 * 화면을 벗어나면 언마운트되며 큐에서도 빠지므로, "지금 이 화면에 있다"는 신호를 따로 들고
 * 다닐 필요가 없다.
 *
 * (계획서는 App.tsx에 두고 별도 신호를 넘기는 안이었다. 화면 안에 두면 신호가 어긋날 여지 자체가
 *  없고 온보딩 중에는 이 화면에 도달할 수 없어 `isFirstRun` 가드도 불필요하므로 이쪽을 택했다.)
 *
 * ## 모달 큐 등록은 선택이 아니다
 *
 * 8월에 처음 쓰는 선생님은 개학일도 종료일도 비어 있어 **두 팝업의 조건이 동시에 참**이 된다.
 * 코디네이터는 등록된 것끼리만 줄을 세우므로 둘 다 등록해야 하며, 안 그러면 focus trap 두 개가
 * 겹쳐 입력이 먹통이 되는 2026-08 온보딩 사고가 그대로 재현된다.
 */

import { useCallback, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { formatTermKo } from '@domain/rules/academicCalendar';
import { decideTermEndPrompt } from '@domain/rules/termEndPrompt';
import { findTermEndCandidates } from '@domain/rules/termEndFromSchedule';
import { useCurrentTerm } from '@adapters/hooks/useCurrentTerm';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';

/** 'YYYY-MM-DD' → '12월 31일' */
function formatMonthDayKo(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m === null ? iso : `${Number(m[1])}월 ${Number(m[2])}일`;
}

export function TermEndPromptModal() {
  const settings = useSettingsStore((s) => s.settings);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const updateSettings = useSettingsStore((s) => s.update);
  const events = useEventsStore((s) => s.events);
  const showToast = useToastStore((s) => s.show);
  const currentTerm = useCurrentTerm();

  const decision = useMemo(
    () =>
      settingsLoaded
        ? decideTermEndPrompt({
            currentTerm,
            termEndDates: settings.termEndDates,
            skippedTerm: settings.termEndPromptSkipped,
            // 이 컴포넌트가 살아 있다는 것 자체가 "진도 화면에 있다"는 신호다.
            progressViewOpened: true,
          })
        : ({ kind: 'none' } as const),
    [settingsLoaded, currentTerm, settings.termEndDates, settings.termEndPromptSkipped],
  );

  const askTerm = decision.kind === 'ask' ? decision.term : null;

  const isHead = useRegisterModal('TERM_END_PROMPT', askTerm !== null);

  /** 학사일정에서 찾은 종료일 후보 — 있으면 기본값. */
  const candidate = useMemo(() => {
    if (askTerm === null) return null;
    return (
      findTermEndCandidates(
        events.map((e) => ({ date: e.date, title: e.title, neisEventName: e.neis?.eventName })),
        [askTerm],
      )[0] ?? null
    );
  }, [events, askTerm]);

  /** null이면 아직 후보를 반영하기 전 — 렌더 시 후보로 초기화한다. */
  const [picked, setPicked] = useState<string | null>(null);
  const endDate = picked ?? candidate?.endIso ?? '';

  const [saving, setSaving] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (askTerm === null || endDate === '') return;
    setSaving(true);
    try {
      await updateSettings({
        termEndDates: { ...(settings.termEndDates ?? {}), [askTerm]: endDate },
      });
      showToast(`${formatTermKo(askTerm)} 마지막 수업일을 ${formatMonthDayKo(endDate)}로 맞췄어요`);
    } finally {
      setSaving(false);
    }
  }, [askTerm, endDate, settings.termEndDates, updateSettings, showToast]);

  const handleSkip = useCallback(() => {
    if (askTerm === null) return;
    void updateSettings({ termEndPromptSkipped: askTerm });
  }, [askTerm, updateSettings]);

  if (askTerm === null || !isHead) return null;

  return (
    <Modal isOpen onClose={handleSkip} title="학기 마지막 수업일 확인" size="sm" srOnlyTitle>
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-xl bg-sp-surface p-3">
            <span aria-hidden className="material-symbols-outlined text-3xl text-sp-accent">
              event_busy
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-sp-text">
              {formatTermKo(askTerm)} 수업은 언제까지인가요?
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-sp-muted">
              이번 학기에 수업이 몇 차시인지 세려면 마지막 수업일이 필요해요. 방학 날짜는 학교마다
              달라서 쌤핀이 혼자 정하지 않아요.
            </p>

            {candidate !== null && (
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-sp-muted">
                <span aria-hidden className="material-symbols-outlined text-sm text-sp-accent">
                  event_available
                </span>
                <span>
                  학사일정의 &lsquo;{candidate.sourceLabel}&rsquo;(
                  {formatMonthDayKo(candidate.endIso)})에서 찾은 날짜예요.
                </span>
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label htmlFor="term-end-prompt-date" className="text-sm text-sp-muted">
                마지막 수업일
              </label>
              <input
                id="term-end-prompt-date"
                type="date"
                value={endDate}
                onChange={(e) => setPicked(e.target.value)}
                className="rounded-lg border border-sp-border bg-sp-bg px-3 py-1.5 text-sm text-sp-text focus:border-sp-accent focus:outline-none"
                style={{ colorScheme: 'light dark' }}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={endDate === '' || saving}
                className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-semibold text-sp-accent-fg transition-all duration-sp-base ease-sp-out hover:brightness-110 active:scale-95 disabled:opacity-40"
              >
                {saving ? '맞추는 중…' : '네, 이 날짜까지예요'}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="rounded-lg border border-sp-border px-4 py-2 text-sm font-sp-medium text-sp-muted transition-all duration-sp-base ease-sp-out hover:text-sp-text active:scale-95"
              >
                나중에 할게요
              </button>
            </div>
            <p className="mt-3 text-xs text-sp-muted">
              넘기시면 차시 계산만 잠시 쉬어요. 설정 &gt; 학년도/학기에서 언제든 알려 주실 수
              있어요.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
