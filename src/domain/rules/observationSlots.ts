/**
 * 관찰 슬롯 — 기록 하나가 "어떤 장면인가"를 한 번의 탭으로 붙이는 축.
 *
 * ★왜 태그가 아니라 별도 축인가: `StudentRecord.tags` 는 이미 "세부 분류"로 쓰이고 있고
 * (`InlineRecordEditor.tsx` — 화면 라벨도 "세부 항목 / 태그"), 거기에 슬롯을 섞으면 한 배열에
 * 두 의미가 뒤섞인다. 이 저장소가 P3 로 경계해 온 안티패턴이다(`UnifiedRecordDraft.ts`:
 * "category 값을 tags 배열에 절대 혼입 금지"). 태그로 가면 태그별 표 열을 그리는 통계 화면도
 * 넘친다. 설계: `docs/02-design/features/observation-slots.design.md` §3.
 *
 * ★왜 필요한가: 실측에서 "근거만 두꺼우면 AI 품질은 쓸 만하다"가 확인됐다
 * (`docs/03-analysis/record-draft-solar-quality.analysis.md` §5). 병목은 모델이 아니라 **근거의
 * 구조**이고, 그 구조를 입력 단계에서 만든다.
 *
 * ★불가침: 슬롯은 **선택**이다. 안 고르고도 저장된다. 필수로 만들면 입력이 막히고, 그게
 * 기록이 안 쌓이는 길이다 — 기록이 안 쌓이면 AI 도 소용없다(ADR-072 결정 6).
 *
 * 이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */

/** 작성 맥락 — 교과(수업반) 세특용 / 담임 행특용. 필요한 장면이 다르다. */
export type SlotContext = 'teaching' | 'homeroom';

/**
 * 교과(수업반) 슬롯 — 세특 서사의 갈래.
 * 오너 생기부 프롬프트의 교과세특용 입력 양식을 옮긴 것이다.
 */
export const TEACHING_SLOTS = [
  '질문', // 학생이 던진 의문·꼬리 질문
  '시도', // 해 본 것, 고른 것
  '시행착오', // 안 된 것, 고쳐 간 과정
  '산출물', // 보고서·발표·제작물
  '피드백', // 교사와의 주고받음 — 되물음·조언에 학생이 어떻게 반응했나
  '융합', // 다른 교과·영역과 이어진 지점
] as const;

/**
 * 담임 슬롯 — 행동특성 및 종합의견 서사의 갈래.
 *
 * ★`변화` 는 값이 두 가지다. 재료 분류이면서 동시에 **"변화 서사를 써도 되는가"의 근거
 * 표식**이다. 기재요령상 변화 서술은 시기 대비가 관찰된 경우에만 쓸 수 있는데, 실측에서
 * 모델이 근거 없이 변화 서사를 지어내는 경향이 확인됐다(D 사례). 이 슬롯이 붙어 있어야
 * "변화를 써도 되는 근거가 있다"는 뜻이 된다.
 */
export const HOMEROOM_SLOTS = [
  '학습 태도', // 태도가 드러난 장면
  '인성·관계', // 구체적 사건
  '학급 역할', // 제안 → 실제로 한 일
  '변화', // ★시기 대비가 관찰된 경우에만
  '아쉬운 점', // 있으면
  '진로', // 관심이 드러난 모습
] as const;

/**
 * 맥락별 **기본** 슬롯 목록(칩 표시 순서).
 *
 * ★알림이 "비었다"고 재촉하는 기준은 이 기본 목록뿐이다. 교사가 직접 추가한 슬롯까지
 * 재촉하면 빈 슬롯이 항상 많아져 알림이 의미를 잃는다(설계서 §4).
 */
export function slotsForContext(context: SlotContext): readonly string[] {
  return context === 'teaching' ? TEACHING_SLOTS : HOMEROOM_SLOTS;
}

/**
 * 화면에 보여줄 전체 슬롯 = 기본 + 교사가 추가한 것. 중복은 기본 쪽을 남긴다.
 * `customTags`·`customCategories` 와 같은 방식이다 — 축 하나만 고정이면 앱이 어색해진다.
 */
export function allSlotsForContext(
  context: SlotContext,
  customSlots: readonly string[] = [],
): string[] {
  const base = slotsForContext(context);
  const seen = new Set<string>(base);
  const out = [...base];
  for (const c of customSlots) {
    const v = c.trim();
    if (v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** 저장해도 되는 슬롯인지 — 기본이거나 교사가 추가한 것이어야 한다. */
export function isValidSlot(
  slot: string,
  context: SlotContext,
  customSlots: readonly string[] = [],
): boolean {
  return allSlotsForContext(context, customSlots).includes(slot);
}

/**
 * 저장 직전 정규화 — 중복 제거(첫 등장 순서 보존) + 목록에 없는 값 제거.
 *
 * 빈 배열이 나올 수 있고 **빈 배열은 정상이다**(슬롯 미선택). 호출자는 빈 배열이면 필드를
 * 아예 넣지 않아 구 데이터와 같은 모양(부재)으로 저장한다.
 */
export function normalizeSlots(
  slots: readonly string[],
  context: SlotContext,
  customSlots: readonly string[] = [],
): string[] {
  const allowed = new Set(allSlotsForContext(context, customSlots));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of slots) {
    if (seen.has(s) || !allowed.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * 슬롯 채움 현황 — 통계가 "무엇이 비었나"를 보여줄 때 쓴다.
 * **교사가 추가한 슬롯도 함께 센다**(쓰는 데는 차별이 없다).
 */
export function countSlots(
  records: ReadonlyArray<{ readonly slots?: readonly string[] }>,
  context: SlotContext,
  customSlots: readonly string[] = [],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const slot of allSlotsForContext(context, customSlots)) counts[slot] = 0;
  for (const rec of records) {
    for (const s of rec.slots ?? []) {
      if (s in counts) counts[s] = (counts[s] ?? 0) + 1;
    }
  }
  return counts;
}

/**
 * 아직 한 건도 없는 **기본** 슬롯 — 알림 문구가 가리킬 대상.
 *
 * ★교사가 추가한 슬롯은 제외한다. 선생님이 직접 만든 칸을 "왜 안 채웠냐"고 재촉하면
 * 알림을 꺼 버리게 되고, 그러면 기록 누적 자체가 멈춘다.
 * 표시 순서를 보존하므로 호출자가 앞에서부터 고르면 결정론적이다.
 */
export function emptySlots(
  records: ReadonlyArray<{ readonly slots?: readonly string[] }>,
  context: SlotContext,
): string[] {
  const counts = countSlots(records, context);
  return slotsForContext(context).filter((s) => (counts[s] ?? 0) === 0);
}
