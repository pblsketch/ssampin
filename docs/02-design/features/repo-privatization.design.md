# repo-privatization 설계 문서

> **Summary**: `pblsketch/ssampin`(소스)을 프라이빗으로, 배포 자산은 신규 퍼블릭 `pblsketch/ssampin-releases`로. `electron-updater` `generic` feed·랜딩 다운로드 URL·release-notes fetch를 새 채널로 교체하고, "릴리즈 1회 + 검증 → 그 직후 전환" 순서를 강제한다.
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: (다음 릴리즈와 동회차 — 미정)
> **Author**: pblsketch
> **Date**: 2026-05-12
> **Status**: Draft
> **Planning Doc**: [repo-privatization.plan.md](../../01-plan/features/repo-privatization.plan.md)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| Phase 1~4 | — | N/A (인프라/배포 채널 변경, 9-phase 파이프라인 비해당) |

---

## 1. Overview

### 1.1 Design Goals

1. 소스 저장소를 익명 접근 불가(프라이빗)로 만들어 경쟁사 카피·최신 변경 추적을 차단.
2. 자동 업데이트(`electron-updater`)·웹 다운로드·앱 내 릴리즈 노트가 **전환 전후로 끊기지 않음**.
3. 코드 변경 최소화 — 상수 URL 5종 + 문서 + 저장소 설정만. 애플리케이션 4레이어 아키텍처 무변경.
4. 향후 릴리즈 담당자가 옛 저장소에 실수로 올리지 않도록 Release Workflow 문서를 새 절차로 갱신.

### 1.2 Design Principles

- **순서 불변(ordering invariant)**: `URL 교체 머지 → 새 채널 릴리즈 1회 → RG 검증 통과 → 그 직후에만 프라이빗 전환`. 이 순서가 깨지면 그 사이 배포된 빌드가 곧 404될 URL을 물고 나간다.
- **GitHub 의존 축소**: release-notes fetch를 `raw.githubusercontent.com`에서 `ssampin.com`(Vercel CDN)으로 옮겨, 소스 repo 비공개화의 영향권 밖으로 뺀다. 앱 내장 `/release-notes.json` 폴백은 유지.
- **과거 자산 비-마이그레이션**: `ssampin-releases`에 **최신 릴리즈 1회만** 게시. 구버전 앱은 새 `latest.yml`을 보고 곧장 최신으로 점프하므로 과거 버전 자산 복사 불필요.
- **롤백 가능성 보장**: 전환 직전까지 모든 단계는 git revert / repo 재공개로 되돌릴 수 있어야 한다.

---

## 2. Architecture

### 2.1 채널 구성 (Before → After)

```
[BEFORE]
  pblsketch/ssampin (PUBLIC)
    ├─ 소스 코드           ← 누구나 clone
    └─ Releases
         ├─ ssampin-Setup.exe, latest.yml, *.blockmap
         ├─ ssampin-{arm64,x64}.dmg, latest-mac.yml, *.blockmap
         └─ (자동) Source code (zip/tar.gz)
  앱 autoUpdater  ──▶ github.com/pblsketch/ssampin/releases/latest/download   (generic)
  랜딩 다운로드    ──▶ github.com/pblsketch/ssampin/releases/latest/download/*
  앱 릴리즈노트    ──▶ raw.githubusercontent.com/pblsketch/ssampin/main/public/release-notes.json

[AFTER]
  pblsketch/ssampin (PRIVATE)
    └─ 소스 코드만 (Releases 미사용 — git tag 만 보관)
  pblsketch/ssampin-releases (PUBLIC, 신규)
    ├─ README.md (default branch = main, 최소 1커밋)
    ├─ release-notes.json            ← (선택 백업 경로, 아래 §3.3 참고)
    └─ Releases
         ├─ ssampin-Setup.exe, latest.yml, *.blockmap
         └─ ssampin-{arm64,x64}.dmg, latest-mac.yml, *.blockmap
  앱 autoUpdater  ──▶ github.com/pblsketch/ssampin-releases/releases/latest/download   (generic, 변경 1줄)
  랜딩 다운로드    ──▶ github.com/pblsketch/ssampin-releases/releases/latest/download/*
  앱 릴리즈노트    ──▶ https://ssampin.com/release-notes.json   (Vercel 정적, CORS 헤더 추가)
                       └ 폴백: 앱 내장 /release-notes.json (빌드 시점 스냅샷)
```

