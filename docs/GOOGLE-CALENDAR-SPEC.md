# 📅 쌤핀 (SsamPin) — 구글 캘린더 연동 기술 스펙

**버전:** v0.3
**최종 수정:** 2026-03-05
**대응 PRD:** GOOGLE-CALENDAR-PRD.md v0.3
**대응 SPEC:** SPEC.md v0.2

---

### 📋 변경 로그

#### v0.3 (2026-03-05) — 프로덕션 전환 기술 스펙

| # | 구분 | 변경 내용 |
|---|------|---------|
| 11 | 🔴 Critical | **"Google Cloud 프로덕션 전환" 섹션 추가 (14절)** — OAuth 동의 화면 프로덕션 설정, Sensitive scope 검증 절차, 데모 영상 가이드 |
| 12 | 🟡 Important | **"앱 내 개인정보처리방침 표시" 요구사항 추가 (14.4절)** — 설정 화면 + OAuth 동의 화면에서 링크 표시 |
| 13 | 🟡 Important | **Google Cloud 프로젝트 설정(10.4절) 프로덕션 전환 내용 보완** |

#### v0.2 (2026-03-04) — 검토 반영

| # | 구분 | 변경 내용 |
|---|------|---------|
| 1 | 🔴 Critical | **PKCE 추가** — `GoogleOAuthClient`에 `generateCodeVerifier()`, `generateCodeChallenge()` 추가. `getAuthUrl()`에 `code_challenge` 파라미터, `exchangeCode()`에 `code_verifier` 파라미터 포함 |
| 2 | 🔴 Critical | **googleapis 제거** — 기술 스택에서 `googleapis ^144.x` 제거, "네이티브 fetch (Node.js 18+ 내장)" 명시 |
| 3 | 🔴 Critical | **refreshTokens() email 유실 버그 수정** — 리턴 타입에서 email 생략, `AuthenticateGoogle.getValidAccessToken()`에서 기존 email 보존 |
| 4 | 🔴 Critical | **충돌 감지 로직 수정** — `SchoolEvent`에 `localUpdatedAt` 필드 추가, `detectConflict()` 완전 재작성 |
| 5 | 🟡 Important | **토큰 암호화 IPC 격리** — `ITokenStoragePort` 인터페이스 분리, `ICalendarSyncRepository`에서 토큰 메서드 제거, Electron IPC 코드 추가 |
| 6 | 🟡 Important | **동기화 루프 방지** — `SyncState`에 `recentlyPushedToGoogle`/`recentlyPulledFromGoogle` 추가, echo detection 로직 |
| 7 | 🟡 Important | **Smart Polling 전략** — "동기화 트리거 전략" 섹션 추가, Push Notification 불가 사유 + Exponential Backoff |
| 8 | 🟡 Important | **종일 일정 endDate exclusive 처리** — `toGoogleEvent()`에서 +1일, `fromGoogleEvent()`에서 -1일 변환 |
| 9 | 🟡 Important | **Rate Limiting & Retry** — `GoogleCalendarApiClient.request()`에 exponential backoff 재시도 로직 추가 |
| 10 | 🟢 Nice-to-Have | **반복 일정 처리 전략** — `singleEvents=true` 파라미터 추가, v1.0/v2.0 로드맵 |

---

## 1. 기술 스택 추가

| 분류 | 기술 | 버전 | 용도 |
|------|------|------|------|
| **HTTP** | 네이티브 fetch | Node.js 18+ 내장 | Google Calendar API 직접 호출 |
| **암호화** | Electron safeStorage | 내장 | 토큰 암호화 저장 (메인 프로세스 전용) |
| **UUID** | crypto.randomUUID() | 내장 | 동기화 ID 생성 |
| **PKCE** | crypto (Node.js 내장) | 내장 | code_verifier / code_challenge 생성 |

### 선택 근거

- **네이티브 fetch**: Node.js 18+ 내장. `googleapis` 패키지(~15MB+ node_modules)를 사용하지 않고 직접 Google Calendar REST API를 호출하여 번들 크기를 최소화.
- **Electron safeStorage**: OS 키체인(Windows: DPAPI, macOS: Keychain)으로 토큰 암호화. **메인 프로세스 전용 API**이므로 IPC를 통해 렌더러와 격리.
- **PKCE**: Google 공식 권장(2025) — 데스크톱 앱에서 authorization code interception 방지.

---

## 2. 클린 아키텍처 레이어별 설계

### 2.1 전체 구조 개요

```
┌─────────────────────────────────────────────────────────────┐
│  Infrastructure (infrastructure/google/)                     │
│  GoogleOAuthClient, GoogleCalendarApiClient                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Adapters (adapters/)                                │    │
│  │  GoogleCalendarRepository, useCalendarSyncStore,     │    │
│  │  CalendarSettings 컴포넌트, CalendarSyncStatus       │    │
│  │                                                     │    │
│  │  ┌─────────────────────────────────────────────┐    │    │
│  │  │  Use Cases (usecases/calendar/)              │    │    │
│  │  │  AuthenticateGoogle, SyncToGoogle,            │    │    │
│  │  │  SyncFromGoogle, ResolveConflict,             │    │    │
│  │  │  DisconnectGoogle, ManageCalendarMapping       │    │    │
│  │  │                                             │    │    │
│  │  │  ┌─────────────────────────────────────┐    │    │    │
│  │  │  │  Domain (domain/)                    │    │    │    │
│  │  │  │  CalendarMapping, SyncState,          │    │    │    │
│  │  │  │  SyncQueueItem, GoogleCalendarInfo,   │    │    │    │
│  │  │  │  ICalendarSyncRepository,             │    │    │    │
│  │  │  │  IGoogleAuthPort, ITokenStoragePort   │    │    │    │
│  │  │  └─────────────────────────────────────┘    │    │    │
│  │  └─────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 의존성 규칙 (기존 확장)

```
❌ 금지되는 import:
- domain/ → 어디서든 import 불가 (기존과 동일)
- usecases/calendar/ → adapters/, infrastructure/ import 불가

✅ 허용되는 import:
- usecases/calendar/ → domain/ (CalendarMapping, SyncState, ICalendarSyncRepository, IGoogleAuthPort, ITokenStoragePort)
- adapters/ → domain/, usecases/calendar/
- infrastructure/google/ → domain/ (IGoogleAuthPort 인터페이스만)
- adapters/di/container.ts → infrastructure/google/ (구현체 바인딩)
```

---

## 3. Domain 레이어 확장

### 3.1 새로운 엔티티

#### CalendarMapping (카테고리 ↔ 구글 캘린더 매핑)

```typescript
// domain/entities/CalendarMapping.ts
export interface CalendarMapping {
  /** 쌤핀 카테고리 ID */
  categoryId: string;
  /** 쌤핀 카테고리 이름 (예: "학교", "나무학교") */
  categoryName: string;
  /** 동기화 활성화 여부 */
  syncEnabled: boolean;
  /** 매핑된 구글 캘린더 ID (null이면 미매핑) */
  googleCalendarId: string | null;
  /** 구글 캘린더 이름 */
  googleCalendarName: string | null;
  /** 동기화 방향 */
  syncDirection: 'bidirectional' | 'toGoogle' | 'fromGoogle';
}
```

#### SyncState (동기화 상태)

```typescript
// domain/entities/SyncState.ts
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

export interface SyncState {
  /** 현재 동기화 상태 */
  status: SyncStatus;
  /** 마지막 성공 동기화 시각 (ISO string) */
  lastSyncedAt: string | null;
  /** 마지막 에러 메시지 */
  lastError: string | null;
  /** 대기 중인 오프라인 변경 수 */
  pendingChanges: number;
  /** Google Calendar syncToken (incremental sync용) */
  syncTokens: Record<string, string>;
  // key: googleCalendarId, value: syncToken

  /** 마지막 동기화에서 쌤핀이 구글에 push한 이벤트 ID 목록 (동기화 루프 방지) */
  recentlyPushedToGoogle: string[]; // googleEventId[]
  /** 마지막 동기화에서 구글에서 pull한 이벤트 ID 목록 (동기화 루프 방지) */
  recentlyPulledFromGoogle: string[]; // googleEventId[]
}
```

#### SyncQueueItem (오프라인 큐)

```typescript
// domain/entities/SyncQueueItem.ts
export type SyncAction = 'create' | 'update' | 'delete';

export interface SyncQueueItem {
  /** 큐 항목 ID */
  id: string;
  /** 변경 액션 */
  action: SyncAction;
  /** 변경 대상 일정 */
  event: SchoolEvent;
  /** 매핑된 구글 캘린더 ID */
  googleCalendarId: string;
  /** 큐에 추가된 시각 */
  queuedAt: string;
  /** 재시도 횟수 */
  retryCount: number;
  /** 마지막 에러 */
  lastError?: string;
}
```

#### GoogleCalendarInfo (구글 캘린더 정보)

```typescript
// domain/entities/GoogleCalendarInfo.ts
export interface GoogleCalendarInfo {
  /** 구글 캘린더 ID */
  id: string;
  /** 캘린더 이름 */
  summary: string;
  /** 캘린더 색상 */
  backgroundColor: string;
  /** 기본 캘린더 여부 */
  primary: boolean;
  /** 접근 권한 */
  accessRole: 'owner' | 'writer' | 'reader';
}
```

#### GoogleEventData (구글 이벤트 원본 데이터)

```typescript
// domain/entities/GoogleEventData.ts
export interface GoogleEventData {
  /** 구글 이벤트 ID */
  googleEventId: string;
  /** 출처 구글 캘린더 ID */
  googleCalendarId: string;
  /** 구글 측 마지막 수정 시각 (충돌 판정용) */
  googleUpdatedAt: string;
  /** 구글 이벤트 ETag (낙관적 잠금) */
  etag: string;
}
```

### 3.2 SchoolEvent 엔티티 확장

기존 `SchoolEvent`에 구글 캘린더 동기화 필드를 추가한다:

```typescript
// domain/entities/SchoolEvent.ts (확장)
export interface SchoolEvent {
  // === 기존 필드 ===
  id: string;
  date: string;           // YYYY-MM-DD
  title: string;
  type: EventType;
  isDDay: boolean;
  category: string;

