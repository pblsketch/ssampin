# SsamPin Class Record UX Cleanup Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task only after the user approves execution. In the current SsamPin workflow, implement sequentially on the existing `main` worktree; do not create a branch/worktree unless the user explicitly asks.

**Goal:** Simplify `수업 관리` so 교과 교사는 `수업 기록`에서 해당 교시 출결과 관찰 기록만 빠르게 처리하고, `출석부`/전체 교시 매트릭스/좌석배치 출결 중복을 제거한다.

**Architecture:** Keep changes in the adapter/UI layer. Do not change domain entities, IndexedDB schema/version, Drive sync usecases/stores, or package dependencies. Separate local-save safety from Drive sync: only local save pending/error may block movement; Drive sync is background state only.

**Tech Stack:** React 18, TypeScript strict, Zustand, Vite, Vitest source/behavior tests, Tailwind `sp-*` design tokens.

---

## Product Decisions

1. `수업 관리` top tabs become: `명렬 관리`, `수업 기록`, `좌석배치`, `진도 관리`, `설문/체크`, `과제 수행`.
2. Remove `출석부` tab from `수업 관리`. Existing attendance data is not deleted.
3. `수업 기록` includes attendance for exactly one selected period.
4. Period is auto-selected from timetable/current context when possible, but the teacher can choose any period because a scheduled 1st-period class can happen in 3rd period.
5. Default record view is list/roster view. Seat view is available inside `수업 기록` as an alternate view.
6. Unchanged/unmarked students count as present. Remove `전체 출석으로 채우기`.
7. Attendance statuses: `출석`, `지각`, `결석`, `조퇴`, `결과`, with existing `reason/memo` UI kept and cleaned up.
8. `좌석배치` is seat editing/viewing only. Remove direct attendance/record mode there. Allow one CTA: `이 좌석으로 수업 기록하기` → `수업 기록` seat view.
9. Drive sync must never block class switching, page navigation, or app closing. If the page is left, Drive sync should continue as the app background process permits.
10. Only local save pending/failure may warn/block navigation.
11. Biggest risks to avoid: data loss and UI complexity.

---

## Protected Files / No-Touch Constraints

Do not edit:

- `src/domain/entities/Attendance.ts`
- `src/domain/entities/Observation.ts`
- `src/domain/entities/TeachingClass.ts`
- `src/domain/entities/Settings.ts`
- `src/adapters/stores/useDriveSyncStore.ts`
- `src/usecases/sync/SyncFromCloud.ts`
- `src/usecases/sync/syncRegistry.ts`
- `package.json`
- `package-lock.json`
- IndexedDB schema/version files

Allowed current area:

- `src/adapters/components/ClassManagement/**`
- `src/adapters/components/ClassManagement/shared/attendanceAutosave.ts`
- `src/adapters/config/featureFlags.ts` only if required by tests, preferably no change

---

## Phase A — Local Save Safety Hotfix

### Task A1: Add source guard test for Drive sync non-blocking movement

**Objective:** Ensure class/page movement is not blocked by Drive sync state.

**Files:**

- Modify or create test: `src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts`
- Read-only target: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`

**Test assertions:**

- `ClassManagementPage.tsx` must not contain the old confirm copy: `동기화 중입니다. 이대로 이동하면 다른 기기에서 이 변경이 보이지 않을 수 있습니다`.
- `ClassManagementPage.tsx` must not use `driveStatus === 'syncing' || driveStatus === 'error' || lastSyncedAt < lastMutationAt` as a movement guard.
- `beforeunload` copy must not be `동기화 중입니다`.
- The file should not import `getLastAttendanceMutationAt` only to compare against Drive `lastSyncedAt`.

**Run:**

```bash
npx vitest run src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts --testTimeout=30000
```

**Expected before implementation:** FAIL.

---

### Task A2: Extend attendance autosave sequencer with local pending/error state

**Objective:** Track local save queue state independently from Drive sync.

**Files:**

- Modify: `src/adapters/components/ClassManagement/shared/attendanceAutosave.ts`

**Implementation requirements:**

- Keep existing `markAttendanceMutation()` and `getLastAttendanceMutationAt()` unless no longer used by tests.
- Add module-scope counters/state such as:
  - `pendingLocalSaveCount`
  - `lastLocalSaveErrorAt`
- Export:
  - `getPendingAttendanceSaveCount(): number`
  - `hasPendingAttendanceSave(): boolean`
  - `getLastAttendanceSaveErrorAt(): number`
  - optionally `clearAttendanceSaveError(): void`
- In `enqueueSave(record)`:
  - increment pending before calling `saveAttendanceRecord`
  - decrement in `finally`
  - set save error timestamp on catch, then rethrow
  - keep queue alive after failure

**Important:** Do not persist this state to storage. This is runtime navigation safety only.

**Verification:**

```bash
npx vitest run src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts --testTimeout=30000
```

---

### Task A3: Change class switch / beforeunload guard to local-save only

**Objective:** Stop blocking class switch/page leave for Drive sync; warn only for local save pending/error.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`

