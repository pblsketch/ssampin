import { describe, expect, it } from 'vitest';
import {
  checkActivityList,
  checkChangeBasis,
  checkGenericPraise,
  checkRecordNarrative,
  checkSharedBoilerplate,
  checkStandardCopy,
  checkUnobservableInnerState,
  narrativeFlagCodes,
  narrativeLexiconFingerprint,
  NARRATIVE_FLAG_CODES,
} from '@domain/rules/recordNarrativeChecks';

/**
 * 서사 품질 점검 6종.
 *
 * 규칙마다 **검출·오탐·무결** 세 방향을 다 고정한다. 오탐이 이 기능을 죽이는 방식이기 때문이다 —
 * 정상 초안이 죄다 경고를 달면 교사는 경고를 통째로 무시하게 되고, 그러면 진짜 경고
 * (`prohibited_item` 같은 것)까지 같이 묻힌다.
 *
 * 모든 문장은 **지어낸 것**이다. 실제 학생 자료도, 오너 프롬프트 원문도 들어 있지 않다.
 */

// ─────────────────────────── 1. 성취기준 복사(K1) ───────────────────────────

describe('checkStandardCopy — 성취기준 원문을 옮겨 적었나', () => {
  const STANDARD = ['일차함수의 개념을 이해하고 그 그래프를 그릴 수 있다'];

  it('검출 — 어절 4개가 연속으로 같으면 잡는다', () => {
    const hit = checkStandardCopy(
      '일차함수의 개념을 이해하고 그 그래프를 그리는 과정을 표로 정리함.',
      STANDARD,
    );
    expect(hit?.code).toBe('standard_text_copied');
    expect(hit?.detail).toContain('일차함수의 개념을 이해하고 그');
  });

  it('오탐 — 같은 소재를 다뤄도 문장이 다르면 잡지 않는다', () => {
    expect(
      checkStandardCopy(
        '일차함수를 실생활 요금제에 적용해 두 요금제의 손익 분기점을 계산함.',
        STANDARD,
      ),
    ).toBeNull();
  });

  it('무결 — 성취기준 원문이 없으면 아예 판정하지 않는다', () => {
    expect(checkStandardCopy('일차함수의 개념을 이해하고 그 그래프를 그림.', undefined)).toBeNull();
    expect(checkStandardCopy('일차함수의 개념을 이해하고 그 그래프를 그림.', [])).toBeNull();
  });
});

// ─────────────────────────── 2. 공통 입력 문구(K7·K14) ───────────────────────────

describe('checkSharedBoilerplate — 다른 학생 초안에도 그대로 있는 문장인가', () => {
  const PEER = ['한 학기 동안 수업에 참여하며 과제를 기한 내에 제출함. 발표에서 자기 생각을 밝힘.'];

  it('검출 — 어미만 바꾼 복붙도 잡는다(정확 일치로는 못 잡는다)', () => {
    const hit = checkSharedBoilerplate(
      '한 학기 동안 수업에 참여하며 과제를 기한 내에 제출하였음.',
      PEER,
    );
    expect(hit?.code).toBe('shared_boilerplate');
  });

  it('오탐 — 소재가 겹쳐도 문장이 다르면 잡지 않는다', () => {
    expect(
      checkSharedBoilerplate(
        '과제를 늦게 낸 까닭을 스스로 적어 오고 남은 부분을 다시 제출함.',
        PEER,
      ),
    ).toBeNull();
  });

  it('오탐 — 같은 소재를 각자 쓴 문장은 잡지 않는다(실측 유사도 0.47)', () => {
    expect(
      checkSharedBoilerplate('설문 결과를 표로 정리해 발표함.', [
        '실험 결과를 그래프로 정리해 발표함.',
      ]),
    ).toBeNull();
  });

  it('오탐 — 짧은 문장은 겹쳐도 잡지 않는다(누구나 쓰는 말이다)', () => {
    expect(checkSharedBoilerplate('발표함.', ['발표함.'])).toBeNull();
  });

  it('무결 — 견줄 초안이 없으면 아예 판정하지 않는다', () => {
    expect(
      checkSharedBoilerplate('한 학기 동안 수업에 참여하며 과제를 제출함.', undefined),
    ).toBeNull();
    expect(checkSharedBoilerplate('한 학기 동안 수업에 참여하며 과제를 제출함.', [])).toBeNull();
  });
});

