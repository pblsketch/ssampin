// @vitest-environment jsdom
/**
 * NameLearningMode — "이름 쓰기"(주관식) 모드 회귀 가드.
 *
 * 이 파일이 고정하는 것:
 *
 * 1. **한글 입력 조합 중의 Enter 가 제출로 새지 않는다.**
 *    한글은 타이핑 중 글자가 조합되는데, `김`을 치는 도중 Enter 를 누르면
 *    조합을 끝내는 Enter 가 제출 Enter 로 같이 먹혀서 **아직 다 못 쓴 이름이 채점된다.**
 *    실기기에서만 드러나는 고전적 사고라 여기서 구조적으로 막아 둔다.
 *
 * 2. **채점은 완전 일치만 정답** — 한 글자만 달라도 오답이고 재시도가 없다(오너 확정).
 *
 * 3. **사진이 없으면 이 모드를 못 쓴다** — 사진 보고 이름 맞히기가 성립하지 않기 때문.
 *
 * ⚠️ 이 파일은 **사진 기능이 켜진 상태**를 검사한다. 지금 앱은 수업반 사진 지원이 끝날 때까지
 * `FEATURE_FLAGS.studentPhotos = false` 로 나가므로(출시 보류), 여기서 켠 값으로 바꿔 둔다.
 * 안 그러면 "이름 쓰기" 항목이 화면에 아예 없어 이 가드가 통째로 죽는다.
 * 꺼진 상태의 가드는 `NameLearningMode.test.tsx` 에 따로 있다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@adapters/config/featureFlags', () => ({
  FEATURE_FLAGS: { inlineAutosave: true, studentPhotos: true },
}));

import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { SeatingData } from '@domain/entities/Seating';
import { NameLearningMode, type LearningStudentInfo } from './NameLearningMode';

afterEach(() => cleanup());

const STUDENTS: Record<string, LearningStudentInfo> = {
  s1: { studentNumber: 1, name: '강나영' },
  s2: { studentNumber: 2, name: '김가영' },
};

const SEATING: SeatingData = {
  rows: 1,
  cols: 2,
  seats: [['s1', 's2']],
};

const PHOTOS = new Map<string, string>([
  ['s1', 'blob:photo-1'],
  ['s2', 'blob:photo-2'],
]);

function renderPanel(photoUrls?: ReadonlyMap<string, string>) {
  return render(
    <NameLearningMode
      isOpen
      onClose={() => {}}
      seating={SEATING}
      resolveStudent={(id) => STUDENTS[id]}
      {...(photoUrls ? { photoUrls } : {})}
    />,
  );
}

function enterWriteMode() {
  fireEvent.click(screen.getByRole('radio', { name: '이름 쓰기' }));
}

/** 지금 출제된 학생의 이름 (큰 카드의 사진 src 로 판별) */
function currentAnswerName(container: HTMLElement): string {
  const img = container.querySelector<HTMLImageElement>('img[src^="blob:"]');
  if (!img) throw new Error('출제된 사진을 찾지 못했습니다');
  const id = img.src.endsWith('photo-1') ? 's1' : 's2';
  return STUDENTS[id]!.name;
}

function input(): HTMLInputElement {
  return screen.getByLabelText('이름 입력') as HTMLInputElement;
}

describe('이름 쓰기 — 사진이 없으면 쓸 수 없다', () => {
  it('사진이 하나도 없으면 모드 버튼이 비활성이고 이유를 알려 준다', () => {
    renderPanel();
    const radio = screen.getByRole('radio', { name: '이름 쓰기' }) as HTMLButtonElement;
    expect(radio.disabled).toBe(true);
    expect(screen.getByText(/'이름 쓰기'는 학생 사진이 있어야 써요/)).toBeTruthy();
  });

  it('사진이 있으면 모드 버튼이 열린다', () => {
    renderPanel(PHOTOS);
    const radio = screen.getByRole('radio', { name: '이름 쓰기' }) as HTMLButtonElement;
    expect(radio.disabled).toBe(false);
  });
});

describe('이름 쓰기 — 채점', () => {
  it('정확히 맞히면 정답으로 처리한다', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();

    const answer = currentAnswerName(container);
    fireEvent.change(input(), { target: { value: answer } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(screen.getByText('정답이에요!')).toBeTruthy();
  });

  it('띄어쓰기만 다르면 정답으로 인정한다', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();

    const answer = currentAnswerName(container);
    fireEvent.change(input(), { target: { value: ` ${answer} ` } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(screen.getByText('정답이에요!')).toBeTruthy();
  });

  it('★한 글자만 달라도 오답이고, 정답을 보여 준다 (재시도 없음)', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();

    const answer = currentAnswerName(container);
    fireEvent.change(input(), { target: { value: '틀린이름' } });
    fireEvent.keyDown(input(), { key: 'Enter' });

    // 다시 입력할 기회를 주지 않고 정답을 공개한다
    expect(screen.getByText(new RegExp(`^정답: .*${answer}$`))).toBeTruthy();
  });
});

describe('이름 쓰기 — 한글 입력 조합 (실기기 사고 방지)', () => {
  it('★조합 중(compositionstart 이후)에는 Enter 를 눌러도 채점되지 않는다', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();
    const answer = currentAnswerName(container);

    const field = input();
    fireEvent.compositionStart(field);
    // 아직 조합이 끝나지 않은 상태에서 Enter — 여기서 제출되면 미완성 이름이 채점된다
    fireEvent.change(field, { target: { value: answer.slice(0, 1) } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.queryByText('정답이에요!')).toBeNull();
    expect(screen.queryByText(/^정답: /)).toBeNull();
  });

  it('★브라우저가 isComposing 을 보고해도 채점되지 않는다', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();
    const answer = currentAnswerName(container);

    const field = input();
    fireEvent.change(field, { target: { value: answer } });
    fireEvent.keyDown(field, { key: 'Enter', isComposing: true });

    expect(screen.queryByText('정답이에요!')).toBeNull();
    expect(screen.queryByText(/^정답: /)).toBeNull();
  });

  it('조합이 끝난 뒤(compositionend) Enter 는 정상 채점된다', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();
    const answer = currentAnswerName(container);

    const field = input();
    fireEvent.compositionStart(field);
    fireEvent.change(field, { target: { value: answer } });
    fireEvent.compositionEnd(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getByText('정답이에요!')).toBeTruthy();
  });
});

describe('이름 쓰기 — 도움 장치', () => {
  it('초성 보기를 누르면 초성이 나온다 (정답은 알려 주지 않는다)', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();
    const answer = currentAnswerName(container);

    fireEvent.click(screen.getByRole('button', { name: '초성 보기' }));

    // 강나영 → ㄱㄴㅇ / 김가영 → ㄱㄱㅇ
    const expected = answer === '강나영' ? 'ㄱㄴㅇ' : 'ㄱㄱㅇ';
    expect(screen.getByText(expected)).toBeTruthy();
    // 정답 이름 자체가 노출되면 안 된다
    expect(screen.queryByText(answer)).toBeNull();
  });

  it('모르겠어요를 누르면 오답 처리하고 정답을 보여 준다', () => {
    const { container } = renderPanel(PHOTOS);
    enterWriteMode();
    const answer = currentAnswerName(container);

    fireEvent.click(screen.getByRole('button', { name: '모르겠어요' }));

    expect(screen.getByText(new RegExp(`^정답: .*${answer}$`))).toBeTruthy();
  });
});
