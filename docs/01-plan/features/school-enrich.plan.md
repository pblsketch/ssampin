# 온보딩 학교 보강 — 날씨 자동설정 + 평가계획 학교 연결 (School Enrich)

> 상태: **pending approval** (사전 조사 세션 핸드오프, 근거 기반)
> 범위: 온보딩/설정에서 학교를 고를 때 **(A) 위도·경도로 날씨 자동설정**, **(B) 평가계획 식별자(shlIdfCd) 미리 확보·저장해 ①불러오기의 학교 재선택 제거**, (C) 개교기념일→D-Day(후순위).
> 작성: ①(evaluation-rubric-import) 구현 완료 **이후** 실제 코드를 읽고 재정의한 결과.
> 선행 문서: `docs/01-plan/features/evaluation-rubric-import.plan.md` (①)

---

## 0. 한 줄 요약 & ①과의 관계 (중요)

교사가 학교 이름을 고르는 그 순간에, 뒤에서 **(A) 좌표를 얻어 날씨를 자동 설정**하고 **(B) 학교알리미 식별자(shlIdfCd)를 같이 확보·저장**한다.

**②는 ①의 전제조건이 아니다.** ①(평가계획 불러오기)은 이미 자체 모달(`RubricImportFromPlanModal`)에서 학교를 직접 검색해 동작이 완결돼 있다. 따라서:

- ②의 `shlIdfCd` 역할은 "①을 여는 필수 열쇠"가 아니라 **"①에서 학교를 또 검색·선택하는 단계를 없애는 편의"**다.
- ②의 **진짜 신규 가치는 (A) 날씨 자동화**다(①이 전혀 안 건드린 영역).
- 학교명→shlIdfCd **검색 인프라는 ①이 이미 만들었다 → ②는 재사용**(중복 개발 0).

---

## 1. 환경

- **대상**: `E:\github\ssampin` (Electron+React+TS, Clean Architecture)
- **참조 원본(읽기)**: `E:\github\schoolinfo-mcp\src\client.ts`(`searchSchoolsByName`, `request("0")`의 `LTTUD/LGTUD/FOAS_MEMRD`), `codes.ts`
- **빌드/검증**: `npm run typecheck` · `npm test`(vitest) · `npm run electron:dev`
- **추가 의존성**: 없음(②-A·B는 기존 키/인프라 재사용). ②-C만 `SCHOOLINFO_API_KEY` 번들 필요.

---

## 2. ①이 이미 구현한 것 — 재사용/연결 대상 (★중복 생성 금지)

§ 새 세션은 아래를 **새로 만들지 말고 재사용/확장**할 것.

- `electron/ipc/schoolinfoEvaluation.ts`
  - `searchSchoolsByName(word)` 이식 완료 + IPC **`schoolinfo-evaluation:search-schools`** 등록됨.
    - 반환 `SchoolinfoSchoolHit { shlIdfCd; name; address; kind }` ← **sido/sgg(지역) 필드 없음**(매칭 설계에 영향, §8).
  - `safeFetchBytes(url,{method,body,maxBytes,timeoutMs,allowedHosts,extraHeaders})` 사용. `ALLOWED_HOSTS=['www.schoolinfo.go.kr']`.
- `electron/security/safeFetch.ts` — `safeFetchBytes` 신설 완료(POST·바이너리·host 화이트리스트). **②도 이걸 사용**.
- `electron/preload.ts` / `src/global.d.ts` — `window.electronAPI.schoolinfoEvaluation.{ searchSchools, listDocs, downloadDoc }` 노출됨.
- `src/domain/ports/IEvaluationPlanPort.ts` — `searchSchools(name): Promise<readonly EvaluationSchool[]>` 포함.
- `src/domain/entities/EvaluationPlan.ts` — `EvaluationSchool { shlIdfCd; name; address; kind }`.
- `src/infrastructure/schoolinfo/SchoolInfoEvaluationAdapter.ts` — renderer 어댑터(`searchSchools` 포함).
- `src/usecases/evaluation/ImportEvaluationPlan.ts` — `searchSchools` 위임.
- `src/adapters/components/ClassManagement/Rubric/RubricImportFromPlanModal.tsx` — **①의 불러오기 모달(학교검색 내장)**. ②-B는 이 모달이 "저장된 shlIdfCd가 있으면 학교검색 단계를 건너뛰도록" **소폭 수정**한다.
- `src/adapters/di/container.ts` — 위 포트/어댑터/유스케이스 등록됨.

