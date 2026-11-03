#!/usr/bin/env python3
"""Generates the six example (placeholder-stage) manifests in ../manifests/.

Everything is MISSING / TO AUTHOR except the expression assets that already exist as transparent PNGs
under /mnt/user-data/outputs/idle-review-3 and /mnt/user-data/outputs/try-again-review.  Asset paths are
relative to --assets-root /mnt/user-data/outputs (read-only references; nothing is copied).
"""
import hashlib, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from PIL import Image
import render_sheet as rs

ASSETS_ROOT = "/mnt/user-data/outputs"
OUT = os.path.join(os.path.dirname(HERE), "manifests")

K = {"eagle": 1.000, "click": 0.92, "bronco": 0.92, "dino": 0.85, "koala": 0.76, "tarsier": 0.57}

# doc 16 s5 matrix: CM / CE / MS / PR
CM, CE, MS, PR = ("READY WITH CROP/MATTING", "NEEDS CONTROLLED EDIT", "MISSING / TO AUTHOR", "PROVISIONAL")
EXPR_PLAN = {
    "click":   [MS, CM, CM, CM, PR, MS],
    "dino":    [MS, CM, CM, PR, PR, CM],
    "koala":   [CM, CM, CM, MS, PR, MS],
    "tarsier": [MS, CM, CM, MS, PR, MS],
    "eagle":   [MS, CE, MS, CE, CE, CE],
    "bronco":  [MS, CM, MS, CM, PR, PR],
}
BASE_PLAN = {c: (CE if c == "eagle" else CM) for c in K}   # A turnaround, B hero, C head, E silhouettes

# existing files: (state key) -> (relative path, eye_line_src_y estimate)
EXISTING = {
    "click":   {"idle": ("idle-review-3/click_idle_approved.png", 92),   "tryAgain": ("try-again-review/click_tryagain.png", 88)},
    "dino":    {"idle": ("idle-review-3/dino_idle2.png", 59),            "tryAgain": ("try-again-review/dino_tryagain.png", 55)},
    "koala":   {                                                         "tryAgain": ("try-again-review/koala_tryagain.png", 77)},
    "tarsier": {"idle": ("idle-review-3/tarsier_idle_approved.png", 95), "tryAgain": ("try-again-review/tarsier_tryagain.png", 95)},
    "eagle":   {"idle": ("idle-review-3/eagle_idle3_repaired.png", 63),  "tryAgain": ("try-again-review/eagle_tryagain.png", 47)},
    "bronco":  {"idle": ("idle-review-3/bronco_idle2.png", 65),          "tryAgain": ("try-again-review/bronco_tryagain.png", 68)},
}

CHAR = {
    "click":   ("Click", "host", "Platform host, guide and mascot"),
    "dino":    ("Dino", "starter", "Teal explorer dinosaur"),
    "koala":   ("Koala", "starter", "Gray-lavender scholar"),
    "tarsier": ("Tarsier", "starter", "Small, agile scout and discoverer"),
    "eagle":   ("Eagle", "starter", "White-headed varsity eagle"),
    "bronco":  ("Bronco", "starter", "Energetic athletic bronco"),
}

# doc 16 s9 proposed details (captions only; every crop is MISSING until produced)
DETAILS = {
    "click":   ["Explorer harness & backpack", "C emblem", "Strap & buckle", "Back-view pack detail"],
    "dino":    ["Backpack (front)", "Strap & buckle", "Paw badge", "Dorsal spikes"],
    "koala":   ["Scholar hat", "Signature glasses", "Scholar's book", "Scholar jacket"],
    "tarsier": ["Goggles (front)", "Explorer backpack", "Paw emblem", "Hood / scout jacket"],
    "eagle":   ["Academy A patch", "Varsity collar & stripes", "Mountain emblem", "Wing-feather treatment"],
    "bronco":  ["Cowboy hat (star badge)", "Maroon bandana", "Saddle & pack", "Star treatment"],
}

