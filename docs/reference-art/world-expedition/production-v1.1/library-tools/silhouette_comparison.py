#!/usr/bin/env python3
"""Contact sheets: historical flat-sheet silhouettes (top row) vs derived canonical silhouettes (bottom row), per character + combined."""
import os, sys
from PIL import Image, ImageDraw, ImageFont
ROOT = '/mnt/user-data/outputs/m4-release'; LIB = f'{ROOT}/library'; OUT = f'{ROOT}/library-qa'
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 13)
SMALL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
CREAM = (255, 248, 232)
SLOTS = {c: ['front', '34', 'side', 'back', 'action'] for c in ['click', 'dino', 'tarsier', 'eagle', 'bronco']}
SLOTS['koala'] = ['front', '34', 'side', 'back', 'reading']
OLD_ALIAS = {('tarsier', '34'): 'tarsier_silhouette_34_or_back_UNVERIFIED.png'}
CW, CH = 170, 250
def fit(im, w, h):
    s = min(w / im.width, h / im.height); return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
def cell(path, label, sub=None):
    t = Image.new('RGB', (CW, CH + 34), CREAM)
    d = ImageDraw.Draw(t)
    if path and os.path.exists(path):
        im = Image.open(path).convert('RGBA'); f = fit(im, CW - 14, CH - 10)
        bgc = Image.new('RGBA', f.size, CREAM + (255,)); bgc.alpha_composite(f)
        t.paste(bgc.convert('RGB'), ((CW - f.width) // 2, CH - 4 - f.height + 4))
        d.text((6, CH + 2), label, fill=(30, 30, 30), font=FONT)
        if sub: d.text((6, CH + 18), sub, fill=(120, 40, 40), font=SMALL)
        d.text((CW - 70, 2), f'{im.width}x{im.height}', fill=(110, 110, 110), font=SMALL)
    else:
        d.text((10, CH // 2), 'none (missing)', fill=(160, 40, 40), font=FONT); d.text((6, CH + 2), label, fill=(30, 30, 30), font=FONT)
    return t
def sheet(c):
    slots = SLOTS[c]; W = CW * 5 + 6 * 8 + 120; H = (CH + 34) * 2 + 3 * 8 + 24
    P = Image.new('RGB', (W, H), (110, 110, 110)); d = ImageDraw.Draw(P)
    d.text((8, 4), f'{c.upper()}  old flat-sheet silhouettes (top, historical/QA only) vs derived from approved matted alpha (bottom, canonical)', fill=(255, 255, 255), font=FONT)
    for i, s in enumerate(slots):
        old = f'{LIB}/{c}/_historical-silhouettes/' + OLD_ALIAS.get((c, s), f'{c}_silhouette_{s}.png')
        sub = 'UNVERIFIED 3/4-or-back' if (c, s) in OLD_ALIAS else None
        P.paste(cell(old, f'old {s}', sub), (120 + 8 + i * (CW + 8), 24))
        P.paste(cell(f'{LIB}/{c}/{c}_silhouette_{s}.png', f'new {s}'), (120 + 8 + i * (CW + 8), 24 + CH + 34 + 8))
    d.text((8, 24 + CH // 2), 'HISTORICAL', fill=(255, 220, 160), font=FONT); d.text((8, 24 + CH + 34 + 8 + CH // 2), 'DERIVED', fill=(160, 255, 200), font=FONT)
    P.save(f'{OUT}/silhouette_comparison_{c}.png'); return P
os.makedirs(OUT, exist_ok=True)
ps = [sheet(c) for c in ['click', 'dino', 'koala', 'tarsier', 'eagle', 'bronco']]
big = Image.new('RGB', (ps[0].width, sum(p.height for p in ps) + 8 * 5), (60, 60, 60)); y = 0
for p in ps: big.paste(p, (0, y)); y += p.height + 8
big.save(f'{OUT}/silhouette_comparison_all.png')
print('ok')
