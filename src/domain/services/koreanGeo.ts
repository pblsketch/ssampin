/**
 * 한국 행정구역 주소 → 좌표 매핑 (순수·오프라인).
 *
 * school-enrich.plan.md ②-A: NEIS 학교 주소로 날씨 좌표를 자동 설정한다.
 *
 * 선결조건 §8-A 검증(실호출): WeatherAPI `search.json` 은 한글 질의에 빈 배열을 반환하고
 * (로마자 변환은 'Bundang'→카메룬 등 오매칭 위험), `forecast.json` 도 한글 지명 직접
 * 지오코딩이 불가(error 1006)했다. 따라서 네트워크·API 키 없이 전국 시·군 좌표표에
 * 주소를 매칭하는 순수 함수로 대체한다. 좌표 정밀도는 시·군 중심 수준(날씨엔 충분, §12).
 *
 * 도메인 레이어이므로 외부 의존성을 import 하지 않는다(순수 데이터 + 문자열 파싱).
 * 좌표표(KOREAN_CITIES)는 설정 화면 날씨 지역 선택(WeatherTab)과 공유한다 —
 * adapters/components/Settings/shared/constants.ts 가 여기서 재export 한다(단일 출처).
 */

export interface KoreanRegionGeo {
  readonly name: string;
  readonly region: string;
  readonly lat: number;
  readonly lon: number;
}

/** 지오코딩 결과 — WeatherLocation 과 동일 형태 */
export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
  /** 표시용 지역명(괄호 표기 제거됨, 예: '광주') */
  readonly name: string;
}

