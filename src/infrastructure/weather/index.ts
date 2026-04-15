// WeatherAPI.com Client

export type AirQualityGrade = '좋음' | '보통' | '나쁨' | '매우나쁨';

export interface ForecastDay {
  readonly date: string;             // "2026-04-16"
  readonly dayOfWeek: string;        // "수"
  readonly tempMin: number;
  readonly tempMax: number;
  readonly condition: string;        // "맑음"
  readonly conditionIcon: string;    // WeatherAPI CDN URL (https: 프리픽스 포함)
  readonly chanceOfRain: number;     // 강수 확률 %
}

export interface WeatherData {
  readonly tempCurrent: number;
  readonly tempMin: number;
  readonly tempMax: number;
  readonly humidity: number;
  readonly condition: string;        // 예: "맑음", "흐림", "비"
  readonly conditionIcon: string;    // 아이콘 URL
  readonly pm10: number;
  readonly pm25: number;
  readonly airQuality: AirQualityGrade;
  readonly forecast: ForecastDay[];  // 7일치 예보 (오늘 포함)
  readonly fetchedAt: number;        // Date.now()
}

interface WeatherApiCurrentResponse {
  current: {
    temp_c: number;
    humidity: number;
    condition: {
      text: string;
      icon: string;
    };
    air_quality?: {
      pm2_5: number;
      pm10: number;
      'us-epa-index': number;
    };
  };
  forecast: {
    forecastday: Array<{
      date: string;
      day: {
        maxtemp_c: number;
        mintemp_c: number;
        daily_chance_of_rain: number;
        condition: {
          text: string;
          icon: string;
        };
      };
    }>;
  };
}

function epaIndexToGrade(epaIndex: number): AirQualityGrade {
  // US EPA Index: 1=Good, 2=Moderate, 3=Unhealthy(sensitive), 4=Unhealthy, 5=Very Unhealthy, 6=Hazardous
  if (epaIndex <= 1) return '좋음';
  if (epaIndex <= 2) return '보통';
  if (epaIndex <= 4) return '나쁨';
  return '매우나쁨';
}

const WEATHER_API_KEY = '183106431a614a27bfb220356260103';
const isElectron = typeof window !== 'undefined' && window.electronAPI != null;

export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherData> {
  // Electron → 직접 호출, 브라우저 → 프록시 경유 (CORS 우회)
  const base = isElectron ? 'https://api.weatherapi.com' : '/weather-api';
  const url = `${base}/v1/forecast.json?key=${encodeURIComponent(WEATHER_API_KEY)}&q=${lat},${lon}&days=7&aqi=yes&lang=ko`;

  const res = await fetch(url);
  if (!res.ok) {
    const errorBody = await res.text().catch(() => '');
    throw new Error(`Weather API error ${res.status}: ${errorBody}`);
  }

  const data: WeatherApiCurrentResponse = await res.json();
  const { current, forecast } = data;
  const today = forecast.forecastday[0];
  if (!today) {
    throw new Error('No forecast data available');
  }

  const airQuality = current.air_quality;

  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
  const forecastDays: ForecastDay[] = forecast.forecastday.map((d) => {
    // YYYY-MM-DD 를 로컬 기준으로 파싱 (타임존 경계에서 하루 밀리는 문제 방지)
    const [y, m, day] = d.date.split('-').map(Number);
    const dateObj = new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
    const iconUrl = d.day.condition.icon.startsWith('http')
      ? d.day.condition.icon
      : `https:${d.day.condition.icon}`;
    return {
      date: d.date,
      dayOfWeek: DAY_LABELS[dateObj.getDay()] ?? '',
      tempMin: Math.round(d.day.mintemp_c),
      tempMax: Math.round(d.day.maxtemp_c),
      condition: d.day.condition.text,
      conditionIcon: iconUrl,
      chanceOfRain: Math.round(d.day.daily_chance_of_rain ?? 0),
    };
  });

  return {
    tempCurrent: Math.round(current.temp_c),
    tempMin: Math.round(today.day.mintemp_c),
    tempMax: Math.round(today.day.maxtemp_c),
    humidity: current.humidity,
    condition: current.condition.text,
    conditionIcon: current.condition.icon,
    pm10: Math.round(airQuality?.pm10 ?? 0),
    pm25: Math.round(airQuality?.pm2_5 ?? 0),
    airQuality: epaIndexToGrade(airQuality?.['us-epa-index'] ?? 1),
    forecast: forecastDays,
    fetchedAt: Date.now(),
  };
}
