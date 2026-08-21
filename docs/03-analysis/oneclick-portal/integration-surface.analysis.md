# 분석: 원클릭업무포털 연동 지점 (integration surface)

> 작성: 2026-08-21 · 유형: analysis · 근거: `github.com/zeroboom92/OneClickPortal` @ main (v0.1.14) firsthand 확인
> 목적: **저작권을 침해하지 않으면서** 쌤핀 사용자가 원클릭업무포털을 편하게 쓰게 하는 방법 결정
> 관련: `docs/01-plan/features/oneclick-portal-tool.plan.md`

---

## 0. 조사 원칙

공개 저장소를 **연동 지점을 파악하기 위해서만** 읽었다. 구현 로직(`PortalWorkflowController.cs`
85KB, `DevToolsAutomation.cs` 17KB)은 열지 않았고, 어떤 코드도 쌤핀으로 옮기지 않는다.
확인한 것은 "밖에서 이 프로그램을 어떻게 부르는가"에 해당하는 것들뿐이다 —
진입점, 패키징, 설치 경로, 레지스트리 키, 인자, URI 스킴.

## 1. 저작권 상태 (확정)

```
$ gh api repos/zeroboom92/OneClickPortal --jq '.license'
null
```

LICENSE 파일 없음 + 사이트 "All rights reserved" 표기. **기본 저작권이 온전히 저작자에게 있다.**
→ 코드 복제·이식·2차저작 불가. 파생 구현도 불가. **"실행해 주기"와 "링크하기"만 가능하며,
이는 저작권이 아니라 저작자 의사의 문제**이므로 동의를 받는 것이 맞다 (2026-08-21 DM 발송 완료).

## 2. 패키징 — Velopack

`.github/workflows/release.yml` + `BrowserThumbnailPrototype.csproj`:

| 항목         | 값                                                                                |
| ------------ | --------------------------------------------------------------------------------- |
| 패키저       | Velopack 1.2.0 (`vpk pack`)                                                       |
| packId       | `OneClickPortal`                                                                  |
| mainExe      | `OneClickPortal.exe`                                                              |
| AssemblyName | `OneClickPortal` (프로젝트명은 `BrowserThumbnailPrototype`이지만 산출물명은 다름) |
| 타깃         | `net8.0-windows`, `win-x64`, **self-contained**                                   |
| packTitle    | `원클릭업무포털`                                                                  |
| 배포         | GitHub Releases + Velopack 자동 업데이트 (앱 시작 시 확인)                        |

**함의 1 — 설치 위치는 사용자별(per-user)이다.** Velopack 윈도우 기본값은
`%LOCALAPPDATA%\OneClickPortal\`. 관리자 권한 없이 설치되므로 학교 PC에서도 깔린다.

**함의 2 — 경로 하드코딩 금지.** 자동 업데이트가 내부 버전 폴더를 갈아치운다.
탐지는 반드시 레지스트리를 통해야 한다 (§4).

**함의 3 — 업데이트 중 실행 실패 가능.** 쌤핀이 실행을 시도하는 순간 Velopack이
업데이트 중일 수 있다. 실패 시 조용히 죽지 말고 사이트 안내로 폴백해야 한다.

## 3. ⚠️ 핵심 발견 — 바깥에서 부를 수 있는 창구가 없다

`Program.cs` 전문(24줄)을 확인했다.

- **명령줄 인자를 받지 않는다.** `private static void Main()` — 파라미터 자체가 없다.
- **커스텀 URI 스킴이 없다.** 저장소 전체에서 프로토콜 등록 코드 없음.
  (`EdgeIntegrationPolicy.cs`의 `wxsclient`는 **나이스 인증서 클라이언트**용으로,
  Edge 정책 JSON을 고쳐 프로토콜 허용 팝업을 없애는 것 — 이 프로그램 자신의 스킴이 아니다.)
- **단일 인스턴스 처리가 없다.** Mutex 없음 → 이미 떠 있는데 또 실행하면 창이 두 개 뜬다.

### 그래서 오늘 가능한 최대치는 "프로그램을 띄우는 것"까지다

쌤핀에 카드를 6장(나이스/복무/출장/에듀파인/기안/품의) 만들어도, **전부 같은 동작
(프로그램 실행)밖에 못 한다.** "복무 카드를 누르면 복무 신청 화면까지" 는 저작자의
협조 없이는 불가능하다. 억지로 하려면 그쪽 창을 외부에서 조작해야 하는데,
그건 남의 프로그램을 자동 조종하는 것이라 §1 원칙에 정면으로 어긋난다.

## 4. 설치 탐지 방법 — ✅ 실기 검증 완료 (2026-08-21)

v0.1.14 정식 설치본을 **실제로 설치해 확인**했다. 아래는 추정이 아니라 관측값이다.
(설치: `OneClickPortal-win-Setup.exe --silent`, 종료 코드 0. 설치 전 관련 키·폴더 전무한 상태에서 diff.)

### 4.1 디렉터리 구조 (per-user, 관리자 권한 불필요)

```
%LOCALAPPDATA%\OneClickPortal\
  ├── OneClickPortal.exe      764,928 B   ← 스텁(shim). 쌤핀은 이걸 실행한다
  ├── Update.exe            4,238,848 B   ← Velopack 업데이터
  ├── current\
  │     └── OneClickPortal.exe  524,800 B ← 실제 앱 본체(버전마다 교체됨)
  └── packages\
