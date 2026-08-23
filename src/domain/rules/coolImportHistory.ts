/**
 * 쿨메신저에서 이미 가져온 항목을 기억하는 규칙 (순수 함수).
 *
 * 저장도 화면도 모르는 계산만 둔다 — 그래서 테스트가 쉽다.
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */
import type {
  CoolImportHistory,
  CoolImportItem,
  CoolImportRecord,
  CoolImportTarget,
} from '@domain/entities/CoolMessage';

/**
 * 기록을 얼마나 오래 보관할지.
 *
 * 쪽지함은 계속 쌓이므로 기록도 무한정 늘어난다. 한 학년도(+여유)면 충분하다 —
 * 그보다 오래된 쪽지를 다시 가져올 일은 사실상 없다.
 */
const KEEP_DAYS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 같은 항목인지 가리는 열쇠 — 쪽지 + 시각 + 어디에 넣었는지 */
export function importKey(messageKey: number, startsAt: string, target: CoolImportTarget): string {
  return `${messageKey}|${startsAt}|${target}`;
}

function recordKey(r: CoolImportRecord): string {
  return importKey(r.messageKey, r.startsAt, r.target);
}

/** 등록할 항목을 기록 형태로 바꾼다 */
export function toRecord(item: CoolImportItem, now: Date): CoolImportRecord {
  return {
    messageKey: item.sourceMessageKey,
    startsAt: item.start.toISOString(),
    target: item.target,
    importedAt: now.toISOString(),
  };
}

/** 빈 기록 */
export const EMPTY_COOL_HISTORY: CoolImportHistory = { records: [] };

/**
 * 기록을 더한다. 같은 항목이 이미 있으면 **덮어쓰지 않는다**(처음 가져온 시각을 남긴다).
 * 더하는 김에 오래된 기록도 함께 정리한다.
 */
export function addRecords(
  history: CoolImportHistory,
  items: readonly CoolImportItem[],
  now: Date,
): CoolImportHistory {
  const seen = new Set(history.records.map(recordKey));
  const added: CoolImportRecord[] = [];
  for (const item of items) {
    const record = toRecord(item, now);
    const key = recordKey(record);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(record);
  }
  return prune({ records: [...history.records, ...added] }, now);
}

/** 오래된 기록을 버린다 */
export function prune(history: CoolImportHistory, now: Date): CoolImportHistory {
  const cutoff = now.getTime() - KEEP_DAYS * DAY_MS;
  const kept = history.records.filter((r) => {
    const t = Date.parse(r.importedAt);
    // 시각을 못 읽는 기록은 버린다 — 언제 것인지 모르면 정리할 수도 없다
    return Number.isFinite(t) && t >= cutoff;
  });
  return kept.length === history.records.length ? history : { records: kept };
}

/** 빠른 조회용 열쇠 모음 */
export function importedKeySet(history: CoolImportHistory): ReadonlySet<string> {
  return new Set(history.records.map(recordKey));
}

/** 이 쪽지에서 무언가라도 가져간 적이 있나 (목록의 '가져옴' 표시용) */
export function importedMessageKeys(history: CoolImportHistory): ReadonlySet<number> {
  return new Set(history.records.map((r) => r.messageKey));
}

/** 저장된 파일이 망가져 있어도 앱이 죽지 않게 걸러 읽는다 */
export function sanitizeHistory(raw: unknown): CoolImportHistory {
  if (typeof raw !== 'object' || raw === null) return EMPTY_COOL_HISTORY;
  const records = (raw as { records?: unknown }).records;
  if (!Array.isArray(records)) return EMPTY_COOL_HISTORY;

  const clean: CoolImportRecord[] = [];
  for (const r of records) {
    if (typeof r !== 'object' || r === null) continue;
    const { messageKey, startsAt, target, importedAt } = r as Record<string, unknown>;
    if (typeof messageKey !== 'number' || !Number.isFinite(messageKey)) continue;
    if (typeof startsAt !== 'string' || !startsAt) continue;
    if (target !== 'event' && target !== 'todo') continue;
    if (typeof importedAt !== 'string' || !importedAt) continue;
    clean.push({ messageKey, startsAt, target, importedAt });
  }
  return { records: clean };
}
