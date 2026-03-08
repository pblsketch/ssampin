# 쌤핀(SsamPin) 앱 내부 Analytics PRD

> **버전**: 1.0  
> **작성일**: 2026-03-07  
> **대상 앱 버전**: 0.2.8+  
> **작성자**: SsamPin Dev Team

---

## 1. 개요

### 1.1 배경
쌤핀(SsamPin)은 교사를 위한 데스크톱 대시보드 Electron 앱이다. 현재 사용자 행동 데이터를 수집하지 않아 기능별 사용률, DAU, 리텐션 등 핵심 지표를 파악할 수 없다. 데이터 기반 의사결정을 위해 앱 내부에 경량 Analytics 시스템을 구축한다.

### 1.2 목표
- **정량적 사용 데이터 확보**: 어떤 기능이 실제로 사용되는지 파악
- **사용자 행동 이해**: 앱 진입 → 기능 사용 → 종료까지의 사용 패턴 분석
- **제품 개선 우선순위**: 데이터 기반으로 기능 개발/개선 우선순위 결정
- **리텐션 추적**: DAU, WAU, 재방문률 등 핵심 지표 모니터링

### 1.3 비-목표 (Non-Goals)
- ❌ 개인 식별 가능한 데이터 수집 (교사 이름, 학교명, 학생 정보 등)
- ❌ 실시간 대시보드 (배치 전송 방식이므로 수분 지연 허용)
- ❌ A/B 테스트 프레임워크 (향후 확장 가능하나 MVP에서 제외)
- ❌ 마케팅/광고 목적의 데이터 활용

### 1.4 개인정보 보호 원칙
| 원칙 | 설명 |
|------|------|
| **익명성** | UUID 기반 `device_id`만 사용. 사용자 식별 불가 |
| **최소 수집** | 기능 사용 여부만 수집. 입력 내용, 학생 데이터 등 절대 수집 안 함 |
| **투명성** | 설정 페이지에서 Analytics 수집 ON/OFF 토글 제공 |
| **로컬 우선** | 오프라인에서도 앱 정상 동작. Analytics 실패가 앱 기능에 영향 없음 |

---

## 2. 기술 아키텍처

### 2.1 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│  Renderer Process (React)                                    │
│                                                              │
│  ┌──────────────┐    ┌───────────────┐    ┌──────────────┐  │
│  │  Components   │───▶│ useAnalytics  │───▶│ IAnalytics   │  │
│  │  (track 호출) │    │   (Hook)      │    │   Port       │  │
│  └──────────────┘    └───────────────┘    └──────┬───────┘  │
│                                                   │          │
│  ┌────────────────────────────────────────────────▼───────┐  │
│  │  SupabaseAnalyticsAdapter (Infrastructure)             │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────────────────┐  │  │
│  │  │ Memory  │  │ Batch    │  │ Offline Queue        │  │  │
│  │  │ Buffer  │─▶│ Timer    │─▶│ (LocalStorage)       │  │  │
│  │  │ (≤10)   │  │ (30sec)  │  │                      │  │  │
│  │  └─────────┘  └────┬─────┘  └──────────┬───────────┘  │  │
│  │                     │                    │              │  │
│  └─────────────────────┼────────────────────┼─────────────┘  │
│                        │                    │                 │
└────────────────────────┼────────────────────┼─────────────────┘
                         │                    │
                         ▼                    ▼
               ┌─────────────────────────────────────┐
               │  Supabase (PostgreSQL)               │
               │  ┌─────────────────────────────────┐ │
               │  │  app_analytics 테이블             │ │
               │  │  - event, properties (jsonb)     │ │
               │  │  - device_id, app_version        │ │
               │  │  - os_info, created_at           │ │
               │  └─────────────────────────────────┘ │
               └─────────────────────────────────────┘
```

### 2.2 Clean Architecture 레이어 매핑

| 레이어 | 파일 | 역할 |
|--------|------|------|
| **Domain** | `src/domain/ports/IAnalyticsPort.ts` | Analytics 추상 인터페이스 |
| **Domain** | `src/domain/valueObjects/AnalyticsEvent.ts` | 이벤트 타입 정의 |
| **Infrastructure** | `src/infrastructure/analytics/SupabaseAnalyticsAdapter.ts` | Supabase 연동 구현체 |
| **Infrastructure** | `src/infrastructure/analytics/NullAnalyticsAdapter.ts` | 비활성 시 Null Object |
| **Adapters** | `src/adapters/hooks/useAnalytics.ts` | React 훅 |
| **Adapters** | `src/adapters/di/container.ts` | DI 등록 (수정) |

### 2.3 의존성 방향

```
Components → useAnalytics → IAnalyticsPort ← SupabaseAnalyticsAdapter
                                             ← NullAnalyticsAdapter
               (Adapters)     (Domain)           (Infrastructure)
