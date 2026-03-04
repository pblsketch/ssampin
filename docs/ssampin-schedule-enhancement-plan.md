# 쌤핀 일정(Schedule) 기능 확장 구현 계획서

> **작성일**: 2026년 3월 4일  
> **대상 버전**: v0.1.7 → v0.2.0  
> **예상 소요**: 7~10일

---

## 📋 구현 목표

| # | 기능 | 우선순위 | 난이도 |
|---|------|---------|--------|
| S1 | 구글 캘린더 연동 (가져오기) | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| S2 | 다일 일정 캘린더 바(bar) 표시 | ⭐⭐⭐ | ⭐⭐⭐ |
| S3 | 연간/학기 뷰 | ⭐⭐ | ⭐⭐⭐ |

---

## 🏗 아키텍처 현황 분석

### 현재 파일 구조 (Schedule 관련)

```
src/
├── domain/
│   ├── entities/SchoolEvent.ts        ← 이벤트 엔티티 (카테고리, 알림, 반복)
│   ├── entities/EventsShareFile.ts    ← 공유 파일 타입
│   ├── repositories/IEventsRepository.ts
│   └── rules/
│       ├── eventRules.ts              ← 필터/정렬/반복 판정
│       └── holidayRules.ts            ← 한국 공휴일
├── usecases/events/
│   ├── ManageEvents.ts                ← CRUD
│   ├── CheckEventAlerts.ts            ← 알림 체크
│   ├── ExportEvents.ts                ← 내보내기
│   └── ImportEvents.ts                ← 가져오기
├── adapters/
│   ├── stores/useEventsStore.ts       ← Zustand 스토어 (300줄)
│   ├── presenters/categoryPresenter.ts
│   └── components/Schedule/
│       ├── Schedule.tsx               ← 메인 페이지 (344줄)
│       ├── CalendarView.tsx           ← 월간 캘린더 (200줄)
│       ├── EventList.tsx              ← 이벤트 목록
│       ├── EventFormModal.tsx         ← 일정 추가/수정 모달
│       ├── DayScheduleModal.tsx       ← 날짜 클릭 시 상세
│       ├── CategoryManagementModal.tsx
│       ├── ExportModal.tsx
│       └── ImportModal.tsx
└── widgets/items/Events.tsx           ← 대시보드 위젯
```

### 현재 SchoolEvent 엔티티

```typescript
export interface SchoolEvent {
  readonly id: string;
  readonly title: string;
  readonly date: string;          // "YYYY-MM-DD" (시작일)
  readonly endDate?: string;      // "YYYY-MM-DD" (종료일)
  readonly category: string;
  readonly description?: string;
  readonly time?: string;
  readonly location?: string;
  readonly isDDay?: boolean;
  readonly alerts?: readonly AlertTiming[];
  readonly recurrence?: Recurrence;  // 'weekly' | 'monthly' | 'yearly'
}
```

### 현재 CalendarView 동작

- 월간 그리드(7열 × 5~6행) 렌더링
- 날짜 셀에 카테고리 **색상 dot(점)** 최대 3개 표시
- `getCategoriesOnDate()` → 해당 날짜 이벤트의 카테고리 ID 목록 반환
- **다일 일정**: `getEventsForDate()`에서 `endDate` 범위 체크는 하지만, 캘린더에는 **각 날짜별 dot만 표시** (바 형태 아님)

---

## 📐 상세 설계

---

### S1. 구글 캘린더 연동 (가져오기)

#### 1-1. 연동 방식 선택

두 가지 방식을 지원합니다:

| 방식 | 장점 | 단점 | 구현 난이도 |
|------|------|------|------------|
| **A. iCal URL 구독** | OAuth 불필요, 간편 | 읽기 전용, 수동 새로고침 | ⭐⭐ |
| **B. Google Calendar API** | 양방향 동기화 가능 | OAuth2 필요, 복잡 | ⭐⭐⭐⭐⭐ |

**→ Phase 1에서는 A방식(iCal URL 구독)으로 구현합니다.**  
간단하면서도 교사 사용 시나리오에 충분합니다.

#### 1-2. iCal 구독 흐름

```
[사용자]
  │
  ├─ 1. Google Calendar > 설정 > "비밀 주소(iCal 형식)" 복사
  │
  ├─ 2. 쌤핀 설정 > 외부 캘린더 > URL 붙여넣기
  │
  └─ 3. [동기화] 버튼 클릭 → iCal 파싱 → 쌤핀 일정으로 변환
```

