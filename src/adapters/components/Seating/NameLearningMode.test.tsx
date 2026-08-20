// @vitest-environment jsdom
/**
 * NameLearningMode — "맞혀보기"(quiz) 모드 회귀 가드.
 *
 * 이 파일이 막는 결함 2가지 (둘 다 실제로 있었다):
 *
 * 1. **강조되지 않은 카드도 열렸다.** handleCardClick 이 `seatList[index]` 와 비교했는데
 *    index 가 곧 그 studentId 의 인덱스라 조건이 **항상 참**이었다. 그래서 아무 카드나 열리는데
 *    채점은 `seatList[currentIndex]`(강조된 학생)에 기록되어, 엉뚱한 카드를 열었는데
 *    화면 아래에는 다른 학생이 정답으로 뜨는 불일치가 생겼다.
 *
 * 2. **마지막 문제를 풀어도 끝났다는 신호가 없었다.** recordAnswer 가 채점 반영 전의
 *    `answers` 클로저를 읽어 remaining 계산이 한 틱 늦었고, 남은 문제가 0이 되는 분기 자체가 없어
 *    화면이 그대로 멈췄다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { SeatingData } from '@domain/entities/Seating';
import { NameLearningMode, type LearningStudentInfo } from './NameLearningMode';

afterEach(() => cleanup());

const STUDENTS: Record<string, LearningStudentInfo> = {
  s1: { studentNumber: 1, name: '강나영' },
  s2: { studentNumber: 2, name: '김가영' },
  s3: { studentNumber: 3, name: '김나연' },
  s4: { studentNumber: 4, name: '김드보라' },
};

const SEATING: SeatingData = {
  rows: 2,
  cols: 2,
  seats: [
    ['s1', 's2'],
    ['s3', 's4'],
  ],
};

function renderPanel() {
  return render(
    <NameLearningMode
      isOpen
      onClose={() => {}}
      seating={SEATING}
      resolveStudent={(id) => STUDENTS[id]}
    />,
  );
}

/** 좌석 카드 버튼만 추린다 (aria-label 이 "N행 M열, ..." 형태) */
function seatCards(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-label*="행 "]'));
}

/** 현재 문제로 강조된 카드 (ring-sp-warning) */
function highlighted(container: HTMLElement): HTMLButtonElement {
  const found = seatCards(container).find((b) => b.className.includes('ring-sp-warning'));
  if (!found) throw new Error('강조된 카드를 찾지 못했습니다');
  return found;
}

function enterQuizMode() {
  fireEvent.click(screen.getByRole('radio', { name: '맞혀보기' }));
}

describe('NameLearningMode — 맞혀보기 모드', () => {
  it('강조되지 않은 카드를 클릭해도 공개되지 않는다', () => {
    const { container } = renderPanel();
    enterQuizMode();

    const target = highlighted(container);
    const other = seatCards(container).find((b) => b !== target);
    expect(other).toBeTruthy();

    fireEvent.click(other!);

    // 클릭한 카드는 여전히 가려져 있어야 한다
    expect(other!.getAttribute('aria-label')).toContain('가려진 카드');
    expect(within(other!).queryByText('?')).toBeTruthy();
    // 채점 버튼(= 공개 단계)도 뜨면 안 된다
    expect(screen.queryByRole('button', { name: '맞춤' })).toBeNull();
    expect(screen.queryByRole('button', { name: '틀림' })).toBeNull();
  });

  it('강조된 카드를 클릭하면 공개되고 채점 버튼이 나타난다', () => {
    const { container } = renderPanel();
    enterQuizMode();

    fireEvent.click(highlighted(container));

    expect(screen.getByRole('button', { name: '맞춤' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '틀림' })).toBeTruthy();
  });

  it('마지막 문제까지 채점하면 결과 요약이 나타난다 (모든 학생이 정확히 1번씩 출제)', () => {
    const { container } = renderPanel();
    enterQuizMode();

    const asked: string[] = [];
    for (let i = 0; i < 4; i++) {
      const card = highlighted(container);
      asked.push(card.getAttribute('aria-label') ?? '');
      fireEvent.click(card);
      fireEvent.click(screen.getByRole('button', { name: '맞춤' }));
    }

    // 4명이 중복 없이 모두 출제됐어야 한다 (마지막 1명 누락 회귀 가드)
    expect(new Set(asked).size).toBe(4);
    expect(screen.getByText('4명 중 4명 맞혔어요')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 하기' })).toBeTruthy();
  });

  it('틀린 학생은 결과 요약에 이름으로 남는다', () => {
    const { container } = renderPanel();
    enterQuizMode();

    for (let i = 0; i < 4; i++) {
      fireEvent.click(highlighted(container));
      // 전부 틀림 처리
      fireEvent.click(screen.getByRole('button', { name: '틀림' }));
    }

    expect(screen.getByText('4명 중 0명 맞혔어요')).toBeTruthy();
    // 라벨(span)과 이름 목록이 같은 문단 안에 나뉘어 있으므로 문단 전체를 본다
    const summary = screen.getByText(/아직 못 외운 학생 4명/).closest('p');
    expect(summary).toBeTruthy();
    expect(summary!.textContent).toContain('강나영');
    expect(summary!.textContent).toContain('김드보라');
  });
});

describe('NameLearningMode — 모드별 시작 지점', () => {
  it('"순서" 모드는 학번이 가장 빠른 학생부터 시작한다', () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole('radio', { name: '순서' }));

    // 1번 강나영(1행 1열)이 첫 문제여야 한다.
    // quiz 와 currentIndex 를 공유하므로, 초기화를 랜덤으로 통일하면 이 단언이 깨진다.
    expect(highlighted(container).getAttribute('aria-label')).toContain('1번');
  });
});

