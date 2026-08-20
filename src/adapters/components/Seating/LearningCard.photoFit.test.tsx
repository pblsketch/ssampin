// @vitest-environment jsdom
/**
 * 얼굴 사진은 **자르지 않는다.**
 *
 * ## 실제 신고 (2026-08-20)
 *
 * "어떤 학생은 얼굴이 옆으로 퍼져서 보인다."
 * 원인은 사진을 3:4 칸에 `object-cover` 로 채운 것이었다. cover 는 비율을 지키는 대신
 * **넘치는 부분을 잘라 낸다.** 나이스 사진은 학생마다 원본 비율이 달라(정사각·가로형이 섞임)
 * 3:4 가 아닌 사진은 얼굴이 확대되어 테두리까지 꽉 차고, 이마·턱이 잘려 퍼져 보였다.
 *
 * 얼굴을 익히는 기능에서 얼굴이 잘리거나 왜곡되면 학습 자체가 어긋난다.
 * 그래서 `object-contain` 으로 **통째로** 보여 준다(남는 자리는 여백).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { LearningCard } from './LearningCard';

afterEach(() => cleanup());

describe('얼굴 사진 표시', () => {
  it('★사진을 자르지 않는다 (object-cover 는 얼굴을 잘라 낸다)', () => {
    const { container } = render(
      <LearningCard
        studentNumber={1}
        studentName="강나영"
        photoUrl="blob:x"
        revealed={false}
        highlighted={false}
        onClick={() => {}}
      />,
    );
    // alt="" 라 role 이 img 가 아니다(장식용으로 읽힌다) — 태그로 찾는다
    const img = container.querySelector('img')!;
    expect(img.className).toContain('object-contain');
    expect(img.className).not.toContain('object-cover');
  });

  it('사진이 없으면 이미지 자체가 없다 (빈 칸에 깨진 사진이 뜨지 않게)', () => {
    const { container } = render(
      <LearningCard
        studentNumber={1}
        studentName="강나영"
        revealed={false}
        highlighted={false}
        onClick={() => {}}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
