/**
 * 쌤핀 AI 쓰기 — 제안을 **실제로 저장하는** 유일한 자리 (Phase 3)
 *
 * ★들어오는 것이 `AssistWriteProposal` 뿐이라는 점이 안전 구조의 마지막 고리다.
 * 제안은 선생님이 [실행]을 눌러야 여기까지 온다. 모델이 준 원문 인자로는 이 함수를
 * 부를 수 없다 — 타입이 다르고, 제안을 만드는 길은 `buildWriteProposal` 하나뿐이다.
 *
 * ★**새 저장 경로를 만들지 않는다**(계획서). 전부 기존 스토어 함수를 그대로 부른다.
 * 새 경로를 파면 동기화·되돌리기·검증이 그 경로만 비켜 가고, 그 사실은 한참 뒤에
 * 데이터가 어긋난 뒤에야 드러난다.
 *
 * ★의존을 함수 뭉치로 **주입받는다**. 스토어를 직접 import 하면 이 파일을 테스트할 때
 * 진짜 파일에 쓰게 된다 — "무엇을 불렀는지"를 가짜로 확인할 수 있어야 한다.
 */
import type { AssistWriteProposal } from '@domain/entities/AssistWrite';
import { particle } from '@domain/rules/koreanParticle';
import type {
  AttendanceRecord,
  AttendanceStatus,
  AttendanceReason,
  StudentAttendance,
} from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import type { TodoPriority } from '@domain/entities/Todo';

/** 실행이 부르는 스토어 함수들. 전부 **이미 있던** 것이다 */
export interface WriteDeps {
  readonly addTodo: (
    text: string,
    dueDate?: string,
    priority?: TodoPriority,
    category?: string,
    recurrence?: undefined,
    time?: string,
  ) => Promise<void>;
  readonly updateTodo: (
    id: string,
    changes: { text?: string; dueDate?: string; time?: string; priority?: TodoPriority },
  ) => Promise<void>;
  readonly toggleTodo: (id: string) => Promise<void>;
  /**
   * 지금 상태를 다시 본다. **제안을 만든 뒤 선생님이 화면에서 직접 체크했을 수 있다** —
   * 그대로 뒤집으면 원하던 것과 정반대가 되고, 앱은 "완료했어요"라고 말한다.
   * toggle 하나뿐인 스토어라 여기서 확인하는 수밖에 없다.
   */
  readonly getTodo: (id: string) => { readonly completed: boolean } | undefined;
  readonly deleteTodo: (id: string) => Promise<void>;

  readonly addEvent: (params: {
    title: string;
    date: string;
    category: string;
    endDate?: string;
    time?: string;
    location?: string;
  }) => Promise<void>;
  readonly getEvent: (id: string) => SchoolEvent | undefined;
  readonly updateEvent: (event: SchoolEvent) => Promise<void>;
  readonly deleteEvent: (id: string) => Promise<void>;

  readonly addMemo: (content: string, color: MemoColor) => Promise<void>;
  /** 삭제·수정 전 대상이 아직 있는지 다시 본다 — 없는 id 에 스토어가 조용히 no-op 이라
   *  확인 없이 "지웠어요"라고 말하면 거짓 성공이 된다 (2026-08-24 UltraQA) */
  readonly getMemo: (id: string) => unknown | undefined;
  readonly updateMemo: (id: string, content: string) => Promise<void>;
  readonly deleteMemo: (id: string) => Promise<void>;

  readonly addProgressEntry: (
    classId: string,
    date: string,
    period: number,
    unit: string,
    lesson: string,
    note?: string,
    status?: ProgressStatus,
  ) => Promise<ProgressEntry>;
  readonly getProgress: (id: string) => ProgressEntry | undefined;
  readonly updateProgressEntry: (entry: ProgressEntry) => Promise<void>;
  readonly deleteProgressEntry: (id: string) => Promise<void>;

  readonly addBookmark: (input: {
    name: string;
    url: string;
    groupId: string;
    iconType: 'emoji';
    iconValue: string;
    order: number;
  }) => Promise<unknown>;
  /** 위 getMemo 와 같은 이유 — 삭제·수정 전 대상 재확인용 */
  readonly getBookmark: (id: string) => unknown | undefined;
  readonly updateBookmark: (id: string, patch: { name?: string; url?: string }) => Promise<void>;
  readonly deleteBookmark: (id: string) => Promise<void>;
  readonly addBookmarkGroup: (input: {
    name: string;
    emoji: string;
    order: number;
    collapsed: boolean;
  }) => Promise<void>;

