"""step2.py - STEP 2 of the composite pass (logo, silhouettes + pills/labels, palette cards, panel-3 subtitle).
Pure functions on RGB uint8 arrays; called from build_composites.py after the STEP 1 builders. Deterministic."""
import os, json, math
import numpy as np
import cv2
from PIL import Image, ImageDraw
from compfx import *
from build07 import paste_premult, resize_rgba, rrect, K, CHARS, NAMES, manifest, LIB

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
LOGO = os.path.join(ROOT, 'logo', 'BidaZoo_World_Expedition_logo_master.png')
PALETTES = os.path.join(ROOT, 'renderer', 'palettes.json')
H_EAGLE = 176.5      # px height of the Eagle (k = 1.000) in the 07 panel-1 lineup (build07.panel1: base_y - grid_y[0])

# ---------------------------------------------------------------- logo
# Old (baked, horizontally stretched) logo footprints, traced by eye on the frozen composites, +-3 px.
OLD_LOGO_POLY = {
    '08': [(52, 62), (62, 30), (85, 12), (120, 3), (190, 0), (300, 2), (345, 6), (385, 20), (408, 40), (412, 90), (400, 112), (378, 133),
           (300, 136), (130, 136), (95, 130), (65, 120), (50, 98)],
    '07': [(45, 70), (60, 30), (100, 8), (150, 0), (300, 0), (400, 0), (470, 6), (512, 25), (524, 60), (522, 84), (518, 110), (500, 135), (470, 150),
           (400, 165), (300, 172), (200, 172), (120, 168), (70, 150), (48, 120)],
    '00': [(5, 60), (25, 25), (60, 8), (120, 0), (300, 0), (480, 0), (560, 6), (605, 25), (628, 70), (625, 130), (600, 170), (560, 200), (522, 226)],
}
# Old wooden sign body (planks, letters, compass, arch) traced by eye, +-3 px: always logo, never background.
OLD_SIGN_POLY = {
    '08': [(63, 28), (75, 22), (92, 12), (130, 10), (160, 16), (228, 14), (262, 13), (300, 18), (345, 25), (380, 34), (388, 50), (388, 75), (372, 100),
           (360, 122), (358, 130), (300, 130), (230, 131), (150, 129), (110, 128), (86, 124), (76, 108), (66, 85)],
    '07': [(69, 43), (85, 36), (102, 26), (154, 21), (192, 23), (250, 20), (302, 13), (385, 15), (437, 28), (480, 40), (507, 52), (510, 100), (500, 125),
           (484, 138), (482, 150), (474, 160), (400, 164), (300, 167), (200, 166), (150, 165), (125, 160), (122, 140), (105, 125), (80, 100), (70, 70)],
    '00': [(38, 67), (55, 58), (71, 40), (100, 31), (147, 35), (178, 44), (249, 36), (329, 34), (390, 40), (444, 44), (500, 52), (540, 65), (590, 80),
           (598, 110), (590, 140), (570, 175), (566, 205), (552, 222), (300, 228), (200, 226), (150, 224), (110, 224), (95, 212), (88, 175), (60, 150), (40, 110)],
}
# new logo placement: (top y, height, centre x) - height-limited so the true 2.354:1 aspect is kept (identity unchanged)
LOGO_PLACE = {'08': (4, 128, 231), '07': (1, 166, 283), '00': (0, 235, 313)}


# top edge of the 00 'Visual Production Guide' banner: quartic fit of the plank/banner boundary (x 80..500)
BANNER_POLY = [2.25349998e-09, -2.07682124e-06, 8.90062299e-04, -2.25645228e-01, 2.38230573e+02]


def banner_curve(x):
    p = BANNER_POLY
    x = np.asarray(x, float)
    y = np.polyval(p, np.clip(x, 80, 500))
    y = np.where(x < 80, 224.9 + (80 - x) * 0.55, y)      # banner's left end drops towards its corner
    y = np.where(x > 500, 228.2 + (x - 500) * 0.55, y)
    return y


def old_logo_mask(shape, key, grow=4):
    m = Image.new('L', (shape[1], shape[0]), 0)
    pts = list(OLD_LOGO_POLY[key])
    if key == '00':
        xs = list(range(522, 59, -4))
        pts += [(x, float(banner_curve(x)) + 1) for x in xs] + [(52, 232), (30, 205), (8, 150)]
    ImageDraw.Draw(m).polygon(pts, fill=255)
    m = np.array(m) > 0
    return cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))).astype(bool)


