#!/usr/bin/env python3
"""Writes palettes.json (+ proof images) for the six canonical sheets: SIX slots per character, each slot with a
semantic name, a hex SAMPLED from the final matted art (tools/palette_sampler.py method) and full provenance.

   python3 -I tools/make_palettes.py [--assets-root DIR] [--out palettes.json] [--proof-dir palette_proof]

Slot semantics (doc 15 s2, doc 16 s7, doc 09 s0 locks):
  slots 1-5 keep the default role labels PRIMARY / SECONDARY / ACCENT / GEAR / DETAIL (the specific colour is the NAME line);
  slot 6 is CHARACTER-SPECIFIC and carries a short character-specific label that fits the 88 px label box in Nunito Sans.
  Bronco: ACCENT = red star / gear (never maroon); GEAR = saddle leather brown; slot 6 = BANDANA / Maroon.
  Every hex is marked PROVISIONAL because doc 09 and doc 15 s2 say so (no final production hex is locked); no slot is OPEN.
Verification (independent of the sampled assets): the same window is re-measured on other final assets of the character
(back view, hero, expressions) and the colour distance (CIE76 dE) must stay <= VERIFY_DE; otherwise this tool exits 1.
Deterministic: no timestamps, no randomness; JSON keys sorted/ordered by construction."""
import argparse, json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE); sys.path.insert(0, ROOT)
import palette_sampler as ps
import paths

VERIFY_DE = 12.0
VERIFY_MIN_PX = 60
CAST = ["click", "dino", "koala", "tarsier", "eagle", "bronco"]
ROLES = ["PRIMARY", "SECONDARY", "ACCENT", "GEAR", "DETAIL", "CHARACTER-SPECIFIC"]


def L(c, *keys):   # asset-library turnaround/hero/detail/head views
    return [{"path": paths.lib_rel(c, "%s_%s.png" % (c, k))} for k in keys]


def E(c, *states):  # frozen expression assets
    return [{"path": paths.expr_rel(c, "%s_%s.png" % (c, s))} for s in states]


def R(path, *regions, erode=2):
    return [{"path": path, "region": r, "erode": erode} for r in regions]


TV = ("turnaround_front", "turnaround_34", "turnaround_side")          # sample set
VV = ("turnaround_back", "hero")                                       # default verification set (+ expressions below)


def S(label, name, hue, sat, val, sources, verify=None, note=None):
    return dict(label=label, name=name, hue=hue, sat=sat, val=val, sources=sources, verify=verify, note=note)


