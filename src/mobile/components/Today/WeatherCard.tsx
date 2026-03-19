import { useState, useEffect, useCallback } from 'react';
import type { WeatherData, AirQualityGrade } from '@infrastructure/weather';
import { fetchWeather } from '@infrastructure/weather';
import { settingsRepository } from '@mobile/di/container';

const AIR_QUALITY_COLOR: Record<AirQualityGrade, string> = {
  '좋음': 'text-green-500',
  '보통': 'text-yellow-500',
  '나쁨': 'text-orange-500',
  '매우나쁨': 'text-red-500',
};

export function WeatherCard() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const settings = await settingsRepository.getSettings();
      const loc = settings?.weather?.location;
      if (!loc) {
        setError('날씨 지역이 설정되지 않았습니다');
        setLoading(false);
        return;
      }
      const data = await fetchWeather(loc.lat, loc.lon);
      setWeather(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '날씨 정보를 가져올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-sky-500">partly_cloudy_day</span>
          <span className="text-sp-text font-bold">오늘 날씨</span>
        </div>
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-full bg-sp-border" />
          <div className="space-y-2">
            <div className="h-6 w-20 rounded bg-sp-border" />
            <div className="h-3 w-14 rounded bg-sp-border" />
          </div>
          <div className="ml-auto space-y-2">
            <div className="h-3 w-16 rounded bg-sp-border" />
            <div className="h-3 w-12 rounded bg-sp-border" />
            <div className="h-3 w-16 rounded bg-sp-border" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-sky-500">partly_cloudy_day</span>
          <span className="text-sp-text font-bold">오늘 날씨</span>
        </div>
        <div className="flex items-center gap-3 text-sp-muted">
          <span className="material-symbols-outlined text-2xl">location_off</span>
          <p className="text-sm">{error ?? '날씨 정보를 불러올 수 없습니다'}</p>
        </div>
      </div>
    );
  }

  const airColor = AIR_QUALITY_COLOR[weather.airQuality];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-sky-500">partly_cloudy_day</span>
        <span className="text-sp-text font-bold">오늘 날씨</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {weather.conditionIcon && (
            <img src={`https:${weather.conditionIcon}`} alt="" className="w-10 h-10" />
          )}
          <div>
            <p className="text-sp-text font-bold text-2xl">{weather.tempCurrent}°C</p>
            <p className="text-sp-muted text-xs">{weather.tempMin}° / {weather.tempMax}°</p>
          </div>
        </div>
        <div className="text-right space-y-1">
          <p className="text-sp-muted text-xs">{weather.condition}</p>
          <p className="text-sp-muted text-xs">습도 {weather.humidity}%</p>
          <p className={`text-xs ${airColor}`}>미세먼지 {weather.airQuality}</p>
        </div>
      </div>
    </div>
  );
}
