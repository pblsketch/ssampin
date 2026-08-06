/**
 * ExecuteYearTransition — 학년도·학기 전환 실행 유즈케이스 (S2.4, ADR-030 파일 스냅샷).
 *
 * 실행 순서(계획 §4 S2.4 — 바꾸지 말 것):
 *  ① safety backup 선행(함정 ⑧ — data:write가 매 쓰기마다 .backup.json 1세대를 덮으므로
 *     연속 리셋 전에 통합 안전 백업이 반드시 먼저다). 실패 시 전환을 시작조차 하지 않는다.
 *  ② archive:create — {ok:true} 확인 후에만 다음 단계(함정 ⑪ — 실패 은닉 금지).
 *  ③ 매니페스트 체크섬 재검증 — archive:read가 항목별 SHA-256을 대조한다(불일치=ok:false).
 *  ④ 라이브 리셋 — 온전한 형태로만(함정 ㉓ — data:read는 5바이트 미만을 손상으로 보고
 *     .backup.json에서 부활시킨다). 배열 루트 파일(students 등)은 빈 배열이 2바이트라
 *     storage.remove로 리셋한다(원본·백업·tmp 모두 제거 = 부활 원천 차단, null=첫 실행 상태).
 *  ⑤ 리셋 검증 — 파일마다 다시 읽어 기대값 대조(data:write는 실패해도 throw하지 않는다).
 *     불일치 시 즉시 중단 + safety backup 경로 보고.
 *  ⑥ 조용한 스토어 리로드 — ⚠️ `loaded:false` 절대 금지(함정 ⑦ — 화면 언마운트로 입력 소실).
 *     기존 reloadStores(useDriveSync) 경로를 deps로 주입받아 재사용한다.
 *
 * 진행 상태는 data/year-transition-state.json에 기록한다 — 중단 시 재시작에서
 * detectPendingTransition으로 감지해 이어하기(resume)/원복(revert)을 안내한다.
 *
 * 브라우저 모드(electronAPI 부재)에서는 createIpcYearTransitionGateway()가 null을
 * 반환하고, 호출자는 전환 기능을 비활성한다(조용한 무시 금지 — 명시 오류 반환).
 */

import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ObservationData } from '@domain/entities/Observation';
import type { StudentRecordsData } from '@domain/entities/StudentRecord';
import { parseTerm } from '@domain/rules/academicCalendar';
import { withFileLock } from '@usecases/shared/fileWriteLock';

/* ─── 전환 대상 파일 정의(계획 §4 S2.4 "아카이브 대상") ─────────────────── */

/**
 * 리셋 방식:
 *  - 'empty-envelope': 온전한 빈 값을 쓴다. **F7b(QA-A RB1 구조 수정)**: 배열 루트 파일도
 *    `[]`로 쓴다 — F7a(data:read 손상 휴리스틱 정밀화)가 "5바이트 미만=손상" 오탐을 제거해
 *    유효한 빈 구조값이 더는 .backup.json 부활을 부르지 않는다(구 함정 ㉓의 remove 우회를 대체).
 *    효과: 전환 직후 업로드가 빈 값을 리모트에 올려 **리모트가 정화**된다 — conflict 분기·
 *    새 PC 첫 다운로드·사후 업로드 경쟁의 옛 데이터 부활이 첫 업로드 이후 구조적으로 소멸.
 *  - 'preserve-fields': 봉투는 비우되 사용자 어휘·설정 성격 필드는 승계한다(§6.2 원칙 —
 *    "학년도가 바뀌면 의미가 없어지는 학생 데이터만 리셋, 설정·환경은 유지").
 *  - 'remove': 파일을 삭제한다(원본+.backup.json+.tmp 전부 — data:remove 계약).
 *    빈 유효 표현이 검증되지 않은 파일만(seating — null=첫 실행 경로만 검증됨, 0×0 인공
 *    객체는 렌더 가정 미검증). remove 키는 업로드로 리모트를 정화할 수 없으므로
 *    **F7c 마커 게이트가 유일한 다운로드 방어**다.
 *
 * guardDownloads(F7c): 전환이 비운 뒤 리모트의 옛 사본이 다운로드로 부활할 수 있는 키 —
 * 마커(YEAR_TRANSITION_REMOVED_KEY)에 기록되어 SyncFromCloud의 전 다운로드 분기가 스킵한다.
 * 병합 3도메인(attendance 등)은 S2.2b 옛 학년도 필터가 레코드 수준에서 이미 방어하므로 제외.
 */