describe('사진 기능 스위치 — 꺼져 있으면 "이름 쓰기"가 안 보인다', () => {
  /**
   * 얼굴 사진 기능은 수업반 지원·실기기 확인이 끝날 때까지 `FEATURE_FLAGS.studentPhotos`
   * 로 막아 둔다.
   *
   * 항목을 남겨 두면 눌러도 아무 일도 없는 버튼 옆에 "학생 사진이 있어야 써요" 안내만
   * 뜬다 — 선생님은 어디서 사진을 넣는지 찾다가 못 찾는다(넣는 입구도 함께 막혀 있으므로).
   *
   * ⚠️ **주변 환경(.env.local)에 기대지 않는다.**
   * 스위치 설명은 "개발·실기기 확인 중에는 .env.local 로 켜라"고 안내한다. 그 말대로 켠
   * 사람의 컴퓨터에서만 이 시험이 빨간불이 되면 안내와 그물이 서로 모순되고, 진짜 결함이
   * 아닌 빨간불에 익숙해진다. 그래서 값을 직접 갈아 끼워 **켠 상태와 끈 상태를 둘 다** 본다.
   */
  async function renderWithFlag(studentPhotos: boolean) {
    vi.doMock('@adapters/config/featureFlags', () => ({
      FEATURE_FLAGS: { studentPhotos },
    }));
    vi.resetModules();
    const mod = await import('./NameLearningMode');
    const Panel = mod.NameLearningMode;
    return render(
      <Panel isOpen onClose={() => {}} seating={SEATING} resolveStudent={(id) => STUDENTS[id]} />,
    );
  }

  afterEach(() => {
    vi.doUnmock('@adapters/config/featureFlags');
    vi.resetModules();
  });

  it('꺼져 있으면 모드 선택에 "이름 쓰기"가 없고 안내 문구도 뜨지 않는다', async () => {
    await renderWithFlag(false);

    expect(screen.queryByRole('radio', { name: '이름 쓰기' })).toBeNull();
    expect(screen.queryByText(/'이름 쓰기'는 학생 사진이 있어야 써요/)).toBeNull();

    // 나머지 3가지 모드는 그대로 있어야 한다 (같이 숨기면 이름 학습 자체가 망가진 것)
    expect(screen.getByRole('radio', { name: '자유' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '순서' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: '맞혀보기' })).toBeTruthy();
  });

  it('켜져 있으면 "이름 쓰기"가 보인다 — 사진을 안 넘겼으므로 잠긴 채로', async () => {
    await renderWithFlag(true);

    const radio = screen.getByRole('radio', { name: '이름 쓰기' }) as HTMLButtonElement;
    expect(radio.disabled).toBe(true);
    expect(screen.getByText(/'이름 쓰기'는 학생 사진이 있어야 써요/)).toBeTruthy();
  });
});
