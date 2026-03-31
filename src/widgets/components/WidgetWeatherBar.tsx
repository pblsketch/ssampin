import { useEffect } from 'react';
import { useWeatherStore } from '@adapters/stores/useWeatherStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { AirQualityGrade } from '@infrastructure/weather';

const AIR_QUALITY_COLOR: Record<AirQualityGrade, string> = {
  '좋음': 'text-green-400',
  '보통': 'text-yellow-400',
  '나쁨': 'text-orange-400',
  '매우나쁨': 'text-red-400',
};

/**
 * 위젯 모드 전용 날씨 바
 * - 기존 WeatherBar를 위젯 헤더 크기에 맞게 축소
 * - useWeatherStore 재사용 (데이터 계층 공유)
 * - 로딩/에러 시 graceful fallback (공간 차지 안 함)
 */
export function WidgetWeatherBar() {
  const weather = useWeatherStore((s) => s.weather);
  const loading = useWeatherStore((s) => s.loading);
  const refresh = useWeatherStore((s) => s.refresh);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const weatherLocation = useSettingsStore((s) => s.settings.weather.location);

  useEffect(() => {
    if (!settingsLoaded) return;
    void refresh();

    const interval = setInterval(() => void refresh(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh, settingsLoaded, weatherLocation]);

  if (loading && !weather) return null;
  if (!weather) return null;

  const airColor = AIR_QUALITY_COLOR[weather.airQuality];

  return (
    <div className="flex items-center justify-center gap-3 text-sp-muted text-xs mt-1 flex-wrap">
      <span className="flex items-center gap-0.5">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>thermostat</span>
        {weather.tempCurrent}&deg;C
      </span>

      <span className="w-0.5 h-0.5 rounded-full bg-sp-border inline-block" />

      <span className="flex items-center gap-0.5">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>water_drop</span>
        {weather.humidity}%
      </span>

      <span className="w-0.5 h-0.5 rounded-full bg-sp-border inline-block" />

      <span className={`flex items-center gap-0.5 ${airColor}`}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>air</span>
        {weather.airQuality}
      </span>

      <span className="w-0.5 h-0.5 rounded-full bg-sp-border inline-block" />

      <span>{weather.condition}</span>
    </div>
  );
}
