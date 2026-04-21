#!/usr/bin/env python3
"""
Noto Sans KR Regular + Bold 서브셋 생성 스크립트.

사용법:
    python scripts/font-subset/build-subset.py

출력:
    public/fonts/NotoSansKR-Regular.subset.otf
    public/fonts/NotoSansKR-Bold.subset.otf

글리프 범위:
    - U+0020-007E  기본 라틴 (ASCII 인쇄 가능)
    - U+00A0-00FF  라틴-1 보충
    - U+2000-206F  일반 구두점
    - U+2190-21FF  화살표
    - U+25A0-25FF  도형
    - U+AC00-D7A3  한글 음절 (전체 11,172자) — 학생 이름 안전성
    - U+3131-318F  한글 호환 자모
    - U+1100-11FF  한글 자모
    - U+FF00-FFEF  반각/전각 기호

전체 한글 음절 범위를 포함하는 이유:
    계획서 §6-1 은 KS X 1001 2,350자 만 지정했으나,
    쌤핀 앱은 학생 이름 등 사용자 입력 한글을 처리해야 하므로
    KS X 1001 에 없는 희귀 음절(예: '쌤' = U+C2BC 은 KS X 1001 외)이
    박스(▯)로 렌더링되는 리스크를 제거한다.
    크기 trade-off: weight당 ~2MB (KS X 1001 대비 ~5배),
    Regular+Bold 합계 ~4MB. 인스톨러 ~200MB 대비 2% 내외로 수용 가능.
"""

import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

try:
    from fontTools.subset import Subsetter, Options
    from fontTools.ttLib import TTFont
except ImportError:
    print("ERROR: fonttools 미설치. 다음 명령으로 설치:", file=sys.stderr)
    print("    pip install fonttools brotli", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_FONTS = REPO_ROOT / "public" / "fonts"
CACHE_DIR = REPO_ROOT / "scripts" / "font-subset" / ".cache"

# Noto Sans KR 원본 TTF — google/fonts 공식 OFL 저장소 raw URL.
# 변수 폰트(NotoSansKR[wght].ttf) 하나로 Regular·Bold 모두 생성 가능.
FONT_SOURCES = {
    "Variable": [
        # google/fonts OFL 저장소 - 가변 폰트 단일 파일
        "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf",
        "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf",
    ],
}

# 글리프 유니코드 범위
UNICODE_RANGES = [
    (0x0020, 0x007E),  # Basic Latin (printable)
    (0x00A0, 0x00FF),  # Latin-1 Supplement
    (0x2000, 0x206F),  # General Punctuation
    (0x2190, 0x21FF),  # Arrows
    (0x25A0, 0x25FF),  # Geometric Shapes
    (0x1100, 0x11FF),  # Hangul Jamo
    (0x3131, 0x318F),  # Hangul Compatibility Jamo
    (0xAC00, 0xD7A3),  # Hangul Syllables (full)
    (0xFF00, 0xFFEF),  # Halfwidth and Fullwidth Forms
]


def format_size(bytes_size: int) -> str:
    if bytes_size >= 1024 * 1024:
        return f"{bytes_size / (1024 * 1024):.2f} MB"
    if bytes_size >= 1024:
        return f"{bytes_size / 1024:.1f} KB"
    return f"{bytes_size} B"


def download_variable_font() -> Path:
    """원본 가변 TTF 다운로드. 캐시 존재 시 재사용."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / "NotoSansKR-Variable.ttf"

    if cache_path.exists() and cache_path.stat().st_size > 100_000:
        print(f"  [CACHE] Variable: {format_size(cache_path.stat().st_size)}")
        return cache_path

    last_err = None
    for url in FONT_SOURCES["Variable"]:
        try:
            print(f"  [DOWN]  {url}")
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "ssampin-font-subset/1.0"},
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            if len(data) < 100_000:
                raise RuntimeError(f"응답 크기가 너무 작음: {len(data)} bytes")
            cache_path.write_bytes(data)
            print(f"          → {format_size(len(data))} 저장")
            return cache_path
        except (urllib.error.URLError, RuntimeError, OSError) as err:
            print(f"          실패: {err}")
            last_err = err
            continue

    raise RuntimeError(
        f"폰트 다운로드 전부 실패. 마지막 에러: {last_err}"
    )


def instance_variable(src: Path, dst: Path, weight_value: int) -> None:
    """가변 폰트에서 특정 weight 값의 정적 폰트를 추출."""
    from fontTools.varLib.instancer import instantiateVariableFont

    font = TTFont(str(src))
    instance = instantiateVariableFont(font, {"wght": weight_value})
    instance.save(str(dst))
    instance.close()
    font.close()


def subset_font(src: Path, dst: Path) -> int:
    """서브셋 생성 후 반환 크기(bytes)."""
    unicodes = []
    for start, end in UNICODE_RANGES:
        unicodes.extend(range(start, end + 1))

    options = Options()
    options.flavor = None  # .otf 유지
    options.layout_features = ["*"]  # 모든 OpenType 기능 유지
    options.name_IDs = ["*"]
    options.notdef_outline = True  # .notdef 글리프 유지 (렌더링 안전성)
    options.recommended_glyphs = True
    options.hinting = False  # CFF hint 제거로 크기 축소
    options.desubroutinize = True

    font = TTFont(str(src))
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.save(str(dst))
    font.close()

    return dst.stat().st_size


def main() -> int:
    print(f"REPO_ROOT       : {REPO_ROOT}")
    print(f"PUBLIC_FONTS    : {PUBLIC_FONTS}")
    print(f"CACHE_DIR       : {CACHE_DIR}")
    print(f"글리프 합계     : {sum(e - s + 1 for s, e in UNICODE_RANGES)} codepoints")
    print()

    PUBLIC_FONTS.mkdir(parents=True, exist_ok=True)

    print("=== Variable Font 다운로드 ===")
    src = download_variable_font()
    src_size = src.stat().st_size
    print(f"  원본 가변폰트 : {format_size(src_size)}")
    print()

    total_out = 0
    for weight_name, weight_value in (("Regular", 400), ("Bold", 700)):
        print(f"=== {weight_name} (wght={weight_value}) ===")

        # 1) 가변 폰트에서 정적 인스턴스 추출
        static_path = CACHE_DIR / f"NotoSansKR-{weight_name}.static.ttf"
        instance_variable(src, static_path, weight_value)
        static_size = static_path.stat().st_size
        print(f"  정적 인스턴스 : {format_size(static_size)}")

        # 2) 서브셋 생성 (TTF → TTF, pdfme·pdf-lib 모두 호환)
        dst = PUBLIC_FONTS / f"NotoSansKR-{weight_name}.subset.ttf"
        out_size = subset_font(static_path, dst)

        ratio = out_size / static_size * 100
        print(
            f"  [OUT]   {dst.name}: "
            f"{format_size(static_size)} → {format_size(out_size)} ({ratio:.1f}%)"
        )
        total_out += out_size
        print()

    print("=== 합계 ===")
    print(f"  원본 가변폰트 : {format_size(src_size)}")
    print(f"  서브셋 2종    : {format_size(total_out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
