// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />
/**
 * 학교 달력 인사(돌아보기 spec 4, 설계 recap-work-and-moments §3·§4·§6) — 인사 문구, 핀 줄·토스트의
 * 인사와 그날 핀 모습, 겹친 날 창 맨 위 인사 한 줄.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useLapMarkStore } from '@adapters/stores/useLapMarkStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useRecordReminderStore } from '@adapters/stores/useRecordReminderStore';
import { useObservationDayStore, TALK_KEY } from '@adapters/stores/useObservationDayStore';
import { useObservationPanelStore } from '@adapters/stores/useObservationPanelStore';
import { CHEER_STORAGE_KEY } from '@adapters/stores/observationCheerSignal';
import { ToastContainer, useToastStore } from '@adapters/components/common/Toast';
import { DEFAULT_REMINDER_SETTINGS } from '@domain/entities/RecordReminder';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import {
  EMPTY_TALK_STATE,
  decideTalk,
  pendingTalk,
  type TalkCandidate,
} from '@domain/rules/proactiveTalk';
import { TALK_SETTLE_MS } from '@adapters/hooks/useObservationDaily';
import { CheerPinLine } from './CheerPinLine';
import { ObservationTalkHost } from './ObservationTalkHost';
import { ObservationRecapModals } from './ObservationRecapModals';
import { ieyo, momentGreeting, talkNotice } from './cheerMessages';
import { panelForTalk } from './observationPanelNavigation';

vi.mock('@adapters/hooks/consultationRecapFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@adapters/hooks/consultationRecapFetch')>()),
  fetchConsultationCount: vi.fn(async () => null),
}));

const noop = async (): Promise<void> => {};
/** 2026-10-14(수) — 체육대회 날. 공휴일·방학이 아닌 등교일 */
const DAY = '2026-10-14';
const SPORTS_DAY_LINE = '오늘은 체육대회예요. 무사히 잘 마치시길!';

function neisEvent(id: string, title: string, date: string): SchoolEvent {
  return { id, title, date, category: 'school', source: 'neis' };
}

function decide(candidates: TalkCandidate[]): void {
  window.localStorage.setItem(
    TALK_KEY,
    JSON.stringify(decideTalk(EMPTY_TALK_STATE, DAY, candidates)),
  );
  useObservationDayStore.getState().refresh();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0));
  window.localStorage.clear();
  useObservationDayStore.getState().refresh();
  useObservationPanelStore.setState({ panel: null });
  useSettingsStore.setState({
    loaded: true,
    settings: {
      ...useSettingsStore.getState().settings,
      className: '2학년 3반',
      schoolLevel: 'middle',
      termStartDates: { '2026-1': '2026-03-02', '2026-2': '2026-08-18' },
      recordReminder: { ...DEFAULT_REMINDER_SETTINGS, enabled: true, weekdays: [] },
    },
  });
  useStudentStore.setState({
    students: [{ id: 'a', name: '김가람', studentNumber: 1 }],
    loaded: true,
    load: noop,
  });
  useTeachingClassStore.setState({
    classes: [],
    progressEntries: [],
    loaded: true,
    load: noop,
  });
  useStudentRecordsStore.setState({ records: [], loaded: true, load: noop });
  useObservationStore.setState({ records: [], loaded: true, load: noop });
  useLapMarkStore.setState({ marks: [], loaded: true, load: noop });
  useTodoStore.setState({ todos: [], loaded: true, load: noop });
  useEventsStore.setState({
    events: [neisEvent('e1', '체육대회', DAY)],
    loaded: true,
    load: noop,
  });
  useRecordReminderStore.setState({ pausedUntil: null });
});

afterEach(() => {
  cleanup();
  act(() => {
    for (const t of useToastStore.getState().toasts) useToastStore.getState().dismiss(t.id);
  });
  vi.useRealTimers();
});

