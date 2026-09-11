/**
 * 분량 조절의 계산 규칙 — 도메인 순수 함수.
 *
 * 여기서 지키는 것은 **숫자의 뜻**이다. 이 파일이 없으면 다음이 조용히 깨진다:
 *
 * 1. 별칭 보정의 **부호가 뒤집힌다** — 문구("실명본과 별칭본의 바이트 차이")만으로는
 *    반대로 구현해도 아무도 모른다. 뒤집히면 1차 시도가 늘 빗나간다.
 * 2. 목표 상한만 보정하고 **하한을 안 보정한다** — 지시문의 두 숫자가 서로 다른 기준이 된다.
 * 3. 한도를 넘긴 결과가 "맞음"으로 판정된다 — 미리보기는 통과하고 저장은 거부된다.
 * 4. 확인 안 된 한도(초등)가 강제 한도로 **승격된다** — 전에는 되던 입력이 막힌다.
 * 5. [뒤에 붙이기] 합산이 화면 코드와 어긋난다 — 같은 이유로 저장만 거부된다.
 * 6. `[근거 부족]` 표식이 **생기부 본문에 그대로 들어간다**.
 */
import { describe, it, expect } from 'vitest';
import {
  aliasByteDelta,
  appendedBytes,
  charsForBytes,
  clampTargetBytes,
  countSentences,
  defaultTargetBytes,
  goalFloor,
  isRichEvidence,
  isThinEvidence,
  judgeLength,
  modelFloorBytes,
  modelTargetBytes,
  needsAutoShrink,
  stripInsufficientMark,
  INSUFFICIENT_MARK,
} from '../recordLengthGoal';

describe('근거가 빈약한가 (ADR-110 보강 2 — 오너: 빈약하면 굳이 목표 바이트에 맞추지 않아도 된다)', () => {
  it('보내는 근거 글이 목표의 절반에 못 미치면 빈약하다 — 목표마다 기준이 따라 움직인다', () => {
    expect(isThinEvidence(749, 1500)).toBe(true);
    expect(isThinEvidence(750, 1500)).toBe(false);
    expect(isThinEvidence(1049, 2100)).toBe(true);
    expect(isThinEvidence(1050, 2100)).toBe(false);
    expect(isThinEvidence(374, 750)).toBe(true);
    expect(isThinEvidence(0, 1500)).toBe(true);
  });
});

describe('근거가 목표보다 많은가 (ADR-110 보강 3 — 오너: 다 담지 말고 핵심 근거 중심으로)', () => {
  it('근거 글만 모아도 목표를 넘으면 많다 — 목표마다 기준이 따라 움직이고, 빈약과 겹치지 않는다', () => {
    expect(isRichEvidence(1500, 1500)).toBe(false);
    expect(isRichEvidence(1501, 1500)).toBe(true);
    expect(isRichEvidence(2101, 2100)).toBe(true);
    expect(isRichEvidence(751, 750)).toBe(true);
    for (const bytes of [0, 400, 749, 750, 1000, 1500, 1501, 3000]) {
      expect(isThinEvidence(bytes, 1500) && isRichEvidence(bytes, 1500)).toBe(false);
    }
  });
});

describe('초안 자동 줄이기 기준과 모델에게 줄 숫자 (ADR-110)', () => {
  it('★목표의 110% 를 넘을 때만 자동으로 줄인다 — 1,500 이면 1,650 까지는 그대로(오너: 1,700 이상이 문제)', () => {
    expect(needsAutoShrink(1500, 1500)).toBe(false);
    expect(needsAutoShrink(1650, 1500)).toBe(false);
    expect(needsAutoShrink(1651, 1500)).toBe(true);
    expect(needsAutoShrink(1700, 1500)).toBe(true);
    expect(needsAutoShrink(825, 750)).toBe(false);
    expect(needsAutoShrink(826, 750)).toBe(true);
    // 진로 2,100 · 직접 정한 2,000 — 기준은 늘 **그 목표의** 110% 다(1,500 에 묶이지 않는다).
    expect(needsAutoShrink(2310, 2100)).toBe(false);
    expect(needsAutoShrink(2311, 2100)).toBe(true);
    expect(needsAutoShrink(2200, 2000)).toBe(false);
    expect(needsAutoShrink(2201, 2000)).toBe(true);
  });

  it('문장은 마침표·물음표·느낌표 뒤 공백으로 센다 — 소수점은 끊지 않는다', () => {
    expect(countSentences('자료를 모았다. 표로 정리했다. 발표했다.')).toBe(3);
    expect(countSentences('점수가 3.5점 올랐다. 왜 그랬을까? 끝!')).toBe(3);
    expect(countSentences('마침표 없는 글')).toBe(1);
    expect(countSentences('')).toBe(0);
  });

  it('바이트를 이 글의 공백 포함 글자 수로 옮긴다 — 3으로 나누면 공백만큼 적게 나온다', () => {
    const sample = '가나 다라.'; // 한글 4자(12B) + 공백(1B) + 마침표(1B) = 14B, 6자
    expect(charsForBytes(14, sample)).toBe(6);
    expect(charsForBytes(1400, sample)).toBe(600);
    // 글이 비었으면 한글 1자 = 3바이트로.
    expect(charsForBytes(300, '')).toBe(100);
  });
});

