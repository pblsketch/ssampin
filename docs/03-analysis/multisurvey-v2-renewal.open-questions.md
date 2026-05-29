# Open Questions — 복합 유형 설문 RB 수준 리뉴얼

- **연관 plan**: [multisurvey-RB-renewal.plan.md](../01-plan/features/multisurvey-RB-renewal.plan.md)
- **연관 spec**: [deep-interview-multisurvey-RB.md](../../.omc/specs/deep-interview-multisurvey-RB.md)
- **연관 ralplan**: [ralplan-multisurvey-RB-renewal.md](../../.omc/specs/ralplan-multisurvey-RB-renewal.md)
- **작성일**: 2026-05-22
- **상태**: Plan v1.0 승인 후 확정 대기

본 파일은 plan에서 [TBD-검토필요]로 표시된 미정 항목과, ralplan consensus loop에서 미세 조정 권장된 잔여 약점을 모은 워크북이다. Phase 진입 전 각 질문에 결론을 적고 plan 본문에 반영한다.

---

## Q1. Phase 0 wireframe 4장 일정 (1주 내 가능?)

- **상태**: 미정
- **원인**: frontend-design 에이전트 가용성에 의존. 1주 내 4장 산출 가능 여부 확인 필요
- **결정 시점**: Plan 승인 직후
- **결정자**: 준일님 + frontend-design 에이전트
- **결정 후 plan 반영 위치**: §5.1 Phase 0 "예상 소요" 컬럼
- **Pre-mortem #7 폴백**: 1주 초과 시 우선순위(wireframe > 11종 토글 위치 > 컴포넌트 트리 > 도메인 노트) 적용

---

## Q2. 11종 토글 3그룹 한국어 라벨

- **상태**: ✅ **결정 완료 (2026-05-22)** — Designer 추천안 A 채택
- **결정**:
  - 그룹 1 (T01~T03): **발표 설정** — 누적점수표시 · 해설노출 · 재입장 가능
  - 그룹 2 (T04~T08): **응답 설정** — 정답 제출 버튼 · 자동 넘김 · 빠른 풀이 · 연속 정답 · 랜덤 보너스
  - 그룹 3 (T09~T10): **표시 설정** — 교사 집중 모드 · 문항별 점수 공개
  - UI 배치: **P — 메이커 우측 인라인 사이드패널** (RB는 Q이지만, 준비 단계 페인 해소 우선)
- **결정자**: 준일님 + designer 에이전트
- **반영 위치**: [prototype/realtime-tool-spike/toggle-placement.md](../../prototype/realtime-tool-spike/toggle-placement.md), Design v0.2에서 §5.2 확정 예정
- **참고 — RB 분류**:
  - **퀴즈 옵션 4종** (학습 UX): 누적점수표시 / 해설노출 / 재입장 가능 / 배경음악(쌤핀 제외)
  - **게임 옵션 7종** (메카닉): 교사 집중 모드 / 정답 제출 버튼 / 문항별 점수 확인 / 빠른 풀이 점수 / 연속 정답 가산점 / 랜덤 보너스 / 문제 자동 넘김

---

## Q3. 멀티 PC sync 일시 정지 안내 모달 문구 (UX writing)

- **상태**: 초안 있음, 확정 필요
- **초안**: "다른 PC에서 v2.1.0으로 업데이트된 데이터가 있어요. 이 PC도 v2.1.0으로 업데이트하면 다시 sync됩니다."
- **결정 시점**: Phase A 진행 중
- **결정자**: 준일님
- **검토 포인트**:
  - "다른 PC"가 어느 PC인지 명시 가능한가? (디바이스 이름)
  - "업데이트"라는 단어가 비개발자에게 충분히 이해되는가?
  - "v2.1.0"이라는 버전 번호가 사용자에게 의미 있는가? → "최신 버전"으로 풀어쓸지

---

## Q4. sp-\* ratio "±20%" baseline

- **상태**: 미정
- **권장**: `src/adapters/components/RealtimeTool/**` 직전 git tag 시점 (예: `v2.0.7`)
- **결정 시점**: Phase B 진입 전
- **결정자**: 개발 (frontend-design + bkit:code-analyzer 협업)
- **측정 방법**:

  ```bash
  # baseline (v2.0.7 시점)
  git checkout v2.0.7
  grep -r "sp-" src/adapters/components/RealtimeTool/ | wc -l
  # → N (baseline)

  # 새 작업 시점
  git checkout HEAD
  grep -r "sp-" src/adapters/components/RealtimeTool/ | wc -l
  # → M (new)

  # 비율: M / N
  # ±20% 이내 통과
  ```

