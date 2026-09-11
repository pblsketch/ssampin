/**
 * 서사 틀(frame) — **동기·과정·결과·평가 네 자리와 그 안의 세부 카테고리**(ADR-103).
 *
 * 왜 자리표를 따로 두는가: 작성 방식 카탈로그(`recordStyleCatalog.ts`)의 요소들은 이미
 * `role`(형광펜 4색)을 갖고 있지만, 그 값은 **폴백 경로가 읽는 값**이다
 * (`recordStyleCompose.ts` 의 질문 시작 승격·표식 찍기·경고 판정 셋). 요소의 `role` 을
 * 옮기면 저장된 「내 작성 방식」의 요청서 문장이 조용히 달라진다. 그래서 카탈로그는 그대로 두고
 * **어느 자리에 무엇을 고를 수 있는가**만 여기에 새로 적는다.
 *
 * 불가침:
 *  - **저장값은 4종 그대로**(`NarrativeRole`). 틀 이름(특성·장면·성장)은 **화면 라벨**일 뿐이고
 *    요청서로 나가는 표식은 언제나 `[평가] [동기] [과정] [결과]` 다(`narrativeParagraphs.ts`).
 *  - **틀은 영역이 정한다.** 행동특성이면 생활 틀, 나머지는 탐구 틀. 선생님이 고를 일이 아니다.
 *  - 이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import type { NarrativeRole } from './narrativeParagraphs';
import { RECORD_MODULES, RECORD_FOCUSES } from './recordStyleCatalog';
import type { RecordFocusId, RecordModuleId } from '../entities/RecordWritingStyle';
import type { NarrativeScene } from '../entities/InquiryThread';

/** 탐구 틀(교과·자율·진로·동아리) / 생활 틀(행동특성). */
export type NarrativeFrameId = 'inquiry' | 'life';

/** 영역이 틀을 정한다 — `RecordArea` 값을 문자열로 둔다(도메인 순환 import 회피). */
export function frameForArea(area: string): NarrativeFrameId {
  return area === 'behavior' ? 'life' : 'inquiry';
}

/** 네 자리의 순서(범례·빈 뼈대를 그릴 때 쓰는 차례일 뿐, 글의 차례가 아니다). */
export const NARRATIVE_FRAME_ROLES: readonly NarrativeRole[] = [
  'motive',
  'process',
  'result',
  'evaluation',
];

/**
 * 틀별 자리 이름(화면 전용).
 * ★생활 틀의 자리 3 을 '변화' 가 아니라 **'성장'** 으로 둔 이유: 서사 점검
 *   (`recordNarrativeChecks.ts`)이 '변화' 라는 **관찰 슬롯 이름**을 따로 쓰고 있어, 같은 낱말을
 *   자리 이름으로도 쓰면 "슬롯이 있느냐"와 "칸이 무엇이냐"가 화면에서 뒤섞인다.
 */
const FRAME_ROLE_LABELS: Readonly<
  Record<NarrativeFrameId, Readonly<Record<NarrativeRole, string>>>
> = {
  inquiry: { motive: '동기', process: '과정', result: '결과', evaluation: '평가' },
  life: { motive: '특성', process: '장면', result: '성장', evaluation: '평가' },
};

export function frameRoleLabel(frame: NarrativeFrameId, role: NarrativeRole): string {
  return FRAME_ROLE_LABELS[frame][role];
}

export function frameRoleLabels(frame: NarrativeFrameId): Readonly<Record<NarrativeRole, string>> {
  return FRAME_ROLE_LABELS[frame];
}

/**
 * 자리별로 고를 수 있는 세부 카테고리.
 * ★카탈로그 요소 **35개가 하나도 빠짐없이** 들어 있어야 한다(조용한 누락 금지 — 검사로 잠근다).
 */
export const FRAME_SLOTS: Readonly<
  Record<NarrativeFrameId, Readonly<Record<NarrativeRole, readonly RecordModuleId[]>>>