```

### 4.2 레지스트리 (관측값)

`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\OneClickPortal`

| 값 이름           | 관측된 내용                                      |
| ----------------- | ------------------------------------------------ |
| `DisplayName`     | `원클릭업무포털`                                 |
| `DisplayVersion`  | `0.1.14`                                         |
| `InstallLocation` | `C:\Users\<사용자>\AppData\Local\OneClickPortal` |
| `DisplayIcon`     | `...\OneClickPortal\current\OneClickPortal.exe`  |
| `Publisher`       | `OneClickPortal`                                 |
| `UninstallString` | `"...\OneClickPortal\Update.exe" --uninstall`    |

시작 메뉴 바로가기도 생긴다:
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\원클릭업무포털.lnk`
(대상은 `current\OneClickPortal.exe`, 인자 없음)

### 4.3 쌤핀이 실행할 대상 — 루트의 스텁

**`InstallLocation` + `\OneClickPortal.exe` (루트)** 를 실행한다.

- 저작자의 시작 메뉴 바로가기와 `DisplayIcon`은 `current\OneClickPortal.exe`를 가리키지만,
  **`current\`는 자동 업데이트 때 교체되는 경로다.** 루트 스텁은 고정이고 항상 현재 버전으로
  넘겨 준다. → **`DisplayIcon`을 실행 경로로 쓰면 안 된다.** 아이콘 표시용으로만 쓴다.
- 검증 순서: `InstallLocation` 존재 → 그 아래 `OneClickPortal.exe` 존재 → 파일명 정확히 일치.
  하나라도 어긋나면 실행하지 말고 사이트 안내로 폴백한다.

### 4.4 설치 직후에는 없는 것 (관측 확인)

- `HKCU\Software\OneClickPortal` — **앱을 한 번 실행해야 생긴다.** 설치만으로는 없다.
  → 이 키의 존재로 설치를 판정하면 **오판한다.** 반드시 §4.2 Uninstall 키로 판정할 것.
- `HKCU\...\CurrentVersion\Run` 항목 — 설치 시점에는 추가되지 않는다 (§4.5).

### 4.5 ⚠️ 첫 실행 시 자동 시작에 스스로 등록된다

`AppPreferences.IsWindowsStartupEnabled()`는 **설정 키가 없으면 `true`를 반환**하고,
`Program.Main`이 시작 시 그 값을 적용한다. 즉 **앱을 처음 실행하는 순간
`HKCU\...\CurrentVersion\Run`에 자기를 등록한다.**

쌤핀에서 문제가 되는 지점: 설치만 해 두고 한 번도 안 켠 선생님이 **쌤핀 카드를 눌러 처음
실행하게 되면** 그 순간 윈도우 시작 프로그램에 등록된다. 선생님은 "쌤핀에서 뭘 눌렀더니
컴퓨터 켤 때마다 뭐가 뜬다"고 느낀다.

→ 대응: 카드에 외부 프로그램임을 표기하는 것(§7)에 더해, **처음 실행할 때 한 번은
"원클릭업무포털을 실행합니다"류의 확인을 거치는 것**을 검토한다.
저작자 설정에서 끌 수 있는 항목이므로 **쌤핀이 대신 꺼 주거나 레지스트리를 건드려서는 안 된다**(§6).
저작자에게는 정보 공유 차원에서 알려 드리되, 설계 변경을 요구하지 않는다.

### 4.6 제거 방법 (검증용 설치를 되돌릴 때)

`"%LOCALAPPDATA%\OneClickPortal\Update.exe" --uninstall`
또는 윈도우 설정 → 앱 → 원클릭업무포털.

## 5. 권고 — 3단계

### 0단계 · 링크 카드 (저작자 동의만 있으면 즉시)

기존 `ToolDefinition.externalUrl` 구조 그대로. 쌤도구 + 즐겨찾기 위젯 동시 노출.
쌤핀 쪽 작업 반나절 미만, 저쪽 변경 0.

### 1단계 · 설치돼 있으면 실행 (쌤핀 단독 가능, 1~2일)

§4로 탐지 → 있으면 실행, 없으면 0단계 동작으로 폴백.

- `electron/main.ts`의 `shell:openPath`는 임의 `.exe` 실행을 **의도적으로 거부**한다.
  이 방어를 유지한 채, **이 프로그램 하나만** 여는 전용 IPC를 새로 판다.
- 렌더러는 경로를 넘기지 않는다. "원클릭업무포털을 열어달라"는 의도만 보내고,
  경로 결정은 전적으로 메인 프로세스가 레지스트리에서 한다. (렌더러가 경로를 정하면
  임의 실행 구멍이 된다.)
- 실행 파일명이 `OneClickPortal.exe`인지 검증한 뒤에만 실행한다.
- 단일 인스턴스가 없으므로(§3), 이미 실행 중이면 중복 실행하지 말고 안내만 한다.

**1단계까지 해도 "복무 화면으로 바로"는 안 된다.** 카드는 1장으로 족하다.

### 2단계 · 저작자에게 창구를 요청 (가장 가치가 크고, 가장 깨끗하다)

원클릭업무포털이 **URI 스킴 하나만 등록**해 주면 모든 게 풀린다.

```
oneclickportal://leave        → 복무 신청
oneclickportal://trip         → 출장 신청
oneclickportal://draft        → 기안
oneclickportal://purchase     → 품의
oneclickportal://nice         → 나이스 홈
oneclickportal://edufine      → 에듀파인 홈
```

이 방식이 좋은 이유:

1. **저작권이 완벽히 보호된다.** 코드가 오가지 않는다. 그쪽이 만들고 그쪽이 통제한다.
   어떤 요청을 받아들일지도 그쪽이 정한다.
2. **쌤핀은 표준 방식만 쓴다.** `openExternal('oneclickportal://leave')` 한 줄.
   레지스트리를 뒤질 필요도, 경로를 알 필요도, 프로세스를 확인할 필요도 없다.
   OS가 등록된 핸들러로 넘겨 준다.
3. **더 안전하다.** 쌤핀의 "임의 exe 실행 금지" 방어를 아예 건드리지 않는다.
   허용 목록에 스킴 하나를 추가할 뿐이다 (§`electron/main.ts` `shell:openExternal`).
4. **저작자에게도 이득이다.** 쌤핀만이 아니라 어떤 프로그램·바로가기·배치파일에서도
   부를 수 있게 된다. 선생님들이 바탕화면에 "복무 바로가기"를 직접 만들 수도 있다.

단, 이때 **단일 인스턴스 처리도 함께** 필요하다 — 이미 떠 있는 창으로 요청을 넘겨야 하므로.
그 부분은 그쪽 설계 사항이니 요청만 하고 맡긴다.

명령줄 인자(`OneClickPortal.exe --task=leave`)로도 같은 효과가 나지만, URI 스킴이 낫다.
쌤핀이 경로를 몰라도 되고, 설치 여부 판정을 OS가 대신해 준다(핸들러 없으면 실패 → 폴백).

## 5-A. 저작자 회신 (2026-08-21) 과 그에 대한 판단

> 사적 연락 원문은 이 공개 저장소에 옮기지 않는다. 아래는 기술적 요지만 정리한 것이다.

저작자 회신 요지:

1. **정정** — 복무·출장·기안·품의는 자동화된 브라우저에서 해당 요소를 찾아 클릭하는 방식이며
   특정 주소로 넘어가는 형태가 아니다. → **사실이며, 이 문서 §3의 인식과 일치한다.**
2. **역제안** — 쌤핀이 원클릭업무포털 창의 업무 버튼을 대신 클릭하는 방식은 어떤가.

### 5-A.1 정정에 대한 해명 (우리 설명이 부정확했다)

URI 스킴 제안은 **"그 주소로 이동한다"는 뜻이 아니었다.** `oneclickportal://leave`는
목적지가 아니라 **"복무 워크플로를 실행하라"는 신호**다. 신호를 받은 뒤의 동작은
지금의 브라우저 자동화 그대로다. 목적지가 URL일 필요가 없다. 재설명 필요.

