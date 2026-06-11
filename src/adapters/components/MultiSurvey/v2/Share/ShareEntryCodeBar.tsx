/**
 * ShareEntryCodeBar — 교실 모니터 상단 고정 입장코드 배너.
 *
 * - 높이: 64px 고정 (component-tree §4)
 * - 텍스트: 36px Bold (4m 거리 가독성)
 * - sp-* 토큰: sp-surface (배경) / sp-text (라벨) / sp-accent (코드 강조)
 *
 * lobby phase 외에도 학생이 중간 입장할 수 있을 때 노출되므로
 * 부모(ClassroomShareView)가 phase 기반으로 표시 제어한다.
 */

import { memo } from 'react';

interface ShareEntryCodeBarProps {
  /** 6자리 입장 코드 (예: "AB12CD") */
  readonly entryCode: string;
  /** 현재 입장 학생 수 */
  readonly studentCount: number;
}

function ShareEntryCodeBarImpl({ entryCode, studentCount }: ShareEntryCodeBarProps): JSX.Element {
  return (
    <header
      className="flex items-center justify-between bg-sp-surface px-12 text-sp-text"
      style={{ height: 64 }}
      role="banner"
      aria-label="입장 코드 배너"
    >
      <div className="flex items-baseline gap-6">
        <span className="font-sp-medium" style={{ fontSize: 28 }}>
          입장 코드
        </span>
        <span
          className="font-sp-bold tracking-[0.3em] text-sp-accent"
          style={{ fontSize: 36 }}
          aria-label={`입장 코드 ${entryCode.split('').join(' ')}`}
        >
          {entryCode}
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
