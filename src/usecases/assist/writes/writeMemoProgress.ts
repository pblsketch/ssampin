/**
 * 쌤핀 AI 쓰기 — 메모(3) · 진도(3) 제안 만들기 (순수 함수)
 *
 * 메모는 제목이 없고 내용뿐이라, 고칠·지울 대상을 가리키는 말도 내용에서 찾는다.
 * 진도는 (반 · 날짜 · 교시)가 사실상의 열쇠다 — 같은 반 같은 날 같은 교시에 두 건이
 * 있으면 어느 쪽인지 알 수 없으므로 그때는 되묻는다.
 */
import type { AssistWriteOutcome } from '@domain/entities/AssistWrite';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';

import type { WriteSources } from './writeSources';
import { choice, date, matchOne, missing, squash, text } from './writeArgs';
import type { RawArgs } from './writeArgs';
import { fieldsOf, periodArg } from './writeTodoEvent';

const MEMO_COLORS = ['yellow', 'pink', 'green', 'blue'] as const;
const COLOR_LABEL: Readonly<Record<string, string>> = {
  yellow: '노랑',
  pink: '분홍',
  green: '초록',
  blue: '파랑',
};

const PROGRESS_STATUS = ['planned', 'completed', 'skipped'] as const;
const STATUS_LABEL: Readonly<Record<string, string>> = {
  planned: '예정',
  completed: '완료',
  skipped: '건너뜀',
};

/** 메모 내용은 길 수 있다. 미리보기에서는 앞부분만 보여준다(저장은 전문 그대로). */
function preview(content: string, max = 80): string {
  return content.length <= max ? content : `${content.slice(0, max)}…`;
}

// ─────────────────────────────── 메모 ───────────────────────────────

// 만들기는 기존 항목을 보지 않는다 — 그래서 `_src` 다. 표(WRITE_BUILDERS)가
// 모든 조립기를 같은 모양으로 부르므로 인자는 그대로 받아 둔다.
export function proposeCreateMemo(args: RawArgs, _src: WriteSources): AssistWriteOutcome {
  const content = text(args, 'content');
  if (content === undefined) return missing('메모 내용');

  const color = choice(args, 'color', MEMO_COLORS);

  return {
    tool: 'create_memo',
    action: 'create',
    title: '메모 추가',
    fields: fieldsOf([
      ['내용', preview(content)],
      ['색', color === undefined ? undefined : COLOR_LABEL[color]],
    ]),
    values: { content, ...(color === undefined ? {} : { color }) },
  };
}

export function proposeUpdateMemo(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 메모인지');
  const content = text(args, 'content');
  if (content === undefined) return missing('바꿀 메모 내용');

  const found = matchOne(src.memos, query, (m) => m.content, '메모');
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'update_memo',
    action: 'update',
    title: '메모 수정',
    target: { label: '지금', original: preview(found.item.content) },
    fields: [{ label: '바꿀 내용', value: preview(content) }],
    targetId: found.item.id,
    values: { content },
  };
}

export function proposeDeleteMemo(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 메모인지');

  const found = matchOne(src.memos, query, (m) => m.content, '메모');
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'delete_memo',
    action: 'delete',
    title: '메모 삭제',
    // ★메모는 제목이 없다. 지울 것의 내용을 그대로 보여줘야 무엇을 잃는지 알 수 있다.
    target: { label: '지울 메모', original: preview(found.item.content, 200) },
    fields: [],
    targetId: found.item.id,
    values: {},
  };
}

// ─────────────────────────────── 진도 ───────────────────────────────

/** 반 이름 → 반. 읽기 쪽과 같은 규칙(공백 무시 + 포함), 단 **여럿이면 고르지 않는다**. */
function findClass(
  src: WriteSources,
  name: string,
): { ok: true; id: string; name: string } | { ok: false; reason: string } {
  const found = matchOne(src.classes, name, (c) => c.name, '수업반');
  return found.ok
    ? { ok: true, id: found.item.id, name: found.item.name }
    : { ok: false, reason: found.reason };
}

/** (반 · 날짜 · 교시)로 진도 한 건을 찾는다. 진도의 사실상 열쇠다. */
function findProgress(
  src: WriteSources,
  classId: string,
  when: string,
  period: number,
): { ok: true; item: WriteSources['progress'][number] } | { ok: false; reason: string } {
  const hits = src.progress.filter(
    (p) => p.classId === classId && p.date === when && p.period === period,
  );
  // 교시 이름은 선생님이 붙인 것을 따른다("창체" 등) — 정본 함수에 맡긴다.
  const label = resolvePeriodLabel(period, src.periodTimes);
  if (hits.length === 0) {
    return { ok: false, reason: `${when} ${label}에 적어 둔 진도가 없어요.` };
  }
  if (hits.length > 1) {
    return {
      ok: false,
      reason: `${when} ${label}에 진도가 ${hits.length}건 있어요. 진도 화면에서 직접 골라 주세요.`,
    };
  }
  return { ok: true, item: hits[0]! };
}

