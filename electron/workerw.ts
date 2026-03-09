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

$current = [SsamPinDesktop]::GetParent([IntPtr]$hwnd)
if ($current -eq $ww) {
    Write-Output "SKIP:already_attached"
    exit 0
}

[SsamPinDesktop]::SetParent([IntPtr]$hwnd, $ww)
[SsamPinDesktop]::ShowWindow([IntPtr]$hwnd, 5)
Write-Output "SUCCESS"
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
}
"@ 2>$null
}

[SsamPinDesktop]::SetParent([IntPtr]$hwnd, [IntPtr]::Zero)
[SsamPinDesktop]::ShowWindow([IntPtr]$hwnd, 5)
Write-Output "DETACHED"
`;

// ─── 스크립트 파일 캐싱 ───────────────────────────────────────────────────
let _scriptPath: string | null = null;
let _detachScriptPath: string | null = null;

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
          const ok = output.startsWith('SUCCESS') || output.startsWith('SKIP');
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

    const ok = output.startsWith('SUCCESS') || output.startsWith('SKIP');
    console.log('[workerw]', ok ? `바탕화면 레이어 연결: ${output}` : `실패: ${output}`);
    return ok;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[workerw] attachToDesktop 오류:', msg.substring(0, 300));
    return false;
  }
}