- **임계값 ±20%는 첫 측정 후 보정 가능**

---

## Q5. opt-in 95% 6개월 미달 시 폴백 합격선

- **상태**: ✅ **결정 완료 (2026-05-30, Phase C 진입 직후)** — Architect 권고안 A 채택
- **1차 합격선** (현재 plan): opt-in 95% + crash-free 99.5% + 신고 0건 (30일)
- **2차 폴백 합격선 (A 채택)**: opt-in **90%** + crash-free 99.5% + 신고 0건 (90일) + **준일님 결재**
- **결정 시점**: 1차 합격선 미달 6개월 시점에 재논의 (v2.1.0 출시 후 6개월)
- **결정자**: 준일님 (2026-05-30 — "권고안으로 작업 시작")
- **기각 후보**:
  - B (80% + 180일 + 결재): 비-opt-in 20%에게 강제 마이그레이션 부담 과대 → 기각
  - C (폴백 없음 + v2.1.0.x patch 무한 루프): flag 분기 3개 영구 부채화 → 기각
- **반영 위치**: Plan §5.2 D11(95/99.5/0 + 30일) — 폴백 합격선(90/99.5/0 + 90일 + 결재)을 ADR Follow-ups로 추가 갱신은 v2.1.0 출시 후 6개월 시점 ADR 재발행
- **위험 완화**: 폴백 합격선이 있어 flag 영구 부채 위험 차단됨. 90일 + 결재 조건으로 책임 분리 (개발 자체 판단 회피)

---

## Q6. ADR C 기각 논리의 "인지 부하 횟수" 측정 방법 (Architect §5 잔여)

- **상태**: 표어만 있고 측정 미정
- **권고**:
  - "인지 부하 횟수는 측정 대상이 아니라 **디자인 원칙**이다" 명시 → 측정 책임 회피
  - 또는 intermediate signal로 "토글 UI 진입 횟수 + 모달 dismiss 비율" 같은 proxy 명시
- **결정 시점**: ADR 최종 확정 시 (Design 단계)
- **결정자**: 개발 + 준일님

---

## Q7. 사용자 테스트 시나리오 체크리스트 5개

- **상태**: ✅ **결정 완료 (2026-05-30, Phase C 진입 직후)** — 권고 5건 전부 채택
- **채택된 5개 시나리오**:
  1. **메이커 토글 그룹 인지** — 선생님이 토글 의미를 모른 채 들어와서 11종 토글을 발표·응답·표시 3그룹으로 빠르게 추측 가능한가 (Q2 결정 — 그룹명 발표 설정/응답 설정/표시 설정 검증)
  2. **3 화면 동시 동작** — 진행 콘솔 → 학생 페이지 → 교실 모니터 share view 동시 운영. 다중 세션 충돌 없음, sp-\* 토큰 일관성 (DN-10 fallback 포함)
  3. **재입장 흐름** — 라운드 종료 후 학생 화면 "다시 하기"/"한 번 더" — DN-04 pin4 재입장 도메인 노트 + presentationOpts.allowReentry 토글 검증
  4. **마이그레이션 리포트 모달 명확성** — 비개발자에게 실패 N건 안내 + 수동 롤백 인식 + "다시 안 보기" 토글 UX
  5. **sync 일시 정지 안내 명확성** — Q3 모달 문구가 비개발자에게 이해되는가 (PC1↔PC2 4 사분면 매트릭스 중 v2.1.0↔v2.0.x 교차 사분면)
- **결정자**: 준일님 (2026-05-30 — "권고안으로 작업 시작")
- **Q3 재평가 트리거**: 시나리오 #5에서 모달 문구가 불명확하면 Q3를 재오픈 (현재 Plan 초안 그대로 박힘)
- **반영 위치**: Phase C C.6 수동 테스트 체크리스트로 채택. 검증 환경: 데스크톱(Electron 40.x on Win11 24H2). frontend-design 에이전트 협업 의무 (`feedback_frontend_agent_collaboration.md` 메모리 룰)

---

## Q8. 모바일 메이커 UI 지원 여부

- **상태**: 비-목표로 분류, 후속 PDCA 여부 미정
- **결정 시점**: v2.1.0 출시 후 사용자 피드백 수집 후
- **결정자**: 준일님
- **참고**: spec §5.8 비-목표

---

## Q9. Phase 0 prototype 흡수 검증 (cost 0 안전장치 효과)

