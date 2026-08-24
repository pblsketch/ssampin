/**
 * 원클릭업무포털 실행 IPC — 외부 프로그램의 설치 여부를 확인하고 실행한다.
 *
 * 채널:
 *  - `oneclick-portal:status` : 설치·실행 여부 조회
 *  - `oneclick-portal:launch` : 실행 (이미 실행 중이면 실행하지 않음)
 *
 * 원클릭업무포털은 청완초등학교 온영범 선생님이 만든 별개의 무료 프로그램이다.
 * 쌤핀은 **실행만 도울 뿐** 그 프로그램의 동작에 관여하지 않으며, 설치 파일을 배포하지도 않는다.
 * (저작자 동의 2026-08-21 — `docs/01-plan/features/oneclick-portal-tool.plan.md`)
 *
 * 보안 — 왜 `shell:openPath` 를 쓰지 않는가:
 *  `shell:openPath` 는 임의 `.exe` 실행을 의도적으로 거부한다. 그 방어를 유지한 채
 *  이 프로그램 하나만 여는 전용 통로를 둔다. 지켜야 할 원칙은 다음 두 가지다.
 *   1. **renderer 는 경로를 넘기지 않는다.** "원클릭업무포털을 열어달라"는 의도만 보내고,
 *      실행 경로는 메인이 레지스트리에서 직접 찾는다. renderer 가 경로를 정할 수 있으면
 *      이 통로가 곧 임의 실행 구멍이 된다.
 *   2. **레지스트리 값이 예상 설치 위치를 가리킬 때만 실행한다.** 실행 파일명은 우리가
 *      `InstallLocation` 뒤에 `OneClickPortal.exe` 를 직접 붙여 만들므로 파일명은 검증할
 *      것이 없다(항상 이 이름이다). 실제로 확인해야 하는 것은 **폴더 쪽**이다 —
 *      `InstallLocation` 이 %LOCALAPPDATA% 하위가 아니면 실행하지 않는다.
 *
 * 경로 판정 근거는 실기 검증으로 확인했다 —
 * `docs/03-analysis/oneclick-portal/integration-surface.analysis.md` §4.
 */
import { ipcMain } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join, win32 } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 실행 파일명. 이 이름이 아니면 실행하지 않는다. */
const EXECUTABLE_NAME = 'OneClickPortal.exe';

/**
 * Velopack 이 설치 시 기록하는 제거 항목. per-user 설치라 HKCU 에 쓰인다.
 * 여기의 `InstallLocation` 이 설치 루트다.
 */
const UNINSTALL_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OneClickPortal';

/** 레지스트리·프로세스 조회가 걸려도 UI 가 멈추지 않도록 짧게 끊는다. */
const QUERY_TIMEOUT_MS = 5000;

export interface OneClickPortalStatus {
  /** 윈도우가 아니면 false — 이 프로그램은 윈도우 전용이다. */
  readonly supported: boolean;
  readonly installed: boolean;
  readonly running: boolean;
  /** 설치된 버전. 못 읽으면 null (설치 판정에는 쓰지 않는다). */
  readonly version: string | null;
}

export type OneClickPortalLaunchResult =
  | { readonly outcome: 'launched' }
  /** 이미 떠 있어서 실행하지 않음. 그 프로그램 창은 화면 우측 하단의 작은 막대다. */
  | { readonly outcome: 'already-running' }
  | { readonly outcome: 'not-installed' }
  | { readonly outcome: 'unsupported' }
  | { readonly outcome: 'failed'; readonly message: string };

/**
 * `reg query` 출력에서 값 하나를 꺼낸다.
 * 출력 형식은 `    이름    REG_SZ    데이터` 로, 로캘과 무관하게 동일하다.
 *
 * (export 는 테스트용 — 이 파일 밖의 실행 코드는 부르지 않는다.)
 */
