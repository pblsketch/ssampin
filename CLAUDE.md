# CLAUDE.md — 쌤핀 (SsamPin) 프로젝트 컨텍스트

> 이 파일은 Claude Code가 프로젝트를 이해하고 작업할 때 참고하는 문서입니다.

---

## 프로젝트 개요

**쌤핀(SsamPin)** — 중요한 걸 핀으로 꽂아두는 선생님의 데스크톱 대시보드 앱.
교사의 일상 업무(시간표, 좌석배치, 일정, 메모, 할일, 학생기록)를 하나의 앱으로 통합 관리.

- **대상**: 한국 중·고등학교 교사
- **플랫폼**: Windows 데스크톱 (Electron)
- **특징**: 오프라인 완전 동작, 로컬 JSON 저장, 위젯 모드 지원

---

## 기술 스택

| 분류 | 기술 | 버전 |
|------|------|------|
| 런타임 | Electron | ^33.x |
| UI | React | ^18.3 |
| 언어 | TypeScript (strict) | ^5.6 |
| 스타일 | Tailwind CSS | ^3.4 |
| 번들러 | Vite | ^5.4 |
| 상태관리 | Zustand | ^4.5 |
| 날짜 | date-fns | ^3.6 |
| 한글 파일 | @ubermensch1218/hwpxcore | latest |
| Excel | exceljs | ^4.4 |
| 빌드 | electron-builder | ^25.x |
| 폰트 | Noto Sans KR | CDN/번들 |

---

## 아키텍처: Clean Architecture (4 레이어)

