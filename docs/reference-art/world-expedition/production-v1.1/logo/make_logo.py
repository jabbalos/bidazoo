#!/usr/bin/env python3
"""M4-7 LOGO_ASSET: deterministic controlled reconstruction of the approved BidaZoo World Expedition logo.

Source instance : docs/reference-art/world-expedition/production-v1/02_Dino_Character_Sheet.png
                  (logo area, flat parchment behind it, nothing overlapping it)
Method          : native-resolution matte against a modeled parchment field, physically based
                  edge alpha (color-line projection) with decontaminated foreground color,
                  neighbor-panel exclusion, one soft taper for the panel-clipped bottom foliage,
                  3x Lanczos upscale of color and bicubic upscale of alpha (separately).
Usage           : python3 make_logo.py SOURCE_SHEET_PNG OUT_DIR
Deterministic   : no randomness; same input -> same output.
"""
import sys, json, hashlib
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

SRC = sys.argv[1]
OUT = sys.argv[2]
SCALE = 3
ANALYSIS_BOX = (0, 0, 520, 212)          # x0,y0,x1,y1 region of the sheet analysed
PANEL_EXCL = dict(x=463, y=140)           # note-panel edge/shadow to the right (x>=463 for y 140-183, x>=467 below)
SHEET_PANEL_TOP = 207                     # 'TURNAROUND' panel begins here; clips foliage
STRAY_LEFT = [(0, 49, 172), (0, 67, 183), (0, 81, 197)]   # (x0,x1ex,y_from) stray decor leaves bottom-left
FILL_RECT = (85, 50, 432, 176)            # holes inside this rect (letters, compass face) are solid art
TAPER_FROM = 201                          # rows >= this fade out (clipped foliage)
PAD = 4                                   # native px padding around alpha bbox

im = np.array(Image.open(SRC).convert('RGB'))
x0, y0, x1, y1 = ANALYSIS_BOX
C = im[y0:y1, x0:x1].astype(np.float32)
H, W = C.shape[:2]
R, G, B_ = C[..., 0], C[..., 1], C[..., 2]

# ---- 1. parchment background field (normalized convolution of confident-bg pixels)
conf = (R > 225) & (G > 180) & ((R - G) < 55) & ((G - B_) > 20) & (G <= R + 2)
w = conf.astype(np.float32)
def nconv(sig):
    num = np.stack([cv2.GaussianBlur(C[..., i] * w, (0, 0), sig) for i in range(3)], -1)
    den = cv2.GaussianBlur(w, (0, 0), sig)[..., None]
    return num / np.maximum(den, 1e-3), den
bg_a, den_a = nconv(14)
bg_b, _ = nconv(50)
t = np.clip(den_a / 0.05, 0, 1)
BG = bg_a * t + bg_b * (1 - t)

def lab(x):
    return cv2.cvtColor(np.clip(x, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
D = np.linalg.norm(lab(C) - lab(BG), axis=-1)

# ---- 2. core mask, neighbor exclusion, main component
core = D > 22
ex = np.zeros_like(core)
ex[PANEL_EXCL['y']:184, PANEL_EXCL['x']:] = True
ex[184:, 467:] = True
ex[SHEET_PANEL_TOP:, :] = True
for (xa, xb, yf) in STRAY_LEFT:
    ex[yf:, xa:xb] = True
core &= ~ex
lab_, n = ndi.label(core, structure=np.ones((3, 3)))
sizes = ndi.sum(core, lab_, range(1, n + 1))
main = lab_ == (int(np.argmax(sizes)) + 1)

# ---- 3. solid interior: fill holes that are surrounded by sign body (wood/letters/brass), never leaf gaps
filled = ndi.binary_fill_holes(main)
holes = filled & ~main
hl, hn = ndi.label(holes)
A0 = main.copy()
fx0, fy0, fx1, fy1 = FILL_RECT
leafish = (G > R - 5) & (G > B_ + 20)            # leaf green
disk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)).astype(bool)
for k in range(1, hn + 1):
    m = hl == k
    ys, xs = np.where(m)
    cx, cy = xs.mean(), ys.mean()
    ring = ndi.binary_dilation(m, disk) & main
    green_frac = leafish[ring].mean() if ring.any() else 1.0
    if fx0 <= cx <= fx1 and fy0 <= cy <= fy1 and green_frac < 0.30:
        A0[m] = True
small = holes & ~A0
sl, sn = ndi.label(small)
for k in range(1, sn + 1):
    m = sl == k
    if m.sum() <= 2 and (leafish[ndi.binary_dilation(m, disk) & main].mean() < 0.5):
        A0[m] = True

# ---- 3a. close small concavities in the plank/letter outline (light edge highlights read as background);
#          only accepted where the surrounding pixels are sign body, never foliage gaps
cl = ndi.binary_closing(np.pad(A0, 8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11)).astype(bool))[8:-8, 8:-8]
addm = cl & ~A0
al_, an_ = ndi.label(addm)
for k in range(1, an_ + 1):
    m = al_ == k
    ys, xs = np.where(m)
    cx, cy = xs.mean(), ys.mean()
    ring = ndi.binary_dilation(m, disk) & A0
    gf = leafish[ring].mean() if ring.any() else 1.0
    if 85 <= cx <= 460 and 35 <= cy <= 178 and gf < 0.35 and m.sum() < 400:
        A0[m] = True

