# 쌤핀 모바일 PWA — Claude Code 구현 프롬프트

> **Version:** 2.0  
> **Date:** 2025-07-14  
> **Status:** Draft  
> **관련 문서:** [PRD](./ssampin-mobile-prd-v2.md) · [SPEC](./ssampin-mobile-spec-v2.md)

---

## 사전 조건

- 레포: `https://github.com/pblsketch/ssampin.git`
- 현재 버전: v0.4.8
- 기존 브랜치: `main`
- Node.js: 22+, npm

---

## Phase 1: 프로젝트 세팅

### 목표
`feature/mobile` 브랜치를 생성하고, 모바일 PWA용 Vite 설정 + 디렉토리 구조 + HTML 엔트리를 만든다.

### 프롬프트

```
쌤핀 데스크톱 앱(Electron + Vite + React + TypeScript + Tailwind)을 기반으로
모바일 PWA 버전을 만들기 위한 프로젝트 세팅을 해주세요.

## 작업 1: 브랜치 생성
git checkout -b feature/mobile

## 작업 2: 의존성 추가
npm install idb
npm install -D vite-plugin-pwa workbox-precaching workbox-routing

## 작업 3: 모바일 Vite 설정 파일 생성
파일: vite.mobile.config.ts

기존 vite.config.ts를 참조하되:
- entry: mobile.html → src/mobile/main.tsx
- outDir: dist-mobile
- VitePWA 플러그인 추가
- resolve.alias는 기존과 동일 (@domain, @usecases, @infrastructure, @adapters)
- @mobile 별칭 추가 → src/mobile
- rollupOptions.external에 electron 관련 패키지 제외
- define에서 process.env 대신 import.meta.env 사용

기존 vite.config.ts의 alias 설정:
- '@domain': 'src/domain'
- '@usecases': 'src/usecases'  
- '@infrastructure': 'src/infrastructure'
- '@adapters': 'src/adapters'

## 작업 4: 모바일 HTML 엔트리
파일: mobile.html

<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#3B82F6" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="icon" href="/icons/icon-192.png" />
  <link rel="apple-touch-icon" href="/icons/icon-192.png" />
  <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />
  <title>쌤핀 모바일</title>
</head>
<body class="bg-slate-950 text-slate-100">
  <div id="root"></div>
  <script type="module" src="/src/mobile/main.tsx"></script>
</body>
</html>

## 작업 5: 디렉토리 구조 생성
mkdir -p src/mobile/{di,stores,components/{Layout,Onboarding,Today,Attendance,Schedule,Students,Todo,More},hooks,styles}

## 작업 6: 모바일 엔트리 파일
파일: src/mobile/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../index.css'; // 기존 Tailwind CSS
import './styles/mobile.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

## 작업 7: 모바일 App 스캐폴드
파일: src/mobile/App.tsx

탭 타입 정의:
type MobileTab = 'today' | 'schedule' | 'students' | 'todo' | 'more';

하단 탭바 고정, 각 탭 컴포넌트를 조건부 렌더링.
탭 설정:
- today: 오늘 (icon: today)
- schedule: 일정 (icon: event_note)  
- students: 학생 (icon: people)
- todo: 할 일 (icon: check_circle)
- more: 더보기 (icon: more_horiz)

## 작업 8: 모바일 CSS
파일: src/mobile/styles/mobile.css

:root {
  --tab-bar-height: calc(56px + env(safe-area-inset-bottom));
  --header-height: calc(48px + env(safe-area-inset-top));
}

.tab-content {
  height: calc(100dvh - var(--tab-bar-height) - var(--header-height));
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.tab-bar {
  height: var(--tab-bar-height);
  padding-bottom: env(safe-area-inset-bottom);
}

## 작업 9: package.json 스크립트 추가
"dev:mobile": "vite --config vite.mobile.config.ts --port 5174",
"build:mobile": "vite build --config vite.mobile.config.ts",
"preview:mobile": "vite preview --config vite.mobile.config.ts"

## 체크리스트
- [ ] feature/mobile 브랜치 생성
- [ ] idb, vite-plugin-pwa, workbox 설치
- [ ] vite.mobile.config.ts 생성 (VitePWA 포함)
- [ ] mobile.html 생성
- [ ] src/mobile/ 디렉토리 구조 생성
- [ ] src/mobile/main.tsx 생성
- [ ] src/mobile/App.tsx 생성 (탭바 레이아웃)
- [ ] src/mobile/styles/mobile.css 생성
- [ ] package.json에 mobile 스크립트 추가
- [ ] npm run dev:mobile 로 빈 탭바 화면 표시 확인
```

