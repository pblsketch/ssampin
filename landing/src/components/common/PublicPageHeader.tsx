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

/**
 * 공개 페이지 공통 푸터 — submit/check/booking 톤 통일
 *
 * 개인정보처리방침·이용약관 링크는 학생·보호자가 개인정보를 입력하는
 * 모든 공개 화면에 노출되어야 한다(교육부 학습지원 소프트웨어 필수기준 ①·③).
 * 작성 중인 폼이 날아가지 않도록 새 탭으로 연다.
 */
export function PublicPageFooter() {
  return (
    <footer className="border-t border-sp-border/30 py-4 text-center">
      <p className="text-xs text-sp-muted/60">Powered by 쌤핀</p>
      <p className="mt-1.5 flex items-center justify-center gap-1.5 text-[11px] text-sp-muted/70">
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-sp-text"
        >
          개인정보처리방침
        </a>
        <span className="text-sp-muted/40">·</span>
        <a
          href="/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 transition-colors hover:text-sp-text"
        >
          이용약관
        </a>
      </p>
    </footer>
  );
}