# ---- 3b. scrub cream/white parchment remnants that sit in the foliage (far from sign wood/letters/brass)
wood = ((R > G) & (G > B_) & ((R - B_) > 60) & (R < 215)) | ((B_ > R + 40))
near_wood = ndi.binary_dilation(wood & A0, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)).astype(bool))
light = (R > 205) & (G > 195) & (B_ > 140) & ~(G > R + 5)
dist_ext = ndi.distance_transform_edt(A0)
scrub = A0 & light & ~near_wood & (dist_ext <= 4.5)
A0 &= ~scrub
# drop any fragments the scrub disconnected from the main body
l2, n2 = ndi.label(A0, structure=np.ones((3, 3)))
s2 = ndi.sum(A0, l2, range(1, n2 + 1))
A0 = l2 == (int(np.argmax(s2)) + 1) if n2 else A0

# ---- 4. edge alpha by projection on the bg->fg color line, foreground decontamination
sq = np.ones((3, 3), bool)
inner = ndi.binary_erosion(A0, sq, iterations=2)
band = ndi.binary_dilation(A0, sq, iterations=2) & ~inner
inner_f = inner.astype(np.float32)
sig = 2.0
Fn = np.stack([cv2.GaussianBlur(C[..., i] * inner_f, (0, 0), sig) for i in range(3)], -1)
Fw = cv2.GaussianBlur(inner_f, (0, 0), sig)[..., None]
F_s = Fn / np.maximum(Fw, 1e-4)
idx = ndi.distance_transform_edt(~inner, return_distances=False, return_indices=True)
F_nn = C[idx[0], idx[1]]
F_ext = np.where(Fw > 0.05, F_s, F_nn)          # foreground color extended outward
alpha = np.zeros((H, W), np.float32)
alpha[inner] = 1.0
d_ = F_ext - BG
den = (d_ ** 2).sum(-1)
proj = ((C - BG) * d_).sum(-1) / np.maximum(den, 1.0)
fallback = np.clip(D / 30.0, 0, 1)
a_band = np.where(den > 400, proj, fallback)
a_band = np.clip(a_band, 0, 1)
# pixels that the core mask claimed are at least weakly opaque; others only if clearly > noise
alpha[band] = a_band[band]
alpha[(~inner) & (~band)] = 0.0
alpha[alpha < 0.06] = 0.0
# decontaminated color: original in solid region, extended color in band/outside
Fc = np.where((alpha[..., None] >= 0.999), C, F_ext)

# ---- 5. taper clipped bottom foliage (panel clipped leaves at y>=207)
rows = np.arange(H, dtype=np.float32)[:, None]
taper = np.clip((SHEET_PANEL_TOP - (rows + 0.5)) / (SHEET_PANEL_TOP - TAPER_FROM), 0, 1)
taper = np.where(rows >= TAPER_FROM, taper, 1.0)
alpha = alpha * taper

# ---- 6. crop to bbox + pad
ys, xs = np.where(alpha > 0)
bx0, bx1 = max(xs.min() - PAD, 0), min(xs.max() + 1 + PAD, W)
by0, by1 = max(ys.min() - PAD, 0), min(ys.max() + 1 + PAD, H)
alpha_c = alpha[by0:by1, bx0:bx1]
Fc_c = Fc[by0:by1, bx0:bx1]
# extend foreground color everywhere in the crop (nearest) so upscaling never mixes in parchment
solid = alpha_c >= 0.999
idx2 = ndi.distance_transform_edt(~solid, return_distances=False, return_indices=True)
Fall = np.where(solid[..., None], Fc_c, Fc_c[idx2[0], idx2[1]])
# (Fc_c in the band already holds the decontaminated color; outside band it's F_ext which is nearest-based)
Fall = np.where((alpha_c[..., None] > 0), Fc_c, Fall)

# ---- 7. upscale: color Lanczos + mild unsharp, alpha bicubic + mild contrast
h, w_ = alpha_c.shape
Wn, Hn = w_ * SCALE, h * SCALE
col = cv2.resize(Fall, (Wn, Hn), interpolation=cv2.INTER_LANCZOS4)
blur = cv2.GaussianBlur(col, (0, 0), 1.6)
col = np.clip(col + 0.45 * (col - blur), 0, 255)
al = cv2.resize(alpha_c, (Wn, Hn), interpolation=cv2.INTER_CUBIC)
al = np.clip(al, 0, 1)
al = np.clip((al - 0.5) * 1.25 + 0.5, 0, 1)           # slightly firmer edge, still antialiased
al = cv2.GaussianBlur(al, (0, 0), 0.6)
al[al < 0.01] = 0
# drop isolated specks (< 100 px at master scale) left from antialiasing / panel remnants
lbl, nl = ndi.label(al > 0.03, structure=np.ones((3, 3)))
areas = ndi.sum(al > 0.03, lbl, range(1, nl + 1))
for k, a_ in enumerate(areas, 1):
    if a_ < 100:
        al[lbl == k] = 0
out = np.dstack([np.clip(col + 0.5, 0, 255).astype(np.uint8), np.round(al * 255).astype(np.uint8)])
out[..., :3][out[..., 3] == 0] = 0
Image.fromarray(out, 'RGBA').save(OUT + '/BidaZoo_World_Expedition_logo_master.png', optimize=True)

meta = dict(
    source=SRC.split('docs/')[-1],
    analysis_box=ANALYSIS_BOX,
    speck_filter_px=100,
    crop_box_sheet_px=[int(x0 + bx0), int(y0 + by0), int(x0 + bx1), int(y0 + by1)],
    native_crop_size=[int(w_), int(h)],
    scale=SCALE,
    master_size=[int(Wn), int(Hn)],
    source_sha256=hashlib.sha256(open(SRC, 'rb').read()).hexdigest(),
)
json.dump(meta, open(OUT + '/logo_build_meta.json', 'w'), indent=2)
print(json.dumps(meta, indent=2))
