# 메모 교실 공유 (memo-classroom-share) — Design v0.2

> 작성: 2026-06-11 · Plan v0.3 기반 · 상태: 구현 진행
>
> **v0.1 → v0.2 변경**: 저장소를 Supabase에서 **선생님 개인 Google Drive**로 전면 교체 (정보 유출 우려, 사용자 결정). 공유한 메모 내용이 쌤핀 서버에 일절 저장되지 않는다.
>
> 확정 결정: 이미지 v1 포함(Drive 파일) / 미니멀 그리드 / 라이트·다크 / 읽기 전용 / 알림음 옵트인(폴링 감지) / PWA 설치 / 5~10초 폴링 반영(사용자 수용)

## 1. 전체 구조

```
[쌤핀 Electron 앱]                    [선생님 개인 Google Drive]        [교실 전자칠판]
useMemoStore (로컬 원본, 무수정)        쌤핀 루트 폴더/                   ssampin.com/memo/{fileId}
useMemoShareStore (신규)                └ 교실 공유 메모/                  ├ 5초 폴링: 메타데이터(version)
 ├ boards + fileId 매핑                    ├ board-{nanoid}.json            │  변경 시에만 본문 fetch
 └ 동기화 큐 (debounce 1.5s)               │   (anyone-with-link reader)    ├ 이미지 <img> 직접 로드
SyncShareBoard (usecase)                   └ img-{itemId}.webp …            ├ diff 감지 → 알림음+하이라이트
MemoShareDriveClient (infra, 신규)         (anyone-with-link reader)        └ /memo/{fileId}/manifest → PWA
 └ 기존 GoogleDriveClient 재사용
   + permissions.create / files.delete
```

핵심 원칙:

- **로컬 메모가 원본.** Drive에는 공유용 스냅샷 JSON + 이미지 파일만 존재
- **쌤핀 서버 무저장.** 데이터 경로는 선생님 PC ↔ Google ↔ 교실 브라우저뿐. (선택 기능인 숏링크만 URL 문자열을 Supabase short_links에 저장 — 내용 아님)
- **읽기 전용은 Google 권한으로 구조 보장.** 링크 공유 권한이 `reader`이므로 페이지 쪽에서 쓰기가 원천 불가. write key 같은 자체 인증 불필요
- 공유 중지 = Drive에서 **영구 삭제**(`files.delete`, 휴지통 경유 없음)

## 2. 데이터 설계

### 2.1 보드 JSON 파일 (Drive, `board-{nanoid}.json`)

```ts
interface MemoShareBoardFile {
  version: 1; // 스키마 버전
  title: string; // 보드 제목 (페이지 헤더)
  updatedAt: string; // ISO 8601 — 페이지 diff 기준
  items: MemoShareItemSnapshot[]; // 최대 50개
}
interface MemoShareItemSnapshot {
  id: string; // 로컬 Memo.id 재사용 (페이지 diff 키)
  content: string;
  color: 'yellow' | 'pink' | 'green' | 'blue';
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  sortOrder: number;
  updatedAt: string; // 항목 단위 — UPDATE 하이라이트 판정
  image?: { fileId: string; width: number; height: number }; // Drive 이미지 파일 ID
}
```

- 폴더: 기존 쌤핀 루트 폴더(`getOrCreateRootFolder`) 아래 `교실 공유 메모/` 서브폴더 (`createSubFolder`)
- 이미지: `img-{itemId}.{ext}` 별도 파일 (png/jpeg/webp — `MEMO_IMAGE_LIMITS` 그대로, 긴 변 800px 기제한)
- JSON·이미지 모두 생성 직후 `permissions.create { type: 'anyone', role: 'reader' }` 적용
- 보드 URL: `https://ssampin.com/memo/{jsonFileId}` — Drive fileId(33자+)는 추측 불가

### 2.2 Electron 로컬 저장 (`storage.write('memoShareBoards', ...)`)

```ts
interface MemoShareBoard {
  readonly id: string; // Drive json fileId
  readonly title: string;
  readonly shareUrl: string; // https://ssampin.com/memo/{fileId}
  readonly shortUrl?: string; // ShortLinkClient 재사용 (선택)
  readonly items: readonly MemoShareItemLink[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
interface MemoShareItemLink {
  readonly memoId: string; // 로컬 Memo.id
  readonly imageFileId?: string; // 업로드된 이미지 Drive fileId
  readonly sortOrder: number;
  readonly lastSyncedAt: string;
  readonly lastSyncedHash: string; // content+color+fontSize+image 해시 — 불필요 push 방지
}
```

## 3. Drive API 사용 계약

