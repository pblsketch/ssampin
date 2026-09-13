export interface EditHistoryEntry<S> {
  readonly before: S;
  readonly after: S;
  readonly label: string;
}

/** 한 사용자 동작 안의 여러 저장을 합친다. 저장 실패 후 남은 변경도 기록한다. */
export class EditHistory<S> {
  private past: EditHistoryEntry<S>[] = [];
  private future: EditHistoryEntry<S>[] = [];
  private depth = 0;
  private restoring = false;
  private active: { before: S; label: string } | null = null;
  constructor(
    private readonly capture: () => S,
    private readonly same: (a: S, b: S) => boolean,
    private readonly apply: (expected: S, target: S) => Promise<void>,
    private readonly notify: () => void,
    private readonly limit = 50,
    private readonly lifecycle?: {
      start: () => void;
      finish: (before: S, after: S) => { before: S; after: S };
    },
  ) {}
  get busy(): boolean {
    return this.depth > 0 || this.restoring;
  }
  get canUndo(): boolean {
    return !this.busy && this.past.length > 0;
  }
  get canRedo(): boolean {
    return !this.busy && this.future.length > 0;
  }
  get undoLabel(): string {
    return this.past.at(-1)?.label ?? '';
  }
  get redoLabel(): string {
    return this.future.at(-1)?.label ?? '';
  }
  async run<T>(label: string, action: () => Promise<T>): Promise<T> {
    if (this.restoring) throw new Error('되돌리는 중입니다. 잠시 후 다시 해 주세요.');
    if (this.depth === 0) {
      this.lifecycle?.start();
      this.active = { before: this.capture(), label };
    }
    this.depth++;
    this.notify();
    try {
      return await action();
    } finally {
      this.depth--;
      if (this.depth === 0 && this.active) {
        const raw = { before: this.active.before, after: this.capture() };
        const { before, after } = this.lifecycle?.finish(raw.before, raw.after) ?? raw;
        const label = this.active.label;
        this.active = null;
        if (!this.same(before, after)) {
          this.past.push({ before, after, label });
          if (this.past.length > this.limit) this.past.shift();
          this.future = [];
        }
      }
      this.notify();
    }
  }
  async travel(direction: 'undo' | 'redo'): Promise<boolean> {
    if (this.busy) return false;
    const source = direction === 'undo' ? this.past : this.future;
    const target = direction === 'undo' ? this.future : this.past;
    const entry = source.at(-1);
    if (!entry) return false;
    this.restoring = true;
    this.notify();
    try {
      await this.apply(
        direction === 'undo' ? entry.after : entry.before,
        direction === 'undo' ? entry.before : entry.after,
      );
      source.pop();
      target.push(entry);
      return true;
    } finally {
      this.restoring = false;
      this.notify();
    }
  }
}