  // === 구글 캘린더 동기화 필드 (추가) ===
  /** 구글 이벤트 ID (null이면 쌤핀 고유 일정) */
  googleEventId?: string;
  /** 매핑된 구글 캘린더 ID */
  googleCalendarId?: string;
  /** 동기화 상태 */
  syncStatus?: 'synced' | 'pending' | 'conflict' | 'local-only' | 'google-only';
  /** 마지막 동기화 시각 */
  lastSyncedAt?: string;
  /** 쌤핀에서 마지막으로 수정한 시각 (충돌 감지용) */
  localUpdatedAt?: string;
  /** 구글 측 마지막 수정 시각 (충돌 감지용) */
  googleUpdatedAt?: string;
  /** 구글 이벤트 ETag */
  etag?: string;
  /** 일정 출처 */
  source?: 'ssampin' | 'google';

  // === 기존에 없던 시간 필드 (구글 캘린더에서 필요) ===
  /** 시작 시간 (HH:MM, 없으면 종일 일정) */
  startTime?: string;
  /** 종료 시간 (HH:MM) */
  endTime?: string;
  /** 종료 날짜 (YYYY-MM-DD, 여러 날 일정) */
  endDate?: string;
  /** 장소 */
  location?: string;
  /** 설명 */
  description?: string;
}
```

**하위 호환성**: 모든 추가 필드는 `optional`이므로 기존 데이터와 완벽 호환.

### 3.3 새로운 포트 (인터페이스)

#### IGoogleAuthPort (인증 추상화)

```typescript
// domain/ports/IGoogleAuthPort.ts
export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp (ms)
  email: string;
}

/** refreshTokens() 반환 타입 — email은 갱신 응답에 포함되지 않으므로 생략 */
export type RefreshedTokens = Omit<GoogleAuthTokens, 'email'>;

export interface IGoogleAuthPort {
  /** OAuth 인증 URL 생성 (PKCE code_challenge 포함) */
  getAuthUrl(): { url: string; codeVerifier: string };
  /** 인증 코드로 토큰 교환 (PKCE code_verifier 포함) */
  exchangeCode(code: string, codeVerifier: string): Promise<GoogleAuthTokens>;
  /** 토큰 갱신 (email은 반환하지 않음 — 호출자가 기존 email 보존) */
  refreshTokens(refreshToken: string): Promise<RefreshedTokens>;
  /** 토큰 폐기 */
  revokeTokens(accessToken: string): Promise<void>;
}
```

#### ITokenStoragePort (토큰 암호화 저장소 — IPC 격리)

```typescript
// domain/ports/ITokenStoragePort.ts
import { GoogleAuthTokens } from './IGoogleAuthPort';

/**
 * 토큰 암호화 저장 전용 포트.
 * Electron safeStorage는 메인 프로세스 전용 API이므로,
 * 이 포트를 통해 IPC로 격리한다.
 * ICalendarSyncRepository에서 토큰 관련 메서드를 분리한 것.
 */
export interface ITokenStoragePort {
  /** 저장된 토큰 조회 (암호화 해제) */
  getTokens(): Promise<GoogleAuthTokens | null>;
  /** 토큰 저장 (암호화) */
  saveTokens(tokens: GoogleAuthTokens): Promise<void>;
  /** 토큰 삭제 */
  deleteTokens(): Promise<void>;
}
```

#### ICalendarSyncRepository (동기화 저장소 — 토큰 메서드 분리됨)

```typescript
// domain/repositories/ICalendarSyncRepository.ts
import { CalendarMapping } from '../entities/CalendarMapping';
import { SyncState } from '../entities/SyncState';
import { SyncQueueItem } from '../entities/SyncQueueItem';

/**
 * 동기화 관련 데이터 저장소.
 * 주의: 인증 토큰은 ITokenStoragePort로 분리됨 (보안상 IPC 격리 필요).
 */
export interface ICalendarSyncRepository {
  // === 카테고리 매핑 ===
  getMappings(): Promise<CalendarMapping[]>;
  saveMappings(mappings: CalendarMapping[]): Promise<void>;

  // === 동기화 상태 ===
  getSyncState(): Promise<SyncState>;
  saveSyncState(state: SyncState): Promise<void>;

  // === 오프라인 큐 ===
  getQueue(): Promise<SyncQueueItem[]>;
  addToQueue(item: SyncQueueItem): Promise<void>;
  removeFromQueue(itemId: string): Promise<void>;
  clearQueue(): Promise<void>;
}
```

#### IGoogleCalendarPort (구글 캘린더 API 추상화)

```typescript
// domain/ports/IGoogleCalendarPort.ts
import { GoogleCalendarInfo } from '../entities/GoogleCalendarInfo';
import { SchoolEvent } from '../entities/SchoolEvent';

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
  updated: string;
  etag: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
}

export interface SyncResult {
  events: GoogleCalendarEvent[];
  nextSyncToken: string;
  deletedEventIds: string[];
}

export interface IGoogleCalendarPort {
  /** 캘린더 목록 조회 */
  listCalendars(accessToken: string): Promise<GoogleCalendarInfo[]>;
  /** 캘린더 생성 */
  createCalendar(accessToken: string, summary: string, color?: string): Promise<GoogleCalendarInfo>;

