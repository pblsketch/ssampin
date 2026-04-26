/**
 * v1.16.x Phase 2 (Design §5.4 / §5.2) — 보드 디자인 패널.
 *
 * 책임:
 *   - 색상 스킴 라디오 카드 2개 (light / dark) + 미니 미리보기.
 *   - 12 배경 프리셋 그리드 — 단색 4 + 그라디언트 4 + 패턴 4 (3그룹 라벨 분리).
 *   - 미리보기 영역 — 선택한 배경 위에 mock 카드 2장 렌더 (가독성 시각 검증용).
 *   - "기본값으로 복원" 버튼 (theme만 reset — 다른 settings는 보존).
 *
 * 설계 정책 (Plan §1.3):
 *   - accent 컬러 픽커 OOS — 도메인은 accent 보유하지만 UI 노출 X (v2 후속).
 *   - 변경 즉시 부모로 onChange 호출 — 디바운스/broadcast는 부모가 책임 (Drawer가 100ms 디바운스).
 *   - 클릭 한 번으로 즉시 반영 (별도 "저장" 버튼 X — Padlet 정합).
 *
 * 스타일 토큰 (memory feedback):
 *   - rounded-sp-* 사용 금지 → Tailwind 기본 키만 (rounded-xl=카드, rounded-lg=버튼/셀).
 *   - sp-* 색상 토큰 + 한국어 텍스트.
 *   - 모바일 (<640px): grid 2열, 데스크톱 sm:3열, max:4열.
 *
 * 회귀 위험 mitigation:
 *   - #7 8색 카드 alpha + dark 가독성 — 미리보기 영역에 yellow + blue 카드 2장 고정 노출
 *     (가장 흔한 색상 + 명도 차이 큰 조합)으로 사용자가 실시간 가독성 확인 가능.
 *   - #10 accent CSS injection — 카탈로그 hardcoded style만 주입, 외부 입력 보간 0.
 */