---

## Phase 2: 저장소 추상화

### 목표
`IndexedDBStorageAdapter`를 구현하고, 모바일 DI 컨테이너에서 주입한다.

### 참조할 기존 코드

**IStoragePort (src/domain/ports/IStoragePort.ts):**
```typescript
export interface IStoragePort {
  read<T>(filename: string): Promise<T | null>;
  write<T>(filename: string, data: T): Promise<void>;
}
```

**ElectronStorageAdapter (src/infrastructure/storage/ElectronStorageAdapter.ts):**
```typescript
export class ElectronStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    const api = window.electronAPI;
    if (!api) return null;
    try {
      const raw = await api.readData(filename);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch { return null; }
  }
  async write<T>(filename: string, data: T): Promise<void> {
    const api = window.electronAPI;
    if (!api) return;
    await api.writeData(filename, JSON.stringify(data, null, 2));
  }
}
```

**LocalStorageAdapter (src/infrastructure/storage/LocalStorageAdapter.ts):**
```typescript
const PREFIX = 'ssampin:';
export class LocalStorageAdapter implements IStoragePort {
  async read<T>(filename: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(PREFIX + filename);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch { return null; }
  }
  async write<T>(filename: string, data: T): Promise<void> {
    localStorage.setItem(PREFIX + filename, JSON.stringify(data));
  }
}
```

**기존 DI 분기 (src/adapters/di/container.ts):**
```typescript
const isElectron = typeof window !== 'undefined' && window.electronAPI != null;
export const storage: IStoragePort = isElectron
  ? new ElectronStorageAdapter()
  : new LocalStorageAdapter();
```

### 프롬프트

```
쌤핀 모바일용 IndexedDB 저장소 어댑터와 DI 컨테이너를 구현해주세요.

## 작업 1: IndexedDBStorageAdapter 구현
파일: src/infrastructure/storage/IndexedDBStorageAdapter.ts

IStoragePort를 구현합니다.
idb 라이브러리를 사용합니다.

DB 설정:
- DB 이름: 'ssampin-mobile'
- 버전: 1
- Object Stores:
  1. 'ssampin-data' (keyPath: 'filename') — 앱 데이터
  2. 'ssampin-auth' (keyPath: 'key') — OAuth 토큰
  3. 'ssampin-sync' (keyPath: 'key') — 동기화 매니페스트

read<T>(filename):
- db.get('ssampin-data', filename) → record?.data as T
- 에러 시 null 반환

write<T>(filename, data):
- db.put('ssampin-data', { filename, data, updatedAt: new Date().toISOString() })

## 작업 2: 모바일 DI 컨테이너
파일: src/mobile/di/container.ts

데스크톱 container.ts (src/adapters/di/container.ts)를 참조하여 모바일 버전을 만듭니다.

핵심 차이:
1. storage = new IndexedDBStorageAdapter() (항상)
2. Electron 관련 import 제거
3. Supabase 관련 제거 (상담, 과제, 설문)
4. 위젯, 내보내기 관련 제거
5. Cloudflare 관련 제거

포함할 리포지토리 (기존 Json*Repository 재사용):
- settingsRepository = new JsonSettingsRepository(storage)
- scheduleRepository = new JsonScheduleRepository(storage)
- seatingRepository = new JsonSeatingRepository(storage)
- eventsRepository = new JsonEventsRepository(storage)
- memoRepository = new JsonMemoRepository(storage)
- todoRepository = new JsonTodoRepository(storage)
- studentRecordsRepository = new JsonStudentRecordsRepository(storage)
- studentRepository = new JsonStudentRepository(storage)
- teachingClassRepository = new JsonTeachingClassRepository(storage)
- bookmarkRepository = new JsonBookmarkRepository(storage)
- ddayRepository = new JsonDDayRepository(storage)
- driveSyncRepository = new JsonDriveSyncRepository(storage)

포함할 포트:
- neisPort = new NeisApiClient()
- getDriveSyncAdapter(getAccessToken) → new DriveSyncAdapter(getAccessToken)

## 작업 3: storage/index.ts 업데이트
파일: src/infrastructure/storage/index.ts

IndexedDBStorageAdapter 재export 추가.

## 체크리스트
- [ ] IndexedDBStorageAdapter 구현 (read/write)
- [ ] 모바일 DI 컨테이너 구현
- [ ] 기존 Json*Repository 재사용 확인
- [ ] dev:mobile에서 IndexedDB 데이터 저장/읽기 테스트
```

