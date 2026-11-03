#!/usr/bin/env python3
"""Task D: write per-character manifest.json + library-manifest.json for m4-release/library.
Runs AFTER all PNGs are final: every sha256 is computed from the file as it sits on disk now.
Roles: canonical = fills a doc 15/16 slot (A turnaround x4, B hero, C head, E silhouettes x5, F details x4);
       supplemental = real art but NOT a canonical slot (cannot be used by the sheet renderer / release as canonical);
       historical = old flat-sheet silhouettes (QA comparison only); superseded = earlier versions kept for audit."""
import os, sys, json, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sil_lib import sha256_file
from PIL import Image

ROOT = '/mnt/user-data/outputs/m4-release'; LIB = f'{ROOT}/library'; ORIG = '/mnt/user-data/outputs/asset-library'
CHARS = ['click', 'dino', 'koala', 'tarsier', 'eagle', 'bronco']
DERIV = json.load(open(f'{ROOT}/library-tools/silhouette_derivation.json'))
GLASSES = json.load(open(f'{ROOT}/library-tools/koala_glasses_report.json'))
GLASSES['sha256_after_on_disk'] = sha256_file(f'{LIB}/koala/koala_detail_glasses.png')
GENERATED = '2026-10-13'
READY, MINOR, PROV, NCE = 'READY WITH CROP/MATTING', 'OWNER-ACCEPTED MINOR', 'PROVISIONAL', 'NEEDS CONTROLLED EDIT'

def canon_slots(c):
    hero = 'hero_reading' if c == 'koala' else 'hero'
    act = 'reading' if c == 'koala' else 'action'
    det = {
     'click': ['detail_harness_backpack', 'detail_c_emblem', 'detail_strap_buckle', 'detail_back_pack'],
     'dino': ['detail_backpack_front', 'detail_buckle', 'detail_paw_badge', 'detail_dorsal_spikes'],
     'koala': ['detail_scholar_hat', 'detail_glasses', 'detail_scholar_book', 'detail_scholar_jacket'],
     'tarsier': ['detail_goggles_front', 'detail_backpack_front', 'detail_paw_emblem', 'detail_hood_scout_jacket'],
     'eagle': ['detail_academy_a_patch', 'detail_varsity_collar', 'detail_mountain_emblem', 'detail_wing_feather_treatment'],
     'bronco': ['detail_cowboy_hat', 'detail_bandana', 'detail_saddle_pack', 'detail_star_treatment'],
    }[c]
    s = {}
    for v in ['front', '34', 'side', 'back']: s[f'turnaround_{v}'] = f'A turnaround {v}'
    s[hero] = 'B hero'; s['head'] = 'C head'
    for v in ['front', '34', 'side', 'back', act]: s[f'silhouette_{v}'] = f'E silhouette {v}'
    for i, d in enumerate(det): s[d] = f'F detail {i + 1}'
    return s

SUPP_REASON = {
 ('koala', 'hero_overview'): ('SUPPLEMENTAL: deferred, flagged NEEDS CONTROLLED EDIT, NOT repaired in M4. Canonical Koala hero is koala_hero_reading. No canonical slot references it.'),
 ('koala', 'head_panel'): 'SUPPLEMENTAL: alternate wide head-panel crop; canonical Koala head is koala_head (doc 16 section 8).',
 ('tarsier', 'head_panel_alt'): 'SUPPLEMENTAL / UNVERIFIED: alternate head panel (PROVISIONAL, ears clipped at source); canonical Tarsier head is tarsier_head.',
 ('bronco', 'turnaround_34back_SUPPLEMENTAL'): 'SUPPLEMENTAL: fifth 3/4-BACK view; doc 16 puts it on a supplemental sheet, not in the four-view turnaround.',
 ('dino', 'detail_backpack_side'): 'SUPPLEMENTAL: beyond the four doc 16 section 9 detail slots (Dino uses backpack front, buckle, paw badge, dorsal spikes).',
 ('dino', 'detail_backpack_back'): 'SUPPLEMENTAL: beyond the four doc 16 section 9 detail slots.',
 ('dino', 'detail_zipper_pull'): 'SUPPLEMENTAL: beyond the four doc 16 section 9 detail slots.',
 ('tarsier', 'detail_goggles_side'): 'SUPPLEMENTAL: beyond the four doc 16 section 9 detail slots (Tarsier uses goggles FRONT).',
 ('tarsier', 'detail_backpack_back'): 'SUPPLEMENTAL: beyond the four doc 16 section 9 detail slots (Tarsier uses backpack FRONT).',
 ('eagle', 'detail_cuff'): 'SUPPLEMENTAL: beyond the four doc 16 section 9 detail slots.',
 ('eagle', 'detail_custom_buttons'): 'SUPPLEMENTAL: beyond the four doc 16 section 9 detail slots.',
}

def png_info(p):
    im = Image.open(p); return {'png_size': list(im.size), 'mode': im.mode}

