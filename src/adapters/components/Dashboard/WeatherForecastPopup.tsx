import { useEffect } from 'react';
import type { ForecastDay } from '@infrastructure/weather';

interface WeatherForecastPopupProps {
  forecast: ForecastDay[];
  onClose: () => void;
}

function formatMonthDay(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m ?? ''}.${d ?? ''}`;
}

function rainColor(chance: number): string {
  if (chance >= 70) return 'text-blue-400';
  if (chance >= 30) return 'text-sky-400';
  return 'text-sp-muted';
}

export function WeatherForecastPopup({ forecast, onClose }: WeatherForecastPopupProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-2xl pointer-events-auto flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="weather-forecast-title"
        >
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sp-accent/10">
                <span className="material-symbols-outlined text-sp-accent">calendar_month</span>
              </div>
              <div>
                <h2 id="weather-forecast-title" className="text-lg font-bold text-sp-text">
                  주간 날씨 예보
                </h2>
                <p className="text-xs text-sp-muted mt-0.5">
                  오늘부터 {forecast.length}일간의 날씨를 한눈에 보세요
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-sp-muted hover:text-sp-text transition-colors rounded-lg p-1 hover:bg-sp-text/5"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="px-6 py-5">
            {forecast.length === 0 ? (
              <div className="text-center text-sm text-sp-muted py-8">
                예보 데이터를 불러올 수 없습니다.
              </div>
            ) : (
              <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${forecast.length}, minmax(0, 1fr))` }}>
                {forecast.map((day, idx) => {
                  const isToday = day.date === todayISO;
                  const label = isToday ? '오늘' : idx === 1 ? '내일' : day.dayOfWeek;
                  return (
                    <div
                      key={day.date}
                      className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 border transition-colors ${
                        isToday
                          ? 'border-sp-accent/60 bg-sp-accent/10'
                          : 'border-sp-border/40 bg-sp-surface/60'
                      }`}
                      title={day.condition}
                    >
                      <span className={`text-xs font-semibold ${isToday ? 'text-sp-accent' : 'text-sp-text'}`}>
                        {label}
                      </span>
                      <span className="text-detail text-sp-muted">{formatMonthDay(day.date)}</span>
                      <img
                        src={day.conditionIcon}
                        alt={day.condition}
                        className="w-10 h-10"
                        loading="lazy"
                      />
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-bold text-sp-text">{day.tempMax}°</span>
                        <span className="text-xs text-sp-muted">/ {day.tempMin}°</span>
                      </div>
                      <div className={`flex items-center gap-0.5 text-xs ${rainColor(day.chanceOfRain)}`}>
                        <span className="material-symbols-outlined text-icon">water_drop</span>
                        {day.chanceOfRain}%
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-6 pb-5">
            <div className="flex items-center justify-center gap-4 text-detail text-sp-muted bg-sp-surface/50 rounded-lg py-2 px-3 border border-sp-border/30">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-icon">thermostat</span>
                최고 / 최저 기온
              </span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-icon">water_drop</span>
                강수 확률
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
