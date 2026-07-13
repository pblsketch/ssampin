/**
 * 출결 사유 키워드 반복 경고 (M2) — 같은 달·같은 학생의 선행 기록에서
 * 등록 키워드가 다시 등장하면 경고 대상으로 판정한다. 저장은 차단하지 않는다
 * (비차단 안내 전용 — 규정 판단은 하지 않고 사실만 알린다).
 *
 * 매칭 의미: substring · 대소문자 무시(toLowerCase 정규화, 한글은 영향 없음).
 * 단어 경계는 없다 — "원"을 등록하면 "병원/학원"도 매치되므로, 오탐 완화는
 * 사용자가 구체적인 키워드를 등록하는 것으로 한다(기본 제공 키워드 0개).
 */

/** 월-스캔 입력 한 건 — 호스트가 해당 월 출결 기록에서 추출해 전달한다. */
export interface KeywordScanEntry {
  /** 기록 날짜 (YYYY-MM-DD) */
  readonly date: string;
  readonly studentNumber: number;
  /** 사유·비고를 결합한 텍스트 */
  readonly text: string;
}

export interface RepeatedKeywordHit {
  readonly keyword: string;
  /** 같은 달 선행 기록 중 가장 최근 날짜 (YYYY-MM-DD) */
  readonly priorDate: string;
}

/**
 * 저장 중인 텍스트에 등록 키워드가 포함되고, 같은 달·같은 학생·다른 날짜의
 * 선행 기록에도 같은 키워드가 있으면 첫 매치를 반환한다. 없으면 null.
 *
 * - 같은 날짜 엔트리는 제외한다(지금 편집 중인 기록 자신).
 * - 월 경계: date의 YYYY-MM이 다른 기록은 보지 않는다(전월 기록 무경보).
 */
export function findRepeatedKeyword(args: {
  entries: readonly KeywordScanEntry[];
  keywords: readonly string[];
  studentNumber: number;
  /** 저장 중인 날짜 (YYYY-MM-DD) */
  date: string;
  /** 저장 중인 사유·비고 텍스트 */
  text: string;
}): RepeatedKeywordHit | null {
  const { entries, keywords, studentNumber, date, text } = args;
  const month = date.slice(0, 7);
  const normText = text.toLowerCase();

  for (const raw of keywords) {
    const keyword = raw.trim();
    const kw = keyword.toLowerCase();
    if (!kw) continue;
    if (!normText.includes(kw)) continue;

    let priorDate: string | null = null;
    for (const e of entries) {
      if (e.studentNumber !== studentNumber) continue;
      if (e.date === date) continue;
      if (e.date.slice(0, 7) !== month) continue;
      if (!e.text.toLowerCase().includes(kw)) continue;
      if (priorDate == null || e.date > priorDate) priorDate = e.date;
    }
    if (priorDate != null) return { keyword, priorDate };
  }
  return null;
}
