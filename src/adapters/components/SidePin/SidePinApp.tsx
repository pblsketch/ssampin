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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useSidePinAppearance, useSaveSidePinAppearance } from './useSidePinAppearance';
import { SidePinAppearancePopover } from './SidePinAppearancePopover';

export type SidePinRendererSurface = 'rail' | 'panel' | 'legacy';

export function getSidePinRendererSurface(search: string): SidePinRendererSurface {
  const surface = new URLSearchParams(search).get('surface');
  if (surface === 'rail' || surface === 'panel') return surface;
  return 'legacy';
}

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
  /**
   * 옆핀에서 PIN 을 마지막으로 푼 시각. 안 풀었으면 null.
   *
   * **창이 들고 있는 값을 그대로 받는다.** 화면이 스스로 기억하면 패널 창이 파괴될 때
   * 함께 사라져, 스칠 때마다 PIN 을 다시 묻게 된다(계획서 §6.1).
   *
   * 만료(12시간 상한)는 여기서 재지 않는다 — 가드가 그릴 때마다 잰다.
   */
  readonly pinUnlockedAt: number | null;
  readonly revision: number;
}

const INITIAL_VIEW: SidePinViewState = {
  surface: 'collapsed',
  pinnedZone: 'none',
  pointerRegion: 'outside',
  activeZone: null,
  locked: false,
  pinUnlockedAt: null,
  revision: 0,
};

/**
 * 두 칸의 활동을 창에 보낼 **하나의 값**으로 합친다.
 *
 * 창은 `editorActivity` 를 하나만 들고 있다. 그래서 한 칸이 보낸 `'idle'` 이 다른 칸이
 * 걸어 둔 `'editing'` 을 지운다 — 메모 칸의 이미지 고르기 유예 타이머가 끝나면서
 * `'idle'` 을 보내면 **PIN 을 치는 도중인 위젯 칸의 접힘 방지가 풀린다.**
 *
 * 규칙은 하나다: **하나라도 바쁘면 바쁘다.** 어느 쪽이 바쁜지는 창이 알 필요가 없다
 * (창은 "접어도 되는가"만 묻는다).
 *
 * 순수 함수로 빼 둔 이유 — 이 판단이 틀리면 쓰던 입력이 날아가는데, 화면을 통째로
 * 그려서 확인하려면 두 칸을 동시에 움직여야 해서 시험하기 어렵다.
 */
export function mergeEditorActivity(byZone: {
  readonly memo: MemoEditorActivity;
  readonly widget: MemoEditorActivity;
}): MemoEditorActivity {
  if (byZone.memo !== 'idle') return byZone.memo;
  return byZone.widget;
}

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
    // 숫자가 아니면(형식이 어긋난 전문·옛 창 등) **잠긴 쪽**으로 읽는다.
    // `locked` 와 같은 규칙이다 — 애매할 때 열어 주면 정작 가려야 할 때 새는 것은 이쪽이다.
    pinUnlockedAt: typeof s['pinUnlockedAt'] === 'number' ? s['pinUnlockedAt'] : null,
    revision: typeof s['revision'] === 'number' ? s['revision'] : 0,
  };
}

