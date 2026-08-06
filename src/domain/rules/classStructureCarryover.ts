/**
 * classStructureCarryover — 구조 승계(S4.3) 순수 계획 규칙.
 *
 * 아카이브의 teaching-classes.json(과거 앱 버전 파일 — 관대 파싱, ADR-030 Consequences)에서
 * **반 이름·과목·그룹 구조만** 추출해 새 학년도 수업반 생성 계획을 만든다.
 * 학생 명렬·좌석·기록은 구조적으로 제외된다(필드를 아예 읽지 않는다 — S4.3 AC).
 *
 * 이 모듈은 계획만 세운다(파일 쓰기 0). 실제 생성은 호출자가 기존 스토어 액션
 * (addClass/addClassGroup)만으로 수행한다 — 신규 저장 경로 0.
 */

/** 같은 교실(groupId)의 여러 과목 묶음 — addClassGroup(name, subjects, []) 1회로 생성. */
export interface CarryoverGroup {
  readonly name: string;
  readonly subjects: readonly string[];
}

/** 단독 수업반 — addClass(name, subject, []) 1회로 생성. */
export interface CarryoverSingle {
  readonly name: string;
  readonly subject: string;
}

export interface ClassStructureCarryoverPlan {
  readonly groups: readonly CarryoverGroup[];
  readonly singles: readonly CarryoverSingle[];
  /** 생성될 수업반 총 개수(그룹의 과목 수 합 + 단독 반 수). */
  readonly totalClassCount: number;
}

interface ParsedClassRow {
  readonly name: string;
  readonly subject: string;
  readonly groupId: string | null;
  readonly order: number;
  readonly createdAt: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * 아카이브 teaching-classes.json 원문(unknown)에서 승계 계획을 만든다.
 *
 * 규칙:
 *  - 봉투 `{classes: [...]}` 또는 배열 루트를 허용(관대 파싱, throw 금지).
 *  - `archived === true`(P1 플래그로 이미 보관된 지난 학기 반)는 제외한다 —
 *    "지난 학기의 활성 수업반 틀"만 승계 대상이다.
 *  - 이름이 없는 항목은 건너뛴다(과목은 빈 문자열 허용 — 원형 보존).
 *  - 같은 groupId + 같은 이름 → 그룹 1개(과목 목록). 같은 groupId라도 이름이 다르면
 *    이름을 바꾸지 않기 위해 단독 반으로 승계한다(원형 보존 우선).
 *  - 표시 순서는 기존 스토어 정렬 규칙(order ?? Infinity → createdAt)을 따른다.
 */
export function planClassStructureCarryover(raw: unknown): ClassStructureCarryoverPlan {
  const root = asRecord(raw);
  const list = Array.isArray(raw) ? raw : Array.isArray(root?.['classes']) ? root['classes'] : [];

  const rows: ParsedClassRow[] = [];
  for (const v of list) {
    const rec = asRecord(v);
    if (!rec) continue;
    if (rec['archived'] === true) continue; // 이미 보관된 반은 지난 학기 틀이 아니다
    const name = str(rec['name']).trim();
    if (!name) continue;
    const orderRaw = rec['order'];
    rows.push({
      name,
      subject: str(rec['subject']),
      groupId: str(rec['groupId']) || null,
      order: typeof orderRaw === 'number' && Number.isFinite(orderRaw) ? orderRaw : Infinity,
      createdAt: str(rec['createdAt']),
    });
  }

  rows.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.createdAt.localeCompare(b.createdAt);
  });

  // groupId별 수집(순서 보존)
  const byGroup = new Map<string, ParsedClassRow[]>();
  const ungrouped: ParsedClassRow[] = [];
  for (const row of rows) {
    if (row.groupId === null) {
      ungrouped.push(row);
      continue;
    }
    const bucket = byGroup.get(row.groupId) ?? [];
    bucket.push(row);
    byGroup.set(row.groupId, bucket);
  }

  const groups: CarryoverGroup[] = [];
  const singles: CarryoverSingle[] = [];

  for (const bucket of byGroup.values()) {
    const first = bucket[0];
    if (!first) continue;
    const sameName = bucket.every((r) => r.name === first.name);
    if (bucket.length >= 2 && sameName) {
      groups.push({ name: first.name, subjects: bucket.map((r) => r.subject) });
    } else {
      // 구성원이 1개뿐이거나 이름이 갈리는 그룹 — 이름을 바꾸지 않고 단독 반으로 승계
      for (const r of bucket) singles.push({ name: r.name, subject: r.subject });
    }
  }
  for (const r of ungrouped) {
    singles.push({ name: r.name, subject: r.subject });
  }

  const totalClassCount = groups.reduce((sum, g) => sum + g.subjects.length, 0) + singles.length;
  return { groups, singles, totalClassCount };
}
