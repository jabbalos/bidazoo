#!/usr/bin/env python3
"""Independent verification of m4-release/library against the manifests and the untouched originals."""
import os, sys, json, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import derive_silhouettes as ds
from sil_config import CFG, SRC, ACTION_SRC, ACTION_SLOT
ROOT = '/mnt/user-data/outputs/m4-release'; LIB = f'{ROOT}/library'; ORIG = '/mnt/user-data/outputs/asset-library'
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
lines = []; fails = 0
def chk(ok, msg):
    global fails
    lines.append(('PASS ' if ok else 'FAIL ') + msg); fails += (not ok)
comb = json.load(open(f'{LIB}/library-manifest.json'))
for c, cm in comb['characters'].items():
    m = json.load(open(f'{LIB}/{c}/manifest.json'))
    chk(sha(f'{LIB}/{c}/manifest.json') == cm['manifest_sha256'], f'{c}: manifest sha matches combined')
    allfiles = m['assets'] + m['historical_silhouettes'] + m['superseded']
    bad = [e['file'] for e in allfiles if sha(f"{LIB}/{c}/{e['file']}") != e['sha256']]
    chk(not bad, f'{c}: {len(allfiles)} manifest sha256 entries match disk {bad}')
    canon = [e for e in m['assets'] if e['role'] == 'canonical']; supp = [e for e in m['assets'] if e['role'] == 'supplemental']
    chk(len(canon) == 15 and len({e['slot'] for e in canon}) == 15, f'{c}: 15 canonical assets, 15 unique slots')
    chk(not ({e['file'] for e in supp} & set(m['canonical_slots'].values())), f'{c}: no supplemental file in canonical slots')
    chk(all('silhouette' not in e['file'] or e['role'] == 'canonical' for e in m['assets']), f'{c}: all manifest silhouettes are canonical derived ones')
    chk(all(e['status'] == 'READY WITH CROP/MATTING' and e['derived_from']['sha256'] == sha(f"{LIB}/{c}/{e['derived_from']['asset']}")
            for e in canon if 'silhouette' in e['asset']), f'{c}: 5 silhouettes READY WITH CROP/MATTING with derived_from sha == source asset sha')
    chk(not any('_historical-silhouettes' in e['file'] for e in m['assets']), f'{c}: historical files not in canonical/supplemental list')
    chk(not [f for f in os.listdir(f'{LIB}/{c}') if '_silhouette_' in f and not f.endswith('_4bg.png') and f.replace(f'{c}_silhouette_', '').replace('.png', '') not in ('front', '34', 'side', 'back', 'action', 'reading')], f'{c}: no stray old silhouette names at top level')
    # silhouettes: fill colour, mode, determinism (pixel-identical re-derivation in memory)
    for slot in ['front', '34', 'side', 'back', 'action']:
        suffix = SRC.get(slot) if slot != 'action' else ACTION_SRC[c]; name = ACTION_SLOT.get(c, 'action') if slot == 'action' else slot
        out, *_ = ds.derive(c, slot, f'{LIB}/{c}/{c}_{suffix}.png', CFG[(c, name)])
        disk = np.array(Image.open(f'{LIB}/{c}/{c}_silhouette_{name}.png'))
        chk(disk.shape == out.shape and (disk == out).all(), f'{c}_silhouette_{name}: re-derivation pixel-identical to disk')
        chk(Image.open(f'{LIB}/{c}/{c}_silhouette_{name}.png').mode == 'RGBA' and (disk[disk[..., 3] > 0][:, :3] == (0x1E, 0x3A, 0x5F)).all(), f'{c}_silhouette_{name}: RGBA, all RGB == #1E3A5F')
# originals untouched + only intended files changed
orig = {}
for l in open(f'{ROOT}/library-tools/original_sha256.txt'):
    h, p = l.split(None, 1); orig[p.strip()[2:]] = h
changed = []
for p, h in orig.items():
    q = p
    if '_silhouette_' in p and '_superseded' not in p: q = f"{p.split('/')[0]}/_historical-silhouettes/{os.path.basename(p)}"
    if sha(f'{LIB}/{q}') != h: changed.append(q)
chk(sorted(changed) == ['koala/koala_detail_glasses.png', 'koala/koala_detail_glasses_4bg.png'], f'only koala_detail_glasses.png (+ its 4bg preview) differs from original (of {len(orig)} PNGs; changed={changed})')
chk(all(sha(f'{ORIG}/{p}') == h for p, h in orig.items()), 'asset-library originals unchanged (hashes equal the pre-work record)')
# glasses alpha identical to pre-M4
a = np.array(Image.open(f'{LIB}/koala/_superseded/koala_detail_glasses_pre-M4-brown.png').convert('RGBA')); b = np.array(Image.open(f'{LIB}/koala/koala_detail_glasses.png').convert('RGBA'))
chk((a[..., 3] == b[..., 3]).all() and a.shape == b.shape, 'koala_detail_glasses: alpha channel and size identical to original')
chk(sha(f'{LIB}/koala/_superseded/koala_detail_glasses_pre-M4-brown.png') == orig['koala/koala_detail_glasses.png'], 'pre-M4 glasses copy == original bytes')
ko = [e for e in comb['characters']['koala']['assets'] if e['asset'] == 'hero_overview'][0]
chk(ko['role'] == 'supplemental' and ko['status'] == 'NEEDS CONTROLLED EDIT' and sha(f"{LIB}/koala/koala_hero_overview.png") == orig['koala/koala_hero_overview.png'], 'koala_hero_overview: supplemental, NOT repaired (bytes unchanged)')
chk(not any('hero_overview' in v for v in comb['characters']['koala']['canonical_slots'].values()), 'no canonical slot references koala_hero_overview')
open(f'{ROOT}/library-qa/verify_library.txt', 'w').write('\n'.join(lines) + f'\n\nFAILS: {fails}\n')
print('\n'.join(lines)); print('FAILS', fails)