---

## Phase 3: Google OAuth 브라우저 버전

### 목표
PKCE 기반 브라우저 OAuth를 구현하여 Google 로그인을 지원한다.

### 참조할 기존 코드

**IGoogleAuthPort (src/domain/ports/IGoogleAuthPort.ts):**
```typescript
export interface GoogleAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly email: string;
  readonly grantedScopes?: readonly string[];
}

export interface IGoogleAuthPort {
  getAuthUrl(redirectUri: string, codeChallenge?: string): string;
  exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<GoogleAuthTokens>;
  refreshTokens(refreshToken: string): Promise<GoogleAuthTokens>;
  revokeTokens(accessToken: string): Promise<void>;
  getRequiredScopes(): readonly string[];
}
```

**기존 GoogleOAuthClient (src/infrastructure/google/GoogleOAuthClient.ts):**
- SCOPES: calendar, drive.file, userinfo.email
- constructor에서 process.env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 사용
- getAuthUrl에서 PKCE code_challenge 지원
- exchangeCode에서 client_secret 포함

### 프롬프트

```
쌤핀 모바일용 Google OAuth 브라우저 클라이언트를 구현해주세요.

## 작업 1: GoogleOAuthBrowserClient
파일: src/infrastructure/google/GoogleOAuthBrowserClient.ts

기존 GoogleOAuthClient를 참조하되 브라우저 환경에 맞게 변경:

1. client_secret 불필요 (PKCE Public Client)
2. clientId는 import.meta.env.VITE_GOOGLE_CLIENT_ID 사용
3. SCOPES는 기존과 동일:
   - 'https://www.googleapis.com/auth/calendar'
   - 'https://www.googleapis.com/auth/drive.file'
   - 'https://www.googleapis.com/auth/userinfo.email'

4. getAuthUrl: 기존 로직 + PKCE code_challenge 필수
5. exchangeCode: client_secret 빼고, code_verifier 필수
6. refreshTokens: client_secret 없이 refresh
7. revokeTokens: 기존과 동일
8. fetchUserEmail: 기존과 동일 (accessToken으로 Google userinfo 호출)

## 작업 2: PKCE 유틸리티
파일: src/mobile/hooks/usePKCE.ts

PKCE code_verifier, code_challenge 생성 유틸:

function generateCodeVerifier(): string
  → crypto.getRandomValues로 43~128자 랜덤 문자열

async function generateCodeChallenge(verifier: string): Promise<string>
  → SHA-256 → base64url 인코딩

## 작업 3: 인증 훅
파일: src/mobile/hooks/useGoogleAuth.ts

상태:
- isAuthenticated: boolean
- email: string | null
- isLoading: boolean

함수:
- startLogin(): 
  1. generateCodeVerifier/Challenge
  2. sessionStorage에 verifier 저장
  3. window.location.href = googleAuthPort.getAuthUrl(redirectUri, challenge)

- handleCallback(code: string):
  1. sessionStorage에서 verifier 읽기
  2. exchangeCode(code, redirectUri, verifier)
  3. 토큰 → IndexedDB ssampin-auth 스토어에 저장
  4. sessionStorage에서 verifier 삭제
  5. 상태 업데이트

- getValidAccessToken():
  1. 메모리의 accessToken 확인
  2. 만료 임박 시 refreshTokens() 호출
  3. 갱신된 토큰 반환

- logout():
  1. revokeTokens()
  2. IndexedDB에서 토큰 삭제
  3. 상태 초기화

## 작업 4: OAuth 콜백 라우트 처리
파일: src/mobile/App.tsx 수정

URL이 /auth/callback?code=xxx 이면:
- handleCallback(code) 호출
- 완료 후 "/" 로 리다이렉트

## 작업 5: 모바일 DI 컨테이너 업데이트
파일: src/mobile/di/container.ts 수정

- googleAuthPort = new GoogleOAuthBrowserClient()

## 체크리스트
- [ ] GoogleOAuthBrowserClient 구현 (PKCE, client_secret 없음)
- [ ] PKCE 유틸리티 구현
- [ ] useGoogleAuth 훅 구현
- [ ] OAuth 콜백 라우트 처리
- [ ] DI 컨테이너에 googleAuthPort 등록
- [ ] Google Cloud Console에 웹 OAuth 클라이언트 + 리다이렉트 URI 등록
- [ ] 브라우저에서 Google 로그인 → 토큰 획득 테스트
```

---

## Phase 4: Google Drive 동기화 이식