**Implementation requirements:**

- Remove import/use of `useDriveSyncStore`, `useSettingsStore`, `FEATURE_FLAGS`, and `getLastAttendanceMutationAt` if only used for Drive guard.
- Replace `hasUnfinishedDriveSync()` with `hasUnsafeLocalAttendanceSave()` or equivalent.
- Movement guard condition:
  - pending local save: warn
  - local save error: warn
  - Drive `syncing/error/lastSyncedAt` must not warn
- Confirm copy should reference local save only, e.g.:

```ts
'아직 이 기기에 출결을 저장하는 중입니다. 저장이 끝난 뒤 이동해 주세요.';
```

or for failure:

```ts
'출결이 이 기기에 저장되지 않았습니다. 이동하면 변경 내용이 사라질 수 있습니다. 그래도 이동할까요?';
```

**No `syncToCloud()` call inside movement guard.**

**Verification:**

```bash
npx vitest run src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts --testTimeout=30000
```

---

### Task A4: Fix autosave local persistence reliability

**Objective:** Ensure attendance status persists locally after clicking a status and reloading the record.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassRecordInputView.tsx`
- Modify tests: `src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts`

**Likely issue to inspect:**

- `loadRecord()` sets `skipNextAutosaveRef.current = true` after setting attendance; the next real user edit may be skipped depending on effect timing.
- Current `setStudentAttendanceStatus`, `setStudentReason`, and `setStudentMemo` set status to `idle`, relying on autosave effect. Verify the effect actually runs for the first user change after load.

**Implementation options:**

- Preferred: use an `isHydratingAttendanceRef` pattern so only hydration changes skip autosave, not the first user mutation.
- Alternative: call `saveAttendance()` explicitly after user-driven status/reason/memo changes with a debounced next state builder; avoid stale `localAttendance`.

**Acceptance:**

- A user status change triggers local `saveAttendanceRecord` through `enqueueSave(record)`.
- Saved record can be reloaded by `getAttendanceRecord(classId, date, period)`.
- Drive failure does not mark local save as failed.

---

## Phase B — Remove `출석부` Tab from Class Management

### Task B1: Add source guard test for tab removal

**Objective:** Prevent `출석부` from reappearing in `수업 관리`.

**Files:**

- Modify: `src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts`
- Target: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`

**Assertions:**

- `TABS` does not include `{ id: 'attendance'`.
- `TABS` does not include label `출석부`.
- `TabId` union does not include `'attendance'`.
- JSX no longer renders `<AttendanceTab classId={selectedClassId} />`.

---

### Task B2: Remove tab import/rendering

**Objective:** Remove top-level `출석부` entry from the UI without deleting attendance data or domain code.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`

**Implementation:**

- Remove `import { AttendanceTab } from './AttendanceTab';`
- Change:

```ts
type TabId = 'roster' | 'record' | 'attendance' | 'seating' | 'progress' | 'survey' | 'assignment';
```

to:

```ts
type TabId = 'roster' | 'record' | 'seating' | 'progress' | 'survey' | 'assignment';
```

- Remove the `attendance` config object from `TABS`.
- Remove conditional render for `activeTab === 'attendance'`.

**Verification:**

```bash
npx vitest run src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts --testTimeout=30000
npm run typecheck
```

---

## Phase C — Simplify Seating Tab

### Task C1: Add source guard test for seating tab role

**Objective:** Ensure `좌석배치` no longer directly edits attendance.

**Files:**

- Modify: `src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts`
- Target: `src/adapters/components/ClassManagement/ClassSeatingTab.tsx`

**Assertions:**

- No button label `출석/기록` in `ClassSeatingTab.tsx`.
- No attendance control bar copy `날짜`, `교시`, status summary inside an `isAttendanceMode` branch.
- No direct `handleSaveAttendance()` call from seating toolbar/control bar.
- Contains CTA copy `이 좌석으로 수업 기록하기` or receives an `onOpenRecordSeatView` callback.

---

### Task C2: Add cross-tab seat-view navigation state

**Objective:** Let seating tab open class record in seat view without doing attendance there.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassManagementPage.tsx`
- Modify: `src/adapters/components/ClassManagement/ClassRecordTab.tsx`
- Modify: `src/adapters/components/ClassManagement/ClassRecordInputView.tsx`
- Modify: `src/adapters/components/ClassManagement/ClassSeatingTab.tsx`

