# 📌 쌤핀 (SsamPin) — Technical Specification

**버전:** v0.2 (클린 아키텍처 적용)
**최종 수정:** 2026-02-27
**대응 PRD:** PRD.md v0.1

---

## 1. 기술 스택

| 분류 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **런타임** | Electron | ^33.x | 데스크톱 앱 프레임워크 |
| **프론트엔드** | React | ^18.3 | UI 라이브러리 |
| **언어** | TypeScript | ^5.6 | 타입 안전성 |
| **스타일** | Tailwind CSS | ^3.4 | 유틸리티 CSS |
| **번들러** | Vite | ^5.4 | 개발 서버 + 빌드 |
| **상태관리** | Zustand | ^4.5 | 경량 전역 상태 |
| **날짜** | date-fns | ^3.6 | 날짜 유틸리티 |
| **HWPX** | @ubermensch1218/hwpxcore | latest | 한글 파일 생성 |
| **Excel** | exceljs | ^4.4 | Excel 파일 생성 |
| **PDF** | Electron printToPDF | 내장 | PDF 생성 |
| **업데이트** | electron-updater | ^6.3 | 자동 업데이트 |
| **빌드** | electron-builder | ^25.x | 인스톨러 빌드 |
| **폰트** | Noto Sans KR | CDN/번들 | 한국어 폰트 |

### 선택 근거

- **Electron**: 교사 PC(Windows)에서 설치형 앱으로 동작. 웹 기술 기반이라 UI 개발 생산성 높음. 오프라인 완전 동작.
- **React + TypeScript**: 컴포넌트 기반 UI 구성. 타입 안전성으로 데이터 모델 관리 용이.
- **Zustand**: Redux보다 가볍고, 보일러플레이트 최소. 파일별 store 분리에 적합.
- **Tailwind CSS**: 다크 테마 구현에 유리. 유틸리티 클래스로 빠른 UI 개발.
- **Vite**: 개발 서버 HMR이 빠름. Electron과 조합 시 개발 경험 우수.
- **로컬 JSON**: 서버 불필요. SQLite 대비 스키마 변경이 유연하고 디버깅 쉬움. 데이터 규모가 작음(수십~수백 건).

### 프레임워크 독립성 원칙

기술 스택의 각 요소는 **교체 가능**하도록 설계한다:
- **UI 프레임워크 (React)**: Domain/Use Cases 레이어는 React에 의존하지 않음. 향후 Vue, Svelte 등으로 교체 가능.
- **상태관리 (Zustand)**: UI 어댑터 레이어에서만 사용. Use Cases 레이어는 Zustand를 모름.
- **데이터 저장소 (JSON 파일)**: Repository 인터페이스 뒤에 숨김. SQLite, IndexedDB 등으로 교체 가능.
- **Electron**: Infrastructure 레이어에 격리. 웹 브라우저에서도 핵심 기능이 동작.

---

## 2. 소프트웨어 아키텍처 (Clean Architecture)

### 2.1 레이어 구조

쌤핀은 **클린 아키텍처(Clean Architecture)** 원칙을 따른다.
안쪽 레이어일수록 안정적이고, 바깥쪽 레이어일수록 변경이 잦다.

```
┌─────────────────────────────────────────────────────┐
│  Frameworks & Drivers (infrastructure/)              │
│  Electron, Vite, JSON 파일 I/O, Weather API         │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Interface Adapters (adapters/)              │    │
│  │  React 컴포넌트, Zustand 스토어,             │    │
│  │  IPC 핸들러, Repository 구현체               │    │
│  │                                             │    │
│  │  ┌─────────────────────────────────────┐    │    │
│  │  │  Use Cases (usecases/)               │    │    │
│  │  │  시간표 관리, 일정 관리,              │    │    │
│  │  │  좌석 배치, 알림 판정 등              │    │    │
│  │  │                                     │    │    │
│  │  │  ┌─────────────────────────────┐    │    │    │
│  │  │  │  Domain (domain/)            │    │    │    │
│  │  │  │  엔티티, 값 객체,            │    │    │    │
│  │  │  │  비즈니스 규칙,              │    │    │    │
│  │  │  │  Repository 인터페이스        │    │    │    │
│  │  │  └─────────────────────────────┘    │    │    │
│  │  └─────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### 2.2 의존성 규칙 (Dependency Rule)

**의존성은 반드시 안쪽으로만 향한다.**

```
infrastructure/ → adapters/ → usecases/ → domain/
     ↓               ↓            ↓           ×
  (가장 바깥)    (어댑터)    (유스케이스)   (핵심, 아무것도 의존 안 함)
```

- ✅ `adapters/` → `domain/`, `usecases/` import 가능
- ✅ `usecases/` → `domain/` import 가능
- ❌ `domain/` → `usecases/`, `adapters/`, `infrastructure/` import 절대 불가
- ❌ `usecases/` → `adapters/`, `infrastructure/` import 절대 불가

### 2.3 각 레이어 역할

#### 🟡 Domain (domain/) — 핵심 비즈니스 규칙
프레임워크에 전혀 의존하지 않는 순수 TypeScript 코드.

| 구성요소 | 설명 | 예시 |
|---------|------|------|
| **엔티티 (Entities)** | 핵심 비즈니스 객체 | `Student`, `SchoolEvent`, `Timetable`, `Seat` |
| **값 객체 (Value Objects)** | 불변 값 타입 | `PeriodTime`, `DayOfWeek`, `EventType`, `MemoColor` |
| **비즈니스 규칙** | 도메인 내 검증/계산 로직 | "현재 교시 판정", "D-Day 계산", "좌석 교환 가능 여부" |
| **Repository 인터페이스** | 데이터 접근 추상화 (포트) | `IScheduleRepository`, `ISeatingRepository` |

```typescript
// domain/entities/Student.ts — 순수 TypeScript, 외부 의존성 없음
export interface Student {
  id: number;      // 학번
  name: string;    // 이름
}

// domain/repositories/IScheduleRepository.ts — 포트(인터페이스)
export interface IScheduleRepository {
  getClassSchedule(): Promise<ClassScheduleData | null>;
  saveClassSchedule(data: ClassScheduleData): Promise<void>;
  getTeacherSchedule(): Promise<TeacherScheduleData | null>;
  saveTeacherSchedule(data: TeacherScheduleData): Promise<void>;
}
```

#### 🟢 Use Cases (usecases/) — 애플리케이션 비즈니스 규칙
하나의 사용자 행위를 표현하는 단위. Domain 엔티티와 Repository 인터페이스를 조합.

| 유스케이스 | 설명 |
|-----------|------|
| `GetCurrentPeriod` | 현재 시각 → 교시 번호 반환 |
| `UpdateClassSchedule` | 시간표 수정 + 저장 |
| `SwapSeats` | 두 좌석 교환 + 저장 |
| `CheckEventAlerts` | 오늘 날짜 기준 D-Day/D-1/D-3 알림 대상 일정 반환 |
| `ImportSharedEvents` | .ssampin 파일 파싱 + 중복 체크 + 일정 추가 |
| `ExportSharedEvents` | 선택된 일정 → .ssampin 파일 데이터 생성 |
| `AddStudentRecord` | 학생 기록 추가 (다중 학생 지원) |
| `GetStudentTimeline` | 학생별 기록 타임라인 조회 |
| `RandomizeSeats` | 좌석 랜덤 배치 |
| `CalculateAttendanceStats` | 학생별 출결 통계 집계 |

```typescript
// usecases/GetCurrentPeriod.ts
import { PeriodTime } from '../domain/entities/PeriodTime';