export interface YearTransitionFileSpec {
  readonly key: string;
  /** F7c — 전환 후 이 키의 다운로드를 마커로 게이트할지(비병합 통파일 부활 표면만 true). */
  readonly guardDownloads?: boolean;
  readonly reset:
    | { readonly kind: 'empty-envelope'; readonly envelope: unknown }
    | { readonly kind: 'preserve-fields'; readonly build: (current: unknown) => unknown }
    | { readonly kind: 'remove' };
}

/** 전환(보관+리셋) 대상 17키 — 각 리포지토리가 기대하는 봉투 형태 기준(실측 근거는 계획 보고). */
export const YEAR_TRANSITION_FILES: readonly YearTransitionFileSpec[] = [
  // ── 담임 축 ──
  // F7b: `[]` 쓰기(F7a로 유효) — 첫 업로드가 리모트 옛 명렬을 정화한다(remove는 정화 불가였다).
  { key: 'students', guardDownloads: true, reset: { kind: 'empty-envelope', envelope: [] } },
  // seating은 빈 유효 표현 미검증(0×0은 렌더 가정 밖) — remove 유지, F7c 마커가 유일 방어.
  { key: 'seating', guardDownloads: true, reset: { kind: 'remove' } },
  {
    key: 'seat-constraints',
    reset: {
      kind: 'empty-envelope',
      envelope: { zones: [], separations: [], adjacencies: [], fixedSeats: [] },
    },
  },
  {
    key: 'student-records',
    reset: {
      kind: 'preserve-fields',
      // 커스텀 카테고리 정의는 설정 성격 — 승계. records·deleted(툼스톤)는 새 학년도 백지.
      build: (current) => {
        const data = current as StudentRecordsData | null;
        return {
          records: [],
          ...(data?.categories ? { categories: data.categories } : {}),
        };
      },
    },
  },
  { key: 'record-drafts', reset: { kind: 'empty-envelope', envelope: { records: [] } } },
  { key: 'record-evidence', reset: { kind: 'empty-envelope', envelope: { records: [] } } },
  // F7b: `[]` 쓰기(F7a로 유효) — 업로드 정화. (SYNC_REGISTRY 등재 파일 — 다운로드 게이트도 필요)
  {
    key: 'seating-snapshots',
    guardDownloads: true,
    reset: { kind: 'empty-envelope', envelope: [] },
  },
  { key: 'surveys', reset: { kind: 'empty-envelope', envelope: { surveys: [], localData: [] } } },
  { key: 'assignments', reset: { kind: 'empty-envelope', envelope: { assignments: [] } } },
  // ── 교과 축 ──
  { key: 'teaching-classes', reset: { kind: 'empty-envelope', envelope: { classes: [] } } },
  { key: 'attendance', reset: { kind: 'empty-envelope', envelope: { records: [] } } },
  { key: 'curriculum-progress', reset: { kind: 'empty-envelope', envelope: { entries: [] } } },
  {
    key: 'observations',
    reset: {
      kind: 'preserve-fields',
      // 사용자 태그·분류 어휘는 설정 성격 — 승계. records·deleted는 백지.
      build: (current) => {
        const data = current as ObservationData | null;
        return {
          records: [],
          ...(data?.customTags ? { customTags: data.customTags } : {}),
          ...(data?.customCategories ? { customCategories: data.customCategories } : {}),
        };
      },
    },
  },
  {
    key: 'observation-attachments',
    reset: { kind: 'empty-envelope', envelope: { attachments: [] } },
  },
  { key: 'rubrics', reset: { kind: 'empty-envelope', envelope: { rubrics: [], gradings: [] } } },
  {
    key: 'grade-analysis',
    reset: {
      kind: 'empty-envelope',
      envelope: { plans: [], writtenResults: [], performanceResults: [], semesterResults: [] },
    },
  },
  // class-rosters — SYNC_REGISTRY 미등재(동기화 없음)지만 학년도 데이터(계획 §4 S2.4 정정)
  { key: 'class-rosters', reset: { kind: 'empty-envelope', envelope: { rosters: [] } } },
];

/** 진행 상태 파일(data/year-transition-state.json) — 중단 감지·이어하기·원복의 근거. */
export const YEAR_TRANSITION_STATE_KEY = 'year-transition-state';

