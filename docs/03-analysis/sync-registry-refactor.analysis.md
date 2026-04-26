# sync-registry-refactor — Gap Analysis

> **분석일**: 2026-04-26
> **Plan**: `docs/01-plan/features/sync-registry-refactor.plan.md`
> **Design**: `docs/02-design/features/sync-registry-refactor.design.md`
> **검증**: `npx tsc --noEmit` 0 에러, `vitest run src/usecases/sync src/adapters src/usecases/note` 91/91 통과

## 종합 점수

| 카테고리 | 점수 | 상태 |
|---|:---:|:---:|
| Design Match | 96% | OK |
| Architecture Compliance | 100% | OK |
| Convention Compliance | 100% | OK |
| Test Coverage (메타테스트 6/6) | 100% | OK |
| **Overall Match Rate** | **97%** | **PASS** |

## 항목별 검증

### §3 SyncDomain 인터페이스 — 100%
- `fileName`, `subscribeExcluded`, `reload`, `isDynamic`, `enumerateDynamic` 5개 필드 모두 구현
- `storeSubscribe` 필드는 의도적으로 미포함 (§7.3 결정에 부합 — App.tsx STORE_SUBSCRIBE_MAP으로 위임)
- `SYNC_FILES`/`SyncFileName` 파생 export 정확

### §4 도메인 등록 표 — 105% (상향)
- 정적 20개 + 노트 4개(note-notebooks/sections/pages-meta/body) 모두 등재
- `subscribeExcluded:true` 5개(settings/teacher-schedule/timetable-overrides/curriculum-progress/attendance) + 노트 동일 store 중복방지 3개 정확
- bookmarks/assignments/manual-meals의 비표준 reload 패턴(`loadAll`/`loadAssignments`/`loadManualMeals`) 캡슐화됨
- 노트 4개가 본 리팩터에 직접 통합되어 note-cloud-sync 작업 일부 선흡수됨

### §5 호출처 변경 — 100%
- App.tsx (709–757): STORE_SUBSCRIBE_MAP + `for of SYNC_REGISTRY` 옵션 C 정확
- useDriveSync.ts: switch-case 110줄 → registry dispatch + `note-body--` prefix 분기 35줄로 축소
- SyncToCloud.ts: `import { SYNC_FILES }` + `export { SYNC_FILES }` + type-only re-export로 ESM 패턴 정확

### §6 useNoteStore — 의도적 상향 (B안 → 통합)
- Design 권고: B안(TODO 주석 보존)
- 실제: SYNC_REGISTRY에 note-* 4개 도메인 직접 등록 + STORE_SUBSCRIBE_MAP['note-notebooks']
- App.tsx 단독 `noteUnsub` 줄과 TODO 주석 모두 제거됨
- note-cloud-sync 작업의 5단계 중 1·4단계 일부 선완료된 상태

### §7 Circular Import 방지 — 100%
- 모든 reload가 `await import('@adapters/stores/...')` dynamic import
- syncRegistry.ts에서 store 정적 import 0건
- storeSubscribe는 인터페이스에 두지 않고 App.tsx가 어댑터 역할

### §8 SyncSubscribers 메타 테스트 — 100% (6/6)
- (a) SYNC_FILES 파생 정합성
- (b) STORE_SUBSCRIBE_MAP 등재 검증 (App.tsx 텍스트 파싱)
- (c) fileName 중복 검출
- (d) settings subscribeExcluded 검증
- (e) reload 함수 존재
- (f) isDynamic ↔ enumerateDynamic 정합

### §10 LOC 명세 — 부합
| 파일 | Design | 실제 | 비고 |
|---|---|---|---|
| syncRegistry.ts | ~180 | 297 | 노트 4개 도메인 추가 + 상세 주석 |
| useDriveSync.ts | -100/+10 | -89/+14 | 부합 |
| SyncSubscribers.test.ts | ~90 | 92 | 부합 |
| SyncToCloud.ts | -8/+2 | -7/+5 | 부합 |

## Gap 목록

### P0 (Blocker) — 없음

### P1 (High)
| ID | 항목 | 위치 |
|---|---|---|
| G1 | useNoteStore 통합이 Design §6 B안과 다름 → Design 사후 갱신 권장 | syncRegistry.ts:241-285 |
| G2 | note-body 도메인 enumerateDynamic이 placeholder (`async () => []`) — 실제 동적 enumeration은 SyncToCloud/SyncFromCloud의 `getDynamicSyncFiles` 훅이 담당. 인터페이스 의도가 두 갈래로 분기 | syncRegistry.ts:278 |

### P2 (Medium)
| ID | 항목 |
|---|---|
| G3 | App.tsx STORE_SUBSCRIBE_MAP의 'note-notebooks' 등재가 Design §4 표에 미반영 |
| G4 | SyncToCloud의 `getDynamicSyncFiles` 훅이 본 리팩터에서 이미 활성화되어 있어 Design 명시(§5.3)보다 진보 |
| G5 | SyncFromCloud.ts에 `getDynamicSyncFiles` + 동적 다운로드 루프 추가됨 (Design "변경 없음"과 불일치) |

### P3 (Low)
| ID | 항목 |
|---|---|
| G6 | SyncSubscribers.test 헤더 "메타 테스트 4개" → 실제 6개 (Design §8.2 본문은 6개 작성) |

## Design 문서 갱신 권고

1. §4 등록 표에 노트 4개 행 정식 추가
2. §5.5 SyncFromCloud "변경 없음" → 실제 변경된 부분 정정
3. §6 useNoteStore B안 → 통합 채택으로 재기술
4. §8.2 헤더 "4개" → "6개" 수정
5. §13.1 인터페이스 계약: note-cloud-sync 잔여 작업 축소(이미 80% 흡수)

## 후속 PDCA 권장

- note-cloud-sync Plan 범위 축소 — 이미 흡수됨
- first-sync-confirmation은 §13.2 인터페이스 그대로 사용 가능
- G2 정리: enumerateDynamic placeholder 의미 명확화 (인터페이스 주석 강화 또는 SYNC_REGISTRY를 정식 호출 경로로 일원화)

## 핵심 결과

1. **97% PASS** — 정적 20개 + 노트 4개 도메인 통합, 메타테스트 6/6 통과
2. Architecture/Convention 100% 준수
3. Design §6 B안이 실제로는 노트 도메인 직접 통합으로 진보 — note-cloud-sync 작업의 80% 선흡수
4. Design 갱신 5건 필요 (P2) — 동작 영향 없음
5. P0 0건, P1 2건은 Design 갱신만으로 해소 가능 — Report 단계 진입 가능
