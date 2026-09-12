/**
 * 분량 목표(오너 요청 2026-09-11) — 과목마다 목표 바이트를 정하고, 목표가 있으면 요청서에 늘 분량 줄을 싣는다(ADR-110).
 * 그리고 영역을 정하지 않은 근거가 어느 화면에서도 사라지지 않는다(두 화면 불일치 제보).
 */
import { describe, it, expect } from 'vitest';

import { recordTargetKey, resolveTargetBytes, targetPresetsFor } from '../recordLengthGoal';
import { evidenceInArea } from '../../entities/RecordEvidence';
import { effectiveAreaLimit, isAreaLimitConfirmed } from '../../entities/RecordDraft';
import { buildRecordDraftPack, draftLengthInstruction } from '../../services/recordDraftPack';

describe('분량 목표', () => {
  it('정하지 않으면 한도, 한도를 넘는 값은 한도로 자른다', () => {
    expect(resolveTargetBytes('subject', 'high')).toBe(1500);
    expect(resolveTargetBytes('subject', 'high', 750)).toBe(750);
    expect(resolveTargetBytes('subject', 'high', 9999)).toBe(1500);
  });

  it('칩은 한도보다 작은 값과 한도 자체 — 진로는 2,100 이 끝에 온다', () => {
    expect(targetPresetsFor('subject', 'high')).toEqual([750, 1000, 1500]);
    expect(targetPresetsFor('career', 'high')).toEqual([750, 1000, 1500, 2100]);
  });

  it('저장 키는 수업반 × 영역, 담임은 homeroom', () => {
    expect(recordTargetKey('c1', 'subject')).toBe('c1:subject');
    expect(recordTargetKey(undefined, 'behavior')).toBe('homeroom:behavior');
  });
});

describe('요청서의 분량 줄', () => {
  const base = {
    studentName: '김지훈',
    roster: [],
    areaLabel: '과목별 세부능력 및 특기사항',
    evidences: [{ id: 'e1', content: '토론에서 반론을 정리했다.', date: '2026-05-01' }],
  };

  it('목표를 주지 않으면 요청서가 예전과 같다(분량 줄 0 — 기준선 픽스처)', () => {
    expect(buildRecordDraftPack(base).text).not.toContain('분량:');
  });

  it('★목표가 한도와 같아도 분량 줄을 싣는다 — 1층 규정에는 바이트 한도가 없다(ADR-110)', () => {
    const text = buildRecordDraftPack({ ...base, targetBytes: 1500, limitBytes: 1500 }).text;
    // 상한은 못 박고, 하한~목표는 "근거가 넉넉할 때"의 목표로만 둔다(보강 2).
    expect(text).toContain('분량: 공백을 포함해 1,500바이트(한글 약 500자)를 넘기지 마세요.');
    expect(text).toContain('근거가 넉넉하면 1,425~1,500바이트');
    // 근거 고르기(보강 3·4) — 목표가 있으면 늘 함께 간다.
    expect(text).toContain(
      '근거 고르기: 먼저 근거를 핵심 근거(이 학생의 강점이나 특성을 드러내는 근거)와 주변 근거',
    );
    // 목표가 한도와 같으면 "학교가 정한" 사정 문장은 붙지 않는다.
    expect(text).not.toContain('학교가 정한');
  });

  it('목표가 한도보다 작으면 그 목표를 상한으로, 하한~목표를 넉넉할 때의 목표로 적는다', () => {
    const text = buildRecordDraftPack({ ...base, targetBytes: 750, limitBytes: 1500 }).text;
    expect(text).toContain('분량: 공백을 포함해 750바이트(한글 약 250자)를 넘기지 마세요.');
    expect(text).toContain('근거가 넉넉하면 713~750바이트');
    expect(text).toContain('나이스 한도(1,500바이트)');
  });
});

