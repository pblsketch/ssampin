/**
 * 관찰 기록 '한 바퀴'의 끝 지점 — 끝난 바퀴를 고정하는 기준(ADR-135).
 *
 * 지금 바퀴는 기록에서 그때그때 계산하지만, **끝난 바퀴는 바뀌지 않아야** 한다.
 * 전입생·빼기에서 돌아온 학생·지난 날짜로 더한 기록 때문에 이미 끝난 바퀴가 풀리면
 * 선생님이 칠한 칸이 지워진 것처럼 보인다. 그래서 끝 지점만 따로 저장한다.
 *
 * ★설정 파일에 넣지 않는다. 설정 동기화는 파일 통째로 한쪽이 이기는 방식이라, 앱이 저절로
 *   쓰는 값을 넣으면 컴퓨터끼리 설정이 부딪혀 다른 설정 변경이 사라질 수 있다.
 */

/** 마지막 바퀴를 끝낸 기록의 정렬 위치 — (date, createdAt, recordId) 순서 그대로. */
export interface LapBoundary {
  /** 기록에 적힌 날짜 'YYYY-MM-DD' */
  readonly date: string;
  /** 기록을 만든 시각(ms). 담임 기록의 ISO 문자열도 ms 로 바꿔 둔다. */
  readonly createdAt: number;
  readonly recordId: string;
}

export interface LapMark {
  /** 담임반: 'homeroom' / 수업반: `subject:${classId}` */
  readonly card: string;
  /** 학기 라벨 'YYYY-S' (예: '2026-2') */
  readonly term: string;
  /** 이 학기에 이 카드가 끝낸 바퀴 수 (1 이상) */
  readonly completed: number;
  readonly boundary: LapBoundary;
}

/**
 * 동기화 파일('observation-laps') 내용. 같은 (card, term) 은 하나만 둔다.
 * 필드 이름이 `records` 인 것은 다른 병합형 동기화 파일과 같은 병합 도구를 쓰기 위해서다.
 */
export interface LapMarkData {
  readonly records: readonly LapMark[];
}

export const EMPTY_LAP_MARK_DATA: LapMarkData = { records: [] };
