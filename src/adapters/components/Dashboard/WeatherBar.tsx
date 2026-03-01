interface WeatherInfo {
  tempMin: number;
  tempMax: number;
  humidity: number;
  airQuality: '좋음' | '보통' | '나쁨' | '매우나쁨';
}

// MVP: placeholder data until real weather API is wired up
const PLACEHOLDER_WEATHER: WeatherInfo = {
  tempMin: 2,
  tempMax: 10,
  humidity: 85,
  airQuality: '좋음',
};

const AIR_QUALITY_COLOR: Record<WeatherInfo['airQuality'], string> = {
  '좋음': 'text-green-400',
  '보통': 'text-yellow-400',
  '나쁨': 'text-orange-400',
  '매우나쁨': 'text-red-400',
};

function Dot() {
  return <span className="w-1 h-1 rounded-full bg-sp-border inline-block" />;
}

export function WeatherBar() {
  const weather = PLACEHOLDER_WEATHER;
  const airColor = AIR_QUALITY_COLOR[weather.airQuality];

  return (
    <div className="flex items-center gap-4 text-sp-muted text-sm">
      <span className="flex items-center gap-1">
        <span className="material-symbols-outlined text-base">thermostat</span>
        {weather.tempMin}°C ~ {weather.tempMax}°C
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
    </div>
  );
}