def build(c):
    old = json.load(open(f'{ORIG}/{c}/manifest.json'))
    slots = canon_slots(c)
    entries = []
    seen = set()
    for a in old['assets']:
        if a['asset'].startswith('silhouette'):
            continue                                   # old flat-sheet silhouettes -> historical list
        name = a['asset']; f = a['file']; p = f'{LIB}/{c}/{f}'
        assert os.path.exists(p), p
        canonical = name in slots
        e = {'file': f, 'asset': name, 'role': 'canonical' if canonical else 'supplemental',
             'slot': slots.get(name), 'status': a['status'], 'sha256': sha256_file(p), **png_info(p),
             'preview_4bg': a.get('preview')}
        prov = {k: v for k, v in a.items() if k not in ('file', 'preview', 'asset', 'status')}
        e['source_provenance'] = {'source_sheet': old['source_sheet'], **prov}
        if not canonical:
            e['role_reason'] = SUPP_REASON[(c, name.replace(c + '_', '', 1))] if (c, name.replace(c + '_', '', 1)) in SUPP_REASON else SUPP_REASON[(c, name)]
            e['canonical_slot_references'] = []
        if a['status'] == MINOR: e['renders_as'] = READY
        if c == 'koala' and name == 'detail_glasses':
            e['status'] = MINOR
            e['m4_correction'] = {
                'task': 'A: canonical dark charcoal / near-black frames', 'result': 'colour correction PASS; overall status stays OWNER-ACCEPTED MINOR (W1 soft-edge / thin pale inner-rim line unchanged and still owner-accepted; geometry untouched)',
                'method': 'library-tools/koala_glasses_fix.py: per-pixel luminance remap + chroma replacement; alpha channel byte-identical; no other Koala asset recoloured',
                'colour_authority': GLASSES['frame_samples'], 'canonical_frame_rgb': GLASSES['canonical_frame_rgb'],
                'body_mean_rgb_before': GLASSES['body_mean_rgb_before'], 'body_mean_rgb_after': GLASSES['body_mean_rgb_after'],
                'alpha_identical': GLASSES['alpha_identical'], 'luminance_correlation_old_new': GLASSES['luminance_corr_old_new'],
                'brown_pixels_before_after': [GLASSES['brown_pixels_before(sat>0.5,L>8)'], GLASSES['brown_pixels_after(sat>0.5,L>8)']],
                'pre_m4_file': '_superseded/koala_detail_glasses_pre-M4-brown.png', 'pre_m4_sha256': sha256_file(f'{LIB}/koala/_superseded/koala_detail_glasses_pre-M4-brown.png'),
                'verified_on': ['checkerboard', 'parchment', 'dark navy', 'mid gray'],
                'caveat': 'near-black frames have inherently low contrast on the dark navy tile (same as the approved turnaround/head art); frames remain readable via charcoal rim highlights'}
            e['source_provenance']['notes'] = (e['source_provenance'].get('notes', '') + ' || M4: frames recoloured to canonical dark charcoal / near-black (see m4_correction).').strip()
        if c == 'koala' and name == 'hero_overview':
            e['flag'] = 'SUPPLEMENTAL - NOT REPAIRED (deferred by owner)'
        entries.append(e); seen.add(name)
    # derived silhouettes
    for key, d in DERIV.items():
        if d['char'] != c: continue
        name = f"silhouette_{d['slot']}"; p = f"{LIB}/{c}/{d['file']}"
        # NOTE: the storage layer re-encodes PNGs after write (pixels identical, bytes differ), so the on-disk sha256 is authoritative
        entries.append({'file': d['file'], 'asset': name, 'role': 'canonical', 'slot': slots[name], 'status': READY,
            'sha256': sha256_file(p), **png_info(p), 'preview_4bg': d['file'].replace('.png', '_4bg.png'),
            'fill': '#1E3A5F (doc 15 section 9 silhouette fill, flat navy)',
            'derived_from': {'asset': d['source_asset'], 'sha256': d['source_sha256'], 'source_library_path': f"library/{c}/{d['source_asset']}"},
            'derivation': {'tool': 'library-tools/derive_silhouettes.py + library-tools/sil_config.py (deterministic)', 'source_size': d['source_size'],
                'bbox_in_source_xywh': d['bbox_in_source_xywh'], 'source_opaque_px': d['source_opaque_px'], 'removed_px': d['removed_px'],
                'final_mask_px': d['final_mask_px'], 'detached_specks_dropped_px': d['dropped_component_px'],
                'holes': d['holes'], 'cleanup': d['cfg'], 'alpha': 'gaussian(0.8) antialias of the cleaned binary mask, 50% contour = mask edge'},
            'caveat': 'inherits any silhouette-affecting matte defects of the source alpha beyond the listed cleanups; see library-qa/silhouette_comparison_' + c + '.png'})
    # historical silhouettes (not canonical)
    hist = []
    old_status = {a['file']: a['status'] for a in old['assets'] if a['asset'].startswith('silhouette')}
    for p in sorted(glob.glob(f'{LIB}/{c}/_historical-silhouettes/*.png')):
        if p.endswith('_4bg.png'): continue
        f = os.path.basename(p)
        h = {'file': f'_historical-silhouettes/{f}', 'role': 'historical', 'status': 'HISTORICAL / QA-COMPARISON ONLY',
             'pre_m4_status': old_status.get(f), 'sha256': sha256_file(p), **png_info(p),
             'reason': 'flat-sheet silhouette artwork, not derived from matted alpha; never a canonical slot'}
        if 'UNVERIFIED' in f: h['flag'] = 'unverified 3/4-vs-back ambiguity; resolved by deriving both tarsier_silhouette_34 and _back from the approved turnaround assets'
        if 'SUPPLEMENTAL' in f: h['flag'] = 'Bronco 3/4-BACK silhouette: SUPPLEMENTAL as well as historical (no canonical slot)'; h['role_also'] = 'supplemental'
        hist.append(h)
    # superseded (audit only)
    sup = []
    for p in sorted(glob.glob(f'{LIB}/{c}/_superseded/*.png')):
        if p.endswith('_4bg.png'): continue
        sup.append({'file': f'_superseded/{os.path.basename(p)}', 'role': 'superseded', 'sha256': sha256_file(p), **png_info(p)})
    # inventory + integrity checks
    inv = {}
    for e in entries:
        if e['role'] == 'canonical': inv[e['slot']] = e['file']
    canon = [e for e in entries if e['role'] == 'canonical']; supp = [e for e in entries if e['role'] == 'supplemental']
    assert len(canon) == 15 and len(inv) == 15, (c, len(canon))
    supp_files = {e['file'] for e in supp}
    assert not (set(inv.values()) & supp_files), 'a supplemental asset occupies a canonical slot'
    statuses = {}
    for e in entries: statuses.setdefault(e['role'], {}); statuses[e['role']][e['status']] = statuses[e['role']].get(e['status'], 0) + 1
    m = {'schema': 'm4-release-library-manifest/1', 'generated': GENERATED, 'character': c,
         'source_sheet': old['source_sheet'], 'excluded': old['excluded'],
         'role_vocabulary': {'canonical': 'fills one doc 15/16 slot', 'supplemental': 'real art, not a canonical slot; must not be used as canonical',
                             'historical': 'old flat-sheet silhouettes, QA comparison only', 'superseded': 'earlier versions, audit only'},
         'status_vocabulary': old['status_vocabulary'] + ['HISTORICAL / QA-COMPARISON ONLY'],
         'owner_accepted_minor_renders_as': READY,
         'canonical_slots': inv,
         'counts': {'canonical': len(canon), 'supplemental': len(supp), 'historical_silhouettes': len(hist), 'superseded': len(sup),
                    'status_by_role': statuses},
         'assets': entries, 'historical_silhouettes': hist, 'superseded': sup}
    if 'eagle_white_head_check' in old: m['eagle_white_head_check'] = old['eagle_white_head_check']
    out = f'{LIB}/{c}/manifest.json'
    json.dump(m, open(out, 'w'), indent=1)
    return m, out

