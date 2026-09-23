/**
 * 관찰 기록 응원 2·3차(ADR-137) — 한 주 정리·학기 돌아보기 창(메인 창에만 단다).
 *
 * 어느 창을 열지는 `useObservationPanelStore` 가 정한다(토스트·핀 줄·[잔디] 탭 단추·위젯 창에서 넘어온
 * 이동). 열 때마다 그때까지의 기록으로 다시 계산한다.
 */
import { useCallback, useState } from 'react';
import { useObservationPanelStore } from '@adapters/stores/useObservationPanelStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  useRecapTermRange,
  useTermRecap,
  useWeekRecap,
  type TermChoice,
} from '@adapters/hooks/useObservationRecap';
import { useTermWork, useWeekWorkLine } from '@adapters/hooks/useRecapWorkCounts';
import type { RecapCard } from '@adapters/hooks/observationRecap';
import { useObservationCheerAvailable } from '@adapters/hooks/useObservationCheerContext';
import { addDaysIso } from '@domain/rules/schoolCalendarDays';
import type { SchoolMoment } from '@domain/rules/schoolMoments';
import { toLocalDateString } from '@shared/utils/localDate';
import { requestHomeroomTab } from '../../Homeroom/homeroomTabIntent';
import { requestClassManagementTab } from '../../ClassManagement/classManagementTabIntent';
import { requestClassRecordView } from '../../ClassManagement/classRecordViewIntent';
import { RecapModalFrame } from './RecapModalFrame';
import { momentGreeting } from './cheerMessages';
import {
  TERM_RECAP_PIECES,
  WEEKLY_RECAP_PIECES,
  collectPieces,
  type MomentLine,
} from './recapPieces';
import { saveTermRecapPng } from './termRecapPng';

function md(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일`;
}

/** 창에 실린 학교 달력 인사 → 맨 위 한 줄(핀 줄·토스트와 같은 문구). */
function momentLine(moment: SchoolMoment | null | undefined): MomentLine | null {
  if (moment === null || moment === undefined) return null;
  return { look: moment.look, text: momentGreeting(moment, toLocalDateString(new Date())) };
}

function WeeklyRecapModal({
  week,
  moment,
  onClose,
}: {
  readonly week: string;
  readonly moment: MomentLine | null;
  readonly onClose: () => void;
}): JSX.Element {
  const observation = useWeekRecap(week);
  const workLine = useWeekWorkLine(week);
  const pieces = collectPieces(WEEKLY_RECAP_PIECES, { moment, week, observation, workLine });
  return (
    <RecapModalFrame
      onClose={onClose}
      title="한 주 정리"
      size="md"
      pieces={pieces}
      emptyMessage="이번 주는 조용했어요"
      header={
        <p className="px-6 pb-2 text-xs text-sp-muted">
          {md(week)} ~ {md(addDaysIso(week, 6))}
        </p>
      }
    />
  );
}

/** [초안 쓰러 가기] — 담임반은 담임 기록의 초안, 수업반은 그 반 수업 기록의 초안 보기로. */
function goToDraft(card: RecapCard): void {
  if (card.contextKind === 'homeroom') {
    requestHomeroomTab('recordDraft');
    window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'homeroom' }));
    return;
  }
  useTeachingClassStore.getState().selectClass(card.contextId);
  requestClassManagementTab('record');
  requestClassRecordView('draft');
  window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'class-management' }));
}

function TermRecapModal({
  includeWeek,
  moment,
  onClose,
}: {
  readonly includeWeek: string | null;
  readonly moment: MomentLine | null;
  readonly onClose: () => void;
}): JSX.Element {
  const [choice, setChoice] = useState<TermChoice>('current');
  const recap = useTermRecap(choice);
  const termRange = useRecapTermRange(choice);
  const work = useTermWork(termRange);
  const foldedWeek = choice === 'current' ? includeWeek : null;
  const thisWeek = useWeekRecap(foldedWeek);
  const thisWeekWorkLine = useWeekWorkLine(foldedWeek);
  const [saving, setSaving] = useState(false);

  const onGoDraft = useCallback(
    (card: RecapCard) => {
      onClose();
      goToDraft(card);
    },
    [onClose],
  );

  const pieces =
    recap === null
      ? []
      : collectPieces(TERM_RECAP_PIECES, {
          moment: choice === 'current' ? moment : null,
          recap,
          thisWeek,
          thisWeekWorkLine,
          work,
          onGoDraft,
        });

  const exportPng = async (): Promise<void> => {
    if (recap === null || saving) return;
    setSaving(true);
    try {
      await saveTermRecapPng(
        {
          termLabel: recap.termLabel,
          recordedWeeks: recap.recordedWeeks,
          lapTotal: recap.lapTotal,
          weeks: recap.grassWeeks,
          // 숫자만 넘긴다 — 반별 줄·할 일 안내는 화면에만 있다(돌아보기 spec 3-4).
          work:
            work === null ? null : { counts: work.counts, partialTodoTerm: work.partialTodoTerm },
        },
        (message, onOpen) =>
          useToastStore
            .getState()
            .show(
              message,
              'success',
              onOpen !== undefined ? { label: '파일 열기', onClick: onOpen } : undefined,
            ),
      );
    } catch {
      useToastStore.getState().show('그림을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <RecapModalFrame
      onClose={onClose}
      title="학기 돌아보기"
      size="xl"
      pieces={pieces}
      emptyMessage="아직 보여 줄 내용이 없어요"
      header={
        <div className="flex gap-2 px-6 pb-3" role="group" aria-label="학기 고르기">
          {(['current', 'previous'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setChoice(t)}
              aria-pressed={choice === t}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                choice === t
                  ? 'bg-sp-accent text-sp-accent-fg'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text'
              }`}
            >
              {t === 'current' ? '이번 학기' : '지난 학기'}
            </button>
          ))}
        </div>
      }
      footer={
        // 기록이 하나도 없는 학기는 빈 격자를 그림으로 권하지 않는다.
        recap !== null && recap.recordedWeeks > 0 ? (
          <button
            type="button"
            onClick={() => void exportPng()}
            disabled={saving}
            className="rounded-lg bg-sp-accent px-4 py-1.5 text-sm font-sp-semibold text-sp-accent-fg transition-all hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            그림으로 저장
          </button>
        ) : undefined
      }
    />
  );
}

export function ObservationRecapModals(): JSX.Element | null {
  const panel = useObservationPanelStore((s) => s.panel);
  const available = useObservationCheerAvailable();
  const close = useCallback(() => useObservationPanelStore.getState().close(), []);
  if (panel === null || !available) return null;
  const moment = momentLine(panel.moment);
  if (panel.kind === 'weekly') {
    return <WeeklyRecapModal week={panel.week} moment={moment} onClose={close} />;
  }
  return <TermRecapModal includeWeek={panel.includeWeek} moment={moment} onClose={close} />;
}