export class GetCurrentPeriod {
  execute(periodTimes: PeriodTime[], now: Date): number | null {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    for (const pt of periodTimes) {
      const start = this.parseMinutes(pt.start);
      const end = this.parseMinutes(pt.end);
      if (currentMinutes >= start && currentMinutes < end) {
        return pt.period;
      }
    }
    return null;
  }

  private parseMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
}
```

```typescript
// usecases/SwapSeats.ts — Repository 인터페이스에 의존 (구체 구현 아님)
import { ISeatingRepository } from '../domain/repositories/ISeatingRepository';
import { SeatingData } from '../domain/entities/Seating';

export class SwapSeats {
  constructor(private readonly seatingRepo: ISeatingRepository) {}

  async execute(row1: number, col1: number, row2: number, col2: number): Promise<SeatingData> {
    const seating = await this.seatingRepo.getSeating();
    if (!seating) throw new Error('좌석 데이터가 없습니다');

    // 비즈니스 규칙: 범위 검증
    this.validatePosition(seating, row1, col1);
    this.validatePosition(seating, row2, col2);

    // 교환
    const temp = seating.seats[row1][col1];
    seating.seats[row1][col1] = seating.seats[row2][col2];
    seating.seats[row2][col2] = temp;

    await this.seatingRepo.saveSeating(seating);
    return seating;
  }

  private validatePosition(seating: SeatingData, row: number, col: number): void {
    if (row < 0 || row >= seating.rows || col < 0 || col >= seating.cols) {
      throw new Error(`유효하지 않은 좌석 위치: [${row}, ${col}]`);
    }
  }
}
```

#### 🔵 Interface Adapters (adapters/) — 변환 계층
바깥 세계(UI, 저장소)와 Use Cases/Domain을 연결.

| 구성요소 | 설명 | 예시 |
|---------|------|------|
| **UI 컴포넌트 (React)** | 화면 렌더링 + 사용자 입력 | `Dashboard.tsx`, `Timetable.tsx` |
| **Zustand 스토어** | UI 상태 관리 + Use Case 호출 | `useScheduleStore.ts` |
| **Repository 구현체** | 인터페이스 구현 | `JsonScheduleRepository` |
| **프레젠터/매퍼** | 도메인 데이터 → UI 표시 형식 변환 | `timetablePresenter.ts` |

```typescript
// adapters/repositories/JsonScheduleRepository.ts
import { IScheduleRepository } from '../../domain/repositories/IScheduleRepository';
import { IStoragePort } from '../../domain/ports/IStoragePort';

export class JsonScheduleRepository implements IScheduleRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getClassSchedule() {
    return this.storage.read<ClassScheduleData>('class-schedule.json');
  }

  async saveClassSchedule(data: ClassScheduleData) {
    await this.storage.write('class-schedule.json', data);
  }
  // ...
}
```

```typescript
// adapters/stores/useScheduleStore.ts — Zustand 스토어
// Use Case를 호출하고, UI에 필요한 상태를 관리
import { create } from 'zustand';
import { container } from '../di/container';

export const useScheduleStore = create((set, get) => ({
  classSchedule: null,
  currentPeriod: null,

  loadSchedule: async () => {
    const repo = container.get<IScheduleRepository>('IScheduleRepository');
    const data = await repo.getClassSchedule();
    set({ classSchedule: data });
  },

  updateCurrentPeriod: (periodTimes: PeriodTime[], now: Date) => {
    const useCase = new GetCurrentPeriod();
    set({ currentPeriod: useCase.execute(periodTimes, now) });
  },
}));
```

#### 🔴 Frameworks & Drivers (infrastructure/) — 외부 세계
가장 바깥 레이어. 구체적인 기술 구현.

| 구성요소 | 설명 |
|---------|------|
| **Electron 메인 프로세스** | 앱 생명주기, 윈도우, IPC 핸들러 |
| **JSON 파일 I/O** | `fs.readFileSync` / `fs.writeFileSync` |
| **localStorage 어댑터** | 브라우저 개발 모드용 폴백 저장소 |
| **Weather API 클라이언트** | OpenWeatherMap / 에어코리아 HTTP 호출 |
| **Electron Builder** | 빌드/배포 설정 |

```typescript
// infrastructure/storage/ElectronStorageAdapter.ts
import { IStoragePort } from '../../domain/ports/IStoragePort';

export class ElectronStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    return window.electronAPI.readData(filename);
  }
  async write<T>(filename: string, data: T): Promise<void> {
    await window.electronAPI.writeData(filename, data);
  }
}

// infrastructure/storage/LocalStorageAdapter.ts
export class LocalStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    const stored = localStorage.getItem(`ssampin:${filename}`);
    return stored ? JSON.parse(stored) : null;
  }
  async write<T>(filename: string, data: T): Promise<void> {
    localStorage.setItem(`ssampin:${filename}`, JSON.stringify(data));
  }
}
```

### 2.4 의존성 역전 (DIP) 적용 패턴

```
┌──────────────┐     implements     ┌──────────────────────┐
│  domain/     │ ◄─────────────── │  adapters/repositories/ │
│  repositories/│                   │  (구현체)              │
│  IXxxRepo    │                   │  JsonXxxRepository      │
│  (인터페이스) │                   │                        │
└──────┬───────┘                   └──────────┬─────────────┘
       │                                      │
       │  의존                                 │ 주입
       ▼                                      │
┌──────────────┐                              │
│  usecases/   │ ◄────── constructor ─────────┘
│  (Use Cases) │         injection
└──────────────┘
```

- **Domain**: `IScheduleRepository` 인터페이스만 정의 (포트)
- **Use Cases**: 인터페이스에 의존하여 비즈니스 로직 수행
- **Adapters**: `JsonScheduleRepository`가 인터페이스를 구현 (어댑터)
- **DI Container**: 앱 초기화 시 구현체를 주입

### 2.5 간단한 DI 컨테이너

1인 개발 규모에 맞는 경량 DI:

```typescript
// adapters/di/container.ts
import { IStoragePort } from '../../domain/ports/IStoragePort';
import { ElectronStorageAdapter } from '../../infrastructure/storage/ElectronStorageAdapter';
import { LocalStorageAdapter } from '../../infrastructure/storage/LocalStorageAdapter';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

// 환경에 따라 구현체 선택
const storage: IStoragePort = isElectron
  ? new ElectronStorageAdapter()
  : new LocalStorageAdapter();

