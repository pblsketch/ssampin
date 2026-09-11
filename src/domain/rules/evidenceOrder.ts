/**
 * 근거를 늘어놓는 **정본 순서** — 날짜 오름차순, 날짜 없는 것은 뒤로, 같으면 적힌 시각, 그다음 id.
 *
 * 왜 규칙 층에 있나: 요청서 조립(`services/recordDraftPack.ts`)과 흐름 화면의 "아직 안 놓음"
 * (`rules/narrativeScenes.ts`)이 **같은 순서**를 봐야 한다. 실측에서 초안 품질을 가른 것은 근거의
 * 양이 아니라 줄기 순서로 정렬돼 있는가였는데(ADR-083), 화면과 요청서가 다른 순서를 보면
 * 선생님이 본 것과 AI 가 받은 것이 갈린다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지.
 */

/** 순서를 정하는 데 필요한 것만 — 엔티티 전체를 요구하지 않는다. */
export interface EvidenceOrderLike {
  readonly id: string;
  /** YYYY-MM-DD. 없으면 "언제인지 모르는 것"이라 맨 뒤로 민다. */
  readonly date?: string;
  readonly createdAt?: number;
}

export function compareEvidenceOrder(a: EvidenceOrderLike, b: EvidenceOrderLike): number {
  const da = a.date?.trim() ?? '';
  const db = b.date?.trim() ?? '';
  if (da !== db) {
    // 빈 문자열은 사전순으로 맨 앞이므로 **여기서 뒤집어야** "무날짜는 뒤"가 된다.
    if (da.length === 0) return 1;
    if (db.length === 0) return -1;
    return da < db ? -1 : 1;
  }
  // 모르는 시각도 같은 이유로 뒤로. 마지막 id 비교가 순서를 완전히 결정적으로 만든다.
  const ca = a.createdAt ?? Number.MAX_SAFE_INTEGER;
  const cb = b.createdAt ?? Number.MAX_SAFE_INTEGER;
  if (ca !== cb) return ca - cb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByEvidenceOrder<T extends EvidenceOrderLike>(
  items: readonly T[],
): readonly T[] {
  return [...items].sort(compareEvidenceOrder);
}