### 5-A.2 역제안(쌤핀이 그쪽 버튼을 클릭)은 **기각**

`MainForm.BuildTaskButtons()` 확인 결과, 6개 목적지는 실제 `System.Windows.Forms.Button`이고
`Text`가 `"복무"` 등으로 설정돼 있다. UI Automation으로 **찾아서 누르는 것 자체는 가능하다.**
그럼에도 기각하는 이유:

| 문제            | 내용                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 네이티브 의존성 | 쌤핀은 Electron. 타 프로세스 UIA 조작은 네이티브 모듈 또는 헬퍼 프로세스가 필요 → 빌드·서명·용량 부담                         |
| 무성 파손       | 저쪽 UI 변경(버튼 텍스트·배치)이 곧 쌤핀 고장. **쌤핀은 저쪽 릴리즈 주기에 맞춰 테스트할 수단이 없다** → 사용자가 먼저 겪는다 |
| 창 상태 의존    | 최소화·다른 가상데스크톱·포커스 상실 시 실패                                                                                  |
| 보안 오탐       | 합성 입력 주입은 학교 PC 백신·EDR이 매크로로 차단할 소지 (§계획서 §2와 동일한 위험)                                           |
| 원칙 위배       | "남의 것을 원격 조종하지 않는다"는 선(§6)을 대상만 브라우저→저쪽 앱으로 바꿔 그대로 위반                                      |