#### 1-3. 새로운 엔티티/타입

```typescript
// src/domain/entities/ExternalCalendar.ts (신규)

export interface ExternalCalendarSource {
  readonly id: string;
  readonly name: string;           // "내 구글 캘린더"
  readonly url: string;            // iCal URL
  readonly type: 'google-ical';    // 추후 다른 타입 확장 가능
  readonly categoryId: string;     // 가져온 일정의 기본 카테고리
  readonly lastSyncAt?: string;    // ISO 8601
  readonly enabled: boolean;
}

export interface ExternalCalendarData {
  readonly sources: readonly ExternalCalendarSource[];
}
```

#### 1-4. iCal 파서 구현

```typescript
// src/infrastructure/calendar/ICalParser.ts (신규)

export interface ParsedCalEvent {
  uid: string;
  summary: string;
  dtstart: string;      // "YYYY-MM-DD" 또는 "YYYY-MM-DDTHH:mm:ss"
  dtend?: string;
  description?: string;
  location?: string;
  rrule?: string;        // 반복 규칙 (RRULE)
}

/**
 * iCal(.ics) 텍스트를 파싱하여 이벤트 배열로 변환
 */
export function parseICal(icalText: string): ParsedCalEvent[] {
  const events: ParsedCalEvent[] = [];
  const lines = unfoldLines(icalText);
  
  let inEvent = false;
  let current: Partial<ParsedCalEvent> = {};
  
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
    } else if (line === 'END:VEVENT') {
      inEvent = false;
      if (current.uid && current.summary && current.dtstart) {
        events.push(current as ParsedCalEvent);
      }
    } else if (inEvent) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':');
      const baseKey = key?.split(';')[0]; // DTSTART;VALUE=DATE → DTSTART
      
      switch (baseKey) {
        case 'UID':         current.uid = value; break;
        case 'SUMMARY':     current.summary = unescapeICalText(value ?? ''); break;
        case 'DTSTART':     current.dtstart = parseICalDate(value ?? ''); break;
        case 'DTEND':       current.dtend = parseICalDate(value ?? ''); break;
        case 'DESCRIPTION': current.description = unescapeICalText(value ?? ''); break;
        case 'LOCATION':    current.location = unescapeICalText(value ?? ''); break;
        case 'RRULE':       current.rrule = value; break;
      }
    }
  }
  
  return events;
}

/** iCal의 긴 줄 접기(unfolding) 처리 */
function unfoldLines(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, '').split(/\r?\n/);
}

/** iCal 날짜를 "YYYY-MM-DD" 형식으로 변환 */
function parseICalDate(value: string): string {
  // 20260304 → 2026-03-04
  // 20260304T090000Z → 2026-03-04
  const cleaned = value.replace(/[TZ]/g, ' ').trim();
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  return value;
}

/** iCal 이스케이프 문자 복원 */
function unescapeICalText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}
```

#### 1-5. 구글 캘린더 → 쌤핀 이벤트 변환

```typescript
// src/usecases/events/SyncExternalCalendar.ts (신규)

export class SyncExternalCalendar {
  constructor(
    private readonly eventsRepo: IEventsRepository,
  ) {}

  async syncFromICal(
    source: ExternalCalendarSource,
    icalText: string,
  ): Promise<{ added: number; updated: number; removed: number }> {
    const parsed = parseICal(icalText);
    const existing = await this.eventsRepo.getEvents();
    const currentEvents = existing?.events ?? [];
    
    // 외부 소스에서 가져온 일정은 id에 prefix 부여: `ext:{sourceId}:{uid}`
    const prefix = `ext:${source.id}:`;
    const existingExternal = currentEvents.filter(e => e.id.startsWith(prefix));
    const existingMap = new Map(existingExternal.map(e => [e.id, e]));
    
    let added = 0, updated = 0, removed = 0;
    const newExternalIds = new Set<string>();
    
    // 파싱된 이벤트를 SchoolEvent로 변환
    for (const pe of parsed) {
      const eventId = `${prefix}${pe.uid}`;
      newExternalIds.add(eventId);
      
      const converted: SchoolEvent = {
        id: eventId,
        title: pe.summary,
        date: pe.dtstart,
        endDate: pe.dtend && pe.dtend !== pe.dtstart ? pe.dtend : undefined,
        category: source.categoryId,
        description: pe.description,
        location: pe.location,
        // rrule 변환은 추후 지원
      };
      
      if (existingMap.has(eventId)) {
        // 기존 이벤트 업데이트
        const old = existingMap.get(eventId)!;
        if (old.title !== converted.title || old.date !== converted.date) {
          updated++;
        }
      } else {
        added++;
      }
    }
    
    // 삭제된 이벤트 (외부에서 없어진 것)
    for (const ext of existingExternal) {
      if (!newExternalIds.has(ext.id)) {
        removed++;
      }
    }
    
    // 병합: 기존 내부 일정 + 새 외부 일정
    const internalEvents = currentEvents.filter(e => !e.id.startsWith(prefix));
    const newExternalEvents = parsed.map(pe => ({
      id: `${prefix}${pe.uid}`,
      title: pe.summary,
      date: pe.dtstart,
      ...(pe.dtend && pe.dtend !== pe.dtstart ? { endDate: pe.dtend } : {}),
      category: source.categoryId,
      ...(pe.description ? { description: pe.description } : {}),
      ...(pe.location ? { location: pe.location } : {}),
    }));
    
    await this.eventsRepo.saveEvents({
      events: [...internalEvents, ...newExternalEvents],
      categories: existing?.categories,
    });
    
    return { added, updated, removed };
  }
}
```

