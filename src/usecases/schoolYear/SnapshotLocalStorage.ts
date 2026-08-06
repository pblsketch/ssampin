/**
 * SnapshotLocalStorage — 학년도 마무리 직전 localStorage 전용 데이터 보관 (S2.3, 계획 §6.2).
 *
 * 성적 기준(등급 컷)·성적 확정 체크·서명 명렬은 데이터 파일이 아니라 localStorage에만
 * 있어서(§6.2 인벤토리) 파일 스냅샷 아카이브(ADR-030)의 사각지대다. 마법사 실행 핸들러가
 * 실행 직전에 이 3키를 데이터 파일(`local-snapshot`)로 내려 쓰고, 게이트웨이 데코레이터
 * (`withLocalSnapshotInArchive`)가 archive:create 대상에 그 파일을 추가한다 —
 * ExecuteYearTransition 본문은 1줄도 수정하지 않는다(주입 경계만 사용).
 *
 * 결정 사항:
 *  - localStorage 원본 키는 지우지 않는다(보관이지 삭제가 아니다 — 유실 위험 0).
 *  - `local-snapshot` 파일은 YEAR_TRANSITION_FILES에 없으므로 전환 리셋 대상이 아니다.
 *    다음 전환 때 새 스냅샷으로 통째 덮어써진다(항상 실행 직전 최신본).
 *  - data:write는 실패를 숨긴다(함정 ⑪) — 쓰기 후 재독 대조로 검증하고, 실패 시
 *    전환을 시작하기 전에 throw한다(라이브 데이터 무변경 상태에서 중단).
 */

import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { YearTransitionGateway } from './ExecuteYearTransition';

/** 아카이브에 포함되는 스냅샷 데이터 파일 키(data/local-snapshot.json). */
export const LOCAL_SNAPSHOT_KEY = 'local-snapshot';

/** 보관 대상 localStorage 키 3개 — 계획 §6.2 "보관 대상" 판정분만. */
export const LOCAL_SNAPSHOT_SOURCE_KEYS = [
  'ssampin:grade-cut-settings-v1', // 성적 등급 컷 설정 (ClassAssessmentManagementTab)
  'ssampin:grade-confirm-v1', // 성적 확정 체크 (ClassAssessmentManagementTab)
  'ssampin_sigv2_rosters', // 서명 명렬 (useSignatureRosterStore)
] as const;

export interface LocalStorageSnapshot {
  readonly version: 1;
  /** 어느 학기를 마감하며 찍은 스냅샷인지. */
  readonly closingTerm: string;
  readonly capturedAt: string; // ISO 8601
  /** 존재하는 키만 원문 문자열 그대로 담는다(부재 키는 기록하지 않음 — 추측 금지). */
  readonly entries: Readonly<Record<string, string>>;
}

/**
 * localStorage 판독 → 스냅샷 객체 조립(순수 — 저장하지 않는다).
 * readItem은 `(k) => window.localStorage.getItem(k)` 형태로 주입한다(테스트 가능).
 */
export function buildLocalStorageSnapshot(
  closingTerm: string,
  readItem: (key: string) => string | null,
  now: Date = new Date(),
): LocalStorageSnapshot {
  const entries: Record<string, string> = {};
  for (const key of LOCAL_SNAPSHOT_SOURCE_KEYS) {
    let value: string | null = null;
    try {
      value = readItem(key);
    } catch {
      value = null; // 접근 실패 = 부재 취급(스냅샷 자체를 막지 않는다)
    }
    if (typeof value === 'string') entries[key] = value;
  }
  return { version: 1, closingTerm, capturedAt: now.toISOString(), entries };
}

/**
 * 스냅샷을 `local-snapshot` 데이터 파일로 저장하고 재독 대조로 검증한다.
 * data:write는 실패해도 throw하지 않으므로(함정 ⑪) 여기서 직접 검증한다.
 * 실패 시 한국어 메시지로 throw — 호출자는 전환을 시작하지 않는다(라이브 무변경).
 */
export async function writeLocalStorageSnapshot(
  storage: IStoragePort,
  snapshot: LocalStorageSnapshot,
): Promise<void> {
  await storage.write(LOCAL_SNAPSHOT_KEY, snapshot);
  const after = await storage.read<unknown>(LOCAL_SNAPSHOT_KEY);
  if (JSON.stringify(after) !== JSON.stringify(snapshot)) {
    throw new Error(
      '성적 기준·서명 명렬 등 로컬 저장 데이터의 스냅샷 저장에 실패했어요. ' +
        '전환을 시작하지 않았고 데이터는 그대로 있어요.',
    );
  }
}

/**
 * archive:create 대상에 `local-snapshot`을 추가하는 게이트웨이 데코레이터.
 * ExecuteYearTransition은 YEAR_TRANSITION_FILES + 첨부만 넘기므로, 스냅샷 파일은
 * 이 데코레이터가 주입 경계에서 덧붙인다(이미 있으면 중복 추가하지 않는다).
 */
export function withLocalSnapshotInArchive(gateway: YearTransitionGateway): YearTransitionGateway {
  return {
    createSafetyBackup: () => gateway.createSafetyBackup(),
    archiveCreate: (term, fileKeys, opts) =>
      gateway.archiveCreate(
        term,
        fileKeys.includes(LOCAL_SNAPSHOT_KEY) ? fileKeys : [...fileKeys, LOCAL_SNAPSHOT_KEY],
        opts,
      ),
    archiveRead: (term, fileKey) => gateway.archiveRead(term, fileKey),
  };
}
