/**
 * 온라인 교무실 게시판 — 시각 표시 도우미 (M2)
 *
 * 목록·상세·댓글은 상대 시간("방금 전"~"6일 전", 그 이후는 날짜)을 쓰고,
 * 자동 저장 배지는 "HH:mm" 짧은 시각을 쓴다. BoardView·PostDetail·PostEditor
 * 세 곳에서 같이 쓰여 여기 하나로 모은다.
 */

/** 글·댓글 시각 — 상대 시간, 일주일이 넘으면 날짜 */
export function formatPostTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** 자동 저장 배지용 — "HH:mm" */
export function formatClockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
