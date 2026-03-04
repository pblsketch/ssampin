# 쌤핀 Todo 기능 확장 구현 계획서

> **작성일**: 2026년 3월 4일  
> **대상 버전**: v0.1.7 → v0.2.0  
> **예상 소요**: 5~7일  

---

## 📋 구현 목표

| # | 기능 | 우선순위 | 난이도 |
|---|------|---------|--------|
| F1 | 우선순위 (긴급/중요) | ⭐⭐⭐ | ⭐⭐ |
| F2 | 반복 할 일 | ⭐⭐⭐ | ⭐⭐⭐ |
| F3 | 카테고리/태그 | ⭐⭐ | ⭐⭐ |
| F4 | 완료된 할 일 일괄 삭제/아카이브 | ⭐⭐ | ⭐ |

---

## 🏗 아키텍처 현황 분석

### 현재 파일 구조 (Todo 관련)

```
src/
├── domain/
│   ├── entities/Todo.ts              ← 엔티티 정의
│   ├── repositories/ITodoRepository.ts ← 리포지토리 인터페이스
│   └── rules/todoRules.ts            ← 정렬/필터/그룹핑 규칙
├── usecases/
│   └── todo/ManageTodos.ts           ← 유스케이스 (CRUD)
├── adapters/
│   ├── stores/useTodoStore.ts        ← Zustand 스토어
│   ├── repositories/JsonTodoRepository.ts ← JSON 저장소
│   └── components/
│       ├── Todo/Todo.tsx             ← 전체 페이지 (361줄)
│       └── Dashboard/DashboardTodo.tsx ← 위젯용 (100줄)
└── widgets/
    └── items/TodoWidget.tsx          ← DashboardTodo 래핑
```

### 현재 Todo 엔티티

```typescript
// src/domain/entities/Todo.ts
export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;   // "YYYY-MM-DD"
  readonly createdAt: string;  // ISO 8601
}
```

### 현재 스토어 인터페이스

```typescript
// useTodoStore — 현재 메서드
load()
addTodo(text: string, dueDate?: string)
toggleTodo(id: string)
deleteTodo(id: string)
```

---

## 📐 상세 설계

---

### F1. 우선순위 (긴급/중요)

#### 1-1. 엔티티 변경

```typescript
// src/domain/entities/Todo.ts

/** 우선순위 레벨 */
export type TodoPriority = 'high' | 'medium' | 'low' | 'none';

export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;
  readonly createdAt: string;
  readonly priority: TodoPriority;      // ✅ 추가
  readonly category?: string;           // ✅ F3에서 추가
  readonly recurrence?: TodoRecurrence; // ✅ F2에서 추가
  readonly archivedAt?: string;         // ✅ F4에서 추가
}
```

#### 1-2. 우선순위 UI 디자인

```
┌─────────────────────────────────────────────┐
│ 🔴 높음  🟡 보통  🔵 낮음  ⚪ 없음        │
│                                             │
│ [!] 3학년 성적 입력 마감          3/5  🔴  │
│ [ ] 학부모 상담 일정 정리         3/6  🟡  │
│ [ ] 교실 환경 정리               3/7  🔵  │
│ [✓] 주간학습안 제출              3/3  ⚪  │
└─────────────────────────────────────────────┘
```

#### 1-3. 우선순위별 색상 매핑

```typescript
// src/domain/valueObjects/TodoPriority.ts (신규)

export const PRIORITY_CONFIG: Record<TodoPriority, {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  sortOrder: number;
}> = {
  high:   { label: '높음', icon: '🔴', color: 'text-red-500',    bgColor: 'bg-red-500/10',    sortOrder: 0 },
  medium: { label: '보통', icon: '🟡', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', sortOrder: 1 },
  low:    { label: '낮음', icon: '🔵', color: 'text-blue-500',   bgColor: 'bg-blue-500/10',   sortOrder: 2 },
  none:   { label: '없음', icon: '⚪', color: 'text-sp-muted',   bgColor: '',                  sortOrder: 3 },
};
```

#### 1-4. todoRules.ts 정렬 로직 변경

