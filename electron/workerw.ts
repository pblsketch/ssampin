/**
 * workerw.ts
 * Windows WorkerW 레이어에 Electron 창을 붙여 진짜 바탕화면 위젯으로 만드는 모듈.
 *
 * 원리: Progman(바탕화면 프로세스)에 0x052C 메시지 → WorkerW 생성
 *       → SHELLDLL_DefView를 가진 창의 형제 WorkerW 탐색
 *       → SetParent(widgetHWND, workerW) → 아이콘 뒤, 월페이퍼 위 레이어에 고정
 *
 * 구현: node-gyp 없이 동작하도록 PowerShell + .NET P/Invoke 사용
 */

import { execFileSync, execFile } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── PowerShell / C# 스크립트 ──────────────────────────────────────────────
// Add-Type으로 Win32 API를 P/Invoke로 호출. .NET이 어셈블리를 캐시하므로
// 두 번째 실행부터는 컴파일 없이 빠르게 로드됨.
const PS_SCRIPT = `
param([long]$hwnd)

if (-not ([System.Management.Automation.PSTypeName]'SsamPinDesktop').Type) {
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SsamPinDesktop {
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)]
    public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string cls, string title);
    [DllImport("user32.dll")]
    public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr wp, IntPtr lp, uint flags, uint to, out IntPtr res);
    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumProc cb, IntPtr lp);
    [DllImport("user32.dll")]
    public static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")]
    public static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hwnd, int nIndex);
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hwnd, int nIndex, int dwNewLong);
    public delegate bool EnumProc(IntPtr hwnd, IntPtr lp);

    public static IntPtr FindWorkerW() {
        var pm = FindWindow("Progman", null);
        if (pm == IntPtr.Zero) return IntPtr.Zero;
        IntPtr unused;
        SendMessageTimeout(pm, 0x052C, IntPtr.Zero, IntPtr.Zero, 0, 1000, out unused);
        IntPtr ww = IntPtr.Zero;
        EnumWindows((h, lp) => {
            var sv = FindWindowEx(h, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (sv != IntPtr.Zero) {
                ww = FindWindowEx(IntPtr.Zero, h, "WorkerW", null);
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return ww;
    }
}
"@ 2>$null
}

$ww = [SsamPinDesktop]::FindWorkerW()
if ($ww -eq [IntPtr]::Zero) {
    Write-Output "FAILED:WorkerW_not_found"
    exit 1
}

# 1. WS_STYLE 변경: WS_CHILD 추가, WS_MINIMIZEBOX/WS_MAXIMIZEBOX/WS_CAPTION 제거
$GWL_STYLE = -16
$WS_CHILD = 0x40000000
$WS_CAPTION = 0x00C00000
$WS_THICKFRAME = 0x00040000
$WS_SYSMENU = 0x00080000
$WS_MINIMIZEBOX = 0x00020000
$WS_MAXIMIZEBOX = 0x00010000

$style = [SsamPinDesktop]::GetWindowLong([IntPtr]$hwnd, $GWL_STYLE)
$style = $style -band (-bnot ($WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU -bor $WS_MINIMIZEBOX -bor $WS_MAXIMIZEBOX))
$style = $style -bor $WS_CHILD
[SsamPinDesktop]::SetWindowLong([IntPtr]$hwnd, $GWL_STYLE, $style)

# 2. WS_EX_STYLE: APPWINDOW + LAYERED 제거, TOOLWINDOW + NOACTIVATE 추가
#    WS_EX_LAYERED (Electron transparent:true가 설정)를 제거해야
#    DWM이 별도 레이어로 합성하지 않고 WorkerW 자식으로 정상 렌더링함
$GWL_EXSTYLE = -20
$WS_EX_APPWINDOW = 0x00040000
$WS_EX_TOOLWINDOW = 0x80
$WS_EX_NOACTIVATE = 0x08000000
$WS_EX_LAYERED = 0x00080000
$exStyle = [SsamPinDesktop]::GetWindowLong([IntPtr]$hwnd, $GWL_EXSTYLE)
$exStyle = $exStyle -band (-bnot ($WS_EX_APPWINDOW -bor $WS_EX_LAYERED))
$exStyle = $exStyle -bor $WS_EX_TOOLWINDOW -bor $WS_EX_NOACTIVATE
[SsamPinDesktop]::SetWindowLong([IntPtr]$hwnd, $GWL_EXSTYLE, $exStyle)

# 3. SetParent → WorkerW (rendering layer)
$current = [SsamPinDesktop]::GetParent([IntPtr]$hwnd)
if ($current -ne $ww) {
    [SsamPinDesktop]::SetParent([IntPtr]$hwnd, $ww)
}

# SW_SHOWNOACTIVATE(4): 포커스를 뺏지 않고 표시
[SsamPinDesktop]::ShowWindow([IntPtr]$hwnd, 4)
if ($current -eq $ww) {
    Write-Output "SUCCESS:reapplied"
} else {
    Write-Output "SUCCESS"
}
`;