export const KOREAN_CITIES: KoreanRegionGeo[] = [
  // ─── 특별시·광역시·특별자치시 ───
  { name: '서울', region: '특별시·광역시', lat: 37.5665, lon: 126.978 },
  { name: '부산', region: '특별시·광역시', lat: 35.1796, lon: 129.0756 },
  { name: '대구', region: '특별시·광역시', lat: 35.8714, lon: 128.6014 },
  { name: '인천', region: '특별시·광역시', lat: 37.4563, lon: 126.7052 },
  { name: '광주', region: '특별시·광역시', lat: 35.1595, lon: 126.8526 },
  { name: '대전', region: '특별시·광역시', lat: 36.3504, lon: 127.3845 },
  { name: '울산', region: '특별시·광역시', lat: 35.5384, lon: 129.3114 },
  { name: '세종', region: '특별시·광역시', lat: 36.48, lon: 127.2553 },

  // ─── 경기도 ───
  { name: '수원', region: '경기도', lat: 37.2636, lon: 127.0286 },
  { name: '성남', region: '경기도', lat: 37.4201, lon: 127.1265 },
  { name: '고양', region: '경기도', lat: 37.6584, lon: 126.832 },
  { name: '용인', region: '경기도', lat: 37.2411, lon: 127.1776 },
  { name: '안산', region: '경기도', lat: 37.3219, lon: 126.8309 },
  { name: '안양', region: '경기도', lat: 37.3943, lon: 126.9568 },
  { name: '남양주', region: '경기도', lat: 37.636, lon: 127.2165 },
  { name: '화성', region: '경기도', lat: 37.1996, lon: 126.8312 },
  { name: '평택', region: '경기도', lat: 36.9922, lon: 127.1126 },
  { name: '의정부', region: '경기도', lat: 37.7381, lon: 127.0337 },
  { name: '시흥', region: '경기도', lat: 37.38, lon: 126.8029 },
  { name: '파주', region: '경기도', lat: 37.7599, lon: 126.7797 },
  { name: '김포', region: '경기도', lat: 37.6153, lon: 126.7156 },
  { name: '광명', region: '경기도', lat: 37.4786, lon: 126.8646 },
  { name: '부천', region: '경기도', lat: 37.5034, lon: 126.766 },
  { name: '군포', region: '경기도', lat: 37.3614, lon: 126.935 },
  { name: '이천', region: '경기도', lat: 37.2722, lon: 127.435 },
  { name: '양주', region: '경기도', lat: 37.785, lon: 127.0456 },
  { name: '오산', region: '경기도', lat: 37.1498, lon: 127.0775 },
  { name: '하남', region: '경기도', lat: 37.5393, lon: 127.2148 },
  { name: '광주(경기)', region: '경기도', lat: 37.4294, lon: 127.2551 },
  { name: '구리', region: '경기도', lat: 37.5943, lon: 127.1295 },
  { name: '안성', region: '경기도', lat: 37.008, lon: 127.2797 },
  { name: '포천', region: '경기도', lat: 37.8948, lon: 127.2004 },
  { name: '의왕', region: '경기도', lat: 37.3449, lon: 126.9685 },
  { name: '과천', region: '경기도', lat: 37.4292, lon: 126.9876 },
  { name: '여주', region: '경기도', lat: 37.2984, lon: 127.6372 },
  { name: '양평', region: '경기도', lat: 37.4917, lon: 127.4876 },
  { name: '동두천', region: '경기도', lat: 37.9035, lon: 127.0607 },
  { name: '가평', region: '경기도', lat: 37.8315, lon: 127.5106 },
  { name: '연천', region: '경기도', lat: 38.0964, lon: 127.0748 },

  // ─── 강원도 ───
  { name: '춘천', region: '강원도', lat: 37.8813, lon: 127.7298 },
  { name: '원주', region: '강원도', lat: 37.342, lon: 127.9201 },
  { name: '강릉', region: '강원도', lat: 37.7519, lon: 128.8761 },
  { name: '속초', region: '강원도', lat: 38.207, lon: 128.5918 },
  { name: '동해', region: '강원도', lat: 37.5247, lon: 129.1143 },
  { name: '태백', region: '강원도', lat: 37.1641, lon: 128.9856 },
  { name: '삼척', region: '강원도', lat: 37.4499, lon: 129.1647 },
  { name: '홍천', region: '강원도', lat: 37.6972, lon: 127.8884 },
  { name: '횡성', region: '강원도', lat: 37.4913, lon: 127.9847 },
  { name: '영월', region: '강원도', lat: 37.1838, lon: 128.4619 },
  { name: '정선', region: '강원도', lat: 37.3811, lon: 128.6608 },
  { name: '철원', region: '강원도', lat: 38.1465, lon: 127.3133 },
  { name: '평창', region: '강원도', lat: 37.3706, lon: 128.3905 },
  { name: '양양', region: '강원도', lat: 38.0753, lon: 128.6189 },
  { name: '인제', region: '강원도', lat: 38.0697, lon: 128.1709 },
  { name: '고성(강원)', region: '강원도', lat: 38.3802, lon: 128.4679 },
  { name: '양구', region: '강원도', lat: 38.1097, lon: 127.9892 },
  { name: '화천', region: '강원도', lat: 38.1062, lon: 127.7081 },

  // ─── 충청북도 ───
  { name: '청주', region: '충청북도', lat: 36.6424, lon: 127.489 },
  { name: '충주', region: '충청북도', lat: 36.991, lon: 127.926 },
  { name: '제천', region: '충청북도', lat: 37.1327, lon: 128.191 },
  { name: '보은', region: '충청북도', lat: 36.4893, lon: 127.7295 },
  { name: '옥천', region: '충청북도', lat: 36.3061, lon: 127.5712 },
  { name: '영동', region: '충청북도', lat: 36.175, lon: 127.7761 },
  { name: '증평', region: '충청북도', lat: 36.7853, lon: 127.5817 },
  { name: '진천', region: '충청북도', lat: 36.8554, lon: 127.4355 },
  { name: '괴산', region: '충청북도', lat: 36.8153, lon: 127.7865 },
  { name: '음성', region: '충청북도', lat: 36.9405, lon: 127.6905 },
  { name: '단양', region: '충청북도', lat: 36.9845, lon: 128.3655 },

  // ─── 충청남도 ───
  { name: '천안', region: '충청남도', lat: 36.8151, lon: 127.1139 },
  { name: '아산', region: '충청남도', lat: 36.7898, lon: 127.0018 },
  { name: '서산', region: '충청남도', lat: 36.7845, lon: 126.4503 },
  { name: '논산', region: '충청남도', lat: 36.1872, lon: 127.0987 },
  { name: '당진', region: '충청남도', lat: 36.8898, lon: 126.6297 },
  { name: '공주', region: '충청남도', lat: 36.4465, lon: 127.119 },
  { name: '보령', region: '충청남도', lat: 36.3334, lon: 126.6128 },
  { name: '홍성', region: '충청남도', lat: 36.6012, lon: 126.6608 },
  { name: '예산', region: '충청남도', lat: 36.6828, lon: 126.8448 },
  { name: '태안', region: '충청남도', lat: 36.7458, lon: 126.298 },
  { name: '계룡', region: '충청남도', lat: 36.2747, lon: 127.2486 },
  { name: '금산', region: '충청남도', lat: 36.1088, lon: 127.4877 },
  { name: '부여', region: '충청남도', lat: 36.2758, lon: 126.9098 },
  { name: '서천', region: '충청남도', lat: 36.0803, lon: 126.6916 },
  { name: '청양', region: '충청남도', lat: 36.459, lon: 126.8022 },

  // ─── 전라북도 ───
  { name: '전주', region: '전라북도', lat: 35.8242, lon: 127.148 },
  { name: '군산', region: '전라북도', lat: 35.9676, lon: 126.7369 },
  { name: '익산', region: '전라북도', lat: 35.9483, lon: 126.9577 },
  { name: '정읍', region: '전라북도', lat: 35.5699, lon: 126.856 },
  { name: '남원', region: '전라북도', lat: 35.4164, lon: 127.3904 },
  { name: '김제', region: '전라북도', lat: 35.8037, lon: 126.8808 },
  { name: '완주', region: '전라북도', lat: 35.9044, lon: 127.1627 },
  { name: '진안', region: '전라북도', lat: 35.7914, lon: 127.4248 },
  { name: '무주', region: '전라북도', lat: 36.0068, lon: 127.6607 },
  { name: '장수', region: '전라북도', lat: 35.6475, lon: 127.5212 },
  { name: '임실', region: '전라북도', lat: 35.6178, lon: 127.2828 },
  { name: '순창', region: '전라북도', lat: 35.3744, lon: 127.1372 },
  { name: '고창', region: '전라북도', lat: 35.4358, lon: 126.7019 },
  { name: '부안', region: '전라북도', lat: 35.7316, lon: 126.7328 },

  // ─── 전라남도 ───
  { name: '목포', region: '전라남도', lat: 34.8118, lon: 126.3922 },
  { name: '여수', region: '전라남도', lat: 34.7604, lon: 127.6622 },
  { name: '순천', region: '전라남도', lat: 34.9506, lon: 127.4873 },
  { name: '나주', region: '전라남도', lat: 35.0156, lon: 126.7108 },
  { name: '광양', region: '전라남도', lat: 34.9407, lon: 127.6959 },
  { name: '담양', region: '전라남도', lat: 35.3214, lon: 126.9882 },
  { name: '곡성', region: '전라남도', lat: 35.282, lon: 127.292 },
  { name: '구례', region: '전라남도', lat: 35.2024, lon: 127.4627 },
  { name: '고흥', region: '전라남도', lat: 34.6111, lon: 127.2753 },
  { name: '보성', region: '전라남도', lat: 34.7714, lon: 127.0799 },
  { name: '화순', region: '전라남도', lat: 35.0644, lon: 126.9863 },
  { name: '장흥', region: '전라남도', lat: 34.6817, lon: 126.9069 },
  { name: '강진', region: '전라남도', lat: 34.6421, lon: 126.7672 },
  { name: '영암', region: '전라남도', lat: 34.7998, lon: 126.6966 },
  { name: '무안', region: '전라남도', lat: 34.9904, lon: 126.4815 },
  { name: '함평', region: '전라남도', lat: 35.0659, lon: 126.5164 },
  { name: '영광', region: '전라남도', lat: 35.2772, lon: 126.512 },
  { name: '장성', region: '전라남도', lat: 35.3019, lon: 126.7847 },
  { name: '해남', region: '전라남도', lat: 34.5735, lon: 126.5991 },
  { name: '진도', region: '전라남도', lat: 34.4869, lon: 126.2634 },
  { name: '신안', region: '전라남도', lat: 34.8319, lon: 126.1083 },
  { name: '완도', region: '전라남도', lat: 34.3109, lon: 126.7551 },

  // ─── 경상북도 ───
  { name: '포항', region: '경상북도', lat: 36.019, lon: 129.3435 },
  { name: '경주', region: '경상북도', lat: 35.8562, lon: 129.2247 },
  { name: '안동', region: '경상북도', lat: 36.5684, lon: 128.7295 },
  { name: '구미', region: '경상북도', lat: 36.1196, lon: 128.3444 },
  { name: '김천', region: '경상북도', lat: 36.1398, lon: 128.1136 },
  { name: '영주', region: '경상북도', lat: 36.8057, lon: 128.624 },
  { name: '영천', region: '경상북도', lat: 35.9733, lon: 128.9385 },
  { name: '상주', region: '경상북도', lat: 36.4109, lon: 128.159 },
  { name: '문경', region: '경상북도', lat: 36.5868, lon: 128.1868 },
  { name: '경산', region: '경상북도', lat: 35.825, lon: 128.7415 },
  { name: '의성', region: '경상북도', lat: 36.3528, lon: 128.6972 },
  { name: '청도', region: '경상북도', lat: 35.6474, lon: 128.7341 },
  { name: '고령', region: '경상북도', lat: 35.7263, lon: 128.2636 },
  { name: '성주', region: '경상북도', lat: 35.9192, lon: 128.2831 },
  { name: '칠곡', region: '경상북도', lat: 35.9955, lon: 128.4018 },
  { name: '예천', region: '경상북도', lat: 36.6575, lon: 128.4527 },
  { name: '봉화', region: '경상북도', lat: 36.8931, lon: 128.7326 },
  { name: '영덕', region: '경상북도', lat: 36.415, lon: 129.3659 },
  { name: '울진', region: '경상북도', lat: 36.993, lon: 129.4002 },
  { name: '울릉', region: '경상북도', lat: 37.4845, lon: 130.9057 },
  { name: '청송', region: '경상북도', lat: 36.4362, lon: 129.0572 },
  { name: '영양', region: '경상북도', lat: 36.6667, lon: 129.1125 },

  // ─── 경상남도 ───
  { name: '창원', region: '경상남도', lat: 35.2281, lon: 128.6811 },
  { name: '김해', region: '경상남도', lat: 35.2285, lon: 128.8894 },
  { name: '진주', region: '경상남도', lat: 35.1799, lon: 128.1076 },
  { name: '양산', region: '경상남도', lat: 35.335, lon: 129.0374 },
  { name: '거제', region: '경상남도', lat: 34.8806, lon: 128.6211 },
  { name: '통영', region: '경상남도', lat: 34.8544, lon: 128.4332 },
  { name: '사천', region: '경상남도', lat: 35.0037, lon: 128.0642 },
  { name: '밀양', region: '경상남도', lat: 35.5037, lon: 128.7464 },
  { name: '거창', region: '경상남도', lat: 35.6868, lon: 127.9095 },
  { name: '함안', region: '경상남도', lat: 35.2726, lon: 128.4064 },
  { name: '합천', region: '경상남도', lat: 35.5667, lon: 128.1659 },
  { name: '의령', region: '경상남도', lat: 35.3222, lon: 128.2617 },
  { name: '창녕', region: '경상남도', lat: 35.541, lon: 128.4922 },
  { name: '고성(경남)', region: '경상남도', lat: 34.9731, lon: 128.3222 },
  { name: '남해', region: '경상남도', lat: 34.8375, lon: 127.8926 },
  { name: '하동', region: '경상남도', lat: 35.0673, lon: 127.7513 },
  { name: '산청', region: '경상남도', lat: 35.4156, lon: 127.8736 },
  { name: '함양', region: '경상남도', lat: 35.5206, lon: 127.7252 },

  // ─── 제주특별자치도 ───
  { name: '제주', region: '제주도', lat: 33.4996, lon: 126.5312 },
  { name: '서귀포', region: '제주도', lat: 33.2541, lon: 126.56 },
];

