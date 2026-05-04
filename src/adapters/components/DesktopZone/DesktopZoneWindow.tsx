import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  normalizeDesktopIconZones,
  type DesktopIconZoneSettings,
} from '@domain/entities/Settings';

/**
 * 바탕화면 작업판 별도 BrowserWindow 의 root 컴포넌트 (v2.1.0~).
 *
 * 동작:
 *   - 가상 데스크톱 전체 영역에 fullscreen 으로 떠 있는 transparent 윈도우.
 *   - main 프로세스가 Explorer WorkerW (after-defview / progman-child) 자식으로
 *     SetParent 한 상태이므로 데스크톱 아이콘이 시각적으로 위에 떠 보인다.
 *   - 본 컴포넌트는 zones 배열을 가져와 카드별 영역에 점선 테두리 + 라벨만 그린다.
 *   - 카드 외부 영역은 `pointer-events: none` 으로 두어 데스크톱 아이콘 클릭이
 *     자연스럽게 통과되도록 한다.
 *
 * Phase 2.2 의 핵심 단순화:
 *   - 메인 위젯 (widgetWindow) 은 attach 대상이 아니다 → 위젯 UX 그대로 유지.
 *   - WH_MOUSE_LL 글로벌 hook 미사용 → 커서 freeze 결함 없음.
 *   - 좌표 IPC 도 보내지 않는다 (zone 영역은 본 윈도우 자체가 시각화 + 호버 처리).
 */
export function DesktopZoneWindow() {
  const { settings, load } = useSettingsStore();

  // settings 가 아직 메모리에 없을 수 있으므로 mount 시 1회 load.
  useEffect(() => {
    void load();
  }, [load]);

  const zones = useMemo<DesktopIconZoneSettings[]>(
    () => normalizeDesktopIconZones(settings.widget.desktopIconZones ?? []),
    [settings.widget.desktopIconZones],
  );

  const enabledZones = zones.filter((z) => z.enabled);

  // 데스크톱 모드가 아니면 렌더링도 하지 않음 (혹시 실수로 켜진 경우 방어막).
  if (settings.widget.desktopMode !== 'native-desktop') {
    return null;
  }

  if (enabledZones.length === 0) return null;

  // 화면 중앙 1/3 띠에 가로로 카드 배치.
  // 카드는 시각화 전용 — pointer-events: auto 라도 BrowserWindow 자체가 자연스럽게 hover.
  // 카드 외 영역은 pointer-events: none 로 배치해 desktop ListView click 통과.
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
      <div
        style={{
          position: 'absolute',
          left: '5vw',
          right: '5vw',
          top: '40vh',
          height: '40vh',
          display: 'grid',
          gridTemplateColumns: `repeat(${enabledZones.length}, minmax(0, 1fr))`,
          gap: '24px',
          pointerEvents: 'none',
        }}
      >
        {enabledZones.map((z) => (
          <div
            key={z.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderRadius: '14px',
              border: '2px dashed rgba(120, 140, 180, 0.65)',
              background: 'rgba(20, 26, 40, 0.18)',
              backdropFilter: 'blur(2px)',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#cbd5e1',
                textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                background: 'rgba(15, 20, 32, 0.55)',
                borderBottom: '1px solid rgba(120, 140, 180, 0.35)',
                userSelect: 'none',
              }}
              title={z.name}
            >
              {z.name}
            </div>
            <div
              style={{
                flex: 1,
                pointerEvents: 'none', // 카드 본문은 데스크톱 아이콘 통과 영역
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
