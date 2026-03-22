import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import type { Settings, WeatherSettings } from '@domain/entities/Settings';
import { SettingsSection } from '../shared/SettingsSection';
import { KOREAN_CITIES } from '../shared/constants';

interface Props {
  draft: Settings;
  patch: (p: Partial<Settings>) => void;
}

type City = (typeof KOREAN_CITIES)[number];

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-sp-accent/30 text-sp-text rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function WeatherTab({ draft, patch }: Props) {
  const patchWeather = useCallback((p: Partial<WeatherSettings>) => {
    patch({ weather: { ...draft.weather, ...p } });
  }, [draft.weather, patch]);

  const regionGroups = useMemo(() => {
    const groups = new Map<string, typeof KOREAN_CITIES>();
    for (const city of KOREAN_CITIES) {
      const list = groups.get(city.region) ?? [];
      list.push(city);
      groups.set(city.region, list);
    }
    return groups;
  }, []);

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredGroups = useMemo(() => {
    if (!query) return regionGroups;
    const result = new Map<string, City[]>();
    for (const [region, cities] of regionGroups) {
      const matched = cities.filter((c) => c.name.includes(query));
      if (matched.length > 0) result.set(region, matched);
    }
    return result;
  }, [regionGroups, query]);

  const totalFiltered = useMemo(() => {
    let count = 0;
    for (const cities of filteredGroups.values()) count += cities.length;
    return count;
  }, [filteredGroups]);

  const selectedCity = useMemo(() => {
    if (!draft.weather.location) return null;
    return KOREAN_CITIES.find(
      (c) => c.lat === draft.weather.location!.lat && c.lon === draft.weather.location!.lon,
    ) ?? null;
  }, [draft.weather.location]);

  const handleSelect = useCallback((city: City) => {
    patchWeather({ location: { lat: city.lat, lon: city.lon, name: city.name } });
    setIsOpen(false);
    setQuery('');
  }, [patchWeather]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    patchWeather({ location: null });
    setQuery('');
    setIsOpen(false);
  }, [patchWeather]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    if (!isOpen) setIsOpen(true);
  }, [isOpen]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  }, []);

  const displayValue = isOpen ? query : (selectedCity?.name ?? '');

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
          <div ref={containerRef} className="relative">
            {/* Input */}
            <div
              className={`flex items-center w-full px-3 py-3 bg-sp-surface border rounded-lg text-sp-text transition-all cursor-text ${
                isOpen ? 'border-sp-accent ring-2 ring-sp-accent/30' : 'border-sp-border'
              }`}
              onClick={() => {
                setIsOpen(true);
                inputRef.current?.focus();
              }}
            >
              <span className="material-symbols-outlined text-sp-muted text-[18px] mr-2 shrink-0 select-none">
                search
              </span>
              <input
                ref={inputRef}
                type="text"
                value={displayValue}
                onChange={handleInputChange}
                onFocus={() => {
                  setIsOpen(true);
                  if (!isOpen) setQuery('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="지역을 검색하세요"
                className="flex-1 bg-transparent outline-none text-sm text-sp-text placeholder:text-sp-muted/60 min-w-0"
              />
              {selectedCity && !isOpen && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="ml-1 shrink-0 text-sp-muted hover:text-sp-text transition-colors"
                  title="선택 해제"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
              {!selectedCity && !isOpen && (
                <span className="material-symbols-outlined text-sp-muted text-[18px] shrink-0 select-none">
                  expand_more
                </span>
              )}
              {isOpen && (
                <span className="material-symbols-outlined text-sp-muted text-[18px] shrink-0 select-none">
                  expand_less
                </span>
              )}
            </div>

            {/* Dropdown */}
            {isOpen && (
              <div className="absolute z-50 w-full mt-1 bg-sp-card border border-sp-border rounded-lg shadow-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  {totalFiltered === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-sp-muted">
                      검색 결과가 없습니다
                    </div>
                  ) : (
                    Array.from(filteredGroups.entries()).map(([region, cities]) => (
                      <div key={region}>
                        <div className="px-3 py-1.5 text-xs text-sp-muted font-medium bg-sp-surface/50 sticky top-0 z-10">
                          {region}
                        </div>
                        {cities.map((city) => {
                          const isSelected =
                            selectedCity?.lat === city.lat && selectedCity?.lon === city.lon;
                          return (
                            <button
                              key={`${city.lat},${city.lon}`}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleSelect(city)}
                              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                                isSelected
                                  ? 'bg-sp-accent/20 text-sp-text'
                                  : 'text-sp-text hover:bg-sp-accent/10'
                              }`}
                            >
                              <span>{highlightMatch(city.name, query)}</span>
                              {isSelected && (
                                <span className="material-symbols-outlined text-sp-accent text-[16px] shrink-0">
                                  check
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
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