export function SidePinApp() {
  const rendererSurface = getSidePinRendererSurface(window.location.search);
  const [view, setView] = useState<SidePinViewState>(INITIAL_VIEW);
  const [panelShown, setPanelShown] = useState(false);
  // 옆핀 전용으로 또 고르게 하지 않는다 — 대시보드에서 고른 것을 그대로 따른다.
  const widgetIds = useSidePinWidgetIds();
  // 주제 색과 배경 투명도. 이게 없으면 옆핀만 늘 밝은 색으로 뜬다.
  const appearance = useSidePinAppearance();
  // 유리 3단계는 공용 설정 전체를 보고 판단한다(지금 어느 단계인지·바탕화면 비치기 여부).
  const widgetSettings = useSettingsStore((s) => s.settings.widget);
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
    let disposed = false;
    let latestRevision = -1;
    const accept = (raw: unknown): void => {
      const next = toViewState(raw);
      if (next === null || next.revision < latestRevision || disposed) return;
      latestRevision = next.revision;
      setView(next);
    };
    // 이벤트 구독을 먼저 건 뒤 스냅샷을 받아, 생성 직전 상태 알림도 놓치지 않는다.
    const unsubscribe = api.onStateChanged(accept);
    void api.getState?.().then(accept);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (rendererSurface !== 'panel') return;
    const api = window.electronAPI?.sidePin;
    if (!api?.onPanelShown) return;
    return api.onPanelShown(() => setPanelShown(true));
  }, [rendererSurface]);

  useEffect(() => {
    window.electronAPI?.sidePin?.reportReady?.();
  }, []);

  useEffect(() => {
    if (view.surface === 'collapsed') setPanelShown(false);
  }, [view.surface]);

  /**
   * ★옆핀이 펴진 횟수 (2026-09-01 추가).
   *
   * 그 전까지 옆핀은 앱 통계에 **한 건도 남기지 않아** 몇 명이 쓰는지 알 수 없었다.
   *
   * ★손잡이(rail) 창에서는 세지 않는다. 손잡이와 패널은 **각각 다른 창**이고 둘 다
   *   이 컴포넌트를 그린다 — 양쪽에서 세면 한 번 편 것이 두 번으로 기록된다.
   */
  const { track } = useAnalytics();
  const wasExpandedRef = useRef(false);
  useEffect(() => {
    if (rendererSurface === 'rail') return;
    const isExpanded = view.surface === 'expanded';
    if (isExpanded && !wasExpandedRef.current) track('sidepin_open');
    wasExpandedRef.current = isExpanded;
  }, [view.surface, rendererSurface, track]);

  // `closing`도 패널을 계속 그린다 — 나가는 연출이 끝나야 창이 줄어들기 때문이다.
  // 여기서 빼면 연출할 것이 사라져, 창만 큰 채로 빈 화면이 잠깐 보인다.
  const showPanel =
    view.surface === 'expanded' || view.surface === 'opening' || view.surface === 'closing';
  const expanded = view.surface === 'expanded' || view.surface === 'opening';

  // 패널을 그린 다음 프레임에 "다 그렸다"고 알린다.
  // 이 신호가 있어야 "여는 중"이 "펼쳐짐"으로 확정된다.
  useEffect(() => {
    const motionStarted = rendererSurface === 'legacy' || panelShown;
    if (rendererSurface === 'rail' || !expanded || !motionStarted) return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        window.electronAPI?.sidePin?.reportPainted();
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== 0) cancelAnimationFrame(secondFrame);
    };
  }, [expanded, panelShown, rendererSurface]);

  const report = (region: SidePinPointerRegion): void => {
    // 고정 크기인 rail/panel Electron 창에서는 본체가 실제 커서 좌표를 단일 기준으로 쓴다.
    // 창을 교체하며 발생하는 React mouseleave를 함께 보내면 정상적인 호버 열기가 취소된다.
    if (rendererSurface !== 'legacy') return;
    window.electronAPI?.sidePin?.reportPointerRegion(region);
  };

  /**
   * 메모를 쓰는 중인지 창에 알린다.
   *
   * 화면 쪽에도 들고 있는 이유는 위젯 칸을 접기 위해서다. 창이 되돌려 주기를 기다리면
   * 한 박자 늦게 접혀 편집기가 덜컥거린다. 접힘을 막는 판단은 그대로 창이 한다.
   */
  const [memoEditing, setMemoEditing] = useState(false);
  const [widgetEditing, setWidgetEditing] = useState(false);
  /**
   * "쓰는 중"을 창에 알린다 — 이게 걸려 있는 동안 패널이 접히지 않는다.
   *
   * **배치는 칸마다 다르다.** 메모를 쓰면 위젯 칸이 접히고, 위젯을 고치면 메모 칸이 접힌다.
   * 그래서 보낸 곳을 구분해 기억한다 — 배치용으로 하나로 합치면 위젯을 여는 순간
   * **위젯 칸이 접혀** 방금 연 것이 사라진다.
   * (창에 **보낼 때는** 반대로 합쳐야 한다 — 아래 참조.)
   */
  /**
   * 칸마다 마지막으로 보고한 활동. 창에 보낼 값을 **합치기 위해** 들고 있다.
   *
   * 상태가 아니라 ref 인 이유는 이 값이 바뀌었다고 화면을 다시 그릴 필요가 없어서다.
   */
  const activityByZone = useRef<Record<'memo' | 'widget', MemoEditorActivity>>({
    memo: 'idle',
    widget: 'idle',
  });

  const reportActivity = useCallback((zone: 'memo' | 'widget', activity: MemoEditorActivity) => {
    const busy = activity !== 'idle';
    if (zone === 'memo') setMemoEditing(busy);
    else setWidgetEditing(busy);

    /**
     * 🚨 **두 칸을 합쳐서 보낸다.** 칸마다 따로 보내면 안 된다.
     *
     * 창은 `editorActivity` 를 **하나만** 들고 있다. 그래서 한 칸이 보낸 `'idle'` 이
     * 다른 칸이 걸어 둔 `'editing'` 을 지운다 — 예를 들어 메모 칸의 이미지 고르기
     * 유예 타이머가 끝나면서 `'idle'` 을 보내면, **PIN 을 치는 도중인 위젯 칸의
     * 접힘 방지가 풀려 패널이 접히고 입력이 날아간다.**
     *
     * 계획서(§6.7)는 창 쪽에 칸별 지도를 두자고 했지만, 화면이 이미 두 칸을 다 알고
     * 있으므로 여기서 합치면 **통신 규약도 창 쪽 상태도 안 바꾸고** 같은 결과를 얻는다.
     * 창이 죽은 뒤 값이 남는 문제는 어느 쪽을 골라도 같고, 그건 파기 시 `'idle'` 로
     * 되돌리는 불변식이 이미 막고 있다.
     */
    activityByZone.current = { ...activityByZone.current, [zone]: activity };
    const merged = mergeEditorActivity(activityByZone.current);

    // `?.()`로 감싼다. 옛 preload 위에서 돌면 이 함수가 없는데, 그냥 부르면
    // 그 칸 전체가 죽어 아예 못 쓰게 된다. 접힘 방지가 안 되는 편이 낫다.
    window.electronAPI?.sidePin?.reportEditorActivity?.(merged);
  }, []);

  const reportMemoActivity = useCallback(
    (activity: MemoEditorActivity) => reportActivity('memo', activity),
    [reportActivity],
  );
  const reportWidgetActivity = useCallback(
    (activity: MemoEditorActivity) => reportActivity('widget', activity),
    [reportActivity],
  );

  if (rendererSurface === 'rail' || (rendererSurface === 'legacy' && !showPanel)) {
    // 바깥 껍데기는 창을 채우되 손잡이는 실제 접힌 크기로 가운데 오른쪽에 고정한다.
    // Electron 창이 패널 크기로 먼저 커져도 낡은 손잡이가 전체 화면으로 늘어나지 않는다.
    return (
      <div className="flex h-screen w-screen items-center justify-end">
        <div data-sidepin-rail-shell className="h-screen w-screen shrink-0">
          <SidePinRail
            pointerRegion={view.pointerRegion}
            backgroundColor={appearance.backgroundColor}
            onZoneEnter={report}
            onZoneLeave={() => report('outside')}
            onZoneClick={(zone) => window.electronAPI?.sidePin?.togglePin(zone)}
          />
        </div>
      </div>
    );
  }

  if (rendererSurface === 'panel' && !showPanel) {
    return <div data-sidepin-panel-blank className="h-screen w-screen" aria-hidden="true" />;
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
        motionActive={rendererSurface === 'legacy' || panelShown}
        surfaceStyle={appearance.surfaceStyle}
        appearanceOpen={appearanceOpen}
        onToggleAppearance={() => setAppearanceOpen((open) => !open)}
        appearanceSlot={
          appearanceOpen ? (
            <SidePinAppearancePopover
              opacity={appearance.opacity}
              cardOpacity={appearance.cardOpacity}
              onOpacityChange={(value) =>
                void saveAppearance({ opacity: value, glassDashboardOptIn: true })
              }
              onCardOpacityChange={(value) =>
                void saveAppearance({ cardOpacity: value, glassDashboardOptIn: true })
              }
              onClose={() => setAppearanceOpen(false)}
              widget={widgetSettings}
              onPatch={(p) => void saveAppearance(p)}
            />
          ) : undefined
        }
        onTogglePin={(zone) => window.electronAPI?.sidePin?.togglePin(zone)}
        // `?.()`로 감싼다 — 옛 preload 위에서 돌면 이 함수가 없는데, 그냥 부르면
        // 패널이 통째로 죽는다. 띠를 못 누르는 편이 낫다.
        onFocusZone={(zone) => window.electronAPI?.sidePin?.focusZone?.(zone)}
        // 직접 누른 [지금 가리기]다 — 위젯을 열어 두었거나 메모를 쓰는 중이어도 접는다.
        // 급히 가려야 하는 순간이 바로 그때라, 여기서 안 접히면 눌러도 안 되는 단추가 된다.
        onClose={() => window.electronAPI?.sidePin?.requestClose(true)}
        onOpenMain={() => window.electronAPI?.sidePin?.openMain()}
        memoEditing={memoEditing}
        widgetEditing={widgetEditing}
        widgetSlot={
          <SidePinWidgetZone
            definitions={WIDGET_DEFINITIONS}
            selectedIds={widgetIds}
            // 해제 상태는 이 창이 아니라 **창(상태 기계)**이 들고 있다. 여기서 기억하면
            // 패널이 파괴될 때 함께 사라져 스칠 때마다 PIN 을 다시 묻는다.
            pinUnlockedAt={view.pinUnlockedAt}
            onPinUnlocked={() => window.electronAPI?.sidePin?.reportPinUnlocked?.()}
            // 이미 있는 화면 이동 통로를 쓴다. 메인 창을 띄우고 그 화면으로 보낸 뒤,
            // 창 모드까지 되돌리는 일은 main이 한다.
            onOpenInApp={(target) => void window.electronAPI?.navigateToPage(target)}
            onEditorActivityChange={reportWidgetActivity}
          />
        }
        memoSlot={
          <SidePinMemoZone
            locked={view.locked}
            pinUnlockedAt={view.pinUnlockedAt}
            onPinUnlocked={() => window.electronAPI?.sidePin?.reportPinUnlocked?.()}
            onEditorActivityChange={reportMemoActivity}
          />
        }
      />
    </div>
  );
}