### 권장 리네임 (②/③ 공용화)

- IPC `schoolinfo-evaluation:search-schools` → **`schoolinfo:search-schools`** 로 일반화(평가계획 전용이 아님). 호출부: `SchoolInfoEvaluationAdapter`, `preload.ts`, `global.d.ts`, ①모달. **함께 수정**(동작 불변 리팩터).
- 또는 리네임 비용이 부담이면 그대로 두고 ②가 같은 IPC를 호출(이름만 어색, 동작 OK). → 선결조건 §8에서 택1.

---

## 3. 확인된 근거 — 쌤핀 측

### 3.1 온보딩 (이미 NEIS로 학교검색)

- `src/adapters/components/Onboarding/Onboarding.tsx`
  - 6-step 마법사. Step1 학교검색 = `useMealStore.searchSchools`(NEIS). 결과 `SchoolSearchResult`.
  - `detectSchoolLevel(schoolType)` → `schoolLevel` 자동.
  - 선택 시 `draft.neis = { schoolCode, atptCode, schoolName }`. `NEIS_API_KEY`는 `@domain/entities/Meal`에 번들 상수.
- NEIS 검색 결과 타입 `SchoolSearchResult`(`@domain/entities/Meal`): `{ schoolName; schoolCode; atptCode; address; schoolType }`.

### 3.2 Settings (저장 대상)

- `src/domain/entities/Settings.ts`
  - `Settings.schoolName / grade? / schoolLevel('elementary'|'middle'|'high'|'custom')`
  - `NeisSettings { schoolCode; atptCode; schoolName; autoSync? }`
  - `WeatherSettings { location: WeatherLocation | null; refreshIntervalMin }`
  - `WeatherLocation { lat: number; lon: number; name: string }` ← **좌표만 채우면 날씨 동작**.
  - ⚠️ **`shlIdfCd` 저장 필드 없음** → ②-B에서 신설(아래 §6).

### 3.3 날씨 (좌표만 필요)

- `src/infrastructure/weather/index.ts`
  - `fetchWeather(lat, lon)` → WeatherAPI.com `forecast.json?q=${lat},${lon}`. `WEATHER_API_KEY` 번들. Electron 직접 호출(CORS OK).
  - **`search.json`(지오코딩)은 현재 미구현** → ②-A 경로A에서 신규 추가 필요(§8 선결).

### 3.4 D-Day (②-C 대상)

- `src/domain/entities/DDay.ts` — `DDayItem { id; title; targetDate('YYYY-MM-DD'); emoji; color; pinned; createdAt }`. `IDDayRepository`.

---

## 4. 확인된 근거 — schoolinfo 측

- `searchSchoolsByName(word, limit)` → `SchoolHit { name; shlIdfCd; schoolCode; sido; sgg; dong; kind; foundation; address }`. **인증키 불필요.** 좌표·개교기념일 **없음**.
  - (①이 이식하며 `{ shlIdfCd, name, address, kind }`로 축약 — 지역(sido/sgg) 누락. §8 참조.)
- 좌표/개교기념일: OpenAPI `request("0", {sidoCode,sggCode,schulKndCode})` `raw.LTTUD/LGTUD/FOAS_MEMRD`. **`SCHOOLINFO_API_KEY` 필요**.

---

## 5. 범위 & 좌표 경로 결정

### ②-A 날씨 자동 (핵심)

좌표 확보 — 트레이드오프:

- **경로 A (권장, 추가 키 0)**: WeatherAPI `search.json?q=<학교주소/지역>` → `[{lat,lon,name}]` → `WeatherLocation`. 기존 `WEATHER_API_KEY` 재사용. 단 쌤핀 미구현 → `weather/index.ts`에 `geocode()` 신규(§8 선결: search.json 실제 동작 확인).
- **경로 B (정확, 키 필요)**: schoolinfo OpenAPI `LTTUD/LGTUD`. `SCHOOLINFO_API_KEY` + 지역코드 필요.
  → **경로 A 우선**, 실패/정밀 필요 시 B 폴백.

### ②-B 평가계획 학교 연결 (편의)