### 3.1 쓰기 (Electron, 기존 OAuth `drive.file` 스코프 — 재심사 불필요)

| 동작        | API                                                                            | 비고                            |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------- |
| 보드 생성   | `uploadFile`(기존) + `POST /files/{id}/permissions` {type:anyone, role:reader} | 이미지도 동일                   |
| 보드 갱신   | `updateFile`(기존) — JSON 전체 교체 (media upload)                             | 이미지 추가/교체 시 개별 업로드 |
| 이미지 제거 | `DELETE /files/{imageFileId}` (영구 삭제)                                      |                                 |
| 공유 중지   | 이미지 전부 + JSON `files.delete` 영구 삭제                                    | 휴지통 미경유                   |

`GoogleDriveClient`에 신규 메서드 2개 추가: `createPublicPermission(fileId)`, `deleteFile(fileId)`. 토큰은 기존 생성자 주입(`getAccessToken`) 그대로.

### 3.2 읽기 (교실 페이지, 비로그인 — **Google API 키 필요**)

```
// 변경 감지 (5초 폴링, 응답 ~100B)
GET https://www.googleapis.com/drive/v3/files/{fileId}?fields=version,modifiedTime&key={API_KEY}
// 변경 시에만 본문
GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media&key={API_KEY}
// 이미지 (img 태그 — CORS 불필요)
<img src="https://www.googleapis.com/drive/v3/files/{imageFileId}?alt=media&key={API_KEY}">
```

- 탭이 보이지 않을 때 폴링 중단(`visibilitychange`), 복귀 시 즉시 1회
- 404/403 → "선생님이 공유를 중지했어요" 안내
- 폴링 실패 누적 시 지수 백오프(5s→10s→30s 상한)

### 3.3 사전 준비물 (1회, 사용자 콘솔 작업)

- 기존 쌤핀 GCP 프로젝트에서 **브라우저용 API 키 1개 발급** (Drive API 한정 + HTTP referrer `ssampin.com/*` 제한)
- Vercel(landing) 환경변수 `NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY` 등록
- 이 키는 "공개 파일 읽기"에만 쓰이는 공개 가능 키 (referrer 제한으로 도용 방지). 쿼터: 기본 12,000회/분 — 교실 1대당 분당 12회(메타데이터)이므로 수백 교실 동시 사용 가능

## 4. Electron 앱 설계 (Clean Architecture)

| 레이어   | 파일                                                 | 책임                                                                                                       |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| domain   | `entities/MemoShareBoard.ts`                         | §2.2 엔티티                                                                                                |
| domain   | `entities/MemoShareItem.ts`                          | §2.1 스냅샷 타입 (보드 JSON과 1:1)                                                                         |
| domain   | `ports/IMemoShareClient.ts`                          | createBoard / updateBoard / deleteBoard 포트 (Drive 무지)                                                  |
| domain   | `rules/memoShareRules.ts`                            | computeItemHash(순수 해시) · buildBoardFile(memos→JSON) · diffForSync · MAX_ITEMS=50                       |
| usecases | `memoShare/CreateShareBoard.ts`                      | 선택 memo[] → 이미지 업로드 목록 + 보드 JSON → 포트 호출                                                   |
| usecases | `memoShare/SyncShareBoard.ts`                        | 변경 memoId 큐 → 해시 비교 → 이미지 증분 처리 → JSON 재업로드                                              |
| usecases | `memoShare/StopSharing.ts`                           | 포트 delete → 로컬 보드 제거                                                                               |
| infra    | `google/MemoShareDriveClient.ts`                     | `IMemoShareClient` 구현 — GoogleDriveClient 합성 + 폴더 관리                                               |
| infra    | `google/GoogleDriveClient.ts` (수정)                 | `createPublicPermission` / `deleteFile` 메서드 추가만                                                      |
| adapters | `stores/useMemoShareStore.ts`                        | `useMemoStore.subscribe` 관찰 → debounce 1.5s 큐 → Sync 실행. 오프라인 큐·재시도 3회·"동기화 대기 중" 배지 |
| adapters | `components/Memo/MemoShareModal.tsx`                 | 보드 관리 모달 (`Modal.tsx` + `flex-1 min-h-0`) — 구글 미로그인 시 로그인 유도 화면                        |
| adapters | `components/Memo/MemoShareBadge.tsx`                 | 공유 중 배지                                                                                               |
| adapters | `components/Memo/MemoPage.tsx`·`MemoCard.tsx` (수정) | 버튼·배지 연결 최소 수정                                                                                   |