  /** 노트는 "빈 것을 만들고 이름을 고치는" 두 걸음이다 — 스토어가 원래 그렇다 */
  readonly createNotebook: () => Promise<void>;
  readonly renameNotebook: (id: string, title: string) => Promise<void>;
  readonly createSection: (notebookId: string) => Promise<void>;
  readonly renameSection: (id: string, title: string) => Promise<void>;
  readonly createPage: (sectionId: string) => Promise<void>;
  /** 위 getMemo 와 같은 이유 — 이름 바꾸기·삭제 전 대상 재확인용 */
  readonly getNotePage: (id: string) => unknown | undefined;
  readonly renamePage: (id: string, title: string) => Promise<void>;
  readonly deletePage: (id: string) => Promise<void>;
  /**
   * 노트책·구역·페이지의 **지금 id 목록**. 생성 호출 전후로 두 번 읽어
   * "새로 생긴 id"를 찾는 데 쓴다.
   *
   * ★예전에는 활성 선택(activeNotebookId 등)을 "방금 만든 것"으로 추정했다 —
   * 활성 선택이 다른 기존 항목을 가리키고 있으면 **그 기존 노트의 이름을 덮어썼다**
   * (2026-08-24 UltraQA P2). 추정 대신 전후 차집합으로 확정한다.
   */
  readonly listNoteIds: () => {
    readonly notebookIds: readonly string[];
    readonly sectionIds: readonly string[];
    readonly pageIds: readonly string[];
  };

  /**
   * 출결 — 대상 학생의 그날 교시만 **부분 갱신**한다.
   *
   * ★`saveDayAttendance`(하루 통째 교체)를 쓰지 않은 이유: 지금 화면에서 다른 학생
   * 출결을 만지고 있을 수 있고, 하루치를 통째로 실어 보내면 그 사이 바뀐 남의 출결을
   * 낡은 스냅샷이 덮는다(2026-07 QA F3 — 같은 사고로 이 함수가 만들어졌다).
   * 다른 학생 보존·병합은 이 함수가 **락 안에서** 한다.
   *
   * ★반환이 `null` 이면 저장이 막힌 것이다(읽기 실패 등). 그때 "적었어요"라고 말하면
   * 거짓 성공이 된다 — 호출부가 반드시 실패로 다룬다.
   */
  readonly upsertStudentAttendance: (params: {
    classId: string;
    date: string;
    studentNumbers: ReadonlySet<number>;
    recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
  }) => Promise<readonly AttendanceRecord[] | null>;
  /**
   * 담임 출결은 **학생 기록에도 같은 사실이 있어야 한다.** 출결부에만 적고 말면
   * 기록 조회 화면에서는 그 결석이 없는 것으로 보인다(피드백 #147 B-4 의 반대 방향).
   * 화면에서 저장할 때도 늘 이 두 걸음을 함께 밟는다(AttendanceMode.tsx).
   */
  /**
   * [실행] 순간 그 반·그날의 출결 기록. **번호가 겹치는 수업반 때문에 필요하다.**
   *
   * 부분 저장(`upsertStudentAttendance`)은 **번호만으로** 대상을 가른다 — "2번을 저장한다"
   * 고 하면 그 교시의 2번 엔트리를 **전부 지우고** 새것을 넣는다. 담임 학급은 번호가
   * 안 겹쳐 문제가 없지만, 여러 학급에서 모인 수업반에는 2번이 넷일 수 있어 **옆 학생의
   * 출결이 함께 사라진다**(2026-08-25 확인).
   *
   * 그래서 저장 전에 같은 번호의 **다른 학생 엔트리를 읽어 함께 실어 보낸다.**
   */
  readonly getDayAttendanceRecords: (
    classId: string,
    date: string,
  ) => readonly {
    readonly period: number;
    readonly students: readonly StudentAttendance[];
  }[];