```

**핵심**: Domain 레이어(IAnalyticsPort)는 Supabase를 모른다. Infrastructure에서만 Supabase를 import한다.

---

## 3. 데이터베이스 설계

### 3.1 테이블 스키마

```sql
-- Supabase SQL Editor에서 실행

CREATE TABLE app_analytics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL,
  properties jsonb DEFAULT '{}',
  app_version text,
  device_id text,
  os_info text,
  created_at timestamptz DEFAULT now()
);

-- 성능용 인덱스
CREATE INDEX idx_analytics_event ON app_analytics(event);
CREATE INDEX idx_analytics_created ON app_analytics(created_at);
CREATE INDEX idx_analytics_device ON app_analytics(device_id);
CREATE INDEX idx_analytics_event_created ON app_analytics(event, created_at);

-- RLS (Row Level Security) 설정
ALTER TABLE app_analytics ENABLE ROW LEVEL SECURITY;

-- anon 키로 INSERT만 허용 (SELECT/UPDATE/DELETE 불가)
CREATE POLICY "Allow anonymous insert"
  ON app_analytics
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- service_role만 읽기 가능 (대시보드 조회용)
CREATE POLICY "Allow service role read"
  ON app_analytics
  FOR SELECT
  TO service_role
  USING (true);
```

### 3.2 필드 설명

| 필드 | 타입 | 설명 | 예시 |
|------|------|------|------|
| `id` | bigint | 자동 증가 PK | `1` |
| `event` | text | 이벤트명 | `'tool_use'` |
| `properties` | jsonb | 이벤트별 추가 데이터 | `{"tool": "timer"}` |
| `app_version` | text | 앱 버전 | `'0.2.8'` |
| `device_id` | text | 익명 디바이스 UUID | `'a1b2c3d4-...'` |
| `os_info` | text | OS 정보 | `'win32 x64'` |
| `created_at` | timestamptz | 이벤트 발생 시각 | `'2026-03-07T12:00:00Z'` |

### 3.3 데이터 보존 정책
- **기본**: 무기한 보존 (Supabase 무료 플랜 500MB 한도 내)
- **예상 데이터량**: 1사용자 × 50이벤트/일 × 0.5KB = 25KB/일 ≈ 750KB/월
- **1,000 사용자 기준**: ~750MB/월 → 3개월 이상 데이터는 월별 집계 후 삭제 고려
- **자동 정리 (선택)**: pg_cron으로 90일 이상 raw 데이터 삭제

```sql
-- (선택) 90일 이상 데이터 자동 삭제 (pg_cron 설정)
-- SELECT cron.schedule('cleanup-old-analytics', '0 3 * * 0',
--   $$DELETE FROM app_analytics WHERE created_at < now() - interval '90 days'$$
-- );
```

---

## 4. Domain Layer 설계

### 4.1 IAnalyticsPort 인터페이스

```typescript
// src/domain/ports/IAnalyticsPort.ts

/**
 * Analytics 추상 인터페이스 (Port)
 * infrastructure 레이어에서 구현
 */
export interface IAnalyticsPort {
  /**
   * 이벤트를 추적한다. Fire-and-forget — 절대 await 하지 않는다.
   * UI 스레드를 블로킹하지 않으며, 실패해도 예외를 던지지 않는다.
   */
  track(event: string, properties?: Record<string, unknown>): void;

  /**
   * 메모리 버퍼에 쌓인 이벤트를 즉시 Supabase로 전송한다.
   * 앱 종료 시 호출한다.
   */
  flush(): Promise<void>;

  /**
   * 익명 디바이스 ID를 설정한다.
   * 최초 실행 시 UUID를 생성하여 로컬에 저장하고,
   * 이후 실행 시 저장된 값을 로드하여 설정한다.
   */
  setDeviceId(id: string): void;

  /**
   * 앱 버전을 설정한다.
   * package.json의 version 값을 사용한다.
   */
  setAppVersion(version: string): void;
}
```

### 4.2 Analytics 이벤트 타입 정의

```typescript
// src/domain/valueObjects/AnalyticsEvent.ts

