---
name: ssampin-develop
description: 쌤핀 기능 개발 오케스트레이터(GJC판). 기능 요청·버그 수정·리팩터링을 Clean Architecture 4레이어(domain → usecases → adapters → infrastructure)로 나눠 GJC 내장 에이전트(planner·executor·architect)에게 순서대로 맡기고, 마지막에 검증 게이트(tsc·lint·test·regression-check)와 아키텍처 리뷰까지 끝낸다. "구현해줘", "만들어줘", "고쳐줘", "개선해줘", "리팩터링해줘"처럼 코드 변경이 필요한 요청에 /skill:ssampin-develop 으로 호출한다.
---

# ssampin-develop — 쌤핀 기능 개발 오케스트레이터 (GJC)

Claude Code용 `.claude/skills/ssampin-develop` 을 GJC로 옮긴 것이다. 차이는 셋이다.

1. **에이전트는 GJC 내장 4종만 있다** — `planner`(읽기 전용 계획) · `executor`(구현) · `architect`(읽기 전용 리뷰) · `critic`(계획 비평).
   Claude Code의 `ssampin-planner/domain/ui/infra/guard` 는 존재하지 않는다. 대신 **`roles/` 폴더의 역할 지침을 읽어
   `task` 의 `context`/`assignment` 에 그대로 붙여** 같은 전문성을 준다. 하위 에이전트는 대화 기록을 못 보므로 붙이지 않으면 아무것도 모른다.
2. **구현은 순차가 기본이다.** AGENTS.md 는 병렬 구현을 지양한다. domain → infra → UI 순서로 한 번에 하나만 돌린다.
   파일 집합이 완전히 겹치지 않는다고 확인한 경우에만 infra·UI 를 병렬로 돌릴 수 있고, 그때는 그 사실을 사용자 보고에 적는다.
3. **검증은 오케스트레이터(나)가 마지막에 한 번 한다.** 하위 에이전트에게 tsc·lint·test·포매터를 돌리게 하지 않는다(중복·충돌 방지).

역할 지침 파일: `.gjc/skills/ssampin-develop/roles/{planner,domain,infra,ui,guard}.md` — 각 Phase 에서 `read` 로 읽어 붙인다.

## 0. 시작 전 (AGENTS.md 세션 시작 규칙)

```bash
git branch --show-current   # main 이어야 한다
git status --short          # 기존 변경이 있으면 요약하고 그 위에서 이어 간다. 덮어쓰지 않는다
```

- 새 브랜치·worktree·PR 은 사용자가 명시적으로 요청할 때만.
- 요청이 **1~2개 파일의 명확한 수정**이면 이 스킬의 파이프라인을 돌리지 않고 직접 고친 뒤 §5 검증만 한다.
  스킬은 레이어를 넘나드는 변경(새 엔티티 + 저장소 + 화면)에 쓴다.
- 설계서가 이미 있으면(`docs/02-design/features/*.design.md`) Phase 1 을 건너뛰고 그 문서를 계획으로 쓴다. 계획을 겹쳐 만들지 않는다.

## 1. Phase 1 — 계획 (`planner`, 읽기 전용)

```
task(agent: "planner", tasks: [{
  id: "PlanLayers",
  description: "4레이어 분해 계획",
  assignment: <roles/planner.md 전문> + "\n\n# 요청\n" + <사용자 요청 원문> + "\n\n# 출력\n계획을 §출력 형식 그대로 마크다운으로 돌려준다. 파일은 만들지 않는다."
}])
```

- 결과를 **내가** `_workspace/plan.md` 에 쓴다(`_workspace/` 는 gitignore 대상). 4개 레이어 섹션 + 구현 순서 + 주의사항이 모두 있어야 한다.
- 계획에 "새 엔티티/저장소/스키마 변경"이 있으면 사용자에게 한 문단으로 알리고 진행한다(파괴적 마이그레이션이 아니면 묻지 않는다).

## 2. Phase 2 — 도메인·유스케이스 (`executor`)

```
task(agent: "executor", context: <roles/domain.md 전문> + 공통 제약(§6), tasks: [{
  id: "DomainEntities",
  assignment: "# Target\n" + <plan.md §1·§2 의 파일 목록, 3~5개> + "\n# Change\n" + <단계별 변경> + "\n# Acceptance\n" + <관찰 가능한 결과> + "\n검증·린트·포매터는 돌리지 않는다."
}])
```

- 도메인 파일이 5개를 넘으면 엔티티/규칙/유스케이스로 **작업을 나눠 순서대로** 돌린다.
- 끝나면 `subagent await` 로 받고, 변경 파일 목록을 `_workspace/domain_changes.md` 에 적는다.

## 3. Phase 3 — 인프라 → UI (`executor`, 순차)

### 3a. 인프라 (저장소 구현체·DI·IPC)

