import type { SchoolLevel } from '@domain/entities/Settings';

export const KOREAN_CITIES: { name: string; region: string; lat: number; lon: number }[] = [
  // ─── 특별시·광역시·특별자치시 ───
  { name: '서울', region: '특별시·광역시', lat: 37.5665, lon: 126.978 },
  { name: '부산', region: '특별시·광역시', lat: 35.1796, lon: 129.0756 },
  { name: '대구', region: '특별시·광역시', lat: 35.8714, lon: 128.6014 },
  { name: '인천', region: '특별시·광역시', lat: 37.4563, lon: 126.7052 },
  { name: '광주', region: '특별시·광역시', lat: 35.1595, lon: 126.8526 },
  { name: '대전', region: '특별시·광역시', lat: 36.3504, lon: 127.3845 },
  { name: '울산', region: '특별시·광역시', lat: 35.5384, lon: 129.3114 },
  { name: '세종', region: '특별시·광역시', lat: 36.48, lon: 127.2553 },

  // ─── 경기도 ───
  { name: '수원', region: '경기도', lat: 37.2636, lon: 127.0286 },
  { name: '성남', region: '경기도', lat: 37.4201, lon: 127.1265 },
  { name: '고양', region: '경기도', lat: 37.6584, lon: 126.832 },
  { name: '용인', region: '경기도', lat: 37.2411, lon: 127.1776 },
  { name: '안산', region: '경기도', lat: 37.3219, lon: 126.8309 },
  { name: '안양', region: '경기도', lat: 37.3943, lon: 126.9568 },
  { name: '남양주', region: '경기도', lat: 37.636, lon: 127.2165 },
  { name: '화성', region: '경기도', lat: 37.1996, lon: 126.8312 },
  { name: '평택', region: '경기도', lat: 36.9922, lon: 127.1126 },
  { name: '의정부', region: '경기도', lat: 37.7381, lon: 127.0337 },
  { name: '시흥', region: '경기도', lat: 37.38, lon: 126.8029 },
  { name: '파주', region: '경기도', lat: 37.7599, lon: 126.7797 },
  { name: '김포', region: '경기도', lat: 37.6153, lon: 126.7156 },
  { name: '광명', region: '경기도', lat: 37.4786, lon: 126.8646 },
  { name: '군포', region: '경기도', lat: 37.3614, lon: 126.935 },
  { name: '이천', region: '경기도', lat: 37.2722, lon: 127.435 },
  { name: '양주', region: '경기도', lat: 37.785, lon: 127.0456 },
  { name: '오산', region: '경기도', lat: 37.1498, lon: 127.0775 },
  { name: '안성', region: '경기도', lat: 37.008, lon: 127.2797 },
  { name: '포천', region: '경기도', lat: 37.8948, lon: 127.2004 },
  { name: '여주', region: '경기도', lat: 37.2984, lon: 127.6372 },
  { name: '양평', region: '경기도', lat: 37.4917, lon: 127.4876 },
  { name: '동두천', region: '경기도', lat: 37.9035, lon: 127.0607 },
  { name: '가평', region: '경기도', lat: 37.8315, lon: 127.5106 },
  { name: '연천', region: '경기도', lat: 38.0964, lon: 127.0748 },

  // ─── 강원도 ───
  { name: '춘천', region: '강원도', lat: 37.8813, lon: 127.7298 },
  { name: '원주', region: '강원도', lat: 37.342, lon: 127.9201 },
  { name: '강릉', region: '강원도', lat: 37.7519, lon: 128.8761 },
  { name: '속초', region: '강원도', lat: 38.207, lon: 128.5918 },
  { name: '동해', region: '강원도', lat: 37.5247, lon: 129.1143 },
  { name: '태백', region: '강원도', lat: 37.1641, lon: 128.9856 },
  { name: '삼척', region: '강원도', lat: 37.4499, lon: 129.1647 },
  { name: '홍천', region: '강원도', lat: 37.6972, lon: 127.8884 },
  { name: '횡성', region: '강원도', lat: 37.4913, lon: 127.9847 },
  { name: '영월', region: '강원도', lat: 37.1838, lon: 128.4619 },
  { name: '정선', region: '강원도', lat: 37.3811, lon: 128.6608 },
  { name: '철원', region: '강원도', lat: 38.1465, lon: 127.3133 },

  // ─── 충청북도 ───
  { name: '청주', region: '충청북도', lat: 36.6424, lon: 127.489 },
  { name: '충주', region: '충청북도', lat: 36.991, lon: 127.926 },
  { name: '제천', region: '충청북도', lat: 37.1327, lon: 128.191 },
  { name: '보은', region: '충청북도', lat: 36.4893, lon: 127.7295 },
  { name: '옥천', region: '충청북도', lat: 36.3061, lon: 127.5712 },
  { name: '영동', region: '충청북도', lat: 36.175, lon: 127.7761 },
  { name: '단양', region: '충청북도', lat: 36.9845, lon: 128.3655 },

  // ─── 충청남도 ───
  { name: '천안', region: '충청남도', lat: 36.8151, lon: 127.1139 },
  { name: '아산', region: '충청남도', lat: 36.7898, lon: 127.0018 },
  { name: '서산', region: '충청남도', lat: 36.7845, lon: 126.4503 },
  { name: '논산', region: '충청남도', lat: 36.1872, lon: 127.0987 },
  { name: '당진', region: '충청남도', lat: 36.8898, lon: 126.6297 },
  { name: '공주', region: '충청남도', lat: 36.4465, lon: 127.119 },
  { name: '보령', region: '충청남도', lat: 36.3334, lon: 126.6128 },
  { name: '홍성', region: '충청남도', lat: 36.6012, lon: 126.6608 },
  { name: '예산', region: '충청남도', lat: 36.6828, lon: 126.8448 },
  { name: '태안', region: '충청남도', lat: 36.7458, lon: 126.298 },

  // ─── 전라북도 ───
  { name: '전주', region: '전라북도', lat: 35.8242, lon: 127.148 },
  { name: '군산', region: '전라북도', lat: 35.9676, lon: 126.7369 },
  { name: '익산', region: '전라북도', lat: 35.9483, lon: 126.9577 },
  { name: '정읍', region: '전라북도', lat: 35.5699, lon: 126.856 },
  { name: '남원', region: '전라북도', lat: 35.4164, lon: 127.3904 },
  { name: '김제', region: '전라북도', lat: 35.8037, lon: 126.8808 },

  // ─── 전라남도 ───
  { name: '목포', region: '전라남도', lat: 34.8118, lon: 126.3922 },
  { name: '여수', region: '전라남도', lat: 34.7604, lon: 127.6622 },
  { name: '순천', region: '전라남도', lat: 34.9506, lon: 127.4873 },
  { name: '나주', region: '전라남도', lat: 35.0156, lon: 126.7108 },
  { name: '광양', region: '전라남도', lat: 34.9407, lon: 127.6959 },
  { name: '담양', region: '전라남도', lat: 35.3214, lon: 126.9882 },
  { name: '해남', region: '전라남도', lat: 34.5735, lon: 126.5991 },
  { name: '완도', region: '전라남도', lat: 34.3109, lon: 126.7551 },

  // ─── 경상북도 ───
  { name: '포항', region: '경상북도', lat: 36.019, lon: 129.3435 },
  { name: '경주', region: '경상북도', lat: 35.8562, lon: 129.2247 },
  { name: '안동', region: '경상북도', lat: 36.5684, lon: 128.7295 },
  { name: '구미', region: '경상북도', lat: 36.1196, lon: 128.3444 },
  { name: '김천', region: '경상북도', lat: 36.1398, lon: 128.1136 },
  { name: '영주', region: '경상북도', lat: 36.8057, lon: 128.624 },
  { name: '영천', region: '경상북도', lat: 35.9733, lon: 128.9385 },
  { name: '상주', region: '경상북도', lat: 36.4109, lon: 128.159 },
  { name: '문경', region: '경상북도', lat: 36.5868, lon: 128.1868 },
  { name: '경산', region: '경상북도', lat: 35.825, lon: 128.7415 },
  { name: '의성', region: '경상북도', lat: 36.3528, lon: 128.6972 },
  { name: '영덕', region: '경상북도', lat: 36.415, lon: 129.3659 },
  { name: '울진', region: '경상북도', lat: 36.993, lon: 129.4002 },

  // ─── 경상남도 ───
  { name: '창원', region: '경상남도', lat: 35.2281, lon: 128.6811 },
  { name: '김해', region: '경상남도', lat: 35.2285, lon: 128.8894 },
  { name: '진주', region: '경상남도', lat: 35.1799, lon: 128.1076 },
  { name: '양산', region: '경상남도', lat: 35.335, lon: 129.0374 },
  { name: '거제', region: '경상남도', lat: 34.8806, lon: 128.6211 },
  { name: '통영', region: '경상남도', lat: 34.8544, lon: 128.4332 },
  { name: '사천', region: '경상남도', lat: 35.0037, lon: 128.0642 },
  { name: '밀양', region: '경상남도', lat: 35.5037, lon: 128.7464 },
  { name: '거창', region: '경상남도', lat: 35.6868, lon: 127.9095 },
  { name: '함안', region: '경상남도', lat: 35.2726, lon: 128.4064 },
  { name: '합천', region: '경상남도', lat: 35.5667, lon: 128.1659 },

  // ─── 제주특별자치도 ───
  { name: '제주', region: '제주도', lat: 33.4996, lon: 126.5312 },
  { name: '서귀포', region: '제주도', lat: 33.2541, lon: 126.56 },
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