/** 특별시·광역시·특별자치시 단축명 (주소 첫 토큰 prefix 비교용) */
const METRO_NAMES = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종'] as const;

/**
 * 도(道) 주소 첫 토큰 prefix → KOREAN_CITIES.region 값.
 * '강원특별자치도'·'전북특별자치도'·'제주특별자치도' 등 개편 명칭도 prefix 로 흡수.
 * 비교 순서: 긴 prefix 를 먼저 둬서 '충청북' 이 '충북' 보다 우선 매칭되게 한다.
 */
const PROVINCE_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['경기', '경기도'],
  ['강원', '강원도'],
  ['충청북', '충청북도'],
  ['충북', '충청북도'],
  ['충청남', '충청남도'],
  ['충남', '충청남도'],
  ['전라북', '전라북도'],
  ['전북', '전라북도'],
  ['전라남', '전라남도'],
  ['전남', '전라남도'],
  ['경상북', '경상북도'],
  ['경북', '경상북도'],
  ['경상남', '경상남도'],
  ['경남', '경상남도'],
  ['제주', '제주도'],
];

/** 시·군 좌표 미발견 시 도(道) 대표 좌표(도청 인근) — best-effort 폴백 */
const PROVINCE_FALLBACK: Readonly<Record<string, GeoPoint>> = {
  경기도: { lat: 37.2636, lon: 127.0286, name: '수원' },
  강원도: { lat: 37.8813, lon: 127.7298, name: '춘천' },
  충청북도: { lat: 36.6424, lon: 127.489, name: '청주' },
  충청남도: { lat: 36.6012, lon: 126.6608, name: '홍성' },
  전라북도: { lat: 35.8242, lon: 127.148, name: '전주' },
  전라남도: { lat: 34.9904, lon: 126.4815, name: '무안' },
  경상북도: { lat: 36.5684, lon: 128.7295, name: '안동' },
  경상남도: { lat: 35.2281, lon: 128.6811, name: '창원' },
  제주도: { lat: 33.4996, lon: 126.5312, name: '제주' },
};

