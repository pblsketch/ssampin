/**
 * 과제수합으로 낸 **파일의 본문**을 뽑아 근거 창고가 쓸 수 있게 만든다.
 *
 * 왜 필요한가 — 같은 파일인데 "관찰 첨부"로 올리면 본문이 들어오고(`ObservationAttachment
 * .extractedText`), "과제수합"으로 내면 파일명만 들어왔다. 학생이 낸 글이 정작 생기부 근거로는
 * 안 보이는 비대칭이었다.
 *
 * 설계에서 지킨 것:
 *  - **새 파서를 만들지 않는다.** 첨부가 쓰는 `IDocumentParserPort.parseBytes`(메인 프로세스
 *    kordoc)를 그대로 쓴다. 그래서 kordoc 이 읽는 형식만 대상이고, 나머지는 내려받지도 않는다.
 *  - **못 하는 것은 실패가 아니라 대기다.** 인터넷이 없거나 데스크톱 앱이 아니면(브라우저 개발
 *    모드) 시도 횟수를 올리지 않고 캐시에 아무것도 남기지 않는다. 안 그러면 한 번 오프라인이었던
 *    제출물이 "실패"로 굳어 온라인으로 돌아와도 영영 다시 하지 않는다.
 *  - **재제출을 놓치지 않는다.** 서버는 다시 낸 파일을 *같은* driveFileId 에 덮어쓰므로 파일 id
 *    만으로는 바뀐 걸 알 수 없다. 캐시 열쇠에 제출 시각·크기를 함께 넣는다.
 *
 * usecases 레이어 — domain 만 import 한다.
 */
import type { Submission } from '@domain/entities/Assignment';
import type { IDocumentParserPort, ParseOutcome } from '@domain/ports/IDocumentParserPort';
import type { ISubmissionFilePort } from '@domain/ports/ISubmissionFilePort';
import { SubmissionFileError } from '@domain/ports/ISubmissionFilePort';
import type {
  ISubmissionTextRepository,
  SubmissionTextRecord,
  SubmissionTextStatus,
} from '@domain/repositories/ISubmissionTextRepository';
import { extensionOf, truncateExtractedText } from '@domain/rules/observationAttachmentRules';
import { FILE_TYPE_EXTENSIONS } from '@domain/valueObjects/FileTypeRestriction';

/**
 * 글자를 뽑을 수 있는 형식 — 메인 프로세스 kordoc 의 `SUPPORTED_EXTENSIONS` 를 **미러**한다
 * (`electron/ipc/markdownConvert.ts`). 렌더러에서 메인 상수를 import 할 수 없어 옮겨 적는다.
 *
 * ★허용 목록이지 금지 목록이 아니다. 과제의 파일 형식 제한이 '전체'면 학생은 .zip·.mp4 도 낼 수
 *  있는데, 금지 목록으로 짜면 그런 파일까지 전부 내려받아 파서에 넘기게 된다.
 */
const PARSABLE_EXTENSIONS: readonly string[] = [
  'hwp',
  'hwpx',
  'hwpml',
  'pdf',
  'xls',
  'xlsx',
  'docx',
];

/**
 * 내려받기 상한 — **서버가 제출 파일을 10MB 로 자른다**(`submit-assignment` 의 MAX_FILE_SIZE).
 * 그보다 큰 제출물은 존재할 수 없으므로 이 값이 실제 안전판이다.
 */
export const SUBMISSION_TEXT_MAX_BYTES = 10 * 1024 * 1024;

/** 한 번에 내려받는 개수. 파싱은 따로 한 건씩 한다(아래 parseQueue). */
const DOWNLOAD_CONCURRENCY = 3;

/** 실패한 제출물을 다시 해 보기까지 기다리는 시간. 새로고침을 눌러도 이 안에는 다시 안 한다. */
export const RETRY_COOLDOWN_MS = 10 * 60 * 1000;

/** 오래된 캐시를 스스로 지우는 기준(학생이 쓴 글을 필요 이상으로 오래 들고 있지 않는다). */
export const CACHE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/** 파일 종류 판정 — 내려받기 전에 결정한다. */
export type SubmissionFileKind = 'parsable' | 'image' | 'unsupported';

