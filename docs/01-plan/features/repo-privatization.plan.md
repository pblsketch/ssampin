# repo-privatization 계획서

> 🛑 **CANCELLED (2026-05-12)** — 사용자 결정으로 **비공개 전환을 철회하고 오픈소스 유지 + 보안 강화** 방향으로 선회. Phase A(머지됨, main `4d735d9`)는 롤백(URL 5종 원복 + `electron-builder.yml`·`CLAUDE.md` 원복 + `landing/public/release-notes.json` 삭제), 신규 repo `pblsketch/ssampin-releases` 도 삭제. 후속은 `security-hardening` PDCA 로 이어짐. 본 문서는 이력 보존용.
>
> **Summary**: 본 소스 저장소(`pblsketch/ssampin`)를 프라이빗으로 전환하되, 배포 자산(installer·`latest.yml`·release-notes)은 신규 퍼블릭 저장소 `pblsketch/ssampin-releases`로 이관해 자동 업데이트·웹 다운로드 무중단 유지.
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: (다음 릴리즈와 동회차 — 미정)
> **Author**: pblsketch
> **Date**: 2026-05-12
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

경쟁사가 공개 소스를 실제로 카피하고 있어, 본 저장소를 프라이빗으로 전환해 향후 신규 카피 및 최신 변경분 추적을 차단한다. 동시에 기존 사용자 자동 업데이트와 신규 사용자 웹 다운로드가 깨지지 않도록 배포 채널을 분리한다.

### 1.2 Background