`roles/infra.md` 를 context 로. Target 은 plan.md §4. Repository 구현체 → `container.ts` 등록 → (필요 시) `electron/` IPC 순.

### 3b. UI (컴포넌트·스토어·훅)

`roles/ui.md` 를 context 로. Target 은 plan.md §3. **`design examples/` 이미지 경로와 `docs/design-system.md` 를 assignment 에 명시**한다.
컴포넌트가 여러 개면 화면 단위로 작업을 나눈다(작업당 3~5파일).

각 작업이 끝날 때마다 `_workspace/infra_changes.md` · `_workspace/ui_changes.md` 에 변경 파일을 적는다.

## 4. Phase 4 — 아키텍처 리뷰 (`architect`, 읽기 전용)

```
task(agent: "architect", tasks: [{
  id: "GuardReview",
  assignment: <roles/guard.md 전문> + "\n\n# 대상 파일\n" + <Phase 2~3 변경 파일 전체 목록> + "\n# 출력\n§출력 형식 그대로. 심각도(FAIL/WARNING)와 파일:줄을 반드시 적는다."
}])
```

- FAIL → 해당 항목을 **내가 직접** 고치거나(1~2파일) `executor` 에게 파일을 못 박아 다시 맡긴다. 재검증은 최대 2회.
- WARNING → 고치되 못 고친 것은 사용자 보고에 남긴다.
- 결과는 `_workspace/guard_report.md`.

## 5. 검증 게이트 (오케스트레이터가 직접, 마지막에 한 번)

```bash
npx tsc --noEmit
npm run lint
npm run test -- <변경 영역 테스트 경로>     # 전체는 오래 걸린다. 변경 영역 먼저, 여유 있으면 전체
npm run regression-check
```

- 사용자 행동·설정·문제 해결·FAQ 가 바뀌었으면 `landing/src/content/docs.ts` 의 `/docs` 가이드도 같은 작업에서 고치고
  `cd landing && npm run docs:check && npm run build` 를 돌린다(AGENTS.md 릴리즈 문서 규칙).
- 커밋은 사용자가 요청했거나 작업 단위가 명확히 끝났을 때만. `git add <명시 경로>` 로만 스테이징한다.

## 6. 모든 executor 작업에 붙이는 공통 제약 (context 에 그대로)

```
# Constraints
- domain/ 은 외부 import 절대 금지(React·Zustand·Electron·@adapters·@infrastructure). usecases/ 는 @domain 만.
- adapters/ 는 @domain·@usecases 만 import. @infrastructure 는 src/adapters/di/container.ts 에서만.
- any 금지. Props 는 별도 interface. strict 모드.
- 하드코딩 HEX 금지 — sp-* 토큰(bg-sp-card, text-sp-text, border-sp-border …). 모든 UI 텍스트는 한국어.
- 기존 패턴을 먼저 읽고 따른다. 새 유틸·추상화를 만들기 전에 같은 폴더에 있는 것을 쓴다.
- 새 파일보다 기존 파일 수정. 하위 호환 레이어·죽은 별칭을 남기지 않는다.
- 저장 스키마에 칸을 더할 때는 선택 필드(additive optional)로, 구 데이터의 부재를 빈 값으로 덮어쓰지 않는다.
- 검증·린트·테스트·포매터를 돌리지 않는다. 오케스트레이터가 마지막에 한 번 돌린다.
- 지정된 파일 밖은 건드리지 않는다. 밖을 고쳐야 하면 고치지 말고 결과에 그 이유를 적는다.
```

## 7. 간소화 규칙

| 요청 유형                    | 실행                               |
| ---------------------------- | ---------------------------------- |
| 1~2파일 명확한 수정          | 직접 수정 → §5                     |
| 도메인 로직만                | Phase 2 → 4 → 5                    |
| UI 만                        | Phase 3b → 4 → 5                   |
| 인프라만                     | Phase 3a → 4 → 5                   |
| 설계서가 이미 있는 다층 변경 | (Phase 1 생략) 2 → 3a → 3b → 4 → 5 |
| 새 기능(풀스택, 설계서 없음) | 1 → 2 → 3a → 3b → 4 → 5            |

## 8. 사용자 보고 (AGENTS.md 비개발자 설명 원칙)

`무엇을 바꿨는지` → `왜 필요한지` → `확인 결과(실행한 명령과 핵심 출력)` 순서로 짧게. 파일명·레이어명은 역할 설명을 붙여서만.
"통과했습니다"만 쓰지 않는다. 못 한 것·남은 위험은 그대로 적는다.

## 9. 중간 산출물

```
_workspace/
├── plan.md              # Phase 1 (또는 설계서 경로 한 줄)
├── domain_changes.md
├── infra_changes.md
├── ui_changes.md
└── guard_report.md
```

한 사이클이 끝나면 다음 사이클이 덮어쓴다. 오래 남길 결정은 `DECISIONS.md`(ADR) 에 적는다.