// ─────────────────────────── 3. 일반 평가 나열(K8) ───────────────────────────

describe('checkGenericPraise — 장면 없는 평가가 이어지는가', () => {
  it('검출 — "다른 학생에게 옮겨도 말이 되는" 초안을 잡는다(K14)', () => {
    const hit = checkGenericPraise(
      '수업에 성실히 참여하고 이해력이 뛰어나며 책임감이 강한 학생임.',
    );
    expect(hit?.code).toBe('generic_praise');
  });

  it('검출 — 문장이 아니라 절 단위로 본다(세특은 "~하고, ~하며"로 길게 이어진다)', () => {
    expect(
      checkGenericPraise('매사에 성실하고, 수업 태도가 바르며, 친구들과 원만하게 지냄.')?.code,
    ).toBe('generic_praise');
  });

  it('오탐 — 같은 낱말이라도 장면이 붙어 있으면 잡지 않는다', () => {
    expect(
      checkGenericPraise('자료를 성실히 정리해 표로 제시하고, 오차의 원인을 비교해 설명함.'),
    ).toBeNull();
  });

  it('오탐 — 일반 평가 한 마디는 잡지 않는다(연속일 때만)', () => {
    expect(
      checkGenericPraise('두 자료의 측정 조건이 다름을 지적함. 끝까지 성실하게 마무리함.'),
    ).toBeNull();
  });

  it('무결 — 장면으로만 쓴 초안은 건드리지 않는다', () => {
    expect(
      checkGenericPraise(
        '학급 회의에서 자리 배치 기준을 먼저 제안하고, 자기 안이 부결된 뒤에도 결정된 기준대로 자리표를 만들어 게시함.',
      ),
    ).toBeNull();
  });
});

// ─────────────────────────── 4. 활동 나열(K2·K3) ───────────────────────────

describe('checkActivityList — 활동만 늘어놓고 질문이 없는가', () => {
  it('검출 — 활동 3종 이상 + 질문 0', () => {
    const hit = checkActivityList('보고서를 작성하고 실험을 수행하며 발표와 토론에 참여함.');
    expect(hit?.code).toBe('activity_list_no_question');
  });

  it('오탐 — 질문이 있으면 활동이 여럿이어도 잡지 않는다', () => {
    expect(
      checkActivityList(
        '보고서·실험·발표를 이어 가며 "왜 같은 조건에서 값이 달라지는가"라는 의문을 붙잡음.',
      ),
    ).toBeNull();
  });

  it('오탐 가드 — "왜곡"의 왜는 질문으로 세지 않는다(대학원≠학원 선례와 같은 방식)', () => {
    // 여기서 잡히는 것이 맞다. "왜곡"을 질문 표지로 세면 진짜 나열형을 놓친다(미탐).
    expect(
      checkActivityList('통계가 왜곡된 지점을 지적하며 보고서·실험·발표를 정리함.')?.code,
    ).toBe('activity_list_no_question');
  });

  it('무결 — 활동이 2종이면 잡지 않는다(하나를 깊게 쓴 초안)', () => {
    expect(checkActivityList('설문 결과를 표로 정리해 발표함.')).toBeNull();
  });
});

// ─────────────────────────── 5. 변화 서사 근거(K9) ───────────────────────────

