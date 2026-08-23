/**
 * 쌤핀 AI 쓰기 — 즐겨찾기(4) · 노트(5) 제안 만들기 (순수 함수)
 *
 * ★즐겨찾기 주소는 여기서 **전체 주소를 다룬다.** 읽기(`get_bookmarks`)가 도메인만
 * 내보낸 것은 *모델에게 나가는 것*을 줄이려는 결정이었고(오너 결정 ②), 여기서는
 * 선생님이 저장하려는 주소를 그대로 저장하는 것이 맞다. 미리보기에도 그대로 보여준다 —
 * 무엇이 저장되는지 감추면 확인이 되지 않는다.
 *
 * ★노트는 스토어가 "빈 것을 만들고 이름을 고치는" 두 걸음 구조다(`createPage` 는 제목을
 * 받지 않는다). 제안은 한 건이지만 실행기가 그 두 걸음을 밟는다 — 기존 저장 경로를
 * 그대로 쓰기 위해서다(새 경로를 만들지 않는다).
 */
import type { AssistWriteOutcome } from '@domain/entities/AssistWrite';

import type { WriteSources } from './writeSources';
import { matchOne, missing, text } from './writeArgs';
import type { RawArgs } from './writeArgs';
import { fieldsOf } from './writeTodoEvent';

// ───────────────────────────── 즐겨찾기 ─────────────────────────────

export function proposeCreateBookmark(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const name = text(args, 'name');
  if (name === undefined) return missing('즐겨찾기 이름');
  const url = text(args, 'url');
  if (url === undefined) return missing('주소');

  const groupName = text(args, 'group');
  let groupId = src.bookmarkGroups[0]?.id;
  let groupLabel = src.bookmarkGroups[0]?.name;

  if (groupName !== undefined) {
    const found = matchOne(src.bookmarkGroups, groupName, (g) => g.name, '즐겨찾기 묶음');
    if (!found.ok) return { reason: found.reason };
    groupId = found.item.id;
    groupLabel = found.item.name;
  }
  if (groupId === undefined) {
    return { reason: '즐겨찾기 묶음이 하나도 없어요. 묶음을 먼저 만들어 주세요.' };
  }

  return {
    tool: 'create_bookmark',
    action: 'create',
    title: '즐겨찾기 추가',
    fields: fieldsOf([
      ['이름', name],
      ['주소', url],
      ['묶음', groupLabel],
    ]),
    values: { name, url, groupId },
  };
}

export function proposeUpdateBookmark(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 즐겨찾기인지');

  const found = matchOne(src.bookmarks, query, (b) => b.name, '즐겨찾기');
  if (!found.ok) return { reason: found.reason };

  const name = text(args, 'name');
  const url = text(args, 'url');
  if (name === undefined && url === undefined) {
    return { reason: '무엇을 바꿀지 알 수 없어서 아무것도 하지 않았어요.' };
  }

  return {
    tool: 'update_bookmark',
    action: 'update',
    title: '즐겨찾기 수정',
    target: { label: '지금', original: `${found.item.name} (${found.item.url})` },
    fields: fieldsOf([
      ['이름', name],
      ['주소', url],
    ]),
    targetId: found.item.id,
    values: {
      ...(name === undefined ? {} : { name }),
      ...(url === undefined ? {} : { url }),
    },
  };
}

export function proposeDeleteBookmark(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 즐겨찾기인지');

  const found = matchOne(src.bookmarks, query, (b) => b.name, '즐겨찾기');
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'delete_bookmark',
    action: 'delete',
    title: '즐겨찾기 삭제',
    target: { label: '지울 즐겨찾기', original: `${found.item.name} (${found.item.url})` },
    fields: [],
    targetId: found.item.id,
    values: {},
  };
}

export function proposeCreateBookmarkGroup(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const name = text(args, 'name');
  if (name === undefined) return missing('묶음 이름');

  const already = src.bookmarkGroups.find((g) => g.name === name);
  if (already) return { reason: `"${name}" 묶음은 이미 있어요.` };

  const emoji = text(args, 'emoji');

  return {
    tool: 'create_bookmark_group',
    action: 'create',
    title: '즐겨찾기 묶음 추가',
    fields: fieldsOf([
      ['이름', name],
      ['아이콘', emoji],
    ]),
    values: { name, ...(emoji === undefined ? {} : { emoji }) },
  };
}