// ─── WorkerW에서 분리하는 스크립트 (입력 검증 실패 시 폴백용) ──────────────
const PS_DETACH_SCRIPT = `
param([long]$hwnd)

if (-not ([System.Management.Automation.PSTypeName]'SsamPinDesktop').Type) {
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SsamPinDesktop {
    [DllImport("user32.dll")]
    public static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hwnd, int nIndex);
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hwnd, int nIndex, int dwNewLong);
}
"@ 2>$null
}

# 1. Parent 분리 먼저
[SsamPinDesktop]::SetParent([IntPtr]$hwnd, [IntPtr]::Zero)

# 2. WS_CHILD 제거, WS_POPUP 복원 (Electron frameless 기본값)
$GWL_STYLE = -16
$WS_CHILD = 0x40000000
$WS_POPUP = 0x80000000
$style = [SsamPinDesktop]::GetWindowLong([IntPtr]$hwnd, $GWL_STYLE)
$style = $style -band (-bnot $WS_CHILD)
$style = $style -bor $WS_POPUP
[SsamPinDesktop]::SetWindowLong([IntPtr]$hwnd, $GWL_STYLE, $style)

# 3. WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE 제거
$GWL_EXSTYLE = -20
$WS_EX_TOOLWINDOW = 0x80
$WS_EX_NOACTIVATE = 0x08000000
$exStyle = [SsamPinDesktop]::GetWindowLong([IntPtr]$hwnd, $GWL_EXSTYLE)
$exStyle = $exStyle -band (-bnot ($WS_EX_TOOLWINDOW -bor $WS_EX_NOACTIVATE))
[SsamPinDesktop]::SetWindowLong([IntPtr]$hwnd, $GWL_EXSTYLE, $exStyle)

[SsamPinDesktop]::ShowWindow([IntPtr]$hwnd, 5)
Write-Output "DETACHED"
`;

