export interface FolderZone {
  readonly id: string;
  readonly name: string;
  readonly color: FolderZoneColor;
}

export type FolderZoneColor =
  | 'red' | 'yellow' | 'blue' | 'green'
  | 'purple' | 'orange' | 'teal' | 'gray';

export const ZONE_COLORS: Record<FolderZoneColor, { bg: string; border: string; label: string }> = {
  red:    { bg: 'rgba(239, 68, 68, 0.07)',  border: 'rgba(239, 68, 68, 0.2)',  label: '#f87171' },
  yellow: { bg: 'rgba(245, 158, 11, 0.07)', border: 'rgba(245, 158, 11, 0.2)', label: '#fbbf24' },
  blue:   { bg: 'rgba(59, 130, 246, 0.07)', border: 'rgba(59, 130, 246, 0.2)', label: '#60a5fa' },
  green:  { bg: 'rgba(16, 185, 129, 0.07)', border: 'rgba(16, 185, 129, 0.2)', label: '#34d399' },
  purple: { bg: 'rgba(139, 92, 246, 0.07)', border: 'rgba(139, 92, 246, 0.2)', label: '#a78bfa' },
  orange: { bg: 'rgba(249, 115, 22, 0.07)', border: 'rgba(249, 115, 22, 0.2)', label: '#fb923c' },
  teal:   { bg: 'rgba(20, 184, 166, 0.07)', border: 'rgba(20, 184, 166, 0.2)', label: '#2dd4bf' },
  gray:   { bg: 'rgba(148, 163, 184, 0.05)', border: 'rgba(148, 163, 184, 0.15)', label: '#94a3b8' },
};

export const DEFAULT_FOLDER_ZONES: readonly FolderZone[] = [
  { id: 'fz-1', name: '긴급', color: 'red' },
  { id: 'fz-2', name: '진행 중', color: 'yellow' },
  { id: 'fz-3', name: '나중에', color: 'blue' },
];