/**
 * F7c — 전환이 비운(guardDownloads) 파일의 **로컬 전용 마커**(data/year-transition-removed.json).
 * ⚠️ SYNC_REGISTRY(SYNC_FILES)에 절대 등재하지 않는다 — 이 마커가 동기화되면 다른 기기의
 * 정상 파일까지 다운로드가 막힌다(마커는 "이 기기가 의도적으로 비웠다"는 로컬 사실이다).
 *
 * 용도: SyncFromCloud의 **모든 다운로드 분기**(치유·충돌·첫 다운로드)가 마커 활성 키를
 * 스킵해 리모트 옛 사본 부활(qa3-D·RB1 우회 3경로)을 막는다. 판정에 시각 비교는 쓰지
 * 않는다(시계 스큐 반증 — RH2). 해제: (a) 로컬에 실질 내용이 생김(사용자 입력)
 * (b) revert(전환 원복 시 마커 삭제). 남는 창은 F7b의 빈 값 업로드가 리모트를 정화해 닫는다.
 */
export const YEAR_TRANSITION_REMOVED_KEY = 'year-transition-removed';

export interface YearTransitionRemovedMarker {
  readonly version: 1;
  /** 어느 학기 전환이 비웠는지. */
  readonly term: string;
  /** 비운 시각(ISO) — 진단·표시용. F7c 다운로드 판정에는 쓰지 않는다(시계 스큐 — RH2). */
  readonly removedAt: string;
  readonly keys: readonly string[];
}

export interface YearTransitionState {
  readonly version: 1;
  /** 보관(마감)하는 학기 라벨 — 아카이브 디렉토리 이름. */
  readonly closingTerm: string;
  /** 전환 후 새 학기 라벨(settings.currentTerm에 기록). */
  readonly nextTerm: string;
  /** 전환 전 settings.currentTerm(원복 시 되돌릴 값 — 미설정이었으면 null). */
  readonly previousTerm: string | null;
  readonly startedAt: string;
  readonly safetyBackupPath: string;
  readonly phase: 'archiving' | 'resetting';
  /** 리셋 완료된 파일 키(관측·진단용 — 리셋은 멱등이라 재개 시 전 키 재수행). */
  readonly resetDone: readonly string[];
}

/* ─── IPC 게이트웨이(주입 경계) ────────────────────────────── */

type ArchiveCreateResult =
  | { ok: true; term: string; label: string; entryCount: number; totalBytes: number }
  | { ok: false; error: string };
type ArchiveReadResult =
  | { ok: true; encoding: 'utf8' | 'base64'; content: string }
  | { ok: false; error: string };
type SafetyBackupResult = { ok: true; path: string } | { ok: false; error: string };

export interface YearTransitionGateway {
  createSafetyBackup(): Promise<SafetyBackupResult>;
  archiveCreate(
    term: string,
    fileKeys: string[],
    opts?: { label?: string },
  ): Promise<ArchiveCreateResult>;
  archiveRead(term: string, fileKey: string): Promise<ArchiveReadResult>;
}

export interface YearTransitionDeps {
  readonly storage: IStoragePort;
  readonly gateway: YearTransitionGateway;
  /** settings.currentTerm 읽기(전환 전 값 보존용). */
  readonly getCurrentTerm: () => Promise<string | undefined>;
  /** settings.currentTerm 갱신(완료 시 nextTerm, 원복 시 previousTerm). */
  readonly setCurrentTerm: (term: string | undefined) => Promise<void>;
  /**
   * 조용한 스토어 리로드 — 기존 reloadStores(@adapters/hooks/useDriveSync) 재사용.
   * ⚠️ 구현은 절대 `setState({loaded:false})`를 쓰면 안 된다(함정 ⑦).
   */
  readonly reloadStores: (filenames: readonly string[]) => Promise<void>;
}

/**
 * 렌더러의 window.electronAPI에서 IPC 게이트웨이를 만든다.
 * 브라우저 모드(electronAPI 또는 archive/backup 네임스페이스 부재)면 null —
 * 호출자는 전환 기능을 비활성하고 사용자에게 명시적으로 알린다(조용한 무시 금지).
 */
export function createIpcYearTransitionGateway(): YearTransitionGateway | null {
  if (typeof window === 'undefined') return null;
  const api = window.electronAPI;
  if (!api?.archive || !api.backup?.createSafetyBackup) return null;
  const archive = api.archive;
  const backup = api.backup;
  return {
    createSafetyBackup: () => backup.createSafetyBackup(),
    archiveCreate: (term, fileKeys, opts) => archive.create(term, fileKeys, opts),
    archiveRead: (term, fileKey) => archive.read(term, fileKey),
  };
}

