/**
 * 서명받기 — 명단 임포트(붙여넣기/CSV)·열 매핑·등록부 행 빌더 순수 로직.
 *
 * ToolSignatureRoster.tsx(UI)에서 분리된 헬퍼 모음. React/DOM 의존 없음
 * (makeMemberId의 crypto, getOwnerTeacherId의 localStorage만 런타임 폴백 포함).
 *
 * 임포트 파이프라인:
 *   텍스트 → parseRosterGrid(셀 그리드 + 헤더 판정)
 *        → suggestImportTargets(셀 위치별 대상 열 추천)
 *        → (사용자가 매핑 UI에서 조정)
 *        → applyImportMapping(명단 + 새 열 생성)
 */
import type { ColumnDef, RosterMember } from '@domain/entities/SignatureRoster';
import type { SignatureStatusRow } from '@domain/entities/SignatureEntry';
import type { SheetRow } from '@domain/ports/IGoogleSheetPort';
/* eslint-disable no-restricted-imports */
import type { ExcelRegisterRow } from '@infrastructure/export/ExportRegisterToExcel';
/* eslint-enable no-restricted-imports */
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { isStudentActive } from '@domain/rules/studentActivity';

// ──────────────────────────────────────────────────────────
// 식별자
// ──────────────────────────────────────────────────────────

