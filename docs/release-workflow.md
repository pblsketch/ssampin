# 쌤핀 공용 릴리즈 절차

Claude Code·Codex·GJC는 새 버전·핫픽스 공개 작업에서 이 문서를 먼저 읽는다. 개인 메모리의 옛 SOP보다 이 문서와 현재 코드가 우선한다.

## 시작과 승인 경계

- `git branch --show-current`, `git status --short`로 main과 기존 변경을 기록한다. PROGRESS.md·최근 월별 기록·관련 ADR에서 미출시/보류/미배포 항목을 확인한다.
- 버전·릴리즈 노트·가이드·KB 문답 원고는 준비할 수 있다. **출시 목적 커밋·푸시·배포용 빌드·GitHub Release·KB ingest·운영 DB/함수 변경은 오너 실기기 확인 후 명시한 범위에서만 실행한다.** 기존 세션에서 받은 승인은 유효하며 반복 확인하지 않는다. “남은 작업 진행해”만으로 출시 승인을 추정하지 않는다.
- 출시 전 체크표를 `docs/04-report/features/release-vX.Y.Z.md`에 작성한다. 단계마다 준비/승인 대기/통과/실패/미검증과 증거를 적는다. 실제 작업 없는 단계는 이유와 함께 해당 없음으로 표시한다.
- 커밋됐다는 이유로 기능을 출시 노트에 넣지 않는다. 필요한 Edge Function의 배포 시각·대상 코드, 운영 마이그레이션 적용 여부와 실제 호출을 확인한다. 로컬 코드·자동 랜딩 배포만으로 서버 준비를 판정하지 않는다. 적용 대기 마이그레이션을 확인하지 않고 일괄 `db push`하지 않는다.

## 1. 버전과 출시 범위

- `package.json.version`, `package-lock.json`의 최상위 version 및 `packages[""].version`을 일치시킨다. JSON 필드로 검사하며 의존 패키지 버전은 바꾸지 않는다.
- `src/mobile/version.ts`의 MOBILE_APP_VERSION, `landing/src/config.ts`의 VERSION, `src/adapters/components/Layout/Sidebar.tsx`의 보이는 버전 문자열을 확인한다.
- 모바일 SettingsPage/MorePage는 MOBILE_APP_VERSION을 가져온다. 별도 버전을 넣지 않는다. 앱 정보의 **APP_VERSION**과 랜딩 structuredData의 VERSION도 자동 반영되는지 확인한다.
- 보류 기능·미배포 서버가 필요한 기능을 출시 범위에서 제외하거나 승인된 배포를 선행한다.

- 1·2단계 편집 후 `npm run check:release-prep`로 버전 6개 비교를 실행한다. 통과는 서버 배포·실기기 확인·출시 승인을 대신하지 않는다.

## 2. 릴리즈 노트

- `public/release-notes.json`의 versions 맨 앞에 실제 출시할 변경만 넣는다. 업데이트 카드와 설정 화면의 표시를 확인한다.
- 알려진 제한과 미검증 범위를 적는다. 테스트하지 않은 기능을 “완전 해결”로 표현하지 않는다.

## 3. 챗봇 지식

- `scripts/ingest-chatbot-qa.mjs`의 새 문답과 겹치는 옛 문답을 함께 검토한다. 원고 편집과 서버 ingest를 구분한다.
- 승인 뒤 기존 인증 경로로 ingest한다. 비밀값을 출력·문서·커밋에 남기지 않는다. 단순 ingest를 이유로 시크릿 교체나 함수 재배포까지 확대하지 않는다.
- ingest 후 새 기능과 옛 절차가 충돌하는 실제 질문을 보내 답변을 확인한다. 요청 형식은 현재 챗봇 API를 확인하고, 한글 요청은 UTF-8로 보낸다. 업로드 성공만으로 통과하지 않는다.

## 4. 공개 사용자 가이드

