// ── 표시용 포맷 유틸 (단일 소스) ──
// page.tsx 와 EventLog.tsx 에 각각 복사돼 있던 formatDuration 을 통합한다.

/** 초 단위를 "M분 S초" / "S초" 형태로 변환. 음수·비정상 값은 "-". */
export function formatDuration(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}
