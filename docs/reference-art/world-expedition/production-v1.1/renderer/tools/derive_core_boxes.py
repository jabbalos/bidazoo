#!/usr/bin/env python3
"""Writes core_boxes.json: the CORE box (head + hat/hood + ears, x0,y0,x1,y1 in source px) of every expression asset.

Source order: (1) 'core_box' in expression-batch/<c>/<c>_<state>_report.json when present; (2) derived here.
Derivation heuristic (numpy + scipy.ndimage; tool only, the renderer never imports scipy):
  1. mask = alpha >= 8.   2. 8-connected components; drop components smaller than 8% of the largest
     (detached ticks, bursts, '?' / '!' marks, sparkles).
  3. chin row = eye_line + 0.55 * (eye_line - crown_row)   (crown_row = first mask row; eye_line from the manifest estimate).
     Everything below the chin row is cut (neck, shoulders, arms, jacket, harness).
  4. re-label the cut mask; keep the component that contains the face point (centroid column at the eye row) plus any other
     component with >= 25% of its area (detached ear pieces); smaller blobs (fists / hooves / hands beside the head) are dropped.
  5. core box: y from the kept components; x-extent measured only on rows crown..(eye + 10% of eye-to-chin), so fists/hooves/paws
     raised beside the head (below that band) do not widen the core.
Known limits: a fist that overlaps the head in 2D is kept; a head with a very long neck/hat is under/over-cut.  A worker supplied
'core_box' wins unless it is >15% wider than the derived core (then it is rejected as including limbs); core_overrides.json (manual) beats both; check the overlay preview core_boxes_preview.png after each asset refresh."""
import glob, hashlib, json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import paths
AR = paths.ASSETS_ROOT
import make_real_manifests as mr

STRUCT = np.ones((3, 3), int)
REJECT = 1.15   # a worker core_box wider than 1.15x the derived core is treated as including limbs/body

def derive(img, eye):
    a = np.asarray(img.getchannel("A")) >= 8
    lab, n = ndimage.label(a, STRUCT)
    if n == 0: return None
    areas = ndimage.sum(a, lab, range(1, n + 1))
    keep = [i + 1 for i, v in enumerate(areas) if v >= 0.08 * areas.max()]
    m = np.isin(lab, keep)
    rows = np.where(m.any(1))[0]; top = rows[0]
    chin = int(min(m.shape[0], round(eye + 0.55 * (eye - top))))
    cut = m.copy(); cut[chin:] = False
    lab2, n2 = ndimage.label(cut, STRUCT)
    if n2 == 0: return None
    areas2 = ndimage.sum(cut, lab2, range(1, n2 + 1))
    er = min(int(eye), cut.shape[0] - 1)
    cols = np.where(cut[er])[0]
    fx = int(cols.mean()) if len(cols) else cut.shape[1] // 2
    face = lab2[er, fx] if lab2[er, fx] else int(np.argmax(areas2) + 1)
    sel = [face] + [i + 1 for i, v in enumerate(areas2) if i + 1 != face and v >= 0.25 * areas2[face - 1]]
    m2 = np.isin(lab2, sel)
    ys, xs = np.where(m2)
    # x-extent only from crown .. just below the eyes: limbs/fists raised beside the head sit below that band
    xr = min(chin, int(round(eye + 0.1 * (chin - eye))))
    band = m2[: max(xr, top + 2)]
    bx = np.where(band.any(0))[0]
    return [int(bx.min()), int(ys.min()), int(bx.max()) + 1, int(ys.max()) + 1]

CORE_OUT = os.environ.get("CORE_BOXES") or os.path.join(ROOT, "core_boxes.json")
CORE_PREVIEW = os.environ.get("CORE_PREVIEW") or os.path.join(ROOT, "core_boxes_preview.png")
OVR = json.load(open(os.path.join(ROOT, "core_overrides.json"))) if os.path.exists(os.path.join(ROOT, "core_overrides.json")) else {}