/* ─── 결과 타입 ────────────────────────────────────────────── */

export type YearTransitionStep =
  | 'safety-backup'
  | 'archive'
  | 'verify-archive'
  | 'reset'
  | 'verify-reset'
  | 'finalize';

export type YearTransitionResult =
  | {
      readonly ok: true;
      readonly closingTerm: string;
      readonly nextTerm: string;
      readonly safetyBackupPath: string;
      readonly archivedEntryCount: number;
      readonly resetKeys: readonly string[];
    }
  | {
      readonly ok: false;
      readonly step: YearTransitionStep;
      /** 사용자 언어 사유 — UI가 그대로 표시 가능. "데이터는 그대로 있어요"와 함께 안내할 것. */
      readonly error: string;
      readonly safetyBackupPath?: string;
    };

export type RevertResult =
  | { readonly ok: true; readonly restoredKeys: readonly string[] }
  | { readonly ok: false; readonly error: string };

/* ─── 보조 ─────────────────────────────────────────────────── */

/** 다음 학기 라벨: '2026-1'→'2026-2', '2026-2'→'2027-1'. 형식이 아니면 null. */
export function deriveNextTerm(closingTerm: string): string | null {
  const parsed = parseTerm(closingTerm);
  if (!parsed) return null;
  return parsed.semester === 1 ? `${parsed.year}-2` : `${parsed.year + 1}-1`;
}

