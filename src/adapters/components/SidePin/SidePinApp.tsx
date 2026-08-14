/**
 * 옆핀 창의 화면 조립부.
 *
 * 이 화면은 **아무것도 스스로 판단하지 않는다.** 언제 펼치고 접을지는 전부 main의
 * controller가 정하고, 여기서는 받은 상태를 그리고 사람이 한 일을 되돌려 보내기만 한다.
 * 화면도 판단하기 시작하면 두 곳이 서로 다른 결론을 내는 순간을 사람이 재현할 수 없다.
 *
 * 창 크기는 main이 바꾼다. 접혔을 때는 손잡이 크기, 펼쳤을 때는 패널 크기의 창이
 * 오므로 여기서는 항상 창 전체를 채우기만 한다.
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  MemoEditorActivity,
  SidePinPinnedZone,
  SidePinPointerRegion,
  SidePinSurface,
  SidePinZone,
} from '@domain/entities/SidePinRuntimeState';
import { SidePinRail } from './SidePinRail';
import { SidePinPanel } from './SidePinPanel';
import { SidePinMemoZone } from './SidePinMemoZone';
import { SidePinWidgetZone } from './SidePinWidgetZone';
import { WIDGET_DEFINITIONS } from '@widgets/registry';
import { useSidePinWidgetIds } from './useSidePinWidgetIds';
import { useSidePinAppearance, useSaveSidePinAppearance } from './useSidePinAppearance';
import { SidePinAppearancePopover } from './SidePinAppearancePopover';

/** 화면이 그리는 데 필요한 것만 추린 상태 */
interface SidePinViewState {
  readonly surface: SidePinSurface;
  readonly pinnedZone: SidePinPinnedZone;
  readonly pointerRegion: SidePinPointerRegion;
  /**
   * 어느 칸으로 들어와 열렸는가. 그 칸을 더 넓게 보여준다.
   *
   * 창이 정해서 내려보낸다. 화면이 포인터 위치를 보고 스스로 정하면, 패널이 뜨는 사이
   * 마우스가 이미 옮겨가 있어 창과 다른 결론을 내게 된다.
   */
  readonly activeZone: SidePinZone | null;
  /**
   * 보호 상태(잠금·절전·전체화면 등)인가.
   *
   * 이 상태에서는 메모 내용을 **화면에서 가리는 것이 아니라 아예 만들지 않는다.**
   * 가리기만 하면 값이 화면 쪽 메모리에 남아 개발자 도구나 화면 공유로 새어 나간다.
   *
   * 이유를 가리지 않고 하나라도 있으면 잠근 것으로 본다. 어차피 그 상태에서는 창이
   * 숨으므로 더 조심해서 잃을 것이 없고, 나중에 이유가 늘어도 빠뜨리지 않는다.
   */
  readonly locked: boolean;
}

const INITIAL_VIEW: SidePinViewState = {
  surface: 'collapsed',
  pinnedZone: 'none',
  pointerRegion: 'outside',
  activeZone: null,
  locked: false,
};

/** 창이 보내온 값이 아는 칸 이름일 때만 받는다 */
function toZone(raw: unknown): SidePinZone | null {
  return raw === 'widget' || raw === 'memo' || raw === 'both' ? raw : null;
}

/**
 * main이 보낸 값에서 화면이 쓸 부분만 안전하게 꺼낸다.
 *
 * 내보내는 이유는 시험하기 위해서다. 특히 `locked` 판단은 뒤집히면 잠금 화면 위로
 * 메모 내용이 새는 자리라, 화면을 거치지 않고 직접 못박아 둔다.
 */
