# Supabase Edge Function 공유 자산 (\_assets)

Phase 2C PoC + 후속 정식 함수 (`compose-signed-pdf`, `prerender-template-previews`) 에서
공유하는 정적 자산. `_assets/` 는 Supabase Edge Function deploy 의 일부가 아니다 —
함수 코드는 GitHub raw URL 에서 fetch 하거나 deploy 시점에 Storage 에 업로드한다.

## NotoSansKR-Regular.otf (PoC 자산, .gitignore 처리됨)

- 출처: https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf
- 라이선스: SIL Open Font License 1.1 (Noto Sans CJK)
- 용도: A0-2 PoC (`poc-compose-stress`) 에서 한글 footer 텍스트 렌더 검증
- 이 PoC 가 fetch 하는 URL 과 동일. 로컬 reference 용으로만 다운로드 (git 에 commit
  하지 않음 — `.gitignore` 처리)

### 다운로드 방법

```bash
curl -fsSL -o supabase/functions/_assets/NotoSansKR-Regular.otf \
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF/KR/NotoSansKR-Regular.otf"
```

## 후속 (PoC 통과 후) — subset 자산 정식 commit

Plan v2.1 의 Step F.1 에 따라 ~30글자 subset (~20-30KB) 만들어 `_assets/NotoSansKR-subset.ttf`
로 정식 commit. 그 단계에서:

- pyftsubset 또는 subset-font npm 패키지로 subset 생성
- 사용 글자: "행정용, 제출 현황, 미서명, 기준, 숫자 0-9, 콜론 / 슬래시 / 공백"
- `_assets/.gitignore` 에서 OTF 제외 규칙 유지, subset TTF 만 정식 trackcommit