describe('인사 문구', () => {
  const base = { title: null, targetDate: DAY, term: '2026-2' } as const;

  it('받침에 따라 이에요/예요를 고르고, 일정 제목 끝 괄호는 뗀다', () => {
    expect(ieyo('체육대회')).toBe('예요');
    expect(ieyo('수학여행')).toBe('이에요');
    expect(momentGreeting({ ...base, kind: 'schoolEvent', title: '수학여행(1일차)' }, DAY)).toBe(
      '오늘은 수학여행이에요. 무사히 잘 마치시길!',
    );
  });

  it('수능·앞당긴 스승의 날은 "내일"이 아니라 날짜로 말한다', () => {
    expect(
      momentGreeting({ ...base, kind: 'suneungEve', targetDate: '2026-11-19' }, '2026-11-18'),
    ).toBe('11월 19일은 수능이에요. 감독 가시는 선생님들 힘내세요');
    expect(
      momentGreeting({ ...base, kind: 'teachersDay', targetDate: '2027-05-15' }, '2027-05-14'),
    ).toBe('5월 15일은 스승의 날이에요. 애쓰시는 선생님, 고맙습니다');
    expect(
      momentGreeting({ ...base, kind: 'teachersDay', targetDate: '2026-05-15' }, '2026-05-15'),
    ).toBe('오늘은 스승의 날이에요. 애쓰시는 선생님, 고맙습니다');
  });

  it('방학 전날은 제목·달로 계절을 가리고, 모르면 계절을 말하지 않는다', () => {
    const eve = { ...base, kind: 'vacationEve' } as const;
    expect(momentGreeting({ ...eve, title: '여름방학식' }, '2026-07-17')).toBe(
      '여름방학이 시작돼요. 푹 쉬고 만나요',
    );
    expect(momentGreeting({ ...eve, title: '방학식' }, '2026-12-30')).toBe(
      '겨울방학이 시작돼요. 따뜻하게 보내세요',
    );
    expect(momentGreeting({ ...eve, title: '종업식' }, '2027-02-12')).toBe(
      '한 학년을 마무리하는 날이에요. 정말 고생 많으셨어요',
    );
    expect(momentGreeting({ ...eve, title: '방학식' }, '2026-10-14')).toBe(
      '방학이 시작돼요. 푹 쉬고 만나요',
    );
  });

  it('학기 첫날은 1학기·2학기를 가른다', () => {
    expect(momentGreeting({ ...base, kind: 'termStart', term: '2026-1' }, DAY)).toBe(
      '새 학기가 시작됐어요. 좋은 한 해 보내세요',
    );
    expect(momentGreeting({ ...base, kind: 'termStart' }, DAY)).toBe(
      '2학기가 시작됐어요. 다시 힘내 봐요',
    );
  });

  it('인사가 접힌 날의 알림 문구는 인사다 — 인사를 못 구하면 원래 알림 문구', () => {
    const talk = {
      main: { kind: 'weekly', key: '2026-10-12' },
      folded: [{ kind: 'moment' }],
    };
    const moment = { ...base, kind: 'schoolEvent', title: '체육대회' };
    expect(talkNotice(talk, DAY, moment)).toBe(SPORTS_DAY_LINE);
    expect(talkNotice(talk, DAY, null)).toBe('이번 주 정리가 왔어요');
  });
});