```
┌─────────────────────────────────────────────┐
│  infrastructure/  — Electron, 파일 I/O, API │
│  ┌─────────────────────────────────────┐    │
│  │  adapters/  — React, Zustand, DI   │    │
│  │  ┌─────────────────────────────┐    │    │
│  │  │  usecases/  — 앱 로직      │    │    │
│  │  │  ┌─────────────────────┐    │    │    │
│  │  │  │  domain/  — 핵심    │    │    │    │
│  │  │  └─────────────────────┘    │    │    │
│  │  └─────────────────────────────┘    │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### 의존성 규칙 (절대 위반 금지)

```
✅ infrastructure/ → domain/ (포트 인터페이스 구현)
✅ adapters/       → domain/ + usecases/
✅ usecases/       → domain/만
❌ domain/         → 아무것도 import 안 함
❌ usecases/       → adapters/, infrastructure/ import 금지
```

**유일한 예외**: `adapters/di/container.ts`는 infrastructure/를 import하여 의존성을 조립한다.

### 프로젝트 구조

```
ssampin/
├── electron/                    # 🔴 Electron 메인 프로세스
│   ├── main.ts                  # BrowserWindow, IPC 핸들러
│   └── preload.ts               # contextBridge
├── src/
│   ├── domain/                  # 🟡 핵심 비즈니스 규칙 (순수 TypeScript, 외부 의존 없음)
│   │   ├── entities/            # 엔티티 타입 (Student, SchoolEvent, Timetable...)
│   │   ├── valueObjects/        # 값 객체 (PeriodTime, DayOfWeek, MemoColor...)
│   │   ├── rules/               # 비즈니스 규칙 순수 함수
│   │   │   ├── periodRules.ts   # 현재 교시 판정
│   │   │   ├── seatRules.ts     # 좌석 교환/배치 검증
│   │   │   ├── ddayRules.ts     # D-Day 계산, 알림 대상 판정
│   │   │   ├── todoRules.ts     # 정렬, 필터, overdue 판정
│   │   │   ├── eventRules.ts    # 일정 필터/정렬
│   │   │   ├── shareRules.ts    # .ssampin 파일 검증, 중복 감지
│   │   │   └── studentRecordRules.ts  # 학생 기록 필터/통계
│   │   ├── ports/               # 저장소 추상 인터페이스
│   │   │   └── IStoragePort.ts
│   │   └── repositories/        # Repository 인터페이스 (포트)
│   │       ├── IScheduleRepository.ts
│   │       ├── ISeatingRepository.ts
│   │       ├── IEventsRepository.ts
│   │       ├── IMemoRepository.ts
│   │       ├── ITodoRepository.ts
│   │       ├── ISettingsRepository.ts
│   │       ├── IStudentRecordsRepository.ts
│   │       └── IMessageRepository.ts
│   │
│   ├── usecases/                # 🟢 애플리케이션 로직 (domain만 import)
│   │   ├── schedule/            # GetCurrentPeriod, UpdateClassSchedule...
│   │   ├── seating/             # SwapSeats, RandomizeSeats, UpdateSeating
│   │   ├── events/              # ManageEvents, CheckEventAlerts, ExportEvents, ImportEvents
│   │   ├── memo/                # ManageMemos
│   │   ├── todo/                # ManageTodos
│   │   └── studentRecords/      # ManageStudentRecords
│   │
│   ├── adapters/                # 🔵 UI + 변환 계층 (domain + usecases import)
│   │   ├── components/          # React 컴포넌트
│   │   │   ├── Layout/          # Sidebar
│   │   │   ├── Dashboard/       # Clock, WeatherBar, MessageBanner, 위젯 카드들
│   │   │   ├── Timetable/       # 시간표 뷰 + 에디터
│   │   │   ├── Seating/         # 좌석배치 + 드래그앤드롭
│   │   │   ├── Schedule/        # 일정 관리 (캘린더 + 리스트)
│   │   │   ├── StudentRecords/  # 담임 메모장
│   │   │   ├── Memo/            # 포스트잇 메모
│   │   │   ├── Todo/            # 투두리스트
│   │   │   ├── Settings/        # 설정
│   │   │   ├── Widget/          # 위젯 모드
│   │   │   ├── Export/          # 내보내기
│   │   │   ├── Onboarding/      # 첫 실행 마법사
│   │   │   └── common/          # Toast, Modal 등 공통 UI
│   │   ├── stores/              # Zustand 스토어 (useScheduleStore, useSeatingStore...)
│   │   ├── hooks/               # React 커스텀 훅 (useClock...)
│   │   ├── repositories/        # Repository 구현체 (JsonScheduleRepository...)
│   │   ├── presenters/          # Domain → UI 변환 (timetablePresenter...)
│   │   └── di/                  # DI 컨테이너 (container.ts)
│   │
│   ├── infrastructure/          # 🔴 외부 기술 구현
│   │   ├── storage/             # ElectronStorageAdapter, LocalStorageAdapter
│   │   ├── weather/             # 날씨 API 클라이언트
│   │   └── export/              # HwpxExporter, ExcelExporter, PdfExporter
│   │
│   ├── App.tsx                  # 루트 컴포넌트 (DI 초기화 + 라우팅)
│   └── main.tsx                 # React 엔트리포인트
│
├── design examples/             # 🎨 UI 디자인 레퍼런스 (Google Stitch 생성물)
├── mockups/                     # 목업 이미지 (참고용)
├── docs/                        # PRD.md, SPEC.md, claude-code-prompts.md
├── dist/                        # Vite 빌드 출력
├── dist-electron/               # Electron 컴파일 출력
└── release/                     # electron-builder 인스톨러 출력
```

---

## 🎨 디자인 레퍼런스

### design examples/ 폴더 (필수 참고)

`design examples/` 폴더에 Google Stitch로 생성한 **UI 디자인 예시**가 들어있다.
**프론트엔드 컴포넌트를 구현할 때 반드시 이 폴더의 이미지를 먼저 확인하고, 디자인을 최대한 재현할 것.**

- 레이아웃, 색상, 간격, 컴포넌트 배치를 디자인 예시에 맞춘다
- 디자인 예시에 없는 페이지는 기존 디자인 톤을 유지하여 일관성 있게 구현한다
- 디자인과 SPEC이 충돌하면 **디자인 예시를 우선**한다 (시각적 완성도 중요)

### 디자인 시스템

| 용도 | 토큰 | HEX |
|------|------|-----|
| 배경 (최하단) | sp-bg | #0a0e17 |
| 서피스 (사이드바) | sp-surface | #131a2b |
| 카드 | sp-card | #1a2332 |
| 테두리 | sp-border | #2a3548 |
| 강조 (파란) | sp-accent | #3b82f6 |
| 하이라이트 (앰버) | sp-highlight | #f59e0b |
| 텍스트 (밝은) | sp-text | #e2e8f0 |
| 텍스트 (흐린) | sp-muted | #94a3b8 |

- **폰트**: Noto Sans KR (제목 Bold, 본문 Regular)
- **모서리**: rounded-xl (카드), rounded-lg (버튼/입력)
- **모든 UI 텍스트는 한국어**

### 과목별 컬러 코드

국어=yellow, 영어=green, 수학=blue, 과학=purple, 사회=orange, 체육=red, 음악=pink, 미술=indigo, 창체=teal

---

## 코딩 컨벤션

### TypeScript
- **strict 모드** 필수 (`noImplicitAny`, `strictNullChecks`)
- `any` 타입 사용 금지
- Props는 별도 `interface` 정의
- 에러 처리 필수 (try-catch)

### React
- 함수형 컴포넌트만 사용
- 커스텀 훅은 `use` 접두사
- 컴포넌트 파일명: PascalCase (예: `DashboardTimetable.tsx`)

### Import 규칙 (아키텍처 의존성 강제)
```typescript
// ✅ 올바른 import
import { Student } from '@domain/entities/Student';           // domain → OK
import { SwapSeats } from '@usecases/seating/SwapSeats';     // usecases → OK (adapters에서)
import { useSeatingStore } from '@adapters/stores/useSeatingStore'; // adapters → OK (같은 레이어)