def main():
    out = {}
    prev = []
    for cid in mr.EYE:
        for key, eye in mr.EYE[cid].items():
            fn = mr.EXPR_FILE.get(cid, {}).get(key, key)
            rel = paths.expr_rel(cid, "%s_%s.png" % (cid, fn))
            img = Image.open(os.path.join(AR, rel)).convert("RGBA")
            rp = os.path.join(AR, rel[:-4] + "_report.json")
            cb = None; src = None; note = None
            dv = derive(img, eye)
            if os.path.exists(rp):
                r = json.load(open(rp)); cb = r.get("core_box")
                if cb: src = "report"
            if cb is not None and dv is not None and (cb[2] - cb[0]) > REJECT * (dv[2] - dv[0]):
                note = "report core_box %s rejected: %.0f%% wider than the derived core (likely includes fist/limb/body)" % (
                    cb, 100.0 * (cb[2] - cb[0]) / (dv[2] - dv[0]) - 100)
                cb = dv; src = "derived (report rejected)"
            if cb is None:
                cb = dv; src = "derived"
            if rel in OVR:
                ob = OVR[rel]["core_box"]; w_, h_ = img.size
                osha = OVR[rel].get("sha256")
                stale = (not (0 <= ob[0] < ob[2] <= w_ and 0 <= ob[1] < ob[3] <= h_)) or (osha and osha != hashlib.sha256(open(os.path.join(AR, rel), "rb").read()).hexdigest())
                if stale:   # v2.3: a hand-set box that does not fit the current asset (re-authored since) is IGNORED, loudly
                    note = "STALE manual override %s ignored (outside the %dx%d asset or sha256 mismatch); using %s" % (ob, w_, h_, src)
                    print("WARNING:", rel, note)
                else:
                    cb = ob; src = "manual override"; note = OVR[rel]["reason"]
            out[rel] = {"core_box": cb, "source": src, "size": list(img.size), "eye_line_src_y": eye}
            if note: out[rel]["note"] = note
            prev.append((cid, key, img, cb, src))
    for cid in mr.EYE:   # head close-ups (library assets)
        lib = json.load(open(os.path.join(paths.LIBRARY_ROOT, cid, "manifest.json")))
        for a in lib["assets"]:
            if a["asset"] == "head" and (a.get("recommended_eye_line_src_y") or cid in mr.HEAD_EYE_FALLBACK):
                rel = paths.lib_rel(cid, a["file"])
                img = Image.open(os.path.join(AR, rel)).convert("RGBA")
                eye = a.get("recommended_eye_line_src_y") or mr.HEAD_EYE_FALLBACK[cid]
                out[rel] = {"core_box": derive(img, eye), "source": "derived", "size": list(img.size), "eye_line_src_y": eye}
    json.dump(out, open(CORE_OUT, "w"), indent=1, sort_keys=True)
    open(CORE_OUT, "a").write("\n")
    # overlay preview
    cell = 2; W = 6 * 330; H = 6 * 380
    sheet = Image.new("RGB", (W, H), (200, 200, 200))
    for i, (cid, key, img, cb, src) in enumerate(prev):
        bg = Image.new("RGBA", img.size, (255, 248, 232, 255)); bg.alpha_composite(img)
        bg = bg.convert("RGB").resize((img.width * 1, img.height * 1)); d = ImageDraw.Draw(bg)
        d.rectangle(cb, outline=(0, 0, 255) if src == "report" else (255, 0, 255))
        r, c = divmod(i, 6); r = list(mr.EYE).index(cid); c = list(mr.EYE[cid]).index(key)
        sheet.paste(bg, (c * 330, r * 380))
    sheet.save(CORE_PREVIEW)
    print(len(out), "core boxes;", sum(1 for v in out.values() if v["source"] == "derived"), "derived")

if __name__ == "__main__":
    main()
