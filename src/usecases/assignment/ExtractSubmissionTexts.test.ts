/**
 * ExtractSubmissionTexts — 제출 파일 본문 추출.
 *
 * 여기서 고정하는 것(수용 기준):
 *  - HWP·PDF 제출의 본문이 실제로 들어온다
 *  - 100건이 넘어도 **한 건도 빠지지 않는다**(어디서도 조용히 잘리지 않는다)
 *  - 오프라인·데스크톱 아님은 실패가 아니라 **대기**다(시도 횟수도 캐시도 남기지 않는다)
 *  - 사진·미지원 형식·너무 큰 파일은 **내려받지도 않는다**
 *  - 재제출(같은 파일 id, 바뀐 제출 시각)을 놓치지 않는다
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Submission } from '@domain/entities/Assignment';
import type { IDocumentParserPort, ParseOutcome } from '@domain/ports/IDocumentParserPort';
import type { ISubmissionFilePort } from '@domain/ports/ISubmissionFilePort';
import { SubmissionFileError } from '@domain/ports/ISubmissionFilePort';
import type {
  ISubmissionTextRepository,
  SubmissionTextsData,
} from '@domain/repositories/ISubmissionTextRepository';
import {
  ExtractSubmissionTexts,
  decideExtraction,
  submissionFileKindOf,
  SUBMISSION_TEXT_MAX_BYTES,
} from './ExtractSubmissionTexts';

// ── 시험용 대역 ──────────────────────────────────────────────────────────────

class FakeRepository implements ISubmissionTextRepository {
  data: SubmissionTextsData | null = null;
  saveCount = 0;

  getSubmissionTexts(): Promise<SubmissionTextsData | null> {
    return Promise.resolve(this.data);
  }

  saveSubmissionTexts(data: SubmissionTextsData): Promise<void> {
    this.data = data;
    this.saveCount += 1;
    return Promise.resolve();
  }
}

type DownloadBehavior = 'ok' | 'offline' | 'missing' | 'error';

class FakeFiles implements ISubmissionFilePort {
  calls: string[] = [];
  behavior: DownloadBehavior = 'ok';
  perFile = new Map<string, DownloadBehavior>();
  active = 0;
  maxActive = 0;

  async downloadFile(driveFileId: string): Promise<Uint8Array> {
    this.calls.push(driveFileId);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await Promise.resolve();
      const behavior = this.perFile.get(driveFileId) ?? this.behavior;
      if (behavior === 'offline') {
        throw new SubmissionFileError('offline', '인터넷 없음');
      }
      if (behavior === 'missing') {
        throw new SubmissionFileError('missing', '파일 없음');
      }
      if (behavior === 'error') {
        throw new SubmissionFileError('failed', '일시 오류');
      }
      return new Uint8Array([1, 2, 3]);
    } finally {
      this.active -= 1;
    }
  }
}

class FakeParser implements IDocumentParserPort {
  outcome: ParseOutcome = okOutcome('학생이 쓴 탐구 보고서 본문');
  perFile = new Map<string, ParseOutcome>();
  active = 0;
  maxActive = 0;
  parsedNames: string[] = [];

  pickAndParse(): Promise<ParseOutcome> {
    return Promise.resolve(this.outcome);
  }

  pickAndParseMulti(): Promise<ParseOutcome[]> {
    return Promise.resolve([this.outcome]);
  }

  async parseBytes(_bytes: Uint8Array, fileName: string): Promise<ParseOutcome> {
    this.parsedNames.push(fileName);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    try {
      await Promise.resolve();
      return this.perFile.get(fileName) ?? this.outcome;
    } finally {
      this.active -= 1;
    }
  }
}

function okOutcome(markdown: string, isImageBased = false): ParseOutcome {
  return {
    status: 'ok',
    fileName: 'x.hwp',
    document: { markdown, format: 'hwp', isImageBased, warnings: [] },
  };
}

function makeSubmission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub1',
    assignmentId: 'a1',
    studentNumber: 3,
    studentName: '홍길동',
    submittedAt: '2026-06-20T09:30:00Z',
    fileName: '보고서.hwp',
    fileSize: 1024,
    driveFileId: 'drive-1',
    isLate: false,
    ...over,
  };
}

function setup(): {
  repo: FakeRepository;
  files: FakeFiles;
  parser: FakeParser;
  usecase: ExtractSubmissionTexts;
} {
  const repo = new FakeRepository();
  const files = new FakeFiles();
  const parser = new FakeParser();
  return { repo, files, parser, usecase: new ExtractSubmissionTexts(repo, files, parser) };
}

// ── 순수 판정 ────────────────────────────────────────────────────────────────

describe('submissionFileKindOf — 허용 목록이지 금지 목록이 아니다', () => {
  it('kordoc 이 읽는 형식만 parsable', () => {
    for (const name of ['a.hwp', 'a.hwpx', 'a.pdf', 'a.docx', 'a.xlsx', 'a.xls', 'a.hwpml']) {
      expect(submissionFileKindOf(name)).toBe('parsable');
    }
  });

  it('사진은 image', () => {
    expect(submissionFileKindOf('활동.jpg')).toBe('image');
    expect(submissionFileKindOf('활동.HEIC')).toBe('image');
  });

  it('파일 형식 제한이 없는 과제로 들어올 수 있는 것들은 전부 unsupported', () => {
    // 과제의 fileTypeRestriction 이 'all' 이면 학생은 이런 것도 낼 수 있다.
    for (const name of ['a.zip', 'a.mp4', 'a.doc', 'a.pptx', '확장자없음']) {
      expect(submissionFileKindOf(name)).toBe('unsupported');
    }
  });

  it('평문(.txt·.md)도 parsable — 메인이 kordoc 대신 직접 해독한다(T6)', () => {
    // kordoc 은 평문 바이트에 UNSUPPORTED_FORMAT 을 돌려준다(실측). 그래서 확장자 목록에만
    // 넣으면 내려받아 파서에 넘기고 실패로 굳는다 — 메인의 해독 갈래와 **함께** 켜야 한다.
    for (const name of ['a.txt', 'a.MD', '학생글.md']) {
      expect(submissionFileKindOf(name)).toBe('parsable');
    }
  });

  it('파일명이 없으면 unsupported (텍스트만 낸 제출)', () => {
    expect(submissionFileKindOf(null)).toBe('unsupported');
  });
});

describe('decideExtraction', () => {
  const now = Date.parse('2026-06-21T00:00:00Z');

  it('사진·미지원·너무 큰 파일은 내려받지 않고 그 자리에서 확정한다', () => {
    expect(decideExtraction(makeSubmission({ fileName: 'a.jpg' }), undefined, now, false)).toEqual({
      kind: 'settle',
      status: 'image_only',
    });
    expect(decideExtraction(makeSubmission({ fileName: 'a.zip' }), undefined, now, false)).toEqual({
      kind: 'settle',
      status: 'unsupported',
    });
    expect(
      decideExtraction(
        makeSubmission({ fileSize: SUBMISSION_TEXT_MAX_BYTES + 1 }),
        undefined,
        now,
        false,
      ),
    ).toEqual({ kind: 'settle', status: 'too_large' });
  });

  it('드라이브 파일이 없는 제출(텍스트만)은 아무것도 하지 않는다', () => {
    const sub = makeSubmission({ driveFileId: undefined, fileName: null });
    expect(decideExtraction(sub, undefined, now, false)).toEqual({ kind: 'skip' });
  });

  it('사라진 파일(missing)은 [다시 시도] 로도 다시 하지 않는다', () => {
    const sub = makeSubmission();
    const record = {
      submissionId: sub.id,
      assignmentId: 'a1',
      driveFileId: 'drive-1',
      submittedAt: sub.submittedAt,
      fileSize: sub.fileSize,
      status: 'missing' as const,
      attempts: 1,
      updatedAt: '2026-06-20T10:00:00Z',
    };
    expect(decideExtraction(sub, record, now, false)).toEqual({ kind: 'skip' });
    expect(decideExtraction(sub, record, now, true)).toEqual({ kind: 'skip' });
  });

  it('실패는 쿨다운 안에는 건너뛰고, 지났거나 force 면 다시 한다', () => {
    const sub = makeSubmission();
    const failedAt = '2026-06-20T23:55:00Z'; // now 로부터 5분 전
    const record = {
      submissionId: sub.id,
      assignmentId: 'a1',
      driveFileId: 'drive-1',
      submittedAt: sub.submittedAt,
      fileSize: sub.fileSize,
      status: 'failed' as const,
      attempts: 1,
      updatedAt: failedAt,
    };
    expect(decideExtraction(sub, record, now, false)).toEqual({ kind: 'skip' });
    expect(decideExtraction(sub, record, now, true)).toEqual({ kind: 'download' });
    const later = Date.parse('2026-06-21T00:20:00Z'); // 25분 뒤
    expect(decideExtraction(sub, record, later, false)).toEqual({ kind: 'download' });
  });
});

// ── 동작 ────────────────────────────────────────────────────────────────────

describe('ExtractSubmissionTexts.run', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('HWP·PDF 제출의 본문이 들어온다', async () => {
    const hwp = makeSubmission({ id: 's-hwp', fileName: '탐구.hwp', driveFileId: 'd-hwp' });
    const pdf = makeSubmission({ id: 's-pdf', fileName: '보고서.pdf', driveFileId: 'd-pdf' });
    ctx.parser.perFile.set('탐구.hwp', okOutcome('한글 문서 본문'));
    ctx.parser.perFile.set('보고서.pdf', okOutcome('PDF 본문'));

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [hwp, pdf] });

    expect(ctx.usecase.textFor(hwp)).toBe('한글 문서 본문');
    expect(ctx.usecase.textFor(pdf)).toBe('PDF 본문');
  });

  it('120건도 한 건도 빠짐없이 처리한다 — 내려받기는 3개씩, 파싱은 한 건씩', async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      makeSubmission({
        id: `s${i}`,
        driveFileId: `d${i}`,
        fileName: `보고서${i}.hwp`,
        submittedAt: `2026-06-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z`,
      }),
    );

    await ctx.usecase.run({ assignmentId: 'a1', submissions: many });

    expect(ctx.files.calls).toHaveLength(120);
    expect(ctx.parser.parsedNames).toHaveLength(120);
    expect(ctx.repo.data?.records).toHaveLength(120);
    for (const sub of many) expect(ctx.usecase.textFor(sub)).toBeDefined();
    // 내려받기는 3개까지 겹치되, 파싱(메인 프로세스)은 절대 겹치지 않는다.
    expect(ctx.files.maxActive).toBeLessThanOrEqual(3);
    expect(ctx.parser.maxActive).toBe(1);
  });

  it('사진·너무 큰 파일·미지원 형식은 내려받지 않는다', async () => {
    const image = makeSubmission({ id: 's-img', fileName: '활동.jpg', driveFileId: 'd-img' });
    const big = makeSubmission({
      id: 's-big',
      driveFileId: 'd-big',
      fileSize: SUBMISSION_TEXT_MAX_BYTES + 1,
    });
    const zip = makeSubmission({ id: 's-zip', fileName: '묶음.zip', driveFileId: 'd-zip' });

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [image, big, zip] });

    expect(ctx.files.calls).toHaveLength(0);
    const byId = new Map(ctx.repo.data?.records.map((r) => [r.submissionId, r.status]));
    expect(byId.get('s-img')).toBe('image_only');
    expect(byId.get('s-big')).toBe('too_large');
    expect(byId.get('s-zip')).toBe('unsupported');
    expect(ctx.usecase.textFor(image)).toBeUndefined();
  });

  it('오프라인이면 오류 없이 대기한다 — 실패로 기록하지 않고, 온라인이 되면 정상으로 들어온다', async () => {
    const sub = makeSubmission();
    ctx.files.behavior = 'offline';

    await expect(
      ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] }),
    ).resolves.toBeUndefined();
    expect(ctx.repo.data?.records ?? []).toHaveLength(0);
    expect(ctx.usecase.textFor(sub)).toBeUndefined();

    ctx.files.behavior = 'ok';
    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });
    expect(ctx.usecase.textFor(sub)).toBe('학생이 쓴 탐구 보고서 본문');
  });

  it('오프라인이면 남은 제출물까지 붙잡고 늘어지지 않는다', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeSubmission({ id: `s${i}`, driveFileId: `d${i}` }),
    );
    ctx.files.behavior = 'offline';

    await ctx.usecase.run({ assignmentId: 'a1', submissions: many });

    // 회선이 끊겼으면 30건을 다 때려 보지 않는다(동시 처리분까지만).
    expect(ctx.files.calls.length).toBeLessThanOrEqual(3);
  });

  it('데스크톱 앱이 아니면(파서 없음) 실패가 아니라 대기다', async () => {
    const sub = makeSubmission();
    ctx.parser.outcome = {
      status: 'error',
      code: 'NOT_AVAILABLE',
      message: '이 기능은 쌤핀 데스크톱 앱에서만 사용할 수 있어요.',
    };

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });

    // 여기서 'failed' 로 굳히면 데스크톱에서 열어도 다시 하지 않게 된다.
    expect(ctx.repo.data?.records ?? []).toHaveLength(0);
  });

  it('실패는 즉시 한 번 더 해 보고, 그래도 안 되면 남긴다 — 다음 pass 는 쿨다운으로 건너뛴다', async () => {
    const sub = makeSubmission();
    ctx.files.behavior = 'error';

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });
    expect(ctx.files.calls).toHaveLength(2); // 최초 1 + 즉시 재시도 1
    expect(ctx.repo.data?.records[0]?.status).toBe('failed');

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });
    expect(ctx.files.calls).toHaveLength(2); // 쿨다운 — 다시 때리지 않는다

    ctx.files.behavior = 'ok';
    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub], force: true });
    expect(ctx.usecase.textFor(sub)).toBe('학생이 쓴 탐구 보고서 본문');
  });

  it('드라이브에서 사라진 파일은 [다시 시도] 로도 다시 내려받지 않는다', async () => {
    const sub = makeSubmission();
    ctx.files.behavior = 'missing';

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });
    expect(ctx.repo.data?.records[0]?.status).toBe('missing');
    const callsAfterFirst = ctx.files.calls.length;

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub], force: true });
    expect(ctx.files.calls).toHaveLength(callsAfterFirst);
  });

  it('이미 뽑은 것은 다시 내려받지 않는다', async () => {
    const sub = makeSubmission();
    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });
    expect(ctx.files.calls).toHaveLength(1);

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });
    expect(ctx.files.calls).toHaveLength(1);
  });

  it('재제출은 파일 id 가 그대로여도 다시 뽑는다 (서버가 같은 파일을 덮어쓴다)', async () => {
    const first = makeSubmission();
    await ctx.usecase.run({ assignmentId: 'a1', submissions: [first] });
    expect(ctx.usecase.textFor(first)).toBe('학생이 쓴 탐구 보고서 본문');

    // 같은 학생이 고쳐서 다시 냈다 — id·driveFileId 는 같고 제출 시각만 바뀐다.
    const again = makeSubmission({ submittedAt: '2026-06-22T11:00:00Z', fileSize: 2048 });
    ctx.parser.outcome = okOutcome('고쳐 쓴 두 번째 본문');

    expect(ctx.usecase.textFor(again)).toBeUndefined(); // 옛 본문이 새 제출에 붙지 않는다
    await ctx.usecase.run({ assignmentId: 'a1', submissions: [again] });
    expect(ctx.files.calls).toHaveLength(2);
    expect(ctx.usecase.textFor(again)).toBe('고쳐 쓴 두 번째 본문');
  });

  it('사진으로만 된 문서(스캔본)와 빈 문서를 구분해 남긴다', async () => {
    const scanned = makeSubmission({ id: 's-scan', driveFileId: 'd-scan', fileName: '스캔.pdf' });
    const blank = makeSubmission({ id: 's-blank', driveFileId: 'd-blank', fileName: '빈.hwp' });
    ctx.parser.perFile.set('스캔.pdf', okOutcome('', true));
    ctx.parser.perFile.set('빈.hwp', okOutcome('   '));

    await ctx.usecase.run({ assignmentId: 'a1', submissions: [scanned, blank] });

    const byId = new Map(ctx.repo.data?.records.map((r) => [r.submissionId, r.status]));
    expect(byId.get('s-scan')).toBe('scanned');
    expect(byId.get('s-blank')).toBe('empty');
  });

  it('교사가 다른 과제로 옮기면 남은 작업을 멈춘다', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeSubmission({ id: `s${i}`, driveFileId: `d${i}` }),
    );

    await ctx.usecase.run({
      assignmentId: 'a1',
      submissions: many,
      isStillWanted: () => ctx.files.calls.length < 5,
    });

    expect(ctx.files.calls.length).toBeLessThan(20);
  });

  it('없어진 과제의 학생 글은 스스로 지운다', async () => {
    const sub = makeSubmission();
    await ctx.usecase.run({ assignmentId: 'a1', submissions: [sub] });
    expect(ctx.repo.data?.records).toHaveLength(1);

    // 다른 과제를 처리하는데 a1 은 더 이상 존재하지 않는다.
    const other = makeSubmission({ id: 's-other', assignmentId: 'a2', driveFileId: 'd-other' });
    await ctx.usecase.run({
      assignmentId: 'a2',
      submissions: [other],
      knownAssignmentIds: ['a2'],
    });

    const ids = ctx.repo.data?.records.map((r) => r.submissionId);
    expect(ids).toEqual(['s-other']);
  });

  it('과제를 지우면 그 과제의 학생 글도 지운다', async () => {
    await ctx.usecase.run({ assignmentId: 'a1', submissions: [makeSubmission()] });
    await ctx.usecase.purgeAssignment('a1');
    expect(ctx.repo.data?.records ?? []).toHaveLength(0);
  });
});
