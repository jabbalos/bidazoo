#!/usr/bin/env python3
"""Task B: derive canonical navy silhouettes (doc 15: flat navy #1E3A5F) deterministically from the approved matted-alpha
assets in m4-release/library/<char>/ (turnarounds -> front/34/side/back; hero/action asset -> action; Koala -> reading).
Usage: derive_silhouettes.py [--debug-only] ; writes <char>_silhouette_<slot>.png once into library/<char>/ and a
derivation record JSON to tools/silhouette_derivation.json.  No randomness; pure numpy/scipy/OpenCV."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sil_lib import *
from sil_config import SRC, ACTION_SRC, ACTION_SLOT, CFG

ROOT = '/mnt/user-data/outputs/m4-release'
LIB = f'{ROOT}/library'
DBG = f'{ROOT}/library-qa/sil_debug'
CHARS = ['click', 'dino', 'koala', 'tarsier', 'eagle', 'bronco']
SLOTS = ['front', '34', 'side', 'back', 'action']
HOLE_AUTO_FILL_PX = 30      # interior holes at or below this area are matte artifacts and are filled
MIN_COMP_FRAC = 0.004       # detached specks smaller than this fraction of the main body are dropped

def bgish(rgb):
    h, s, v = hsv_f(rgb)
    warm = (h <= 65) | (h >= 350)
    notcool = (h <= 90) | (h >= 330)
    return ((v > 0.55) & (s < 0.50) & warm) | ((s < 0.20) & (v > 0.50) & notcool)

def rect_mask(shape, r):
    m = np.zeros(shape, bool); x0, y0, x1, y1 = r; m[max(0, y0):y1, max(0, x0):x1] = True; return m

def derive(char, slot, srcpath, cfg):
    a = load(srcpath); rgb = a[..., :3]; al = a[..., 3]
    H, W = al.shape
    M0 = al >= 128
    M = M0.copy(); removed = np.zeros_like(M)
    bg = bgish(rgb)
    roi = np.zeros_like(M)
    if cfg.get('strip'): roi |= rect_mask(M.shape, (0, H - cfg['strip'], W, H))
    for r in cfg.get('cut', []): roi |= rect_mask(M.shape, r)
    R = roi & bg & M
    # eat the 1-px antialiased cream/colour mix next to removed parchment (only light, low-saturation pixels, only inside roi)
    h_, s_, v_ = hsv_f(rgb)
    R = R | (ndi.binary_dilation(R, structure=np.ones((3, 3))) & roi & M & (v_ > 0.45) & (s_ < 0.62) & ((h_ <= 90) | (h_ >= 330)))
    if cfg.get('below_line'):     # remove everything under a polyline (ground shadow that is not parchment-coloured)
        pl = cfg['below_line']; xs_ = np.arange(W); ly = np.interp(xs_, [p[0] for p in pl], [p[1] for p in pl])
        R |= M & (np.arange(H)[:, None] > ly[None, :])
    if cfg.get('peel'):
        y0, y1 = cfg['peel']
        d = ndi.distance_transform_edt(M)
        pe = M & (d <= 3.0) & (v_ > 0.86) & (s_ < 0.25) & ((h_ <= 90) | (h_ >= 330))
        pe[:y0] = False; pe[y1 + 1:] = False
        R |= pe
    M &= ~R; removed |= R
    for r in cfg.get('erase', []):   # unconditional removal of leftover contact-shadow bars / matte spurs (any colour)
        em = rect_mask(M.shape, r) & M; M &= ~em; removed |= em
    # repair notches
    for r in cfg.get('hull', []):
        x0, y0, x1, y1 = r
        win = np.zeros_like(M); win[max(0, y0 - 6):y1 + 6, max(0, x0 - 6):x1 + 6] = True
        pts = np.argwhere(M & win)[:, ::-1].astype(np.int32)
        hull = cv2.convexHull(pts)
        hm = np.zeros(M.shape, np.uint8); cv2.fillConvexPoly(hm, hull, 1)
        M |= (hm.astype(bool) & rect_mask(M.shape, r))
    # drop detached specks, keep real parts (>= MIN_COMP_FRAC of the largest component)
    lab, n = ndi.label(M, structure=np.ones((3, 3)))
    sizes = ndi.sum(M, lab, range(1, n + 1)) if n else np.array([])
    keep_ids = [i + 1 for i, s in enumerate(sizes) if s >= max(30, MIN_COMP_FRAC * sizes.max())]
    dropped = [int(s) for i, s in enumerate(sizes) if (i + 1) not in keep_ids]
    M = np.isin(lab, keep_ids)
    # holes
    holes = ndi.binary_fill_holes(M) & ~M
    hl, hn = ndi.label(holes, structure=np.ones((3, 3)))
    hinfo = []
    for i in range(1, hn + 1):
        hm = hl == i; area = int(hm.sum()); cy, cx = ndi.center_of_mass(hm)
        filled = area <= HOLE_AUTO_FILL_PX or any(r[0] <= cx < r[2] and r[1] <= cy < r[3] for r in cfg.get('fill', []))
        if filled: M |= hm
        hinfo.append({'area_px': area, 'centroid_xy': [round(cx, 1), round(cy, 1)], 'action': 'filled (artifact)' if filled else 'kept (real negative space)'})
    # antialiased alpha: gaussian of the binary mask, remapped so the 50% contour is the mask edge (no fringe/halo)
    G = ndi.gaussian_filter(M.astype(float), 0.8)
    A = np.clip((G - 0.25) / 0.5, 0, 1)
    A[M & (ndi.binary_erosion(M, iterations=1))] = 1.0
    A8 = np.rint(A * 255).astype(np.uint8)
    ys, xs = np.where(A8 > 0)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = NAVY
    out[..., 3] = A8[y0:y1, x0:x1]
    rec = {
        'source_size': [W, H], 'bbox_in_source_xywh': [int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
        'out_size': [int(x1 - x0), int(y1 - y0)], 'source_opaque_px': int(M0.sum()), 'removed_px': int(removed.sum()),
        'final_mask_px': int(M.sum()), 'dropped_component_px': dropped, 'holes': hinfo, 'cfg': {k: v for k, v in cfg.items()},
    }
    return out, removed, M0, rec

def main():
    debug_only = '--debug-only' in sys.argv
    os.makedirs(DBG, exist_ok=True)
    records = {}
    for c in CHARS:
        for slot in SLOTS:
            if slot == 'action':
                suffix = ACTION_SRC[c]; name = ACTION_SLOT.get(c, 'action')
            else:
                suffix = SRC[slot]; name = slot
            src = f'{LIB}/{c}/{c}_{suffix}.png'
            cfg = CFG[(c, name)]
            out, removed, M0, rec = derive(c, slot, src, cfg)
            rec.update({'char': c, 'slot': name, 'source_asset': f'{c}_{suffix}.png', 'source_sha256': sha256_file(src)})
            dst = f'{LIB}/{c}/{c}_silhouette_{name}.png'
            rec['file'] = os.path.basename(dst)
            # debug overlay: source, removed pixels magenta, final silhouette outline
            a = load(src); v = a[..., :3].copy(); v[a[..., 3] < 128] = (30, 30, 60); v[removed] = (255, 0, 255)
            Image.fromarray(v).save(f'{DBG}/{c}_{name}_removed.png')
            records[f'{c}_{name}'] = rec
            if not debug_only:
                assert not os.path.exists(dst), 'final silhouette must be written exactly once: ' + dst
                Image.fromarray(out, 'RGBA').save(dst)
                import qa_tool
                qa_tool.four_bg(Image.open(dst).convert('RGBA')).save(dst.replace('.png', '_4bg.png'))
                rec['sha256'] = sha256_file(dst)
    json.dump(records, open(f'{ROOT}/library-tools/silhouette_derivation.json', 'w'), indent=1)
    print('derived', len(records))
if __name__ == '__main__':
    main()