export function makeMemberId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `member-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** ownerTeacherId — 분석용 device_id를 재사용 (없으면 임시 생성). */
export function getOwnerTeacherId(): string {
  try {
    const key = 'ssampin_device_id';
    let id = localStorage.getItem(key);
    if (!id) {
      id = makeMemberId();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return makeMemberId();
  }
}

// ──────────────────────────────────────────────────────────
// CSV 파싱 기초
// ──────────────────────────────────────────────────────────

/** 템플릿 다운로드 헤더(이름/소속) — 재업로드 시 헤더 행을 멤버로 오인하지 않도록 스킵 판별에 사용. */
const ROSTER_HEADER_TOKENS = new Set(['이름', '성명', 'name']);

/**
 * CSV 한 줄 → 셀 배열 (RFC4180 따옴표 규칙).
 *
 * - 구분자: 콤마(,) 또는 탭(\t).
 * - 큰따옴표로 감싼 셀 안의 구분자·따옴표는 보존하며, `""`는 리터럴 따옴표로 해제한다.
 * - 각 셀은 trim 한다(따옴표 해제 후).
 */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // "" 이스케이프 — 다음 문자가 따옴표면 리터럴 따옴표.
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === '\t') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** 첫 토큰이 헤더 키워드(이름/성명/name)와 일치하면 헤더 행으로 판정. */
function isRosterHeaderLine(line: string | undefined): boolean {
  if (!line) return false;
  const firstToken = parseCsvLine(line)[0]?.trim().toLowerCase() ?? '';
  return ROSTER_HEADER_TOKENS.has(firstToken);
}

/** UTF-8 BOM 제거 후 비어 있지 않은 줄 배열로 분해. */
function splitLines(text: string): string[] {
  return text
    .replace(new RegExp('^\\uFEFF'), '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// ──────────────────────────────────────────────────────────
// 입력 열 / 헤더 매핑
// ──────────────────────────────────────────────────────────

/**
 * 명단 작성용(입력) 열만 order 순으로 추린다.
 *
 * 제외 대상:
 *  - signature 타입: 참석자가 현장에서 그리는 서명(교사 입력 불가).
 *  - signedAt 키: 시스템 자동 기록 일시.
 *  - no 키: 연번(임포트 시 자동 부여).
 * 즉 소속·이름·교사가 추가한 커스텀 열만 남는다(라벨/순서 그대로).
 */
export function rosterInputColumns(columns: readonly ColumnDef[]): ColumnDef[] {
  return [...columns]
    .filter((c) => c.type !== 'signature' && c.key !== 'signedAt' && c.key !== 'no')
    .sort((a, b) => a.order - b.order);
}

/**
 * 입력 열 label → 열 매핑(헤더 행 기준). 라벨이 입력 열과 일치하는 셀이 하나라도 있으면
 * 헤더 행으로 보고 [셀 위치 → ColumnDef] 매핑을 만든다(열 순서를 바꿔도 라벨로 정확히 매핑).
 * 일치 셀이 없으면 null(레거시 휴리스틱으로 폴백).
 */
function matchHeaderColumns(
  headerCells: readonly string[],
  inputColumns: readonly ColumnDef[],
): Array<ColumnDef | null> | null {
  const byLabel = new Map(inputColumns.map((c) => [c.label.trim(), c]));
  const mapping = headerCells.map((cell) => byLabel.get(cell.trim()) ?? null);
  return mapping.some((c) => c !== null) ? mapping : null;
}

// ──────────────────────────────────────────────────────────
// 레거시 단일 호출 파서 (양식 round-trip·테스트 호환 유지)
// ──────────────────────────────────────────────────────────

/**
 * 붙여넣기/CSV 텍스트 → 명단.
 *
 * - columns 전달 + 첫 줄이 입력 열 라벨과 매칭되면 **열-인식(column-aware)** 파싱:
 *   라벨로 셀 위치를 열에 매핑하고(순서 무관), name→member.name, affiliation→member.affiliation,
 *   나머지 매칭 열→member.fields[key]를 채운다. 이름 열 매핑이 없으면 첫 칸을 이름으로 폴백.
 * - 그 외(columns 미전달·헤더 라벨 불일치)는 레거시 휴리스틱:
 *   첫 줄이 이름/성명/name 토큰이면 헤더 스킵, 첫 칸=이름·둘째 칸=소속.
 *   (파라미터 없이 호출 시 기존 동작과 동일.)
 */
export function parsePastedRoster(text: string, columns?: readonly ColumnDef[]): RosterMember[] {
  const lines = splitLines(text);
  if (lines.length === 0) return [];

  const inputColumns = columns ? rosterInputColumns(columns) : [];
  const headerMapping =
    inputColumns.length > 0 ? matchHeaderColumns(parseCsvLine(lines[0] ?? ''), inputColumns) : null;

  if (headerMapping) {
    // 열-인식 파싱 — 라벨로 매핑된 열 위치에서 값을 읽는다.
    const hasNameColumn = headerMapping.some((c) => c?.key === 'name');
    return lines
      .slice(1)
      .map((line, index) => {
        const cells = parseCsvLine(line);
        const fields: Record<string, string> = { no: String(index + 1) };
        let name = '';
        let affiliation: string | undefined;
        headerMapping.forEach((column, cellIndex) => {
          if (!column) return;
          const value = cells[cellIndex]?.trim() ?? '';
          if (column.key === 'name') name = value;
          else if (column.key === 'affiliation') affiliation = value || undefined;
          else if (value) fields[column.key] = value;
        });
        // 이름 열 매핑이 없거나 비면 첫 칸을 이름으로 폴백.
        if (!name && !hasNameColumn) name = cells[0]?.trim() ?? '';
        return {
          id: makeMemberId(),
          name,
          affiliation,
          fields,
        };
      })
      .filter((member) => member.name.length > 0);
  }

  // 레거시 휴리스틱 — 첫 줄이 헤더(이름/성명/name)면 스킵, 첫 칸=이름·둘째 칸=소속.
  const startIndex = isRosterHeaderLine(lines[0]) ? 1 : 0;
  return lines
    .slice(startIndex)
    .map((line, index) => {
      const [namePart, affiliationPart] = parseCsvLine(line);
      return {
        id: makeMemberId(),
        name: namePart ?? line,
        affiliation: affiliationPart || undefined,
        fields: { no: String(index + 1) },
      };
    })
    .filter((member) => member.name.length > 0);
}

// ──────────────────────────────────────────────────────────
// 임포트 그리드 + 열 매핑 (미리보기 UI용)
// ──────────────────────────────────────────────────────────

/** 매핑 대상 특수 값 — 일반 값은 ColumnDef.key */
export const IMPORT_TARGET_NEW = '__new__';
export const IMPORT_TARGET_IGNORE = '__ignore__';

/** 셀 위치별 임포트 대상: 열 key | '__new__'(새 열 생성) | '__ignore__'(무시) */
export type ImportTarget = string;

/** 붙여넣기/CSV 텍스트를 셀 그리드로 파싱한 결과 */
export interface ParsedRosterGrid {
  /** 헤더로 판정된 첫 행 셀들 (헤더 없으면 null) */
  readonly header: readonly string[] | null;
  /** 데이터 행 (헤더 제외) */
  readonly rows: readonly (readonly string[])[];
  /** 가장 넓은 행의 셀 개수 */
  readonly width: number;
}

/**
 * 텍스트 → 셀 그리드. 첫 줄이 (a) 현재 입력 열 라벨과 하나라도 일치하거나
 * (b) 이름/성명/name 토큰으로 시작하면 헤더로 분리한다.
 */
export function parseRosterGrid(text: string, columns: readonly ColumnDef[]): ParsedRosterGrid {
  const lines = splitLines(text);
  if (lines.length === 0) return { header: null, rows: [], width: 0 };

  const allCells = lines.map(parseCsvLine);
  const inputColumns = rosterInputColumns(columns);
  const firstCells = allCells[0] ?? [];
  const isHeader =
    matchHeaderColumns(firstCells, inputColumns) !== null || isRosterHeaderLine(lines[0]);

  const header = isHeader ? firstCells : null;
  const rows = isHeader ? allCells.slice(1) : allCells;
  const width = Math.max(0, ...rows.map((r) => r.length), header?.length ?? 0);
  return { header, rows, width };
}

/**
 * 셀 위치별 기본 매핑 추천.
 *
 * - 헤더가 있으면: 라벨 일치 → 해당 열, 비어 있지 않은 미일치 라벨 → 새 열, 빈 라벨 → 무시.
 * - 헤더가 없으면: 첫 칸=이름, 둘째 칸=소속(소속 열이 있을 때), 이후 칸은
 *   아직 배정 안 된 커스텀 입력 열을 순서대로, 남으면 무시.
 */
export function suggestImportTargets(
  grid: ParsedRosterGrid,
  columns: readonly ColumnDef[],
): ImportTarget[] {
  const inputColumns = rosterInputColumns(columns);
  const targets: ImportTarget[] = [];

  if (grid.header) {
    const byLabel = new Map(inputColumns.map((c) => [c.label.trim(), c.key]));
    for (let i = 0; i < grid.width; i += 1) {
      const label = grid.header[i]?.trim() ?? '';
      if (label.length === 0) {
        targets.push(IMPORT_TARGET_IGNORE);
      } else if (byLabel.has(label)) {
        targets.push(byLabel.get(label)!);
      } else if (ROSTER_HEADER_TOKENS.has(label.toLowerCase())) {
        targets.push('name');
      } else {
        targets.push(IMPORT_TARGET_NEW);
      }
    }
    return targets;
  }

  // 헤더 없음 — 위치 기반 추천.
  const hasAffiliation = inputColumns.some((c) => c.key === 'affiliation');
  const customQueue = inputColumns
    .filter((c) => c.key !== 'name' && c.key !== 'affiliation')
    .map((c) => c.key);
  for (let i = 0; i < grid.width; i += 1) {
    if (i === 0) {
      targets.push('name');
    } else if (i === 1 && hasAffiliation) {
      targets.push('affiliation');
    } else {
      targets.push(customQueue.shift() ?? IMPORT_TARGET_IGNORE);
    }
  }
  return targets;
}

/** 매핑 적용 결과 — 명단 + (새 열 생성/미사용 열 제거가 반영된) 열 정의 */
export interface ApplyImportResult {
  readonly members: RosterMember[];
  readonly columns: ColumnDef[];
}

/** 매핑 적용 옵션 */
export interface ApplyImportOptions {
  /**
   * 매핑에 등장하지 않은 입력 열(이름 제외)을 결과 columns에서 제거한다.
   * 예: '부서·이름' CSV를 가져올 때 기존 '소속' 열을 함께 정리 —
   * 가져온 양식과 열 편집을 동기화하는 용도. 연번·서명·서명일시는 입력 열이
   * 아니므로 항상 유지된다.
   */
  readonly removeUnmappedInputColumns?: boolean;
}

/**
 * 그리드 + 셀 위치별 매핑 → 명단 생성.
 *
 * - '__new__' 대상은 텍스트 열을 새로 만들어 columns 끝에 추가한다
 *   (라벨: 헤더 셀 값, 없으면 "추가 열 N").
 * - name 매핑이 없으면 첫 칸을 이름으로 사용한다(레거시 호환).
 * - 이름이 빈 행은 제외하고, 연번(no)은 1부터 자동 부여한다.
 * - options.removeUnmappedInputColumns가 켜져 있으면 매핑되지 않은
 *   입력 열(이름 제외)을 결과 columns에서 뺀다.
 */
export function applyImportMapping(
  grid: ParsedRosterGrid,
  targets: readonly ImportTarget[],
  columns: readonly ColumnDef[],
  options?: ApplyImportOptions,
): ApplyImportResult {
  const nextColumns = columns.map((c) => ({ ...c }));
  let maxOrder = nextColumns.reduce((m, c) => Math.max(m, c.order), -1);

  // '__new__' 대상마다 새 텍스트 열 생성 → 실제 매핑 키로 치환.
  let newCount = 0;
  const resolvedTargets: ImportTarget[] = targets.map((target, index) => {
    if (target !== IMPORT_TARGET_NEW) return target;
    newCount += 1;
    const label = grid.header?.[index]?.trim() || `추가 열 ${newCount}`;
    const key = `custom_${Date.now().toString(36)}_${index}`;
    maxOrder += 1;
    nextColumns.push({ key, label, type: 'text', order: maxOrder });
    return key;
  });

  const hasNameTarget = resolvedTargets.includes('name');

  const members: RosterMember[] = grid.rows
    .map((cells, rowIndex) => {
      const fields: Record<string, string> = { no: String(rowIndex + 1) };
      let name = '';
      let affiliation: string | undefined;
      resolvedTargets.forEach((target, cellIndex) => {
        if (target === IMPORT_TARGET_IGNORE) return;
        const value = cells[cellIndex]?.trim() ?? '';
        if (target === 'name') name = value;
        else if (target === 'affiliation') affiliation = value || undefined;
        else if (value) fields[target] = value;
      });
      if (!name && !hasNameTarget) name = cells[0]?.trim() ?? '';
      return { id: makeMemberId(), name, affiliation, fields };
    })
    .filter((member) => member.name.length > 0);

  // 가져온 양식과 열 편집 동기화 — 매핑에 안 쓰인 입력 열(이름 제외) 제거.
  const finalColumns = options?.removeUnmappedInputColumns
    ? filterUnmappedInputColumns(nextColumns, resolvedTargets)
    : nextColumns;

  return { members, columns: finalColumns };
}

/** 입력 열 판정 — rosterInputColumns와 동일 규칙 (signature·signedAt·no 제외). */
function isInputColumn(column: ColumnDef): boolean {
  return column.type !== 'signature' && column.key !== 'signedAt' && column.key !== 'no';
}

/** 매핑에 등장하지 않은 입력 열(이름 제외)을 걸러낸다. 비입력 열은 항상 유지. */
function filterUnmappedInputColumns(
  columns: readonly ColumnDef[],
  resolvedTargets: readonly ImportTarget[],
): ColumnDef[] {
  const used = new Set(resolvedTargets);
  return columns.filter((column) => {
    if (!isInputColumn(column) || column.key === 'name') return true;
    return used.has(column.key);
  });
}

// ──────────────────────────────────────────────────────────
// 학급 명렬 → 명단 변환 (담임반·수업반)
// ──────────────────────────────────────────────────────────

/** 담임반 학생 목록 → 명단 (소속 = "학년-반" 또는 폴백 라벨). */
export function classStudentsToMembers(
  students: ReadonlyArray<{ readonly name: string; readonly studentNumber?: number }>,
  affiliation: string,
): RosterMember[] {
  return students.map((student, index) => ({
    id: makeMemberId(),
    name: student.name,
    affiliation,
    fields: { no: String(student.studentNumber ?? index + 1) },
  }));
}

/**
 * 수업반(TeachingClass) → 명단.
 *
 * - 재적 상태가 active인 학생만 포함한다.
 * - 소속: 학생별 학년/반 정보가 있으면 "학년-반"(수준별 혼합반 대응), 없으면 수업반 이름.
 * - 연번: 수업반 출석번호.
 */
export function teachingClassToMembers(tc: TeachingClass): RosterMember[] {
  return tc.students.filter(isStudentActive).map((s) => ({
    id: makeMemberId(),
    name: s.name?.trim() ? s.name : `${s.number}번`,
    affiliation: s.grade != null && s.classNum != null ? `${s.grade}-${s.classNum}` : tc.name,
    fields: { no: String(s.number) },
  }));
}

// ──────────────────────────────────────────────────────────
// 시트/Excel 등록부 행 빌더
// ──────────────────────────────────────────────────────────

/**
 * 명단 + 현황 → 시트 행 (동적 열 매핑).
 *
 * 열 종류별 채우기:
 *  - signature 열: status.signaturePublicUrl (서명 완료자만, GoogleSheetClient가 =IMAGE로 변환). 미서명 빈칸.
 *  - builtin no/name/affiliation: 명단(member)에서 채움.
 *  - builtin signedAt: status.signedAt.
 *  - 커스텀 열: member.fields 폴백 (status에 rowData가 없으면 빈칸 허용).
 */
export function buildSheetRows(
  members: readonly RosterMember[],
  columns: readonly ColumnDef[],
  statusRows: readonly SignatureStatusRow[],
): SheetRow[] {
  const statusByRef = new Map(statusRows.map((row) => [row.memberRef, row]));
  return members.map((member, index) => {
    const status = statusByRef.get(member.id);
    const row: SheetRow = {};
    for (const column of columns) {
      row[column.key] = resolveCellValue(column, member, status, index);
    }
    return row;
  });
}

/**
 * 단일 셀 값 해석 — 시트/Excel 행 빌더가 공유하는 동적 열 매핑 규칙.
 *
 * signature 열은 status.signaturePublicUrl(서명 완료자만)을 반환하고,
 * builtin·커스텀 열은 status/member에서 채운다(없으면 빈칸).
 */
function resolveCellValue(
  column: ColumnDef,
  member: RosterMember,
  status: SignatureStatusRow | undefined,
  index: number,
): string {
  if (column.type === 'signature') {
    // 서명 완료자만 공개 URL 보유. 미서명자는 빈칸(=IMAGE 미생성).
    return status?.signaturePublicUrl ?? '';
  }
  if (column.key === 'no') {
    return member.fields.no ?? String(index + 1);
  }
  if (column.key === 'name') {
    return member.name;
  }
  if (column.key === 'affiliation') {
    return member.affiliation ?? status?.affiliation ?? '';
  }
  if (column.key === 'signedAt') {
    // 서버는 UTC ISO 문자열을 주므로 등록부에는 한국 시간으로 변환해 넣는다.
    return status?.signedAt ? formatSignedAtKst(status.signedAt) : '';
  }
  // 커스텀 열: member.fields 폴백 (status에 rowData가 없으면 빈칸 허용).
  return member.fields[column.key] ?? '';
}

/**
 * ISO 일시 → 한국 시간 'YYYY-MM-DD HH:mm' (등록부 서명일시 표기).
 * 파싱 불가한 값은 원문 그대로 반환한다. PC 시간대와 무관하게 항상 Asia/Seoul 기준.
 */
export function formatSignedAtKst(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // sv-SE 로케일은 'YYYY-MM-DD HH:mm' 형태 — 등록부 정렬·가독에 적합.
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * 명단 + 현황 → Excel 등록부 행.
 * cells는 시트 행과 동일 규약(텍스트). signature 열은 셀 텍스트를 비우고,
 * 현황(status)에 담긴 서명 공개 URL이 있으면 signatureUrl로 넘겨 PNG 임베드한다.
 * (시트 빌더와 동일한 resolveCellValue 매핑을 공유 — signature 열만 셀에서 비운다.)
 */
export function buildExcelRows(
  members: readonly RosterMember[],
  columns: readonly ColumnDef[],
  statusRows: readonly SignatureStatusRow[],
): ExcelRegisterRow[] {
  const statusByRef = new Map(statusRows.map((row) => [row.memberRef, row]));
  // signature 타입 열이 없으면 PNG 임베드 자체를 생략(기본 서명 열 삭제 시 graceful).
  const hasSignatureColumn = columns.some((column) => column.type === 'signature');
  return members.map((member, index) => {
    const status = statusByRef.get(member.id);
    const cells: Record<string, string> = {};
    for (const column of columns) {
      // signature 열은 이미지로 임베드하므로 셀 텍스트는 비운다.
      cells[column.key] =
        column.type === 'signature' ? '' : resolveCellValue(column, member, status, index);
    }
    // 서명 완료자(status.signaturePublicUrl)만 PNG 임베드 대상으로 전달(없으면 빈 셀).
    // signature 열이 없는 명단은 임베드 대상에서 제외한다.
    const signatureUrl = hasSignatureColumn ? status?.signaturePublicUrl : undefined;
    return signatureUrl ? { cells, signatureUrl } : { cells };
  });
}

// ──────────────────────────────────────────────────────────
// CSV 양식 다운로드
// ──────────────────────────────────────────────────────────

/**
 * 명단 작성용 템플릿 CSV 생성 — **열-인식(column-aware)**.
 *
 * - 헤더 = rosterInputColumns(columns)의 label들(order 순). 즉 소속·이름·교사가 추가한
 *   커스텀 열까지 모두 헤더로 내보낸다(입력 열이 하나도 없으면 ['이름'] 폴백).
 * - 서명(signature)·서명일시(datetime)·연번(자동 부여)은 입력 열에서 제외돼 헤더에도 없다.
 * - 사용자가 형식을 알 수 있도록 현실적인 샘플 3행을 포함한다(열별 휴리스틱 예시).
 * - 헤더 라벨 순서 = parsePastedRoster(text, columns)가 라벨로 매핑하므로 왕복 호환된다.
 */
export function buildRosterTemplateCsv(columns: readonly ColumnDef[]): string {
  const inputColumns = rosterInputColumns(columns);
  const effectiveColumns: ColumnDef[] =
    inputColumns.length > 0
      ? inputColumns
      : [{ key: 'name', label: '이름', type: 'text', order: 0 }];
  const header = effectiveColumns.map((c) => c.label);
  const sampleRows = [0, 1, 2].map((rowIndex) =>
    effectiveColumns.map((column) => sampleCellForColumn(column, rowIndex)),
  );
  const lines = [header, ...sampleRows].map((cols) => cols.map(escapeCsvCell).join(','));
  return lines.join('\r\n');
}

/**
 * 템플릿 샘플 셀 값 — 열 의미를 라벨/키/타입 휴리스틱으로 추정해 현실적 예시를 채운다.
 * rowIndex: 0~2 (샘플 3행).
 */
function sampleCellForColumn(column: ColumnDef, rowIndex: number): string {
  if (column.key === 'name') {
    return ['홍길동', '김영희', '이서준'][rowIndex] ?? '';
  }
  if (column.key === 'affiliation') {
    return ['1학년 1반', '1학년 2반', '2학년 3반'][rowIndex] ?? '';
  }
  if (column.type === 'datetime') return '';
  if (column.type === 'number') return String(rowIndex + 1);

  const label = column.label.trim();
  if (/직위|직급|직책/.test(label)) {
    return ['교사', '부장교사', '교사'][rowIndex] ?? '';
  }
  if (/부서|소속부|담당부/.test(label)) {
    return ['교무부', '연구부', '생활부'][rowIndex] ?? '';
  }
  if (/사번|번호|학번|ID|아이디/i.test(label)) {
    return ['10234', '10235', '10236'][rowIndex] ?? '';
  }
  if (/전화|연락처|휴대|핸드폰|폰/.test(label)) {
    return '010-1234-5678';
  }
  return '';
}

/** CSV 셀 이스케이프 — 콤마/따옴표/줄바꿈 포함 시 큰따옴표로 감싸고 내부 따옴표는 중복. */
function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
