import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * AtomicJsonFileStore — 파일 단위 atomic JSON read/write
 *
 * Decision 4 (ADR): tmp → fsync → rename → .bak
 *
 * **쓰기 흐름**:
 * 1. JSON을 `${target}.tmp` 에 쓰기
 * 2. `fs.fsync` (디스크 동기화)
 * 3. 기존 `${target}` 존재 시 `${target}.bak` 으로 rename (이전 .bak 덮어씀)
 * 4. `${target}.tmp` → `${target}` rename
 *
 * **읽기**:
 * - `${target}` 파싱 시도. 실패 시 `null` 반환 + `.bak` 보존 확인은 호출자 책임.
 *
 * **손상 감지** (`detectCorruption`):
 * - `${target}` 없음 + `${target}.bak` 존재 + `${target}.tmp` 존재  → 손상 가능 (replay 후보)
 * - `${target}` 파싱 실패 → 손상
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 4
 */
export class AtomicJsonFileStore<T> {
  constructor(private readonly targetPath: string) {}

  get path(): string {
    return this.targetPath;
  }

  get tmpPath(): string {
    return `${this.targetPath}.tmp`;
  }

  get bakPath(): string {
    return `${this.targetPath}.bak`;
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async read(): Promise<T | null> {
    try {
      const buf = await fs.readFile(this.targetPath, 'utf8');
      return JSON.parse(buf) as T;
    } catch {
      return null;
    }
  }

  /** atomic write. 실패 시 throw. */
  async write(value: T): Promise<void> {
    const dir = path.dirname(this.targetPath);
    await fs.mkdir(dir, { recursive: true });
    const json = JSON.stringify(value, null, 2);

    // 1. tmp에 쓰기 + fsync
    const fh = await fs.open(this.tmpPath, 'w');
    try {
      await fh.writeFile(json, 'utf8');
      await fh.sync();
    } finally {
      await fh.close();
    }

    // 2. 기존 target → .bak (있을 때만)
    try {
      await fs.access(this.targetPath);
      // 이전 .bak이 있으면 제거
      try {
        await fs.unlink(this.bakPath);
      } catch {
        /* 없으면 무시 */
      }
      await fs.rename(this.targetPath, this.bakPath);
    } catch {
      /* target 없으면 .bak 생성 스킵 */
    }

    // 3. tmp → target (atomic on POSIX/NTFS)
    await fs.rename(this.tmpPath, this.targetPath);
  }

  /**
   * 손상 감지. 다음 조건들 중 하나라도 만족하면 `corrupt: true` 반환.
   * - target 파싱 실패
   * - target 없음 AND (.tmp 또는 .bak 존재)
   */
  async detectCorruption(): Promise<{
    corrupt: boolean;
    reason: 'parse-failed' | 'target-missing-with-trace' | 'healthy';
    hasBak: boolean;
    hasTmp: boolean;
  }> {
    const [hasTarget, hasBak, hasTmp] = await Promise.all([
      this.exists(),
      this.hasBak(),
      this.hasTmp(),
    ]);

    if (hasTarget) {
      // 파싱 시도
      try {
        const buf = await fs.readFile(this.targetPath, 'utf8');
        JSON.parse(buf);
        return { corrupt: false, reason: 'healthy', hasBak, hasTmp };
      } catch {
        return { corrupt: true, reason: 'parse-failed', hasBak, hasTmp };
      }
    }
    if (hasBak || hasTmp) {
      return { corrupt: true, reason: 'target-missing-with-trace', hasBak, hasTmp };
    }
    return { corrupt: false, reason: 'healthy', hasBak: false, hasTmp: false };
  }

  async hasBak(): Promise<boolean> {
    try {
      await fs.access(this.bakPath);
      return true;
    } catch {
      return false;
    }
  }

  async hasTmp(): Promise<boolean> {
    try {
      await fs.access(this.tmpPath);
      return true;
    } catch {
      return false;
    }
  }

  /** .bak을 target으로 복원 (Option α 복원 CTA의 '백업에서 복원'). */
  async restoreFromBak(): Promise<boolean> {
    if (!(await this.hasBak())) return false;
    try {
      await fs.unlink(this.targetPath);
    } catch {
      /* target 없으면 무시 */
    }
    try {
      await fs.unlink(this.tmpPath);
    } catch {
      /* tmp 없으면 무시 */
    }
    await fs.copyFile(this.bakPath, this.targetPath);
    return true;
  }

  /** 모든 흔적 제거 ('초기화 후 새로 시작'). */
  async wipeAll(): Promise<void> {
    for (const p of [this.targetPath, this.bakPath, this.tmpPath]) {
      try {
        await fs.unlink(p);
      } catch {
        /* 없으면 무시 */
      }
    }
  }
}
