/**
 * 장면 배열 → 「작성 구성」(ADR-103) — **구성 관문**이 사는 자리.
 *
 * ## 왜 대체가 아니라 생성인가
 *
 * 작성 방식(ADR-099)은 이미 `ResolvedComposition` 이라는 중간 표현을 갖고 있고, 요청서 문장
 * (`buildStyleInstruction`)·표식 지시·판 발자국·회귀 검사가 전부 그 표현 위에 서 있다. 장면이
 * 그 표현을 **대체**하면 저 넷을 다시 써야 하고, 그때 판본 문지기가 사라진다(판본 2 서버에
 * 새 구성을 보내면 1층 규정과 정면으로 싸운다).
 *
 * 그래서 장면은 같은 표현을 **만들어 낼 뿐**이다. 그 뒤 경로는 한 글자도 바뀌지 않는다.
 *
 * ## 관문 둘
 *
 * - **구성 관문**(이 파일): 기본 뼈대이고 배치가 0이고 이어져 있지 않으면 `null` — 그러면 부르는
 *   쪽이 예전과 **같은 호출**을 하고 요청서는 기준선과 글자 하나까지 같다.
 * - **근거 관문**(`recordDraftPack`): 배치된 근거가 0건이면 근거 줄·순서·머리를 예전 코드 경로로
 *   그린다. 근거 관문이 켜지면 구성 관문도 켜진다(배치가 있으면 기본 뼈대라도 구성을 만든다).
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { NarrativeScene } from '../entities/InquiryThread';
import type { NarrativeRole } from './narrativeParagraphs';
import {
  DEFAULT_RECORD_WRITING_STYLE,
  RECORD_STYLE_CATALOG_VERSION,
  RECORD_STYLE_MIN_PROMPT_VERSION,
  type RecordDraftStyleStamp,
  type RecordModuleId,
} from '../entities/RecordWritingStyle';
import { RECORD_MODULES, RECORD_GROUPING_INSTRUCTIONS } from './recordStyleCatalog';
import type { RecordModule } from './recordStyleCatalog';
import type { ResolvedComposition } from './recordStyleCompose';
import { defaultModuleFor, type NarrativeFrameId } from './narrativeFrames';
import { isDefaultScenes } from './narrativeScenes';

export interface ComposeFromScenesInput {
  /** **저장된** 장면 배열(가상 평가 장면을 끼우기 전). 관문 판정은 이 값으로 한다. */
  readonly saved: readonly NarrativeScene[] | undefined;
  /** 정규화된 장면 — 화면이 보는 것과 같은 배열(소유 확인·평가 1개·중복 제거를 마친 것). */
  readonly resolved: readonly NarrativeScene[];
  readonly frame: NarrativeFrameId;
  /** 이 주제가 앞 주제와 이어져 있는가. 이어져 있으면 이음말·순서를 보내야 하므로 기본이 아니다. */
  readonly chained: boolean;
  /** 장면에 실제로 배치된 근거 수(근거 관문의 값). 1건이라도 있으면 기본 뼈대라도 구성을 만든다. */
  readonly placedCount: number;
}

/**
 * 장면 배열에서 구성을 만든다. **`null` 이면 예전 경로 그대로**(요청서가 기준선과 같다).
 *
 * ★`modules` 는 카탈로그 요소의 **얕은 복사에 `role` 을 덮어쓴 것**이다. 카탈로그 자체를 고치면
 *   저장된 「내 작성 방식」의 요청서 문장이 조용히 달라진다 — 자리표를 따로 둔 이유가 그것이다.
 */
export function resolveCompositionFromScenes(
  input: ComposeFromScenesInput,
): ResolvedComposition | null {
  const { saved, resolved, frame, chained, placedCount } = input;
  if (placedCount === 0 && isDefaultScenes(saved, { chained })) return null;
  if (resolved.length === 0) return null;

  const modules = resolved.map((scene) => moduleForScene(scene, frame));
  const first = resolved[0];
  return {
    modules,
    firstIsEvaluation: first !== undefined && first.role === 'evaluation',
    // 장면 경로는 언제나 "이어진 하나의 과정" 이다. 기본값과 같은 값이라 새로 늘어나는 지시는 없다
    // (다만 「작성 구성」 블록을 실을 때 묶는 방식 문장은 원래 늘 함께 나간다).
    grouping: 'connected',
    groupingInstruction: RECORD_GROUPING_INSTRUCTIONS.connected,
    shouldEmitComposition: true,
  };
}

/**
 * 장면 하나 → 요청서 요소.
 *
 * - 카테고리를 골랐으면 그 요소를, 안 골랐으면 그 자리의 기본 요소를 쓴다.
 * - 선생님이 이름을 직접 적었으면 **이름만** 바꾼다(지침 문장은 기본 요소의 것을 그대로 쓴다 —
 *   지어낸 지침을 보내는 것보다 검증된 지침을 보내는 편이 낫다).
 * - 메모가 있으면 지침 끝에 "선생님이 본 것" 으로 덧붙인다. 가리기는 요청서 조립이 한다.
 */
function moduleForScene(scene: NarrativeScene, frame: NarrativeFrameId): RecordModule {
  const id: RecordModuleId = scene.moduleId ?? defaultModuleFor(frame, scene.role);
  const base = RECORD_MODULES[id];
  const label = scene.label?.trim() ?? '';
  return {
    ...base,
    // ★`role` 은 장면이 정한다 — 카탈로그의 값은 폴백 경로가 읽으므로 손대지 않는다.
    role: scene.role,
    ...(label.length > 0 ? { label } : {}),
  };
}