#### 1-6. 설정 UI

설정 페이지에 "외부 캘린더" 섹션 추가:

```
┌─ 외부 캘린더 연동 ──────────────────────────┐
│                                             │
│ 📅 내 구글 캘린더                           │
│    URL: https://calendar.google.com/...     │
│    카테고리: [구글] ▼                       │
│    마지막 동기화: 2026-03-04 09:30          │
│    [🔄 동기화]  [✏️ 편집]  [🗑️ 삭제]       │
│                                             │
│ [+ 캘린더 추가]                             │
│                                             │
│ ℹ️ Google Calendar > 설정 > 캘린더 선택 >    │
│    "비밀 주소(iCal 형식)" 을 복사하세요      │
└─────────────────────────────────────────────┘
```

#### 1-7. 네트워크 요청 (Electron / Web)

```typescript
// iCal URL 가져오기
async function fetchICal(url: string): Promise<string> {
  const api = window.electronAPI;
  
  if (api?.fetchUrl) {
    // Electron: CORS 우회 가능
    return api.fetchUrl(url);
  }
  
  // Web: CORS 프록시 필요 (또는 직접 입력)
  // Google의 public iCal URL은 CORS 허용
  const response = await fetch(url);
  return response.text();
}
```

**Electron IPC 추가 필요:**

```typescript
// electron/main.ts 에 추가
ipcMain.handle('fetch-url', async (_event, url: string) => {
  const https = await import('https');
  const http = await import('http');
  const mod = url.startsWith('https') ? https : http;
  
  return new Promise<string>((resolve, reject) => {
    mod.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
});
```

#### 1-8. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/entities/ExternalCalendar.ts` | 🆕 외부 캘린더 소스 엔티티 |
| `infrastructure/calendar/ICalParser.ts` | 🆕 iCal 파서 |
| `usecases/events/SyncExternalCalendar.ts` | 🆕 동기화 유스케이스 |
| `adapters/stores/useEventsStore.ts` | ✏️ 외부 캘린더 동기화 액션 추가 |
| `adapters/components/Settings/SettingsPage.tsx` | ✏️ "외부 캘린더" 섹션 추가 |
| `electron/main.ts` | ✏️ `fetch-url` IPC 핸들러 추가 |
| `src/global.d.ts` | ✏️ `electronAPI.fetchUrl` 타입 추가 |

---

### S2. 다일 일정 캘린더 바(bar) 표시

#### 2-1. 현재 문제

```
현재: 기말고사 (3/4~3/6)
┌───┬───┬───┬───┬───┬───┬───┐
│   │   │   │ 4 │ 5 │ 6 │   │
│   │   │   │ 🔵│ 🔵│ 🔵│   │  ← dot만 표시, 연결감 없음
└───┴───┴───┴───┴───┴───┴───┘

개선: 기말고사 (3/4~3/6)
┌───┬───┬───┬───┬───┬───┬───┐
│   │   │   │ 4 │ 5 │ 6 │   │
│   │   │   │▓▓▓▓▓▓▓▓▓▓▓│   │  ← 바 형태로 기간 표시
│   │   │   │기말고사     │   │
└───┴───┴───┴───┴───┴───┴───┘
```

