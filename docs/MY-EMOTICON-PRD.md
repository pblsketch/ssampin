# 내 이모티콘 (Custom Sticker Picker) — PRD

> **문서 버전**: 1.1
> **작성일**: 2026-04-27 (1.0) / 2026-04-27 (1.1 개선사항 반영)
> **프로젝트**: 쌤핀(Ssampin) — 교사용 Electron 데스크톱 앱
> **타겟 플랫폼**: Windows (Phase 1), macOS (Phase 2)
> **모바일 PWA**: 미지원 (데스크톱 전용 기능)

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|----------|
| 1.0 | 2026-04-27 | 초안 작성 |
| 1.1 | 2026-04-27 | Clean Architecture 4레이어 매핑 추가 / Phase 0 PoC 분리 / macOS 전략 / 테스트 전략 / 단축키·클립보드·접근성 fallback 명시 / 스키마 버전 / syncRegistry 사전 등록 |

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| **기능명** | 내 이모티콘 |
| **내부 코드명** | custom-sticker-picker |
| **목적** | AI로 생성한 커스텀 이모티콘을 PC에서 단축키 한 번으로 어디든 붙여넣기 |
| **대상 사용자** | 쌤핀을 사용하는 교사 (카카오톡·디스코드·웹 브라우저 등에서 소통) |
| **핵심 가치** | 나만의 이모티콘을 만들어 두면, 어떤 앱에서든 단축키 → 클릭 → 자동 붙여넣기 |

### 1.1 배경

나노바나나, GPT Image 2 등 AI 이미지 생성 도구로 "나만의 이모지"를 만드는 트렌드가 확산 중이다. 그러나 만든 이미지를 실제 대화에서 사용하려면 매번 파일 탐색기에서 찾아 복사해야 하는 번거로움이 있다.

Windows 기본 이모지 피커(Win+.)는 유니코드 이모지만 지원하며, 커스텀 이미지 등록이 불가능하다. 쌤핀이 이미 보유한 글로벌 단축키 + 팝업 윈도우 인프라(quickAddWindow)를 활용하면 최소 비용으로 이 문제를 해결할 수 있다.

### 1.2 용어 정의

| 용어 | 정의 |
|------|------|
| **이모티콘** | 사용자 대면 용어. UI·메뉴·가이드에서 사용 |
| **스티커 (sticker)** | 코드·내부 문서 용어. 기술적으로 정확한 명칭 |
| **팩 (pack)** | 이모티콘을 묶는 카테고리 단위 (예: "인사", "수업용", "밈") |

### 1.3 용어 일관성 정책

코드/문서/UI 전체에서 다음 매핑을 강제한다:

| 영역 | 용어 |
|------|------|
| 사용자 대면(UI/메뉴/가이드/토스트) | **이모티콘** |
| 코드 식별자 (파일명·클래스·인터페이스·IPC 채널) | **sticker** |
| 도메인 엔티티 | `Sticker`, `StickerPack`, `StickerStore` |
| Repository 포트 | `IStickerRepository` |
| Use Case | `PasteSticker`, `AddSticker`, ... |
| toolRegistry id | `tool-sticker` |

> **검증**: PR 생성 시 grep으로 "emoticon" 식별자가 코드에 들어가지 않았는지 확인 (UI 텍스트는 예외).

### 1.4 현재 코드 구조 (관련 부분)

```
electron/
├── main.ts                    # globalShortcut, clipboard, nativeImage 이미 import
│   ├── quickAddWindow         # 프레임리스·alwaysOnTop·skipTaskbar 팝업 패턴
│   └── comboToAccelerator()   # 단축키 문자열 → Electron Accelerator 변환
├── preload.ts
└── ipc/

src/
├── adapters/components/Tools/ # 쌤도구 페이지 (toolRegistry.ts)
├── infrastructure/storage/    # readData()/writeData() 로컬 JSON
└── widgets/                   # 대시보드 위젯
```

- **프레임워크**: React + TypeScript + Zustand + Tailwind CSS + Electron
- **저장 방식**: `readData`/`writeData`로 로컬 JSON 파일
- **글로벌 단축키**: `ShortcutSyncConfig` 구조로 사용자 커스텀 가능

---

## 2. 사용자 스토리

| # | 스토리 | 우선순위 |
|---|--------|----------|
| US-01 | 교사는 글로벌 단축키(기본 `Ctrl+Shift+E`)를 눌러 **어떤 앱 위에서든** 이모티콘 피커를 열 수 있다. | P0 |
| US-02 | 피커에서 이모티콘을 클릭하면 **클립보드에 PNG로 복사되고, 이전 앱에 자동 붙여넣기**된다. | P0 |
| US-03 | 교사는 PNG/WebP/JPEG/GIF 이미지 파일을 **드래그앤드롭 또는 파일 선택**으로 이모티콘을 등록할 수 있다. | P0 |
| US-04 | 등록 시 이미지가 자동으로 **360×360px 투명배경 PNG로 변환·리사이즈**된다. | P0 |
| US-05 | 교사는 이모티콘에 **이름과 태그**를 붙여 검색할 수 있다. | P0 |
| US-06 | 피커 상단 검색창에 키워드를 입력하면 **태그·이름 기반 필터링**이 즉시 된다. | P0 |
| US-07 | **최근 사용** 이모티콘이 피커 상단에 표시된다. | P1 |
| US-08 | 교사는 이모티콘을 **팩(카테고리)**으로 분류·관리할 수 있다. | P1 |
| US-09 | 이모티콘을 **자주 사용 순**으로 정렬할 수 있다. | P1 |
| US-10 | AI로 이모티콘을 처음 만드는 교사를 위해 **제작 가이드와 예시 프롬프트**가 관리 페이지에 제공된다. | P0 |
| US-11 | 팩 단위로 **내보내기/가져오기**하여 동료 교사와 공유할 수 있다. | P2 |
| US-12 | 이모티콘 등록 시 **AI가 자동 태그를 추천**한다 (이미지 분석). | P2 |
| US-13 | Google Drive 동기화로 **다른 PC에서도 내 이모티콘을 유지**한다. | P2 |
| US-14 | 교사는 **방향키와 Enter**로 마우스 없이 이모티콘을 선택할 수 있다. (접근성) | P0 |
| US-15 | 단축키 등록이 실패(다른 앱이 선점)하면 **즉시 안내**받고 설정에서 변경할 수 있다. | P0 |
| US-16 | 자동 붙여넣기 후 **이전 클립보드 내용을 복원**할지 설정으로 선택할 수 있다. | P1 |

### 2.1 사용자 시나리오 (Happy Path)

```
1. 교사가 카카오톡 채팅창에서 대화 중
2. Ctrl+Shift+E → 화면 중앙에 이모티콘 피커 팝업
3. "화이팅" 검색 → 직접 만든 응원 이모티콘 표시
4. 클릭 → 피커 닫힘 → 카카오톡 채팅창에 이미지 자동 붙여넣기
5. Enter로 전송
```

### 2.2 이모티콘 등록 시나리오

```
1. 쌤핀 메인 > 쌤도구 > "내 이모티콘" 관리 페이지 진입
2. "이모티콘 추가" 버튼 클릭 (또는 영역에 드래그앤드롭)
3. 이미지 파일 선택 (PNG/WebP/JPEG/GIF 지원)
4. 미리보기 표시 + 자동 변환 결과 확인 (360×360 PNG)
5. 이름 입력 ("화이팅"), 태그 입력 ("응원, 힘내, 파이팅")
6. 팩 선택 (기본: "미분류" → "수업용", "인사", 사용자 정의)
7. 저장 → 이모티콘 목록에 추가
```