### 2.2 데이터 흐름 — 자동 업데이트 (변경 후)

```
앱 기동 → autoUpdater.checkForUpdates()
        → GET github.com/pblsketch/ssampin-releases/releases/latest/download/latest.yml  (302 → CDN)
        → 버전 비교 → update:available 브로드캐스트 → 사용자가 "다운로드" 클릭
        → (win) autoUpdater.downloadUpdate() → ssampin-Setup.exe + .blockmap diff 다운로드 → quitAndInstall
        → (mac) shell.openExternal(github.com/pblsketch/ssampin-releases/releases/latest)
```

### 2.3 의존성 / 영향 파일

| 컴포넌트 | 변경 내용 | 비고 |
|---|---|---|
| `electron/main.ts` | autoUpdater feed URL 1줄, mac 릴리즈 링크 1줄 | infrastructure(메인 프로세스) |
| `src/adapters/components/common/UpdateNotification.tsx` | release-notes fetch URL 1줄 | adapters/UI |
| `src/adapters/components/Settings/AppInfoSection.tsx` | release-notes fetch URL 1줄 | adapters/UI |
| `landing/src/config.ts` | `DOWNLOAD_URL` 3종 + `GITHUB_URL` | 별도 Next.js 앱 |
| `landing/src/app/layout.tsx` | schema.org `downloadUrl` + `releaseNotes` | 별도 Next.js 앱 |
| `landing/next.config.ts` | `/release-notes.json` 에 `Access-Control-Allow-Origin: *` 헤더 추가 | CORS 필수 (§3.3) |
| `landing/public/release-notes.json` | `public/release-notes.json` 의 사본을 커밋 (릴리즈 시 둘 다 갱신) | ssampin.com 서빙용 (§3.3) |
| `electron-builder.yml` | `publish.owner/repo` 명시 → `pblsketch/ssampin-releases` | `--publish always` 대비 안전망 (현 흐름은 `--publish never`) |
| `.github/workflows/build-macos.yml` | **변경 없음** (artifact 업로드만 함, 릴리즈 게시는 수동 `gh`) | 단, 토큰 권한 검토 (§5) |
| `MEMORY.md` / `CLAUDE.md` | Release Workflow 8단계의 `gh release create/upload` 에 `--repo pblsketch/ssampin-releases` + release-notes 동기화 단계 추가 | 문서 |

> ⚠️ 본 변경에서 어떤 파일도 `domain → 외부`, `usecases → adapters/infra` 의존을 만들지 않는다. Clean Architecture 규칙 위반 0건.

---

## 3. 상세 설계

### 3.1 신규 저장소 `pblsketch/ssampin-releases`

- **가시성**: Public.
- **초기 내용**: `README.md` 1개 (다운로드 안내 + 소스는 비공개라는 고지). default branch `main`, 최소 1커밋 — `gh release create`가 태그를 붙일 commit-ish가 필요하기 때문.
- **(선택) `release-notes.json`**: §3.3의 백업 경로로 쓸지 결정. 쓴다면 release 때마다 갱신.
- **권한**: 본 repo 소유자(pblsketch) 동일. Actions에서 cross-repo 업로드가 필요하면 `RELEASES_REPO_TOKEN` (fine-grained PAT, `ssampin-releases`에 `contents: write`)를 본 repo의 Actions secret으로 추가 — 단, 현 흐름은 macOS도 수동 `gh release upload`라 **당장은 불필요**. 미래 자동화 시 도입.

### 3.2 코드 변경 (정확한 치환)