export function submissionFileKindOf(fileName: string | null): SubmissionFileKind {
  if (!fileName) return 'unsupported';
  const ext = extensionOf(fileName);
  if (PARSABLE_EXTENSIONS.includes(ext)) return 'parsable';
  if (FILE_TYPE_EXTENSIONS.image.includes(ext)) return 'image';
  return 'unsupported';
}

/** 캐시가 이 제출물의 **지금 상태**를 가리키는가(재제출·파일 교체 감지). */
export function isCacheCurrent(record: SubmissionTextRecord, sub: Submission): boolean {
  return (
    record.driveFileId === (sub.driveFileId ?? '') &&
    record.submittedAt === sub.submittedAt &&
    record.fileSize === sub.fileSize
  );
}

/** 다시 해 볼 필요가 있는 상태인가(영구 확정이 아닌 것). */
function isRetryable(status: SubmissionTextStatus): boolean {
  return status === 'failed';
}

export type ExtractDecision =
  | { readonly kind: 'skip' }
  | { readonly kind: 'settle'; readonly status: SubmissionTextStatus }
  | { readonly kind: 'download' };

/**
 * 이 제출물을 어떻게 할지 정한다(순수 함수 — 테스트로 고정한다).
 *
 * `missing`(드라이브에서 사라짐)은 [다시 시도]로도 되살릴 수 없으므로 force 여도 다시 하지 않는다.
 */
export function decideExtraction(
  sub: Submission,
  record: SubmissionTextRecord | undefined,
  now: number,
  force: boolean,
): ExtractDecision {
  if (!sub.driveFileId || !sub.fileName) return { kind: 'skip' };

  const current = record && isCacheCurrent(record, sub) ? record : undefined;
  if (current) {
    // 이미 본문을 뽑았거나, 다시 해도 낫지 않는 것(파일이 사라짐)은 건드리지 않는다.
    if (current.status === 'ok' || current.status === 'missing') return { kind: 'skip' };
    if (!isRetryable(current.status)) {
      // unsupported·image_only·too_large·empty·scanned — 파일 자체의 성질이라 답이 같다.
      // 교사가 [다시 시도]를 눌렀을 때만 다시 판정한다(대개 내려받지 않고 같은 답이 난다).
      if (!force) return { kind: 'skip' };
    } else if (!force && now - Date.parse(current.updatedAt) < RETRY_COOLDOWN_MS) {
      // 방금 실패한 것을 화면을 열 때마다 다시 때리지 않는다.
      return { kind: 'skip' };
    }
  }

  const kind = submissionFileKindOf(sub.fileName);
  if (kind === 'image') return { kind: 'settle', status: 'image_only' };
  if (kind === 'unsupported') return { kind: 'settle', status: 'unsupported' };
  if (sub.fileSize > SUBMISSION_TEXT_MAX_BYTES) return { kind: 'settle', status: 'too_large' };
  return { kind: 'download' };
}

export interface ExtractSubmissionTextsParams {
  readonly assignmentId: string;
  readonly submissions: readonly Submission[];
  /** 지금 남아 있는 과제 id 들 — 여기 없는 캐시는 스스로 지운다. */
  readonly knownAssignmentIds?: readonly string[];
  /** 교사가 [다시 시도]를 누른 경우. */
  readonly force?: boolean;
  /** 한 건이 끝날 때마다 알린다(화면이 기다리지 않고 하나씩 채워진다). */
  readonly onExtracted?: (submissionId: string, text: string | undefined) => void;
  /** 이 과제 화면이 아직 열려 있는가. false 가 되면 남은 작업을 멈춘다. */
  readonly isStillWanted?: () => boolean;
}

