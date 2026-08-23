/**
 * 쌤핀 AI — 메모·노트 목록·즐겨찾기 요약 (브릿지 동등화 Phase 1 슬라이스 2)
 *
 * ★여기서 지키는 것은 **오너 결정 두 건**이다.
 * ① 메모는 내용까지 보낸다(제목만 보내는 축소 금지). ② 즐겨찾기 주소는 도메인만 나간다.
 * 둘 다 "그렇게 하기로 했다"가 아니라 **테스트로 고정**해 둔다 — 다음 세션이 좋은 뜻으로
 * 축소하거나 되돌리는 것을 막는 자리다.
 */
import { describe, expect, it } from 'vitest';

import { summarizeBookmarks } from '../summarizeBookmarks';
import { summarizeMemos } from '../summarizeMemos';
import { summarizeNotes } from '../summarizeNotes';

const MEMOS = [
  { content: '내일 학년 회의 자료 뽑기', updatedAt: '2026-08-23T09:00:00.000Z', archived: false },
  { content: '2학기 수행평가 일정 정리', updatedAt: '2026-08-20T09:00:00.000Z', archived: false },
  { content: '지난 학기 메모', updatedAt: '2026-06-01T09:00:00.000Z', archived: true },
];

describe('summarizeMemos', () => {
  it('★내용을 그대로 보낸다 (오너 결정 ① — 제목만 보내는 축소 금지)', () => {
    const out = summarizeMemos(MEMOS);
    expect(out.items[0]?.content).toBe('내일 학년 회의 자료 뽑기');
  });

  it('최근에 고친 것부터, 보관함은 기본 제외', () => {
    const out = summarizeMemos(MEMOS);
    expect(out.total).toBe(2);
    expect(out.items.map((i) => i.updated)).toEqual(['2026-08-23', '2026-08-20']);
  });

  it('보관함도 달라고 하면 준다', () => {
    expect(summarizeMemos(MEMOS, { includeArchived: true }).total).toBe(3);
  });

  it('시각은 빼고 날짜만 나간다', () => {
    expect(summarizeMemos(MEMOS).items[0]?.updated).toBe('2026-08-23');
  });

  it('★한 건이 너무 길면 자르고 truncated 로 알린다 (서버 상한 4,000자)', () => {
    const out = summarizeMemos(
      [{ content: '가'.repeat(50), updatedAt: '2026-08-23', archived: false }],
      {
        maxContentChars: 10,
      },
    );
    expect(out.items[0]?.content).toBe(`${'가'.repeat(10)}…`);
    expect(out.truncated).toBe(true);
  });

  it('★전체 분량 상한에 걸려도 최소 한 건은 담는다 — 빈 카드보다 낫다', () => {
    const long = { content: '나'.repeat(100), updatedAt: '2026-08-23', archived: false };
    const out = summarizeMemos([long, long], { maxTotalChars: 10, maxContentChars: 100 });
    expect(out.items).toHaveLength(1);
    expect(out.truncated).toBe(true);
    expect(out.total).toBe(2);
  });
});

const NOTE_SRC = {
  notebooks: [
    { id: 'nb1', title: '3학년 수학', archived: false },
    { id: 'nb2', title: '작년 자료', archived: true },
  ],
  sections: [
    { id: 's1', notebookId: 'nb1', title: '수업 준비' },
    { id: 's2', notebookId: 'nb2', title: '옛 구역' },
    { id: 's3', notebookId: 'sold', title: '고아 구역' },
  ],
  pages: [
    { sectionId: 's1', title: '2단원 지도안', pinned: false, updatedAt: '2026-08-20T00:00:00Z' },
    { sectionId: 's1', title: '학년 회의록', pinned: true, updatedAt: '2026-08-01T00:00:00Z' },
    { sectionId: 's2', title: '작년 시험지', pinned: false, updatedAt: '2026-08-22T00:00:00Z' },
    { sectionId: 's3', title: '떠도는 페이지', pinned: false, updatedAt: '2026-08-23T00:00:00Z' },
  ],
};

