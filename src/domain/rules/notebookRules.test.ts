import { describe, expect, it } from 'vitest';
import { isDuplicateNotebookTitle, sortNotebooksForSidebar } from './notebookRules';

describe('notebookRules', () => {
  it('보관되지 않은 노트북만 사이드바 순서대로 정렬한다', () => {
    const sorted = sortNotebooksForSidebar([
      {
        id: '2',
        title: 'B',
        order: 2,
        createdAt: '',
        updatedAt: '',
        archived: false,
      },
      {
        id: '1',
        title: 'A',
        order: 1,
        createdAt: '',
        updatedAt: '',
        archived: false,
      },
      {
        id: '3',
        title: '숨김',
        order: 0,
        createdAt: '',
        updatedAt: '',
        archived: true,
      },
    ]);

    expect(sorted.map((notebook) => notebook.id)).toEqual(['1', '2']);
  });

  it('노트북 이름 중복을 대소문자와 공백 무시로 감지한다', () => {
    expect(
      isDuplicateNotebookTitle(
        [
          {
            id: '1',
            title: '  수업 노트 ',
            order: 0,
            createdAt: '',
            updatedAt: '',
            archived: false,
          },
        ],
        '수업 노트',
      ),
    ).toBe(true);
  });
});
