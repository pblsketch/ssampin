/**
 * 크래시 증거 수집 — 앱이 즉사했을 때 "왜"를 남긴다.
 *
 * ## 왜 필요한가 (2026-08-19)
 *
 * 바탕화면 아래 모드에서 위젯 크기를 조절하던 중 앱이 통째로 사라졌다. 남은 것은 이게 전부였다:
 *
 *   [ERROR:crashpad_client_win.cc:867] not connected
 *   node scripts/electron-dev.mjs exited with code 4294930435 (0xffff7003)
 *
 * 진단 로그는 리사이즈 도중 한 줄도 남기지 못하고 끊겼고, `uncaughtException` 그물도 조용했다
 * — JS 오류가 아니라 네이티브 레벨 즉사라는 뜻이다. 그런데 **덤프 파일이 하나도 없었다.**
 * `crashReporter.start()` 를 부른 적이 없어 Crashpad 가 아예 붙지 않았기 때문이다
 * ("not connected" 가 그 뜻이다).
 *
 * 즉 그 상태로는 같은 일을 몇 번을 더 겪어도 원인을 알 수 없다. 이 모듈은 그걸 바꾼다.
 *
 * ## 무엇을 하나
 *
 * 1. Crashpad 를 붙여 **로컬에만** 덤프를 남긴다 (서버 업로드 없음 — 오프라인 완전 동작 원칙).
 * 2. 다음 실행 때 지난 크래시 덤프를 찾아 진단 로그에 적는다. 선생님은 늘 하던 대로
 *    진단 로그만 보내면 되고, 우리는 덤프가 있는지/언제인지 바로 알 수 있다.
 * 3. 렌더러·GPU 등 자식 프로세스가 죽는 경우도 같은 로그에 남긴다.
 *
 * ## 개인정보
 *
 * `uploadToServer: false` 라 덤프는 이 PC 밖으로 나가지 않는다. `extra` 에 사용자 자료를
 * 넣지 않는다 — 덤프에는 크래시 시점의 메모리 일부가 들어갈 수 있으므로, 보내 달라고
 * 요청할 때는 그 사실을 알리고 동의를 받아야 한다.
 */

import * as fs from 'fs';
import * as path from 'path';

/** 이 모듈이 쓰는 Electron `app` 의 최소 모양 (테스트에서 가짜를 물릴 수 있도록). */
export interface CrashEvidenceApp {
  getPath(name: string): string;
  setPath(name: string, value: string): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface CrashEvidenceReporter {
  start(options: { uploadToServer: boolean; compress?: boolean }): void;
}

export interface CrashDumpInfo {
  readonly file: string;
  readonly sizeBytes: number;
  readonly modifiedAt: Date;
}

/**
 * 덤프 폴더에서 최근 크래시 덤프를 최신순으로 찾는다.
 *
 * Crashpad 는 완료된 덤프를 `reports/` 아래에 `.dmp` 로 남긴다. `new/`·`pending/` 등
 * 다른 하위 폴더도 환경에 따라 생기므로 재귀로 훑되, 폴더가 없으면 조용히 빈 배열이다.
 */
export function findCrashDumps(crashDumpDir: string, limit = 5): CrashDumpInfo[] {
  const found: CrashDumpInfo[] = [];

  const walk = (dir: string, depth: number): void => {
    if (depth > 3) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // 폴더 없음/권한 없음 — 크래시가 없었다는 뜻이므로 정상 경로다
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.name.toLowerCase().endsWith('.dmp')) continue;
      try {
        const stat = fs.statSync(full);
        found.push({ file: full, sizeBytes: stat.size, modifiedAt: stat.mtime });
      } catch {
        // 방금 지워졌거나 잠긴 파일 — 건너뛴다
      }
    }
  };

  walk(crashDumpDir, 0);
  found.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return found.slice(0, limit);
}

/**
 * 지난 실행에서 남은 크래시 덤프를 사람이 읽을 한 줄들로 만든다.
 *
 * 크래시가 없으면 빈 배열 — 호출자는 아무것도 안 적으면 된다(조용한 게 정상이다).
 */
export function describeCrashDumps(dumps: readonly CrashDumpInfo[]): string[] {
  if (dumps.length === 0) return [];
  return [
    `[crash] 지난 실행에서 남은 크래시 덤프 ${dumps.length}건 — 앱이 비정상 종료된 적이 있다`,
    ...dumps.map(
      (d) =>
        `[crash]   ${d.modifiedAt.toISOString()} ${Math.round(d.sizeBytes / 1024)}KB ${d.file}`,
    ),
  ];
}

export interface InstallCrashEvidenceDeps {
  readonly app: CrashEvidenceApp;
  readonly crashReporter: CrashEvidenceReporter;
  /** 진단 로그 한 줄 기록 (nativeDesktopDiag 의 diagLog 를 넘긴다). */
  readonly log: (message: string) => void;
  readonly warn: (message: string) => void;
}

/**
 * Crashpad 를 붙인다. **`app.whenReady()` 보다 먼저** 불러야 한다 — 준비 이후에 붙이면
 * 그 전에 난 크래시를 놓친다.
 *
 * 덤프는 기본 루트(userData) 아래에 둔다. 자료 루트(선생님이 옮길 수 있는 폴더)가 아니라
 * 기본 루트인 이유: 덤프는 선생님의 자료가 아니라 진단 부산물이고, 자료 루트가 확정되기
 * 전에 붙어야 하기 때문이다.
 *
 * @returns 덤프 폴더 경로 (나중에 지난 덤프를 찾을 때 쓴다)
 */
export function installCrashReporter(
  deps: Pick<InstallCrashEvidenceDeps, 'app' | 'crashReporter'>,
): string {
  const dir = path.join(deps.app.getPath('userData'), 'crash-dumps');
  try {
    deps.app.setPath('crashDumps', dir);
  } catch {
    // 경로 지정 실패해도 기본 위치에 남기는 편이 아무것도 안 남기는 것보다 낫다
  }
  deps.crashReporter.start({ uploadToServer: false, compress: true });
  return dir;
}

/**
 * 지난 크래시를 진단 로그에 적고, 앞으로의 자식 프로세스 사망도 같은 로그로 모은다.
 *
 * `app.whenReady()` 이후, 진단 로그가 초기화된 다음에 부른다.
 */
export function reportCrashEvidence(deps: InstallCrashEvidenceDeps, crashDumpDir: string): void {
  try {
    for (const line of describeCrashDumps(findCrashDumps(crashDumpDir))) {
      deps.log(line);
    }
  } catch (e) {
    deps.warn(`[crash] 지난 덤프 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 렌더러·GPU·유틸리티 프로세스가 죽는 경우. 메인이 살아 있으므로 로그가 남는다.
  deps.app.on('child-process-gone', (...args: unknown[]) => {
    const details = args[1] as
      | { type?: string; reason?: string; exitCode?: number; serviceName?: string }
      | undefined;
    deps.warn(
      `[crash] child-process-gone type=${details?.type ?? '?'} ` +
        `reason=${details?.reason ?? '?'} exitCode=${details?.exitCode ?? '?'} ` +
        `service=${details?.serviceName ?? '-'}`,
    );
  });

  deps.app.on('render-process-gone', (...args: unknown[]) => {
    const details = args[2] as { reason?: string; exitCode?: number } | undefined;
    deps.warn(
      `[crash] render-process-gone reason=${details?.reason ?? '?'} ` +
        `exitCode=${details?.exitCode ?? '?'}`,
    );
  });
}
