/**
 * 화면 왕복 요청 — "이 학생의 이 근거를 보여 줘"를 한 화면에서 다른 화면으로 넘기는 쪽지(계획 §4.3).
 *
 * 왜 타입을 따로 두는가: 저장 직후 [근거 보드에서 보기] 같은 이동은 **대상이 준비되기 전에** 눌린다.
 * 학생 명단이 아직 안 왔거나, 그 학생이 이미 지워졌거나, 대상 근거가 지금 필터 밖일 수 있다.
 * 그래서 "바로 이동"이 아니라 **요청을 남기고, 준비되면 한 번만 소비**한다.
 *
 * ★전역에 영구 저장하지 않는다. 폼 선택과 초안 AI 상태는 이 쪽지에 담지 않는다(계획 §4.3).
 */

export type RecordFlowContext = 'teaching' | 'homeroom';

/**
 * `board`   저장한 근거를 보드에서 찾아 보여 준다.
 * `compose` 같은 학생·주제로 **빈 본문** 입력을 연다(기존 글을 복사하지 않는다).
 * `source`  원본 기록 카드/조회 편집으로 이동한다.
 */
export type RecordFlowMode = 'board' | 'compose' | 'source';

export interface RecordFlowIntent {
  /** 이 요청의 신원. **같은 요청을 두 번 소비하지 않기 위한** 유일한 근거다. */
  readonly requestId: string;
  readonly context: RecordFlowContext;
  readonly classId?: string;
  readonly studentRef: string;
  readonly mode: RecordFlowMode;
  readonly sourceId?: string;
  readonly evidenceId?: string;
  readonly threadId?: string;
}

let requestSeq = 0;

/** 요청 하나를 만든다. requestId 는 화면 안에서만 쓰는 값이라 UUID 가 필요 없다. */
export function createRecordFlowIntent(
  input: Omit<RecordFlowIntent, 'requestId'>,
): RecordFlowIntent {
  requestSeq += 1;
  return { ...input, requestId: `rfi-${requestSeq}` };
}

/**
 * 요청을 지금 처리할 수 있는지.
 *
 * - `pending`         아직 명단이 안 왔다. **버리지 않고 기다린다** (저장 직후 눌러도 놓치지 않게).
 * - `ready`           대상 학생이 있다. 이제 한 번 소비한다.
 * - `student-missing` 학생·수업반이 지워졌다. **첫 학생에게 묵시적으로 붙이지 않는다**(계획 §4.3).
 * - `consumed`        이미 처리한 요청이다. 다시 하지 않는다.
 */
export type RecordFlowResolution =
  | { readonly status: 'pending' }
  | { readonly status: 'ready'; readonly intent: RecordFlowIntent }
  | { readonly status: 'student-missing'; readonly studentRef: string }
  | { readonly status: 'consumed' };

export interface RecordFlowResolveInput {
  readonly intent: RecordFlowIntent | null;
  /** 명단(roster)이 실제로 로드됐는지. false 면 판정을 미룬다. */
  readonly rosterLoaded: boolean;
  /** 지금 화면이 아는 학생 참조들. 여기 없으면 지워진 학생으로 본다. */
  readonly knownStudentRefs: ReadonlySet<string>;
  /** 이미 소비한 requestId 들. */
  readonly consumedRequestIds: ReadonlySet<string>;
}

export function resolveRecordFlowIntent({
  intent,
  rosterLoaded,
  knownStudentRefs,
  consumedRequestIds,
}: RecordFlowResolveInput): RecordFlowResolution {
  if (intent === null) return { status: 'consumed' };
  // ★소비 검사를 가장 먼저 한다. 명단이 다시 로드되며 리렌더될 때마다 같은 요청을
  //   또 처리하면 화면이 사용자의 이동을 되돌려 버린다(요청 1회 소비 계약).
  if (consumedRequestIds.has(intent.requestId)) return { status: 'consumed' };
  if (!rosterLoaded) return { status: 'pending' };
  if (!knownStudentRefs.has(intent.studentRef)) {
    return { status: 'student-missing', studentRef: intent.studentRef };
  }
  return { status: 'ready', intent };
}

/**
 * 대상 근거가 지금 필터 밖인지. 밖이면 화면이 '전체'로 바꾸고 알려 준다(계획 §4.3).
 * 대상 id 가 아예 없으면(단순 학생 이동) 필터를 건드릴 이유가 없다.
 */
export function needsFilterReset(
  intent: RecordFlowIntent,
  visibleIds: ReadonlySet<string>,
): boolean {
  const target = intent.evidenceId ?? intent.sourceId;
  if (target === undefined) return false;
  return !visibleIds.has(target);
}
