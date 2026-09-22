/**
 * 설정 화면 '제외 학생' 목록의 행 조립(ADR-135) — 순수 함수.
 *
 * 빼기 key 는 반 범위를 담는다(담임 = `Student.id`, 수업반 = `subject:${classId}:${studentKey}`).
 * 번호는 반 카드 칸과 같은 규칙(`homeroomTiles`·`subjectTiles`)으로 붙인다 — 카드에서 본 번호와
 * 설정 화면의 번호가 달라지지 않게.
 */
import type { Student } from '@domain/entities/Student';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import type { NameExposure, ReminderSettings } from '@domain/entities/RecordReminder';
import {
  homeroomTiles,
  subjectTiles,
  teachingClassTitle,
  type CardTile,
} from '@domain/rules/observationCardRoster';
import { maskName } from '@domain/rules/recordReminderRules';

export interface ExclusionRow {
  readonly key: string;
  /** 반 이름 — 모르면 빈 문자열 */
  readonly group: string;
  /** 칸 번호 글자 — "15" 또는 "3-15". 모르면 빈 문자열 */
  readonly label: string;
  /** 이름 표시 설정을 적용한 이름('표시 안 함'이면 빈 문자열) */
  readonly displayName: string;
  /** 다시 들어오는 날. 옛 기간 없는 빼기면 null */
  readonly until: string | null;
  /** 지금 명렬에서 찾지 못했는가(전출·반 보관 등) */
  readonly missing: boolean;
}

export interface BuildExclusionRowsInput {
  readonly reminder: Pick<ReminderSettings, 'exclusions' | 'excludedStudentIds' | 'nameExposure'>;
  readonly homeroomTitle: string;
  readonly students: readonly Student[];
  readonly classes: readonly TeachingClass[];
  readonly today: string;
}

const SUBJECT_PREFIX = 'subject:';

function tileRow(
  key: string,
  group: string,
  tile: CardTile | undefined,
  until: string | null,
  exposure: NameExposure,
): ExclusionRow {
  return {
    key,
    group,
    label: tile?.label ?? '',
    displayName: tile === undefined ? '' : maskName(tile.name, exposure),
    until,
    missing: tile === undefined,
  };
}

export function buildExclusionRows(input: BuildExclusionRowsInput): ExclusionRow[] {
  const rr = input.reminder;
  const untilByKey = new Map<string, string | null>();
  for (const ex of rr.exclusions ?? []) {
    if (input.today <= ex.until) untilByKey.set(ex.key, ex.until);
  }
  for (const id of rr.excludedStudentIds ?? []) {
    if (!untilByKey.has(id)) untilByKey.set(id, null);
  }

  // 칸 순서(카드에 놓인 차례)도 함께 둔다 — 섞인 반은 번호가 아니라 학년·반·번호 차례다.
  const indexed = (tiles: readonly CardTile[]): Map<string, { tile: CardTile; index: number }> =>
    new Map(tiles.map((tile, index) => [tile.ref, { tile, index }]));
  const homeroom = indexed(homeroomTiles(input.students));
  const classById = new Map(input.classes.map((c) => [c.id, c]));
  const tilesByClass = new Map<string, Map<string, { tile: CardTile; index: number }>>();
  const tilesOf = (cls: TeachingClass): Map<string, { tile: CardTile; index: number }> => {
    let m = tilesByClass.get(cls.id);
    if (m === undefined) {
      m = indexed(subjectTiles(cls.students));
      tilesByClass.set(cls.id, m);
    }
    return m;
  };

  const rows: { row: ExclusionRow; order: number; sub: number }[] = [];
  for (const [key, until] of untilByKey) {
    if (key.startsWith(SUBJECT_PREFIX)) {
      const rest = key.slice(SUBJECT_PREFIX.length);
      const sep = rest.indexOf(':');
      const classId = sep < 0 ? rest : rest.slice(0, sep);
      const ref = sep < 0 ? '' : rest.slice(sep + 1);
      const cls = classById.get(classId);
      const found = cls === undefined ? undefined : tilesOf(cls).get(ref);
      const group = cls === undefined ? '' : teachingClassTitle(cls.name, cls.subject);
      const order = cls === undefined ? Number.MAX_SAFE_INTEGER : 1 + input.classes.indexOf(cls);
      rows.push({
        row: tileRow(key, group, found?.tile, until, rr.nameExposure),
        order,
        sub: found?.index ?? 0,
      });
    } else {
      const found = homeroom.get(key);
      rows.push({
        row: tileRow(key, input.homeroomTitle, found?.tile, until, rr.nameExposure),
        order: found === undefined ? Number.MAX_SAFE_INTEGER : 0,
        sub: found?.index ?? 0,
      });
    }
  }
  return rows
    .sort((a, b) => a.order - b.order || a.sub - b.sub || a.row.key.localeCompare(b.row.key))
    .map((r) => r.row);
}
