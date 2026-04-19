# 쌤핀 v{VERSION} Threads 타래 게시글 (템플릿)

> **사용법**: 각 타래(Thread 1~{TOTAL_CARDS})를 순서대로 Threads에 게시하고, **각 타래에 대응하는 카드 이미지를 첨부**.
> Thread 2~{TOTAL_CARDS}은 Thread 1의 답글(reply)로 연결해 타래로 만듭니다.
> **첨부**: `cards/01-intro.png` ~ `cards/{LAST_NN}-*.png`
> **글자 수**: 각 포스트 500자 이내
> **스타일 가이드**: `../THREADS-POST-STYLE.md`

---

## Thread 1 (메인 포스트)
**첨부 이미지**: `cards/01-intro.png`

```
쌤핀 v{VERSION} 업데이트 📌 ({YYYY.MM.DD} 릴리즈)

이번엔 '{ONE_LINE_CONCEPT}' 하는 마음으로 {N}가지를 손봤어요.

• {HIGHLIGHT_1}
• {HIGHLIGHT_2}
• {HIGHLIGHT_3}
• {HIGHLIGHT_4}

아래 타래에서 하나씩 소개할게요 👇

#쌤핀 #교사앱 #업데이트
```

---

## Thread 2 (답글 1 / 콘텐츠 1)
**첨부 이미지**: `cards/02-{FEATURE_1_SLUG}.png`

```
1. {FEATURE_1_NAME} — {FEATURE_1_HOOK}

{FEATURE_1_DESCRIPTION_2_3_SENTENCES}

{FEATURE_1_EMPATHY_LINE}
```

---

## Thread 3 (답글 2 / 콘텐츠 2)
**첨부 이미지**: `cards/03-{FEATURE_2_SLUG}.png`

```
2. {FEATURE_2_NAME} — {FEATURE_2_HOOK}

{FEATURE_2_DESCRIPTION}
{선택: 세부 사항 불릿 나열}
• {sub 1}
• {sub 2}
• {sub 3}

{FEATURE_2_EMPATHY_LINE}
```

---

## Thread 4~(N-1) (답글 3~N-2 / 콘텐츠 3~N-2)
동일 포맷 반복. 하이라이트 기능에만 ⭐ 이모지 1개 허용.

---

## Thread {TOTAL_CARDS} (답글 마지막 / CTA)
**첨부 이미지**: `cards/{LAST_NN}-outro.png`

```
지금 바로 업데이트해 보세요 🔔

쌤핀 데스크톱 앱 · ssampin.com

업데이트는 앱 설정 > 앱 정보에서 확인하거나, 위 링크에서 최신 버전을 다운로드하실 수 있어요.

수업에서 써보시고 피드백 주시면 다음 버전에 바로 반영하겠습니다. 감사합니다 🙌

#쌤핀 #SsamPin #교사도구 #교육 #EdTech
```

---

## 📋 발행 체크리스트

- [ ] Thread 1 발행 (카드 01-intro 첨부 필수)
- [ ] Thread 2~{TOTAL_CARDS}을 Thread 1의 답글로 순차 게시
- [ ] 각 타래마다 해당 카드 이미지 첨부
- [ ] 해시태그: 메인 포스트(Thread 1)와 아웃트로(Thread {TOTAL_CARDS})에만
- [ ] 외부 링크(ssampin.com)는 마지막 타래에만 포함
- [ ] 게시 후 인스타그램 교차 공유 고려 (동일 카드 {TOTAL_CARDS}장 캐러셀)
