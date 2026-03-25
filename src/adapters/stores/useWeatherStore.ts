import { create } from 'zustand';
import { fetchWeather } from '@infrastructure/weather';
import type { WeatherData } from '@infrastructure/weather';
import { useSettingsStore } from './useSettingsStore';

interface WeatherState {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useWeatherStore = create<WeatherState>((set, get) => ({
  weather: null,
  loading: false,
  error: null,

  refresh: async () => {
    const { weather: weatherSettings } = useSettingsStore.getState().settings;
    if (!weatherSettings.location) {
      // settings가 아직 로드 중일 수 있으므로 기존 에러가 없을 때만 설정 (깜빡임 방지)
      if (!get().error) {
        set({ error: '날씨 설정이 필요합니다 (설정 → 날씨 지역)', loading: false });
      }
      return;
    }

    // 캐시: 마지막 조회 후 refreshIntervalMin이 지나지 않았으면 skip
    const existing = get().weather;
    const intervalMs = weatherSettings.refreshIntervalMin * 60 * 1000;
    if (existing && Date.now() - existing.fetchedAt < intervalMs) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const data = await fetchWeather(
        weatherSettings.location.lat,
        weatherSettings.location.lon,
      );
      set({ weather: data, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : '날씨 정보를 가져올 수 없습니다';
      set({ loading: false, error: message });
    }
  },
}));
