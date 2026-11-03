#!/usr/bin/env python3
"""Task A: recolor ONLY koala_detail_glasses to canonical dark charcoal / near-black frames.
Deterministic. Alpha channel and every pixel's luminance structure are preserved (geometry, lens shape,
highlight positions); only the chroma/brown cast is replaced by the frame colour sampled from approved Koala art.
Inputs  (read-only): library/koala/koala_turnaround_front.png, koala_head.png (approved library art),
                     production-v1/03_Koala_Character_Sheet.png (head close-up frames)
Writes: library/koala/koala_detail_glasses.png (+ _4bg.png), the pre-M4 copy to library/koala/_superseded/,
        tools/koala_glasses_report.json
"""
import sys, os, json, hashlib, shutil
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qa_tool

ROOT = '/mnt/user-data/outputs/m4-release'
LIB = f'{ROOT}/library/koala'
SHEET = '/mnt/user-data/uploads/BidaZoo-World-Expedition/docs/reference-art/world-expedition/production-v1/03_Koala_Character_Sheet.png'
LUM = np.array([0.299, 0.587, 0.114])

def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def dark_core(arr, boxes, alpha=None):
    """pixels of the thin frame bars (sum(rgb)<150) in hand-located rim boxes"""
    out = []
    for (x0, x1, y0, y1) in boxes:
        r = arr[y0:y1, x0:x1].reshape(-1, arr.shape[2]).astype(float)
        if alpha:
            r = r[r[:, 3] >= 250]
        r = r[r[:, :3].sum(1) < 150]
        out.append(r[:, :3])
    return np.concatenate(out)

# ---- 1. sample the frame colour on approved art -------------------------------------------
sources = {}
tf = np.array(Image.open(f'{LIB}/koala_turnaround_front.png').convert('RGBA'))
sources['library/koala_turnaround_front.png'] = dark_core(tf, [(60, 98, 68, 74), (126, 158, 68, 74), (70, 95, 96, 102)], True)
hd = np.array(Image.open(f'{LIB}/koala_head.png').convert('RGBA'))
sources['library/koala_head.png'] = dark_core(hd, [(95, 175, 95, 102), (205, 265, 95, 102), (120, 170, 138, 148)], True)
sh = np.array(Image.open(SHEET).convert('RGB'))
sources['production-v1/03 head close-up'] = dark_core(sh, [(180, 245, 688, 693), (292, 348, 680, 683), (190, 240, 738, 742)])
samples = {k: {'n': int(len(v)), 'median_rgb': np.median(v, 0).tolist()} for k, v in sources.items()}
allp = np.concatenate(list(sources.values()))
C0 = np.median(allp, 0)                     # canonical frame body colour (near-black)
print('frame samples', json.dumps(samples), 'canonical C0', C0)

# ---- 2. recolor ---------------------------------------------------------------------------
src = f'{LIB}/koala_detail_glasses.png'
sup = f'{LIB}/_superseded/koala_detail_glasses_pre-M4-brown.png'
os.makedirs(os.path.dirname(sup), exist_ok=True)
if not os.path.exists(sup):
    shutil.copy2(src, sup)
    qa_tool.four_bg(Image.open(sup).convert('RGBA')).save(sup.replace('.png', '_4bg.png'))
assert sha(sup) == sha('/mnt/user-data/outputs/asset-library/koala/koala_detail_glasses.png'), 'pre-M4 copy must equal original'
im = np.array(Image.open(sup).convert('RGBA')).astype(float)   # always recolor from the pristine original
rgb, al = im[..., :3], im[..., 3]
L = rgb @ LUM
# luminance remap: dark brown-black body (L~17) -> ~C0 luma (~6); highlights keep relative strength, compressed to charcoal
c0l = float(C0 @ LUM)
# shadow floor = sampled frame colour; body shading kept at half range so form stays readable; highlights keep ~0.8 slope
Ln = np.where(L <= 40, c0l + L * 0.50, c0l + 20 + (L - 40) * 0.80)
# body tint towards canonical C0 chroma (fades out by L=100); highlights keep a faint share of their original hue (brass rivets stay brass-ish)
tint_body = (C0 - c0l)[None, None, :] * np.clip(1 - (L - 40) / 60, 0, 1)[..., None]
chroma = rgb - L[..., None]
keep = np.clip((L - 30) / 80, 0, 1) * 0.45                  # 0 for body, up to 0.45 for brightest specular/rivets (brass hint like approved art)
out = Ln[..., None] + tint_body + chroma * keep[..., None]
out = np.clip(np.rint(out), 0, 255)
res = np.dstack([out, al]).astype(np.uint8)
Image.fromarray(res, 'RGBA').save(src)
qa_tool.four_bg(Image.open(src).convert('RGBA')).save(f'{LIB}/koala_detail_glasses_4bg.png')

# ---- 3. verification metrics --------------------------------------------------------------
old = np.array(Image.open(sup).convert('RGBA')); new = np.array(Image.open(src).convert('RGBA'))
m = new[..., 3] > 0
body = m & ((old[..., :3].astype(float) @ LUM) < 40)
newL = new[..., :3].astype(float) @ LUM
oldL = old[..., :3].astype(float) @ LUM
rep = {
    'frame_samples': samples, 'canonical_frame_rgb': C0.round(1).tolist(),
    'alpha_identical': bool((old[..., 3] == new[..., 3]).all()),
    'size': list(new.shape[1::-1]),
    'body_pixels': int(body.sum()),
    'body_mean_rgb_before': old[..., :3][body].mean(0).round(1).tolist(),
    'body_mean_rgb_after': new[..., :3][body].mean(0).round(1).tolist(),
    'body_median_rgb_after': np.median(new[..., :3][body], 0).tolist(),
    'body_max_channel_spread_after': float((new[..., :3][body].max(1).astype(int) - new[..., :3][body].min(1).astype(int)).mean()),
    'luminance_corr_old_new': float(np.corrcoef(oldL[m], newL[m])[0, 1]),
    'highlight_p99_L_before_after': [float(np.percentile(oldL[m], 99)), float(np.percentile(newL[m], 99))],
    'brown_pixels_before(sat>0.5,L>8)': int(((old[..., :3].max(2).astype(float) - old[..., :3].min(2)) / np.maximum(old[..., :3].max(2), 1) > 0.5)[m & (oldL > 8)].sum()),
    'brown_pixels_after(sat>0.5,L>8)': int(((new[..., :3].max(2).astype(float) - new[..., :3].min(2)) / np.maximum(new[..., :3].max(2), 1) > 0.5)[m & (newL > 8)].sum()),
    'sha256_after': sha(src), 'sha256_before': sha(sup),
}
json.dump(rep, open(f'{ROOT}/library-tools/koala_glasses_report.json', 'w'), indent=1)
print(json.dumps(rep, indent=1))
