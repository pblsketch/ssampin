/**
 * 크래시 증거 수집 그물.
 *
 * 2026-08-19 사고: 위젯 크기 조절 중 앱이 즉사했는데 **덤프가 한 개도 없어** 원인 조사가
 * 원천 봉쇄됐다. crashReporter 를 부른 적이 없었기 때문이다. 아래 검사들이 지키는 것은
 * "다음에 죽으면 흔적이 남는가" 하나다.
 */
import { describe, expect, test, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  describeCrashDumps,
  findCrashDumps,
  installCrashReporter,
  reportCrashEvidence,
  type CrashEvidenceApp,
  type CrashEvidenceReporter,
} from './crashEvidence';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ssampin-crash-'));
}

function writeDump(dir: string, name: string, sizeBytes: number, mtime: Date): string {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.alloc(sizeBytes));
  fs.utimesSync(file, mtime, mtime);
  return file;
}

describe('crashEvidence', () => {
  describe('installCrashReporter', () => {
    test('★crashReporter 를 실제로 시작한다 — 이걸 빠뜨려 2026-08-19 에 덤프가 0건이었다', () => {
      const start = vi.fn();
      const app: CrashEvidenceApp = {
        getPath: () => 'C:\\userData',
        setPath: vi.fn(),
        on: vi.fn(),
      };
      const reporter: CrashEvidenceReporter = { start };

      installCrashReporter({ app, crashReporter: reporter });

      expect(start, 'crashReporter.start 가 호출되지 않았다').toHaveBeenCalledTimes(1);
    });

    test('덤프를 서버로 올리지 않는다 — 오프라인 완전 동작 원칙', () => {
      const start = vi.fn();
      installCrashReporter({
        app: { getPath: () => 'C:\\userData', setPath: vi.fn(), on: vi.fn() },
        crashReporter: { start },
      });

      expect(start.mock.calls[0]?.[0]).toMatchObject({ uploadToServer: false });
    });

    test('덤프 폴더는 기본 루트 아래다 — 자료 루트가 확정되기 전에 붙어야 하므로', () => {
      const setPath = vi.fn();
      const dir = installCrashReporter({
        app: { getPath: () => path.join('C:', 'userData'), setPath, on: vi.fn() },
        crashReporter: { start: vi.fn() },
      });

      expect(dir).toBe(path.join('C:', 'userData', 'crash-dumps'));
      expect(setPath).toHaveBeenCalledWith('crashDumps', dir);
    });

    test('경로 지정이 실패해도 리포터는 붙인다 — 기본 위치라도 남기는 게 낫다', () => {
      const start = vi.fn();
      expect(() =>
        installCrashReporter({
          app: {
            getPath: () => 'C:\\userData',
            setPath: () => {
              throw new Error('권한 없음');
            },
            on: vi.fn(),
          },
          crashReporter: { start },
        }),
      ).not.toThrow();
      expect(start).toHaveBeenCalled();
    });
  });

  describe('findCrashDumps', () => {
    test('하위 폴더의 .dmp 를 최신순으로 찾는다', () => {
      const root = makeTempDir();
      writeDump(path.join(root, 'reports'), 'old.dmp', 1024, new Date('2026-08-01T00:00:00Z'));
      writeDump(path.join(root, 'reports'), 'new.dmp', 2048, new Date('2026-08-19T00:00:00Z'));
      writeDump(path.join(root, 'pending'), 'mid.dmp', 512, new Date('2026-08-10T00:00:00Z'));

      const dumps = findCrashDumps(root);

      expect(dumps.map((d) => path.basename(d.file))).toEqual(['new.dmp', 'mid.dmp', 'old.dmp']);
      expect(dumps[0]?.sizeBytes).toBe(2048);
    });

    test('덤프가 아닌 파일은 무시한다', () => {
      const root = makeTempDir();
      writeDump(path.join(root, 'reports'), 'settings.dat', 10, new Date());
      expect(findCrashDumps(root)).toHaveLength(0);
    });

    test('폴더가 없으면 조용히 빈 배열 — 크래시가 없었다는 뜻이라 정상 경로다', () => {
      expect(findCrashDumps(path.join(makeTempDir(), '없는폴더'))).toEqual([]);
    });

    test('개수를 제한한다', () => {
      const root = makeTempDir();
      for (let i = 0; i < 8; i++) {
        writeDump(path.join(root, 'reports'), `d${i}.dmp`, 100, new Date(Date.UTC(2026, 7, i + 1)));
      }
      expect(findCrashDumps(root, 3)).toHaveLength(3);
    });
  });

  describe('describeCrashDumps', () => {
    test('크래시가 없으면 아무 줄도 안 남긴다 — 조용한 게 정상이다', () => {
      expect(describeCrashDumps([])).toEqual([]);
    });

    test('있으면 개수와 시각·크기를 사람이 읽게 적는다', () => {
      const lines = describeCrashDumps([
        {
          file: 'C:\\crash-dumps\\reports\\a.dmp',
          sizeBytes: 2048,
          modifiedAt: new Date('2026-08-19T06:57:21.000Z'),
        },
      ]);

      expect(lines[0]).toContain('1건');
      expect(lines[1]).toContain('2026-08-19T06:57:21.000Z');
      expect(lines[1]).toContain('2KB');
      expect(lines[1]).toContain('a.dmp');
    });
  });

  describe('reportCrashEvidence', () => {
    test('지난 덤프를 진단 로그에 적고 자식 프로세스 사망도 구독한다', () => {
      const root = makeTempDir();
      writeDump(path.join(root, 'reports'), 'a.dmp', 4096, new Date('2026-08-19T06:57:21.000Z'));

      const log = vi.fn();
      const warn = vi.fn();
      const handlers = new Map<string, (...a: unknown[]) => void>();
      const app: CrashEvidenceApp = {
        getPath: () => root,
        setPath: vi.fn(),
        on: (event, listener) => handlers.set(event, listener),
      };

      reportCrashEvidence({ app, crashReporter: { start: vi.fn() }, log, warn }, root);

      expect(log.mock.calls.some((c) => String(c[0]).includes('크래시 덤프'))).toBe(true);
      expect(handlers.has('child-process-gone')).toBe(true);
      expect(handlers.has('render-process-gone')).toBe(true);

      handlers.get('child-process-gone')?.(
        {},
        {
          type: 'GPU',
          reason: 'crashed',
          exitCode: 133,
        },
      );
      expect(warn.mock.calls.some((c) => String(c[0]).includes('type=GPU'))).toBe(true);
    });

    test('덤프 조회가 실패해도 앱 기동을 막지 않는다', () => {
      const warn = vi.fn();
      expect(() =>
        reportCrashEvidence(
          {
            app: { getPath: () => '', setPath: vi.fn(), on: vi.fn() },
            crashReporter: { start: vi.fn() },
            log: vi.fn(),
            warn,
          },
          '\0잘못된경로',
        ),
      ).not.toThrow();
    });
  });
});