### 목표
데스크톱의 Drive 동기화 로직을 모바일에서 동작하게 한다.

### 참조할 기존 코드

**SyncToCloud (src/usecases/sync/SyncToCloud.ts):**
```typescript
export const SYNC_FILES = [
  'settings', 'class-schedule', 'teacher-schedule', 'students',
  'seating', 'events', 'memos', 'todos', 'student-records',
  'bookmarks', 'surveys', 'seat-constraints', 'teaching-classes', 'dday',
  'curriculum-progress', 'attendance', 'consultations',
] as const;
```
- `IStoragePort` + `IDriveSyncPort` + `IDriveSyncRepository` 의존
- SHA-256 체크섬으로 변경 감지
- 변경분만 업로드

**DriveSyncAdapter (src/infrastructure/google/DriveSyncAdapter.ts):**
- `fetch` API만 사용 → 브라우저 호환 ✅
- `getOrCreateSyncFolder()` → "쌤핀 동기화" 폴더 생성/조회
- `uploadSyncFile()` → 멀티파트 업로드
- `downloadSyncFile()` → alt=media 다운로드

**useDriveSyncStore (src/adapters/stores/useDriveSyncStore.ts):**
- syncToCloud/syncFromCloud/resolveConflict/deleteCloudData
- 디바운스 5초 → triggerSaveSync

### 프롬프트

```
쌤핀 모바일에서 Google Drive 동기화를 활성화해주세요.

핵심: 기존 domain/usecases/sync의 SyncToCloud, SyncFromCloud, ResolveSyncConflict
UseCase는 코드 변경 없이 그대로 사용합니다.
기존 DriveSyncAdapter도 fetch API만 사용하므로 코드 변경 없이 사용합니다.

## 작업 1: 모바일 Drive 동기화 스토어
파일: src/mobile/stores/useMobileDriveSyncStore.ts

기존 useDriveSyncStore (src/adapters/stores/useDriveSyncStore.ts)를 참조하되:
1. import 경로를 모바일 DI 컨테이너로 변경
   - '@adapters/di/container' → '@mobile/di/container'
2. useGoogleAuth에서 getValidAccessToken 가져오기
3. 나머지 로직은 동일

상태: status, lastSyncedAt, conflicts, error, progress
액션: syncToCloud, syncFromCloud, resolveConflict, deleteCloudData, triggerSaveSync

## 작업 2: 자동 동기화 트리거
파일: src/mobile/hooks/useSyncTrigger.ts

1. visibilitychange 이벤트 → 포그라운드 복귀 시 syncFromCloud
2. online 이벤트 → 네트워크 복귀 시 syncToCloud (대기 중 변경사항 있으면)
3. 앱 시작 시 → syncFromCloud (최신 데이터 가져오기)

## 작업 3: 동기화 상태 UI
파일: src/mobile/components/More/SyncStatus.tsx

- 마지막 동기화 시각 표시
- 동기화 진행 중: 프로그레스 바
- 에러: 에러 메시지 + 재시도 버튼
- 충돌: 충돌 파일 목록 + 로컬/리모트 선택 버튼
- [수동 동기화] 버튼

## 작업 4: 데이터 변경 시 동기화 연동
각 스토어의 write 후 triggerSaveSync 호출:
- useSettingsStore.update → triggerSaveSync
- useTodoStore의 toggle/add → triggerSaveSync  
- useMemoStore의 save → triggerSaveSync
- useAttendanceStore의 save → triggerSaveSync

## 체크리스트
- [ ] 모바일 Drive 동기화 스토어 구현
- [ ] 자동 동기화 트리거 구현
- [ ] SyncStatus UI 구현
- [ ] 데이터 변경 시 동기화 연동
- [ ] 데스크톱 → Drive → 모바일 동기화 테스트
- [ ] 모바일 → Drive → 데스크톱 동기화 테스트
- [ ] 충돌 해결 테스트
```

---

## Phase 5: 모바일 UI — "오늘" 허브

### 목표
모바일 메인 화면인 "오늘" 허브를 구현한다.

### 참조할 기존 코드

**Settings.teacherRoles:**
```typescript
readonly teacherRoles?: readonly ('homeroom' | 'subject' | 'admin')[];
```

**Settings.periodTimes:**
```typescript
readonly periodTimes: readonly PeriodTime[];
// PeriodTime = { period: number; start: string; end: string; }
```

**TeacherScheduleData (src/domain/entities/Timetable.ts):**
```typescript
export interface TeacherPeriod {
  readonly subject: string;
  readonly classroom: string;
}
export interface TeacherScheduleData {
  readonly [day: string]: readonly (TeacherPeriod | null)[];
}
```

