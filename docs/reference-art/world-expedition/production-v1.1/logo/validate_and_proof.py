#!/usr/bin/env python3
"""M4-7 validation + doc-15 fit proof for the LOGO_ASSET master.
Usage: python3 validate_and_proof.py MASTER_PNG SOURCE_SHEET_PNG OUT_DIR
"""
import sys, json
import numpy as np, cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

MASTER, SRC, OUT = sys.argv[1:4]
meta = json.load(open(OUT + '/logo_build_meta.json'))
L = Image.open(MASTER).convert('RGBA')
w, h = L.size
A = np.array(L)

def comp(bg):
    b = Image.new('RGBA', (w, h), bg + (255,)); b.alpha_composite(L); return b.convert('RGB')
def checker():
    yy, xx = np.mgrid[0:h, 0:w]; m = ((xx // 24 + yy // 24) % 2 == 0)
    a = np.zeros((h, w, 3), np.uint8); a[m] = (200, 200, 200); a[~m] = (240, 240, 240)
    b = Image.fromarray(a).convert('RGBA'); b.alpha_composite(L); return b.convert('RGB')
tiles = [('checkerboard', checker()), ('parchment #FEF5DF', comp((0xFE, 0xF5, 0xDF))),
         ('navy #1E3A5F', comp((0x1E, 0x3A, 0x5F))), ('gray #808080', comp((128, 128, 128)))]
sheet = Image.new('RGB', (w * 2, h * 2 + 0))
for i, (n, t) in enumerate(tiles):
    d = ImageDraw.Draw(t); d.text((10, 8), n, fill=(255, 0, 255))
    sheet.paste(t, ((i % 2) * w, (i // 2) * h))
sheet.save(OUT + '/logo_validation_4bg.png', optimize=True)

# ---- numeric checks
al = A[..., 3]
report = {}
report['size'] = [w, h]
report['edge_rows_cols_opaque_pixels'] = int((al[0] > 0).sum() + (al[-1] > 0).sum() + (al[:, 0] > 0).sum() + (al[:, -1] > 0).sum())
lab_, n = ndi.label(al > 8, structure=np.ones((3, 3)))
sz = np.sort(ndi.sum(al > 8, lab_, range(1, n + 1)))[::-1]
report['alpha_components'] = int(n); report['largest_components_px'] = [int(x) for x in sz[:5]]
report['main_component_share'] = float(sz[0] / sz.sum())
semi = (al > 0) & (al < 255)
report['semi_transparent_px'] = int(semi.sum())
# parchment-tinted fringe: straight RGB of semi pixels close to the source parchment range
rgb = A[..., :3].astype(np.float32)
lab = cv2.cvtColor(A[..., :3], cv2.COLOR_RGB2LAB).astype(np.float32)
parch = np.array([[[ (253, 217, 156), (254, 238, 204), (253, 222, 177) ]]], np.uint8).reshape(1, 3, 3)
pl = cv2.cvtColor(parch, cv2.COLOR_RGB2LAB).astype(np.float32).reshape(3, 3)
dmin = np.min([np.linalg.norm(lab - p, axis=-1) for p in pl], axis=0)
report['semi_px_parchment_tinted_dE<12'] = int((semi & (dmin < 12)).sum())
report['semi_px_parchment_tinted_share'] = float((semi & (dmin < 12)).sum() / max(semi.sum(), 1))
# fidelity vs source: downscale master (premultiplied) to native crop and compare in opaque interior
x0, y0, x1, y1 = meta['crop_box_sheet_px']
src = np.array(Image.open(SRC).convert('RGB'))[y0:y1, x0:x1].astype(np.float32)
nw, nh = x1 - x0, y1 - y0
pm = rgb * (al[..., None] / 255.0)
pm_s = cv2.resize(pm, (nw, nh), interpolation=cv2.INTER_AREA)
a_s = cv2.resize(al.astype(np.float32) / 255.0, (nw, nh), interpolation=cv2.INTER_AREA)
inner = ndi.binary_erosion(a_s > 0.995, np.ones((3, 3), bool), iterations=3)
col_s = pm_s / np.maximum(a_s[..., None], 1e-3)
diff = np.abs(col_s - src)[inner]
mse = float((diff ** 2).mean())
report['interior_px_compared'] = int(inner.sum())
report['interior_mean_abs_diff_0_255'] = float(diff.mean())
report['interior_PSNR_dB_vs_source'] = float(10 * np.log10(255 ** 2 / max(mse, 1e-9)))
json.dump(report, open(OUT + '/logo_validation_report.json', 'w'), indent=2)
print(json.dumps(report, indent=2))

# ---- doc-15 fit proof (1448x1086, parchment #FEF5DF, header panel 24,24,1400,120, slot 24,24,336,120, 12px pad)
SS = 2  # draw at 2x for crisp lines, then downsample with the final result at 1x and also save 2x crop
def render(scale):
    S = scale
    cv = Image.new('RGB', (1448 * S, 1086 * S), (0xFE, 0xF5, 0xDF))
    d = ImageDraw.Draw(cv)
    d.rounded_rectangle([24 * S, 24 * S, (24 + 1400) * S, (24 + 120) * S], radius=16 * S, fill=(0xFB, 0xEC, 0xD4), outline=(0xB8, 0x9A, 0x6A), width=2 * S)
    # slot geometry
    sx, sy, sw, sh = 24, 24, 336, 120
    px, py, pw, ph = sx + 12, sy + 12, sw - 24, sh - 24
    sc = min(pw / w, ph / h)
    tw, th = round(w * sc * S), round(h * sc * S)
    # premultiplied resize
    arr = np.array(L).astype(np.float32); a = arr[..., 3:4] / 255.0
    pmm = np.dstack([arr[..., :3] * a, a * 255.0])
    r = cv2.resize(pmm, (tw, th), interpolation=cv2.INTER_AREA)
    ra = r[..., 3:4] / 255.0
    rgb_ = np.where(ra > 0, r[..., :3] / np.maximum(ra, 1e-4), 0)
    small = Image.fromarray(np.dstack([np.clip(rgb_ + .5, 0, 255), np.clip(r[..., 3] + .5, 0, 255)]).astype(np.uint8), 'RGBA')
    ox = int((sx * S) + (sw * S - tw) / 2); oy = int((sy * S) + (sh * S - th) / 2)
    cv.paste(small, (ox, oy), small)
    d = ImageDraw.Draw(cv)
    def dashed(box, col, wd=1):
        x0_, y0_, x1_, y1_ = [v * S for v in box]; step = 6 * S
        for x in range(int(x0_), int(x1_), step * 2):
            d.line([(x, y0_), (min(x + step, x1_), y0_)], fill=col, width=wd); d.line([(x, y1_), (min(x + step, x1_), y1_)], fill=col, width=wd)
        for y in range(int(y0_), int(y1_), step * 2):
            d.line([(x0_, y), (x0_, min(y + step, y1_))], fill=col, width=wd); d.line([(x1_, y), (x1_, min(y + step, y1_))], fill=col, width=wd)
    dashed((sx, sy, sx + sw, sy + sh), (0x1E, 0x3A, 0x5F), S)        # slot box
    dashed((px, py, px + pw, py + ph), (0xC9, 0xA2, 0x4A), S)        # 12 px padding box
    # other header boxes (layout reference only)
    for box in [(376, 52, 376 + 664, 52 + 40), (376, 96, 376 + 664, 96 + 24), (1072, 66, 1072 + 336, 66 + 36)]:
        dashed(box, (0xB8, 0x9A, 0x6A), S)
    d.text((380 * S, 58 * S), "title box 376,52,664,40 (layout reference)", fill=(0x2B, 0x2A, 0x33))
    d.text((28 * S, 150 * S), f"LOGO_ASSET fit proof: slot 24,24,336,120 | pad box {px},{py},{pw},{ph} | contain-fit {tw / S:.0f}x{th / S:.0f} at ({ox / S:.0f},{oy / S:.0f}) | master {w}x{h}", fill=(0x2B, 0x2A, 0x33))
    d.text((28 * S, 166 * S), "navy dashed = slot; brass dashed = 12 px padding; brown dashed = other header boxes. Layout proof only; chrome tokens PROVISIONAL.", fill=(0x2B, 0x2A, 0x33))
    return cv, (ox / S, oy / S, tw / S, th / S)
cv1, geom = render(1)
cv1.save(OUT + '/logo_slot_fit_proof.png', optimize=True)
cv2_, _ = render(2)
cv2_.crop((0, 0, 1448, 400)).save(OUT + '/logo_slot_fit_proof_header_2x.png', optimize=True)
print('fit geom (x,y,w,h):', geom)

# ---- identity side-by-side: source crop vs master on same parchment-ish background
src_full = Image.open(SRC).convert('RGB').crop((x0, y0, x1, y1))
m_nat = L.resize((nw * 2, nh * 2), Image.LANCZOS)
s2 = src_full.resize((nw * 2, nh * 2), Image.LANCZOS)
bgc = Image.new('RGBA', m_nat.size, (0xFE, 0xF5, 0xDF, 255)); bgc.alpha_composite(m_nat)
cmp_ = Image.new('RGB', (nw * 4 + 10, nh * 2), (255, 255, 255)); cmp_.paste(s2, (0, 0)); cmp_.paste(bgc.convert('RGB'), (nw * 2 + 10, 0))
cmp_.save(OUT + '/logo_source_vs_master.png', optimize=True)
# annotated source with crop box
sh_ = Image.open(SRC).convert('RGB').crop((0, 0, 724, 260)); dd = ImageDraw.Draw(sh_)
dd.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 255), width=2)
sh_.save(OUT + '/logo_source_crop_box.png', optimize=True)