---

## 3. 기능 요구사항

### 3.1 이모티콘 피커 (Sticker Picker Popup)

#### 3.1.1 윈도우 사양

| 속성 | 값 | 근거 |
|------|----|----|
| 크기 | 400×480px | 카카오톡 이모티콘 상점 팝업과 유사한 비율 |
| 프레임 | frameless, transparent | quickAddWindow 패턴 재활용 |
| 위치 | 화면 중앙 (workArea 기준 상단 22%) | 기존 quickAdd와 동일 |
| z-order | alwaysOnTop, skipTaskbar | 모든 앱 위에 표시 |
| 닫힘 조건 | ESC / 바깥 클릭 / 이모티콘 선택 후 자동 | — |
| 재사용 | hide/show (destroy 안 함) | quickAdd 패턴. 재오픈 속도 확보 |

#### 3.1.2 UI 레이아웃

```
┌─────────────────────────────────┐
│  🔍 검색...              ✕ 닫기 │  ← 검색창 (auto-focus)
├─────────────────────────────────┤
│  ⏱ 최근 사용                     │  ← 최근 사용 (최대 8개, 1줄)
│  [😀][😂][🎉][👋]...            │
├─────────────────────────────────┤
│  📁 수업용                       │  ← 팩별 섹션
│  [img][img][img][img]           │
│  [img][img]                     │
├─────────────────────────────────┤
│  📁 인사                         │
│  [img][img][img]                │
├─────────────────────────────────┤
│  📁 밈                           │
│  [img][img][img][img]           │
│  ...                            │
└─────────────────────────────────┘
```

- 이모티콘 썸네일: **64×64px 그리드** (한 줄 5개)
- 호버 시: 이름 툴팁 + 약간 확대 (1.15×)
- 스크롤: 세로 스크롤, 팩 헤더 sticky

#### 3.1.3 단축키 / 키보드 내비게이션

| 동작 | 기본 바인딩 | 설정 가능 |
|------|------------|----------|
| 피커 열기/닫기 (토글) | `Ctrl+Shift+E` (Win) / `Cmd+Shift+E` (Mac) | O (ShortcutSyncConfig 연동) |
| 검색 포커스 | 피커 열릴 때 자동 | — |
| 검색창 → 그리드 진입 | `Tab` 또는 `↓` | — |
| 이모티콘 이동 | `← ↑ → ↓` | — |
| 이모티콘 선택 | `Enter` 또는 마우스 클릭 | — |
| 팩 섹션 점프 | `Ctrl+1`~`Ctrl+9` | — |
| 닫기 | `ESC` / 피커 밖 클릭 | — |

#### 3.1.4 단축키 등록 실패 fallback (US-15)

`globalShortcut.register()`는 다른 앱이 단축키를 선점한 경우 `false`를 반환한다.

```
[등록 실패 시 처리]
1. 첫 실행: 등록 실패 시 토스트 + 모달
   "단축키 Ctrl+Shift+E가 다른 앱에 의해 사용 중입니다.
    설정 → 단축키에서 변경하거나, 충돌하는 앱을 종료하세요."
2. 자동 대안 제시: Ctrl+Shift+M, Ctrl+Alt+E 순으로 가용성 검사
3. 설정 페이지: 등록 상태(O/X) 실시간 표시 + 재시도 버튼
4. 앱 시작 시 매번 재시도 (다른 앱이 종료된 경우 자동 복구)
```

#### 3.1.5 접근성 (a11y)

- 모든 이모티콘 버튼에 `aria-label="{이름} 이모티콘"` 부여
- 검색창에 `role="searchbox"`, 그리드에 `role="grid"`
- 포커스 링 가시성: Tailwind `focus-visible:ring-2 ring-sp-accent`
- 스크린 리더용 라이브 영역: 검색 결과 개수 announce
- 색상만으로 정보 전달 금지 (호버 효과는 스케일 + 그림자로 보강)

### 3.2 자동 붙여넣기 (Auto-Paste)

핵심 기술 플로우:

```
1. 피커 표시 직전: 현재 포커스 앱의 HWND 기록
2. 사용자가 이모티콘 클릭
3. clipboard.writeImage(nativeImage) → 클립보드에 PNG 복사
4. 피커 hide
5. SetForegroundWindow(previousHwnd) → 이전 앱에 포커스 복원
6. SendInput Ctrl+V → 자동 붙여넣기
7. (약 50ms 딜레이 필요 — 포커스 전환 대기)
```

#### 호환성 목표

| 앱 | 입력 방식 | 지원 여부 |
|----|----------|----------|
| 카카오톡 (Windows) | CF_DIB 클립보드 → Ctrl+V | **P0 필수 테스트** |
| 디스코드 | CF_DIB/CF_PNG → Ctrl+V | O |
| 슬랙 | CF_DIB → Ctrl+V | O |
| 웹 브라우저 (Chrome) | CF_DIB → Ctrl+V | O |
| MS Teams | CF_DIB → Ctrl+V | O |

#### 폴백 모드

자동 붙여넣기가 실패하거나 지원되지 않는 앱의 경우:
- 클립보드에 이미지가 복사된 상태 유지
- 토스트 알림: "이모티콘이 복사되었습니다. Ctrl+V로 붙여넣으세요"
- 설정에서 "자동 붙여넣기 끄기" 옵션 제공

#### 3.2.1 클립보드 복원 정책 (US-16)

**문제**: 이모티콘 사용 시 사용자가 직전에 복사해둔 텍스트/이미지가 무음 손실됨.

| 모드 | 동작 | 기본값 |
|------|------|--------|
| 무복원 (기본) | 클립보드 덮어쓰기 후 복원 안 함. 첫 1회 토스트로 안내 | ✅ ON |
| 자동 복원 | 붙여넣기 완료 후 ~500ms 뒤 이전 클립보드 복원 | OFF |

```typescript
// 자동 복원 모드 의사코드
const previousClipboard = readAllFormats();  // text, image, html
clipboard.writeImage(stickerImage);
await pasteToTargetApp();
await sleep(500);                             // 대상 앱 붙여넣기 완료 대기
restoreClipboard(previousClipboard);
```

> **주의**: 자동 복원은 "붙여넣기 완료" 시점을 정확히 알 수 없어 일부 앱에서 이모티콘이 아닌 이전 내용이 붙는 경합 가능성. 따라서 기본은 OFF.

#### 3.2.2 사용 횟수 카운팅 정책

`usageCount`/`lastUsedAt`은 **클립보드 쓰기 성공 시점**에 +1.
- 자동 붙여넣기 성공/실패 무관 (사용자가 의도한 것은 "사용"이므로)
- 폴백 모드(수동 Ctrl+V 안내)도 동일하게 +1
- `clipboard.writeImage` 자체가 실패하면 카운트 안 됨

### 3.3 이모티콘 관리 (Sticker Manager)

쌤도구 페이지 내 "내 이모티콘" 도구로 진입.

#### 3.3.1 등록

- **입력 포맷**: PNG, WebP, JPEG, GIF, BMP
- **자동 변환 파이프라인**:
  1. 이미지 디코딩 (Electron `nativeImage` 또는 `sharp`)
  2. 투명배경 보정 (JPEG → 배경 제거는 MVP 제외, 흰 배경 유지)
  3. 정사각형 크롭/패딩 (짧은 변 기준 중앙 크롭, 또는 투명 패딩 선택)
  4. 360×360px 리사이즈
  5. PNG로 저장
- **저장 경로**: `{userData}/data/stickers/{stickerId}.png`
- **메타데이터**: JSON 파일 (`stickers-meta.json`)

#### 3.3.2 메타데이터 스키마