def spec():
    sp = {}
    # ---------------------------------------------------------------- Click (host, not selectable): orange/tan
    c = "click"
    sp[c] = [
        S(None, "Orange fur", (18, 32), (0.55, 0.95), (0.6, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Tan belly / muzzle", (25, 45), (0.15, 0.45), (0.85, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Emblem blue", (205, 235), (0.6, 1), (0.4, 1), L(c, *TV) + L(c, "detail_c_emblem"), L(c, "hero", "head") + E(c, "idle")),
        S(None, "Harness brown", (15, 40), (0.2, 0.8), (0.0, 0.28), L(c, *TV), L(c, *VV) + E(c, "idle")),
        S(None, "Inner ear coral", (0, 12), (0.35, 0.8), (0.7, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S("C GOLD", "Emblem gold", (40, 55), (0.7, 1), (0.8, 1), L(c, *TV), L(c, "detail_c_emblem", "hero") + E(c, "idle")),
    ]
    # ---------------------------------------------------------------- Dino: teal + orange dorsal spikes + one backpack
    c = "dino"
    sp[c] = [
        S(None, "Teal body", (160, 190), (0.5, 1), (0.55, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Cream belly", (45, 70), (0.12, 0.5), (0.85, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy"),
          note="belly / snout underside"),
        S(None, "Orange spikes", (5, 40), (0.75, 1), (0.7, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy"),
          note="OWNER FLAG (doc 09 s6, unchanged): the approved art renders the locked-orange spikes red-orange (hue ~17 deg); "
               "sampled as drawn, semantic name stays Orange"),
        S(None, "Pack strap brown", (15, 35), (0.5, 0.95), (0.25, 0.6), L(c, *TV) + L(c, "detail_backpack_front", "detail_buckle"),
          L(c, "hero", "turnaround_back")),
        S(None, "Deep teal shade", (160, 190), (0.55, 1), (0.35, 0.62), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S("PACK BODY", "Olive green", (120, 170), (0.3, 0.9), (0.15, 0.45), L(c, *TV) + L(c, "detail_backpack_back"),
          L(c, "hero", "turnaround_back"),
          note="exactly one backpack; green body is owner-accepted (doc 09 s6); straps are slot 4"),
    ]
    # ---------------------------------------------------------------- Koala: gray-lavender scholar, no backpack
    c = "koala"
    HEAD = paths.lib_rel("koala", "koala_head.png")
    strips = [[106, 112, 114, 135], [125, 140, 160, 147], [215, 140, 250, 147], [255, 112, 262, 135], [240, 99, 265, 108]]
    sp[c] = [
        S(None, "Gray-lavender fur", (230, 285), (0.12, 0.5), (0.55, 0.9), L(c, *TV), L(c, "turnaround_back", "hero_reading") + E(c, "idle", "happy")),
        S(None, "Light lavender fur", (230, 300), (0.03, 0.2), (0.85, 1), L(c, *TV), L(c, "turnaround_back", "hero_reading") + E(c, "idle", "happy")),
        S(None, "Ear inner peach", (5, 20), (0.25, 0.7), (0.8, 1), L(c, *TV), L(c, "turnaround_back", "hero_reading") + E(c, "idle", "happy")),
        S(None, "Scholar jacket", (0, 50), (0.1, 0.7), (0.0, 0.25), L(c, "turnaround_front", "turnaround_34", "turnaround_side"),
          L(c, "hero_reading") + E(c, "idle", "happy")),
        S(None, "Glasses frames charcoal", (0, 360), (0.0, 1.0), (0.0, 0.2), R(HEAD, *strips, erode=1),
          R(paths.lib_rel("koala", "koala_turnaround_front.png"), [60, 69, 100, 75], [128, 69, 158, 75], [72, 94, 98, 99], [128, 94, 155, 99], erode=1),
          note="canonical frames dark charcoal / near-black (owner decision B); sampled from rim and temple strips of the approved head close-up "
               "(nose, pupils and hat excluded by region); the corrected glasses detail asset must match this value"),
        S("BOOK", "Leather brown", (15, 35), (0.5, 0.95), (0.25, 0.6), L(c, *TV) + L(c, "detail_scholar_book"),
          L(c, "hero_reading") + E(c, "idle", "thinking_analytical"), note="scholar book; hat brown is a neighbouring tone, not a slot"),
    ]
    # ---------------------------------------------------------------- Tarsier: smallest, huge eyes, goggles, scout
    c = "tarsier"
    sp[c] = [
        S(None, "Golden-brown fur", (22, 38), (0.4, 0.8), (0.4, 0.8), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Scout hood yellow", (40, 52), (0.8, 1), (0.8, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Goggle lens blue", (180, 200), (0.5, 1), (0.6, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Scout pack slate", (180, 215), (0.3, 0.9), (0.15, 0.5), L(c, *TV) + L(c, "detail_backpack_front"),
          L(c, "hero", "turnaround_back")),
        S(None, "Ear inner coral", (0, 20), (0.3, 0.75), (0.85, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S("EYE RING", "Amber", (25, 42), (0.8, 1), (0.55, 1), L(c, "head") + E(c, "idle", "happy"), L(c, "turnaround_front", "hero"),
          note="huge-eye amber iris ring; sampled from head close-up + expressions"),
    ]
    # ---------------------------------------------------------------- Eagle: white head, blue eyes, brown wings, green jacket
    c = "eagle"
    sp[c] = [
        S(None, "White head", (0, 360), (0.0, 0.1), (0.9, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy"),
          note="locked: clearly white-headed"),
        S(None, "Brown wings", (10, 30), (0.5, 0.9), (0.25, 0.55), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Beak and letter gold", (38, 52), (0.75, 1), (0.85, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy"),
          note="beak, original varsity A (gold) and trim"),
        S(None, "Varsity jacket green", (135, 165), (0.6, 1), (0.2, 0.55), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Feet orange", (25, 38), (0.8, 1), (0.9, 1), L(c, *TV), L(c, *VV)),
        S("EYES", "Blue", (190, 215), (0.6, 1), (0.6, 1), L(c, "head") + E(c, "idle", "happy"), E(c, "thinking", "discover", "cheer"),
          note="locked: blue eyes (code value yellow is transitional)"),
    ]
    # ---------------------------------------------------------------- Bronco: maroon bandana, red star/gear separate
    c = "bronco"
    sp[c] = [
        S(None, "Chestnut coat", (18, 34), (0.5, 0.9), (0.55, 1), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Dark mane", (5, 25), (0.3, 0.9), (0.0, 0.3), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S(None, "Red star / gear", (345, 360), (0.5, 1), (0.62, 1), L(c, "detail_star_treatment", "detail_saddle_pack"),
          R(paths.lib_rel("bronco", "bronco_hero.png"), [94, 88, 125, 118]) + R(paths.lib_rel("bronco", "bronco_turnaround_34.png"), [72, 130, 102, 170], erode=1),
          note="red star / gear treatment stays red and is never the bandana (doc 16 s7)"),
        S(None, "Saddle leather", (15, 30), (0.4, 0.9), (0.2, 0.5), L(c, "detail_saddle_pack"), L(c, "hero", "turnaround_34"),
          note="GEAR = saddle and leather (step 9 decision); red stays on ACCENT only"),
        S(None, "Muzzle & blaze", (15, 45), (0.05, 0.35), (0.85, 1.0), L(c, *TV), L(c, *VV) + E(c, "idle", "happy")),
        S("BANDANA", "Maroon", (335, 360), (0.45, 1), (0.15, 0.75), L(c, "detail_bandana", "turnaround_front"),
          L(c, "hero", "turnaround_34", "turnaround_side") + E(c, "idle", "happy"),
          note="locked semantic: MAROON bandana (doc 16 s7: 'BANDANA - MAROON'; the 130 px string does not fit the 88 px label, so label BANDANA + name Maroon). "
               "Sampled value is darker than the doc 09 code value #8E1B30; flagged, code not overwritten"),
    ]
    return sp


def lab(rgb):
    c = np.array(rgb, float) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    x, y, z = (M @ c) / np.array([0.95047, 1.0, 1.08883])
    f = lambda t: np.cbrt(t) if t > 0.008856 else 7.787 * t + 16 / 116.0
    fx, fy, fz = f(x), f(y), f(z)
    return np.array([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)])


def de76(a, b):
    return float(np.linalg.norm(lab(a) - lab(b)))


def build(root):
    out = {}
    fails = []
    for cid in CAST:
        slots = []
        for i, d in enumerate(spec()[cid]):
            r = ps.sample(root, d["sources"], d["hue"], d["sat"], d["val"])
            ver = []
            groups = {}
            for s in d["verify"] or []:
                groups.setdefault(s["path"], []).append(s)
            for path_, ss in groups.items():     # one measurement per verification asset (all its region strips pooled)
                try:
                    v = ps.sample(root, ss, d["hue"], d["sat"], d["val"], min_px=VERIFY_MIN_PX)
                except SystemExit:
                    ver.append({"path": path_, "result": "fewer than %d pixels in window (skipped)" % VERIFY_MIN_PX})
                    continue
                de = round(de76(r["rgb"], v["rgb"]), 2)
                ver.append({"path": path_, "sha256": v["sources"][0]["sha256"], "hex": v["hex"], "dE76": de,
                            "regions": [x.get("region") for x in ss if x.get("region")] or None,
                            "pixels_in_window": v["pixels_in_window"]})
            good = [v for v in ver if "dE76" in v]
            if not good:
                fails.append("%s slot %d (%s): no verification asset had enough pixels" % (cid, i + 1, d["name"]))
            vmax = max([v["dE76"] for v in good], default=None)
            vmed = float(np.median([v["dE76"] for v in good])) if good else None
            ok = bool(good) and vmed <= VERIFY_DE
            if not ok:
                fails.append("%s slot %d (%s): median verification dE76 %s > %.0f" % (cid, i + 1, d["name"], vmed, VERIFY_DE))
            slots.append({
                "slot": i + 1, "role": ROLES[i], "label": d["label"] or ROLES[i], "name": d["name"], "hex": r["hex"],
                "status": "PROVISIONAL",
                "sample": {k: r[k] for k in ("rgb", "pixels_in_window", "pixels_in_band", "band_percentiles", "band_channel_min",
                                              "band_channel_max", "window", "alpha_rule", "sources")},
                "verify": {"assets": ver, "median_dE76": None if vmed is None else round(vmed, 2),
                           "max_dE76": vmax, "limit_dE76": VERIFY_DE, "pass": ok},
                "note": d["note"]})
        out[cid] = {"slots": slots}
    return out, fails


def proof(root, pal, outdir):
    from PIL import Image, ImageDraw, ImageFont
    fd = os.path.join(ROOT, "fonts")
    F = lambda w, s: ImageFont.truetype(os.path.join(fd, {400: "NunitoSans-Regular.ttf", 600: "NunitoSans-SemiBold.ttf", 800: "NunitoSans-ExtraBold.ttf"}[w]), s, layout_engine=ImageFont.Layout.BASIC)
    os.makedirs(outdir, exist_ok=True)
    SW, SH = 150, 96
    W = 30 + 6 * (SW + 14) + 190
    H = 40 + len(CAST) * 190
    im = Image.new("RGB", (W, H), (254, 245, 223)); d = ImageDraw.Draw(im)
    d.text((14, 10), "PALETTE PROOF - six slots per sheet (hex sampled from final art; all PROVISIONAL per docs 09 / 15)", font=F(800, 14), fill=(20, 52, 42))
    for r, cid in enumerate(CAST):
        y0 = 40 + r * 190
        d.text((14, y0), cid.upper(), font=F(800, 15), fill=(20, 52, 42))
        for i, s in enumerate(pal[cid]["slots"]):
            x = 14 + i * (SW + 14); y = y0 + 22
            d.rounded_rectangle((x, y, x + SW, y + SH), radius=10, fill=s["hex"], outline=(184, 154, 106), width=1)
            d.text((x, y + SH + 6), s["label"], font=F(800, 11), fill=(20, 52, 42))
            d.text((x, y + SH + 22), s["name"], font=F(600, 12), fill=(20, 52, 42))
            d.text((x, y + SH + 40), s["hex"] + "  dE %.1f" % s["verify"]["median_dE76"], font=F(400, 11), fill=(20, 52, 42))
        # thumbnail of the character (idle expression) for context
        t = Image.open(os.path.join(root, paths.lib_rel(cid, "%s_turnaround_front.png" % cid))).convert("RGBA")
        t.thumbnail((170, 170)); bg = Image.new("RGBA", t.size, (255, 248, 232, 255)); bg.alpha_composite(t)
        im.paste(bg.convert("RGB"), (W - 180, y0 + 8))
    p = os.path.join(outdir, "palettes_proof.png")
    im.save(p, format="PNG", compress_level=9)
    # per-slot sampling-mask review images (selected pixels shown in colour, rest faded)
    for cid in CAST:
        rows = []
        for d_ in spec()[cid]:
            ims = ps.mask_overlay(root, d_["sources"], d_["hue"], d_["sat"], d_["val"])
            h = 150
            ims = [i.resize((max(1, int(i.width * h / i.height)), h)) for i in ims]
            rows.append(ims)
        Wm = max(sum(i.width for i in r) for r in rows) + 10
        m = Image.new("RGB", (Wm, 160 * 6), (255, 255, 255)); dm = ImageDraw.Draw(m)
        for k, r in enumerate(rows):
            x = 5
            for i in r:
                m.paste(i, (x, k * 160 + 5)); x += i.width
            dm.text((8, k * 160 + 6), "%d %s" % (k + 1, spec()[cid][k]["name"]), font=F(800, 12), fill=(255, 0, 255))
        m.save(os.path.join(outdir, "masks_%s.png" % cid), format="PNG", compress_level=9)
    return p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--assets-root", default=paths.ASSETS_ROOT)
    ap.add_argument("--library-root"); ap.add_argument("--expressions-root")   # consumed by tools/paths.py
    ap.add_argument("--out", default=os.path.join(ROOT, "palettes.json"))
    ap.add_argument("--proof-dir", default=os.path.join(ROOT, "palette_proof"))
    A = ap.parse_args()
    pal, fails = build(A.assets_root)
    doc = {"schema": "bidazoo-palettes-1",
           "doc_refs": ["docs/visual/09-palette.md", "docs/visual/15-character-sheet-template.md s2", "docs/visual/16-character-art-production-plan.md s7"],
           "status_policy": "every hex PROVISIONAL (doc 09 header, doc 15 s2: no final production hex is locked); no slot is OPEN",
           "method": "tools/palette_sampler.py: interior pixels (alpha>=250 eroded), HSV window, middle luma band 25-75 percent, per-channel median; "
                     "verified on independent final assets (CIE76 dE <= %.0f median)" % VERIFY_DE,
           "slot_order": ROLES, "characters": pal}
    with open(A.out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False); fh.write("\n")
    proof(A.assets_root, pal, A.proof_dir)
    for cid in CAST:
        print(cid, " ".join("%s=%s" % (s["name"].split()[0], s["hex"]) for s in pal[cid]["slots"]),
              "| verify med dE", [s["verify"]["median_dE76"] for s in pal[cid]["slots"]])
    if fails:
        print("\nPALETTE VERIFICATION FAILURES:"); [print(" -", f) for f in fails]
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