function log(message: string): void {
  console.log(`[YearTransition] ${message}`);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 관찰 첨부 바이너리 키 열거 — {userData}/obs-attachments/ (data/ 밖, 함정 ③). */
async function listAttachmentArchiveKeys(storage: IStoragePort): Promise<string[]> {
  try {
    const names = await storage.listBinary('obs-attachments');
    return names.map((n) => `obs-attachments/${n}`);
  } catch {
    return []; // 나열 실패는 첨부 없음으로 취급(아카이브는 데이터 파일이 본체)
  }
}

/** 저장 후 재독 대조용 직렬화(결정적) — 봉투 비교는 JSON 문자열 동치로 판정한다. */
function stableEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * guardDownloads 리셋 키를 마커에 기록(read-modify-write). 실패는 무해로 삼키지 않는다 —
 * 마커 없이 비우기만 되면 다운로드 부활(qa3-D)이 열리므로 리셋 검증과 같은 급이다.
 * F7d(RB2): data:write는 실패를 알리지 않으므로 **쓰고 다시 읽어 대조**한다.
 * 반환: null=성공, 문자열=실패 사유(호출자는 전환을 중단한다).
 */
async function recordRemovedKey(
  storage: IStoragePort,
  term: string,
  now: string,
  key: string,
): Promise<string | null> {
  let existing: YearTransitionRemovedMarker | null = null;
  try {
    const raw = await storage.read<YearTransitionRemovedMarker>(YEAR_TRANSITION_REMOVED_KEY);
    if (raw && raw.version === 1 && Array.isArray(raw.keys)) existing = raw;
  } catch {
    existing = null; // 손상 마커는 새로 쓴다
  }
  const prior = existing !== null && existing.term === term ? existing : null;
  const marker: YearTransitionRemovedMarker = {
    version: 1,
    term,
    // 같은 학기 재개면 최초 removedAt 유지(진단용 시각 — F7c 판정에는 쓰지 않는다).
    removedAt: prior !== null ? prior.removedAt : now,
    keys: prior !== null ? Array.from(new Set([...prior.keys, key])) : [key],
  };
  await storage.write(YEAR_TRANSITION_REMOVED_KEY, marker);
  try {
    const after = await storage.read<unknown>(YEAR_TRANSITION_REMOVED_KEY);
    if (!stableEquals(after, marker)) {
      return `전환 마커 기록 검증 실패(기대값 불일치): ${key}`;
    }
  } catch (err) {
    return `전환 마커 기록 검증 실패(재독 불가): ${key} (${errMsg(err)})`;
  }
  return null;
}

async function readState(storage: IStoragePort): Promise<YearTransitionState | null> {
  try {
    const state = await storage.read<YearTransitionState>(YEAR_TRANSITION_STATE_KEY);
    if (!state || state.version !== 1) return null;
    return state;
  } catch {
    return null; // 상태 파일 손상 = 진행 중 아님으로 취급(전환 자체는 항상 명시 확인 후 진행)
  }
}

/** 재시작 시 중단된 전환 감지 — UI가 이어하기/원복을 안내하는 근거. */
export async function detectPendingTransition(
  storage: IStoragePort,
): Promise<YearTransitionState | null> {
  return readState(storage);
}

/* ─── 전환 실행 ────────────────────────────────────────────── */

export interface ExecuteYearTransitionOptions {
  /** 보관(마감)하는 학기 — 아카이브 디렉토리 이름('2026-1' 형식). */
  readonly closingTerm: string;
  /** 새 학기 라벨. 생략 시 deriveNextTerm(closingTerm). */
  readonly nextTerm?: string;
  /** 아카이브 라벨(생략 시 archiveManager 기본 라벨). */
  readonly label?: string;
}

export async function executeYearTransition(
  deps: YearTransitionDeps,
  options: ExecuteYearTransitionOptions,
): Promise<YearTransitionResult> {
  const { storage, gateway } = deps;
  const closingTerm = options.closingTerm;
  const nextTerm = options.nextTerm ?? deriveNextTerm(closingTerm);
  if (!nextTerm) {
    return {
      ok: false,
      step: 'safety-backup',
      error: `학기 형식이 올바르지 않아요: ${closingTerm}`,
    };
  }

  // 재개(resume) 판단 — 같은 학기의 중단된 전환이면 아카이브 기존재를 허용한다.
  const pending = await readState(storage);
  if (pending !== null && pending.closingTerm !== closingTerm) {
    return {
      ok: false,
      step: 'safety-backup',
      error:
        `이전에 중단된 전환(${pending.closingTerm})이 남아 있어요. ` +
        '먼저 이어하기 또는 되돌리기로 마무리해 주세요.',
      safetyBackupPath: pending.safetyBackupPath,
    };
  }
  const resumeState = pending; // null이 아니면 같은 학기의 중단분(위에서 배제)
  const resume = resumeState !== null;

  // F7g(RM2) — 유즈케이스 이중화: 학년도 마무리는 2학기(학년도 말) 마감만 실행한다.
  // UI 가드(canRunYearEndWizard)와 별개로 어떤 호출 경로로도 1학기 마감 전환이 실행되지
  // 않게 한다(같은 학년도 학기 전환은 옛 학년도 부활 필터가 원리적으로 못 막는다 — qa3-A).
  // 단 같은 학기의 pending 재개는 예외 — 기존 중단분의 이어하기를 막으면 반쯤 전환 상태에 갇힌다.
  if (parseTerm(closingTerm)?.semester !== 2 && !resume) {
    return {
      ok: false,
      step: 'safety-backup',
      error:
        '학년도 마무리는 2학기(학년도 말)에만 실행할 수 있어요. ' +
        "학기 정리는 수업 관리의 '수업반 보관'을 사용해 주세요.",
    };
  }

  // ① safety backup — 실패 시 전환을 시작조차 하지 않는다(함정 ⑧).
  log(`1/5 안전 백업 생성 (${resume ? '재개' : '시작'}: ${closingTerm} → ${nextTerm})`);
  const safety = await gateway.createSafetyBackup();
  if (!safety.ok) {
    log(`❌ 안전 백업 실패 — 전환 미시작: ${safety.error}`);
    return { ok: false, step: 'safety-backup', error: safety.error };
  }
  const safetyBackupPath = safety.path;

  const previousTerm =
    resumeState !== null ? resumeState.previousTerm : ((await deps.getCurrentTerm()) ?? null);
  const baseState: YearTransitionState = {
    version: 1,
    closingTerm,
    nextTerm,
    previousTerm,
    startedAt: resumeState !== null ? resumeState.startedAt : new Date().toISOString(),
    safetyBackupPath,
    phase: 'archiving',
    resetDone: [],
  };

  try {
    await storage.write(YEAR_TRANSITION_STATE_KEY, baseState);

    // ② archive:create — ok:true 확인 후에만 다음 단계(함정 ⑪).
    const attachmentKeys = await listAttachmentArchiveKeys(storage);
    const fileKeys = [...YEAR_TRANSITION_FILES.map((f) => f.key), ...attachmentKeys];
    log(`2/5 아카이브 생성 (${fileKeys.length}개 키, 첨부 ${attachmentKeys.length}개)`);
    let archivedEntryCount = 0;
    const created = await gateway.archiveCreate(
      closingTerm,
      fileKeys,
      options.label ? { label: options.label } : undefined,
    );
    if (created.ok) {
      archivedEntryCount = created.entryCount;
    } else if (!resume) {
      log(`❌ 아카이브 생성 실패 — 라이브 무변경 중단: ${created.error}`);
      await storage.remove(YEAR_TRANSITION_STATE_KEY);
      return { ok: false, step: 'archive', error: created.error, safetyBackupPath };
    } else {
      // 재개 모드: 직전 시도에서 아카이브가 이미 완성됐을 수 있다(원자적 rename —
      // 부분 아카이브는 존재할 수 없음). 아래 ③ 재검증이 진위를 가린다.
      log(`재개 — 기존 아카이브 사용 시도 (생성 응답: ${created.error})`);
    }

    // ③ 매니페스트 체크섬 재검증 — archive:read가 항목별 SHA-256 대조(불일치=ok:false).
    log('3/5 아카이브 체크섬 재검증');
    const manifestRead = await gateway.archiveRead(closingTerm, 'manifest.json');
    if (!manifestRead.ok) {
      return {
        ok: false,
        step: 'verify-archive',
        error: `보관함 매니페스트를 확인하지 못했어요: ${manifestRead.error}`,
        safetyBackupPath,
      };
    }
    const manifest = JSON.parse(manifestRead.content) as {
      entries: readonly { path: string }[];
    };
    for (const entry of manifest.entries) {
      const read = await gateway.archiveRead(closingTerm, entry.path);
      if (!read.ok) {
        log(`❌ 체크섬 재검증 실패: ${entry.path}`);
        return {
          ok: false,
          step: 'verify-archive',
          error: `보관 사본 검증에 실패했어요(${entry.path}): ${read.error}`,
          safetyBackupPath,
        };
      }
    }
    if (archivedEntryCount === 0) archivedEntryCount = manifest.entries.length;

    // ④+⑤ 라이브 리셋 + 파일별 재독 검증 — 실패 시 즉시 중단(상태 파일은 남겨 재개/원복 유도).
    log(`4/5 라이브 리셋 (${YEAR_TRANSITION_FILES.length}개 파일)`);
    const resetDone: string[] = [];
    const resetStartedAt = new Date().toISOString();
    await storage.write(YEAR_TRANSITION_STATE_KEY, { ...baseState, phase: 'resetting' });
    for (const spec of YEAR_TRANSITION_FILES) {
      const failure = await withFileLock(spec.key, async (): Promise<string | null> => {
        if (spec.reset.kind === 'remove') {
          await storage.remove(spec.key);
          const after = await storage.read<unknown>(spec.key);
          if (after !== null) return `삭제 후에도 파일이 남아 있어요: ${spec.key}`;
        } else {
          const envelope =
            spec.reset.kind === 'empty-envelope'
              ? spec.reset.envelope
              : spec.reset.build(await storage.read<unknown>(spec.key));
          await storage.write(spec.key, envelope);
          // data:write는 실패를 알리지 않는다(함정 ⑪) — 다시 읽어 기대값 대조(⑤).
          const after = await storage.read<unknown>(spec.key);
          if (!stableEquals(after, envelope)) {
            return `리셋 검증 실패(기대값 불일치): ${spec.key}`;
          }
        }
        // F7c: 리셋 성공과 같은 급으로 마커 기록(리셋 방식 무관) — 마커 없이 비우기만 되면
        // SyncFromCloud 다운로드 분기가 리모트 옛 사본을 부활시킨다(qa3-D).
        // F7d(RB2): recordRemovedKey가 재독 검증까지 수행 — 실패 문자열이면 전환 중단.
        if (spec.guardDownloads === true) {
          const markerFailure = await recordRemovedKey(
            storage,
            closingTerm,
            resetStartedAt,
            spec.key,
          );
          if (markerFailure !== null) return markerFailure;
        }
        return null;
      });
      if (failure !== null) {
        log(`❌ ${failure} — 중단(안전 백업: ${safetyBackupPath})`);
        return { ok: false, step: 'verify-reset', error: failure, safetyBackupPath };
      }
      resetDone.push(spec.key);
      await storage.write(YEAR_TRANSITION_STATE_KEY, {
        ...baseState,
        phase: 'resetting',
        resetDone: [...resetDone],
      });
    }

    // ⑥ 마무리 — currentTerm 갱신 + 상태 파일 정리 + 조용한 리로드(loaded:false 금지).
    log(`5/5 마무리 — currentTerm=${nextTerm}, 스토어 조용한 리로드`);
    await deps.setCurrentTerm(nextTerm);
    await storage.remove(YEAR_TRANSITION_STATE_KEY);
    await deps.reloadStores(YEAR_TRANSITION_FILES.map((f) => f.key));
    log(`✅ 전환 완료: ${closingTerm} 보관 → ${nextTerm} 시작`);
    return {
      ok: true,
      closingTerm,
      nextTerm,
      safetyBackupPath,
      archivedEntryCount,
      resetKeys: resetDone,
    };
  } catch (err) {
    log(`❌ 전환 중 오류: ${errMsg(err)}`);
    return {
      ok: false,
      step: 'reset',
      error: `전환 중 오류가 발생했어요: ${errMsg(err)}`,
      safetyBackupPath,
    };
  }
}

/* ─── 전환 취소(원복) ──────────────────────────────────────── */

/**
 * 아카이브 사본에서 라이브를 되돌린다(사본은 유지). 진행 상태 파일 정리 + currentTerm 원복.
 * archive:read가 체크섬을 대조하므로 손상 사본으로는 원복이 진행되지 않는다.
 */
export async function revertYearTransition(
  deps: YearTransitionDeps,
  closingTerm: string,
): Promise<RevertResult> {
  const { storage, gateway } = deps;
  try {
    log(`원복 시작: ${closingTerm} 보관 사본 → 라이브`);
    const manifestRead = await gateway.archiveRead(closingTerm, 'manifest.json');
    if (!manifestRead.ok) {
      return { ok: false, error: `보관함을 읽지 못했어요: ${manifestRead.error}` };
    }
    const manifest = JSON.parse(manifestRead.content) as {
      entries: readonly { path: string; kind: 'data' | 'binary' }[];
    };

    const restoredKeys: string[] = [];
    for (const entry of manifest.entries) {
      const read = await gateway.archiveRead(closingTerm, entry.path);
      if (!read.ok) {
        return {
          ok: false,
          error: `보관 사본 복원에 실패했어요(${entry.path}): ${read.error}`,
        };
      }
      if (entry.kind === 'binary') {
        // 'obs-attachments/{name}' — 바이너리 원문 그대로 복원
        const bytes = Uint8Array.from(atob(read.content), (c) => c.charCodeAt(0));
        await storage.writeBinary(entry.path, bytes);
      } else {
        // '{key}.json' → 파일 키로 환원 후 봉투 원문 복원 + 재독 검증(⑤와 동일 규율)
        const key = entry.path.replace(/\.json$/, '');
        const value: unknown = JSON.parse(read.content);
        await withFileLock(key, async () => {
          await storage.write(key, value);
        });
        const after = await storage.read<unknown>(key);
        if (!stableEquals(after, value)) {
          return { ok: false, error: `복원 검증에 실패했어요(기대값 불일치): ${key}` };
        }
      }
      restoredKeys.push(entry.path);
    }

    // currentTerm 원복 — 중단분(상태 파일)이 남아 있으면 전환 전 값으로, 완료된 전환의
    // 원복(상태 파일 없음)이면 되돌린 데이터의 학기(closingTerm)로 맞춘다.
    const pending = await readState(storage);
    if (pending && pending.closingTerm === closingTerm) {
      await deps.setCurrentTerm(pending.previousTerm ?? undefined);
    } else {
      await deps.setCurrentTerm(closingTerm);
    }
    await storage.remove(YEAR_TRANSITION_STATE_KEY);
    // F1(B1): 원복으로 파일이 되살아났으니 remove 마커도 정리 — 이후 치유 다운로드는 정상 동작.
    await storage.remove(YEAR_TRANSITION_REMOVED_KEY);
    await deps.reloadStores(YEAR_TRANSITION_FILES.map((f) => f.key));
    log(`✅ 원복 완료 (${restoredKeys.length}개 항목, 보관 사본은 유지)`);
    return { ok: true, restoredKeys };
  } catch (err) {
    log(`❌ 원복 중 오류: ${errMsg(err)}`);
    return { ok: false, error: `되돌리기 중 오류가 발생했어요: ${errMsg(err)}` };
  }
}
