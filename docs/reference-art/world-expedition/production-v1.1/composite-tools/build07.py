"""build07.py - MUST-CHANGE pass for 07_Expressions_Proportions_Palettes.png (production-v1.1 frozen interim -> final).
Implements: (1) panel 1 lineup rebuilt from FINAL front-turnaround cutouts at the final cast factors with a unitless
ruler; (2) panel 4 expression matrix rebuilt from the FINAL 36 expression states (IDLE, HAPPY, THINKING, CHEER,
DISCOVER, TRY AGAIN). Everything else is untouched (palette panel, silhouettes, logo, rules are dependent/frozen)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compfx import *

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))   # m4-release
EXPR_ROOT = '/mnt/user-data/outputs/expression-batch'          # frozen M1 expressions (byte-identical to m4-staging/expressions)
LIB = os.path.join(ROOT, 'library')                            # M2 library as carried into M4
MAN = '/mnt/user-data/outputs/renderer/manifests_v2'           # head_scale / eye_line / core_box / ref_height (read-only)

CHARS = ['click', 'dino', 'koala', 'tarsier', 'eagle', 'bronco']
NAMES = {'click': 'CLICK', 'dino': 'DINO', 'koala': 'KOALA', 'tarsier': 'TARSIER', 'eagle': 'EAGLE', 'bronco': 'BRONCO'}
K = {'eagle': 1.000, 'click': 0.92, 'bronco': 0.92, 'dino': 0.85, 'koala': 0.76, 'tarsier': 0.57}   # LOCKED cast factors
STATES = [('idle', 'IDLE'), ('happy', 'HAPPY'), ('thinking', 'THINKING'), ('cheer', 'CHEER'),
          ('discover', 'DISCOVER'), ('tryAgain', 'TRY AGAIN')]
EXPR_FILE = {c: {s: f'{c}/{c}_{s}.png' for s, _ in STATES} for c in CHARS}
EXPR_FILE['koala']['thinking'] = 'koala/koala_thinking_analytical.png'   # canonical Koala THINKING

PAPER = (253, 245, 229)
NAVY = (22, 45, 92)


def manifest(c):
    return json.load(open(os.path.join(MAN, c + '.json')))


def paste_premult(arr, rgba, x, y, clip=None, fade_bottom=0):
    """Alpha-composite PIL RGBA `rgba` at integer (x,y) onto arr (in place); clip=(x0,y0,x1,y1)."""
    H, W = arr.shape[:2]
    a = np.array(rgba).astype(np.float32)
    h, w = a.shape[:2]
    x0, y0, x1, y1 = x, y, x + w, y + h
    cx0, cy0, cx1, cy1 = clip if clip else (0, 0, W, H)
    X0, Y0, X1, Y1 = max(x0, cx0, 0), max(y0, cy0, 0), min(x1, cx1, W), min(y1, cy1, H)
    if X1 <= X0 or Y1 <= Y0:
        return
    sub = a[Y0 - y:Y1 - y, X0 - x:X1 - x]
    al = sub[..., 3:4] / 255.0
    if fade_bottom and clip:
        rows = np.arange(Y0, Y1)
        ramp = np.clip((cy1 - rows) / float(fade_bottom), 0, 1)[:, None, None]
        al = al * ramp
    dst = arr[Y0:Y1, X0:X1].astype(np.float32)
    arr[Y0:Y1, X0:X1] = np.clip(dst * (1 - al) + sub[..., :3] * al + 0.5, 0, 255).astype(np.uint8)


def resize_rgba(im, scale):
    """Premultiplied-alpha LANCZOS resize (no dark/light fringes)."""
    w, h = im.size
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    return im.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')


def aa_hline(arr, x0, x1, yc, thick, color):
    """Anti-aliased horizontal line centred at yc (float)."""
    ya, yb = yc - thick / 2.0, yc + thick / 2.0
    for r in range(int(np.floor(ya)), int(np.ceil(yb))):
        cov = max(0.0, min(r + 1, yb) - max(r, ya))
        if cov <= 0:
            continue
        seg = arr[r, x0:x1].astype(np.float32)
        arr[r, x0:x1] = np.clip(seg * (1 - cov) + np.array(color, np.float32) * cov + 0.5, 0, 255).astype(np.uint8)


def rrect(arr, x0, y0, x1, y1, r, fill, border=None, grad=None):
    """Rounded rectangle, 4x supersampled mask. grad=(top_rgb,bottom_rgb) overrides fill."""
    S = 4
    w, h = x1 - x0, y1 - y0
    m = Image.new('L', (w * S, h * S), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * S - 1, h * S - 1), r * S, fill=255)
    m = np.array(m.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0
    if grad:
        t = np.linspace(0, 1, h)[:, None, None]
        col = np.array(grad[0], np.float32) * (1 - t) + np.array(grad[1], np.float32) * t
        col = np.broadcast_to(col, (h, w, 3))
    else:
        col = np.broadcast_to(np.array(fill, np.float32), (h, w, 3))
    base = arr[y0:y1, x0:x1].astype(np.float32)
    if border:
        mi = Image.new('L', (w * S, h * S), 0)
        ImageDraw.Draw(mi).rounded_rectangle((S, S, w * S - 1 - S, h * S - 1 - S), max(1, (r - 1)) * S, fill=255)
        mi = np.array(mi.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0
        bcol = np.broadcast_to(np.array(border, np.float32), (h, w, 3))
        base = base * (1 - m[..., None]) + bcol * m[..., None]
        base = base * (1 - mi[..., None]) + col * mi[..., None]
    else:
        base = base * (1 - m[..., None]) + col * m[..., None]
    arr[y0:y1, x0:x1] = np.clip(base + 0.5, 0, 255).astype(np.uint8)


def panel1(arr):
    info = {}
    # --- subtitle (replaces "Consistent proportions ... Heights are relative.")
    arr, i = retype(arr, (378, 180, 742, 200), 'Cast-relative scale, Eagle = 1.000. Owner-approved cast factors.', 600, 'dark', 40,
                    px=11.5, mode='row', fit_width=352); info['subtitle'] = i
    # --- clean plate: figures, old axis labels, old printed values
    arr[203:402, 46:953] = PAPER
    arr[212:406, 15:45] = PAPER
    arr[426:459, 60:951] = PAPER
    grid_y = [221.7, 257.0, 292.4, 327.8, 363.1]   # 1.0 .. 0.2 (5 equal intervals, 0 = baseline)
    for yc in grid_y:
        aa_hline(arr, 45, 951, yc, 1.7, (188, 204, 215))
    base_y = 398.2
    aa_hline(arr, 45, 951, base_y, 2.0, (120, 152, 178))
    arr[218:399, 45] = (198, 213, 217)                     # vertical axis line
    # --- ruler labels (unitless factor scale; 1.0 line = Eagle reference height)
    img = Image.fromarray(arr)
    for yc, t in zip(grid_y + [base_y], ['1.0', '0.8', '0.6', '0.4', '0.2', '0']):
        img = draw_text(img, t, 40, yc + 3.6, 600, 10.5, (95, 125, 160), anchor='r')
    arr = np.array(img)
    # --- figures: FINAL front turnaround cutouts at final factors (renderer rule: ref height = H_e * k)
    h_e = base_y - grid_y[0]                                # Eagle (k = 1.000) height in px = 176.5
    centers = {'click': 126.5, 'dino': 274.0, 'koala': 420.5, 'tarsier': 562.0, 'eagle': 716.0, 'bronco': 866.5}
    placed = {}
    for c in ['eagle', 'bronco', 'click', 'dino', 'koala', 'tarsier']:
        m = manifest(c)
        ref = float(m['turnaround']['front']['transform']['ref_height_src_px'])
        im = Image.open(os.path.join(LIB, c, f'{c}_turnaround_front.png')).convert('RGBA')
        bb = im.getchannel('A').getbbox()
        s = (h_e * K[c]) / ref
        sm = resize_rgba(im, s)
        sbb = sm.getchannel('A').getbbox()
        x = int(round(centers[c] - (sbb[0] + sbb[2]) / 2.0))
        y = int(round(base_y + 1.0 - sbb[3]))               # lowest ink on the baseline
        paste_premult(arr, sm, x, y, clip=(46, 204, 952, 402))
        placed[c] = dict(scale=round(s, 4), box=(x + sbb[0], y + sbb[1], x + sbb[2], y + sbb[3]), k=K[c])
    info['placed'] = placed
    # --- pills (names) and printed readings
    for c in CHARS:
        cx = centers[c]
        b = (int(cx - 40), 407, int(cx + 40), 421)
        arr, i = retype(arr, b, NAMES[c], 800, 'light', 60, anchor='c', x=cx, px=11.5, tracking=0.04, mode='row', dil=2)
        info['pill_' + c] = i
    img = Image.fromarray(arr)
    for c in CHARS:
        cx = centers[c]
        t1 = '1.000×' if c == 'eagle' else '%.2f×' % K[c]
        t2 = 'reference' if c == 'eagle' else 'of Eagle'
        img = draw_text(img, t1, cx, 441, 800, 13.5, NAVY, anchor='c')
        img = draw_text(img, t2, cx, 454, 600, 10.5, (70, 92, 128), anchor='c')
    return np.array(img), info


def sample_pill_gradients(arr):
    """Top/bottom colours of the six original row-label pills (x=22 column), before they are erased."""
    spans = [(738, 779), (788, 829), (839, 880), (889, 931), (940, 988), (997, 1055)]
    out = []
    for (a, b) in spans:
        h = b - a
        top = np.median(arr[a + 4:a + 8, 20:26].reshape(-1, 3), axis=0)
        bot = np.median(arr[b - 8:b - 4, 20:26].reshape(-1, 3), axis=0)
        mid = np.median(arr[a + h // 2 - 2:a + h // 2 + 3, 20:26].reshape(-1, 3), axis=0)
        out.append((tuple(int(v) for v in top), tuple(int(v) for v in bot), tuple(int(v) for v in mid)))
    return out


def panel4(arr):
    info = {}
    pill_cols = sample_pill_gradients(arr)
    COLX = [99, 263, 426, 590, 753, 917]
    CW = 156
    # --- header pills: retype labels (pill art kept, text erased + redrawn)
    for (key, label), x in zip(STATES, COLX):
        b = (x + 8, 713, x + CW - 8, 727)
        arr, i = retype(arr, b, label, 800, 'light', 38, anchor='c', x=x + CW / 2.0, px=12.0, tracking=0.04, mode='row', dil=3)
        info['hdr_' + key] = i
    # --- clean plate under old cells + old row pills (per-row interpolation of the left/right paper margins)
    x0, x1, y0, y1 = 14, 1079, 730, 1065
    for y in range(y0, y1):
        l = np.median(arr[y, 11:14], axis=0); r = np.median(arr[y, 1079:1082], axis=0)
        t = np.linspace(0, 1, x1 - x0)[:, None]
        arr[y, x0:x1] = np.clip(l * (1 - t) + r * t + 0.5, 0, 255).astype(np.uint8)
    # --- rows
    ROWT = [731 + int(round(55.4 * i)) for i in range(6)]
    CH = 52
    CELL, CELLB = (248, 238, 217), (236, 222, 196)
    for ri, c in enumerate(CHARS):
        T = ROWT[ri]
        top, bot, mid = pill_cols[ri]
        rrect(arr, 15, T + 4, 92, T + CH - 4, 9, None, grad=(top, bot))
        info['rowpill_' + c] = (15, T + 4, 92, T + CH - 4)
        for ci, (key, _) in enumerate(STATES):
            cx0 = COLX[ci]
            rrect(arr, cx0, T, cx0 + CW, T + CH, 5, CELL, border=CELLB)
    img = Image.fromarray(arr)
    for ri, c in enumerate(CHARS):
        T = ROWT[ri]
        img = draw_text(img, NAMES[c], 53.5, T + CH / 2.0 + 4.9, 800, 14.0, (255, 255, 255), anchor='c', tracking_em=0.02)
    arr = np.array(img)
    # --- expression art: FINAL 36 states, renderer head_scale/eye-line convention scaled by G, uniform per character
    G, EYE = 0.52, 29
    placed = {}
    for ri, c in enumerate(CHARS):
        m = manifest(c)
        ex = m['expressions']; hs = float(ex['head_scale'])
        T = ROWT[ri]
        for ci, (key, _) in enumerate(STATES):
            e = ex[key]; tr = e['transform']
            u = float(tr.get('units_per_source_px', 1.0))
            s = hs * u * G
            im = Image.open(os.path.join(EXPR_ROOT, EXPR_FILE[c][key])).convert('RGBA')
            cb = tr['core_box']; eye = float(tr['eye_line_src_y'])
            sm = resize_rgba(im, s)
            # place: core-box centre on the cell centre, eye line on T + EYE
            ox = COLX[ci] + CW / 2.0 - ((cb[0] + cb[2]) / 2.0) * s
            oy = T + EYE - eye * s
            clip = (COLX[ci] + 1, T + 1, COLX[ci] + CW - 1, T + CH - 1)
            paste_premult(arr, sm, int(round(ox)), int(round(oy)), clip=clip, fade_bottom=5)
            placed[f'{c}_{key}'] = dict(scale=round(s, 4), origin=(round(ox, 1), round(oy, 1)), file=EXPR_FILE[c][key])
    info['placed'] = placed
    return arr, info


def build(src):
    arr = np.array(Image.open(src).convert('RGB'))
    arr, i1 = panel1(arr)
    arr, i4 = panel4(arr)
    return arr, {'panel1': i1, 'panel4': i4}


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    arr, log = build(src)
    Image.fromarray(arr).save(out)
    print(json.dumps(log, indent=1, default=str)[:2500])
