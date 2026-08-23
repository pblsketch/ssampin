/**
 * 쿨메신저 쪽지와 그로부터 만든 등록 후보.
 *
 * `electron/coolMessengerReader.ts`가 돌려주는 것과 **구조가 같다.**
 * electron 쪽은 빌드 단위가 달라 직접 import 하지 않고, 구조가 같으면 통하는
 * TypeScript 특성에 기대어 경계에서 맞춘다.
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */

/** 쿨메신저에서 읽어온 쪽지 한 건 */
export interface CoolMessage {
  readonly key: number;
  readonly sender: string;
  /** 받은 시각 (ISO 8601) */
  readonly receivedAt: string;
  readonly title: string;
  readonly body: string;
  readonly isUnread: boolean;
}

/** 쪽지에서 뽑아 등록할 한 건 — 일정으로 갈지 할일로 갈지 사용자가 정한다 */
export type CoolImportTarget = 'event' | 'todo';

export interface CoolImportItem {
  /** 어느 쪽지에서 왔는지 (중복 등록 방지·추적용) */
  readonly sourceMessageKey: number;
  readonly title: string;
  readonly start: Date;
  readonly end: Date | null;
  readonly allDay: boolean;
  readonly target: CoolImportTarget;
}

/**
 * 이미 가져온 항목 하나의 기록.
 *
 * ## 왜 남기나
 * 이게 없으면 **같은 쪽지를 두 번 가져와도 아무도 모른다.** 목록을 다시 열면 이미
 * 등록한 쪽지가 똑같이 보이고, 무심코 또 누르면 일정이 두 개가 된다.
 *
 * ## 왜 쪽지 번호만으로는 부족한가
 * 한 쪽지에 날짜가 여럿일 수 있다("사전교육 / 체험 당일 / 보고서 제출").
 * 오늘 첫 번째만 가져가고 내일 두 번째를 가져갈 수 있으므로,
 * **쪽지 + 시각 + 어디에 넣었는지**까지 묶어야 정확하다.
 */
export interface CoolImportRecord {
  readonly messageKey: number;
  /** 등록한 항목의 시작 시각 (ISO 8601) */
  readonly startsAt: string;
  readonly target: CoolImportTarget;
  /** 가져온 시각 (ISO 8601) — 오래된 기록 정리에 쓴다 */
  readonly importedAt: string;
}

/** 저장 파일의 모양 */
export interface CoolImportHistory {
  readonly records: readonly CoolImportRecord[];
}
