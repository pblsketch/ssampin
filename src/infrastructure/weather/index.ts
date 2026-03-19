// WeatherAPI.com Client

export type AirQualityGrade = '좋음' | '보통' | '나쁨' | '매우나쁨';

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
      day: {
        maxtemp_c: number;
        mintemp_c: number;
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
  const url = `${base}/v1/forecast.json?key=${encodeURIComponent(WEATHER_API_KEY)}&q=${lat},${lon}&days=1&aqi=yes&lang=ko`;

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
    fetchedAt: Date.now(),
  };
}
