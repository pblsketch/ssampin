/**
 * 시작 스냅샷으로 되돌린 자료의 알림 문구(ADR-148).
 *
 * 원본·백업이 모두 깨진 자료를 메인 프로세스가 그날 처음 켰을 때의 상태(시작 스냅샷)로 되돌리면,
 * 메인 창이 한 번 알린다. 자료 이름은 '동기화 충돌' 창과 같은 표(`dataFileLabels.ts`)를 쓴다.
 * 토스트는 줄바꿈을 그리지 않으므로 한 문단으로 짧게 쓴다.
 */
import { dataFileLabel } from './dataFileLabels';

/** 복원 기록 한 건(메인 프로세스 `backups/restore-log` 의 화면 쪽 모양). */
export interface RestoredDataRecord {
  readonly id: string;
  /** 자료 이름(데이터 파일 이름 — 동기화 키와 같다). */
  readonly file: string;
  /** 되돌린 상태의 시각(스냅샷이 찍힌 시각, ISO). */
  readonly snapshotModifiedAt: string;
  readonly notified: boolean;
  readonly syncResolved: boolean;
}

/** '동기화 충돌' 창에서 복원 보호로 올린 충돌의 "이 기기" 아래 안내 한 줄. */
export const RESTORED_CONFLICT_NOTE =
  '이 기기 자료는 읽을 수 없어 옛 상태로 되돌린 거예요. 클라우드가 더 새로우면 [클라우드로 대체]를 고르세요.';

/** "11월 10일 오후 1시 41분" — 이 PC 의 시간대. 정각이면 분을 뺀다. 날짜가 아니면 null. */
export function formatRestoredStateTime(iso: string): string | null {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return null;
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const meridiem = hours < 12 ? '오전' : '오후';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const clock = minutes === 0 ? `${hour12}시` : `${hour12}시 ${minutes}분`;
  return `${time.getMonth() + 1}월 ${time.getDate()}일 ${meridiem} ${clock}`;
}

const TAIL = '그 뒤에 바꾼 내용은 빠졌을 수 있으니 확인해 주세요.';
const SYNC_TAIL =
  "다른 기기에 더 새 자료가 있으면 '동기화 충돌' 창에서 [클라우드로 대체]를 골라 주세요.";

export interface RestoredDataNoticeOptions {
  /** 구글 드라이브 동기화가 켜져 있는가 — 켜져 있을 때만 충돌 창 안내를 덧붙인다. */
  readonly driveSyncOn?: boolean;
}

/**
 * 알림 문구. 여러 자료를 한 문장에 묶는다. 알릴 것이 없으면 null.
 *
 *  - 시각이 같으면: 「할 일·일정 자료를 읽을 수 없어 11월 10일 오후 1시 41분 상태로 되돌렸어요. …」
 *  - 두 자료의 시각이 다르면: 「할 일(11월 10일 오후 1시 41분)·출결(11월 9일 오전 8시 2분) 자료를 읽을 수 없어 그때 상태로 되돌렸어요. …」
 *  - 세 자료 이상이고 시각이 다르면 이름만 나열하고 가장 이른 시각만 적는다.
 *  - 표에 없는 자료는 「일부」로 부른다.
 */
export function buildRestoredDataNotice(
  records: readonly Pick<RestoredDataRecord, 'file' | 'snapshotModifiedAt'>[],
  options: RestoredDataNoticeOptions = {},
): string | null {
  // 같은 자료가 두 번 있으면 한 번만 말한다(나중 기록의 시각).
  const byFile = new Map<string, string>();
  for (const record of records) byFile.set(record.file, record.snapshotModifiedAt);
  if (byFile.size === 0) return null;

  const items = [...byFile.entries()].map(([file, iso]) => ({
    label: dataFileLabel(file),
    iso,
    time: formatRestoredStateTime(iso),
  }));
  const known = items.filter((item) => item.label !== null);
  const hasUnknown = known.length < items.length;
  const names =
    known.length === 0
      ? '일부'
      : `${known.map((item) => item.label).join('·')}${hasUnknown ? ' 등' : ''}`;

  const times = new Set(items.map((item) => item.time));
  const [first] = items;
  let head: string;
  if (times.size === 1 && first !== undefined && first.time !== null) {
    head = `${names} 자료를 읽을 수 없어 ${first.time} 상태로 되돌렸어요.`;
  } else if (items.length === 2 && !hasUnknown && items.every((item) => item.time !== null)) {
    const pair = items.map((item) => `${item.label}(${item.time})`).join('·');
    head = `${pair} 자료를 읽을 수 없어 그때 상태로 되돌렸어요.`;
  } else {
    const dated = items
      .filter((item) => item.time !== null)
      .sort((a, b) => Date.parse(a.iso) - Date.parse(b.iso));
    const earliest = dated[0]?.time;
    head =
      earliest === undefined || earliest === null
        ? `${names} 자료를 읽을 수 없어 이전에 저장해 둔 상태로 되돌렸어요.`
        : `${names} 자료를 읽을 수 없어 이전에 저장해 둔 상태로 되돌렸어요(가장 이른 것 ${earliest}).`;
  }
  return options.driveSyncOn ? `${head} ${TAIL} ${SYNC_TAIL}` : `${head} ${TAIL}`;
}
