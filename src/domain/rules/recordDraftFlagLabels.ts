/**
 * 생기부 초안 검토 플래그 코드 → 교사용 한국어 라벨.
 *
 * 화면(`RecordDraftView.tsx`)에 박혀 있던 것을 도메인으로 옮겼다 — 점검 규칙이 늘어날 때(T4)
 * 라벨을 더하려고 화면 파일을 건드리지 않게 하기 위해서다(병렬 세션 파일 소유권 분리).
 * 플래그는 **승인 신호가 아니라 경고**다. 막지 않고 눈에 띄게 알린다(ADR-072 결정 5-b).
 * 미지값은 일반 라벨로 폴백해 새 코드가 먼저 들어와도 화면이 깨지지 않는다.
 */
export const RECORD_DRAFT_FLAG_LABELS: Readonly<Record<string, string>> = {
  // NEIS 에 들어가면 감사 대상이 되는 항목이 본문에 남아 있다는 뜻. 막지는 않는다(오탐 대비) —
  // 대신 가장 눈에 띄게 띄우고 무엇이 걸렸는지 아래에 적어 준다.
  prohibited_item: '생기부에 적으면 안 되는 항목',
  unverified_high_risk_term: '확인되지 않은 고위험 표현',
  pii_leak: '개인정보 노출 우려',
  low_overlap: '근거와 일치도 낮음',

  // ── 서사 품질 점검(T4, `recordNarrativeChecks.ts`). 전부 경고이며 저장을 막지 않는다.
  //    "이 문장을 다른 학생 학생부에 옮겨도 말이 되는가"(오너 기준 K14)를 코드가 대신 묻는 축이다.
  standard_text_copied: '성취기준 문장 복사 의심',
  shared_boilerplate: '다른 학생과 같은 문장',
  generic_praise: '장면 없는 일반 평가',
  activity_list_no_question: '질문 없는 활동 나열',
  change_without_basis: '근거 없는 변화 서술',
  unobservable_inner_state: '관찰할 수 없는 표현',
};

export const RECORD_DRAFT_FLAG_FALLBACK_LABEL = '기타 확인 필요 항목';

export function recordDraftFlagLabel(flag: string): string {
  return RECORD_DRAFT_FLAG_LABELS[flag] ?? RECORD_DRAFT_FLAG_FALLBACK_LABEL;
}
