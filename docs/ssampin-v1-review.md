# 쌤핀 v1.0 코드 리뷰

> 리뷰 대상: https://github.com/pblsketch/ssampin (main 브랜치)
> 리뷰 일시: 2026-03-20

---

## ✅ 양호한 항목

- **package.json 버전**: `"version": "1.0.0"` 정상 설정됨
- **LICENSE**: MIT 라이선스 파일 존재 (`Copyright (c) 2026 Junil`)
- **README.md**: v1.0에 걸맞은 구조 — 프로젝트 소개, 주요 기능, 아키텍처 다이어그램(Mermaid), 기술 스택, 다운로드 안내, 개발 환경 설정, 라이선스 정보 포함
- **Clean Architecture**: `domain → usecases → adapters → infrastructure` 4계층 구조가 명확하게 분리되어 있고, ESLint 규칙으로 계층 간 의존성 역전을 강제하고 있음 (`.eslintrc.cjs`의 `no-restricted-imports` 설정)
- **TypeScript strict mode**: `tsconfig.json`에 `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noUncheckedIndexedAccess": true` 등 엄격한 설정
- **any 타입 남용 없음**: `src/` 전체에서 `any` 사용은 3곳뿐이며 모두 `window as any` 패턴 (HelpChatPanel.tsx의 글로벌 함수 노출용) — 실질적 남용 아님
- **.env.example**: 플레이스홀더 값(`your-client-id-here`, `your-gemini-api-key` 등)만 포함, 실제 API 키 노출 없음
- **API 키 관리**: 모든 환경 변수를 `import.meta.env.VITE_*` 또는 `process.env.*`로 참조, 하드코딩된 API 키 발견되지 않음
- **빌드 설정 (vite.config.ts)**: path alias 설정, `base: './'` (Electron 호환), 프록시 설정 등 프로덕션 적합
- **PWA 설정 (vite.mobile.config.ts)**: manifest 정상 구성 (name, short_name, icons, orientation, display:standalone), Workbox runtimeCaching 설정 (Google Fonts 캐싱)
- **PWA 아이콘**: `public/icons/`에 `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` 모두 존재
- **Electron 빌드 설정**: `electron-builder.yml`에 NSIS 인스톨러 설정, .ssampin 파일 연결, 아이콘 설정 등 프로덕션 적합
- **Electron main.ts**: 단일 인스턴스 잠금, 자동 업데이트, 트레이 아이콘, 위젯 모드, 파일 연결 핸들링 등 완성도 높음
- **자동 업데이트**: `autoUpdater`에 에러 핸들링, 네트워크 에러 무시, 주기적 체크(4시간), GitHub generic provider 사용 (rate limit 회피)

---

## ⚠️ 개선 권장 (중요도 높음)

### 1. `.claude/`, `.omc/` 디렉토리가 Git에 포함됨 ⚠️
- `.claude/agent-memory/bkit-gap-detector/MEMORY.md`와 `.omc/ultrawork-state.json`이 리포에 커밋되어 있음
- `.gitignore`에 `.claude/`, `.omc/` 패턴이 **없음**
- 이 파일들은 개발 도구(Claude Code, OMC) 상태 파일로 배포에 포함되면 안 됨
- **조치**: `.gitignore`에 `.claude/`, `.omc/` 추가 후 `git rm -r --cached .claude .omc` 실행

### 2. `@types/qrcode`가 `dependencies`에 있음 ⚠️
- `@types/qrcode`는 타입 정의 패키지로 `devDependencies`에 있어야 함
- 현재 `dependencies`에 포함되어 있어 프로덕션 번들에 불필요한 의존성이 포함될 수 있음 (Electron 패키징 시 `node_modules` 포함)
- **조치**: `npm install --save-dev @types/qrcode && npm uninstall @types/qrcode`

