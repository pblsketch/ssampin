import { useState, type ReactNode } from 'react';
import { formatPhoneNumber, type ContactEntry } from '@domain/rules/contactRules';
import { useToastStore } from '@adapters/components/common/Toast';

const KIND_ICON: Record<ContactEntry['kind'], string> = {
  staff: 'badge',
  student: 'person',
  guardian: 'escalator_warning',
};

const KIND_ACCENT: Record<ContactEntry['kind'], string> = {
  staff: 'text-sp-accent bg-sp-accent/10',
  student: 'text-emerald-400 bg-emerald-500/10',
  guardian: 'text-amber-400 bg-amber-500/10',
};

interface ContactRowProps {
  entry: ContactEntry;
  /** 행 오른쪽에 붙일 추가 버튼 (교직원 탭의 편집·삭제 등) */
  actions?: ReactNode;
}

/**
 * 연락처 한 줄.
 *
 * 데스크톱에는 전화 걸 방법이 없으므로 **번호 복사**가 주된 동작이다.
 * (모바일 쌤핀에서는 눌러서 바로 전화가 걸린다.)
 */
export function ContactRow({ entry, actions }: ContactRowProps) {
  const [justCopied, setJustCopied] = useState(false);
  const show = useToastStore((s) => s.show);

  const copy = async (value: string, label: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setJustCopied(true);
      window.setTimeout(() => setJustCopied(false), 1500);
    } catch {
      // 클립보드를 막아 둔 환경 — 조용히 실패하지 않고 이유를 알린다.
      show(`${label}를 복사하지 못했습니다`, 'error');
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-sp-surface/60 border border-sp-border/50 hover:border-sp-border transition-colors">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${KIND_ACCENT[entry.kind]}`}
      >
        <span className="material-symbols-outlined text-lg">{KIND_ICON[entry.kind]}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {entry.favorite && (
            <span className="material-symbols-outlined text-amber-400 text-sm">star</span>
          )}
          <p className="text-sp-text font-sp-medium truncate">{entry.name}</p>
        </div>
        {entry.subtitle !== '' && (
          <p className="text-sp-muted text-xs truncate">{entry.subtitle}</p>
        )}
      </div>

      {entry.phone !== undefined && (
        <button
          type="button"
          onClick={() => void copy(entry.phone ?? '', '전화번호')}
          title="전화번호 복사"
          className="text-sp-text text-sm font-mono px-2 py-1 rounded-lg hover:bg-sp-accent/10 transition-colors shrink-0"
        >
          {formatPhoneNumber(entry.phone)}
        </button>
      )}

      {entry.email !== undefined && (
        <button
          type="button"
          onClick={() => void copy(entry.email ?? '', '이메일')}
          title="이메일 복사"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sp-muted hover:text-sp-accent hover:bg-sp-accent/10 transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-lg">mail</span>
        </button>
      )}

      {justCopied && <span className="text-xs text-emerald-400 shrink-0">복사됨</span>}

      {actions}
    </div>
  );
}
