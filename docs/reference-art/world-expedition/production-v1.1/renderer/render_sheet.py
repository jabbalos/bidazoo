#!/usr/bin/env python3
"""BidaZoo World Expedition - deterministic canonical character-sheet renderer (LANE 3).

Implements the locked template in docs/visual/15-character-sheet-template.md
(1448 x 1086 canvas) from a character manifest (see manifest.schema.md).

    python3 render_sheet.py MANIFEST.json OUT.png [--assets-root DIR]
                            [--fonts-dir DIR] [--debug-boxes]

Writes OUT.png (RGB, exactly 1448x1086, no metadata) and OUT.report.json
(placeholders, overflow flags, computed placement boxes, asset hashes, fonts).

Determinism: Pillow + numpy only, no randomness, no timestamps, fixed fonts,
fixed resampling filters, fixed PNG compression, no PNG metadata.  The same
manifest + same asset bytes + same fonts => byte-identical PNG and report.
"""
import argparse
import hashlib
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

RENDERER_VERSION = "1.0.0"
CANVAS_W, CANVAS_H = 1448, 1086
SS = 2  # supersampling factor for chrome (shapes, hatch, dashes); text/art are 1x

FLAG = "ART/TEMPLATE REVIEW REQUIRED"
EPS = 1e-6
ALPHA_THR = 8  # alpha >= 8/255 counts as "matted" pixel for bounding boxes

# ----------------------------------------------------------------- tokens (doc 15 s9)
def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

C_SHEET = hexrgb("FEF5DF")
C_PANEL = hexrgb("FBECD4")
C_BORDER = hexrgb("B89A6A")
C_CELL = hexrgb("FFF8E8")
C_STAGE_TOP = hexrgb("FFF6DD")
C_STAGE_BOT = hexrgb("F3DFB5")
C_NAVY = hexrgb("1E3A5F")
C_BRASS = hexrgb("C9A24A")
C_INK = hexrgb("2B2A33")
C_WHITE = (255, 255, 255)
C_EMPTY_FILL = hexrgb("EFE0BC")
C_EMPTY_HATCH = hexrgb("DCC9A0")
C_DEBUG = (255, 0, 255)

# ----------------------------------------------------------------- vocab
ST_READY = "READY WITH CROP/MATTING"
ST_EDIT = "NEEDS CONTROLLED EDIT"
ST_MISSING = "MISSING / TO AUTHOR"
ST_PROV = "PROVISIONAL"
ST_OPEN = "OPEN"
ST_ACCEPTED = "OWNER-ACCEPTED MINOR"   # library status (October 13, 2026): owner accepted a minor residual flaw; drawn like READY, no PROVISIONAL tag
STATUSES = (ST_READY, ST_EDIT, ST_MISSING, ST_PROV, ST_OPEN, ST_ACCEPTED)

ROLE_TAGS = {
    "starter": "SELECTABLE STARTER",
    "host": "HOST & GUIDE — NOT SELECTABLE",
}

DEFAULT_PALETTE_ROLES = ["PRIMARY", "SECONDARY", "ACCENT", "GEAR", "DETAIL", "CHARACTER-SPECIFIC"]

EXPR_CELLS = [("IDLE", "idle"), ("HAPPY", "happy"), ("THINKING", "thinking"),
              ("CHEER", "cheer"), ("DISCOVER", "discover"), ("TRY AGAIN", "tryAgain")]
TURN_CELLS = [("FRONT", "front"), ("3/4 VIEW", "threeQuarter"),
              ("SIDE VIEW", "side"), ("BACK VIEW", "back")]
SIL_CELLS = [("FRONT", "front"), ("3/4", "threeQuarter"), ("SIDE", "side"),
             ("BACK", "back"), ("ACTION", "action")]

# ----------------------------------------------------------------- geometry (doc 15 s1, s2, s6, s7)
TURN_X = [36, 383, 730, 1077]
TURN_Y, TURN_W, TURN_H = 200, 335, 214
TURN_BASELINE = 400
TURN_MAX_H = 184           # tallest point at y >= 216
TURN_MAX_W = 335
TURN_PILL_Y = 420
EXPR_X = [601 + 137 * i for i in range(6)]
EXPR_Y, EXPR_W, EXPR_H = 512, 125, 214
EXPR_PILL_Y = 732
EXPR_EYE_Y = 598
EXPR_SAFE_W = 109
EXPR_NOMINAL_W = 100
EXPR_CROWN_MIN_Y = EXPR_Y + 8
HERO_BOX = (34, 512, 300, 246)
HEAD_BOX = (366, 512, 200, 246)
HEAD_EYE_Y = 610
HEAD_WIDTH_RATIO = 0.88
SIL_BASE_Y = 1006
SIL_X = [36, 116, 196, 276, 356]
SIL_W = [72, 72, 72, 72, 108]
SIL_TOP, SIL_BOX_H, SIL_FIT_H = 824, 196, 182
DETAIL_BOXES = [(500, 824), (650, 824), (500, 938), (650, 938)]
DETAIL_W, DETAIL_H, DETAIL_ART_H = 142, 106, 82
PAL_SLOTS = [(828, 824), (924, 824), (1020, 824), (828, 942), (924, 942), (1020, 942)]
PROP_BASE_Y = 1006
PROP_R = 168               # cast reference height R in px
PROP_FRONT_BOX = (1196, 824, 216, 196)
PROP_RULER_BOX = (1144, 824, 44, 196)
UNITS_PER_REF = 1000.0     # 1 source unit = 1/1000 of the cast reference height
DEFAULT_S0 = 0.184         # px per unit => 1000-unit, k=1.0 figure is 184 px tall

PANELS = [
    ("A", (24, 24, 1400, 120)),
    ("B", (24, 156, 1400, 300)),
    ("C", (24, 468, 320, 300)),
    ("D", (356, 468, 220, 300)),
    ("E", (588, 468, 836, 300)),
    ("F", (24, 780, 452, 282)),
    ("G", (488, 780, 316, 282)),
    ("H", (816, 780, 304, 282)),
    ("I", (1132, 780, 292, 282)),
]
CHIPS = [("TURNAROUND", 34, 164), ("ACTION POSE", 34, 476), ("HEAD CLOSE-UP", 366, 476),
         ("EXPRESSIONS", 598, 476), ("SILHOUETTES", 34, 788), ("DETAILS", 498, 788),
         ("COLOR PALETTE", 826, 788), ("PROPORTION GUIDE", 1142, 788)]

# ----------------------------------------------------------------- fonts
# Nunito Sans (LOCKED production family, SIL OFL 1.1).  Static TTFs live in renderer/fonts/ (with OFL.txt).
# There is NO fallback family: a missing or wrong font file is a hard error (doc 15 s4: no other family,
# no Poppins, no DejaVu on a production sheet).
HERE_FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
NUNITO_FILES = {400: "NunitoSans-Regular.ttf", 600: "NunitoSans-SemiBold.ttf",
                700: "NunitoSans-Bold.ttf", 800: "NunitoSans-ExtraBold.ttf"}
NUNITO_WEIGHT_NAMES = {400: "Regular", 600: "SemiBold", 700: "Bold", 800: "ExtraBold"}


class FontError(SystemExit):
    pass


def _check_font(path, weight):
    """Hard checks: file exists, loads, is Nunito Sans (name table) and has the expected weight class."""
    if not os.path.isfile(path):
        raise FontError("FONT ERROR: required Nunito Sans file missing: %s (no fallback font is allowed)" % path)
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        raise FontError("FONT ERROR: fontTools is required to verify the Nunito Sans files")
    f = TTFont(path)
    fam = f["name"].getDebugName(1) or ""
    full = f["name"].getDebugName(4) or ""
    if not fam.startswith("Nunito Sans") or "Nunito Sans" not in full:
        raise FontError("FONT ERROR: %s is not Nunito Sans (family=%r, full=%r)" % (path, fam, full))
    if f["OS/2"].usWeightClass != weight:
        raise FontError("FONT ERROR: %s has weight class %s, expected %s" % (path, f["OS/2"].usWeightClass, weight))
    if "fvar" in f:
        raise FontError("FONT ERROR: %s is a variable font; static instances are required for determinism" % path)
    cmap = f.getBestCmap()
    need = set(ord(c) for c in " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#/-.,:;!?'()&\u2014\u2026\u2019\u00b7")
    miss = sorted(need - set(cmap))
    if miss:
        raise FontError("FONT ERROR: %s lacks glyphs %s" % (path, [chr(c) for c in miss]))


