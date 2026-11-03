"""compfx.py - deterministic helpers for the M4 composite pass (no AI, no randomness).
Erase = mask text pixels by luminance polarity vs. a per-row median, dilate, cv2.inpaint (TELEA).
Draw  = Nunito Sans rendered 4x supersampled, downsampled with LANCZOS, alpha-composited.
"""
import os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.normpath(os.path.join(HERE, '..', 'renderer', 'fonts'))
WEIGHTS = {400: 'NunitoSans-Regular.ttf', 600: 'NunitoSans-SemiBold.ttf',
           700: 'NunitoSans-Bold.ttf', 800: 'NunitoSans-ExtraBold.ttf'}
SS = 4  # supersample factor


def font(weight, px):
    return ImageFont.truetype(os.path.join(FONT_DIR, WEIGHTS[weight]), int(round(px * SS)))


def lum(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def text_mask(arr, box, polarity, thresh, dilate=2, exclude=None):
    """Boolean mask (full-size) of text pixels inside box. polarity 'dark' = text darker than the row median,
    'light' = text lighter than the row median."""
    x0, y0, x1, y1 = box
    sub = arr[y0:y1, x0:x1].astype(np.float32)
    L = lum(sub)
    med = np.median(L, axis=1, keepdims=True)
    m = (L < med - thresh) if polarity == 'dark' else (L > med + thresh)
    full = np.zeros(arr.shape[:2], np.uint8)
    full[y0:y1, x0:x1] = m
    if exclude is not None:
        full[exclude] = 0
    if dilate:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dilate + 1, 2 * dilate + 1))
        full = cv2.dilate(full, k)
        # never grow outside the box
        keep = np.zeros_like(full); keep[y0:y1, x0:x1] = 1
        full = full * keep
        if exclude is not None:
            full[exclude] = 0
    return full.astype(bool)


def inpaint(arr, mask, radius=3):
    out = cv2.inpaint(np.ascontiguousarray(arr), mask.astype(np.uint8) * 255, radius, cv2.INPAINT_TELEA)
    return out


