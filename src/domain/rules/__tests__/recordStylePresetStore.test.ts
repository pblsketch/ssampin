/** 「내 작성 방식」 목록 규칙 — ADR-099. */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RECORD_WRITING_STYLE,
  RECORD_STYLE_INSTRUCTION_MAX,
  RECORD_STYLE_PRESET_MAX,
  type RecordStylePreset,
} from '@domain/entities/RecordWritingStyle';
import { RECORD_FOCUSES } from '@domain/rules/recordStyleCatalog';
import {
  addPreset,
  duplicatePreset,
  normalizeStyle,
  removePreset,
  renamePreset,
  updatePresetStyle,
} from '@domain/rules/recordStylePresetStore';

const NOW = 1_700_000_000_000;
const style = { ...DEFAULT_RECORD_WRITING_STYLE, focus: 'feedbackRevise' as const };

function seed(n: number): RecordStylePreset[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `방식 ${i}`,
    style,
    catalogVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }));
}

describe('저장', () => {
  it('이름과 구성을 담아 저장한다', () => {
    const r = addPreset([], '국어 고쳐쓰기', style, NOW, 'id-1');
    expect(r.ok).toBe(true);
    expect(r.presets[0]?.name).toBe('국어 고쳐쓰기');
    expect(r.presets[0]?.style.focus).toBe('feedbackRevise');
  });

  it('빈 이름은 거절한다', () => {
    expect(addPreset([], '   ', style, NOW, 'x').error).toBe('empty-name');
  });

  it('같은 이름은 조용히 덮지 않고 거절한다', () => {
    const first = addPreset([], '내 방식', style, NOW, 'a').presets;
    expect(addPreset(first, '내 방식', style, NOW, 'b').error).toBe('duplicate-name');
    expect(first).toHaveLength(1);
  });

  it('상한을 넘기면 거절한다', () => {
    expect(addPreset(seed(RECORD_STYLE_PRESET_MAX), '더', style, NOW, 'z').error).toBe('full');
  });

  it('추가 지시는 상한까지만 남기고 빈 값은 칸 자체를 없앤다', () => {
    const long = 'ㄱ'.repeat(RECORD_STYLE_INSTRUCTION_MAX + 50);
    expect(normalizeStyle({ ...style, instruction: long }).instruction).toHaveLength(
      RECORD_STYLE_INSTRUCTION_MAX,
    );
    expect(normalizeStyle({ ...style, instruction: '   ' }).instruction).toBeUndefined();
  });
});

describe('고치기 · 복제 · 삭제', () => {
  it('구성을 지금 설정으로 바꾼다', () => {
    const list = addPreset([], 'A', style, NOW, 'a').presets;
    const r = updatePresetStyle(list, 'a', { ...style, focus: 'collaborate' }, NOW + 5);
    expect(r.presets[0]?.style.focus).toBe('collaborate');
    expect(r.presets[0]?.updatedAt).toBe(NOW + 5);
    expect(r.presets[0]?.createdAt).toBe(NOW);
  });

  it('이름을 바꾼다. 다른 항목과 겹치면 거절한다', () => {
    let list = addPreset([], 'A', style, NOW, 'a').presets;
    list = addPreset(list, 'B', style, NOW, 'b').presets;
    expect(renamePreset(list, 'a', 'B', NOW).error).toBe('duplicate-name');
    expect(renamePreset(list, 'a', 'C', NOW).presets[0]?.name).toBe('C');
    // 자기 이름 그대로 저장하는 것은 막지 않는다.
    expect(renamePreset(list, 'a', 'A', NOW).ok).toBe(true);
  });

  it('복제하면 이름이 겹치지 않게 번호가 올라간다', () => {
    let list = addPreset([], 'A', style, NOW, 'a').presets;
    list = duplicatePreset(list, 'a', NOW, 'a2').presets;
    expect(list[1]?.name).toBe('A (사본)');
    list = duplicatePreset(list, 'a', NOW, 'a3').presets;
    expect(list[2]?.name).toBe('A (사본 2)');
  });

  it('삭제한다. 없는 것을 지우라면 목록을 건드리지 않는다', () => {
    const list = addPreset([], 'A', style, NOW, 'a').presets;
    expect(removePreset(list, 'a').presets).toHaveLength(0);
    const miss = removePreset(list, 'none');
    expect(miss.error).toBe('not-found');
    expect(miss.presets).toBe(list);
  });
});

describe('기본 카탈로그는 무엇을 해도 안 바뀐다', () => {
  it('저장·복제·삭제 뒤에도 초점 10종이 그대로다', () => {
    const before = JSON.stringify(RECORD_FOCUSES);
    let list = addPreset([], 'A', style, NOW, 'a').presets;
    list = duplicatePreset(list, 'a', NOW, 'b').presets;
    list = removePreset(list, 'a').presets;
    expect(JSON.stringify(RECORD_FOCUSES)).toBe(before);
    expect(RECORD_FOCUSES).toHaveLength(7);
  });
});