```typescript
interface StickerMeta {
  id: string;           // nanoid (10자)
  name: string;         // 사용자 지정 이름
  tags: string[];       // 검색용 태그
  packId: string;       // 소속 팩 ID
  createdAt: string;    // ISO 8601
  usageCount: number;   // 사용 횟수 (자주 사용 정렬용)
  lastUsedAt: string | null;  // 최근 사용 정렬용 (한 번도 안 썼으면 null)
  contentHash?: string; // 동일 이미지 중복 감지용 (SHA-256 16자)
}

interface StickerPack {
  id: string;
  name: string;         // "수업용", "인사", "밈" 등
  order: number;        // 피커 내 표시 순서
  createdAt: string;
}

interface StickerStore {
  schemaVersion: 1;     // 스키마 버전 (마이그레이션용)
  stickers: StickerMeta[];
  packs: StickerPack[];
  settings: {
    autoPaste: boolean;             // 자동 붙여넣기 on/off (기본 ON)
    restorePreviousClipboard: boolean; // 클립보드 복원 (기본 OFF, US-16)
    recentMaxCount: number;         // 최근 사용 표시 개수 (기본 8)
    shortcut: string | null;        // 글로벌 단축키 (null이면 비활성)
  };
}
```

**스키마 마이그레이션 정책** (CLAUDE.md "Repository 구현체에 마이그레이션 로직" 준수):
- `JsonStickerRepository.load()`에서 `schemaVersion`을 검사
- 버전 미일치 시 `migrate(from, to)` 함수가 단계별 변환
- 미래 변경 예시: `schemaVersion: 2`에 `animatedFrames?` 필드 추가 (GIF 지원)

#### 3.3.3 관리 페이지 기능

- 이모티콘 목록 (그리드 뷰, 팩별 필터)
- 추가 / 수정 / 삭제
- 드래그앤드롭 순서 변경
- 팩 CRUD (생성·이름변경·삭제·순서변경)
- 일괄 추가 (폴더 선택 → 내부 이미지 전체 등록)
- 내보내기: 팩 → ZIP (PNG + meta.json)
- 가져오기: ZIP → 팩 복원

### 3.4 이모티콘 제작 가이드 (In-App Guide)

AI 이미지 생성에 익숙하지 않은 교사를 위해, 관리 페이지 내에 **제작 가이드 패널**을 제공한다.
레퍼런스: 까찬이네 ChatGPT 스티커 시트 프롬프트, iPhone/Android 스티커 제작법, 배경제거 도구 비교.

#### 3.4.1 진입점

- 관리 페이지 상단: "이모티콘 만드는 법 💡" 배너 (접기 가능, 첫 방문 시 펼침)
- 이모티콘이 0개일 때: 빈 상태 화면에 가이드 전체 표시
- 이모티콘 추가 모달 하단: "AI로 이모티콘 만들기" 링크

#### 3.4.2 가이드 콘텐츠 구조 (5탭)

**탭 1: ChatGPT로 만들기 (GPT Image)**

```
📱 사용법
1. ChatGPT 앱 또는 chatgpt.com 접속 (GPT-4o 이미지 생성 지원)
2. 아래 프롬프트를 복사하여 붙여넣기
3. 생성된 이미지를 다운로드 (PNG)
4. 쌤핀에 등록!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 추천: 4x4 스티커 시트 (한 번에 16종!)

아래 프롬프트를 사용하면 4x4 격자에 16개 이모티콘이 
한 장에 생성됩니다. 쌤핀이 자동으로 잘라서 등록해줘요.

[📋 복사] 스티커 시트 프롬프트:

"Create a 4x4 grid of 16 cute sticker-style illustrations 
of a Korean female teacher character with short black hair 
and glasses. Each sticker should have:
- A different expression/pose with Korean text
- Transparent background
- Bold outlines, chibi/kawaii style
- Bright pastel colors

The 16 expressions (with text):
1. 안녕! (waving hello)
2. 최고! (thumbs up, sparkling)
3. 화이팅! (fist pump, determined)
4. 감사해요~ (bowing, hearts)
5. 잘했어요! (clapping, stars)
6. 조용~ (finger on lips, shh)
7. 손! (raising hand)
8. 모둠활동! (pointing to group)
9. 쉬는시간~ (stretching, relaxed)
10. 헤헷! (shy laugh, blushing)
11. 졸려요~ (sleepy, zzz)
12. 응?? (confused, question marks)
13. 속상해요 (sad, small tears)
14. 사랑해요 (heart hands)
15. OK! (ok sign, winking)
16. 수고했어요! (waving goodbye, sunset)

Arrange in a neat 4×4 grid with small gaps. 
Output as a single square image."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 개별 프롬프트 (한 개씩 만들기)

[📋 복사] 기본형:
"나를 닮은 귀여운 이모티콘을 만들어줘. 
투명 배경, 심플한 스타일, 360x360 크기"

[📋 복사] 감정 세트 (내 사진 첨부):
"첨부한 사진의 인물을 귀여운 캐릭터로 만들고,
아래 감정별 이모티콘을 4x4 한 장에 그려줘.
감정: 기쁨, 슬픔, 화남, 놀람, 하트, 엄지척, 
      파이팅, 감사, 졸림, 생각중, 울음, 
      부끄러움, 배고픔, 신남, 당황, 멍때림
투명 배경, 볼드 아웃라인, 파스텔 색감"

[📋 복사] 수업용 세트:
"선생님 캐릭터 이모티콘을 만들어줘.
'잘했어요!', '조용히', '손들어', '모둠활동', 
'쉬는시간', '칭찬해요', '숙제!', '화이팅' 
상황을 표현해줘.
투명 배경, 밝고 귀여운 스타일, 4x4 격자 한 장"

[📋 복사] 텍스트 포함형:
"'최고!' 라는 한글 텍스트가 들어간 귀여운 이모티콘.
별과 반짝이 장식, 투명 배경, 360x360.
볼드 텍스트, 파스텔 배경 장식"

💡 프롬프트 팁
- 사진을 첨부하면 나를 닮은 캐릭터로 만들어줘요
- "4x4 grid" + "neat gaps"가 핵심 키워드
- 한국어 텍스트를 넣으려면 영어 프롬프트에 
  한국어를 따옴표로 감싸세요 (예: "안녕!" (waving))
- "chibi style" 또는 "kawaii style"이 이모티콘에 최적

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✂️ 스티커 시트 → 개별 이모티콘 분할하기

방법 1: 쌤핀 자동 분할 (등록 시 격자 선택)
→ 스티커 시트 이미지를 등록하면 쌤핀이 
  자동으로 개별 이모티콘으로 잘라줘요!

방법 2: ChatGPT에게 직접 분할 요청
→ 시트 이미지가 브라우저에서 안 열리거나
  쌤핀 분할이 마음에 안 들 때 활용

[📋 복사] ChatGPT 분할 프롬프트:
"지금 첨부한 이미지를 16개 카톡용 스티커 
이미지로 잘라줘.
흰 배경 유지, 정사각형, 여백 적당히, 
파일명은 문구별로 정리하고 
개별로 다운로드 받을 수 있게 만들어줘."

💡 갯수는 실제 시트에 맞게 수정하세요!
```

**탭 2: 내 사진으로 만들기 (배경 제거)**

