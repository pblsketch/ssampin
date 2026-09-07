/**
 * 원본 기록과 정리한 근거가 지금 다른가 (계획 §5.3).
 *
 * ★영구 baseline 을 저장하지 않는다. "언제 누가 바꿨는지"를 추적하려면 기준 스냅샷과 이력이
 *   필요한데, 그건 이번 범위 밖이고 데이터 모델을 크게 늘린다. 대신 **지금 두 값을 비교**한다.
 *   그래서 화면도 "어느 쪽이 언제 바뀌었다"고 말하지 않고 "내용이 달라요"라고만 말한다.
 *
 * 비교 대상은 `content` · `date` · `slots` 세 개뿐이다. 태그·분류는 근거 본문 projection 에
 * 없으므로 비교하지 않는다 - 넣으면 "달라요"가 늘 켜져 있어 표시가 무의미해진다.
 */

export interface ComparableRecordFields {
  readonly content: string;
  readonly date?: string | null;
  readonly slots?: readonly string[] | null;
}

export interface NormalizedRecordFields {
  readonly content: string;
  readonly date: string;
  readonly slots: readonly string[];
}

/**
 * 비교용 정규화.
 *
 * - 본문: **줄바꿈만** LF 로 통일한다. 앞뒤 공백이나 글자는 손대지 않는다 -
 *   교사가 일부러 넣은 띄어쓰기까지 지우면 "같다"고 잘못 말한다.
 * - 날짜: 부재·null·빈 문자열을 모두 같은 것으로 본다(계획 §5.3 "날짜 부재는 빈 값과 동등").
 * - 장면: 중복을 없애고 정렬한다. 순서만 다른 것은 같은 것이다.
 *   저장에서는 부재와 빈 배열이 다르지만(병합 계약), **비교에서는 둘 다 "장면 없음"이다.**
 */
export function normalizeForComparison(fields: ComparableRecordFields): NormalizedRecordFields {
  return {
    content: fields.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
    date: fields.date ?? '',
    slots: [...new Set(fields.slots ?? [])].sort(),
  };
}

/** 두 쪽의 세 필드가 같은가. 같으면 화면은 '원본과 내용 같음'을 상세에서만 말한다. */
export function isSameAsSource(
  source: ComparableRecordFields,
  evidence: ComparableRecordFields,
): boolean {
  const a = normalizeForComparison(source);
  const b = normalizeForComparison(evidence);
  return (
    a.content === b.content &&
    a.date === b.date &&
    a.slots.length === b.slots.length &&
    a.slots.every((s, i) => s === b.slots[i])
  );
}

/** 어느 필드가 다른지 - 비교창이 바뀔 값만 보여 주는 데 쓴다. */
export interface SourceFieldDiff {
  readonly content: boolean;
  readonly date: boolean;
  readonly slots: boolean;
}

export function diffFromSource(
  source: ComparableRecordFields,
  evidence: ComparableRecordFields,
): SourceFieldDiff {
  const a = normalizeForComparison(source);
  const b = normalizeForComparison(evidence);
  return {
    content: a.content !== b.content,
    date: a.date !== b.date,
    slots: a.slots.length !== b.slots.length || a.slots.some((s, i) => s !== b.slots[i]),
  };
}

/**
 * 비교창을 열 때 잡아 두는 확인용 값(계획 §5.3).
 * 반영 직전에 이 값과 최신을 다시 대조해 **열어 둔 사이에 바뀌었는지**를 본다.
 * 영구 baseline 이 아니라 열린 대화상자의 낡은 확인을 막는 검사다.
 */
export interface ComparisonCapture {
  readonly sourceId: string;
  readonly evidenceId: string;
  readonly studentRef: string;
  readonly source: NormalizedRecordFields;
  readonly evidence: NormalizedRecordFields;
}

export type ComparisonRecheck =
  | { readonly ok: true }
  /** 어느 한쪽이 바뀌었다. **쓰지 않고** 비교를 갱신한 뒤 다시 확인받는다. */
  | { readonly ok: false; readonly reason: 'changed' }
  /** 어느 한쪽이 사라졌거나 주인이 달라졌다. 역시 쓰지 않는다. */
  | { readonly ok: false; readonly reason: 'missing' };

/**
 * 반영 직전 재검증. 캡처한 값과 **지금 읽은 값**을 대조한다.
 *
 * ★한쪽이라도 없으면 쓰지 않는다. 읽기 실패와 "정말 없음"을 호출부가 구별해 넘겨야 한다 -
 *   읽기 실패를 '삭제됨'으로 처리하면 멀쩡한 근거를 지운 것처럼 말하게 된다.
 */
export function recheckBeforeApply(
  capture: ComparisonCapture,
  latest: {
    readonly source: (ComparableRecordFields & { readonly studentRef: string }) | null;
    readonly evidence: (ComparableRecordFields & { readonly studentRef: string }) | null;
  },
): ComparisonRecheck {
  if (latest.source === null || latest.evidence === null) return { ok: false, reason: 'missing' };
  if (
    latest.source.studentRef !== capture.studentRef ||
    latest.evidence.studentRef !== capture.studentRef
  ) {
    return { ok: false, reason: 'missing' };
  }
  const nowSource = normalizeForComparison(latest.source);
  const nowEvidence = normalizeForComparison(latest.evidence);
  const same = (a: NormalizedRecordFields, b: NormalizedRecordFields): boolean =>
    a.content === b.content &&
    a.date === b.date &&
    a.slots.length === b.slots.length &&
    a.slots.every((s, i) => s === b.slots[i]);
  if (!same(nowSource, capture.source) || !same(nowEvidence, capture.evidence)) {
    return { ok: false, reason: 'changed' };
  }
  return { ok: true };
}