describe('★근거가 빈약하면 목표 바이트에 맞추지 않는다 (ADR-110 보강 2, 오너 요청 2026-09-11)', () => {
  const RICH = Array.from({ length: 10 }, (_, i) => ({
    id: `r${i}`,
    content: '모둠 토의에서 반론을 정리하고 근거 자료를 찾아 발표 자료로 만들었다.', // 97B
    date: `2026-05-${String(i + 1).padStart(2, '0')}`,
  }));
  const pack = (evidences: readonly { id: string; content: string; excludedFromAi?: boolean }[]) =>
    buildRecordDraftPack({
      studentName: '김지훈',
      roster: [],
      areaLabel: '과목별 세부능력 및 특기사항',
      evidences,
      targetBytes: 1500,
      limitBytes: 1500,
    }).text;

  it('★채우지 않아도 된다고 늘 말하고, 분량을 늘리는 네 가지 방법을 이름으로 막는다', () => {
    const text = pack(RICH);
    expect(text).toContain('근거가 빈약하면 목표 분량을 채우지 않아도 됩니다');
    expect(text).toContain('근거에 없는 활동·성과·태도를 보태거나');
    expect(text).toContain('같은 내용을 말만 바꿔 되풀이하거나');
    expect(text).toContain('일반적인 칭찬이나 짐작으로 늘이거나');
    expect(text).toContain('앞 내용을 요약하는 마무리 문장');
  });

  it('★사실이 분량보다 먼저다 — 예전의 "이 분량 지시가 다른 분량 안내보다 우선"은 없다', () => {
    const text = pack(RICH);
    expect(text).toContain('근거에 없는 내용을 쓰지 않는 것이 분량보다 먼저입니다');
    // 이 말은 1층 규정의 "자료가 얇으면 억지로 채우지 말라"까지 누를 수 있었다.
    expect(text).not.toContain('다른 분량 안내보다 우선합니다');
  });

  it('★보내는 근거 글이 목표의 절반에 못 미치면 그 사실을 숫자로 알린다', () => {
    const text = pack([{ id: 'e1', content: '토론에서 반론을 정리했다.' }]); // 36B
    expect(text).toContain('이번에 보내는 근거는 1건, 모두 합쳐 약 36바이트');
    expect(text).toContain('목표 분량의 절반에 못 미칩니다');
    expect(text).toContain('근거가 뒷받침하는 만큼만 쓰세요');
  });

  it('근거가 넉넉하면(970B ≥ 750B) 빈약하다는 줄을 붙이지 않는다', () => {
    expect(pack(RICH)).not.toContain('절반에 못 미칩니다');
  });

  it('선생님이 뺀 근거는 양에 세지 않는다 — 실제로 실린 것만', () => {
    const text = pack([
      ...RICH.map((e) => ({ ...e, excludedFromAi: true })),
      { id: 'e1', content: '토론에서 반론을 정리했다.' },
    ]);
    expect(text).toContain('이번에 보내는 근거는 1건, 모두 합쳐 약 36바이트');
  });
});

