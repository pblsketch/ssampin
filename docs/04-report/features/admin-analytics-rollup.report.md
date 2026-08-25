# 관리자 대시보드(/admin/analytics) 개선 — 속도 + 지표 확장

작성일: 2026-08-25 · 대상: `landing/src/app/admin/analytics`, `supabase/migrations/061_analytics_rollups.sql`

---

## 1. 왜 느렸나 (측정으로 확인한 원인)

한 번 열 때 **18개 조회를 동시에** 던졌고, 그 조회들이 쓰는 집계 뷰가 **날짜와 무관하게 매번
`app_analytics` 전체를 처음부터 다시 계산**했다.

| 문제           | 위치               | 내용                                                                                                                                                              |
| -------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 전체 재계산    | `017`, `018` 뷰    | `analytics_daily_active` / `analytics_retention` / `analytics_total_users` 등이 기간 조건 없이 전량 집계. "최근 14일"을 골라도 **계산은 전체를 하고 나서 잘라냄** |
| 색인 미사용    | `038` RPC          | `(created_at AT TIME ZONE 'Asia/Seoul')::date >= p_from` — 컬럼에 함수를 씌운 비교라 `idx_analytics_created` 를 못 탐 → 매번 전수 검사                            |
| 캐시 없음      | `_lib/supabase.ts` | 모든 요청이 `cache: 'no-store'`. 새로고침마다 18개 전부 재계산                                                                                                    |
| 전송량         | `_lib/data.ts`     | 챗봇 대화 원문을 **본문째 1,000건** 브라우저까지 전송                                                                                                             |
| 첫 화면 지연   | `page.tsx`         | 18개가 **다 끝나야** 첫 글자가 나옴. 가장 느린 하나가 전체 대기시간을 결정                                                                                        |
| 순차 추가 왕복 | `data.ts`          | 스크린샷 서명 URL 발급이 `Promise.all` **이후에** 별도로 한 번 더                                                                                                 |

## 2. 무엇을 바꿨나

### DB — `061_analytics_rollups.sql`

- **롤업 9종**(materialized view)으로 하루 단위 사전 집계:
  `device_day` · `event_day` · `prop_day` · `device_prop` · `device_event` · `hour_day` ·
  `device_profile` · `error_day` · `session_day`
- **pg_cron 30분 주기**로 `analytics_refresh_rollups()` 동시 갱신(`CONCURRENTLY` — 갱신 중에도
  조회가 막히지 않는다). 갱신 시각은 `analytics_rollup_meta` 에 남고 화면 상단에 표시된다.
- **RPC 16종**을 롤업 위에서 재정의(`analytics_*_v2`).
- 원본을 봐야 하는 3개(`prop_ranking` / `error_summary` / `event_breakdown` 의 사용자 수)는
  **범위 비교**(`created_at >= kst_day_start(...)`)로 바꿔 기존 색인을 타게 했다.
  → 일별 롤업으로는 "기간 내 서로 다른 사람 수"를 정확히 합칠 수 없어서, 정확도를 택했다.
- 권한: 롤업·RPC 모두 `anon`/`authenticated`/`PUBLIC` **명시적 회수**, `service_role` 에만 부여.
  (materialized view 는 RLS 가 걸리지 않으므로 회수가 필수다.)

### 화면

- **탭 7개**로 분리 — 지금 보는 탭의 자료만 불러온다. 탭·기간은 주소(`?tab=`, `?days=`)에 남는다.
- **Suspense 스트리밍** — 제목·기간 선택·탭을 먼저 내보내고 집계는 나중에 흘려보낸다.
- **5분 데이터 캐시**(`DEFAULT_REVALIDATE_SECONDS`). 롤업이 30분 주기라 화면이 뒤처지지 않는다.
  이벤트 로그 탭만 캐시 없음(실시간).
- 챗봇 대화 원문 1,000건 → **300건**.
- 상단에 **"집계 기준: …(N분 전)"** 표시. 50분 넘게 갱신이 안 되면 노랗게 경고.