def P(role, name, hexv): return {"label": role, "name": name, "hex": hexv, "status": "PROVISIONAL"}
OPEN = {"status": "OPEN"}
# Provisional names/hex from doc 09 s3 (code/ref values; NOT palette authority). Mapping to the six
# roles is a PROPOSAL pending production-plan step 9.
PALETTE = {
    "click":   [P("PRIMARY", "Orange fur", "#FA9B4B"), P("SECONDARY", "Tan muzzle & belly", "#F2CB98"), OPEN, OPEN, OPEN, OPEN],
    "dino":    [P("PRIMARY", "Teal body", "#2FC4B2"), P("SECONDARY", "Mint belly", "#CDF3E4"), P("ACCENT", "Orange dorsal spikes", "#FF8A2B"), OPEN, OPEN, OPEN],
    "koala":   [P("PRIMARY", "Gray-lavender fur", "#AAA0CC"), P("SECONDARY", "Light fur", "#D9D2EE"), OPEN, OPEN, P("DETAIL", "Inner ear", "#F0D9E8"), OPEN],
    "tarsier": [P("PRIMARY", "Fur", "#B98650"), P("SECONDARY", "Fur shade", "#8D6338"), P("ACCENT", "Hood yellow", "#F2C230"), OPEN, P("DETAIL", "Goggle lens", "#7FDCF2"), OPEN],
    "eagle":   [P("PRIMARY", "White head", "#FBFAF4"), P("SECONDARY", "Brown wings", "#7B4A25"), OPEN, P("GEAR", "Green varsity jacket", "#1F7D49"), P("DETAIL", "Yellow beak", "#F7C52B"), OPEN],
    "bronco":  [P("PRIMARY", "Chestnut coat", "#B9672A"), P("SECONDARY", "Mane", "#3A2314"),
                {"label": "ACCENT", "name": "Red star / gear", "status": "PROVISIONAL"},
                OPEN, P("DETAIL", "Muzzle / blaze", "#E9B790"), P("BANDANA", "Maroon", "#8E1B30")],
}

def missing(plan, note=None):
    d = {"path": None, "status": MS, "plan_status": plan}
    if note: d["notes"] = note
    return d

def main():
    os.makedirs(OUT, exist_ok=True)
    for cid in K:
        name, kind, role = CHAR[cid]
        base = BASE_PLAN[cid]
        ex_existing = EXISTING[cid]
        # head_scale: nominal 100 px for the first wired asset's matted bbox width (PROVISIONAL)
        first = ex_existing.get("idle") or ex_existing["tryAgain"]
        img = Image.open(os.path.join(ASSETS_ROOT, first[0])).convert("RGBA")
        bb = rs.alpha_bbox(img)
        head_scale = round(rs.EXPR_NOMINAL_W / float(bb[2] - bb[0]), 4)
        expr = {"head_scale": head_scale,
                "head_scale_basis": "PROVISIONAL: matted bbox width of the first wired expression asset = nominal 100 px; replace once real matted heads exist"}
        for (label, key), plan in zip(rs.EXPR_CELLS, EXPR_PLAN[cid]):
            if key in ex_existing:
                rel, eye = ex_existing[key]
                p = os.path.join(ASSETS_ROOT, rel)
                sha = hashlib.sha256(open(p, "rb").read()).hexdigest()
                note = ("Existing transparent PNG wired for layout proof. No sign-off recorded, so it stays PROVISIONAL (doc 16 s2). "
                        "eye_line_src_y is a manual visual estimate (+-3 src px).")
                if cid == "eagle" and key == "tryAgain":
                    note += " Doc 15 s5 / doc 16 s6: Eagle TRY AGAIN currently scowls and is a controlled-edit target; owner may set status to NEEDS CONTROLLED EDIT to hide it."
                expr[key] = {"path": rel, "sha256": sha, "status": PR, "plan_status": plan,
                             "transform": {"units_per_source_px": 1.0, "eye_line_src_y": eye}, "notes": note}
            else:
                expr[key] = missing(plan)
        turn = {}
        for (label, key) in rs.TURN_CELLS:
            turn[key] = missing(base)
            turn[key]["transform_hint"] = "when authored: transform.ref_height_src_px (or units_per_source_px), optional ground_y_src"
        m = {
            "schema_version": 1,
            "character": {"id": cid, "name": name, "role": role, "tagline": None, "kind": kind},
            "sheet": {"status_line": "LAYOUT PROOF - placeholders only; LOGO_ASSET and most art MISSING / TO AUTHOR",
                      "logo": {"path": None, "status": MS}},
            "cast": {"k": K[cid], "k_status": "PROVISIONAL", "s0": rs.DEFAULT_S0},
            "palette": {"status": "PROVISIONAL",
                        "mapping_note": "Names/hex from doc 09 s3 (code/ref values, not authority). Role mapping is a PROPOSAL pending production-plan step 9.",
                        "slots": PALETTE[cid]},
            "turnaround": turn,
            "hero": missing(base),
            "head": missing(base),
            "expressions": expr,
            "details": [dict(missing(CM if True else None), caption=c) for c in DETAILS[cid]],
            "silhouettes": {"derive": True, "items": {}},
            "proportion": {"front_reference": "turnaround.front",
                           "comparison": None if cid == "tarsier" else {"tag": "TAR", "k": K["tarsier"]}},
        }
        if cid == "bronco":
            m["palette"]["mapping_note"] += " Bronco: ACCENT = red star/gear (never maroon); slot 6 = BANDANA - MAROON (doc 16 s7). GEAR content open (step 9)."
        with open(os.path.join(OUT, cid + ".json"), "w", encoding="utf-8") as fh:
            json.dump(m, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print("wrote", cid, "head_scale", head_scale)

if __name__ == "__main__":
    main()
