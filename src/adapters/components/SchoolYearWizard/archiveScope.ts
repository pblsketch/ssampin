/**
 * 학년도 마무리 마법사 — 보관 범위 표시 정의 (S2.3 ①·② 단계 전용).
 *
 * 전환(보관+리셋) 대상의 정본은 ExecuteYearTransition.YEAR_TRANSITION_FILES다.
 * 이 파일은 그 키에 사용자 언어 라벨·축(담임/교과)·건수 계산 방법을 붙이는
 * **표시 전용 매핑**이며, 정본과 키가 어긋나면 테스트가 실패한다
 * (archiveScope.test — 1:1 대응 단언). 여기서 저장 경로를 새로 만들지 않는다(읽기만).
 */

import type { IStoragePort } from '@domain/ports/IStoragePort';

export type ArchiveAxis = 'homeroom' | 'subject';

export interface ArchiveScopeItem {
  readonly key: string;
  readonly label: string;
  readonly axis: ArchiveAxis;
  /**
   * 건수를 셀 위치.
   *  - '' : 파일 루트가 배열(students 등) — 루트 length
   *  - 필드명 : 봉투 객체의 해당 배열 length
   *  - null : 단일 객체 파일(좌석 배치 등) — 건수 대신 "저장됨"으로 표시
   */
  readonly countField: string | null;
}

/** 표시 순서 = 담임 축 → 교과 축(계획 §4 S2.4 "아카이브 대상" 순서 유지). */
export const ARCHIVE_SCOPE_ITEMS: readonly ArchiveScopeItem[] = [
  // ── 담임 축 ──
  { key: 'students', label: '담임 학생 명렬', axis: 'homeroom', countField: '' },
  { key: 'seating', label: '좌석 배치', axis: 'homeroom', countField: null },
  { key: 'seat-constraints', label: '좌석 배치 조건', axis: 'homeroom', countField: null },
  { key: 'student-records', label: '학생 기록(누가기록)', axis: 'homeroom', countField: 'records' },
  { key: 'record-drafts', label: '생기부 초안', axis: 'homeroom', countField: 'records' },
  { key: 'record-evidence', label: '기록 증빙', axis: 'homeroom', countField: 'records' },
  { key: 'inquiry-threads', label: '탐구 흐름(주제)', axis: 'homeroom', countField: 'records' },
  { key: 'record-ai-drafts', label: 'AI 초안 판(버전)', axis: 'homeroom', countField: 'records' },
  { key: 'seating-snapshots', label: '좌석 배치 스냅샷', axis: 'homeroom', countField: '' },
  { key: 'surveys', label: '설문', axis: 'homeroom', countField: 'surveys' },
  { key: 'assignments', label: '과제', axis: 'homeroom', countField: 'assignments' },
  {
    key: 'submission-texts',
    label: '과제 제출 본문(캐시)',
    axis: 'homeroom',
    countField: 'records',
  },
  // ── 교과 축 ──
  { key: 'teaching-classes', label: '수업반', axis: 'subject', countField: 'classes' },
  { key: 'attendance', label: '출결 기록', axis: 'subject', countField: 'records' },
  { key: 'curriculum-progress', label: '진도 기록', axis: 'subject', countField: 'entries' },
  { key: 'observations', label: '관찰 기록', axis: 'subject', countField: 'records' },
  {
    key: 'observation-attachments',
    label: '관찰 첨부(사진 등)',
    axis: 'subject',
    countField: 'attachments',
  },
  { key: 'rubrics', label: '루브릭·채점', axis: 'subject', countField: 'rubrics' },
  { key: 'grade-analysis', label: '성적 분석', axis: 'subject', countField: null },
  // class-rosters는 담임 명렬표 데이터(계획 §4 S2.4 정정 — localStorage 사각지대 아님)
  { key: 'class-rosters', label: '학급 명렬표', axis: 'homeroom', countField: 'rosters' },
];

export const ARCHIVE_AXIS_LABELS: Record<ArchiveAxis, string> = {
  homeroom: '담임 기록',
  subject: '수업(교과) 기록',
};

/** ① 안내 단계 — 보관하지 않고 그대로 유지되는 것들(사용자 언어). */
export const KEPT_ITEM_LABELS: readonly string[] = [
  '설정(학교 정보·교시·테마·알림)',
  '서식 자료',
  '노트',
  '즐겨찾기(북마크)',
  '내 이모티콘(스티커)',
  '메모·할 일·일정',
];

export interface ArchiveScopeCount {
  readonly key: string;
  /** 파일이 존재하는지(없으면 보관할 것도 없음 — "비어 있음"으로 표시). */
  readonly exists: boolean;
  /** 셀 수 있으면 건수, 단일 객체 파일이면 null("저장됨"). */
  readonly count: number | null;
}

/** 봉투에서 건수 계산(순수). 형태가 기대와 다르면 null — 추측하지 않는다. */
export function countScopeEntries(item: ArchiveScopeItem, data: unknown): ArchiveScopeCount {
  if (data === null || data === undefined) {
    return { key: item.key, exists: false, count: item.countField === null ? null : 0 };
  }
  if (item.countField === null) {
    return { key: item.key, exists: true, count: null };
  }
  if (item.countField === '') {
    return {
      key: item.key,
      exists: true,
      count: Array.isArray(data) ? data.length : null,
    };
  }
  const envelope = data as Record<string, unknown>;
  const value = envelope[item.countField];
  return { key: item.key, exists: true, count: Array.isArray(value) ? value.length : null };
}

/**
 * ② 범위 확인 단계 — 각 파일을 읽어 건수만 계산한다(읽기 전용, 쓰기 0).
 * 개별 읽기 실패는 "알 수 없음"으로 두고 단계 진입을 막지 않는다.
 */
export async function readArchiveScopeCounts(
  storage: IStoragePort,
): Promise<ReadonlyMap<string, ArchiveScopeCount>> {
  const result = new Map<string, ArchiveScopeCount>();
  for (const item of ARCHIVE_SCOPE_ITEMS) {
    try {
      const data = await storage.read<unknown>(item.key);
      result.set(item.key, countScopeEntries(item, data));
    } catch {
      result.set(item.key, { key: item.key, exists: false, count: null });
    }
  }
  return result;
}
