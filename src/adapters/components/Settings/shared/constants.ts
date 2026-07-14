import type { SchoolLevel } from '@domain/entities/Settings';

// 전국 시·군 좌표표는 도메인(koreanGeo)이 단일 출처다 — 날씨 지역 선택(WeatherTab)과
// 온보딩 주소→좌표 자동설정(geocodeAddress)이 같은 데이터를 공유한다(school-enrich ②-A).
export { KOREAN_CITIES } from '@domain/services/koreanGeo';
export type { KoreanRegionGeo } from '@domain/services/koreanGeo';

// 카테고리 색상 표·점 헬퍼는 공용 CategoryColorPicker(CATEGORY_COLOR_INFO)로 이동했다.
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