#### 2-2. 다일 이벤트 감지 및 바 데이터 생성

```typescript
// src/domain/rules/eventRules.ts 에 추가

export interface CalendarBar {
  event: SchoolEvent;
  startCol: number;    // 0~6 (해당 주에서의 시작 열)
  endCol: number;      // 0~6 (해당 주에서의 종료 열)
  row: number;         // 바가 놓이는 행 (겹침 처리)
  isStart: boolean;    // 이벤트의 실제 시작인지 (주 경계 분할 시)
  isEnd: boolean;      // 이벤트의 실제 종료인지
  color: string;       // 카테고리 색상
}

/**
 * 특정 주(week)의 다일 이벤트 바 목록을 계산
 * @param events 전체 이벤트
 * @param weekStart 해당 주의 일요일 날짜
 * @param categories 카테고리 목록
 * @returns 해당 주에 표시할 바 목록
 */
export function getMultiDayBarsForWeek(
  events: readonly SchoolEvent[],
  weekStart: Date,
  categories: readonly CategoryItem[],
): CalendarBar[] {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();
  
  // 다일 이벤트만 필터 (endDate가 있고 date와 다른 것)
  const multiDayEvents = events.filter(e => {
    if (!e.endDate || e.endDate === e.date) return false;
    const eStart = parseLocalDate(e.date).getTime();
    const eEnd = parseLocalDate(e.endDate).getTime();
    // 이 주와 겹치는가?
    return eStart <= weekEndMs && eEnd >= weekStartMs;
  });
  
  // 시작일 순 정렬 (긴 것 우선)
  const sorted = [...multiDayEvents].sort((a, b) => {
    const diff = a.date.localeCompare(b.date);
    if (diff !== 0) return diff;
    // 같은 시작일이면 더 긴 이벤트를 먼저
    const aLen = daysBetween(a.date, a.endDate!);
    const bLen = daysBetween(b.date, b.endDate!);
    return bLen - aLen;
  });
  
  const bars: CalendarBar[] = [];
  const rowTracker: number[][] = []; // 각 행의 점유 열 목록
  
  for (const event of sorted) {
    const eStart = parseLocalDate(event.date);
    const eEnd = parseLocalDate(event.endDate!);
    
    // 이 주 내에서의 시작/종료 열 계산
    const clampedStart = new Date(Math.max(eStart.getTime(), weekStartMs));
    const clampedEnd = new Date(Math.min(eEnd.getTime(), weekEndMs));
    
    const startCol = Math.floor((clampedStart.getTime() - weekStartMs) / 86400000);
    const endCol = Math.floor((clampedEnd.getTime() - weekStartMs) / 86400000);
    
    // 겹치지 않는 행 찾기
    let row = 0;
    while (true) {
      if (!rowTracker[row]) { rowTracker[row] = []; break; }
      const occupied = rowTracker[row]!;
      const hasConflict = occupied.some(col => col >= startCol && col <= endCol);
      if (!hasConflict) break;
      row++;
    }
    
    // 행 점유 등록
    if (!rowTracker[row]) rowTracker[row] = [];
    for (let c = startCol; c <= endCol; c++) {
      rowTracker[row]!.push(c);
    }
    
    const catInfo = categories.find(c => c.id === event.category);
    
    bars.push({
      event,
      startCol,
      endCol,
      row,
      isStart: eStart.getTime() >= weekStartMs,
      isEnd: eEnd.getTime() <= weekEndMs,
      color: catInfo?.color ?? 'blue',
    });
  }
  
  return bars;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86400000
  );
}
```

#### 2-3. CalendarView 리디자인

현재 날짜 셀 구조를 "날짜 + dot" 에서 "날짜 + 바 오버레이 + dot" 로 변경:

```typescript
// CalendarView.tsx 변경 포인트

// 주 단위로 렌더링을 분리
function CalendarWeek({ 
  days, 
  bars,
  selectedDate,
  onSelectDate,
}: { 
  days: CalendarDay[];     // 7일 
  bars: CalendarBar[];     // 이 주의 바 목록
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <div className="relative">
      {/* 날짜 셀 그리드 */}
      <div className="grid grid-cols-7 gap-y-0 gap-x-1">
        {days.map((d, idx) => (
          <DayCell key={idx} day={d} /* ... */ />
        ))}
      </div>
      
      {/* 바 오버레이 (날짜 아래에 절대 위치) */}
      <div className="relative" style={{ minHeight: `${bars.length > 0 ? (Math.max(...bars.map(b => b.row)) + 1) * 20 : 0}px` }}>
        {bars.map((bar, idx) => (
          <MultiDayBar key={idx} bar={bar} />
        ))}
      </div>
    </div>
  );
}

function MultiDayBar({ bar }: { bar: CalendarBar }) {
  const left = `${(bar.startCol / 7) * 100}%`;
  const width = `${((bar.endCol - bar.startCol + 1) / 7) * 100}%`;
  const top = `${bar.row * 20}px`;
  
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/70',
    green: 'bg-green-500/70',
    yellow: 'bg-yellow-500/70',
    purple: 'bg-purple-500/70',
    red: 'bg-red-500/70',
    pink: 'bg-pink-500/70',
    indigo: 'bg-indigo-500/70',
    teal: 'bg-teal-500/70',
    gray: 'bg-gray-500/70',
  };
  
  return (
    <div
      className={`absolute h-[18px] ${colorMap[bar.color] ?? 'bg-blue-500/70'} text-white text-[10px] leading-[18px] px-1.5 truncate
        ${bar.isStart ? 'rounded-l-md' : ''}
        ${bar.isEnd ? 'rounded-r-md' : ''}
      `}
      style={{ left, width, top }}
      title={bar.event.title}
    >
      {bar.isStart && bar.event.title}
    </div>
  );
}
```

#### 2-4. 단일 일정 vs 다일 일정 표시 규칙

| 조건 | 표시 방식 |
|------|----------|
| `endDate` 없음 | 기존 dot(점) 표시 |
| `endDate === date` | 기존 dot 표시 |
| `endDate > date` (다일) | **바(bar) 표시** + dot 제거 |
| 다일 일정이 주를 넘어갈 때 | 주 경계에서 바를 분할하여 양쪽에 표시 |

#### 2-5. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/rules/eventRules.ts` | ✏️ `getMultiDayBarsForWeek()`, `CalendarBar` 타입 추가 |
| `adapters/components/Schedule/CalendarView.tsx` | ✏️ 주 단위 렌더링으로 리팩토링, 바 오버레이 추가 |
| `adapters/presenters/categoryPresenter.ts` | ✏️ 바 색상 매핑 유틸 추가 |

---

### S3. 연간/학기 뷰

#### 3-1. 뷰 모드 선택

```
┌──────────────────────────────────────────────────────┐
│ 📋 일정 관리          [월간] [학기] [연간]  + 일정추가│
└──────────────────────────────────────────────────────┘
```

기존 월간 뷰 외에 **학기 뷰**와 **연간 뷰**를 탭으로 전환합니다.

#### 3-2. 뷰 타입 정의

```typescript
// Schedule.tsx 에 추가

type ScheduleView = 'month' | 'semester' | 'year';

const VIEW_LABELS: Record<ScheduleView, string> = {
  month: '월간',
  semester: '학기',
  year: '연간',
};

// 학기 기간 정의 (한국 학교 기준)
const SEMESTERS = {
  first: { label: '1학기', startMonth: 2, endMonth: 7 },   // 3월~8월 (0-based: 2~7)
  second: { label: '2학기', startMonth: 8, endMonth: 1 },  // 9월~2월
} as const;
```

#### 3-3. 연간 뷰 컴포넌트

12개 미니 캘린더를 3×4 그리드로 표시:

```
┌──────────────────────────────────────────────────────┐
│                   2026년 연간 일정                     │
├──────────┬──────────┬──────────┬──────────┤
│  1월     │  2월     │  3월     │  4월     │
│ [미니달력]│ [미니달력]│ [미니달력]│ [미니달력]│
├──────────┼──────────┼──────────┼──────────┤
│  5월     │  6월     │  7월     │  8월     │
│ [미니달력]│ [미니달력]│ [미니달력]│ [미니달력]│
├──────────┼──────────┼──────────┼──────────┤
│  9월     │ 10월     │ 11월     │ 12월     │
│ [미니달력]│ [미니달력]│ [미니달력]│ [미니달력]│
└──────────┴──────────┴──────────┴──────────┘
```

