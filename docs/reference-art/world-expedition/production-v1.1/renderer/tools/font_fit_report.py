#!/usr/bin/env python3
"""Exact fit table of every doc-15 FIXED string in Nunito Sans (the bundled static TTFs), measured with the renderer's own
text_width() and the doc 15 s4 roles (weight, size, tracking).  Writes font_fit_report.json + font_fit_report.txt next to the renderer.
   python3 -I tools/font_fit_report.py
A string 'fits' when its width <= box width minus the doc 15 s1 insets (8 px each side; 12 px each side for chips/pills)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import render_sheet as rs
F = rs.Fonts()


def w(text, weight, size, tr_em):
    return rs.text_width(F.get(weight, size), text, tr_em * size)


rows = []
def add(group, text, weight, size, tr, box_w, inset, note=""):
    wd = w(text, weight, size, tr); avail = box_w - 2 * inset
    rows.append({"group": group, "text": text, "weight": weight, "size_px": size, "tracking_em": tr, "width_px": round(wd, 2),
                 "box_w": box_w, "inset_each_side": inset, "available_px": avail, "fits": wd <= avail + rs.EPS,
                 "slack_px": round(avail - wd, 2), "note": note})

# markers (800, 12 -> min 10, +0.04 em, 2 lines): widest line decides; cell widths from doc 15 s1 / s2 / s3
for cell, cw in (("silhouette standing cell 72", 72), ("silhouette action cell 108", 108), ("expression cell 125", 125),
                 ("turnaround cell 335", 335), ("detail art 142", 142), ("palette swatch 88", 88), ("hero box 300", 300), ("head box 200", 200)):
    for lines in (("MISSING /", "TO AUTHOR"), ("OPEN —", "TO AUTHOR"), ("NEEDS EDIT —", "NOT APPROVED")):
        best = None
        for s in (12, 11, 10):
            wd = max(w(l, 800, s, 0.04) for l in lines)
            if wd <= cw - 16 + rs.EPS:
                best = s; break
        wd10 = max(w(l, 800, 10, 0.04) for l in lines)
        rows.append({"group": "marker text in " + cell, "text": " / ".join(lines), "weight": 800, "size_px": best or 10, "tracking_em": 0.04,
                     "width_px": round(wd10, 2), "box_w": cw, "inset_each_side": 8, "available_px": cw - 16, "fits": best is not None,
                     "slack_px": round(cw - 16 - wd10, 2),
                     "note": ("fits at %d px" % best) if best else "DOES NOT FIT even at the 10 px minimum (widest line at 10 px = %.1f px)" % wd10})
# palette role labels (800, 10, +0.06 em; box 88; renderer uses the full 88, doc 15 s1 inset would give 72)
for t in rs.DEFAULT_PALETTE_ROLES + ["BANDANA — MAROON", "BANDANA", "C GOLD", "PACK BODY", "BOOK", "EYE RING", "EYES", "OPEN"]:
    add("palette role label (88 px box, no inset)", t, 800, 10, 0.06, 88, 0)
for t in rs.DEFAULT_PALETTE_ROLES[:5] + ["BANDANA", "C GOLD", "PACK BODY", "BOOK", "EYE RING", "EYES"]:
    add("palette role label (88 px box, 8 px inset - strict reading of doc 15 s1)", t, 800, 10, 0.06, 88, 8)
# pills, tags, chips
for t in ("SELECTABLE STARTER", "HOST & GUIDE — NOT SELECTABLE"):
    add("role tag (pill 336, 12 px padding)", t, 800, 13, 0.04, 336, 12)
for t, _, _ in rs.CHIPS:
    add("panel chip (auto width; shown for width only)", t, 800, 14, 0.04, 10 ** 4, 12)
for t, _ in rs.TURN_CELLS:
    add("turnaround label pill (max 319)", t, 700, 12, 0.04, 335 - 16 + 24, 12)
for t, _ in rs.EXPR_CELLS:
    add("expression label pill (max 109)", t, 700, 12, 0.04, 125 - 16 + 24, 12)
for t, _ in rs.SIL_CELLS:
    add("silhouette label (cell width)", t, 700, 11, 0.04, 108 if t == "ACTION" else 72, 0)
add("PROVISIONAL tag in a 72 px silhouette cell (tag + 8 px)", "PROVISIONAL", 800, 10, 0.06, 72, 0, "tag pill = text + 10 px padding; renderer omits it and logs a warning")
add("PROVISIONAL tag in the palette chip row", "PROVISIONAL", 800, 10, 0.06, 1108 - 826, 0)
add("PROVISIONAL SCALE (proportion guide)", "PROVISIONAL SCALE", 800, 10, 0.06, 268, 0)
bad = [r for r in rows if not r["fits"]]
json.dump({"font": "Nunito Sans (static TTF from @fontsource/nunito-sans 5.3.0, SIL OFL 1.1)", "font_sha256": F.sha256, "rows": rows,
           "not_fitting": [{"group": r["group"], "text": r["text"], "width_px": r["width_px"], "available_px": r["available_px"], "note": r["note"]} for r in bad]},
          open(os.path.join(ROOT, "font_fit_report.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
lines = ["Fixed-string fit in Nunito Sans (renderer text_width; doc 15 s4 roles).  'avail' = box width minus insets.", ""]
for r in rows:
    lines.append("%-4s %-70s %-34s %6.1f px / %6.1f avail  %s" % ("OK" if r["fits"] else "FAIL", r["group"], r["text"], r["width_px"], r["available_px"], r["note"]))
lines += ["", "NOT FITTING: %d" % len(bad)] + ["  - %s | %s | %.1f px vs %.1f avail" % (r["group"], r["text"], r["width_px"], r["available_px"]) for r in bad]
open(os.path.join(ROOT, "font_fit_report.txt"), "w", encoding="utf-8").write("\n".join(lines) + "\n")
print("\n".join(lines[-(len(bad) + 2):]))