export const container = {
  storage,
  // Repository 인스턴스들
  scheduleRepo: new JsonScheduleRepository(storage),
  seatingRepo: new JsonSeatingRepository(storage),
  eventsRepo: new JsonEventsRepository(storage),
  memoRepo: new JsonMemoRepository(storage),
  todoRepo: new JsonTodoRepository(storage),
  settingsRepo: new JsonSettingsRepository(storage),
  studentRecordsRepo: new JsonStudentRecordsRepository(storage),
};
```

---

## 3. 프로젝트 구조

```
ssampin/
├── package.json
├── package-lock.json
├── tsconfig.json              # React 앱용 TS 설정
├── tsconfig.node.json         # Vite 설정용 TS
├── tsconfig.electron.json     # Electron 메인 프로세스용 TS → dist-electron/
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── electron-builder.yml       # 빌드/배포 설정
├── index.html                 # Vite 엔트리 HTML
├── PRD.md
├── SPEC.md
├── README.md
│
├── electron/                  # 🔴 Frameworks & Drivers — Electron 메인 프로세스
│   ├── main.ts                # 앱 생명주기, 윈도우 생성
│   ├── preload.ts             # contextBridge로 IPC 노출
│   └── ipc/                   # IPC 핸들러 모듈
│       ├── data.ts            # 파일 읽기/쓰기
│       ├── export.ts          # 내보내기 관련
│       ├── share.ts           # .ssampin 파일 공유
│       └── system.ts          # 창 제어, 시스템 설정
│
├── src/                       # 렌더러 프로세스 (클린 아키텍처 적용)
│   ├── main.tsx               # React 엔트리포인트 (DI 초기화 포함)
│   ├── App.tsx                # 루트 컴포넌트 (라우팅, 초기화)
│   ├── index.css              # Tailwind + 글로벌 스타일
│   │
│   ├── domain/                # 🟡 Domain — 핵심 비즈니스 규칙 (의존성 없음)
│   │   ├── entities/          #   엔티티 (핵심 데이터 구조)
│   │   │   ├── Student.ts             # 학생 엔티티
│   │   │   ├── Timetable.ts           # 시간표 (학급/교사)
│   │   │   ├── Seating.ts             # 좌석 배치
│   │   │   ├── SchoolEvent.ts         # 학교/나무학교 일정
│   │   │   ├── Memo.ts                # 포스트잇 메모
│   │   │   ├── Todo.ts                # 투두 항목
│   │   │   ├── StudentRecord.ts       # 학생 기록 (출결/상담/생활)
│   │   │   ├── Settings.ts            # 앱 설정
│   │   │   └── ShareFile.ts           # .ssampin 공유 파일 스키마
│   │   │
│   │   ├── valueObjects/      #   값 객체 (불변 타입)
│   │   │   ├── PeriodTime.ts          # 교시 시간 (시작/종료)
│   │   │   ├── DayOfWeek.ts           # 요일 타입
│   │   │   ├── EventType.ts           # 일정 타입 (학교/공휴일/시험/방학/나무)
│   │   │   ├── MemoColor.ts           # 메모 색상
│   │   │   └── RecordCategory.ts      # 학생 기록 카테고리
│   │   │
│   │   ├── rules/             #   비즈니스 규칙 (순수 함수)
│   │   │   ├── periodRules.ts         # 현재 교시 판정 로직
│   │   │   ├── ddayRules.ts           # D-Day 계산, 알림 대상 판정
│   │   │   ├── seatRules.ts           # 좌석 교환 가능 여부, 랜덤 배치
│   │   │   └── attendanceRules.ts     # 출결 통계 집계 규칙
│   │   │
│   │   ├── ports/             #   포트 (인터페이스) — 외부 의존 추상화
│   │   │   └── IStoragePort.ts        # 데이터 저장소 추상화
│   │   │
│   │   └── repositories/      #   Repository 인터페이스
│   │       ├── IScheduleRepository.ts
│   │       ├── ISeatingRepository.ts
│   │       ├── IEventsRepository.ts
│   │       ├── IMemoRepository.ts
│   │       ├── ITodoRepository.ts
│   │       ├── ISettingsRepository.ts
│   │       ├── IStudentRecordsRepository.ts
│   │       └── IMessageRepository.ts
│   │
│   ├── usecases/              # 🟢 Use Cases — 애플리케이션 비즈니스 규칙
│   │   ├── schedule/
│   │   │   ├── GetCurrentPeriod.ts        # 현재 교시 판정
│   │   │   ├── UpdateClassSchedule.ts     # 학급 시간표 수정
│   │   │   └── UpdateTeacherSchedule.ts   # 교사 시간표 수정
│   │   ├── seating/
│   │   │   ├── SwapSeats.ts               # 좌석 교환
│   │   │   ├── RandomizeSeats.ts          # 랜덤 배치 (v1.0)
│   │   │   └── UpdateSeating.ts           # 좌석 편집/저장
│   │   ├── events/
│   │   │   ├── ManageEvents.ts            # 일정 CRUD
│   │   │   ├── CheckEventAlerts.ts        # 행사 알림 판정
│   │   │   ├── ImportSharedEvents.ts      # .ssampin 가져오기
│   │   │   └── ExportSharedEvents.ts      # .ssampin 내보내기
│   │   ├── studentRecords/
│   │   │   ├── AddStudentRecord.ts        # 학생 기록 추가
│   │   │   ├── GetStudentTimeline.ts      # 학생별 타임라인 조회
│   │   │   └── CalculateAttendanceStats.ts # 출결 통계
│   │   ├── memo/
│   │   │   └── ManageMemos.ts             # 메모 CRUD + 위치 업데이트
│   │   └── todo/
│   │       └── ManageTodos.ts             # 투두 CRUD + 완료 처리
│   │
│   ├── adapters/              # 🔵 Interface Adapters — 변환 계층
│   │   ├── repositories/      #   Repository 구현체 (domain 인터페이스 구현)
│   │   │   ├── JsonScheduleRepository.ts
│   │   │   ├── JsonSeatingRepository.ts
│   │   │   ├── JsonEventsRepository.ts
│   │   │   ├── JsonMemoRepository.ts
│   │   │   ├── JsonTodoRepository.ts
│   │   │   ├── JsonSettingsRepository.ts
│   │   │   ├── JsonStudentRecordsRepository.ts
│   │   │   └── JsonMessageRepository.ts
│   │   │
│   │   ├── presenters/        #   프레젠터 (도메인 데이터 → UI 표시 형식)
│   │   │   ├── timetablePresenter.ts      # 시간표 표시 데이터 변환
│   │   │   ├── eventPresenter.ts          # 일정 + D-Day 표시 변환
│   │   │   └── seatingPresenter.ts        # 좌석 통계 계산
│   │   │
│   │   ├── stores/            #   Zustand 스토어 (UI 상태 + Use Case 호출)
│   │   │   ├── useSettingsStore.ts
│   │   │   ├── useScheduleStore.ts
│   │   │   ├── useSeatingStore.ts
│   │   │   ├── useEventsStore.ts
│   │   │   ├── useMemoStore.ts
│   │   │   ├── useTodoStore.ts
│   │   │   ├── useMessageStore.ts
│   │   │   └── useStudentRecordsStore.ts
│   │   │
│   │   ├── hooks/             #   React 커스텀 훅
│   │   │   └── useClock.ts            # 1초 간격 현재 시간
│   │   │
│   │   ├── di/                #   의존성 주입 컨테이너
│   │   │   └── container.ts           # 환경별 구현체 바인딩
│   │   │
│   │   └── components/        #   React UI 컴포넌트 (페이지별 폴더)
│   │       ├── Layout/
│   │       │   └── Sidebar.tsx
│   │       ├── Dashboard/
│   │       │   ├── Dashboard.tsx
│   │       │   ├── Clock.tsx
│   │       │   ├── WeatherBar.tsx
│   │       │   ├── MessageBanner.tsx
│   │       │   ├── DashboardTimetable.tsx
│   │       │   ├── DashboardEvents.tsx
│   │       │   ├── DashboardDDay.tsx
│   │       │   ├── DashboardTodo.tsx
│   │       │   └── EventPopup.tsx
│   │       ├── Timetable/
│   │       │   ├── Timetable.tsx
│   │       │   └── TimetableEditor.tsx
│   │       ├── Seating/
│   │       │   └── Seating.tsx
│   │       ├── Schedule/
│   │       │   └── Schedule.tsx
│   │       ├── StudentRecords/
│   │       │   ├── StudentRecords.tsx
│   │       │   ├── RecordInput.tsx
│   │       │   └── RecordTimeline.tsx
│   │       ├── Memo/
│   │       │   ├── Memo.tsx
│   │       │   └── MemoCard.tsx
│   │       ├── Todo/
│   │       │   └── Todo.tsx
│   │       ├── Export/
│   │       │   └── Export.tsx
│   │       └── Settings/
│   │           └── Settings.tsx
│   │
│   └── infrastructure/        # 🔴 Frameworks & Drivers — 외부 기술 구현
│       ├── storage/
│       │   ├── ElectronStorageAdapter.ts   # IStoragePort 구현 (Electron IPC)
│       │   └── LocalStorageAdapter.ts      # IStoragePort 구현 (브라우저 폴백)
│       ├── weather/
│       │   └── WeatherApiClient.ts        # 날씨 API 호출
│       └── export/
│           ├── hwpxExporter.ts            # HWPX 생성
│           ├── excelExporter.ts           # Excel 생성
│           └── pdfExporter.ts             # PDF 생성
│
├── dist/                      # Vite 빌드 출력 (렌더러)
├── dist-electron/             # Electron TS 컴파일 출력 (메인)
└── release/                   # electron-builder 빌드 출력 (.exe)
```

### 파일 수 예상: ~65개 소스 파일

### Import 규칙 (ESLint로 강제 권장)

```
❌ 금지되는 import:
- domain/ → usecases/, adapters/, infrastructure/ 어디서든 import 불가
- usecases/ → adapters/, infrastructure/ import 불가

