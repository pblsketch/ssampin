/**
 * 「내 뼈대」 목록 다루기 — 저장·이름 바꾸기·삭제(순수, ADR-103).
 *
 * ★`recordStylePresetStore` 와 같은 꼴로 둔다: 목록 규칙(상한·이름 중복·내장은 못 지움)은 화면이
 *   아니라 여기서 검사해야 테스트로 고정된다.
 * ★학생 원문·근거·메모는 들어오지 않는다. 이름과 자리뿐이다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  normalizeScaffoldScenes,
  type NarrativeFrameId,
  type RecordScaffold,
  type RecordScaffoldScene,
} from './narrativeFrames';

/** 저장 개수 상한. 「내 작성 방식」과 같은 수로 둔다 — 선생님이 기억하는 규모가 같다. */
export const RECORD_SCAFFOLD_MAX = 30;

export type ScaffoldError = 'empty-name' | 'duplicate-name' | 'full' | 'not-found' | 'built-in';

export const SCAFFOLD_ERROR_MESSAGES: Readonly<Record<ScaffoldError, string>> = {
  'empty-name': '이름을 적어 주세요.',
  'duplicate-name': '같은 이름의 뼈대가 이미 있습니다.',
  full: `뼈대는 ${RECORD_SCAFFOLD_MAX}개까지 저장할 수 있습니다. 안 쓰는 것을 지워 주세요.`,
  'not-found': '그 뼈대를 찾을 수 없습니다.',
  'built-in': '앱이 들고 있는 뼈대는 바꾸거나 지울 수 없습니다. 새 이름으로 저장해 주세요.',
};

export interface ScaffoldResult {
  readonly ok: boolean;
  readonly scaffolds: readonly RecordScaffold[];
  readonly error?: ScaffoldError;
  /** 새로 만들어진 뼈대의 id(저장일 때). */
  readonly id?: string;
}

const clean = (name: string): string => name.trim();

/** 지금 배열을 이름 붙여 저장한다. 평가 장면은 저장 시점에도 하나로 맞춘다. */
export function addScaffold(
  scaffolds: readonly RecordScaffold[],
  input: {
    readonly name: string;
    readonly frame: NarrativeFrameId;
    readonly scenes: readonly RecordScaffoldScene[];
    readonly now: number;
  },
): ScaffoldResult {
  const name = clean(input.name);
  if (name.length === 0) return { ok: false, scaffolds, error: 'empty-name' };
  if (scaffolds.some((s) => s.name === name)) {
    return { ok: false, scaffolds, error: 'duplicate-name' };
  }
  if (scaffolds.length >= RECORD_SCAFFOLD_MAX) return { ok: false, scaffolds, error: 'full' };
  const id = `scaffold-${input.now}-${scaffolds.length + 1}`;
  const made: RecordScaffold = {
    id,
    name,
    frame: input.frame,
    // ★저장 시점과 적용 시점 두 번 맞춘다. 한쪽에서만 지키면 다른 문으로 샌다(교사 판단은 한 번만).
    scenes: normalizeScaffoldScenes(input.frame, input.scenes),
  };
  return { ok: true, scaffolds: [...scaffolds, made], id };
}

export function renameScaffold(
  scaffolds: readonly RecordScaffold[],
  id: string,
  nextName: string,
): ScaffoldResult {
  const name = clean(nextName);
  if (name.length === 0) return { ok: false, scaffolds, error: 'empty-name' };
  const target = scaffolds.find((s) => s.id === id);
  if (target === undefined) return { ok: false, scaffolds, error: 'not-found' };
  if (target.builtIn === true) return { ok: false, scaffolds, error: 'built-in' };
  if (scaffolds.some((s) => s.id !== id && s.name === name)) {
    return { ok: false, scaffolds, error: 'duplicate-name' };
  }
  return {
    ok: true,
    scaffolds: scaffolds.map((s) => (s.id === id ? { ...s, name } : s)),
  };
}

export function removeScaffold(scaffolds: readonly RecordScaffold[], id: string): ScaffoldResult {
  const target = scaffolds.find((s) => s.id === id);
  if (target === undefined) return { ok: false, scaffolds, error: 'not-found' };
  if (target.builtIn === true) return { ok: false, scaffolds, error: 'built-in' };
  return { ok: true, scaffolds: scaffolds.filter((s) => s.id !== id) };
}

/**
 * 그 틀에서 고를 수 있는 뼈대 — 내장이 먼저, 내가 저장한 것이 뒤.
 *
 * ★틀이 다른 뼈대는 아예 보이지 않는다. 행동특성 자리에 탐구 뼈대를 깔면 자리 이름과 카테고리가
 *   어긋난 채로 남는다(자리표에 없는 카테고리다).
 */
export function scaffoldChoices(
  builtIns: readonly RecordScaffold[],
  mine: readonly RecordScaffold[],
  frame: NarrativeFrameId,
): readonly RecordScaffold[] {
  return [...builtIns.filter((s) => s.frame === frame), ...mine.filter((s) => s.frame === frame)];
}
