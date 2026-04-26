"""
annotate-screenshot.py — SsamPin user-guide annotation overlay tool.

Renders numbered amber badges + navy L-connectors + off-white call-out chips
on top of a source screenshot, following the CARD-NEWS-STYLE.md palette.

Usage:
  python scripts/annotate-screenshot.py \
    --source docs/notion-guide/raw/dashboard.png \
    --spec   docs/notion-guide/specs/dashboard.json \
    --out    docs/notion-guide/annotated/dashboard-v4.png

Spec schema (JSON):
  {
    "margin": { "top": 70, "right": 300, "bottom": 70, "left": 300 },  # optional
    "annotations": [
      {
        "target": { "x": 100, "y": 200, "w": 150, "h": 40 },
        "label": "메인 메뉴",
        "sublabel": "9개 페이지 전환",   # optional
        "side": "left",                  # left | right | top | bottom
        "anchor": "top-right",            # optional — badge anchor on target
        "badgeDx": 0, "badgeDy": 0,       # optional pixel nudges
        "chipDx":  0, "chipDy":  0,       # optional chip nudges
        "elbow":   "auto"                 # optional: auto | h-first | v-first
      }
    ]
  }
"""

from __future__ import annotations
import argparse
import json
from pathlib import Path
from typing import Literal, TypedDict, NotRequired

from PIL import Image, ImageDraw, ImageFilter, ImageFont


# -------------------- palette (locked to CARD-NEWS-STYLE.md) --------------------
AMBER        = (245, 158,  11)   # #F59E0B  badge fill
NAVY         = ( 31,  41,  55)   # #1F2937  text / ring / connector
WHITE        = (255, 255, 255)
OFF_WHITE    = (250, 250, 247)   # #FAFAF7  chip fill
SOFT_BORDER  = (232, 229, 222)   # #E8E5DE  chip/frame border
MUTED_SLATE  = (100, 116, 139)   # #64748B  sublabel color
PAGE_BG      = (248, 248, 246)   # #F8F8F6  outer canvas bg

# supersample factor — draw at 2x then downscale with LANCZOS for crisp AA
SS = 2


# -------------------- font loading --------------------
def _find_font(names: list[str], size: int) -> ImageFont.FreeTypeFont:
    """Try each candidate font path; fall back to default (ugly)."""
    candidates = [
        "C:/Windows/Fonts/NotoSansKR-Bold.ttf",
        "C:/Windows/Fonts/NotoSansKR-Medium.ttf",
        "C:/Windows/Fonts/NotoSansKR-Regular.ttf",
        "C:/Windows/Fonts/malgunbd.ttf",
        "C:/Windows/Fonts/malgun.ttf",
    ]
    for n in names:
        for c in candidates:
            if n.lower() in c.lower():
                try:
                    return ImageFont.truetype(c, size)
                except Exception:
                    continue
    return ImageFont.load_default()


def load_fonts(scale: int = SS):
    return {
        "badge":    _find_font(["NotoSansKR-Bold", "malgunbd"], 18 * scale),
        "label":    _find_font(["NotoSansKR-Bold", "malgunbd"], 15 * scale),
        "sublabel": _find_font(["NotoSansKR-Medium", "NotoSansKR-Regular", "malgun"], 12 * scale),
    }


# -------------------- low-level primitives (all operate in supersampled coords) --------------------
def soft_shadow(img: Image.Image, blur: int = 12, offset_y: int = 3, alpha: float = 0.12) -> Image.Image:
    """Return a shadow image for `img` — used by paste_with_shadow."""
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    # build shadow mask from img's alpha, dim it, offset, blur
    mask = img.split()[-1] if img.mode == "RGBA" else img.convert("L")
    tint = Image.new("RGBA", img.size, (31, 41, 55, int(255 * alpha)))
    tint.putalpha(mask)
    shadow.paste(tint, (0, offset_y), tint)
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=blur))
    return shadow


def rounded_rect(size: tuple[int, int], radius: int, fill, border=None, border_w: int = 1) -> Image.Image:
    """Draw a rounded rectangle as RGBA with optional border."""
    w, h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if border:
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=fill, outline=border, width=border_w)
    else:
        d.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=fill)
    return img


def circle(radius: int, fill, ring=None, ring_w: int = 2) -> Image.Image:
    """Filled circle with optional outer ring."""
    d = radius * 2 + (ring_w * 2 if ring else 0)
    img = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    if ring:
        dr.ellipse((0, 0, d - 1, d - 1), fill=ring)
        dr.ellipse((ring_w, ring_w, d - 1 - ring_w, d - 1 - ring_w), fill=fill)
    else:
        dr.ellipse((0, 0, d - 1, d - 1), fill=fill)
    return img