export class ExtractSubmissionTexts {
  /** submissionId → 캐시 레코드. 첫 사용 때 한 번 읽는다. */
  private cache: Map<string, SubmissionTextRecord> | null = null;
  private loading: Promise<void> | null = null;
  /** 파싱은 메인 프로세스에서 한 건씩 돈다 — 겹쳐 부르면 앱 전체가 느려진다. */
  private parseQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly repository: ISubmissionTextRepository,
    private readonly files: ISubmissionFilePort,
    private readonly parser: IDocumentParserPort,
  ) {}

  /** 캐시를 읽어 둔다. `textFor` 를 쓰기 전에 한 번 부른다. */
  async ready(): Promise<void> {
    if (this.cache) return;
    if (!this.loading) {
      this.loading = (async () => {
        try {
          const data = await this.repository.getSubmissionTexts();
          this.cache = new Map((data?.records ?? []).map((r) => [r.submissionId, r]));
        } catch {
          // 캐시를 못 읽어도 기능은 돌아야 한다 — 빈 캐시로 시작하고 다시 뽑는다.
          this.cache = new Map();
        } finally {
          this.loading = null;
        }
      })();
    }
    await this.loading;
  }

  /**
   * 이 제출물의 본문(있으면). **동기 함수** — 제출 목록을 화면에 넣기 직전에 입힌다.
   * 30초 폴링이 목록을 통째로 갈아 끼워도 이 함수를 다시 태우면 본문이 되돌아가지 않는다.
   */
  textFor(sub: Submission): string | undefined {
    const record = this.cache?.get(sub.id);
    if (!record || record.status !== 'ok') return undefined;
    return isCacheCurrent(record, sub) ? record.text : undefined;
  }

  /** 과제를 지우면 그 과제의 학생 글 캐시도 함께 지운다. */
  async purgeAssignment(assignmentId: string): Promise<void> {
    await this.ready();
    const cache = this.cache;
    if (!cache) return;
    let removed = false;
    for (const [id, record] of cache) {
      if (record.assignmentId === assignmentId) {
        cache.delete(id);
        removed = true;
      }
    }
    if (removed) await this.persist();
  }

  /**
   * 아직 본문이 없는 제출물을 내려받아 본문을 뽑는다.
   *
   * 화면을 막지 않는다(호출자가 await 하지 않는다). 인터넷이 끊긴 게 확인되면 남은 것을
   * 붙잡고 늘어지지 않고 통째로 멈춘다 — 다음 새로고침 때 다시 한다.
   */
  async run(params: ExtractSubmissionTextsParams): Promise<void> {
    await this.ready();
    const cache = this.cache;
    if (!cache) return;

    const now = Date.now();
    const force = params.force ?? false;

    // 교사가 실제로 보는 건 방금 낸 제출물이다 — 최신순으로 처리한다.
    const ordered = [...params.submissions].sort((a, b) =>
      b.submittedAt.localeCompare(a.submittedAt),
    );

    const pending: Submission[] = [];
    for (const sub of ordered) {
      const decision = decideExtraction(sub, cache.get(sub.id), now, force);
      if (decision.kind === 'skip') continue;
      if (decision.kind === 'settle') {
        this.remember(sub, params.assignmentId, decision.status, undefined, 0);
        continue;
      }
      pending.push(sub);
    }

    let stopped = false;
    const stillWanted = (): boolean => {
      if (stopped) return false;
      if (params.isStillWanted && !params.isStillWanted()) {
        stopped = true;
        return false;
      }
      return true;
    };

    await runWithConcurrency(pending, DOWNLOAD_CONCURRENCY, async (sub) => {
      if (!stillWanted()) return;
      const outcome = await this.extractOne(sub);
      if (outcome === 'wait') {
        // 인터넷이 없거나 데스크톱 앱이 아니다 — 남은 것도 마찬가지이므로 통째로 멈춘다.
        stopped = true;
        return;
      }
      const attempts = (cache.get(sub.id)?.attempts ?? 0) + 1;
      this.remember(sub, params.assignmentId, outcome.status, outcome.text, attempts);
      params.onExtracted?.(sub.id, outcome.status === 'ok' ? outcome.text : undefined);
    });

    this.collectGarbage(params.knownAssignmentIds, now);
    await this.persist();
  }

  /**
   * 한 건을 내려받아 본문을 뽑는다.
   * @returns 'wait' 이면 아직 못 해 본 것이다(시도 횟수를 올리지 않고 캐시에도 안 남긴다).
   */
  private async extractOne(
    sub: Submission,
  ): Promise<'wait' | { status: SubmissionTextStatus; text?: string }> {
    const driveFileId = sub.driveFileId;
    if (!driveFileId) return { status: 'unsupported' };

    let bytes: Uint8Array;
    try {
      bytes = await this.files.downloadFile(driveFileId, sub.fileSize);
    } catch (err) {
      if (err instanceof SubmissionFileError) {
        if (err.kind === 'offline') return 'wait';
        if (err.kind === 'missing') return { status: 'missing' };
      }
      // 권한 문제·일시 오류 — 한 번만 바로 다시 해 본다.
      try {
        bytes = await this.files.downloadFile(driveFileId, sub.fileSize);
      } catch (retryErr) {
        if (retryErr instanceof SubmissionFileError) {
          if (retryErr.kind === 'offline') return 'wait';
          if (retryErr.kind === 'missing') return { status: 'missing' };
        }
        return { status: 'failed' };
      }
    }

    const fileName = sub.fileName ?? '제출파일';
    // 파싱은 메인 프로세스 한 곳에서 도므로 한 건씩 줄을 세운다.
    const outcome = await this.enqueueParse(bytes, fileName);
    if (outcome === null) return { status: 'failed' };

    if (outcome.status === 'error') {
      // 데스크톱 앱이 아니면 파서 자체가 없다 — 실패로 굳히면 데스크톱에서도 안 하게 된다.
      return outcome.code === 'NOT_AVAILABLE' ? 'wait' : { status: 'failed' };
    }
    if (outcome.status === 'canceled') return { status: 'failed' };

    if (outcome.document.isImageBased) return { status: 'scanned' };
    const markdown = outcome.document.markdown.trim();
    if (markdown.length === 0) return { status: 'empty' };
    return { status: 'ok', text: truncateExtractedText(markdown) };
  }

  private enqueueParse(bytes: Uint8Array, fileName: string): Promise<ParseOutcome | null> {
    const run = (): Promise<ParseOutcome | null> =>
      this.parser.parseBytes(bytes, fileName).catch(() => null);
    // 앞 작업이 실패해도 줄이 끊기지 않게 양쪽 갈래를 같은 함수로 잇는다.
    const task = this.parseQueue.then(run, run);
    this.parseQueue = task;
    return task;
  }

  private remember(
    sub: Submission,
    assignmentId: string,
    status: SubmissionTextStatus,
    text: string | undefined,
    attempts: number,
  ): void {
    this.cache?.set(sub.id, {
      submissionId: sub.id,
      assignmentId,
      driveFileId: sub.driveFileId ?? '',
      submittedAt: sub.submittedAt,
      fileSize: sub.fileSize,
      status,
      ...(status === 'ok' && text !== undefined ? { text } : {}),
      attempts,
      updatedAt: new Date().toISOString(),
    });
  }

  /** 사라진 과제의 캐시와 아주 오래된 캐시를 지운다 — 학생 글을 필요 이상으로 들고 있지 않는다. */
  private collectGarbage(knownAssignmentIds: readonly string[] | undefined, now: number): void {
    const cache = this.cache;
    if (!cache) return;
    const known = knownAssignmentIds ? new Set(knownAssignmentIds) : null;
    for (const [id, record] of cache) {
      const tooOld = now - Date.parse(record.updatedAt) > CACHE_MAX_AGE_MS;
      const orphan = known !== null && !known.has(record.assignmentId);
      if (tooOld || orphan) cache.delete(id);
    }
  }

  private async persist(): Promise<void> {
    const cache = this.cache;
    if (!cache) return;
    try {
      await this.repository.saveSubmissionTexts({ records: [...cache.values()] });
    } catch {
      // 캐시 저장 실패는 기능을 막지 않는다 — 다음에 다시 뽑으면 된다.
    }
  }
}

/** 동시에 `limit` 개까지만 돌린다. 전부 끝날 때까지 기다린다(개수 상한 없음). */
async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
