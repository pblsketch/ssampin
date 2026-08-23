import { useState } from 'react';
import { CoolImportModal } from './CoolImportModal';
import { useCoolImport } from './useCoolImport';

/**
 * "쿨메신저에서 가져오기" 버튼 + 모달.
 *
 * 일정 화면과 할일 화면 양쪽에 그대로 얹을 수 있게 하나로 묶었다.
 * 실제 배선(읽기·등록·기록)은 `useCoolImport` 가 갖고 있다.
 *
 * ## 설정에서 켜지 않으면 아무것도 안 보인다
 * 쿨메신저를 안 쓰는 시도교육청이 많다. 기본은 꺼짐이고, 설정 > 일정에서 켜야 나온다.
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */

/** 화면마다 도구모음 버튼 모양이 달라서, 통째로 갈아끼울 수 있게 둔다 */
const VARIANT_CLASS = {
  /** 기본 — 단독으로 놓을 때 */
  button:
    'inline-flex items-center gap-1.5 rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text hover:bg-sp-surface transition-colors duration-sp-base ease-sp-out',
  /** 좁은 자리 */
  compact:
    'inline-flex items-center gap-1.5 rounded-lg border border-sp-border px-2 py-1 text-xs text-sp-text hover:bg-sp-surface transition-colors duration-sp-base ease-sp-out',
  /** 일정 화면 도구모음 — 옆 버튼들(가져오기·내보내기)과 같은 모양 */
  toolbar:
    'flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-semibold transition-all',
} as const;

interface Props {
  /** 버튼 모양 — 놓을 화면에 맞춰 고른다 */
  readonly variant?: keyof typeof VARIANT_CLASS;
  /** 도구모음처럼 좁을 때 글자를 숨긴다 (아이콘만) */
  readonly hideLabelOnNarrow?: boolean;
  readonly className?: string;
}

export function CoolImportButton({
  variant = 'button',
  hideLabelOnNarrow = false,
  className = '',
}: Props) {
  const cool = useCoolImport();
  const [open, setOpen] = useState(false);

  if (!cool.enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          cool.ensureHistory();
          setOpen(true);
        }}
        title="쿨메신저에서 가져오기"
        className={`${VARIANT_CLASS[variant]} ${className}`}
      >
        <span className="material-symbols-outlined text-icon-md" aria-hidden="true">
          forward_to_inbox
        </span>
        <span className={hideLabelOnNarrow ? 'hidden lg:inline' : undefined}>쿨메신저</span>
      </button>

      {open && (
        <CoolImportModal
          isOpen={open}
          onClose={() => setOpen(false)}
          loadMessages={cool.loadMessages}
          loadMessage={cool.loadMessage}
          roster={cool.roster}
          onSubmit={cool.onSubmit}
          isImported={cool.isImported}
          hasImportedFrom={cool.hasImportedFrom}
        />
      )}
    </>
  );
}
