import { describe, it, expect } from 'vitest';
import type { Memo } from '@domain/entities/Memo';
import type { MemoImage } from '@domain/valueObjects/MemoImage';
import {
  SIDE_PIN_EMPTY_MEMO_LABEL,
  SIDE_PIN_MEMO_LABEL_MAX,
  deriveSidePinMemoLabel,
  deriveSidePinMemoPreview,
  selectSidePinMemos,
} from './SelectSidePinMemos';

function memo(overrides: Partial<Memo> & Pick<Memo, 'id'>): Memo {
  return {
    id: overrides.id,
    content: overrides.content ?? '내용',
    color: overrides.color ?? 'yellow',
    x: 0,
    y: 0,
    width: 280,
    height: 220,
    rotation: 0,
    createdAt: overrides.createdAt ?? '2026-08-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-08-01T00:00:00.000Z',
    archived: overrides.archived ?? false,
    fontSize: overrides.fontSize ?? 'base',
    ...(overrides.image !== undefined ? { image: overrides.image } : {}),
  };
}

const SAMPLE_IMAGE: MemoImage = {
  dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  fileName: 'photo.png',
  mimeType: 'image/png',
  width: 100,
  height: 100,
  originalSize: 1024,
};

describe('deriveSidePinMemoLabel', () => {
  it('첫 번째 줄을 제목처럼 쓴다', () => {
    expect(deriveSidePinMemoLabel('학부모 상담 준비\n3반 김철수')).toBe('학부모 상담 준비');
  });

  it('앞쪽 빈 줄은 건너뛰고 처음 내용 있는 줄을 찾는다', () => {
    expect(deriveSidePinMemoLabel('\n\n   \n진짜 첫 줄')).toBe('진짜 첫 줄');
  });

  it('앞뒤 공백을 제거한다', () => {
    expect(deriveSidePinMemoLabel('   여백 있는 줄   ')).toBe('여백 있는 줄');
  });

  it(`${SIDE_PIN_MEMO_LABEL_MAX}자에서 자른다`, () => {
    const long = '가'.repeat(100);
    expect(deriveSidePinMemoLabel(long)).toHaveLength(SIDE_PIN_MEMO_LABEL_MAX);
  });

  it('본문이 비어 있으면 "새 메모"', () => {
    expect(deriveSidePinMemoLabel('')).toBe(SIDE_PIN_EMPTY_MEMO_LABEL);
    expect(deriveSidePinMemoLabel('   \n\n  ')).toBe(SIDE_PIN_EMPTY_MEMO_LABEL);
  });
});

describe('deriveSidePinMemoPreview', () => {
  it('제목으로 쓴 줄 다음부터 최대 두 줄', () => {
    expect(deriveSidePinMemoPreview('제목\n둘째\n셋째\n넷째')).toBe('둘째\n셋째');
  });

  it('한 줄짜리 메모는 미리보기가 비어 있다', () => {
    expect(deriveSidePinMemoPreview('제목뿐')).toBe('');
  });

  it('빈 메모도 예외를 던지지 않는다', () => {
    expect(deriveSidePinMemoPreview('')).toBe('');
  });
});