> = {
  inquiry: {
    motive: [
      'legacyMotive',
      'lessonContext',
      'issueQuestion',
      'firstAttempt',
      'purposeConstraint',
      'sharedTask',
      'confirmedInterest',
    ],
    process: [
      'legacyProcess',
      'conceptUsed',
      'compareCriteria',
      'evidenceUsed',
      'counterReview',
      'feedbackReceived',
      'chosenRevision',
      'strategyChoice',
      'makingExecution',
      'reviewImprove',
      'individualAction',
      'interaction',
      'exploreExperience',
    ],
    result: [
      'legacyResult',
      'applyLimit',
      'limitNext',
      'validityJudgement',
      'ownConclusion',
      'revisedPerformance',
      'artifactTrait',
      'contribution',
      'learnedCondition',
      'choiceOrRethink',
      'nextExplore',
    ],
    evaluation: ['teacherJudgement'],
  },
  life: {
    motive: ['repeatedTrait', 'learningAttitude', 'careerInterest'],
    process: ['lifeScenes', 'classRole', 'characterRelation'],
    result: ['selfAndRelation', 'changeOverTime', 'regretPoint'],
    evaluation: ['teacherJudgement'],
  },
};

/** 그 자리의 기본 카테고리 — 선생님이 이름만 직접 적었을 때 지시문이 기댈 요소. */
export function defaultModuleFor(frame: NarrativeFrameId, role: NarrativeRole): RecordModuleId {
  const first = FRAME_SLOTS[frame][role][0];
  // 자리표는 자리마다 최소 하나를 갖는다(검사로 잠근다). 그래도 타입을 위해 평가로 떨어뜨린다.
  return first ?? 'teacherJudgement';
}

/** 이 카테고리가 이 틀의 이 자리에 놓일 수 있는가. */
export function moduleFitsSlot(
  frame: NarrativeFrameId,
  role: NarrativeRole,
  moduleId: RecordModuleId,
): boolean {
  return FRAME_SLOTS[frame][role].includes(moduleId);
}

/**
 * 이 카테고리가 이 틀에서 **어느 자리**에 속하는가.
 *
 * ★카탈로그의 `role`(형광펜 색)과 다를 수 있다. 예를 들어 「반복 관찰된 특성」은 카탈로그에서
 *   과정 색이지만 생활 틀에서는 첫 자리(특성)다. 장면의 자리는 **자리표가 정본**이다 —
 *   카탈로그 `role` 을 옮기면 작성 방식(폴백) 경로의 출력이 달라지므로 그쪽은 건드리지 않는다.
 * 어느 자리에도 없으면 `null`(그 틀에 못 놓는 카테고리다).
 */
export function slotRoleOf(
  frame: NarrativeFrameId,
  moduleId: RecordModuleId,
): NarrativeRole | null {
  for (const role of NARRATIVE_FRAME_ROLES) {
    if (FRAME_SLOTS[frame][role].includes(moduleId)) return role;
  }
  return null;
}

/** 장면 하나의 화면 이름 — 직접 적은 이름이 있으면 그것, 없으면 카테고리 이름, 그것도 없으면 자리 이름. */
export function sceneDisplayLabel(
  frame: NarrativeFrameId,
  scene: NarrativeScene | RecordScaffoldScene,
): string {
  const own = scene.label?.trim() ?? '';
  if (own.length > 0) return own;
  if (scene.moduleId !== undefined) return RECORD_MODULES[scene.moduleId].label;
  return frameRoleLabel(frame, scene.role);
}

/**
 * 화면 머리글용 — **자리 이름과 세부 이름을 나눠** 돌려준다.
 *
 * ★`sceneDisplayLabel` 을 그대로 쓰면 이름도 카테고리도 없는 장면에서 자리 이름으로 떨어져
 *   화면에 `동기: 동기` 가 찍힌다. 요청서 쪽은 한 낱말이면 되지만 화면은 둘을 갈라 놓아야 한다.
 * 세부가 없으면 `detail` 은 `null` 이다(쌍점을 아예 그리지 않는다).
 */
export function sceneHeadParts(
  frame: NarrativeFrameId,
  scene: NarrativeScene | RecordScaffoldScene,
): { readonly slot: string; readonly detail: string | null } {
  const slot = frameRoleLabel(frame, scene.role);
  const own = scene.label?.trim() ?? '';
  if (own.length > 0) return { slot, detail: own };
  if (scene.moduleId !== undefined) return { slot, detail: RECORD_MODULES[scene.moduleId].label };
  return { slot, detail: null };
}
/** 뼈대 — 근거 없이 **장면 배열만** 담은 틀(옛 「내 작성 방식」을 대신한다). */
export interface RecordScaffold {
  readonly id: string;
  readonly name: string;
  readonly frame: NarrativeFrameId;
  readonly scenes: readonly RecordScaffoldScene[];
  /** 앱이 들고 있는 내장 뼈대인가. 내장은 지울 수 없다. */
  readonly builtIn?: boolean;
}