```typescript
// 정렬 순서: 미완료(우선순위 높은 순) → 완료
export function sortTodos(todos: readonly Todo[]): readonly Todo[] {
  return [...todos].sort((a, b) => {
    // 1차: 완료 여부
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    // 2차: 우선순위 (높은 순)
    const pa = PRIORITY_CONFIG[a.priority ?? 'none'].sortOrder;
    const pb = PRIORITY_CONFIG[b.priority ?? 'none'].sortOrder;
    if (pa !== pb) return pa - pb;
    // 3차: 마감일 (빠른 순)
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}
```

#### 1-5. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/entities/Todo.ts` | `priority` 필드 추가 |
| `domain/valueObjects/TodoPriority.ts` | 신규 생성 — 우선순위 설정값 |
| `domain/rules/todoRules.ts` | 정렬에 우선순위 반영 |
| `adapters/stores/useTodoStore.ts` | `addTodo` 매개변수에 `priority` 추가, `updatePriority` 메서드 추가 |
| `usecases/todo/ManageTodos.ts` | `updateTodo` 메서드 추가 (부분 업데이트) |
| `adapters/components/Todo/Todo.tsx` | 입력 폼에 우선순위 셀렉터, 아이템에 뱃지 표시 |
| `adapters/components/Dashboard/DashboardTodo.tsx` | 우선순위 아이콘 표시 |

---

### F2. 반복 할 일

#### 2-1. 반복 타입 정의

```typescript
// src/domain/entities/Todo.ts 에 추가

/** 반복 주기 */
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays';

export interface TodoRecurrence {
  readonly type: RecurrenceType;
  readonly interval: number;          // 1 = 매번, 2 = 격주/격월 등
  readonly endDate?: string;          // 반복 종료일 (없으면 무한)
  readonly daysOfWeek?: number[];     // weekly일 때: 0(일)~6(토)
}
```

#### 2-2. 반복 프리셋

교사 업무에 맞는 프리셋을 제공합니다:

```typescript
// src/domain/valueObjects/TodoRecurrence.ts (신규)

export const RECURRENCE_PRESETS: {
  label: string;
  value: TodoRecurrence | null;
}[] = [
  { label: '반복 없음', value: null },
  { label: '매일', value: { type: 'daily', interval: 1 } },
  { label: '평일마다', value: { type: 'weekdays', interval: 1 } },
  { label: '매주', value: { type: 'weekly', interval: 1 } },
  { label: '격주', value: { type: 'weekly', interval: 2 } },
  { label: '매월', value: { type: 'monthly', interval: 1 } },
  { label: '매년', value: { type: 'yearly', interval: 1 } },
];
```

#### 2-3. 반복 할 일 완료 로직

```typescript
// ManageTodos.ts — toggleTodo 수정

async toggleTodo(id: string): Promise<Todo | null> {
  const data = await this.todoRepository.getTodos();
  const todos = data?.todos ?? [];
  const target = todos.find(t => t.id === id);
  
  if (!target) return null;
  
  // 반복 할 일이 완료되면 → 다음 인스턴스 자동 생성
  if (!target.completed && target.recurrence && target.dueDate) {
    const nextDueDate = calculateNextDueDate(target.dueDate, target.recurrence);
    
    // 종료일 체크
    if (!target.recurrence.endDate || nextDueDate <= target.recurrence.endDate) {
      const nextTodo: Todo = {
        id: crypto.randomUUID(),
        text: target.text,
        completed: false,
        priority: target.priority,
        category: target.category,
        recurrence: target.recurrence,
        dueDate: nextDueDate,
        createdAt: new Date().toISOString(),
      };
      
      // 원본 완료 + 새 인스턴스 추가
      const updated = todos.map(t => 
        t.id === id ? { ...t, completed: true } : t
      );
      await this.todoRepository.saveTodos({ todos: [...updated, nextTodo] });
      return nextTodo;
    }
  }
  
  // 일반 토글
  const updated = todos.map(t =>
    t.id === id ? { ...t, completed: !t.completed } : t
  );
  await this.todoRepository.saveTodos({ todos: updated });
  return null;
}
```

