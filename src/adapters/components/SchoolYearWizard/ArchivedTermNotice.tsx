/**
 * ArchivedTermNotice — 전환 직후 정보형 빈 상태 안내 (S2.5).
 *
 * 학년도 전환으로 화면이 비었을 때 "데이터가 없습니다"만 단독으로 보여주지 않고,
 * 지난 학년도 기록이 보관함에 안전하게 있음을 알리고 학년도 마무리 설정으로 안내한다.
 *
 * 노출 조건(둘 다 충족해야 표시 — 전환을 해본 적 없는 사용자에게는 아무것도 안 보인다):
 *  1. settings.currentTerm 존재(= 학년도 전환을 완료한 적 있음)
 *  2. 보관함(archive:list)에 학기가 1개 이상 존재
 */

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { formatSchoolYearKo, schoolYearOf } from '@domain/rules/academicCalendar';

/** 노출 판정(순수) — 테스트 대상. */
export function shouldShowArchivedTermNotice(
  currentTerm: string | undefined,
  archiveTerms: readonly string[],
): boolean {
  return Boolean(currentTerm) && archiveTerms.length > 0;
}

/**
 * 보관 학기 목록 모듈 캐시 — 빈 상태 3화면이 마운트마다 IPC를 반복하지 않게 한다.
 * archive:list는 최신 학기 먼저 반환한다(전역 계약 — global.d.ts ArchiveElectronAPI).
 */
let cachedTerms: readonly string[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

async function fetchArchiveTerms(): Promise<readonly string[]> {
  const now = Date.now();
  if (cachedTerms !== null && now - cachedAt < CACHE_TTL_MS) return cachedTerms;
  const api = typeof window !== 'undefined' ? window.electronAPI?.archive : undefined;
  if (!api) {
    cachedTerms = [];
    cachedAt = now;
    return cachedTerms;
  }
  try {
    const res = await api.list();
    cachedTerms = res.ok ? res.archives.map((a) => a.term) : [];
  } catch {
    cachedTerms = [];
  }
  cachedAt = now;
  return cachedTerms;
}

/** 전환 완료·되돌리기 직후 목록이 바뀌었을 때 강제 갱신(테스트에서도 사용). */
export function invalidateArchivedTermNoticeCache(): void {
  cachedTerms = null;
  cachedAt = 0;
}

interface Props {
  readonly className?: string;
}

export function ArchivedTermNotice({ className = '' }: Props) {
  const currentTerm = useSettingsStore((s) => s.settings.currentTerm);
  const [terms, setTerms] = useState<readonly string[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchArchiveTerms().then((t) => {
      if (alive) setTerms(t);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!shouldShowArchivedTermNotice(currentTerm, terms)) return null;

  const latestYear = terms[0] !== undefined ? schoolYearOf(terms[0]) : null;
  const subjectLabel =
    latestYear !== null ? `${formatSchoolYearKo(latestYear)} 기록은` : '지난 학년도 기록은';

  return (
    <div
      className={`mx-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-sp-border bg-sp-surface px-4 py-3 text-left ${className}`}
    >
      <span aria-hidden className="material-symbols-outlined text-sp-accent">
        inventory_2
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-sp-text">{subjectLabel} 보관함에 안전하게 있어요</p>
        <p className="mt-0.5 text-xs text-sp-muted">
          지워진 것이 아니라 학년도 마무리로 보관된 것이에요.
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new CustomEvent('ssampin:navigate', { detail: 'settings#archive' }))
        }
        className="shrink-0 rounded-lg bg-sp-accent px-3 py-1.5 text-xs font-medium text-sp-accent-fg transition-all hover:brightness-110 active:scale-95"
      >
        학년도 마무리 설정 열기
      </button>
    </div>
  );
}
