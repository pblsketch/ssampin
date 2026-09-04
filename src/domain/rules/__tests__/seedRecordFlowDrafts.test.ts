/**
 * 생기부 흐름 시드 초안이 **의도한 점검 갈래를 실제로 건드리는지** 잠근다.
 *
 * 왜 테스트로 두는가: 시드(`scripts/seed-record-flow-test-data.mjs`)의 값은 "점검 6종을 손으로
 * 재현하지 않아도 되게" 하는 것인데, 어휘 목록(`recordNarrativeChecks.ts`)이 바뀌면 이 문장들이
 * 조용히 아무 갈래도 건드리지 않게 될 수 있다. 그러면 시드는 남아 있는데 **쓸모만 사라진다** —
 * 화면을 열어 "경고가 안 뜨네?" 하고 기능을 의심하게 된다. 그 어긋남을 여기서 먼저 잡는다.
 *
 * 시더와 이 테스트는 `scripts/fixtures/record-flow-drafts.mjs` **같은 파일**을 읽는다.
 */
import { describe, it, expect } from 'vitest';
import { checkRecordNarrative } from '../recordNarrativeChecks';
import { hasProhibitedTerms } from '../prohibitedRecordTerms';
// @ts-expect-error — 스크립트용 순수 데이터 모듈(.mjs, 타입 선언 없음). 값만 읽는다.
import { SEED_DRAFTS } from '../../../../scripts/fixtures/record-flow-drafts.mjs';

interface SeedDraft {
  readonly key: string;
  readonly si: number;
  readonly content: string;
  readonly memo: string;
  /** 근거 메타 — 이게 없으면 변화 서사 검사는 "보지 못함"으로 빠진다(경고 0건이 정상). */
  readonly basis?: { readonly slots?: readonly string[]; readonly dates?: readonly string[] };
}

const drafts = SEED_DRAFTS as readonly SeedDraft[];
const contentOf = (key: string): string => {
  const d = drafts.find((x) => x.key === key);
  if (!d) throw new Error(`시드 초안에 '${key}' 가 없습니다`);
  return d.content;
};
/** 같은 반 다른 초안 — shared_boilerplate 는 견줄 대상이 있어야 판정된다. */
const peersExcept = (key: string): string[] =>
  drafts.filter((d) => d.key !== key).map((d) => d.content);

const narrativeCodes = (key: string): string[] => {
  const d = drafts.find((x) => x.key === key)!;
  return checkRecordNarrative({
    content: d.content,
    area: 'subject',
    peerContents: peersExcept(key),
    ...(d.basis ? { evidenceBasis: d.basis } : {}),
  }).flags.map((f) => f.code);
};

describe('시드 초안 ↔ 서사 점검 갈래 대응', () => {
  it.each([
    ['generic_praise'],
    ['activity_list_no_question'],
    ['change_without_basis'],
    ['unobservable_inner_state'],
  ])('%s 초안이 그 갈래를 건드린다', (key) => {
    expect(narrativeCodes(key)).toContain(key);
  });

  it('같은 문장 두 건은 shared_boilerplate 를 건드린다', () => {
    expect(narrativeCodes('shared_boilerplate:2')).toContain('shared_boilerplate');
  });

  it('기재 금지 초안은 prohibited_item 규칙에 걸린다(서사 점검과 별개 축)', () => {
    expect(hasProhibitedTerms(contentOf('prohibited_item'))).toBe(true);
  });

  it('대조군은 서사 경고 0건이고 금지 항목도 없다', () => {
    // ★이게 깨지면 오탐이 늘었다는 뜻이다 — 시드보다 규칙 쪽을 먼저 의심할 것.
    expect(narrativeCodes('(clean)')).toEqual([]);
    expect(hasProhibitedTerms(contentOf('(clean)'))).toBe(false);
  });

  it('시드에 실명·연락처 형태가 섞이지 않는다', () => {
    for (const d of drafts) {
      expect(d.content).not.toMatch(/01[016-9]-?\d{3,4}-?\d{4}/); // 휴대전화
      expect(d.content).not.toMatch(/\d{6}-\d{7}/); // 주민등록번호
    }
  });
});