def paste_with_shadow(canvas: Image.Image, obj: Image.Image, xy: tuple[int, int],
                      blur: int = 10, offset_y: int = 2, alpha: float = 0.12):
    """Paste obj at xy with a soft shadow behind."""
    sh = soft_shadow(obj, blur=blur, offset_y=offset_y, alpha=alpha)
    canvas.alpha_composite(sh, xy)
    canvas.alpha_composite(obj, xy)


# -------------------- annotation primitives --------------------
def make_badge(num: int, fonts) -> Image.Image:
    """Amber circle with thin navy ring + white bold number."""
    r = 14 * SS
    ring_w = 2 * SS
    badge = circle(radius=r, fill=AMBER, ring=NAVY, ring_w=ring_w)
    d = ImageDraw.Draw(badge)
    text = str(num)
    bb = d.textbbox((0, 0), text, font=fonts["badge"])
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    # center with slight vertical nudge for Korean digit baseline
    cx = badge.width // 2 - tw // 2 - bb[0]
    cy = badge.height // 2 - th // 2 - bb[1] - 1 * SS
    d.text((cx, cy), text, font=fonts["label"], fill=WHITE)  # use slightly smaller font for digit
    return badge


def make_chip(label: str, sublabel: str | None, fonts) -> Image.Image:
    """Off-white rounded chip with label (navy bold) + optional sublabel (muted)."""
    pad_x = 12 * SS
    pad_y = 8 * SS
    gap_y = 3 * SS
    radius = 6 * SS

    # measure
    tmp = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    td = ImageDraw.Draw(tmp)
    lb_bbox = td.textbbox((0, 0), label, font=fonts["label"])
    lb_w, lb_h = lb_bbox[2] - lb_bbox[0], lb_bbox[3] - lb_bbox[1]

    sub_w = sub_h = 0
    if sublabel:
        sb_bbox = td.textbbox((0, 0), sublabel, font=fonts["sublabel"])
        sub_w, sub_h = sb_bbox[2] - sb_bbox[0], sb_bbox[3] - sb_bbox[1]

    text_w = max(lb_w, sub_w)
    text_h = lb_h + (gap_y + sub_h if sublabel else 0)
    chip_w = text_w + pad_x * 2
    chip_h = text_h + pad_y * 2

    chip = rounded_rect((chip_w, chip_h), radius, OFF_WHITE, border=SOFT_BORDER, border_w=1 * SS)
    d = ImageDraw.Draw(chip)
    # label
    lx = (chip_w - lb_w) // 2 - lb_bbox[0]
    ly = pad_y - lb_bbox[1]
    d.text((lx, ly), label, font=fonts["label"], fill=NAVY)
    # sublabel
    if sublabel:
        sx = (chip_w - sub_w) // 2 - sb_bbox[0]
        sy = ly + lb_h + gap_y
        d.text((sx, sy), sublabel, font=fonts["sublabel"], fill=MUTED_SLATE)
    return chip


def draw_connector(canvas: Image.Image, p1: tuple[int, int], p2: tuple[int, int],
                   elbow: Literal["h-first", "v-first"] = "h-first", width: int = 2):
    """Thin navy L-connector from p1 (badge edge) to p2 (chip edge), with tiny dot at p1."""
    d = ImageDraw.Draw(canvas)
    x1, y1 = p1
    x2, y2 = p2
    # elbow point
    if elbow == "h-first":
        ex, ey = x2, y1
    else:  # v-first
        ex, ey = x1, y2
    d.line((x1, y1, ex, ey), fill=NAVY, width=width)
    d.line((ex, ey, x2, y2), fill=NAVY, width=width)
    # small dot at p1 (badge side) so the line reads as "anchored"
    dr = 3 * SS // 2 + 1
    d.ellipse((x1 - dr, y1 - dr, x1 + dr, y1 + dr), fill=NAVY)