**결정적 근거**: 버튼 핸들러는 `button.Click += async (_, _) => await RunWorkflowAsync(task.Kind);`
(`MainForm.cs:226`, 진입 메서드는 `RunWorkflowAsync(PortalTaskKind)` — `MainForm.cs:626`).
즉 클릭이 유발하는 일은 **enum 하나로 키가 잡힌 메서드 호출 한 번**이다.
그 한 줄을 부르려고 창 핸들 탐색 → 컨트롤 탐색 → 합성 클릭을 하는 것은 비용·위험 대비 무의미하다.
**같은 결과를 저쪽 프로세스 안에서 직접 얻는 것이 모든 면에서 낫다.**

### 5-A.3 재제안 방향

저작자가 말한 "다리를 한 번 더 놓는다"는 발상 자체는 옳고, **다리를 놓는 지점만 옮기면 된다.**
쌤핀이 저쪽 창을 조종하는 대신, 저쪽이 **수신구(受信口)** 를 하나 두고 쌤핀이 신호를 넣는다.
URI 스킴(`oneclickportal://leave`) 또는 실행 인자(`OneClickPortal.exe --task=leave`) 둘 다 가능하며,
설치 경로는 §4에서 확정했으므로 **쌤핀 입장에서는 어느 쪽이든 무방하다.**
저쪽 구현은 "인자/URI 파싱 → `RunWorkflowAsync(kind)` 호출" + 단일 인스턴스 라우팅 정도다.

**단, 이는 어디까지나 부탁이다.** 성사되지 않아도 Phase 1+2(카드 1장 + 프로그램 실행)는
그대로 성립하며 그것만으로 충분한 가치가 있다. **이 요청을 착수 조건으로 걸지 않는다.**

## 5-B. PR 제출 (2026-08-21) — pull/2

역제안(§5-A.2)을 기각하는 대신 **부탁을 코드로 대체**했다.
`zeroboom92/OneClickPortal#2` — 포크 `pblsketch/OneClickPortal`, 브랜치 `feat/external-task-request`.

**저작권 처리**: LICENSE가 없어도 GitHub 이용약관은 공개 저장소의 fork·PR을 허용한다.
따라서 PR은 문제없다. 다만 **그 코드를 쌤핀으로 옮기는 것은 여전히 불가**하며, 그럴 필요도 없다
(쌤핀은 `openExternal`로 URI를 부르기만 한다).

### 제출 내용 (7파일, +617/-19)

신규: `PortalTaskCatalog.cs`(업무 6종 단일 출처) · `PortalTaskRequest.cs`(`--task=`/URI 해석) ·
`SingleInstanceCoordinator.cs`(Mutex + 이름 있는 파이프) · `UriSchemeRegistrar.cs`(HKCU 등록)
수정: `Program.cs`(인자 수신) · `MainForm.cs`(`RequestPortalTask` 추가) · `README.md`
**`PortalWorkflowController`·`DevToolsAutomation`은 미변경.**

### 설계 판단 두 가지

