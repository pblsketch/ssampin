# Architect 검토 r1 — school-year-archive.plan.md (ralplan)

> 판정: **APPROVE_WITH_CHANGES** · 2026-08-06
> P1 골격·페이즈 구조·ADR-030(스냅샷)·ADR-032(2단계 삭제 게이트) 승인. **S2.2(epoch 가드)는 현 설계로 성립하지 않아 재설계 필수.**

## 1. 파일 루트 epoch는 성립하지 않는다

봉투(파일 최상위) 재조립 지점 실측 — 루트 키가 소실되는 곳:

| #        | 위치                                                               | 재조립 형태                                                                  |
| -------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1~3      | `src/usecases/classManagement/ManageTeachingClasses.ts:17, 29, 41` | `{ classes: updatedClasses }`                                                |
| 4 (신규) | `src/adapters/stores/useTeachingClassStore.ts:405`                 | `saveClasses({ classes: reordered })` — **유즈케이스·락 우회 (계획 미기재)** |
| 5        | `src/usecases/classManagement/ManageObservations.ts:46-51`         | `{records, customTags?, customCategories?}`                                  |
| 6        | `src/usecases/studentRecords/ManageStudentRecords.ts:169-173`      | `{records, categories?}`                                                     |
| 7~9      | `src/usecases/sync/SyncFromCloud.ts:210-214 / :309-314 / :384-386` | merge 3종 반환값                                                             |

`ManageObservations.ts:16-18` 주석이 밝히듯 이 화이트리스트 재조립은 **의도된 방어 불변식**이다(낡은 deleted 누출 방지). 루트 epoch는 **신버전 자기 코드가 평범한 저장 1회에 벗긴다.** "epoch 부재=현행 병합 폴백" 규칙과 결합하면 조용한 부활 재발 — 로그·토스트·신호 0. 단위 테스트는 merge 함수를 직접 호출하므로 AC 전건 통과하면서 무력. **계획 전체에서 S2.2만 유일하게 fail-open이고 하필 비가역 단계를 지킨다.**

## 2. 대안 비교 → 레코드 스탬프 채택 권고

| 안                            | 편집 지점 | 구버전 생존 | 실패 양상  | 판정                                                                                                                           |
| ----------------------------- | --------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| (a) 자기 저장 9지점 보존 수정 | 9         | 0%          | 조용함     | 필요조건이나 불충분                                                                                                            |
| (b) 사이드카 파일 epoch       | 2~3       | 높음        | 조용함     | 더 나쁨 — 사이드카 자체가 통파일 LWW·무순서 도착 노출                                                                          |
| (c) 최소 버전 강제            | ~2        | n/a         | 명시적     | 탐지기로만 유효 — `SyncToCloud.ts:218/225` `version:1` 데드 코드를 살려 "구버전 기기 감지 → **마법사 차단**"에 활용(거의 공짜) |
| **(d) 레코드 스탬프**         | **6**     | **~100%**   | **가시적** | **채택**                                                                                                                       |

(d) 근거: ① 부활 위험은 병합 3도메인에만 존재(통파일 도메인은 이기거나 지거나 — epoch가 막을 것이 없음) ② 3도메인 각각 저장 조립 chokepoint 1개씩 실존(`buildAttendanceSaveData`/`buildObservationSaveData`/`buildStudentRecordsSaveData`, ADR-027/028 테스트가 강제) → **3 + merge 필터 3 = 6 편집** ③ 레코드 필드는 구버전에서 증명 가능하게 생존(merge 전부 `map.set(r.id, r)` 레코드 통째 운반, 스토어 전부 스프레드) ④ 기존 레코드 기본 term은 date/createdAt에서 무료 파생 ⑤ **§4-4 "반쯤 전환 상태"가 오류 상태가 아니게 되어 케이스 소멸**. 계획의 기각 근거 "300+ 호출처"는 ADR-030(전 엔티티 schoolYear)에서 잘못 이전된 숫자.

## 3. 함정 ㉑(통파일 LWW 되감기) 재평가 — 과대평가였다

- 승자 판정 `localInfo.lastModified`는 **Drive 업로드가 반환한 modifiedTime** 출처(`SyncToCloud.ts:138-143`) — 로컬 파일 쓰기는 매니페스트를 안 건드림 → "낡은 기기가 열기만 해도 승자"는 성립 안 함.
- `SyncToCloud.ts:123-132` **DEFER**: 리모트가 내 장부 이후 바뀌었으면 업로드 유예 + `useDriveSyncStore.ts:133-139` 1회 pull-merge-push.
- 실제 위험 창 = "보관 ~ 다음 자동 업로드(5분) 사이 업로드 경쟁"뿐.
- 귀결: ① 계획의 완화책(보관 직후 업로드 유도)은 옳고 거의 충분 ② §8.4 실측("2주 안 연 B")은 **거짓 안심** — "B가 A보다 먼저 업로드" 경쟁 테스트로 교체 ③ **미결 3(teaching-classes 레코드 병합 P1 도입)을 지금 NO로 종결 가능 = 최대 일정 리스크 제거.**