describe('summarizeNotes', () => {
  it('★제목만 나간다 — 본문 필드가 아예 없다', () => {
    const out = summarizeNotes(NOTE_SRC);
    for (const item of out.items) {
      expect(Object.keys(item).sort()).toEqual([
        'notebook',
        'pinned',
        'section',
        'title',
        'updated',
      ]);
    }
  });

  it('고정한 페이지가 먼저, 그다음 최근 순', () => {
    const out = summarizeNotes(NOTE_SRC);
    expect(out.items.map((i) => i.title)).toEqual(['학년 회의록', '2단원 지도안']);
  });

  it('보관한 노트책은 기본 제외, 달라고 하면 준다', () => {
    expect(summarizeNotes(NOTE_SRC).total).toBe(2);
    expect(summarizeNotes(NOTE_SRC, { includeArchived: true }).total).toBe(3);
  });

  it('노트책이 사라진 고아 페이지는 담지 않는다', () => {
    const titles = summarizeNotes(NOTE_SRC, { includeArchived: true }).items.map((i) => i.title);
    expect(titles).not.toContain('떠도는 페이지');
  });

  it('노트책·구역 이름을 함께 준다 — 어디 것인지 말할 수 있어야 한다', () => {
    const first = summarizeNotes(NOTE_SRC).items[0];
    expect(first?.notebook).toBe('3학년 수학');
    expect(first?.section).toBe('수업 준비');
  });
});

const GROUPS = [
  { id: 'g1', name: '업무', archived: false },
  { id: 'g2', name: '작년', archived: true },
];

describe('summarizeBookmarks', () => {
  it('★주소는 도메인만 나간다 (오너 결정 ② — 경로·질의에 학번이 박힌다)', () => {
    const out = summarizeBookmarks(
      [
        {
          name: '나이스',
          url: 'https://neis.go.kr/students/detail?sid=20260315&name=%EA%B9%80',
          groupId: 'g1',
        },
      ],
      GROUPS,
    );

    expect(out.items[0]?.domain).toBe('neis.go.kr');
    expect(JSON.stringify(out)).not.toContain('sid=');
    expect(JSON.stringify(out)).not.toContain('students');
  });

  it('스킴 없는 주소도 도메인을 뽑는다 — 선생님이 자주 그렇게 넣는다', () => {
    const out = summarizeBookmarks(
      [{ name: '에듀파인', url: 'klef.go.kr/main', groupId: 'g1' }],
      GROUPS,
    );
    expect(out.items[0]?.domain).toBe('klef.go.kr');
  });

  it('★깨진 주소여도 카드가 죽지 않는다 — 빈 도메인으로 남긴다', () => {
    // 여기서 예외가 새면 카드가 통째로 사라지고, 선생님은 이유를 알 수 없는 빈 답을 본다.
    const out = summarizeBookmarks(
      [
        { name: '오타', url: 'a b c', groupId: 'g1' },
        { name: '빈칸', url: '   ', groupId: 'g1' },
        // 한글 주소는 예외가 아니라 punycode 도메인으로 해석된다 — 그래도 나가는 건 도메인뿐이다.
        { name: '한글', url: 'ㅁㄴㅇㄹ', groupId: 'g1' },
      ],
      GROUPS,
    );

    expect(out.items.map((i) => i.domain)).toEqual(['', '', 'xn--0pdgbv']);
    expect(out.items[0]?.name).toBe('오타');
  });

  it('사용자 정보(user:pass@)가 붙은 주소도 호스트만 남는다', () => {
    const out = summarizeBookmarks(
      [{ name: '내부망', url: 'https://teacher:pw1234@intra.school.kr/list', groupId: 'g1' }],
      GROUPS,
    );
    expect(out.items[0]?.domain).toBe('intra.school.kr');
    expect(JSON.stringify(out)).not.toContain('pw1234');
  });

  it('폴더는 주소가 없다', () => {
    const out = summarizeBookmarks(
      [{ name: '모음', url: '', groupId: 'g1', type: 'folder' }],
      GROUPS,
    );
    expect(out.items[0]?.domain).toBe('');
  });

  it('보관한 묶음은 기본 제외, 달라고 하면 준다', () => {
    const items = [
      { name: 'A', url: 'https://a.kr', groupId: 'g1' },
      { name: 'B', url: 'https://b.kr', groupId: 'g2' },
    ];
    expect(summarizeBookmarks(items, GROUPS).total).toBe(1);
    expect(summarizeBookmarks(items, GROUPS, { includeArchived: true }).total).toBe(2);
  });

  it('묶음 이름을 함께 준다', () => {
    const out = summarizeBookmarks([{ name: 'A', url: 'https://a.kr', groupId: 'g1' }], GROUPS);
    expect(out.items[0]?.group).toBe('업무');
  });
});
