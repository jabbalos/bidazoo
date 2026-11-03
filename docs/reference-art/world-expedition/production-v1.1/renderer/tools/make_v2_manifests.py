#!/usr/bin/env python3
"""manifests_real/ + core_boxes.json  ->  manifests_v2/  (template rules v2: core-based expression scale).
Per character:
  core_w_i   = core box width of state i (source px)
  c2e_i      = eye_line_src_y - core_top   (crown-to-eye distance: stable across poses, unlike width)
  u_i        = 1, except a DENSITY OUTLIER (|c2e_i / median(c2e) - 1| > 0.27, e.g. Tarsier IDLE/TRY AGAIN drawn ~1.5x larger in
               source) which gets u_i = median(c2e) / c2e_i so heads have the same core scale across states
  head_scale = min( 100 / median(core_w_i * u_i) , 109 / max(core_w_i * u_i) )
               i.e. nominal 100 px core, but never so large that the widest core exceeds the 109 px safe width
               (the character is never squeezed per cell: ONE scale per character)."""
import argparse, hashlib, json, os, re, statistics, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT); sys.path.insert(0, HERE)
import render_sheet as rs
import paths
DENSITY_TOL = 0.27
CAST = ["click", "dino", "koala", "tarsier", "eagle", "bronco"]
ROLES = ["PRIMARY", "SECONDARY", "ACCENT", "GEAR", "DETAIL", "CHARACTER-SPECIFIC"]
OK_LOGO_STATUS = ("READY WITH CROP/MATTING", "OWNER-ACCEPTED MINOR", "PROVISIONAL")


def sha_file(p):
    with open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def load_palettes(path):
    """palettes.json (tools/make_palettes.py) -> {char: [6 manifest slots]}; HARD errors for anything not a complete slot."""
    doc = json.load(open(path, encoding="utf-8"))
    out = {}
    for cid in CAST:
        sl = doc["characters"][cid]["slots"]
        if len(sl) != 6:
            raise SystemExit("palettes.json: %s has %d slots, exactly 6 required" % (cid, len(sl)))
        slots = []
        for i, s in enumerate(sl):
            where = "palettes.json: %s slot %d (%s)" % (cid, i + 1, ROLES[i])
            if s.get("status") == "OPEN" or not s.get("name") or not s.get("hex"):
                raise SystemExit(where + " is OPEN / incomplete (name and hex are required)")
            if not re.fullmatch(r"#[0-9A-Fa-f]{6}", s["hex"]):
                raise SystemExit(where + ": bad hex %r" % s["hex"])
            if s.get("status") not in ("PROVISIONAL",):
                raise SystemExit(where + ": status must be PROVISIONAL (docs 09/15: no hex is locked), got %r" % s.get("status"))
            if i < 5 and s.get("label") != ROLES[i]:
                raise SystemExit(where + ": slots 1-5 keep the default role label, got %r" % s.get("label"))
            slots.append({"label": s["label"], "name": s["name"], "hex": s["hex"].upper(), "status": s["status"]})
        out[cid] = slots
    return out


def logo_spec(logo_arg, status):
    full = logo_arg if os.path.isabs(logo_arg) else os.path.join(paths.ASSETS_ROOT, logo_arg)
    if not os.path.isfile(full):
        raise SystemExit("LOGO_ASSET file not found: %s (expected under the assets root %s, e.g. m4-release/logo/<file>)" % (logo_arg, paths.ASSETS_ROOT))
    if status not in OK_LOGO_STATUS:
        raise SystemExit("--logo-status must be one of %s" % (OK_LOGO_STATUS,))
    try:
        pth = paths.rel(full)
    except SystemExit:
        pth = os.path.abspath(full)      # outside the assets root: keep the absolute path
    return {"path": pth, "sha256": sha_file(full), "status": status}
HEAD_ONLY_DEFICIT = 15.0   # px below the character's median art bottom => head-only crop (bottom anchored)

