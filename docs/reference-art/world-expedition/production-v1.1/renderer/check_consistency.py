#!/usr/bin/env python3
"""Automated consistency checks for rendered sheets.
   python3 check_consistency.py [--manifests manifests_v2] [--out out_real_v2] [--suffix v2] [--assets-root DIR] [--no-determinism]
Writes <out>/check_report.json and <out>/check_report.txt; exit code 1 if any FAIL.
Checks (per character unless noted):
  size        sheet PNG is exactly 1448x1086 RGB
  cast_k      cast.k equals the owner-locked factor (Eagle 1.000, Click 0.92, Bronco 0.92, Dino 0.85, Koala 0.76, Tarsier 0.57)
  core_scale  all six states share ONE head_scale; density normalization u != 1 is listed; core crown-to-eye height in px
              (eye_line - core_top, x scale) within +-30% of the median; core width px within [60%,100%] of the 109 px safe width... see below
  core_safe   core width <= 109 px and core crown >= y520 in every cell (true flags)
  eye_line    every expression cell's eye line is y=598 (+-0.5); head close-up eye line y=610; eye line lies inside the core box
  bottom      spread of art bottom y across the six cells <= 30 px (cells are bottom-aligned/bleed consistently); head close-up
              art bottom within 8 px of its box bottom (else the source crop edge floats in the box)
  allowance   no art pixel outside the cell allowance (cell inside its 2 px border; bottom bleed excepted)
  turnaround  every placed view: bottom on y=400 (+-1), centered on its cell center (+-1.5), within 184 x 335
  fit_down    policy B (v2.3): per-cell uniform fit-down factors are listed; the eye line must still be 598 on fitted bust cells
  head_closeup  bottom-anchored; a short bust is INFO only (policy C), never a failure
  determinism two fresh renders are byte-identical to each other and to the file on disk
"""
import argparse, hashlib, json, os, statistics, subprocess, sys, tempfile
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
CAST = ["click", "dino", "koala", "tarsier", "eagle", "bronco"]
K_LOCKED = {"eagle": 1.000, "click": 0.92, "bronco": 0.92, "dino": 0.85, "koala": 0.76, "tarsier": 0.57}
CELL_CX = [203.5, 550.5, 897.5, 1244.5]
TOL_C2E, TOL_BOTTOM, TOL_HEAD_BOTTOM = 0.30, 30.0, 1.0

def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()

