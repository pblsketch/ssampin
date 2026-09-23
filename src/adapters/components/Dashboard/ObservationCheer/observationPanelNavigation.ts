/**
 * 관찰 기록 응원 2·3차(ADR-137) — 한 주 정리·학기 돌아보기 창 열기(창 경계를 넘는 배선).
 *
 * 창은 메인 창에만 그린다. 바탕화면 위젯 창에서 누르면 메인 창을 띄우는 이동 문자열
 * (`dashboard#observation-panel:<weekly|retrospect>`)로 보내고, 도착한 메인 창이
 * `openObservationPanelKind` 로 연다.
 *
 * ★`studentRecordNavigation` 을 가져오지 않는다 — 그 파일이 이 파일을 가져와 의도를 풀기 때문이다
 *   (서로 가져오면 순환한다). 이동 요청 두 줄은 같은 규칙으로 여기에 둔다.
 */
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
import { useObservationDayStore } from '@adapters/stores/useObservationDayStore';
import {
  useObservationPanelStore,
  type ObservationPanel,
} from '@adapters/stores/useObservationPanelStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { buildObservationPanelTarget } from '@adapters/utils/navigationTarget';
import { markTalkOpened, pendingTalk, type TalkOfDay } from '@domain/rules/proactiveTalk';
import type { SchoolMoment } from '@domain/rules/schoolMoments';
import { momentForToday } from '@adapters/hooks/useSchoolMoment';
import { addDaysIso, weekStartOf } from '@domain/rules/schoolCalendarDays';
import { resolveCurrentTerm } from '@domain/rules/schoolTermStart';
import { toLocalDateString } from '@shared/utils/localDate';

/** 알린 한 주 정리 가운데 가장 최근 주(없으면 null). */
function latestNotifiedWeek(notified: readonly string[]): string | null {
  let latest: string | null = null;
  for (const k of notified) {
    if (!k.startsWith('weekly:')) continue;
    const week = k.slice('weekly:'.length);
    if (latest === null || week > latest) latest = week;
  }
  return latest;
}

/**
 * [잔디] 탭의 [이번 주 정리]가 열 주 — 가장 최근에 알린 주를 다음 정리가 올 때까지 다시 연다.
 * 알린 주가 이번 주·지난주가 아니면(오래됐거나 없으면) 이번 주 지금까지.
 */
export function weeklyPanelWeek(notified: readonly string[], today: string): string {
  const thisWeek = weekStartOf(today);
  const latest = latestNotifiedWeek(notified);
  if (latest !== null && latest >= addDaysIso(thisWeek, -7)) return latest;
  return thisWeek;
}

/**
 * 말 한 건 → 열 창. 돌아보기에 한 주 정리가 조각으로 들어갔으면 그 주를 '이번 주'로.
 * 학교 달력 인사가 접혀 있으면 그 인사를 창 맨 위 한 줄로 싣는다(돌아보기 spec 4-4).
 */
export function panelForTalk(
  talk: TalkOfDay,
  moment: SchoolMoment | null = null,
): ObservationPanel {
  const folded = talk.folded.some((c) => c.kind === 'moment') ? moment : null;
  const withMoment = folded !== null ? { moment: folded } : {};
  if (talk.main.kind === 'weekly') return { kind: 'weekly', week: talk.main.key, ...withMoment };
  const week = talk.folded.find((c) => c.kind === 'weekly');
  return { kind: 'retrospect', term: talk.main.key, includeWeek: week?.key ?? null, ...withMoment };
}

function currentTerm(): string {
  const s = useSettingsStore.getState().settings;
  return resolveCurrentTerm({
    today: new Date(),
    termStartDates: s.termStartDates,
    currentTerm: s.currentTerm,
  });
}

function sendNavigation(target: string): void {
  const api = window.electronAPI;
  if (useDesktopWidgetContextStore.getState().isDesktopWidget && api?.navigateToPage) {
    void api.navigateToPage(target);
    return;
  }
  window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: target }));
}

/** 오늘 말이 그 종류면 '열어 봤음'으로 적는다(핀 줄의 알림 문구가 걷힌다). */
function markOpenedIf(kind: string): void {
  const today = toLocalDateString(new Date());
  const store = useObservationDayStore.getState();
  const pending = pendingTalk(store.talk, today);
  if (pending !== null && pending.main.kind === kind) {
    store.updateTalk((s) => markTalkOpened(s, today));
  }
}

/**
 * 학교 달력 인사가 그날의 말이면 '열어 봄'으로 적는다 — 인사는 여는 창이 없다(돌아보기 spec 4-4).
 * 핀 줄 한마디·인사 토스트를 눌렀을 때 부른다. 핀 모습은 그날 그대로 남는다.
 */
export function dismissTodayMoment(): void {
  markOpenedIf('moment');
}

/** 이 창에서 종류만 보고 연다 — 오늘 말이 그 종류면 그 말대로, 아니면 탭 단추 규칙대로. */
export function openObservationPanelKind(kind: 'weekly' | 'retrospect'): void {
  markOpenedIf(kind);
  const today = toLocalDateString(new Date());
  const talk = useObservationDayStore.getState().talk;
  const talkToday = talk.decidedDate === today ? talk.talk : null;
  if (talkToday !== null && talkToday.main.kind === kind) {
    useObservationPanelStore.getState().open(panelForTalk(talkToday, momentForToday(today)));
    return;
  }
  if (kind === 'weekly') {
    useObservationPanelStore
      .getState()
      .open({ kind: 'weekly', week: weeklyPanelWeek(talk.notified, today) });
    return;
  }
  useObservationPanelStore
    .getState()
    .open({ kind: 'retrospect', term: currentTerm(), includeWeek: null });
}

/**
 * 한 주 정리·학기 돌아보기를 연다(토스트·핀 줄·[잔디] 탭 단추). 바탕화면 위젯 창이면 메인 창을
 * 띄워서 연다(위젯 창에는 이 창을 그리지 않는다).
 */
export function requestObservationPanel(kind: 'weekly' | 'retrospect'): void {
  if (useDesktopWidgetContextStore.getState().isDesktopWidget) {
    markOpenedIf(kind);
    sendNavigation(buildObservationPanelTarget(kind));
    return;
  }
  openObservationPanelKind(kind);
}