```
📸 이미 가지고 있는 사진을 이모티콘으로!

AI 생성 없이도 사진에서 배경만 제거하면 
바로 이모티콘으로 쓸 수 있어요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👉 한 줄 정리:
"배경 제거 → PNG 저장 → 쌤핀에 등록"
이렇게 해야 스티커처럼 보여요!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 PC 배경 제거 도구

• remove.bg ⭐ 가장 간편
  - remove.bg 접속 → 이미지 업로드 → 자동 제거
  - 무료 1회/일, HD는 유료

• PicsArt 배경 제거 (무료)
  - picsart.com → AI 배경 제거
  - 무료로 충분히 사용 가능

• Photoroom (무료/유료)
  - photoroom.com
  - 가장 깔끔한 결과

• Canva 배경 제거 (Pro)
  - canva.com → 이미지 편집 → 배경 제거
  - 학교 계정이면 교육용 무료 가능

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 배경 제거 → 이모티콘 등록 순서

1. 위 사이트 중 하나에서 사진 배경 제거
2. 반드시 PNG로 다운로드 (JPG는 투명 배경 불가!)
3. 쌤핀 이모티콘 관리 → 추가 → PNG 파일 선택
4. 쌤핀이 자동으로 360x360 리사이즈 처리

⚠️ 네모 사진(배경 있는 상태)으로 보내면 
이모티콘이 아니라 그냥 "사진"처럼 보여요!
배경만 정리하면 👉 완성도 확 올라갑니다!

💡 보너스: 잘 만든 이모티콘은 카카오톡 이모티콘 
스토어에서 판매도 도전 가능! (카카오 이모티콘 스튜디오)
```

**탭 3: 나노바나나 (Nano Banana)**

```
📱 사용법
1. 카카오톡에서 "나노바나나" 검색 → 채널 추가
2. 채팅에서 내 사진을 보내기
3. AI가 귀여운 캐릭터 이모티콘으로 변환!
4. 다양한 표정/포즈가 자동 생성됨
5. 이미지를 저장해서 쌤핀에 등록!

💡 팁
- 정면 얼굴 사진이 가장 잘 나와요
- 여러 스타일 중 선택 가능 (캐릭터형, 실사형 등)
- 생성된 이모티콘은 카톡 대화에서 길게 눌러 저장
- 배경이 있어도 OK → 쌤핀이 자동 배경 처리

🎯 선생님 활용법
- 내 캐릭터로 학생들과 소통
- 학급 단체방에서 분위기 UP
- "우리 반 선생님 이모티콘" → 아이들이 좋아해요!
```

**탭 4: 기타 AI 도구**

```
🎨 추천 AI 이미지 도구

• Microsoft Designer (무료) ⭐ 추천
  - designer.microsoft.com
  - "sticker style emoji" 키워드 추가
  - Microsoft 계정만 있으면 무료
  
• Canva AI (무료/유료)  
  - 이모지 템플릿 + AI 이미지 생성
  - 배경 제거 기능 내장 (Pro)
  - "Magic Media" → 이모티콘 스타일 선택

• 미드저니 (유료, 고급)
  - 최고 품질 스타일
  - 프롬프트 예: "cute chibi sticker of a teacher, 
    kawaii style --style cute --no background"

• 뤼튼 (무료, 한국어 지원) ⭐
  - wrtn.ai → 이미지 생성
  - 한국어 프롬프트 최적화
  - 무료 사용 가능

💡 공통 프롬프트 팁
- "투명 배경" 또는 "transparent background" 필수
- "360x360" 또는 "square" 크기 지정
- "스티커 스타일" / "emoji style" / "chibi" 추가
- 같은 캐릭터로 여러 감정을 한 번에 요청 → 통일감!
- 한글 텍스트를 넣고 싶으면 따옴표로 감싸기
```

**탭 5: 카카오톡에서 예쁘게 보내는 법**

```
💬 카카오톡 이모티콘 전송 꿀팁

이모티콘을 카톡에서 예쁘게 보내려면 
전송 방법이 중요해요!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ 핵심: "사진"이 아닌 "파일"로 보내세요!

❌ 잘못된 방법 (사진으로 전송):
  → 투명 배경이 흰색/검정으로 변함
  → 이미지가 압축되어 흐려짐
  → 이모티콘이 아닌 "사진"처럼 보임

✅ 올바른 방법 (파일로 전송):
  → 투명 배경이 그대로 유지됨!
  → 원본 품질 보존
  → 진짜 이모티콘처럼 보임!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 카톡에서 파일로 보내는 방법:
1. 대화방에서 + 버튼 클릭
2. "파일" 선택 (사진 아님!)
3. 이모티콘 PNG 파일 선택
4. 전송!

💡 쌤핀 자동 붙여넣기는?
→ 쌤핀은 클립보드에 PNG 이미지로 복사하므로
  Ctrl+V로 붙여넣으면 자동으로 "파일" 형태로 
  전송됩니다. 투명 배경이 유지돼요!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎓 교사 활용 시나리오
- 학급 단체방: 칭찬 이모티콘으로 피드백
- 학부모 상담: 부드러운 분위기 연출
- 동료 교사 방: 나만의 캐릭터로 유머
- 온라인 수업: 학생 참여 유도 리액션
```

#### 3.4.3 4x4 스티커 시트 분할

4x4 격자 이미지를 등록하면 쌤핀이 자동으로 16개 개별 이모티콘으로 분할한다.

```
[Phase 1 — ChatGPT 분할 가이드 안내]
쌤핀 자동 분할이 구현되기 전에도, 가이드에서 
ChatGPT 분할 프롬프트를 안내하여 사용자가 
직접 개별 이미지를 받을 수 있도록 한다.
→ 탭 1 하단 "스티커 시트 분할하기" 섹션 참조

[Phase 2 — 쌤핀 자동 분할]
1. 이미지 크기가 정사각형 (가로/세로 비율 ±3% 허용) 이고 1000px 이상
2. "스티커 시트로 등록" 옵션 노출
3. 사용자가 격자 크기 선택 (2x2, 3x3, 4x4)
4. 자동 분할 → 각 셀을 개별 스티커로 등록
5. 빈 셀(투명/단색 95% 이상) 자동 스킵
6. 분할 결과 미리보기 → 사용자 확인 후 일괄 등록
```

```typescript
// Phase 2 자동 분할 인터페이스
interface SheetSplitOptions {
  gridSize: '2x2' | '3x3' | '4x4';   // 격자 크기
  autoDetectEmpty: boolean;             // 빈 셀 자동 스킵
  packName?: string;                    // 분할 결과를 넣을 팩 이름
  autoTag?: boolean;                    // 순서 기반 자동 태그
}
```

#### 3.4.4 프롬프트 템플릿 데이터

코드에 하드코딩하지 않고 JSON으로 관리하여 업데이트 용이하게:

```typescript
interface PromptTemplate {
  id: string;
  title: string;             // "감정 세트 (16종)"
  emoji: string;             // "😊"
  description: string;       // 카드에 표시할 요약
  prompt: string;            // 복사될 전체 프롬프트
  tool: 'chatgpt' | 'nano-banana' | 'designer' | 'wrtn' | 'any';
  resultCount: number;       // 예상 결과 이모티콘 수
  isSheetPrompt: boolean;    // true면 4x4 시트 프롬프트
  tags: string[];            // 자동 태그 추천용
  theme: 'emotion' | 'classroom' | 'text' | 'reaction' | 'season';
}
```

저장 위치: `src/adapters/constants/stickerPromptTemplates.ts`

**프롬프트 템플릿 카드 UI**:

```
┌ 테마 필터 칩 ─────────────────────────┐
│ [전체] [감정] [수업] [텍스트] [리액션] [계절] │
└────────────────────────────────────────┘

┌─────────────────────────────┐
│  😊 감정 세트 (16종)         │
│  4x4 시트 · ChatGPT 추천    │
│  "같은 캐릭터 16가지 감정     │
│   이모티콘 시트..."          │
│  #감정 #캐릭터               │
│             [📋 복사] [💡 팁] │
├─────────────────────────────┤
│  🏫 수업용 세트 (16종)       │
│  4x4 시트 · ChatGPT 추천    │
│  "선생님 캐릭터 수업 상황     │
│   이모티콘 시트..."          │
│  #수업 #교실                 │
│             [📋 복사] [💡 팁] │
├─────────────────────────────┤
│  📝 텍스트 이모티콘 (16종)   │
│  4x4 시트 · ChatGPT 추천    │
│  "'최고', '화이팅', '감사'   │
│   한글 텍스트 시트..."       │
│  #텍스트 #한글               │
│             [📋 복사] [💡 팁] │
├─────────────────────────────┤
│  🎉 리액션 세트 (16종)       │
│  4x4 시트 · ChatGPT 추천    │
│  "'좋아요', '박수', 'OK'     │
│   리액션 모음 시트..."       │
│  #리액션                     │
│             [📋 복사] [💡 팁] │
├─────────────────────────────┤
│  🌸 계절/행사 세트 (16종)    │
│  4x4 시트 · ChatGPT 추천    │
│  "봄소풍, 운동회, 방학,       │
│   졸업식 행사 이모티콘..."    │
│  #계절 #행사                 │
│             [📋 복사] [💡 팁] │
└─────────────────────────────┘
```

#### 3.4.5 가이드 UX 규칙

- **첫 방문**: 가이드 배너 자동 펼침, "다시 보지 않기" 체크박스
- **이모티콘 0개**: 빈 상태 전체를 가이드로 활용 ("아직 이모티콘이 없어요! 만들어볼까요?")
- **이모티콘 1개 이상**: 가이드는 접힌 상태, 배너 클릭으로 펼침
- **프롬프트 복사 시**: 토스트 "프롬프트가 복사되었어요! ChatGPT에 붙여넣으세요 ✨"
- **외부 링크**: ChatGPT, 나노바나나 등 링크는 `shell.openExternal()`로 기본 브라우저에서 열기
- **탭 기억**: 마지막으로 본 탭을 localStorage에 저장하여 재방문 시 유지
- **시트 등록 유도**: 4x4 시트 프롬프트 복사 시 "스티커 시트로 등록하면 자동 분할돼요!" 안내

#### 3.4.6 가이드 면책 조항 (푸터)

가이드 패널 하단에 다음 안내를 항상 표시:

```
ℹ️ 안내
- AI로 생성한 이미지의 저작권 및 사용 범위는 각 도구의 약관을 따릅니다
  (ChatGPT, Microsoft Designer, 뤼튼, 미드저니 등).
- 카카오톡 이모티콘 스토어 판매를 원하시면 카카오 이모티콘 스튜디오의
  심사 기준과 라이선스를 별도로 확인해주세요.
- 본 가이드는 교사의 개인적 사용을 전제로 합니다.
- 이모티콘에 타인의 사진/캐릭터를 사용할 경우 초상권/저작권 침해에 유의하세요.
```

---

## 4. 기술 설계

### 4.0 Clean Architecture 4레이어 매핑 ⭐ (필독)

[CLAUDE.md](../CLAUDE.md) 의존성 규칙(`domain → usecases → adapters → infrastructure`)을 절대 준수한다.

```
src/
├── domain/                                       # 🟡 외부 의존 0
│   ├── entities/
│   │   ├── Sticker.ts                            # StickerMeta 타입
│   │   └── StickerPack.ts                        # StickerPack 타입
│   ├── valueObjects/
│   │   ├── StickerSize.ts                        # 360×360 보장 (StickerSize.STANDARD)
│   │   └── StickerId.ts                          # nanoid 래핑
│   ├── rules/
│   │   └── stickerRules.ts                       # 검색 필터·정렬·중복 감지·빈 셀 감지·격자 검증
│   └── repositories/
│       └── IStickerRepository.ts                 # 포트
│
├── usecases/sticker/                             # 🟢 domain만 import
│   ├── PasteSticker.ts                           # 클립보드 복사 + usageCount 증가 (Phase 1)
│   ├── AddSticker.ts                             # 등록 (변환은 IStickerImageProcessor 포트로 위임)
│   ├── UpdateSticker.ts                          # 이름·태그·팩 수정
│   ├── DeleteSticker.ts
│   ├── SearchStickers.ts                         # 검색 + 최근/자주 사용 정렬
│   ├── ManagePacks.ts                            # 팩 CRUD
│   ├── SplitStickerSheet.ts                      # 4x4 자동 분할 (Phase 2)
│   ├── ExportPack.ts                             # ZIP 내보내기 (P2)
│   └── ImportPack.ts                             # ZIP 가져오기 (P2, ID 재생성)
│
├── adapters/                                     # 🔵 domain + usecases import
│   ├── components/
│   │   ├── StickerPicker/                        # 글로벌 팝업 (mode=stickerPicker)
│   │   │   ├── StickerPicker.tsx
│   │   │   ├── StickerGrid.tsx
│   │   │   ├── StickerSearchBar.tsx
│   │   │   └── StickerPackSection.tsx
│   │   └── Tools/Sticker/                        # 쌤도구 관리 페이지
│   │       ├── StickerManager.tsx
│   │       ├── StickerUploader.tsx
│   │       ├── StickerEditor.tsx
│   │       ├── StickerPackManager.tsx
│   │       ├── StickerImportExport.tsx
│   │       └── StickerGuidePanel.tsx             # §3.4 5탭 가이드
│   ├── stores/
│   │   └── useStickerStore.ts                    # Zustand
│   ├── repositories/
│   │   └── JsonStickerRepository.ts              # IStickerRepository 구현 + schemaVersion 마이그레이션
│   ├── presenters/
│   │   └── stickerPresenter.ts                   # Domain Sticker → UI ViewModel
│   ├── constants/
│   │   └── stickerPromptTemplates.ts             # §3.4.4 5종 프롬프트 (JSON 데이터)
│   └── di/container.ts                           # IStickerRepository / IStickerImageProcessor / IAutoPaster 조립
│
└── infrastructure/                               # 🔴 외부 기술 구현
    ├── sticker/
    │   ├── StickerImageProcessor.ts              # nativeImage 변환 (포트: IStickerImageProcessor)
    │   ├── AutoPasterWindows.ts                  # nut-js 또는 Win32 FFI
    │   ├── AutoPasterMacOS.ts                    # Phase 2
    │   └── AutoPasterFactory.ts                  # OS 감지 → 적절한 구현 반환
    └── storage/
        └── (기존 ElectronStorageAdapter 재사용)
```

#### 의존성 검증 체크리스트 (PR 리뷰 시)

```
✅ domain/sticker/**.ts → 외부 import 0개
✅ usecases/sticker/**.ts → domain/만 import
✅ adapters/components/StickerPicker/**.tsx → domain + usecases + 같은 레이어 stores
❌ usecases가 nativeImage 직접 import → 금지 (IStickerImageProcessor 포트 경유)
❌ usecases가 useStickerStore import → 금지
❌ infrastructure가 React/Zustand import → 금지
```

#### 포트(Port) 정의