**AttendanceRecord (src/domain/entities/Attendance.ts):**
```typescript
export type AttendanceStatus = 'present' | 'absent' | 'late';
export interface StudentAttendance {
  readonly number: number;
  readonly status: AttendanceStatus;
  readonly grade?: number;
  readonly classNum?: number;
}
export interface AttendanceRecord {
  readonly classId: string;
  readonly date: string;
  readonly period: number;
  readonly students: readonly StudentAttendance[];
}
```

**MealInfo (src/domain/entities/Meal.ts):**
```typescript
export interface MealDish {
  readonly name: string;
  readonly allergens: readonly number[];
}
export interface MealInfo {
  readonly date: string;
  readonly mealType: string;
  readonly dishes: readonly MealDish[];
  readonly calorie: string;
}
```

### 프롬프트

```
쌤핀 모바일의 "오늘" 허브 메인 화면을 구현해주세요.

## 작업 1: useCurrentPeriod 훅
파일: src/mobile/hooks/useCurrentPeriod.ts

Settings.periodTimes를 기반으로 현재 교시를 계산합니다.

반환값:
{
  currentPeriod: number | null,    // 현재 교시 (1~maxPeriods), null=수업시간 아님
  progress: number,                 // 0~100 (교시 진행률)
  remainingMinutes: number,         // 남은 분
  nextPeriod: number | null,       // 다음 교시
  isBreak: boolean,                 // 쉬는 시간 여부
  isAfterSchool: boolean,          // 방과 후 여부
  isBeforeSchool: boolean,         // 등교 전 여부
}

1초마다 갱신 (setInterval).
periodTimes에서 현재 시각이 어느 교시에 해당하는지 계산.
요일 변환: date-fns의 getDay() → ['일','월','화','수','목','금','토']

## 작업 2: TodayHub 컨테이너
파일: src/mobile/components/Today/TodayHub.tsx

세로 스크롤 카드 레이아웃:
1. 날짜 헤더 (오늘 날짜 + 요일)
2. CurrentClassCard
3. HomeroomAttendanceCard (teacherRoles에 'homeroom' 포함 시)
4. ClassAttendanceCard (현재 교시에 수업 있을 시)
5. MealCard

역할 기반 표시:
const roles = settings.teacherRoles ?? [];
const isHomeroom = roles.includes('homeroom');
const hasClass = currentPeriod !== null && todaySchedule[currentPeriod-1] !== null;

## 작업 3: CurrentClassCard
파일: src/mobile/components/Today/CurrentClassCard.tsx

현재 교시 정보를 크게 표시:
- 교시 번호 + 과목명
- 교실명 (classroom)
- 진행 바 (progress %)  
- 남은 시간 ("35분 남음")
- 다음 교시 미리보기

데이터 소스: teacher-schedule (TeacherScheduleData)
오늘 요일에 해당하는 스케줄 가져오기.

수업 없는 시간: "수업 없음" + 다음 교시 안내
방과 후: "오늘 수업이 끝났습니다 🎉"
등교 전: "좋은 아침이에요! 👋" + 1교시 미리보기

Tailwind 스타일:
- 배경: bg-gradient-to-r from-blue-600 to-blue-500 (라이트) / from-blue-900 to-blue-800 (다크)
- 큰 텍스트: text-2xl font-bold
- 진행 바: h-2 rounded-full bg-white/30 + bg-white 내부

## 작업 4: HomeroomAttendanceCard
파일: src/mobile/components/Today/HomeroomAttendanceCard.tsx

"우리 반 출결" 요약 카드:
- 아이콘 + "우리 반 출결" 라벨
- 출석 N · 결석 N · 지각 N (오늘 기준)
- [체크] 버튼 → 출결 체크 화면으로 이동

데이터 소스: attendance 파일 + students 파일
오늘 날짜의 담임반(classId = settings.className 또는 별도 식별) 출결 데이터.
없으면 전원 출석으로 표시 + "아직 출결을 기록하지 않았어요"

## 작업 5: ClassAttendanceCard
파일: src/mobile/components/Today/ClassAttendanceCard.tsx

"수업 출결 · N교시" 카드:
- 현재 교시에 수업이 있을 때만 표시
- 교실명 + 과목 + 출석 현황
- [체크] 버튼

데이터 소스: attendance (period = currentPeriod) + teaching-classes

## 작업 6: MealCard
파일: src/mobile/components/Today/MealCard.tsx

오늘 급식:
- 중식 기준 (mealType이 '중식')
- 메뉴 이름 + 알레르기 번호
- 칼로리
- 급식 없는 날: "급식 정보가 없습니다"

데이터: NEIS 급식 API (useMealStore 재사용)

Tailwind 스타일:
- 카드: bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm

## 체크리스트
- [ ] useCurrentPeriod 훅 구현
- [ ] TodayHub 레이아웃 구현
- [ ] CurrentClassCard 구현 (진행 바, 다음 교시)
- [ ] HomeroomAttendanceCard 구현 (담임 역할 조건부 표시)
- [ ] ClassAttendanceCard 구현 (현재 수업 조건부 표시)
- [ ] MealCard 구현 (NEIS 급식)
- [ ] 역할별 카드 표시 로직 테스트
```

