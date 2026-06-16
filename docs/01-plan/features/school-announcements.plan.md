# 학교 알리미 — 사이드바 독립 페이지 (School Announcements)

> 상태: **검증 완료, 구현 대기** (2026-06-17)
> 범위: 학교알리미 공시(OpenAPI) + NEIS 학사일정 + 평가계획을 묶은 **사이드바 최상위 페이지**(쌤도구와 동급) 신설.
> 선행: `school-enrich.plan.md`(②), `evaluation-rubric-import`(①, 평가계획 hwp 이식 완료).
> 이식 원본(MIT): `E:\github\schoolinfo-mcp` (`src/client.ts`, `src/codes.ts`, `src/regions.json`, `src/labels.json`).

---

## 0. 한 줄 요약

교사가 사이드바에서 '학교 알리미'를 열면, **우리 학교 공시 현황·동아리/방과후/상담·옆 학교 비교·학사일정·평가계획**을 탭으로 한 화면에서 본다.

---

## 1. 사용자 결정 (확정)

- 위젯 카드가 아니라 **사이드바 독립 페이지**(쌤도구 동급). 작은 카드의 정보량 한계를 페이지+탭으로 해소. (2026-06-17 사용자 확정)
- 항목 **전부** 구현: 학교현황 / 동아리·방과후·상담 / 옆학교비교 / 학사일정 / 평가계획. 급식은 제외(이미 급식 위젯 존재).

## 2. 검증 완료된 사실 (2026-06-17, 실제 호출)

- **엔드포인트**: `GET https://www.schoolinfo.go.kr/openApi.do` (JSON, UTF-8).
- **필수 파라미터**: `apiKey`, `apiType`, `schulKndCode`, `sidoCode`, `sggCode`, **`pbanYr`(공시연도)**.
  - 신규 발급 키(2026-01-01 이후)는 **시·군·구 코드 필수** — 원본 `request()`가 이미 충족.
  - `pbanYr` 누락 시 `resultCode=fail, "pbanYr은 필수 정보입니다."`. → 항상 연도 주입.
- **응답**: `{ resultCode:"success", resultMsg:"성공", list:[...] }`. list는 **해당 시·군·구 학교 전체 행**. 우리 학교는 `SCHUL_CODE`로 필터.
- 2025·2026 공시 모두 조회됨(개포중 S010000699 확인).
- **인증키**: `SCHOOLINFO_API_KEY` (값은 빌드 env·1Password 등 별도 보관. 이 문서/코드/깃에 평문 금지).

## 3. apiType 코드 (codes.ts `API_TYPES`)

| apiType | 항목 | 탭 |
|---|---|---|
| `09` | 학년별·학급별 학생수 | 학교현황 |
| `62` | 학교 현황 | 학교현황 |
| `22`/`24`/`64`/`68` | 교원·직원 현황 | 학교현황 |
| `34` | 급식 실시 현황(통계) | 학교현황(통계만, 식단은 기존 급식위젯) |
| `56` | 동아리 활동 현황 | 동아리·방과후·상담 |
| `59` | 방과후학교 운영 | 동아리·방과후·상담 |
| `61` | 학생·학부모 상담 | 동아리·방과후·상담 |
| `94` | 학교폭력 예방교육 실적 | 동아리·방과후·상담 |
| (지역 전체 list) | 같은 시·군·구 동일 항목 | 옆학교비교 |

- 응답 컬럼은 `COL_S1`,`COL_C3` 같은 **코드** → `labels.json`(컬럼ID→한글)을 **반드시 함께 이식**해야 사람이 읽는 표가 된다.

## 4. 데이터 출처 × 인증키 (최종)

| 탭 | 출처 | 키 | 쌤핀 현황 |
|---|---|---|---|
| 학교현황 | schoolinfo OpenAPI | SCHOOLINFO_API_KEY | 신규 |
| 동아리·방과후·상담 | schoolinfo OpenAPI | SCHOOLINFO_API_KEY | 신규 |
| 옆학교 비교 | schoolinfo OpenAPI(지역 list 재사용) | SCHOOLINFO_API_KEY | 신규(호출 추가비용 0) |
| 학사일정 | NEIS 개방포털 | NEIS(보유) | **인프라 재사용** (`NeisApiClient.getSchoolSchedule`) |
| 평가계획 | hwp 첨부 스크래핑 | 불필요 | **기존 IPC 재사용** (`schoolinfoEvaluation`) |

## 5. 학교 식별 (핵심 난제)

쌤핀은 NEIS `schoolCode`(SD_SCHUL_CODE, 7자리)·`schoolName`·`address`를 갖고 있으나, OpenAPI 공시는 `sidoCode`+`sggCode`+`schulKndCode`+학교알리미 `SCHUL_CODE`(S010… 형식)로 필터한다. 둘은 체계가 다름.

- **1순위**: `Settings.neis.address`("서울특별시 강남구 …") → `resolveSido`/`resolveSggList`로 코드 변환. `Settings.schoolLevel`(middle/high/elementary) → `schulKndCode`(03/04/02). → 지역 list 받고 `SCHUL_NM === schoolName`으로 우리 학교 행 필터.
- **보강**: `school-enrich`의 `shlIdfCd`/`SchoolInfoLink`가 있으면 학교명 매칭 신뢰도 보조.
- **best-effort**: address 파싱/매칭 실패 시 페이지 상단에서 **수동 지역·학교 선택** 폴백(차단 없음).