  /** 이벤트 생성 */
  createEvent(accessToken: string, calendarId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent>;
  /** 이벤트 수정 */
  updateEvent(accessToken: string, calendarId: string, eventId: string, event: GoogleCalendarEvent): Promise<GoogleCalendarEvent>;
  /** 이벤트 삭제 */
  deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void>;

  /** 증분 동기화 (syncToken 이후 변경분만) */
  incrementalSync(accessToken: string, calendarId: string, syncToken?: string): Promise<SyncResult>;
  /** 전체 동기화 (초기 또는 syncToken 만료 시) */
  fullSync(accessToken: string, calendarId: string, timeMin?: string): Promise<SyncResult>;
}
```

### 3.4 새로운 비즈니스 규칙

```typescript
// domain/rules/calendarSyncRules.ts

import { SchoolEvent } from '../entities/SchoolEvent';
import { GoogleCalendarEvent } from '../ports/IGoogleCalendarPort';

/**
 * 쌤핀 일정 → 구글 이벤트 변환
 * 종일 일정의 end.date는 Google Calendar에서 exclusive(배타적)이므로 +1일 처리
 */
export function toGoogleEvent(event: SchoolEvent): Partial<GoogleCalendarEvent> {
  const base: Partial<GoogleCalendarEvent> = {
    summary: event.title,
    description: event.description,
    location: event.location,
  };

  if (event.startTime) {
    // 시간이 있는 일정
    const startDateTime = `${event.date}T${event.startTime}:00`;
    const endDateTime = event.endTime
      ? `${event.endDate || event.date}T${event.endTime}:00`
      : `${event.date}T${event.startTime}:00`; // 종료 시간 없으면 시작과 동일
    base.start = { dateTime: startDateTime, timeZone: 'Asia/Seoul' };
    base.end = { dateTime: endDateTime, timeZone: 'Asia/Seoul' };
  } else {
    // 종일 일정 — Google Calendar의 end.date는 exclusive
    // 예: 3월 4일 종일 일정 → start: "2026-03-04", end: "2026-03-05"
    const endDate = event.endDate || event.date;
    const nextDay = new Date(endDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const exclusiveEnd = nextDay.toISOString().split('T')[0];

    base.start = { date: event.date };
    base.end = { date: exclusiveEnd };
  }

  return base;
}

/**
 * 구글 이벤트 → 쌤핀 일정 변환
 * 종일 일정의 end.date는 Google Calendar에서 exclusive이므로 -1일 처리
 */
export function fromGoogleEvent(
  gEvent: GoogleCalendarEvent,
  calendarId: string,
  category: string,
): SchoolEvent {
  const isAllDay = !!gEvent.start.date;
  const date = isAllDay
    ? gEvent.start.date!
    : gEvent.start.dateTime!.split('T')[0];

  let endDate: string | undefined;
  if (isAllDay && gEvent.end.date) {
    // Google Calendar의 end.date는 exclusive → -1일 하여 쌤핀의 inclusive endDate로 변환
    const exclusiveEnd = new Date(gEvent.end.date);
    exclusiveEnd.setDate(exclusiveEnd.getDate() - 1);
    const inclusiveEnd = exclusiveEnd.toISOString().split('T')[0];
    // 시작일과 같으면 endDate 생략 (단일 종일 일정)
    endDate = inclusiveEnd !== date ? inclusiveEnd : undefined;
  } else if (!isAllDay && gEvent.end.dateTime) {
    endDate = gEvent.end.dateTime.split('T')[0];
  }

  return {
    id: `google-${gEvent.id}`,
    date,
    title: gEvent.summary || '(제목 없음)',
    type: 'school' as any,
    isDDay: false,
    category,
    googleEventId: gEvent.id,
    googleCalendarId: calendarId,
    syncStatus: 'synced',
    lastSyncedAt: new Date().toISOString(),
    localUpdatedAt: new Date().toISOString(),
    googleUpdatedAt: gEvent.updated,
    etag: gEvent.etag,
    source: 'google',
    startTime: isAllDay ? undefined : gEvent.start.dateTime!.split('T')[1].substring(0, 5),
    endTime: isAllDay ? undefined : gEvent.end.dateTime?.split('T')[1].substring(0, 5),
    endDate,
    location: gEvent.location,
    description: gEvent.description,
  };
}

/**
 * 충돌 감지: 양쪽에서 동시에 수정되었는가?
 * localUpdatedAt 기반으로 판단 (기존의 Date.now() 비교 버그 수정)
 */
export function detectConflict(
  local: SchoolEvent,
  remote: GoogleCalendarEvent,
): boolean {
  if (!local.lastSyncedAt) return false;

  const syncTime = new Date(local.lastSyncedAt).getTime();

  // 로컬이 마지막 동기화 이후에 수정되었는가?
  const localModified = local.localUpdatedAt
    ? new Date(local.localUpdatedAt).getTime() > syncTime
    : false;

  // 구글이 마지막 동기화 이후에 수정되었는가?
  const remoteModified = new Date(remote.updated).getTime() > syncTime;

  // 양쪽 모두 수정된 경우에만 충돌
  return localModified && remoteModified;
}

/**
 * 충돌 해결: 최근 수정 우선
 */
export function resolveConflictByLatest(
  local: SchoolEvent,
  remote: GoogleCalendarEvent,
): 'local' | 'remote' {
  const remoteTime = new Date(remote.updated).getTime();
  const localTime = local.localUpdatedAt
    ? new Date(local.localUpdatedAt).getTime()
    : 0;

  return remoteTime > localTime ? 'remote' : 'local';
}

/**
 * 토큰 만료 여부 확인
 */
export function isTokenExpired(expiresAt: number, bufferMs: number = 60000): boolean {
  return Date.now() >= expiresAt - bufferMs;
}
```

---

## 4. Use Cases 레이어

### 4.1 AuthenticateGoogle (구글 인증)

```typescript
// usecases/calendar/AuthenticateGoogle.ts
import { IGoogleAuthPort, GoogleAuthTokens } from '../../domain/ports/IGoogleAuthPort';
import { ITokenStoragePort } from '../../domain/ports/ITokenStoragePort';
import { isTokenExpired } from '../../domain/rules/calendarSyncRules';

export class AuthenticateGoogle {
  constructor(
    private readonly authPort: IGoogleAuthPort,
    private readonly tokenStorage: ITokenStoragePort,
  ) {}

  /** OAuth URL 생성 (PKCE code_verifier도 함께 반환) */
  getAuthUrl(): { url: string; codeVerifier: string } {
    return this.authPort.getAuthUrl();
  }

  /** 인증 코드 → 토큰 교환 + 저장 (PKCE code_verifier 포함) */
  async authenticate(code: string, codeVerifier: string): Promise<GoogleAuthTokens> {
    const tokens = await this.authPort.exchangeCode(code, codeVerifier);
    await this.tokenStorage.saveTokens(tokens);
    return tokens;
  }

  /** 유효한 access token 반환 (필요 시 자동 갱신, 기존 email 보존) */
  async getValidAccessToken(): Promise<string> {
    const tokens = await this.tokenStorage.getTokens();
    if (!tokens) throw new Error('구글 캘린더가 연결되어 있지 않습니다');

    if (isTokenExpired(tokens.expiresAt)) {
      const refreshed = await this.authPort.refreshTokens(tokens.refreshToken);
      // 기존 email 보존 — refreshTokens()는 email을 반환하지 않으므로
      await this.tokenStorage.saveTokens({
        ...refreshed,
        email: tokens.email, // 기존 email 유지
      });
      return refreshed.accessToken;
    }

    return tokens.accessToken;
  }

  /** 연결 상태 확인 */
  async isConnected(): Promise<boolean> {
    const tokens = await this.tokenStorage.getTokens();
    return tokens !== null;
  }

  /** 연결 해제 */
  async disconnect(): Promise<void> {
    const tokens = await this.tokenStorage.getTokens();
    if (tokens) {
      try {
        await this.authPort.revokeTokens(tokens.accessToken);
      } catch {
        // 토큰 폐기 실패해도 로컬 삭제는 진행
      }
      await this.tokenStorage.deleteTokens();
    }
  }
}
```

### 4.2 SyncToGoogle (쌤핀 → 구글 동기화)

```typescript
// usecases/calendar/SyncToGoogle.ts
import { ICalendarSyncRepository } from '../../domain/repositories/ICalendarSyncRepository';
import { IGoogleCalendarPort } from '../../domain/ports/IGoogleCalendarPort';
import { IEventsRepository } from '../../domain/repositories/IEventsRepository';
import { toGoogleEvent } from '../../domain/rules/calendarSyncRules';
import { SchoolEvent } from '../../domain/entities/SchoolEvent';
import { AuthenticateGoogle } from './AuthenticateGoogle';

export class SyncToGoogle {
  constructor(
    private readonly auth: AuthenticateGoogle,
    private readonly calendarPort: IGoogleCalendarPort,
    private readonly eventsRepo: IEventsRepository,
    private readonly syncRepo: ICalendarSyncRepository,
  ) {}

  /** 단일 일정을 구글에 동기화 (동기화 루프 방지: push 후 ID 기록) */
  async syncEvent(event: SchoolEvent): Promise<SchoolEvent> {
    const accessToken = await this.auth.getValidAccessToken();
    const mappings = await this.syncRepo.getMappings();
    const mapping = mappings.find(m => m.categoryId === event.category && m.syncEnabled);

    if (!mapping || !mapping.googleCalendarId) {
      return { ...event, syncStatus: 'local-only' };
    }

    const googleEvent = toGoogleEvent(event);

    let result: SchoolEvent;

    if (event.googleEventId) {
      // 기존 이벤트 업데이트
      const updated = await this.calendarPort.updateEvent(
        accessToken,
        mapping.googleCalendarId,
        event.googleEventId,
        googleEvent as any,
      );
      result = {
        ...event,
        googleEventId: updated.id,
        googleCalendarId: mapping.googleCalendarId,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
        localUpdatedAt: event.localUpdatedAt,
        googleUpdatedAt: updated.updated,
        etag: updated.etag,
      };
    } else {
      // 새 이벤트 생성
      const created = await this.calendarPort.createEvent(
        accessToken,
        mapping.googleCalendarId,
        googleEvent as any,
      );
      result = {
        ...event,
        googleEventId: created.id,
        googleCalendarId: mapping.googleCalendarId,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString(),
        localUpdatedAt: event.localUpdatedAt,
        googleUpdatedAt: created.updated,
        etag: created.etag,
        source: 'ssampin',
      };
    }

    // 동기화 루프 방지: push한 이벤트 ID를 기록
    const syncState = await this.syncRepo.getSyncState();
    const pushedIds = [...syncState.recentlyPushedToGoogle];
    if (result.googleEventId && !pushedIds.includes(result.googleEventId)) {
      pushedIds.push(result.googleEventId);
    }
    await this.syncRepo.saveSyncState({
      ...syncState,
      recentlyPushedToGoogle: pushedIds,
    });

    return result;
  }

  /** 삭제된 일정을 구글에서도 삭제 */
  async deleteEvent(event: SchoolEvent): Promise<void> {
    if (!event.googleEventId || !event.googleCalendarId) return;

    const accessToken = await this.auth.getValidAccessToken();
    await this.calendarPort.deleteEvent(
      accessToken,
      event.googleCalendarId,
      event.googleEventId,
    );
  }
}
```

### 4.3 SyncFromGoogle (구글 → 쌤핀 동기화)

```typescript
// usecases/calendar/SyncFromGoogle.ts
import { ICalendarSyncRepository } from '../../domain/repositories/ICalendarSyncRepository';
import { IGoogleCalendarPort } from '../../domain/ports/IGoogleCalendarPort';
import { IEventsRepository } from '../../domain/repositories/IEventsRepository';
import {
  fromGoogleEvent,
  detectConflict,
  resolveConflictByLatest,
} from '../../domain/rules/calendarSyncRules';
import { SchoolEvent } from '../../domain/entities/SchoolEvent';
import { AuthenticateGoogle } from './AuthenticateGoogle';

export interface SyncFromGoogleResult {
  created: number;
  updated: number;
  deleted: number;
  conflicts: Array<{
    local: SchoolEvent;
    remote: SchoolEvent;
  }>;
}

export class SyncFromGoogle {
  constructor(
    private readonly auth: AuthenticateGoogle,
    private readonly calendarPort: IGoogleCalendarPort,
    private readonly eventsRepo: IEventsRepository,
    private readonly syncRepo: ICalendarSyncRepository,
  ) {}

  /** 모든 매핑된 구글 캘린더에서 변경분 가져오기 (동기화 루프 방지 포함) */
  async execute(autoResolve: boolean = true): Promise<SyncFromGoogleResult> {
    const accessToken = await this.auth.getValidAccessToken();
    const mappings = await this.syncRepo.getMappings();
    const syncState = await this.syncRepo.getSyncState();
    const eventsData = await this.eventsRepo.getEvents();
    const existingEvents = eventsData?.events || [];

    const result: SyncFromGoogleResult = {
      created: 0,
      updated: 0,
      deleted: 0,
      conflicts: [],
    };

    // 동기화 루프 방지용 Set
    const recentlyPushed = new Set(syncState.recentlyPushedToGoogle);
    const pulledIds: string[] = [];

    for (const mapping of mappings) {
      if (!mapping.syncEnabled || !mapping.googleCalendarId) continue;

      const syncToken = syncState.syncTokens[mapping.googleCalendarId];

      let syncResult;
      try {
        syncResult = syncToken
          ? await this.calendarPort.incrementalSync(accessToken, mapping.googleCalendarId, syncToken)
          : await this.calendarPort.fullSync(accessToken, mapping.googleCalendarId);
      } catch (error: any) {
        if (error.code === 410) {
          // syncToken 만료 → 전체 동기화
          syncResult = await this.calendarPort.fullSync(accessToken, mapping.googleCalendarId);
        } else {
          throw error;
        }
      }

      // syncToken 저장
      syncState.syncTokens[mapping.googleCalendarId] = syncResult.nextSyncToken;

      // 삭제된 이벤트 처리
      for (const deletedId of syncResult.deletedEventIds) {
        const idx = existingEvents.findIndex(e => e.googleEventId === deletedId);
        if (idx !== -1) {
          existingEvents.splice(idx, 1);
          result.deleted++;
        }
      }

      // 변경/추가된 이벤트 처리
      for (const gEvent of syncResult.events) {
        if (gEvent.status === 'cancelled') continue;

        // 동기화 루프 방지: 우리가 push한 이벤트의 에코는 무시
        if (recentlyPushed.has(gEvent.id)) {
          recentlyPushed.delete(gEvent.id); // 한 번만 무시
          continue;
        }

        const existingIdx = existingEvents.findIndex(e => e.googleEventId === gEvent.id);

        if (existingIdx !== -1) {
          // 기존 이벤트 업데이트
          const existing = existingEvents[existingIdx];

          if (detectConflict(existing, gEvent)) {
            if (autoResolve) {
              const winner = resolveConflictByLatest(existing, gEvent);
              if (winner === 'remote') {
                existingEvents[existingIdx] = fromGoogleEvent(
                  gEvent,
                  mapping.googleCalendarId,
                  mapping.categoryName,
                );
              }
            } else {
              result.conflicts.push({
                local: existing,
                remote: fromGoogleEvent(gEvent, mapping.googleCalendarId, mapping.categoryName),
              });
            }
          } else {
            existingEvents[existingIdx] = fromGoogleEvent(
              gEvent,
              mapping.googleCalendarId,
              mapping.categoryName,
            );
          }
          result.updated++;
        } else {
          // 새 이벤트 추가
          existingEvents.push(
            fromGoogleEvent(gEvent, mapping.googleCalendarId, mapping.categoryName),
          );
          result.created++;
        }

        pulledIds.push(gEvent.id);
      }
    }

    // 저장
    await this.eventsRepo.saveEvents({ events: existingEvents });
    await this.syncRepo.saveSyncState({
      ...syncState,
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      recentlyPushedToGoogle: [...recentlyPushed], // 남은 것들 유지
      recentlyPulledFromGoogle: pulledIds,
    });

    return result;
  }
}
```

### 4.4 FlushSyncQueue (오프라인 큐 처리)

```typescript
// usecases/calendar/FlushSyncQueue.ts
import { ICalendarSyncRepository } from '../../domain/repositories/ICalendarSyncRepository';
import { SyncToGoogle } from './SyncToGoogle';
import { SyncQueueItem } from '../../domain/entities/SyncQueueItem';

export class FlushSyncQueue {
  constructor(
    private readonly syncToGoogle: SyncToGoogle,
    private readonly syncRepo: ICalendarSyncRepository,
  ) {}

  /** 큐의 모든 항목을 순서대로 처리 (exponential backoff 적용) */
  async execute(): Promise<{ success: number; failed: number }> {
    const queue = await this.syncRepo.getQueue();
    let success = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        switch (item.action) {
          case 'create':
          case 'update':
            await this.syncToGoogle.syncEvent(item.event);
            break;
          case 'delete':
            await this.syncToGoogle.deleteEvent(item.event);
            break;
        }
        await this.syncRepo.removeFromQueue(item.id);
        success++;
      } catch (error: any) {
        failed++;
        if (item.retryCount >= 5) {
          // 최대 재시도 횟수 초과 시 큐에서 제거
          await this.syncRepo.removeFromQueue(item.id);
        }
        // 429 또는 5xx 에러 시 exponential backoff 대기
        if (error.code === 429 || (error.code && error.code >= 500)) {
          const delay = Math.min(Math.pow(2, item.retryCount) * 1000, 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return { success, failed };
  }
}
```

### 4.5 ManageCalendarMapping (캘린더 매핑 관리)

```typescript
// usecases/calendar/ManageCalendarMapping.ts
import { ICalendarSyncRepository } from '../../domain/repositories/ICalendarSyncRepository';
import { IGoogleCalendarPort } from '../../domain/ports/IGoogleCalendarPort';
import { CalendarMapping } from '../../domain/entities/CalendarMapping';
import { GoogleCalendarInfo } from '../../domain/entities/GoogleCalendarInfo';
import { AuthenticateGoogle } from './AuthenticateGoogle';

export class ManageCalendarMapping {
  constructor(
    private readonly auth: AuthenticateGoogle,
    private readonly calendarPort: IGoogleCalendarPort,
    private readonly syncRepo: ICalendarSyncRepository,
  ) {}

  /** 사용자의 구글 캘린더 목록 조회 */
  async listGoogleCalendars(): Promise<GoogleCalendarInfo[]> {
    const accessToken = await this.auth.getValidAccessToken();
    return this.calendarPort.listCalendars(accessToken);
  }

  /** 새 구글 캘린더 생성 */
  async createGoogleCalendar(name: string): Promise<GoogleCalendarInfo> {
    const accessToken = await this.auth.getValidAccessToken();
    return this.calendarPort.createCalendar(accessToken, name);
  }

  /** 매핑 저장 */
  async saveMappings(mappings: CalendarMapping[]): Promise<void> {
    await this.syncRepo.saveMappings(mappings);
  }

  /** 현재 매핑 조회 */
  async getMappings(): Promise<CalendarMapping[]> {
    return this.syncRepo.getMappings();
  }
}
```

---

## 5. Adapters 레이어

### 5.1 Repository 구현체

```typescript
// adapters/repositories/GoogleCalendarSyncRepository.ts
import { ICalendarSyncRepository } from '../../domain/repositories/ICalendarSyncRepository';
import { IStoragePort } from '../../domain/ports/IStoragePort';
import { CalendarMapping } from '../../domain/entities/CalendarMapping';
import { SyncState } from '../../domain/entities/SyncState';
import { SyncQueueItem } from '../../domain/entities/SyncQueueItem';

const SYNC_DATA_FILE = 'calendar-sync';
const SYNC_QUEUE_FILE = 'calendar-sync-queue';

interface CalendarSyncData {
  mappings: CalendarMapping[];
  syncState: SyncState;
}

const DEFAULT_SYNC_STATE: SyncState = {
  status: 'idle',
  lastSyncedAt: null,
  lastError: null,
  pendingChanges: 0,
  syncTokens: {},
  recentlyPushedToGoogle: [],
  recentlyPulledFromGoogle: [],
};

export class GoogleCalendarSyncRepository implements ICalendarSyncRepository {
  constructor(private readonly storage: IStoragePort) {}

  private async getData(): Promise<CalendarSyncData> {
    const data = await this.storage.read<CalendarSyncData>(SYNC_DATA_FILE);
    return data || {
      mappings: [],
      syncState: DEFAULT_SYNC_STATE,
    };
  }

  private async saveData(data: CalendarSyncData): Promise<void> {
    await this.storage.write(SYNC_DATA_FILE, data);
  }

  // 매핑
  async getMappings(): Promise<CalendarMapping[]> {
    const data = await this.getData();
    return data.mappings;
  }

  async saveMappings(mappings: CalendarMapping[]): Promise<void> {
    const data = await this.getData();
    data.mappings = mappings;
    await this.saveData(data);
  }

  // 동기화 상태
  async getSyncState(): Promise<SyncState> {
    const data = await this.getData();
    return data.syncState;
  }

  async saveSyncState(state: SyncState): Promise<void> {
    const data = await this.getData();
    data.syncState = state;
    await this.saveData(data);
  }

  // 오프라인 큐
  async getQueue(): Promise<SyncQueueItem[]> {
    const queue = await this.storage.read<SyncQueueItem[]>(SYNC_QUEUE_FILE);
    return queue || [];
  }

  async addToQueue(item: SyncQueueItem): Promise<void> {
    const queue = await this.getQueue();
    queue.push(item);
    await this.storage.write(SYNC_QUEUE_FILE, queue);
  }

  async removeFromQueue(itemId: string): Promise<void> {
    const queue = await this.getQueue();
    const filtered = queue.filter(q => q.id !== itemId);
    await this.storage.write(SYNC_QUEUE_FILE, filtered);
  }

  async clearQueue(): Promise<void> {
    await this.storage.write(SYNC_QUEUE_FILE, []);
  }
}
```

### 5.2 토큰 암호화 저장소 구현체 (IPC 기반)

```typescript
// adapters/repositories/ElectronTokenStorage.ts
import { ITokenStoragePort } from '../../domain/ports/ITokenStoragePort';
import { GoogleAuthTokens } from '../../domain/ports/IGoogleAuthPort';

/**
 * Electron IPC를 통해 메인 프로세스의 safeStorage에 토큰을 저장/조회/삭제.
 * 렌더러 프로세스에서 사용되며, 실제 암호화는 메인 프로세스에서 수행.
 */
export class ElectronTokenStorage implements ITokenStoragePort {
  async getTokens(): Promise<GoogleAuthTokens | null> {
    const raw = await window.electronAPI.secureRead('calendar-tokens');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async saveTokens(tokens: GoogleAuthTokens): Promise<void> {
    await window.electronAPI.secureWrite('calendar-tokens', JSON.stringify(tokens));
  }

  async deleteTokens(): Promise<void> {
    await window.electronAPI.secureDelete('calendar-tokens');
  }
}
```

### 5.3 Zustand 스토어

```typescript
// adapters/stores/useCalendarSyncStore.ts
import { create } from 'zustand';
import { container } from '../di/container';
import { CalendarMapping } from '../../domain/entities/CalendarMapping';
import { SyncState, SyncStatus } from '../../domain/entities/SyncState';
import { GoogleCalendarInfo } from '../../domain/entities/GoogleCalendarInfo';
import { GoogleAuthTokens } from '../../domain/ports/IGoogleAuthPort';

interface CalendarSyncStore {
  // 상태
  isConnected: boolean;
  email: string | null;
  syncState: SyncState;
  mappings: CalendarMapping[];
  googleCalendars: GoogleCalendarInfo[];
  isLoading: boolean;
  error: string | null;

  // 동기화 설정
  syncInterval: number; // 분 단위
  syncOnStart: boolean;
  syncOnFocus: boolean;
  autoResolveConflicts: boolean;

  // 충돌
  conflicts: Array<{ local: any; remote: any }>;

  // PKCE code_verifier (인증 진행 중 임시 보관)
  pendingCodeVerifier: string | null;

  // 액션
  initialize(): Promise<void>;
  startAuth(): Promise<void>;
  completeAuth(code: string): Promise<void>;
  disconnect(preserveGoogleEvents?: boolean): Promise<void>;
  syncNow(): Promise<void>;
  updateMappings(mappings: CalendarMapping[]): Promise<void>;
  fetchGoogleCalendars(): Promise<void>;
  resolveConflict(index: number, choice: 'local' | 'remote'): Promise<void>;
  setSyncInterval(minutes: number): void;
  setSyncOnStart(enabled: boolean): void;
  setSyncOnFocus(enabled: boolean): void;
}

export const useCalendarSyncStore = create<CalendarSyncStore>((set, get) => ({
  isConnected: false,
  email: null,
  syncState: {
    status: 'idle',
    lastSyncedAt: null,
    lastError: null,
    pendingChanges: 0,
    syncTokens: {},
    recentlyPushedToGoogle: [],
    recentlyPulledFromGoogle: [],
  },
  mappings: [],
  googleCalendars: [],
  isLoading: false,
  error: null,
  syncInterval: 5,
  syncOnStart: true,
  syncOnFocus: true,
  autoResolveConflicts: true,
  conflicts: [],
  pendingCodeVerifier: null,

  initialize: async () => {
    const auth = container.authenticateGoogle;
    const connected = await auth.isConnected();
    if (connected) {
      const tokens = await container.tokenStorage.getTokens();
      const mappings = await container.calendarSyncRepo.getMappings();
      const syncState = await container.calendarSyncRepo.getSyncState();
      set({
        isConnected: true,
        email: tokens?.email || null,
        mappings,
        syncState,
      });
    }
  },

  startAuth: async () => {
    const { url, codeVerifier } = container.authenticateGoogle.getAuthUrl();
    // PKCE code_verifier를 임시 보관
    set({ pendingCodeVerifier: codeVerifier });
    // Electron IPC로 OAuth 플로우 시작
    window.electronAPI?.openOAuth(url);
  },

  completeAuth: async (code: string) => {
    const { pendingCodeVerifier } = get();
    if (!pendingCodeVerifier) {
      set({ error: 'PKCE code_verifier가 없습니다. 다시 연결해주세요.' });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const tokens = await container.authenticateGoogle.authenticate(code, pendingCodeVerifier);
      set({
        isConnected: true,
        email: tokens.email,
        isLoading: false,
        pendingCodeVerifier: null,
      });
    } catch (err: any) {
      set({ error: err.message, isLoading: false, pendingCodeVerifier: null });
    }
  },

  disconnect: async (preserveGoogleEvents: boolean = false) => {
    await container.authenticateGoogle.disconnect();

    if (!preserveGoogleEvents) {
      // 구글 출처 일정 제거
      const eventsRepo = container.eventsRepo;
      const data = await eventsRepo.getEvents();
      if (data) {
        data.events = data.events.filter(e => e.source !== 'google');
        await eventsRepo.saveEvents(data);
      }
    } else {
      // 구글 출처 일정을 로컬로 전환 (동기화 메타 제거)
      const eventsRepo = container.eventsRepo;
      const data = await eventsRepo.getEvents();
      if (data) {
        data.events = data.events.map(e => {
          if (e.source === 'google') {
            return {
              ...e,
              syncStatus: 'local-only',
              googleEventId: undefined,
              googleCalendarId: undefined,
              lastSyncedAt: undefined,
              localUpdatedAt: undefined,
              googleUpdatedAt: undefined,
              etag: undefined,
              source: undefined,
            };
          }
          return e;
        });
        await eventsRepo.saveEvents(data);
      }
    }

    set({
      isConnected: false,
      email: null,
      mappings: [],
      syncState: {
        status: 'idle',
        lastSyncedAt: null,
        lastError: null,
        pendingChanges: 0,
        syncTokens: {},
        recentlyPushedToGoogle: [],
        recentlyPulledFromGoogle: [],
      },
    });
  },

  syncNow: async () => {
    const state = get();
    if (!state.isConnected) return;

    set({ syncState: { ...state.syncState, status: 'syncing' } });
    try {
      // 1. 오프라인 큐 처리
      await container.flushSyncQueue.execute();

      // 2. 구글 → 쌤핀
      const result = await container.syncFromGoogle.execute(state.autoResolveConflicts);

      // 3. 충돌 처리
      if (result.conflicts.length > 0) {
        set({ conflicts: result.conflicts });
      }

      const syncState = await container.calendarSyncRepo.getSyncState();
      set({ syncState });
    } catch (err: any) {
      set({
        syncState: {
          ...state.syncState,
          status: 'error',
          lastError: err.message,
        },
      });
    }
  },

  updateMappings: async (mappings) => {
    await container.manageCalendarMapping.saveMappings(mappings);
    set({ mappings });
  },

  fetchGoogleCalendars: async () => {
    const calendars = await container.manageCalendarMapping.listGoogleCalendars();
    set({ googleCalendars: calendars });
  },

  resolveConflict: async (index, choice) => {
    // 충돌 해결 로직
    const { conflicts } = get();
    const conflict = conflicts[index];
    if (!conflict) return;

    const event = choice === 'local' ? conflict.local : conflict.remote;
    // 선택한 버전으로 저장
    const eventsRepo = container.eventsRepo;
    const data = await eventsRepo.getEvents();
    if (data) {
      const idx = data.events.findIndex((e: any) => e.id === event.id);
      if (idx !== -1) {
        data.events[idx] = event;
      }
      await eventsRepo.saveEvents(data);
    }

    const newConflicts = [...conflicts];
    newConflicts.splice(index, 1);
    set({ conflicts: newConflicts });
  },

  setSyncInterval: (minutes) => set({ syncInterval: minutes }),
  setSyncOnStart: (enabled) => set({ syncOnStart: enabled }),
  setSyncOnFocus: (enabled) => set({ syncOnFocus: enabled }),
}));
```

### 5.4 DI 컨테이너 확장

```typescript
// adapters/di/container.ts (확장 부분)
import { GoogleOAuthClient } from '../../infrastructure/google/GoogleOAuthClient';
import { GoogleCalendarApiClient } from '../../infrastructure/google/GoogleCalendarApiClient';
import { GoogleCalendarSyncRepository } from '../repositories/GoogleCalendarSyncRepository';
import { ElectronTokenStorage } from '../repositories/ElectronTokenStorage';
import { AuthenticateGoogle } from '../../usecases/calendar/AuthenticateGoogle';
import { SyncToGoogle } from '../../usecases/calendar/SyncToGoogle';
import { SyncFromGoogle } from '../../usecases/calendar/SyncFromGoogle';
import { FlushSyncQueue } from '../../usecases/calendar/FlushSyncQueue';
import { ManageCalendarMapping } from '../../usecases/calendar/ManageCalendarMapping';

// Infrastructure 구현체
const googleAuth = new GoogleOAuthClient();
const googleCalendar = new GoogleCalendarApiClient();

// 토큰 저장소 (IPC 격리)
const tokenStorage = new ElectronTokenStorage();

// Repository (토큰 메서드 제거됨)
const calendarSyncRepo = new GoogleCalendarSyncRepository(storage);

// Use Cases
const authenticateGoogle = new AuthenticateGoogle(googleAuth, tokenStorage);
const syncToGoogle = new SyncToGoogle(authenticateGoogle, googleCalendar, eventsRepo, calendarSyncRepo);
const syncFromGoogle = new SyncFromGoogle(authenticateGoogle, googleCalendar, eventsRepo, calendarSyncRepo);
const flushSyncQueue = new FlushSyncQueue(syncToGoogle, calendarSyncRepo);
const manageCalendarMapping = new ManageCalendarMapping(authenticateGoogle, googleCalendar, calendarSyncRepo);

export const container = {
  // ... 기존 항목들 ...

  // 구글 캘린더 관련
  tokenStorage,
  calendarSyncRepo,
  authenticateGoogle,
  syncToGoogle,
  syncFromGoogle,
  flushSyncQueue,
  manageCalendarMapping,
};
```

### 5.5 컴포넌트 구조

```
src/adapters/components/
├── Settings/
│   └── CalendarSettings.tsx     # 설정 페이지 구글 캘린더 섹션
├── Schedule/
│   └── Schedule.tsx             # (기존 확장) 구글 일정 통합 표시
├── Dashboard/
│   └── DashboardEvents.tsx      # (기존 확장) 구글 일정 뱃지 표시
├── Calendar/                    # 새 폴더
│   ├── CalendarMappingModal.tsx  # 카테고리 매핑 설정 모달
│   ├── ConflictResolveModal.tsx  # 충돌 해결 모달
│   ├── SyncStatusBar.tsx        # 동기화 상태 표시 (사이드바 하단)
│   └── GoogleBadge.tsx          # 🌐G 뱃지 컴포넌트
└── Layout/
    └── Sidebar.tsx              # (기존 확장) SyncStatusBar 추가
```

---

## 6. Infrastructure 레이어

### 6.1 Electron OAuth 플로우 (로컬 서버 방식 + PKCE)

#### 플로우 상세

```
┌─────────────┐    1. 인증 URL 생성     ┌──────────────┐
│  렌더러      │ ──────────────────────→ │ Electron Main │
│  (React)     │  (PKCE code_verifier   │ (main.ts)     │
│              │   + code_challenge)    │               │
│              │    2. 시스템 브라우저    │  로컬 HTTP    │
│              │       열기              │  서버 시작     │
│              │                        │  (포트 임의)   │
└──────────────┘                        └───────┬───────┘
                                                │
                                    3. 구글 로그인 │
                                                ▼
                                        ┌──────────────┐
                                        │ 시스템 브라우저 │
                                        │ (Chrome 등)   │
                                        │              │
                                        │ Google OAuth  │
                                        │ 동의 화면     │
                                        └──────┬───────┘
                                               │
                                    4. 리다이렉트 │
                                    (code 포함)   │
                                               ▼
                                        ┌──────────────┐
                                        │ 로컬 서버     │
                                        │ localhost:    │
                                        │ {random port} │
                                        │              │
                                        │ code 수신     │
                                        └──────┬───────┘
                                               │
                                    5. code +   │
                                    code_verifier│
                                    → 토큰 교환  │
                                               ▼
┌──────────────┐    7. 토큰 전달        ┌──────────────┐
│  렌더러      │ ◄──────────────────── │ Electron Main │
│  (React)     │    (IPC)              │              │
│  연결 완료!  │                        │ 토큰 교환    │
└──────────────┘                        │ + 암호화 저장 │
                                        └──────────────┘
```

### 6.2 GoogleOAuthClient 구현 (PKCE 포함)

```typescript
// infrastructure/google/GoogleOAuthClient.ts
import { IGoogleAuthPort, GoogleAuthTokens, RefreshedTokens } from '../../domain/ports/IGoogleAuthPort';
import crypto from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export class GoogleOAuthClient implements IGoogleAuthPort {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    // 빌드 시 환경변수 또는 credentials 파일에서 로드
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = ''; // 런타임에 로컬 서버 포트로 설정
  }

  setRedirectUri(uri: string): void {
    this.redirectUri = uri;
  }

  // === PKCE 메서드 ===

  /** PKCE code_verifier 생성 (RFC 7636) */
  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /** PKCE code_challenge 생성 (S256) */
  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  // === IGoogleAuthPort 구현 ===

  getAuthUrl(): { url: string; codeVerifier: string } {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
      codeVerifier,
    };
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleAuthTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new Error(`토큰 교환 실패: ${response.statusText}`);
    }

    const data = await response.json();

    // 이메일 가져오기 (userinfo endpoint)
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const user = await userInfo.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email: user.email,
    };
  }

  async refreshTokens(refreshToken: string): Promise<RefreshedTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(`토큰 갱신 실패: ${response.statusText}`);
    }