export function proposeCreateProgress(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const className = text(args, 'className');
  if (className === undefined) return missing('어느 수업반인지');
  const cls = findClass(src, className);
  if (!cls.ok) return { reason: cls.reason };

  const when = date(args, 'date') ?? src.today;
  const period = periodArg(args, 'period');
  if (period === undefined) return missing('몇 교시인지');

  const unit = text(args, 'unit');
  if (unit === undefined) return missing('단원');

  const lesson = text(args, 'lesson') ?? '';
  const note = text(args, 'note') ?? '';
  const status = choice(args, 'status', PROGRESS_STATUS) ?? 'completed';

  // 같은 자리에 이미 있으면 새로 만들지 않는다 — 두 건이 겹치면 이후 수정·삭제가 막힌다.
  const existing = src.progress.find(
    (p) => p.classId === cls.id && p.date === when && p.period === period,
  );
  if (existing) {
    return {
      reason: `${when} ${resolvePeriodLabel(period, src.periodTimes)} ${cls.name} 진도는 이미 "${existing.unit}"으로 적혀 있어요. 고치려면 수정으로 말씀해 주세요.`,
    };
  }

  return {
    tool: 'create_progress',
    action: 'create',
    title: '진도 추가',
    fields: fieldsOf([
      ['수업반', cls.name],
      ['날짜', when],
      ['교시', resolvePeriodLabel(period, src.periodTimes)],
      ['단원', unit],
      ['차시', lesson.length > 0 ? lesson : undefined],
      ['상태', STATUS_LABEL[status]],
      ['메모', note.length > 0 ? preview(note) : undefined],
    ]),
    values: {
      classId: cls.id,
      date: when,
      period,
      unit,
      lesson,
      note,
      status,
      // 실행 뒤 문구에 쓸 교시 이름. 여기서 정본 함수로 한 번 만들어 실어 보낸다 —
      // 실행기가 다시 만들면 교시 이름 정본이 두 곳이 된다.
      periodLabel: resolvePeriodLabel(period, src.periodTimes),
    },
  };
}

export function proposeUpdateProgress(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const className = text(args, 'className');
  if (className === undefined) return missing('어느 수업반인지');
  const cls = findClass(src, className);
  if (!cls.ok) return { reason: cls.reason };

  const when = date(args, 'date');
  if (when === undefined) return missing('어느 날짜인지');
  const period = periodArg(args, 'period');
  if (period === undefined) return missing('몇 교시인지');

  const found = findProgress(src, cls.id, when, period);
  if (!found.ok) return { reason: found.reason };

  const unit = text(args, 'unit');
  const lesson = text(args, 'lesson');
  const note = text(args, 'note');
  const status = choice(args, 'status', PROGRESS_STATUS);

  if (unit === undefined && lesson === undefined && note === undefined && status === undefined) {
    return { reason: '무엇을 바꿀지 알 수 없어서 아무것도 하지 않았어요.' };
  }

  return {
    tool: 'update_progress',
    action: 'update',
    title: '진도 수정',
    target: {
      label: '지금',
      original:
        `${when} ${resolvePeriodLabel(period, src.periodTimes)} ${cls.name} · ${found.item.unit}`.trim(),
    },
    fields: fieldsOf([
      ['단원', unit],
      ['차시', lesson],
      ['상태', status === undefined ? undefined : STATUS_LABEL[status]],
      ['메모', note === undefined ? undefined : preview(note)],
    ]),
    targetId: found.item.id,
    values: {
      ...(unit === undefined ? {} : { unit }),
      ...(lesson === undefined ? {} : { lesson }),
      ...(note === undefined ? {} : { note }),
      ...(status === undefined ? {} : { status }),
    },
  };
}

export function proposeDeleteProgress(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const className = text(args, 'className');
  if (className === undefined) return missing('어느 수업반인지');
  const cls = findClass(src, className);
  if (!cls.ok) return { reason: cls.reason };

  const when = date(args, 'date');
  if (when === undefined) return missing('어느 날짜인지');
  const period = periodArg(args, 'period');
  if (period === undefined) return missing('몇 교시인지');

  const found = findProgress(src, cls.id, when, period);
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'delete_progress',
    action: 'delete',
    title: '진도 삭제',
    target: {
      label: '지울 진도',
      original:
        `${when} ${resolvePeriodLabel(period, src.periodTimes)} ${cls.name} · ${found.item.unit}`.trim(),
    },
    fields: fieldsOf([
      ['차시', found.item.lesson.length > 0 ? found.item.lesson : undefined],
      ['메모', found.item.note.length > 0 ? preview(found.item.note) : undefined],
    ]),
    targetId: found.item.id,
    values: {},
  };
}

export { preview, squash };