---

## Phase 6: 모바일 UI — 출결 체크

### 목표
담임 출결 / 수업 출결 체크 화면을 구현한다. "오늘" 허브에서 [체크하기] 버튼을 누르면 진입.

### 참조할 기존 코드

**엔티티 (src/domain/entities/Attendance.ts):**
```typescript
export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface StudentAttendance {
  readonly number: number;
  readonly status: AttendanceStatus;
  readonly grade?: number;
  readonly classNum?: number;
}

export interface AttendanceRecord {
  readonly classId: string;
  readonly date: string;
  readonly period: number;
  readonly students: readonly StudentAttendance[];
}
```

**유스케이스 (src/usecases/classManagement/ManageAttendance.ts):**
- `getRecord(classId, date, period)` — 특정 교시의 출결 조회
- `saveRecord(record)` — 출결 저장 (있으면 업데이트, 없으면 추가)
- 그대로 재사용 가능 ✅

**데스크톱 UI 패턴 (src/adapters/components/ClassManagement/AttendanceTab.tsx):**
```typescript
const STATUS_CONFIG: Record<AttendanceStatus, { label: string; icon: string; badge: string }> = {
  present: { label: '출석', icon: 'check_circle', badge: 'bg-green-500/20 text-green-400' },
  absent: { label: '결석', icon: 'cancel', badge: 'bg-red-500/20 text-red-400' },
  late: { label: '지각', icon: 'schedule', badge: 'bg-amber-500/20 text-amber-400' },
};

// 탭으로 상태 순환: 출석 → 결석 → 지각 → 출석
const STATUS_CYCLE: Record<AttendanceStatus, AttendanceStatus> = {
  present: 'absent',
  absent: 'late',
  late: 'present',
};
```

### 구현할 컴포넌트

**파일**: `src/mobile/pages/AttendanceCheckPage.tsx`

```tsx
interface AttendanceCheckPageProps {
  classId: string;
  className: string;  // "1-2반" 등
  period: number;     // 교시
  type: 'homeroom' | 'class';  // 담임출결 vs 수업출결
  onBack: () => void;
}
```

### UI 구조

```
┌──────────────────────────────┐
│ ← 뒤로  2교시 출결 · 1-2반  완료│  ← 상단 바
│                              │
│ 출석 27 · 지각 3 · 결석 2    │  ← 요약 카운터 (실시간)
│ ────────────────────────── │
│                              │
│ 1  김민수   [출석✅][지각🟡][결석🔴]│  ← 학생별 행
│ 2  이서연   [출석✅][지각🟡][결석🔴]│     터치 타겟 최소 48px
│ 3  박지훈   [출석✅][지각🟡][결석🔴]│     선택된 상태 강조
│ 4  최수아   [출석✅][지각🟡][결석🔴]│
│ 5  정예준   [출석✅][지각🟡][결석🔴]│
│ ...                          │
│                              │
│ [오늘] [일정] [학생] [할 일] [더보기]│
└──────────────────────────────┘
```

### 핵심 구현 포인트

1. **터치 최적화**: 각 상태 버튼 최소 48×44px, 학생 행 높이 56px 이상
2. **원탭 전환**: 버튼 하나를 탭하면 해당 상태로 즉시 변경 (순환 아닌 직접 선택)
3. **모바일 대안**: 데스크톱은 순환(탭)이지만 모바일은 3개 버튼 직접 선택이 더 직관적
4. **실시간 카운터**: 상단 요약이 터치할 때마다 즉시 업데이트
5. **자동 저장**: 변경사항 발생 시 디바운스(2초) 후 자동 저장 (완료 버튼도 유지)
6. **기본값**: 모든 학생 초기 상태 `'present'` (출석)
7. **담임 출결 vs 수업 출결**: `type` prop으로 구분, 담임 출결은 `period: 0`으로 처리