    const data = await response.json();

    // email은 반환하지 않음 — 호출자(AuthenticateGoogle)가 기존 email을 보존
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // 새 refresh token이 없으면 기존 것 유지
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${accessToken}`, {
      method: 'POST',
    });
  }
}
```

### 6.3 GoogleCalendarApiClient 구현 (Rate Limiting + Retry 포함)

```typescript
// infrastructure/google/GoogleCalendarApiClient.ts
import { IGoogleCalendarPort, GoogleCalendarEvent, SyncResult } from '../../domain/ports/IGoogleCalendarPort';
import { GoogleCalendarInfo } from '../../domain/entities/GoogleCalendarInfo';

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

export class GoogleCalendarApiClient implements IGoogleCalendarPort {
  /**
   * 공통 API 요청 헬퍼 (Rate Limiting + Exponential Backoff 재시도 포함)
   * - 429 (Rate Limit): Retry-After 헤더 존중
   * - 5xx (서버 에러): exponential backoff
   * - 그 외 4xx: 재시도 없이 즉시 에러
   */
  private async request<T>(
    accessToken: string,
    path: string,
    options?: RequestInit,
    retries: number = 3,
  ): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (response.status === 429 || response.status >= 500) {
        if (attempt < retries) {
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      if (!response.ok) {
        const error: any = new Error(`Google API 에러: ${response.status} ${response.statusText}`);
        error.code = response.status;
        throw error;
      }

      // DELETE 등 body가 없는 응답 처리
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return response.json();
      }
      return undefined as T;
    }
    throw new Error('최대 재시도 횟수 초과');
  }

  async listCalendars(accessToken: string): Promise<GoogleCalendarInfo[]> {
    const data = await this.request<any>(accessToken, '/users/me/calendarList');
    return data.items.map((item: any) => ({
      id: item.id,
      summary: item.summary,
      backgroundColor: item.backgroundColor,
      primary: item.primary || false,
      accessRole: item.accessRole,
    }));
  }

  async createCalendar(
    accessToken: string,
    summary: string,
    color?: string,
  ): Promise<GoogleCalendarInfo> {
    const data = await this.request<any>(accessToken, '/calendars', {
      method: 'POST',
      body: JSON.stringify({ summary }),
    });
    return {
      id: data.id,
      summary: data.summary,
      backgroundColor: color || '#4285f4',
      primary: false,
      accessRole: 'owner',
    };
  }

  async createEvent(
    accessToken: string,
    calendarId: string,
    event: GoogleCalendarEvent,
  ): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify(event),
      },
    );
  }

  async updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: GoogleCalendarEvent,
  ): Promise<GoogleCalendarEvent> {
    return this.request<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      {
        method: 'PUT',
        body: JSON.stringify(event),
      },
    );
  }

  async deleteEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<void> {
    await this.request<void>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      { method: 'DELETE' },
    );
  }

  async incrementalSync(
    accessToken: string,
    calendarId: string,
    syncToken?: string,
  ): Promise<SyncResult> {
    const params = new URLSearchParams();
    if (syncToken) params.set('syncToken', syncToken);
    params.set('showDeleted', 'true');
    params.set('singleEvents', 'true'); // 반복 일정을 개별 인스턴스로 확장

    const events: GoogleCalendarEvent[] = [];
    const deletedEventIds: string[] = [];
    let nextSyncToken = '';
    let pageToken: string | undefined;

    do {
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.request<any>(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      );

      for (const item of data.items || []) {
        if (item.status === 'cancelled') {
          deletedEventIds.push(item.id);
        } else {
          events.push(item);
        }
      }

      pageToken = data.nextPageToken;
      if (data.nextSyncToken) {
        nextSyncToken = data.nextSyncToken;
      }
    } while (pageToken);

    return { events, nextSyncToken, deletedEventIds };
  }

  async fullSync(
    accessToken: string,
    calendarId: string,
    timeMin?: string,
  ): Promise<SyncResult> {
    const params = new URLSearchParams({
      showDeleted: 'false',
      singleEvents: 'true', // 반복 일정을 개별 인스턴스로 확장
      orderBy: 'startTime',
      maxResults: '2500',
    });
    if (timeMin) {
      params.set('timeMin', timeMin);
    } else {
      // 기본: 1년 전부터
      const oneYearAgo = new Date(Date.now() - 365 * 86400000);
      params.set('timeMin', oneYearAgo.toISOString());
    }

    const events: GoogleCalendarEvent[] = [];
    let nextSyncToken = '';
    let pageToken: string | undefined;

    do {
      if (pageToken) params.set('pageToken', pageToken);
      const data = await this.request<any>(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      );

      events.push(...(data.items || []));

      pageToken = data.nextPageToken;
      if (data.nextSyncToken) {
        nextSyncToken = data.nextSyncToken;
      }
    } while (pageToken);

    return { events, nextSyncToken, deletedEventIds: [] };
  }
}
```

### 6.4 Electron Main 프로세스 OAuth 핸들러

```typescript
// electron/ipc/oauth.ts
import { ipcMain, BrowserWindow, shell } from 'electron';
import * as http from 'http';
import * as url from 'url';

let oauthServer: http.Server | null = null;

export function registerOAuthHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('oauth:start', async (_event, authUrl: string) => {
    return new Promise<string>((resolve, reject) => {
      // 랜덤 포트로 로컬 HTTP 서버 시작
      oauthServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        const code = parsedUrl.query.code as string;

        if (code) {
          // 성공 페이지 응답
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#0a0e17;color:#e2e8f0">
                <div style="text-align:center">
                  <h1>✅ 쌤핀 인증 완료!</h1>
                  <p>이 창을 닫고 쌤핀으로 돌아가세요.</p>
                </div>
              </body>
            </html>
          `);

          // 서버 종료
          oauthServer?.close();
          oauthServer = null;

          // 쌤핀 창 포커스
          mainWindow.focus();

          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('인증 실패');
          reject(new Error('인증 코드를 받지 못했습니다'));
        }
      });

      oauthServer.listen(0, '127.0.0.1', () => {
        const port = (oauthServer!.address() as any).port;
        const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

        // authUrl의 redirect_uri를 실제 포트로 교체
        const finalUrl = authUrl.replace(
          /redirect_uri=[^&]*/,
          `redirect_uri=${encodeURIComponent(redirectUri)}`,
        );

        // 렌더러에 redirectUri 전달 (토큰 교환 시 필요)
        mainWindow.webContents.send('oauth:redirectUri', redirectUri);

        // 시스템 브라우저에서 인증 페이지 열기
        shell.openExternal(finalUrl);
      });

      // 5분 타임아웃
      setTimeout(() => {
        if (oauthServer) {
          oauthServer.close();
          oauthServer = null;
          reject(new Error('인증 시간이 초과되었습니다'));
        }
      }, 5 * 60 * 1000);
    });
  });

  ipcMain.handle('oauth:cancel', () => {
    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }
  });
}
```

### 6.5 토큰 암호화 아키텍처

Electron `safeStorage`는 **메인 프로세스 전용** API이다. 렌더러 프로세스에서 직접 호출할 수 없으므로, IPC를 통해 격리한다.

#### 메인 프로세스 IPC 핸들러

```typescript
// electron/ipc/secureStorage.ts
import { ipcMain, safeStorage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const TOKEN_PATH = path.join(app.getPath('userData'), '.calendar-tokens');

export function registerSecureStorageHandlers(): void {
  ipcMain.handle('calendar:save-tokens', (_event, tokensJson: string) => {
    if (!safeStorage.isEncryptionAvailable()) {
      // 폴백: 평문 저장 (경고 표시)
      console.warn('[보안 경고] safeStorage 사용 불가 — 토큰이 평문으로 저장됩니다');
      fs.writeFileSync(TOKEN_PATH, tokensJson, 'utf-8');
      return;
    }
    const encrypted = safeStorage.encryptString(tokensJson);
    fs.writeFileSync(TOKEN_PATH, encrypted);
  });

  ipcMain.handle('calendar:get-tokens', () => {
    if (!fs.existsSync(TOKEN_PATH)) return null;
    const data = fs.readFileSync(TOKEN_PATH);
    if (!safeStorage.isEncryptionAvailable()) {
      return data.toString('utf-8');
    }
    return safeStorage.decryptString(data);
  });

  ipcMain.handle('calendar:delete-tokens', () => {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
  });
}
```

#### 아키텍처 다이어그램

```
┌─────────────────────┐     IPC      ┌─────────────────────┐
│    렌더러 프로세스    │ ◄──────────► │   메인 프로세스       │
│                     │              │                     │
│  ElectronToken      │  calendar:   │  secureStorage.ts   │
│  Storage            │  save-tokens │                     │
│  (ITokenStoragePort)│  get-tokens  │  safeStorage.       │
│                     │  delete-     │  encryptString()    │
│                     │  tokens      │  decryptString()    │
└─────────────────────┘              └─────────────────────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │ OS 키체인        │
                                     │ Win: DPAPI       │
                                     │ Mac: Keychain    │
                                     │ Linux: kwallet/  │
                                     │        gnome-    │
                                     │        keyring   │
                                     └─────────────────┘
```

---

## 7. 동기화 알고리즘

### 7.1 동기화 전략 개요

```
┌─────────────────────────────────────────────────────────┐
│                    동기화 사이클                          │
│                                                         │
│  1. 네트워크 상태 확인                                    │
│     ├─ 오프라인 → 변경사항을 로컬 큐에 저장              │
│     └─ 온라인 → 2단계 진행                               │
│                                                         │
│  2. 오프라인 큐 비우기 (flush)                            │
│     → 큐의 변경사항을 순서대로 구글에 반영                 │
│     → 실패 시 exponential backoff 재시도                  │
│                                                         │
│  3. 구글 → 쌤핀 (Pull)                                   │
│     → incremental sync (syncToken)                       │
│     → 동기화 루프 방지: recentlyPushedToGoogle 체크       │
│     → 변경/추가/삭제 감지 → 로컬 반영                     │
│                                                         │
│  4. 충돌 해결                                            │
│     ├─ 자동 (최근 수정 우선 — localUpdatedAt 기반)        │
│     └─ 수동 (사용자 선택 UI)                              │
│                                                         │
│  5. 상태 업데이트                                         │
│     → syncToken 저장, lastSyncedAt 갱신                  │
│     → recentlyPushed/Pulled 업데이트                     │
└─────────────────────────────────────────────────────────┘
```

### 7.2 동기화 트리거 전략 (Smart Polling)

#### ❌ Google Push Notification (사용 불가)

- 공개 HTTPS URL + SSL 인증서 필요 → 데스크톱 앱에서 불가능
- 서버 인프라가 있다면 향후 고려 가능 (v2.0+)

#### ✅ Smart Polling (채택)

| 트리거 | 동기화 방식 | 설명 |
|--------|-----------|------|
| 앱 시작 시 | incremental sync | syncToken 기반 변경분 확인 |
| 앱 포커스 복귀 | incremental sync | 백그라운드 → 포그라운드 전환 시 |
| 주기적 (기본 5분) | incremental sync | 사용자 설정 가능 (1~30분) |
| 일정 CRUD 즉시 | push only | 쌤핀 변경 → 구글에 즉시 push |
| 수동 "지금 동기화" | full incremental sync | 사용자 요청 |
| 네트워크 복귀 | 큐 flush + incremental sync | 오프라인 → 온라인 전환 시 |

#### Exponential Backoff (에러 시)

```typescript
// 동기화 폴링 간격 제어
class SyncScheduler {
  private baseInterval: number; // 사용자 설정 (기본 5분)
  private currentInterval: number;
  private maxInterval: number = 30 * 60 * 1000; // 최대 30분

  /** 에러 발생 시 간격 확대 */
  backoff(): void {
    this.currentInterval = Math.min(this.currentInterval * 2, this.maxInterval);
  }

  /** 성공 시 기본 간격으로 복귀 */
  reset(): void {
    this.currentInterval = this.baseInterval;
  }
}
```

- API 에러 시: 1분 → 2분 → 4분 → 8분 → 최대 30분
- 성공 시 기본 간격으로 복귀
- Rate limit (429) 시: `Retry-After` 헤더 존중

### 7.3 동기화 루프 방지

양방향 동기화에서 가장 흔한 버그: A→B push가 B에서 변경 이벤트를 발생시키고, B→A pull을 다시 트리거하는 무한 루프.

#### Echo Detection 로직

```typescript
// SyncToGoogle에서: push 후 이벤트 ID 기록
syncState.recentlyPushedToGoogle.push(googleEventId);

// SyncFromGoogle에서: pull 시 에코 감지
for (const gEvent of syncResult.events) {
  if (recentlyPushed.has(gEvent.id)) {
    recentlyPushed.delete(gEvent.id); // 한 번만 무시
    continue; // 이 변경은 우리가 만든 것이므로 skip
  }
  // ... 나머지 처리
}
```

#### 동작 원리

1. 쌤핀에서 일정 수정 → 구글에 push → `recentlyPushedToGoogle`에 ID 추가
2. 다음 pull 사이클에서 구글이 해당 이벤트의 변경을 보내옴
3. `recentlyPushedToGoogle`에 있으므로 무시 (우리가 push한 것의 에코)
4. Set에서 삭제 (한 번만 무시)

### 7.4 Incremental Sync (syncToken)

Google Calendar API의 `syncToken`을 활용한 효율적 증분 동기화:

```
초기 동기화:
  GET /calendars/{id}/events?singleEvents=true&timeMin=1년전
    → 모든 이벤트 + nextSyncToken 수신
    → nextSyncToken 저장

이후 동기화:
  GET /calendars/{id}/events?syncToken={저장된 토큰}&singleEvents=true
    → 변경된 이벤트만 수신 + 새 nextSyncToken
    → 저장된 토큰 갱신

syncToken 만료 시 (HTTP 410):
  → 전체 동기화 재실행 + 새 syncToken 획득
```

### 7.5 충돌 해결 알고리즘

```typescript
// 충돌 해결 전략
enum ConflictStrategy {
  LATEST_WINS = 'latest',    // 최근 수정 우선 (기본)
  LOCAL_WINS = 'local',       // 항상 로컬 우선
  REMOTE_WINS = 'remote',     // 항상 구글 우선
  MANUAL = 'manual',          // 사용자에게 선택 요청
}

// 충돌 판정 로직 (localUpdatedAt 기반)
function isConflict(local: SchoolEvent, remote: GoogleCalendarEvent): boolean {
  if (!local.lastSyncedAt) return false;

  const syncTime = new Date(local.lastSyncedAt).getTime();

  // 1. 로컬이 마지막 동기화 이후 수정되었는가? (localUpdatedAt 기반)
  const localModified = local.localUpdatedAt
    ? new Date(local.localUpdatedAt).getTime() > syncTime
    : false;

  // 2. 구글도 마지막 동기화 이후 수정되었는가?
  const remoteModified = new Date(remote.updated).getTime() > syncTime;

  return localModified && remoteModified;
}
```

### 7.6 에러 재시도 전략

```typescript
// Exponential backoff (큐 처리 시)
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]; // 1초, 2초, 4초, 8초, 16초