import { useMemo, type CSSProperties } from 'react';
import {
  DEFAULT_WALL_BOARD_THEME,
  type WallBoardBackgroundPresetId,
  type WallBoardColorScheme,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';
import {
  REALTIME_WALL_BOARD_THEME_PRESETS,
  REALTIME_WALL_BOARD_THEME_PRESET_BY_ID,
  resolveBoardThemeVariant,
  type ThemePresetEntry,
} from './RealtimeWallBoardThemePresets';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RealtimeWallBoardDesignPanelProps {
  /** 현재 적용된 테마 (parent state) */
  readonly value: WallBoardTheme;
  /** 변경 즉시 호출 — 디바운스/broadcast는 parent 책임 */
  readonly onChange: (next: WallBoardTheme) => void;
  /** "기본값으로 복원" 클릭 핸들러 (parent가 confirm dialog 처리 후 호출) */
  readonly onReset?: () => void;
}

// ---------------------------------------------------------------------------
// 메인 컴포넌트
// ---------------------------------------------------------------------------

export function RealtimeWallBoardDesignPanel({
  value,
  onChange,
  onReset,
}: RealtimeWallBoardDesignPanelProps) {
  // category 별 그룹 — useMemo로 1회 계산
  const groupedPresets = useMemo(() => {
    const map = new Map<ThemePresetEntry['category'], ThemePresetEntry[]>();
    for (const p of REALTIME_WALL_BOARD_THEME_PRESETS) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return map;
  }, []);

  const handleSchemeChange = (scheme: WallBoardColorScheme) => {
    if (value.colorScheme === scheme) return;
    onChange({ ...value, colorScheme: scheme });
  };

  const handlePresetChange = (presetId: WallBoardBackgroundPresetId) => {
    if (value.background.presetId === presetId) return;
    const entry = REALTIME_WALL_BOARD_THEME_PRESET_BY_ID.get(presetId);
    if (!entry) return;
    onChange({
      ...value,
      background: {
        type: entry.type,
        presetId,
      },
    });
  };

  const isResetDisabled =
    value.colorScheme === DEFAULT_WALL_BOARD_THEME.colorScheme &&
    value.background.presetId === DEFAULT_WALL_BOARD_THEME.background.presetId &&
    value.accent === undefined;

  return (
    <div className="space-y-5">
      {/* ===== 색상 스킴 라디오 ===== */}
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-sp-muted">색상 스킴</legend>
        <div className="grid grid-cols-2 gap-2.5">
          <SchemeRadioCard
            scheme="light"
            label="밝은 모드"
            icon="light_mode"
            selected={value.colorScheme === 'light'}
            onSelect={handleSchemeChange}
          />
          <SchemeRadioCard
            scheme="dark"
            label="어두운 모드"
            icon="dark_mode"
            selected={value.colorScheme === 'dark'}
            onSelect={handleSchemeChange}
          />
        </div>
      </fieldset>

      {/* ===== 배경 프리셋 그리드 ===== */}
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-sp-muted">배경</legend>
        <div className="space-y-3">
          {(['단색', '그라디언트', '패턴'] as const).map((cat) => {
            const presets = groupedPresets.get(cat) ?? [];
            return (
              <div key={cat}>
                <p className="mb-1.5 text-detail text-sp-muted/80">{cat}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {presets.map((p) => (
                    <PresetCell
                      key={p.id}
                      entry={p}
                      colorScheme={value.colorScheme}
                      selected={value.background.presetId === p.id}
                      onSelect={() => handlePresetChange(p.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      {/* ===== 미리보기 (mock 카드 2장 — 회귀 #7 가독성 시각 검증) ===== */}
      <fieldset>
        <legend className="mb-2 text-xs font-semibold text-sp-muted">미리보기</legend>
        <BoardThemePreview theme={value} />
      </fieldset>

      {/* ===== 기본값으로 복원 ===== */}
      {onReset && (
        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={onReset}
            disabled={isResetDisabled}
            className="rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-muted transition hover:border-sp-accent/40 hover:text-sp-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            기본값으로 복원
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SchemeRadioCard — light / dark 라디오 카드
// ---------------------------------------------------------------------------

interface SchemeRadioCardProps {
  readonly scheme: WallBoardColorScheme;
  readonly label: string;
  readonly icon: string;
  readonly selected: boolean;
  readonly onSelect: (scheme: WallBoardColorScheme) => void;
}

function SchemeRadioCard({
  scheme,
  label,
  icon,
  selected,
  onSelect,
}: SchemeRadioCardProps) {
  // mini-preview 색상 (현재 카드 자체 배경) — light/dark 직관 표시
  const previewBg = scheme === 'light' ? '#fafaf7' : '#1a1a1a';
  const previewCardBg = scheme === 'light' ? '#ffffff' : '#2a2a2a';
  const previewLineBg = scheme === 'light' ? '#cbd5e1' : '#475569';

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={() => onSelect(scheme)}
      className={[
        'flex flex-col items-stretch gap-2 rounded-lg border p-3 text-left transition',
        selected
          ? 'border-sp-accent bg-sp-accent/10 ring-2 ring-sp-accent/30'
          : 'border-sp-border bg-sp-surface hover:border-sp-accent/40',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        <span
          className={[
            'material-symbols-outlined text-lg',
            selected ? 'text-sp-accent' : 'text-sp-muted',
          ].join(' ')}
        >
          {icon}
        </span>
        <span
          className={[
            'text-xs font-bold',
            selected ? 'text-sp-text' : 'text-sp-muted',
          ].join(' ')}
        >
          {label}
        </span>
      </div>
      {/* mini-preview */}
      <div
        className="rounded-md border border-sp-border/40 p-1.5"
        style={{ backgroundColor: previewBg }}
        aria-hidden="true"
      >
        <div className="flex flex-col gap-1">
          <div
            className="h-3 w-3/4 rounded"
            style={{ backgroundColor: previewCardBg }}
          />
          <div
            className="h-1.5 w-1/2 rounded"
            style={{ backgroundColor: previewLineBg }}
          />
          <div
            className="h-1.5 w-2/3 rounded"
            style={{ backgroundColor: previewLineBg }}
          />
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// PresetCell — 60×40 배경 미리보기 셀 + 한국어 라벨
// ---------------------------------------------------------------------------

interface PresetCellProps {
  readonly entry: ThemePresetEntry;
  readonly colorScheme: WallBoardColorScheme;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function PresetCell({ entry, colorScheme, selected, onSelect }: PresetCellProps) {
  // 카탈로그에서 직접 variant 추출 — 런타임 hardcoded 색상만 사용 (회귀 #10)
  const variant = entry[colorScheme];
  const swatchStyle: CSSProperties = {
    ...(variant.style ?? {}),
  };

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${entry.label} 배경`}
      onClick={onSelect}
      className={[
        'group flex flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left transition',
        selected
          ? 'border-sp-accent ring-2 ring-sp-accent/40'
          : 'border-sp-border hover:border-sp-accent/40',
      ].join(' ')}
    >
      <div
        className={[
          'h-10 w-full rounded-md border',
          selected ? 'border-sp-accent/30' : 'border-sp-border/40',
        ].join(' ')}
        style={swatchStyle}
        aria-hidden="true"
      />
      <span
        className={[
          'truncate text-detail',
          selected ? 'font-bold text-sp-text' : 'text-sp-muted',
        ].join(' ')}
      >
        {entry.label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// BoardThemePreview — 선택한 배경 위 mock 카드 2장 (회귀 #7 시각 검증)
// ---------------------------------------------------------------------------

interface BoardThemePreviewProps {
  readonly theme: WallBoardTheme;
}

function BoardThemePreview({ theme }: BoardThemePreviewProps) {
  const variant = resolveBoardThemeVariant(theme.background.presetId, theme.colorScheme);
  const previewStyle: CSSProperties = {
    ...(variant.style ?? {}),
  };

  // 카드는 회귀 #7 가독성 검증을 위해 가장 흔한 yellow + blue 두 색상 고정
  // (실제 카드 alpha 80% + 좌상단 dot 시각 패턴 모방)
  const isDark = theme.colorScheme === 'dark';
  const yellowCardBg = isDark ? 'rgba(202, 138, 4, 0.45)' : 'rgba(254, 240, 138, 0.85)';
  const yellowDot = '#eab308';
  const blueCardBg = isDark ? 'rgba(29, 78, 216, 0.45)' : 'rgba(191, 219, 254, 0.85)';
  const blueDot = '#3b82f6';
  const cardTextColor = isDark ? '#f8fafc' : '#0f172a';
  const cardSubTextColor = isDark ? '#cbd5e1' : '#475569';

  return (
    <div
      className="rounded-xl border border-sp-border p-3"
      style={previewStyle}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <MockCard
          dotColor={yellowDot}
          cardBg={yellowCardBg}
          textColor={cardTextColor}
          subTextColor={cardSubTextColor}
          nickname="민지"
          text="오늘 발표 잘 되었으면 좋겠어요"
        />
        <MockCard
          dotColor={blueDot}
          cardBg={blueCardBg}
          textColor={cardTextColor}
          subTextColor={cardSubTextColor}
          nickname="준호"
          text="모둠 활동이 재밌었어요"
        />
      </div>
      <p className={[
        'mt-2 text-detail',
        isDark ? 'text-slate-200/80' : 'text-slate-700/80',
      ].join(' ')}>
        선택한 배경 위 카드 미리보기
      </p>
    </div>
  );
}

interface MockCardProps {
  readonly dotColor: string;
  readonly cardBg: string;
  readonly textColor: string;
  readonly subTextColor: string;
  readonly nickname: string;
  readonly text: string;
}

function MockCard({
  dotColor,
  cardBg,
  textColor,
  subTextColor,
  nickname,
  text,
}: MockCardProps) {
  return (
    <div
      className="relative rounded-lg p-2.5 shadow-sm"
      style={{ backgroundColor: cardBg }}
      aria-hidden="true"
    >
      <span
        className="absolute left-2 top-2 inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <p
        className="ml-3 text-detail font-bold"
        style={{ color: subTextColor }}
      >
        {nickname}
      </p>
      <p
        className="mt-1 text-caption leading-snug"
        style={{ color: textColor }}
      >
        {text}
      </p>
    </div>
  );
}
