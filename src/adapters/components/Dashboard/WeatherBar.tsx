import { useEffect } from 'react';
import { useWeatherStore } from '@adapters/stores/useWeatherStore';
import type { AirQualityGrade } from '@infrastructure/weather';

const AIR_QUALITY_COLOR: Record<AirQualityGrade, string> = {
  '좋음': 'text-green-400',
  '보통': 'text-yellow-400',
  '나쁨': 'text-orange-400',
  '매우나쁨': 'text-red-400',
};

function Dot() {
  return <span className="w-1 h-1 rounded-full bg-sp-border inline-block" />;
}

export function WeatherBar() {
  const weather = useWeatherStore((s) => s.weather);
  const loading = useWeatherStore((s) => s.loading);
  const error = useWeatherStore((s) => s.error);
  const refresh = useWeatherStore((s) => s.refresh);

  useEffect(() => {
    void refresh();

    // 30분마다 자동 갱신
    const interval = setInterval(() => void refresh(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading && !weather) {
    return (
      <div className="flex items-center gap-2 text-sp-muted text-sm">
        <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
        날씨 정보 불러오는 중...
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="flex items-center gap-2 text-sp-muted text-sm">
        <span className="material-symbols-outlined text-base">cloud_off</span>
        {error || '설정 → 날씨에서 지역을 설정해주세요'}
      </div>
    );
  }

  const airColor = AIR_QUALITY_COLOR[weather.airQuality];

  return (
    <div className="flex items-center gap-4 text-sp-muted text-sm">
      <span className="flex items-center gap-1">
        <span className="material-symbols-outlined text-base">thermostat</span>
        {weather.tempCurrent}°C ({weather.tempMin}° ~ {weather.tempMax}°)
      </span>

      <Dot />

      <span className="flex items-center gap-1">
        <span className="material-symbols-outlined text-base">water_drop</span>
        습도 {weather.humidity}%
      </span>

      <Dot />

      <span className={`flex items-center gap-1 ${airColor}`}>
        <span className="material-symbols-outlined text-base">air</span>
        미세먼지 {weather.airQuality}
      </span>

      <Dot />

      <span className="flex items-center gap-1">
        {weather.condition}
      </span>
    </div>
  );
}