// ─── 바탕화면 위 모드: HWND_BOTTOM으로 z-order 배치 ──────────────────────
const PS_ABOVE_SCRIPT = `
param([long]$hwnd)

if (-not ([System.Management.Automation.PSTypeName]'SsamPinAbove').Type) {
  Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class SsamPinAbove {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern int GetWindowLong(IntPtr hwnd, int nIndex);
    [DllImport("user32.dll")]
    public static extern int SetWindowLong(IntPtr hwnd, int nIndex, int dwNewLong);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")]
    public static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
    [DllImport("user32.dll")]
    public static extern IntPtr GetParent(IntPtr hwnd);
}
"@ 2>$null
}

# behind → above 모드 전환 대비: WorkerW 부모에서 분리 + WS_CHILD 제거
$GWL_STYLE = -16
$WS_CHILD = 0x40000000
$WS_POPUP = 0x80000000

$parent = [SsamPinAbove]::GetParent([IntPtr]$hwnd)
if ($parent -ne [IntPtr]::Zero) {
    [SsamPinAbove]::SetParent([IntPtr]$hwnd, [IntPtr]::Zero)
}

$style = [SsamPinAbove]::GetWindowLong([IntPtr]$hwnd, $GWL_STYLE)
if ($style -band $WS_CHILD) {
    $style = $style -band (-bnot $WS_CHILD)
    $style = $style -bor $WS_POPUP
    [SsamPinAbove]::SetWindowLong([IntPtr]$hwnd, $GWL_STYLE, $style)
}

$HWND_BOTTOM = [IntPtr]::new(1)
$SWP_NOMOVE = 0x0002
$SWP_NOSIZE = 0x0001
$SWP_NOACTIVATE = 0x0010
$SWP_SHOWWINDOW = 0x0040

# WS_EX_NOACTIVATE 적용 (클릭 시 다른 앱 포커스 안 뺏음)
$GWL_EXSTYLE = -20
$WS_EX_NOACTIVATE = 0x08000000
$WS_EX_TOOLWINDOW = 0x80
$WS_EX_APPWINDOW = 0x00040000
$exStyle = [SsamPinAbove]::GetWindowLong([IntPtr]$hwnd, $GWL_EXSTYLE)
$exStyle = $exStyle -bor $WS_EX_NOACTIVATE -bor $WS_EX_TOOLWINDOW
$exStyle = $exStyle -band (-bnot $WS_EX_APPWINDOW)
[SsamPinAbove]::SetWindowLong([IntPtr]$hwnd, $GWL_EXSTYLE, $exStyle)

# 최소화 상태에서 복원 (SW_SHOWNOACTIVATE=4: 포커스 뺏지 않음)
[SsamPinAbove]::ShowWindow([IntPtr]$hwnd, 4)

# HWND_BOTTOM으로 z-order 배치 (바탕화면 아이콘 위, 일반 창 아래)
[SsamPinAbove]::SetWindowPos([IntPtr]$hwnd, $HWND_BOTTOM, 0, 0, 0, 0, $SWP_NOMOVE -bor $SWP_NOSIZE -bor $SWP_NOACTIVATE -bor $SWP_SHOWWINDOW)

Write-Output "ABOVE_OK"
`;

// ─── 스크립트 파일 캐싱 ───────────────────────────────────────────────────
let _scriptPath: string | null = null;
let _detachScriptPath: string | null = null;
let _aboveScriptPath: string | null = null;

function getScriptPath(): string {
  if (_scriptPath && existsSync(_scriptPath)) return _scriptPath;
  const dir = join(tmpdir(), 'ssampin-widget');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _scriptPath = join(dir, 'workerw.ps1');
  writeFileSync(_scriptPath, PS_SCRIPT, { encoding: 'utf8' });
  return _scriptPath;
}

function getDetachScriptPath(): string {
  if (_detachScriptPath && existsSync(_detachScriptPath)) return _detachScriptPath;
  const dir = join(tmpdir(), 'ssampin-widget');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _detachScriptPath = join(dir, 'workerw-detach.ps1');
  writeFileSync(_detachScriptPath, PS_DETACH_SCRIPT, { encoding: 'utf8' });
  return _detachScriptPath;
}

function getAboveScriptPath(): string {
  if (_aboveScriptPath && existsSync(_aboveScriptPath)) return _aboveScriptPath;
  const dir = join(tmpdir(), 'ssampin-widget');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  _aboveScriptPath = join(dir, 'workerw-above.ps1');
  writeFileSync(_aboveScriptPath, PS_ABOVE_SCRIPT, { encoding: 'utf8' });
  return _aboveScriptPath;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────

/**
 * HWND 버퍼에서 정수값을 추출하는 내부 헬퍼
 */
function readHwnd(hwndBuffer: Buffer): number {
  return hwndBuffer.length >= 8
    ? Number(hwndBuffer.readBigUInt64LE(0))
    : hwndBuffer.readUInt32LE(0);
}

/**
 * Electron BrowserWindow의 HWND를 WorkerW(바탕화면 레이어)에 붙인다. (비동기)
 * 메인 프로세스를 블록하지 않으므로 위젯 표시 후 백그라운드에서 호출할 것.
 * @param hwndBuffer  BrowserWindow.getNativeWindowHandle() 반환값
 * @returns Promise<boolean> — 성공 여부
 */
export function attachToDesktopAsync(hwndBuffer: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const hwnd = readHwnd(hwndBuffer);
      if (hwnd === 0) {
        console.warn('[workerw] HWND가 0입니다.');
        resolve(false);
        return;
      }
      const scriptFile = getScriptPath();
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-NonInteractive',
          '-File',
          scriptFile,
          String(hwnd),
        ],
        { timeout: 15_000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            console.error('[workerw] attachToDesktopAsync 오류:', String(err).substring(0, 300));
            resolve(false);
            return;
          }
          const output = stdout.trim();
          const ok = output.startsWith('SUCCESS');
          console.log('[workerw]', ok ? `바탕화면 레이어 연결: ${output}` : `실패: ${output}`);
          resolve(ok);
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[workerw] attachToDesktopAsync 예외:', msg.substring(0, 300));
      resolve(false);
    }
  });
}