async function withRetry<T>(fn: () => Promise<T>, maxRetries: number = 5): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries) throw error;

      // 429 (Rate Limit) 또는 5xx (서버 에러)만 재시도
      if (error.code === 429 || error.code >= 500) {
        const retryAfter = error.retryAfter; // Retry-After 헤더 값
        const delay = retryAfter
          ? retryAfter * 1000
          : RETRY_DELAYS[attempt] || 30000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // 4xx 에러는 재시도 안 함
      }
    }
  }
  throw new Error('최대 재시도 횟수 초과');
}
```

---

## 8. 반복 일정 처리 전략

### 8.1 v1.0: 개별 인스턴스로 처리 (singleEvents=true)

Google Calendar API에 `singleEvents=true` 파라미터를 전달하면, 반복 일정이 개별 인스턴스로 펼쳐져 반환된다.

**장점:**
- 쌤핀의 기존 데이터 모델(`SchoolEvent`)과 완벽 호환
- 별도의 반복 규칙 파싱 로직 불필요
- 구현 복잡도 최소화

**제한:**
- 반복 패턴 자체를 수정하려면 구글 캘린더에서 직접 해야 함
- 개별 인스턴스 수정 시 해당 인스턴스만 영향 (예외 처리)

```typescript
// fullSync, incrementalSync 모두 singleEvents=true 사용
const params = new URLSearchParams({
  singleEvents: 'true',  // 반복 일정 → 개별 인스턴스로 확장
  // ...
});
```

### 8.2 v2.0 로드맵: RRULE 지원

```
v2.0 계획:
- singleEvents=false로 전환
- RRULE(RFC 5545) 파싱 라이브러리 도입 (예: rrule.js)
- SchoolEvent에 recurrence 필드 추가
- 반복 일정의 생성/수정/삭제 양방향 지원
```

---

## 9. 데이터 모델 확장

### 9.1 calendar-sync.json (새로 추가)

```typescript
interface CalendarSyncData {
  // 카테고리 매핑
  mappings: CalendarMapping[];

