/**
 * 느린 기기에서 흐림만 자동으로 끈다.
 *
 * 배경(2026-08-14) — 그래픽 가속을 끈 상태(오래된 교무실 PC 조건)에서 실측한 결과다.
 * 유리 카드 26장 · 흐림 24px · 스크롤:
 *
 *   흐림 끔  16.68ms  59.9fps
 *   흐림 켬  71.88ms  13.9fps   ← 4.31배 느려짐 (최악 프레임 100ms)
 *
 * 13.9fps 면 스크롤이 눈에 띄게 끊긴다. 하루 종일 켜두는 앱에서 이건 못 넘길 선이다.
 *
 * 다행히 **비싼 것은 흐림뿐이고 반투명은 공짜다** — 위 두 조건 모두 카드가 반투명이었다.
 * 그래서 느린 기기에서는 흐림만 빼면 유리 인상은 남기면서 속도를 되찾을 수 있다.
 *
 * 설정값은 건드리지 않는다. 사용자가 고른 값은 그대로 두고 화면에만 흐림을 뺀다 —
 * 빠른 기기로 옮기면 다시 흐려진다. 설정을 대신 고쳐 버리면 "내가 켠 걸 왜 앱이 껐지"가 된다.
 */
import { useEffect } from 'react';

/**
 * 이 프레임 시간을 넘으면 느린 기기로 본다 (ms).
 *
 * 28ms ≈ 36fps. 60fps(16.7ms)를 기준으로 잡으면 잠깐의 끊김에도 흐림이 꺼져 깜빡이고,
 * 너무 느슨하면 정작 버벅이는 기기를 놓친다. 실측에서 느린 쪽은 71ms 였으므로
 * 그 사이에서 넉넉히 잡는다.
 */
const SLOW_FRAME_MS = 28;

/** 잴 프레임 수. 너무 적으면 첫 렌더의 튀는 값에 휘둘린다. */
const SAMPLE_FRAMES = 40;

/** 앞쪽 몇 프레임은 버린다 — 레이아웃이 잡히는 동안은 원래 느리다. */
const WARMUP_FRAMES = 12;

/** 한 세션에 한 번만 잰다. 설정을 만질 때마다 다시 재면 그 자체가 부하다. */
let probed = false;

/** 테스트에서 초기화하기 위한 문. 제품 코드에서는 부르지 않는다. */
export function resetGlassPerformanceProbe(): void {
  probed = false;
}

/**
 * 흐림이 켜져 있으면 한 번 재보고, 느리면 `sp-glass-slow` 를 붙인다.
 * CSS 가 그 표시를 보고 흐림을 뺀다.
 */
export function useGlassPerformanceGuard(active: boolean): void {
  useEffect(() => {
    if (!active || probed) return;
    if (typeof requestAnimationFrame !== 'function') return;

    probed = true;
    const frames: number[] = [];
    let last = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      frames.push(now - last);
      last = now;
      if (frames.length < SAMPLE_FRAMES) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const sample = frames.slice(WARMUP_FRAMES);
      const avg = sample.reduce((sum, v) => sum + v, 0) / sample.length;
      if (avg > SLOW_FRAME_MS) {
        document.documentElement.classList.add('sp-glass-slow');
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
