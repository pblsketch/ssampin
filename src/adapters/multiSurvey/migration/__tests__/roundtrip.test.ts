/**
 * Roundtrip test: v1 ↔ v2 변환 무손실 검증 (worker-2 영역).
 *
 * 커버리지:
 * 1. v1 → v2 → v1' 질문/옵션 보존 (whitelist deepEqual)
 * 2. v2.formatVersion === FORMAT_VERSION_V2
 * 3. Default opts 검증 (allowReentry: true, autoAdvance: false)
 * 4. Negative: quiz 타입 v2 → v1 throw
 * 5. backupWriter.writeBackup 디렉터리 구조 + metadata.count
 * 6. backupWriter.cleanupOldBackups 오래된 dir 삭제 (mtime 조작)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdir, readFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { migrateV1ToV2 } from '../v1ToV2';
import { migrateV2ToV1 } from '../v2ToV1';
import { writeBackup, cleanupOldBackups } from '../backupWriter';
import { FORMAT_VERSION_V2 } from '../../../../domain/entities/multiSurvey/MultiSurveyV2';
import type { MultiSurveyV2 } from '../../../../domain/entities/multiSurvey/MultiSurveyV2';
import type { OXQuestion } from '../../../../domain/entities/multiSurvey/Question';

// ──────────────────────────────────────────────
// Shared v1 fixture
// ──────────────────────────────────────────────

const V1_FIXTURE = {
  id: 'test-survey-001',
  title: '테스트 설문',
  questions: [
    {
      id: 'q1',
      type: 'single-choice' as const,
      question: '좋아하는 계절은?',
      required: true,
      options: [
        { id: 'o1', text: '봄' },
        { id: 'o2', text: '여름' },
      ],
    },
    {
      id: 'q2',
      type: 'multi-choice' as const,
      question: '즐기는 취미를 모두 골라주세요',
      required: false,
      options: [
        { id: 'o1', text: '독서' },
        { id: 'o2', text: '운동' },
      ],
    },
    {
      id: 'q3',
      type: 'text' as const,
      question: '자기소개를 적어주세요',
      required: true,
      maxLength: 200,
    },
    {
      id: 'q4',
      type: 'scale' as const,
      question: '수업 만족도는?',
      required: true,
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: '매우 불만족',
      scaleMaxLabel: '매우 만족',
    },
  ],
  submissions: [],
  isOpen: false,
  createdAt: 1716979200000,
};

// ──────────────────────────────────────────────
// 1. v1 → v2 → v1' whitelist roundtrip
// ──────────────────────────────────────────────

describe("v1 → v2 → v1' roundtrip", () => {
  it('question id/type preserved', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    const v1prime = migrateV2ToV1(v2);

    expect(v1prime.questions).toHaveLength(V1_FIXTURE.questions.length);
    for (let i = 0; i < V1_FIXTURE.questions.length; i++) {
       
      expect(v1prime.questions[i]!.id).toBe(V1_FIXTURE.questions[i]!.id);
       
      expect(v1prime.questions[i]!.type).toBe(V1_FIXTURE.questions[i]!.type);
    }
  });

  it('question text (v1 question field) preserved via rename', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    const v1prime = migrateV2ToV1(v2);

    for (let i = 0; i < V1_FIXTURE.questions.length; i++) {
       
      expect(v1prime.questions[i]!.question).toBe(V1_FIXTURE.questions[i]!.question);
    }
  });

  it('options preserved for single-choice and multi-choice', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    const v1prime = migrateV2ToV1(v2);

    const qsc = v1prime.questions[0]!;
    expect(qsc.options).toEqual(V1_FIXTURE.questions[0]!.options);

    const qmc = v1prime.questions[1]!;
    expect(qmc.options).toEqual(V1_FIXTURE.questions[1]!.options);
  });

  it('text question maxLength preserved', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    const v1prime = migrateV2ToV1(v2);

    expect(v1prime.questions[2]!.maxLength).toBe(200);
  });

  it('scale question scaleMin/Max/Labels preserved', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    const v1prime = migrateV2ToV1(v2);

    const scale = v1prime.questions[3]!;
    expect(scale.scaleMin).toBe(1);
    expect(scale.scaleMax).toBe(5);
    expect(scale.scaleMinLabel).toBe('매우 불만족');
    expect(scale.scaleMaxLabel).toBe('매우 만족');
  });

  it('top-level id and title preserved', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    const v1prime = migrateV2ToV1(v2);

    expect(v1prime.id).toBe(V1_FIXTURE.id);
    expect(v1prime.title).toBe(V1_FIXTURE.title);
  });
});

// ──────────────────────────────────────────────
// 2. v2.formatVersion
// ──────────────────────────────────────────────

describe('migrateV1ToV2 formatVersion', () => {
  it('injects FORMAT_VERSION_V2', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    expect(v2.formatVersion).toBe(FORMAT_VERSION_V2);
  });

  it('createdAt is ISO string', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    expect(() => new Date(v2.createdAt)).not.toThrow();
    expect(v2.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('questions text renamed from question', () => {
    const v2 = migrateV1ToV2(V1_FIXTURE);
    expect(v2.questions[0]!.text).toBe('좋아하는 계절은?');
  });
});

// ──────────────────────────────────────────────
// 3. Default opts
// ──────────────────────────────────────────────

describe('default opts after forward migration', () => {
  let v2: MultiSurveyV2;

  beforeEach(() => {
    v2 = migrateV1ToV2(V1_FIXTURE);
  });

  it('presentationOpts.allowReentry === true', () => {
    expect(v2.presentationOpts.allowReentry).toBe(true);
  });

  it('presentationOpts.showCumulativeScore === false', () => {
    expect(v2.presentationOpts.showCumulativeScore).toBe(false);
  });

  it('presentationOpts.revealExplanation === false', () => {
    expect(v2.presentationOpts.revealExplanation).toBe(false);
  });

  it('responseOpts.autoAdvance === false', () => {
    expect(v2.responseOpts.autoAdvance).toBe(false);
  });

  it('responseOpts.fastSolveBonus === false', () => {
    expect(v2.responseOpts.fastSolveBonus).toBe(false);
  });

  it('displayOpts.teacherFocusMode === false', () => {
    expect(v2.displayOpts.teacherFocusMode).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 4. Negative: quiz type → v2ToV1 throws
// ──────────────────────────────────────────────

describe('migrateV2ToV1 rejects quiz types', () => {
  it('throws with "cannot reverse quiz type" for ox question', () => {
    const v2WithQuiz: MultiSurveyV2 = {
      ...migrateV1ToV2(V1_FIXTURE),
      questions: [
        {
          id: 'qox',
          type: 'ox',
          text: 'OX 문제',
          timerSeconds: 20,
          score: 10,
          correctAnswer: 'O',
        } satisfies OXQuestion,
      ],
    };

    expect(() => migrateV2ToV1(v2WithQuiz)).toThrow('cannot reverse quiz type');
  });

  it('error message includes the quiz type name', () => {
    const v2WithQuiz: MultiSurveyV2 = {
      ...migrateV1ToV2(V1_FIXTURE),
      questions: [
        {
          id: 'qox',
          type: 'ox',
          text: 'OX 문제',
          timerSeconds: 20,
          score: 10,
          correctAnswer: 'O',
        } satisfies OXQuestion,
      ],
    };

    expect(() => migrateV2ToV1(v2WithQuiz)).toThrow('ox');
  });
});

// ──────────────────────────────────────────────
// 5. backupWriter.writeBackup
// ──────────────────────────────────────────────

describe('backupWriter.writeBackup', () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = join(tmpdir(), `ssampin-backup-test-${Date.now()}`);
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('creates sessions.json and metadata.json', async () => {
    const { backupPath, metadataPath } = await writeBackup([V1_FIXTURE], '2.0.0', testRoot);

    expect(existsSync(backupPath)).toBe(true);
    expect(existsSync(metadataPath)).toBe(true);
  });

  it('metadata.json has correct count', async () => {
    const data = [V1_FIXTURE, { ...V1_FIXTURE, id: 'survey-002' }];
    const { metadataPath } = await writeBackup(data, '2.0.0', testRoot);

    const raw = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(raw) as { count: number; appVersion: string; writtenAt: string };

    expect(metadata.count).toBe(2);
    expect(metadata.appVersion).toBe('2.0.0');
    expect(metadata.writtenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('creates failed/ subdirectory', async () => {
    const { backupPath } = await writeBackup([V1_FIXTURE], '2.0.0', testRoot);
    const tsDir = backupPath.replace(/[\\/]sessions\.json$/, '');
    const failedDir = join(tsDir, 'failed');

    expect(existsSync(failedDir)).toBe(true);
  });

  it('sessions.json contains the v1 data', async () => {
    const { backupPath } = await writeBackup([V1_FIXTURE], '2.0.0', testRoot);
    const raw = await readFile(backupPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown[];

    expect(parsed).toHaveLength(1);
    expect((parsed[0] as typeof V1_FIXTURE).id).toBe(V1_FIXTURE.id);
  });
});

// ──────────────────────────────────────────────
// 6. backupWriter.cleanupOldBackups
// ──────────────────────────────────────────────

describe('backupWriter.cleanupOldBackups', () => {
  let testRoot: string;

  beforeEach(async () => {
    testRoot = join(tmpdir(), `ssampin-cleanup-test-${Date.now()}`);
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('returns deletedCount 0 when root does not exist', async () => {
    const nonExistent = join(tmpdir(), `does-not-exist-${Date.now()}`);
    const result = await cleanupOldBackups(nonExistent, 30);
    expect(result.deletedCount).toBe(0);
  });

  it('deletes directories older than threshold via mtime', async () => {
    // Create an old directory
    const oldDir = join(testRoot, '2020-01-01_00-00-00');
    await mkdir(oldDir, { recursive: true });

    // Set mtime to 40 days ago
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await utimes(oldDir, fortyDaysAgo, fortyDaysAgo);

    // Create a recent directory
    const newDir = join(testRoot, '2099-01-01_00-00-00');
    await mkdir(newDir, { recursive: true });

    const result = await cleanupOldBackups(testRoot, 30);

    expect(result.deletedCount).toBe(1);
    expect(result.deletedPaths).toHaveLength(1);
    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(newDir)).toBe(true);
  });

  it('does not delete directories within threshold', async () => {
    // Create a recent directory (1 day ago)
    const recentDir = join(testRoot, '2099-06-01_00-00-00');
    await mkdir(recentDir, { recursive: true });

    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await utimes(recentDir, oneDayAgo, oneDayAgo);

    const result = await cleanupOldBackups(testRoot, 30);

    expect(result.deletedCount).toBe(0);
    expect(existsSync(recentDir)).toBe(true);
  });

  it('returns paths of deleted directories', async () => {
    const oldDir = join(testRoot, '2019-01-01_00-00-00');
    await mkdir(oldDir, { recursive: true });

    const veryOld = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    await utimes(oldDir, veryOld, veryOld);

    const result = await cleanupOldBackups(testRoot, 30);

    expect(result.deletedPaths[0]).toBe(oldDir);
  });
});

// ──────────────────────────────────────────────
// 7. migrateV1ToV2 input validation
// ──────────────────────────────────────────────

describe('migrateV1ToV2 input validation', () => {
  it('throws on null input', () => {
    expect(() => migrateV1ToV2(null)).toThrow('Invalid v1 MultiSurvey input');
  });

  it('throws on missing id', () => {
    expect(() =>
      migrateV1ToV2({ title: 'x', questions: [], submissions: [], isOpen: false, createdAt: 0 }),
    ).toThrow('Invalid v1 MultiSurvey input');
  });

  it('throws on missing questions array', () => {
    expect(() =>
      migrateV1ToV2({ id: 'x', title: 'x', submissions: [], isOpen: false, createdAt: 0 }),
    ).toThrow('Invalid v1 MultiSurvey input');
  });

  it('throws on non-number createdAt', () => {
    expect(() =>
      migrateV1ToV2({
        id: 'x',
        title: 'x',
        questions: [],
        submissions: [],
        isOpen: false,
        createdAt: 'bad',
      }),
    ).toThrow('Invalid v1 MultiSurvey input');
  });
});