def bg_like(arr):
    """Pixels that read as page background (pale parchment, pale sky, cloud). Saturated logo colours (yellow/orange
    letters, blue letters, wood, leaves) are never background."""
    hsv = cv2.cvtColor(np.ascontiguousarray(arr), cv2.COLOR_RGB2HSV).astype(np.float32)
    H = hsv[..., 0] * 2.0; S = hsv[..., 1] / 255.0; V = hsv[..., 2] / 255.0
    r, g, b = [arr[..., i].astype(int) for i in range(3)]
    parchment = (H > 20) & (H < 58) & (S < 0.34) & (V > 0.80)
    sky = (b > r + 18) & (b >= g - 6) & (V > 0.62) & (S < 0.62)
    white = (S < 0.14) & (V > 0.84)
    return parchment | sky | white


def parchment_like(arr):
    hsv = cv2.cvtColor(np.ascontiguousarray(arr), cv2.COLOR_RGB2HSV).astype(np.float32)
    H = hsv[..., 0] * 2.0; S = hsv[..., 1] / 255.0; V = hsv[..., 2] / 255.0
    return ((H > 20) & (H < 58) & (S < 0.40) & (V > 0.74)) | ((S < 0.14) & (V > 0.84))


def old_logo_pixels(arr, key):
    """Mask of the old baked logo (+ halo): traced hull minus background-like pixels, closed so letter highlights and
    white plank text are included, then grown 2 px."""
    hull = old_logo_mask(arr.shape, key, grow=0)
    m = (hull & ~bg_like(arr)).astype(np.uint8)
    hsv = cv2.cvtColor(np.ascontiguousarray(arr), cv2.COLOR_RGB2HSV).astype(np.float32)
    leaf = (hsv[..., 0] * 2.0 > 62) & (hsv[..., 0] * 2.0 < 170) & (hsv[..., 1] / 255.0 > 0.30) & (hsv[..., 2] / 255.0 < 0.85)
    if key != '08':                                            # 08's left jungle backdrop is also leaf-coloured
        m = (m.astype(bool) | (leaf & old_logo_mask(arr.shape, key, grow=8))).astype(np.uint8)
    sg = Image.new('L', (arr.shape[1], arr.shape[0]), 0)
    ImageDraw.Draw(sg).polygon(OLD_SIGN_POLY[key], fill=255)
    m = m | (cv2.dilate(np.array(sg), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    from scipy import ndimage
    m = ndimage.binary_fill_holes(m)
    m = cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(bool)
    return m & old_logo_mask(arr.shape, key, grow=8)


def smooth_fill(arr, m, clean_margin=2, exclude=None, support=None, sigmas=(2, 4, 8, 16, 32, 64, 128, 256), thr=0.25):
    """Backdrop plate fill: normalised Gaussian convolution restricted to `support` pixels (clean backdrop: parchment /
    sky / cloud, never leaves, wood or letters), finest sigma that has enough nearby support wins (so parchment stays
    parchment and sky stays sky; no grey blends except across a real boundary)."""
    mm = cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * clean_margin + 1,) * 2)).astype(bool)
    ok_src = ~mm
    if support is not None:
        ok_src &= support
    if exclude is not None:
        ok_src &= ~exclude
    ok_src = cv2.erode(ok_src.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
    img = arr.astype(np.float32)
    out = img.copy()
    todo = m.copy()
    for i, sg in enumerate(sigmas):
        num = np.stack([cv2.GaussianBlur(img[..., c] * ok_src, (0, 0), sg) for c in range(3)], -1)
        den = cv2.GaussianBlur(ok_src, (0, 0), sg)[..., None]
        last = i == len(sigmas) - 1
        sel = todo & (den[..., 0] > (1e-6 if last else thr))
        out[sel] = (num / np.maximum(den, 1e-9))[sel]
        todo &= ~sel
    # light smoothing inside the mask only (removes cell-to-cell steps between sigma levels)
    mf = m.astype(np.float32)
    num = np.stack([cv2.GaussianBlur(out[..., c] * mf, (0, 0), 2.5) for c in range(3)], -1)
    den = cv2.GaussianBlur(mf, (0, 0), 2.5)[..., None]
    fill = num / np.maximum(den, 1e-6)
    fa = cv2.GaussianBlur(cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 3.0)
    fa = np.where(m, np.maximum(fa, 0.0), fa)
    fa = np.minimum(1.0, fa * 1.0)
    res = img * (1 - fa[..., None]) + fill * fa[..., None]
    res = np.where(m[..., None], np.where(fa[..., None] > 0.999, fill, res), res)
    return np.clip(res + 0.5, 0, 255).astype(np.uint8)


def apply_logo(arr, key):
    logo = Image.open(LOGO).convert('RGBA')
    logo = logo.crop(logo.getchannel('A').getbbox())            # tight alpha bbox (1443x613)
    top, hgt, cx = LOGO_PLACE[key]
    sm = resize_rgba(logo, hgt / float(logo.height))
    x = int(round(cx - sm.width / 2.0)); y = top
    ys = np.arange(arr.shape[0])[:, None]; xs = np.arange(arr.shape[1])[None, :]
    m = old_logo_pixels(arr, key)
    if key in ('07', '08'):                                      # leave scenery leaves further than 14 px from the old sign body
        sg = Image.new('L', (arr.shape[1], arr.shape[0]), 0)
        ImageDraw.Draw(sg).polygon(OLD_SIGN_POLY[key], fill=255)
        near = cv2.dilate(np.array(sg), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))) > 0
        m &= near
    if key == '00':                                              # never touch the banner or the ear below it
        m &= ~((xs >= 60) & (xs <= 522) & (ys >= banner_curve(xs) - 0.5))
    # pixels that the new logo will fully cover need no fill (their value is irrelevant), edge pixels do
    a = np.zeros(arr.shape[:2], np.float32)
    aa = np.array(sm.getchannel('A')).astype(np.float32) / 255.0
    a[y:y + sm.height, x:x + sm.width] = aa
    core = cv2.erode((a > 0.97).astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    hsv = cv2.cvtColor(np.ascontiguousarray(arr), cv2.COLOR_RGB2HSV).astype(np.float32)
    green = (hsv[..., 0] * 2.0 > 62) & (hsv[..., 0] * 2.0 < 170) & (hsv[..., 1] / 255.0 > 0.30)
    ex = np.zeros(arr.shape[:2], bool)
    if key == '08':
        ex[137:, :] = True                                       # the HUD header bar below
    elif key == '07':
        ex[171:, :] = True; ex[80:, 519:] = True; ex |= green    # panel 1 below, title panel right, decoration leaves left
    else:
        ex |= green; ex[(xs >= 60) & (xs <= 522) & (ys >= banner_curve(xs) - 4)] = True
    out = smooth_fill(arr, m, exclude=ex, support=parchment_like(arr))
    paste_premult(out, sm, x, y)
    if key == '00':                                              # restore the "Visual Production Guide" banner (+ ear behind it) from STEP 1
        r = (xs >= 60) & (xs <= 522) & (ys >= banner_curve(xs) - 0.5)
        out[r] = arr[r]
    info = dict(box=(x, y, x + sm.width, y + sm.height), scale=round(hgt / float(logo.height), 4), filled_px=int(m.sum()))
    return out, info


# ---------------------------------------------------------------- silhouettes
def sil_layout(avail_w, centre_x, gap=8):
    items = {}
    for c in CHARS:
        ref = float(manifest(c)['turnaround']['front']['transform']['ref_height_src_px'])
        im = Image.open(os.path.join(LIB, c, f'{c}_silhouette_front.png')).convert('RGBA')
        s = H_EAGLE * K[c] / ref                                  # same cast-relative scale as panel 1
        items[c] = (im, s)
    wsum = sum(im.width * s for im, s in items.values())
    f = (avail_w - 5 * gap) / wsum
    x = centre_x - avail_w / 2.0
    out = {}
    for c in CHARS:
        im, s = items[c]
        w = im.width * s * f
        out[c] = dict(im=im, s=s * f, cx=x + w / 2.0, w=w)
        x += w + gap
    return out, f


def fill_navy(arr, box, grow=4, radius=5):
    """Erase the old baked navy silhouettes inside `box`: mask = dark blue-ish pixels (luma < 150, b >= r), grown by `grow`
    px for the anti-aliased rim, then cv2.inpaint from the parchment around. Frames / chips outside the box are untouched."""
    x0, y0, x1, y1 = box
    sub = arr[y0:y1, x0:x1].astype(int)
    L = sub[..., 0] * 0.299 + sub[..., 1] * 0.587 + sub[..., 2] * 0.114
    d = (L < 150) & (sub[..., 2] >= sub[..., 0])
    m = np.zeros(arr.shape[:2], np.uint8); m[y0:y1, x0:x1] = d
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    keep = np.zeros_like(m); keep[y0:y1, x0:x1] = 1
    return cv2.inpaint(np.ascontiguousarray(arr), m * keep * 255, radius, cv2.INPAINT_TELEA)


def fill_dev(arr, box, thresh=60, grow=3, radius=4):
    """Erase everything that deviates from the box's parchment (median colour) by more than `thresh` (sum of |dRGB|)."""
    x0, y0, x1, y1 = box
    sub = arr[y0:y1, x0:x1].astype(int)
    bg = np.median(sub.reshape(-1, 3), axis=0)
    d = np.abs(sub - bg).sum(2) > thresh
    m = np.zeros(arr.shape[:2], np.uint8); m[y0:y1, x0:x1] = d
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    keep = np.zeros_like(m); keep[y0:y1, x0:x1] = 1
    return cv2.inpaint(np.ascontiguousarray(arr), m * keep * 255, radius, cv2.INPAINT_TELEA)


def pill_samples(arr, y_mid, x0, x1):
    """(left,right,top_rgb,bottom_rgb,mid_rgb) for every saturated pill on row y_mid."""
    row = arr[y_mid, x0:x1].astype(int)
    sat = row.max(1) - row.min(1)
    xs = np.where(sat > 80)[0] + x0
    segs, s, p = [], None, None
    for x in xs:
        if s is None: s = p = x
        elif x - p > 4: segs.append((s, p)); s = x
        p = x
    if s is not None: segs.append((s, p))
    return [sg for sg in segs if sg[1] - sg[0] > 25]


def silhouettes_07(arr):
    segs = pill_samples(arr, 408, 976, 1432)
    assert len(segs) == 6, segs
    samples = []
    for (a, b) in segs:
        xs = a + 6
        top = np.median(arr[408:411, xs:xs + 3].reshape(-1, 3), axis=0)
        bot = np.median(arr[419:422, xs:xs + 3].reshape(-1, 3), axis=0)
        samples.append((tuple(int(v) for v in top), tuple(int(v) for v in bot)))
    arr = fill_navy(arr, (962, 232, 1434, 402))
    arr = fill_dev(arr, (966, 402, 1432, 430), 70)
    lay, f = sil_layout(440, 1204)
    base = 398.0
    info = {'f': round(f, 4)}
    img = None
    for i, c in enumerate(CHARS):
        L = lay[c]
        sm = resize_rgba(L['im'], L['s'])
        sbb = sm.getchannel('A').getbbox()
        x = int(round(L['cx'] - (sbb[0] + sbb[2]) / 2.0)); y = int(round(base + 0.5 - sbb[3]))
        paste_premult(arr, sm, x, y)
        info[c] = dict(box=(x + sbb[0], y + sbb[1], x + sbb[2], y + sbb[3]), scale=round(L['s'], 4))
        pw = 62
        rrect(arr, int(round(L['cx'] - pw / 2.0)), 405, int(round(L['cx'] + pw / 2.0)), 425, 10, None, grad=samples[i])
    img = Image.fromarray(arr)
    for c in CHARS:
        img = draw_text(img, NAMES[c], lay[c]['cx'], 415.0 + 3.6, 800, 10.5, (255, 255, 255), anchor='c', tracking_em=0.04)
    return np.array(img), info


def silhouettes_00(arr):
    # old per-character label colours + baseline (sampled before erase)
    region = (925, 764, 1436, 786)
    m0 = text_mask(arr, region, 'dark', 40, dilate=0)
    # dark-text polarity misses the light-coloured ones; use deviation from the parchment instead
    sub = arr[764:786, 925:1436].astype(int); bg = np.median(sub.reshape(-1, 3), axis=0)
    dev = np.zeros(arr.shape[:2], bool); dev[764:786, 925:1436] = np.abs(sub - bg).sum(2) > 90
    cols = dev[764:786, 925:1436].any(0)
    segs, s, p = [], None, None
    for i, v in enumerate(cols):
        if v:
            if s is None: s = p = i
            elif i - p > 14: segs.append((s, p)); s = i
            p = i
    if s is not None: segs.append((s, p))
    assert len(segs) == 6, segs
    colors = []
    for (a, b) in segs:
        px = arr[764:786, 925 + a:925 + b + 1][dev[764:786, 925 + a:925 + b + 1]]
        L = lum(px.astype(np.float32)); idx = np.argsort(L)[:max(5, len(px) // 6)]
        colors.append(tuple(int(v) for v in np.median(px[idx], axis=0)))
    ys = np.where(dev[764:786, 925:1436].any(1))[0]
    rows = dev[764:786, 925:1436].sum(1); base = 764 + int(np.where(rows > 0.3 * rows.max())[0].max()) + 1
    arr = fill_navy(arr, (905, 618, 1438, 760))
    arr = fill_dev(arr, (925, 761, 1436, 788), 90)
    lay, f = sil_layout(500, 1178)
    info = {'f': round(f, 4), 'label_baseline': base, 'label_colors': colors}
    img = None
    for c in CHARS:
        L = lay[c]
        sm = resize_rgba(L['im'], L['s'])
        sbb = sm.getchannel('A').getbbox()
        x = int(round(L['cx'] - (sbb[0] + sbb[2]) / 2.0)); y = int(round(754.5 - sbb[3]))
        paste_premult(arr, sm, x, y)
        info[c] = dict(box=(x + sbb[0], y + sbb[1], x + sbb[2], y + sbb[3]), scale=round(L['s'], 4))
    img = Image.fromarray(arr)
    for c, col in zip(CHARS, colors):
        img = draw_text(img, c.capitalize(), lay[c]['cx'], base, 700, 14.0, col, anchor='c')
    return np.array(img), info


# ---------------------------------------------------------------- palette cards (07 panel 3)
CARDS = {  # swatch left x, swatch right x (exclusive), label x, card interior right edge
    'click': (135, 158), 'dino': (366, 389), 'koala': (607, 630), 'tarsier': (839, 862), 'eagle': (1074, 1097), 'bronco': (1317, 1340)}
ROWS = [(536, 560), (563, 587), (590, 613), (616, 640), (642, 667)]
CARD_RIGHT = {'click': 246, 'dino': 482, 'koala': 718, 'tarsier': 952, 'eagle': 1190, 'bronco': 1432}
INK = (28, 52, 98)


def palette_rows(c):
    P = json.load(open(PALETTES))['characters'][c]['slots']
    rows = [(s['label'], s['hex'].upper()) for s in P[:5]]
    if c == 'bronco':                       # slot 6 BANDANA (maroon) replaces slot 4 GEAR (old crimson "Gear"); red star/gear stays ACCENT
        bandana = [s for s in P if s['label'] == 'BANDANA'][0]
        rows[3] = ('BANDANA', bandana['hex'].upper())
    return rows


def darker(rgb, k=0.80):
    return tuple(int(v * k) for v in rgb)


def palette_cards(arr):
    info = {}
    for c in CHARS:
        sl, sr = CARDS[c]
        R = CARD_RIGHT[c]
        # erase old swatches + text: per-row fill from the clean right margin of the card (keeps the zebra banding)
        x0, x1, y0, y1 = sl - 3, R - 2, 534, 670
        for y in range(y0, y1):
            marg = np.median(arr[y, R - 1:R + 2].reshape(-1, 3), axis=0)
            arr[y, x0:x1] = marg.astype(np.uint8)
        rows = palette_rows(c)
        info[c] = rows
        for (lab, hx), (ty, by) in zip(rows, ROWS):
            rgb = tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5))
            rrect(arr, sl, ty, sr, by, 4, rgb, border=darker(rgb) if hx != '#FFFFFF' else (200, 200, 205))
            # interior must carry the exact hex: overwrite the core (inset 2 px) with the flat colour
            arr[ty + 2:by - 2, sl + 2:sr - 2] = rgb
    img = Image.fromarray(arr)
    for c in CHARS:
        sl, sr = CARDS[c]
        for (lab, hx), (ty, by) in zip(info[c], ROWS):
            cy = (ty + by) / 2.0
            img = draw_text(img, lab, sl + 29, cy - 1.0, 800, 10.0, INK, anchor='l', tracking_em=0.06)
            img = draw_text(img, hx, sl + 29, cy + 10.2, 400, 10.0, INK, anchor='l')
    return np.array(img), info


def subtitle_panel3(arr):
    return retype(arr, (217, 470, 700, 489), 'Core colors for each character. All values are PROVISIONAL, not final palette authority.', 600,
                  'dark', 40, px=12.0, mode='row', fit_width=472, dil=2)