✅ 허용되는 import:
- usecases/ → domain/ (엔티티, 값 객체, 비즈니스 규칙, Repository 인터페이스)
- adapters/ → domain/, usecases/
- infrastructure/ → domain/ (포트 인터페이스만)
- adapters/di/container.ts → infrastructure/ (유일하게 구현체를 알아야 하는 곳)
```

---

## 4. 데이터 모델

모든 데이터는 Electron `app.getPath('userData')/data/` 디렉토리에 JSON 파일로 저장.
브라우저 개발 모드에서는 localStorage로 폴백.
데이터 접근은 반드시 **Repository 인터페이스(domain/repositories/)**를 통해 수행. 직접 파일 I/O 접근 금지.

### 4.1 settings.json

앱 전체 설정.

```typescript
interface Settings {
  // 학교/학급 정보
  schoolName: string;        // "한국중학교"
  className: string;         // "2학년 3반"
  teacherName: string;       // "김선생"
  subject: string;           // "국어"

  // 교시 시간 설정
  periodTimes: PeriodTime[]; // 가변 길이 (보통 6~7교시)
  lunchStart: string;        // "12:00" (HH:MM)
  lunchEnd: string;          // "12:50"

  // 좌석 설정
  seatRows: number;          // 1~10, 기본 6
  seatCols: number;          // 1~10, 기본 6

  // 시스템
  alwaysOnTop: boolean;      // 기본 false
  launchOnStartup: boolean;  // 기본 false

  // 위젯 모드
  widget: {
    enabled: boolean;          // 위젯 모드 활성화 여부
    opacity: number;           // 배경 투명도 0~100 (기본 80)
    position: { x: number; y: number } | null;  // 마지막 위치 기억 (null이면 우상단 기본)
    size: { width: number; height: number };     // 기본 350×500, 자유 리사이즈
    minSize: { width: 280; height: 350 };         // 최소 크기 (고정)
    resizable: true;                               // 항상 true
    alwaysOnTop: boolean;      // 위젯 모드에서는 기본 true
  };
}

interface PeriodTime {
  period: number;  // 1, 2, 3, ...
  start: string;   // "08:50" (HH:MM)
  end: string;     // "09:30"
}
```

**기본값:**

| 교시 | 시작 | 종료 |
|------|------|------|
| 1교시 | 08:50 | 09:30 |
| 2교시 | 09:40 | 10:20 |
| 3교시 | 10:30 | 11:10 |
| 4교시 | 11:20 | 12:00 |
| 점심 | 12:00 | 12:50 |
| 5교시 | 12:50 | 13:30 |
| 6교시 | 13:40 | 14:20 |

### 4.2 class-schedule.json

학급 시간표. 요일별 과목명 배열.

```typescript
interface ClassScheduleData {
  schedule: Record<DayOfWeek, string[]>;
  // string[i] = i+1교시의 과목명. 빈 문자열 = 해당 교시 없음.
}

type DayOfWeek = '월' | '화' | '수' | '목' | '금';
```

**예시:**
```json
{
  "schedule": {
    "월": ["국어", "영어", "국어", "수학", "체육", ""],
    "화": ["과학", "음악", "국어", "사회", "수학", ""],
    "수": ["국어", "사회", "영어", "수학", "국어", ""],
    "목": ["국어", "국어", "수학", "사회", "국어", "창체"],
    "금": ["미술", "미술", "국어", "음악", "과학", ""]
  }
}
```

### 4.3 teacher-schedule.json

교사 시간표. 요일별 교시 정보 배열.

```typescript
interface TeacherScheduleData {
  schedule: Record<DayOfWeek, TeacherPeriod[]>;
}

interface TeacherPeriod {
  period: number;   // 교시 번호
  subject: string;  // 과목명 (빈 문자열 = 수업 없음)
  class: string;    // 학급명 (예: "2-3"). 빈 문자열 = 다른 선생님 수업 or 공강
}
```

**표시 규칙:**
- `subject` + `class` 모두 있음 → 내 수업 (강조 표시)
- `subject`만 있고 `class` 없음 → 다른 선생님 수업 (흐리게)
- 둘 다 비어있음 → 공강 (대시 `-` 표시)

### 4.4 seating.json

좌석 배치. 2차원 배열.

```typescript
interface SeatingData {
  rows: number;    // 행 수
  cols: number;    // 열 수
  seats: (Student | null)[][];
  // seats[row][col]. null = 빈 좌석.
  // seats[0]이 교탁 가까운 쪽 (앞줄).
}

interface Student {
  id: number;      // 학번
  name: string;    // 이름
}
```

**제약:**
- `seats.length === rows`, `seats[i].length === cols`
- 학번(id)은 학급 내 고유. 0은 허용하지 않음.

### 4.5 school-events.json

학교 교육활동 일정.

```typescript
interface SchoolEventsData {
  events: SchoolEvent[];
  // 날짜 기준 오름차순 정렬 유지.
}

interface SchoolEvent {
  date: string;     // "2026-03-03" (YYYY-MM-DD)
  title: string;    // "시업식(08:50, 학교방송)"
  type: 'school' | 'holiday' | 'exam' | 'vacation';
  dday?: boolean;   // true이면 D-Day 카운트다운 표시
}
```

### 4.6 namu-events.json

나무학교 일정. 스키마 동일, type은 항상 `'namu'`.

```typescript
interface NamuEventsData {
  events: SchoolEvent[];  // type: 'namu'
}
```

### 4.7 memos.json

포스트잇 메모.

```typescript
interface MemosData {
  memos: Memo[];
}

interface Memo {
  id: string;       // 유니크 ID (Date.now().toString())
  text: string;     // 메모 내용 (여러 줄 가능)
  color: 'yellow' | 'pink' | 'green' | 'blue';
  x: number;        // 캔버스 내 X 좌표 (px)
  y: number;        // 캔버스 내 Y 좌표 (px)
}
```

### 4.8 todos.json

투두리스트.

```typescript
interface TodosData {
  todos: Todo[];
}