#### 2-4. 다음 날짜 계산 유틸

```typescript
// src/domain/rules/todoRules.ts 에 추가

export function calculateNextDueDate(
  currentDate: string,
  recurrence: TodoRecurrence,
): string {
  const date = new Date(currentDate + 'T00:00:00');
  
  switch (recurrence.type) {
    case 'daily':
      date.setDate(date.getDate() + recurrence.interval);
      break;
    case 'weekdays': {
      // 다음 평일로 이동
      let daysToAdd = recurrence.interval;
      while (daysToAdd > 0) {
        date.setDate(date.getDate() + 1);
        const day = date.getDay();
        if (day !== 0 && day !== 6) daysToAdd--;
      }
      break;
    }
    case 'weekly':
      date.setDate(date.getDate() + 7 * recurrence.interval);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + recurrence.interval);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + recurrence.interval);
      break;
  }
  
  return formatDate(date);
}
```

#### 2-5. UI — 반복 설정 드롭다운

```
┌─────────────────────────────────────────────┐
│ 📅 2026-03-04  │ 할 일 입력...    │ 추가  │
│ 🔴 높음 ▼      │ 🔄 매주 ▼       │       │
│ 📁 수업 ▼      │                  │       │
└─────────────────────────────────────────────┘
```

반복 할 일은 아이템에 🔄 아이콘으로 표시:

```
│ [ ] 🔄 주간학습안 제출         3/10  🟡  │
│     └ 매주 반복                          │
```

#### 2-6. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/entities/Todo.ts` | `TodoRecurrence` 인터페이스, `recurrence` 필드 추가 |
| `domain/valueObjects/TodoRecurrence.ts` | 신규 생성 — 반복 프리셋 |
| `domain/rules/todoRules.ts` | `calculateNextDueDate()` 함수 추가 |
| `usecases/todo/ManageTodos.ts` | `toggleTodo` 수정 — 반복 시 자동 생성 |
| `adapters/stores/useTodoStore.ts` | `toggleTodo` 반환값 처리, 새 인스턴스 추가 |
| `adapters/components/Todo/Todo.tsx` | 반복 설정 드롭다운, 🔄 아이콘 표시 |

---

### F3. 카테고리/태그

#### 3-1. 카테고리 정의

```typescript
// src/domain/entities/Todo.ts 에 추가

export interface TodoCategory {
  readonly id: string;
  readonly name: string;
  readonly color: string;  // 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'pink'
  readonly icon: string;   // emoji
}

export const DEFAULT_TODO_CATEGORIES: readonly TodoCategory[] = [
  { id: 'class',   name: '수업',   color: 'blue',   icon: '📚' },
  { id: 'admin',   name: '업무',   color: 'green',  icon: '📋' },
  { id: 'student', name: '학생',   color: 'yellow', icon: '👨‍🎓' },
  { id: 'meeting', name: '회의',   color: 'purple', icon: '🤝' },
  { id: 'etc',     name: '기타',   color: 'gray',   icon: '📌' },
];
```

#### 3-2. 카테고리 데이터 저장

카테고리 목록은 TodosData에 함께 저장합니다:

```typescript
// src/domain/entities/Todo.ts

export interface TodosData {
  readonly todos: readonly Todo[];
  readonly categories?: readonly TodoCategory[];  // ✅ 추가
}
```

#### 3-3. 카테고리 필터 UI

기존 날짜 필터 탭 옆에 카테고리 필터 추가:

```
┌─ 날짜 ─────────────────────────────────────┐
│ [전체] [오늘] [이번 주]                     │
├─ 카테고리 ──────────────────────────────────┤
│ [전체] [📚수업] [📋업무] [👨‍🎓학생] [🤝회의] │
└─────────────────────────────────────────────┘
```

#### 3-4. todoRules.ts 필터 추가

```typescript
/** 카테고리 필터링 */
export function filterByCategory(
  todos: readonly Todo[],
  categoryId: string | null,
): readonly Todo[] {
  if (!categoryId) return todos;
  return todos.filter((t) => t.category === categoryId);
}
```

