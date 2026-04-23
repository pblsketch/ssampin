import type { RealtimeWallLayoutMode } from '@domain/entities/RealtimeWall';

export const REALTIME_WALL_LAYOUT_LABELS: Record<RealtimeWallLayoutMode, string> = {
  kanban: '칸반형',
  freeform: '자유 배치형',
  grid: '격자형',
  stream: '스트림',
};

export function openExternalLink(url: string): void {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
