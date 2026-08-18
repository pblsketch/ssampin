import { describe, expect, it } from 'vitest';
import { resolveDpiRestoreBounds, resolveDragEndBounds } from './desktopWidgetDpiRestore';

/**
 * 배율이 다른 모니터로 위젯을 옮겼을 때 "보이는 크기"를 지키는 계산의 그물.
 *
 * 실측 기준값은 오너 PC 환경 그대로다
 * (`docs/03-analysis/widget-dual-monitor-drag/widget-dual-monitor-drag.analysis.md` §13):
 *   주 모니터 2880×1800 @175% / 보조 1920×1080 @100%
 *   위젯 물리 1232×916 = DIP 704×523
 */
describe('resolveDpiRestoreBounds', () => {
  it('175% → 100%로 넘어가면 DIP 크기를 그대로 유지하도록 값을 돌려준다', () => {
    const plan = resolveDpiRestoreBounds({
      startScale: 1.75,
      endScale: 1,
      startDipSize: { width: 704, height: 523 },
      finalDipOrigin: { x: 2347, y: 140 },
    });

    // 보조(100%) 모니터에서는 DIP 704 = 물리 704px. 이전 물리 1232px에서 줄어드는 것이 정상.
    expect(plan).toEqual({ x: 2347, y: 140, width: 704, height: 523 });
  });

  it('100% → 175% 반대 방향도 같은 DIP 크기를 유지한다', () => {
    const plan = resolveDpiRestoreBounds({
      startScale: 1,
      endScale: 1.75,
      startDipSize: { width: 704, height: 523 },
      finalDipOrigin: { x: 80, y: 80 },
    });

    expect(plan).toEqual({ x: 80, y: 80, width: 704, height: 523 });
  });

  it('같은 배율 안에서의 이동에는 개입하지 않는다 (대부분의 드래그)', () => {
    expect(
      resolveDpiRestoreBounds({
        startScale: 1.75,
        endScale: 1.75,
        startDipSize: { width: 704, height: 523 },
        finalDipOrigin: { x: 500, y: 300 },
      }),
    ).toBeNull();
  });

  it('부동소수 오차로 배율이 미세하게 다르게 들어와도 개입하지 않는다', () => {
    // 회귀 방지 — 1.75가 경로에 따라 1.7500000000000002로 들어오면
    // 매 드래그마다 setBounds가 불려 소수 배율 반올림 래칫(위젯이 조금씩 커짐)이 생긴다.
    expect(
      resolveDpiRestoreBounds({
        startScale: 1.75,
        endScale: 1.7500000000000002,
        startDipSize: { width: 704, height: 523 },
        finalDipOrigin: { x: 500, y: 300 },
      }),
    ).toBeNull();
  });

  it('화면 정보를 못 읽어 값이 비정상이면 아무것도 하지 않는다', () => {
    const base = {
      startScale: 1.75,
      endScale: 1,
      startDipSize: { width: 704, height: 523 },
      finalDipOrigin: { x: 0, y: 0 },
    };
    expect(resolveDpiRestoreBounds({ ...base, startScale: 0 })).toBeNull();
    expect(resolveDpiRestoreBounds({ ...base, endScale: Number.NaN })).toBeNull();
    expect(resolveDpiRestoreBounds({ ...base, endScale: -1 })).toBeNull();
    expect(
      resolveDpiRestoreBounds({ ...base, startDipSize: { width: 0, height: 523 } }),
    ).toBeNull();
    expect(
      resolveDpiRestoreBounds({ ...base, finalDipOrigin: { x: Number.NaN, y: 0 } }),
    ).toBeNull();
  });

  it('음수 좌표(주 모니터 왼쪽에 배치된 보조 모니터)도 그대로 통과시킨다', () => {
    const plan = resolveDpiRestoreBounds({
      startScale: 1,
      endScale: 2,
      startDipSize: { width: 700, height: 500 },
      finalDipOrigin: { x: -1200, y: -30 },
    });
    expect(plan).toEqual({ x: -1200, y: -30, width: 700, height: 500 });
  });

  it('소수 좌표는 반올림해 정수로 돌려준다 (setBounds는 정수만 받는다)', () => {
    const plan = resolveDpiRestoreBounds({
      startScale: 1.5,
      endScale: 1,
      startDipSize: { width: 704.4, height: 523.6 },
      finalDipOrigin: { x: 100.5, y: 200.4 },
    });
    expect(plan).toEqual({ x: 101, y: 200, width: 704, height: 524 });
  });
});