# -------------------- layout logic --------------------
ANCHOR_FN = {
    "top-right":    lambda t: (t["x"] + t["w"], t["y"]),
    "top-left":     lambda t: (t["x"],          t["y"]),
    "bottom-right": lambda t: (t["x"] + t["w"], t["y"] + t["h"]),
    "bottom-left":  lambda t: (t["x"],          t["y"] + t["h"]),
    "top-center":   lambda t: (t["x"] + t["w"] // 2, t["y"]),
    "bottom-center": lambda t: (t["x"] + t["w"] // 2, t["y"] + t["h"]),
    "left-center":  lambda t: (t["x"],          t["y"] + t["h"] // 2),
    "right-center": lambda t: (t["x"] + t["w"], t["y"] + t["h"] // 2),
}


def resolve_badge_pos(ann: dict, margin_left: int, margin_top: int, scale: int = SS) -> tuple[int, int]:
    """Compute badge center in supersampled canvas coordinates."""
    t = ann["target"]
    anchor = ann.get("anchor") or _default_anchor_for_side(ann.get("side", "right"))
    ax, ay = ANCHOR_FN[anchor](t)

    # default outset: push badge away from target into empty space
    outset_map = {
        "top-right":    ( +8,  -8),
        "top-left":     ( -8,  -8),
        "bottom-right": ( +8,  +8),
        "bottom-left":  ( -8,  +8),
        "top-center":   (  0, -12),
        "bottom-center":(  0, +12),
        "left-center":  (-12,   0),
        "right-center": (+12,   0),
    }
    ox, oy = outset_map.get(anchor, (0, 0))
    ox += ann.get("badgeDx", 0)
    oy += ann.get("badgeDy", 0)

    x = (ax + ox + margin_left) * scale
    y = (ay + oy + margin_top) * scale
    return (x, y)


def _default_anchor_for_side(side: str) -> str:
    return {"left": "top-left", "right": "top-right",
            "top": "top-right", "bottom": "bottom-right"}.get(side, "top-right")


def resolve_chip_pos(
    ann: dict, chip_size: tuple[int, int], canvas_size: tuple[int, int],
    margin: dict, scale: int = SS, placed_rects: list | None = None,
) -> tuple[int, int, tuple[int, int]]:
    """
    Compute chip top-left + chip-connection anchor point (in supersampled coords).
    placed_rects is used for vertical collision avoidance within the same margin side.
    """
    t = ann["target"]
    side = ann.get("side", "right")
    cw, ch = chip_size
    canvas_w, canvas_h = canvas_size

    margin_l = margin["left"]
    margin_t = margin["top"]
    margin_r = margin["right"]
    margin_b = margin["bottom"]

    # NOTE: canvas_w/canvas_h are already in SUPERSAMPLED coords (passed from render()).
    # margin values are in pre-scale coords; multiply by scale when using them here.

    # base chip position per side — chip sits in the margin aligned to target center
    if side == "left":
        # chip's right edge sits 24px from inner screenshot frame (in pre-scale)
        cx = (margin_l - 24) * scale - cw
        target_cy = (margin_t + t["y"] + t["h"] // 2) * scale
        cy = target_cy - ch // 2
        connection = (cx + cw, cy + ch // 2)  # right edge of chip
    elif side == "right":
        # chip's left edge sits 24px past the right inner frame edge
        cx = canvas_w - (margin_r - 24) * scale
        target_cy = (margin_t + t["y"] + t["h"] // 2) * scale
        cy = target_cy - ch // 2
        connection = (cx, cy + ch // 2)  # left edge of chip
    elif side == "top":
        target_cx = (margin_l + t["x"] + t["w"] // 2) * scale
        cx = target_cx - cw // 2
        cy = (margin_t - 12) * scale - ch
        connection = (cx + cw // 2, cy + ch)  # bottom edge of chip
    else:  # bottom
        target_cx = (margin_l + t["x"] + t["w"] // 2) * scale
        cx = target_cx - cw // 2
        cy = (margin_t + t["y"] + t["h"] + 24) * scale
        connection = (cx + cw // 2, cy)  # top edge of chip

    # apply user nudges
    cx += ann.get("chipDx", 0) * scale
    cy += ann.get("chipDy", 0) * scale
    connection = (connection[0] + ann.get("chipDx", 0) * scale,
                  connection[1] + ann.get("chipDy", 0) * scale)

    # collision avoidance: shift vertically if overlapping an already-placed chip on the same side
    if placed_rects:
        for (ox, oy, ow, oh, oside) in placed_rects:
            if oside != side:
                continue
            if _rects_overlap((cx, cy, cw, ch), (ox, oy, ow, oh), pad=8 * scale):
                # shift down
                cy = oy + oh + 12 * scale
                # recompute connection y offset
                if side in ("left", "right"):
                    connection = (connection[0], cy + ch // 2)

    return cx, cy, connection


def _rects_overlap(a, b, pad=0):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return not (ax + aw + pad < bx or bx + bw + pad < ax or ay + ah + pad < by or by + bh + pad < ay)


# -------------------- main renderer --------------------
def render(source_path: Path, spec_path: Path, out_path: Path):
    source = Image.open(source_path).convert("RGBA")
    sw, sh = source.size

    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    annotations = spec["annotations"]
    margin = spec.get("margin", {"top": 70, "right": 300, "bottom": 70, "left": 300})

    # final canvas size (non-supersampled)
    canvas_w = margin["left"] + sw + margin["right"]
    canvas_h = margin["top"]  + sh + margin["bottom"]

    # --- work in supersampled space ---
    W, H = canvas_w * SS, canvas_h * SS
    canvas = Image.new("RGBA", (W, H), PAGE_BG + (255,))

    # screenshot frame: soft drop shadow + hairline border
    frame = source.resize((sw * SS, sh * SS), Image.Resampling.LANCZOS)
    # border stroke
    border_layer = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    ImageDraw.Draw(border_layer).rectangle(
        (0, 0, frame.size[0] - 1, frame.size[1] - 1),
        outline=SOFT_BORDER, width=1 * SS,
    )
    frame_with_border = Image.alpha_composite(frame, border_layer)

    # shadow first, then frame
    frame_xy = (margin["left"] * SS, margin["top"] * SS)
    sh_obj = soft_shadow(frame_with_border, blur=16 * SS, offset_y=6 * SS, alpha=0.10)
    canvas.alpha_composite(sh_obj, frame_xy)
    canvas.alpha_composite(frame_with_border, frame_xy)

    # fonts
    fonts = load_fonts()

    # --- lay out chips (collects placed rects for collision avoidance) ---
    placed_rects: list[tuple[int, int, int, int, str]] = []
    chip_layouts = []  # (chip_img, chip_xy, connection_pt, badge_pos, num, elbow)

    for idx, ann in enumerate(annotations, start=1):
        chip_img = make_chip(ann["label"], ann.get("sublabel"), fonts)
        chip_xy_x, chip_xy_y, connection = resolve_chip_pos(
            ann, chip_img.size, (W, H), margin, SS, placed_rects,
        )
        placed_rects.append((chip_xy_x, chip_xy_y, chip_img.size[0], chip_img.size[1], ann.get("side", "right")))

        badge_pos = resolve_badge_pos(ann, margin["left"], margin["top"], SS)
        elbow = ann.get("elbow", "auto")
        if elbow == "auto":
            side = ann.get("side", "right")
            elbow = "h-first" if side in ("left", "right") else "v-first"

        chip_layouts.append((chip_img, (chip_xy_x, chip_xy_y), connection, badge_pos, idx, elbow))

    # --- draw connectors first (so chips and badges sit on top) ---
    for (_, _, connection, badge_pos, _, elbow) in chip_layouts:
        # shorten segment from badge center by badge radius so line starts at badge edge
        bx, by = badge_pos
        cx, cy = connection
        # unit vector badge→connection
        dx, dy = cx - bx, cy - by
        dist = (dx * dx + dy * dy) ** 0.5 or 1
        r_edge = 14 * SS + 1 * SS  # badge radius + ring half
        sx = bx + int(dx / dist * r_edge)
        sy = by + int(dy / dist * r_edge)
        draw_connector(canvas, (sx, sy), (cx, cy), elbow=elbow, width=2 * SS)

    # --- draw chips ---
    for (chip_img, chip_xy, _, _, _, _) in chip_layouts:
        paste_with_shadow(canvas, chip_img, chip_xy, blur=8 * SS, offset_y=2 * SS, alpha=0.08)

    # --- draw badges on top ---
    for (_, _, _, badge_pos, num, _) in chip_layouts:
        badge = make_badge(num, fonts)
        bx, by = badge_pos
        xy = (bx - badge.width // 2, by - badge.height // 2)
        paste_with_shadow(canvas, badge, xy, blur=6 * SS, offset_y=2 * SS, alpha=0.22)

    # downscale for final output
    final = canvas.resize((canvas_w, canvas_h), Image.Resampling.LANCZOS)
    final = final.convert("RGB")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    final.save(out_path, format="PNG", optimize=True)
    print(f"OK  {out_path}  {final.size}  {out_path.stat().st_size} bytes")


# -------------------- cli --------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, type=Path)
    ap.add_argument("--spec",   required=True, type=Path)
    ap.add_argument("--out",    required=True, type=Path)
    args = ap.parse_args()
    render(args.source, args.spec, args.out)


if __name__ == "__main__":
    main()
