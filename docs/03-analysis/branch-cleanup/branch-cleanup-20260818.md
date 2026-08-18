# 로컬 브랜치 정리 기록 (2026-08-18)

`main`에는 없는 커밋을 들고 있던 로컬 브랜치 5개를 조사하고 정리했다.
**지우기 전에 각 브랜치의 끝 커밋 해시를 남긴다** — 브랜치를 지워도 커밋은 한동안
저장소에 남으므로 `git checkout <해시>`로 되살릴 수 있다.
(2026-06-24 정리 때 `4e5483a3`를 남겨둔 것과 같은 방식.)

## 조사 방법

`git cherry origin/main <브랜치>`로 **패치 동등성**을 먼저 봤다.
`-`는 같은 변경이 이미 main에 있다는 뜻이고, `+`는 아직 없다는 뜻이다.
단 `+`가 곧 "빠졌다"는 아니다 — 다른 방식으로 재구현됐을 수 있으므로,
`+`인 경우에는 **실제 파일이 main에 있는지 직접 확인**했다.

## 결과

| 브랜치                             | 끝 커밋    | 판정              | 근거                                                                                       |
| ---------------------------------- | ---------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `fix/brace-expansion-advisory`     | `d385fb23` | 삭제              | `git cherry` = `-` (이미 반영)                                                             |
| `fix/sync-events-download-heal`    | `ca290dd1` | 삭제              | `git cherry` = `-` (이미 반영)                                                             |
| `release/v2.1.0`                   | `0408b517` | 삭제              | 끝 커밋이 **태그 `v2.1.0`과 동일 커밋**이고 태그는 원격에 있음 → 브랜치가 없어도 커밋 보존 |
| `ui/record-draft-visual-polish`    | `f68a096c` | 삭제              | 아래 참조                                                                                  |
| `fix/evidence-excel-control-chars` | `b194b95c` | **main으로 회수** | 아래 참조                                                                                  |

### `fix/evidence-excel-control-chars` — 지우면 안 되는 것이었다

2026-06-26에 완성됐으나 main에 들어오지 못한 **실사용 버그 수정**이었다.

- 증상: 붙여넣기로 섞여 들어온 제어문자 때문에 엑셀 업로드가 "읽는 중 오류"로 실패
- 확인: 당시 main의 `EvidenceExcel.ts`에 제어문자 처리가 **한 줄도 없었고**
  테스트 파일도 없었다 → 재구현이 아니라 **누락**
- 조치: `adc67194`로 cherry-pick 하여 main에 반영. 그물이 실제로 버그를 잡는지
  일시 무력화로 실증한 뒤 커밋했다.

### `ui/record-draft-visual-polish` — 알맹이는 이미 main에 있다

원격 브랜치가 이미 삭제된(`[gone]`) 상태로 로컬에만 커밋 5개(2026-06-22)가 남아 있었다.
`git cherry`는 전부 `+`였지만 실제 파일을 확인하니 대부분 다른 방식으로 반영돼 있었다.

| 브랜치가 건드린 것                                 | main 상태      |
| -------------------------------------------------- | -------------- |
| `src/index.css` color-scheme 분기                  | **있음** (2곳) |
| `src/usecases/aiBridge/applyLiveSyncWrite.ts`      | **있음**       |
| `electron/ipc/aiBridgeLiveSyncCore.ts`             | **있음**       |
| `RecordDraftView.test.tsx`                         | 없음           |
| `useTeachingClassStore.attendanceLiveSync.test.ts` | 없음           |

main에 없는 것은 **테스트 파일 2개뿐**이다. 기능은 살아 있고 그물만 빠진 상태다.
필요해지면 위 해시에서 두 파일만 꺼내 오면 된다.

## 재발 방지

이번에 두 건이 같은 방식으로 묻혀 있었다.

- `f2cd0b02` (위젯 화면 밖 이탈 방지) — 커밋만 되고 푸시가 안 된 채 방치, 2026-08-18에야 푸시됨
- `b194b95c` (엑셀 제어문자) — 브랜치에만 있고 main에 안 들어옴, 2개월 방치

**`git status`는 "main에 없는 커밋을 들고 있는 로컬 브랜치"를 보여주지 않는다.**
세션 시작 시 아래를 한 번 돌리면 드러난다.

```bash
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  n=$(git rev-list --count origin/main..$b)
  [ "$n" -gt 0 ] && echo "$n  $b"
done
```