class Fonts:
    def __init__(self, fonts_dir=None):
        d = os.path.abspath(fonts_dir) if fonts_dir else HERE_FONTS
        self.paths = {}
        self.cache = {}
        self.family = "Nunito Sans"
        for w, f in NUNITO_FILES.items():
            p = os.path.join(d, f)
            _check_font(p, w)
            self.paths[w] = p
        if not os.path.isfile(os.path.join(d, "OFL.txt")):
            raise FontError("FONT ERROR: OFL.txt (license text) must stay with the font files in %s" % d)
        self.sha256 = {}
        for w, p in self.paths.items():
            with open(p, "rb") as fh:
                self.sha256[str(w)] = hashlib.sha256(fh.read()).hexdigest()

    def get(self, weight, size):
        key = (weight, size)
        if key not in self.cache:
            self.cache[key] = ImageFont.truetype(self.paths[weight], size,
                                                 layout_engine=ImageFont.Layout.BASIC)
        return self.cache[key]


# ----------------------------------------------------------------- text helpers
def text_width(font, text, tracking=0.0):
    if not text:
        return 0.0
    if tracking == 0:
        return font.getlength(text)
    return sum(font.getlength(c) for c in text) + tracking * (len(text) - 1)


def cap_height(font):
    b = font.getbbox("H", anchor="ls")
    return -b[1]


def draw_tracked(draw, x, baseline, text, font, fill, tracking=0.0):
    if tracking == 0:
        draw.text((x, baseline), text, font=font, fill=fill, anchor="ls")
        return
    cx = x
    for c in text:
        draw.text((cx, baseline), c, font=font, fill=fill, anchor="ls")
        cx += font.getlength(c) + tracking


def ellipsize(font, text, max_w, tracking):
    if text_width(font, text, tracking) <= max_w:
        return text
    t = text
    while t and text_width(font, t.rstrip() + "…", tracking) > max_w:
        t = t[:-1]
    return t.rstrip() + "…"


def fit_line(fonts, text, weight, size, min_size, max_w, tracking_em):
    """shrink to min_size then ellipsis. returns (text, size, shrunk, ellipsized)"""
    s = size
    while True:
        f = fonts.get(weight, s)
        if text_width(f, text, tracking_em * s) <= max_w + EPS:
            return text, s, s != size, False
        if s <= min_size:
            break
        s -= 1
    f = fonts.get(weight, s)
    return ellipsize(f, text, max_w, tracking_em * s), s, s != size, True