## 4. S2.2 미정의 케이스 4개 평가

1. 미업로드 편집 감지 신호 = **기존 계산 재사용**: "manifestChecksum 부재 또는 현재 체크섬과 불일치"(`SyncToCloud.ts:114-118`). 별도 dirty 플래그 발명 금지.
2. 모바일 PWA: "쓰기 거부"만으론 절반 — **업로드도 중단**해야(낮은 epoch 업로드가 리모트를 옛 epoch에 고정 → 전 데스크톱 영구 skip 분기). "수업 중 폰이 출결 입력 거부" 자체가 사고임을 명문화, 가능하면 로컬 격리 큐.
3. epoch 부재=같은 epoch 취급: 옳다(루트 기판에서만 fail-open의 원인이 될 뿐).
4. 반쯤 전환 상태: 레코드 스탬프 채택 시 케이스 소멸.

## 5. P1-min 평가

원칙(쓰기 경로 타협 불가)은 옳으나 **모바일 제외가 유일한 자기 위반** — 모바일은 출결을 쓴다. `src/mobile/pages/ClassListPage.tsx:23-25` 한 줄 필터를 P1-min에 편입하라.

## 6~7. 일정

- 미결 3 컨디셔널(D-5 분기에 +3~5일 범위)은 물리적으로 불가능한 구조 → **지금 NO로 종결하면 D-14 달성 가능, 열어두면 불가능.**
- **혼재 버전 실측을 S1.1 직후(1~2일차)로 앞당길 것** — 부정 결과가 이미 만든 UI를 무효화하기 전에.

## 8. 스토리별 지적 (요지)

- S1.2: `reorderClasses` 수선은 **유즈케이스 경유로**(`useTeachingClassStore.ts:405` 직접 호출은 레이어 위반 제도화 금지). 형제 가드 3개는 **`shouldPropagateToSibling(c)` 술어 1개로 추출** — `syncGroupStudents`는 `independent` 건너뛰는데(`:285`) `updateStudentStatus`는 안 건너뜀(`:617-640`) = 기존 불일치 덤 수선.
- S1.2b: AC-2 `undefined` → **`null`**(`matchingRules.ts:16,48`). 더 나은 형태 = 시그니처 유지 + **호출처 4곳이 `filterActiveClasses(classes)`를 주입** — domain rule이 보관 개념을 모르게 유지, S1.6 규칙과의 충돌 해소.
- S1.1: `notMirrored` 타당. "알 수 없는 필드 왕복 생존"은 **레코드 수준에서 코드 판독상 참, 루트 수준은 거짓** — §12.1에 이 구분 명기(P2가 잘못된 안심을 물려받지 않게).
- S2.2 기판 결정이 S2.1 아카이브 레이아웃 확정보다 선행해야 함(의존 그래프에 명시).
- GradeAnalysis 이연 안전 근거: `grade-analysis`는 SYNC_REGISTRY 미등재=동기화 위험 0 — 계획에 명기.

## 9. Steelman 반론과 착지

반론: "P1은 잘못된 첫 수 — 진짜 고장(학년-반-번호 키 충돌)에 아무것도 안 하면서 '보관' 약속을 발행". 착지: **P1 취소가 아니라 P2 설계 부채로부터 분리** — `archivedTerm`을 파일 루트 설계 전제로 확정하지 말고, ADR-029에서 epoch 위치 조항을 분리해 PENDING으로. 현상 유지는 능동적으로 파괴적(㉔: `deleteClass`가 그룹 단위 출결 삭제 — "보관 대신 삭제" 대안은 형제 반 출결을 날림).

## 11. Synthesis — 계획 확정 시 함께 처리할 7건

1. 미결 3 = NO 종결 + §8.4 경쟁 업로드 테스트로 교체
2. ADR-029에서 epoch 위치 조항 분리(PENDING) — 레코드 단위를 기본 권고로 명기
3. 봉투 메타테스트 신설(`build*` 3함수 밖 봉투 리터럴 재조립 금지) + `reorderClasses` 유즈케이스 경유를 S1.2에 편승
4. 모바일 목록 필터 P1-min 편입 + 혼재 버전 실측 S1.1 직후로
5. 매니페스트 version 데드 코드 → 구버전 감지기(P2 출시 조건 3번째)
6. `shouldPropagateToSibling` 술어 추출
7. S1.2b 호출처 필터 재구성 + AC undefined→null

## 12. 원칙 위반 (DELIBERATE)

- 파괴적 조작 안전장치 fail-closed 원칙: S2.2만 fail-open — **HIGH**
- 의사결정 근거의 문맥 실측 원칙: "300+ 호출처" 오전이 — **HIGH**
- "동작한다=파일 바이트" 원칙: S2.2 AC가 merge 단위 테스트만으로 만족 가능 — **HIGH**
- 레이어 방향: `useTeachingClassStore.ts:405` 우회 유지·확장 — MEDIUM
- P1-min 자기 원칙(쓰기 경로) 위반: 모바일 제외 — MEDIUM
- 미결이 일정 임계 경로에 걸침: 미결 3 — MEDIUM (1로 해소)