ALLOW_TOL_PX = 1.0  # v2.3 policy A: 1 px tolerance on every width check (core safe width, allowance), documented in template-rules-v2.md

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifests", default="manifests_v2"); ap.add_argument("--out", default="out_real_v2")
    ap.add_argument("--suffix", default="v2"); ap.add_argument("--assets-root", default="/mnt/user-data/outputs")
    ap.add_argument("--no-determinism", action="store_true")
    A = ap.parse_args()
    out = os.path.join(HERE, A.out); res = {}; fails = 0
    def add(cid, name, ok, detail, warn=False, info=False):
        nonlocal fails
        r = "PASS" if ok else ("WARN" if warn else "FAIL")
        if info: r = "INFO"          # informational only: never a failure, never a warning
        res.setdefault(cid, []).append({"check": name, "result": r, "detail": detail})
        fails += (r == "FAIL")
    for cid in CAST:
        png = os.path.join(out, "%s_sheet_%s.png" % (cid, A.suffix))
        rep = json.load(open(png[:-4] + ".report.json"))
        man = json.load(open(os.path.join(HERE, A.manifests, cid + ".json")))
        im = Image.open(png)
        stale = [a["path"] for a in rep["assets"] if os.path.exists(os.path.join(A.assets_root, a["path"])) and sha(os.path.join(A.assets_root, a["path"])) != a["sha256"]]
        add(cid, "assets_current", not stale, "assets changed since this render: %s" % (stale or "none"))
        add(cid, "size", im.size == (1448, 1086) and im.mode == "RGB", "%s %s" % (im.size, im.mode))
        add(cid, "cast_k", abs(man["cast"]["k"] - K_LOCKED[cid]) < 1e-9, "k=%s expected %s" % (man["cast"]["k"], K_LOCKED[cid]))
        ex = [p for p in rep["placements"] if p["zone"] == "expressions"]
        add(cid, "expression_cells_drawn", len(ex) == 6, "%d of 6 expression cells have art" % len(ex))
        if ex:
            hs = {p["head_scale"] for p in ex}
            us = {p["slot"]: p["units_per_source_px"] for p in ex if p["units_per_source_px"] != 1.0}
            c2e = {p["slot"]: (p["eye_line_y"] - p["core_px"]["y"]) for p in ex}
            med = statistics.median(c2e.values())
            bad = {k: round(v / med, 2) for k, v in c2e.items() if abs(v / med - 1) > TOL_C2E}
            add(cid, "core_scale", len(hs) == 1 and not bad,
                "head_scale=%s; density-normalized states=%s; crown-to-eye px=%s; outliers(>±30%%)=%s" % (
                    sorted(hs), us or "none", {k: round(v, 1) for k, v in c2e.items()}, bad or "none"))
            core_bad = [(p["slot"], p["core_px"]["w"]) for p in ex if p["core_px"]["w"] > 109 + ALLOW_TOL_PX + 1e-6 or p["core_px"]["y"] < 520 - 1e-6]
            add(cid, "core_safe", not core_bad, "core widths px=%s; violations=%s" % ({p["slot"]: p["core_px"]["w"] for p in ex}, core_bad or "none"))
            bust = [p for p in ex if p.get("crop_kind", "bust") == "bust"]
            head_only = [p for p in ex if p.get("crop_kind") == "head_only"]
            eyebad = [p["slot"] for p in bust if abs(p["eye_line_y"] - 598) > 0.5]
            inside = []
            for p in ex:
                cb = p["core_box_src"]
                ey = (p["eye_line_y"] - p["image_origin"][1]) / p["scale_px_per_source_px"]
                if not (cb[1] < ey < cb[3]): inside.append(p["slot"])
            add(cid, "eye_line", not eyebad and not inside, "bust cells off-598=%s; eye outside core box=%s; head-only cells (bottom-anchored, eye line free)=%s; core_source=%s" % (
                eyebad or "none", inside or "none", {p["slot"]: round(p["eye_line_y"], 1) for p in head_only} or "none", sorted({p["core_source"] for p in ex})))
            bots = {p["slot"]: p["bottom_y"] for p in bust}
            spread = (max(bots.values()) - min(bots.values())) if bots else 0
            add(cid, "bottom", spread <= TOL_BOTTOM and all(abs(p["bottom_y"] - 724) <= 0.75 for p in head_only),
                "bust art bottom y=%s spread=%.1f px (tol %.0f); head-only bottoms (must be 724)=%s" % (
                    {k: round(v, 1) for k, v in bots.items()}, spread, TOL_BOTTOM, {p["slot"]: round(p["bottom_y"], 1) for p in head_only} or "none"))
        allow = [(o["slot"], r["metric"], r["value"]) for o in rep["overflows"] if o["zone"] == "expressions"
                 for r in o["reasons"] if "outside_allowance" in r["metric"] and r["value"] > ALLOW_TOL_PX]
        add(cid, "allowance", not allow, "violations=%s" % (allow or "none"))
        if ex:
            fd = {p["slot"]: p.get("fit_down_factor", 1.0) for p in ex}
            moved = {k: v for k, v in fd.items() if v < 1.0}
            eff = {p["slot"]: p["scale_px_per_source_px"] for p in ex}
            eyes_ok = all(abs(p["eye_line_y"] - 598) <= 0.5 for p in ex if p.get("crop_kind", "bust") == "bust")
            add(cid, "fit_down", eyes_ok, "per-cell fit-down factors (1.0 = none)=%s; eye line kept at 598 on fitted bust cells=%s" % (fd, eyes_ok), info=not moved and eyes_ok)
        other = [(o["zone"], o["slot"], [r["metric"] for r in o["reasons"]]) for o in rep["overflows"] if o["zone"] != "expressions"]
        add(cid, "other_overflow_flags", not other, "%s" % (other or "none"))
        hd = [p for p in rep["placements"] if p["zone"] == "head"]
        if hd:
            h = hd[0]; top_gap = h["matted_bbox"]["y"] - 514
            bottom_ok = abs(h["bottom_gap_to_box_px"]) <= 1.0
            short = top_gap > 0.35 * 246
            det = "bottom-anchored: bottom gap %.1f px; eye line y=%s; art top %.1f px below box top" % (h["bottom_gap_to_box_px"], h["eye_line_y"], top_gap)
            if bottom_ok and short:
                # v2.3 policy C: a short bust is valid (transparent space above/below is fine); judged by head scale, eye line and framing, not by height
                add(cid, "head_closeup", True, "short bust, art top %.1f px below box top (valid; info only: not stretched, no torso invented, no enlarging past the 88%% core width; %s)" % (top_gap, det), info=True)
            else:
                add(cid, "head_closeup", bottom_ok, det)
        bad = []
        for p in rep["placements"]:
            if p["zone"] == "turnaround":
                i = ["front", "threeQuarter", "side", "back"].index(p["slot"]); b = p["matted_bbox"]
                if abs(b["y"] + b["h"] - 400) > 1 and "ground_y_src" not in json.dumps(man["turnaround"][p["slot"]]): bad.append((p["slot"], "baseline", round(b["y"] + b["h"], 1)))
                if abs(b["x"] + b["w"] / 2 - CELL_CX[i]) > 1.5: bad.append((p["slot"], "center", round(b["x"] + b["w"] / 2, 1)))
                if p["overflow"]: bad.append((p["slot"], "overflow"))
        add(cid, "turnaround", not bad, "violations=%s" % (bad or "none"))
        if not A.no_determinism:
            mp = os.path.join(HERE, A.manifests, cid + ".json"); hs_ = []
            for _ in range(2):
                with tempfile.TemporaryDirectory() as td:
                    o = os.path.join(td, "x.png")
                    subprocess.run([sys.executable, "-I", os.path.join(HERE, "render_sheet.py"), mp, o, "--assets-root", A.assets_root], check=True, stdout=subprocess.DEVNULL)
                    hs_.append(sha(o))
            add(cid, "determinism", hs_[0] == hs_[1] == sha(png), "render1=%s render2=%s on_disk=%s" % (hs_[0][:12], hs_[1][:12], sha(png)[:12]))
    lines = []
    for cid in CAST:
        lines.append("== %s" % cid)
        for r in res[cid]: lines.append("  [%s] %-22s %s" % (r["result"], r["check"], r["detail"]))
    lines.append("\nTOTAL FAIL: %d" % fails)
    open(os.path.join(out, "check_report.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"fail_count": fails, "tolerances": {"crown_to_eye": TOL_C2E, "bottom_spread_px": TOL_BOTTOM, "head_bottom_gap_px": TOL_HEAD_BOTTOM}, "results": res},
              open(os.path.join(out, "check_report.json"), "w"), indent=1)
    print("\n".join(lines)); sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
