# HANDOFF — 수행평가 채점 (rubric-grading) 구현 세션용 프롬프트

> 아래 프롬프트를 새 Claude Code 세션에 그대로 붙여넣어 사용한다.
> 작성: 2026-06-12 (계획 세션). 계획서: `docs/01-plan/features/rubric-grading.plan.md` (Plan v1.1, 미결 0건)

---

쌤핀(SsamPin)에 '수행평가 채점' 기능을 구현해줘.

## 0. 시작 전 필수 확인

1. `CLAUDE.md`, `PROGRESS.md`, `DECISIONS.md`를 먼저 읽어.
2. **계획서를 정독해: `docs/01-plan/features/rubric-grading.plan.md`** — 이 문서가 단일 진실 원천이고, 모든 요구사항·결정(D1~D8)·도메인 모델·Phase 구분이 들어 있어. 계획서와 이 프롬프트가 충돌하면 계획서를 따라.
3. `git status --short`로 기존 변경 확인. **main 브랜치에서 작업하되, 다른 세션의 미커밋 변경(협업보드 generateBoardHTML.ts·BoardQRCard.tsx, 메모 교실 공유 관련 파일 등)은 절대 건드리지 말 것.** `git add .` 일괄 스테이징 금지 — 항상 명시 경로만.

## 1. 무엇을 만드나 (요약)

수업 관리 페이지에 '수행평가' 탭을 신설(과제 수합 옆)하고:

- **루브릭 빌더**: 수업반당 최대 10개. 평가 요소(1~10개)마다 **자기만의 수준 목록**(2~6개)을 가짐 — 요소마다 수준 개수·이름·배점이 전부 다를 수 있음(D7). 수준마다 성취 설명 선택 입력(D5). 새 요소 추가 시 직전 요소의 수준 구성을 기본값으로 복제.
- **채점 화면**: 왼쪽 학생 명단(완료/부분/결시 표시) + 오른쪽 선택 학생의 루브릭 카드(요소별 블록). 수준 클릭 → 자동 저장, 합계는 **단순 합계만**(D1, 환산·등급 없음). 요소별 특이사항 메모 + 학생별 총평(D6). '결시' 상태 지원(D8, 합계 제외).
- **루브릭 공유**: 다른 수업반(다중 선택)으로 **독립 복사본** 생성(D2) — 구조만 복제, 채점 기록 미포함.
- **엑셀 내보내기**: 번호/이름/요소별 점수/합계. 결시·미채점은 빈칸(0점 강제 금지).
- **피드백 출력(PDF/HWPX)**: 학생 1명/다중/전체 선택, **점수 포함 토글**(끄면 점수·합계 숨김). 요소별 블록 레이아웃(단일 표 불가 — D7 때문).

## 2. Phase 순서 (계획서 §8)

각 Phase 완료 시 검증 게이트 통과 후 다음으로:

1. **Phase 1**: 도메인 모델(`Rubric`, `RubricGrading`, `rubricRules.ts`) + 루브릭 빌더 + 탭 신설
2. **Phase 2**: 채점 화면(카드+목록) + 메모/총평 + 결시 + 합계
3. **Phase 3**: 루브릭 복사 + 엑셀 내보내기
4. **Phase 4**: 피드백 출력 — **PDF 먼저**, HWPX는 착수 전 `HwpxExporter` 렌더링 한계 스파이크(계획서 R-1)

한 세션에서 전부 끝내려 하지 말고, Phase 단위로 검증·기록하면서 진행해.

## 3. 반드시 지킬 제약

- **AI 기능 금지** (자동 채점·문장 생성 일절 없음 — 제품 1순위 원칙)
- `domain/` 레이어 외부 의존성 import 금지, `any` 금지, TypeScript 에러 0
- 하드코딩 HEX 금지 — `sp-*` 토큰. 직각 금지 — Tailwind 기본 라운드 키만(`rounded-xl`=카드 기본, `rounded-sp-*` 금지)
- 모든 UI 텍스트 한국어
- **새 저장 도메인은 `syncRegistry.ts`에 반드시 등록** (Google Drive 동기화 매핑 단일 소스 — 메타테스트 있음)
- 모달은 공용 `Modal.tsx` + 내부 래퍼에 `flex-1 min-h-0` 높이 상속 패턴 준수
- **UI/UX는 frontend-design 에이전트와 협업** (단독 디자인 금지)
- sp-\* 토큰에 Tailwind 투명도 수식(`bg-sp-accent/40`) 사용 금지 — 클래스가 생성되지 않아 조용히 투명 렌더됨

## 4. 코드 기준점

- 탭 구조: `src/adapters/components/ClassManagement/ClassManagementPage.tsx` — `TabId` 유니온 + `TABS` 배열에 추가, 과제 수합(`assignment`) 옆
- 참고 패턴: `ClassAssignmentTab.tsx` (수업반 스코프 탭), `RosterEmptyState` (명단 없음 상태)
- 내보내기: `src/infrastructure/export/XlsxExporter.ts` · `PdfExporter.ts` · `HwpxExporter.ts` 확장
- 상태: Zustand persist 스토어 (`useRubricStore` 신설), 기존 스토어 패턴 참고

## 5. 검증 게이트 (완료 선언 전 필수)

```bash
npx tsc --noEmit          # 에러 0
npm run lint              # 에러 0
npm run test              # Vitest 통과 (신규: rubricRules 합계·한도·가드, 복사 독립성)
npm run regression-check  # 통과
```

수동 검증: 요소 3개(수준 구성 서로 다르게)인 루브릭으로 한 반 채점 → 엑셀 파일 열어 값 확인 → 점수 숨김 PDF 출력해 점수가 정말 안 보이는지 확인. "동작한다"의 기준은 UI 토스트가 아니라 실제 파일 바이트.

## 6. 세션 종료 시

1. `PROGRESS.md`에 완료/진행/블록/다음 기록
2. 새 설계 결정이 있으면 `DECISIONS.md`에 ADR 추가
3. 검증 게이트 결과(실행 명령 + 핵심 출력) 기록
4. 커밋은 작업 단위가 명확히 완료됐을 때만, 명시 경로로