def main():
    ap = argparse.ArgumentParser(description="manifests_real + core boxes + palettes + logo -> manifests_v2")
    ap.add_argument("--assets-root"); ap.add_argument("--library-root"); ap.add_argument("--expressions-root")   # consumed by tools/paths.py
    ap.add_argument("--real-dir", default=os.environ.get("REAL_DIR") or os.path.join(ROOT, "manifests_real"))
    ap.add_argument("--out-dir", default=os.environ.get("V2_DIR") or os.path.join(ROOT, "manifests_v2"))
    ap.add_argument("--core-boxes", default=os.environ.get("CORE_BOXES") or os.path.join(ROOT, "core_boxes.json"))
    ap.add_argument("--palettes", required=True, help="palettes.json from tools/make_palettes.py (six complete slots per character)")
    ap.add_argument("--logo", required=True, help="LOGO_ASSET path, relative to the assets root (e.g. m4-release/logo/<file>) or absolute")
    ap.add_argument("--logo-status", default="READY WITH CROP/MATTING", help="status written for the logo (a stub logo uses PROVISIONAL)")
    A = ap.parse_args()
    OUT = A.out_dir
    CORES = json.load(open(A.core_boxes))
    PAL = load_palettes(A.palettes)
    PAL_SHA = sha_file(A.palettes)
    LOGO = logo_spec(A.logo, A.logo_status)
    os.makedirs(OUT, exist_ok=True)
    for cid in CAST:
        m = json.load(open(os.path.join(A.real_dir, cid + ".json")))
        ex = m["expressions"]
        rows = {}
        for _, key in rs.EXPR_CELLS:
            a = ex[key]; cb = CORES[a["path"]]["core_box"]
            eye = a["transform"]["eye_line_src_y"]
            rows[key] = (cb, eye, cb[2] - cb[0], eye - cb[1])
        med_c2e = statistics.median(v[3] for v in rows.values())
        for key, (cb, eye, w, c2e) in rows.items():
            u = 1.0
            if abs(c2e / med_c2e - 1) > DENSITY_TOL:
                u = round(med_c2e / c2e, 4)
            a = ex[key]
            a["transform"]["core_box"] = cb
            a["transform"]["units_per_source_px"] = u
            a["transform"]["core_source"] = CORES[a["path"]]["source"]
            rows[key] = (w * u, u)
        ws = [v[0] for v in rows.values()]
        import math
        hs = math.floor(min(100.0 / statistics.median(ws), 109.0 / max(ws)) * 1e4) / 1e4
        ex["head_scale"] = hs
        # crop_kind: a state whose art (eye-line anchored) ends >15 px above the character's median bottom is a head-only crop
        from PIL import Image
        bots = {}
        for key in rows:
            a = ex[key]; im = Image.open(os.path.join(paths.ASSETS_ROOT, a["path"])).convert("RGBA")
            bb = rs.alpha_bbox(im); u = a["transform"]["units_per_source_px"]
            bots[key] = rs.EXPR_EYE_Y + (bb[3] - a["transform"]["eye_line_src_y"]) * hs * u
        med_b = statistics.median(bots.values())
        for key, b in bots.items():
            ex[key]["transform"]["crop_kind"] = "head_only" if med_b - b > HEAD_ONLY_DEFICIT else "bust"
        ex["head_scale_basis"] = "v2: min(100/median core width, 109/widest core width) after density normalization; see template-rules-v2.md"
        ex["vertical_anchor"] = "eye_line"
        h = m["head"]; hc = CORES[h["path"]]
        if h["status"] != rs.ST_EDIT and hc["core_box"]:
            h["transform"]["core_box"] = hc["core_box"]
            h["transform"]["anchor"] = "bottom"
        m["sheet"]["logo"] = dict(LOGO)
        m["palette"] = {"status": "PROVISIONAL", "slots": PAL[cid],
                        "mapping_note": "palettes.json sha256 %s: hex sampled from final matted art, all PROVISIONAL per docs 09 / 15 (no hex locked); "
                                        "ACCENT/CHARACTER-SPECIFIC semantics per doc 16 s7 (Bronco: red star/gear separate from BANDANA maroon)" % PAL_SHA[:16]}
        m["sheet"]["status_line"] = "M4 BUILD - LOGO_ASSET %s (%s); palette %s PROVISIONAL (docs); cast scale %s" % (
            LOGO["path"], LOGO["status"], PAL_SHA[:12], m["cast"].get("k_status"))
        json.dump(m, open(os.path.join(OUT, cid + ".json"), "w"), indent=2, ensure_ascii=False)
        open(os.path.join(OUT, cid + ".json"), "a").write("\n")
        print(cid, "head_scale", hs, {k: v[1] for k, v in rows.items() if v[1] != 1.0}, "core px", [round(w * hs, 1) for w in ws])

if __name__ == "__main__":
    main()
