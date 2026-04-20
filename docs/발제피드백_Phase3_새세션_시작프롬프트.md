# Phase 3 새 세션 시작 프롬프트

> 새 Claude Code 세션을 열면 아래 메시지를 그대로 붙여넣으세요.
>
> 이 한 문장으로 새 세션이 정확한 컨텍스트로 출발합니다.
> 기존 auto memory가 자동 로드되어 세부 결정과 함정은 전부 따라옵니다.

---

## 복사용 프롬프트

```
쌤핀 "발제 피드백 응답 모아보기" Phase 3 작업 착수.

이전 세션에서 Phase 1(Match 96%)과 Phase 2(Match 97%)를 완료하고 커밋
했습니다. 이번 세션은 Phase 3(이미지 응답 A안 — WebSocket+로컬 파일,
오프라인 보존) 5일 공수 구현입니다.

먼저 docs/발제피드백_Phase3_kickoff.md 를 읽고 상태 체크 3개 돌린 뒤,
Open Questions 4건에 대한 제 결정을 물어봐 주세요.
```

---

## 참고 — 새 세션이 해줄 작업 순서

1. [docs/발제피드백_Phase3_kickoff.md](발제피드백_Phase3_kickoff.md) 읽기
2. **상태 체크 3개**:
   - `git log --oneline -5` → 최근 커밋 `fad6fe9` / `dc6c44f` / `e55e827` / `a0b57e0` / `aaa9d68` 확인
   - `npx tsc --noEmit` → 0 errors
   - `npm test` → 52/52 passing
3. **Open Questions 4건 결정 질의** (Kickoff 문서 §Open Questions):
   1. 이미지 응답을 피드백 월에서도 표시할지
   2. 학생 모바일 업로드 중 네트워크 끊김 처리 방식
   3. Excel zip 번들 파일명 규칙
   4. 이미지 응답 `required: true`일 때 미업로드 submission 처리
4. 결정 받은 후 `/pdca design 발제피드백응답모아보기`로 Phase 3 본문 설계 추가
5. 이후 `/pdca do 발제피드백응답모아보기`로 구현 착수

---

## 이 문서는 언제 삭제?

Phase 3 착수 후 새 세션에서 첫 메시지 복사만 하면 역할 종료. Phase 3 완료 시점에 이 파일과 [발제피드백_Phase3_kickoff.md](발제피드백_Phase3_kickoff.md)를 함께 Archive(`docs/archive/YYYY-MM/`)로 이동하거나 삭제 가능합니다.
