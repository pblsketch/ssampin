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
