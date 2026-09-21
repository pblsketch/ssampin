/**
 * ShareEntryCodeBar — 교실 모니터 상단 고정 입장 안내 배너.
 *
 * - 높이: 64px 고정 (component-tree §4)
 * - 텍스트: 28px 이상 (4m 거리 가독성)
 * - sp-* 토큰: sp-surface (배경) / sp-text (라벨) / sp-accent (강조)
 *
 * 짧은 코드를 주소와 **분리해** 크게 보여준다. QR을 못 찍는 학생이 긴 주소를 타이핑하지 않게
 * 하려는 것이다(2026-06-12의 "코드 폐기" 결정을 되돌림). 코드 발급이 실패하면 코드 칸 없이
 * 주소만 보여준다 — 진행은 계속된다.
 *
 * lobby phase 외에도 학생이 중간 입장할 수 있을 때 노출되므로
 * 부모(ClassroomShareView)가 phase 기반으로 표시 제어한다.
 */

import { memo } from 'react';

interface ShareEntryCodeBarProps {
  /** 학생 입장 URL */
  readonly entryUrl: string;
  /** 짧은 입장 코드. 없으면(null) 코드 칸을 숨긴다 */
  readonly entryCode?: string | null;
  /** 현재 입장 학생 수 */
  readonly studentCount: number;
}

function ShareEntryCodeBarImpl({
  entryUrl,
  entryCode = null,
  studentCount,
}: ShareEntryCodeBarProps): JSX.Element {
  // URL이 길면 표시용으로 짧게 자름 (도메인+경로 최대 40자)
  const displayUrl = entryUrl.length > 40 ? `${entryUrl.slice(0, 40)}…` : entryUrl;
  const hasCode = entryCode !== null && entryCode.length > 0;

  return (
    <header
      className="flex items-center justify-between bg-sp-surface px-12 text-sp-text"
      style={{ height: 64 }}
      role="banner"
      aria-label="입장 안내 배너"
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
        {hasCode && (
          <>
            <span className="font-sp-medium text-sp-muted" style={{ fontSize: 24 }}>
              코드
            </span>
            <span
              className="rounded-full border border-sp-accent px-5 py-1 font-sp-bold tracking-widest text-sp-accent"
              style={{ fontSize: 36 }}
              aria-label={`입장 코드 ${entryCode}`}
            >
              {entryCode}
            </span>
          </>
        )}
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
