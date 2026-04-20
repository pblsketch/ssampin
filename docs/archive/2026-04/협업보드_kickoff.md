---
title: 협업 보드 — 새 세션 Kickoff 프롬프트
date: 2026-04-20
purpose: 새 Claude 세션에서 협업 보드 작업을 이어 시작할 때 그대로 복사-붙여넣기하면 되는 한 줄 프롬프트
---

# 협업 보드 작업 새 세션 Kickoff

## 📋 사용 방법

새 Claude Code 세션을 열고 아래 한 줄을 그대로 복사해서 입력하세요.

```
협업 보드 작업 이어서 할게. docs/HANDOFF_collab-board.md 읽고 시작해줘.
```

그러면 Claude가 즉시 핸드오프 문서를 읽고 현재 상태·남은 작업·주의사항을 파악한 뒤 "무엇을 도와드릴까요?" 상태로 대기합니다.

---

## 📎 관련 문서 (Claude가 자동 참조)

| 문서 | 역할 |
|---|---|
| [docs/HANDOFF_collab-board.md](./HANDOFF_collab-board.md) | 작업 인계 — 현재 상태/남은 작업/교훈/파일 경로 |
| [docs/01-plan/features/collab-board.plan.md](./01-plan/features/collab-board.plan.md) | Plan v0.2 |
| [docs/02-design/features/collab-board.design.md](./02-design/features/collab-board.design.md) | Design v0.2 |
| [docs/03-analysis/collab-board.analysis.md](./03-analysis/collab-board.analysis.md) | Analysis v0.5 (iter #1~#5 통합) |
| [docs/03-analysis/collab-board.qa-checklist.md](./03-analysis/collab-board.qa-checklist.md) | QA 체크리스트 13섹션 |
| [docs/04-report/features/collab-board.report.md](./04-report/features/collab-board.report.md) | Phase 1a MVP 완료 보고서 |

---

## 🎯 예상 시나리오별 추가 지시어

### 릴리즈 준비 재개 (타 세션 작업 완료 후)
```
협업 보드 작업 이어서 할게. docs/HANDOFF_collab-board.md 읽고 시작해줘.
이제 Step 9 릴리즈를 진행할 거야. 타 세션 발제피드백 기능은 머지 끝났어.
MEMORY.md 릴리즈 워크플로우 8단계대로 v1.12.0 준비 시작하자.
```

### QA 이슈 발견 시
```
협업 보드 작업 이어서 할게. docs/HANDOFF_collab-board.md 읽고 시작해줘.
[이슈 설명 — 학생 접속 안 됨 / 자동 저장 안 됨 / UI 깨짐 등]
```

### Phase 2 확장 기능 (Undo/Redo·export 등)
```
협업 보드 작업 이어서 할게. docs/HANDOFF_collab-board.md 읽고 시작해줘.
Phase 2 기능 [Undo/Redo 또는 PNG export 등] 계획부터 세우자.
/pdca plan collab-board-phase2 로 시작하면 될까?
```

---

## 🧠 메모리 시스템 자동 활성

아무 말 없이 세션을 시작해도 bkit의 SessionStart hook + Claude auto-memory가 다음을 자동 로드합니다:

- `C:\Users\wnsdl\.claude\projects\e--github-ssampin\memory\MEMORY.md` (인덱스)
  - → `project_collab_board_status.md` (현재 상태 요약)
  - → `feedback_runtime_verification.md` (iter #5 교훈)

이들이 HANDOFF 문서를 가리키므로 Claude가 알아서 상황을 파악합니다. 위 한 줄 프롬프트는 이 과정을 **즉시 강제**하는 역할.

---

*이 파일은 세션 시작 편의용이며, 프로젝트 상태가 크게 달라지면 (Step 9 완료·머지 후) 내용 갱신 필요.*