/**
 * 구성용 판본 문지기 — `applyPromptVersionGate`(작성 방식용)의 **형제**다.
 *
 * ★기존 함수를 고치지 않는다: 그쪽은 `RecordWritingStyle` 을 받아 기존형으로 되돌리는데,
 *   장면 구성에는 "되돌릴 기존형"이 없다(장면은 되돌릴 수 없다). 그래서 여기서는 **아예 안 보낸다.**
 * ★판본을 아직 못 받았으면(undefined) 막지 않는다 — 실행 직전에 받아 오므로 그때 다시 본다.
 * ★`downgraded` 는 부르는 쪽이 **화면 경고로 올려야** 한다. 조용히 빼면 선생님은 자기가 짠 서사가
 *   안 나간 줄 모른다.
 */
export function applyCompositionVersionGate(
  composition: ResolvedComposition | null,
  promptVersion: number | undefined,
): { readonly composition: ResolvedComposition | null; readonly downgraded: boolean } {
  if (composition === null) return { composition: null, downgraded: false };
  if (promptVersion === undefined) return { composition, downgraded: false };
  if (promptVersion >= RECORD_STYLE_MIN_PROMPT_VERSION) return { composition, downgraded: false };
  return { composition: null, downgraded: true };
}

/**
 * 판에 남길 발자국 — "무엇으로 쓴 초안인가"를 나중에 되짚는 값.
 *
 * ★**자유 글은 담지 않는다.** 판 파일은 Drive 로 동기화되고, 장면 메모·이름에는 선생님이 학생
 *   이름을 적었을 수 있다(가리기는 보낼 때만 걸린다). 카탈로그 id 와 역할만 남긴다.
 * ★주제가 지워져도 이 값은 남는다 — 그래서 `sceneIds` 만으로는 부족하다.
 */
export function narrativeStyleStamp(
  resolved: readonly NarrativeScene[],
  frame: NarrativeFrameId,
  hadInstruction: boolean,
): RecordDraftStyleStamp {
  const first = resolved[0];
  return {
    focus: DEFAULT_RECORD_WRITING_STYLE.focus,
    // 시작 방식은 이제 "평가 장면이 어디 있는가" 로 드러난다 — 발자국에도 그대로 적는다.
    opening: first !== undefined && first.role === 'evaluation' ? 'evaluation' : 'performance',
    grouping: 'connected',
    frame,
    sceneRoles: resolved.map((s) => s.role),
    moduleIds: resolved.map((s) => s.moduleId ?? defaultModuleFor(frame, s.role)),
    catalogVersion: NARRATIVE_STAMP_CATALOG_VERSION,
    hadInstruction,
  };
}

/**
 * 발자국에 적는 카탈로그 판본.
 *
 * ★두 벌로 두지 않는다 — 요소 목록의 정본은 `RECORD_STYLE_CATALOG_VERSION` 하나다. 여기에 숫자를
 *   따로 적어 두면 카탈로그만 올렸을 때 판이 옛 판본을 말한다(무엇으로 쓴 초안인지 되짚지 못한다).
 */
export const NARRATIVE_STAMP_CATALOG_VERSION = RECORD_STYLE_CATALOG_VERSION;

/**
 * 문단 ↔ 장면 왕복 — 초안의 표식 배열이 장면 배열의 **어느 자리에서 나왔는지** 맞춘다(ADR-103 §5-4).
 *
 * 원칙 1(계획서 §2)이 정한 계약을 그대로 쓴다: 문단의 표식 배열은 장면 역할 배열의 **부분수열**이다.
 * 건너뜀은 허용이고 뒤바뀜은 실패다. 그래서 왼쪽부터 한 번만 훑으면 맞출 수 있다.
 *
 * ★맞지 않는 문단은 `null` 이다 — 억지로 가까운 장면에 붙이지 않는다. 잘못 짝지으면 교사가
 *   "이 문단은 저 장면에서 나왔다"고 믿고 엉뚱한 근거를 고친다.
 * ★돌려주는 것은 **문단마다 장면 인덱스**다. 표식이 없는 문단(`role: null`)도 `null` 이다.
 */
export function alignParagraphsToScenes(
  marks: readonly { readonly role: NarrativeRole | null }[],
  sceneRoles: readonly NarrativeRole[],
): readonly (number | null)[] {
  const out: (number | null)[] = [];
  let cursor = 0;
  for (const m of marks) {
    if (m.role === null) {
      out.push(null);
      continue;
    }
    let at = -1;
    for (let i = cursor; i < sceneRoles.length; i += 1) {
      if (sceneRoles[i] === m.role) {
        at = i;
        break;
      }
    }
    if (at < 0) {
      // 뒤바뀌었거나 남은 자리에 없다. 여기서 커서를 물리지 않는다 — 물리면 순서가 무너진다.
      out.push(null);
      continue;
    }
    out.push(at);
    cursor = at + 1;
  }
  return out;
}

/** 문단으로 나오지 못한 장면의 인덱스들 — 화면이 "이 자리는 빠졌습니다"라고 말하는 데 쓴다. */
export function scenesMissingFromDraft(
  marks: readonly { readonly role: NarrativeRole | null }[],
  sceneRoles: readonly NarrativeRole[],
): readonly number[] {
  const used = new Set(alignParagraphsToScenes(marks, sceneRoles).filter((x) => x !== null));
  const out: number[] = [];
  for (let i = 0; i < sceneRoles.length; i += 1) {
    if (!used.has(i)) out.push(i);
  }
  return out;
}
