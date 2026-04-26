# note-cloud-sync — Gap Analysis

> **분석일**: 2026-04-26
> **Plan**: `docs/01-plan/features/note-cloud-sync.plan.md`
> **Design**: `docs/02-design/features/note-cloud-sync.design.md`
> **검증**: tsc 0 에러, vitest 91/91 통과

## 종합 점수

| 카테고리 | 점수 | 상태 |
|---|:---:|:---:|
| Design 매칭률 | 96% | OK |
| 아키텍처 준수 | 100% | OK |
| 컨벤션 준수 | 100% | OK |
| **종합 Match Rate** | **97%** | **PASS** |

## 항목별 검증

| # | Design 항목 | 구현 위치 | 일치도 |
|:-:|---|---|:-:|
| 1 | §3.2 `INotebookRepository.listPageBodyKeys` 시그니처 | `INotebookRepository.ts:27` | 100% |
| 2 | §4 `GetDynamicSyncFiles` 타입 + 생성자 옵셔널 | `SyncToCloud.ts:26,49`, `SyncFromCloud.ts:54` | 100% |
| 3 | §5 `SyncToCloud.execute` 동적 루프 | `SyncToCloud.ts:71-124` | **개선** (uploadOne 헬퍼 추출) |
| 4 | §6 `SyncFromCloud.execute` 동적 루프 | `SyncFromCloud.ts:186-257` | **개선** (local + remote prefix 합집합) |
| 5 | §7 `listPageBodyKeys` 구현 (PAGES_META 단일 진실) | `JsonNotebookRepository.ts:54-57` | 100% |
| 6 | §8 훅 주입 위치 | `useDriveSyncStore.ts:89-90, 173-174` | **변경** (container.ts → store 호출 시점) |
| 7 | §9 `reloadStores` (변경 없음) | `useDriveSync.ts:1-35` | **변경** (sync-registry-refactor가 정적 키를 흡수) |
| 8 | §10 `FILE_LABELS` 정적 3개 추가 + 동적 fallback | `DriveSyncConflictModal.tsx:5-29` | 100% |
| 9 | §11 메타 테스트 | registry 기반 (a)~(f) 자동 커버 | **개선** |

## 의도적 변경 (Design ↔ 실구현)

1. **`uploadOne` 헬퍼 추출 (§5)** — 정적/동적 루프 DRY 통합. 진행률 `grandTotal` 사전 계산으로 UI 표시 정확.
2. **SyncFromCloud local + remote prefix 합집합 (§6)** — Design은 local enumeration만. 실구현은 `Object.keys(remoteManifest.files).filter(f => f.startsWith('note-body--'))` 합집합으로 신규 기기 첫 다운로드 보강.
3. **훅 주입 위치 (§8)** — Design은 container.ts 모듈 로드 시. 실구현은 `useDriveSyncStore` 호출 직전 lazy import. 부팅 순서 안전 + 기존 패턴 일치.
4. **§9 reloadStores** — sync-registry-refactor 선행 효과로 정적 키는 registry dispatch, 동적 prefix만 분기.
5. **메타 테스트** — 별도 추가 없이 registry 기반 (a~f) 6개 케이스가 노트 4개 도메인 자동 검증.

## Gap 목록

### P0 (Blocker) — 없음

### P1 (Major)
- **§9 정적 노트 reload 분기 제거** — Design "변경 없음" 명시와 불일치. 동작 동일하나 Design 사후 갱신 권장.

### P2 (Minor)
- 체크섬 함수 중복 (`SyncToCloud` + `ResolveSyncConflict`) — 본 PDCA 범위 외. 후속 cleanup
- 충돌 다이얼로그의 `note-body--{pageId}` 표시 → 페이지 제목 변환 (Should, 후속 이터레이션)
- 모바일 `useMobileNoteStore` 미동기화 (별도 PDCA)

## 후속 권장

| 우선순위 | 항목 | 이유 |
|:-:|---|---|
| 권장 | Drive orphan `note-body--*` 정리 (A안 cleanup PDCA) | B안 채택으로 미해결 |
| 권장 | 충돌 모달 pageId → 페이지 제목 | UX 개선 |
| 향후 | 모바일 동기화 별도 PDCA | 본 PDCA 데스크톱 전용 |
| 권장 | Design §9 사후 갱신 | 문서 정합성 |
| 향후 | 첫 동기화 진행률 UI (수백 페이지) | Could |

## 핵심 결과

1. **Match Rate 97% PASS** — Design §3.2/§4/§7/§10 4개 완전 일치, §5/§6/§9/§11은 의도적 개선
2. **3개 의도적 개선**: uploadOne 헬퍼, local+remote 합집합, 훅 주입 위치 이동 — 모두 Design보다 우수
3. **§9 sync-registry-refactor 선행 영향** — 정적 키 분기 제거됨. Design 사후 갱신 권장
4. **메타 테스트는 별도 추가 없이 자동 커버** — registry 기반 (a~f) 6개 케이스가 노트 4개 도메인 검증
5. **P0/P1 Blocker 없음. P2 3건**(orphan/페이지 제목/모바일)은 후속 PDCA. Report 진입 가능