/** 표시명에서 동명 구분용 괄호 표기 제거 — '광주(경기)' → '광주' */
function cleanName(name: string): string {
  return name.replace(/\(.*\)$/, '');
}

function toPoint(entry: KoreanRegionGeo): GeoPoint {
  return { lat: entry.lat, lon: entry.lon, name: cleanName(entry.name) };
}

/** 시/군/구 접미사 제거 — '성남시'→'성남', '고성군'→'고성', '청주시'→'청주' */
function stripCitySuffix(token: string): string {
  return token.replace(/(특별자치시|특별시|광역시|시|군|구)$/, '');
}

/** 첫 토큰(시/도)으로 도(道) region 값을 해석. 도가 아니면 null. */
function resolveProvinceRegion(head: string): string | null {
  for (const [prefix, region] of PROVINCE_PREFIXES) {
    if (head.startsWith(prefix)) return region;
  }
  return null;
}

/** region 안에서 시/군 이름 매칭 — '광주(경기)' 같은 괄호 표기도 흡수 */
function findInRegion(region: string, base: string): KoreanRegionGeo | null {
  if (base.length === 0) return null;
  for (const entry of KOREAN_CITIES) {
    if (entry.region !== region) continue;
    if (entry.name === base || entry.name.startsWith(`${base}(`)) return entry;
  }
  return null;
}