### 체크리스트
```
- [ ] AttendanceCheckPage 컴포넌트 구현
- [ ] 학생 리스트 렌더링 (useTeachingClassStore 활용)
- [ ] 상태 버튼 3개 (출석/지각/결석) 터치 처리
- [ ] 실시간 카운터 업데이트
- [ ] 디바운스 자동 저장
- [ ] "완료" 버튼으로 즉시 저장 + 뒤로가기
- [ ] "오늘" 허브에서 [체크하기] → AttendanceCheckPage 네비게이션
- [ ] 담임 출결 / 수업 출결 구분 (type prop)
- [ ] 기존 출결 기록이 있으면 불러와서 표시
```

---

## Phase 7: 모바일 UI — 나머지 탭

### 목표
일정, 학생, 할 일, 더보기(메모/설정) 탭을 구현한다.

### 7-1. 일정 탭

**파일**: `src/mobile/pages/SchedulePage.tsx`

**참조 엔티티**: `src/domain/entities/SchoolEvent.ts`
**참조 스토어**: `src/adapters/stores/useEventsStore.ts`

**UI 구조:**
```
┌──────────────────────────────┐
│ 일정                         │
│ ┌──────────────────────────┐ │
│ │    3월 2026              │ │
│ │ 일 월 화 수 목 금 토     │ │  ← 미니 캘린더
│ │          1  2  3  4  5   │ │     오늘 강조, 일정 있는 날 dot
│ │  ...  [18] ...           │ │
│ └──────────────────────────┘ │
│                              │
│ 다가오는 일정                 │
│ 🔵 3/19 수 · 학력평가 · D-1  │  ← 카테고리 컬러 dot
│ 🟢 3/20 목 · 학부모 상담 · D-2│
│ 🔵 3/27 금 · 시험 신청 마감  │
│                          [+] │  ← FAB: 간단 일정 추가
│ [오늘] [일정✓] [학생] [할 일] [더보기]│
└──────────────────────────────┘
```

**핵심:**
- `useEventsStore`의 `events` + `categories` 구독
- `isHidden` 필터링 적용 (데스크톱 버그 수정과 동일)
- 일정 추가: 제목 + 날짜 + 카테고리만 (간소화)
- 일정 클릭 시 상세 보기 모달

### 7-2. 학생 탭

**파일**: `src/mobile/pages/StudentsPage.tsx`

**참조**: `src/adapters/stores/useStudentStore.ts`, `src/adapters/stores/useScheduleStore.ts`

**UI 구조:**
```
┌──────────────────────────────┐
│ 2학년 3반        [좌석] [명단]│  ← 세그먼트 전환
│                              │
│ (좌석 모드)                   │
│ ┌────────────────────────┐   │
│ │ [교탁]                 │   │
│ │ 1김○ 2이○ 3박○ 4최○  │   │  ← 격자 뷰 (읽기 전용)
│ │ 5정○ 6한○ 7윤○ 8장○  │   │
│ │ ...                    │   │
│ └────────────────────────┘   │
│                              │
│ (명단 모드)                   │
│ 1번 김민수                    │  ← 리스트 뷰
│ 2번 이서연                    │
│ ...                          │
│ [오늘] [일정] [학생✓] [할 일] [더보기]│
└──────────────────────────────┘
```

**핵심:**
- 좌석 뷰: 데스크톱의 `SeatingChart` 단순화 (읽기 전용, 드래그 없음)
- 명단 뷰: 학생 번호 + 이름 리스트
- 세그먼트 선택 localStorage 저장 (유지)

### 7-3. 할 일 탭

**파일**: `src/mobile/pages/TodoPage.tsx`

**참조 엔티티**: `src/domain/entities/Todo.ts`
**참조 스토어**: `src/adapters/stores/useTodoStore.ts`

**UI 구조:**
```
┌──────────────────────────────┐
│ 할 일                    [+] │
│                              │
│ ☑️ ~~수행평가 채점 기준~~ ✓   │  ← 완료 항목 (취소선)
│ ☐ 학부모 상담 일정 확인      │
│   🔴 긴급 · D-2              │  ← 우선순위 + D-Day
│ ☐ 생활기록부 초안            │
│   🟡 보통 · D-7              │
│ ☐ 교과 협의회 자료 준비      │
│   🟢 낮음 · D-5              │
│                              │
│ [오늘] [일정] [학생] [할 일✓] [더보기]│
└──────────────────────────────┘
```

