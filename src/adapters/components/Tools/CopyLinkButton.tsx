/**
 * CopyLinkButton — 라이브 도구의 학생 참여 주소를 복사하는 버튼.
 *
 * 예전에는 도구마다 글자 없는 아이콘 버튼(title="주소 복사")만 있어서,
 * 선생님이 "링크 공유 버튼"을 찾아도 눈에 띄지 않는다는 신고가 있었다.
 * 아이콘 옆에 항상 글자를 함께 보여주고, 누른 뒤에는 복사됐다는 사실을 알려준다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface CopyLinkButtonProps {
  /** 클립보드에 넣을 주소 */
  url: string;
  /** 버튼에 보일 글자. 기본 "링크 복사" */
  label?: string;
  /** 여러 주소가 나란히 있을 때 구분용 접근성 라벨 */
  ariaLabel?: string;
}

export function CopyLinkButton({ url, label = '링크 복사', ariaLabel }: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* 클립보드가 막힌 환경 — 주소는 화면에 그대로 보이므로 직접 복사하면 된다 */
      },
    );
  }, [url]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel ?? label}
      className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-colors text-xs font-medium"
    >
      <span className="material-symbols-outlined text-icon-sm" aria-hidden="true">
        {copied ? 'check' : 'content_copy'}
      </span>
      {copied ? '복사됨!' : label}
    </button>
  );
}
