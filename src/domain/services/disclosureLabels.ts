/**
 * 학교알리미 공시 컬럼ID → 한글 라벨 매핑 — 이식 원본: schoolinfo-mcp/src/labels.json (MIT).
 *
 * OpenAPI 응답 행의 컬럼은 COL_S1·COL_C3 같은 코드라, 사람이 읽는 표로 만들려면
 * apiType별 라벨 매핑이 필요하다. 순수 도메인(정적 데이터만).
 */
import LABELS_DATA from '../data/schoolinfoLabels.json';

const LABELS = LABELS_DATA as Record<string, Record<string, string>>;

/**
 * 학교알리미 라벨의 학교급 접두어("초등부-" 등) 제거 정규식.
 *
 * 62(학교 현황)·09(학년별 학생수) 등은 COL_1~COL_8 을 학교급과 무관하게
 * "그 학교의 1학년~순회"로 재사용하는데, labels.json 은 초등 기준으로
 * "초등부-1학년"처럼 라벨링한다. 고등학교에 "초등부"가 붙는 오표기를 막기 위해
 * 접두어를 떼어 "1학년"/"특수"/"순회"로 보여준다.
 */
const SCHOOL_LEVEL_PREFIX = /^(유초등부|초등부|중등부|고등부)\s*-?\s*/;

/**
 * 라벨만으로 값의 의미가 모호한 항목의 라벨 보강(apiType별).
 * 08(수업일수·수업시수)의 COL_1~6 은 학년별 '수업일수'인데 기본 라벨이 "1학년"뿐이라,
 * 값(예: 233)이 무엇인지 알기 어렵다 → "1학년 수업일수"처럼 명시한다.
 */
const LABEL_OVERRIDES: Record<string, Record<string, string>> = {
  '08': {
    COL_1: '1학년 수업일수',
    COL_2: '2학년 수업일수',
    COL_3: '3학년 수업일수',
    COL_4: '4학년 수업일수',
    COL_5: '5학년 수업일수',
    COL_6: '6학년 수업일수',
    WEEK_TOT_ITRT_HR_FGR: '주당 수업시수(학교 전체)',
    PER_STUDAY_DAY: '교사 1인당 주당 수업시수',
    ITRT_TCR_TOT_FGR: '수업 교원수',
  },
};

/** 숫자 값 뒤에 붙일 단위(apiType+컬럼별). 텍스트 값('주간' 등)에는 붙이지 않는다. */
const VALUE_UNITS: Record<string, Record<string, string>> = {
  '08': {
    COL_1: '일',
    COL_2: '일',
    COL_3: '일',
    COL_4: '일',
    COL_5: '일',
    COL_6: '일',
    WEEK_TOT_ITRT_HR_FGR: '시간',
    PER_STUDAY_DAY: '시간',
    ITRT_TCR_TOT_FGR: '명',
  },
};

/** apiType + 컬럼ID → 한글 라벨(학교급 접두어 제거). 매핑이 없으면 컬럼ID를 그대로 돌려준다. */
export function disclosureLabel(apiType: string, colId: string): string {
  const override = LABEL_OVERRIDES[apiType]?.[colId];
  if (override) return override;
  const raw = LABELS[apiType]?.[colId] ?? colId;
  const stripped = raw.replace(SCHOOL_LEVEL_PREFIX, '');
  return stripped.length > 0 ? stripped : raw;
}

/** 숫자 값에 단위를 붙여 표시용 문자열로(단위 미지정·비숫자면 원본 그대로). */
function withUnit(apiType: string, colId: string, value: string): string {
  const unit = VALUE_UNITS[apiType]?.[colId];
  if (unit && /^[\d,]+(\.\d+)?$/.test(value)) return `${value}${unit}`;
  return value;
}

/** 표시에서 숨길 코드성/내부 컬럼 + 모든 섹션에 반복되는 공통 메타(학교명·지역·교육청·설립 등) */
const HIDDEN_COLUMNS: ReadonlySet<string> = new Set([
  // 코드성/내부
  'SCHUL_CODE',
  'SCHUL_KND_SC_CODE',
  'ATPT_OFCDC_ORG_CODE',
  'JU_ORG_CODE',
  'ADRCD_CD',
  'ADRCD_ID',
  'LCTN_SC_CODE',
  'PBAN_EXCP_YN',
  'PBAN_EXCP_RSN',
  'BNHH_YN',
  'LOAD_DTM',
  'DGHT_CRSE_SC_CODE',
  'DGHT_SC_CODE',
  'SCHUL_CRSE_SC_VALUE',
  'SCHUL_CRSE_SC_VALUE_NM',
  // 공통 메타 — 학교명은 헤더에 이미 있고, 지역·교육청·설립은 매 섹션 반복이라 군더더기
  'SCHUL_NM',
  'ADRCD_NM',
  'JU_ORG_NM',
  'ATPT_OFCDC_ORG_NM',
  'FOND_SC_CODE',
  'HS_KND_SC_NM',
]);

/**
 * 공시 행(Record)을 [한글 라벨, 값] 쌍 배열로 변환한다.
 * - 코드성/내부 컬럼은 제외
 * - 빈 값('', null, undefined)은 제외
 * - 라벨 매핑이 있는 컬럼을 우선 노출(없는 컬럼은 옵션으로 포함)
 */
/** 순수 숫자 0 값인지 ("0"·"0명"·"0개"·"0.0" 등). "1033(14)" 같은 건 0 아님. */
function isZeroValue(v: string): boolean {
  return /^0(\.0+)?\s*[가-힣]{0,2}$/.test(v);
}

export function labelizeRow(
  apiType: string,
  row: Record<string, unknown>,
  opts?: { includeUnlabeled?: boolean; hideZero?: boolean },
): { label: string; value: string }[] {
  const includeUnlabeled = opts?.includeUnlabeled ?? false;
  const out: { label: string; value: string }[] = [];
  for (const [colId, raw] of Object.entries(row)) {
    if (HIDDEN_COLUMNS.has(colId)) continue;
    const value = raw == null ? '' : String(raw).trim();
    if (value.length === 0) continue;
    // 교원·전출입처럼 0이 대부분인 항목은 0 값을 숨겨 핵심만 남긴다(옵션).
    if (opts?.hideZero && isZeroValue(value)) continue;
    const label = disclosureLabel(apiType, colId);
    if (!includeUnlabeled && label === colId) continue;
    out.push({ label, value: withUnit(apiType, colId, value) });
  }
  return out;
}