describe('checkChangeBasis — 변화 표현에 시기 대비 근거가 있는가', () => {
  const CHANGE_DRAFT = '수업 참여가 점차 늘고 과제를 꾸준히 제출함.';

  it('검출 — 근거가 하루치뿐이면 변화 서사를 쓸 수 없다', () => {
    const hit = checkChangeBasis(CHANGE_DRAFT, { slots: [], dates: ['2026-03-02'] });
    expect(hit?.code).toBe('change_without_basis');
    expect(hit?.detail).toContain('점차');
  });

  it('오탐 — 담임 슬롯 "변화"가 붙어 있으면 잡지 않는다', () => {
    expect(checkChangeBasis(CHANGE_DRAFT, { slots: ['변화'], dates: [] })).toBeNull();
  });

  it('오탐 — 30일 이상 떨어진 근거가 있으면 잡지 않는다', () => {
    expect(checkChangeBasis(CHANGE_DRAFT, { dates: ['2026-03-02', '2026-06-20'] })).toBeNull();
  });

  it('오탐 — 같은 주에 몰린 근거는 시기 대비가 아니다(잡는다)', () => {
    expect(checkChangeBasis(CHANGE_DRAFT, { dates: ['2026-03-02', '2026-03-05'] })?.code).toBe(
      'change_without_basis',
    );
  });

  it('무결 — 변화 표현이 없으면 근거가 없어도 잡지 않는다', () => {
    expect(
      checkChangeBasis('과제를 기한 내에 제출하고 오류를 스스로 고침.', { dates: [] }),
    ).toBeNull();
  });

  it('무결 — 근거 메타를 모르면 판정하지 않는다(모르는 것은 없는 것이 아니다)', () => {
    expect(checkChangeBasis(CHANGE_DRAFT, undefined)).toBeNull();
  });
});

// ─────────────────────────── 6. 관찰 불가 내면 표현 ───────────────────────────

describe('checkUnobservableInnerState — 속마음을 적었는가', () => {
  it('검출 — 대체할 행동 동사를 함께 알려 준다', () => {
    const hit = checkUnobservableInnerState('기회비용의 개념을 이해함.');
    expect(hit?.code).toBe('unobservable_inner_state');
    expect(hit?.detail).toContain('설명함');
  });

  it('오탐 — "이해관계"는 "이해함"으로 잡지 않는다', () => {
    expect(checkUnobservableInnerState('이해관계자의 입장을 비교해 설명함.')).toBeNull();
  });

  it('오탐 — 지명 "함양군"은 "함양함"으로 잡지 않는다', () => {
    expect(checkUnobservableInnerState('함양군으로 답사를 다녀와 보고서를 작성함.')).toBeNull();
  });

  it('무결 — 초등 교과학습발달상황은 건너뛴다(그 영역은 "이해함"이 기재 문법이다)', () => {
    expect(checkUnobservableInnerState('분수의 덧셈 원리를 이해함.', 'subjectDev')).toBeNull();
    expect(checkUnobservableInnerState('분수의 덧셈 원리를 이해함.', 'subject')?.code).toBe(
      'unobservable_inner_state',
    );
  });
});

// ─────────────────────────── 통합 — 재료가 없으면 "안 봤다"고 말한다 ───────────────────────────

