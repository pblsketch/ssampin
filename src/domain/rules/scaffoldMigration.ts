/**
 * 옛 「내 작성 방식」 → 「내 뼈대」 한 번 옮기기(ADR-103, 순수).
 *
 * ★왜 한 번인가: 작성 방식 고르개 네 축(초점·시작·묶기·요소)은 화면에서 사라진다. 그 값들이
 *   설정 파일에 남은 채 요청서에 계속 실리면 **보이지 않는 설정이 결과를 가른다** — 선생님은
 *   화면에서 못 보는 값 때문에 초안이 달라지는 것을 진단할 수 없다. 그래서 옮길 때 한 번만 읽고,
 *   그 뒤로는 요청서 입력으로 쓰지 않는다(폴백은 `DEFAULT_RECORD_WRITING_STYLE` 고정).
 * ★옛 값을 **지우지는 않는다.** 되돌릴 여지를 남긴다 — 이 파일은 새 값을 만들어 돌려줄 뿐이다.
 *
 * ★뜻이 그대로 가지 않는 것이 하나 있다: 묶는 방식이다. 장면 경로는 `connected` 고정이라
 *   「성취기준별로 묶기」·「하나씩 따로」를 고르셨던 분은 **반대 지시**를 받게 된다. 조용히 바꾸지 않고
 *   말로 알린다(`notices`).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import {
  type RecordModuleId,
  type RecordStylePreset,
  type RecordWritingStyle,
} from '../entities/RecordWritingStyle';
import { focusById, RECORD_MODULES } from './recordStyleCatalog';
import {
  normalizeScaffoldScenes,
  slotRoleOf,
  type NarrativeFrameId,
  type RecordScaffold,
  type RecordScaffoldScene,
} from './narrativeFrames';

export interface ScaffoldMigrationInput {
  /** 저장돼 있던 「내 작성 방식」. */
  readonly presets?: readonly RecordStylePreset[];
  /** 영역별 마지막 선택. 키는 `RecordArea` 값. */
  readonly styles?: Readonly<Record<string, RecordWritingStyle>>;
  /** 이미 갖고 있는 뼈대. 옮긴 것은 이 뒤에 붙는다. */
  readonly scaffolds?: readonly RecordScaffold[];
  /** 옮기기를 이미 한 시각. **있으면 아무것도 하지 않는다**(두 번 옮기면 같은 이름이 겹쳐 쌓인다). */
  readonly migratedAt?: number;
  /** id 에 쓸 시각. 테스트가 고정할 수 있도록 받는다. */
  readonly now: number;
}

export interface ScaffoldMigrationResult {
  /** 저장할 「내 뼈대」 목록. `changed` 가 false 면 들어온 값 그대로다. */
  readonly scaffolds: readonly RecordScaffold[];
  /** 영역 → 그 영역에 깔 뼈대 id. 비어 있으면 어느 영역도 따로 지정하지 않는다. */
  readonly areaScaffolds: Readonly<Record<string, string>>;
  /** 선생님에게 한 번 보여 줄 안내. 비어 있으면 알릴 것이 없다. */
  readonly notices: readonly string[];
  readonly changed: boolean;
}

/** 어느 틀에 속하는 초점인가. 행동특성 종합만 생활 틀이다. */
export function frameOfFocus(focusId: string): NarrativeFrameId {
  return focusId === 'lifeRelation' ? 'life' : 'inquiry';
}

/**
 * 작성 방식 하나 → 장면 배열.
 *
 * - 요소: 초점의 기본 구성에서 **뺀 것을 빼고**, 더 넣기로 한 것을 **뒤에 붙인다**.
 * - 자리: 카탈로그 색이 아니라 **자리표**가 정한다(`slotRoleOf`).
 * - 시작 방식: 평가 장면을 어디에 두는가로 드러난다.
 *   `evaluation` 맨 앞 · `performance` 맨 뒤 · `question` 맨 뒤 + 첫 동기 장면을 맨 앞으로.
 * - 추가 지시(`instruction`)는 **담기지 않는다** — 뼈대는 자리와 이름뿐이다.
 */
export function scaffoldScenesFromStyle(style: RecordWritingStyle): readonly RecordScaffoldScene[] {
  const focus = focusById(style.focus);
  const frame = frameOfFocus(focus.id);
  const disabled = new Set<RecordModuleId>(style.disabledModules ?? []);
  const allowedExtras = new Set<RecordModuleId>(focus.extras);

  const ids: RecordModuleId[] = [];
  for (const id of focus.body) if (!disabled.has(id)) ids.push(id);
  for (const id of style.extraModules ?? []) {
    if (!allowedExtras.has(id) || disabled.has(id) || ids.includes(id)) continue;
    ids.push(id);
  }

  const body: RecordScaffoldScene[] = ids.map((id) => ({
    role: slotRoleOf(frame, id) ?? RECORD_MODULES[id].role,
    moduleId: id,
  }));

  // 질문으로 여는 방식은 동기 장면이 글머리에 온다. 없으면 옮길 것이 없다.
  if (style.opening === 'question') {
    const at = body.findIndex((s) => s.role === 'motive');
    if (at > 0) {
      const [moved] = body.splice(at, 1);
      if (moved !== undefined) body.unshift(moved);
    }
  }

  const evaluation: RecordScaffoldScene = { role: 'evaluation', moduleId: 'teacherJudgement' };
  const ordered = style.opening === 'evaluation' ? [evaluation, ...body] : [...body, evaluation];
  return normalizeScaffoldScenes(frame, ordered);
}

