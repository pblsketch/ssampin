/**
 * 과목별 색상 프리셋 시스템
 *
 * 모든 시간표 UI(시간표 페이지, 대시보드, 위젯, 엑셀 내보내기)에서
 * 공통으로 사용하는 과목 색상 정의.
 */

/** Tailwind 색상 패밀리 이름 */
export type SubjectColorId =
  | 'yellow' | 'green' | 'blue' | 'purple' | 'orange' | 'red'
  | 'pink' | 'indigo' | 'teal' | 'emerald' | 'cyan' | 'violet'
  | 'amber' | 'lime' | 'rose' | 'slate';

/** 과목-색상 매핑 (subject → SubjectColorId) */
export type SubjectColorMap = Readonly<Record<string, SubjectColorId>>;

/** 하나의 색상 프리셋 */
export interface SubjectColorPreset {
  readonly id: SubjectColorId;
  readonly label: string;
  readonly tw: {
    readonly bg: string;        // 'bg-yellow-500/20'
    readonly border: string;    // 'border-yellow-500/30'
    readonly text: string;      // 'text-yellow-300' (라이트 모드는 CSS 오버라이드로 700)
    readonly textLight: string; // 'text-yellow-200' (위젯용)
    readonly bgSolid: string;   // 'bg-yellow-400' (도트용)
  };
  readonly argb: string;        // Excel ARGB hex (FFFDE68A)
}

/** 16개 색상 프리셋 팔레트 */
export const COLOR_PRESETS: readonly SubjectColorPreset[] = [
  {
    id: 'yellow', label: '노란색',
    tw: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', text: 'text-yellow-300', textLight: 'text-yellow-200', bgSolid: 'bg-yellow-400' },
    argb: 'FFFDE68A',
  },
  {
    id: 'green', label: '초록색',
    tw: { bg: 'bg-green-500/20', border: 'border-green-500/30', text: 'text-green-300', textLight: 'text-green-200', bgSolid: 'bg-green-400' },
    argb: 'FFA7F3D0',
  },
  {
    id: 'blue', label: '파란색',
    tw: { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-300', textLight: 'text-blue-200', bgSolid: 'bg-blue-400' },
    argb: 'FF93C5FD',
  },
  {
    id: 'purple', label: '보라색',
    tw: { bg: 'bg-purple-500/20', border: 'border-purple-500/30', text: 'text-purple-300', textLight: 'text-purple-200', bgSolid: 'bg-purple-400' },
    argb: 'FFC4B5FD',
  },
  {
    id: 'orange', label: '주황색',
    tw: { bg: 'bg-orange-500/20', border: 'border-orange-500/30', text: 'text-orange-300', textLight: 'text-orange-200', bgSolid: 'bg-orange-400' },
    argb: 'FFFED7AA',
  },
  {
    id: 'red', label: '빨간색',
    tw: { bg: 'bg-red-500/20', border: 'border-red-500/30', text: 'text-red-300', textLight: 'text-red-200', bgSolid: 'bg-red-400' },
    argb: 'FFFCA5A5',
  },
  {
    id: 'pink', label: '분홍색',
    tw: { bg: 'bg-pink-500/20', border: 'border-pink-500/30', text: 'text-pink-300', textLight: 'text-pink-200', bgSolid: 'bg-pink-400' },
    argb: 'FFF9A8D4',
  },
  {
    id: 'indigo', label: '인디고',
    tw: { bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', text: 'text-indigo-300', textLight: 'text-indigo-200', bgSolid: 'bg-indigo-400' },
    argb: 'FFA5B4FC',
  },
  {
    id: 'teal', label: '청록색',
    tw: { bg: 'bg-teal-500/20', border: 'border-teal-500/30', text: 'text-teal-300', textLight: 'text-teal-200', bgSolid: 'bg-teal-400' },
    argb: 'FF99F6E4',
  },
  {
    id: 'emerald', label: '에메랄드',
    tw: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-300', textLight: 'text-emerald-200', bgSolid: 'bg-emerald-400' },
    argb: 'FF6EE7B7',
  },
  {
    id: 'cyan', label: '하늘색',
    tw: { bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', text: 'text-cyan-300', textLight: 'text-cyan-200', bgSolid: 'bg-cyan-400' },
    argb: 'FF67E8F9',
  },
  {
    id: 'violet', label: '바이올렛',
    tw: { bg: 'bg-violet-500/20', border: 'border-violet-500/30', text: 'text-violet-300', textLight: 'text-violet-200', bgSolid: 'bg-violet-400' },
    argb: 'FFC4B5FD',
  },
  {
    id: 'amber', label: '앰버',
    tw: { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-300', textLight: 'text-amber-200', bgSolid: 'bg-amber-400' },
    argb: 'FFFBBF24',
  },
  {
    id: 'lime', label: '라임',
    tw: { bg: 'bg-lime-500/20', border: 'border-lime-500/30', text: 'text-lime-300', textLight: 'text-lime-200', bgSolid: 'bg-lime-400' },
    argb: 'FFA3E635',
  },
  {
    id: 'rose', label: '로즈',
    tw: { bg: 'bg-rose-500/20', border: 'border-rose-500/30', text: 'text-rose-300', textLight: 'text-rose-200', bgSolid: 'bg-rose-400' },
    argb: 'FFFDA4AF',
  },
  {
    id: 'slate', label: '회색',
    tw: { bg: 'bg-slate-500/20', border: 'border-slate-500/30', text: 'text-slate-300', textLight: 'text-slate-200', bgSolid: 'bg-slate-400' },
    argb: 'FF94A3B8',
  },
];

/** 프리셋 빠른 조회용 Map */
const PRESET_MAP = new Map(COLOR_PRESETS.map(p => [p.id, p]));

/** 기본 폴백 프리셋 (매핑 없는 과목용) */
const FALLBACK_PRESET = PRESET_MAP.get('cyan')!;

/**
 * 기본 과목-색상 매핑 (CLAUDE.md 기준)
 *
 * 국어=yellow, 영어=green, 수학=blue, 과학=purple,
 * 사회=orange, 체육=red, 음악=pink, 미술=indigo, 창체=teal
 */
export const DEFAULT_SUBJECT_COLORS: SubjectColorMap = {
  '국어': 'yellow',
  '영어': 'green',
  '수학': 'blue',
  '과학': 'purple',
  '사회': 'orange',
  '체육': 'red',
  '음악': 'pink',
  '미술': 'indigo',
  '창체': 'teal',
};

/** 프리셋 ID로 프리셋 객체 조회 (없으면 cyan 폴백) */
export function getColorPreset(id: SubjectColorId): SubjectColorPreset {
  return PRESET_MAP.get(id) ?? FALLBACK_PRESET;
}

/**
 * 과목명으로 프리셋을 해석한다.
 * userColors → DEFAULT_SUBJECT_COLORS → cyan 순서로 폴백.
 */
function resolvePreset(
  subject: string,
  userColors?: SubjectColorMap,
): SubjectColorPreset {
  const colorId = userColors?.[subject]
    ?? DEFAULT_SUBJECT_COLORS[subject]
    ?? ('cyan' as SubjectColorId);
  return getColorPreset(colorId);
}

/** Excel ARGB 헥스 반환 (infrastructure에서 직접 사용) */
export function getSubjectArgb(
  subject: string,
  userColors?: SubjectColorMap,
): string | undefined {
  const colorId = userColors?.[subject] ?? DEFAULT_SUBJECT_COLORS[subject];
  if (!colorId) return undefined;
  return getColorPreset(colorId).argb;
}

/** 과목의 프리셋 전체 반환 (내부 헬퍼) */
export { resolvePreset };
