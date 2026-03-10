import type { SchoolLevel } from '@domain/entities/Settings';

export const KOREAN_CITIES: { name: string; lat: number; lon: number }[] = [
  { name: '서울', lat: 37.5665, lon: 126.978 },
  { name: '부산', lat: 35.1796, lon: 129.0756 },
  { name: '대구', lat: 35.8714, lon: 128.6014 },
  { name: '인천', lat: 37.4563, lon: 126.7052 },
  { name: '광주', lat: 35.1595, lon: 126.8526 },
  { name: '대전', lat: 36.3504, lon: 127.3845 },
  { name: '울산', lat: 35.5384, lon: 129.3114 },
  { name: '세종', lat: 36.48, lon: 127.2553 },
  { name: '수원', lat: 37.2636, lon: 127.0286 },
  { name: '성남', lat: 37.4201, lon: 127.1265 },
  { name: '고양', lat: 37.6584, lon: 126.832 },
  { name: '용인', lat: 37.2411, lon: 127.1776 },
  { name: '창원', lat: 35.2281, lon: 128.6811 },
  { name: '청주', lat: 36.6424, lon: 127.489 },
  { name: '천안', lat: 36.8151, lon: 127.1139 },
  { name: '전주', lat: 35.8242, lon: 127.148 },
  { name: '포항', lat: 36.019, lon: 129.3435 },
  { name: '제주', lat: 33.4996, lon: 126.5312 },
  { name: '김해', lat: 35.2285, lon: 128.8894 },
  { name: '춘천', lat: 37.8813, lon: 127.7298 },
  { name: '원주', lat: 37.342, lon: 127.9201 },
  { name: '강릉', lat: 37.7519, lon: 128.8761 },
  { name: '목포', lat: 34.8118, lon: 126.3922 },
  { name: '여수', lat: 34.7604, lon: 127.6622 },
  { name: '순천', lat: 34.9506, lon: 127.4873 },
  { name: '안동', lat: 36.5684, lon: 128.7295 },
  { name: '경주', lat: 35.8562, lon: 129.2247 },
  { name: '군산', lat: 35.9676, lon: 126.7369 },
  { name: '익산', lat: 35.9483, lon: 126.9577 },
  { name: '서귀포', lat: 33.2541, lon: 126.56 },
];

export const COLOR_MAP: Record<string, { bg: string; shadow: string; ring: string }> = {
  blue: { bg: 'bg-blue-500', shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]', ring: 'ring-blue-500' },
  green: { bg: 'bg-green-500', shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]', ring: 'ring-green-500' },
  yellow: { bg: 'bg-amber-500', shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]', ring: 'ring-amber-500' },
  purple: { bg: 'bg-purple-500', shadow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]', ring: 'ring-purple-500' },
  red: { bg: 'bg-red-500', shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]', ring: 'ring-red-500' },
  pink: { bg: 'bg-pink-500', shadow: 'shadow-[0_0_8px_rgba(236,72,153,0.5)]', ring: 'ring-pink-500' },
  indigo: { bg: 'bg-indigo-500', shadow: 'shadow-[0_0_8px_rgba(99,102,241,0.5)]', ring: 'ring-indigo-500' },
  teal: { bg: 'bg-teal-500', shadow: 'shadow-[0_0_8px_rgba(20,184,166,0.5)]', ring: 'ring-teal-500' },
  gray: { bg: 'bg-slate-400', shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]', ring: 'ring-slate-400' },
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
];

export const AUTO_LOCK_OPTIONS = [
  { value: 0, label: '즉시 (매번)' },
  { value: 1, label: '1분' },
  { value: 3, label: '3분' },
  { value: 5, label: '5분' },
  { value: 10, label: '10분' },
  { value: 30, label: '30분' },
];
