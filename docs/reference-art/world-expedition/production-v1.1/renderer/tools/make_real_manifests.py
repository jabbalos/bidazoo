#!/usr/bin/env python3
"""Builds manifests_real/*.json from the asset library + expression batch (read-only references, relative to
--assets-root; library / expression folders via --library-root / --expressions-root, see tools/paths.py; output dir env REAL_DIR).  Mapping rules are documented in README 'Real-asset pass'."""
import hashlib, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
from PIL import Image
import render_sheet as rs
import make_example_manifests as ex
import paths

AR = paths.ASSETS_ROOT
OUT = os.environ.get("REAL_DIR") or os.path.join(ROOT, "manifests_real")
CM, CE, MS, PR = ex.CM, ex.CE, ex.MS, ex.PR

EYE = {  # manual visual estimates (+-4 src px) read off 10px-gridded previews; library gives none for expressions
 "click":   dict(idle=93, happy=76, thinking=81, cheer=67, discover=88, tryAgain=77),
 "dino":    dict(idle=56, happy=52, thinking=64, cheer=56, discover=67, tryAgain=68),
 "koala":   dict(idle=85, happy=82, thinking=87, cheer=85, discover=84, tryAgain=75),
 "tarsier": dict(idle=97, happy=65, thinking=72, cheer=65, discover=75, tryAgain=98),
 "eagle":   dict(idle=68, happy=62, thinking=68, cheer=65, discover=72, tryAgain=66),
 "bronco":  dict(idle=68, happy=64, thinking=74, cheer=77, discover=70, tryAgain=72)}
DETAIL_KEYS = {
 "click": ["detail_harness_backpack", "detail_c_emblem", "detail_strap_buckle", "detail_back_pack"],
 "dino": ["detail_backpack_front", "detail_buckle", "detail_paw_badge", "detail_dorsal_spikes"],
 "koala": ["detail_scholar_hat", "detail_glasses", "detail_scholar_book", "detail_scholar_jacket"],
 "tarsier": ["detail_goggles_front", "detail_backpack_front", "detail_paw_emblem", "detail_hood_scout_jacket"],
 "eagle": ["detail_academy_a_patch", "detail_varsity_collar", "detail_mountain_emblem", "detail_wing_feather_treatment"],
 "bronco": ["detail_cowboy_hat", "detail_bandana", "detail_saddle_pack", "detail_star_treatment"]}
HERO_KEY = {"koala": "hero_reading"}
HEAD_EYE_FALLBACK = {"tarsier": 95, "bronco": 112}   # visual estimates when the library gives no recommended_eye_line_src_y
SIL = [("front", "silhouette_front"), ("threeQuarter", "silhouette_34"), ("side", "silhouette_side"),
       ("back", "silhouette_back"), ("action", "silhouette_action")]
SIL_ALT = {"koala": {"action": "silhouette_reading"}}
EXPR_FILE = {"koala": {"thinking": "thinking_analytical"}}

EXPR_STATUS = json.load(open(os.environ.get("EXPR_STATUS") or os.path.join(ROOT, "expression_status.json")))
OAM = "OWNER-ACCEPTED MINOR"

def sha(p): return hashlib.sha256(open(os.path.join(AR, p), "rb").read()).hexdigest()

def asset(rel, status, plan=None, notes=None, **tr):
    d = {"path": rel, "sha256": sha(rel), "status": status}
    if plan: d["plan_status"] = plan
    if tr: d["transform"] = tr
    if notes: d["notes"] = notes
    return d

def main():
    os.makedirs(OUT, exist_ok=True)
    for cid in ex.K:
        m = json.load(open(os.path.join(ROOT, "manifests", cid + ".json")))
        lib = json.load(open(os.path.join(paths.LIBRARY_ROOT, cid, "manifest.json")))
        L = {a["asset"]: a for a in lib["assets"]}
        rel = lambda a: paths.lib_rel(cid, a["file"])
        unmapped = []
        def lib_asset(key, plan, **tr):
            a = L[key]
            st = a["status"]
            return asset(rel(a), st, plan, notes=(a.get("notes") or "")[:200] or None, **tr)

        # turnaround: one character-level reference height = tallest matted view (same source scale for all four views)
        views = {"front": "turnaround_front", "threeQuarter": "turnaround_34", "side": "turnaround_side", "back": "turnaround_back"}
        hs = []
        for k in views.values():
            im = Image.open(os.path.join(AR, rel(L[k]))).convert("RGBA")
            bb = rs.alpha_bbox(im); hs.append(bb[3] - bb[1])
        ref_h = max(hs)
        base = CM   # plan status is irrelevant for released art: the library status is authoritative
        m["turnaround"] = {v: lib_asset(k, base, ref_height_src_px=ref_h) for v, k in views.items()}
        hk = HERO_KEY.get(cid, "hero")
        m["hero"] = lib_asset(hk, base, mode="fit")
        m["head"] = lib_asset("head", base, eye_line_src_y=L["head"]["recommended_eye_line_src_y"] or HEAD_EYE_FALLBACK[cid])
        # details
        caps = ex.DETAILS[cid]
        det = []
        for key, cap in zip(DETAIL_KEYS[cid], caps):
            d = lib_asset(key, CM); d["caption"] = cap; det.append(d)
        m["details"] = det
        # silhouettes: library artwork where it exists and is a confirmed slot; else derive from matted turnaround/hero
        items = {}
        for slot, key in SIL:
            key = SIL_ALT.get(cid, {}).get(slot, key)
            if key in L:
                items[slot] = lib_asset(key, base)
        m["silhouettes"] = {"derive": True, "items": items}
        # expressions
        idle_rel = paths.expr_rel(cid, "%s_idle.png" % cid)
        bb = rs.alpha_bbox(Image.open(os.path.join(AR, idle_rel)).convert("RGBA"))
        hscale = round(rs.EXPR_NOMINAL_W / float(bb[2] - bb[0]), 4)
        expr = {"head_scale": hscale,
                "head_scale_basis": "PROVISIONAL: matted bbox width of the IDLE asset = nominal 100 px; replace with the owner-approved head scale"}
        for (label, key), plan in zip(rs.EXPR_CELLS, ex.EXPR_PLAN[cid]):
            fn = EXPR_FILE.get(cid, {}).get(key, key)
            r = paths.expr_rel(cid, "%s_%s.png" % (cid, fn))
            rp = os.path.join(AR, r[:-4] + "_report.json")
            qa = json.load(open(rp)).get("pass") if os.path.exists(rp) else None
            status = OAM if [cid, key] in EXPR_STATUS[OAM] else EXPR_STATUS["default"]
            note = "status from expression_status.json (doc 17 s2: M1 closed, PASS 32 / OWNER-ACCEPTED MINOR 4); historical matte-tool report pass=%s" % qa
            expr[key] = asset(r, status, status, notes=note, units_per_source_px=1.0, eye_line_src_y=EYE[cid][key])
        m["expressions"] = expr
        m["sheet"]["status_line"] = "REAL-ASSET LAYOUT PROOF - LOGO_ASSET missing; palette/scale provisional; see report"
        m["cast"]["k_status"] = "PROVISIONAL"
        json.dump(m, open(os.path.join(OUT, cid + ".json"), "w"), indent=2, ensure_ascii=False)
        open(os.path.join(OUT, cid + ".json"), "a").write("\n")
        print("wrote", cid, "ref_h", ref_h, "head_scale", hscale)

if __name__ == "__main__":
    main()
