// @vitest-environment jsdom
/**
 * "매칭하기" 모드 — 왼쪽 얼굴 하나, 오른쪽 명단에서 이름 고르기.
 *
 * ## 이 파일이 막는 것
 *
 * 이 모드의 조용한 실패는 눈으로 안 잡힌다.
 * - 한 학생이 두 번 출제되거나(명단이 안 줄어듦)
 * - 이미 짝지은 이름을 또 고를 수 있거나
 * - 채점이 끝났는데 다른 이름이 눌리거나
 * 셋 다 화면은 멀쩡해 보이는데 학습이 망가진다.
 *
 * ⚠️ 규칙을 여기서 다시 구현하지 않는다 — 실제 컴포넌트를 눌러서 확인한다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { SeatingData } from '@domain/entities/Seating';

vi.mock('@adapters/config/featureFlags', () => ({
  FEATURE_FLAGS: { studentPhotos: true },
}));

const { NameLearningMode } = await import('./NameLearningMode');

const STUDENTS: Record<string, { studentNumber: number; name: string }> = {
  s1: { studentNumber: 1, name: '강나영' },
  s2: { studentNumber: 2, name: '김가영' },
  s3: { studentNumber: 3, name: '박지효' },
};
const SEATING: SeatingData = {
  rows: 1,
  cols: 3,
  seats: [['s1', 's2', 's3']],
} as unknown as SeatingData;

const PHOTOS = new Map([
  ['s1', 'blob:1'],
  ['s2', 'blob:2'],
  ['s3', 'blob:3'],
]);

beforeEach(() => {
  // 문제 순서를 고정한다 — 안 그러면 어떤 얼굴이 나왔는지 알 수 없어 채점을 검사할 수 없다
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

function openMatchMode(photoUrls: ReadonlyMap<string, string> | undefined = PHOTOS) {
  const view = render(
    <NameLearningMode
      isOpen
      onClose={() => {}}
      seating={SEATING}
      resolveStudent={(id) => STUDENTS[id]}
      {...(photoUrls ? { photoUrls } : {})}
    />,
  );
  const radio = screen.queryByRole('radio', { name: '매칭하기' }) as HTMLButtonElement | null;
  if (radio && !radio.disabled) fireEvent.click(radio);
  return view;
}

/** 오른쪽 명단의 이름 버튼들 (모드 라디오·헤더 버튼과 섞이지 않게 목록 안에서만 찾는다) */
function optionButtons(): HTMLButtonElement[] {
  const list = screen.getByText('이 얼굴의 이름을 명단에서 골라 주세요.').parentElement!;
  return Array.from(within(list).getAllByRole('button')) as HTMLButtonElement[];
}

/**
 * 진행률 문구를 통째로 읽는다.
 *
 * 숫자가 바뀔 때 짧게 굴러 올라가는 연출(2026-08-20) 때문에 숫자만 별도 요소로 감쌌다.
 * 그래서 `getByText('1/3명 짝지음 …')` 처럼 한 요소에서 문장 전체를 찾을 수 없다.
 * 검사하는 내용은 그대로 두고, 읽는 방법만 컨테이너 기준으로 바꾼다.
 */
function progressText(): string {
  const region = document.querySelector('[aria-live="polite"][aria-atomic="true"]');
  return (region?.textContent ?? '').replace(/\s+/g, ' ');
}

describe('매칭하기 모드', () => {
  it('사진이 있으면 모드를 고를 수 있고, 왼쪽 얼굴과 오른쪽 명단이 함께 뜬다', () => {
    openMatchMode();
    expect(screen.getByText('이 얼굴의 이름을 명단에서 골라 주세요.')).toBeTruthy();
    expect(optionButtons().map((b) => b.textContent)).toEqual(['01강나영', '02김가영', '03박지효']);
  });

  it('★사진이 하나도 없으면 모드 자체가 잠긴다 (얼굴 없이는 성립하지 않는 모드)', () => {
    render(
      <NameLearningMode
        isOpen
        onClose={() => {}}
        seating={SEATING}
        resolveStudent={(id) => STUDENTS[id]}
      />,
    );
    const radio = screen.getByRole('radio', { name: '매칭하기' }) as HTMLButtonElement;
    expect(radio.disabled).toBe(true);
  });

  it('★맞는 이름을 고르면 정답으로 채점된다', () => {
    openMatchMode(); // Math.random=0 → 첫 학생(강나영)이 문제
    fireEvent.click(optionButtons()[0]!); // 강나영
    expect(screen.getByText('맞았어요!')).toBeTruthy();
    expect(progressText()).toContain('1/3명 짝지음 · 정답 1');
  });

  it('★틀린 이름을 고르면 정답이 무엇이었는지 알려 준다', () => {
    openMatchMode();
    fireEvent.click(optionButtons()[1]!); // 김가영 (정답은 강나영)
    expect(screen.getByText('정답: 1번 강나영')).toBeTruthy();
    expect(progressText()).toContain('1/3명 짝지음 · 정답 0');
  });

  it('★채점이 끝나면 다른 이름을 더 고를 수 없다 (재시도 없음)', () => {
    openMatchMode();
    fireEvent.click(optionButtons()[1]!); // 오답
    expect(optionButtons().every((b) => b.disabled)).toBe(true);

    // 다시 눌러도 점수가 바뀌지 않는다
    fireEvent.click(optionButtons()[0]!);
    expect(progressText()).toContain('1/3명 짝지음 · 정답 0');
  });

  it('★한 번 나온 학생은 명단에서 빠지고 다시 출제되지 않는다', () => {
    openMatchMode();
    fireEvent.click(optionButtons()[0]!); // 강나영 정답
    fireEvent.click(screen.getByRole('button', { name: '다음 →' }));

    // 강나영 줄은 잠겨 있고, 남은 후보는 둘
    const options = optionButtons();
    expect(options[0]!.disabled).toBe(true);
    expect(options.filter((b) => !b.disabled)).toHaveLength(2);
  });

  it('★세 명을 다 풀면 결과 요약이 뜬다 (끝났다는 신호가 있어야 한다)', () => {
    openMatchMode();
    for (let i = 0; i < 3; i++) {
      const next = optionButtons().find((b) => !b.disabled)!;
      fireEvent.click(next);
      fireEvent.click(screen.getByRole('button', { name: '다음 →' }));
    }
    expect(screen.getByText('3명 중 3명 맞혔어요')).toBeTruthy();
  });

  it('★틀린 학생만 다시 풀 수 있다', () => {
    openMatchMode();
    // 1번 문제(강나영)에 일부러 김가영을 골라 오답
    fireEvent.click(optionButtons()[1]!);
    fireEvent.click(screen.getByRole('button', { name: '다음 →' }));
    for (let i = 0; i < 2; i++) {
      const next = optionButtons().find((b) => !b.disabled)!;
      fireEvent.click(next);
      fireEvent.click(screen.getByRole('button', { name: '다음 →' }));
    }
    fireEvent.click(screen.getByRole('button', { name: /틀린 학생만 다시/ }));
    expect(progressText()).toContain('0/1명 짝지음');
  });

  it('모드를 바꿔도 다른 모드의 진행이 새어 들어가지 않는다', () => {
    openMatchMode();
    fireEvent.click(optionButtons()[0]!);
    fireEvent.click(screen.getByRole('radio', { name: '맞혀보기' }));
    fireEvent.click(screen.getByRole('radio', { name: '매칭하기' }));
    expect(progressText()).toContain('0/3명 짝지음 · 정답 0');
  });
});