  // 동기화 상태
  syncState: {
    status: 'idle' | 'syncing' | 'synced' | 'error' | 'offline';
    lastSyncedAt: string | null;
    lastError: string | null;
    pendingChanges: number;
    syncTokens: Record<string, string>;
    recentlyPushedToGoogle: string[];
    recentlyPulledFromGoogle: string[];
  };

  // 동기화 설정
  settings: {
    syncInterval: number;      // 분 단위 (기본 5)
    syncOnStart: boolean;      // 기본 true
    syncOnFocus: boolean;      // 기본 true
    autoResolveConflicts: boolean; // 기본 true
    conflictStrategy: 'latest' | 'local' | 'remote' | 'manual';
    googleToSsampin: boolean;  // 구글→쌤핀 방향 활성화 (기본 false)
    googleCalendarsToImport: string[]; // 가져올 구글 캘린더 ID 목록
  };
}

// 주의: 인증 토큰은 별도 암호화 파일(.calendar-tokens)에 IPC를 통해 저장
```

### 9.2 calendar-sync-queue.json (새로 추가)

```typescript
// 오프라인 큐 (배열)
type CalendarSyncQueue = SyncQueueItem[];
```

### 9.3 school-events.json (기존 확장)

기존 `SchoolEvent`에 optional 필드 추가 (3.2절 참고). `localUpdatedAt` 포함. 하위 호환성 완벽 유지.

### 9.4 데이터 크기 추가 추정

| 파일 | 예상 크기 | 비고 |
|------|----------|------|
| calendar-sync.json | ~1KB | 매핑 + 상태 (토큰 분리됨) |
| calendar-sync-queue.json | ~500B | 보통 빈 배열, 오프라인 시 증가 |
| .calendar-tokens | ~300B | safeStorage 암호화된 토큰 |
| school-events.json (확장) | +~2KB | 구글 필드 추가분 |

---

## 10. 보안

### 10.1 토큰 보안

| 항목 | 방법 |
|------|------|
| access token 저장 | Electron safeStorage (OS 키체인 암호화), **IPC를 통해 메인 프로세스에서만 접근** |
| refresh token 저장 | Electron safeStorage (OS 키체인 암호화), **IPC를 통해 메인 프로세스에서만 접근** |
| 메모리 내 토큰 | 사용 직후 참조 해제, 전역 상태에 저장 안 함 |
| 토큰 전송 | HTTPS만 사용 (구글 API는 기본 HTTPS) |
| 토큰 폐기 | 연결 해제 시 구글 revoke endpoint 호출 |
| PKCE | authorization code interception 방지 (S256) |

### 10.2 OAuth Client Credentials

| 항목 | 방법 |
|------|------|
| client_id | 빌드 시 환경변수로 주입 (소스코드에 하드코딩 금지) |
| client_secret | Electron 메인 프로세스에서만 접근, 렌더러에 노출 안 함 |
| redirect_uri | `http://127.0.0.1:{random_port}` (로컬 전용) |

