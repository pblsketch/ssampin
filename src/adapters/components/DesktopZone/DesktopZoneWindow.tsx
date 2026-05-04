import { useEffect, useState } from 'react';

interface ZoneCardBounds {
  readonly id: string;
  readonly name: string;
  readonly rect: {
    readonly x: number; // physical screen px (가상 데스크톱 절대 좌표)
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/**
 * 바탕화면 작업판 별도 BrowserWindow 의 root 컴포넌트 (v2.1.0~ Phase 2.3).
 *
 * 동작:
 *   - 가상 데스크톱 전체 영역에 fullscreen + transparent 로 떠 있다.
 *   - main 프로세스가 Explorer WorkerW 자식으로 SetParent 한 상태이므로
 *     데스크톱 아이콘이 시각적으로 위에 떠 보인다.
 *   - 위젯 안의 desktop-icon-zone 카드 좌표(physical screen px)를 IPC 로 받아
 *     **그 위치에 정확히** zone 점선 카드 + 라벨을 그린다 → 시각적으로 위젯 카드와
 *     일체화.
 *   - 카드 본문은 `pointer-events: none` 으로 두어 데스크톱 아이콘 클릭 자연 통과.
 */
export function DesktopZoneWindow() {
  const [zones, setZones] = useState<ReadonlyArray<ZoneCardBounds>>([]);
  const [scaleFactor, setScaleFactor] = useState<number>(1);
  const [originDIP, setOriginDIP] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const api = window.electronAPI?.desktopIconZones;
    if (!api) return;
    const unsubscribe = api.onCardsUpdate?.((next) => {
      setZones(next ?? []);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // physical px → zoneWindow client px 변환을 위해 위젯이 위치한 디스플레이의
  // scaleFactor 와 zoneWindow 자체의 origin 을 알아야 한다.
  // zoneWindow 는 가상 데스크톱 전체에 걸쳐 있으므로 그 origin = 가상 데스크톱 (0,0)
  // 또는 좌상단 디스플레이 원점. main 이 보내는 카드 좌표는 widget BrowserWindow
  // 의 DIP 기반(`getBoundingClientRect` + window.screenX) 이라 1차 근사: scaleFactor=1
  // 가정. 정확도가 필요하면 main 의 getDisplayScaleFactor 를 호출.
  useEffect(() => {
    let cancelled = false;
    const refresh = (): void => {
      const api = window.electronAPI?.desktopIconZones;
      if (!api?.getDisplayScaleFactor) return;
      void api.getDisplayScaleFactor().then((info) => {
        if (cancelled || !info) return;
        setScaleFactor(info.scaleFactor || 1);
        // info.bounds 는 widget BrowserWindow 의 DIP bounds
        // zoneWindow 는 가상 데스크톱 전체에 걸쳐 있으나 DOM 좌표는 0,0 부터.
        // physical px 좌표를 zoneWindow client(CSS px) 로 변환하려면
        // 가상 데스크톱의 origin DIP 를 빼야 한다.
        // 단순화: zoneWindow 가 항상 가상 데스크톱 좌상단 (0,0) 에서 시작한다고 가정.
        setOriginDIP({ x: 0, y: 0 });
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        background: 'transparent',
      }}
      data-zone-root
    >
      {zones.map((z) => {
        // physical px → CSS px (zoneWindow DOM 기준).
        // zoneWindow 는 가상 데스크톱 전체에 걸친 BrowserWindow 라 OS 가 자체 DPI
        // 보정을 적용한다. CSS px = physical px / scaleFactor.
        const sf = scaleFactor || 1;
        const left = (z.rect.x - originDIP.x) / sf;
        const top = (z.rect.y - originDIP.y) / sf;
        const width = z.rect.width / sf;
        const height = z.rect.height / sf;
        if (width <= 0 || height <= 0) return null;
        return (
          <div
            key={z.id}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              borderRadius: '14px',
              border: '2px dashed rgba(120, 140, 180, 0.65)',
              background: 'rgba(20, 26, 40, 0.18)',
              backdropFilter: 'blur(2px)',
              overflow: 'hidden',
              pointerEvents: 'none',
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#cbd5e1',
                textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                background: 'rgba(15, 20, 32, 0.55)',
                borderBottom: '1px solid rgba(120, 140, 180, 0.35)',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
              title={z.name}
            >
              {z.name}
            </div>
            <div
              style={{
                flex: 1,
                pointerEvents: 'none', // 본문 영역은 데스크톱 아이콘 클릭 통과
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
