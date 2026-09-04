/**
 * 성취기준 자료 불러오기 — **필요할 때 한 번만**.
 *
 * 자료가 중·고 1.5MB 라 앱을 켤 때마다 들고 있을 이유가 없다. 그래서 `import()` 로 **따로 떼어**
 * 두고, 성취기준 고르기를 실제로 여는 순간에만 읽어 들인다. 한 번 읽으면 앱이 꺼질 때까지 재사용한다.
 *
 * 오프라인에서도 된다 — 떼어 낸 조각도 설치 파일 안에 함께 들어가기 때문이다. 네트워크를 쓰지 않는다.
 * (같은 방식이 이미 엑셀 내보내기에서 돌고 있다: `XlsxExporter.ts` 의 `await import('exceljs')`.)
 *
 * 학생 화면과 모바일에는 이 파일이 닿지 않는다 — 성취기준 고르기를 쓰는 화면이 교사 앱에만 있다.
 */
import { useEffect, useState } from 'react';
import type {
  CurriculumStandard,
  CurriculumStandardsBundle,
  StandardSchoolLevel,
} from '@domain/data/curriculumStandards.types';
import { indexByCode } from '@domain/rules/curriculumStandardRules';

/** 자료 파일은 초등/중·고 둘로 나뉜다. 학교급이 정해지면 둘 중 하나만 읽는다. */
export type CurriculumScope = 'elementary' | 'secondary';

export function scopeOf(schoolLevel: StandardSchoolLevel): CurriculumScope {
  return schoolLevel === 'elementary' ? 'elementary' : 'secondary';
}

export interface LoadedCurriculumStandards {
  readonly bundle: CurriculumStandardsBundle;
  /** 코드 → 성취기준. 매번 새로 만들지 않도록 여기서 한 번만 만든다. */
  readonly index: ReadonlyMap<string, CurriculumStandard>;
}

/** 같은 자료를 두 화면이 동시에 열어도 파일은 한 번만 읽는다. */
const cache = new Map<CurriculumScope, Promise<LoadedCurriculumStandards>>();

async function load(scope: CurriculumScope): Promise<LoadedCurriculumStandards> {
  const mod =
    scope === 'elementary'
      ? await import('@domain/data/curriculumStandards.elementary.json')
      : await import('@domain/data/curriculumStandards.secondary.json');
  // JSON 은 생성물이라 타입을 파일에서 추론하지 않고 선언한 모양으로 받는다.
  const bundle = (mod.default ?? mod) as unknown as CurriculumStandardsBundle;
  return { bundle, index: indexByCode(bundle.standards) };
}

/** 화면 밖(usecase·다른 훅)에서도 쓸 수 있는 불러오기. 이미 읽었으면 그대로 준다. */
export function loadCurriculumStandards(
  scope: CurriculumScope,
): Promise<LoadedCurriculumStandards> {
  const hit = cache.get(scope);
  if (hit) return hit;
  const started = load(scope).catch((err: unknown) => {
    cache.delete(scope); // 실패는 기억하지 않는다 — 다음에 다시 시도할 수 있어야 한다
    throw err;
  });
  cache.set(scope, started);
  return started;
}

export interface CurriculumStandardsState {
  readonly data: LoadedCurriculumStandards | null;
  readonly isLoading: boolean;
  /** 자료를 못 읽었을 때. 화면은 "직접 입력"으로 넘어간다 — 기능을 막지 않는다. */
  readonly error: string | null;
}

/**
 * 성취기준 자료를 쓰는 화면용 훅.
 * `enabled` 가 false 면 아예 읽지 않는다 — 창을 열기 전까지는 1.5MB 를 건드리지 않기 위해서다.
 */
export function useCurriculumStandards(
  schoolLevel: StandardSchoolLevel,
  enabled = true,
): CurriculumStandardsState {
  const scope = scopeOf(schoolLevel);
  const [state, setState] = useState<CurriculumStandardsState>({
    data: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((s) => (s.isLoading ? s : { ...s, isLoading: true, error: null }));
    loadCurriculumStandards(scope)
      .then((data) => {
        if (alive) setState({ data, isLoading: false, error: null });
      })
      .catch(() => {
        if (alive) {
          setState({ data: null, isLoading: false, error: '성취기준 자료를 읽지 못했습니다.' });
        }
      });
    return () => {
      alive = false;
    };
  }, [scope, enabled]);

  return state;
}
