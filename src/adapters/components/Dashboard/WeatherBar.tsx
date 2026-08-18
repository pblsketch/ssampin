import { useEffect, useState } from 'react';
import { useWeatherStore } from '@adapters/stores/useWeatherStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { AirQualityGrade } from '@infrastructure/weather';
import { WeatherForecastPopup } from './WeatherForecastPopup';

const AIR_QUALITY_COLOR: Record<AirQualityGrade, string> = {
  좋음: 'text-green-400',
  보통: 'text-yellow-400',
  나쁨: 'text-orange-400',
  매우나쁨: 'text-red-400',
};

function Dot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`w-1 h-1 rounded-full bg-sp-border inline-block shrink-0 ${className}`.trim()}
    />
  );
}

export function WeatherBar() {
  const weather = useWeatherStore((s) => s.weather);
  const loading = useWeatherStore((s) => s.loading);
  const error = useWeatherStore((s) => s.error);
  const refresh = useWeatherStore((s) => s.refresh);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const weatherLocation = useSettingsStore((s) => s.settings.weather.location);
  const [showForecast, setShowForecast] = useState(false);

  useEffect(() => {
    if (!settingsLoaded) return; // settings 아직 로드 안 됐으면 대기
    void refresh();

    // 30분마다 자동 갱신
    const interval = setInterval(() => void refresh(), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh, settingsLoaded, weatherLocation]);

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
  const iconUrl = weather.conditionIcon
    ? weather.conditionIcon.startsWith('http')
      ? weather.conditionIcon
      : `https:${weather.conditionIcon}`
    : null;
  const hasForecast = weather.forecast && weather.forecast.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => hasForecast && setShowForecast(true)}
        disabled={!hasForecast}
        title={hasForecast ? '클릭하여 주간 예보 보기' : undefined}
        /*
          좁은 창 대응 (2026-08-18).

          창 최소 폭이 1024px 이고 왼쪽 메뉴가 256px 이라 대시보드에 남는 폭은 약 700px 인데,
          시계·날씨·배너·버튼을 합치면 1,600px 이 넘게 필요했다. 자리가 모자라자 브라우저가
          글자를 쪼갰고, 한국어는 낱말 묶기가 없으면 **글자 사이 어디서나** 끊기므로
          "맑음" 이 "맑"/"음" 세로 두 줄이 됐다.

          그래서 두 가지를 건다.
          - 각 항목에 `whitespace-nowrap break-keep` — 항목 **안에서는** 절대 끊기지 않는다.
          - 컨테이너에 `flex-wrap` — 모자라면 **항목과 항목 사이에서** 줄이 바뀐다.
          습도는 좁을 때 접는다(준일님 결정, 2026-08-18). 주간 예보 팝업에서 계속 볼 수 있다.
        */
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 text-sp-muted text-sm rounded-lg px-2 py-1 -mx-2 transition-colors ${
          hasForecast ? 'cursor-pointer hover:bg-sp-text/5' : 'cursor-default'
        }`}
      >
        <span className="flex items-center gap-1 whitespace-nowrap break-keep">
          <span className="material-symbols-outlined text-base">thermostat</span>
          {weather.tempCurrent}°C ({weather.tempMin}° ~ {weather.tempMax}°)
        </span>

        <Dot />

        <span className="hidden xl:flex items-center gap-1 whitespace-nowrap break-keep">
          <span className="material-symbols-outlined text-base">water_drop</span>
          습도 {weather.humidity}%
        </span>

        <Dot className="hidden xl:inline-block" />

        <span className={`flex items-center gap-1 whitespace-nowrap break-keep ${airColor}`}>
          <span className="material-symbols-outlined text-base">air</span>
          미세먼지 {weather.airQuality}
        </span>

        <Dot />

        <span className="flex items-center gap-1 whitespace-nowrap break-keep">
          {iconUrl && <img src={iconUrl} alt="" className="w-5 h-5 shrink-0" />}
          {weather.condition}
        </span>

        {hasForecast && (
          <span className="material-symbols-outlined text-base text-sp-muted/60">
            chevron_right
          </span>
        )}
      </button>

      {showForecast && weather.forecast && (
        <WeatherForecastPopup forecast={weather.forecast} onClose={() => setShowForecast(false)} />
      )}
    </>
  );
}