describe('핀 줄 — 인사가 그날의 말', () => {
  it('인사와 그날 핀 모습을 보이고, 누르면 여는 창 없이 열어 봄이 된다 — 핀 모습은 남는다', () => {
    decide([{ kind: 'moment', key: DAY }]);
    const { container } = render(<CheerPinLine />);
    const btn = screen.getByRole('button', { name: `${SPORTS_DAY_LINE} · 눌러서 확인했다고 표시` });
    expect(container.querySelector('[data-pin-look="flag"] img')).not.toBeNull();
    fireEvent.click(btn);
    expect(useObservationPanelStore.getState().panel).toBeNull();
    expect(pendingTalk(useObservationDayStore.getState().talk, DAY)).toBeNull();
    expect(screen.queryByText(SPORTS_DAY_LINE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-pin-look="flag"] img')).not.toBeNull();
  });

  it('오늘 응원이 생기면 응원이 먼저다 — 인사는 열어 봄으로 치지 않는다', () => {
    window.localStorage.setItem(
      CHEER_STORAGE_KEY,
      JSON.stringify({
        firstDay: DAY,
        line: { message: '오늘 첫 기록, 멋져요', pinState: 'wave', day: DAY },
      }),
    );
    decide([{ kind: 'moment', key: DAY }]);
    render(<CheerPinLine />);
    expect(screen.getByText('오늘 첫 기록, 멋져요')).toBeInTheDocument();
    expect(screen.queryByText(SPORTS_DAY_LINE)).not.toBeInTheDocument();
    expect(pendingTalk(useObservationDayStore.getState().talk, DAY)).not.toBeNull();
  });

  it('쉬는 날에는 인사도 그날 핀 모습도 없다', () => {
    decide([{ kind: 'moment', key: DAY }]);
    const { container } = render(<CheerPinLine />);
    fireEvent.click(screen.getByRole('button', { name: '오늘은 쉴게요' }));
    expect(screen.queryByText(SPORTS_DAY_LINE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-pin-look]')).toBeNull();
  });

  it('인사가 그날 말에 없으면(말을 정하지 않은 날) 원래 핀이다', () => {
    const { container } = render(<CheerPinLine />);
    expect(container.querySelector('[data-pin-look]')).toBeNull();
  });
});

describe('핀 줄·창 — 인사가 접힌 날', () => {
  it('알림 문구가 인사이고, 누르면 한 주 정리가 열리며 창 맨 위에 인사 한 줄이 있다', () => {
    decide([
      { kind: 'weekly', key: '2026-10-12' },
      { kind: 'moment', key: DAY },
    ]);
    render(
      <>
        <CheerPinLine />
        <ObservationRecapModals />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: SPORTS_DAY_LINE }));
    const panel = useObservationPanelStore.getState().panel;
    expect(panel?.kind).toBe('weekly');
    expect(panel?.moment?.kind).toBe('schoolEvent');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(SPORTS_DAY_LINE);
    // 인사만 있는 주는 여전히 빈 창 안내가 함께 있다
    expect(dialog).toHaveTextContent('이번 주는 조용했어요');
    expect(dialog.querySelector('[data-pin-look="flag"] img')).not.toBeNull();
  });

  it('인사가 접히지 않은 말로 연 창·탭 단추로 연 창에는 인사 한 줄이 없다', () => {
    const talk = decideTalk(EMPTY_TALK_STATE, DAY, [{ kind: 'weekly', key: '2026-10-12' }]).talk;
    expect(talk).not.toBeNull();
    if (talk === null) return;
    expect(panelForTalk(talk, null)).toEqual({ kind: 'weekly', week: '2026-10-12' });
    useObservationPanelStore.setState({ panel: { kind: 'weekly', week: '2026-10-12' } });
    render(<ObservationRecapModals />);
    expect(screen.getByRole('dialog')).not.toHaveTextContent(SPORTS_DAY_LINE);
  });
});

describe('토스트 — 그날 핀 모습', () => {
  it('인사 토스트는 그날 핀 모습을 그리고, 누르면 할 일을 하고 닫힌다', () => {
    const onClick = vi.fn();
    const { container } = render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showCheer(SPORTS_DAY_LINE, 'idle', onClick, 'flag');
    });
    expect(container.querySelector('[data-pin-look="flag"] img')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: SPORTS_DAY_LINE }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('그림 파일을 못 읽으면 원래 핀으로 돌아간다', () => {
    const { container } = render(<ToastContainer />);
    act(() => {
      useToastStore.getState().showCheer(SPORTS_DAY_LINE, 'idle', undefined, 'flag');
    });
    const img = container.querySelector('[data-pin-look="flag"] img');
    expect(img).not.toBeNull();
    if (img !== null) fireEvent.error(img);
    expect(container.querySelector('[data-pin-look]')).toBeNull();
  });
});

