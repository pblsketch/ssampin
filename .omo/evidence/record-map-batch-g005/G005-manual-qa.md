# G005 실제 수동 QA

- 실행일: 2026-09-13
- 결과: 조건부 PASS. 실제 Electron에서 기존 구성 유지 정책의 1명 제안, 적용·되돌리기, 반 전체 중단·복원·이어 하기, 반응형·테마를 확인했다.
- 범위: 합성 수업반 3-8 10명, 격리 데이터 `E:/github/ssampin/.qa-data-record-map`. 실제 사용자 자료와 운영 데이터는 사용하지 않았다.
- 실행 환경: Electron CDP 9334, Codex CLI 0.153.4, `codex login status` = `Logged in using ChatGPT`.
- 미검증: 고정 뼈대 정책의 수정 후 실제 UI 완주, AI의 주제별 뼈대 선택, 담임 실제 화면.

## 실제 화면과 저장 결과

| ID  | 확인한 흐름                                                                         | 결과                                                                                                                                                                                                              | 증거     |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| S1  | 수업 관리 → 생기부 초안 → 근거 정리 → `AI로 정리 제안 ▾` → `여러 학생의 지도 제안…` | PASS. 실제 Electron에서 패널 진입                                                                                                                                                                                 | A1       |
| S2  | 현재 학생·1명씩·기존 구성 유지 → 실제 Codex 제안                                    | PASS. 세 번째 요청에서 4개 주제, 자리 미정 2건 생성                                                                                                                                                               | A2,A6    |
| S3  | 제안 생성 전후 원본 지도 비교                                                       | PASS. `record-evidence`와 `inquiry-threads` 해시가 제안 뒤에도 각각 `7D4BE9F9D0C18F540A765DAFC11985F86AB88760685E6461FCAA3EFFA3200A84`, `76951EBD8462309577BA3F63EF3DEB21392D0378125B117671901DCFE37AE7F1`로 동일 | A2,A6    |
| S4  | 학생 제안 확인 → 검토 완료 → 이 학생 지도에 적용                                    | PASS. 두 지도 파일 해시가 바뀌고 적용 기록 phase가 `committed`                                                                                                                                                    | A6       |
| S5  | 적용 후 되돌리기                                                                    | PASS. 적용 기록 phase가 `rolled-back`, 제안 review가 `unreviewed`로 변경                                                                                                                                          | A6       |
| S6  | 반 전체 10명·N=3 시작 → 3초 후 중단                                                 | PASS. 실행 중 own AI가 `started`에서 `cancelled`로 끝났고 10개 항목이 모두 `cancelled`                                                                                                                            | A6       |
| S7  | 패널 재진입 → 남은 작업 복원 → 이어 하기 → 다시 중단                                | PASS. `10명 남음`과 [이어 하기]가 복원됐고, 실제 재시작 뒤 다시 `cancelled`                                                                                                                                       | A3,A6    |
| S8  | 1279×801 라이트·다크, 1439×901 다크                                                 | PASS. 패널 표시와 내부 스크롤 확인                                                                                                                                                                                | A3,A4,A5 |
| S9  | 브라우저 모드에서 같은 흐름 진입                                                    | PASS(제한 범위). 10명 표시와 직접 근거 저장 확인. `electronAPI`가 없어 AI 실행은 대상 밖                                                                                                                          | A1       |
| S10 | 직접 선택·검토한 N명 적용·원본 변경 차단·부분 저장 복구                             | PASS(자동화된 계약 검사). 실제 화면에서는 1명 적용을 확인했고, 다학생 선택·충돌·복구는 집중 검사로 확인                                                                                                           | A7       |
| S11 | 고정 뼈대 정책의 실제 Codex 응답                                                    | PARTIAL. 첫 응답 파싱 실패를 캡처해 회귀 검사에 추가하고 파서 통과. 수정 뒤 실제 UI 완주는 못 함                                                                                                                  | A6,A7    |
| S12 | AI에게 주제별로 뼈대 맡기기                                                         | UNVERIFIED. 실제 AI 실행 없음                                                                                                                                                                                     | -        |
| S13 | 학급 운영의 담임 생기부 화면                                                        | UNVERIFIED. 공통 보드 속성과 컴포넌트 검사만 확인                                                                                                                                                                 | A7       |

## 실제 AI 결함 발견과 재검증

