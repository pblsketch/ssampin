"""
달력 인사 날의 핀 모습 네 장(spec 4-5, 설계서 recap-work-and-moments §7)을 원래 핀 그림에서 만든다.

- 원래 스프라이트(public/sprite-pin.png)의 가만히 있는 자세(0행 0열, 256px)에 소품만 얹는다. 몸 윤곽은 바꾸지 않는다.
- 소품은 '들고 있는' 것처럼(손 뒤로 지나가게 원래 팔을 다시 얹는다), 머리띠는 머리를 '감은' 것처럼 그린다.
- 오너가 2026-09-23 시안을 보고 골랐다. 다시 만들 때: 저장소 루트에서 `python scripts/pin-looks/draw_pin_looks.py`
  (Pillow 필요). `--preview` 를 붙이면 확인용 미리보기 그림도 만든다.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
base = Image.open(ROOT / 'public' / 'sprite-pin.png').convert('RGBA').crop((0, 0, 256, 256))
BA = base.split()[3].load()
BP = base.load()

K = (18, 24, 52, 255)          # 윤곽
RED, RED_D, RED_L = (228, 40, 58, 255), (160, 18, 40, 255), (255, 120, 136, 255)
GRN, GRN_D, GRN_L = (48, 158, 70, 255), (22, 98, 42, 255), (118, 206, 104, 255)
WHT, WHT_S, WHT_D = (252, 252, 252, 255), (214, 220, 232, 255), (170, 178, 196, 255)
YEL, YEL_D, YEL_L = (255, 204, 40, 255), (214, 142, 18, 255), (255, 238, 150, 255)
BRN, BRN_D = (140, 92, 48, 255), (90, 56, 26, 255)

def is_body(x, y):
    return 0 <= x < 256 and 0 <= y < 256 and BA[x, y] > 128

def is_outline(x, y):
    r, g, b, a = BP[x, y]
    return a > 128 and r + g + b < 140

def block(d, x, y, c, u):
    d.rectangle([x, y, x + u - 1, y + u - 1], fill=c)

def pattern(img, rows, x0, y0, u, pal):
    d = ImageDraw.Draw(img)
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch in pal:
                block(d, x0 + i * u, y0 + j * u, pal[ch], u)

def paste_arm(img, side):
    """원본 팔(손)을 다시 위에 얹는다 — 줄기·깃대가 손 '뒤로' 지나가 쥔 것처럼 보이게."""
    x0, x1 = (38, 70) if side == 'left' else (188, 218)
    out = img.load()
    for y in range(126, 168):
        for x in range(x0, x1):
            if is_body(x, y):
                out[x, y] = BP[x, y]

# ── 1. 카네이션: 왼손에 쥐었다 ──
def draw_flower():
    img = base.copy()
    d = ImageDraw.Draw(img)
    # 줄기 — 가는 윤곽(2px) 안에 초록 심(4px). 손 뒤로 지나가 손 아래로 조금 나온다.
    sx = 46
    for y in range(100, 174):
        d.rectangle([sx, y, sx + 1, y], fill=K)
        d.rectangle([sx + 2, y, sx + 5, y], fill=GRN if (y // 6) % 3 else GRN_L)
        d.rectangle([sx + 6, y, sx + 7, y], fill=K)
    # 잎 — 줄기에 붙어 비스듬히
    u = 4
    pattern(img, ['...kk', '..klk', '.kggk', 'kGgk.', 'kkk..'], sx - 18, 110, u, {'k': K, 'g': GRN, 'l': GRN_L, 'G': GRN_D})
    pattern(img, ['kk...', 'klk..', 'kggk.', '.kgGk', '..kkk'], sx + 6, 118, u, {'k': K, 'g': GRN, 'l': GRN_L, 'G': GRN_D})
    # 카네이션 머리 — 위가 톱니처럼 풍성하고 아래는 초록 꽃받침으로 좁아진다
    head = [
        '....k.k.k....',
        '..kkpkpkpkk..',
        '.kpprprprppk.',
        'kprprpRprprpk',
        'kRprRprRprRrk',
        '.kRrRrRrRrRk.',
        '..kkRRRRRkk..',
        '....kgGgk....',
        '....kgggk....',
        '.....kgk.....',
    ]
    pattern(img, head, sx - 22, 62, 4, {'k': K, 'r': RED, 'R': RED_D, 'p': RED_L, 'g': GRN, 'G': GRN_D})
    paste_arm(img, 'left')
    return img

# ── 2. 수능 응원 머리띠: 이마를 둘러 감고 오른쪽에서 묶었다 ──
def draw_headband():
    img = base.copy()
    out = img.load()
    top0, thick, bow = 92, 18, 11        # 띠 위쪽 기준선, 두께, 가운데가 내려오는 정도(원통 앞면이 둥글다)
    xs = [x for x in range(256) if is_body(x, top0 + 8)]
    left, right = min(xs) - 2, max(xs) + 2   # 천 두께만큼 윤곽 밖으로 살짝 나온다
    cx, r = (left + right) / 2, (right - left) / 2
    def top_at(x):
        t = max(0.0, 1 - ((x - cx) / r) ** 2)
        return top0 + bow * math.sqrt(t)
    for x in range(left, right + 1):
        t = (x - cx) / r
        yt = int(round(top_at(x)))
        th = thick - (4 if abs(t) > 0.82 else 2 if abs(t) > 0.65 else 0)
        yt += (thick - th) // 2
        for y in range(yt + th, yt + th + 3):                # 띠 아래 머리에 드리운 그림자
            if is_body(x, y) and not is_outline(x, y):
                r0, g0, b0, a0 = BP[x, y]
                out[x, y] = (int(r0 * 0.55), int(g0 * 0.55), int(b0 * 0.6), a0)
        for y in range(yt, yt + th):
            if y - yt < 2 or y - yt >= th - 2 or x - left < 2 or right - x < 2:
                c = K
            elif t > 0.62 or t < -0.78:
                c = WHT_D                      # 양 끝 — 머리 뒤로 돌아가며 어두워진다
            elif t > 0.28 or t < -0.5:
                c = WHT_S
            else:
                c = WHT
            out[x, y] = c
    # 앞 가운데 빨간 '필승'(띠 곡선을 따라 세로 위치를 옮긴다)
    from PIL import ImageFont
    font = ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf', 12)
    txt = Image.new('L', (40, 16), 0)
    ImageDraw.Draw(txt).text((1, -1), '필승', font=font, fill=255)
    tp = txt.load()
    tw = txt.getbbox()
    w = tw[2] - tw[0]
    x0 = int(cx - w / 2) - tw[0]
    for i in range(40):
        for j in range(16):
            if tp[i, j] > 110:
                x = x0 + i
                y = int(round(top_at(x))) + 3 + j
                if 0 <= x < 256:
                    out[x, y] = RED
    # 오른쪽 옆머리에서 묶은 매듭과, 뒤로 날리는 끈 두 가닥
    kx = right - 8
    ky = int(round(top_at(right - 8))) - 1
    u = 4
    pattern(img, ['.kkkk.', 'kwwwsk', 'kwwssk', 'kwsssk', '.kkkk.'], kx, ky, u, {'k': K, 'w': WHT, 's': WHT_S})
    tail1 = ['kkkk.....', 'kwwwkk...', '.kswwwk..', '..kkssswk', '....kkssk', '......kk.']
    tail2 = ['kkk....', 'kwwk...', 'kswwk..', '.kssk..', '.ksswk.', '..kkkk.']
    pattern(img, tail1, kx + 18, ky + 4, u, {'k': K, 'w': WHT, 's': WHT_S})
    pattern(img, tail2, kx + 12, ky + 16, u, {'k': K, 'w': WHT, 's': WHT_S})
    return img

# ── 3. 깃발: 오른손으로 깃대를 쥐었다 ──
def draw_flag():
    img = base.copy()
    d = ImageDraw.Draw(img)
    u = 5
    px = 203
    for y in range(58, 176, u):
        block(d, px, y, K, u); block(d, px + 5, y, BRN, u); block(d, px + 10, y, K, u)
    block(d, px + 5, 58, YEL, u)                         # 깃대 꼭지
    flag = [
        'kkkkkkk.',
        'kyyyyyyk',
        'kyoyyYk.',
        'kyyyYk..',
        'kyYYk...',
        'kkkk....',
    ]
    pattern(img, flag, px + 15, 62, u, {'k': K, 'y': YEL, 'Y': YEL_D, 'o': YEL_L})
    paste_arm(img, 'right')
    return img

# ── 4. 학기 시작·방학(반짝이, 오너가 고름) ──
def draw_season():
    img = base.copy()
    star = ['...k...', '..kyk..', '.kyoyk.', 'kyoooyk', '.kyoyk.', '..kyk..', '...k...']
    small = ['.k.', 'kok', '.k.']
    pal = {'k': K, 'y': YEL, 'o': YEL_L}
    pattern(img, star, 12, 40, 7, pal)
    pattern(img, star, 200, 20, 7, pal)
    pattern(img, small, 22, 104, 5, pal)
    return img

looks = {
    'flower': draw_flower(),
    'headband': draw_headband(),
    'flag': draw_flag(),
    'season': draw_season(),
}
for name, im in looks.items():
    im.save(ROOT / 'public' / f'pin-look-{name}.png', optimize=True)

if '--preview' in sys.argv:
    cell = 170
    names = [('original', base)] + list(looks.items())
    sheet = Image.new('RGBA', (cell * len(names), 2 * cell + 90), (255, 255, 255, 255))
    for idx, (label, im) in enumerate(names):
        x = idx * cell
        for row, bg in enumerate([(255, 255, 255, 255), (30, 34, 48, 255)]):
            tile = Image.new('RGBA', (cell, cell), bg)
            tile.alpha_composite(im.resize((160, 160), Image.NEAREST), (5, 5))
            sheet.alpha_composite(tile, (x, row * cell))
        strip = Image.new('RGBA', (cell, 90), (240, 242, 246, 255))
        for k, sz in enumerate([24, 28, 48]):
            strip.alpha_composite(im.resize((sz, sz), Image.LANCZOS), (8 + k * 50, 12))
        sheet.alpha_composite(strip, (x, 2 * cell))
    sheet.save(Path.cwd() / 'pin_looks_preview.png')
print('ok')