#### 3-5. 카테고리 관리 UI

설정은 간단한 인라인 편집으로:
- 기본 5개 카테고리 제공
- 이름/색상/아이콘 편집 가능
- 카테고리 추가/삭제 가능
- Todo 페이지 상단에 "카테고리 관리" 버튼

#### 3-6. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/entities/Todo.ts` | `TodoCategory`, `category` 필드, `TodosData.categories` 추가 |
| `domain/rules/todoRules.ts` | `filterByCategory()` 추가 |
| `usecases/todo/ManageTodos.ts` | 카테고리 CRUD 메서드 추가 |
| `adapters/stores/useTodoStore.ts` | `categories` 상태, 카테고리 관련 액션 추가 |
| `adapters/components/Todo/Todo.tsx` | 카테고리 필터 탭, 입력 폼에 카테고리 셀렉터 |
| `adapters/components/Todo/TodoCategoryModal.tsx` | 신규 — 카테고리 관리 모달 |

---

### F4. 완료된 할 일 일괄 삭제/아카이브

#### 4-1. 아카이브 전략

**삭제 vs 아카이브**: 완료된 할 일은 바로 삭제하면 기록이 사라지므로, **아카이브** 방식을 채택합니다.

```typescript
// Todo 엔티티에 추가
export interface Todo {
  // ... 기존 필드
  readonly archivedAt?: string;  // ISO 8601 — 아카이브 시각
}
```

#### 4-2. 동작 방식

1. **아카이브**: 완료된 Todo에 `archivedAt` 타임스탬프 부여 → 메인 목록에서 숨김
2. **아카이브 보기**: 별도 탭/토글로 아카이브된 항목 조회 가능
3. **영구 삭제**: 아카이브에서 개별/일괄 삭제
4. **복원**: 아카이브에서 메인으로 복원 (archivedAt 제거)

#### 4-3. UI 디자인

```
┌─────────────────────────────────────────────┐
│ ✅ 할 일           진행 8/12 (67%)         │
│                                             │
│ [전체] [오늘] [이번 주]    🗃️ 아카이브 (4) │
├─────────────────────────────────────────────┤
│ ... 할 일 목록 ...                         │
│                                             │
│ ┌─ 완료됨 (4건) ──────────────────────────┐ │
│ │ [✓] 학부모 상담           3/1          │ │
│ │ [✓] 체험학습 보고서       3/2          │ │
│ │ ...                                    │ │
│ │                                        │ │
│ │ [📦 완료 항목 모두 아카이브]            │ │
│ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

아카이브 뷰:

```
┌─────────────────────────────────────────────┐
│ 🗃️ 아카이브      ← 돌아가기               │
│                                             │
│ [✓] 학부모 상담    3/1   [복원] [삭제]     │
│ [✓] 체험학습 보고서 3/2   [복원] [삭제]     │
│                                             │
│       [🗑 전체 삭제]                        │
└─────────────────────────────────────────────┘
```

#### 4-4. 유스케이스 추가

```typescript
// ManageTodos.ts 에 추가

/** 완료된 할 일 일괄 아카이브 */
async archiveCompleted(): Promise<number> {
  const data = await this.todoRepository.getTodos();
  const todos = data?.todos ?? [];
  const now = new Date().toISOString();
  
  let archivedCount = 0;
  const updated = todos.map(todo => {
    if (todo.completed && !todo.archivedAt) {
      archivedCount++;
      return { ...todo, archivedAt: now };
    }
    return todo;
  });
  
  await this.todoRepository.saveTodos({ 
    todos: updated, 
    categories: data?.categories 
  });
  return archivedCount;
}

/** 아카이브에서 복원 */
async restoreFromArchive(id: string): Promise<void> {
  const data = await this.todoRepository.getTodos();
  const todos = data?.todos ?? [];
  const updated = todos.map(todo =>
    todo.id === id ? { ...todo, archivedAt: undefined, completed: false } : todo
  );
  await this.todoRepository.saveTodos({ 
    todos: updated, 
    categories: data?.categories 
  });
}