### 10.3 Electron 보안 원칙

- `contextIsolation: true` — 렌더러와 preload 격리
- `nodeIntegration: false` — 렌더러에서 Node.js 접근 차단
- OAuth 토큰 교환은 메인 프로세스에서 수행 (렌더러에 client_secret 전달 안 함)
- IPC를 통한 최소한의 데이터만 렌더러에 전달
- safeStorage는 메인 프로세스 전용 — `ITokenStoragePort` + IPC로 격리

### 10.4 Google Cloud 프로젝트 설정

```
프로젝트 설정:
- OAuth 동의 화면: "외부"
- 개발 시: 테스트 모드 (최대 100명)
- 배포 시: 프로덕션 모드 전환 (14절 참고)
- 앱 이름: "쌤핀"
- 범위: https://www.googleapis.com/auth/calendar (캘린더 읽기/쓰기, Sensitive scope)
- 클라이언트 유형: "데스크톱 애플리케이션"
- 개인정보처리방침 URL: 쌤핀 랜딩페이지 /privacy (14절 참고)
```

---

## 11. Preload 스크립트 확장

```typescript
// electron/preload.ts (확장)
contextBridge.exposeInMainWorld('electronAPI', {
  // ... 기존 API ...

  // OAuth 관련
  openOAuth: (authUrl: string) => ipcRenderer.invoke('oauth:start', authUrl),
  cancelOAuth: () => ipcRenderer.invoke('oauth:cancel'),
  onOAuthRedirectUri: (callback: (uri: string) => void) =>
    ipcRenderer.on('oauth:redirectUri', (_event, uri) => callback(uri)),
  onOAuthComplete: (callback: (code: string) => void) =>
    ipcRenderer.on('oauth:complete', (_event, code) => callback(code)),

  // 보안 저장소 (토큰 암호화 — IPC 격리)
  secureWrite: (key: string, value: string) =>
    ipcRenderer.invoke('calendar:save-tokens', value),
  secureRead: (key: string) =>
    ipcRenderer.invoke('calendar:get-tokens'),
  secureDelete: (key: string) =>
    ipcRenderer.invoke('calendar:delete-tokens'),

  // 네트워크 상태
  onNetworkChange: (callback: (online: boolean) => void) => {
    window.addEventListener('online', () => callback(true));
    window.addEventListener('offline', () => callback(false));
  },
});
```