def bbox_of(mask):
    ys, xs = np.where(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def measure(text, weight, px, tracking_em=0.0):
    f = font(weight, px)
    w = 0.0
    for i, ch in enumerate(text):
        w += f.getlength(ch) / SS + (tracking_em * px if i < len(text) - 1 else 0)
    # kerning-aware width when no tracking
    if tracking_em == 0:
        w = f.getlength(text) / SS
    bb = f.getbbox(text)
    return w, (bb[1] / SS, bb[3] / SS)


def size_for_height(text, weight, target_h, lo=6, hi=80):
    """px size whose tight ink height (top of tallest glyph to bottom of lowest) equals target_h."""
    best = lo
    for px in np.arange(lo, hi, 0.25):
        _, (t, b) = measure(text, weight, px)
        if b - t <= target_h:
            best = px
        else:
            break
    return float(best)


def draw_text(img, text, x, baseline, weight, px, fill, anchor='l', tracking_em=0.0, mask_keep=None, angle=0.0):
    """Draw text on PIL RGB image. anchor l/c/r relative to x. baseline = y of the text baseline.
    mask_keep: optional boolean array (full-size) of pixels that must NOT be overwritten (drawn after)."""
    f = font(weight, px)
    w, _ = measure(text, weight, px, tracking_em)
    asc, desc = f.getmetrics()
    pad = 8
    W = int(math.ceil(w)) + 2 * pad
    H = int(math.ceil((asc + desc) / SS)) + 2 * pad
    lay = Image.new('L', (W * SS, H * SS), 0)
    d = ImageDraw.Draw(lay)
    cx = pad * SS
    base_y = pad * SS + asc
    if tracking_em == 0:
        d.text((cx, base_y), text, font=f, fill=255, anchor='ls')
    else:
        for ch in text:
            d.text((cx, base_y), ch, font=f, fill=255, anchor='ls')
            cx += f.getlength(ch) + tracking_em * px * SS
    lay = lay.resize((W, H), Image.LANCZOS)
    ox = {'l': x - pad, 'c': x - w / 2 - pad, 'r': x - w - pad}[anchor]
    oy = baseline - (pad + asc / SS)
    ix, iy = int(math.floor(ox)), int(math.floor(oy))
    # sub-pixel shift is ignored (deterministic integer placement)
    a = np.array(lay).astype(np.float32) / 255.0
    base = np.array(img).astype(np.float32)
    H0, W0 = base.shape[:2]
    x0, y0 = max(ix, 0), max(iy, 0)
    x1, y1 = min(ix + W, W0), min(iy + H, H0)
    if x1 <= x0 or y1 <= y0:
        return img
    aa = a[y0 - iy:y1 - iy, x0 - ix:x1 - ix]
    if mask_keep is not None:
        aa = aa * (~mask_keep[y0:y1, x0:x1])
    col = np.array(fill, np.float32)
    base[y0:y1, x0:x1] = base[y0:y1, x0:x1] * (1 - aa[..., None]) + col * aa[..., None]
    return Image.fromarray(np.clip(base + 0.5, 0, 255).astype(np.uint8))


def text_color(arr, mask, polarity='dark'):
    px = arr[mask]
    L = lum(px.astype(np.float32))
    k = max(5, len(px) // 8)
    idx = np.argsort(L)
    sel = idx[:k] if polarity == 'dark' else idx[-k:]
    return tuple(int(v) for v in np.median(px[sel], axis=0))


def baseline_of(mask, box):
    """Baseline row (y of the first row BELOW the ink of non-descending glyphs) from a row-density profile."""
    x0, y0, x1, y1 = box
    prof = mask[y0:y1, x0:x1].sum(axis=1).astype(float)
    if prof.max() == 0:
        return y1
    rows = np.where(prof > 0.30 * prof.max())[0]
    return y0 + rows.max() + 1


def row_fill(arr, mask, box):
    """Replace masked pixels by the per-row median of the unmasked pixels of the same row inside box
    (exact for flat / vertical-gradient fills). Rows without clean pixels fall back to cv2.inpaint."""
    x0, y0, x1, y1 = box
    out = arr.copy()
    need = np.zeros(arr.shape[:2], np.uint8)
    for y in range(y0, y1):
        mrow = mask[y, x0:x1]
        if not mrow.any():
            continue
        clean = arr[y, x0:x1][~mrow]
        if len(clean) < 6:
            need[y, x0:x1] = mrow
            continue
        med = np.median(clean, axis=0)
        out[y, x0:x1][mrow] = med.astype(np.uint8)
    if need.any():
        out = inpaint(out, need.astype(bool))
    return out


def retype(arr, box, text, weight, polarity, thresh, anchor='l', px=None, fill=None, tracking=0.0,
           dil=2, x=None, base=None, size_from=None, dx=0, dy=0, keep=None, radius=3, size_scale=1.0,
           mode='inpaint', fit_width=None):
    """Erase the text inside `box` and draw `text` in Nunito Sans at the same position.
    Returns (new_arr, info). Size: `px` if given, else the px whose ink height equals the original's
    (using `size_from` text if the replacement string differs)."""
    m0 = text_mask(arr, box, polarity, thresh, dilate=0, exclude=keep)
    bx0, by0, bx1, by1 = bbox_of(m0)
    col = fill or text_color(arr, m0, polarity)
    m = text_mask(arr, box, polarity, thresh, dilate=dil, exclude=keep)
    out = row_fill(arr, m, box) if mode == 'row' else inpaint(arr, m, radius)
    img = Image.fromarray(out)
    if px is None:
        px = size_for_height(size_from or text, weight, by1 - by0) * size_scale
    if fit_width is not None:
        w, _ = measure(text, weight, px, tracking)
        if w > fit_width:
            px = px * fit_width / w
    if x is None:
        x = {'l': bx0, 'c': (bx0 + bx1) / 2.0, 'r': bx1}[anchor]
    if base is None:
        base = baseline_of(m0, box)
    img = draw_text(img, text, x + dx, base + dy, weight, px, col, anchor=anchor, tracking_em=tracking, mask_keep=keep)
    info = dict(text=text, ink=(int(bx0), int(by0), int(bx1), int(by1)), base=int(base), px=float(px), color=col)
    return np.array(img), info


def line_boxes(arr, box, polarity='dark', thresh=35, gap=1, minpix=2):
    """Detect text-line ink boxes inside `box` by row projection of the text mask."""
    m = text_mask(arr, box, polarity, thresh, dilate=0)
    x0, y0, x1, y1 = box
    prof = m[y0:y1, x0:x1].sum(1)
    segs, cur = [], None
    for i, v in enumerate(prof):
        if v >= minpix:
            if cur is None:
                cur = [i, i]
            else:
                cur[1] = i
        elif cur is not None and i - cur[1] > gap:
            segs.append(cur); cur = None
    if cur:
        segs.append(cur)
    out = []
    for a, b in segs:
        xs = np.where(m[y0 + a:y0 + b + 1, x0:x1].any(0))[0]
        out.append((int(x0 + xs.min()), int(y0 + a), int(x0 + xs.max() + 1), int(y0 + b + 1)))
    return out


def retype_block(arr, box, texts, weight=400, px=None, polarity='dark', thresh=35, dil=2, fill=None,
                 max_width=None, skip_idx=(), radius=3):
    """Replace a block of text lines (one string per detected line, same order). All lines share one px size
    (default: ink-height match of the tallest line, capped so every line fits max_width)."""
    lbs = line_boxes(arr, box, polarity, thresh)
    assert len(lbs) == len(texts), (box, len(lbs), len(texts), lbs)
    mask = np.zeros(arr.shape[:2], bool)
    for lb in lbs:
        mask |= text_mask(arr, lb, polarity, thresh, dilate=dil)
    col = fill or text_color(arr, mask, polarity)
    out = inpaint(arr, mask, radius)
    img = Image.fromarray(out)
    if px is None:
        px = min(size_for_height(t, weight, lb[3] - lb[1]) for t, lb in zip(texts, lbs))
    if max_width:
        for t in texts:
            w, _ = measure(t, weight, px)
            if w > max_width:
                px = px * max_width / w
    info = []
    for t, lb in zip(texts, lbs):
        if t is None:
            continue
        m0 = text_mask(arr, lb, polarity, thresh, dilate=0)
        base = baseline_of(m0, lb)
        img = draw_text(img, t, lb[0], base, weight, px, col)
        info.append((t, lb, int(base)))
    return np.array(img), dict(px=float(px), color=col, lines=info)