export function readRegistryValue(output: string, valueName: string): string | null {
  // 값 이름에 정규식 특수문자가 있어도 글자 그대로 찾는다. 지금 부르는 이름 둘에는
  // 특수문자가 없지만, `Install(Location)` 같은 이름이 오면 괄호가 캡처 그룹이 되어
  // 데이터 대신 이름 조각을 돌려주는 식으로 조용히 어긋난다.
  const escaped = valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*${escaped}\\s+REG_[A-Z_]+\\s+(.+?)\\s*$`, 'm');
  const matched = pattern.exec(output);
  return matched?.[1] ?? null;
}

/**
 * `InstallLocation` 이 예상 설치 위치의 하위 폴더인지 확인한다.
 *
 * Velopack per-user 설치는 항상 `%LOCALAPPDATA%\OneClickPortal` 에 깔린다(실기 검증 —
 * integration-surface.analysis.md §4). 반면 HKCU 는 관리자 권한 없이 아무 프로세스나
 * 고칠 수 있는 영역이라, 값이 조작되면 이 통로가 임의 폴더의 `OneClickPortal.exe` 를
 * 실행하는 구멍이 된다. 그래서 %LOCALAPPDATA% 밖을 가리키는 값은 믿지 않는다.
 *
 * 비교는 정규화(`..` 풀기) 후 대소문자 무시로 한다 — 윈도우 파일 시스템 규칙.
 * `win32` 경로 함수를 명시해 어느 OS 의 CI 에서도 같은 답이 나온다(실행 자체는
 * 어차피 윈도우에서만 한다). export 는 테스트용.
 *
 * @param roots 예상 설치 루트 목록. 실전에서는 %LOCALAPPDATA% 하나다.
 */
export function isUnderExpectedInstallRoot(
  location: string,
  roots: readonly (string | undefined)[] = [process.env.LOCALAPPDATA],
): boolean {
  const target = win32.resolve(location).toLowerCase();
  return roots.some((root) => {
    if (root === undefined || root.trim() === '' || !win32.isAbsolute(root)) return false;
    const base = win32.resolve(root).toLowerCase();
    const baseWithSep = base.endsWith(win32.sep) ? base : `${base}${win32.sep}`;
    // 루트 자신은 통과시키지 않는다 — 설치 루트는 항상 하위 폴더다.
    // `\Local` 로 `\LocalEvil` 이 통과하지 않도록 구분자까지 붙여 비교한다.
    return target.startsWith(baseWithSep);
  });
}

interface InstalledInfo {
  readonly executablePath: string;
  readonly version: string | null;
}

/**
 * 설치된 실행 파일을 찾는다. 못 찾으면 null.
 *
 * **`DisplayIcon` 을 실행 경로로 쓰지 않는다.** 그 값은 `current\` 안쪽을 가리키는데,
 * 자동 업데이트가 그 폴더를 통째로 교체하므로 경로가 깨진다.
 * 설치 루트 바로 아래의 실행 파일(스텁)은 위치가 고정이고 항상 현재 버전으로 넘겨 준다.
 */
async function findInstalled(): Promise<InstalledInfo | null> {
  let output: string;
  try {
    const result = await execFileAsync('reg', ['query', UNINSTALL_KEY], {
      timeout: QUERY_TIMEOUT_MS,
      windowsHide: true,
    });
    output = result.stdout;
  } catch {
    // 키가 없으면 `reg` 가 실패한다 = 설치되지 않음. 정상적인 경우라 로그를 남기지 않는다.
    return null;
  }

  const installLocation = readRegistryValue(output, 'InstallLocation');
  if (installLocation === null || !isAbsolute(installLocation)) {
    return null;
  }
  // HKCU 값이 조작돼 엉뚱한 폴더를 가리키는 경우 — 예상 설치 위치 밖이면 없는 셈 친다.
  if (!isUnderExpectedInstallRoot(installLocation)) {
    return null;
  }

  const executablePath = join(installLocation, EXECUTABLE_NAME);
  if (!existsSync(executablePath)) {
    return null;
  }

  return { executablePath, version: readRegistryValue(output, 'DisplayVersion') };
}

/** 이미 떠 있는지 확인한다. 확인에 실패하면 false 로 두어 실행을 막지 않는다. */
async function isRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'tasklist',
      ['/FI', `IMAGENAME eq ${EXECUTABLE_NAME}`, '/NH'],
      { timeout: QUERY_TIMEOUT_MS, windowsHide: true },
    );
    // 해당 프로세스가 없으면 tasklist 는 "정보: ..." 안내문만 출력한다.
    return stdout.toLowerCase().includes(EXECUTABLE_NAME.toLowerCase());
  } catch {
    return false;
  }
}

export function registerOneClickPortalHandlers(): void {
  ipcMain.handle('oneclick-portal:status', async (): Promise<OneClickPortalStatus> => {
    if (process.platform !== 'win32') {
      return { supported: false, installed: false, running: false, version: null };
    }

    const installed = await findInstalled();
    if (installed === null) {
      return { supported: true, installed: false, running: false, version: null };
    }

    return {
      supported: true,
      installed: true,
      running: await isRunning(),
      version: installed.version,
    };
  });

  ipcMain.handle('oneclick-portal:launch', async (): Promise<OneClickPortalLaunchResult> => {
    if (process.platform !== 'win32') {
      return { outcome: 'unsupported' };
    }

    const installed = await findInstalled();
    if (installed === null) {
      return { outcome: 'not-installed' };
    }

    // 그 프로그램에는 중복 실행을 막는 장치가 없어(v0.1.14 기준) 두 번 실행하면 창이 두 개 뜬다.
    // 쌤핀 쪽에서 먼저 확인해 중복 실행을 피한다.
    if (await isRunning()) {
      return { outcome: 'already-running' };
    }

    try {
      const child = spawn(installed.executablePath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      return { outcome: 'launched' };
    } catch (error) {
      return {
        outcome: 'failed',
        message: error instanceof Error ? error.message : '알 수 없는 오류',
      };
    }
  });
}
