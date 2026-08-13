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
import { useEffect, useState } from 'react';
import type {
  SidePinPinnedZone,
  SidePinPointerRegion,
  SidePinSurface,
} from '@domain/entities/SidePinRuntimeState';
import { SidePinRail } from './SidePinRail';
import { SidePinPanel } from './SidePinPanel';

/** 화면이 그리는 데 필요한 것만 추린 상태 */
interface SidePinViewState {
  readonly surface: SidePinSurface;
  readonly pinnedZone: SidePinPinnedZone;
  readonly pointerRegion: SidePinPointerRegion;
}

const INITIAL_VIEW: SidePinViewState = {
  surface: 'collapsed',
  pinnedZone: 'none',
  pointerRegion: 'outside',
};

/** main이 보낸 값에서 화면이 쓸 부분만 안전하게 꺼낸다 */
function toViewState(raw: unknown): SidePinViewState | null {
  if (raw === null || typeof raw !== 'object') return null;
  const s = raw as Partial<Record<keyof SidePinViewState, unknown>>;
  if (typeof s.surface !== 'string') return null;
  return {
    surface: s.surface as SidePinSurface,
    pinnedZone: (typeof s.pinnedZone === 'string' ? s.pinnedZone : 'none') as SidePinPinnedZone,
    pointerRegion: (typeof s.pointerRegion === 'string'
      ? s.pointerRegion
      : 'outside') as SidePinPointerRegion,
  };
}

export function SidePinApp() {
  const [view, setView] = useState<SidePinViewState>(INITIAL_VIEW);

  useEffect(() => {
    const api = window.electronAPI?.sidePin;
    if (!api) return;
    return api.onStateChanged((raw) => {
      const next = toViewState(raw);
      if (next !== null) setView(next);
    });
  }, []);

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

  if (!expanded) {
    return (
      <SidePinRail
        pointerRegion={view.pointerRegion}
        onZoneEnter={report}
        onZoneLeave={() => report('outside')}
        onZoneClick={(zone) => window.electronAPI?.sidePin?.togglePin(zone)}
      />
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
        onTogglePin={(zone) => window.electronAPI?.sidePin?.togglePin(zone)}
        onClose={() => window.electronAPI?.sidePin?.requestClose()}
        onOpenMain={() => window.electronAPI?.sidePin?.openMain()}
        widgetSlot={<ZonePlaceholder icon="dashboard" title="위젯" />}
        memoSlot={<ZonePlaceholder icon="sticky_note_2" title="메모" />}
      />
    </div>
  );
}

/**
 * 아직 내용이 붙지 않은 영역.
 *
 * 위젯 카드와 메모 목록은 기존 화면을 재사용해 붙일 예정이라, 지금은 자리와 크기만
 * 확인할 수 있게 둔다. 가짜 내용을 채워 넣으면 "다 된 것처럼" 보여 판단을 흐린다.
 */
function ZonePlaceholder({ icon, title }: { readonly icon: string; readonly title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <span aria-hidden className="material-symbols-outlined text-icon-md text-sp-muted">
        {icon}
      </span>
      <p className="text-sm font-medium text-sp-text">{title}</p>
      <p className="text-caption text-sp-muted">다음 단계에서 내용이 들어갑니다</p>
    </div>
  );
}
