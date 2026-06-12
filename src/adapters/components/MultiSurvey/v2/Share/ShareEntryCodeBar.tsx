/**
 * ShareEntryCodeBar — 교실 모니터 상단 고정 입장 URL 배너.
 *
 * - 높이: 64px 고정 (component-tree §4)
 * - 텍스트: 36px Bold (4m 거리 가독성)
 * - sp-* 토큰: sp-surface (배경) / sp-text (라벨) / sp-accent (URL 강조)
 *
 * entryCode 는 폐기 (2026-06-12) — QR+URL 전용.
 * lobby phase 외에도 학생이 중간 입장할 수 있을 때 노출되므로
 * 부모(ClassroomShareView)가 phase 기반으로 표시 제어한다.
 */

import { memo } from 'react';

interface ShareEntryCodeBarProps {
  /** 학생 입장 URL */
  readonly entryUrl: string;
  /** 현재 입장 학생 수 */
  readonly studentCount: number;
}

function ShareEntryCodeBarImpl({ entryUrl, studentCount }: ShareEntryCodeBarProps): JSX.Element {
  // URL이 길면 표시용으로 짧게 자름 (도메인+경로 최대 40자)
  const displayUrl = entryUrl.length > 40 ? `${entryUrl.slice(0, 40)}…` : entryUrl;

  return (
    <header
      className="flex items-center justify-between bg-sp-surface px-12 text-sp-text"
      style={{ height: 64 }}
      role="banner"
      aria-label="입장 URL 배너"
    >
      <div className="flex items-baseline gap-6">
        <span className="font-sp-medium" style={{ fontSize: 28 }}>
          참여 주소
        </span>
        <span
          className="font-sp-bold text-sp-accent"
          style={{ fontSize: 28 }}
          aria-label={`입장 주소 ${entryUrl}`}
        >
          {displayUrl}
        </span>
      </div>
      <div
        className="flex items-baseline gap-3 font-sp-semibold"
        style={{ fontSize: 28 }}
        aria-live="polite"
      >
        <span className="text-sp-accent" style={{ fontSize: 36 }}>
          {studentCount}
        </span>
        <span>명 참여 중</span>
      </div>
    </header>
  );
}

export const ShareEntryCodeBar = memo(ShareEntryCodeBarImpl);