**핵심:**
- `useTodoStore`의 `todos` 구독
- 체크박스 토글로 완료/미완료 전환 (터치 영역 크게)
- [+] 버튼으로 간단 추가 (제목 + 우선순위 + 마감일)
- 완료 항목은 하단으로 이동 + 취소선

### 7-4. 더보기 탭

**파일**: `src/mobile/pages/MorePage.tsx`

**UI 구조:**
```
┌──────────────────────────────┐
│ 더보기                       │
│                              │
│ 📝 메모                  →  │  ← 메모 페이지로 이동
│ ⚙️ 설정                  →  │  ← 테마, 동기화 등
│ 🔄 동기화                    │
│   마지막: 오후 2:30           │
│   [지금 동기화]               │
│                              │
│ 쌤핀 v0.4.8                  │
│ [오늘] [일정] [학생] [할 일] [더보기✓]│
└──────────────────────────────┘
```

### 체크리스트
```
- [ ] SchedulePage: 미니 캘린더 + 일정 리스트 + 간단 추가
- [ ] StudentsPage: 좌석 격자(읽기) + 명단 리스트 + 세그먼트 전환
- [ ] TodoPage: 체크리스트 + 우선순위 + D-Day + 간단 추가
- [ ] MorePage: 메모 링크 + 설정 + 동기화 상태
- [ ] MemoPage: 메모 리스트 + 상세 보기 + 간단 작성
- [ ] SettingsPage: 테마 전환 + 동기화 설정
- [ ] 각 페이지에서 기존 Zustand 스토어 재사용
- [ ] isHidden 필터링 적용 (일정)
```

---

## Phase 8: PWA 설정 + 배포

### 목표
PWA 매니페스트, Service Worker, Vercel 배포를 설정한다.

### 8-1. PWA 매니페스트

**파일**: `vite.config.ts` (vite-plugin-pwa 추가)

```typescript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '쌤핀 모바일',
        short_name: '쌤핀',
        description: '교사용 모바일 대시보드',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Google Drive API 캐시 전략
            urlPattern: /^https:\/\/www\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'google-api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            // NEIS 급식/날씨 API
            urlPattern: /^https:\/\/open\.neis\.go\.kr\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'neis-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
```

### 8-2. 오프라인 지원

**Service Worker 전략:**
- 정적 자산 (JS/CSS/HTML): Cache First
- Google Drive API: Network First (실패 시 캐시)
- NEIS API: Stale While Revalidate
- IndexedDB 데이터: 항상 로컬 우선

**오프라인 UI:**
```tsx
// src/mobile/components/OfflineBanner.tsx
function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-center text-xs text-amber-600">
      오프라인 모드 · 마지막 동기화 데이터로 동작 중
    </div>
  );
}
```

### 8-3. Vercel 배포

**파일**: `vercel.json`
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
    }
  ]
}
```

**URL**: `m.ssampin.com` (별도 Vercel 프로젝트)

### 8-4. 앱 아이콘 생성

```bash
# PWA 아이콘 생성 (기존 icon_new.svg 기반)
npx pwa-asset-generator public/icon_new.svg public/pwa --background "#3b82f6" --padding "15%"
```

### 체크리스트
```
- [ ] vite-plugin-pwa 설치 및 설정
- [ ] manifest.json 설정 (이름, 아이콘, 테마색)
- [ ] Service Worker 캐싱 전략 설정
- [ ] 오프라인 배너 컴포넌트
- [ ] PWA 아이콘 생성 (192x192, 512x512)
- [ ] Vercel 프로젝트 생성 (m.ssampin.com)
- [ ] vercel.json SPA 라우팅 설정
- [ ] 빌드 + 배포 테스트
- [ ] iOS Safari "홈 화면에 추가" 테스트
- [ ] Android Chrome "앱 설치" 테스트
- [ ] 오프라인 모드 동작 테스트
```

---

## 전체 예상 작업량

| Phase | 내용 | 예상 시간 |
|-------|------|----------|
| Phase 1 | 프로젝트 세팅 | 2~3시간 |
| Phase 2 | 저장소 추상화 | 4~6시간 |
| Phase 3 | Google OAuth 브라우저 | 3~4시간 |
| Phase 4 | Google Drive 동기화 | 4~6시간 |
| Phase 5 | "오늘" 허브 UI | 4~6시간 |
| Phase 6 | 출결 체크 UI | 3~4시간 |
| Phase 7 | 나머지 탭 UI | 6~8시간 |
| Phase 8 | PWA + 배포 | 2~3시간 |
| **총** | | **28~40시간** |