**Implementation approach:**

- In `ClassManagementPage`, add state:

```ts
const [recordInitialStudentView, setRecordInitialStudentView] = useState<'list' | 'seating'>(
  'list',
);
```

- Pass to `ClassRecordTab`:

```tsx
<ClassRecordTab
  classId={selectedClassId}
  initialStudentViewMode={recordInitialStudentView}
  onGoToRosterTab={() => setActiveTab('roster')}
  onGoToSeatingTab={() => setActiveTab('seating')}
/>
```

- Pass to `ClassSeatingTab`:

```tsx
<ClassSeatingTab
  classId={selectedClassId}
  onOpenRecordSeatView={() => {
    setRecordInitialStudentView('seating');
    setActiveTab('record');
  }}
/>
```

- `ClassRecordTab` forwards `initialStudentViewMode`.
- `ClassRecordInputView` initializes/updates `studentViewMode` from the prop when class/tab opening asks for seating.

**Avoid:** global routing, URL params, store changes.

---

### Task C3: Remove seating attendance mode UI and direct save path

**Objective:** Make seating tab seat editing/viewing only.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassSeatingTab.tsx`

**Implementation requirements:**

- Remove toolbar `출석/기록` toggle.
- Remove `isAttendanceMode` control bar: date, period, summary, save button.
- Remove attendance popup/modal if only used by seating attendance mode.
- Remove unused attendance local state/hooks/imports after the UI is gone.
- Add CTA button in toolbar or near title:

```tsx
<button onClick={onOpenRecordSeatView} className={toolBtnClass}>
  <span className="material-symbols-outlined text-lg">edit_note</span>이 좌석으로 수업 기록하기
</button>
```

- Seat cards in seating tab should not be clickable for attendance. Keep editing drag/drop behavior.

**Verification:**

```bash
npx eslint src/adapters/components/ClassManagement/ClassSeatingTab.tsx
npm run typecheck
```

---

## Phase D — Class Record UX Consolidation

### Task D1: Add guard tests for class record simplified attendance UX

**Objective:** Lock in teacher-facing UX decisions.

**Files:**

- Modify: `src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts`
- Targets:
  - `ClassRecordInputView.tsx`
  - `ClassRecordStudentGrid.tsx`

**Assertions:**

- `ClassRecordInputView.tsx` does not contain `전체 출석으로 채우기`.
- It contains all period buttons 1~8 or `PERIODS = [1, 2, 3, 4, 5, 6, 7, 8]`.
- It keeps reason/memo handling via existing `ATTENDANCE_REASONS`, `reason`, `memo`.
- It defaults attendance to `present` for missing records.
- It has view toggle labels `번호순` and `좌석배치` or updated `명렬 보기` / `좌석 보기`.
- `ClassRecordStudentGrid.tsx` uses responsive sizing instead of hardcoded `w-16 h-14` only.

---

### Task D2: Remove `전체 출석으로 채우기`

**Objective:** Treat unmodified students as present and remove unnecessary bulk action.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassRecordInputView.tsx`

**Implementation:**

- Delete `handleFillAllPresent`.
- Delete header button `전체 출석으로 채우기`.
- Keep `loadRecord()` default status `present`.
- Consider adding small helper text in the student list header:

```text
체크하지 않은 학생은 출석으로 저장됩니다
```

Do not create a new full-attendance action.

---

### Task D3: Improve list/seat view labels

**Objective:** Make view choice clearer.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassRecordInputView.tsx`

**Implementation:**

- Change `번호순` → `명렬 보기` if space allows.
- Change `좌석배치` → `좌석 보기`.
- Keep list as default.

---

### Task D4: Responsive seat grid in class record

**Objective:** Seat view inside class record should fit the available width by adjusting card size/gap.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassRecordStudentGrid.tsx`

**Implementation approach:**

- Replace fixed `w-16 h-14` card sizing with CSS custom properties based on `cols`.
- Example:

```tsx
const seatStyle = {
  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
} satisfies React.CSSProperties;
```

- Use a grid container:

```tsx
<div className="w-full max-w-full px-2" style={seatStyle}>
```

- Seat cards:

```tsx
className = 'relative aspect-[1.15/1] min-h-12 rounded-lg ...';
```

- For wide classes, reduce text size with responsive classes; do not require horizontal scrolling for common 5~6 column layouts.
- Keep empty seat placeholders same size as occupied cards.

**Acceptance:**

- 5x5 seating fits inside the left record panel or, if the left panel remains too narrow, Phase D5 expands the record layout.

---

### Task D5: Expand class record seat view layout

