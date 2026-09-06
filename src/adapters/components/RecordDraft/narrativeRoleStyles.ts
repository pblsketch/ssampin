import type { NarrativeRole } from '@domain/rules/narrativeParagraphs';

/**
 * 형광펜 4색 — 동기 sky · 과정 violet · 결과 emerald · 평가 amber (설계서 §7-1). 기존 칩과 같은 `/15` 톤.
 * 고친 문단은 같은 색을 `/5` 로 흐리게. HEX 직접 쓰지 않는다.
 */
export const ROLE_BG: Readonly<Record<NarrativeRole, string>> = {
  motive: 'bg-sky-500/15',
  process: 'bg-violet-500/15',
  result: 'bg-emerald-500/15',
  evaluation: 'bg-amber-500/15',
};

export const ROLE_BG_STALE: Readonly<Record<NarrativeRole, string>> = {
  motive: 'bg-sky-500/5',
  process: 'bg-violet-500/5',
  result: 'bg-emerald-500/5',
  evaluation: 'bg-amber-500/5',
};

/** 범례 점. */
export const ROLE_DOT: Readonly<Record<NarrativeRole, string>> = {
  motive: 'bg-sky-500',
  process: 'bg-violet-500',
  result: 'bg-emerald-500',
  evaluation: 'bg-amber-500',
};