/**
 * Electron BrowserWindow의 HWND를 WorkerW(바탕화면 레이어)에 붙인다. (동기 — 하트비트 전용)
 * ⚠️ 메인 프로세스를 블록함. 하트비트처럼 백그라운드 인터벌에서만 사용할 것.
 * @param hwndBuffer  BrowserWindow.getNativeWindowHandle() 반환값
 * @returns 성공 여부 (실패 시 창은 일반 플로팅 모드로 유지됨)
 */
/**
 * WorkerW(바탕화면 레이어)에서 분리하여 독립 윈도우로 복원한다. (비동기)
 * 입력 검증 실패 시 폴백으로 사용.
 * @param hwndBuffer  BrowserWindow.getNativeWindowHandle() 반환값
 * @returns Promise<boolean> — 성공 여부
 */
export function detachFromDesktopAsync(hwndBuffer: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const hwnd = readHwnd(hwndBuffer);
      if (hwnd === 0) {
        console.warn('[workerw] detach: HWND가 0입니다.');
        resolve(false);
        return;
      }
      const scriptFile = getDetachScriptPath();
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-NonInteractive',
          '-File',
          scriptFile,
          String(hwnd),
        ],
        { timeout: 10_000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            console.error('[workerw] detachFromDesktopAsync 오류:', String(err).substring(0, 300));
            resolve(false);
            return;
          }
          const output = stdout.trim();
          const ok = output === 'DETACHED';
          console.log('[workerw]', ok ? '바탕화면 레이어에서 분리 완료' : `분리 실패: ${output}`);
          resolve(ok);
        },
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[workerw] detachFromDesktopAsync 예외:', msg.substring(0, 300));
      resolve(false);
    }
  });
}

/**
 * 위젯을 바탕화면 위 모드로 설정 (HWND_BOTTOM + WS_EX_NOACTIVATE).
 * SetParent를 사용하지 않으므로 Win+D 영향 없음.
 * @param hwndBuffer  BrowserWindow.getNativeWindowHandle() 반환값
 * @returns Promise<boolean> — 성공 여부
 */
export function setAboveModeAsync(hwndBuffer: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const hwnd = readHwnd(hwndBuffer);
      if (hwnd === 0) { resolve(false); return; }
      const scriptFile = getAboveScriptPath();
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-File', scriptFile, String(hwnd)],
        { timeout: 10_000, windowsHide: true },
        (err, stdout) => {
          if (err) {
            console.error('[workerw] above mode 오류:', String(err).substring(0, 300));
            resolve(false);
            return;
          }
          const ok = stdout.trim() === 'ABOVE_OK';
          console.log('[workerw]', ok ? '바탕화면 위 모드 적용' : `above 실패: ${stdout.trim()}`);
          resolve(ok);
        },
      );
    } catch {
      resolve(false);
    }
  });
}

export function attachToDesktop(hwndBuffer: Buffer): boolean {
  try {
    const hwnd = readHwnd(hwndBuffer);

    if (hwnd === 0) {
      console.warn('[workerw] HWND가 0입니다.');
      return false;
    }

    const scriptFile = getScriptPath();
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-NonInteractive',
        '-File',
        scriptFile,
        String(hwnd),
      ],
      { timeout: 10_000, windowsHide: true },
    )
      .toString()
      .trim();

    const ok = output.startsWith('SUCCESS');
    console.log('[workerw]', ok ? `바탕화면 레이어 연결: ${output}` : `실패: ${output}`);
    return ok;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[workerw] attachToDesktop 오류:', msg.substring(0, 300));
    return false;
  }
}