**Objective:** Fix current design error where seat view is constrained to a narrow left student selector panel.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassRecordInputView.tsx`

**Implementation approach:**

- When `studentViewMode === 'seating'`, use a wider left/primary pane than list mode.
- Option A:

```tsx
<div className={studentViewMode === 'seating'
  ? 'w-[min(620px,60%)] shrink-0 ...'
  : 'w-[260px] shrink-0 ...'}>
```

- Option B: Use responsive grid layout:
  - seat/list pane: `basis-[58%]`
  - detail pane: `flex-1 min-w-[320px]`
- Ensure selected student detail panel remains usable.

**Acceptance:**

- Common 5x5 seating is visible without cramped cards.
- Teacher can still open a student detail/attendance panel.

---

### Task D6: Keep reason/memo structure but clean UI

**Objective:** Preserve existing `reason/memo` data shape and reduce friction.

**Files:**

- Modify: `src/adapters/components/ClassManagement/ClassRecordInputView.tsx`

**Implementation:**

- Keep reason buttons only when status is not `present`.
- Keep memo input only when status is not `present`.
- Improve placeholder from `상세 사유...` to `사유 메모를 적어 주세요`.
- Do not introduce a new reason model.

---

## Phase E — Verification and Smoke Test

### Task E1: Run targeted source tests

```bash
npx vitest run \
  src/adapters/components/ClassManagement/__tests__/classRecord/baseline.test.ts \
  src/adapters/components/ClassManagement/__tests__/classRecord/phase2.test.ts \
  src/adapters/components/ClassManagement/__tests__/classRecord/phase3.test.ts \
  src/adapters/components/ClassManagement/__tests__/classRecord/phase4.test.ts \
  src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts \
  src/adapters/config/featureFlags.test.ts \
  --testTimeout=30000
```

Expected: all class-record tests pass.

---

### Task E2: Run lint/typecheck/build

```bash
npx eslint \
  src/adapters/components/ClassManagement/ClassManagementPage.tsx \
  src/adapters/components/ClassManagement/ClassRecordTab.tsx \
  src/adapters/components/ClassManagement/ClassRecordInputView.tsx \
  src/adapters/components/ClassManagement/ClassRecordStudentGrid.tsx \
  src/adapters/components/ClassManagement/ClassSeatingTab.tsx \
  src/adapters/components/ClassManagement/shared/attendanceAutosave.ts \
  src/adapters/components/ClassManagement/__tests__/classRecord/phase5-ux-cleanup.test.ts

npm run typecheck
npm run build
npm run lint
```

Expected:

- targeted ESLint: exit 0
- typecheck: exit 0
- build: exit 0
- lint: exit 0, existing warnings only if any

---

### Task E3: Protected diff checks

```bash
git diff --name-only -- \
  src/domain/entities/Attendance.ts \
  src/domain/entities/Observation.ts \
  src/domain/entities/TeachingClass.ts \
  src/domain/entities/Settings.ts \
  src/adapters/stores/useDriveSyncStore.ts \
  src/usecases/sync/SyncFromCloud.ts \
  src/usecases/sync/syncRegistry.ts \
  package.json package-lock.json
```

Expected: no output.

---

### Task E4: Browser smoke test checklist

Use `vite preview` if dev server hangs.

```bash
npm run build
./node_modules/.bin/vite preview --host 127.0.0.1 --port 4173
```

Manual/Playwright checks:

1. `수업 관리` top tabs do not show `출석부`.
2. `수업 기록` opens in list/명렬 view.
3. Period buttons 1~8 are available; timetable match can be highlighted but any period can be selected.
4. No `전체 출석으로 채우기` button.
5. Change one student to `지각`; local save status becomes saved without manual save.
6. Refresh/reopen same class/date/period; `지각` remains.
7. Switch class while Drive sync is pending/error; no Drive sync blocking confirm.
8. If local save is deliberately pending/error, local-save warning appears.
9. `좌석배치` tab has no `출석/기록` mode, date/period attendance bar, or attendance save button.
10. `이 좌석으로 수업 기록하기` opens `수업 기록` in seat view.
11. Seat view in class record fits common 5x5 layout responsively.
12. Reason/memo remains available for non-present statuses.

---

## Commit Strategy

Because SsamPin main worktree can be dirty, stage only explicit files.

Suggested commits:

1. `fix(class-record): separate local save guard from drive sync`
2. `refactor(class-management): remove attendance book tab`
3. `refactor(class-seating): move attendance work to class records`
4. `feat(class-record): simplify period attendance workflow`
5. `test(class-record): add ux cleanup regression guards`

Before each commit:

```bash
git diff --cached --check
git diff --cached --name-status
```

Push via Windows PowerShell if WSL credentials fail:

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  "Set-Location 'E:\\github\\ssampin'; git push origin main"
```

Never print tokens.