**(a) `electron/main.ts`**
```diff
  autoUpdater.setFeedURL({
    provider: 'generic',
-   url: 'https://github.com/pblsketch/ssampin/releases/latest/download',
+   url: 'https://github.com/pblsketch/ssampin-releases/releases/latest/download',
  });
```
```diff
    if (process.platform === 'darwin') {
-     shell.openExternal('https://github.com/pblsketch/ssampin/releases/latest');
+     shell.openExternal('https://github.com/pblsketch/ssampin-releases/releases/latest');
      return;
    }
```

**(b) `src/adapters/components/common/UpdateNotification.tsx`**
```diff
-       'https://raw.githubusercontent.com/pblsketch/ssampin/main/public/release-notes.json',
+       'https://ssampin.com/release-notes.json',
```
(기존 `try { fetch('/release-notes.json') } catch {}` 로컬 폴백은 그대로 둔다.)

**(c) `src/adapters/components/Settings/AppInfoSection.tsx`** — (b)와 동일 치환.

**(d) `landing/src/config.ts`**
```diff
- export const DOWNLOAD_URL = 'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-Setup.exe';
- export const DOWNLOAD_URL_MAC_ARM = 'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-arm64.dmg';
- export const DOWNLOAD_URL_MAC_X64 = 'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-x64.dmg';
+ export const DOWNLOAD_URL = 'https://github.com/pblsketch/ssampin-releases/releases/latest/download/ssampin-Setup.exe';
+ export const DOWNLOAD_URL_MAC_ARM = 'https://github.com/pblsketch/ssampin-releases/releases/latest/download/ssampin-arm64.dmg';
+ export const DOWNLOAD_URL_MAC_X64 = 'https://github.com/pblsketch/ssampin-releases/releases/latest/download/ssampin-x64.dmg';
  ...
- export const GITHUB_URL = 'https://github.com/pblsketch/ssampin';
+ export const GITHUB_URL = 'https://github.com/pblsketch/ssampin-releases';
```
> `GITHUB_URL`은 랜딩 푸터의 "GitHub" 링크 등에 쓰임 — 비공개 repo로 두면 404이므로 퍼블릭 릴리즈 repo를 가리키게 함. (또는 링크 자체를 제거하는 선택지도 있음 — Do 단계에서 사용처 확인 후 결정.)

**(e) `landing/src/app/layout.tsx`** (schema.org JSON-LD)
```diff
- downloadUrl: 'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-Setup.exe',
+ downloadUrl: 'https://github.com/pblsketch/ssampin-releases/releases/latest/download/ssampin-Setup.exe',
- releaseNotes: 'https://github.com/pblsketch/ssampin/releases',
+ releaseNotes: 'https://github.com/pblsketch/ssampin-releases/releases',
```
(`author.url: 'https://github.com/pblsketch'` 는 조직/사용자 프로필이라 비공개 영향 없음 — 유지.)

**(f) `landing/next.config.ts`** — release-notes.json CORS 허용
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/release-notes.json",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default nextConfig;
```

**(g) `landing/public/release-notes.json`** — `public/release-notes.json` 의 사본을 커밋.
> 처음 검토 때 "Vercel `prebuild` 로 `../public/release-notes.json` 자동 복사" 안을 고려했으나, Vercel 의 "root directory 밖 파일 포함" 설정 의존 + 빌드 산출물이 git dirty 로 보이는 부작용이 있어 **단순 커밋 사본**으로 결정. Release Workflow 2단계에서 두 파일(`public/release-notes.json`, `landing/public/release-notes.json`)을 함께 갱신·커밋한다 → Vercel 자동 재배포로 `ssampin.com/release-notes.json` 갱신. (gitignore 변경 없음, prebuild 스크립트 없음.)

**(h) `electron-builder.yml`**
```diff
  publish:
    provider: github