- 온보딩/설정에서 NEIS 학교 선택 시 `schoolinfo:search-schools`(①의 IPC 재사용) 호출 → 학교명+주소 매칭 → `shlIdfCd` 확보 → Settings 저장.
- ①의 `RubricImportFromPlanModal`이 저장된 `shlIdfCd`가 있으면 **학교검색 단계 스킵**(없거나 매칭 실패면 기존 수동검색 폴백).

### ②-C 개교기념일 → D-Day (후순위)

- OpenAPI `FOAS_MEMRD` → 올해/내년 개교기념일 `DDayItem` 1건. NEIS 학사일정과 **중복 검사 후** 등록. 키 필요 + 매칭 복잡 → 마지막.

---

## 6. 레이어별 작업 (N 신규 / M 수정 / R 재사용)

- domain:
  - M `entities/Settings.ts` — `schoolInfo?: { shlIdfCd: string; matchedName: string }` 신설(②-B 저장). ①이 읽는다.
  - N `services/schoolMatch.ts` (순수) — NEIS `SchoolSearchResult` ↔ schoolinfo `SchoolinfoSchoolHit` **학교명+주소** 매칭(지역코드 없음, §8). 동명이교는 주소로 구분, 모호 시 후보 반환.
- usecases:
  - N `usecases/school/EnrichSchoolOnSelect.ts` — 선택된 NEIS 학교 → (A)좌표 조회 + (B)shlIdfCd 매칭. best-effort(실패해도 진행).
- infrastructure:
  - M `infrastructure/weather/index.ts` — `geocode(query): Promise<{lat;lon;name} | null>` (`search.json`) 추가.
  - R `electron/ipc/schoolinfoEvaluation.ts`의 검색 IPC 재사용(또는 §2 리네임).
- adapters:
  - M `Onboarding.tsx` — 학교 선택 핸들러에 `EnrichSchoolOnSelect` 호출 → `draft.weather.location` + `draft.schoolInfo` 채움.
  - M 설정의 학교 변경 지점(NEIS 학교 재선택 UI) — 동일 보강.
  - M `RubricImportFromPlanModal.tsx` — `settings.schoolInfo?.shlIdfCd` 있으면 학교검색 스킵, 바로 연도/목록 단계로.
  - M `di/container.ts` — 신규 usecase 등록.
- electron(②-C만): M `ipc/schoolinfoEvaluation.ts` 또는 N `ipc/schoolinfo.ts` — `getSchoolBasic(...)`(OpenAPI `request("0")` → 좌표/개교기념일). ②-A 경로B/②-C에서만.

---

## 7. 핵심 인터페이스 초안

```typescript
// domain/entities/Settings.ts (추가)
export interface SchoolInfoLink {
  readonly shlIdfCd: string;
  readonly matchedName: string; // 매칭된 schoolinfo 학교명(확인용)
}
// Settings 에 추가: readonly schoolInfo?: SchoolInfoLink;

// domain/services/schoolMatch.ts (순수)
export interface SchoolMatchInput {
  neisName: string;
  neisAddress: string;
}
export interface SchoolMatchResult {
  readonly best: { shlIdfCd: string; name: string; address: string } | null;
  readonly ambiguous: readonly { shlIdfCd: string; name: string; address: string }[]; // 후보(모호 시)
}
export function matchSchool(
  input: SchoolMatchInput,
  hits: readonly { shlIdfCd: string; name: string; address: string }[],
): SchoolMatchResult;

// infrastructure/weather/index.ts (추가)
export async function geocode(
  query: string,
): Promise<{ lat: number; lon: number; name: string } | null>;
```

---

## 8. 선결조건 / 미검증 가정 (구현 0순위로 확인)

- **A.** WeatherAPI `search.json` 실제 동작 확인(키 동일, 응답 `[{lat,lon,name,region}]`). 미동작 시 경로 B(schoolinfo OpenAPI 좌표) 전환.
- **B.** **검색 IPC 리네임 여부 결정**: `schoolinfo-evaluation:search-schools` → `schoolinfo:search-schools` 일반화 시 호출부(`SchoolInfoEvaluationAdapter`/`preload.ts`/`global.d.ts`/①모달) **동시 수정**(동작 불변). 부담되면 현 이름 그대로 재사용.
- **C.** **매칭 키**: ①이 이식한 `SchoolinfoSchoolHit`엔 **지역(sido/sgg)이 없다**. 동명이교 정확도를 높이려면 `schoolinfoEvaluation.ts`의 `searchSchoolsByName` 반환에 `sido/sgg` 추가(원본 `client.ts`엔 있음). 우선은 **학교명+주소**로 매칭, 정확도 부족 시 지역 필드 보강.
- **D.** ② 매칭/좌표는 **best-effort** — 실패해도 온보딩 완료·NEIS 기능·① 수동검색은 정상.