interface Todo {
  id: string;       // 유니크 ID (Date.now().toString())
  text: string;     // 할 일 내용
  done: boolean;    // 완료 여부
  date: string;     // "2026-03-03" (YYYY-MM-DD). 해당 날짜의 할 일.
}
```

### 4.9 messages.json

오늘의 메시지.

```typescript
interface MessageData {
  message: string;  // 현재 표시 중인 메시지
}
```

### 4.10 student-records.json

담임 메모장 — 학생별 출결/상담/생활 기록.

```typescript
interface StudentRecordsData {
  // 기록 카테고리 정의
  categories: {
    attendance: Array<{ id: string; name: string; color: string }>;
    // 기본: 생리결석, 병결, 무단결석, 지각, 조퇴, 결과
    counseling: Array<{ id: string; name: string; color: string }>;
    // 기본: 학부모상담, 학생상담, 교우관계
    life: Array<{ id: string; name: string; color: string }>;
    // 기본: 보건, 생활지도, 학습, 칭찬
    etc: Array<{ id: string; name: string; color: string }>;
    // 기본: 진로, 가정연락, 기타
  };

  // 기록 목록
  records: StudentRecord[];
}

interface StudentRecord {
  id: string;                         // UUID
  date: string;                       // "2026-03-04" (기록 날짜)
  createdAt: string;                  // ISO timestamp (실제 입력 시간)
  studentIds: number[];               // 학생 학번 배열 (다중 선택 가능)
  className: string;                  // "1학년 2반" (어느 반 학생인지)
  categoryGroup: 'attendance' | 'counseling' | 'life' | 'etc';
  categoryId: string;                 // 카테고리 ID
  memo?: string;                      // 추가 메모 (선택)
}
```

**좌석배치 연동:**
- `seating.json`의 학생(Student) 데이터를 참조
- 학번(id)과 이름(name)은 seating에서 가져옴
- 수업 반 관리: 설정에서 담당 학급 목록을 추가 (예: 담임 1-2, 수업 1-1, 1-3, 1-4, 1-5)

**수업 반 설정 (settings.json 확장):**
```typescript
// Settings에 추가
classes: Array<{
  id: string;                         // UUID
  name: string;                       // "1학년 1반"
  type: 'homeroom' | 'subject';       // 담임반 / 수업반
  students: Student[];                // 해당 반 학생 목록
}>;
```

### 4.11 .ssampin 공유 파일 스키마

일정 공유용 파일 포맷. 확장자 `.ssampin`, 내용은 JSON.

```typescript
interface SsampinShareFile {
  // 메타데이터
  meta: {
    version: 1;                       // 파일 포맷 버전
    type: 'events';                   // 공유 데이터 타입 (현재 events만)
    createdAt: string;                // ISO 날짜 "2026-03-01T09:00:00+09:00"
    createdBy: string;                // 작성자 이름 (예: "김준일")
    schoolName?: string;              // 학교명
    description?: string;             // 설명 (예: "나무학교 2026 연간 일정")
  };

  // 카테고리 정보 (일정에 포함된 카테고리만)
  categories: Array<{
    id: string;                       // 원본 카테고리 ID
    name: string;                     // "나무학교"
    color: string;                    // "#8b5cf6"
  }>;

  // 공유할 일정 목록
  events: Array<{
    date: string;                     // "2026-03-08"
    title: string;                    // "나무학교 워크숍"
    description?: string;
    time?: string;                    // "14:30"
    endTime?: string;
    location?: string;
    categoryId: string;               // 위 categories의 id 참조
    dday?: boolean;
    alerts?: Array<{
      type: 'minutes' | 'hours' | 'days';
      value: number;
    }>;
    recurrence?: {
      type: 'weekly' | 'monthly' | 'yearly';
      endDate?: string;
    };
  }>;
}
```

**파일 연결 (File Association):**
```yaml
# electron-builder.yml
fileAssociations:
  - ext: ssampin
    name: SsamPin Schedule
    description: 쌤핀 일정 공유 파일
    mimeType: application/x-ssampin
    role: Editor
