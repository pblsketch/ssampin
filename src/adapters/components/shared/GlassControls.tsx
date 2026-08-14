/**
 * 유리 효과 조절 — 설정 화면 · 위젯 모드 스타일 패널 · 옆핀 어디서나 같은 모습으로 쓴다.
 *
 * 배경(2026-08-14): 투명도를 조절할 수 있는 자리가 네 곳(설정 디스플레이 · 설정 위젯 ·
 * 위젯 모드 스타일 패널 · 옆핀)인데 유리 설정을 한 곳에만 넣었더니 "나머지에서는 조절이
 * 안 된다"는 지적을 받았다. 같은 것을 네 번 만들면 또 어긋나므로 부품 하나로 모은다.
 *
 * 값은 `WidgetSettings` 의 공용 항목(opacity · cardOpacity · blur · backdrop)이다.
 * 어디서 바꾸든 위젯 모드 · 옆핀 · 대시보드가 함께 따라온다.
 */
import type { WidgetSettings } from '@domain/entities/Settings';
import { GLASS_PRESETS, matchGlassPreset, type GlassLevel } from '@domain/rules/glassSurface';
import { SliderRow } from './StyleControls';

interface GlassControlsProps {
  readonly widget: WidgetSettings;
  readonly onPatch: (patch: Partial<WidgetSettings>) => void;
  readonly compact?: boolean;
}

const LEVELS: readonly { level: GlassLevel; label: string }[] = [
  { level: 'none', label: '없음' },
  { level: 'soft', label: '약하게' },
  { level: 'strong', label: '강하게' },
];

const LEVEL_LABEL: Record<GlassLevel, string> = {
  none: '없음',
  soft: '약하게',
  strong: '강하게',
};

/** 어두운 테마인가. `theme-dark` 는 useThemeApplier 가 배경색 밝기를 보고 붙이는 단일 기준이다. */
function isDarkTheme(): boolean {
  return (
    typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark')
  );
}

export function GlassControls({ widget, onPatch, compact = false }: GlassControlsProps) {
  /*
    밝은 테마에서는 보여주지 않는다. 밝은 테마는 카드가 거의 흰색이라 뒤가 밝으면
    "흰색 위에 흰색"이 되어 아무리 투명도를 낮춰도 유리로 보이지 않는다(실측).
    되지도 않는 설정을 켜게 두면 "켰는데 왜 그대로죠?" 가 된다.
  */
  if (!isDarkTheme()) return null;

  const current = matchGlassPreset({
    bgOpacity: widget.opacity ?? 1,
    cardOpacity: widget.cardOpacity ?? 1,
    blur: widget.blur ?? 0,
  });
  const glassOn = current !== 'none';
  const isWindows = typeof navigator !== 'undefined' && /Win/i.test(navigator.platform || '');

  const applyLevel = (level: GlassLevel) =>
    onPatch({
      opacity: GLASS_PRESETS[level].bgOpacity,
      cardOpacity: GLASS_PRESETS[level].cardOpacity,
      blur: GLASS_PRESETS[level].blur,
      // 단계를 바꿔도 "바탕화면 비치기" 선택은 유지한다.
      backdrop: level === 'none' ? 'none' : widget.backdrop === 'os' ? 'os' : 'generated',
    });

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex justify-between">
        <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium text-sp-text`}>
          유리 효과
        </span>
        <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-sp-accent`}>
          {current ? LEVEL_LABEL[current] : '직접 조절'}
        </span>
      </div>

      {!compact && (
        <p className="text-xs text-sp-muted">
          앱 뒤에 은은한 배경을 깔고 카드가 비쳐 보이게 합니다. 시간표·출결처럼 빽빽한 표는 읽기
          편하도록 그대로 둡니다.
        </p>
      )}

      <div className="flex gap-2">
        {LEVELS.map(({ level, label }) => (
          <button
            key={level}
            onClick={() => applyLevel(level)}
            className={`flex-1 rounded-lg border transition-colors ${
              compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
            } ${
              current === level
                ? 'bg-sp-accent text-sp-accent-fg border-sp-accent font-medium'
                : 'border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 흐림은 단계에 딸려 오지만, 더 만지고 싶은 사람을 위해 따로 남긴다. */}
      {glassOn && (
        <SliderRow
          label="흐림"
          min={0}
          max={40}
          step={2}
          compact={compact}
          unit="px"
          value={Math.round(widget.blur ?? 0)}
          onChange={(v) => onPatch({ blur: v })}
        />
      )}

      {/*
        윈도우 11 내장 유리. 켜면 OS 가 창 뒤의 바탕화면을 흐려서 배경으로 합성해 준다.
        앱이 배경을 만들 필요가 없어지고, 바탕화면을 바꾸면 앱도 따라 바뀐다.
        안 되는 환경에서는 앱이 만드는 배경으로 자동으로 되돌아간다.
      */}
      {glassOn && isWindows && (
        <label className="flex items-start gap-2.5 py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={widget.backdrop === 'os'}
            onChange={(e) => onPatch({ backdrop: e.target.checked ? 'os' : 'generated' })}
            className="mt-0.5 w-3.5 h-3.5 text-sp-accent focus:ring-sp-accent"
          />
          <div className="flex-1">
            <span className="text-xs font-medium text-sp-text">바탕화면 비치기</span>
            {!compact && (
              <p className="text-caption text-sp-muted mt-0.5 leading-relaxed">
                앱이 만든 배경 대신 실제 바탕화면이 흐리게 비칩니다. 윈도우 11에서만 동작하며, 안
                되면 자동으로 앱 배경으로 돌아갑니다.
              </p>
            )}
          </div>
        </label>
      )}
    </div>
  );
}