- `landing/src/content/docs.ts`와 필요한 `landing/public/docs/screenshots/`를 갱신한다. 공개 주소는 https://www.ssampin.com/docs 이며 Notion은 갱신 대상이 아니다.
- 기능별 설명 문단이 실제 존재하는지, 해당 페이지 lastUpdated와 업데이트 내역의 지원 기준 버전이 맞는지 확인한다. docs:check만으로 갱신일을 확인했다고 주장하지 않는다.
- 이전에 미출시 사유로 되돌린 가이드가 있는지 관련 git log를 확인한다.
- landing 디렉터리에서 `npm run docs:check`, `npm run build`를 실행한다. 실제 화면·스크린샷의 설명과 동작도 대조한다.

## 5. 검증과 출시 커밋

- 루트에서 `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run regression-check`, `git diff --check`를 실행한다.
- 오너 실기기 확인 결과 및 승인 범위를 기록한다. 준비된 변경 중 명시한 파일만 커밋한다. 전체 add/stash/reset, 검사 우회로 다른 세션 변경을 정리하지 않는다.
- 승인 뒤 푸시하고 **출시할 정확한 커밋 SHA**의 CI 결과를 확인한다. CI의 npm audit는 현재 비차단 검사이므로 경고를 따로 검토한다.

## 6. Windows 빌드

- 승인한 커밋을 대상으로 `.github/workflows/build-windows.yml`의 Build Windows를 실행하고 실행 ID·headSha·결과를 기록한다. main이 이동했으면 원하는 SHA와 일치하는지 다시 확인한다.
- GHA는 `npm run build`를 통해 postbuild의 번들 분리·계약 동기화·AI 브릿지 검사를 실행한다. 로컬에서 빌드 단계를 나눠 실행할 경우 `npm run check:bundle-isolation`, `npm run check:contract-sync`, `npm run check:ai-bridge-protocol`도 실행한다.
- 산출물: ssampin-Setup.exe, ssampin-Setup.exe.blockmap, latest.yml. 파일 존재·크기·버전과 latest.yml의 URL·sha512·size가 실제 파일에 맞는지 확인한다. 필요한 환경값은 빌드 가드와 패키지 실행으로 확인하되 비밀을 출력하지 않는다.
- 옛 Claude Bash의 EXIT 127 회피법을 현재 PowerShell에 그대로 적용하지 않는다. 오류가 재현될 때 원인을 확인한다.

## 7. macOS 빌드

- `.github/workflows/build-macos.yml`의 Build macOS를 같은 커밋으로 실행하고 SHA·실행 ID·결과를 기록한다.
- ssampin-arm64.dmg, ssampin-x64.dmg, 각 blockmap, latest-mac.yml을 모두 확인한다. 파일명을 임의로 바꾸지 않는다.
- 서명·아키텍처 검사 결과와 실제 설치 확인 범위를 기록한다. 현재 워크플로우의 spctl 실패 허용을 공증 통과로 해석하지 않는다.
- 플랫폼 빌드 성공은 5단계 코드 검사나 오너 확인을 대신하지 않는다.

## 8. GitHub 공개와 사후 확인

- 대상 저장소·태그·커밋·자산을 확인한 뒤 승인 범위에서 Release를 만든다. 대상은 현재 electron-builder 설정, git remote, landing/src/config.ts와 대조한다. 옛 메모리의 저장소 이름을 그대로 쓰지 않는다.
- Windows 3개와 macOS 5개 자산, 총 8개를 확인한다. latest.yml/latest-mac.yml이 참조하는 파일의 실제 크기와 해시를 대조한다.
- 버전별 URL과 latest 다운로드 URL을 모두 확인한다. GitHub 302 리다이렉트뿐 아니라 최종 다운로드 성공과 파일 내용도 확인한다.
- 자동 업데이트 감지·설치·앱 버전, 랜딩/모바일 배포와 가이드, 챗봇의 실제 답을 확인한다. 확인할 수 없는 OS/기기는 미검증으로 남긴다.
- 월별 진행 기록에 SHA·워크플로우·자산 검증·실기기 결과·알려진 제한을 남긴다. 공개 준비와 실제 공개를 구분하고 상태판을 갱신한다.
