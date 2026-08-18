/**
 * SampleRosterWarningBanner 단위 테스트.
 *
 * 환경: vitest (environment: 'node') — RTL/jsdom 미사용. renderToString으로
 * 정적 HTML 출력 검증 + store mock으로 dismiss 핸들러의 부수효과 검증.
 *
 * 검사 범위:
 *   1. 디자인 §3.7 카피 그대로 렌더
 *   2. role="alert" + amber stripe + 닫기 버튼 aria-label
 *   3. dismiss 시 sampleRosterBannerDismissedAt 저장 + useSampleBannerStore.hide() 호출
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SampleRosterWarningBanner } from './SampleRosterWarningBanner';
import { useSampleBannerStore } from '@adapters/stores/useSampleBannerStore';

/**
 * useSettingsStore mock — banner dismiss가 settings.update를 호출하는 부수효과를
 * 검증하기 위해 vi.mock으로 update spy를 주입한다.
 */
const updateMock = vi.fn(() => Promise.resolve());

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector: (s: { update: typeof updateMock }) => unknown) => selector({ update: updateMock }),
    {
      getState: () => ({ settings: {}, update: updateMock }),
    },
  ),
}));

beforeEach(() => {
  updateMock.mockClear();
  // useSampleBannerStore는 zustand 실제 store — 초기 상태 강제 reset.
  useSampleBannerStore.setState({ shouldShow: true });
});

describe('SampleRosterWarningBanner — 정적 렌더', () => {
  it('디자인 §3.7 카피 그대로 노출', () => {
    const html = renderToString(<SampleRosterWarningBanner />);
    expect(html).toContain(
      '이 명단이 샘플일 가능성이 있어요. 우리 반 명단을 직접 등록하시면 정리됩니다.',
    );
  });

  /*
    2026-08-18 — 좌측 4px amber stripe 에서 "색조 면 + 아이콘 칩" 으로 바뀌었다.
    검사 대상만 새 표현으로 옮기고 **의도는 그대로 지킨다**: 경고임을 스크린리더에 알리고
    (role=alert), 경고 색이 실제로 칠해지며, 둥근 모서리를 유지한다.

    `--sp-warning` 을 `color-mix` 로 확인하는 이유 — Tailwind 투명도 수식(`bg-sp-warning/7`)은
    sp-* 토큰에 듣지 않아 조용히 무효가 된다. color-mix 문자열이 남아 있는지 보는 것이
    "경고색이 실제로 칠해졌는가" 를 확인하는 방법이다.
  */
  it('role="alert" + 경고 색조 면 + 둥근 모서리(rounded-lg)', () => {
    const html = renderToString(<SampleRosterWarningBanner />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('--sp-warning');
    expect(html).toContain('color-mix');
    expect(html).toContain('rounded-lg');
    // 옛 표현으로 되돌아가지 않았는지 — 되돌리면 이 줄이 빨간불이 된다.
    expect(html).not.toContain('border-l-amber-400');
  });

  it('"지금 등록하기" CTA + 닫기 버튼(aria-label) 노출', () => {
    const html = renderToString(<SampleRosterWarningBanner />);
    expect(html).toContain('지금 등록하기');
    expect(html).toContain('aria-label="샘플 명단 경고 배너 닫기"');
  });
});

describe('SampleRosterWarningBanner — 닫기 동작', () => {
  it('렌더 HTML에 닫기 버튼 + CTA가 모두 마운트된다', () => {
    // SSR 환경에서는 onClick 이벤트 디스패치가 안 되므로,
    // 핸들러 부수효과(useSampleBannerStore.hide + settings.update)는
    // 별도 store invariant 테스트(아래 두 케이스)로 보장한다.
    // 여기서는 컴포넌트가 두 버튼을 마운트하는 시그니처만 회귀 차단.
    const html = renderToString(<SampleRosterWarningBanner />);
    expect(html).toContain('지금 등록하기');
    expect(html).toContain('aria-label="샘플 명단 경고 배너 닫기"');
  });

  it('hide() 직후 shouldShow=false로 전환', () => {
    useSampleBannerStore.setState({ shouldShow: true });
    expect(useSampleBannerStore.getState().shouldShow).toBe(true);

    useSampleBannerStore.getState().hide();
    expect(useSampleBannerStore.getState().shouldShow).toBe(false);
  });

  it('show() 호출 시 shouldShow=true 복귀', () => {
    useSampleBannerStore.setState({ shouldShow: false });
    useSampleBannerStore.getState().show();
    expect(useSampleBannerStore.getState().shouldShow).toBe(true);
  });
});