- 현재 `pblsketch/ssampin`은 퍼블릭이며, GitHub Releases에 컴파일 바이너리(`ssampin-Setup.exe`, `ssampin-*.dmg`)와 메타파일(`latest.yml`, `latest-mac.yml`)을 익명 접근 가능한 상태로 게시 중.
- 앱의 자동 업데이트([electron/main.ts:1943-1945](../../../electron/main.ts#L1943-L1945))는 `electron-updater` `provider: 'generic'` + `https://github.com/pblsketch/ssampin/releases/latest/download` 를 사용 → 저장소가 프라이빗이 되면 익명 GET 404 → **전체 사용자 자동 업데이트 중단**.
- 랜딩페이지 다운로드 링크([landing/src/config.ts:1-3](../../../landing/src/config.ts#L1-L3), [landing/src/app/layout.tsx:112](../../../landing/src/app/layout.tsx#L112))도 동일 URL → **신규 다운로드 불가**.
- 릴리즈 노트 fetch([UpdateNotification.tsx:60](../../../src/adapters/components/common/UpdateNotification.tsx#L60), [AppInfoSection.tsx:156](../../../src/adapters/components/Settings/AppInfoSection.tsx#L156))는 `raw.githubusercontent.com/pblsketch/ssampin/main/public/release-notes.json` → 404 → 앱 내장 폴백(빌드 시점 스냅샷, stale)으로 degrade.
- macOS 빌드는 GitHub Actions(`Build macOS` 워크플로우) 사용. 프라이빗 저장소는 무료 Actions 한도 2000분/월(퍼블릭 무제한), macOS 러너 10배 가중 → 실질 월 ~200분(빌드 10여 회). 모니터링 필요.
- 이미 클론·포크된 사본은 비공개 전환으로 회수되지 않음(소급 효과 없음) — 미래 차단 효과만 인정하고 진행.

### 1.3 Related Documents

- Release Workflow: `MEMORY.md` "Release Workflow (필수 — 8단계)" 섹션 및 `CLAUDE.md`
- 사전 조사: 본 계획 직전 세션의 의존성 분석 (electron-builder.yml `publish: provider: github`, 하드코딩 URL 4곳)

---

## 2. Scope

### 2.1 In Scope

- [ ] 신규 퍼블릭 저장소 `pblsketch/ssampin-releases` 생성(빈 repo + README)
- [ ] 자동 업데이트 feed URL 교체: [electron/main.ts:1945](../../../electron/main.ts#L1945)
- [ ] "릴리즈 보기" 외부 링크 교체: [electron/main.ts:3064](../../../electron/main.ts#L3064)
- [ ] 랜딩 다운로드 URL 3종 + `GITHUB_URL` 교체: [landing/src/config.ts:1-7](../../../landing/src/config.ts#L1-L7)
- [ ] 랜딩 schema.org `downloadUrl`·`releaseNotes`·`url` 교체: [landing/src/app/layout.tsx](../../../landing/src/app/layout.tsx)
- [ ] release-notes.json fetch URL 교체 → `https://ssampin.com/release-notes.json` (GitHub raw 의존 제거): [UpdateNotification.tsx:60](../../../src/adapters/components/common/UpdateNotification.tsx#L60), [AppInfoSection.tsx:156](../../../src/adapters/components/Settings/AppInfoSection.tsx#L156)
- [ ] `electron-builder.yml` `publish` 설정 검토 — generic feed를 쓰므로 publish 블록은 빌드 산출에 무해하나, `gh release` 수동 흐름과 일치하도록 명시
- [ ] `Build macOS` 워크플로우(`.github/workflows/`)가 릴리즈를 `pblsketch/ssampin-releases`에 업로드하도록 수정 (cross-repo `gh release upload --repo`, 필요한 토큰 권한 포함)
- [ ] `MEMORY.md` Release Workflow 8단계 + `CLAUDE.md` 내 `gh release create/upload` 명령에 `--repo pblsketch/ssampin-releases` 반영
- [ ] 모든 변경 머지 → 다음 정식 릴리즈를 새 채널로 1회 수행해 검증 → **그 직후** 본 저장소 프라이빗 전환

### 2.2 Out of Scope

- **독점(proprietary) 라이선스 교체 + 저작권 고지** — 사용자 결정(2026-05-12)으로 본 PDCA에서 제외, 별도 진행. 본 계획은 비공개화 + 배포 채널 분리만 다룸
- 기존 포크/클론 사본 회수 (기술적으로 불가능)
- 자체 호스팅 CDN(Cloudflare R2/S3 등)으로의 이관 — 본 계획은 "퍼블릭 릴리즈 저장소 분리(A안)"만 다룸. CDN 이관(B안)은 별도 PDCA
- npm/Marketplace 등 외부 배포 채널 변경 (해당 없음)
- 코드 난독화/안티-디컴파일 (별도 주제)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `pblsketch/ssampin-releases` 퍼블릭 저장소가 존재하고, 향후 모든 릴리즈 자산(`ssampin-Setup.exe`, `latest.yml`, `ssampin-Setup.exe.blockmap`, `ssampin-arm64.dmg`, `ssampin-x64.dmg` + blockmaps, `latest-mac.yml`)이 여기에 게시된다 | High | Pending |
| FR-02 | 구버전 앱(`provider: generic` feed)이 새 저장소의 `latest.yml`을 정상 수신하여 업데이트를 감지·다운로드·설치한다 | High | Pending |
| FR-03 | `ssampin.com` 랜딩의 다운로드 버튼 3종(Win exe / mac arm64 / mac x64)이 새 저장소 `releases/latest/download/...` 로 302 리다이렉트된다 | High | Pending |
| FR-04 | 앱 내 업데이트 카드(UpdateNotification)와 설정>앱 정보(AppInfoSection)가 `https://ssampin.com/release-notes.json` 에서 릴리즈 노트를 정상 표시한다 (GitHub raw 의존 제거) | High | Pending |
| FR-05 | `Build macOS` GitHub Actions가 DMG·blockmap·`latest-mac.yml`을 `pblsketch/ssampin-releases` 릴리즈에 업로드한다 | Medium | Pending |
| FR-06 | `MEMORY.md` / `CLAUDE.md`의 Release Workflow 문서가 새 저장소·새 URL을 반영한다 (다음 릴리즈 담당자가 옛 저장소에 올리는 실수 방지) | High | Pending |
| FR-07 | 위 전부 검증 후 `pblsketch/ssampin`이 프라이빗으로 전환된다 | High | Pending |
| ~~FR-08~~ | ~~독점 라이선스 교체 + 저작권 고지~~ — Out of Scope (별도 진행, 사용자 결정 2026-05-12) | — | Deferred |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 무중단 | 전환 전후 자동 업데이트 다운로드 성공률 변화 없음 | 구버전 앱에서 실제 업데이트 1회 수행(RG-02) |
| 무중단 | 랜딩 다운로드 4 URL 모두 302 | `curl -sI` 4종 (Release Workflow 검증 절차 재사용) |
| 비용 | 프라이빗 전환 후 GitHub Actions 사용량 < 무료 한도 2000분/월 | GitHub Settings > Billing 월간 모니터링 |
| 보안/법적 | 소스가 익명 사용자에게 노출되지 않음 | 로그아웃 상태에서 `github.com/pblsketch/ssampin` 404 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-07 모두 충족 (FR-08은 Out of Scope)
- [ ] 변경된 소스 파일 `npx tsc --noEmit` 0 errors
- [ ] 랜딩 `landing/` 빌드 성공
- [ ] 새 채널로 릴리즈 1회 완수 + 4 URL 302 검증
- [ ] 구버전 앱에서 자동 업데이트 1회 성공 확인
- [ ] `MEMORY.md` / `CLAUDE.md` 갱신 커밋
- [ ] 본 저장소 프라이빗 전환 완료

### 4.2 Quality Criteria

- [ ] Lint 에러 0 (변경 파일 한정)
- [ ] 빌드(앱 + 랜딩) 성공
- [ ] Release Workflow 8단계 문서가 새 절차와 100% 일치

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 프라이빗 전환을 URL 교체·릴리즈보다 먼저 해버려, 그 사이 배포된 빌드가 곧 404될 옛 URL을 물고 나감 | High | Medium | **순서 강제**: 모든 URL 교체 머지 → 새 채널로 릴리즈 1회 + 검증 → 그 직후에만 프라이빗 전환. 본 계획서·태스크에 순서 명시 |
| 옛 저장소에 남은 과거 릴리즈 자산을 자동 업데이터가 더 못 찾음 (저장소 비공개화로 과거 `latest.yml`도 404) | High | High | 새 저장소에 **최신 릴리즈를 먼저 1회 게시**한 뒤 전환 → 구버전 앱은 곧바로 새 `latest.yml`을 보고 신버전으로 점프. 과거 버전 자산은 보존 불필요 |
| GitHub Actions 무료 한도 초과 → macOS 빌드 실패 | Medium | Low | 빌드 빈도 모니터링. 초과 시 (a) GitHub Team 플랜(추가 분) 또는 (b) macOS 빌드를 로컬/셀프호스티드로 이전 검토 |
| Vercel이 프라이빗 GitHub 저장소를 못 빌드 | Medium | Low | Vercel GitHub 앱은 프라이빗 repo 지원 — 권한만 재확인. 랜딩은 별도 영향 없음(같은 monorepo, Vercel 통합 유지) |
| `gh release upload --repo other/repo`에 필요한 토큰 권한 부족(특히 Actions 내) | Medium | Medium | PAT(또는 fine-grained token, `contents: write` on `ssampin-releases`)를 Actions secret으로 추가. 워크플로우에서 `GH_TOKEN`으로 주입 |
| 이미 포크/클론한 경쟁사 사본은 회수 불가 | Medium | Certain | 수용. 본 조치는 미래 차단용. 병행해 독점 라이선스(FR-08)로 법적 근거 확보 |
| `raw.githubusercontent.com` → `ssampin.com` 전환 시 랜딩 배포 전 구버전 앱이 잠시 둘 다 404 | Low | Low | 랜딩에 `public/release-notes.json` 이미 존재 → 랜딩 재배포만 하면 즉시 유효. 앱 코드 변경은 다음 빌드부터 적용되므로 타이밍 충돌 없음 |

---

## 6. Architecture Considerations

> 본 변경은 애플리케이션 아키텍처(domain/usecases/adapters/infrastructure 4레이어)에 영향을 주지 않는다. 인프라/배포 채널 + 상수 URL 변경 + 문서 갱신 + 저장소 설정 변경이 전부다. Clean Architecture 레이어 규칙 위반 없음.

### 6.1 Project Level Selection

해당 없음 (기존 Enterprise-스타일 Clean Architecture 유지, 신규 코드 거의 없음).

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 배포 채널 분리 방식 | A) 퍼블릭 릴리즈 전용 repo / B) 외부 CDN(R2/S3) / C) 퍼블릭 유지 | **A) `ssampin-releases` 퍼블릭 repo** | 변경량 최소(URL 4곳), `electron-updater` `generic` provider 그대로, `gh` CLI 흐름 거의 동일, 추가 인프라·비용 0. B는 egress 비용·버킷·도메인 결정 필요 → 추후 옵션으로 남김 |
| release-notes.json 호스팅 | GitHub raw(`ssampin-releases`) / `ssampin.com` 정적 파일 | **`ssampin.com/release-notes.json`** | 랜딩에 이미 `public/release-notes.json` 존재 → GitHub 의존 완전 제거, 캐싱·가용성 우수 |
| 옛 저장소 과거 릴리즈 자산 마이그레이션 | 전부 새 repo로 복사 / 최신 1회만 게시 | **최신 1회만 게시** | 구버전 앱은 새 `latest.yml`만 보면 최신으로 점프 → 과거 자산 불필요. 복사 비용·blockmap 정합성 리스크 회피 |
| 프라이빗 전환 시점 | URL 교체 직후 / 다음 릴리즈+검증 후 | **다음 릴리즈+검증 후** | 그 사이 배포물이 곧 죽을 URL을 물지 않게 함 |

### 6.3 Clean Architecture Approach

변경 파일은 모두 기존 위치 유지 — 새 폴더/레이어 없음:
- `electron/main.ts` (infrastructure 상당 — Electron 메인)
- `landing/src/config.ts`, `landing/src/app/layout.tsx` (별도 Next.js 앱)
- `src/adapters/components/common/UpdateNotification.tsx`, `src/adapters/components/Settings/AppInfoSection.tsx` (adapters/UI)
- `.github/workflows/*.yml`, `electron-builder.yml`, `MEMORY.md`, `CLAUDE.md` (인프라/문서)

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` has coding conventions section
- [ ] `docs/01-plan/conventions.md` (없음 — 본 변경에 불필요)
- [ ] `CONVENTIONS.md` (없음)
- [x] TypeScript configuration (`tsconfig.json`) — strict
- [x] ESLint / Prettier 구성 존재 (CI safe-guard)

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 배포 저장소 명칭 | 신규 | `pblsketch/ssampin-releases` 고정 | High |
| 릴리즈 자산 파일명 | 기존 규칙 유지 | `ssampin-Setup.exe`, `ssampin-arm64.dmg`, `ssampin-x64.dmg`, `latest.yml`, `latest-mac.yml` (+blockmaps) — 절대 버전 포함 rename 금지 | High |
| Release Workflow 문서 | 기존 8단계 | `--repo ssampin-releases` 반영 | High |

### 7.3 Environment Variables / Secrets Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `RELEASES_REPO_TOKEN` (가칭) | Actions에서 `ssampin-releases`에 `gh release upload` | GitHub Actions secret (본 repo) | ☐ |

### 7.4 Pipeline Integration

9-phase 파이프라인 해당 없음.

---

## 8. Next Steps

1. [ ] 본 계획 승인
2. [ ] `/pdca design repo-privatization` — 단계별 실행 설계 (저장소 생성 절차, URL diff 목록, 워크플로우 패치, 검증 체크리스트 RG-01~RG-0n, 롤백 절차)
3. [ ] Do — 코드/문서 변경 구현
4. [ ] 다음 릴리즈에 묶어 검증 후 프라이빗 전환

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-12 | 초안 — A안(퍼블릭 릴리즈 repo 분리) 확정, `ssampin-releases` 명칭 확정 | pblsketch |
| 0.2 | 2026-05-12 | FR-08(독점 라이선스) Out of Scope로 이동(별도 진행), release-notes 호스팅 `ssampin.com` 확정 | pblsketch |