describe('checkRecordNarrative — 경고 0 과 "검사 못 함"을 구별한다', () => {
  it('재료가 없는 검사는 skipped 로 돌려준다(깨끗함으로 위장하지 않는다)', () => {
    const r = checkRecordNarrative({ content: '설문 결과를 표로 정리해 발표함.' });
    expect(r.flags).toHaveLength(0);
    expect(r.skipped.map((s) => s.code).sort()).toEqual(
      ['change_without_basis', 'shared_boilerplate', 'standard_text_copied'].sort(),
    );
  });

  it('재료를 다 주면 건너뛰는 검사가 없다', () => {
    const r = checkRecordNarrative({
      content: '설문 결과를 표로 정리해 발표함.',
      area: 'subject',
      standardTexts: ['자료를 수집하고 해석할 수 있다'],
      peerContents: ['다른 학생의 전혀 다른 초안 문장임.'],
      evidenceBasis: { slots: [], dates: ['2026-03-02'] },
    });
    expect(r.skipped).toHaveLength(0);
  });

  it('초등 교과학습발달상황은 내면 표현 검사를 건너뛴 사실을 밝힌다', () => {
    const r = checkRecordNarrative({ content: '분수의 덧셈 원리를 이해함.', area: 'subjectDev' });
    expect(narrativeFlagCodes(r)).not.toContain('unobservable_inner_state');
    expect(r.skipped.map((s) => s.code)).toContain('unobservable_inner_state');
  });

  it('빈 초안은 아무것도 하지 않는다', () => {
    expect(checkRecordNarrative({ content: '   ' })).toEqual({ flags: [], skipped: [] });
  });

  it('모든 코드에 한국어 라벨이 붙는다(폴백 라벨로 새지 않는다)', () => {
    const r = checkRecordNarrative({
      content: '수업에 성실히 참여하고 이해력이 뛰어나며 책임감이 강한 학생임.',
    });
    for (const f of r.flags) {
      expect(f.label).not.toBe('기타 확인 필요 항목');
      expect(f.label.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────── 실측 사례 회귀 ───────────────────────────

/** 하네스 A 사례(풍부)를 세특 초안 모양으로 옮긴 것. 지어낸 자료다. */
const RICH_DRAFT =
  '기회비용과 매몰비용을 다룬 수업에서 "할인 쿠폰이 있으면 왜 필요 없는 물건도 사게 되는가"라는 ' +
  '의문을 제기함. 교사의 되물음에 프레이밍 효과를 언급하며 같은 금액을 손실로 제시할 때와 이득으로 ' +
  '제시할 때 선택이 달라지는지 직접 확인해 보겠다고 함. 학급 30명을 두 집단으로 나눠 문구만 바꾼 ' +
  '선택지를 주는 간이 설문을 설계함. 1차 조사에서 두 집단에 같은 순서로 문항을 준 탓에 순서 효과가 ' +
  '섞였음을 스스로 발견하고, 2차에서 문항 순서를 뒤집어 다시 조사함. 표본이 30명이라 결과를 ' +
  '일반화할 수 없다는 한계를 발표에서 먼저 밝힘. 국어 시간에 배운 설득 전략과 연결해 설명함.';

/** "다른 학생에게 옮겨도 말이 되는" 초안(K14). */
const TRANSFERABLE_DRAFT =
  '매사에 성실하고 이해력이 뛰어나며 책임감이 강함. 수업 태도가 바르고 친구들과 원만하게 지냄.';

describe('실측 사례 — 풍부한 초안에는 경고 0, 옮겨도 되는 초안에는 경고', () => {
  it('A 사례(근거가 줄기로 정렬된 초안)에는 경고가 하나도 붙지 않는다', () => {
    const r = checkRecordNarrative({
      content: RICH_DRAFT,
      area: 'subject',
      evidenceBasis: { slots: ['질문', '시도', '시행착오'], dates: ['2026-09-02'] },
    });
    expect(narrativeFlagCodes(r)).toEqual([]);
  });

  it('K14 — 다른 학생에게 옮겨도 말이 되는 초안은 경고한다', () => {
    const r = checkRecordNarrative({ content: TRANSFERABLE_DRAFT, area: 'subject' });
    expect(narrativeFlagCodes(r)).toContain('generic_praise');
  });
});

// ─────────────────────────── 오탐률 게이트 — 정상 초안 음성 코퍼스 ───────────────────────────

/**
 * 지어낸 **정상** 초안 20건. 하나라도 경고가 뜨면 오탐이다.
 *
 * ★이 코퍼스가 저장소 안에 있는 이유: 오탐 확인이 API 비용이 드는 저장소 밖 하네스에만 있으면
 * 오탐 검증 없이 출시된다. 게이트(`npm run test`)가 매번 봐야 한다.
 */
const CLEAN_DRAFTS: readonly string[] = [
  '이차방정식의 근의 공식을 유도하는 과정에서 판별식의 부호를 세 경우로 나눠 설명함.',
  '삼투 현상 실험에서 설탕물 농도를 다섯 단계로 나눠 감자 조각의 질량 변화를 측정함.',
  '조선 후기 신분제 변화 자료를 연대순으로 정리해 표로 제시함.',
  '설득하는 글에서 반론 문단이 약하다는 점을 스스로 짚고 반대 입장을 먼저 쓴 뒤 반박하는 순서로 고쳐 씀.',
  '지도에서 등고선 간격을 재어 실제 경사도를 계산하고 답사 경로를 다시 세움.',
  '수요와 공급 곡선을 그려 최저임금 인상의 효과를 두 방향으로 나눠 비교함.',
  '영어 지문의 접속사를 표시해 문단 사이의 논리 관계를 구분함.',
  '음악 감상 시간에 같은 곡의 두 연주를 빠르기 기준으로 비교해 차이를 설명함.',
  '농구 수업에서 슛 성공률을 10회씩 세 차례 기록해 자세를 바꾼 뒤와 견줌.',
  '가정 수업에서 하루 식단의 열량을 계산해 권장량과 견주고 부족한 영양소를 찾아 보완함.',
  '미술 작품의 구도를 세 가지로 나눠 분석하고 자기 작품에 하나를 적용함.',
  '한문 문장의 어순을 우리말과 견주어 구분하고 직역과 의역을 나눠 작성함.',
  '정보 수업에서 반복문을 조건문으로 바꿔 같은 결과가 나오는지 검증함.',
  '통계 자료의 출처를 확인하고 조사 대상이 달라 단순 비교가 어렵다는 점을 지적함.',
  '토의에서 상대 주장을 요약한 뒤 근거의 출처를 물어 확인함.',
  '실험 오차의 원인을 기구 눈금과 측정 시점으로 나눠 정리함.',
  '물의 상태 변화 그래프에서 온도가 일정한 구간의 뜻을 설명함.',
  '지역 인구 자료를 연도별로 정리해 변화 폭이 큰 구간을 찾아 표시함.',
  '독서 기록에서 인상 깊은 문장을 옮겨 적고 그렇게 본 까닭을 덧붙여 작성함.',
  '모둠 과제에서 맡은 자료 조사 범위를 먼저 정하고 겹치는 부분을 조율해 다시 나눔.',
];

describe('오탐률 게이트 — 정상 초안 20건에 경고가 하나도 없어야 한다', () => {
  it.each(CLEAN_DRAFTS.map((d, i) => [i + 1, d] as const))('정상 초안 #%i', (_i, draft) => {
    const r = checkRecordNarrative({
      content: draft,
      area: 'subject',
      evidenceBasis: { slots: [], dates: ['2026-03-02', '2026-06-20'] },
    });
    expect(narrativeFlagCodes(r)).toEqual([]);
  });
});

// ─────────────────────────── 미러 지문 ───────────────────────────

/**
 * 브릿지(`packages/core/src/grounding.ts`) 미러와 **같은 값**인지 확인하는 알람.
 * 브릿지 테스트가 같은 상수를 대조한다. 한쪽만 고치면 그쪽 테스트가 깨진다.
 *
 * ⚠️ 보증이 아니다 — 양쪽을 같이 고치면 둘 다 초록이 된다.
 */
export const NARRATIVE_LEXICON_FINGERPRINT = '248abf30';

describe('미러 지문', () => {
  it('어휘·임계값·라벨 지문이 브릿지와 못 박은 값과 같다', () => {
    expect(narrativeLexiconFingerprint()).toBe(NARRATIVE_LEXICON_FINGERPRINT);
  });

  it('코드 목록이 6종 그대로다', () => {
    expect(NARRATIVE_FLAG_CODES).toHaveLength(6);
  });
});