```typescript
// domain/repositories/IStickerRepository.ts
export interface IStickerRepository {
  load(): Promise<StickerStore>;
  save(store: StickerStore): Promise<void>;
}

// domain/ports/IStickerImageProcessor.ts
export interface IStickerImageProcessor {
  /** 임의 이미지를 360×360 PNG로 정규화 */
  normalize(input: Buffer | string): Promise<Buffer>;
  /** N×N 격자 시트를 셀별로 분할 (Phase 2) */
  splitSheet(input: Buffer, gridSize: 2 | 3 | 4): Promise<Buffer[]>;
  /** 빈 셀(투명/단색) 감지 */
  isEmpty(cell: Buffer): Promise<boolean>;
}

// domain/ports/IAutoPaster.ts
export interface IAutoPaster {
  /** 클립보드 쓰기 + 이전 앱 포커스 복원 + Ctrl+V 시뮬레이션 */
  pasteToActiveWindow(image: Buffer): Promise<{ ok: boolean; reason?: string }>;
  /** 현재 OS에서 자동 붙여넣기를 지원하는지 */
  isSupported(): boolean;
}
```

### 4.1 Electron 메인 프로세스

#### 새로운 윈도우: `stickerPickerWindow`

`quickAddWindow`와 동일한 패턴으로 생성. 차이점:

| 항목 | quickAddWindow | stickerPickerWindow |
|------|---------------|---------------------|
| 크기 | 480×440 | 400×480 |
| 콘텐츠 | `?mode=quickAdd` | `?mode=stickerPicker` |
| 글로벌 단축키 | ShortcutSyncConfig에서 관리 | 동일 |
| prewarm | O | O |

#### 새로운 IPC 핸들러 (`electron/ipc/sticker.ts`)

```typescript
// 렌더러 → 메인
'sticker:paste'           // 이모티콘 선택 시: 클립보드 복사 + 포커스 복원 + 자동 붙여넣기
'sticker:list'            // 메타데이터 전체 조회
'sticker:add'             // 이미지 등록 (변환 포함)
'sticker:update'          // 메타데이터 수정
'sticker:delete'          // 삭제
'sticker:reorder'         // 순서 변경
'sticker:export-pack'     // 팩 내보내기 → ZIP
'sticker:import-pack'     // ZIP → 팩 가져오기

// 메인 → 렌더러
'sticker:picker-show'     // 피커 표시 요청 (단축키 트리거)
```

#### 포커스 복원 + 자동 붙여넣기

```typescript
// sticker:paste 핸들러 의사코드
async function handleStickerPaste(stickerId: string) {
  const stickerPath = path.join(getDataDir(), 'stickers', `${stickerId}.png`);
  const image = nativeImage.createFromPath(stickerPath);
  
  // 1. 클립보드에 이미지 복사
  clipboard.writeImage(image);
  
  // 2. 피커 숨기기
  stickerPickerWindow.hide();
  
  // 3. 이전 포커스 앱으로 복원 (Windows)
  //    → 옵션 A: node-ffi-napi로 SetForegroundWindow
  //    → 옵션 B: electron의 app.focus() 제외 후 OS가 자동 복원
  //    → 옵션 C: @nut-tree/nut-js의 mouse/keyboard 모듈
  
  // 4. 짧은 딜레이 후 Ctrl+V 시뮬레이션
  await sleep(80);
  // @nut-tree/nut-js: keyboard.type(Key.LeftControl, Key.V)
}
```

**포커스 복원 방식 선택 (구현 시 결정)**:

| 방식 | 장점 | 단점 |
|------|------|------|
| `node-ffi-napi` + Win32 API | 가장 정확, 작음 | 네이티브 의존성 추가, macOS 별도 작업 |
| `@nut-tree/nut-js` | 키보드 시뮬레이션까지 통합, 크로스플랫폼 | 바이너리 크기 증가 (~15MB) |
| Electron `BrowserWindow` 트릭 | 추가 의존성 없음 | 안정성 불확실 |

→ **MVP 권장: `@nut-tree/nut-js`** (포커스 복원 + 키 입력을 하나의 라이브러리로 해결, Phase 2 macOS 확장 시 추가 작업 최소)
→ **Phase 0 PoC에서 확정** (§7.0)

### 4.1.1 macOS 대응 (Phase 2)