def wrap_two(fonts, text, weight, size, min_size, max_w, tracking_em):
    """greedy wrap on spaces, max 2 lines; shrink to min then ellipsis on line 2.
    returns (lines, size, ellipsized)"""
    words = text.split()
    s = size
    while True:
        f = fonts.get(weight, s)
        tr = tracking_em * s
        lines, cur = [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if text_width(f, trial, tr) <= max_w + EPS or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        lines.append(cur)
        ok = len(lines) <= 2 and all(text_width(f, l, tr) <= max_w + EPS for l in lines)
        if ok:
            return lines, s, False
        if s <= min_size:
            break
        s -= 1
    f = fonts.get(weight, s)
    tr = tracking_em * s
    # recompute wrap at min size; collapse overflow into line 2 with ellipsis
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if text_width(f, trial, tr) <= max_w + EPS or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    first = ellipsize(f, lines[0], max_w, tr) if text_width(f, lines[0], tr) > max_w else lines[0]
    if len(lines) == 1:
        return [first], s, first != lines[0]
    rest = " ".join(lines[1:])
    return [first, ellipsize(f, rest, max_w, tr) if text_width(f, rest, tr) > max_w else rest], s, True


# ----------------------------------------------------------------- image helpers
def alpha_bbox(img):
    a = np.asarray(img.getchannel("A"))
    m = a >= ALPHA_THR
    if not m.any():
        return None
    rows = np.where(m.any(axis=1))[0]
    cols = np.where(m.any(axis=0))[0]
    return (int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1)


def scaled(img, s):
    w, h = img.size
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    if (nw, nh) == (w, h):
        return img
    return img.resize((nw, nh), Image.LANCZOS)


def blit(canvas, art, x, y, clip=None, mask=None):
    """alpha-composite art at integer (x,y); clip=(x0,y0,x1,y1); mask is an L image whose
    top-left is at clip[0],clip[1]."""
    x0, y0, x1, y1 = x, y, x + art.width, y + art.height
    cx0, cy0, cx1, cy1 = 0, 0, canvas.width, canvas.height
    if clip:
        cx0, cy0, cx1, cy1 = max(cx0, clip[0]), max(cy0, clip[1]), min(cx1, clip[2]), min(cy1, clip[3])
    ix0, iy0, ix1, iy1 = max(x0, cx0), max(y0, cy0), min(x1, cx1), min(y1, cy1)
    if ix1 <= ix0 or iy1 <= iy0:
        return
    sub = art.crop((ix0 - x0, iy0 - y0, ix1 - x0, iy1 - y0))
    if mask is not None:
        m = mask.crop((ix0 - clip[0], iy0 - clip[1], ix1 - clip[0], iy1 - clip[1]))
        a = Image.fromarray((np.asarray(sub.getchannel("A")).astype(np.uint16) *
                             np.asarray(m).astype(np.uint16) // 255).astype(np.uint8), "L")
        sub = sub.copy()
        sub.putalpha(a)
    canvas.alpha_composite(sub, (ix0, iy0))


def rrect_mask(w, h, r):
    k = 4
    m = Image.new("L", (w * k, h * k), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * k - 1, h * k - 1), radius=r * k, fill=255)
    return m.resize((w, h), Image.LANCZOS)


def sb(box):
    x, y, w, h = box
    return (x * SS, y * SS, (x + w) * SS - 1, (y + h) * SS - 1)


def floor_half(v):
    return int(math.floor(v + 0.5))


def r3(v):
    return round(float(v), 3)


# ----------------------------------------------------------------- manifest
class ManifestError(Exception):
    pass


def validate_manifest(m):
    def need(d, key, where):
        if not isinstance(d, dict) or key not in d:
            raise ManifestError("%s: missing required key '%s'" % (where, key))
        return d[key]

    if m.get("schema_version") != 1:
        raise ManifestError("schema_version must be 1")
    ch = need(m, "character", "manifest")
    for k in ("id", "name", "role", "kind"):
        need(ch, k, "character")
    if ch["kind"] not in ROLE_TAGS:
        raise ManifestError("character.kind must be one of %s" % sorted(ROLE_TAGS))
    cast = need(m, "cast", "manifest")
    if not isinstance(need(cast, "k", "cast"), (int, float)) or cast["k"] <= 0:
        raise ManifestError("cast.k must be a positive number")
    pal = need(m, "palette", "manifest")
    if len(need(pal, "slots", "palette")) != 6:
        raise ManifestError("palette.slots must have exactly 6 entries")
    tu = need(m, "turnaround", "manifest")
    for _, key in TURN_CELLS:
        need(tu, key, "turnaround")
    need(m, "hero", "manifest")
    need(m, "head", "manifest")
    ex = need(m, "expressions", "manifest")
    for _, key in EXPR_CELLS:
        need(ex, key, "expressions")
    if len(need(m, "details", "manifest")) != 4:
        raise ManifestError("details must have exactly 4 entries")
    need(m, "silhouettes", "manifest")
    need(m, "proportion", "manifest")

    def chk_status(a, where):
        if a is not None and a.get("status", ST_MISSING) not in STATUSES:
            raise ManifestError("%s: invalid status %r" % (where, a.get("status")))

    for _, key in TURN_CELLS:
        chk_status(tu[key], "turnaround." + key)
    chk_status(m["hero"], "hero")
    chk_status(m["head"], "head")
    for _, key in EXPR_CELLS:
        chk_status(ex[key], "expressions." + key)
    for i, d in enumerate(m["details"]):
        chk_status(d, "details[%d]" % i)
    for k, v in (m["silhouettes"].get("items") or {}).items():
        chk_status(v, "silhouettes.items." + k)


# ----------------------------------------------------------------- render context
class Ctx:
    def __init__(self, manifest, assets_root, fonts, debug=False):
        self.m = manifest
        self.root = assets_root
        self.fonts = fonts
        self.debug = debug
        self.W, self.H = CANVAS_W, CANVAS_H
        self.base = Image.new("RGBA", (self.W * SS, self.H * SS), C_SHEET + (255,))
        self.over = Image.new("RGBA", (self.W * SS, self.H * SS), (0, 0, 0, 0))
        self.top = Image.new("RGBA", (self.W * SS, self.H * SS), (0, 0, 0, 0))
        self.bd = ImageDraw.Draw(self.base)
        self.od = ImageDraw.Draw(self.over)
        self.td = ImageDraw.Draw(self.top)
        self.pre_art = []    # (img, x, y, clip, mask)  composited before the border overlay
        self.post_art = []   # composited after the border overlay (never clipped)
        self.texts = []      # callables(draw)
        self.cache = {}
        self.rep = {
            "renderer_version": RENDERER_VERSION,
            "placeholders": [], "overflows": [], "placements": [], "provisional": [],
            "template_defects": [], "text_adjustments": [], "warnings": [], "assets": [],
        }

    # ---- reporting
    def placeholder(self, zone, slot, reason, status, plan, box, **extra):
        e = {"zone": zone, "slot": slot, "reason": reason, "status": status,
             "plan_status": plan, "box": list(box)}
        e.update(extra)
        self.rep["placeholders"].append(e)

    def overflow(self, zone, slot, reasons, **extra):
        e = {"zone": zone, "slot": slot, "flag": FLAG, "reasons": reasons}
        e.update(extra)
        self.rep["overflows"].append(e)

    def defect(self, what, **extra):
        e = {"what": what}
        e.update(extra)
        self.rep["template_defects"].append(e)

    def warn(self, msg):
        self.rep["warnings"].append(msg)

    # ---- assets
    def load(self, spec, zone, slot, box):
        """returns dict(ok, state, img, bbox, path, status, plan, ph_reason)"""
        spec = spec or {}
        status = spec.get("status", ST_MISSING)
        plan = spec.get("plan_status")
        path = spec.get("path")
        out = {"ok": False, "status": status, "plan": plan, "path": path, "spec": spec,
               "img": None, "bbox": None, "ph_reason": None}
        if status == ST_MISSING:
            out["ph_reason"] = "missing"
            return out
        if status == ST_OPEN:
            out["ph_reason"] = "open"
            return out
        if status == ST_EDIT:
            out["ph_reason"] = "needs_controlled_edit"
            return out
        if not path:
            out["ph_reason"] = "no_path"
            self.warn("%s.%s: status %s but no path" % (zone, slot, status))
            return out
        full = path if os.path.isabs(path) else os.path.join(self.root, path)
        if full not in self.cache:
            try:
                with open(full, "rb") as fh:
                    data = fh.read()
                sha = hashlib.sha256(data).hexdigest()
                import io
                img = Image.open(io.BytesIO(data))
                img.load()
                img = img.convert("RGBA")
                bb = alpha_bbox(img)
                self.cache[full] = (img, bb, sha, len(data), None)
            except Exception as ex:  # noqa
                self.cache[full] = (None, None, None, 0, "%s: %s" % (type(ex).__name__, ex))
        img, bb, sha, size, err = self.cache[full]
        if err or bb is None:
            out["ph_reason"] = "file_error"
            out["error"] = err or "image has no pixels with alpha >= %d" % ALPHA_THR
            return out
        want = spec.get("sha256")
        if want and want.lower() != sha:
            self.warn("%s.%s: sha256 mismatch (manifest %s, file %s)" % (zone, slot, want[:12], sha[:12]))
        if not any(a["path"] == path for a in self.rep["assets"]):
            self.rep["assets"].append({"path": path, "sha256": sha, "bytes": size,
                                       "size_px": [img.width, img.height]})
        out.update(ok=True, img=img, bbox=bb, sha=sha)
        return out

    # ---- chrome primitives
    def panel(self, box):
        self.bd.rounded_rectangle(sb(box), radius=16 * SS, fill=C_PANEL, outline=C_BORDER, width=2 * SS)

    def art_box(self, box, kind="cell", radius=12, hatch=None):
        """background in base; 2px border in over.  hatch=(line1,line2) => empty-pattern cell"""
        x, y, w, h = box
        if hatch is not None:
            self.hatch_fill(box, radius)
            self.dashed_border(box, radius)
        else:
            if kind == "stage":
                g = np.zeros((h * SS, w * SS, 4), np.uint8)
                t = np.linspace(0, 1, h * SS)[:, None]
                for ci in range(3):
                    g[:, :, ci] = np.round(C_STAGE_TOP[ci] + (C_STAGE_BOT[ci] - C_STAGE_TOP[ci]) * t).astype(np.uint8)
                g[:, :, 3] = 255
                m = Image.new("L", (w * SS, h * SS), 0)
                ImageDraw.Draw(m).rounded_rectangle((0, 0, w * SS - 1, h * SS - 1), radius=radius * SS, fill=255)
                self.base.paste(Image.fromarray(g, "RGBA"), (x * SS, y * SS), m)
            else:
                self.bd.rounded_rectangle(sb(box), radius=radius * SS, fill=C_CELL)
            self.od.rounded_rectangle(sb(box), radius=radius * SS, outline=C_BORDER, width=2 * SS)

    def hatch_fill(self, box, radius):
        x, y, w, h = box
        lay = Image.new("RGBA", (w * SS, h * SS), C_EMPTY_FILL + (255,))
        d = ImageDraw.Draw(lay)
        P = 12
        n0 = -(h // P) - 2
        n1 = w // P + 2
        for n in range(n0, n1 + 1):
            d.line([(n * P * SS, h * SS), ((n * P + h) * SS, 0)], fill=C_EMPTY_HATCH + (255,), width=SS)
        m = Image.new("L", (w * SS, h * SS), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, w * SS - 1, h * SS - 1), radius=radius * SS, fill=255)
        self.base.paste(lay, (x * SS, y * SS), m)

    def dashed_border(self, box, radius, color=C_BORDER, width=2, dash=6, gap=4):
        x, y, w, h = box
        # centreline of a 2px inside border
        ins = width / 2.0
        x0, y0, x1, y1 = x + ins, y + ins, x + w - ins, y + h - ins
        r = max(radius - ins, 1)
        pts = []

        def arc(cx, cy, a0, a1, n=12):
            for i in range(n + 1):
                a = math.radians(a0 + (a1 - a0) * i / n)
                pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))

        pts.append((x0 + r, y0))
        pts.append((x1 - r, y0))
        arc(x1 - r, y0 + r, -90, 0)
        pts.append((x1, y1 - r))
        arc(x1 - r, y1 - r, 0, 90)
        pts.append((x0 + r, y1))
        arc(x0 + r, y1 - r, 90, 180)
        pts.append((x0, y0 + r))
        arc(x0 + r, y0 + r, 180, 270)
        pts.append((x0 + r, y0))
        # resample along the path at 0.5px and cut dashes
        dense = []
        for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
            L = math.hypot(bx - ax, by - ay)
            n = max(1, int(L / 0.5))
            for i in range(n):
                t = i / n
                dense.append((ax + (bx - ax) * t, ay + (by - ay) * t))
        dense.append(pts[-1])
        period = dash + gap
        cum = 0.0
        run = []
        for i, p in enumerate(dense):
            if i:
                cum += math.hypot(p[0] - dense[i - 1][0], p[1] - dense[i - 1][1])
            on = (cum % period) < dash
            if on:
                run.append((p[0] * SS, p[1] * SS))
            else:
                if len(run) > 1:
                    self.od.line(run, fill=color + (255,), width=width * SS)
                run = []
        if len(run) > 1:
            self.od.line(run, fill=color + (255,), width=width * SS)

    def pill(self, box, fill, outline=None, outline_w=1, radius=None):
        x, y, w, h = box
        self.od.rounded_rectangle(sb(box), radius=(radius if radius is not None else h // 2) * SS,
                                  fill=fill, outline=outline, width=outline_w * SS if outline else 0)

    def chip(self, text, x, y):
        f = self.fonts.get(800, 14)
        tw = text_width(f, text, 0.04 * 14)
        w = int(math.ceil(tw)) + 24
        h = 28
        self.od.rounded_rectangle(sb((x, y, w, h)), radius=14 * SS, fill=C_BRASS)
        self.od.rounded_rectangle(sb((x, y, w, h - 2)), radius=14 * SS, fill=C_NAVY)
        self.texts.append(lambda d, t=text, x=x, y=y, h=h, f=f:
                          self.draw_caps_in(d, t, f, C_WHITE, 0.04 * 14, x + 12, y, h - 2, align="l"))
        return w

    # ---- text drawing
    def draw_caps_in(self, d, text, font, fill, tracking, x, y, h, align="l", w=None):
        cap = cap_height(font)
        base = y + h / 2.0 + cap / 2.0
        tw = text_width(font, text, tracking)
        if align == "c":
            px = x + (w - tw) / 2.0
        elif align == "r":
            px = x + w - tw
        else:
            px = x
        draw_tracked(d, px, base, text, font, fill, tracking)

    def queue_marker(self, box, lines, size=12, zone="", slot=""):
        """empty-pattern marker text (role 'Missing / open marker': 800, caps, +0.04em, 2 lines)."""
        x, y, w, h = box
        maxw = w - 16  # text keeps 8px from its container edge (doc 15 s1)
        s = size
        tr = 0.04
        while s > 10 and max(text_width(self.fonts.get(800, s), l, tr * s) for l in lines) > maxw:
            s -= 1
        f = self.fonts.get(800, s)
        widest = max(text_width(f, l, tr * s) for l in lines)
        if widest > maxw + EPS:
            self.defect("marker text does not fit its cell at the 10px minimum", zone=zone, slot=slot,
                        text=" / ".join(lines), text_width_px=r3(widest), cell_width_px=w)
        elif s != size:
            self.rep["text_adjustments"].append({"zone": zone, "slot": slot, "what": "marker shrunk",
                                                 "from": size, "to": s, "text": " / ".join(lines)})
        lh = 14 if s >= 12 else 13
        total = lh * len(lines)
        for i, l in enumerate(lines):
            cy = y + (h - total) / 2.0 + i * lh
            self.texts.append(lambda d, l=l, f=f, s=s, cy=cy, x=x, w=w, lh=lh:
                              self.draw_caps_in(d, l, f, C_INK, tr * s, x, cy, lh, align="c", w=w))

    def label_pill(self, text, cx, y, max_w, zone, slot):
        f = self.fonts.get(700, 12)
        tw = text_width(f, text, 0.04 * 12)
        w = int(min(max_w, math.ceil(tw) + 24))
        if tw + 24 > max_w + EPS:
            self.defect("label pill text does not fit (fixed string)", zone=zone, slot=slot, text=text)
        x = int(floor_half(cx - w / 2.0))
        self.pill((x, y, w, 26), fill=C_CELL, outline=C_BORDER, outline_w=1, radius=13)
        self.texts.append(lambda d, t=text, x=x, y=y, w=w, f=f:
                          self.draw_caps_in(d, t, f, C_INK, 0.04 * 12, x, y, 26, align="c", w=w))

    def prov_tag(self, box_art, zone, slot):
        """10px PROVISIONAL tag in the slot's top-right corner (doc 15 s10)."""
        x, y, w, h = box_art
        f = self.fonts.get(800, 10)
        tw = text_width(f, "PROVISIONAL", 0.06 * 10)
        tag_w = int(math.ceil(tw)) + 10
        if tag_w + 8 > w:
            self.rep["warnings"].append("%s.%s: PROVISIONAL tag (%dpx) wider than its %dpx cell; tag omitted, "
                                        "see provisional list" % (zone, slot, tag_w, w))
            return
        tx, ty = x + w - 4 - tag_w, y + 4
        self.td.rounded_rectangle(sb((tx, ty, tag_w, 14)), radius=7 * SS, fill=C_NAVY + (255,))
        self.texts.append(lambda d, tx=tx, ty=ty, tag_w=tag_w, f=f:
                          self.draw_caps_in(d, "PROVISIONAL", f, C_WHITE, 0.06 * 10, tx, ty, 14, align="c", w=tag_w))

    def debug_rect(self, x0, y0, x1, y1, bad=False):
        if self.debug:
            self.td.rectangle((x0 * SS, y0 * SS, x1 * SS, y1 * SS), outline=C_DEBUG + (255 if bad else 160,),
                              width=SS)

    def note_provisional(self, zone, slot, a):
        self.rep["provisional"].append({"zone": zone, "slot": slot, "path": a["path"]})


# ----------------------------------------------------------------- zone drawing
def ph_lines(reason):
    return {"missing": ("MISSING /", "TO AUTHOR"),
            "open": ("OPEN —", "TO AUTHOR"),
            "needs_controlled_edit": ("NEEDS EDIT —", "NOT APPROVED"),
            "no_path": ("FILE ERROR —", "NO PATH"),
            "file_error": ("FILE ERROR —", "SEE REPORT")}[reason]


def cell_with_asset(R, zone, slot, box, a, kind="cell", radius=12, track_placeholder=True):
    """draws the cell chrome (normal or empty-pattern) and returns True if art is to be drawn."""
    if a["ok"]:
        R.art_box(box, kind=kind, radius=radius)
        return True
    lines = ph_lines(a["ph_reason"])
    R.art_box(box, hatch=lines, radius=radius)
    R.queue_marker(box, lines, zone=zone, slot=slot)
    extra = {}
    if a.get("error"):
        extra["error"] = a["error"]
    if a.get("path"):
        extra["source_ref"] = a["path"]
    R.placeholder(zone, slot, a["ph_reason"], a["status"], a["plan"], box, **extra)
    return False


def draw_header(R):
    m = R.m
    ch = m["character"]
    f = R.fonts
    # logo
    logo = (m.get("sheet") or {}).get("logo")
    a = R.load(logo, "header", "LOGO_ASSET", (24, 24, 336, 120))
    lbox = (36, 36, 312, 96)
    if a["ok"]:
        img = a["img"]
        l, t, r, b = a["bbox"]
        crop = img.crop((l, t, r, b))
        s = min(312.0 / crop.width, 96.0 / crop.height)
        art = scaled(crop, s)
        x = lbox[0] + (lbox[2] - art.width) // 2
        y = lbox[1] + (lbox[3] - art.height) // 2
        R.post_art.append((art, x, y))
        R.rep["placements"].append({"zone": "header", "slot": "LOGO_ASSET", "asset": a["path"],
                                    "bbox": {"x": x, "y": y, "w": art.width, "h": art.height}})
        if a["status"] == ST_PROV:
            R.note_provisional("header", "LOGO_ASSET", a)
    else:
        R.art_box(lbox, hatch=("LOGO_ASSET", "REQUIRED / TO AUTHOR"), radius=12)
        R.queue_marker(lbox, ("LOGO_ASSET", "REQUIRED / TO AUTHOR"), zone="header", slot="LOGO_ASSET")
        R.placeholder("header", "LOGO_ASSET", a["ph_reason"], a["status"], a["plan"], lbox,
                      note="layout proof only; never a final render")
    # title / subtitle
    title = ("%s — CHARACTER SHEET" % ch["name"]).upper()
    t, ts, shrunk, ell = fit_line(f, title, 800, 36, 28, 664 - 16, 0.02)
    if shrunk or ell:
        R.rep["text_adjustments"].append({"zone": "header", "slot": "title", "from": 36, "to": ts, "ellipsized": ell})
    ft = f.get(800, ts)
    R.texts.append(lambda d, t=t, ft=ft, ts=ts:
                   R.draw_caps_in(d, t, ft, C_INK, 0.02 * ts, 376, 52, 40, align="c", w=664))
    sub, ss, shrunk, ell = fit_line(f, ch["role"], 600, 18, 14, 664 - 16, 0.0)
    if shrunk or ell:
        R.rep["text_adjustments"].append({"zone": "header", "slot": "subtitle", "from": 18, "to": ss, "ellipsized": ell})
    fs = f.get(600, ss)

    def sub_draw(d, sub=sub, fs=fs):
        asc, desc = fs.getmetrics()
        base = 96 + (24 - (asc + desc)) / 2.0 + asc
        tw = text_width(fs, sub)
        draw_tracked(d, 376 + (664 - tw) / 2.0, base, sub, fs, C_INK)

    R.texts.append(sub_draw)
    # role tag
    tag = ROLE_TAGS[ch["kind"]]
    host = ch["kind"] == "host"
    fill = C_CELL if host else C_NAVY
    txt = C_NAVY if host else C_WHITE
    R.pill((1072, 66, 336, 36), fill=fill, outline=C_BRASS, outline_w=2, radius=18)
    ftag = f.get(800, 13)
    if text_width(ftag, tag, 0.04 * 13) > 336 - 24:
        R.defect("role tag does not fit (fixed string)", text=tag)
    R.texts.append(lambda d, tag=tag, ftag=ftag, txt=txt:
                   R.draw_caps_in(d, tag, ftag, txt, 0.04 * 13, 1072, 66, 36, align="c", w=336))


def draw_turnaround(R):
    m = R.m
    k = float(m["cast"]["k"])
    s0 = float(m["cast"].get("s0", DEFAULT_S0))
    for i, (label, key) in enumerate(TURN_CELLS):
        cx = TURN_X[i] + TURN_W / 2.0
        box = (TURN_X[i], TURN_Y, TURN_W, TURN_H)
        a = R.load(m["turnaround"][key], "turnaround", key, box)
        if cell_with_asset(R, "turnaround", key, box, a):
            tr = a["spec"].get("transform") or {}
            u = turnaround_units(tr, "turnaround." + key)
            s = s0 * k * u
            img = a["img"]
            l, t, r, b = a["bbox"]
            ground = tr.get("ground_y_src", b)
            ox = cx - ((l + r) / 2.0) * s
            oy = TURN_BASELINE - ground * s
            art = scaled(img, s)
            ix, iy = floor_half(ox), floor_half(oy)
            bw, bh_above = (r - l) * s, (ground - t) * s
            reasons = []
            if bh_above > TURN_MAX_H + EPS:
                reasons.append({"metric": "height_above_baseline_px", "value": r3(bh_above), "limit": TURN_MAX_H})
            if bw > TURN_MAX_W + EPS:
                reasons.append({"metric": "width_px", "value": r3(bw), "limit": TURN_MAX_W})
            bx0, by0 = ox + l * s, oy + t * s
            bx1, by1 = ox + r * s, oy + b * s
            if by1 > TURN_Y + TURN_H + EPS:
                R.warn("turnaround.%s: art extends below the art box bottom (y=%d)" % (key, TURN_Y + TURN_H))
            R.post_art.append((art, ix, iy))
            R.rep["placements"].append({
                "zone": "turnaround", "slot": key, "asset": a["path"], "status": a["status"],
                "scale_px_per_source_px": r3(s), "cast": {"s0": s0, "k": k, "units_per_source_px": r3(u)},
                "image_origin": [ix, iy],
                "matted_bbox": {"x": r3(bx0), "y": r3(by0), "w": r3(bx1 - bx0), "h": r3(by1 - by0)},
                "baseline_y": TURN_BASELINE, "cell_center_x": cx,
                "height_above_baseline_px": r3(bh_above), "limits": {"max_height": TURN_MAX_H, "max_width": TURN_MAX_W},
                "overflow": bool(reasons)})
            if reasons:
                R.overflow("turnaround", key, reasons, asset=a["path"])
            R.debug_rect(bx0, by0, bx1, by1, bad=bool(reasons))
            if a["status"] == ST_PROV:
                R.prov_tag(box, "turnaround", key)
                R.note_provisional("turnaround", key, a)
        R.label_pill(label, cx, TURN_PILL_Y, TURN_W - 16, "turnaround", key)


def turnaround_units(tr, where):
    if "units_per_source_px" in tr:
        return float(tr["units_per_source_px"])
    if "ref_height_src_px" in tr:
        return UNITS_PER_REF / float(tr["ref_height_src_px"])
    raise ManifestError("%s.transform needs ref_height_src_px or units_per_source_px" % where)


def draw_hero(R):
    box = HERO_BOX
    a = R.load(R.m["hero"], "hero", "hero", box)
    if cell_with_asset(R, "hero", "hero", box, a, kind="stage"):
        tr = a["spec"].get("transform") or {}
        l, t, r, b = a["bbox"]
        clearance = float(tr.get("clearance_px", 24))
        mode = tr.get("mode", "fit")
        bx, by, bw, bh = box
        if mode == "fixed":
            s = float(tr["px_per_source_px"])
        else:
            s = min((bw - 2 * clearance) / (r - l), (bh - 2 * clearance) / (b - t))
        cxs, cys = bx + bw / 2.0, by + bh / 2.0
        ox = cxs - ((l + r) / 2.0) * s
        oy = cys - ((t + b) / 2.0) * s
        art = scaled(a["img"], s)
        bx0, by0, bx1, by1 = ox + l * s, oy + t * s, ox + r * s, oy + b * s
        reasons = []
        lim = {"left": bx + clearance, "top": by + clearance, "right": bx + bw - clearance, "bottom": by + bh - clearance}
        for nm, v, lm, over in (("left", bx0, lim["left"], bx0 < lim["left"] - EPS),
                                ("top", by0, lim["top"], by0 < lim["top"] - EPS),
                                ("right", bx1, lim["right"], bx1 > lim["right"] + EPS),
                                ("bottom", by1, lim["bottom"], by1 > lim["bottom"] + EPS)):
            if over:
                reasons.append({"metric": "clearance_" + nm, "value": r3(v), "limit": r3(lm)})
        R.post_art.append((art, floor_half(ox), floor_half(oy)))
        R.rep["placements"].append({
            "zone": "hero", "slot": "hero", "asset": a["path"], "status": a["status"], "mode": mode,
            "scale_px_per_source_px": r3(s), "image_origin": [floor_half(ox), floor_half(oy)],
            "matted_bbox": {"x": r3(bx0), "y": r3(by0), "w": r3(bx1 - bx0), "h": r3(by1 - by0)},
            "clearance_px": clearance, "overflow": bool(reasons)})
        if reasons:
            R.overflow("hero", "hero", reasons, asset=a["path"])
        R.debug_rect(bx0, by0, bx1, by1, bad=bool(reasons))
        if a["status"] == ST_PROV:
            R.prov_tag(box, "hero", "hero")
            R.note_provisional("hero", "hero", a)


def draw_head(R):
    box = HEAD_BOX
    a = R.load(R.m["head"], "head", "head", box)
    if cell_with_asset(R, "head", "head", box, a, kind="stage"):
        tr = a["spec"].get("transform") or {}
        if "eye_line_src_y" not in tr:
            raise ManifestError("head.transform.eye_line_src_y is required when head art is present")
        l, t, r, b = a["bbox"]
        cb = tr.get("core_box")
        dflt_w = (cb[2] - cb[0]) if cb else (r - l)
        dflt_cx = ((cb[0] + cb[2]) / 2.0) if cb else (l + r) / 2.0
        head_w = float(tr.get("head_width_src_px", dflt_w))
        cxs = float(tr.get("head_center_src_x", dflt_cx))
        s = (HEAD_WIDTH_RATIO * box[2]) / head_w
        ox = (box[0] + box[2] / 2.0) - cxs * s
        oy = HEAD_EYE_Y - float(tr["eye_line_src_y"]) * s
        bleed_shift = 0.0
        if tr.get("anchor") == "bottom":
            oy = (box[1] + box[3] - 2) - b * s
        elif tr.get("anchor") == "eye_line_bleed":
            # hide a hard source-crop bottom edge: slide the art down (max bleed_max_px) so its bottom reaches the box bottom
            gap = (box[1] + box[3] - 2) - (oy + b * s)
            if 0 < gap <= float(tr.get("bleed_max_px", 24)):   # only when the edge can be fully hidden
                bleed_shift = gap
                oy += bleed_shift
        art = scaled(a["img"], s)
        inner = (box[0] + 2, box[1] + 2, box[0] + box[2] - 2, box[1] + box[3] - 2)
        mask = rrect_mask(box[2] - 4, box[3] - 4, 10)
        R.pre_art.append((art, floor_half(ox), floor_half(oy), inner, mask))
        bx0, by0, bx1, by1 = ox + l * s, oy + t * s, ox + r * s, oy + b * s
        cropped = bx0 < inner[0] - EPS or by0 < inner[1] - EPS or bx1 > inner[2] + EPS or by1 > inner[3] + EPS
        R.rep["placements"].append({
            "zone": "head", "slot": "head", "asset": a["path"], "status": a["status"],
            "scale_px_per_source_px": r3(s), "image_origin": [floor_half(ox), floor_half(oy)],
            "matted_bbox": {"x": r3(bx0), "y": r3(by0), "w": r3(bx1 - bx0), "h": r3(by1 - by0)},
            "head_width_px": r3(head_w * s), "eye_line_y": HEAD_EYE_Y,
            "cropped_by_box": bool(cropped), "eye_line_y": r3(oy + float(tr["eye_line_src_y"]) * s),
            "bleed_shift_px": r3(bleed_shift), "bottom_y": r3(by1), "bottom_gap_to_box_px": r3(box[1] + box[3] - 2 - by1), "note": "crop-to-fill is allowed in the head close-up"})
        R.debug_rect(bx0, by0, bx1, by1)
        if a["status"] == ST_PROV:
            R.prov_tag(box, "head", "head")
            R.note_provisional("head", "head", a)


EXPR_CELL_INNER = 2          # 2px border inside the 125x214 art box
EXPR_ALLOW_SIDE = 6          # v2.1: effects may bleed to the gutter midpoint (12px gutter / 2) on each side; never into a neighbor core
EXPR_WIDTH_TOL = 1.0         # v2.3 policy A: 1 px tolerance on width checks (resampling / rounding)
EXPR_SAFE_MARGIN = (EXPR_W - EXPR_SAFE_W) / 2.0   # 8px each side => core safe window x+8 .. x+117


def draw_expressions(R):
    """Template rules v2 (template-rules-v2.md): the CORE box (head/hat/ears) is scaled and checked against the 109 px
    safe width; fists, ticks, bursts and other effects may use the allowance (the whole cell inside its border)."""
    m = R.m
    ex = m["expressions"]
    head_scale = ex.get("head_scale")
    anchor = ex.get("vertical_anchor", "eye_line")
    widest = 0.0
    widest_slot = None
    for i, (label, key) in enumerate(EXPR_CELLS):
        box = (EXPR_X[i], EXPR_Y, EXPR_W, EXPR_H)
        x0c = EXPR_X[i]
        cx = x0c + EXPR_W / 2.0
        a = R.load(ex[key], "expressions", key, box)
        if cell_with_asset(R, "expressions", key, box, a):
            tr = a["spec"].get("transform") or {}
            if head_scale is None:
                raise ManifestError("expressions.head_scale is required when any expression art is present")
            if "eye_line_src_y" not in tr:
                raise ManifestError("expressions.%s.transform.eye_line_src_y is required" % key)
            u = float(tr.get("units_per_source_px", 1.0))
            s0 = float(head_scale) * u
            l, t, r, b = a["bbox"]
            if tr.get("core_box"):
                cb = [float(v) for v in tr["core_box"]]
                core_src = "core_box"
            else:
                cb = [l, t, r, b]
                core_src = "matted_bbox_fallback"
                R.warn("expressions.%s: no core_box; matted bbox used as core (effects/limbs will count as core)" % key)
            crop_kind = tr.get("crop_kind", "bust")
            bottom_anchored = (anchor == "bottom" or crop_kind == "head_only")
            inner_l, inner_r = x0c - EXPR_ALLOW_SIDE, x0c + EXPR_W + EXPR_ALLOW_SIDE
            safe_l, safe_r = x0c + EXPR_SAFE_MARGIN, x0c + EXPR_W - EXPR_SAFE_MARGIN
            eye = float(tr["eye_line_src_y"])

            def geom(s):
                """Placement at scale s: core centred, then slid sideways just enough to pull effects inside the allowance."""
                core_w = (cb[2] - cb[0]) * s
                ox = cx - ((cb[0] + cb[2]) / 2.0) * s
                oy = ((EXPR_Y + EXPR_H - EXPR_CELL_INNER) - b * s) if bottom_anchored else (EXPR_EYE_Y - eye * s)
                art_l, art_r = ox + l * s, ox + r * s
                core_l, core_r = ox + cb[0] * s, ox + cb[2] * s
                lo_core, hi_core = safe_l - core_l, safe_r - core_r
                lo = max(lo_core, inner_l - art_l)
                hi = min(hi_core, inner_r - art_r)
                if lo_core > hi_core:      # core itself wider than the safe window: no slide
                    dx = 0.0
                elif lo <= hi:
                    dx = min(max(0.0, lo), hi)
                else:                      # cannot satisfy both: slide anywhere inside the core safe window to minimize the worst overflow
                    def worst(d):
                        return max(0.0, inner_l - (art_l + d), (art_r + d) - inner_r)
                    cands = [lo_core, hi_core, min(max(0.0, lo_core), hi_core),
                             min(max(((inner_l - art_l) + (inner_r - art_r)) / 2.0, lo_core), hi_core)]
                    dx = min(cands, key=lambda d: (round(worst(d), 6), abs(d)))
                art_l, art_r, core_l, core_r = art_l + dx, art_r + dx, core_l + dx, core_r + dx
                excess = max(0.0, core_w - EXPR_SAFE_W, inner_l - art_l, art_r - inner_r)
                return {"s": s, "core_w": core_w, "ox": ox + dx, "oy": oy, "dx": dx, "art_l": art_l, "art_r": art_r,
                        "core_l": core_l, "core_r": core_r, "excess": excess}

            # v2.3 policy B (wide expression art): expression portraits are not cast-scale authority. If the width excess
            # (core wider than 109 px, or any art pixel outside the allowance after the slide) is larger than the 1 px
            # tolerance, the ENTIRE asset is scaled down uniformly (aspect preserved; eye line stays at y 598 because the
            # vertical anchor is computed from the scaled eye position; scaled about the core centre; no crop, no X squash).
            fit = 1.0
            G = geom(s0)
            if G["excess"] > EXPR_WIDTH_TOL + EPS:
                lo_f, hi_f = 0.30, 1.0     # excess(f) is monotone: shrinking about the core centre only moves art inwards
                for _ in range(60):
                    mid = (lo_f + hi_f) / 2.0
                    if geom(s0 * mid)["excess"] <= EPS: lo_f = mid
                    else: hi_f = mid
                fit = math.floor(lo_f * 1e4) / 1e4
                while fit > 0.30 and geom(s0 * fit)["excess"] > EPS:
                    fit = round(fit - 1e-4, 4)
                G = geom(s0 * fit)
            s = G["s"]; core_w = G["core_w"]; ox = G["ox"]; oy = G["oy"]; dx = G["dx"]
            art_l, art_r, core_l, core_r = G["art_l"], G["art_r"], G["core_l"], G["core_r"]
            art = scaled(a["img"], s)
            clip = (-10 ** 6, -10 ** 6, 10 ** 6, EXPR_Y + EXPR_H - EXPR_CELL_INNER)
            R.pre_art.append((art, floor_half(ox), floor_half(oy), clip, None))
            top_y = oy + t * s
            core_top = oy + cb[1] * s
            bottom_y = oy + b * s
            reasons = []
            if core_w > EXPR_SAFE_W + EXPR_WIDTH_TOL + EPS:
                reasons.append({"metric": "core_width_px", "value": r3(core_w), "limit": EXPR_SAFE_W})
            if core_top < EXPR_CROWN_MIN_Y - EPS:
                reasons.append({"metric": "core_crown_y", "value": r3(core_top), "limit_min": EXPR_CROWN_MIN_Y})
            if art_l < inner_l - EXPR_WIDTH_TOL - EPS:
                reasons.append({"metric": "art_left_outside_allowance_px", "value": r3(inner_l - art_l), "limit": 0})
            if art_r > inner_r + EXPR_WIDTH_TOL + EPS:
                reasons.append({"metric": "art_right_outside_allowance_px", "value": r3(art_r - inner_r), "limit": 0})
            if top_y < EXPR_Y + EXPR_CELL_INNER - EPS:
                reasons.append({"metric": "art_top_outside_allowance_px", "value": r3(EXPR_Y + EXPR_CELL_INNER - top_y), "limit": 0})
            if core_w > widest:
                widest, widest_slot = core_w, key
            R.rep["placements"].append({
                "zone": "expressions", "slot": key, "asset": a["path"], "status": a["status"],
                "scale_px_per_source_px": r3(s), "head_scale": head_scale, "units_per_source_px": u,
                "fit_down_factor": fit, "effective_head_scale": r3(s / u) if u else None,
                "width_excess_before_fit_px": r3(geom(s0)["excess"]), "width_tolerance_px": EXPR_WIDTH_TOL,
                "image_origin": [floor_half(ox), floor_half(oy)], "anchor": "bottom" if (anchor == "bottom" or crop_kind == "head_only") else "eye_line",
                "crop_kind": crop_kind,
                "core_source": core_src, "core_box_src": [r3(v) for v in cb],
                "core_px": {"x": r3(core_l), "y": r3(core_top), "w": r3(core_w), "h": r3((cb[3] - cb[1]) * s)},
                "matted_bbox": {"x": r3(art_l), "y": r3(top_y), "w": r3(art_r - art_l), "h": r3((b - t) * s)},
                "eye_line_y": r3(oy + eye * s), "bottom_y": r3(bottom_y),
                "allowance_shift_dx": r3(dx), "overflow": bool(reasons),
                "limits": {"core_safe_width": EXPR_SAFE_W, "core_nominal_width": EXPR_NOMINAL_W, "crown_min_y": EXPR_CROWN_MIN_Y,
                           "allowance_x": [inner_l, inner_r], "allowance_note": "cell +/- 6 px (gutter midpoint)", "cell_bottom_y": EXPR_Y + EXPR_H}})
            if reasons:
                R.overflow("expressions", key, reasons, asset=a["path"])
            R.debug_rect(core_l, core_top, core_r, oy + cb[3] * s)
            R.debug_rect(art_l, top_y, art_r, bottom_y, bad=bool(reasons))
            if a["status"] == ST_PROV:
                R.prov_tag(box, "expressions", key)
                R.note_provisional("expressions", key, a)
        R.label_pill(label, cx, EXPR_PILL_Y, EXPR_W - 16, "expressions", key)
    R.rep["expression_widest_core"] = {"slot": widest_slot, "width_px": r3(widest), "safe_width": EXPR_SAFE_W}
    R.rep["expression_fit_down"] = {p["slot"]: p["fit_down_factor"] for p in R.rep["placements"] if p["zone"] == "expressions"}


def draw_silhouettes(R):
    m = R.m
    sil = m["silhouettes"]
    items = sil.get("items") or {}
    derive = sil.get("derive", True)
    cache_a = {}
    for i, (label, key) in enumerate(SIL_CELLS):
        x, w = SIL_X[i], SIL_W[i]
        box = (x, SIL_TOP, w, SIL_BOX_H)
        spec = items.get(key)
        src_desc = "explicit"
        if spec is None and derive:
            spec = m["hero"] if key == "action" else m["turnaround"][key]
            src_desc = "derived from " + ("hero" if key == "action" else "turnaround." + key)
        a = R.load(spec, "silhouettes", key, box)
        if cell_with_asset(R, "silhouettes", key, box, a):
            l, t, r, b = a["bbox"]
            crop = a["img"].crop((l, t, r, b))
            s = min(float(w) / crop.width, float(SIL_FIT_H) / crop.height)
            nw, nh = max(1, floor_half(crop.width * s)), max(1, floor_half(crop.height * s))
            al = crop.getchannel("A").resize((nw, nh), Image.LANCZOS)
            sl = Image.new("RGBA", (nw, nh), C_NAVY + (255,))
            sl.putalpha(al)
            px = x + (w - nw) // 2
            py = SIL_BASE_Y - nh
            R.post_art.append((sl, px, py))
            R.rep["placements"].append({
                "zone": "silhouettes", "slot": key, "asset": a["path"], "status": a["status"], "source": src_desc,
                "fit_box": [x, SIL_TOP, w, SIL_FIT_H], "fit_scale": r3(s),
                "bbox": {"x": px, "y": py, "w": nw, "h": nh}, "baseline_y": SIL_BASE_Y,
                "note": "fit scale is for recognition only; not a cast-size authority"})
            if a["status"] == ST_PROV:
                R.note_provisional("silhouettes", key, a)
                R.prov_tag(box, "silhouettes", key)
        f = R.fonts.get(700, 11)
        R.texts.append(lambda d, label=label, f=f, x=x, w=w:
                       R.draw_caps_in(d, label, f, C_INK, 0.04 * 11, x, 1026, 20, align="c", w=w))


def draw_details(R):
    f = R.fonts
    for i, spec in enumerate(R.m["details"]):
        x, y = DETAIL_BOXES[i]
        box = (x, y, DETAIL_W, DETAIL_ART_H)
        slot = "detail%d" % (i + 1)
        a = R.load(spec, "details", slot, box)
        if cell_with_asset(R, "details", slot, box, a):
            l, t, r, b = a["bbox"]
            crop = a["img"].crop((l, t, r, b))
            availw, availh = DETAIL_W - 16, DETAIL_ART_H - 16
            s = min(availw / crop.width, availh / crop.height)
            art = scaled(crop, s)
            px = x + (DETAIL_W - art.width) // 2
            py = y + (DETAIL_ART_H - art.height) // 2
            R.post_art.append((art, px, py))
            R.rep["placements"].append({"zone": "details", "slot": slot, "asset": a["path"], "status": a["status"],
                                        "fit_scale": r3(s), "bbox": {"x": px, "y": py, "w": art.width, "h": art.height}})
            if a["status"] == ST_PROV:
                R.note_provisional("details", slot, a)
                R.prov_tag(box, "details", slot)
        cap = (spec or {}).get("caption", "")
        if a["ph_reason"] == "open" and not cap:
            cap = ""
        if cap:
            lines, size, ell = wrap_two(f, cap, 600, 11, 10, DETAIL_W - 16, 0.0)
            if size != 11 or ell:
                R.rep["text_adjustments"].append({"zone": "details", "slot": slot, "what": "caption", "from": 11,
                                                  "to": size, "ellipsized": ell})
            fnt = f.get(600, size)

            def draw_cap(d, lines=lines, fnt=fnt, x=x, y=y):
                asc, desc = fnt.getmetrics()
                for j, l in enumerate(lines):
                    base = y + 86 + j * 13 + (13 - (asc + desc)) / 2.0 + asc
                    draw_tracked(d, x + 8, base, l, fnt, C_INK)

            R.texts.append(draw_cap)
            if len(lines) == 2:
                R.rep["text_adjustments"].append({"zone": "details", "slot": slot, "what": "2-line caption is 26px; "
                                                  "caption box is 20px (see README open question)"})


def draw_palette(R):
    f = R.fonts
    pal = R.m["palette"]
    # chip "PROVISIONAL" tag right-aligned in the chip row
    ft = f.get(800, 10)
    R.texts.append(lambda d, ft=ft: R.draw_caps_in(d, "PROVISIONAL", ft, C_INK, 0.06 * 10, 826, 788, 28,
                                                   align="r", w=1108 - 826))
    for i, slot in enumerate(pal["slots"]):
        sx, sy = PAL_SLOTS[i]
        role = (slot.get("label") or DEFAULT_PALETTE_ROLES[i]).upper()
        name = slot.get("name", "")
        hexv = slot.get("hex", "")
        status = slot.get("status", ST_PROV if (name or hexv) else ST_OPEN)
        sw = (sx, sy, 88, 52)
        key = "slot%d" % (i + 1)
        is_open = status == ST_OPEN or not (name or hexv)
        if hexv:
            col = hexrgb(hexv)
            R.bd.rounded_rectangle(sb(sw), radius=8 * SS, fill=col)
            R.od.rounded_rectangle(sb(sw), radius=8 * SS, outline=C_BORDER, width=SS)
            R.note_provisional("palette", key, {"path": hexv})
        elif is_open:
            R.art_box(sw, hatch=("OPEN —", "TO AUTHOR"), radius=8)
            R.queue_marker(sw, ("OPEN —", "TO AUTHOR"), zone="palette", slot=key)
            R.placeholder("palette", key, "open", ST_OPEN, None, sw)
            role = "OPEN"
        else:
            # name known but no hex: unsampled swatch (hatch, no marker), name still printed
            R.art_box(sw, hatch=("", ""), radius=8)
            R.placeholder("palette", key, "hex_unknown", status, None, sw, note="swatch not sampled; hex line blank")
        # role label (800, 10, shrink to 10 => ellipsis)
        t, s, shr, ell = fit_line(f, role, 800, 10, 10, 88, 0.06)
        if ell:
            R.rep["text_adjustments"].append({"zone": "palette", "slot": key, "what": "role label ellipsized",
                                              "text": role})
        fl = f.get(800, s)
        R.texts.append(lambda d, t=t, fl=fl, s=s, sx=sx, sy=sy:
                       R.draw_caps_in(d, t, fl, C_INK, 0.06 * s, sx, sy + 56, 12, align="l"))
        if name:
            lines, size, ell = wrap_two(f, name, 600, 11, 10, 88, 0.0)
            if ell or size != 11:
                R.rep["text_adjustments"].append({"zone": "palette", "slot": key, "what": "name", "from": 11,
                                                  "to": size, "ellipsized": ell})
            fnt = f.get(600, size)

            def draw_name(d, lines=lines, fnt=fnt, sx=sx, sy=sy):
                asc, desc = fnt.getmetrics()
                for j, l in enumerate(lines):
                    base = sy + 70 + j * 13 + (13 - (asc + desc)) / 2.0 + asc
                    draw_tracked(d, sx, base, l, fnt, C_INK)

            R.texts.append(draw_name)
        if hexv:
            fh = f.get(400, 10)
            R.texts.append(lambda d, hexv=hexv, fh=fh, sx=sx, sy=sy:
                           R.draw_caps_in(d, hexv.upper(), fh, C_INK, 0, sx, sy + 96, 12, align="l"))


def draw_proportion(R):
    m = R.m
    k = float(m["cast"]["k"])
    prop = m["proportion"]
    f = R.fonts
    # panel inner art box + common baseline + ruler
    inner = (1144, 824, 268, 196)
    R.art_box(inner, kind="cell", radius=12)
    R.od.line([(1144 * SS, PROP_BASE_Y * SS), (1412 * SS, PROP_BASE_Y * SS)], fill=C_NAVY + (255,), width=2 * SS)
    rx = 1154
    top_ref = PROP_BASE_Y - PROP_R
    R.od.line([(rx * SS, PROP_BASE_Y * SS), (rx * SS, (top_ref - 8) * SS)], fill=C_NAVY + (255,), width=2 * SS)
    # dashed cast-reference tick (k = 1.00)
    def dashed_h(y, x0, x1, col, w=2):
        x = x0
        while x < x1:
            R.od.line([(x * SS, y * SS), (min(x + 4, x1) * SS, y * SS)], fill=col + (255,), width=w * SS)
            x += 7

    dashed_h(top_ref, 1154, 1186, C_NAVY)
    # optional comparison marker
    cmpk = prop.get("comparison")
    if cmpk:
        cy = PROP_BASE_Y - PROP_R * float(cmpk["k"])
        dashed_h(cy, 1154, 1186, C_NAVY, w=1)
        tag = str(cmpk["tag"])[:3].upper()
        ftag = f.get(800, 10)
        R.texts.append(lambda d, tag=tag, ftag=ftag, cy=cy:
                       R.draw_caps_in(d, tag, ftag, C_INK, 0.06 * 10, 1160, cy - 14, 12, align="l"))
        R.rep["proportion_comparison"] = {"tag": tag, "k": cmpk["k"], "tick_y": r3(cy)}
    # solid brass character-height marker
    my = PROP_BASE_Y - PROP_R * k
    R.od.line([(1154 * SS, my * SS), (1186 * SS, my * SS)], fill=C_BRASS + (255,), width=3 * SS)
    R.od.polygon([(1188 * SS, my * SS), (1194 * SS, (my - 4) * SS), (1194 * SS, (my + 4) * SS)], fill=C_BRASS + (255,))
    R.rep["proportion_marker"] = {"k": k, "marker_y": r3(my), "reference_tick_y": top_ref, "baseline_y": PROP_BASE_Y,
                                  "R_px": PROP_R}
    # scale status label (always)
    fs = f.get(800, 10)
    R.texts.append(lambda d, fs=fs: R.draw_caps_in(d, "PROVISIONAL SCALE", fs, C_INK, 0.06 * 10, 1144, 1026, 20,
                                                   align="c", w=268))
    # front reference
    fr = prop.get("front_reference", "turnaround.front")
    if fr == "turnaround.front":
        spec = m["turnaround"]["front"]
    else:
        spec = fr
    fbox = PROP_FRONT_BOX
    a = R.load(spec, "proportion", "front_reference", fbox)
    if a["ok"]:
        tr = a["spec"].get("transform") or {}
        u = turnaround_units(tr, "proportion.front_reference")
        s = (PROP_R / UNITS_PER_REF) * k * u
        l, t, r, b = a["bbox"]
        ground = tr.get("ground_y_src", b)
        cxs = fbox[0] + fbox[2] / 2.0
        ox = cxs - ((l + r) / 2.0) * s
        oy = PROP_BASE_Y - ground * s
        art = scaled(a["img"], s)
        bx0, by0, bx1, by1 = ox + l * s, oy + t * s, ox + r * s, oy + b * s
        reasons = []
        if (bx1 - bx0) > fbox[2] + EPS:
            reasons.append({"metric": "width_px", "value": r3(bx1 - bx0), "limit": fbox[2]})
        if by0 < fbox[1] - EPS:
            reasons.append({"metric": "top_y", "value": r3(by0), "limit_min": fbox[1]})
        if by1 > fbox[1] + fbox[3] + EPS:
            reasons.append({"metric": "bottom_y", "value": r3(by1), "limit_max": fbox[1] + fbox[3]})
        R.post_art.append((art, floor_half(ox), floor_half(oy)))
        R.rep["placements"].append({
            "zone": "proportion", "slot": "front_reference", "asset": a["path"], "status": a["status"],
            "scale_px_per_source_px": r3(s), "R_px": PROP_R, "k": k, "image_origin": [floor_half(ox), floor_half(oy)],
            "matted_bbox": {"x": r3(bx0), "y": r3(by0), "w": r3(bx1 - bx0), "h": r3(by1 - by0)},
            "box": list(fbox), "overflow": bool(reasons)})
        if reasons:
            R.overflow("proportion", "front_reference", reasons, asset=a["path"])
        R.debug_rect(bx0, by0, bx1, by1, bad=bool(reasons))
        if a["status"] == ST_PROV:
            R.note_provisional("proportion", "front_reference", a)
            R.prov_tag(fbox, "proportion", "front_reference")
    else:
        lines = ph_lines(a["ph_reason"])
        # keep the guide readable: pattern only in the front-reference box, ruler stays on top
        R.hatch_fill(fbox, 12)
        R.dashed_border(fbox, 12)
        R.queue_marker(fbox, lines, zone="proportion", slot="front_reference")
        R.placeholder("proportion", "front_reference", a["ph_reason"], a["status"], a["plan"], fbox,
                      note="proportion guide marker still drawn from cast.k")


# ----------------------------------------------------------------- compose
def render(manifest, assets_root, fonts_dir=None, debug=False):
    validate_manifest(manifest)
    fonts = Fonts(fonts_dir)
    R = Ctx(manifest, assets_root, fonts, debug)
    for _, box in PANELS:
        R.panel(box)
    for text, x, y in CHIPS:
        R.chip(text, x, y)
    draw_header(R)
    draw_turnaround(R)
    draw_hero(R)
    draw_head(R)
    draw_expressions(R)
    draw_silhouettes(R)
    draw_details(R)
    draw_palette(R)
    draw_proportion(R)

    canvas = R.base.resize((CANVAS_W, CANVAS_H), Image.LANCZOS)
    for art, x, y, clip, mask in R.pre_art:
        blit(canvas, art, x, y, clip, mask)
    canvas.alpha_composite(R.over.resize((CANVAS_W, CANVAS_H), Image.LANCZOS))
    for item in R.post_art:
        art, x, y = item
        blit(canvas, art, x, y)
    canvas.alpha_composite(R.top.resize((CANVAS_W, CANVAS_H), Image.LANCZOS))
    d = ImageDraw.Draw(canvas)
    for t in R.texts:
        t(d)
    out = canvas.convert("RGB")
    assert out.size == (CANVAS_W, CANVAS_H)

    rep = R.rep
    ch = manifest["character"]
    rep["character"] = {"id": ch["id"], "name": ch["name"], "k": manifest["cast"]["k"]}
    rep["canvas"] = [CANVAS_W, CANVAS_H]
    rep["fonts"] = {"family": fonts.family,
                    "files": {str(w): os.path.basename(p) for w, p in sorted(fonts.paths.items())},
                    "sha256": dict(sorted(fonts.sha256.items())),
                    "license": "SIL OFL 1.1 (fonts/OFL.txt)"}
    rep["manifest_sheet_status_line"] = (manifest.get("sheet") or {}).get("status_line")
    reasons = []
    if any(p["zone"] == "header" for p in rep["placeholders"]):
        reasons.append("LOGO_ASSET missing")
    n_ph = len([p for p in rep["placeholders"] if p["zone"] != "header"])
    if n_ph:
        reasons.append("%d placeholder slot(s)" % n_ph)
    if rep["provisional"]:
        reasons.append("%d provisional slot(s)" % len(rep["provisional"]))
    if rep["overflows"]:
        reasons.append("%d overflow flag(s)" % len(rep["overflows"]))
    rep["computed_sheet_status"] = ("LAYOUT PROOF - NOT FINAL: " + "; ".join(reasons)) if reasons else \
        "COMPLETE LAYOUT - owner sign-off required before it may be called final"
    rep["counts"] = {"placeholders": len(rep["placeholders"]), "overflows": len(rep["overflows"]),
                     "provisional": len(rep["provisional"]), "template_defects": len(rep["template_defects"])}
    return out, rep


def save_png(img, path):
    clean = Image.new("RGB", img.size)
    clean.paste(img)  # fresh image: carries no .info / ICC / EXIF
    clean.save(path, format="PNG", compress_level=9, optimize=False)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Deterministic BidaZoo character-sheet renderer")
    ap.add_argument("manifest")
    ap.add_argument("out")
    ap.add_argument("--assets-root", default=None, help="directory that relative asset paths resolve against "
                                                         "(default: the manifest's folder)")
    ap.add_argument("--fonts-dir", default=None, help="folder with NunitoSans-{Regular,SemiBold,Bold,ExtraBold}.ttf")
    ap.add_argument("--debug-boxes", action="store_true", help="draw magenta placement boxes (never for finals)")
    args = ap.parse_args(argv)

    mpath = os.path.abspath(args.manifest)
    with open(mpath, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    root = os.path.abspath(args.assets_root) if args.assets_root else os.path.dirname(mpath)
    try:
        img, rep = render(manifest, root, args.fonts_dir, args.debug_boxes)
    except ManifestError as e:
        print("manifest error: %s" % e, file=sys.stderr)
        return 2
    save_png(img, args.out)
    with open(args.out, "rb") as fh:
        rep["output"] = {"file": os.path.basename(args.out), "sha256": hashlib.sha256(fh.read()).hexdigest(),
                         "size_px": [CANVAS_W, CANVAS_H]}
    rep["manifest_file"] = os.path.basename(mpath)
    rp = os.path.splitext(args.out)[0] + ".report.json"
    with open(rp, "w", encoding="utf-8") as fh:
        json.dump(rep, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    c = rep["counts"]
    print("%s: %d placeholder(s), %d provisional, %d overflow flag(s), %d template defect(s) -> %s"
          % (rep["character"]["id"], c["placeholders"], c["provisional"], c["overflows"], c["template_defects"],
             args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
