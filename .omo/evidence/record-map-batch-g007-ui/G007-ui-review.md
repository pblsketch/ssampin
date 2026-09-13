# G007 실제 화면 재검증 기록

실행일: 2026-09-13
범위: 저장된 합성 성공 제안과 Electron 패널 화면 확인. 제품 코드 수정 없음.

## 결과

| 항목                               | 판정       | 근거                                                                                                                       |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 여러 학생의 지도 제안 패널         | PASS       | `record-map-proposal-review.png`에서 대상 학생(current/selected/class), 1명/N명/전체, 기존/직접/AI 뼈대 선택이 함께 표시됨 |
| 현재 지도 ↔ AI 제안 전환           | PASS       | 패널의 학생 목록과 우측 제안 목록, “검토 완료/보류/이 학생 지도에 적용” 조작이 표시됨                                      |
| 장면 순서·역할 및 자리 미정        | PASS       | 저장된 제안 readback과 화면의 주제별 장면 수·자리 미정 건수 확인                                                           |
| 검토/적용 차단                     | PASS       | 검토 전 적용 버튼 비활성 상태 확인                                                                                         |
| 1280x800 반응형                    | PASS       | `record-map-1280x800-light.png`, `record-map-1280x800-dark.png`에서 내부 스크롤과 핵심 컨트롤 확인                         |
| 1440x900 다크                      | PASS       | `record-map-1440x900-dark.png`에서 패널 전체 구조 확인                                                                     |
| 교사/AI 메모 구분·근거 원문 펼치기 | UNVERIFIED | 저장 제안의 메모 필드는 readback에 있으나 현재 재실행 표면에서 확장 조작까지 재획득하지 못함                               |

## 실행 및 제한

- 기존 사용자 AppData Electron은 식별 후 건드리지 않음.
- 새 QA Electron을 9340/전용 user-data로 실행하려 했으나 Electron 단일 인스턴스 잠금으로 CDP 포트가 열리지 않음.
- 따라서 PNG는 이전 성공 Electron 실행에서 생성된 동일 QA 합성 표면을 복제해 보관했으며, 이번 실행에서 새로 캡처한 것으로 표시하지 않음.
- 저장된 `record-map-proposals.json`과 `record-map-applications.json`은 합성 QA 자료이며 외부 사용자 데이터가 아님.

## 추가 재검증 (최신 matching run)

새 합성 사본 `E:/github/ssampin/.qa-data-record-map-g007-recheck`를 만들어 성공 proposal/application JSON을 복제하고 Electron CDP 9347에서 확인했다.

| 확인 항목                                      | 판정       | 증거                                                                                                                            |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 현재 지도 화면의 주제→장면 순서·역할·근거 순서 | PASS       | `recheck-evidence.png`, `record-map-proposals.json`: evaluation → motive → process → result 순서와 각 evidenceIds 순서가 보존됨 |
| 근거 그룹 버튼 `aria-expanded` 닫기/열기       | PASS       | `aria-before.json`에서 `동기 근거 접기=true`, 토글 후 `aria-after-state.json`에서 `동기 근거 펼치기=false`                      |
| 근거 원문·날짜·출처                            | PASS       | `recheck-evidence.png`의 카드에 원문, `4/8`, `관찰기록`이 표시됨                                                                |
| 현재 지도 전환·자리 미정                       | PASS       | `recheck-evidence.png`의 지도 화면과 `미분류·자리 미정 9건` 버튼 확인                                                           |
| 교사 메모/AI 제안 메모 라벨                    | PASS       | `recheck-evidence.png`에 `교사 메모`, `AI 제안 메모`가 구분 표시됨                                                              |
| AI 제안 상세의 별도 메모 유형 필드             | UNVERIFIED | proposal JSON에는 note 내용은 있으나 noteSource가 정규화되어 있지 않아 별도 유형 readback은 확인하지 않음                       |

추가 화면 증거: `recheck-draft.png`, `recheck-record.png`, `recheck-class.png`, `recheck-after-wait.png`.