## 3. 새로 볼 수 있게 된 것

앱은 이미 **54종의 행동**을 기록하고 있었는데 대시보드는 그중 일부만 쓰고 있었다.

| 탭          | 지표                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 개요        | 기간 활성/신규/재방문 분리, 하루 평균, **습관화 정도(WAU÷MAU)**, 세션 길이(중앙값·상위 10%), 이벤트 구성                                    |
| 정착·이탈   | **온보딩 퍼널 8단계**(어디서 가장 많이 빠지는지 강조), **주간 코호트 히트맵**, 사용 강도 등급, **이탈 신호**(정착했다 떠난 분 별도 집계)    |
| 기능 사용   | 도구·화면 순위, **채택률·재사용률·습관화율**, "숨은 효자"(좁게 알려졌는데 붙잡는 기능), "손이 안 닿는 기능", 기능 발견 경로, 내보내기, 공유 |
| 현장 리듬   | **요일×시간대 히트맵**, 학교 일과 구간(조회·수업·점심·종례·퇴근 후), 주중/주말, 실행 모드, 학교급·지역                                      |
| 문제·마찰   | **오류를 겪은 분 비율** 추이, 오류 top(겪은 분 기준), **버전 잔류**, 챗봇 미해결                                                            |
| 챗봇        | 기존 분석 + 대화 원문                                                                                                                       |
| 이벤트 로그 | 실시간 최근 100건                                                                                                                           |

## 4. 검증

로컬 PostgreSQL 16 컨테이너 + PostgREST + Next dev 로 끝까지 돌려 확인했다.

- 마이그레이션 적용: 통과. 재적용(멱등) 확인.
- RPC 16종 전부 `service_role` 200, `anon` 401 (Supabase 기본 권한을 재현한 뒤에도 차단됨).
- 반환 필드명·타입이 화면 TS 타입과 1:1 일치 확인(`row_to_json` 대조).
- 세션 길이는 기존 `018` 뷰와 **같은 값** 산출(parity 확인).
- 탭 7개 전부 실제 데이터로 렌더 200.
- **성능(로컬 100만 행)**: 기존 뷰 8종 합계 **932ms** → 새 RPC 5종 합계 **14.6ms**.

**운영 실측 (2026-08-25 적용 후, 777,248행 / 기기 2,401대 / 299MB, 왕복 지연 ~0.28초 포함)**

| 조회                                                                     | 개선 전 | 개선 후   |
| ------------------------------------------------------------------------ | ------- | --------- |
| `analytics_weekly_summary` → `analytics_weekly_v2`                       | 9.14s   | 0.62s     |
| `analytics_daily_active` → `analytics_daily_v2`                          | 8.02s   | 0.45s     |
| `analytics_total_users` → `analytics_overview_v2`                        | 9.47s   | **0.39s** |
| `analytics_session_duration` → `analytics_session_v2`                    | 9.38s   | 0.38s     |
| `analytics_retention` → `analytics_cohort_weekly_v2`                     | 8.80s   | 0.85s     |
| `analytics_version_distribution_range` → `analytics_version_adoption_v2` | 6.97s   | 0.52s     |
| `analytics_tool_ranking` → `analytics_prop_ranking_v2`                   | 3.93s   | 0.63s     |

예전 페이지는 이런 조회를 **18개 동시에** 던졌으므로 서로 경합해 체감은 더 나빴다.

1차 적용 후 세 함수가 1초를 넘어 추가로 손봤다(같은 집계를 여러 번 다시 돌던 문제 —
CTE 를 `MATERIALIZED` 로 고정, 상관 서브쿼리 제거, 퍼널 8단계를 기기별 플래그 1회로):

| 함수                             | 1차   | 최종      |
| -------------------------------- | ----- | --------- |
| `analytics_overview_v2`          | 2.50s | **0.39s** |
| `analytics_onboarding_funnel_v2` | 2.17s | **0.37s** |
| `analytics_event_breakdown_v2`   | 3.10s | **0.48s** |