  readonly bridgeHomeroomAttendance: (params: {
    className: string;
    date: string;
    recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
    students: readonly Student[];
  }) => Promise<void>;
  /** 담임 학급 명렬표. 위 미러가 번호를 학생 id 에 잇는 데 쓴다 */
  readonly homeroomStudents: () => readonly Student[];

  /**
   * 관찰 기록 — 화면에서 저장할 때 지나는 함수 그대로다(ObservationForm.tsx).
   *
   * ★`studentId` 는 담임 학급의 학생 id 가 아니라 수업반 안의 키(`studentKey`)다.
   * 화면이 쓰는 키와 한 글자라도 달라지면, AI 가 남긴 관찰만 그 학생 화면에서 안 보인다.
   */
  readonly addObservation: (params: {
    studentId: string;
    classId: string;
    date: string;
    content: string;
    tags: string[];
    category?: string;
  }) => Promise<string>;

  /**
   * 루브릭 채점 — **토글이다.** 같은 수준을 다시 부르면 체크가 풀린다.
   * 그래서 부르기 전에 반드시 아래 `getRubricMark` 로 지금 상태를 본다.
   */
  readonly toggleRubricMark: (
    rubricId: string,
    classId: string,
    studentId: string,
    criterionId: string,
    levelId: string,
  ) => Promise<void>;
  /**
   * 지금 이 요소에 무엇이 체크돼 있는가. **제안을 만든 뒤 선생님이 화면에서 직접
   * 눌렀을 수 있다** — 확인 없이 뒤집으면 원하던 것과 정반대가 되고, 앱은
   * "채점했어요"라고 말한다(`getTodo` 와 같은 이유).
   *
   * `absent` 는 결시 표시다. 결시 학생에게는 스토어가 **조용히 아무것도 안 한다** —
   * 확인하지 않으면 그 침묵이 성공 문구로 둔갑한다.
   */
  readonly getRubricMark: (
    rubricId: string,
    studentId: string,
    criterionId: string,
  ) => { readonly levelId?: string; readonly absent: boolean } | undefined;
}

export interface WriteResult {
  readonly ok: boolean;
  /** 화면에 그대로 뜨는 한국어 한 줄 */
  readonly message: string;
}

/** 제안이 확정해 둔 값을 꺼낸다. 형식은 이미 조립기가 확정했다 */
function str(proposal: AssistWriteProposal, key: string): string | undefined {
  const value = proposal.values[key];
  return typeof value === 'string' ? value : undefined;
}
function num(proposal: AssistWriteProposal, key: string): number | undefined {
  const value = proposal.values[key];
  return typeof value === 'number' ? value : undefined;
}

/** 대상 식별자가 없으면 실행하지 않는다 — 수정·삭제에서 이건 있을 수 없는 상태다 */
function needTarget(proposal: AssistWriteProposal): string | undefined {
  return proposal.targetId;
}

/**
 * 노트는 "빈 것을 만들고 → 이름을 고치는" 두 걸음이라, **첫 걸음만 되고 둘째가 안 될 수**
 * 있다. 그때 원래는 `if (created) rename` 으로 조용히 건너뛰고도 "만들었어요"라고
 * 말했다 — 실제로는 "새 페이지"라는 이름으로 남아 있는데 선생님은 제 이름으로 만들어진
 * 줄 안다. **한 일과 다른 말을 하지 않는다.**
 */
function unnamed(what: string): WriteResult {
  return {
    ok: false,
    message: `${what}은(는) 만들어졌지만 이름을 붙이지 못했어요. 노트 화면에서 이름을 고쳐 주세요.`,
  };
}

/** 실행 분기가 없는 도구에 내는 문구. 배선 계약 테스트가 이 값으로 대조한다 */
export const NOT_WIRED_MESSAGE = '이 작업은 아직 실행할 수 없어요.';

/**
 * 생성 호출 전후의 id 목록을 견줘 **새로 생긴 id** 를 찾는다.
 *
 * ★정확히 하나일 때만 돌려준다. 0개면 스토어가 목록을 못 갱신한 것이고, 2개 이상이면
 * 어느 것이 "방금 만든 것"인지 확정할 수 없다 — 추측으로 엉뚱한 항목의 이름을
 * 덮어쓰느니 이름 붙이기를 포기하고 사실대로 말한다(unnamed 경로).
 */
