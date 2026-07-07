/**
 * 계약 정렬 메타테스트 — AI 브릿지 쓰기 계약 단일 소스화(WS1) 회귀 가드.
 *
 * 단일 정의(def, scripts/contract/aiBridgeWriteContract.def.mjs)에서 생성된 산출물이
 * 본체의 실제 디스패치와 어긋나지 않는지 런타임으로 단언한다. 빌드 게이트(check-contract-sync.mjs)는
 * "def ↔ 생성물 파일" byte 정합을, 이 테스트는 "def/생성물 ↔ 실제 디스패치 키 + 카테고리/식별 계약"을 본다.
 *
 * 핵심 회귀 시나리오:
 *  - def 에서 도메인 하나 제거(재생성 안 함) → def(9) ≠ 생성물(10) → 이 테스트 실패 + check-contract-sync 실패.
 *  - def 에서 도메인 제거 + 재생성 → 핸들러 잉여 → applyLiveSyncWrite 의 satisfies 컴파일 에러 +
 *    생성물(9) ≠ 디스패치 키(10) → 이 테스트 실패.
 */
import { describe, it, expect } from 'vitest';
import {
  WRITE_DOMAINS,
  WRITE_OPS,
  OBSERVATION_FIELDS,
  OBSERVATION_CONTENT_MAX,
  RECORD_NOTE_FIELDS,
  RECORD_NOTE_CONTENT_MAX,
  PROGRESS_FIELDS,
  PROGRESS_UNIT_MAX,
  PROGRESS_LESSON_MAX,
  PROGRESS_NOTE_MAX,
  PROGRESS_STATUSES,
  ATTENDANCE_STATUSES,
  ATTENDANCE_REASONS,
  IDENTITY_KEY_CONTRACT,
} from '@domain/contracts/aiBridgeWriteContract';
import { LIVE_SYNC_DISPATCH_DOMAINS } from '../applyLiveSyncWrite';
import {
  DEFAULT_RECORD_CATEGORIES,
  SUBCATEGORY_SENTINEL_BY_CATEGORY,
  synthesizeSubcategory,
  ATTENDANCE_REASONS as CATEGORY_ATTENDANCE_REASONS,
} from '@domain/valueObjects/RecordCategory';
// 단일 정의(def) 자체를 직접 import 해 생성물과의 동기화를 런타임으로도 확인한다.
import { AI_BRIDGE_WRITE_CONTRACT } from '../../../../scripts/contract/aiBridgeWriteContract.def.mjs';

/** def 가 선언한 11개 쓰기 도메인 — 이 목록을 바꾸려면 테스트도 의도적으로 바꿔야 한다(change-detector). */
const EXPECTED_DOMAINS = [
  'todos',
  'events',
  'recordDrafts',
  'memos',
  'bookmarks',
  'notes',
  'attendance',
  'homeroomAttendance',
  'observations',
  'recordNote',
  'progress',
];

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

describe('AI 브릿지 쓰기 계약 — def ↔ 생성물 ↔ 디스패치 정합', () => {
  it('생성물 WRITE_DOMAINS 가 기대 도메인 11종과 정확히 일치(누락·잉여 0)', () => {
    expect(sorted(WRITE_DOMAINS)).toEqual(sorted(EXPECTED_DOMAINS));
  });

  it('def ↔ 생성물 — 모든 계약 표면이 런타임으로 동일하다', () => {
    const def = AI_BRIDGE_WRITE_CONTRACT as Record<string, unknown>;
    expect(def['WRITE_DOMAINS']).toEqual([...WRITE_DOMAINS]);
    expect(def['WRITE_OPS']).toEqual([...WRITE_OPS]);
    expect(def['OBSERVATION_FIELDS']).toEqual([...OBSERVATION_FIELDS]);
    expect(def['OBSERVATION_CONTENT_MAX']).toBe(OBSERVATION_CONTENT_MAX);
    expect(def['RECORD_NOTE_FIELDS']).toEqual([...RECORD_NOTE_FIELDS]);
    expect(def['RECORD_NOTE_CONTENT_MAX']).toBe(RECORD_NOTE_CONTENT_MAX);
    expect(def['PROGRESS_FIELDS']).toEqual([...PROGRESS_FIELDS]);
    expect(def['PROGRESS_UNIT_MAX']).toBe(PROGRESS_UNIT_MAX);
    expect(def['PROGRESS_LESSON_MAX']).toBe(PROGRESS_LESSON_MAX);
    expect(def['PROGRESS_NOTE_MAX']).toBe(PROGRESS_NOTE_MAX);
    expect(def['PROGRESS_STATUSES']).toEqual([...PROGRESS_STATUSES]);
    expect(def['ATTENDANCE_STATUSES']).toEqual([...ATTENDANCE_STATUSES]);
    expect(def['ATTENDANCE_REASONS']).toEqual([...ATTENDANCE_REASONS]);
    expect(def['IDENTITY_KEY_CONTRACT']).toEqual({ ...IDENTITY_KEY_CONTRACT });
  });

  it('생성물 WRITE_DOMAINS ↔ applyLiveSyncWrite 디스패치 키 — 정확히 일치', () => {
    // 디스패치에 핸들러가 있는데 도메인이 빠졌거나, 도메인이 있는데 핸들러가 없으면 여기서 잡힌다.
    expect(sorted(LIVE_SYNC_DISPATCH_DOMAINS)).toEqual(sorted(WRITE_DOMAINS));
  });

  it('WRITE_OPS 가 4종 연산(create/update/complete/delete)', () => {
    expect(sorted(WRITE_OPS)).toEqual(sorted(['create', 'update', 'complete', 'delete']));
  });

  it('필드 화이트리스트 + 내용 상한이 계약값으로 고정', () => {
    expect([...OBSERVATION_FIELDS]).toEqual(['studentId', 'content', 'date', 'tags', 'classId']);
    expect(OBSERVATION_CONTENT_MAX).toBe(500);
    expect([...RECORD_NOTE_FIELDS]).toEqual([
      'studentId',
      'content',
      'categoryId',
      'subcategory',
      'date',
    ]);
    expect(RECORD_NOTE_CONTENT_MAX).toBe(2000);
    // recordNote 의 'subcategory' 는 "보이지 않는 MCP 계약 슬롯" — 화이트리스트에 반드시 남아야 한다(Q2 정합).
    expect([...RECORD_NOTE_FIELDS]).toContain('subcategory');
    // 수업 진도(progress) — 필드·상한·status enum 고정(CurriculumProgress 엔티티와 1:1).
    expect([...PROGRESS_FIELDS]).toEqual([
      'classId',
      'date',
      'period',
      'unit',
      'lesson',
      'status',
      'note',
    ]);
    expect(PROGRESS_UNIT_MAX).toBe(200);
    expect(PROGRESS_LESSON_MAX).toBe(500);
    expect(PROGRESS_NOTE_MAX).toBe(500);
    expect([...PROGRESS_STATUSES]).toEqual(['planned', 'completed', 'skipped']);
  });

  it('출결 status/reason enum 이 계약값으로 고정 + RecordCategory 와 동일(드리프트 차단)', () => {
    expect([...ATTENDANCE_STATUSES]).toEqual([
      'present',
      'absent',
      'late',
      'earlyLeave',
      'classAbsence',
    ]);
    expect([...ATTENDANCE_REASONS]).toEqual(['질병', '인정', '미인정', '기타']);
    // 같은 출결 사유 enum 이 RecordCategory(카테고리 스키마)에도 있다 — 두 곳이 어긋나면 실패.
    expect([...ATTENDANCE_REASONS]).toEqual([...CATEGORY_ATTENDANCE_REASONS]);
  });
});