describe('메인 창 — 앱이 그날 인사를 정하고 알린다', () => {
  function settle(): void {
    act(() => {
      vi.advanceTimersByTime(TALK_SETTLE_MS);
    });
    act(() => {
      vi.advanceTimersByTime(TALK_SETTLE_MS);
    });
  }

  it('행사 날에는 인사가 그날의 말 — 토스트를 누르면 여는 창 없이 열어 봄이 된다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 14, 9, 0));
    const { container } = render(
      <>
        <ObservationTalkHost />
        <ToastContainer />
      </>,
    );
    settle();
    expect(useObservationDayStore.getState().talk.talk?.main).toEqual({ kind: 'moment', key: DAY });
    const toast = screen.getByRole('button', { name: SPORTS_DAY_LINE });
    expect(container.querySelector('[data-pin-look="flag"] img')).not.toBeNull();
    fireEvent.click(toast);
    expect(pendingTalk(useObservationDayStore.getState().talk, DAY)).toBeNull();
    expect(useObservationPanelStore.getState().panel).toBeNull();
  });

  it('한 주 정리와 겹친 금요일 — 알림은 인사로, 누르면 정리가 열리고 맨 위에 인사가 있다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const FRI = '2026-10-16';
    vi.setSystemTime(new Date(2026, 9, 16, 9, 0));
    useEventsStore.setState({ events: [neisEvent('e2', '체육대회', FRI)] });
    useTodoStore.setState({
      todos: [
        {
          id: 't1',
          text: '공문 회신',
          completed: true,
          createdAt: '2026-10-01T00:00:00.000Z',
          completedAt: new Date(2026, 9, 15, 15, 0).toISOString(),
        },
      ],
    });
    render(
      <>
        <ObservationTalkHost />
        <ToastContainer />
      </>,
    );
    settle();
    const talk = useObservationDayStore.getState().talk.talk;
    expect(talk?.main).toEqual({ kind: 'weekly', key: '2026-10-12' });
    expect(talk?.folded).toEqual([{ kind: 'moment', key: FRI }]);
    fireEvent.click(screen.getByRole('button', { name: SPORTS_DAY_LINE }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(SPORTS_DAY_LINE);
    expect(dialog).toHaveTextContent('끝낸 할 일 1개');
    expect(dialog).not.toHaveTextContent('이번 주는 조용했어요');
  });
});

describe('인사 — 열어 봄과 핀 모습이 돌아오는 때', () => {
  it('저절로 사라진 인사 토스트는 열어 봄이 아니다', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(new Date(2026, 9, 14, 9, 0));
    render(
      <>
        <ObservationTalkHost />
        <ToastContainer />
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(TALK_SETTLE_MS);
    });
    act(() => {
      vi.advanceTimersByTime(TALK_SETTLE_MS);
    });
    expect(screen.getByRole('button', { name: SPORTS_DAY_LINE })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.queryByRole('button', { name: SPORTS_DAY_LINE })).not.toBeInTheDocument();
    expect(pendingTalk(useObservationDayStore.getState().talk, DAY)).not.toBeNull();
  });

  it('다음 날에는 인사도 그날 핀 모습도 없다', () => {
    decide([{ kind: 'moment', key: DAY }]);
    vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
    const { container } = render(<CheerPinLine />);
    expect(screen.queryByText(SPORTS_DAY_LINE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-pin-look]')).toBeNull();
  });

  it('응원·잔디·돌아보기를 끄면 인사도 그날 핀 모습도 없다', () => {
    decide([{ kind: 'moment', key: DAY }]);
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        recordReminder: { ...DEFAULT_REMINDER_SETTINGS, cheerEnabled: false },
      },
    });
    const { container } = render(<CheerPinLine />);
    expect(screen.queryByText(SPORTS_DAY_LINE)).not.toBeInTheDocument();
    expect(container.querySelector('[data-pin-look]')).toBeNull();
  });
});