- **상태**: 메모리 grep 결과 "prototype/spike 코드가 main에 흡수된" 명시 사례 0건 (Critic §4 확인)
- **유지 결정**: 권장 안전장치로 유지 (cost 0)
- **재검토 시점**: Phase 0 종료 시 — 실제로 git rm + ADR 잘 작동했는지 검증

---

## Q10. `migration-roundtrip` npm script 빌드 5단계 분리 호환

- **상태**: 미정
- **결정**: `npm run migration-roundtrip`이 단일 명령이 아니라 5단계 분리 가능하게 설계 (CLAUDE.md 빌드 회피 패턴 준수)
- **결정 시점**: Phase A 진입 전
- **결정자**: 개발

---

## Q11. v1 → v2 enum 매핑 — v2 도메인 union 확장 여부 (Phase A 진입 직전 발견)

- **상태**: ✅ **결정 완료 (2026-05-29)** — 경로 ① 채택
- **배경**: DN-07(domain-notes.md)의 v1 타입 grep 실측 결과, 실제 v1 enum은 `'single-choice' | 'multi-choice' | 'text' | 'scale'` 4종(설문)이며 Plan/Design가 가정한 `'objective'/'subjective'/'ox'/'blank'/'description'` 매핑은 **실측 0 hit**. 또한 v1엔 `correctAnswer`/`correctChoiceIds`/`isCorrect` 필드 0건 → v1은 설문(survey, 정답 없음), v2는 퀴즈(quiz, 정답 있음)로 도메인 모델 자체가 다름.
- **본질적 모순**:
  1. 타입 enum 1:1 매핑 불가능 (도메인 모델 차이)
  2. v1엔 정답 없음 → v2 변환 후 quiz 메카닉(점수·포디움) 의미 없음
  3. v1 `'scale'` (1-5 척도)은 v2 5종 어디에도 매핑 안 됨 → 라운드트립 무손실 가정 깨짐
- **검토된 경로 4가지**:
  - **① v2 enum 확장 (채택)**: v1 4종 + v2 5종 합집합 9종 union. v1 문항은 정답 없는 상태로 보존, v2 5종만 quiz 메카닉 적용. 라운드트립 무손실.
  - ② 자동 변환 안 함 (formatVersion 1 read-only): G002 범위 축소 + Plan §4 통째 재작성 부담
  - ③ 강제 매핑 + scale을 failedItems로 격리: 부분 손실, 게이트 5 완화 필요
  - ④ Plan/Design v0.2 전면 재확정 + deep-interview 재실행: 1~2주 지연 비용 과다
- **결정자**: 준일님 (2026-05-29 — "1로 가")
- **반영 위치**:
  - Design §2.2 Question.ts union 9종 확장 + `isQuizType` narrowing helper 추가
  - Design §4.1 매핑 테이블 갱신 — "type 그대로 유지" + 중요 함의 추가
  - domain-notes DN-02 (Response.isCorrect) — 퀴즈 타입만 `boolean`, 설문 타입은 `undefined`
  - domain-notes DN-08 (isAutoAdvanceEnabled) — `&& isQuizType(question.type)` 추가
- **Phase B 영향** [TBD]:
  - component-tree.md §3 QuestionView "5종 variant" → **9종 variant**로 확장 필요
  - Maker UI에 "v1 문항을 quiz 타입으로 변환" 옵션 추가 검토
- **Phase A 영향**: worker 분해안 그대로 launch 가능 (구조 변경 없음). v1ToV2/v2ToV1 어댑터는 "type/options 그대로 + opts 신규" 매핑으로 단순화.

---

## 진행 기록

| 일자       | 변화                                                    | 담당                          |
| ---------- | ------------------------------------------------------- | ----------------------------- |
| 2026-05-22 | Open Questions 10건 신설                                | Plan v1.0 작성 동반           |
| 2026-05-29 | Q11 결정 완료 (경로 ① — v2 enum 9종 확장)               | Phase A 진입 직전 v1 실측 후  |
| 2026-05-30 | Q5 결정 완료 (폴백 A — 90/99.5/0 + 90일 + 결재)         | Phase C 진입 직후 권고안 채택 |
| 2026-05-30 | Q7 결정 완료 (권고 5건 전부 채택)                       | Phase C 진입 직후 권고안 채택 |
| 2026-05-30 | Q4 ADR-010 발행 (sp-\* ratio ±20% 폐기 + 3종 새 게이트) | Phase C C.1 첫 항목 해소      |

---

**다음 행동**: Plan 승인 → Design 단계 진입 시 Q1~Q10 중 Phase 진입 시점 기준으로 우선 정렬, 각 질문에 결정 추가.