/** 추적 가능한 이벤트 이름 */
export type AnalyticsEventName =
  | 'app_open'
  | 'app_close'
  | 'page_view'
  | 'widget_open'
  | 'widget_close'
  | 'timetable_edit'
  | 'seating_shuffle'
  | 'seating_drag'
  | 'event_create'
  | 'memo_create'
  | 'todo_toggle'
  | 'tool_use'
  | 'export'
  | 'share_import'
  | 'chatbot_open'
  | 'chatbot_message'
  | 'update_installed'
  | 'onboarding_complete';

/** 이벤트별 properties 타입 매핑 */
export interface AnalyticsEventProperties {
  app_open: { launchMode: 'normal' | 'widget' };
  app_close: { sessionDuration: number };
  page_view: { page: string };
  widget_open: { trigger: 'close_button' | 'tray' };
  widget_close: Record<string, never>;
  timetable_edit: { action: 'add' | 'edit' | 'delete' };
  seating_shuffle: { studentCount: number };
  seating_drag: Record<string, never>;
  event_create: { category: string };
  memo_create: Record<string, never>;
  todo_toggle: { completed: boolean };
  tool_use: {
    tool:
      | 'timer'
      | 'random_picker'
      | 'roulette'
      | 'scoreboard'
      | 'traffic_light'
      | 'dice'
      | 'coin'
      | 'qr'
      | 'activity_symbol'
      | 'vote'
      | 'survey'
      | 'wordcloud'
      | 'seat_picker';
  };
  export: { format: 'excel' | 'hwpx' | 'pdf' | 'ssampin' };
  share_import: Record<string, never>;
  chatbot_open: Record<string, never>;
  chatbot_message: Record<string, never>;
  update_installed: { from: string; to: string };
  onboarding_complete: { step: number };
}
```

---

## 5. Infrastructure Layer 설계

### 5.1 SupabaseAnalyticsAdapter

```typescript
// src/infrastructure/analytics/SupabaseAnalyticsAdapter.ts
```

**핵심 동작**:

1. **track() 호출** → 이벤트를 메모리 버퍼(`AnalyticsRecord[]`)에 추가
2. **배치 조건 충족 시** (10개 이상 OR 30초 경과) → Supabase `app_analytics` 테이블에 INSERT
3. **전송 실패 시** → `localStorage`의 `analytics_offline_queue`에 저장
4. **다음 배치 시** → 오프라인 큐 먼저 전송 시도
5. **앱 종료 시** → `flush()` 호출하여 잔여 버퍼 전송

**구현 세부사항**:

| 항목 | 값 |
|------|------|
| 배치 크기 | 10개 |
| 배치 주기 | 30초 |
| 오프라인 큐 최대 크기 | 500개 (초과 시 오래된 것부터 삭제) |
| 재시도 | 다음 배치 사이클에서 자동 재시도 |
| Supabase 클라이언트 | anon key 사용 (INSERT only) |
| 에러 처리 | console.warn만 출력, 예외 전파 안 함 |

**Supabase 클라이언트 초기화**:
```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://[PROJECT_ID].supabase.co';
const SUPABASE_ANON_KEY = '[ANON_KEY]';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

> ⚠️ anon key는 RLS로 INSERT만 허용되므로 소스 코드에 포함해도 안전하다.

### 5.2 NullAnalyticsAdapter

```typescript
// src/infrastructure/analytics/NullAnalyticsAdapter.ts
```

Analytics가 비활성화된 경우(사용자가 설정에서 OFF) 사용하는 Null Object 패턴 구현체.
모든 메서드가 no-op이다.

### 5.3 오프라인 큐 구조

```typescript
interface OfflineQueueItem {
  event: string;
  properties: Record<string, unknown>;
  app_version: string;
  device_id: string;
  os_info: string;
  created_at: string; // ISO 8601
}
```

`localStorage`의 `ssampin_analytics_queue` 키에 JSON 배열로 저장.

---

## 6. Adapters Layer 설계

### 6.1 useAnalytics 훅

```typescript
// src/adapters/hooks/useAnalytics.ts
```

**기능**:
- DI 컨테이너에서 `IAnalyticsPort` 인스턴스 참조
- `track(event, properties)` 함수를 컴포넌트에 제공
- 타입 안전한 이벤트 추적 (AnalyticsEventProperties 기반)

**사용법**:
```typescript
// 컴포넌트에서
import { useAnalytics } from '@adapters/hooks/useAnalytics';

function ToolTimer() {
  const { track } = useAnalytics();
  
  useEffect(() => {
    track('tool_use', { tool: 'timer' });
  }, []);
  
  // ...
}
```

