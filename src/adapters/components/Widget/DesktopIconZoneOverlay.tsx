import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { DesktopIconZoneSettings } from '@domain/entities/Settings';
import { DesktopIconZoneCard } from './DesktopIconZoneCard';

interface DesktopIconZoneOverlayProps {
  /** 정규화된 카드 배열. 호출자가 enabled=false 항목까지 포함해 보내도 본 컴포넌트가 거른다. */
  readonly zones: ReadonlyArray<DesktopIconZoneSettings>;
}

/**
 * 위젯 안에서 desktop-icon-zone 카드들을 가로 그리드로 배치하는 오버레이.
 *
 * 책임:
 * 1. enabled=true 카드만 렌더링한다.
 * 2. 각 카드 본문의 DOM rect 를 측정해 main 으로 30Hz throttle 로 전송한다.
 * 3. 위젯 hide / 모드 OFF / unmount 시 main 에 clearBounds 를 요청한다.
 *
 * 좌표 변환:
 *   physical_x = (window.screenX + rect.left) * window.devicePixelRatio
 *   physical_y = (window.screenY + rect.top) * window.devicePixelRatio
 *   physical_w = rect.width * window.devicePixelRatio
 *   physical_h = rect.height * window.devicePixelRatio
 *
 *   Electron 위젯 BrowserWindow 는 client 영역을 그대로 노출하므로
 *   window.screenX / screenY 가 위젯의 가상 데스크톱 좌상단 좌표와 일치한다.
 *   devicePixelRatio 는 현재 모니터의 scaleFactor.
 *   다중 모니터에서 위젯이 다른 모니터로 이동하면 devicePixelRatio 가 갱신되며
 *   `window.matchMedia('(resolution: 1dppx)').onchange` 이벤트로 감지 가능
 *   하지만 여기서는 ResizeObserver + interval 폴링 조합으로 단순화.
 *
 * Phase 1 에서는 main 측 manager 가 no-op 이므로 송신만 하고 실제 라우팅은 일어나지 않는다.
 * Phase 2 진입 시 동일 송신 루트를 그대로 활용.
 */
export function DesktopIconZoneOverlay({ zones }: DesktopIconZoneOverlayProps) {
  const enabledZones = useMemo(
    () => zones.filter((z) => z.enabled).slice().sort((a, b) => a.order - b.order),
    [zones],
  );

  const cardBodyRefs = useRef(new Map<string, HTMLDivElement>());
  const lastSentSerializedRef = useRef<string>('');
  const cachedScaleRef = useRef<{ scaleFactor: number; baseDIP: { x: number; y: number } } | null>(null);
  const lastScaleFetchAtRef = useRef<number>(0);

  const setBodyRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      cardBodyRefs.current.set(id, el);
    } else {
      cardBodyRefs.current.delete(id);
    }
  }, []);

  // throttle 30Hz ≒ 33ms — 좌표 측정 후 송신.
  // scaleFactor / 위젯 DIP origin 은 main 으로부터 받아오는 게 가장 정확하지만
  // 매번 IPC 로 받으면 비용이 크므로 1초 단위로 캐시한다.
  const measureAndSend = useCallback(async () => {
    const api = window.electronAPI?.desktopIconZones;
    if (!api) return;
    // 1초 이상 지났으면 main 에 다시 조회. 첫 호출도 fetch.
    const now = Date.now();
    if (!cachedScaleRef.current || now - lastScaleFetchAtRef.current > 1000) {
      try {
        const info = await api.getDisplayScaleFactor();
        if (info) {
          cachedScaleRef.current = {
            scaleFactor: info.scaleFactor,
            baseDIP: { x: info.bounds.x, y: info.bounds.y },
          };
        }
      } catch {
        // ignore — 다음 측정에서 재시도
      }
      lastScaleFetchAtRef.current = now;
    }
    // fallback: window.devicePixelRatio (다중 모니터에서 부정확할 수 있음)
    const fallbackDpr = window.devicePixelRatio || 1;
    const fallbackBase = { x: window.screenX, y: window.screenY };
    const cached = cachedScaleRef.current;
    const scale = cached?.scaleFactor ?? fallbackDpr;
    const baseDIP = cached?.baseDIP ?? fallbackBase;
    const out: Array<{
      id: string;
      name: string;
      rect: { x: number; y: number; width: number; height: number };
    }> = [];
    for (const zone of enabledZones) {
      const el = cardBodyRefs.current.get(zone.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      // baseDIP (위젯 좌상단 DIP) + rect.left (위젯 client 내부 CSS px) → physical px
      // CSS px == DIP 가 일반적이지만 Electron 위젯은 그 가정을 만족한다.
      out.push({
        id: zone.id,
        name: zone.name,
        rect: {
          x: Math.round((baseDIP.x + rect.left) * scale),
          y: Math.round((baseDIP.y + rect.top) * scale),
          width: Math.round(rect.width * scale),
          height: Math.round(rect.height * scale),
        },
      });
    }
    // 변동 없으면 송신 생략.
    const serialized = JSON.stringify(out);
    if (serialized === lastSentSerializedRef.current) return;
    lastSentSerializedRef.current = serialized;
    void api.updateBounds(out);
  }, [enabledZones]);

  // ResizeObserver — 카드 크기/위치 변동 감지.
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        void measureAndSend();
      });
    };
    const ro = new ResizeObserver(schedule);
    cardBodyRefs.current.forEach((el) => ro.observe(el));
    // 위젯 자체 이동 (타이틀바 드래그) 은 window event 가 직접 안 옴 →
    // 가벼운 polling 으로 보정 (1Hz 가 아니라 33ms 로 잡되, 변동 없으면 송신 안 함).
    const interval = window.setInterval(schedule, 33);
    // 첫 동기화.
    schedule();

    return () => {
      ro.disconnect();
      window.clearInterval(interval);
      if (raf) cancelAnimationFrame(raf);
      // unmount 시 main 측 캐시 비워 hit-test 가 잔존 좌표로 동작하지 않도록.
      void window.electronAPI?.desktopIconZones?.clearBounds();
      lastSentSerializedRef.current = '';
    };
  }, [measureAndSend]);

  // zones 변경 시 즉시 재측정 (id/order/이름 변경).
  useEffect(() => {
    void measureAndSend();
  }, [measureAndSend]);

  if (enabledZones.length === 0) return null;

  // 위젯 본문 위에 absolute 로 띄우는 오버레이 — 위젯 콘텐츠는 그대로 두고,
  // 카드만 별도 grid 로 가로 배치한다.
  // 시각적으로 항상 보이는 영역을 확보하기 위해 위젯 하단 1/3 영역을 사용 (디자인 §5.1).
  return (
    <div
      className="absolute inset-x-3 bottom-3 grid gap-3 z-10"
      style={{
        gridTemplateColumns: `repeat(${enabledZones.length}, minmax(0, 1fr))`,
        // 카드 헤더 클릭은 받되, 본문은 카드 내부에서 pointer-events-none 처리됨.
        pointerEvents: 'auto',
      }}
      aria-label="바탕화면 작업판 영역"
    >
      {enabledZones.map((zone, idx) => (
        <DesktopIconZoneCard
          key={zone.id}
          ref={setBodyRef(zone.id)}
          zone={zone}
          showHelperHint={idx === 0}
        />
      ))}
    </div>
  );
}
