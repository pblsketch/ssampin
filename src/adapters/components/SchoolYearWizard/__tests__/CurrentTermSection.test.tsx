/**
 * CurrentTermSection 정적 렌더 테스트.
 *
 * 환경: vitest(node) — `renderToString`으로 출력 문자열을 검사한다(같은 저장소의
 * `LessonCountSummary.test.tsx` 선례). 클릭은 못 하므로, **첫 렌더 상태로 재현되는 것**만 잠근다.
 *
 * 잠그는 것:
 *   - 마지막 수업일 입력칸이 개학일과 같은 카드 안에 있다(설정에서 넣고 고칠 수 있다)
 *   - 등록된 날짜가 입력칸에 들어와 있다(고치러 왔는데 빈칸이면 지워진 줄 안다)
 *   - 끝이 시작보다 앞서면 경고가 뜨고 저장 버튼이 잠긴다
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

interface MockSettings {
  termStartDates?: Record<string, string>;
  termEndDates?: Record<string, string>;
  currentTerm?: string;
}

let mockSettings: MockSettings = {};

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: mockSettings, update: () => Promise.resolve() }),
}));

vi.mock('@adapters/stores/useEventsStore', () => ({
  useEventsStore: (selector: (s: unknown) => unknown) => selector({ events: [] }),
}));

vi.mock('@adapters/components/common/Toast', () => ({
  useToastStore: (selector: (s: unknown) => unknown) => selector({ show: () => {} }),
}));

vi.mock('@adapters/hooks/useCurrentTerm', () => ({
  useCurrentTerm: () => '2026-2',
}));

const { CurrentTermSection } = await import('../CurrentTermSection');

function render(): string {
  return renderToString(<CurrentTermSection />);
}

beforeEach(() => {
  mockSettings = {};
});

describe('CurrentTermSection — 마지막 수업일도 설정에서 넣는다', () => {
  it('개학일과 마지막 수업일 입력칸이 한 카드에 함께 있다', () => {
    const html = render();
    expect(html).toContain('term-start-date');
    expect(html).toContain('term-end-date');
    expect(html).toContain('마지막 수업일');
  });

  it('등록된 날짜가 입력칸에 들어와 있다', () => {
    mockSettings = {
      termStartDates: { '2026-2': '2026-08-18' },
      termEndDates: { '2026-2': '2026-12-31' },
    };
    const html = render();
    expect(html).toContain('value="2026-08-18"');
    expect(html).toContain('value="2026-12-31"');
  });

  it('마지막 수업일을 아직 안 넣었으면 무슨 일이 생기는지 말해 준다', () => {
    const html = render();
    expect(html).toContain('예상 차시를 세지 않고');
  });
});

describe('CurrentTermSection — 앞뒤가 뒤집힌 날짜는 저장을 막는다', () => {
  it('끝이 시작보다 앞서면 두 날짜를 확인하라고 말한다', () => {
    // 이 조합이 저장되면 진도 화면이 계산을 포기하는 상태가 된다.
    // (저장 버튼 잠금은 같은 `endBeforeStart` 값을 쓰지만, 정적 렌더로는 눌러볼 수 없어
    //  판정 자체는 termDateInput 테스트가 잠근다.)
    mockSettings = {
      termStartDates: { '2026-2': '2026-09-01' },
      termEndDates: { '2026-2': '2026-08-01' },
    };
    const html = render();
    expect(html).toContain('앞서요');
    expect(html).toContain('9월 1일');
  });

  it('정상 순서에는 경고를 띄우지 않는다', () => {
    mockSettings = {
      termStartDates: { '2026-2': '2026-08-18' },
      termEndDates: { '2026-2': '2026-12-31' },
    };
    expect(render()).not.toContain('앞서요');
  });
});