1. **연결 전 요청은 보류 후 실행** — `RunWorkflowAsync`는 Edge 연결이 선행 조건이라
   미연결 상태 요청은 안내창만 뜨고 끝난다. 그러면 앱이 꺼져 있던 사용자에게 기능이 무의미해진다.
   그래서 `_pendingTaskKind`에 담아 두고 연결 성공 직후 소비한다. 실패 시에는 비운다
   (나중에 엉뚱한 시점에 실행되는 것을 막기 위해).
2. **등록 대상은 루트 스텁** — `current\`는 업데이트 때 교체되므로 §4.3 그대로.

### 실기 검증 결과 (Windows 11, self-contained Release)

| 항목                                 | 결과                                      |
| ------------------------------------ | ----------------------------------------- |
| `--task=leave`                       | "복무 요청을 받았습니다…" 표시 ✅         |
| 실행 중 `oneclickportal://purchase`  | 프로세스 1개 유지, 문구 "품의…"로 전환 ✅ |
| 미실행 상태 `oneclickportal://draft` | 자동 실행 + "기안…" 표시 ✅               |
| 업무 버튼 6종                        | 순서·이름 그대로 생성 ✅                  |

미검증: 연결 이후 실제 화면 이동(업무포털 로그인 환경 없음). PR 본문에 명시했다.

### 검증 환경 구축에서 겪은 함정 (재발 방지)

- `winget install Microsoft.DotNet.SDK.8`은 **관리자 권한 UAC 창을 띄우고 무한 대기**한다.
  비대화형 세션에서는 아무도 못 누른다. **CPU 시간이 0에 가까우면 진행 중이 아니라 멈춘 것**이다.
  → 대안: `dot.net/v1/dotnet-install.ps1 -InstallDir "$env:LOCALAPPDATA\Microsoft\dotnet" -NoPath`
  (권한 불필요, 폴더 삭제만으로 원복).
- 그 스크립트는 **SDK 폴더만 보고 "이미 설치됨"으로 건너뛴다.** 압축 해제가 중간에 끊겨
  `shared\`(런타임)가 없는 상태에서 재실행하면 영원히 고쳐지지 않는다. → 폴더를 지우고 재설치.
- Debug 빌드는 framework-dependent라 **머신 전역 .NET Desktop Runtime이 없으면 실행되지 않는다**
  ("You must install .NET Desktop Runtime"). 사용자 폴더 SDK는 이 경로를 못 찾는다.
  → 테스트는 실제 배포와 동일하게 `--self-contained true`로 publish해서 할 것.
- 이 앱 창은 `FormBorderStyle.None`이라 **`Process.MainWindowHandle`이 0**이다.
  UI 확인은 `EnumWindows`로 프로세스의 가시 창을 찾은 뒤 UIAutomation `FromHandle`로 읽었다.
- 테스트 전 `HKCU\Software\OneClickPortal`에 `WindowsStartupEnabled=0`, `UsageTelemetry=0`을
  미리 넣어 **자동 시작 등록(§4.5)과 저작자 서버 집계 오염을 방지**했다. 테스트 후 URI 등록은 삭제.

## 6. 하지 않기로 한 것 (선 긋기)

- 그쪽 창을 외부에서 자동 조종해 특정 화면까지 보내기 — 남의 프로그램 원격 조작. **금지.**
  (저작자가 먼저 제안하더라도 기각. 이유는 §5-A.2 — 저작권이 아니라 공학·신뢰 문제다.)
- `HKCU\Software\OneClickPortal` 읽기/쓰기 — 남의 설정 침범. **금지.**
- 쌤핀이 설치 파일을 번들하거나 대신 배포 — 배포 채널은 저작자 것으로 유지. **금지.**
- 나이스·에듀파인 이동 로직 자체 구현 — 계획서 §2 참조. **금지.**

## 7. 참고 — 이 프로그램을 교사에게 권해도 되는가

익명 사용 통계만 수집한다. `functions/src/payload.js` 확인 결과 서버가 받는 값은
**익명 설치 식별자의 SHA-256 해시 + 앱 버전** 두 개뿐이고, 형식 검증 후 저장한다.
개인정보·학생정보·로그인 정보는 전송 경로 자체가 없다. 설정에서 끌 수도 있다.
→ 교사에게 권해도 문제없다고 판단한다.

다만 이 프로그램은 **Edge의 설정 파일을 수정**한다(`EdgeIntegrationPolicy.cs` —
나이스 인증서 프로토콜 허용 팝업 제거 목적). 정당한 동작이지만, 쌤핀에서 실행했을 때
사용자 눈에 "쌤핀이 Edge를 건드렸다"로 보일 수 있다.
→ **카드에 외부 프로그램임을 반드시 표기**해야 하는 실질적 이유다.