```typescript
// src/adapters/components/Schedule/YearView.tsx (신규)

interface YearViewProps {
  year: number;
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  onSelectMonth: (month: number) => void;  // 월 클릭 시 월간 뷰로 전환
  onPrevYear: () => void;
  onNextYear: () => void;
}

export function YearView({
  year, events, categories,
  onSelectMonth, onPrevYear, onNextYear,
}: YearViewProps) {
  return (
    <div className="bg-sp-card rounded-3xl p-6 border border-sp-border shadow-xl">
      {/* 연도 네비게이션 */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onPrevYear}>◀</button>
        <h3 className="text-xl font-bold text-sp-text">{year}년</h3>
        <button onClick={onNextYear}>▶</button>
      </div>
      
      {/* 12개 미니 캘린더 */}
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, i) => (
          <MiniMonth
            key={i}
            year={year}
            month={i}
            events={events}
            categories={categories}
            onClick={() => onSelectMonth(i)}
          />
        ))}
      </div>
    </div>
  );
}
```

#### 3-4. 미니 캘린더 컴포넌트

```typescript
// YearView.tsx 내부 또는 별도 파일

function MiniMonth({ year, month, events, categories, onClick }: {
  year: number;
  month: number;
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  onClick: () => void;
}) {
  const monthEvents = getEventsForMonth(events, year, month);
  const holidays = getHolidayMapForMonth(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
  
  // 날짜 계산
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  return (
    <div 
      className={`p-3 rounded-xl cursor-pointer transition-all hover:bg-sp-surface
        ${isCurrentMonth ? 'ring-2 ring-sp-accent' : 'border border-sp-border/50'}
      `}
      onClick={onClick}
    >
      <h4 className={`text-sm font-bold mb-2 text-center
        ${isCurrentMonth ? 'text-sp-accent' : 'text-sp-text'}
      `}>
        {month + 1}월
      </h4>
      <div className="grid grid-cols-7 gap-0 text-[9px]">
        {/* 요일 헤더 */}
        {['일','월','화','수','목','금','토'].map(d => (
          <div key={d} className="text-center text-sp-muted/50">{d}</div>
        ))}
        {/* 빈칸 + 날짜 */}
        {Array.from({ length: firstDay }, (_, i) => (
          <div key={`empty-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const hasEvent = monthEvents.some(e => {
            const end = e.endDate ?? e.date;
            return e.date <= dateStr && end >= dateStr;
          });
          const isHoliday = holidays.has(dateStr);
          const isToday = today.getFullYear() === year 
            && today.getMonth() === month 
            && today.getDate() === day;
          
          return (
            <div key={day} className={`text-center py-0.5 rounded
              ${isToday ? 'bg-sp-accent text-white font-bold' : ''}
              ${isHoliday ? 'text-red-400' : ''}
              ${hasEvent && !isToday ? 'font-bold text-sp-accent' : ''}
              ${!hasEvent && !isHoliday && !isToday ? 'text-sp-muted' : ''}
            `}>
              {day}
            </div>
          );
        })}
      </div>
      {/* 이벤트 수 표시 */}
      {monthEvents.length > 0 && (
        <p className="text-[10px] text-sp-muted text-center mt-1">
          일정 {monthEvents.length}건
        </p>
      )}
    </div>
  );
}
```

#### 3-5. 학기 뷰 컴포넌트

6개월치 미니 캘린더를 2×3 또는 3×2 그리드로 표시 + 주요 일정 타임라인:

```typescript
// src/adapters/components/Schedule/SemesterView.tsx (신규)

interface SemesterViewProps {
  year: number;
  semester: 'first' | 'second';
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  onSelectMonth: (month: number) => void;
  onToggleSemester: () => void;
}

export function SemesterView({ 
  year, semester, events, categories,
  onSelectMonth, onToggleSemester,
}: SemesterViewProps) {
  const semesterInfo = SEMESTERS[semester];
  const months = getSemesterMonths(year, semester);
  
  // 학기 내 이벤트만 필터
  const semesterEvents = events.filter(e => {
    const m = parseInt(e.date.split('-')[1]!, 10) - 1;
    return months.includes(m);
  });
  
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* 좌측: 미니 캘린더 6개 */}
      <div className="lg:w-[55%]">
        <div className="bg-sp-card rounded-3xl p-6 border border-sp-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-sp-text">
              {year}년 {semesterInfo.label}
            </h3>
            <button onClick={onToggleSemester} className="text-sm text-sp-accent">
              {semester === 'first' ? '2학기 보기 →' : '← 1학기 보기'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {months.map(m => (
              <MiniMonth key={m} year={year} month={m} 
                events={events} categories={categories}
                onClick={() => onSelectMonth(m)} />
            ))}
          </div>
        </div>
      </div>
      
      {/* 우측: 학기 주요 일정 타임라인 */}
      <div className="lg:w-[45%]">
        <SemesterTimeline events={semesterEvents} categories={categories} />
      </div>
    </div>
  );
}