+   owner: pblsketch
+   repo: ssampin-releases
```

### 3.3 release-notes.json 호스팅 — 결정 사항과 보강

- **결정(2026-05-12)**: 1차 = `https://ssampin.com/release-notes.json`. 2차(앱 내장) = `/release-notes.json`.
- **발견**: `release-notes.json` 원본은 **앱 repo 루트 `public/release-notes.json`** 에만 존재하며 `landing/public/`에는 없다. → `ssampin.com`이 서빙하려면 (1) `landing/public/`에 사본이 있어야 하고 (2) 앱(렌더러)이 cross-origin fetch 하므로 `Access-Control-Allow-Origin` 헤더가 필요하다. 위 (f)·(g)로 해결.
- **운영 영향**: Release Workflow 2단계에 "`public/release-notes.json` + `landing/public/release-notes.json` 둘 다 갱신·커밋 → Vercel 자동 재배포" 가 추가됨 (`cp public/release-notes.json landing/public/release-notes.json`).
- **(선택) 백업 경로**: `ssampin-releases` repo 루트에도 `release-notes.json`을 두고, 앱 fetch 체인을 `ssampin.com → raw.githubusercontent.com/ssampin-releases → 내장` 3단으로 둘 수 있음. 안정성↑ 대신 갱신 지점 +1. **기본은 채택 안 함** (2단 폴백으로 충분). Do 단계에서 재논의 가능.

### 3.4 Release Workflow 문서 변경 (`MEMORY.md` 8단계 + `CLAUDE.md`)

| 단계 | 현재 | 변경 후 |
|---|---|---|
| 1. 버전 번호 | 6곳 수동 | 동일 (변경 없음 — `landing/src/config.ts`의 `GITHUB_URL`도 이미 새 값) |
| 2. release-notes.json | `public/release-notes.json` 갱신 | + `cp public/release-notes.json landing/public/release-notes.json` 후 둘 다 커밋·푸시 → Vercel이 `ssampin.com/release-notes.json` 재배포 |
| 3. 챗봇 KB | 변경 없음 | — |
| 4. 노션 가이드 | 변경 없음 | — |
| 5. 커밋·푸시 | `git push origin main` (ssampin) | 동일. **추가**: 릴리즈용 git tag는 ssampin(private)에도 `git tag vX.X.X && git push --tags` 로 남겨 버전 이력 보존 (선택) |
| 6. 빌드 (Win) | 5단계 분리 + `npx electron-builder` | 동일 (산출물 동일) |
| 7. 빌드 (mac) | `gh workflow run "Build macOS"` → artifact 다운로드 | 동일 (워크플로우 무변경) |
| 8. GitHub 릴리즈 | `gh release create vX.X.X ... ` / `gh release upload vX.X.X ...` (cwd repo = ssampin) | **`--repo pblsketch/ssampin-releases` 추가**: `gh release create vX.X.X release/ssampin-Setup.exe release/latest.yml --repo pblsketch/ssampin-releases --title ... --notes ...` / `gh release upload vX.X.X release/macos/*/ssampin-arm64.dmg ... --repo pblsketch/ssampin-releases`. 검증 `curl -sI` URL 4종도 `…/ssampin-releases/releases/…` 로 교체 |

> `gh release create --repo pblsketch/ssampin-releases vX.X.X ...` 는 `ssampin-releases`의 default branch HEAD에 `vX.X.X` 태그를 만든다. 그래서 `ssampin-releases`는 최소 1커밋(README)이 있어야 한다(§3.1).

---

## 4. 구현 순서 (Do 단계 체크리스트)

> **Phase A·B·C 는 합쳐서 "다음 정식 릴리즈"와 같은 회차에 처리. Phase D(프라이빗 전환)는 Phase C 검증 통과 후에만.**

### Phase A — 코드/문서 변경 (PR 1개, ssampin repo)
- [ ] A-1. `pblsketch/ssampin-releases` 퍼블릭 repo 생성 + `README.md` 커밋 (gh CLI)
- [ ] A-2. `electron/main.ts` — feed URL + mac 링크 (§3.2 a)
- [ ] A-3. `UpdateNotification.tsx` / `AppInfoSection.tsx` — release-notes URL (§3.2 b, c)
- [ ] A-4. `landing/src/config.ts` — 다운로드 3종 + `GITHUB_URL` (§3.2 d)
- [ ] A-5. `landing/src/app/layout.tsx` — schema.org 2곳 (§3.2 e)
- [ ] A-6. `landing/next.config.ts` — CORS 헤더 (§3.2 f) + `landing/public/release-notes.json` 사본 커밋 (§3.2 g)
- [ ] A-7. `electron-builder.yml` — `publish.owner/repo` (§3.2 h)
- [ ] A-8. `MEMORY.md` + `CLAUDE.md` — Release Workflow 8단계 갱신 (§3.4)
- [ ] A-9. `npx tsc --noEmit` 0 errors / `cd landing && npm run build` 성공 / `npm run typecheck && npm run test && npm run regression-check` 그린
- [ ] A-10. 머지 → main