describe('목표 기본값과 하한', () => {
  it('기본 목표는 그 영역의 한도다', () => {
    expect(defaultTargetBytes('autonomy', 'high')).toBe(1500);
    expect(defaultTargetBytes('career', 'high')).toBe(2100);
  });

  it('하한은 목표의 95%다 (1,500 → 1,425)', () => {
    expect(goalFloor(1500)).toBe(1425);
    expect(goalFloor(2100)).toBe(1995);
  });
});

describe('★목표는 확인된 한도를 넘지 못한다', () => {
  it('한도 1,500 영역에서 2,000을 치면 1,500으로 잘린다', () => {
    expect(clampTargetBytes(2000, 'autonomy', 'high')).toBe(1500);
  });

  it('한도 안쪽 값은 그대로 둔다 (선생님이 더 짧게 쓰고 싶을 수 있다)', () => {
    expect(clampTargetBytes(1200, 'autonomy', 'high')).toBe(1200);
  });

  it('★확인되지 않은 한도(초등 교과학습발달상황)에서는 자르지 않는다', () => {
    // 확인 안 된 숫자로 선생님 입력을 막지 않는다는 기존 설계를 여기서도 지킨다.
    expect(clampTargetBytes(3000, 'subjectDev', 'elementary')).toBe(3000);
  });
});

describe('★분량 판정 — over-limit 을 가장 먼저 본다', () => {
  const base = { area: 'autonomy' as const, level: 'high' as const };

  it('한도를 넘으면 목표를 아무리 높게 잡아도 over-limit 이다', () => {
    // 목표를 한도보다 크게 넘겨도(부르는 쪽 실수) 한도가 이긴다.
    expect(judgeLength({ ...base, bytes: 1950, targetBytes: 2000 })).toBe('over-limit');
  });

  it('목표만 넘고 한도 이내면 over-goal 이다 (선생님이 고를 수 있다)', () => {
    expect(judgeLength({ ...base, bytes: 1400, targetBytes: 1200 })).toBe('over-goal');
  });

  it('하한에 못 미치면 under-goal, 하한과 목표 사이면 ok 다', () => {
    expect(judgeLength({ ...base, bytes: 1000, targetBytes: 1500 })).toBe('under-goal');
    expect(judgeLength({ ...base, bytes: 1425, targetBytes: 1500 })).toBe('ok');
    expect(judgeLength({ ...base, bytes: 1500, targetBytes: 1500 })).toBe('ok');
  });

  it('★확인 안 된 한도에서는 over-limit 이 구조적으로 나올 수 없다', () => {
    const v = judgeLength({
      area: 'subjectDev',
      level: 'elementary',
      bytes: 9000,
      targetBytes: 1500,
    });
    expect(v).not.toBe('over-limit');
    expect(v).toBe('over-goal');
  });
});

describe('★[뒤에 붙이기] 합산은 화면 코드와 글자 단위로 같다', () => {
  it('공백 한 칸으로 잇는다 (빈 줄이 아니다)', () => {
    // `${base.trim()} ${text}` 와 같아야 한다.
    expect(appendedBytes('앞글.', '뒷글.')).toBe(appendedBytes('  앞글.  ', '뒷글.'));
    expect(appendedBytes('가', '나')).toBe(3 + 1 + 3);
  });

  it('앞글이 비어 있으면 공백도 붙지 않는다', () => {
    expect(appendedBytes('', '나')).toBe(3);
    expect(appendedBytes('   ', '나')).toBe(3);
  });
});

describe('★별칭 보정 — 부호를 못 박는다', () => {
  it('실명이 별칭보다 짧으면 delta 가 음수다', () => {
    // '김지훈' = 3자 x 3B = 9B, '［이름1］' = 3B + 3B + 3B + 1B + 3B = 13B
    expect(aliasByteDelta('김지훈', '［이름1］')).toBe(-4);
  });

  it('보정은 목표를 반대로 민다 — 1,500 이 1,504 가 된다', () => {
    expect(modelTargetBytes(1500, -4)).toBe(1504);
  });

  it('★하한도 같은 delta 로 보정한다 — 1,425 가 1,429 가 된다', () => {
    expect(modelFloorBytes(1500, -4)).toBe(1429);
  });

  it('상한과 하한이 같은 방향으로 움직인다 (기준이 갈리지 않는다)', () => {
    const delta = aliasByteDelta('김지훈', '［이름1］');
    expect(modelTargetBytes(1500, delta) - 1500).toBe(
      modelFloorBytes(1500, delta) - goalFloor(1500),
    );
  });
});

describe('★[근거 부족] 표식은 본문에 남지 않는다', () => {
  it('별도 줄로 온 표식을 뗀다', () => {
    const r = stripInsufficientMark(`탐구를 이어 갔다.\n\n${INSUFFICIENT_MARK}`);
    expect(r.insufficient).toBe(true);
    expect(r.text).toBe('탐구를 이어 갔다.');
    expect(r.text).not.toContain('근거 부족');
  });

  it('마지막 문장 뒤에 붙어 온 표식도 뗀다', () => {
    const r = stripInsufficientMark(`탐구를 이어 갔다. ${INSUFFICIENT_MARK}`);
    expect(r.insufficient).toBe(true);
    expect(r.text).toBe('탐구를 이어 갔다.');
  });

  it('표식이 없으면 글을 건드리지 않는다', () => {
    const src = '탐구를 이어 갔다.\n\n둘째 문단.';
    const r = stripInsufficientMark(src);
    expect(r.insufficient).toBe(false);
    expect(r.text).toBe(src);
  });
});
