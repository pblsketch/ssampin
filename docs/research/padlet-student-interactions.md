---
template: research
version: 1.0
topic: padlet-student-interactions
date: 2026-04-25
author: oh-my-claudecode:researcher (sonnet)
purpose: 쌤핀 realtime-wall-padlet-mode v2 학생 UX 정교화 입력
---

# 패들렛(Padlet) 학생/참여자 인터랙션 패턴 심층 리서치 보고서

**작성일**: 2026-04-25
**대상 독자**: 쌤핀 개발팀
**목적**: 쌤핀 실시간 게시판/협업 보드 기능 설계 시 Padlet UX 패턴을 레퍼런스로 활용
**주의**: Padlet UI는 빈번하게 업데이트되며, 이 보고서에 기술된 내용은 2024-2025년 공식 문서 및 릴리즈 노트 기준이다. 이후 변경 가능성을 반드시 고려할 것.

---

## 1. Executive Summary

Padlet의 학생 인터랙션은 **"낮은 진입 장벽, 높은 표현 다양성"** 원칙으로 설계되어 있다. 학생은 계정 없이도 URL 하나로 참여 가능하며, 우측 하단 FAB(+ Post 버튼), 보드 더블클릭, 키보드 `C` 단축키 세 가지 경로로 포스트를 시작한다. 2024년 3월 Post Composer 재설계 이후 입력은 **플로팅 모달** 방식으로 통일되었고, 카드는 퍼블리시 전까지 보드에 노출되지 않는다. 텍스트·이미지·동영상·오디오·그리기·GIF·위치·AI 이미지 등 12종 이상의 첨부 타입을 지원하며, 교사가 허용한 타입만 학생에게 노출된다. 레이아웃(Wall/Grid/Stream/Columns/Freeform/Map/Timeline)마다 학생 권한과 이동 자유도가 다르다. 반응은 All emojis/Heart/Thumbs up/Classic 네 가지 모드 중 교사가 하나를 선택하며, 댓글은 텍스트·이미지·동영상·GIF를 지원한다.

---

## 2. 카드 추가 플로우

### 2-1. 진입점 (Entry Points)

학생이 포스트 작성을 시작할 수 있는 경로는 세 가지다.

| 방식 | 설명 | 플랫폼 |
|------|------|--------|
| **FAB (+ Post 버튼)** | 화면 우측 하단 고정 버튼. 가장 기본 진입점 | 데스크톱 + 모바일 |
| **보드 더블클릭** | 빈 공간을 더블클릭하면 포스트 컴포저 오픈 | 데스크톱 |
| **키보드 단축키 `C`** | 포스트 컴포저를 즉시 열기. 게시 후 `Cmd/Ctrl + Enter` | 데스크톱 |