```

**IPC 채널 추가:**
| 채널 | 방향 | 매개변수 | 반환값 | 용도 |
|------|------|---------|--------|------|
| `share:export` | Renderer → Main | `data: SsampinShareFile` | `string \| null` | .ssampin 파일 저장 |
| `share:import` | Renderer → Main | (없음) | `SsampinShareFile \| null` | .ssampin 파일 열기 |
| `share:openWith` | Main → Renderer | `filePath: string` | - | 파일 더블클릭 시 가져오기 |

### 데이터 크기 추정

| 파일 | 예상 크기 | 비고 |
|------|----------|------|
| settings.json | ~500B | 고정 |
| class-schedule.json | ~300B | 고정 |
| teacher-schedule.json | ~1KB | 고정 |
| seating.json | ~2KB | 6×6=36석 기준 |
| school-events.json | ~3KB | 연간 ~50개 이벤트 |
| namu-events.json | ~500B | 연간 ~10개 |
| memos.json | ~1KB | ~10개 메모 |
| todos.json | ~1KB | ~30개 할일 |
| messages.json | ~100B | 한 줄 |
| **합계** | **~10KB** | 매우 가벼움 |

---

## 5. Electron 아키텍처

### 5.1 프로세스 모델

```
┌─────────────────────────────────┐
│         메인 프로세스            │
│         (electron/main.ts)      │
│                                 │
│  ┌──────────┐  ┌─────────────┐  │
│  │ 파일 I/O │  │ 윈도우 관리  │  │
│  │ (JSON)   │  │ (BrowserWin) │  │
│  └────┬─────┘  └──────┬──────┘  │
│       │               │         │
│       └───── IPC ──────┘        │
│              │                  │
├──────────────┼──────────────────┤
│    preload   │  (contextBridge) │
├──────────────┼──────────────────┤
│              │                  │
│  ┌───────────▼────────────────┐ │
│  │     렌더러 프로세스         │ │
│  │     (React 앱)             │ │
│  │                            │ │
│  │  window.electronAPI.xxx()  │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
```

### 5.2 IPC 채널 정의

| 채널 | 방향 | 매개변수 | 반환값 | 용도 |
|------|------|---------|--------|------|
| `data:read` | Renderer → Main | `filename: string` | `any \| null` | JSON 파일 읽기 |
| `data:write` | Renderer → Main | `filename: string, data: any` | `boolean` | JSON 파일 쓰기 |
| `app:getPath` | Renderer → Main | (없음) | `string` | userData 경로 조회 |
| `window:setAlwaysOnTop` | Renderer → Main | `flag: boolean` | `boolean` | 항상 위 설정 |
| `shell:openExternal` | Renderer → Main | `url: string` | `boolean` | 외부 링크 열기 |
| `export:saveDialog` | Renderer → Main | `options: SaveDialogOptions` | `string \| null` | 파일 저장 대화상자 (v1.0) |
| `export:printToPDF` | Renderer → Main | `options: PrintToPDFOptions` | `Buffer` | PDF 생성 (v1.0) |

### 5.3 Preload 스크립트

`contextBridge.exposeInMainWorld('electronAPI', {...})` 패턴 사용.
렌더러에서는 `window.electronAPI?.xxx()` 형태로 접근.
Electron 미실행 시(브라우저 개발 모드) `window.electronAPI`가 `undefined` → localStorage 폴백.

### 5.4 보안 설정

```typescript
// main.ts BrowserWindow 옵션
{
  webPreferences: {
    contextIsolation: true,     // preload 격리
    nodeIntegration: false,     // 렌더러에서 Node 접근 차단
    sandbox: false,             // preload에서 Node API 필요
  }
}
```

---

## 6. UI/UX 설계

### 6.1 전체 레이아웃

```
┌──────┬──────────────────────────────┐
│      │                              │
│ 사이드│        메인 콘텐츠 영역        │
│  바  │                              │
│      │    (현재 선택된 페이지)         │
│ 📌   │                              │
│ 📅   │                              │
│ 💺   │                              │
│ 📋   │                              │
│ 📝   │                              │
│ ✅   │                              │
│ 📤   │                              │
│ ⚙️   │                              │
│      │                              │
│ v1.0 │                              │
└──────┴──────────────────────────────┘
```

- **사이드바**: 좁음(아이콘 80px) / 넓음(아이콘+텍스트 224px) 반응형
- **메인 콘텐츠**: 사이드바 오른쪽 전체 영역, 스크롤 가능

### 6.2 네비게이션

| 아이콘 | 라벨 | 페이지 ID | 설명 |
|--------|------|-----------|------|
| 🏠 | 대시보드 | `dashboard` | 메인 화면 (기본) |
| 📅 | 시간표 | `timetable` | 학급/교사 시간표 |
| 💺 | 좌석배치 | `seating` | 좌석 배치도 |
| 📋 | 일정 | `schedule` | 학교/나무학교 일정 |
| 👩‍🏫 | 담임메모 | `student-records` | 학생 출결/상담/생활 기록 |
| 📝 | 메모 | `memo` | 포스트잇 메모 |
| ✅ | 할일 | `todo` | 투두리스트 |
| 📤 | 내보내기 | `export` | HWPX/Excel/PDF |
| ⚙️ | 설정 | `settings` | 앱 설정 |

- SPA 방식. React 상태(`currentPage`)로 페이지 전환. React Router 없이도 가능(단순 switch).
- 현재 페이지: 사이드바에서 파란색 하이라이트 + 우측 테두리.

### 6.3 컴포넌트 트리

컴포넌트는 `adapters/components/`에 위치. Use Case는 Zustand 스토어(`adapters/stores/`)를 통해 호출.
**컴포넌트는 Domain/Use Case를 직접 import하지 않고, 반드시 스토어를 통해 접근한다.**

```
App (DI 초기화)
├── Sidebar (currentPage, onNavigate)
├── [현재 페이지에 따라 렌더링]
│   ├── Dashboard
│   │   ├── Clock
│   │   ├── WeatherBar
│   │   ├── MessageBanner
│   │   ├── DashboardDDay
│   │   ├── DashboardTimetable
│   │   ├── DashboardEvents
│   │   └── DashboardTodo
│   ├── Timetable
│   │   └── TimetableEditor (편집 모드 시)
│   ├── Seating
│   ├── Schedule
│   ├── StudentRecords
│   │   ├── RecordInput (학생 선택 + 카테고리 + 메모)
│   │   └── RecordTimeline (학생별 기록 타임라인)
│   ├── Memo
│   │   └── MemoCard (×N, 각 메모별)
│   ├── Todo
│   ├── Export
│   └── Settings
└── EventPopup (모달, 조건부 렌더링)
```

**데이터 흐름 (단방향):**
```
사용자 액션 → Component → Zustand Store → Use Case → Domain Rules/Repository → Store 상태 업데이트 → Component 리렌더
```

### 6.4 색상 체계

Tailwind custom color tokens (`sp-*`):

```javascript
sp: {
  bg:        '#0a0e17',   // 앱 배경 (짙은 네이비)
  surface:   '#131a2b',   // 사이드바, 입력 필드 배경
  card:      '#1a2332',   // 카드/컨테이너 배경
  border:    '#2a3548',   // 테두리
  accent:    '#3b82f6',   // 주요 액센트 (파란색)
  highlight: '#f59e0b',   // 현재 교시 하이라이트 (노란색)
  green:     '#22c55e',   // 완료/성공
  text:      '#e2e8f0',   // 기본 텍스트
  muted:     '#94a3b8',   // 보조 텍스트
}
```

포스트잇 색상:
```javascript
memo: {
  yellow: '#fef08a',
  pink:   '#fda4af',
  green:  '#86efac',
  blue:   '#93c5fd',
}
```

과목별 색상 (Tailwind 클래스):
| 과목 | 배경 | 텍스트 |
|------|------|--------|
| 국어 | `yellow-500/20` | `yellow-300` |
| 영어 | `green-500/20` | `green-300` |
| 수학 | `blue-500/20` | `blue-300` |
| 과학 | `purple-500/20` | `purple-300` |
| 사회 | `orange-500/20` | `orange-300` |
| 체육 | `red-500/20` | `red-300` |
| 음악 | `pink-500/20` | `pink-300` |
| 미술 | `indigo-500/20` | `indigo-300` |
| 창체 | `teal-500/20` | `teal-300` |

### 6.5 타이포그래피

- **시계 (대시보드)**: `text-5xl` ~ `text-7xl`, `font-bold`, 흰색
- **제목 (페이지)**: `text-2xl`, `font-bold`
- **카드 제목**: `text-lg`, `font-semibold`
- **본문**: `text-sm` ~ `text-base`
- **보조**: `text-xs` ~ `text-sm`, `text-sp-muted`
- **폰트**: Noto Sans KR (Google Fonts CDN)

### 6.6 반응형 전략

- **최소 해상도**: 1024×700px
- **최적 해상도**: 1920×1080px (풀HD, 학교 프로젝터 기본)
- 사이드바: `lg` 이상에서 텍스트 라벨 표시, 그 이하에서 아이콘만
- 대시보드: `lg` 이상에서 시간표+일정 2열, 그 이하에서 1열 스택
- CSS Grid / Flexbox 기반, Tailwind 반응형 프리픽스 활용 (`md:`, `lg:`)

---

## 7. 내보내기 기능 구현 방식

### 7.1 HWPX (한글 파일)

**라이브러리:** `@ubermensch1218/hwpxcore`

**구현 방식:**
1. hwpxcore로 빈 HWPX 문서 생성
2. 테이블 요소 추가 (시간표/좌석배치에 적합)
3. 셀별 텍스트, 배경색, 테두리 설정
4. Buffer로 출력 → 파일 저장

**시간표 내보내기 예시 구조:**
```
[제목] 한국중학교 2학년 3반 시간표

┌────┬────┬────┬────┬────┬────┐
│교시│ 월 │ 화 │ 수 │ 목 │ 금 │
├────┼────┼────┼────┼────┼────┤
│ 1  │국어│과학│국어│국어│미술│
│ 2  │영어│음악│사회│국어│미술│
│...                          │
└────┴────┴────┴────┴────┴────┘

[교시 시간]
1교시 08:50~09:30  2교시 09:40~10:20 ...
```

**좌석배치 내보내기 예시 구조:**
```
[제목] 2학년 3반 좌석 배치도

         [ 교 탁 ]

┌────┬────┬────┬────┬────┬────┐
│1번 │2번 │3번 │4번 │5번 │6번 │
│김민준│이서윤│박지호│최수아│정예준│강하은│
├────┼────┼────┼────┼────┼────┤
│...                          │
└────┴────┴────┴────┴────┴────┘

