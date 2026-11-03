"""build00.py - MUST-CHANGE pass for 00_Master_Overview.png (production-v1.1 frozen interim -> final).
Implements: the title-banner line "Visual Production Guide - Master Overview" (baked raster text, partly covered by
Click's ear -> read as "Visual Pr..uction") is erased and re-typeset in Nunito Sans along the banner arc; Click's ear
is moved BEHIND the banner (the banner rows that the ear tip covered are rebuilt by interpolating the clean banner
columns on both sides, aligned to the banner's lower outline), so the whole line is readable. Nothing else on 00 is touched here (logo / silhouettes / palette are
dependent steps; all character art is frozen)."""
import sys, os, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compfx import *
import cv2

TEXT = 'Visual Production Guide — Master Overview'
PX = 20.0
WEIGHT = 700
COLOR = (46, 24, 16)
# arc (baseline) fitted by eye to the original banner text: y = A x^2 + B x + C
A_, B_, C_ = 3.2314e-4, -0.19847, 267.88
CENTER_X = 298.0
BAND = (88, 508)


def base_y(x):
    return A_ * x * x + B_ * x + C_


def slope(x):
    return 2 * A_ * x + B_


def ear_mask(arr):
    """Click's left ear tip where it overlaps the banner: orange/pink, saturated, connected to a seed inside the ear."""
    x0, y0, x1, y1 = 165, 224, 245, 272
    sub = arr[y0:y1, x0:x1]
    hsv = cv2.cvtColor(sub, cv2.COLOR_RGB2HSV).astype(float)
    S = hsv[..., 1] / 255; V = hsv[..., 2] / 255; H = hsv[..., 0] * 2
    m = ((S > 0.38) & (V > 0.5) & ((H < 32) | (H > 330))).astype(np.uint8)
    n, lab = cv2.connectedComponents(m)
    seed = lab[262 - y0, 205 - x0]
    assert seed != 0, 'ear seed not found'
    comp = (lab == seed).astype(np.uint8)
    comp = cv2.morphologyEx(comp, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    comp = cv2.dilate(comp, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))     # cover the light rim
    full = np.zeros(arr.shape[:2], bool)
    full[y0:y1, x0:x1] = comp.astype(bool)
    return full


def build(src):
    arr = np.array(Image.open(src).convert('RGB'))
    H, W = arr.shape[:2]
    ear = ear_mask(arr)
    # --- erase the old text (dark pixels in a band around the arc), never the ear
    hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
    V = hsv[..., 2] / 255.0
    band = np.zeros((H, W), bool)
    for x in range(BAND[0], BAND[1]):
        yb = base_y(x)
        band[int(yb - 19):int(yb + 4), x] = True
    band[239:262, 308:320] = False                       # keep the board seam mark below "Guide"
    m = band & (V < 0.62) & ~ear
    m = cv2.dilate(m.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))).astype(bool) & band & ~ear
    out = inpaint(arr, m, 3)
    # --- ear tip behind the banner: rebuild banner rows 222..cut(x) for x in (XL, XR) from the clean side columns
    XL, XR, TOPROW = 170, 240, 222
    def cut_row(img, x):
        for y in range(240, 270):
            r, g, b = [int(v) for v in img[y, x]]
            if b - r > 40:
                return y - 1
        raise AssertionError('no sky below banner at x=%d' % x)
    cl, cr = cut_row(out, XL), cut_row(out, XR)
    base = out.copy()
    for x in range(XL + 1, XR):
        t = (x - XL) / float(XR - XL)
        cx_ = cl + (cr - cl) * t
        c0 = int(round(cx_))
        for y in range(TOPROW, c0 + 1):
            u = y - c0
            pl = base[cl + u, XL].astype(np.float32); pr = base[cr + u, XR].astype(np.float32)
            out[y, x] = np.clip(pl * (1 - t) + pr * t + 0.5, 0, 255).astype(np.uint8)
    # --- typeset along the arc (4x supersampled, per glyph rotation)
    f = font(WEIGHT, PX)
    total = f.getlength(TEXT) / SS
    x_start = CENTER_X - total / 2.0
    x0c, y0c, x1c, y1c = 80, 205, 520, 270
    cw, ch = (x1c - x0c) * SS, (y1c - y0c) * SS
    canvas = np.zeros((ch, cw), np.float32)
    asc, desc = f.getmetrics()
    for i, chr_ in enumerate(TEXT):
        if chr_ == ' ':
            continue
        pre = f.getlength(TEXT[:i]) / SS
        adv = f.getlength(chr_) / SS
        xc = x_start + pre + adv / 2.0
        yc = base_y(xc)
        ang = -math.degrees(math.atan(slope(xc)))
        pad = 12 * SS
        gw, gh = int(adv * SS) + 2 * pad, asc + desc + 2 * pad
        lay = Image.new('L', (gw, gh), 0)
        ImageDraw.Draw(lay).text((pad + adv * SS / 2.0, pad + asc), chr_, font=f, fill=255, anchor='ms')
        ox, oy = pad + adv * SS / 2.0, pad + asc                         # rotation pivot = glyph mid-baseline
        lay = lay.rotate(ang, resample=Image.BICUBIC, center=(ox, oy))
        g = np.array(lay).astype(np.float32) / 255.0
        px0 = int(round((xc - x0c) * SS - ox)); py0 = int(round((yc - y0c) * SS - oy))
        ya, yb2 = max(py0, 0), min(py0 + gh, ch); xa, xb = max(px0, 0), min(px0 + gw, cw)
        canvas[ya:yb2, xa:xb] = np.maximum(canvas[ya:yb2, xa:xb], g[ya - py0:yb2 - py0, xa - px0:xb - px0])
    a = cv2.resize(canvas, (x1c - x0c, y1c - y0c), interpolation=cv2.INTER_AREA)
    reg = out[y0c:y1c, x0c:x1c].astype(np.float32)
    reg = reg * (1 - a[..., None]) + np.array(COLOR, np.float32) * a[..., None]
    out[y0c:y1c, x0c:x1c] = np.clip(reg + 0.5, 0, 255).astype(np.uint8)
    info = dict(text=TEXT, px=PX, weight=WEIGHT, color=COLOR, arc=(A_, B_, C_), x_start=round(x_start, 1), width=round(total, 1))
    return out, info


if __name__ == '__main__':
    arr, info = build(sys.argv[1])
    Image.fromarray(arr).save(sys.argv[2])
    print(info)
