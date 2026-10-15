#!/usr/bin/env python3
"""Renders the six placeholder sheets (+ synthetic selftest) twice each, verifies byte-identical output,
writes out/determinism.txt and the downscaled out/contact_sheet.png.   python3 run_all.py"""
import hashlib, os, subprocess, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
import argparse
ap = argparse.ArgumentParser()
ap.add_argument("--manifests", default="manifests")
ap.add_argument("--out", default="out")
ap.add_argument("--suffix", default="placeholder")
ap.add_argument("--no-selftest", action="store_true")
ap.add_argument("--assets-root", default=os.environ.get("ASSETS_ROOT", "/mnt/user-data/outputs"))
ap.add_argument("--out-abs", action="store_true", help="treat --out as an absolute / cwd-relative path instead of relative to this folder")
A = ap.parse_args()
OUT = os.path.abspath(A.out) if A.out_abs else os.path.join(HERE, A.out)
ASSETS = A.assets_root
CAST = ["click", "dino", "koala", "tarsier", "eagle", "bronco"]
os.makedirs(OUT, exist_ok=True)

def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()

def run(manifest, out, assets=None):
    cmd = [sys.executable, "-I", os.path.join(HERE, "render_sheet.py"), manifest, out]
    if assets:
        cmd += ["--assets-root", assets]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL)

jobs = [(c, os.path.join(HERE, A.manifests, c + ".json"), os.path.join(OUT, c + "_sheet_%s.png" % A.suffix), ASSETS) for c in CAST]
if not A.no_selftest: jobs.append(("selftest", os.path.join(HERE, "selftest", "selftest.json"), os.path.join(OUT, "selftest_sheet.png"), None))
lines = ["Determinism check: each sheet rendered twice (fresh process), sha256 compared.", ""]
ok = True
for name, man, out, assets in jobs:
    run(man, out, assets); h1, r1 = sha(out), sha(out[:-4] + ".report.json")
    run(man, out, assets); h2, r2 = sha(out), sha(out[:-4] + ".report.json")
    same = (h1 == h2 and r1 == r2)
    ok &= same
    im = Image.open(out)
    lines.append("%-9s png run1=%s run2=%s report-identical=%s  %s %s  => %s" % (
        name, h1, h2, r1 == r2, im.size, im.mode, "IDENTICAL" if same else "DIFFERENT"))
lines += ["", "RESULT: " + ("ALL IDENTICAL" if ok else "MISMATCH")]
open(os.path.join(OUT, "determinism.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))

# contact sheet: 3 x 2 grid of the six placeholder sheets at 1/2 size
W, H, G = 724, 543, 12
cs = Image.new("RGB", (3 * W + 4 * G, 2 * H + 3 * G), (254, 245, 223))
for i, c in enumerate(CAST):
    im = Image.open(os.path.join(OUT, c + "_sheet_%s.png" % A.suffix)).convert("RGB").resize((W, H), Image.LANCZOS)
    cs.paste(im, (G + (i % 3) * (W + G), G + (i // 3) * (H + G)))
cs.save(os.path.join(OUT, "contact_sheet.png"), format="PNG", compress_level=9)
sys.exit(0 if ok else 1)