describe('★근거는 핵심/주변으로 나누고, 넘칠 때만 주변 근거를 핵심과 잇거나 뺀다 (ADR-110 보강 3·4, 오너 요청 2026-09-11)', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `m${i}`,
      content: '모둠 토의에서 반론을 정리하고 근거 자료를 찾아 발표 자료로 만들었다.', // 97B
      date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
  const packOf = (evidences: readonly { id: string; content: string }[]) =>
    buildRecordDraftPack({
      studentName: '김지훈',
      roster: [],
      areaLabel: '과목별 세부능력 및 특기사항',
      evidences,
      targetBytes: 1500,
      limitBytes: 1500,
    }).text;

  it('★개수로 자르지 않는다 — 핵심(강점·특성)/주변으로 나누고 핵심을 중심에 둔다', () => {
    const text = packOf(many(10));
    expect(text).toContain(
      '먼저 근거를 핵심 근거(이 학생의 강점이나 특성을 드러내는 근거)와 주변 근거(그 밖의 근거)로 나누고, 핵심 근거를 중심에 두세요.',
    );
    // 오너가 거절한 개수 제한("한두 가지")은 없다(보강 4).
    expect(text).not.toContain('한두 가지');
    expect(text).toContain('활동을 차례로 늘어놓지 마세요');
  });

  it('★넘칠 때만 — 주변 근거는 핵심과 이어지는 부분만 엮고, 연결하기 어려우면 쓰지 않는다', () => {
    const text = packOf(many(10));
    expect(text).toContain(
      '모두 담으면 분량을 넘길 것 같으면, 주변 근거는 핵심 근거와 이어지는 부분만 한 구절이나 한 문장으로 엮고',
    );
    expect(text).toContain('핵심 근거와 연결하기 어려운 주변 근거는 쓰지 마세요.');
  });

  it('★근거 글이 목표보다 많으면(1,940B > 1,500B) 넘친다고 숫자로 알리고 같은 방법을 다시 말한다', () => {
    const text = packOf(many(20));
    expect(text).toContain('이번에 보내는 근거는 20건, 모두 합쳐 약 1,940바이트');
    expect(text).toContain('목표 분량(1,500바이트)보다 많아 모두 담으면 넘칩니다');
    expect(text).toContain(
      '주변 근거는 핵심 근거와 연결되는 것만 엮고, 연결하기 어려운 것은 쓰지 않아도 됩니다',
    );
    // 빈약 신호와 겹치지 않는다.
    expect(text).not.toContain('절반에 못 미칩니다');
  });

  it('그 사이(970B — 목표의 절반 이상, 목표 이하)는 숫자 줄 없이 일반 지시만 나간다', () => {
    const text = packOf(many(10));
    expect(text).not.toContain('모두 담으면 넘칩니다');
    expect(text).not.toContain('절반에 못 미칩니다');
  });

  it('★장면을 짰으면 장면 차례는 지키고, 주변 근거만 놓인 장면도 빼지 않는다', () => {
    const text = draftLengthInstruction(1500, 1500, { count: 12, bytes: 1800, structured: true });
    expect(text).toContain('근거 고르기: 짜 둔 장면 차례는 지키세요.');
    expect(text).toContain('주변 근거만 놓인 장면도 빼지 말고, 핵심 근거와 이어지게 짧게 쓰세요.');
    expect(text).toContain('핵심 근거와 연결하기 어려운 주변 근거는 쓰지 마세요.');
    expect(text).not.toContain('활동을 차례로 늘어놓지 마세요');
    expect(text).toContain('모두 담으면 넘칩니다');
  });

  // 마무리(오너 검토 2026-09-12) — 1층 규정에 넣었더니 근거 1건(138B) 학생의 글이 459B → 227B 로
  //  줄고 교사 판단 문장("…태도가 확인됨")이 사라졌다(문구를 세 번 고쳐도 같았다). 근거 양은 앱만
  //  정확히 아니까 앱이 가른다. 오너 결정: 근거가 부족하면 해석으로 끝나지 않아도 된다.
  //  ★자리는 분량 줄 안이 아니라 **요청서 꼬리**(되짚기 backstop 바로 앞)다 — 분량 블록에 뒀을 때는
  //  근거가 넉넉한 학생에서 마지막 문장이 결과로 닫힌 것이 3회 중 1회뿐이었다(2026-09-12 2차 실측).
  const THIN = [{ id: 't1', content: '토론에서 반론을 정리했다.' }]; // 36B < 750B

  it('★근거가 넉넉하면 마지막 문장을 결과에 두라고 말한다', () => {
    const text = packOf(many(10)); // 970B >= 750B
    expect(text).toContain('마무리: 마지막 문장은 그 활동이 무엇에 이르렀는지');
    expect(text).toContain('곁가지 장면에서 글이 끊기면 마무리가 되지 않습니다');
    // "앞 내용을 요약하는 마무리 문장을 붙이지 마세요"와 부딪히지 않게 뜻을 못 박는다.
    expect(text).toContain('요약 문장을 붙이라는 뜻이 아니라');
  });

  it('★마무리 지시는 되짚기 backstop 바로 앞에 온다 (맨 끝은 지어내기를 막는 지시의 자리)', () => {
    const text = packOf(many(10)); // 970B >= 750B
    expect(text.indexOf('마무리: 마지막 문장은')).toBeLessThan(
      text.indexOf('근거에 없는 내용은 쓰지 마세요'),
    );
    // backstop 은 여전히 맨 끝이다(꼬리 200자 계약 — recordDraftPack.test.ts 와 같은 규칙).
    expect(text.slice(-200)).toContain('근거에 없는 내용은 쓰지 마세요');
    // 분량 블록 안으로 되돌아가지 않았다 — 분량 우선순위 줄보다 뒤다.
    expect(text.indexOf('분량 숫자는 이 안내를 따르되')).toBeLessThan(
      text.indexOf('마무리: 마지막 문장은'),
    );
  });

  it('★근거가 얇으면 마무리 지시를 아예 붙이지 않는다 (해석으로 끝나지 않아도 된다)', () => {
    const text = packOf(THIN);
    expect(text).not.toContain('마무리:');
    // 빈약 신호와 일반 지시는 그대로 나간다.
    expect(text).toContain('절반에 못 미칩니다');
    expect(text).toContain('근거가 빈약하면 목표 분량을 채우지 않아도 됩니다');
  });

  it('가르는 자리는 목표의 절반이다 (경계 — 97B 짜리 8건 776B vs 7건 679B)', () => {
    expect(packOf(many(8))).toContain('마무리:');
    expect(packOf(many(7))).not.toContain('마무리:');
  });

  it('보낼 근거가 하나도 없으면 마무리 지시도 없다', () => {
    expect(packOf([])).not.toContain('마무리:');
  });
});