// ❌ 금지된 import
import { useSeatingStore } from '@adapters/stores/...';  // usecases에서 adapters import → 금지!
import { ElectronStorageAdapter } from '@infrastructure/...'; // usecases에서 infrastructure → 금지!
```

### Path Alias (tsconfig.json)
```json
{
  "paths": {
    "@domain/*": ["src/domain/*"],
    "@usecases/*": ["src/usecases/*"],
    "@adapters/*": ["src/adapters/*"],
    "@infrastructure/*": ["src/infrastructure/*"]
  }
}
```

### 스타일
- 들여쓰기: 2 spaces
- 세미콜론: 사용
- 따옴표: 작은따옴표
- 후행 쉼표: 사용
- Tailwind CSS 유틸리티 클래스 사용 (인라인 스타일 지양)

---

## 데이터 저장

- **Electron**: `app.getPath('userData')/data/{filename}.json`
- **브라우저(개발)**: `localStorage` 폴백
- **추상화**: `IStoragePort` 인터페이스로 환경 자동 감지
- 스키마 변경 시 마이그레이션 로직을 Repository 구현체에 추가

---

## 주요 기능 목록

| 기능 | 페이지 | 핵심 Use Case |
|------|--------|---------------|
| 대시보드 | `/` | GetCurrentPeriod, CheckEventAlerts |
| 시간표 | `/timetable` | UpdateClassSchedule, UpdateTeacherSchedule |
| 좌석배치 | `/seating` | SwapSeats, RandomizeSeats |
| 일정관리 | `/schedule` | ManageEvents, ExportEvents, ImportEvents |
| 담임메모 | `/student-records` | ManageStudentRecords |
| 메모 | `/memo` | ManageMemos |
| 할일 | `/todo` | ManageTodos |
| 설정 | `/settings` | — |
| 위젯모드 | (별도 윈도우) | 대시보드 축소판 |

---

## 개발 명령어

```bash
npm run dev              # 브라우저 모드 (Vite dev server)
npm run electron:dev     # Electron + Vite 동시 실행
npm run build            # 프로덕션 빌드
npm run electron:build   # Electron 인스톨러 빌드
npx tsc --noEmit         # 타입 체크 (에러 0개 유지)
```

---

## 참고 문서

| 문서 | 위치 | 설명 |
|------|------|------|
| PRD | `PRD.md` | 제품 요구사항 (기능 정의) |
| SPEC | `SPEC.md` | 기술 명세 (아키텍처, 데이터 모델, 보안) |
| 개발 프롬프트 | `claude-code-prompts.md` | Phase별 구현 프롬프트 |
| 디자인 프롬프트 | `stitch-prompts.md` | Google Stitch UI 생성 프롬프트 |
| 디자인 예시 | `design examples/` | 🎨 **UI 구현 시 필수 참고** |
| 목업 | `mockups/` | 초기 목업 이미지 |

---

## ⚠️ 주의사항

1. **domain/ 레이어는 절대 외부 의존성을 가지면 안 된다** (React, Zustand, Electron 등 import 금지)
2. **`design examples/` 폴더의 디자인을 최대한 반영**할 것 — 색상, 레이아웃, 간격, 컴포넌트 스타일
3. **Electron과 브라우저 모두에서 동작**해야 한다 (`npm run dev`로 브라우저 테스트 가능)
4. **모든 UI 텍스트는 한국어**로 작성
5. 파일 저장/로드 시 반드시 **DI 컨테이너 → Repository → IStoragePort** 경로를 따른다
6. `any` 타입 사용 금지, TypeScript 에러 0개 유지
