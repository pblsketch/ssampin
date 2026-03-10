import { useCallback } from 'react';
import type { Settings, WeatherSettings } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { KOREAN_CITIES } from '../shared/constants';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

export function WeatherTab({ draft, patch }: Props) {
  const patchWeather = useCallback((p: Partial<WeatherSettings>) => {
    patch({ weather: { ...draft.weather, ...p } });
  }, [draft.weather, patch]);

  return (
    <SettingsSection
      icon="cloud"
      iconColor="bg-sky-500/10 text-sky-500"
      title="날씨"
    >
      <div className="space-y-5">
        {/* 지역 선택 */}
        <div>
          <label className="block text-sm text-sp-muted mb-2">지역 선택</label>
          <select
            value={draft.weather.location ? `${draft.weather.location.lat},${draft.weather.location.lon}` : ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                patchWeather({ location: null });
                return;
              }
              const parts = val.split(',').map(Number);
              const lat = parts[0] ?? 0;
              const lon = parts[1] ?? 0;
              const selected = KOREAN_CITIES.find((c) => c.lat === lat && c.lon === lon);
              patchWeather({ location: { lat, lon, name: selected?.name ?? '' } });
            }}
            className="w-full px-4 py-3 bg-sp-surface border border-sp-border rounded-lg text-sp-text focus:ring-2 focus:ring-sp-accent focus:border-transparent outline-none"
          >
            <option value="">지역을 선택하세요</option>
            {KOREAN_CITIES.map((city) => (
              <option key={`${city.lat},${city.lon}`} value={`${city.lat},${city.lon}`}>
                {city.name}
              </option>
            ))}
          </select>
        </div>

        {/* 갱신 주기 */}
        <div>
          <label className="block text-sm text-sp-muted mb-2">갱신 주기</label>
          <div className="flex bg-sp-surface/80 p-1 rounded-lg border border-sp-border">
            {([
              { value: 15, label: '15분' },
              { value: 30, label: '30분' },
              { value: 60, label: '1시간' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => patchWeather({ refreshIntervalMin: opt.value })}
                className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${draft.weather.refreshIntervalMin === opt.value
                    ? 'bg-sp-accent text-white shadow-md'
                    : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 현재 상태 표시 */}
        {draft.weather.location && (
          <div className="p-3 bg-sp-surface/50 rounded-lg border border-sp-border">
            <p className="text-xs text-sp-muted">
              <span className="material-symbols-outlined text-sm align-middle mr-1">location_on</span>
              {draft.weather.location.name} · {draft.weather.refreshIntervalMin}분 간격 자동 갱신
            </p>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
