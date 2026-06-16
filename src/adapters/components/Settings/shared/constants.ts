import type { SchoolLevel } from '@domain/entities/Settings';

// 전국 시·군 좌표표는 도메인(koreanGeo)이 단일 출처다 — 날씨 지역 선택(WeatherTab)과
// 온보딩 주소→좌표 자동설정(geocodeAddress)이 같은 데이터를 공유한다(school-enrich ②-A).
export { KOREAN_CITIES } from '@domain/services/koreanGeo';
export type { KoreanRegionGeo } from '@domain/services/koreanGeo';

export const COLOR_MAP: Record<string, { bg: string; shadow: string; ring: string }> = {
  blue: {
    bg: 'bg-blue-500',
    shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]',
    ring: 'ring-blue-500',
  },
  green: {
    bg: 'bg-green-500',
    shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]',
    ring: 'ring-green-500',
  },
  yellow: {
    bg: 'bg-amber-500',
    shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    ring: 'ring-amber-500',
  },
  purple: {
    bg: 'bg-purple-500',
    shadow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]',
    ring: 'ring-purple-500',
  },
  red: { bg: 'bg-red-500', shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]', ring: 'ring-red-500' },
  pink: {
    bg: 'bg-pink-500',
    shadow: 'shadow-[0_0_8px_rgba(236,72,153,0.5)]',
    ring: 'ring-pink-500',
  },
  indigo: {
    bg: 'bg-indigo-500',
    shadow: 'shadow-[0_0_8px_rgba(99,102,241,0.5)]',
    ring: 'ring-indigo-500',
  },
  teal: {
    bg: 'bg-teal-500',
    shadow: 'shadow-[0_0_8px_rgba(20,184,166,0.5)]',
    ring: 'ring-teal-500',
  },
  gray: {
    bg: 'bg-slate-400',
    shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]',
    ring: 'ring-slate-400',
  },
};

export function colorDot(color: string, size = 'w-3 h-3') {
  const fallback = COLOR_MAP['gray']!;
  const c = COLOR_MAP[color] ?? fallback;
  return `${size} rounded-full ${c.bg} ${c.shadow}`;
}

export const DEFAULT_CAT_IDS = new Set(['school', 'class', 'department', 'treeSchool', 'etc']);

export const SCHOOL_LEVEL_OPTIONS: { value: SchoolLevel; label: string; desc: string }[] = [
  { value: 'elementary', label: '초등학교', desc: '40분 수업 · 6교시' },
  { value: 'middle', label: '중학교', desc: '45분 수업 · 7교시' },
  { value: 'high', label: '고등학교', desc: '50분 수업 · 7교시' },
  { value: 'custom', label: '직접 설정', desc: '수업 시간·교시 수 자유 설정' },
];

export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: '즉시 (매번)' },
  { value: 1, label: '1분' },
  { value: 3, label: '3분' },
  { value: 5, label: '5분' },
  { value: 10, label: '10분' },
  { value: 30, label: '30분' },
];