- 동기화 흐름·UI 구성·개인정보 경고 문구는 v0.1 §4.2~4.3과 동일 (write_key 관련 항목만 삭제)
- **구글 로그인 게이트**: 미로그인 시 모달에서 기존 동기화 로그인 플로우로 유도. 로그인 전 공유 기능 비활성
- 학교 워크스페이스 계정에서 `permissions.create`가 403(정책 차단)으로 실패할 수 있음 → "학교 계정은 링크 공유가 막혀 있을 수 있어요. 개인 구글 계정으로 로그인해 주세요" 안내

## 5. 교실 페이지 (landing `/memo/[id]`) — v0.1 §5와 동일하되 데이터 경로만 교체

- `landing/src/app/memo/[id]/page.tsx` — 서버 셸 (noindex)
- `landing/src/components/memo/MemoBoardContent.tsx` — 클라이언트: §3.2 폴링 + diff(항목 id·updatedAt 기준) → INSERT scale-in+차임 / UPDATE pulse / DELETE fade-out
- `landing/src/components/memo/driveBoardApi.ts` — §3.2 호출 래퍼 + `MemoShareBoardFile` 파싱·검증
- `landing/src/components/memo/useMemoChime.ts` — Web Audio 합성 차임, 5초 스로틀, localStorage 영속, 자동재생 정책 해제
- 미니멀 그리드·라이트/다크·연결 상태 점(폴링 정상=녹색)·타이포 스케일 — v0.1 §5.2 그대로 (다크모드 명도 반전 패치, sp 토큰 투명도 수식 금지)
- 디자인 구현은 frontend-design 협업 의무

## 6. PWA — v0.1 §6과 동일

- `/memo/{id}/manifest.webmanifest` 동적 생성 — 보드 제목은 서버 라우트가 같은 API 키로 Drive JSON fetch하여 name 설정 (실패 시 "우리 반 메모" 폴백)
- `/memo/` scope SW + `beforeinstallprompt` 설치 버튼 + 미지원 브라우저 수동 안내

## 7. 성공 기준 변경분 (plan.md SC 갱신)

- SC-2 실시간: 수정 → **10초 이내** 페이지 반영(폴링 5s + fetch)
- SC-3 읽기 전용: 페이지(비로그인)에서 Drive 쓰기 API 호출 시 401 — Google 권한 구조로 보장
- SC-4: ~~write_key 비노출~~ → **교사 OAuth 토큰이 페이지에 전달되지 않음** (API 키만 사용, 키는 읽기 전용 referrer 제한)
- SC-5 이미지: 공유 중지 후 Drive에서 JSON+이미지 영구 삭제 확인 (`files.get` 404)
- SC-10 (신규) 무서버 저장: 공유 데이터가 Supabase 어디에도 저장되지 않음 (코드 검사 — supabase 호출은 숏링크 한정)

## 8. 테스트 계획 — v0.1 §7 구조 유지, 대상 교체

| 영역     | 테스트                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| domain   | memoShareRules — 해시/diff/buildBoardFile/MAX_ITEMS/이미지 dataUrl 분리                                                            |
| usecases | CreateShareBoard(이미지 업로드 순서·권한 적용), SyncShareBoard(debounce 묶음·해시 skip·오프라인 큐·재시도), StopSharing(전체 삭제) |
| adapters | useMemoShareStore(subscribe 연동·삭제 확인·useMemoStore 무수정 메타테스트)                                                         |
| infra    | MemoShareDriveClient — fetch mock (업로드/권한/삭제 URL·헤더), GoogleDriveClient 신규 메서드                                       |
| landing  | MemoBoardContent — 렌더/diff 하이라이트/테마/404 안내/알림음 토글                                                                  |
| 회귀     | 기존 메모 CRUD + 기존 Drive 동기화 무회귀 (게이트 4종)                                                                             |

## 9. 리스크 & 완화 (v0.2 갱신)

- **학교 워크스페이스 링크 공유 차단** → permissions.create 403 시 개인 계정 안내 (§4)
- **API 키 미발급/미등록** → 페이지가 명확한 설정 오류 화면 표시. 배포 체크리스트에 키 발급 포함
- **JSON 폴링 비용** → 메타데이터(version) 선확인 후 본문 fetch — 변경 없으면 ~100B/5s
- **Drive 쿼터** → 교실당 분당 12회. 키 referrer 제한 + 백오프
- **이미지 다수 보드의 업로드 시간** → 업로드 진행 표시, 항목당 순차 업로드 + 실패 항목만 재시도
- **토큰 만료 중 동기화** → 기존 OAuth 갱신 플로우 재사용, 실패 시 "동기화 대기 중" 배지 유지
- v0.1의 Modal `flex-1 min-h-0`·다크모드 반전·sp 토큰 투명도 금지 항목 유지