총 28명 / 36석
```

### 7.2 Excel (.xlsx)

**라이브러리:** `exceljs`

**구현 방식:**
1. 새 Workbook 생성
2. Worksheet 추가 (시트명: "시간표", "좌석배치", "일정" 등)
3. 셀에 데이터 입력 + 스타일 적용 (배경색, 정렬, 테두리, 폰트)
4. `workbook.xlsx.writeBuffer()` → 파일 저장

**스타일 규칙:**
- 헤더 행: 굵은 폰트, 회색 배경
- 과목 셀: 과목별 연한 배경색
- 테두리: 얇은 실선
- 열 너비: 자동 조정 (10~15 기준)

### 7.3 PDF

**방식:** Electron의 `BrowserWindow.webContents.printToPDF()`

**구현 방식:**
1. 숨겨진 BrowserWindow 생성 (또는 현재 창 사용)
2. 내보내기 대상 컴포넌트를 렌더링
3. `printToPDF({ printBackground: true, landscape: true })` 호출
4. 반환된 Buffer를 파일로 저장

**고려사항:**
- 다크 테마 → PDF는 밝은 배경 필요. CSS `@media print` 또는 별도 라이트 테마 적용.
- 또는 다크 테마 그대로 PDF화 (`printBackground: true`).

---

## 8. 날씨 API 연동 방식

### 8.1 API 선택지

| API | 비용 | 미세먼지 | 한국 특화 | 비고 |
|-----|------|---------|----------|------|
| 기상청 공공데이터 (data.go.kr) | 무료 | 에어코리아 연동 필요 | ★★★ | 인증키 발급 필요, XML 응답 |
| OpenWeatherMap | 무료(1000회/일) | 별도 Air Pollution API | ★☆☆ | JSON, 간단한 연동 |
| 한국환경공단 에어코리아 | 무료 | ★★★ | ★★★ | 미세먼지 전용 |

**추천 조합:** OpenWeatherMap (날씨) + 에어코리아 (미세먼지)
- MVP 단계: OpenWeatherMap만 사용 (미세먼지는 placeholder)
- v1.0: 에어코리아 추가 연동

### 8.2 데이터 흐름

```
[앱 시작] → 날씨 API 호출 → 상태 저장 → UI 표시
                                ↑
              [30분마다 재호출] ──┘
```

### 8.3 표시 항목

- 날씨 아이콘 (맑음/흐림/비/눈 등)
- 최저·최고 기온 (°C)
- 습도 (%)
- 미세먼지 (PM10) 수치 + 등급 (좋음/보통/나쁨/매우나쁨)
- 초미세먼지 (PM2.5) 수치 + 등급

### 8.4 오프라인 처리

- 네트워크 실패 시 마지막 캐시 데이터 표시 + "업데이트 실패" 표시
- 캐시도 없으면 "날씨 정보 없음" placeholder
- 날씨는 부가 기능. 실패해도 앱 동작에 영향 없음.

### 8.5 위치 설정

- 기본값: 서울 (37.5665, 126.9780)
- 설정에서 위도/경도 직접 입력 또는 도시명 선택 (v1.0)
- 학교 주소 기반 자동 설정 (v2.0)

---

## 9. 자동 업데이트 구현

### 9.1 electron-updater 설정

**패키지:** `electron-updater`
**소스:** GitHub Releases

```yaml
# electron-builder.yml
publish:
  provider: github
  owner: [GitHub 사용자/조직]
  repo: ssampin
```

### 9.2 업데이트 플로우

```
[앱 시작]
    │
    ▼
[autoUpdater.checkForUpdates()]
    │
    ├── 업데이트 없음 → 무시
    │
    └── 업데이트 있음
         │
         ▼
    [update-available 이벤트]
         │
         ▼
    [렌더러에 알림: "새 버전 X.Y.Z 사용 가능"]
         │
         ├── 사용자 "나중에" → 무시 (다음 시작 시 다시 확인)
         │
         └── 사용자 "업데이트" → autoUpdater.downloadUpdate()
              │
              ▼
         [백그라운드 다운로드]
              │
              ▼
         [update-downloaded 이벤트]
              │
              ▼
         [렌더러에 알림: "재시작하면 업데이트 적용"]
              │
              └── 사용자 "재시작" → autoUpdater.quitAndInstall()
```

### 9.3 릴리즈 프로세스

1. `package.json` 버전 업 (예: 1.0.0 → 1.1.0)
2. `npm run electron:build` → `release/` 폴더에 인스톨러 생성
3. GitHub Release 생성 + 인스톨러 파일 첨부
4. electron-updater가 자동으로 latest release 감지

---

## 10. 빌드/배포 파이프라인

### 10.1 개발 모드

```bash
npm run dev            # Vite 개발 서버 (http://localhost:5173)
                       # 브라우저에서 바로 UI 개발 가능
                       # Electron 없이 localStorage로 데이터 관리

npm run electron:dev   # Vite 서버 + Electron 동시 실행
                       # concurrently + wait-on 사용
```

### 10.2 빌드 프로세스

```bash
npm run electron:build
```

내부 동작:
```
1. tsc                          # React 앱 타입 체크
2. vite build                   # React 앱 → dist/
3. tsc -p tsconfig.electron.json # Electron 메인 → dist-electron/
4. electron-builder              # dist/ + dist-electron/ → release/*.exe
```

### 10.3 출력물

```
release/
├── 쌤핀-1.0.0-Setup.exe        # NSIS 인스톨러 (~80MB)
├── 쌤핀-1.0.0-Setup.exe.blockmap
├── latest.yml                  # electron-updater 메타데이터
└── builder-effective-config.yaml
```

### 10.4 electron-builder 설정 상세

```yaml
appId: com.ssampin.app
productName: 쌤핀

directories:
  buildResources: build       # 아이콘 등 리소스
  output: release

files:
  - dist                       # Vite 빌드 출력
  - dist-electron              # Electron 컴파일 출력

win:
  target:
    - target: nsis
      arch:
        - x64
  artifactName: ${productName}-${version}-Setup.${ext}

nsis:
  oneClick: false              # 설치 마법사 표시
  perMachine: false            # 사용자별 설치
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false  # 삭제 시 데이터 유지

publish:
  provider: github
  owner: [owner]
  repo: ssampin
```

---

## 11. 보안 고려사항

### 11.1 데이터 보안

| 항목 | 위험 수준 | 대응 |
|------|----------|------|
| 학생 이름/학번 (좌석배치) | 중 | 로컬 저장만. 네트워크 전송 없음. |
| 학교 일정 | 낮음 | 공개 정보 수준. |
| 교사 개인 메모 | 낮음~중 | 로컬 저장. OS 파일 권한에 의존. |
| API 키 (날씨) | 낮음 | 무료 API. 노출되어도 피해 제한적. |

**원칙:**
- 모든 데이터는 로컬(`userData`) 저장. 서버 전송 없음.
- 날씨 API 외 외부 네트워크 접근 없음.
- 자동 업데이트 서버(GitHub)와만 HTTPS 통신.

### 11.2 Electron 보안

- `contextIsolation: true` — 렌더러/메인 프로세스 격리
- `nodeIntegration: false` — 렌더러에서 Node.js 직접 접근 차단
- IPC `handle/invoke` 패턴 사용 (양방향 `send/on` 대비 안전)
- 렌더러는 preload에서 노출한 API만 사용 가능

### 11.3 업데이트 보안

- electron-updater는 코드 서명 검증 지원
- 초기 버전은 코드 서명 없이 배포 (개인 프로젝트)
- Windows SmartScreen 경고 발생 가능 → README에 안내

### 11.4 파일 시스템

- 앱은 `app.getPath('userData')` 내에서만 파일 읽기/쓰기
- 내보내기 시 `dialog.showSaveDialog()`로 사용자가 명시적 경로 선택
- 임의 경로 접근 불가 (IPC 핸들러에서 경로 검증)

---

## 12. 데이터 저장소 추상화 (클린 아키텍처 적용)

### 12.1 설계 원칙 — 의존성 역전 (DIP)

데이터 저장소는 **포트-어댑터 패턴**으로 추상화한다.
Domain 레이어가 저장소 인터페이스(포트)를 정의하고, Infrastructure 레이어가 구현(어댑터)을 제공한다.

```
┌─ domain/ports/ ─────────────────┐
│  IStoragePort (인터페이스)        │  ← 핵심: 구현 방법을 모름
└─────────────┬───────────────────┘
              │ implements
              ▼