/** 그 작성 방식이 기본값 그대로인가(옮길 것이 없는가). */
export function isDefaultStyle(style: RecordWritingStyle): boolean {
  return (
    style.focus === 'legacyInquiry' &&
    style.opening === 'evaluation' &&
    style.grouping === 'connected' &&
    (style.disabledModules ?? []).length === 0 &&
    (style.extraModules ?? []).length === 0
  );
}

const GROUPING_NOTICE: Readonly<Record<string, string>> = {
  byAchievement:
    '「성취기준별로 묶기」는 장면으로 옮기면 그대로 가지 않습니다. 이제는 근거를 장면 순서대로 이어 씁니다. ' +
    '성취기준별로 나누고 싶으시면 장면을 그만큼 만들어 근거를 나눠 놓아 주세요.',
  single:
    '「하나씩 따로 쓰기」는 장면으로 옮기면 그대로 가지 않습니다. 이제는 한 장면에 놓인 근거를 이어 씁니다. ' +
    '따로 두고 싶은 근거는 장면을 나눠 놓아 주세요.',
};

/**
 * 옮기기 한 번.
 *
 * ★`migratedAt` 이 있으면 **아무것도 하지 않는다.** 두 번 옮기면 같은 이름이 겹쳐 쌓인다.
 */
export function migrateStylesToScaffolds(input: ScaffoldMigrationInput): ScaffoldMigrationResult {
  if (input.migratedAt !== undefined) {
    return { scaffolds: input.scaffolds ?? [], areaScaffolds: {}, notices: [], changed: false };
  }

  const out: RecordScaffold[] = [...(input.scaffolds ?? [])];
  const areaScaffolds: Record<string, string> = {};
  const notices: string[] = [];
  const groupingSeen = new Set<string>();
  let hadInstruction = false;
  const usedNames = new Set<string>(out.map((x) => x.name));

  /** 이름이 겹치면 뒤에 번호를 붙인다 — 목록에서 어느 것이 어느 것인지 갈려야 한다. */
  const uniqueName = (base: string): string => {
    const name = base.trim().length > 0 ? base.trim() : '내 뼈대';
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
    for (let n = 2; ; n += 1) {
      const candidate = `${name} (${n})`;
      if (usedNames.has(candidate)) continue;
      usedNames.add(candidate);
      return candidate;
    }
  };

  const note = (style: RecordWritingStyle): void => {
    const g = GROUPING_NOTICE[style.grouping];
    if (g !== undefined && !groupingSeen.has(style.grouping)) {
      groupingSeen.add(style.grouping);
      notices.push(g);
    }
    if ((style.instruction ?? '').trim().length > 0) hadInstruction = true;
  };

  let seq = 0;
  const makeId = (): string => {
    seq += 1;
    return `scaffold-${input.now}-${seq}`;
  };

  for (const preset of input.presets ?? []) {
    note(preset.style);
    out.push({
      id: makeId(),
      name: uniqueName(preset.name),
      frame: frameOfFocus(preset.style.focus),
      scenes: scaffoldScenesFromStyle(preset.style),
    });
  }

  const movedAreaNames: string[] = [];
  for (const [area, style] of Object.entries(input.styles ?? {})) {
    note(style);
    if (isDefaultStyle(style)) continue;
    const focus = focusById(style.focus);
    const scaffold: RecordScaffold = {
      id: makeId(),
      name: uniqueName(focus.label),
      frame: frameOfFocus(focus.id),
      scenes: scaffoldScenesFromStyle(style),
    };
    out.push(scaffold);
    areaScaffolds[area] = scaffold.id;
    movedAreaNames.push(scaffold.name);
  }

  if (movedAreaNames.length > 0) {
    const shown = [...new Set(movedAreaNames)].map((n) => `「${n}」`).join(', ');
    notices.unshift(
      `그동안 쓰시던 ${shown} 을(를) 뼈대로 옮겼습니다. 근거 정리의 [뼈대 고르기]에서 그대로 쓰실 수 있습니다.`,
    );
  }
  if (hadInstruction) {
    notices.push(
      '작성 방식에 적어 두셨던 추가 지시는 뼈대에 담기지 않습니다. 초안을 쓸 때 「+ 한마디」에 적어 주세요.',
    );
  }

  return { scaffolds: out, areaScaffolds, notices, changed: true };
}