---

## 12. 프로젝트 구조 확장

```
src/
├── domain/
│   ├── entities/
│   │   ├── SchoolEvent.ts          # (확장) 구글 동기화 필드 + localUpdatedAt 추가
│   │   ├── CalendarMapping.ts      # 🆕 카테고리↔구글 캘린더 매핑
│   │   ├── SyncState.ts            # 🆕 동기화 상태 (루프 방지 필드 포함)
│   │   ├── SyncQueueItem.ts        # 🆕 오프라인 큐 항목
│   │   ├── GoogleCalendarInfo.ts   # 🆕 구글 캘린더 정보
│   │   └── GoogleEventData.ts      # 🆕 구글 이벤트 원본 데이터
│   ├── ports/
│   │   ├── IStoragePort.ts         # (기존)
│   │   ├── IGoogleAuthPort.ts      # 🆕 구글 인증 포트 (PKCE + RefreshedTokens)
│   │   ├── IGoogleCalendarPort.ts  # 🆕 구글 캘린더 API 포트
│   │   └── ITokenStoragePort.ts    # 🆕 토큰 암호화 저장 포트 (IPC 격리)
│   ├── repositories/
│   │   ├── ICalendarSyncRepository.ts  # 🆕 동기화 저장소 (토큰 메서드 분리됨)
│   │   └── ...                     # (기존)
│   └── rules/
│       ├── calendarSyncRules.ts    # 🆕 동기화 규칙 (충돌 감지 수정, 종일 일정 처리)
│       └── ...                     # (기존)
│
├── usecases/
│   ├── calendar/                   # 🆕 캘린더 동기화 유스케이스
│   │   ├── AuthenticateGoogle.ts   # PKCE + email 보존
│   │   ├── SyncToGoogle.ts         # 루프 방지 포함
│   │   ├── SyncFromGoogle.ts       # echo detection 포함
│   │   ├── FlushSyncQueue.ts       # exponential backoff
│   │   └── ManageCalendarMapping.ts
│   └── ...                         # (기존)
│
├── adapters/
│   ├── repositories/
│   │   ├── GoogleCalendarSyncRepository.ts  # 🆕 (토큰 메서드 제거됨)
│   │   ├── ElectronTokenStorage.ts          # 🆕 IPC 기반 토큰 저장소
│   │   └── ...                     # (기존)
│   ├── stores/
│   │   ├── useCalendarSyncStore.ts # 🆕 (PKCE, 보존 옵션 포함)
│   │   └── ...                     # (기존)
│   ├── components/
│   │   ├── Calendar/               # 🆕
│   │   │   ├── CalendarMappingModal.tsx
│   │   │   ├── ConflictResolveModal.tsx
│   │   │   ├── SyncStatusBar.tsx
│   │   │   └── GoogleBadge.tsx
│   │   ├── Settings/
│   │   │   └── CalendarSettings.tsx  # 🆕
│   │   └── ...                     # (기존, 일부 확장)
│   └── di/
│       └── container.ts            # (확장 — tokenStorage 추가)
│
└── infrastructure/
    ├── google/                     # 🆕
    │   ├── GoogleOAuthClient.ts    # PKCE 포함
    │   └── GoogleCalendarApiClient.ts  # Rate Limit + Retry 포함
    └── ...                         # (기존)

electron/
├── ipc/
│   ├── oauth.ts                    # 🆕 OAuth 핸들러
│   ├── secureStorage.ts            # 🆕 토큰 암호화 IPC 핸들러 (calendar:save/get/delete-tokens)
│   └── ...                         # (기존)
└── ...                             # (기존)
```

### 새로 추가되는 파일: ~19개

---

## 13. IPC 채널 추가

| 채널 | 방향 | 매개변수 | 반환값 | 용도 |
|------|------|---------|--------|------|
| `oauth:start` | Renderer → Main | `authUrl: string` | `string (code)` | OAuth 시작 |
| `oauth:cancel` | Renderer → Main | (없음) | `void` | OAuth 취소 |
| `oauth:redirectUri` | Main → Renderer | `uri: string` | - | 리다이렉트 URI 전달 |
| `calendar:save-tokens` | Renderer → Main | `tokensJson: string` | `void` | 토큰 암호화 저장 |
| `calendar:get-tokens` | Renderer → Main | (없음) | `string \| null` | 토큰 복호화 조회 |
| `calendar:delete-tokens` | Renderer → Main | (없음) | `void` | 토큰 삭제 |

---

## 14. Google Cloud 프로덕션 전환

### 14.1 OAuth 동의 화면 프로덕션 설정

쌤핀은 180명+ 사용자를 보유한 Electron 앱이므로, Google OAuth 테스트 모드(100명 한계)를 넘어 **프로덕션 모드로 전환**해야 한다.

#### OAuth 동의 화면 설정 상세

| 항목 | 설정값 | 비고 |
|------|--------|------|
| **사용자 유형** | 외부 | Google Workspace 외부 사용자도 사용 가능 |
| **앱 이름** | 쌤핀 (SsamPin) | |
| **사용자 지원 이메일** | 준일님 이메일 | |
| **앱 로고** | 쌤핀 아이콘 (120×120 이상) | PNG/JPEG |
| **앱 홈페이지** | 쌤핀 랜딩페이지 URL | 기존 페이지 활용 |
| **개인정보처리방침** | `{랜딩페이지}/privacy` | 14.3절 참고 |
| **서비스 약관** | (선택사항) | 없어도 제출 가능 |
| **승인된 도메인** | 랜딩페이지 도메인 | |

#### Scope 설정

```
요청 scope: https://www.googleapis.com/auth/calendar
분류: Sensitive scope
검증 유형: Sensitive scope verification (무료)
```

- **Sensitive scope** → 유료 보안 평가(CASA Tier 2) **불필요**
- 유료 보안 평가는 **Restricted scope** (Gmail 전체 접근, Drive 전체 접근 등)에만 해당
- Calendar API의 `calendar` scope는 Sensitive 분류 → **무료 검증만으로 프로덕션 전환 가능**

#### 프로덕션 전환 시 변경 사항

| 항목 | 테스트 모드 | 프로덕션 모드 |
|------|-----------|-------------|
| "확인되지 않은 앱" 경고 | ✅ 표시됨 | ❌ 제거됨 |
| 사용자 수 제한 | 100명 | 무제한 |
| 토큰 수명 | 7일 후 만료 | 정상 수명 |
| 수동 사용자 등록 | 필요 | 불필요 |

### 14.2 데모 영상 가이드

프로덕션 전환 제출 시 **scope 사용을 시연하는 데모 영상**이 필요하다 (1~2분, YouTube 업로드).

#### 필수 시연 화면

1. **OAuth 연결 과정**
   - 설정 → "구글 캘린더 연결하기" 클릭
   - Google 동의 화면에서 scope 확인 + 허용
   - 연결 완료 확인 (이메일 표시)

2. **캘린더 동기화 동작**
   - 쌤핀에서 일정 추가 → 구글 캘린더에 반영되는 장면
   - 구글 캘린더에서 일정 추가 → 쌤핀에 반영되는 장면

3. **연결 해제**
   - 설정 → "연결 해제" → 토큰 삭제 확인

#### 영상 제작 노트

- 해상도: 최소 720p
- 자막 또는 영어 내레이션 권장 (Google 리뷰어가 영어 사용)
- 개인 정보(실제 일정 내용)는 모자이크 또는 테스트 데이터 사용
- 앱 이름 "쌤핀"이 화면에 보여야 함

### 14.3 개인정보처리방침 페이지 기술 구현

#### 랜딩페이지에 추가

```
기존 랜딩페이지 구조:
  /           → 메인 페이지
  /download   → 다운로드
  /privacy    → 🆕 개인정보처리방침 페이지

구현 방법:
- 정적 HTML 페이지 또는 기존 프레임워크에 라우트 추가
- 내용: PRD 12절 "개인정보처리방침 초안" 기반
- 한국어 + 영어 버전 (Google 리뷰어용 영어 권장)
```

#### OAuth 동의 화면에서의 표시

Google Cloud Console → OAuth 동의 화면 → "개인정보처리방침 링크" 필드에 URL 입력하면, 사용자가 OAuth 동의 시 해당 링크를 확인할 수 있다.

### 14.4 앱 내 개인정보처리방침 표시

#### 요구사항

- **FR-GCAL-38**: 설정 화면 하단에 "📋 개인정보처리방침" 링크 추가
  - 클릭 시 시스템 브라우저에서 개인정보처리방침 페이지 열기 (`shell.openExternal`)
  - 구글 캘린더 연결 여부와 관계없이 항상 표시
- **FR-GCAL-39**: Google OAuth 동의 화면에도 개인정보처리방침 링크 자동 표시
  - Google Cloud Console에서 설정 (코드 변경 불필요)

#### 구현 위치

```
src/adapters/components/Settings/CalendarSettings.tsx
  └── 섹션 하단에 개인정보처리방침 링크 추가

  ┌─────────────────────────────────────────────────────────┐
  │  ☁️ 구글 캘린더 연동                                      │
  │  ...                                                    │
  │                                                         │
  │  📋 개인정보처리방침  ← 클릭 시 외부 브라우저 열기          │
  └─────────────────────────────────────────────────────────┘
```

### 14.5 scope 사용 목적 설명문 (영문 — 제출용)

Google 프로덕션 전환 제출 시 각 scope에 대한 사용 목적을 영문으로 작성해야 한다:

```
Scope: https://www.googleapis.com/auth/calendar

Purpose: SsamPin is a desktop schedule management app for teachers.
We use the Calendar scope to provide bidirectional sync between
the user's SsamPin schedule and their Google Calendar.

Specifically, we:
1. Read calendar events to display them within SsamPin
2. Create/update/delete events to sync changes made in SsamPin
3. List available calendars to let users choose which to sync

All data is stored locally on the user's PC.
No data is transmitted to any external server.
OAuth tokens are encrypted using the OS keychain (Electron safeStorage).
Users can disconnect and delete all synced data at any time.
```
