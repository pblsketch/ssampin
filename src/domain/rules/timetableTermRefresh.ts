/**
 * 시간표 학기 갱신 안내 판정 (순수 규칙).
 *
 * 시간표는 학기가 바뀌어도 저절로 바뀌지 않는다 — 원본(NEIS·컴시간·압핀)은 학교가 올려야 하고,
 * 쌤핀은 지금 쓰는 한 벌만 들고 있다. 그래서 학기가 넘어가면 지난 학기 표를 계속 보게 되는데
 * 그 사실을 알리는 곳이 없었다.
 *
 * ⚠️ "낡았다"고 단정하지 않는다. 8월 개학처럼 실제 학기 시작은 학교마다 다르고 앱은 그걸 모른다
 * (ADR-037 — 개학일로 구간을 단정하지 않는다). 그래서 판정은 "물어볼 때인가"까지만 하고,
 * 최종 답은 사용자가 한다(갱신했다고 답하면 그 학기는 다시 묻지 않는다).
 */

/** 안내 판정에 필요한 입력 */
export interface TimetableTermRefreshInput {
  /** 현재 학기 라벨('2026-1') — 호출자가 settings.currentTerm ?? academicTerm() 으로 결정한다. */
  readonly currentTerm: string;
  /** 시간표가 최신임을 확인한 학기 라벨. 미설정이면 아직 스탬프가 없는 상태. */
  readonly ackedTerm: string | undefined;
  /** 시간표에 실제 내용이 있는지 — 빈 시간표에는 "갱신하세요"가 의미 없다. */
  readonly hasTimetableData: boolean;
}

export type TimetableTermRefreshAction =
  /** 아무것도 하지 않는다 */
  | { readonly kind: 'none' }
  /** 배너 없이 조용히 현재 학기로 스탬프만 남긴다 (구버전 이력·빈 시간표) */
  | { readonly kind: 'silent-stamp'; readonly term: string }
  /** 갱신 여부를 묻는 배너를 띄운다 */
  | { readonly kind: 'ask'; readonly fromTerm: string; readonly toTerm: string };

/**
 * 시간표 화면 진입 시 무엇을 할지 결정한다.
 *
 * - 스탬프 없음 → 조용히 현재 학기로 채운다. 업데이트 직후 전원에게 배너를 띄우면
 *   "이미 최신인 사람"까지 붙잡게 되므로, 다음 학기 전환부터 정상 동작시킨다.
 * - 스탬프 == 현재 학기 → 할 일 없음.
 * - 스탬프 != 현재 학기 → 묻는다. 단 시간표가 비어 있으면 물을 것이 없으므로 스탬프만 갱신한다.
 */
export function decideTimetableTermRefresh(
  input: TimetableTermRefreshInput,
): TimetableTermRefreshAction {
  const { currentTerm, ackedTerm, hasTimetableData } = input;

  if (!currentTerm) return { kind: 'none' };
  if (ackedTerm === currentTerm) return { kind: 'none' };
  if (ackedTerm === undefined) return { kind: 'silent-stamp', term: currentTerm };
  if (!hasTimetableData) return { kind: 'silent-stamp', term: currentTerm };

  return { kind: 'ask', fromTerm: ackedTerm, toTerm: currentTerm };
}