출처: [Add a post to your board - Padlet.help](https://padlet.help/l/en/article/7hwq09wbop-how-to-add-a-post-to-a-padlet), [How to Use Padlet - ClassPoint](https://www.classpoint.io/blog/how-to-use-padlet)

### 2-2. 컴포저 UI: 플로팅 모달

2024년 3월 Post Composer 재설계([padlet.blog/post-composer](https://padlet.blog/post-composer/)) 이전에는 인라인 편집 방식이었다. 현재는 다음과 같이 동작한다.

- 포스트 컴포저가 보드 콘텐츠 위에 **플로팅 패널**로 열린다.
- 이전 방식(인라인 실시간 방송)과 달리, 타이핑 중인 내용은 다른 참여자에게 보이지 않는다.
- **퍼블리시 버튼을 누른 시점에만** 보드에 카드가 등장한다. 즉, **placeholder 선선공개 없음**.
- 다른 참여자가 현재 작성 중임을 알 수 있도록 **Activity Indicator**(아바타 아이콘)가 보드에 표시된다.
- 컴포저를 최소화(minimize)하면 **드래프트**로 저장된다. 드래프트는 기기·세션 간 동기화된다.

출처: [Post composer - Padlet Blog](https://padlet.blog/post-composer/), [Post drafts - Padlet.help](https://padlet.help/l/en/article/ntzysxso3m-post-drafts)

### 2-3. 입력 필드 구성

포스트 컴포저에는 다음 필드가 존재한다.

- **Subject** (제목): 최대 500자
- **Body** (본문): 최대 10,000자
- **Attachments** (첨부): 아이콘 기반 선택 패널
- **Custom Fields** (선택 사항): 교사가 추가한 경우에만 노출 (Number, Date, Single select, Button, Vote, Rating, Score, Text, User, Email, Phone, URL — 12종)
- 교사는 커스텀 placeholder 텍스트 설정 가능. 학생이 타이핑하면 placeholder는 사라진다.
- 교사는 Subject/Body 필드를 **숨기거나 필수(required)로** 지정 가능.

출처: [Post fields - Padlet.help](https://padlet.help/l/en/article/fjy8dv39wg-post-fields), [Post fields customization - Padlet Blog](https://padlet.blog/postfieldscustomization/)

### 2-4. 게시 플로우 요약

```
[진입] FAB 클릭 / 보드 더블클릭 / C 단축키
    ↓
[컴포저 열림] 플로팅 모달 (보드 위에 겹쳐서)
    ↓
[작성] 제목 + 본문 + 첨부 선택
    ↓ (선택) 최소화 → 드래프트 저장 → 나중에 재개
    ↓
[퍼블리시] Publish 버튼 / Cmd+Enter
    ↓
[보드 등장] 이 시점에 다른 참여자에게 카드 노출
    ↓ (모더레이션 ON 시)
[대기] "Awaiting approval" 상태로 점선 표시 → 교사 승인 후 공개
```

---

## 3. 콘텐츠 입력 타입 매트릭스

Padlet은 **12종 이상의 첨부 타입**을 지원한다. 교사가 허용한 타입만 학생 컴포저에 노출된다.

| # | 타입 | 진입 경로 | 모바일 지원 | 주요 특이사항 |
|---|------|-----------|-------------|--------------|
| 1 | **텍스트** | 본문 필드 직접 입력 | O | Bold/Italic/Underline/List/Heading 포맷팅. 최대 10,000자 |
| 2 | **이미지 (파일 업로드)** | 파일 업로드 아이콘 / 드래그앤드롭 | O | `.png`, `.jpg`, `.gif` 등. 다중 업로드(포토앨범) 가능 |
| 3 | **카메라(웹캠/폰 카메라)** | 카메라 아이콘 → Photo Booth | O (앱 필요) | 흑백·세피아 필터 선택 가능. 브라우저 권한 요청 |
| 4 | **동영상 (파일 업로드)** | 파일 업로드 아이콘 | O (앱 필요) | `.mp4` 지원. 자동 자막(30+ 언어). 업로드 후 트리밍 불가 |
| 5 | **웹캠 동영상 녹화** | 동영상 아이콘 → Video Booth | O (앱 필요) | AR 렌즈 필터. 교사가 녹화 시간 제한 설정 가능. 트리밍 가능 |
| 6 | **오디오 녹음** | 마이크 아이콘 | O | 브라우저 마이크 권한 필요. 자동 자막 생성 |
| 7 | **링크 (URL)** | 링크 아이콘 | O | 자동 OG(Open Graph) 미리보기 생성. YouTube/Spotify embed 지원 |
| 8 | **이미지 검색** | 검색 아이콘 | O | 인터넷 이미지, GIF, YouTube 영상, Spotify 오디오, 웹 리소스 탭 분리 |
| 9 | **GIF** | 이미지 검색 내 GIF 탭 | O | Giphy/Tenor 기반 검색 추정 (공식 문서에서 GIF 탭 존재 확인) |
| 10 | **그리기 (Drawing Canvas)** | 그리기 아이콘 | O | 자유 드로잉. AI 이미지 생성도 선택지로 제공 |
| 11 | **위치 (Map Pin)** | 추가 도구 메뉴 | O | 맵 핀이 이미지로 변환되어 첨부 |
| 12 | **AI 이미지 생성** | "I Can't Draw" 아이콘 | O | 텍스트 프롬프트로 AI 이미지 생성 (2024년 추가) |
| 13 | **폴(Poll)** | 추가 도구 메뉴 | O | 포스트 내 투표 위젯 삽입 |
| 14 | **다른 Padlet 링크** | 추가 도구 메뉴 | O | Padlet을 다른 Padlet에 임베드 |
| 15 | **동영상 댓글** | 댓글 영역 내 | O (앱 필요) | Boards 댓글에서 MP4 업로드, 웹캠 녹화, YouTube 검색 (2024 여름 추가) |

출처: [Add a post - Padlet.help](https://padlet.help/l/en/article/7hwq09wbop-how-to-add-a-post-to-a-padlet), [Post an image - Padlet.help](https://padlet.help/l/en/article/dc2qfseey7-how-do-i-post-an-image-on-padlet), [Post videos - Padlet.help](https://padlet.help/l/en/article/drmkz03rmn-post-videos-on-a-padlet), [2024 Summer Release](https://padlet.blog/2024-summer-release/)

**텍스트 포맷팅**: Bold, Italic, Underline, 리스트, 헤딩이 지원되나, 포맷팅 수준은 Notion 수준의 rich text editor가 아니라 기본 마크업 수준이다. (공식 문서에서 명시적으로 확인된 항목만 기재)

---

## 4. 레이아웃별 학생 권한 매트릭스

| 레이아웃 | 설명 | 카드 이동 | 카드 크기 조정 | 섹션 | 주요 학생 용도 |
|---------|------|-----------|--------------|------|--------------|
| **Wall** | 벽돌형 자동 배치. 가장 기본 | 불가 (자동 정렬) | 전역 설정만 (Standard/Wide) | 없음 | 아이디어 브레인스토밍, 집단 의견 수집 |
| **Grid** | 행·열 고정 박스 배치 | 불가 (자동 정렬) | 전역 설정만 | ON/OFF 가능 | 구조화된 분류, 카테고리 정리 |
| **Stream** | 세로 단일 컬럼 (시간순) | 불가 | 전역 설정만 | ON/OFF 가능 | 블로그형 일지, 순차 제출 |
| **Columns (Shelf)** | 레이블 섹션별 세로 정렬 | 섹션 간 이동 가능 (교사 설정에 따라) | 전역 설정만 | 항상 ON | 토론 주제별 정리, KWL 차트 |
| **Freeform (Canvas)** | 자유 위치 배치 | **자유 드래그앤드롭** | 마우스 드래그로 자유 조정 | 없음 | 마인드맵, 개념도, 브레인스토밍 |
| **Map** | 지도 위 핀 배치 | 핀 위치 드래그 가능 | 전역 설정만 | ON/OFF 가능 | 지리 학습, 위치 기반 스토리 |
| **Timeline** | 수평 시간축 (점선) | 시간축 위 위치 지정 가능 | 전역 설정만 | ON/OFF 가능 | 역사 연표, 순서 배열 활동 |
| **Rows** | 수평 타임라인 (점선 없음) | 행 내 위치 조정 | 전역 설정만 | ON/OFF 가능 | 스택 타임라인, 병렬 비교 |
| **Table** | 스프레드시트형 (포스트=행) | 행 순서 변경 | 전역 설정만 | ON/OFF 가능 | 데이터 수집, 폼 대용 |

**핵심 차이점**: Freeform만이 학생이 카드를 자유롭게 드래그하여 위치를 바꿀 수 있다. 나머지 레이아웃은 자동 정렬이며, 학생이 개별 카드 위치를 임의로 변경할 수 없다. Map과 Timeline은 제한적 위치 지정이 가능하다.

**다른 학생 카드 이동**: 교사(Owner/Admin)는 타인 카드를 이동·편집할 수 있다. 학생(Writer)은 원칙적으로 자기 카드만 수정할 수 있으며, Freeform에서 타인 카드를 실수로 이동하는 경우를 방지하려면 교사가 로그인 상태에서만 편집 가능하도록 설정해야 한다. ([Advanced Layouts - Coventry Domains](https://teach.coventry.domains/articles/get-more-out-of-padlet-with-advanced-layouts/))

출처: [Change the format of a board - Padlet.help](https://padlet.help/l/en/article/sja2tkalul-change-the-format-of-a-board), [Padlet layout options - Unimelb](https://lms.unimelb.edu.au/staff/guides/padlet/padlet-layout-options), [How to resize post - Padlet.help](https://padlet.help/l/en/article/ty9c639zno-how-to-resize-post)

---

## 5. 수정·삭제 정책

### 5-1. 편집 가능 여부

- **계정 보유 학생**: 자기 포스트를 **언제든지** 수정·삭제 가능 (시간 제한 없음). 포스트 우상단 `...` 메뉴 → Edit/Delete.
- **게스트(익명, 비로그인) 학생**: 포스트 작성 직후 같은 브라우저 세션 내에서는 편집 가능. **브라우저를 닫고 재접속하면 편집 불가** (세션 종료 시 인증 정보 소실). 이후 편집하려면 보드 Owner에게 연락해야 한다.
- **수정 이력**: Padlet은 공개적인 수정 이력(Version History) 기능을 학생에게 제공하지 않는다. 수정 사실이 다른 참여자에게 별도 표시되지 않는다.

### 5-2. 삭제

- 학생은 자기 포스트를 삭제할 수 있다. 교사 승인 불필요.
- 교사(Owner/Admin)는 모든 포스트를 삭제 가능.
- **Frozen padlet**: 교사가 보드를 동결(Freeze)하면 학생은 신규 포스트 작성 및 기존 포스트 편집/삭제 불가. 열람만 가능.

### 5-3. 콘텐츠 모더레이션

교사가 설정한 모더레이션 수준에 따라 학생 게시 흐름이 달라진다.

| 모드 | 동작 | 학생 화면 |
|------|------|---------|
| **None** (기본) | 즉시 게시 | 즉시 보드에 등장 |
| **Auto** | Safety Net AI가 부적절 콘텐츠 자동 감지 → 교사에게 이메일 알림 | 부적절 시 차단, 그 외 즉시 게시 |
| **Manual - Students only** | 모든 학생 포스트가 승인 대기 | 점선(Boards) 또는 "Awaiting approval" 표시 |
| **Manual - All** | 교사 포스트 포함 모든 포스트가 승인 대기 | 동일 |

Auto 모더레이션 감지 카테고리: 성적 콘텐츠, 폭력, 불링, 약물, 무기, 욕설, 아동 안전 위협 (7가지).

출처: [Content moderation - Padlet.help](https://padlet.help/l/en/article/v6iz7bhhl1-turn-on-content-moderation), [How student accounts work - Padlet.help](https://padlet.help/l/en/article/l460zmngx8-how-student-accounts-work-at-padlet)

---

## 6. 인터랙션 — 반응·댓글·멘션

### 6-1. 반응(Reactions)

교사가 활성화한 경우에만 사용 가능하다. Reader 권한 사용자는 반응 불가.

| 모드 | 설명 |
|------|------|
| **All emojis** | 이모지 피커에서 임의 이모지 선택 |
| **Heart** | 하트 이모지 고정 |
| **Thumbs up** | 엄지 위 이모지 고정 |
| **Classic** | 네 가지 클래식 이모지 중 선택 |
| **Off** | 반응 비활성 |

- 로그인 사용자는 포스트당 반응 **1회**. 수정/제거 가능.
- 시크릿 모드에서는 동일 포스트에 중복 반응 가능(제한 우회).
- 반응 수에 따른 정렬을 위해서는 **Vote/Rating/Score 커스텀 필드**를 별도 추가해야 한다. 반응 수만으로는 자동 정렬되지 않는다.

출처: [Reactions - Padlet.help](https://padlet.help/l/en/article/kdpo2vjj1s-reactions-how-to-add-grades-ratings-likes-to-posts)

### 6-2. 댓글(Comments)

- 교사가 활성화하면 포스트 하단에 댓글 박스 등장.
- 댓글에서 지원하는 콘텐츠 타입: 텍스트, 이미지, GIF, **동영상 (MP4 업로드 / 웹캠 녹화 / YouTube 검색)** — 2024년 여름 추가.
- 댓글은 **단일 레벨** (댓글에 대한 답글 스레드는 공식 문서에서 확인되지 않음).
- Safety Net이 댓글의 이미지·동영상·오디오·텍스트도 모더레이션한다.
- **멘션(@)**: 12종 커스텀 필드 중 **User 필드**를 통해 협력자를 태그할 수 있다. 단, 이것이 본문 내 @멘션인지 별도 필드 태그인지는 공식 문서에서 명확히 분리되지 않는다.

출처: [Add videos to comments - Padlet Blog](https://padlet.blog/add-videos-to-comments/), [Post fields - Padlet.help](https://padlet.help/l/en/article/fjy8dv39wg-post-fields), [2024 Spring Release](https://padlet.blog/2024-spring-release/)

### 6-3. 멀티 선택·일괄 동작

공식 학생 문서에서 학생의 멀티 선택 일괄 동작은 확인되지 않는다. 교사(Owner/Admin)는 "Approve all" 기능으로 다수 포스트를 일괄 승인할 수 있다.

---

## 7. 익명·실명 / 모바일 / 접근성

### 7-1. 익명·실명 정책

| 시나리오 | 표시 방식 |
|---------|---------|
| 계정 없이 접속 | 자동 별칭(fictional name) + 아바타 배정. 학생이 아바타 클릭 → "Change name"으로 닉네임 변경 가능 |
| 계정 로그인 | 실명(계정 이름) 표시 |
| 교사가 "Require log in" 설정 | 비로그인 게스트 포스팅 차단. 모든 기여자 실명 관리 |
| Attribution OFF 설정 | 교사가 작성자 표시 자체를 끄면 익명 게시판 구현 가능 |

- **익명 게스트의 한계**: 브라우저 세션 종료 시 자기 포스트 편집 권한 소실. 삭제/수정하려면 보드 Owner 문의 필요.
- **Padlet for Schools**: 학교 계정으로 로그인한 학생은 실명이 자동 표시됨. 관리자가 기본 privacy 설정 강제 가능.

출처: [Create anonymous posts - Padlet.help](https://padlet.help/l/en/article/pxz0gx55l9-create-anonymous-posts), [Prevent anonymous posting - Padlet.help](https://padlet.help/l/en/article/dcpa9obioj-how-do-i-prevent-anonymous-posting)

### 7-2. 모바일 vs 데스크톱

| 항목 | 데스크톱 | 모바일 |
|------|---------|--------|
| 포스트 시작 | FAB / 더블클릭 / `C` 단축키 | FAB 탭 (더블탭은 작동하나 주요 경로가 FAB) |
| 컴포저 UI | 플로팅 모달 | 풀스크린에 가깝게 확장 (추정; 공식 문서 명시 없음) |
| 파일 업로드 | 드래그앤드롭 + 파일 선택 | 갤러리 선택 |
| 카메라 | 웹캠 Photo Booth | 기기 카메라 (앱 필요) |
| 동영상 녹화 | Video Booth (브라우저) | Padlet 앱 필요 |
| 화면 녹화 | 지원 (Sandbox) | Padlet 앱 필요 |
| 카드 크기 조정 | 마우스 드래그 (Freeform/Sandbox) | 핀치 줌 (이미지), 손가락 코너 드래그 (Sandbox) |
| 카드 이동 | 드래그 | 터치 드래그 |
| 키보드 단축키 | O | X (해당 없음) |

- iOS 15.1+ / Android 10+ 전용 앱 제공. 계정 없이도 앱 사용 가능.
- 모바일 앱에서는 탭(tap)이 클릭을 대체하며 인터페이스 요소 배치는 동일하게 유지됨.

출처: [Padlet apps - Padlet.help](https://padlet.help/l/en/article/zqolwb4urc-intro-to-mobile-apps), [Change post size - Padlet.help](https://padlet.help/l/en/article/ty9c639zno-how-to-resize-post)

### 7-3. 접근성

| 항목 | 지원 수준 |
|------|---------|
| WCAG 준수 | WCAG 2.2 Level A 준수 (Boards 기준, 2024 가을). AA 작업 중 |
| 키보드 탐색 | Tab/화살표 키 전체 지원. Skip to content. 모든 버튼 키보드 포커스 가능 |
| 키보드 단축키 | `C` (포스트 생성) 등. Settings > Accessibility에서 단일키 단축키 ON/OFF 가능 |
| 스크린 리더 | Mac: VoiceOver, Windows: JAWS·NVDA, iOS: VoiceOver, Android: TalkBack. H1-H3 헤딩 구조 |
| 고대비 모드 | High contrast mode (진한 폰트 + 밑줄). 시스템 설정 연동 가능 |
| 폰트 크기 | 시스템 레벨 텍스트 크기 설정 추종. Padlet 자체 폰트 크기 조정 옵션은 없음 |
| 이미지 Alt Text | 이미지 업로드 후 hover → ALT 버튼 클릭 → 설명 텍스트 입력 |
| 자동 자막 | 동영상·오디오 업로드 시 30+ 언어 자동 자막 생성 |
| 애니메이션 감소 | GIF 자동 재생 OFF (prefers-reduced-motion 연동) |
| 다크 모드 | 포스트 컴포저에서 지원 확인. 전체 UI 다크 모드 여부는 공식 문서에서 명시적 확인 어려움 |
| TTS | AI 음성 읽기 (40+ 언어, 포스트당 최대 1,000자) |

VPAT 문서(WCAG, Section 508, EN 301 549 기준) 제공.

출처: [Padlet Accessibility FAQ - Padlet.help](https://padlet.help/l/en/article/pyr0huo2v4-padlet-accessibility-faq-jib), [Achieving WCAG A compliance - Padlet Blog](https://padlet.blog/achieving-wcag-a-compliance-for-boards/)

---

## 8. 비교 분석 — Padlet vs 유사 도구

| 항목 | Padlet | Mentimeter | (구)Jamboard | Miro |
|------|--------|------------|-------------|------|
| **진입 방식** | URL/QR (계정 불필요) | 코드 6자리 입력 | Google 계정 필요 | 링크 (무료 계정 권장) |
| **포스트 시작** | FAB + 더블클릭 + `C` | 슬라이드 종류별 버튼 | 스티키 버튼 클릭 | 스티키 도구 + 더블클릭 |
| **입력 UX** | 플로팅 모달, 퍼블리시 후 공개 | 실시간 응답 수집, 투표형 | 인라인 즉시 공개 | 인라인 즉시 공개 |
| **미디어 다양성** | 12종+ (동영상/오디오/AI이미지 등) | 텍스트·이미지·순위/투표 중심 | 텍스트·이미지·스케치 | 텍스트·이미지·파일·위젯 |
| **실시간 협업** | Activity Indicator (작성 중 알림) | 실시간 투표/응답 그래프 | 실시간 동시 편집 | 실시간 동시 편집 + 커서 표시 |
| **레이아웃 선택** | 8종 (Wall/Grid/Stream/Columns/Freeform/Map/Timeline/Table) | 슬라이드 기반 단일 구조 | 캔버스 단일 | 무한 캔버스 단일 |
| **모더레이션** | None/Auto/Manual 3단계 | 교사가 제출 후 표시 조절 | 없음(종료됨) | 없음 |
| **학생 이동성** | Freeform만 자유 이동 | 없음 | 자유 이동 | 자유 이동 |
| **한국 교육 적합성** | 로그인 불필요 → 수업 즉시 활용 가능. 모바일 앱 제공 | 빠른 설문/투표에 최적화. 토론보다는 퀴즈 | 서비스 종료 (2024) | 고급 기능 많으나 학습 곡선 높음 |

출처: [Jamboard vs. Mentimeter vs. Padlet - SourceForge](https://sourceforge.net/software/compare/Jamboard-vs-Mentimeter-vs-Padlet/), [Miro vs Padlet - Software Advice](https://www.softwareadvice.com/collaboration/miro-profile/vs/padlet/), [Digital whiteboard comparison - Bournemouth University](https://microsites.bournemouth.ac.uk/flie/2020/07/22/tools-for-engagement-mentimeter-and-padlet/)

**한국 교육 환경 특이 사항**:
- 한국어(IME) 입력에 관한 Padlet 공식 문서는 없다. 그러나 한국 대학에서 Padlet 활용 연구([MDPI, 2024](https://www.mdpi.com/2076-0760/13/5/232))에서 국제 학생들이 한국 문화 수업에 Padlet을 효과적으로 사용했다고 보고됨. 한글 입력 자체의 기술적 문제는 보고되지 않음.
- 한국 중고등학교 환경에서는 모바일 접속 비율이 높으며, Padlet의 URL 기반 비계정 참여 방식은 계정 관리 부담이 없어 수업 적합성이 높다.

---

## 9. 쌤핀 적용 권고 — 우선순위 5건

### Priority 1. 플로팅 모달 포스트 컴포저 + 드래프트 자동저장
- **Padlet 패턴**: 포스트 작성이 보드와 분리된 플로팅 패널. 컴포저 최소화 시 드래프트로 저장. 퍼블리시 전 비공개.
- **쌤핀 적용**: 현재 `StudentSubmitForm.tsx` 모달 기반은 OK. 드래프트 자동저장(localStorage) 추가 권장. 모달 최소화 → 보드로 돌아가기 → 다시 열어 이어쓰기.

### Priority 2. 미디어 타입 선택형 첨부 UI (아이콘 팔레트)
- **Padlet 패턴**: 컴포저 하단 5-7 아이콘 + `...` 더보기.
- **쌤핀 적용**: 이미지 업로드(드래그앤드롭) + 링크 OG 미리보기 1순위. 카메라/그리기는 후순위.

### Priority 3. 학생 측 위치 변경 (Freeform 한정)
- **Padlet 패턴**: Freeform만 학생이 자기 카드 자유 드래그. 다른 레이아웃은 자동 정렬.
- **쌤핀 적용**: 현재 학생은 4 보드 모두 readOnly=true. Freeform에서만 학생도 자기 카드 react-rnd로 드래그 가능하게 하고, 다른 학생 카드 이동은 차단.

### Priority 4. 학생 자기 카드 수정/삭제
- **Padlet 패턴**: 게스트는 같은 브라우저 세션 내 편집 가능. 세션 종료 시 권한 소실.
- **쌤핀 적용**: sessionToken으로 자기 카드 식별 → 수정/삭제 가능. 페이지 새로고침해도 sessionStorage에 토큰 유지되므로 세션 내 일관.

### Priority 5. 키보드 접근성 (`C` 단축키 + ESC 닫기)
- **Padlet 패턴**: `C` 키로 컴포저 열기, Cmd+Enter 게시.
- **쌤핀 적용**: `C` 키 핸들러 추가, 기존 ESC 닫기는 유지. 한글 IME 활성 시 충돌 방지(IME composition 상태 체크).

---

## 10. 출처 링크 일람

| # | 제목 | URL |
|---|------|-----|
| 1 | Getting started with Padlet - Student Edition | [padlet.help](https://padlet.help/l/en/article/t8trtmdfrg-padlet-student-guide) |
| 2 | Add a post to your board | [padlet.help](https://padlet.help/l/en/article/7hwq09wbop-how-to-add-a-post-to-a-padlet) |
| 3 | Post an image on a padlet | [padlet.help](https://padlet.help/l/en/article/dc2qfseey7-how-do-i-post-an-image-on-padlet) |
| 4 | Post videos on a padlet | [padlet.help](https://padlet.help/l/en/article/drmkz03rmn-post-videos-on-a-padlet) |
| 5 | Change the format of a board | [padlet.help](https://padlet.help/l/en/article/sja2tkalul-change-the-format-of-a-board) |
| 6 | Reactions: grades, ratings, likes | [padlet.help](https://padlet.help/l/en/article/kdpo2vjj1s-reactions-how-to-add-grades-ratings-likes-to-posts) |
| 7 | How student accounts work at Padlet | [padlet.help](https://padlet.help/l/en/article/l460zmngx8-how-student-accounts-work-at-padlet) |
| 8 | Create anonymous posts | [padlet.help](https://padlet.help/l/en/article/pxz0gx55l9-create-anonymous-posts) |
| 9 | Prevent anonymous posting | [padlet.help](https://padlet.help/l/en/article/dcpa9obioj-how-do-i-prevent-anonymous-posting) |
| 10 | Content moderation | [padlet.help](https://padlet.help/l/en/article/v6iz7bhhl1-turn-on-content-moderation) |
| 11 | Privacy and permission settings | [padlet.help](https://padlet.help/l/en/article/zwbvogdu7a-privacy-and-permission-settings) |
| 12 | Post fields | [padlet.help](https://padlet.help/l/en/article/fjy8dv39wg-post-fields) |
| 13 | Post drafts | [padlet.help](https://padlet.help/l/en/article/ntzysxso3m-post-drafts) |
| 14 | Padlet apps (mobile) | [padlet.help](https://padlet.help/l/en/article/zqolwb4urc-intro-to-mobile-apps) |
| 15 | Change post size (resize) | [padlet.help](https://padlet.help/l/en/article/ty9c639zno-how-to-resize-post) |
| 16 | Padlet Accessibility FAQ | [padlet.help](https://padlet.help/l/en/article/pyr0huo2v4-padlet-accessibility-faq-jib) |
| 17 | Padlet for Schools permissions | [padlet.help](https://padlet.help/l/en/article/q5e9kv6xk9-padlet-for-schools-permissions) |
| 18 | What is Padlet Sandbox? | [padlet.help](https://padlet.help/l/en/article/8izrmuejli-what-is-sandbox) |
| 19 | Sandbox tools | [padlet.help](https://padlet.help/l/en/article/whxefq76dj-sandbox-tools) |
| 20 | Discussion boards | [padlet.help](https://padlet.help/l/en/article/rxqt1t4c67-discussion-boards) |
| 21 | Post composer redesign (2024) | [padlet.blog](https://padlet.blog/post-composer/) |
| 22 | Post fields customization | [padlet.blog](https://padlet.blog/postfieldscustomization/) |
| 23 | 2024 Spring Release | [padlet.blog](https://padlet.blog/2024-spring-release/) |
| 24 | 2024 Summer Release | [padlet.blog](https://padlet.blog/2024-summer-release/) |
| 25 | 2024 Autumn Release | [padlet.blog](https://padlet.blog/2024-autumn-release/) |
| 26 | 2024 Winter Release | [padlet.blog](https://padlet.blog/the-2024-winter-release/) |
| 27 | Add videos to comments | [padlet.blog](https://padlet.blog/add-videos-to-comments/) |
| 28 | Achieving WCAG A compliance for boards | [padlet.blog](https://padlet.blog/achieving-wcag-a-compliance-for-boards/) |
| 29 | Introducing Padlet Sandbox | [padlet.blog](https://padlet.blog/introducing-padlet-sandbox/) |
| 30 | Padlet layout options - Unimelb | [unimelb.edu.au](https://lms.unimelb.edu.au/staff/guides/padlet/padlet-layout-options) |
| 31 | Get More out of Padlet with Advanced Layouts | [coventry.domains](https://teach.coventry.domains/articles/get-more-out-of-padlet-with-advanced-layouts/) |
| 32 | How to use Padlet - ClassPoint | [classpoint.io](https://www.classpoint.io/blog/how-to-use-padlet) |
| 33 | What is Padlet (2026 Guide) - Teachfloor | [teachfloor.com](https://www.teachfloor.com/blog/what-is-padlet) |
| 34 | 20 Ways Students Use Padlet - @TheMerrillsEDU | [themerrillsedu.com](https://www.themerrillsedu.com/blog-1/2024/8/17/20-ways-for-students-to-use-padlet-in-the-classroom) |
| 35 | Padlet in Korea University Study - MDPI | [mdpi.com](https://www.mdpi.com/2076-0760/13/5/232) |
| 36 | Miro vs Padlet - Software Advice | [softwareadvice.com](https://www.softwareadvice.com/collaboration/miro-profile/vs/padlet/) |
| 37 | Jamboard vs Mentimeter vs Padlet - SourceForge | [sourceforge.net](https://sourceforge.net/software/compare/Jamboard-vs-Mentimeter-vs-Padlet/) |
| 38 | Padlet Sandbox - Freeform templates | [padlet.com/site/templates/canvas-v1](https://padlet.com/site/templates/canvas-v1) |
| 39 | Layer posts - Freeform layout | [padlet.help](https://padlet.help/l/en/article/0segolmqqp-how-do-i-layer-posts-on-canvas) |

---

**주의사항 재확인**: Padlet은 기능을 수시로 업데이트하며, 위 내용은 2024-2025년 공식 문서 및 릴리즈 노트 기준이다. 실제 구현 시 최신 Padlet 도움말을 재확인할 것.