describe('영역을 정하지 않은 근거', () => {
  it('★어느 영역에도 들어간다 — 초안 화면에서 사라지지 않는다', () => {
    expect(evidenceInArea({ areas: [] }, 'subject')).toBe(true);
    expect(evidenceInArea({ areas: ['club'] }, 'subject')).toBe(false);
    expect(evidenceInArea({ areas: ['subject', 'club'] }, 'club')).toBe(true);
  });
});

describe('직접 정한 한도 (오너 결정 2026-09-11)', () => {
  it('정하지 않으면 기재요령 기본값, 정하면 그 값 — 하한 아래는 오타로 본다', () => {
    expect(effectiveAreaLimit('subject', 'high')).toBe(1500);
    expect(effectiveAreaLimit('subject', 'high', 750)).toBe(750);
    expect(effectiveAreaLimit('subject', 'high', 50)).toBe(1500);
  });

  it('★직접 정한 한도는 초등이어도 확정된 한도로 본다(넘으면 붉게, 저장은 됨)', () => {
    expect(isAreaLimitConfirmed('behavior', 'elementary')).toBe(false);
    expect(isAreaLimitConfirmed('behavior', 'elementary', 1200)).toBe(true);
  });

  it('목표 칩·목표 자르기가 직접 정한 한도를 따른다', () => {
    expect(targetPresetsFor('subject', 'high', 750)).toEqual([750]);
    expect(resolveTargetBytes('subject', 'high', 1000, 750)).toBe(750);
    expect(resolveTargetBytes('subject', 'high', undefined, 2000)).toBe(2000);
  });

  it('한도를 기본값보다 크게 정하면 요청서에 그 분량 줄이 실린다', () => {
    const text = buildRecordDraftPack({
      studentName: '김지훈',
      roster: [],
      areaLabel: '과목별 세부능력 및 특기사항',
      evidences: [{ id: 'e1', content: '토론에서 반론을 정리했다.', date: '2026-05-01' }],
      targetBytes: 2000,
      limitBytes: 1500,
    }).text;
    expect(text).toContain('분량: 공백을 포함해 2,000바이트(한글 약 667자)를 넘기지 마세요.');
    expect(text).toContain('근거가 넉넉하면 1,900~2,000바이트');
    expect(text).toContain('기재요령 기본 한도(1,500바이트)보다 깁니다');
  });
});
