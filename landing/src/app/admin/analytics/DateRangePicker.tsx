'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

const PRESETS = [
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
  { label: '60일', days: 60 },
  { label: '전체', days: 0 },
];

export default function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeDays = searchParams.get('days');
  const activeFrom = searchParams.get('from');
  const activeTo = searchParams.get('to');

  // Determine which preset is active
  const isPresetActive = (days: number) => {
    if (activeFrom || activeTo) return false;
    if (days === 0) return activeDays === '0';
    if (!activeDays) return days === 14; // default
    return Number(activeDays) === days;
  };

  const isCustomActive = !!(activeFrom || activeTo);

  const setParams = useCallback((params: Record<string, string>) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    router.replace(`?${sp.toString()}`, { scroll: false });
  }, [router]);

  const handlePreset = (days: number) => {
    setParams(days === 0 ? { days: '0' } : { days: String(days) });
  };

  const handleCustomDate = (key: 'from' | 'to', value: string) => {
    const from = key === 'from' ? value : (activeFrom || '');
    const to = key === 'to' ? value : (activeTo || '');
    setParams({ from, to });
  };

  // Calculate default date values for custom inputs
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Preset buttons */}
      <div className="flex gap-1">
        {PRESETS.map(({ label, days }) => (
          <button
            key={days}
            onClick={() => handlePreset(days)}
            className={`px-3 py-1.5 text-sm rounded-lg transition ${
              isPresetActive(days)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-gray-700" />

      {/* Custom date inputs */}
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={activeFrom || ''}
          max={activeTo || today}
          onChange={(e) => handleCustomDate('from', e.target.value)}
          className={`bg-gray-800 border rounded-lg px-2 py-1.5 text-sm ${
            isCustomActive ? 'border-blue-600 text-white' : 'border-gray-700 text-gray-400'
          }`}
        />
        <span className="text-gray-500 text-sm">~</span>
        <input
          type="date"
          value={activeTo || ''}
          min={activeFrom || ''}
          max={today}
          onChange={(e) => handleCustomDate('to', e.target.value)}
          className={`bg-gray-800 border rounded-lg px-2 py-1.5 text-sm ${
            isCustomActive ? 'border-blue-600 text-white' : 'border-gray-700 text-gray-400'
          }`}
        />
      </div>
    </div>
  );
}
