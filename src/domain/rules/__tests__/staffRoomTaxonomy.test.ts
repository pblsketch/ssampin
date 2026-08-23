/**
 * 온라인 교무실 — 글 분류 규칙 테스트 (말머리·해시태그, 054)
 *
 * 여기서 지키는 것은 하나다 — **같은 뜻은 같은 값으로 모인다.**
 * `#체육대회` 와 `체육대회` 가 다른 태그로 갈리면 걸러 보기가 쓸모없어지고,
 * 그건 데이터가 쌓인 뒤에는 되돌리기 어렵다.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeStaffRoomCategoryName,
  normalizeStaffRoomTag,
  normalizeStaffRoomTags,
  splitStaffRoomTagInput,
  formatStaffRoomTag,
  STAFFROOM_CATEGORY_NAME_MAX_LENGTH,
  STAFFROOM_TAG_MAX_LENGTH,
  STAFFROOM_POST_MAX_TAGS,
} from '@domain/rules/staffRoomTaxonomy';

describe('말머리 이름', () => {
  it('앞뒤 공백을 정리한다', () => {
    expect(normalizeStaffRoomCategoryName('  공지  ')).toBe('공지');
  });

  it('감싼 대괄호를 한 겹 벗긴다 — 화면이 이미 칸으로 감싸므로', () => {
    expect(normalizeStaffRoomCategoryName('[공지]')).toBe('공지');
    expect(normalizeStaffRoomCategoryName(' [ 업무연락 ] ')).toBe('업무연락');
  });

  it('한쪽만 있는 괄호는 벗기지 않는다 — 이름의 일부일 수 있다', () => {
    expect(normalizeStaffRoomCategoryName('[공지')).toBe('[공지');
  });

  it('줄바꿈·탭은 공백 하나로 모은다 — 목록이 무너지지 않게', () => {
    expect(normalizeStaffRoomCategoryName('업무\n\t연락')).toBe('업무 연락');
  });

  it('빈 이름은 거부한다', () => {
    expect(normalizeStaffRoomCategoryName('')).toBeNull();
    expect(normalizeStaffRoomCategoryName('   ')).toBeNull();
    expect(normalizeStaffRoomCategoryName('[]')).toBeNull();
  });

  it('너무 긴 이름은 거부한다 — 자르지 않는다', () => {
    // 자르면 "학년부업무연락사"처럼 뜻이 뭉개진 이름이 조용히 저장된다.
    // 거부하고 화면이 알리는 편이 낫다.
    const tooLong = '가'.repeat(STAFFROOM_CATEGORY_NAME_MAX_LENGTH + 1);
    expect(normalizeStaffRoomCategoryName(tooLong)).toBeNull();
  });

  it('상한 길이는 통과시킨다 (경계값)', () => {
    const exact = '가'.repeat(STAFFROOM_CATEGORY_NAME_MAX_LENGTH);
    expect(normalizeStaffRoomCategoryName(exact)).toBe(exact);
  });
});

describe('해시태그 하나', () => {
  it('앞의 # 를 뗀다 — 붙인 사람과 안 붙인 사람이 갈리지 않게', () => {
    expect(normalizeStaffRoomTag('#체육대회')).toBe('체육대회');
    expect(normalizeStaffRoomTag('체육대회')).toBe('체육대회');
    expect(normalizeStaffRoomTag('##체육대회')).toBe('체육대회');
  });

  it('안쪽 공백까지 없앤다 — 띄어쓰기 습관으로 갈리지 않게', () => {
    expect(normalizeStaffRoomTag('체육 대회')).toBe('체육대회');
    expect(normalizeStaffRoomTag(' # 체육  대회 ')).toBe('체육대회');
  });

  it('쉼표는 태그 안에 남지 않는다 — 나누는 기호라서', () => {
    expect(normalizeStaffRoomTag('체육,대회')).toBe('체육대회');
  });

  it('# 만 적은 것은 거부한다', () => {
    expect(normalizeStaffRoomTag('#')).toBeNull();
    expect(normalizeStaffRoomTag('###')).toBeNull();
    expect(normalizeStaffRoomTag('  ')).toBeNull();
  });

  it('너무 긴 태그는 거부한다', () => {
    expect(normalizeStaffRoomTag('가'.repeat(STAFFROOM_TAG_MAX_LENGTH + 1))).toBeNull();
  });

  it('영문·숫자 섞인 태그도 그대로 쓴다', () => {
    expect(normalizeStaffRoomTag('#2학기')).toBe('2학기');
    expect(normalizeStaffRoomTag('#NEIS')).toBe('NEIS');
  });
});

describe('해시태그 여러 개', () => {
  it('다듬은 뒤에 견주어 중복을 없앤다', () => {
    expect(normalizeStaffRoomTags(['#체육대회', '체육대회', ' 체육 대회 '])).toEqual(['체육대회']);
  });

  it('못 쓰는 것만 빼고 나머지는 살린다 — 통째로 거부하지 않는다', () => {
    expect(normalizeStaffRoomTags(['#체육', '#', '', '준비물'])).toEqual(['체육', '준비물']);
  });

  it('적은 순서를 지킨다', () => {
    expect(normalizeStaffRoomTags(['다', '가', '나'])).toEqual(['다', '가', '나']);
  });

  it('개수 상한을 넘으면 앞에서부터 남긴다 — 글을 못 올리게 막지 않는다', () => {
    const many = Array.from({ length: STAFFROOM_POST_MAX_TAGS + 5 }, (_, i) => `태그${i}`);
    const result = normalizeStaffRoomTags(many);
    expect(result).toHaveLength(STAFFROOM_POST_MAX_TAGS);
    expect(result[0]).toBe('태그0');
  });

  it('빈 목록은 빈 목록', () => {
    expect(normalizeStaffRoomTags([])).toEqual([]);
  });
});

describe('한 줄로 적은 태그 쪼개기', () => {
  it('공백으로 나눈다', () => {
    expect(splitStaffRoomTagInput('#체육대회 #준비물')).toEqual(['체육대회', '준비물']);
  });

  it('쉼표로도 나눈다 — 어느 쪽 습관이든 통하게', () => {
    expect(splitStaffRoomTagInput('체육대회, 준비물,2학기')).toEqual([
      '체육대회',
      '준비물',
      '2학기',
    ]);
  });

  it('둘을 섞어 적어도 된다', () => {
    expect(splitStaffRoomTagInput('#체육대회, #준비물 2학기')).toEqual([
      '체육대회',
      '준비물',
      '2학기',
    ]);
  });

  it('빈 칸만 적으면 빈 목록', () => {
    expect(splitStaffRoomTagInput('   ')).toEqual([]);
    expect(splitStaffRoomTagInput('')).toEqual([]);
  });
});

describe('화면 표시', () => {
  it('보여줄 때만 # 를 붙인다 — 저장값에는 없다', () => {
    expect(formatStaffRoomTag('체육대회')).toBe('#체육대회');
  });

  it('다듬기 → 표시 를 거쳐도 # 가 겹치지 않는다', () => {
    const stored = normalizeStaffRoomTag('#체육대회');
    expect(formatStaffRoomTag(stored!)).toBe('#체육대회');
  });
});
