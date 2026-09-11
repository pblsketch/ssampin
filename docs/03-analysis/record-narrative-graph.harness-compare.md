# 하네스 두 빌드 비교 (2026-09-11) — P0 정렬만 vs 장면 배열 적용

> ADR-103 계획서 §9-3 의 마지막 검증. 같은 **가상 묶음**(지어낸 근거, 실제 학생 자료 아님) 10개를 「P0 정렬만(기존형 요청서)」과
> 「장면 배열 적용」으로 각각 실제 모델(Claude 구독 CLI, 규정 판본 3)에 보냈다. 20건 전부 성공.
> 장면은 날짜순 기계 배치 — 동기=첫 근거 · 과정=가운데 · 결과=마지막 · 평가=빈 자리. 재현: `npx tsx scripts/record-style-qa.mts --scenes`.
> **관문이 아니라 비교 기록이다**(오너 결정으로 P3 착수 관문을 이것으로 대체했다).

| 묶음 | 빌드      | 문단 차례                        | 문단 | 글자 | 근거에 없는 수 |
| ---- | --------- | -------------------------------- | ---: | ---: | -------------- |
| B1   | P0 정렬만 | evaluation→motive→process→result |    4 |  500 | 없음           |
| B1   | 장면 배열 | evaluation→motive→process→result |    4 |  589 | 없음           |
| B2   | P0 정렬만 | evaluation→motive→process→result |    4 |  519 | 없음           |
| B2   | 장면 배열 | evaluation→motive→process→result |    4 |  420 | 없음           |
| B3   | P0 정렬만 | evaluation→motive→process→result |    4 |  449 | 없음           |
| B3   | 장면 배열 | evaluation→motive→result         |    3 |  351 | 없음           |
| B4   | P0 정렬만 | evaluation→motive→process→result |    4 |  555 | 없음           |
| B4   | 장면 배열 | evaluation→motive→process→result |    4 |  482 | 없음           |
| B5a  | P0 정렬만 | evaluation→motive→process→result |    4 |  354 | 없음           |
| B5a  | 장면 배열 | evaluation→motive→result         |    3 |  203 | 없음           |
| B5b  | P0 정렬만 | evaluation→motive→process→result |    4 |  385 | 없음           |
| B5b  | 장면 배열 | evaluation→motive→process→result |    4 |  282 | 없음           |
| B6a  | P0 정렬만 | evaluation→motive→process→result |    4 |  402 | 없음           |
| B6a  | 장면 배열 | evaluation→motive→process→result |    4 |  490 | 없음           |
| B6b  | P0 정렬만 | evaluation→?→?                   |    3 |  276 | 없음           |
| B6b  | 장면 배열 | evaluation→motive                |    2 |   62 | 없음           |
| B7   | P0 정렬만 | evaluation→motive→process→result |    4 |  419 | 없음           |
| B7   | 장면 배열 | evaluation→motive→process→result |    4 |  320 | 없음           |
| B8   | P0 정렬만 | evaluation→motive→process→result |    4 |  368 | 없음           |
| B8   | 장면 배열 | evaluation→motive→result         |    3 |  265 | 없음           |

## 요약

- 짝 10쌍. 문단 차례가 **같은 쌍 6**, 다른 쌍 4.
- 평균 글자: P0 423 · 장면 346 (차이 -77).
- 근거에 없는 수가 나온 답: 없음

## 읽는 법

- **문단 차례가 다른 4쌍(B3·B5a·B6b·B8)은 전부 「과정 자리에 근거가 하나도 없는」 묶음이다.** 모델이 빈 자리를 건너뛴 것이고,
  계획서 §11 이 "문단 수 = 장면 수를 보장하지 않는다"고 못 박은 그 동작이다. **차례가 어긋난 사례는 0건.**
- **근거에 없는 수 0건** — 양쪽 20개 답 전부. 장면 지시가 붙었다고 지어내기가 늘지 않았다.
- **장면 쪽이 평균 18% 짧다**(346자 vs 423자). 빈 자리를 억지로 채우지 않기 때문. 자리를 다 채우려면 근거를 더 놓아야 하고,
  화면이 빠진 자리를 이름으로 되짚어 준다(`sceneRoundTrip`).
- **얇은 근거(B6b)에서는 장면 쪽이 더 깨끗했다.** P0 는 평가 문단 뒤에 "근거가 한 줄뿐이라 나머지는 쓰지 못했습니다"라는
  표식 없는 사과 문단을 덧붙였고(앱이 `dropUnmarkedParagraphs` 로 버리기는 한다), 장면 쪽은 표식 붙은 2문단만 냈다.
