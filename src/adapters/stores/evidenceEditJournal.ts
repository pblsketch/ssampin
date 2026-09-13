import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { InquiryThread } from '@domain/entities/InquiryThread';
export type EvidenceWrite =
  | { kind: 'evidence'; before: readonly RecordEvidence[]; after: readonly RecordEvidence[] }
  | { kind: 'threads'; before: readonly InquiryThread[]; after: readonly InquiryThread[] };
const listeners = new Set<(event: EvidenceWrite) => void>();
export function publishEvidenceWrite(event: EvidenceWrite): void {
  for (const listener of listeners) listener(event);
}
export function subscribeEvidenceWrites(listener: (event: EvidenceWrite) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function historyRecordKey(record: { readonly updatedAt: number } | undefined): string {
  if (!record) return 'missing';
  const { updatedAt: _time, ...value } = record;
  return JSON.stringify(value);
}
type RecordValue = RecordEvidence | InquiryThread;
interface Change {
  before: RecordValue | undefined;
  after: RecordValue | undefined;
}
/** 메모리 리로드가 아니라 성공한 저장의 실제 변경분만 수집한다. */
export class EvidenceEditJournal {
  collecting = false;
  private conflict = false;
  allowed: ReadonlySet<string>;
  private evidence = new Map<string, Change>();
  private threads = new Map<string, Change>();
  constructor(
    studentRef: string | null,
    readonly scope = '',
  ) {
    this.allowed = new Set(studentRef ? [studentRef] : []);
  }
  start(): void {
    this.conflict = false;
    this.evidence.clear();
    this.threads.clear();
    this.collecting = true;
  }
  collect(event: EvidenceWrite): void {
    if (!this.collecting) return;
    const changes = event.kind === 'evidence' ? this.evidence : this.threads;
    const beforeById = new Map(event.before.map((record) => [record.id, record]));
    const afterById = new Map(event.after.map((record) => [record.id, record]));
    for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
      const before = beforeById.get(id);
      const after = afterById.get(id);
      if (before === after) continue;
      if (
        !this.allowed.has((after ?? before)?.studentRef ?? '') ||
        historyRecordKey(before) === historyRecordKey(after)
      )
        continue;
      const previous = changes.get(id);
      if (previous && historyRecordKey(previous.after) !== historyRecordKey(before))
        this.conflict = true;
      changes.set(id, { before: previous ? previous.before : before, after });
    }
  }
  finish() {
    this.collecting = false;
    return {
      conflict: this.conflict,
      before: {
        evidence: [...this.evidence.values()].flatMap((change) =>
          change.before ? [change.before as RecordEvidence] : [],
        ),
        threads: [...this.threads.values()].flatMap((change) =>
          change.before ? [change.before as InquiryThread] : [],
        ),
      },
      after: {
        evidence: [...this.evidence.values()].flatMap((change) =>
          change.after ? [change.after as RecordEvidence] : [],
        ),
        threads: [...this.threads.values()].flatMap((change) =>
          change.after ? [change.after as InquiryThread] : [],
        ),
      },
    };
  }
}
