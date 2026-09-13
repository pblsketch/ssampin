import { describe, expect, it } from 'vitest';
import { aiDraftText } from '../../entities/RecordAiDraft';
import {
  markedNarrativeText,
  narrativeSceneOrderError,
  narrativeSceneOrderOf,
  normalizeGeneratedRecordText,
  parseGeneratedNarrativeParagraphs,
  parseNarrativeParagraphs,
  roleMarksOf,
  renumberNarrativeScenes,
  type NarrativeRole,
} from '../narrativeParagraphs';
import { alignParagraphsToScenes } from '../narrativeComposition';

describe('지도 장면 순서로 생성 결과 확인', () => {
  it.each<readonly NarrativeRole[]>([
    ['evaluation', 'motive', 'process', 'result'],
    ['motive', 'process', 'result', 'evaluation'],
    ['motive', 'process', 'evaluation', 'result', 'process'],
  ])('평가의 위치와 반복 장면을 그대로 보존한다: %s', (...roles) => {
    const expected = roles.map((role, i) => ({ role, sceneIndex: i + 1 }));
    const paragraphs = expected.map((p) => ({ ...p, text: `${p.sceneIndex}번 내용.` }));
    const restored = parseGeneratedNarrativeParagraphs(markedNarrativeText(paragraphs));
    expect(narrativeSceneOrderError(restored, expected)).toBeNull();
    expect(restored).toEqual(paragraphs);
    expect(narrativeSceneOrderOf(restored)).toEqual(expected);
    expect(roleMarksOf(restored)).toEqual(paragraphs);
    expect(aiDraftText({ paragraphs: restored })).not.toContain('[장면');
  });

  const expected = [
    { sceneIndex: 1, role: 'process' as const },
    { sceneIndex: 2, role: 'result' as const },
    { sceneIndex: 3, role: 'process' as const },
  ];

  it('같은 과정 역할끼리 뒤집힌 번호를 역할만 보고 통과시키지 않는다', () => {
    const paragraphs = parseGeneratedNarrativeParagraphs(
      '[장면 3] [과정] 발표함.\n\n[장면 1] [과정] 조사함.',
    );
    expect(narrativeSceneOrderError(paragraphs, expected)).toContain('저장하지 않았습니다');
  });

  it.each([
    '[과정] 조사함.',
    '[장면 1] [결과] 조사함.',
    '[장면 9] [과정] 조사함.',
    '[장면 1] [과정] 조사함.\n\n[장면 1] [과정] 다시 조사함.',
    '[장면 1] [과정] 조사함.\n\n[장면 2] 표식을 빠뜨린 내용.',
  ])('누락, 위조, 중복 표식은 순서를 추측하지 않는다', (raw) => {
    expect(
      narrativeSceneOrderError(parseGeneratedNarrativeParagraphs(raw), expected),
    ).not.toBeNull();
  });

  it('근거 없는 중간 장면은 생략하되 남은 번호로 실제 위치를 찾는다', () => {
    const paragraphs = parseGeneratedNarrativeParagraphs('[장면 3] [과정] 발표함.');
    expect(narrativeSceneOrderError(paragraphs, expected)).toBeNull();
    expect(
      alignParagraphsToScenes(
        paragraphs,
        expected.map((p) => p.role),
      ),
    ).toEqual([2]);
  });
});

describe('생성 본문 나열 기호', () => {
  it('여러 가운데 점을 쉼표로 바꾸고 소수점, 인용문, 원문은 보존한다', () => {
    const original = '[과정] PLA·PHAㆍPBAT, 온도 58.5도를 비교하고 “원료・조건‧한계”를 적음.';
    expect(parseNarrativeParagraphs(original)[0]?.text).toContain('PLA·PHAㆍPBAT');
    const generated = parseGeneratedNarrativeParagraphs(original);
    expect(generated[0]?.text).toBe(
      'PLA, PHA, PBAT, 온도 58.5도를 비교하고 “원료, 조건, 한계”를 적음.',
    );
    expect(normalizeGeneratedRecordText(generated[0]?.text ?? '')).toBe(generated[0]?.text);
    expect(original).toContain('PLA·PHAㆍPBAT');
  });
});

describe('여러 초안을 뒤에 붙인 본문', () => {
  it('각 판의 중복 번호를 합친 본문 차례로 바꾸고 역할 없는 앞글도 보존한다', () => {
    const joined = renumberNarrativeScenes([
      { role: null, text: '직접 적은 앞글.' },
      { sceneIndex: 1, role: 'process', text: '자료 조사함.' },
      { sceneIndex: 1, role: 'process', text: '발표 질문에 답함.' },
    ]);
    expect(joined.map((p) => p.sceneIndex)).toEqual([1, 2, 3]);
    const restored = parseGeneratedNarrativeParagraphs(markedNarrativeText(joined));
    expect(restored).toEqual(joined);
    expect(restored[0]?.role).toBeNull();
    expect(narrativeSceneOrderError(restored, narrativeSceneOrderOf(joined))).toBeNull();
  });
});