/** 아카이브 항목 영구 삭제 */
async deleteArchived(ids?: string[]): Promise<void> {
  const data = await this.todoRepository.getTodos();
  const todos = data?.todos ?? [];
  const filtered = ids
    ? todos.filter(t => !ids.includes(t.id))
    : todos.filter(t => !t.archivedAt);  // 전체 삭제
  await this.todoRepository.saveTodos({ 
    todos: filtered, 
    categories: data?.categories 
  });
}
```

#### 4-5. todoRules.ts 필터 추가

```typescript
/** 아카이브되지 않은 (활성) 할 일만 필터 */
export function filterActive(todos: readonly Todo[]): readonly Todo[] {
  return todos.filter((t) => !t.archivedAt);
}

/** 아카이브된 할 일만 필터 */
export function filterArchived(todos: readonly Todo[]): readonly Todo[] {
  return todos.filter((t) => !!t.archivedAt);
}
```

#### 4-6. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `domain/entities/Todo.ts` | `archivedAt` 필드 추가 |
| `domain/rules/todoRules.ts` | `filterActive()`, `filterArchived()` 추가 |
| `usecases/todo/ManageTodos.ts` | `archiveCompleted()`, `restoreFromArchive()`, `deleteArchived()` |
| `adapters/stores/useTodoStore.ts` | 아카이브 관련 액션 3개 추가 |
| `adapters/components/Todo/Todo.tsx` | "아카이브" 버튼, 아카이브 뷰 탭 |

---

## 📊 전체 수정 파일 매트릭스

| 파일 | F1 우선순위 | F2 반복 | F3 카테고리 | F4 아카이브 |
|------|:-----------:|:-------:|:-----------:|:-----------:|
| `domain/entities/Todo.ts` | ✏️ | ✏️ | ✏️ | ✏️ |
| `domain/valueObjects/TodoPriority.ts` | 🆕 | | | |
| `domain/valueObjects/TodoRecurrence.ts` | | 🆕 | | |
| `domain/rules/todoRules.ts` | ✏️ | ✏️ | ✏️ | ✏️ |
| `usecases/todo/ManageTodos.ts` | ✏️ | ✏️ | ✏️ | ✏️ |
| `adapters/stores/useTodoStore.ts` | ✏️ | ✏️ | ✏️ | ✏️ |
| `adapters/components/Todo/Todo.tsx` | ✏️ | ✏️ | ✏️ | ✏️ |
| `adapters/components/Todo/TodoCategoryModal.tsx` | | | 🆕 | |
| `adapters/components/Dashboard/DashboardTodo.tsx` | ✏️ | ✏️ | | |

✏️ = 수정, 🆕 = 신규 생성

---

## 🗓 구현 일정 (5~7일)

### Day 1-2: 엔티티 & 도메인 레이어

- [ ] `Todo` 인터페이스 확장 (priority, recurrence, category, archivedAt)
- [ ] `TodoPriority.ts` ValueObject 생성
- [ ] `TodoRecurrence.ts` ValueObject 생성
- [ ] `todoRules.ts` 정렬/필터 로직 업데이트
- [ ] `calculateNextDueDate()` 함수 구현 + 테스트
- [ ] 기존 데이터 마이그레이션 로직 (priority 기본값 'none')

### Day 3: 유스케이스 & 스토어

- [ ] `ManageTodos.ts` — `updateTodo()`, `archiveCompleted()`, `restoreFromArchive()`, `deleteArchived()` 추가
- [ ] `ManageTodos.ts` — `toggleTodo()` 반복 로직 수정
- [ ] `useTodoStore.ts` — 새 액션 추가 (updatePriority, updateCategory, archiveCompleted, restoreFromArchive, deleteArchived)
- [ ] `useTodoStore.ts` — categories 상태 관리

### Day 4-5: UI 컴포넌트

- [ ] `Todo.tsx` — 입력 폼 리디자인 (우선순위/반복/카테고리 셀렉터)
- [ ] `Todo.tsx` — 아이템에 우선순위 뱃지, 반복 아이콘, 카테고리 태그 표시
- [ ] `Todo.tsx` — 카테고리 필터 탭 추가
- [ ] `Todo.tsx` — "완료 항목 아카이브" 버튼
- [ ] `Todo.tsx` — 아카이브 뷰 (탭 전환)
- [ ] `TodoCategoryModal.tsx` — 카테고리 관리 모달 신규 생성
- [ ] `DashboardTodo.tsx` — 우선순위 아이콘 표시

### Day 6: 데이터 마이그레이션 & 엣지 케이스

- [ ] 기존 저장 데이터 하위 호환성 (priority 없는 기존 Todo → 'none' 처리)
- [ ] 반복 할 일 종료 처리 (endDate 이후 생성 중단)
- [ ] 아카이브 자동 정리 (90일 이상 된 아카이브 자동 삭제 옵션)
- [ ] 위젯(DashboardTodo)에서 아카이브 제외 확인

### Day 7: QA & 마무리

- [ ] 전체 기능 통합 테스트
- [ ] 다크 모드 / 라이트 모드 UI 확인
- [ ] 글씨 크기 옵션(small/medium/large/xlarge) 호환 확인
- [ ] 위젯 모드에서 Todo 표시 확인
- [ ] 내보내기(Excel/HWPX)에 새 필드 반영

---

## ⚠️ 하위 호환성 고려사항

### 데이터 마이그레이션

기존 사용자의 Todo 데이터에는 `priority`, `category`, `recurrence`, `archivedAt` 필드가 없습니다.

```typescript
// 스토어 load 시 마이그레이션 처리
load: async () => {
  const todos = await manageTodos.getAll();
  
  // 기존 데이터 마이그레이션
  const migrated = todos.map(todo => ({
    ...todo,
    priority: todo.priority ?? 'none',
    // category, recurrence, archivedAt는 undefined 허용
  }));
  
  set({ todos: migrated, loaded: true });
},
```

### TypeScript 타입 안전성

모든 새 필드는 **선택적(optional)** 으로 정의하여 기존 데이터와 호환:

```typescript
export interface Todo {
  readonly id: string;
  readonly text: string;
  readonly completed: boolean;
  readonly dueDate?: string;
  readonly createdAt: string;
  readonly priority?: TodoPriority;       // optional — 기존 호환
  readonly category?: string;             // optional
  readonly recurrence?: TodoRecurrence;   // optional
  readonly archivedAt?: string;           // optional
}
```

---

## 🎯 기대 효과

| 기능 | Before | After |
|------|--------|-------|
| 우선순위 | 모든 할 일이 동등 | 🔴🟡🔵 시각적 구분 → 중요한 것 먼저 처리 |
| 반복 | 매번 수동 재생성 | 완료 시 자동 다음 인스턴스 → 루틴 업무 자동화 |
| 카테고리 | 수업/업무 구분 불가 | 📚📋👨‍🎓🤝 한눈에 분류 → 맥락별 작업 관리 |
| 아카이브 | 완료 항목 쌓임 | 깔끔한 메인 목록 + 기록 보존 |

### 교사 실사용 시나리오

**시나리오 1: 주간 업무 관리**
> 월요일 아침. "주간학습안 제출"(🔴높음, 📋업무, 🔄매주)이 자동 생성되어 있다.  
> 제출 후 체크하면 다음 주 월요일 할 일이 자동으로 추가된다.

**시나리오 2: 학기말 업무 폭주**
> 성적 입력, 생활기록부, 학부모 상담이 동시에. 우선순위로 정렬하니  
> 🔴마감 임박한 것부터 순서대로 보인다.

**시나리오 3: 학기 정리**
> 학기가 끝나고 "완료 항목 모두 아카이브" 클릭.  
> 깔끔한 화면으로 새 학기 시작. 필요 시 아카이브에서 이전 기록 조회.

---

*이 문서는 Claude Code(듀이)가 쌤핀 v0.1.7 코드 분석을 기반으로 작성했습니다.*