function getSemesterMonths(year: number, semester: 'first' | 'second'): number[] {
  if (semester === 'first') return [2, 3, 4, 5, 6, 7]; // 3~8월
  return [8, 9, 10, 11, 0, 1]; // 9~2월 (다음해 1,2월 포함)
}
```

#### 3-6. Schedule.tsx 뷰 전환 통합

```typescript
// Schedule.tsx 수정 포인트

export function Schedule() {
  // 기존 상태...
  const [view, setView] = useState<ScheduleView>('month');
  const [semester, setSemester] = useState<'first' | 'second'>(() => {
    const m = new Date().getMonth();
    return m >= 2 && m <= 7 ? 'first' : 'second';
  });
  
  return (
    <div className="flex flex-col h-full -m-8">
      <header className="...">
        {/* 뷰 전환 탭 */}
        <div className="flex gap-2 bg-sp-surface rounded-xl p-1">
          {(['month', 'semester', 'year'] as ScheduleView[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition
                ${view === v ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'}
              `}>
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {/* 기존 버튼들... */}
      </header>
      
      <div className="flex-1 overflow-y-auto p-8">
        {view === 'month' && (
          /* 기존 월간 뷰 (CalendarView + EventList) */
        )}
        {view === 'semester' && (
          <SemesterView
            year={year} semester={semester}
            events={events} categories={categories}
            onSelectMonth={(m) => { setMonth(m); setView('month'); }}
            onToggleSemester={() => setSemester(s => s === 'first' ? 'second' : 'first')}
          />
        )}
        {view === 'year' && (
          <YearView
            year={year} events={events} categories={categories}
            onSelectMonth={(m) => { setMonth(m); setView('month'); }}
            onPrevYear={() => setYear(y => y - 1)}
            onNextYear={() => setYear(y => y + 1)}
          />
        )}
      </div>
    </div>
  );
}
```

#### 3-7. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `adapters/components/Schedule/YearView.tsx` | 🆕 연간 뷰 (12개 미니 캘린더) |
| `adapters/components/Schedule/SemesterView.tsx` | 🆕 학기 뷰 (6개 미니 캘린더 + 타임라인) |
| `adapters/components/Schedule/Schedule.tsx` | ✏️ 뷰 전환 탭 추가, 라우팅 |

---

## 📊 전체 수정 파일 매트릭스

| 파일 | S1 구글연동 | S2 다일바 | S3 연간뷰 |
|------|:-----------:|:---------:|:---------:|
| `domain/entities/ExternalCalendar.ts` | 🆕 | | |
| `domain/rules/eventRules.ts` | | ✏️ | |
| `infrastructure/calendar/ICalParser.ts` | 🆕 | | |
| `usecases/events/SyncExternalCalendar.ts` | 🆕 | | |
| `adapters/stores/useEventsStore.ts` | ✏️ | | |
| `adapters/components/Settings/SettingsPage.tsx` | ✏️ | | |
| `adapters/components/Schedule/CalendarView.tsx` | | ✏️ | |
| `adapters/components/Schedule/Schedule.tsx` | | | ✏️ |
| `adapters/components/Schedule/YearView.tsx` | | | 🆕 |
| `adapters/components/Schedule/SemesterView.tsx` | | | 🆕 |
| `adapters/presenters/categoryPresenter.ts` | | ✏️ | |
| `electron/main.ts` | ✏️ | | |
| `src/global.d.ts` | ✏️ | | |

✏️ = 수정, 🆕 = 신규 생성

---

## 🗓 구현 일정 (7~10일)

### Day 1-2: S2 다일 일정 바 표시 (가장 시각적 효과 큼)

- [ ] `CalendarBar` 타입 및 `getMultiDayBarsForWeek()` 구현
- [ ] CalendarView를 주 단위 렌더링으로 리팩토링
- [ ] `MultiDayBar` 컴포넌트 구현 (색상, 모서리, 텍스트)
- [ ] 주 경계 분할 처리 (isStart/isEnd)
- [ ] 겹침 처리 (row 계산 알고리즘)
- [ ] 단일 일정 dot과 다일 바 공존 레이아웃 조정

### Day 3-4: S3 연간/학기 뷰

- [ ] `MiniMonth` 컴포넌트 구현
- [ ] `YearView.tsx` — 12개 미니 캘린더 그리드
- [ ] `SemesterView.tsx` — 6개 미니 캘린더 + 타임라인
- [ ] `Schedule.tsx` — 뷰 전환 탭 추가
- [ ] 미니 캘린더 클릭 → 월간 뷰 전환 연결
- [ ] 현재 학기 자동 감지

### Day 5-7: S1 구글 캘린더 연동

- [ ] `ICalParser.ts` — iCal 파서 구현
- [ ] `ExternalCalendar.ts` — 엔티티 정의
- [ ] `SyncExternalCalendar.ts` — 유스케이스 구현
- [ ] `electron/main.ts` — `fetch-url` IPC 핸들러
- [ ] `SettingsPage.tsx` — "외부 캘린더" 설정 UI
- [ ] 동기화 결과 토스트 (추가 N건, 업데이트 N건)
- [ ] 외부 일정 구분 표시 (아이콘 또는 뱃지)

### Day 8-9: QA & 엣지케이스

- [ ] 다일 바 — 월 경계, 연 경계 테스트
- [ ] iCal 파싱 — 다양한 캘린더 형식 호환 테스트
- [ ] 연간 뷰 — 이벤트 많을 때 성능 테스트
- [ ] 다크 모드 / 라이트 모드 일관성
- [ ] 위젯 모드에서 다일 일정 표시 확인

### Day 10: 마무리

- [ ] 코드 정리 및 타입 체크
- [ ] 내보내기(Excel/HWPX)에서 다일 일정 올바르게 표시 확인
- [ ] README 업데이트

---

## ⚠️ 기술적 고려사항

### iCal 파싱 제한사항

- **RRULE(반복 규칙)**: iCal의 RRULE은 매우 복잡합니다. Phase 1에서는 단순 반복만 지원하고, 고급 반복(매월 셋째 화요일 등)은 추후 지원합니다.
- **VTIMEZONE**: 시간대 변환은 `Intl.DateTimeFormat`으로 처리합니다.
- **CORS**: Google의 public iCal URL은 CORS 허용이지만, 일부 서비스는 아닐 수 있습니다. Electron에서는 `fetch-url` IPC로 우회합니다.

### 다일 바 성능

- 이벤트가 많을 때 `getMultiDayBarsForWeek()` 계산이 모든 주에 대해 반복됩니다.
- `useMemo`로 캐싱하고, 월 변경 시에만 재계산합니다.
- 최대 표시 행(row) 수를 3으로 제한하여 캘린더가 과도하게 커지지 않게 합니다.

### 학기 뷰 — 학교 유형별 차이

- 초등: 1학기(3~8월), 2학기(9~2월) — 기본값
- 중등/고등: 동일하지만 방학 기간이 다름
- 설정에서 학기 시작/종료월을 커스터마이즈할 수 있도록 확장 가능

---

## 🎯 기대 효과

| 기능 | Before | After |
|------|--------|-------|
| 구글 연동 | 이중 관리 필요 | iCal URL 한 번 등록 → 자동 동기화 |
| 다일 일정 | dot만 표시 → 기간 불명확 | 바 형태로 시각적 기간 표시 |
| 연간 뷰 | 없음 → 월별로만 확인 | 12개월 한눈에 + 월 클릭 드릴다운 |
| 학기 뷰 | 없음 | 학기 단위 일정 + 타임라인 한눈에 |

### 교사 실사용 시나리오

**시나리오 1: 학기 초 일정 계획**
> 연간 뷰에서 작년 일정을 참고하며 올해 학사 일정을 한눈에 확인.  
> 기말고사(3일간) → 바 형태로 깔끔하게 표시.

**시나리오 2: 구글 캘린더 연동**
> 교무실 구글 공유 캘린더 URL을 붙여넣기.  
> "동기화" 클릭 → 학교 행사 42건 자동 가져오기.  
> 매주 한 번 동기화로 최신 상태 유지.

**시나리오 3: 학기 뷰 활용**
> 1학기 뷰에서 중간고사, 기말고사, 수행평가, 체험학습을  
> 한 화면에서 보며 수업 진도 계획 수립.

---

*이 문서는 Claude Code(듀이)가 쌤핀 v0.1.7 코드 분석을 기반으로 작성했습니다.*