### Phase B — 새 채널로 릴리즈 1회 (= 다음 정식 릴리즈)
- [ ] B-1. 버전 bump (Release Workflow 1단계)
- [ ] B-2. `public/release-notes.json` 갱신 + 커밋·푸시 → Vercel 재배포 확인
- [ ] B-3. Win 빌드 (5단계 분리) → `release/ssampin-Setup.exe` + `latest.yml`
- [ ] B-4. mac 빌드 (`gh workflow run "Build macOS"`) → DMG·blockmap·`latest-mac.yml` 다운로드
- [ ] B-5. `gh release create vX.X.X ... --repo pblsketch/ssampin-releases` (Win 자산) + `gh release upload ... --repo pblsketch/ssampin-releases` (mac 자산)
- [ ] B-6. 챗봇 KB·노션 가이드 갱신 (Release Workflow 3·4단계)

### Phase C — 검증 (RG)
- [ ] RG-01. `curl -sI https://github.com/pblsketch/ssampin-releases/releases/download/vX.X.X/ssampin-x64.dmg` → 302
- [ ] RG-02. `curl -sI .../ssampin-arm64.dmg`, `.../ssampin-Setup.exe` → 302; `.../releases/latest/download/ssampin-x64.dmg`, `…/latest.yml` → 302
- [ ] RG-03. `curl -sI https://ssampin.com/release-notes.json` → 200 + `access-control-allow-origin: *` 헤더 존재
- [ ] RG-04. ssampin.com 다운로드 버튼 3종 클릭 → 실제 파일 받아짐
- [ ] RG-05. **구버전 앱**(전환 전 빌드 = 옛 feed URL을 가진 마지막 빌드 직전 버전)에서 자동 업데이트 체크 → 신버전 감지 → 다운로드 → 설치 성공. ※ 이때 구버전 앱은 *옛* feed(`ssampin/releases`)를 보므로, 옛 repo가 아직 퍼블릭일 때(=Phase D 전) 마지막으로 `ssampin/releases`에도 동일 릴리즈를 1회 게시해 두면 매끄럽다 → **B-5에서 옛 repo에도 같은 자산을 한 번 더 게시(이중 게시)** 하고, Phase D 이후 신버전부터는 새 repo만.
- [ ] RG-06. 새로 설치한 신버전 앱에서 업데이트 카드·설정>앱 정보의 릴리즈 노트가 `ssampin.com`에서 정상 표시 (네트워크 탭에서 `ssampin.com/release-notes.json` 200 확인)
- [ ] RG-07. 신버전 앱에서 "릴리즈 보기"(mac) → `ssampin-releases` 릴리즈 페이지 열림

### Phase D — 프라이빗 전환 (Phase C 전부 PASS 후)
- [ ] D-1. GitHub `pblsketch/ssampin` Settings → Change visibility → Private
- [ ] D-2. 로그아웃 상태로 `https://github.com/pblsketch/ssampin` → 404 확인
- [ ] D-3. Vercel `ssampin.com` / `m.ssampin.com` 배포 정상 동작 확인 (프라이빗 전환 후 첫 배포 트리거해 확인)
- [ ] D-4. `git push` (소스) 정상 — CI(`ci.yml`) 그린 확인. 프라이빗 후 Actions 사용량 카운트 시작됨을 인지
- [ ] D-5. (며칠 후) GitHub Settings > Billing 에서 Actions 분 소비 추세 점검 — 2000분/월 한도 대비

### Phase E — 마무리
- [ ] E-1. `/pdca analyze repo-privatization` (gap 분석)
- [ ] E-2. `/pdca report repo-privatization`
- [ ] E-3. MEMORY.md 메모리 업데이트 (전환 완료 사실 + 새 릴리즈 repo 명시)