async function createAndFindNewId(
  list: () => readonly string[],
  create: () => Promise<void>,
): Promise<string | null> {
  const before = new Set(list());
  await create();
  const added = list().filter((candidate) => !before.has(candidate));
  return added.length === 1 ? added[0]! : null;
}

export async function executeAssistWrite(
  proposal: AssistWriteProposal,
  deps: WriteDeps,
): Promise<WriteResult> {
  // ★여러 건 묶음이면 하나씩 저장한다. 한 건이라도 실패하면 **몇 건이 됐고 몇 건이
  //   안 됐는지** 말한다 — "저장했어요"만 말하면 빠진 것을 아무도 모른다.
  if (proposal.batch && proposal.batch.length > 0) {
    const results: WriteResult[] = [];
    for (const item of proposal.batch) {
      results.push(await executeAssistWrite(item, deps));
    }
    const done = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    if (done === 0) {
      return {
        ok: false,
        message: `${results.length}건 모두 저장하지 못했어요. ${failed[0]?.message ?? ''}`.trim(),
      };
    }
    if (failed.length === 0) return { ok: true, message: `${done}건을 저장했어요.` };
    return {
      ok: true,
      message: `${done}건을 저장했어요. ${failed.length}건은 안 됐어요 — ${failed[0]!.message}`,
    };
  }

  const id = needTarget(proposal);
  const targetMissing: WriteResult = {
    ok: false,
    message: '대상을 찾지 못해 아무것도 바꾸지 않았어요.',
  };
  // ★삭제·수정 전 대상 재확인 (2026-08-24 UltraQA) — 제안을 만든 뒤 선생님이 화면에서
  //   직접 지웠을 수 있다. 스토어는 없는 id 에 조용히 no-op 이라, 확인 없이 성공 문구를
  //   말하면 거짓 성공이 된다.
  const targetGone: WriteResult = {
    ok: false,
    message: '그 항목이 이미 없어요. 화면에서 지우셨다면 할 일이 끝난 거예요.',
  };

  switch (proposal.tool) {
    // ── 할 일 ──
    case 'create_todo': {
      const text = str(proposal, 'text');
      if (text === undefined) return targetMissing;
      await deps.addTodo(
        text,
        str(proposal, 'dueDate'),
        str(proposal, 'priority') as TodoPriority | undefined,
        undefined,
        undefined,
        str(proposal, 'time'),
      );
      return { ok: true, message: `할 일 "${text}"을(를) 추가했어요.` };
    }
    case 'update_todo': {
      if (!id) return targetMissing;
      if (deps.getTodo(id) === undefined) return targetGone;
      await deps.updateTodo(id, {
        ...(str(proposal, 'text') === undefined ? {} : { text: str(proposal, 'text') }),
        ...(str(proposal, 'dueDate') === undefined ? {} : { dueDate: str(proposal, 'dueDate') }),
        ...(str(proposal, 'time') === undefined ? {} : { time: str(proposal, 'time') }),
        ...(str(proposal, 'priority') === undefined
          ? {}
          : { priority: str(proposal, 'priority') as TodoPriority }),
      });
      return { ok: true, message: '할 일을 고쳤어요.' };
    }
    case 'complete_todo': {
      if (!id) return targetMissing;
      const undo = proposal.values.undo === true;
      // ★뒤집기 전에 지금 상태를 다시 본다(위 getTodo 주석 참조).
      const now = deps.getTodo(id);
      if (now && now.completed === !undo) {
        return {
          ok: false,
          message: undo
            ? '이미 안 끝낸 걸로 돼 있어서 그대로 뒀어요.'
            : '이미 끝낸 걸로 돼 있어서 그대로 뒀어요.',
        };
      }
      await deps.toggleTodo(id);
      return { ok: true, message: undo ? '할 일을 되돌렸어요.' : '할 일을 완료했어요.' };
    }
    case 'delete_todo': {
      if (!id) return targetMissing;
      if (deps.getTodo(id) === undefined) return targetGone;
      await deps.deleteTodo(id);
      return { ok: true, message: '할 일을 지웠어요.' };
    }

    // ── 일정 ──
    case 'create_event': {
      const title = str(proposal, 'title');
      const date = str(proposal, 'date');
      if (title === undefined || date === undefined) return targetMissing;
      await deps.addEvent({
        title,
        date,
        // 카테고리를 모델이 고르게 하지 않았다. 선생님마다 만든 카테고리가 달라서
        // 지어낸 이름이 오면 저장 자체가 어긋난다. 기본값으로 넣고 화면에서 바꾸게 한다.
        category: 'school',
        ...(str(proposal, 'endDate') === undefined ? {} : { endDate: str(proposal, 'endDate') }),
        ...(str(proposal, 'time') === undefined ? {} : { time: str(proposal, 'time') }),
        ...(str(proposal, 'location') === undefined ? {} : { location: str(proposal, 'location') }),
      });
      return { ok: true, message: `일정 "${title}"을(를) 추가했어요.` };
    }
    case 'update_event': {
      if (!id) return targetMissing;
      const original = deps.getEvent(id);
      if (!original) return targetMissing;
      await deps.updateEvent({
        ...original,
        ...(str(proposal, 'title') === undefined ? {} : { title: str(proposal, 'title')! }),
        ...(str(proposal, 'date') === undefined ? {} : { date: str(proposal, 'date')! }),
        ...(str(proposal, 'time') === undefined ? {} : { time: str(proposal, 'time')! }),
        ...(str(proposal, 'location') === undefined
          ? {}
          : { location: str(proposal, 'location')! }),
      });
      return { ok: true, message: '일정을 고쳤어요.' };
    }
    case 'delete_event': {
      if (!id) return targetMissing;
      if (deps.getEvent(id) === undefined) return targetGone;
      await deps.deleteEvent(id);
      return { ok: true, message: '일정을 지웠어요.' };
    }

    // ── 메모 ──
    case 'create_memo': {
      const content = str(proposal, 'content');
      if (content === undefined) return targetMissing;
      await deps.addMemo(content, (str(proposal, 'color') ?? 'yellow') as MemoColor);
      return { ok: true, message: '메모를 붙였어요.' };
    }
    case 'update_memo': {
      const content = str(proposal, 'content');
      if (!id || content === undefined) return targetMissing;
      if (deps.getMemo(id) === undefined) return targetGone;
      await deps.updateMemo(id, content);
      return { ok: true, message: '메모를 고쳤어요.' };
    }
    case 'delete_memo': {
      if (!id) return targetMissing;
      if (deps.getMemo(id) === undefined) return targetGone;
      await deps.deleteMemo(id);
      return { ok: true, message: '메모를 지웠어요.' };
    }

    // ── 진도 ──
    case 'create_progress': {
      const classId = str(proposal, 'classId');
      const date = str(proposal, 'date');
      const period = num(proposal, 'period');
      const unit = str(proposal, 'unit');
      if (
        classId === undefined ||
        date === undefined ||
        period === undefined ||
        unit === undefined
      ) {
        return targetMissing;
      }
      await deps.addProgressEntry(
        classId,
        date,
        period,
        unit,
        str(proposal, 'lesson') ?? '',
        str(proposal, 'note') ?? '',
        (str(proposal, 'status') ?? 'completed') as ProgressStatus,
      );
      // 교시 이름은 조립기가 정본 함수로 만들어 실어 보낸 것을 그대로 쓴다.
      return {
        ok: true,
        message: `${date} ${str(proposal, 'periodLabel') ?? ''} 진도를 적었어요.`.replace(
          '  ',
          ' ',
        ),
      };
    }
    case 'update_progress': {
      if (!id) return targetMissing;
      const original = deps.getProgress(id);
      if (!original) return targetMissing;
      await deps.updateProgressEntry({
        ...original,
        ...(str(proposal, 'unit') === undefined ? {} : { unit: str(proposal, 'unit')! }),
        ...(str(proposal, 'lesson') === undefined ? {} : { lesson: str(proposal, 'lesson')! }),
        ...(str(proposal, 'note') === undefined ? {} : { note: str(proposal, 'note')! }),
        ...(str(proposal, 'status') === undefined
          ? {}
          : { status: str(proposal, 'status') as ProgressStatus }),
      });
      return { ok: true, message: '진도를 고쳤어요.' };
    }
    case 'delete_progress': {
      if (!id) return targetMissing;
      if (deps.getProgress(id) === undefined) return targetGone;
      await deps.deleteProgressEntry(id);
      return { ok: true, message: '진도를 지웠어요.' };
    }

    // ── 즐겨찾기 ──
    case 'create_bookmark': {
      const name = str(proposal, 'name');
      const url = str(proposal, 'url');
      const groupId = str(proposal, 'groupId');
      if (name === undefined || url === undefined || groupId === undefined) return targetMissing;
      await deps.addBookmark({
        name,
        url,
        groupId,
        iconType: 'emoji',
        iconValue: '🔖',
        order: Date.now(),
      });
      return { ok: true, message: `즐겨찾기 "${name}"을(를) 추가했어요.` };
    }
    case 'update_bookmark': {
      if (!id) return targetMissing;
      if (deps.getBookmark(id) === undefined) return targetGone;
      await deps.updateBookmark(id, {
        ...(str(proposal, 'name') === undefined ? {} : { name: str(proposal, 'name') }),
        ...(str(proposal, 'url') === undefined ? {} : { url: str(proposal, 'url') }),
      });
      return { ok: true, message: '즐겨찾기를 고쳤어요.' };
    }
    case 'delete_bookmark': {
      if (!id) return targetMissing;
      if (deps.getBookmark(id) === undefined) return targetGone;
      await deps.deleteBookmark(id);
      return { ok: true, message: '즐겨찾기를 지웠어요.' };
    }
    case 'create_bookmark_group': {
      const name = str(proposal, 'name');
      if (name === undefined) return targetMissing;
      await deps.addBookmarkGroup({
        name,
        emoji: str(proposal, 'emoji') ?? '📁',
        order: Date.now(),
        collapsed: false,
      });
      return { ok: true, message: `묶음 "${name}"을(를) 만들었어요.` };
    }

    // ── 노트 (만들고 → 이름 고치기, 스토어 본래 구조 그대로) ──
    // ★"방금 만든 것"은 활성 선택으로 추정하지 않는다 — 생성 전후 id 목록의 차집합으로
    //   확정한다(createAndFindNewId 주석 참조). 못 찾으면 이름 붙이기를 포기하고
    //   사실대로 말한다(unnamed).
    case 'create_notebook': {
      const title = str(proposal, 'title');
      if (title === undefined) return targetMissing;
      const created = await createAndFindNewId(
        () => deps.listNoteIds().notebookIds,
        () => deps.createNotebook(),
      );
      if (created === null) return unnamed('노트책');
      await deps.renameNotebook(created, title);
      // 노트책을 만들면 앱은 늘 기본 구역·페이지를 함께 만든다(화면에서 눌렀을 때와 같다).
      return { ok: true, message: `노트책 "${title}"을(를) 만들었어요.` };
    }
    case 'create_note_section': {
      const notebookId = str(proposal, 'notebookId');
      const title = str(proposal, 'title');
      if (notebookId === undefined || title === undefined) return targetMissing;
      const created = await createAndFindNewId(
        () => deps.listNoteIds().sectionIds,
        () => deps.createSection(notebookId),
      );
      if (created === null) return unnamed('구역');
      await deps.renameSection(created, title);
      return { ok: true, message: `구역 "${title}"을(를) 만들었어요.` };
    }
    case 'create_note_page': {
      const sectionId = str(proposal, 'sectionId');
      const title = str(proposal, 'title');
      if (sectionId === undefined || title === undefined) return targetMissing;
      const created = await createAndFindNewId(
        () => deps.listNoteIds().pageIds,
        () => deps.createPage(sectionId),
      );
      if (created === null) return unnamed('페이지');
      await deps.renamePage(created, title);
      return { ok: true, message: `페이지 "${title}"을(를) 만들었어요.` };
    }
    case 'rename_note_page': {
      const title = str(proposal, 'title');
      if (!id || title === undefined) return targetMissing;
      if (deps.getNotePage(id) === undefined) return targetGone;
      await deps.renamePage(id, title);
      return { ok: true, message: `페이지 이름을 "${title}"(으)로 바꿨어요.` };
    }
    case 'delete_note_page': {
      if (!id) return targetMissing;
      if (deps.getNotePage(id) === undefined) return targetGone;
      await deps.deletePage(id);
      return { ok: true, message: '페이지를 지웠어요.' };
    }

    // -- 출결 --
    case 'set_attendance': {
      const classId = str(proposal, 'classId');
      const when = str(proposal, 'date');
      const status = str(proposal, 'status') as AttendanceStatus | undefined;
      const studentNumber = num(proposal, 'studentNumber');
      const studentName = str(proposal, 'studentName') ?? '';
      // 조립기가 쉼표로 붙여 보낸 교시 목록을 되푼다(AssistWriteValues 는 배열을 담지 않는다).
      const periods = (str(proposal, 'periods') ?? '')
        .split(',')
        .map((piece) => Number(piece))
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 9);
      if (
        classId === undefined ||
        when === undefined ||
        status === undefined ||
        studentNumber === undefined ||
        periods.length === 0
      ) {
        return targetMissing;
      }

      const entry: StudentAttendance = {
        number: studentNumber,
        status,
        // ★수업반은 번호가 겹친다(한 반에 "2번"이 넷일 수 있다). 이 둘이 없으면
        //   조회 화면이 어느 학생인지 못 정해 "?" 로 띄운다 — 화면 저장과 같은 짝이다.
        ...(num(proposal, 'studentGrade') === undefined
          ? {}
          : { grade: num(proposal, 'studentGrade')! }),
        ...(num(proposal, 'studentClassNum') === undefined
          ? {}
          : { classNum: num(proposal, 'studentClassNum')! }),
        ...(str(proposal, 'reason') === undefined
          ? {}
          : { reason: str(proposal, 'reason') as AttendanceReason }),
        ...(str(proposal, 'memo') === undefined ? {} : { memo: str(proposal, 'memo')! }),
      };
      // ★같은 번호의 **다른 학생**을 함께 실어 보낸다(위 getDayAttendanceRecords 주석).
      //   안 그러면 부분 저장이 그 번호 엔트리를 통째로 갈아 끼워 옆 학생 출결이 사라진다.
      const sameNumber = (a: StudentAttendance): boolean =>
        a.grade === entry.grade && a.classNum === entry.classNum;
      const dayNow = deps.getDayAttendanceRecords(classId, when);
      const byPeriod = new Map<number, readonly StudentAttendance[]>(
        periods.map((period) => {
          const now = dayNow.find((record) => record.period === period)?.students ?? [];
          const others = now.filter((a) => a.number === studentNumber && !sameNumber(a));
          return [period, [...others, entry]] as const;
        }),
      );

      const saved = await deps.upsertStudentAttendance({
        classId,
        date: when,
        studentNumbers: new Set([studentNumber]),
        recordsByPeriod: byPeriod,
      });
      // ★null = 저장이 막혔다. 조용히 성공 문구를 내면 선생님은 적힌 줄 안다.
      if (saved === null) {
        return {
          ok: false,
          message: '출결을 저장하지 못했어요. 출결 화면에서 직접 확인해 주세요.',
        };
      }

      if (proposal.values.homeroom === true) {
        // ★미러는 **하루치 전부**를 봐야 한다. 방금 바꾼 교시만 넘기면 나머지 교시의
        //   이상 출결이 기록에서 통째로 사라진다(bridge 가 attendancePeriods 를 새로 쓴다).
        //   그래서 저장 결과에서 그날 전체를 다시 모아 넘긴다.
        const dayByPeriod = new Map<number, readonly StudentAttendance[]>();
        for (const record of saved) {
          if (record.date === when && record.classId === classId) {
            dayByPeriod.set(record.period, record.students);
          }
        }
        await deps.bridgeHomeroomAttendance({
          className: classId,
          date: when,
          recordsByPeriod: dayByPeriod,
          students: deps.homeroomStudents(),
        });
      }

      const label = str(proposal, 'periodLabel') ?? '';
      return {
        ok: true,
        message: `${studentName} 학생 ${when} ${label} 출결을 적었어요.`.replace('  ', ' '),
      };
    }

    // -- 관찰 --
    case 'add_observation': {
      const classId = str(proposal, 'classId');
      const studentKey = str(proposal, 'studentKey');
      const when = str(proposal, 'date');
      const content = str(proposal, 'content');
      if (
        classId === undefined ||
        studentKey === undefined ||
        when === undefined ||
        content === undefined
      ) {
        return targetMissing;
      }

      const tag = str(proposal, 'tag');
      await deps.addObservation({
        studentId: studentKey,
        classId,
        date: when,
        content,
        // 태그는 화면과 같은 모양(배열)으로 넘긴다. 안 골랐으면 빈 배열이다.
        tags: tag === undefined ? [] : [tag],
        ...(str(proposal, 'category') === undefined
          ? {}
          : { category: str(proposal, 'category')! }),
      });
      return {
        ok: true,
        message: `${str(proposal, 'studentName') ?? ''} 학생 관찰 기록을 남겼어요.`.trim(),
      };
    }

    // -- 루브릭 채점 --
    case 'set_rubric_mark': {
      const rubricId = str(proposal, 'rubricId');
      const classId = str(proposal, 'classId');
      const studentKey = str(proposal, 'studentKey');
      const criterionId = str(proposal, 'criterionId');
      const levelId = str(proposal, 'levelId');
      if (
        rubricId === undefined ||
        classId === undefined ||
        studentKey === undefined ||
        criterionId === undefined ||
        levelId === undefined
      ) {
        return targetMissing;
      }

      // ★한 칸이든 여러 칸이든 **같은 길로** 간다("만점으로 해줘" = 요소 전부).
      //   조립기가 한 칸짜리도 `marks` 에 한 개로 실어 준다.
      const marks = proposal.marks ?? [
        {
          criterionId,
          criterionName: str(proposal, 'criterionName') ?? '',
          levelId,
          levelName: str(proposal, 'levelName') ?? '',
        },
      ];
      const who = str(proposal, 'studentName') ?? '';

      // ★결시는 학생 단위 사실이라 **첫 칸에서 한 번만** 본다. 결시인데 요소마다
      //   따로 물으면 같은 말을 여러 번 하게 된다.
      if (deps.getRubricMark(rubricId, studentKey, marks[0]!.criterionId)?.absent === true) {
        return {
          ok: false,
          message: `${who} 학생은 결시로 표시돼 있어서 채점하지 않았어요.`.trim(),
        };
      }

      const changed: string[] = [];
      const kept: string[] = [];
      for (const mark of marks) {
        // ★이미 그 수준이면 부르지 않는다 — 토글이라 그대로 누르면 체크가 **풀린다**.
        //   요소마다 따로 본다: 선생님이 화면에서 일부만 미리 찍어 뒀을 수 있다.
        if (deps.getRubricMark(rubricId, studentKey, mark.criterionId)?.levelId === mark.levelId) {
          kept.push(mark.criterionName);
          continue;
        }
        await deps.toggleRubricMark(rubricId, classId, studentKey, mark.criterionId, mark.levelId);
        changed.push(mark.criterionName);
      }

      // 한 칸짜리 문구는 예전 그대로 둔다 — 선생님이 이미 익숙한 문장이다.
      if (marks.length === 1) {
        const only = marks[0]!;
        if (changed.length === 0) {
          return {
            ok: false,
            message: `이미 "${only.levelName}"으로 체크돼 있어서 그대로 뒀어요.`,
          };
        }
        return {
          ok: true,
          message:
            `${who} 학생의 "${only.criterionName}"${particle(only.criterionName, '을', '를')} "${only.levelName}"으로 체크했어요.`.trim(),
        };
      }

      // ★몇 칸을 실제로 바꿨고 몇 칸은 그대로 뒀는지 **둘 다** 말한다. "채점했어요"만
      //   말하면 이미 찍혀 있던 칸까지 새로 바꾼 줄 안다.
      if (changed.length === 0) {
        return {
          ok: false,
          message:
            `${who} 학생은 ${marks.length}개 요소가 이미 그렇게 체크돼 있어서 그대로 뒀어요.`.trim(),
        };
      }
      return {
        ok: true,
        message: `${who} 학생의 ${changed.length}개 요소를 채점했어요.${
          kept.length === 0 ? '' : ` (${kept.length}개는 이미 그렇게 돼 있어 그대로 뒀어요.)`
        }`.trim(),
      };
    }

    default:
      // 여기 오려면 제안이 만들어졌는데 실행 분기가 없다는 뜻이다 — 조립기와 실행기가
      // 어긋난 것이므로, 조용히 넘기지 않고 선생님에게 알린다.
      return { ok: false, message: NOT_WIRED_MESSAGE };
  }
}