### 6.2 Analytics 초기화

`App.tsx`에서 앱 시작 시:
1. `device_id`를 `localStorage`에서 로드 (없으면 `crypto.randomUUID()`로 생성)
2. `app_version`을 `package.json`에서 로드
3. `os_info`를 `navigator.userAgent` 또는 `navigator.platform`에서 추출
4. `track('app_open', { launchMode })` 호출

### 6.3 DI 컨테이너 수정

```typescript
// src/adapters/di/container.ts에 추가

import type { IAnalyticsPort } from '@domain/ports/IAnalyticsPort';
import { SupabaseAnalyticsAdapter } from '@infrastructure/analytics/SupabaseAnalyticsAdapter';
import { NullAnalyticsAdapter } from '@infrastructure/analytics/NullAnalyticsAdapter';

// Analytics 활성화 여부는 Settings에서 제어 (기본: true)
export const analyticsPort: IAnalyticsPort = new SupabaseAnalyticsAdapter();
export const nullAnalyticsPort: IAnalyticsPort = new NullAnalyticsAdapter();
```

### 6.4 Electron 메인 프로세스 연동

`electron/main.ts`에서 `before-quit` 이벤트 시 renderer에 flush 신호를 보내야 한다:

```typescript
app.on('before-quit', () => {
  mainWindow?.webContents.send('analytics:flush');
});
```

`electron/preload.ts`에 추가:
```typescript
onAnalyticsFlush: (callback: () => void): (() => void) => {
  const handler = () => callback();
  ipcRenderer.on('analytics:flush', handler);
  return () => { ipcRenderer.removeListener('analytics:flush', handler); };
},
```

---

## 7. 추적 이벤트 상세

### 7.1 이벤트 카탈로그

| # | 이벤트 | 트리거 시점 | properties | 구현 위치 |
|---|--------|-----------|------------|----------|
| 1 | `app_open` | 앱 시작 (App.tsx 마운트) | `{ launchMode: 'normal' \| 'widget' }` | `App.tsx` |
| 2 | `app_close` | 앱 종료 (beforeunload/before-quit) | `{ sessionDuration: number }` | `useAnalytics.ts` (초기화 시 등록) |
| 3 | `page_view` | 페이지/탭 이동 | `{ page: string }` | `App.tsx` (setCurrentPage 호출 시) |
| 4 | `widget_open` | 위젯 모드 전환 | `{ trigger: 'close_button' \| 'tray' }` | `Widget.tsx` 또는 IPC 핸들러 |
| 5 | `widget_close` | 위젯 → 메인 복귀 | `{}` | `Widget.tsx` |
| 6 | `timetable_edit` | 시간표 수정 | `{ action: 'add' \| 'edit' \| 'delete' }` | `TimetablePage.tsx` |
| 7 | `seating_shuffle` | 좌석 랜덤 배치 | `{ studentCount: number }` | `Seating.tsx` |
| 8 | `seating_drag` | 좌석 드래그 이동 | `{}` | `Seating.tsx` |
| 9 | `event_create` | 일정 등록 | `{ category: string }` | `Schedule.tsx` 또는 이벤트 폼 |
| 10 | `memo_create` | 메모 생성 | `{}` | `MemoPage.tsx` |
| 11 | `todo_toggle` | 할일 체크/해제 | `{ completed: boolean }` | `Todo.tsx` |
| 12 | `tool_use` | 도구 열기 | `{ tool: string }` | 각 Tool 컴포넌트 |
| 13 | `export` | 내보내기 실행 | `{ format: string }` | `Export.tsx` |
| 14 | `share_import` | .ssampin 파일 가져오기 | `{}` | `App.tsx` (onFileOpened) |
| 15 | `chatbot_open` | AI 챗봇 열기 | `{}` | Chatbot 컴포넌트 |
| 16 | `chatbot_message` | AI 챗봇 메시지 전송 | `{}` | Chatbot 컴포넌트 |
| 17 | `update_installed` | 자동 업데이트 설치 | `{ from: string, to: string }` | `UpdateNotification.tsx` |
| 18 | `onboarding_complete` | 온보딩 완료 | `{ step: number }` | `Onboarding.tsx` |

### 7.2 이벤트 수집 원칙

