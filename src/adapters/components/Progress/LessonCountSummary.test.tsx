/**
 * LessonCountSummary 정적 렌더 테스트.
 *
 * 환경: vitest(node) — `renderToString`으로 출력 문자열을 검사한다(같은 저장소의
 * `SampleRosterWarningBanner.test.tsx` 선례).
 *
 * 잠그는 것 — 전부 "숫자를 잘못 읽게 만들지 않는다"에 관한 계약이다:
 *   A-a3  모든 차시 숫자 옆에 '예상'이 붙는다
 *   A-a8  학기 마지막 수업일을 모르면 숫자를 아예 안 보여준다
 *   A-a10 시간표 매칭이 0이면 '예상 0차시'가 아니라 시간표 등록 안내를 보여준다
 *   C-c11 기존 '입력 기준' 진도율 값이 그대로 나온다(이 화면이 생겼다고 어제 숫자가 달라지면 안 된다)
 *   C-c12 두 진도율이 서로 다른 라벨로 함께 보인다
 *   +     보관된 반에는 시간표 등록을 시키지 않는다
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { LessonCountSummary, type EntryBasedStats } from './LessonCountSummary';
import type { LessonCountView } from '@adapters/hooks/useLessonCountEstimate';

const updateMock = vi.fn(() => Promise.resolve());

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector: (s: { update: typeof updateMock; settings: Record<string, unknown> }) => unknown) =>
      selector({ update: updateMock, settings: {} }),
    { getState: () => ({ settings: {}, update: updateMock }) },
  ),
}));

const ENTRY_STATS: EntryBasedStats = { total: 12, completed: 9, percent: 75 };

function view(over: Partial<LessonCountView> = {}): LessonCountView {
  return {
    status: 'ok',
    totalPeriods: 34,
    pastPeriods: 12,
    remainingPeriods: 22,
    lessonDays: [],
    excludedDays: [],
    hasFutureEstimate: false,
    needsTermEnd: false,
    term: '2026-2',
    ...over,
  };
}

function render(v: LessonCountView, stats: EntryBasedStats = ENTRY_STATS): string {
  return renderToString(
    <LessonCountSummary
      view={v}
      entryStats={stats}
      detailsOpen={false}
      onToggleDetails={() => {}}
    />,
  );
}

describe('LessonCountSummary — 정상 상태', () => {
  it('A-a3: 차시 숫자 옆에 예상이 붙는다', () => {
    const html = render(view());
    expect(html).toContain('34');
    expect(html).toContain('예상');
  });

  it('학기·완료·남은 수업이 함께 보인다', () => {
    const html = render(view());
    expect(html).toContain('2026학년도 2학기');
    expect(html).toContain('22'); // 남은
    expect(html).toContain('9'); // 완료(입력 기준)
  });

  it('C-c12: 두 진도율이 서로 다른 라벨로 함께 보인다', () => {
    const html = render(view());
    expect(html).toContain('입력 기준');
    expect(html).toContain('학기 기준(예상)');
  });

  it('C-c11: 기존 입력 기준 진도율 값이 그대로 나온다', () => {
    // 이 화면이 생겼다고 어제까지 보던 숫자가 달라지면 선생님은 고장으로 읽는다.
    const html = render(view(), { total: 12, completed: 9, percent: 75 });
    expect(html).toContain('75%');
  });

  it('학기 기준 진도율은 학기 전체 차시를 분모로 쓴다', () => {
    // 완료 9 / 전체 34 → 26%
    const html = render(view({ totalPeriods: 34 }), { total: 12, completed: 9, percent: 75 });
    expect(html).toContain('26%');
    expect(html).toContain('75%'); // 둘이 나란히 있어야 한다
  });

  it('앞으로의 수업이 남아 있으면 예상이라는 사실을 한 번 더 알린다', () => {
    expect(render(view({ hasFutureEstimate: true }))).toContain('결·보강');
    expect(render(view({ hasFutureEstimate: false }))).not.toContain('결·보강');
  });
});

describe('LessonCountSummary — 셀 수 없는 상태는 숫자를 감춘다', () => {
  it('A-a8: 학기 마지막 수업일을 모르면 숫자 대신 알려주기를 청한다', () => {
    const html = render(view({ needsTermEnd: true, totalPeriods: 0 }));
    expect(html).toContain('마지막 수업일');
    expect(html).toContain('알려주기');
    expect(html).not.toContain('차시</span>');
  });

  it('A-a10: 시간표가 없으면 0차시가 아니라 등록 안내를 보여준다', () => {
    const html = render(view({ status: 'noTimetable', totalPeriods: 0 }));
    expect(html).toContain('시간표를 먼저 등록');
    expect(html).not.toContain('예상');
  });

  it('보관된 반에는 시간표 등록을 시키지 않는다', () => {
    // 빈 결과를 전부 noTimetable로 뭉갰다면 여기서 엉뚱한 안내가 나왔을 자리다.
    const html = render(view({ status: 'archivedClass', totalPeriods: 0 }));
    expect(html).toContain('보관된 반');
    expect(html).not.toContain('시간표를 먼저 등록');
  });

  it('학기 날짜가 잘못되면 그 사실을 말한다', () => {
    const html = render(view({ status: 'invalidTerm', totalPeriods: 0 }));
    expect(html).toContain('학기 시작일');
  });
});

describe('LessonCountSummary — 근거 열기', () => {
  it('뺀 날·확인 필요한 날 개수를 버튼에 함께 보여준다', () => {
    const html = render(
      view({
        excludedDays: [
          {
            date: '2026-10-09',
            periods: [2],
            exclusion: { reason: 'holiday', label: '공휴일', userOverridable: true },
            notices: [],
          },
        ],
        lessonDays: [
          { date: '2026-10-12', periods: [2], matchStage: 2, notices: [] },
          { date: '2026-10-15', periods: [2], matchStage: 1, notices: [] },
        ],
      }),
    );
    expect(html).toContain('어떻게 셌는지');
    expect(html).toContain('2'); // 뺀 날 1 + 확실하지 않은 날 1
  });
});