기존 구성 유지 정책의 첫 번째 실제 응답에서 optional 값의 `null`과 빈 장면을 처리하지 못하는 계약 결함을 발견했다. 이를 수정한 두 번째 응답에서는 기존 장면 보존 판정 결함이 드러났다. 두 결함을 수정한 뒤 세 번째 실제 Codex 요청에서 1명의 4개 주제와 자리 미정 2건 제안이 생성됐다. 제안 전후 두 원본 지도 해시가 같아 생성만으로 지도가 바뀌지 않았음을 확인했다.

고정 뼈대 정책의 실제 Codex 응답은 장면 ID를 생략하고 역할 ID 대신 표시 이름을 사용해 처음 파싱에 실패했다. 캡처한 응답을 회귀 검사로 고정하고 파서를 수정해 검사는 통과했다. 그 뒤 같은 정책의 실제 UI 흐름을 다시 끝까지 실행하지 못했으므로 실제 성공으로 판정하지 않는다.

## 중단·복원 판정

반 전체 10명과 N=3으로 작업을 시작한 뒤 약 3초에 중단했다. 실행 중이던 own AI 요청은 `started`에서 `cancelled`로 끝났고 작업의 10개 학생 항목이 모두 `cancelled`로 저장됐다. 패널을 닫고 다시 열었을 때 `10명 남음`과 [이어 하기]가 보였으며, 이어 하기를 눌러 실제 요청이 다시 `started`가 된 뒤 재중단에서 `cancelled`가 됐다.

Electron 프로세스를 완전히 종료한 뒤 같은 격리 user-data로 CDP 9335 새 프로세스를 실행했다. 패널에는 같은 반·영역의 최신 fixed 실패 작업인 학생 `흐름나래`가 자동 선택되어 표시됐고, 패널 진입 전에 등록한 own AI `onEvent` 배열은 `[]`로 유지되어 자동 AI 재호출이 0회였음을 확인했다.

## 화면 증거

| ID  | 설명                                                                | 경로                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 여러 학생 패널 첫 진입                                              | `output/playwright/record-map-batch/batch-panel-before.png`                                                                                                                                                                                                                                                                                                                                 |
| A2  | 실제 Codex 1명 제안 결과                                            | `output/playwright/record-map-batch/batch-proposal-live-codex.png`                                                                                                                                                                                                                                                                                                                          |
| A3  | 1279×801 라이트, 중단 작업 복원                                     | `output/playwright/record-map-batch/batch-restored-1280x800-light.png`                                                                                                                                                                                                                                                                                                                      |
| A4  | 1279×801 다크, 중단 작업 복원                                       | `output/playwright/record-map-batch/batch-restored-1280x800-dark-real.png`                                                                                                                                                                                                                                                                                                                  |
| A5  | 1439×901 다크, 중단 작업 복원                                       | `output/playwright/record-map-batch/batch-restored-1440x900-dark.png`                                                                                                                                                                                                                                                                                                                       |
| A6  | 실제 제안·작업·적용 기록과 지도 파일 (sanitized synthetic evidence) | `E:/github/ssampin/.omo/evidence/record-map-batch-g005/data-readback/record-map-proposals.json`, `E:/github/ssampin/.omo/evidence/record-map-batch-g005/data-readback/record-map-applications.json`, `E:/github/ssampin/.omo/evidence/record-map-batch-g005/data-readback/record-evidence.json`, `E:/github/ssampin/.omo/evidence/record-map-batch-g005/data-readback/inquiry-threads.json` |
| A7  | 저장·충돌·복구·화면 집중 검사                                       | `.omo/evidence/g004-atomic-map-application.md`                                                                                                                                                                                                                                                                                                                                              |

## 도구 제약과 판정 경계

Windows에서 Playwright CLI 자체가 `SyntaxError: Invalid or unexpected token`으로 실패해 raw CDP 보조 스크립트로 Electron 화면을 조작하고 PNG를 저장했다. CDP 9334 연결, 앱 화면 진입, 실제 Codex 요청과 저장 readback은 성공했으므로 이 CLI 오류를 제품 실패로 기록하지 않는다.

브라우저 모드는 데스크톱 앱의 `electronAPI`가 없어 실제 AI를 실행할 수 없다. 브라우저에서 확인한 진입·10명 표시·직접 근거 저장을 Electron의 실제 AI 성공 증거로 사용하지 않았다. 담임 화면도 수업 관리 화면의 성공으로 대신 판정하지 않는다.

릴리즈·배포는 수행하지 않았다.