┌─ infrastructure/storage/ ───────┐
│  ElectronStorageAdapter          │  ← Electron IPC → JSON 파일
│  LocalStorageAdapter             │  ← 브라우저 localStorage (개발용 폴백)
└─────────────────────────────────┘
```

```typescript
// domain/ports/IStoragePort.ts — 저장소 포트 (Domain 레이어에 위치)
export interface IStoragePort {
  read<T>(filename: string): Promise<T | null>;
  write<T>(filename: string, data: T): Promise<void>;
}
```

```typescript
// infrastructure/storage/ElectronStorageAdapter.ts — Electron 구현
import { IStoragePort } from '../../domain/ports/IStoragePort';

export class ElectronStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    return window.electronAPI.readData(filename);
  }
  async write<T>(filename: string, data: T): Promise<void> {
    await window.electronAPI.writeData(filename, data);
  }
}

// infrastructure/storage/LocalStorageAdapter.ts — 브라우저 폴백
import { IStoragePort } from '../../domain/ports/IStoragePort';

export class LocalStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    const stored = localStorage.getItem(`ssampin:${filename}`);
    return stored ? JSON.parse(stored) : null;
  }
  async write<T>(filename: string, data: T): Promise<void> {
    localStorage.setItem(`ssampin:${filename}`, JSON.stringify(data));
  }
}
```

### 12.2 DI 컨테이너에서 환경별 주입

```typescript
// adapters/di/container.ts
import { IStoragePort } from '../../domain/ports/IStoragePort';
import { ElectronStorageAdapter } from '../../infrastructure/storage/ElectronStorageAdapter';
import { LocalStorageAdapter } from '../../infrastructure/storage/LocalStorageAdapter';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

const storage: IStoragePort = isElectron
  ? new ElectronStorageAdapter()
  : new LocalStorageAdapter();

export const container = {
  storage,
  scheduleRepo: new JsonScheduleRepository(storage),
  seatingRepo: new JsonSeatingRepository(storage),
  eventsRepo: new JsonEventsRepository(storage),
  // ... 나머지 Repository
};
```

### 12.3 초기 데이터

첫 실행 시(파일 미존재) 기본 샘플 데이터를 자동 생성.
- 기본 학교 정보, 교시 시간, 빈 시간표, 샘플 일정
- 사용자가 즉시 "채워진" 화면을 볼 수 있도록
- 초기 데이터 생성 로직은 **Use Case** 레이어에 위치 (`usecases/InitializeDefaultData.ts`)

### 12.4 향후 저장소 교체 시나리오

DIP 덕분에 저장소 구현체만 교체하면 다른 저장소로 마이그레이션 가능:

| 교체 시나리오 | 변경 범위 | Domain/UseCase 변경 |
|-------------|----------|-------------------|
| JSON → SQLite | `infrastructure/storage/` + DI 바인딩 | ❌ 불필요 |
| JSON → IndexedDB | `infrastructure/storage/` + DI 바인딩 | ❌ 불필요 |
| localStorage → 클라우드 | `infrastructure/storage/` + DI 바인딩 | ❌ 불필요 |

---

## 13. 현재 교시 판정 로직

시간표 하이라이트의 핵심 로직.
이 로직은 **Domain 레이어**(`domain/rules/periodRules.ts`)에 순수 함수로 구현.
React, Zustand 등 어떤 프레임워크에도 의존하지 않음.

```typescript
// domain/rules/periodRules.ts — 순수 TypeScript 함수
import { PeriodTime } from '../valueObjects/PeriodTime';

export function getCurrentPeriod(periodTimes: PeriodTime[], now: Date): number | null {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const pt of periodTimes) {
    const start = parseMinutes(pt.start);  // "08:50" → 530
    const end = parseMinutes(pt.end);      // "09:30" → 570

    if (currentMinutes >= start && currentMinutes < end) {
      return pt.period;  // 해당 교시 반환
    }
  }
  return null;  // 수업 시간 아님 (쉬는 시간, 점심, 방과후)
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
```

**동작 규칙:**
- 8:50~9:29 → 1교시
- 9:30~9:39 → null (쉬는시간)
- 9:40~10:19 → 2교시
- 12:00~12:49 → null (점심시간)
- 토/일 → getDayOfWeek() 반환 null → 하이라이트 없음

**Use Case에서 활용:**
```typescript
// usecases/schedule/GetCurrentPeriod.ts
import { getCurrentPeriod } from '../../domain/rules/periodRules';
import { ISettingsRepository } from '../../domain/repositories/ISettingsRepository';

export class GetCurrentPeriodUseCase {
  constructor(private settingsRepo: ISettingsRepository) {}

  async execute(now: Date): Promise<number | null> {
    const settings = await this.settingsRepo.getSettings();
    if (!settings) return null;
    // 주말 체크
    const day = now.getDay();
    if (day === 0 || day === 6) return null;
    return getCurrentPeriod(settings.periodTimes, now);
  }
}
```

---

## 부록 A: npm 스크립트 정리

```json
{
  "dev": "vite",
  "build": "tsc && vite build && tsc -p tsconfig.electron.json",
  "electron:dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
  "electron:build": "npm run build && electron-builder"
}
```

| 명령어 | 용도 |
|--------|------|
| `npm run dev` | 브라우저 개발 모드 (Electron 없이 UI 개발) |
| `npm run electron:dev` | Electron 개발 모드 (풀 앱) |
| `npm run build` | 프로덕션 빌드 (dist/ + dist-electron/) |
| `npm run electron:build` | 빌드 + 인스톨러 생성 (release/) |

---

## 부록 B: 의존성 전체 목록

### dependencies (프로덕션)
| 패키지 | 용도 |
|--------|------|
| react, react-dom | UI 프레임워크 |
| zustand | 상태 관리 |
| date-fns | 날짜 유틸리티 |
| exceljs | Excel 내보내기 |
| electron-updater | 자동 업데이트 |

### devDependencies (개발)
| 패키지 | 용도 |
|--------|------|
| electron | 데스크톱 앱 런타임 |
| electron-builder | 인스톨러 빌드 |
| typescript | 타입 체크 |
| vite | 번들러 |
| @vitejs/plugin-react | Vite React 지원 |
| tailwindcss, postcss, autoprefixer | CSS |
| concurrently | 개발 서버 동시 실행 |
| wait-on | Vite 서버 대기 후 Electron 실행 |
| @types/react, @types/react-dom | React 타입 |