describe('AI 브릿지 쓰기 계약 — 카테고리 2단 sentinel 멤버십 회귀 가드(Q2 정합)', () => {
  // recordNote 쓰기는 category.subcategories.includes(subcategory) 멤버십에 의존한다(applyLiveSyncWrite).
  // Q2 에서 subcategory 는 카테고리별 sentinel 로 합성되므로, sentinel ∈ subcategories[] 가 깨지면
  // 외부 AI 의 정상 recordNote 쓰기가 silent 거부된다 → 멤버십을 빌드에서 고정한다.
  const nonAttendance = DEFAULT_RECORD_CATEGORIES.filter((c) => c.id !== 'attendance');

  it('각 비출결 카테고리의 합성 sentinel ∈ 해당 카테고리 subcategories[]', () => {
    for (const cat of nonAttendance) {
      const sentinel = synthesizeSubcategory(cat.id);
      expect(
        cat.subcategories.includes(sentinel),
        `카테고리 '${cat.id}' 의 sentinel '${sentinel}' 이 subcategories[${cat.subcategories.join(', ')}] 에 없습니다. ` +
          `→ 외부 AI recordNote 쓰기가 멤버십 검증에서 거부됩니다(MCP 계약 깨짐).`,
      ).toBe(true);
    }
  });

  it('SUBCATEGORY_SENTINEL_BY_CATEGORY 의 모든 매핑도 해당 카테고리 멤버', () => {
    for (const [categoryId, sentinel] of Object.entries(SUBCATEGORY_SENTINEL_BY_CATEGORY)) {
      const cat = DEFAULT_RECORD_CATEGORIES.find((c) => c.id === categoryId);
      if (!cat) continue; // 커스텀 카테고리는 기본 목록에 없을 수 있음
      expect(cat.subcategories.includes(sentinel), `${categoryId} → ${sentinel}`).toBe(true);
    }
  });

  it('출결 카테고리는 sentinel 합성 대상이 아니다(subcategories 비어 있음)', () => {
    const attendance = DEFAULT_RECORD_CATEGORIES.find((c) => c.id === 'attendance');
    expect(attendance?.subcategories).toEqual([]);
  });
});

describe('AI 브릿지 쓰기 계약 — 식별키 형식 고정 가드(변경 금지)', () => {
  it('IDENTITY_KEY_CONTRACT 가 문서화된 형식과 일치(change-detector)', () => {
    // 이 값을 바꾸려면 외부 AI R/W 식별 영향(오귀속·재식별)을 검토하고 이 테스트도 의도적으로 갱신해야 한다.
    // (식별 어댑터의 실제 hard-gate 분리 동작은 regression-check #49/#50 이 별도로 고정한다.)
    expect(IDENTITY_KEY_CONTRACT.homeroomStudentId).toBe('Student.id');
    expect(IDENTITY_KEY_CONTRACT.classObservationStudentKey).toBe(
      'grade-classNo-studentNo+classId',
    );
    expect(IDENTITY_KEY_CONTRACT.attendanceMatch).toBe('studentNumber');
  });
});