export type RecordScaffoldScene = Pick<NarrativeScene, 'role' | 'moduleId' | 'label'>;

/**
 * 뼈대 정규화 — **평가 장면을 정확히 하나로** 만든다.
 *
 * ★저장 시점과 적용 시점 **두 번** 부른다. 뼈대는 설정 파일에 있고 장면은 주제 파일에 있어
 *   한쪽에서만 지키면 다른 문으로 새어 든다(교사 판단은 어느 구성에서도 한 번만 — ADR-094 §4).
 */
export function normalizeScaffoldScenes(
  frame: NarrativeFrameId,
  scenes: readonly RecordScaffoldScene[],
): readonly RecordScaffoldScene[] {
  const kept: RecordScaffoldScene[] = [];
  let evaluation: RecordScaffoldScene | null = null;
  for (const s of scenes) {
    if (s.role === 'evaluation') {
      // 둘 이상이면 첫 것만 남긴다(뒤엣것을 버린다 — 앞이 선생님이 먼저 놓은 자리다).
      if (evaluation === null) evaluation = s;
      continue;
    }
    if (kept.length >= NARRATIVE_SCAFFOLD_SCENE_MAX) break;
    kept.push(s);
  }
  const evalScene: RecordScaffoldScene = evaluation ?? {
    role: 'evaluation',
    moduleId: defaultModuleFor(frame, 'evaluation'),
  };
  // 평가가 없던 뼈대는 **맨 앞**에 세운다 — 기본 시작 방식이 "교사 판단 먼저"다(ADR-094 가 기본값으로 남았다).
  return evaluation === null ? [evalScene, ...kept] : reinsertEvaluation(scenes, kept, evalScene);
}

/** 원래 평가가 있던 자리를 지킨다(맨 앞이었으면 맨 앞, 맨 뒤였으면 맨 뒤). */
function reinsertEvaluation(
  original: readonly RecordScaffoldScene[],
  kept: readonly RecordScaffoldScene[],
  evalScene: RecordScaffoldScene,
): readonly RecordScaffoldScene[] {
  const at = original.findIndex((s) => s.role === 'evaluation');
  const before = original.slice(0, at).filter((s) => kept.includes(s)).length;
  return [...kept.slice(0, before), evalScene, ...kept.slice(before)];
}

/** 뼈대에 둘 수 있는 본문 장면 수(평가 제외). 주제의 장면 상한과 같은 이유로 둔다. */
export const NARRATIVE_SCAFFOLD_SCENE_MAX = 19;

/**
 * 내장 뼈대 — 작성 초점 7종을 장면 배열로 옮긴 것.
 * ★이름·순서는 초점 카탈로그가 정본이다. 여기서 따로 짓지 않는다(둘이 갈리면 거짓말이 된다).
 */
export function builtInScaffolds(): readonly RecordScaffold[] {
  return RECORD_FOCUSES.map((focus) => {
    const frame: NarrativeFrameId = focus.id === 'lifeRelation' ? 'life' : 'inquiry';
    // ★자리는 **자리표**가 정한다. 카탈로그 `role` 을 쓰면 생활 틀 셋이 모두 과정 자리로 몰린다
    //   (「반복 관찰된 특성」·「대표 생활 장면」·「자기관리·관계·책임」이 전부 과정 색이다).
    const body: RecordScaffoldScene[] = focus.body.map((id) => ({
      role: slotRoleOf(frame, id) ?? RECORD_MODULES[id].role,
      moduleId: id,
    }));
    return {
      id: `builtin:${focus.id}`,
      name: focus.label,
      frame,
      // 평가를 맨 앞에 두는 것이 기본 시작 방식이다(ADR-094 → ADR-099 에서 기본값으로 남았다).
      scenes: normalizeScaffoldScenes(frame, [
        { role: 'evaluation', moduleId: 'teacherJudgement' },
        ...body,
      ]),
      builtIn: true,
    };
  });
}

/** 내장 뼈대 중 기본값 — 「질문에서 출발한 탐구 흐름」. 이 배열이 곧 "장면 없음"과 같은 뜻이다. */
export const DEFAULT_SCAFFOLD_FOCUS: RecordFocusId = 'legacyInquiry';

export function defaultScaffoldScenes(): readonly RecordScaffoldScene[] {
  const found = builtInScaffolds().find((s) => s.id === `builtin:${DEFAULT_SCAFFOLD_FOCUS}`);
  return found?.scenes ?? [];
}