function findMetro(name: string): KoreanRegionGeo | null {
  for (const entry of KOREAN_CITIES) {
    if (entry.region === '특별시·광역시' && entry.name === name) return entry;
  }
  return null;
}

/**
 * 한국 행정구역 주소(NEIS 도로명/지번)에서 시·군 중심 좌표를 추출한다.
 *
 * 규칙:
 *  1. 특별시·광역시·특별자치시(서울/부산/…/세종) → 메트로 중심 좌표.
 *  2. 도(道) → 두 번째 토큰의 시/군(예: '성남시'·'춘천군')을 좌표표에서 찾는다.
 *     같은 이름이 도별로 있는 경우(광주·고성) region 으로 구분한다.
 *  3. 시/군을 못 찾으면 도(道) 대표 좌표로 폴백(날씨는 동작, 정밀도만 낮음).
 *  4. 한국 주소로 인식 불가 → null(호출부는 자동설정을 건너뛰고 수동 선택 유지).
 *
 * @param address 학교 주소 (예: '경기도 성남시 분당구 …')
 */
export function geocodeAddress(address: string): GeoPoint | null {
  const addr = (address ?? '').trim();
  if (addr.length === 0) return null;

  const tokens = addr.split(/\s+/);
  const head = tokens[0] ?? '';

  // 1) 특별시·광역시·특별자치시
  for (const metro of METRO_NAMES) {
    if (head.startsWith(metro)) {
      const hit = findMetro(metro);
      if (hit) return toPoint(hit);
    }
  }

  // 2) 도(道) → 시/군 매칭
  const region = resolveProvinceRegion(head);
  if (region) {
    const cityToken = tokens[1] ?? '';
    const base = stripCitySuffix(cityToken);
    const hit = findInRegion(region, base);
    if (hit) return toPoint(hit);
    // 3) 도 대표 좌표 폴백
    const fallback = PROVINCE_FALLBACK[region];
    if (fallback) return fallback;
  }

  return null;
}
