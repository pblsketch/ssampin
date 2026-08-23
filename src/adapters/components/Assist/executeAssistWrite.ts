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
  readonly renamePage: (id: string, title: string) => Promise<void>;
  readonly deletePage: (id: string) => Promise<void>;
  /** 방금 만든 것의 id 를 알아내는 자리. 스토어가 새로 만든 것을 활성으로 잡아 준다 */
  readonly noteSelection: () => {
    readonly notebookId: string | null;
    readonly sectionId: string | null;
    readonly pageId: string | null;
  };
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

export async function executeAssistWrite(
  proposal: AssistWriteProposal,
  deps: WriteDeps,
): Promise<WriteResult> {
  const id = needTarget(proposal);
  const targetMissing: WriteResult = {
    ok: false,
    message: '대상을 찾지 못해 아무것도 바꾸지 않았어요.',
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
      await deps.toggleTodo(id);
      return {
        ok: true,
        message: proposal.values.undo === true ? '할 일을 되돌렸어요.' : '할 일을 완료했어요.',
      };
    }
    case 'delete_todo': {
      if (!id) return targetMissing;
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
      await deps.updateMemo(id, content);
      return { ok: true, message: '메모를 고쳤어요.' };
    }
    case 'delete_memo': {
      if (!id) return targetMissing;
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
      await deps.updateBookmark(id, {
        ...(str(proposal, 'name') === undefined ? {} : { name: str(proposal, 'name') }),
        ...(str(proposal, 'url') === undefined ? {} : { url: str(proposal, 'url') }),
      });
      return { ok: true, message: '즐겨찾기를 고쳤어요.' };
    }
    case 'delete_bookmark': {
      if (!id) return targetMissing;
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
    case 'create_notebook': {
      const title = str(proposal, 'title');
      if (title === undefined) return targetMissing;
      await deps.createNotebook();
      const created = deps.noteSelection().notebookId;
      if (created) await deps.renameNotebook(created, title);
      // 노트책을 만들면 앱은 늘 기본 구역·페이지를 함께 만든다(화면에서 눌렀을 때와 같다).
      return { ok: true, message: `노트책 "${title}"을(를) 만들었어요.` };
    }
    case 'create_note_section': {
      const notebookId = str(proposal, 'notebookId');
      const title = str(proposal, 'title');
      if (notebookId === undefined || title === undefined) return targetMissing;
      await deps.createSection(notebookId);
      const created = deps.noteSelection().sectionId;
      if (created) await deps.renameSection(created, title);
      return { ok: true, message: `구역 "${title}"을(를) 만들었어요.` };
    }
    case 'create_note_page': {
      const sectionId = str(proposal, 'sectionId');
      const title = str(proposal, 'title');
      if (sectionId === undefined || title === undefined) return targetMissing;
      await deps.createPage(sectionId);
      const created = deps.noteSelection().pageId;
      if (created) await deps.renamePage(created, title);
      return { ok: true, message: `페이지 "${title}"을(를) 만들었어요.` };
    }
    case 'rename_note_page': {
      const title = str(proposal, 'title');
      if (!id || title === undefined) return targetMissing;
      await deps.renamePage(id, title);
      return { ok: true, message: `페이지 이름을 "${title}"(으)로 바꿨어요.` };
    }
    case 'delete_note_page': {
      if (!id) return targetMissing;
      await deps.deletePage(id);
      return { ok: true, message: '페이지를 지웠어요.' };
    }

    default:
      // 여기 오려면 제안이 만들어졌는데 실행 분기가 없다는 뜻이다 — 조립기와 실행기가
      // 어긋난 것이므로, 조용히 넘기지 않고 선생님에게 알린다.
      return { ok: false, message: '이 작업은 아직 실행할 수 없어요.' };
  }
}