최적화 전후 결과값이 같은지는 같은 DB에서 옛 정의와 나란히 돌려 확인했다(퍼널 8/8 단계 일치,
`avg_dau` 일치).

### 갱신 비용과 주기

롤업 갱신은 운영에서 **약 55초** 걸린다(로컬 100만 행에서는 9초였다). 롤업별 실측:

| 롤업             | 소요  |
| ---------------- | ----- |
| `hour_day`       | 15.4s |
| `device_day`     | 10.2s |
| `device_profile` | 10.2s |
| `device_prop`    | 7.3s  |
| `event_day`      | 5.7s  |
| `prop_day`       | 3.6s  |
| `device_event`   | 1.5s  |
| `session_day`    | 0.6s  |
| `error_day`      | 0.04s |

전부 `app_analytics` 전체를 훑기 때문이다. 앱과 같은 DB 를 쓰므로 **주기를 30분**으로 잡아
부하 비중을 ~3% 로 뒀다(15분이면 ~6%). 요청 경로와 무관한 백그라운드 작업이고
`CONCURRENTLY` 라 갱신 중에도 조회가 막히지 않는다.

더 신선하게 보고 싶다면, 자주 바뀌는 것(`device_day`·`event_day`·`session_day`·`error_day`,
합쳐 약 17초)만 짧은 주기로 떼어내는 방법이 있다. 대신 화면의 "집계 기준" 표시가 둘로 갈린다.
근본적으로 줄이려면 롤업을 증분 갱신(과거 날짜는 다시 계산하지 않음)으로 바꿔야 하는데,
materialized view 가 아니라 일반 테이블 + upsert 구조가 필요하다.

게이트: 루트 `tsc` 0 에러 · `lint` 0 에러 · `test` 612파일/8,052건 통과 · `regression-check` 51/51 ·
landing `build` 성공 · `docs:check` 통과.

## 5. 적용 기록

**2026-08-25 운영 적용 완료.**

- `061_analytics_rollups.sql` 를 Management API 로 적용(35초). 롤업 9종 구축·RPC 16종 등록 확인.
- `analytics_refresh_rollups()` 수동 1회 실행 → `analytics_rollup_meta.refreshed_at` 기록됨.
- pg_cron `analytics_refresh_rollups` 30분 주기 등록. 자동 실행 확인(19:30 → 19:45 정각, 오류 없음).
- 마이그레이션 이력에 061 을 applied 로 기록(`supabase migration repair`).

> **`db push` 를 쓰지 않은 이유** — 원격에는 **060 도 미적용** 상태다. 060(상담·설문 익명 접근
> 차단 마무리)은 "다음 릴리즈 확산 후"로 의도적으로 미뤄둔 것이라, `db push` 로 같이 올라가면
> 옛 버전 앱을 쓰는 선생님의 예약이 깨진다. 그래서 061 만 골라 적용했다.

배포 순서를 바꿔도 화면은 죽지 않는다 — RPC 가 없으면(404) 해당 섹션만 "데이터 없음"으로 비고,
상단에 "migration 061 적용 여부를 확인하세요"가 뜬다.

### pg_cron 이 꺼져 있는 환경이라면

마이그레이션이 `NOTICE` 만 남기고 통과한다. 이 경우 외부 스케줄러(GitHub Actions 등)로
30분마다 `SELECT analytics_refresh_rollups();` 를 호출하면 된다.

## 6. 알아둘 점 / 한계

- **수치는 최대 30분 지연**된다(롤업 주기). 상단 "집계 기준" 표시로 언제 기준인지 항상 보인다.
  이벤트 로그 탭만 실시간.
- **커스텀 종료일(`to`)의 챗봇 대화 조회**는 원본 타임스탬프 `lte` 라 그 날 자정 이후가 빠지는
  일(日) 단위 한계가 그대로 남아 있다(기존과 동일).
- **학교 이름은 롤업에 담지 않는다.** 집계로 의미가 나오는 학교급·지역만 저장한다.
- 대체된 옛 컴포넌트 9개는 삭제했다(git 이력에 남아 있다).