---

## 9. 실행 순서 (Phase)

0. **선결**: §8-A(search.json), §8-B(리네임 결정).
1. **P1 — ②-A 날씨(핵심)**: `geocode()` + `EnrichSchoolOnSelect`(좌표) + `Onboarding`/설정에서 `WeatherLocation` 자동 채움. 검증: 학교 선택 → 날씨 위젯 동작.
2. **P2 — ②-B 학교 연결(편의)**: `Settings.schoolInfo` 필드 + `schoolMatch`(순수, 테스트) + 검색 IPC 재사용 + `RubricImportFromPlanModal` 스킵 로직.
3. **P3 — ②-C 개교기념일(후순위)**: OpenAPI 좌표/`FOAS_MEMRD` → DDay. 중복 검사.

---

## 10. 수용 기준 (테스트 가능)

- AC1: 온보딩에서 학교 선택 시 `WeatherLocation{lat,lon,name}`이 자동 채워지고 대시보드 날씨가 동작.
- AC2: NEIS↔schoolinfo 매칭 성공 시 `Settings.schoolInfo.shlIdfCd` 저장 → ①불러오기 모달이 학교검색을 건너뛴다.
- AC3: 매칭 실패/모호 시 온보딩·NEIS 정상, ①모달은 기존 수동검색으로 폴백(차단 없음).
- AC4: `schoolMatch` 순수함수가 동명이교를 주소로 가른다(픽스처: 같은 이름 2곳).
- AC5: (②-C) 개교기념일 DDay 1건, NEIS 학사일정 중복 시 미등록.

---

## 11. 검증 / 테스트

- 단위: `schoolMatch.test.ts`(고정 입력 스냅샷), `geocode` 목 응답 계약.
- 통합: `electronAPI` 목으로 검색 IPC 재사용 확인.
- 회귀: ①기능(평가계획 불러오기) 무손상 — IPC 리네임 시 ①모달 동작 회귀 테스트. `npm run typecheck && npm test` green.

---

## 12. 리스크 / 한계 (정직하게)

- **매칭 모호성**: 동명이교 → 주소로 구분, 실패 시 후보 선택 UI. 자동 보강 강요 금지.
- **좌표 정밀도**: 경로 A는 동네 중심 수준 — 날씨엔 충분.
- **search.json 미검증**: 동작 안 하면 경로 B(키 필요)로.
- **IPC 리네임 영향범위**: ①호출부 동시 수정 필요(회귀 주의) — 부담 시 현 이름 유지.
- **개교기념일 중복/형식**: NEIS 학사일정과 겹침 + `FOAS_MEMRD` 포맷 다양 → 후순위.

---

## 13. 절대 하지 말 것 (Scope Guard)

- ❌ 학교명→shlIdfCd 검색 함수/IPC를 **새로 만들기** (①것 재사용).
- ❌ ②를 ①의 전제조건으로 만들기 — ②-B는 어디까지나 **편의**, ①의 수동검색 폴백 유지.
- ❌ 렌더러에서 학교알리미 직접 호출 / `webSecurity` 끄기 (①의 main+safeFetch 경유 유지).
- ❌ 매칭 실패 시 온보딩/NEIS 기능 차단.
- ❌ 좌표·개교기념일을 위해 불필요하게 `SCHOOLINFO_API_KEY` 강제(②-A·B는 키 0 우선).

---

## 14. 참고

- ①: `docs/01-plan/features/evaluation-rubric-import.plan.md`
- 이식 원본: `E:\github\schoolinfo-mcp` (`client.ts` `searchSchoolsByName`/`request`, MIT)
- 데이터 출처: 학교알리미 공공누리 제1유형, WeatherAPI.com(기존 키)
- 후속: ③ 학생수·학급규모 → 좌석 기본값(OpenAPI 키 필요 영역 — ②-C 인프라 공유).