export function toViewState(raw: unknown): SidePinViewState | null {
  if (raw === null || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (typeof s['surface'] !== 'string') return null;
  return {
    surface: s['surface'] as SidePinSurface,
    pinnedZone: (typeof s['pinnedZone'] === 'string'
      ? s['pinnedZone']
      : 'none') as SidePinPinnedZone,
    pointerRegion: (typeof s['pointerRegion'] === 'string'
      ? s['pointerRegion']
      : 'outside') as SidePinPointerRegion,
    activeZone: toZone(s['activeZone']),
    // "잠기지 않았다"는 null 하나뿐이다. 값이 아예 없으면(형식이 어긋난 전문 등)
    // 잠긴 쪽으로 판단한다 — 애매할 때 내용을 보여주는 쪽으로 기울면,
    // 정작 가려야 할 순간에 새는 것은 이쪽이다.
    locked: s['protectedReason'] !== null,
  };
}

export function SidePinApp() {
  const [view, setView] = useState<SidePinViewState>(INITIAL_VIEW);
  // 옆핀 전용으로 또 고르게 하지 않는다 — 대시보드에서 고른 것을 그대로 따른다.
  const widgetIds = useSidePinWidgetIds();
  // 주제 색과 배경 투명도. 이게 없으면 옆핀만 늘 밝은 색으로 뜬다.
  const appearance = useSidePinAppearance();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const saveAppearance = useSaveSidePinAppearance();

  /**
   * 창은 투명한데 **문서 배경은 흰색**이라, 손잡이가 덮지 않은 자리가 흰 판으로 드러난다.
   * 아이콘 모드가 같은 이유로 쓰는 처리를 그대로 따른다(2026-08-14 실제 발생).
   *
   * 클래스만으로는 첫 프레임에 흰 배경이 번쩍이므로, 인라인으로도 한 번 더 막는다.
   */
  useEffect(() => {
    document.body.classList.add('ssampin-sidepin');
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    return () => {
      document.body.classList.remove('ssampin-sidepin');
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, []);

  useEffect(() => {
    const api = window.electronAPI?.sidePin;
    if (!api) return;
    return api.onStateChanged((raw) => {
      const next = toViewState(raw);
      if (next !== null) setView(next);
    });
  }, []);

  // `closing`도 패널을 계속 그린다 — 나가는 연출이 끝나야 창이 줄어들기 때문이다.
  // 여기서 빼면 연출할 것이 사라져, 창만 큰 채로 빈 화면이 잠깐 보인다.
  const showPanel =
    view.surface === 'expanded' || view.surface === 'opening' || view.surface === 'closing';
  const expanded = view.surface === 'expanded' || view.surface === 'opening';

  // 패널을 그린 다음 프레임에 "다 그렸다"고 알린다.
  // 이 신호가 있어야 "여는 중"이 "펼쳐짐"으로 확정된다.
  useEffect(() => {
    if (!expanded) return;
    const id = requestAnimationFrame(() => {
      window.electronAPI?.sidePin?.reportPainted();
    });
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  const report = (region: SidePinPointerRegion): void => {
    window.electronAPI?.sidePin?.reportPointerRegion(region);
  };

  /**
   * 메모를 쓰는 중인지 창에 알린다.
   *
   * 화면 쪽에도 들고 있는 이유는 위젯 칸을 접기 위해서다. 창이 되돌려 주기를 기다리면
   * 한 박자 늦게 접혀 편집기가 덜컥거린다. 접힘을 막는 판단은 그대로 창이 한다.
   */
  const [memoEditing, setMemoEditing] = useState(false);
  const reportEditorActivity = useCallback((activity: MemoEditorActivity): void => {
    setMemoEditing(activity !== 'idle');
    // `?.()`로 감싼다. 옛 preload 위에서 돌면 이 함수가 없는데, 그냥 부르면
    // 메모 칸 전체가 죽어 메모를 아예 못 쓰게 된다. 접힘 방지가 안 되는 편이 낫다.
    window.electronAPI?.sidePin?.reportEditorActivity?.(activity);
  }, []);

  if (!showPanel) {
    // 창 높이를 그대로 채운다. 부모 높이에 기대면(h-full) 높이 사슬이 한 군데만
    // 끊겨도 내용 높이로 쪼그라들어, 창 위쪽 일부만 차지하고 나머지가 빈 채로 남는다.
    return (
      <div className="h-screen w-screen">
        <SidePinRail
          pointerRegion={view.pointerRegion}
          backgroundColor={appearance.backgroundColor}
          onZoneEnter={report}
          onZoneLeave={() => report('outside')}
          onZoneClick={(zone) => window.electronAPI?.sidePin?.togglePin(zone)}
        />
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen"
      onMouseLeave={() => report('outside')}
      onMouseEnter={() => report('panel-widget')}
    >
      <SidePinPanel
        pinnedZone={view.pinnedZone}
        activeZone={view.activeZone}
        backgroundColor={appearance.backgroundColor}
        leaving={view.surface === 'closing'}
        surfaceStyle={appearance.surfaceStyle}
        appearanceOpen={appearanceOpen}
        onToggleAppearance={() => setAppearanceOpen((open) => !open)}
        appearanceSlot={
          appearanceOpen ? (
            <SidePinAppearancePopover
              opacity={appearance.opacity}
              cardOpacity={appearance.cardOpacity}
              onOpacityChange={(value) => void saveAppearance({ opacity: value })}
              onCardOpacityChange={(value) => void saveAppearance({ cardOpacity: value })}
              onClose={() => setAppearanceOpen(false)}
            />
          ) : undefined
        }
        onTogglePin={(zone) => window.electronAPI?.sidePin?.togglePin(zone)}
        onClose={() => window.electronAPI?.sidePin?.requestClose()}
        onOpenMain={() => window.electronAPI?.sidePin?.openMain()}
        memoEditing={memoEditing}
        widgetSlot={
          <SidePinWidgetZone
            definitions={WIDGET_DEFINITIONS}
            selectedIds={widgetIds}
            // 이미 있는 화면 이동 통로를 쓴다. 메인 창을 띄우고 그 화면으로 보낸 뒤,
            // 창 모드까지 되돌리는 일은 main이 한다.
            onOpenInApp={(target) => void window.electronAPI?.navigateToPage(target)}
          />
        }
        memoSlot={
          <SidePinMemoZone locked={view.locked} onEditorActivityChange={reportEditorActivity} />
        }
      />
    </div>
  );
}
