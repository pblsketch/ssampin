# 칠판 배경 에셋

쌤핀 칠판 도구의 교과별 배경(한반도 지도, 세계 지도)에 사용되는 이미지입니다.

## 파일

| 파일 | 출처 | 라이선스 |
|------|------|---------|
| `korea-map.png` | [Wikimedia Commons — Map of Korea-blank.svg](https://commons.wikimedia.org/wiki/File:Map_of_Korea-blank.svg) | 퍼블릭 도메인 |
| `world-map.png` | [Wikimedia Commons — World map 1942 (SVG).svg](https://commons.wikimedia.org/wiki/File:World_map_1942_(SVG).svg) | 퍼블릭 도메인 |
| `korea-map-thumb.png`, `world-map-thumb.png` | (위 원본에서 재가공) | 위와 동일 |

## 생성 방법

원본 SVG는 `docs/korea-blank.svg`, `docs/world-blank.svg` 에 있습니다.
전처리 스크립트로 다음 PNG 4종이 생성됩니다:

```bash
node scripts/preprocess-chalkboard-maps.mjs
```

파이프라인 개요:
1. sharp로 SVG를 고해상도(1600~2400px) 래스터화
2. 각 픽셀의 밝기(R값)와 원본 알파를 결합하여 "흰색 + 알파" PNG로 변환
3. 감마·최대알파는 타겟별로 다르게 튜닝 (한반도는 fill 진하게, 세계지도는 ocean 완화)

## 주의

- 이 PNG는 **어두운 칠판 배경 위에 얹히도록** 흰색 + 알파로 처리되어 있습니다. 밝은 배경에 그대로 쓰면 거의 보이지 않습니다.
- 원본 SVG를 교체하거나 튜닝 파라미터를 바꾼 뒤에는 위 스크립트를 다시 실행하여 PNG를 재생성하세요.