## 6. 레이어별 작업 (Clean Architecture)

- **electron**:
  - N `ipc/schoolinfoDisclosure.ts` — `safeFetch`로 `openApi.do` 호출(호스트 `www.schoolinfo.go.kr` 이미 화이트리스트). apiType별 조회 + 지역 list 캐시(메인 LRU+TTL). renderer엔 정리된 JSON만.
  - M `preload.ts` / `src/global.d.ts` — `window.electronAPI.schoolinfoDisclosure.{ getDisclosure, getAreaDisclosure }` 노출.
- **domain**(외부 import 금지):
  - N `entities/SchoolDisclosure.ts` — 공시 항목·행 타입.
  - N `services/disclosureLabels.ts` — `labels.json` 매핑(컬럼ID→한글), 순수.
  - N `services/schoolCompare.ts` — 지역 list → 비교표(학급당 인원·동아리수 등), 순수. (get_school_report 로직 참조)
  - N `ports/ISchoolDisclosurePort.ts`.
- **infrastructure**:
  - N `schoolinfo/SchoolDisclosureAdapter.ts` — IPC 위임(평가계획 어댑터와 동형).
- **usecases**:
  - N `schoolinfo/GetSchoolOverview.ts`, `GetSchoolActivities.ts`, `CompareNeighborSchools.ts`.
- **adapters**:
  - N `components/SchoolAnnouncements/SchoolAnnouncementsPage.tsx` + 5탭 컴포넌트.
  - M `Layout/Sidebar.tsx` — `PageId`에 `'school-announcements'` 추가 + `NAV_ITEMS` 항목(아이콘 🏫).
  - M `App.tsx` — import + `renderPage()` 분기.
  - M `di/container.ts` — 신규 포트/어댑터/유스케이스 등록.
- **이식**: `codes.ts`(API_TYPES/REGIONS/SCHOOL_KIND/resolveSido/resolveSggList) + `regions.json` + `labels.json` → domain 또는 infrastructure(순수 데이터는 domain 가능). `client.ts`의 OpenAPI 호출부는 electron(main)로.

## 7. 오프라인 / 캐시

- 공시는 **연 1회** 갱신 → 캐시 친화적. 마지막 성공 응답을 로컬 저장(JSON), 네트워크 실패 시 **캐시값 + "오프라인·마지막 조회 N일 전" 배지**.
- NEIS/평가계획 기존 graceful 패턴(실패 시 빈 결과+안내) 일치.

## 8. 키 보안 (출시 게이트)

- 개발: 노출된 현재 키 사용.
- 출시: **새 키 재발급** → 빌드 env 주입. `vite.config.ts` production 모드에서 키 누락 시 throw + `grep` 산출물 검증(= v2.0.9 빌드 가드 SOP 재사용).
- 대안 검토: 사용자별 설정 입력(한도 분산·안전) vs 번들(편의, NEIS와 일관). **기본 번들 + 가드**, 한도 초과 빈발 시 입력 전환.

## 9. Phase

1. **뼈대** — 사이드바 항목 + `renderPage` 분기 + 빈 5탭 페이지. (키 불필요, 즉시 가능)
2. **학사일정 탭** — `NeisApiClient.getSchoolSchedule` 재사용. (키 불필요)
3. **평가계획 탭** — 기존 `RubricImportFromPlanModal`/IPC 연결. (중복 개발 0)
4. **OpenAPI 이식 + 학교현황·동아리/방과후/상담 탭** — `schoolinfoDisclosure` IPC + labels + 학교 식별.
5. **옆학교 비교 탭** — 지역 list 재사용 + `schoolCompare`.
6. **캐시·오프라인·빌드 가드** + 출시 키 재발급.

## 10. 수용 기준

- AC1: 사이드바에 '학교 알리미' 항목, 클릭 시 5탭 페이지 렌더.
- AC2: 우리 학교(Settings 기준) 학생수·학급·교원 현황 표 표시(라벨 한글).
- AC3: 동아리·방과후·상담·학폭예방 실적 표시.
- AC4: 같은 시·군·구 동일 학교급 비교표(우리 학교 하이라이트).
- AC5: 학사일정·평가계획 탭이 기존 기능과 동일 결과.
- AC6: 네트워크 차단 시 캐시값+오프라인 배지(앱 정상).
- AC7: address 매칭 실패 시 수동 지역·학교 선택 폴백.

## 11. 검증 / 리스크

- 검증 게이트: `npx tsc --noEmit` / `npm run lint` / `npm run test` / `npm run regression-check`.
- 단위: `disclosureLabels`·`schoolCompare`·`resolveSido/resolveSggList` 순수함수 픽스처. IPC 목.
- 리스크: ① 학교 식별 매칭 모호(동명이교) → 수동 폴백. ② OpenAPI 일일 호출 한도 미확인 → 캐시·연도 1회 조회로 절감, 한도 확인 후 번들/입력 결정. ③ labels.json 누락 항목 → raw 컬럼ID 폴백 표시.

## 12. 절대 하지 말 것

- ❌ fly.dev MCP 서버를 런타임에 호출(오프라인 원칙 위배) — OpenAPI 직접 호출만.
- ❌ renderer에서 openApi.do 직접 호출 — main + safeFetch 경유.
- ❌ 인증키를 코드/깃/이 문서에 평문 기록.
- ❌ 매칭 실패 시 페이지 차단 — 항상 수동 폴백.
- ❌ 급식 식단 중복 구현(기존 급식 위젯 유지).