/**
 * 드래그 종료 시 최종 크기 결정 — DPI 복구와 "안 들어가면 축소"를 합친 판정.
 *
 * 기준 환경은 위와 같다(오너 PC): 주 2880×1800 @175%(DIP 작업영역 1645×981) /
 * 보조 1920×1080 @100%(DIP 작업영역 1920×1032).
 * 신고의 핵심 사례는 "보조를 꽉 채운 위젯을 주 모니터로 옮기는 것"이다.
 */
describe('resolveDragEndBounds', () => {
  const PRIMARY_WORK_AREA = { x: 0, y: 0, width: 1645, height: 981 };
  const SECONDARY_WORK_AREA = { x: 1645, y: 0, width: 1920, height: 1032 };
  const MIN_SIZE = { width: 220, height: 320 };

  it('보조를 꽉 채운 위젯을 배율 높은 주 모니터로 옮기면 주 모니터에 맞게 줄인다', () => {
    // 신고 재현: DIP 1920×1032 위젯이 175% 모니터에서는 물리 3360×1806 —
    // 주 모니터(물리 2880×1800)보다 커서 화면 밖으로 넘친다.
    const { bounds: next } = resolveDragEndBounds({
      startScale: 1,
      endScale: 1.75,
      startDipSize: { width: 1920, height: 1032 },
      finalDipOrigin: { x: 300, y: 100 },
      currentBounds: { x: 300, y: 100, width: 1920, height: 1032 },
      workArea: PRIMARY_WORK_AREA,
      minSize: MIN_SIZE,
    });

    expect(next).not.toBeNull();
    // 주 모니터 작업 영역(1645×981) 안으로 들어와야 한다.
    expect(next!.width).toBe(1645);
    expect(next!.height).toBe(981);
    expect(next!.x + next!.width).toBeLessThanOrEqual(
      PRIMARY_WORK_AREA.x + PRIMARY_WORK_AREA.width,
    );
    expect(next!.y).toBeGreaterThanOrEqual(PRIMARY_WORK_AREA.y);
  });

  it('들어가는 크기면 DPI 복구만 하고 크기는 건드리지 않는다', () => {
    const { bounds: next } = resolveDragEndBounds({
      startScale: 1.75,
      endScale: 1,
      startDipSize: { width: 704, height: 523 },
      finalDipOrigin: { x: 2000, y: 140 },
      currentBounds: { x: 2000, y: 140, width: 1232, height: 916 },
      workArea: SECONDARY_WORK_AREA,
      minSize: MIN_SIZE,
    });

    expect(next).toEqual({ x: 2000, y: 140, width: 704, height: 523 });
  });

  it('배율이 같고 화면에도 들어가면 아무것도 하지 않는다 (래칫 방지)', () => {
    expect(
      resolveDragEndBounds({
        startScale: 1,
        endScale: 1,
        startDipSize: { width: 700, height: 500 },
        finalDipOrigin: { x: 1700, y: 50 },
        currentBounds: { x: 1700, y: 50, width: 700, height: 500 },
        workArea: SECONDARY_WORK_AREA,
        minSize: MIN_SIZE,
      }).bounds,
    ).toBeNull();
  });

  it('배율이 같아도 더 작은 모니터로 옮겨 넘치면 줄인다', () => {
    // 2560×1440 크기의 위젯을 1920×1032 작업영역으로 옮긴 경우 (둘 다 100%).
    const { bounds: next } = resolveDragEndBounds({
      startScale: 1,
      endScale: 1,
      startDipSize: { width: 2560, height: 1440 },
      finalDipOrigin: { x: 1700, y: 10 },
      currentBounds: { x: 1700, y: 10, width: 2560, height: 1440 },
      workArea: SECONDARY_WORK_AREA,
      minSize: MIN_SIZE,
    });

    expect(next).not.toBeNull();
    expect(next!.width).toBe(1920);
    expect(next!.height).toBe(1032);
  });

  it('반올림으로 1px만 넘친 경우에는 개입하지 않는다 (래칫 방지)', () => {
    // 175% 배율에서 setBounds(H)를 부르면 실제로는 H+1이 된다(실측).
    // 이 1px에 반응해 다시 줄이면 그 setBounds가 또 +1을 만들어 창이 계속 커진다.
    // 실기기 로그에서 폭이 839→845로 자란 것이 이 경로였다.
    expect(
      resolveDragEndBounds({
        startScale: 1.75,
        endScale: 1.75,
        startDipSize: { width: 1646, height: 981 },
        finalDipOrigin: { x: 0, y: 0 },
        currentBounds: { x: 0, y: 0, width: 1647, height: 982 },
        workArea: PRIMARY_WORK_AREA,
        minSize: MIN_SIZE,
      }).bounds,
    ).toBeNull();
  });

  it('반올림 잡음보다 크게 넘치면(3px) 개입한다', () => {
    const { bounds: next } = resolveDragEndBounds({
      startScale: 1.75,
      endScale: 1.75,
      startDipSize: { width: 1649, height: 984 },
      finalDipOrigin: { x: 0, y: 0 },
      currentBounds: { x: 0, y: 0, width: 1649, height: 984 },
      workArea: PRIMARY_WORK_AREA,
      minSize: MIN_SIZE,
    });

    expect(next).not.toBeNull();
    expect(next!.width).toBe(PRIMARY_WORK_AREA.width);
    expect(next!.height).toBe(PRIMARY_WORK_AREA.height);
  });

  it('하한이 현재 크기로 들어오면 축소가 무력화된다 — 상수를 써야 하는 이유', () => {
    // 위젯 창은 resizable:false라 getMinimumSize()가 "현재 크기"를 돌려준다(실측).
    // 그 값을 하한으로 넘기면 max(현재, min(현재, 화면)) = 현재가 되어 한 톨도 안 줄어든다.
    const oversized = { x: 0, y: 0, width: 1920, height: 1032 };
    const { bounds: neutered } = resolveDragEndBounds({
      startScale: 1,
      endScale: 1,
      startDipSize: { width: 1920, height: 1032 },
      finalDipOrigin: { x: 0, y: 0 },
      currentBounds: oversized,
      workArea: PRIMARY_WORK_AREA,
      minSize: { width: oversized.width, height: oversized.height }, // ← getMinimumSize()의 실제 거동
    });
    expect(neutered!.width).toBe(1920); // 안 줄어든다 = 버그 재현

    const { bounds: withConstant } = resolveDragEndBounds({
      startScale: 1,
      endScale: 1,
      startDipSize: { width: 1920, height: 1032 },
      finalDipOrigin: { x: 0, y: 0 },
      currentBounds: oversized,
      workArea: PRIMARY_WORK_AREA,
      minSize: MIN_SIZE, // ← 상수 하한
    });
    expect(withConstant!.width).toBe(PRIMARY_WORK_AREA.width); // 제대로 줄어든다
  });

  it('최소 크기 아래로는 줄이지 않는다 (setBounds가 어차피 되돌린다)', () => {
    const { bounds: next } = resolveDragEndBounds({
      startScale: 1,
      endScale: 1,
      startDipSize: { width: 900, height: 800 },
      finalDipOrigin: { x: 0, y: 0 },
      currentBounds: { x: 0, y: 0, width: 900, height: 800 },
      workArea: { x: 0, y: 0, width: 150, height: 200 },
      minSize: MIN_SIZE,
    });

    expect(next).not.toBeNull();
    expect(next!.width).toBe(MIN_SIZE.width);
    expect(next!.height).toBe(MIN_SIZE.height);
  });

  it('축소할 때 줄이기 전 크기를 함께 돌려준다 (호출자가 기억해 되살린다)', () => {
    const decision = resolveDragEndBounds({
      startScale: 1,
      endScale: 1.75,
      startDipSize: { width: 1920, height: 1032 },
      finalDipOrigin: { x: 300, y: 100 },
      currentBounds: { x: 300, y: 100, width: 1920, height: 1032 },
      workArea: PRIMARY_WORK_AREA,
      minSize: MIN_SIZE,
    });

    expect(decision.shrunkFrom).toEqual({ width: 1920, height: 1032 });
  });

  it('보조↔주 왕복 후에도 원래 크기를 되찾는다 (2026-08-18 실기기 신고)', () => {
    // 실기기 증상: 보조를 꽉 채운 뒤 주로 옮기면 꽉 차는데, 다시 보조로 돌아오면
    // 주 모니터에 맞춰 줄인 크기가 그대로 굳어 화면이 남았다.
    const filledSecondary = { x: 1645, y: 0, width: 1920, height: 1032 };

    // ① 보조 → 주 : 주 모니터 크기로 줄고, 줄이기 전 크기를 돌려준다
    const toPrimary = resolveDragEndBounds({
      startScale: 1,
      endScale: 1.75,
      startDipSize: { width: 1920, height: 1032 },
      finalDipOrigin: { x: 100, y: 50 },
      currentBounds: { ...filledSecondary, x: 100, y: 50 },
      workArea: PRIMARY_WORK_AREA,
      minSize: MIN_SIZE,
    });
    expect(toPrimary.bounds!.width).toBe(PRIMARY_WORK_AREA.width);
    expect(toPrimary.shrunkFrom).toEqual({ width: 1920, height: 1032 });

    // ② 주 → 보조 : 기억한 크기를 넘기면 되살아나야 한다
    const backToSecondary = resolveDragEndBounds({
      startScale: 1.75,
      endScale: 1,
      startDipSize: { width: PRIMARY_WORK_AREA.width, height: PRIMARY_WORK_AREA.height },
      finalDipOrigin: { x: 1700, y: 20 },
      currentBounds: {
        x: 1700,
        y: 20,
        width: PRIMARY_WORK_AREA.width,
        height: PRIMARY_WORK_AREA.height,
      },
      workArea: SECONDARY_WORK_AREA,
      minSize: MIN_SIZE,
      preferredSize: toPrimary.shrunkFrom,
    });

    expect(backToSecondary.bounds).not.toBeNull();
    expect(backToSecondary.bounds!.width).toBe(1920);
    expect(backToSecondary.bounds!.height).toBe(1032);
    // 되살린 크기가 화면 안에 전부 들어와야 한다 (커졌으므로 밀려날 수 있다)
    expect(backToSecondary.bounds!.x + backToSecondary.bounds!.width).toBeLessThanOrEqual(
      SECONDARY_WORK_AREA.x + SECONDARY_WORK_AREA.width,
    );
    expect(backToSecondary.shrunkFrom).toBeNull();
  });

  it('기억한 크기가 이번 화면에도 안 들어가면 호출자가 넘기지 않는다 — 넘어오면 다시 줄인다', () => {
    // 방어: 호출자(takePreferredSizeIfFits)가 걸러 주지만, 만약 넘어오더라도
    // 화면을 넘치면 그대로 두지 않고 줄인다.
    const decision = resolveDragEndBounds({
      startScale: 1,
      endScale: 1,
      startDipSize: { width: 800, height: 600 },
      finalDipOrigin: { x: 0, y: 0 },
      currentBounds: { x: 0, y: 0, width: 800, height: 600 },
      workArea: PRIMARY_WORK_AREA,
      minSize: MIN_SIZE,
      preferredSize: { width: 3000, height: 2000 },
    });

    expect(decision.bounds!.width).toBe(PRIMARY_WORK_AREA.width);
    expect(decision.bounds!.height).toBe(PRIMARY_WORK_AREA.height);
  });
});