### 3. `ssampin.com` URL 하드코딩 (코드 내 다수) ⚠️
- ShortLinkClient.ts 외에도 **최소 10곳 이상**의 소스 파일에 `https://ssampin.com` 하드코딩
- 도메인 변경 시 일괄 수정 필요
- **조치**: `src/config.ts` 등에 `SITE_BASE_URL` 상수를 정의하고 모든 곳에서 참조하도록 리팩터링
- 상세 목록은 아래 [하드코딩 URL 검색 결과](#-하드코딩-url-검색-결과) 참조

### 4. 루트에 대량의 스크린샷 PNG 파일 (31개) ⚠️
- 리포 루트에 `01-dashboard-initial.png` ~ `31-memo-escape-fixed.png`까지 31개 PNG 파일이 있음
- `docs/screenshots/`에도 별도 스크린샷이 있어 중복 가능성
- 리포 크기를 불필요하게 증가시킴 (총 ~2.5MB+)
- **조치**: 필요한 것만 `docs/screenshots/`로 이동, 나머지 삭제 또는 `.gitignore`에 추가

### 5. `cloudflared` 패키지가 `dependencies`에 포함 ⚠️
- `cloudflared` (Cloudflare Tunnel 바이너리 래퍼)가 프로덕션 의존성에 포함되어 있음
- Electron 패키징 시 큰 바이너리가 포함될 수 있음
- live survey/vote 기능에 사용되는 것으로 보이나, 실제로 필요한지 확인 필요
- **조치**: 개발 도구용이라면 `devDependencies`로 이동, 프로덕션 필수라면 유지

---

## 💡 개선 권장 (중요도 낮음)

### 6. `console.log` 잔재 (24건)
- `src/` 내 24곳에 `console.log` 존재 (대부분 `SyncFromCloud.ts` 디버깅 로그)
- 프로덕션에서 불필요한 로깅
- **조치**: 프로덕션 빌드 시 제거하거나, 디버그 레벨 로거로 전환

### 7. `CLAUDE.md`, `claude-code-prompts.md` 등 개발 문서가 리포에 포함
- `CLAUDE.md` (12KB): Claude Code 프로젝트 컨텍스트
- `claude-code-prompts.md` (41KB): 개발 프롬프트 모음
- `PRD.md`, `SPEC.md`, `LANDING-PAGE.md`, `GOOGLE-CLOUD-SETUP.md` 등 내부 문서
- v1.0 공개 릴리즈 시 외부에 노출될 필요가 없는 내부 개발 문서들
- **조치**: `.gitignore`에 추가하거나, 별도 브랜치/리포로 분리 검토

### 8. `docs/.pdca-snapshots/` 대형 JSON 파일들
- `docs/.pdca-snapshots/` 디렉토리에 ~400KB 크기의 JSON 스냅샷 파일이 10개 존재 (총 ~4MB)
- 개발 프로세스 추적용으로 보이며, 릴리즈에 필요하지 않음
- **조치**: `.gitignore` 추가 또는 삭제

### 9. `design examples/` 디렉토리
- 온보딩, 위젯 등의 HTML 모킹 + 스크린샷 파일 (총 ~4MB)
- 개발 참고용이며 프로덕션에 불필요
- **조치**: `.gitignore` 추가 또는 별도 리포/브랜치로 분리

### 10. ESLint 설정 파일 이중화
- `.eslintrc.cjs`와 `eslint.config.js` 두 파일이 동시에 존재
- ESLint v10 기준 flat config(`eslint.config.js`)를 사용하는 것이 권장됨
- **조치**: 하나로 통일 (flat config 권장)

### 11. Electron builder에 macOS/Linux 타겟 없음
- `electron-builder.yml`에 `win` 타겟만 설정
- 현재 Windows 전용이므로 문제는 아니나, 향후 다중 플랫폼 지원 시 추가 필요
- README에 "Windows 환경에서 NSIS 인스톨러로 빌드됩니다"라고 명시되어 있어 현재는 의도된 것으로 보임

### 12. `mobile.html`에서 PWA manifest 경로
- `<link rel="manifest" href="/manifest.webmanifest" />` 참조
- Vite PWA 플러그인이 빌드 시 자동 생성하므로 문제없으나, 개발 서버에서 실제 파일이 존재하는지 확인 필요

### 13. TODO 주석 잔재
- `src/widgets/items/Grades.tsx`: `TODO: 실제 성적 데이터 연동 시 구현`
- `src/widgets/items/Tasks.tsx`: `TODO: 실제 업무 데이터 연동 시 구현`
- `src/adapters/stores/useSettingsStore.ts`: `TODO: Google Forms 연동 시 formUrl에 입력`
- v1.0 릴리즈에서 미구현 기능의 TODO가 남아있음
- **조치**: v1.0에 포함되지 않는 기능이면 TODO 유지 OK, 단 이슈 트래커에 등록 권장

---

## 🔍 하드코딩 URL 검색 결과

### `ssampin.vercel.app` — ✅ 없음!
- **코드 내 `ssampin.vercel.app` 하드코딩은 발견되지 않음**
- `docs/ssampin-assignment-spec (3).md`에 아키텍처 다이어그램 텍스트로 1건 존재 (코드 아님)
- ShortLinkClient.ts의 BASE_URL은 이미 `https://ssampin.com`으로 업데이트된 상태

### `ssampin.com` 하드코딩 — ⚠️ 다수 존재
| 파일 | 하드코딩 URL | 용도 |
|------|-------------|------|
| `src/infrastructure/supabase/ShortLinkClient.ts:8` | `const BASE_URL = 'https://ssampin.com'` | 숏링크 베이스 URL |
| `src/usecases/assignment/CreateAssignment.ts:80` | `https://ssampin.com/submit/${result.id}` | 과제 공유 URL |
| `src/adapters/stores/useSurveyStore.ts:10` | `const SHARE_BASE_URL = 'https://ssampin.com/check'` | 설문 공유 URL |
| `src/adapters/stores/useConsultationStore.ts:8` | `const SHARE_BASE_URL = 'https://ssampin.com/booking'` | 상담 예약 URL |
| `src/adapters/components/MobileAnnouncementBanner.tsx:4` | `const MOBILE_URL = 'https://m.ssampin.com'` | 모바일 앱 URL |
| `src/adapters/components/Tools/Assignment/AssignmentTool.tsx:47` | `https://ssampin.com/submit/${assignmentId}` | 과제 제출 URL |
| `src/adapters/components/Tools/Assignment/AssignmentCreateModal.tsx:347` | `ssampin.com/s/` | UI 텍스트 (숏링크 미리보기) |
| `src/adapters/components/ClassManagement/ClassAssignmentTab.tsx:165` | `https://ssampin.com/submit/${assignmentId}` | 과제 URL 복사 |
| `src/adapters/components/Homeroom/Assignment/AssignmentTab.tsx:75` | `https://ssampin.com/submit/${assignmentId}` | 과제 URL 복사 |
| `src/adapters/components/Homeroom/Survey/SurveyCreateModal.tsx:456` | `ssampin.com/s/` | UI 텍스트 |
| `src/adapters/components/HelpChat/offlineFaq.ts` (3곳) | `ssampin.com` | FAQ 안내 텍스트 |

### Landing 페이지 (별도 Next.js 앱)
| 파일 | URL | 비고 |
|------|-----|------|
| `landing/src/config.ts:6` | `https://m.ssampin.com` | 정상 (커스텀 도메인) |
| `landing/src/app/layout.tsx` (8곳) | `https://ssampin.com` | SEO 메타데이터 |
| `landing/src/app/sitemap.ts`, `robots.ts` | `https://ssampin.com` | 정상 (사이트맵/봇) |
| `landing/src/components/DownloadButton.tsx` | `https://ssampin.com` | 클립보드 복사 |

### 권장 리팩터링
```typescript
// src/config.ts (신규 생성)
export const SITE_URL = 'https://ssampin.com';
export const MOBILE_URL = 'https://m.ssampin.com';

// 사용 예
import { SITE_URL } from '@domain/config';  // 또는 별도 경로
const shareUrl = `${SITE_URL}/submit/${result.id}`;
```

---

## 📊 종합 평가

| 항목 | 평가 | 비고 |
|------|------|------|
| package.json | ✅ 양호 | v1.0.0, 라이선스 MIT |
| 보안 | ✅ 양호 | API 키 하드코딩 없음, .env.example 안전 |
| 하드코딩 URL | ⚠️ 개선 필요 | `vercel.app` 없음, `ssampin.com` 10곳+ 상수화 필요 |
| 에러 핸들링 | ✅ 양호 | Supabase 클라이언트에 에러 처리, autoUpdater 에러 핸들링 적절 |
| TypeScript | ✅ 우수 | strict mode, any 사용 최소 (3건, 모두 합리적) |
| 빌드 설정 | ✅ 양호 | Vite, Electron builder 모두 프로덕션 적합 |
| PWA | ✅ 양호 | manifest, 아이콘, Workbox 설정 정상 |
| README | ✅ 양호 | 기능, 아키텍처, 기술스택, 설치 안내 포함 |
| LICENSE | ✅ 존재 | MIT |
| .claude/.omc | ⚠️ 개선 필요 | .gitignore에 미포함, Git에 커밋됨 |
| 코드 품질 | ✅ 우수 | Clean Architecture 준수, 계층 분리 ESLint로 강제 |

**v1.0 릴리즈 준비도: 85/100** — 핵심 기능과 아키텍처는 프로덕션 레벨이나, `.claude/.omc` gitignore 추가와 하드코딩 URL 상수화가 릴리즈 전 필수 작업입니다.
