/**
 * 관찰 슬롯 — **상태 생명주기** 회귀 가드 (D1·D2 재발 방지).
 *
 * 배경: 저장 시점의 "부재 != 빈 배열"만 검증하는 테스트는 D1·D2 를 통과시켰다.
 * 진짜 위험은 **학생 전환·저장 후 리셋**이었다 —
 *   D1(b) 앞 학생에게 켜 둔 칩이 다음 학생 기록에 붙는다(잘못된 근거가 생기부 재료로 들어간다)
 *   D1(a) 자동저장 경로에 slots 가 빠져 학생을 넘기면 장면이 조용히 사라진다
 *   D2    담임은 일괄 저장이라 한 번의 실수가 반 전체를 오염시킨다
 *
 * 로직을 테스트 안에서 재구현하면 컴포넌트가 퇴행해도 통과한다(D8).
 * 그래서 **소스를 직접 읽어** 필수 배선이 살아 있는지 본다
 * (이 저장소의 phase6-inline-edit.test.ts 선례와 같은 방식).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string): string => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * 브릿지(`ssampin-ai-bridge`)는 **별도 저장소**라 CI 체크아웃에 없다.
 *
 * 그대로 읽으면 ENOENT 로 CI 가 빨간불이 된다(실제로 7커밋째 그랬다). 로컬에서는 옆
 * 폴더에 있어 통과하므로 개발 중에는 보이지도 않는다. 그래서 **있을 때만** 검사한다 —
 * 스킵은 리포트에 남으므로 "검사가 사라진 것"과 구분된다.
 */
const bridgeExists = (p: string): boolean => existsSync(resolve(process.cwd(), p));
const BRIDGE_MCP = '../ssampin-ai-bridge/packages/mcp/src/recordDraftTools.ts';
const BRIDGE_CORE = '../ssampin-ai-bridge/packages/core/src/entities/recordEvidence.ts';
const hasBridge = bridgeExists(BRIDGE_MCP) && bridgeExists(BRIDGE_CORE);

const OBSERVATION_FORM = 'src/adapters/components/ClassManagement/ObservationForm.tsx';
const INPUT_MODE = 'src/adapters/components/Homeroom/Records/InputMode.tsx';

describe('D1 — 데스크톱 관찰: 학생 전환에서 슬롯이 새지 않는다', () => {
  const src = read(OBSERVATION_FORM);

  it('(a) 자동저장(addRecord)에 slots 가 실린다', () => {
    // 학생 칩을 눌러 넘어갈 때 도는 경로. 빠지면 고른 장면이 조용히 사라진다.
    expect(src).toContain('slots: savedSlots');
  });

  it('(b) 학생이 바뀌면 selectedSlots 를 초안 값으로 갈아끼운다', () => {
    // 리셋이 없으면 앞 학생 칩이 그대로 남아 다음 학생 기록에 붙는다.
    expect(src).toContain('setSelectedSlots(nextDraft?.slots ?? [])');
  });

  it('(c) 초안 인터페이스에 slots 칸이 있다', () => {
    expect(src).toMatch(/interface ObservationDraft \{[\s\S]*?slots: string\[\];/);
  });

  it('빈 초안 판정이 slots 도 본다', () => {
    expect(src).toContain('draft.slots.length === 0');
  });

  it('★toggleSlot 이 초안에 기록한다 — 안 그러면 위 조건이 죽은 코드가 된다 (N1)', () => {
    // 앞서 toggleSlot 이 rememberDraft 선언보다 **위에** 있어 부를 수 없었다.
    // 그 결과 ObservationDraft.slots 와 isDraftEmpty 의 슬롯 조건이 영원히 참인 죽은 코드였고,
    // 본문 없이 슬롯만 고른 상태가 학생 전환에서 사라졌다.
    // 선언 순서까지 봐야 같은 실패가 한 칸 옮겨 재현되지 않는다.
    const toggleSlotAt = src.indexOf('const toggleSlot');
    const rememberAt = src.indexOf('const rememberDraft = useCallback');
    expect(rememberAt).toBeGreaterThan(-1);
    expect(toggleSlotAt).toBeGreaterThan(rememberAt);
    // 그리고 실제로 부르는지
    const body = src.slice(toggleSlotAt, toggleSlotAt + 600);
    expect(body).toContain('rememberDraft(studentId');
    expect(body).toContain('slots: next');
  });

  it('[저장] 버튼 경로에도 slots 가 실린다', () => {
    expect(src).toContain('slots: selectedSlots');
  });
});

describe('D2 — 담임 누가기록: 저장 후 슬롯이 리셋된다', () => {
  const src = read(INPUT_MODE);

  it('resetForm 이 selectedSlots 를 비운다', () => {
    // 일괄 저장이라 남으면 반 전체 기록이 오염된다.
    const reset = src.slice(src.indexOf('const resetForm = useCallback('));
    expect(reset.slice(0, 900)).toContain('setSelectedSlots([])');
  });

  it('슬롯은 tags 와 다른 키로 저장된다 — 세부 분류와 섞이지 않는다', () => {
    expect(src).toContain('{ slots: normalizedSlots }');
    expect(src).toContain('{ tags: [...selectedTags] }');
  });

  it('담임 맥락으로 정규화한다 — 교과 어휘가 새지 않는다', () => {
    // 인자 개수가 늘어도(커스텀 슬롯 추가) 맥락이 'homeroom' 인 것은 변하면 안 된다.
    expect(src).toMatch(/normalizeSlots\(\s*selectedSlots,\s*'homeroom'/);
  });

  it('담임에도 커스텀 슬롯을 추가할 수 있다(설계 §4-1 대칭)', () => {
    expect(src).toContain('homeroomRecordSlots');
    expect(src).toContain('+ 장면');
  });
});

describe('D3 — 알림이 실제로 슬롯 문구를 쓴다', () => {
  it('스케줄러가 resolveSlotPromptText 를 부른다(죽은 코드가 아니다)', () => {
    const src = read('src/adapters/hooks/useReminderScheduler.ts');
    expect(src).toContain('resolveSlotPromptText');
    expect(src).toContain('emptySlots(');
  });
});

describe('D5 — 저장한 슬롯을 보고 고칠 수 있다', () => {
  const src = read('src/adapters/components/ClassManagement/ObservationCard.tsx');

  it('카드가 슬롯을 표시한다', () => {
    // 되돌릴 길이 없으면 "부담 없이 한 번 탭"이라는 설계 의도와 어긋난다.
    expect(src).toContain('record.slots ?? []');
  });

  it('편집 모드에서 슬롯을 토글할 수 있다', () => {
    expect(src).toContain('setEditSlots');
  });

  it('전부 해제하면 칸 자체를 지운다(부재 != 빈 배열)', () => {
    expect(src).toContain('const { slots: _prev, ...rest } = record');
    expect(src).toContain('editSlots.length > 0 ? { slots: editSlots } : {}');
  });
});

describe.skipIf(!hasBridge)(
  'D4 — 브릿지가 창고 슬롯을 AI 에게 보낸다 (브릿지 저장소가 있을 때만)',
  () => {
    it('get_record_evidence 응답에 슬롯이 실린다', () => {
      const src = read(BRIDGE_MCP);
      expect(src).toContain('slots: e.slots.map');
    });

    it('파서 화이트리스트가 슬롯을 살린다', () => {
      const src = read(BRIDGE_CORE);
      expect(src).toContain("Array.isArray(o['slots'])");
    });
  },
);
