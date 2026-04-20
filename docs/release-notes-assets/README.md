# 쌤핀 릴리즈 노트 에셋 (Release Notes Assets)

이 폴더는 **쌤핀 버전 릴리즈 시 사용자 공유용 비주얼 에셋 + 소셜 게시글**을 관리합니다.
블로그, 노션, 인스타그램, 카카오채널, Threads 등에 첨부·게시할 이미지와 글을 생성·보관합니다.

## 구조

```
docs/release-notes-assets/
├── README.md                  (이 파일)
├── CARD-NEWS-STYLE.md         (🔒 카드뉴스 이미지 고정 스타일 — 반드시 준수)
├── THREADS-POST-STYLE.md      (🔒 Threads 타래 글 고정 스타일 — 반드시 준수)
├── templates/                 (재사용 템플릿)
│   ├── _intro-card.template.md
│   ├── _content-card.template.md
│   ├── _outro-card.template.md
│   └── _threads-post.template.md
└── v{VERSION}/                (버전별 산출물)
    ├── source-ssampin-v{VERSION_SLUG}.md
    ├── threads-post.md        (Threads 타래 게시글 — 복붙용)
    ├── cover.png              (baoyu-cover-image, 1:1) ※ 선택
    ├── infographic.png        (baoyu-infographic, 3:4) ※ 선택
    ├── prompts/               (커버·인포그래픽 프롬프트)
    └── cards/                 (인스타 캐러셀 4~7장)
        ├── 01-intro.png
        ├── 02-*.png
        ├── ...
        └── prompts/
```

## 생성 파이프라인

- **백엔드**: `baoyu-imagine` + Google Gemini 3 Pro Image Preview
- **API 키**: `.baoyu-skills/.env` (gitignore 됨)
- **스킬**: `baoyu-cover-image`, `baoyu-infographic`, `baoyu-image-cards` 병행 사용
- **카드뉴스 스타일**: `CARD-NEWS-STYLE.md` 규칙 **엄격 준수**
- **Threads 글 스타일**: `THREADS-POST-STYLE.md` 규칙 **엄격 준수**

## 새 버전 추가 절차

1. `public/release-notes.json`에 새 버전 항목 추가
2. `docs/release-notes-assets/v{VERSION}/` 생성
3. **카드뉴스**:
   - `templates/_{intro,content,outro}-card.template.md`를 `v{VERSION}/cards/prompts/`로 복사 후 치환
   - 카드 1(인트로) 먼저 생성 → 카드 2~N은 카드 1을 `--ref`로 참조하여 병렬 생성
4. **Threads 글**:
   - `templates/_threads-post.template.md`를 `v{VERSION}/threads-post.md`로 복사 후 치환
   - 각 타래 500자 이내, 공감형 마무리 한 줄 필수
5. 커버/인포그래픽이 필요하면 병렬 생성
6. 결과물 검수 후 블로그/노션/SNS 공유

## 레퍼런스

- **v1.10.1**: 카드뉴스 4장 표준 레퍼런스 (커버+인포그래픽도 있음)
- **v1.10.2**: 카드뉴스 6장 + Threads 타래 표준 레퍼런스 (`threads-post.md` 있음)
