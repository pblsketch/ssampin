/**
 * 학교알리미 공시 컬럼ID → 한글 라벨 매핑 — 이식 원본: schoolinfo-mcp/src/labels.json (MIT).
 *
 * OpenAPI 응답 행의 컬럼은 COL_S1·COL_C3 같은 코드라, 사람이 읽는 표로 만들려면
 * apiType별 라벨 매핑이 필요하다. 순수 도메인(정적 데이터만).
 */
import LABELS_DATA from '../data/schoolinfoLabels.json';

const LABELS = LABELS_DATA as Record<string, Record<string, string>>;

/** apiType + 컬럼ID → 한글 라벨. 매핑이 없으면 컬럼ID를 그대로 돌려준다. */
export function disclosureLabel(apiType: string, colId: string): string {
  return LABELS[apiType]?.[colId] ?? colId;
}

/** 표시에서 숨길 코드성/내부 컬럼 (값보다 코드라 사용자에게 무의미) */
const HIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  'SCHUL_CODE',
  'SCHUL_KND_SC_CODE',
  'ATPT_OFCDC_ORG_CODE',
  'JU_ORG_CODE',
  'ADRCD_CD',
  'ADRCD_ID',
  'LCTN_SC_CODE',
  'PBAN_EXCP_YN',
  'BNHH_YN',
  'LOAD_DTM',
]);

/**
 * 공시 행(Record)을 [한글 라벨, 값] 쌍 배열로 변환한다.
 * - 코드성/내부 컬럼은 제외
 * - 빈 값('', null, undefined)은 제외
 * - 라벨 매핑이 있는 컬럼을 우선 노출(없는 컬럼은 옵션으로 포함)
 */
export function labelizeRow(
  apiType: string,
  row: Record<string, unknown>,
  opts?: { includeUnlabeled?: boolean },
): { label: string; value: string }[] {
  const includeUnlabeled = opts?.includeUnlabeled ?? false;
  const out: { label: string; value: string }[] = [];
  for (const [colId, raw] of Object.entries(row)) {
    if (HIDDEN_COLUMNS.has(colId)) continue;
    const value = raw == null ? '' : String(raw).trim();
    if (value.length === 0) continue;
    const label = disclosureLabel(apiType, colId);
    if (!includeUnlabeled && label === colId) continue;
    out.push({ label, value });
  }
  return out;
}