// ─────────────────────────────── 노트 ───────────────────────────────

export function proposeCreateNotebook(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const title = text(args, 'title');
  if (title === undefined) return missing('노트책 이름');

  if (src.notebooks.some((n) => n.title === title)) {
    return { reason: `"${title}" 노트책은 이미 있어요.` };
  }

  return {
    tool: 'create_notebook',
    action: 'create',
    title: '노트책 추가',
    fields: [{ label: '이름', value: title }],
    values: { title },
  };
}

export function proposeCreateNoteSection(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const notebookName = text(args, 'notebook');
  if (notebookName === undefined) return missing('어느 노트책인지');
  const title = text(args, 'title');
  if (title === undefined) return missing('구역 이름');

  const found = matchOne(src.notebooks, notebookName, (n) => n.title, '노트책');
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'create_note_section',
    action: 'create',
    title: '노트 구역 추가',
    fields: [
      { label: '노트책', value: found.item.title },
      { label: '구역 이름', value: title },
    ],
    targetId: found.item.id,
    values: { notebookId: found.item.id, title },
  };
}

export function proposeCreateNotePage(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const sectionName = text(args, 'section');
  if (sectionName === undefined) return missing('어느 구역인지');
  const title = text(args, 'title');
  if (title === undefined) return missing('페이지 제목');

  // 노트책을 함께 주면 그 안에서만 찾는다 — 구역 이름은 노트책마다 겹치기 쉽다("1학기" 등).
  const notebookName = text(args, 'notebook');
  let sections = src.noteSections;
  let notebookLabel: string | undefined;
  if (notebookName !== undefined) {
    const book = matchOne(src.notebooks, notebookName, (n) => n.title, '노트책');
    if (!book.ok) return { reason: book.reason };
    notebookLabel = book.item.title;
    sections = src.noteSections.filter((s) => s.notebookId === book.item.id);
  }

  const found = matchOne(sections, sectionName, (s) => s.title, '노트 구역');
  if (!found.ok) return { reason: found.reason };

  if (notebookLabel === undefined) {
    notebookLabel = src.notebooks.find((n) => n.id === found.item.notebookId)?.title;
  }

  return {
    tool: 'create_note_page',
    action: 'create',
    title: '노트 페이지 추가',
    fields: fieldsOf([
      ['노트책', notebookLabel],
      ['구역', found.item.title],
      ['제목', title],
    ]),
    targetId: found.item.id,
    values: { sectionId: found.item.id, title },
  };
}

export function proposeRenameNotePage(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 페이지인지');
  const title = text(args, 'title');
  if (title === undefined) return missing('바꿀 제목');

  const found = matchOne(src.notePages, query, (p) => p.title, '노트 페이지');
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'rename_note_page',
    action: 'update',
    title: '노트 페이지 이름 바꾸기',
    target: { label: '지금', original: found.item.title },
    fields: [{ label: '바꿀 제목', value: title }],
    targetId: found.item.id,
    values: { title },
  };
}

export function proposeDeleteNotePage(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 페이지인지');

  const found = matchOne(src.notePages, query, (p) => p.title, '노트 페이지');
  if (!found.ok) return { reason: found.reason };

  const section = src.noteSections.find((s) => s.id === found.item.sectionId);
  const notebook = src.notebooks.find((n) => n.id === section?.notebookId);

  return {
    tool: 'delete_note_page',
    action: 'delete',
    title: '노트 페이지 삭제',
    // ★본문은 모델에게 나간 적이 없고 여기서도 보여주지 않는다. 어디의 무엇인지만 밝힌다.
    target: { label: '지울 페이지', original: found.item.title },
    fields: fieldsOf([
      ['노트책', notebook?.title],
      ['구역', section?.title],
      ['주의', '페이지 안의 글도 함께 사라져요'],
    ]),
    targetId: found.item.id,
    values: {},
  };
}