describe('selectSidePinMemos', () => {
  it('최근 수정순으로 정렬한다', () => {
    const result = selectSidePinMemos({
      locked: false,
      memos: [
        memo({ id: '오래됨', updatedAt: '2026-08-01T00:00:00.000Z' }),
        memo({ id: '최신', updatedAt: '2026-08-12T00:00:00.000Z' }),
        memo({ id: '중간', updatedAt: '2026-08-05T00:00:00.000Z' }),
      ],
    });

    expect(result.map((m) => m.id)).toEqual(['최신', '중간', '오래됨']);
  });

  it('보관한 메모는 제외한다', () => {
    const result = selectSidePinMemos({
      locked: false,
      memos: [memo({ id: '살아있음' }), memo({ id: '보관됨', archived: true })],
    });

    expect(result.map((m) => m.id)).toEqual(['살아있음']);
  });

  it('개수를 자르지 않는다 — 옆핀 안에서 스크롤로 전부 볼 수 있어야 한다', () => {
    // 5개만 보여주고 나머지를 메인 쌤핀으로 넘기면, 메모 하나 찾으러 매번 본체를
    // 열어야 한다. "잠깐 확인하고 닫는다"는 목적이 무너진다.
    const memos = Array.from({ length: 12 }, (_, i) =>
      memo({ id: `m${i}`, updatedAt: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` }),
    );

    expect(selectSidePinMemos({ locked: false, memos })).toHaveLength(12);
  });

  it('개수를 직접 지정할 수 있다', () => {
    const memos = [memo({ id: 'a' }), memo({ id: 'b' }), memo({ id: 'c' })];
    expect(selectSidePinMemos({ locked: false, memos, limit: 2 })).toHaveLength(2);
    expect(selectSidePinMemos({ locked: false, memos, limit: 0 })).toEqual([]);
  });

  it('원본 배열의 순서를 바꾸지 않는다', () => {
    const memos = [
      memo({ id: '오래됨', updatedAt: '2026-08-01T00:00:00.000Z' }),
      memo({ id: '최신', updatedAt: '2026-08-12T00:00:00.000Z' }),
    ];
    selectSidePinMemos({ locked: false, memos });

    expect(memos.map((m) => m.id)).toEqual(['오래됨', '최신']);
  });

  it('메모가 없으면 빈 목록', () => {
    expect(selectSidePinMemos({ locked: false, memos: [] })).toEqual([]);
  });

  it('제목·미리보기·이미지 여부를 함께 만든다', () => {
    const result = selectSidePinMemos({
      locked: false,
      memos: [
        memo({
          id: 'm1',
          content: '상담 메모\n김철수 학부모\n다음 주 화요일',
          color: 'blue',
          image: SAMPLE_IMAGE,
        }),
      ],
    });

    expect(result[0]).toEqual({
      id: 'm1',
      label: '상담 메모',
      preview: '김철수 학부모\n다음 주 화요일',
      color: 'blue',
      updatedAt: '2026-08-01T00:00:00.000Z',
      hasImage: true,
    });
  });

  describe('잠금 상태', () => {
    it('내용을 아예 만들지 않는다 — 화면에서 가리는 게 아니라 값 자체를 안 보낸다', () => {
      const result = selectSidePinMemos({
        locked: true,
        memos: [
          memo({
            id: 'm1',
            content: '3반 김철수 학부모 상담 내용',
            image: SAMPLE_IMAGE,
          }),
        ],
      });

      expect(result[0]?.label).toBe('');
      expect(result[0]?.preview).toBe('');
      expect(result[0]?.hasImage).toBe(false);
    });

    it('잠겨 있어도 목록 자체는 유지된다 — 잠김 표시를 그릴 수 있어야 한다', () => {
      const result = selectSidePinMemos({
        locked: true,
        memos: [memo({ id: 'a' }), memo({ id: 'b' })],
      });

      expect(result).toHaveLength(2);
    });

    it('어떤 항목에도 원본 본문이 남지 않는다', () => {
      const secret = '학부모 연락처 010-0000-0000';
      const result = selectSidePinMemos({
        locked: true,
        memos: [memo({ id: 'a', content: secret })],
      });

      expect(JSON.stringify(result)).not.toContain('010-0000-0000');
    });
  });
});

describe('메모 찾기', () => {
  it('본문 아래쪽에 있는 말도 찾는다 — 첫 줄만 보면 있는 메모를 없다고 말한다', () => {
    const items = selectSidePinMemos({
      memos: [memo({ id: 'a', content: '3월 학년 회의\n장소는 시청각실\n준비물 명렬표' })],
      locked: false,
      query: '명렬표',
    });

    expect(items).toHaveLength(1);
  });

  it('대소문자를 가리지 않는다', () => {
    const items = selectSidePinMemos({
      memos: [memo({ id: 'a', content: 'Zoom 링크 정리' })],
      locked: false,
      query: 'zoom',
    });

    expect(items).toHaveLength(1);
  });

  it('걸리지 않은 메모는 뺀다', () => {
    const items = selectSidePinMemos({
      memos: [memo({ id: 'a', content: '학년 회의' }), memo({ id: 'b', content: '급식 신청' })],
      locked: false,
      query: '급식',
    });

    expect(items.map((item) => item.id)).toEqual(['b']);
  });

  it('찾는 말이 공백뿐이면 거르지 않는다', () => {
    const items = selectSidePinMemos({
      memos: [memo({ id: 'a', content: '학년 회의' }), memo({ id: 'b', content: '급식 신청' })],
      locked: false,
      query: '   ',
    });

    expect(items).toHaveLength(2);
  });

  it('걸린 줄을 미리보기로 보여준다 — 왜 나왔는지 보여야 고를 수 있다', () => {
    const [item] = selectSidePinMemos({
      memos: [memo({ id: 'a', content: '3월 학년 회의\n장소는 시청각실\n준비물 명렬표' })],
      locked: false,
      query: '명렬표',
    });

    expect(item?.preview).toContain('준비물 명렬표');
  });

  it('잠겨 있으면 찾는 말을 무시한다 — 개수만으로 내용이 새어 나간다', () => {
    // 내용을 지우면서 걸러 주기까지 하면, 남은 개수가 "그 낱말이 든 메모 수"가 된다.
    const items = selectSidePinMemos({
      memos: [memo({ id: 'a', content: '학년 회의' }), memo({ id: 'b', content: '급식 신청' })],
      locked: true,
      query: '급식',
    });

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.label === '')).toBe(true);
  });
});
