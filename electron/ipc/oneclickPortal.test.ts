/**
 * 원클릭업무포털 실행 IPC — 경로·레지스트리 판정 규칙 테스트.
 *
 * 이 통로는 renderer 의 의도만 받고 실행 경로를 메인이 레지스트리에서 찾는다.
 * 그 판정의 두 축을 못 박는다:
 *  1. HKCU `InstallLocation` 이 %LOCALAPPDATA% 하위일 때만 믿는다 —
 *     HKCU 는 관리자 권한 없이 고칠 수 있어, 이 검사가 없으면 값 조작만으로
 *     임의 폴더의 `OneClickPortal.exe` 를 실행하는 구멍이 된다.
 *  2. `reg query` 값 이름은 글자 그대로 찾는다 — 정규식 특수문자가 섞여도
 *     캡처 그룹이 어긋나 엉뚱한 조각을 돌려주지 않는다.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

const { isUnderExpectedInstallRoot, readRegistryValue } = await import('./oneclickPortal');

const LOCAL_APPDATA = 'C:\\Users\\teacher\\AppData\\Local';

describe('isUnderExpectedInstallRoot — InstallLocation 은 %LOCALAPPDATA% 하위여야 한다', () => {
  it('예상 설치 위치(하위 폴더)는 통과한다', () => {
    expect(isUnderExpectedInstallRoot(`${LOCAL_APPDATA}\\OneClickPortal`, [LOCAL_APPDATA])).toBe(
      true,
    );
  });

  it('대소문자가 달라도 같은 경로로 본다 (윈도우 파일 시스템 규칙)', () => {
    expect(
      isUnderExpectedInstallRoot('c:\\users\\TEACHER\\appdata\\local\\oneclickportal', [
        LOCAL_APPDATA,
      ]),
    ).toBe(true);
  });

  it('전혀 다른 드라이브·폴더는 거부한다', () => {
    expect(isUnderExpectedInstallRoot('D:\\OneClickPortal', [LOCAL_APPDATA])).toBe(false);
    expect(isUnderExpectedInstallRoot('C:\\Windows\\System32', [LOCAL_APPDATA])).toBe(false);
  });

  it('루트 자신은 거부한다 — 설치 루트는 항상 하위 폴더다', () => {
    expect(isUnderExpectedInstallRoot(LOCAL_APPDATA, [LOCAL_APPDATA])).toBe(false);
  });

  it('이름이 앞부분만 같은 형제 폴더(LocalEvil)는 거부한다', () => {
    expect(
      isUnderExpectedInstallRoot('C:\\Users\\teacher\\AppData\\LocalEvil\\OneClickPortal', [
        LOCAL_APPDATA,
      ]),
    ).toBe(false);
  });

  it('`..` 로 루트를 빠져나가는 경로는 정규화 후 거부한다', () => {
    expect(
      isUnderExpectedInstallRoot(`${LOCAL_APPDATA}\\OneClickPortal\\..\\..\\..\\..\\Windows`, [
        LOCAL_APPDATA,
      ]),
    ).toBe(false);
  });

  it('루트가 비었거나(환경변수 없음) 상대 경로면 아무것도 통과시키지 않는다', () => {
    expect(isUnderExpectedInstallRoot(`${LOCAL_APPDATA}\\OneClickPortal`, [undefined])).toBe(false);
    expect(isUnderExpectedInstallRoot(`${LOCAL_APPDATA}\\OneClickPortal`, ['   '])).toBe(false);
    expect(isUnderExpectedInstallRoot(`${LOCAL_APPDATA}\\OneClickPortal`, ['AppData\\Local'])).toBe(
      false,
    );
  });
});

const REG_OUTPUT = [
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\OneClickPortal',
  '    DisplayName    REG_SZ    원클릭업무포털',
  '    DisplayVersion    REG_SZ    0.1.14',
  `    InstallLocation    REG_SZ    ${LOCAL_APPDATA}\\OneClickPortal`,
].join('\r\n');

describe('readRegistryValue — reg query 출력 파싱', () => {
  it('값 이름으로 데이터를 꺼낸다', () => {
    expect(readRegistryValue(REG_OUTPUT, 'InstallLocation')).toBe(
      `${LOCAL_APPDATA}\\OneClickPortal`,
    );
    expect(readRegistryValue(REG_OUTPUT, 'DisplayVersion')).toBe('0.1.14');
  });

  it('없는 값은 null', () => {
    expect(readRegistryValue(REG_OUTPUT, 'DisplayIcon')).toBeNull();
  });

  it('값 이름의 정규식 특수문자를 글자 그대로 취급한다', () => {
    const output = '    Install(Location)    REG_SZ    C:\\Somewhere';
    // 이스케이프가 없으면 괄호가 캡처 그룹이 되어 데이터 대신 "Location"이 나온다.
    expect(readRegistryValue(output, 'Install(Location)')).toBe('C:\\Somewhere');
    // `.` 이 아무 글자와 맞아 다른 이름에 걸리지도 않는다.
    expect(readRegistryValue(REG_OUTPUT, 'Display.ersion')).toBeNull();
  });
});