---

## 5. 리스크 & 대응 (Plan §5 보강)

| 리스크 | 대응 (설계 반영) |
|---|---|
| 전환을 릴리즈·검증보다 먼저 → 그 사이 빌드가 죽을 URL 물기 | Phase D는 Phase C 전체 PASS의 **후행**으로 못박음. 본 문서 §4 및 태스크 순서로 강제 |
| 구버전 앱이 옛 `ssampin/releases`를 보는데 그 repo가 비공개됨 | RG-05 + B-5: **전환 직전 마지막 릴리즈를 옛 repo에도 1회 이중 게시** → 구버전 앱이 그걸 받아 신버전(새 feed)으로 올라옴. 이후는 새 repo만 |
| `ssampin.com/release-notes.json` CORS 미설정 → 앱에서 fetch 실패 | §3.2(f) `next.config.ts` 헤더 + RG-03에서 헤더 존재 검증. 실패해도 앱 내장 폴백으로 degrade(앱은 안 죽음) |
| `landing/public/release-notes.json` 누락 → ssampin.com 404 | §3.2(g) `prebuild` 자동 복사 + `.gitignore`. RG-03 200 검증 |
| Vercel이 프라이빗 repo 빌드 실패 | Vercel GitHub 앱은 프라이빗 지원 — D-3에서 첫 배포 확인. 실패 시 Vercel 프로젝트의 GitHub 권한 재인증 |
| `gh release create --repo` 가 태그 만들 commit 없음 | §3.1: `ssampin-releases`에 README 1커밋 먼저 |
| Actions 무료 한도(2000분/월, mac 10×) 초과 | D-5 모니터링. 초과 시 GitHub Team 플랜 또는 mac 빌드 셀프호스티드/로컬 이전 |
| 옛 repo에 남은 `Source code (zip)` 자동첨부물 | 전환 후 자동 비공개화됨. 추가 조치 불필요 |
| Vercel `GITHUB_URL` 푸터 링크가 비공개 repo 가리킴 | §3.2(d)에서 `ssampin-releases`(퍼블릭)로 변경 또는 링크 제거 — Do에서 사용처 확인 후 확정 |

---

## 6. 롤백 절차

- **Phase A 후, B 전**: 변경 PR을 `git revert` → 옛 URL 복귀. `ssampin-releases` repo는 방치(무해).
- **Phase B 후, D 전**: 앱은 아직 옛/새 양쪽에 릴리즈가 있으므로 둘 다 동작. 문제 시 다음 릴리즈에서 URL을 옛 값으로 되돌리고 옛 repo에만 게시.
- **Phase D 후**: `pblsketch/ssampin` Settings → Change visibility → Public 으로 즉시 재공개 가능(데이터 손실 없음). 단 그 사이 새로 생긴 포크는 없음. URL 롤백은 위와 동일.

---

## 7. Open Questions

1. ~~옛 repo 이중 게시(B-5/RG-05)~~ → **확정(2026-05-12): 한다.** B-5에서 `gh release create vX.X.X ... --repo pblsketch/ssampin`(옛 repo)에도 동일 자산 1회 게시. Phase D 이후 신버전부터는 새 repo만.
2. ~~`GITHUB_URL` 푸터 링크~~ → **확정(2026-05-12): `ssampin-releases`로 교체.** (§3.2 d 그대로)
3. `release-notes.json` 3단 폴백(+`ssampin-releases` raw) 도입 여부? → **기본: 안 함**(2단 폴백). 필요 시 Do에서 추가.
4. ssampin(private)에 릴리즈 태그를 계속 남길지? → **기본: 남김** (`git tag vX.X.X && git push --tags`, release 객체 없이 — 버전 이력 보존).

---

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 0.1 | 2026-05-12 | 초안 — 채널 구성, 코드 치환 5종, Release Workflow 변경, Phase A~E 체크리스트, RG-01~07, 롤백 절차, release-notes 호스팅 발견사항 반영 | pblsketch |
