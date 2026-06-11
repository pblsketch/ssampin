/**
 * 학생/보호자 공개 페이지(submit·check) 공통 헤더.
 *
 * - 이모지 대신 앱 아이콘(/icon.png)으로 "공식 서비스" 신뢰 신호 제공
 * - 개인정보 한 줄 안내: 실명·과제 파일을 올리는 화면의 신뢰 공백 해소
 *   (2026-06-12 디자인 감사 F7 — 보호자 관점 신뢰 요소)
 */

interface PublicPageHeaderProps {
  /** 헤더 타이틀 (예: "쌤핀 과제수합") */
  readonly title: string;
  /** 개인정보 한 줄 안내 노출 여부 (기본 true) */
  readonly showPrivacyNote?: boolean;
}

export function PublicPageHeader({ title, showPrivacyNote = true }: PublicPageHeaderProps) {
  return (
    <header className="border-b border-sp-border/50 bg-sp-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="mx-auto max-w-lg px-4 py-3 text-center">
        <h1 className="text-lg font-bold text-sp-text inline-flex items-center justify-center gap-2">
          {/* 정적 아이콘 1개 — next/image 불필요 */}
          <img src="/icon.png" alt="" aria-hidden="true" className="h-5 w-5 rounded" />
          {title}
        </h1>
        {showPrivacyNote && (
          <p className="text-[11px] text-sp-muted mt-0.5">입력한 내용은 선생님에게만 전달됩니다</p>
        )}
      </div>
    </header>
  );
}

/** 공개 페이지 공통 푸터 — submit/check 톤 통일 */
export function PublicPageFooter() {
  return (
    <footer className="border-t border-sp-border/30 py-4 text-center">
      <p className="text-xs text-sp-muted/60">Powered by 쌤핀</p>
    </footer>
  );
}