1. **개인 식별 정보 금지**: 학교명, 교사명, 학생명 등 절대 properties에 포함하지 않음
2. **입력 내용 금지**: 메모 내용, 일정 제목, 채팅 메시지 등 수집하지 않음
3. **행위만 수집**: "무엇을 했는가" (메모를 만들었다)만 수집, "무엇을 입력했는가"는 수집 안 함
4. **카운트만 포함**: studentCount 같은 숫자는 OK, studentNames 같은 목록은 금지

---

## 8. Settings 통합

### 8.1 설정 UI 추가

`SettingsPage.tsx`의 "시스템" 섹션에 Analytics 토글 추가:

```
☑ 앱 사용 통계 수집 허용
  앱 개선을 위해 익명 사용 통계를 수집합니다.
  개인정보는 수집되지 않습니다.
```

### 8.2 Settings 엔티티 수정

```typescript
// Settings 엔티티에 추가
interface Settings {
  // ... 기존 필드
  analytics: {
    enabled: boolean; // 기본: true
  };
}
```

### 8.3 동적 전환

Analytics 설정이 변경되면 DI 컨테이너의 Analytics 인스턴스를 교체하거나, 내부적으로 `enabled` 플래그로 track() 호출을 무시한다.

---

## 9. 배치 전송 상세 로직

### 9.1 전송 플로우

```
track() 호출
    │
    ▼
메모리 버퍼에 추가
    │
    ├── 버퍼 크기 ≥ 10 → 즉시 전송
    │
    └── 30초 타이머 만료 → 전송
           │
           ▼
      오프라인 큐 확인
           │
           ├── 큐에 이벤트 있음 → 큐 + 버퍼 합쳐서 전송
           │
           └── 큐 비어있음 → 버퍼만 전송
                  │
                  ▼
           Supabase INSERT
                  │
                  ├── 성공 → 버퍼/큐 비우기
                  │
                  └── 실패 → 오프라인 큐에 저장
                              (최대 500개, FIFO)
```

### 9.2 앱 종료 시 flush

```
before-quit / beforeunload
    │
    ▼
flush() 호출
    │
    ├── 버퍼 + 오프라인 큐 합치기
    │
    ├── navigator.sendBeacon() 또는 동기 fetch 시도
    │     (Electron 환경에서는 sync fetch 사용)
    │
    ├── 성공 → 종료
    │
    └── 실패 → localStorage에 저장 (다음 실행 시 재시도)
```

---

## 10. 성능 영향 분석

| 항목 | 영향 |
|------|------|
| **메모리** | 버퍼 최대 10개 × ~0.5KB = ~5KB (무시 가능) |
| **네트워크** | 30초마다 1회 INSERT, 이벤트 크기 ~100B × 10 = ~1KB/batch |
| **CPU** | JSON 직렬화만 수행, 메인 스레드 블로킹 없음 |
| **디스크** | 오프라인 큐 최대 500 × 0.5KB = ~250KB (localStorage) |
| **UI 반응성** | track()은 동기적으로 버퍼에 push만 하므로 0ms 지연 |

---

## 11. 대시보드 SQL 쿼리

### 11.1 DAU (일별 활성 사용자)

```sql
SELECT
  DATE(created_at) AS day,
  COUNT(DISTINCT device_id) AS dau
FROM app_analytics
WHERE event = 'app_open'
  AND created_at >= now() - interval '30 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

### 11.2 기능별 사용률 (최근 7일)

```sql
SELECT
  event,
  COUNT(*) AS usage_count,
  COUNT(DISTINCT device_id) AS unique_users
FROM app_analytics
WHERE created_at >= now() - interval '7 days'
  AND event NOT IN ('app_open', 'app_close', 'page_view')
GROUP BY event
ORDER BY usage_count DESC;
```

### 11.3 도구별 사용 랭킹

```sql
SELECT
  properties->>'tool' AS tool_name,
  COUNT(*) AS usage_count,
  COUNT(DISTINCT device_id) AS unique_users
FROM app_analytics
WHERE event = 'tool_use'
  AND created_at >= now() - interval '30 days'
GROUP BY properties->>'tool'
ORDER BY usage_count DESC;
```

### 11.4 페이지별 방문 비율

```sql
SELECT
  properties->>'page' AS page,
  COUNT(*) AS views,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) AS pct
FROM app_analytics
WHERE event = 'page_view'
  AND created_at >= now() - interval '7 days'
GROUP BY properties->>'page'
ORDER BY views DESC;
```

### 11.5 일별 평균 세션 시간

```sql
SELECT
  DATE(created_at) AS day,
  ROUND(AVG((properties->>'sessionDuration')::numeric) / 60, 1) AS avg_min