combined = {'schema': 'm4-release-library-manifest/1', 'generated': GENERATED, 'library_root': 'm4-release/library',
            'notes': ['Derived from asset-library/ (originals untouched). Changes in this release folder: koala_detail_glasses recoloured (task A); 30 canonical silhouettes derived from approved matted alpha (task B); roles added (task C).',
                      'Canonical slots per character: 4 turnaround + 1 hero + 1 head + 5 silhouettes + 4 details = 15.',
                      'silhouette fill #1E3A5F (doc 15 section 9).'], 'characters': {}, 'totals': {}}
tot = {'canonical': 0, 'supplemental': 0, 'historical_silhouettes': 0, 'superseded': 0}; stat = {}
for c in CHARS:
    m, out = build(c)
    combined['characters'][c] = {'manifest': f'{c}/manifest.json', 'manifest_sha256': sha256_file(out), 'counts': m['counts'],
                                 'canonical_slots': m['canonical_slots'], 'assets': m['assets'],
                                 'historical_silhouettes': m['historical_silhouettes'], 'superseded': m['superseded']}
    for k in tot: tot[k] += m['counts'][k]
    for role, d in m['counts']['status_by_role'].items():
        for s, n in d.items(): stat.setdefault(role, {}); stat[role][s] = stat[role].get(s, 0) + n
combined['totals'] = {**tot, 'status_by_role': stat}
json.dump(combined, open(f'{LIB}/library-manifest.json', 'w'), indent=1)
print(json.dumps(combined['totals'], indent=1))
for c in CHARS: print(c, combined['characters'][c]['counts'])