쌤핀은 Windows 외에도 macOS arm64+x64 빌드를 배포 중이다 ([MEMORY](#) 릴리즈 워크플로우 참조). Phase 1은 Windows 전용으로 출시하고, Phase 2에서 macOS를 추가한다.

| 항목 | Windows (Phase 1) | macOS (Phase 2) |
|------|-------------------|------------------|
| 단축키 | `Ctrl+Shift+E` | `Cmd+Shift+E` |
| 클립보드 포맷 | CF_DIB | NSPasteboard `public.png` |
| 포커스 이전 앱 | `SetForegroundWindow(HWND)` | `NSWorkspace.frontmostApplication` 기록 후 `activate()` |
| Ctrl+V 시뮬레이션 | `SendInput` | `CGEventCreateKeyboardEvent(Cmd+V)` |
| **권한 동의** | (불필요) | **Accessibility Permission 필수** |

#### macOS Accessibility Permission 동의 플로우

```
1. 첫 단축키 등록 시도 → 미동의 상태 감지
2. 모달 표시:
   "쌤핀이 다른 앱에 이모티콘을 자동으로 붙여넣으려면
    macOS 접근성 권한이 필요해요.
    [시스템 환경설정 열기] 버튼을 눌러 쌤핀을 허용해주세요."
3. shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
4. 동의 후 앱 재시작 안내
5. 미동의 시 폴백: 클립보드 복사만 + 토스트 "Cmd+V로 붙여넣어주세요"
```

`infrastructure/sticker/AutoPasterFactory.ts`가 OS별 구현을 분기:

```typescript
export function createAutoPaster(): IAutoPaster {
  if (process.platform === 'win32') return new AutoPasterWindows();
  if (process.platform === 'darwin') return new AutoPasterMacOS();
  return new AutoPasterUnsupported();  // 폴백: 클립보드 복사만
}
```

### 4.2 렌더러 (React)

> 컴포넌트 위치는 §4.0 Clean Architecture 매핑 참조.
> Zustand 스토어는 use case 호출만 담당, 비즈니스 로직 금지.

#### toolRegistry 등록

```typescript
// toolRegistry.ts에 추가
'tool-sticker': {
  id: 'tool-sticker',
  name: '내 이모티콘',
  emoji: '😎',
  component: ToolSticker,
}
```

### 4.3 이미지 변환 파이프라인

Electron 메인 프로세스에서 실행 (nativeImage 기반):

```
입력 이미지 (PNG/WebP/JPEG/GIF/BMP)
  ↓
nativeImage.createFromPath() 또는 createFromBuffer()
  ↓
사이즈 확인 → 정사각형 아니면 중앙 크롭 (짧은 변 기준)
  ↓
360×360 리사이즈 (nativeImage.resize({ width: 360, height: 360 }))
  ↓
PNG 버퍼 추출 (image.toPNG())
  ↓
{userData}/data/stickers/{id}.png 저장
```

- `nativeImage`만으로 처리 가능하므로 `sharp` 의존성 불필요 (MVP)
- GIF 입력 시: 첫 프레임만 추출 (애니메이션 미지원, MVP)
- 추후 `sharp` 도입 시: 배경 제거, 고품질 리사이즈, GIF 애니메이션 지원

### 4.4 데이터 저장

```
{userData}/data/
├── stickers/
│   ├── abc123.png
│   ├── def456.png
│   └── ...
└── stickers-meta.json    # StickerStore 전체 (schemaVersion 포함)
```

- 기존 `readData`/`writeData` 패턴과 동일
- Google Drive 동기화는 P2 (기존 동기화 인프라 활용)

### 4.5 syncRegistry 사전 등록 (P2 사전 작업)

[MEMORY](C:\Users\wnsdl\.claude\projects\e--github-ssampin\memory\MEMORY.md) (2026-04-26)에 확립된 **syncRegistry.ts 단일 소스화** 정책 준수. P2 동기화 활성화 전이라도 MVP 시점에 미리 entry를 등록한다.

```typescript
// syncRegistry.ts 추가 항목 (Phase 1 MVP)
{
  id: 'stickers-meta',
  type: 'json',
  filename: 'stickers-meta.json',
  enabled: false,        // P2까지는 동기화 비활성
  store: useStickerStore,
},
{
  id: 'stickers-images',
  type: 'directory',     // PNG 파일들 (신규 type)
  path: 'stickers/',
  enabled: false,
}
```

> **이유**: 4곳 분산 매핑 회귀를 메타테스트 6개로 차단하는 기존 구조를 깨지 않으려면, 신규 도메인은 처음부터 syncRegistry에 등록되어 있어야 한다.

### 4.6 prewarm 메모리 정책

`stickerPickerWindow.prewarm`은 이모티콘 등록 여부에 따라 동적 조정:

| 이모티콘 등록 수 | prewarm 정책 |
|------|-----|
| 0개 | prewarm 비활성 (메모리 0MB) — 첫 등록 시 활성화 |
| 1~500개 | prewarm 활성 (목표 < 50MB) |
| 500개 초과 | 가상 스크롤 (react-virtuoso) + 썸네일 LRU 캐시 |

---

## 5. UI/UX 세부사항

### 5.1 피커 디자인 가이드

- **배경**: 반투명 블러 + 라운드 코너 (quickAdd와 동일)
- **썸네일**: 64×64px, 라운드 8px, 호버 시 1.15× 스케일 + 그림자
- **검색창**: 피커 열릴 때 auto-focus, 입력 즉시 필터링 (debounce 150ms)
- **팩 헤더**: sticky, 접기/펼치기 토글
- **빈 상태**: "아직 이모티콘이 없어요! 쌤도구 > 내 이모티콘에서 추가해보세요" + 바로가기 버튼
- **애니메이션**: fadeIn 160ms ease-out (quickAdd 패턴)

### 5.2 관리 페이지 디자인 가이드

- 쌤도구 페이지 내 **ToolLayout** 래퍼 사용 (onBack, isFullscreen props)
- **PageHeader** 통일 컴포넌트 사용 ([디자인 시스템 v3.2 Audit 90/100](#) 준수)
- 상단: 팩 탭 바 (가로 스크롤) + "전체" 탭
- 메인: 이모티콘 그리드 (96×96px 썸네일, 한 줄 5~8개 반응형)
- 추가 버튼: 점선 테두리 + "+" 아이콘 → 드래그앤드롭 영역 겸용
- 이모티콘 클릭 → 공용 `Modal` 컴포넌트로 상세 편집 (이름, 태그, 팩 변경, 미리보기, 삭제)
- 모서리: `rounded-xl` (카드 기본). `rounded-sp-*` 커스텀 키 사용 금지 ([feedback_rounding_policy](#) 준수)
- z-index: `z-sp-modal`, `z-sp-toast` 시맨틱 토큰 사용 (직접 `z-50` 금지)
- 멀티 모니터: 활성 디스플레이의 `screen.getDisplayNearestPoint(cursor).workArea` 기준 중앙 배치

---

## 6. 비기능 요구사항

| 항목 | 목표 |
|------|------|
| 피커 오픈 속도 | < 200ms (prewarm 상태에서) |
| 이모티콘 등록 (변환 포함) | < 1초 |
| 검색 응답 | < 50ms (로컬 메타데이터 필터링) |
| 최대 등록 수 | 500개 (P0), 2000개 (P2) |
| 피커 메모리 사용 (등록 0개) | 0MB (prewarm 비활성) |
| 피커 메모리 사용 (등록 1~500개) | < 50MB (썸네일 LRU 캐싱 포함) |
| 클립보드 호환 앱 | 카카오톡, 디스코드, 슬랙, Chrome, Edge, Teams |
| 단축키 등록 실패 fallback | 100% (실패 감지 + 토스트 + 설정 페이지 안내) |
| TypeScript strict | 에러 0개 ([CLAUDE.md](../CLAUDE.md) 준수) |
| 기존 테스트 회귀 | 285/285 통과 유지 ([MEMORY](#) v2.0.0 기준) |

---

## 7. 구현 단계

### Phase 0 — 스파이크 / GO·NO-GO 판단 (1~2일) 🚦

§8 최상위 리스크(카카오톡 CF_DIB 미지원)를 본격 구현 전에 검증한다. **Phase 0 NO-GO 시 전체 기획 재검토**.

- [ ] `clipboard.writeImage(nativeImage)` → 카카오톡 PC 채팅창 Ctrl+V 붙여넣기 PoC
- [ ] `@nut-tree/nut-js` Ctrl+V 시뮬레이션 안정성 검증 (10회 연속 성공률)
- [ ] 포커스 복원 딜레이 측정 (50/80/120ms 비교)
- [ ] 6개 타깃 앱(카톡/디스코드/슬랙/Chrome/Edge/Teams) 호환 매트릭스 작성
- [ ] Windows Defender SmartScreen / UAC 영향 평가
- [ ] **GO/NO-GO 결정**: 카카오톡 호환률 80% 이상 → GO, 미만 → 폴백 모드 우선 출시 검토

> 산출물: `docs/spike/sticker-picker-poc.md` + 6개 앱 호환 매트릭스 표

### Phase 1a — MVP 코어 (P0, Windows only)

- [ ] domain 레이어: `Sticker`, `StickerPack`, `IStickerRepository`, `IStickerImageProcessor`, `IAutoPaster`, `stickerRules`
- [ ] usecases: `PasteSticker`, `AddSticker`, `UpdateSticker`, `DeleteSticker`, `SearchStickers`
- [ ] adapters: `JsonStickerRepository` + 마이그레이션, `useStickerStore`, DI 컨테이너 등록
- [ ] infrastructure: `StickerImageProcessor` (nativeImage), `AutoPasterWindows`, `AutoPasterFactory`
- [ ] `stickerPickerWindow` 생성 (quickAdd 패턴 복제, 동적 prewarm)
- [ ] 글로벌 단축키 등록 + **실패 fallback** (US-15, §3.1.4)
- [ ] `sticker:paste` IPC — clipboard.writeImage + 자동 붙여넣기 + 사용횟수 증가
- [ ] 피커 UI (검색 + 그리드 + 팩 섹션) + **키보드 내비게이션** (US-14, §3.1.3)
- [ ] 이모티콘 등록 (파일 선택 → 변환 → 저장, contentHash 중복 감지)
- [ ] 이모티콘 관리 페이지 (쌤도구 내, ToolLayout + PageHeader)
- [ ] 태그 기반 검색
- [ ] syncRegistry 사전 등록 (enabled: false, §4.5)
- [ ] **6개 타깃 앱 호환성 회귀 테스트** (Phase 0에서 작성한 매트릭스 재실행)

### Phase 1b — 제작 가이드 (P0, 코어 출시 후 즉시)

- [ ] `stickerPromptTemplates.ts` (5종 프롬프트 JSON 데이터)
- [ ] `StickerGuidePanel` 5탭 UI
- [ ] 프롬프트 원클릭 복사 + 토스트
- [ ] 4x4 시트 등록 안내 (Phase 1에서는 ChatGPT 분할 가이드만, 자동 분할은 Phase 2)
- [ ] 첫 방문/0개 빈 상태 UX

> Phase 1a/1b 분리 이유: 가이드는 JSON 데이터 변경만으로 출시 후에도 갱신 가능하므로, **MVP 출시 가속**을 위해 코어와 분리.

### Phase 2 — 확장 (P1, macOS 추가 포함)

- [ ] 최근 사용 / 자주 사용 정렬
- [ ] 팩 CRUD + 순서 관리
- [ ] 드래그앤드롭 등록
- [ ] 일괄 추가 (폴더 선택)
- [ ] 이모티콘 순서 드래그 재배치
- [ ] **macOS 지원**: `AutoPasterMacOS` + 접근성 권한 동의 플로우 (§4.1.1)
- [ ] **4x4 시트 자동 분할** (`SplitStickerSheet` use case + `splitSheet` 포트 메서드)
- [ ] 클립보드 복원 모드 (US-16, §3.2.1)

### Phase 3 — 고도화 (P2)

- [ ] 팩 내보내기/가져오기 (ZIP, import 시 ID 재생성)
- [ ] AI 자동 태그 추천 (Gemini API 활용, 기존 인프라)
- [ ] Google Drive 동기화 활성화 (syncRegistry `enabled: true`)
- [ ] GIF 애니메이션 지원 (schemaVersion: 2 마이그레이션)
- [ ] 듀얼 클립보드 포맷 (CF_DIB + CF_PNG, 네이티브 애드온)

---

## 8. 리스크 및 완화

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| 카카오톡에서 CF_DIB 붙여넣기 미지원 | P0 기능 불가 | **Phase 0 PoC**로 사전 검증 (§7.0) |
| 포커스 복원 실패 (일부 앱) | 자동 붙여넣기 불가 | 폴백 모드 (클립보드 복사 + 토스트 안내) |
| 단축키 충돌 (다른 앱이 선점) | 피커 열기 불가 | §3.1.4 fallback (대안 제시 + 설정 페이지) |
| `@nut-tree/nut-js` 바이너리 크기 | 앱 용량 ~15MB 증가 | 필요시 경량 Win32 FFI로 대체 |
| 이모티콘 500개 이상 시 피커 렌더링 성능 | UI 버벅임 | 가상 스크롤 (react-virtuoso) 적용 |
| macOS Accessibility Permission 미동의 | 자동 붙여넣기 불가 | 동의 플로우 모달 + 폴백 모드 (§4.1.1) |
| Windows Defender SmartScreen이 키 시뮬레이션 차단 | 자동 붙여넣기 불가 | 코드 서명된 빌드만 배포 (기존 정책 유지), 실패 시 폴백 |
| 클립보드 손실 (사용자가 이전에 복사한 내용) | UX 저하 | 첫 1회 토스트 안내 + 자동 복원 모드 옵션 (US-16) |
| 자동 붙여넣기 키 시뮬레이션 검출 (보안 SW) | 일부 사내 PC에서 동작 안 함 | 폴백 모드 + 설정에서 자동 붙여넣기 OFF |
| AI 생성 이미지 저작권 분쟁 | 가이드 신뢰도 | 가이드 푸터 면책 조항 (§3.4.6 신설) |
| 4x4 시트가 정확한 정사각형이 아님 | 자동 분할 실패 | 비율 ±3% 허용, 격자 1000px 이상 휴리스틱 |
| 동기화 회귀 ([MEMORY](#) 4곳 분산 매핑 사례) | P2 동기화 깨짐 | MVP 시점 syncRegistry 사전 등록 (§4.5) |

---

## 9. 테스트 전략

[`feedback_runtime_verification`](C:\Users\wnsdl\.claude\projects\e--github-ssampin\memory\feedback_runtime_verification.md) 원칙 준수: **"동작한다"의 기준은 토스트가 아니라 실제 클립보드 바이트와 파일 시스템 상태**.

### 9.1 단위 테스트 (domain rules)

`src/domain/rules/stickerRules.test.ts`:

- 검색 필터: 이름 부분 일치, 태그 정확 일치, 한영 혼용
- 정렬: 최근 사용 순, 자주 사용 순, 등록 순
- 중복 감지: 동일 contentHash 검출
- 빈 셀 감지: 투명 100%, 흰색 100%, 단색 95% 이상
- 격자 검증: 정사각형 ±3%, 1000px 이상

### 9.2 use case 테스트 (mocked ports)

`src/usecases/sticker/PasteSticker.test.ts` 등:

- `IStickerRepository` / `IAutoPaster` / `IStickerImageProcessor` 모두 mock
- `PasteSticker` 실행 시 `usageCount` +1, `lastUsedAt` 갱신 검증
- `AddSticker` 실행 시 contentHash 중복이면 거부
- `ImportPack` 실행 시 ID 재생성 검증

### 9.3 통합 테스트 (Electron IPC)

- `sticker:add` IPC → 실제 PNG 파일이 `{userData}/data/stickers/`에 생성되는지 (바이트 검증)
- `sticker:paste` IPC → `clipboard.readImage()`가 동일 PNG를 반환하는지
- 스키마 마이그레이션: v0(필드 누락) JSON 로드 시 v1로 변환되는지

### 9.4 수동 회귀 체크리스트 (릴리즈 전 필수)

| # | 시나리오 | 카톡 | 디스코드 | 슬랙 | Chrome | Edge | Teams |
|---|----------|:----:|:--------:|:----:|:------:|:----:|:-----:|
| 1 | 단축키 토글 (열기/닫기) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | 클릭 → 자동 붙여넣기 (투명 배경 유지) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | 키보드 내비 (↓→Enter) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | 검색 → 즉시 필터링 (debounce 150ms) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | 폴백 모드 (자동 붙여넣기 OFF) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | 멀티 모니터 (좌/우 화면 모두) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

### 9.5 회귀 안전망

- 기존 285/285 테스트 ([MEMORY](#) v2.0.0) 통과 유지
- syncRegistry 메타테스트 6개 통과 (신규 entry 등록 후)
- TypeScript strict 에러 0개
- `npm run build` 성공 (electron + landing 모두)

---

## 10. 성공 지표

| 지표 | 목표 |
|------|------|
| 이모티콘 등록 사용자 비율 | 쌤핀 활성 사용자의 20% 이상 |
| 일 평균 붙여넣기 횟수 | 등록 사용자 기준 5회 이상 |
| 피커 → 붙여넣기 완료 시간 | 3초 이내 (단축키 → 전송 준비) |
| 카카오톡 호환 성공률 | 95% 이상 |
| 단축키 등록 실패 시 사용자 이탈 | < 5% (fallback이 효과적이어야 함) |
| 자동 붙여넣기 OFF 사용 비율 | < 30% (보안 SW 환경 등) |

---

## 11. 레퍼런스

| 프로젝트 | 참고 포인트 |
|----------|------------|
| [emoji-mart](https://github.com/missive/emoji-mart) (⭐ 9.4k) | 커스텀 이모지 카테고리 주입 API, 검색·최근 사용 UX |
| [CopyQ](https://github.com/hluk/CopyQ) (⭐ 9k) | 이미지 클립보드 관리 + 글로벌 핫키 아키텍처 |
| [PasteBar](https://github.com/PasteBar/PasteBarApp) (⭐ 2k) | React + SQLite 보드/컬렉션 관리 패턴 |
| [Flemozi](https://github.com/KRTirtho/flemozi) (⭐ 308) | pick → auto-copy → close UX 플로우 |
| [Ditto](https://sabrogden.github.io/Ditto/) | Windows HWND 포커스 복원 + 자동 붙여넣기 패턴 |
| [@nut-tree/nut-js](https://nutjs.dev/) | Node.js 키보드 시뮬레이션 (Ctrl+V) |
| [MS PowerToys Advanced Paste](https://github.com/microsoft/PowerToys) | Windows 클립보드 향상 도구 시장 검증 |
| 쌤핀 `quickAddWindow` | 프레임리스 팝업 + 글로벌 단축키 + prewarm 패턴 |