FROM app_analytics
WHERE event = 'app_close'
  AND created_at >= now() - interval '30 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

### 11.6 버전별 사용자 분포

```sql
SELECT
  app_version,
  COUNT(DISTINCT device_id) AS users
FROM app_analytics
WHERE created_at >= now() - interval '7 days'
GROUP BY app_version
ORDER BY users DESC;
```

### 11.7 Week-over-Week 리텐션 (간이)

```sql
WITH first_seen AS (
  SELECT device_id, DATE(MIN(created_at)) AS first_day
  FROM app_analytics
  WHERE event = 'app_open'
  GROUP BY device_id
),
weekly AS (
  SELECT
    f.device_id,
    f.first_day,
    DATE(a.created_at) AS active_day,
    (DATE(a.created_at) - f.first_day) / 7 AS week_num
  FROM first_seen f
  JOIN app_analytics a ON a.device_id = f.device_id AND a.event = 'app_open'
)
SELECT
  week_num,
  COUNT(DISTINCT device_id) AS retained_users,
  ROUND(COUNT(DISTINCT device_id) * 100.0 /
    (SELECT COUNT(DISTINCT device_id) FROM first_seen), 1) AS retention_pct
FROM weekly
WHERE week_num BETWEEN 0 AND 8
GROUP BY week_num
ORDER BY week_num;
```

### 11.8 내보내기 포맷별 사용 비율

```sql
SELECT
  properties->>'format' AS format,
  COUNT(*) AS usage_count
FROM app_analytics
WHERE event = 'export'
  AND created_at >= now() - interval '30 days'
GROUP BY properties->>'format'
ORDER BY usage_count DESC;
```

---

## 12. 구현 체크리스트

### Phase 1: 기반 구축
- [ ] Supabase에 `app_analytics` 테이블 생성 및 RLS 설정
- [ ] `src/domain/ports/IAnalyticsPort.ts` 생성
- [ ] `src/domain/valueObjects/AnalyticsEvent.ts` 생성
- [ ] `src/infrastructure/analytics/SupabaseAnalyticsAdapter.ts` 구현
- [ ] `src/infrastructure/analytics/NullAnalyticsAdapter.ts` 구현
- [ ] `src/adapters/di/container.ts`에 analyticsPort 등록
- [ ] `src/adapters/hooks/useAnalytics.ts` 생성

### Phase 2: 이벤트 삽입
- [ ] `App.tsx`에 app_open, page_view 추적 추가
- [ ] 위젯 관련 이벤트 추가
- [ ] 도구 사용 이벤트 추가
- [ ] 내보내기, 가져오기 이벤트 추가
- [ ] 기타 CRUD 이벤트 추가

### Phase 3: 마감 처리
- [ ] `electron/main.ts`에 before-quit flush 연동
- [ ] `electron/preload.ts`에 analytics:flush IPC 추가
- [ ] Settings 엔티티에 analytics 필드 추가
- [ ] SettingsPage에 Analytics 토글 UI 추가
- [ ] TypeScript 타입 체크 통과 확인

### Phase 4: 검증
- [ ] 개발 모드에서 이벤트가 Supabase에 정상 INSERT 되는지 확인
- [ ] 오프라인 모드에서 큐에 쌓이고 온라인 복귀 시 전송되는지 확인
- [ ] 앱 종료 시 flush가 정상 동작하는지 확인
- [ ] Analytics OFF 시 이벤트가 수집되지 않는지 확인

---

## 13. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Supabase 무료 플랜 초과 | 데이터 INSERT 실패 | 사용량 모니터링, 배치 크기 조절 |
| anon key 노출 | 악의적 INSERT 가능 | RLS로 INSERT only, rate limit 설정 |
| 대량 오프라인 큐 | localStorage 부담 | 최대 500개 제한 |
| 사용자 프라이버시 우려 | 이탈 | 투명한 설명 + OFF 토글 제공 |

---

## 14. 향후 확장 계획

1. **Supabase Dashboard**: Grafana 또는 Metabase 연동하여 시각적 대시보드 구축
2. **Funnel 분석**: 온보딩 → 첫 기능 사용 → 정착까지의 전환율 추적
3. **A/B 테스트**: 기능 플래그 + Analytics로 실험 가능
4. **에러 트래킹**: `app_error` 이벤트 추가하여 크래시/에러 빈도 추적
5. **코호트 분석**: 가입 시점별 사용자 그룹 행동 비교