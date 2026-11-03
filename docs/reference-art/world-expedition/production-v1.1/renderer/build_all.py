#!/usr/bin/env python3
"""ONE-COMMAND pipeline for the six canonical character sheets.

  python3 build_all.py --out out_final --logo m4-release/logo/<LOGO_FILE>.png
        [--assets-root DIR] [--library-root DIR] [--expressions-root DIR] [--palettes palettes.json] [--resample-palettes]
  dev run on stub art:  python3 build_all.py --out out_dev --stub-logo --dev

Steps (each is a fresh process; nothing in the source tree is modified; all work files go under <out>/_work, removed at the end):
  0  preflight        Nunito Sans files + OFL.txt present and verified; no DejaVu / Poppins in renderer code, manifests or reports
  1  palettes         palettes.json present, six complete slots per sheet, none OPEN; (--resample-palettes re-runs tools/make_palettes.py first;
                      otherwise it is checked to be CURRENT with the assets)
  2  make_real_manifests -> 3 derive_core_boxes -> 4 make_v2_manifests (takes palettes.json, the LOGO_ASSET path, library / expression roots)
  5  run_all render #1 -> <out>   6  run_all render #2 (independent process + folder) -> compared byte for byte with #1
  7  check_consistency   8  manifest schema validation (manifest.schema.json + palettes.json structure)
  9  gates; build_report.json + SHA256SUMS.txt (sha256 of every output)

Gates.  ALWAYS FAIL: any OPEN / unsampled palette slot; non-identical repeat render; schema errors; check_consistency FAIL; font violations;
Poppins/DejaVu found; missing outputs.   FAIL unless --dev: any placeholder, template defect, report warning, PROVISIONAL art slot or
logo (the palette tag is excluded: docs 09/15 make every hex PROVISIONAL by rule), stub logo, palettes.json not current.
--dev downgrades only the second group to WAIVED (still listed in build_report.json).  --stub-logo requires --dev.
ENVIRONMENT NOTE (found in the M4 prepare session): the shared /mnt/.../outputs mount stamps every PNG written to it with C2PA content-credential
chunks about a minute after the write, which changes the file bytes (sha256) but not the pixels.  So build_all renders inside a private temp dir
(--work-dir, default a fresh tempfile.mkdtemp), works on a SNAPSHOT of the inputs (so concurrent writes / stamping of the inputs cannot change a
build half-way), computes every sha256 on the pure renderer bytes, and only then copies the results to --out.  Besides SHA256SUMS.txt (renderer
bytes) it writes PIXELSUMS.txt (sha256 of the decoded RGB pixels), which stays valid after any metadata stamping.
Exit code 0 = all gates pass.  No timestamps anywhere: two runs on identical inputs produce identical outputs, build_report.json included."""
import argparse, glob, hashlib, json, os, re, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
PY = [sys.executable, "-I"]
CAST = ["click", "dino", "koala", "tarsier", "eagle", "bronco"]
FONT_FILES = ["NunitoSans-Regular.ttf", "NunitoSans-SemiBold.ttf", "NunitoSans-Bold.ttf", "NunitoSans-ExtraBold.ttf", "OFL.txt"]
STUB_LOGO = "dev_stub/stub_logo_DEV_ONLY.png"   # generated inside the private snapshot, never on the shared mount


def sha(p):
    with open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


class Build:
    def __init__(self, A):
        self.A = A
        self.fail, self.waived, self.info, self.steps, self.log = [], [], [], [], []

    def gate(self, name, detail, waivable):
        (self.waived if (waivable and self.A.dev) else self.fail).append({"gate": name, "detail": detail})

    def run(self, step, cmd, env=None, check=True):
        e = dict(os.environ); e.update(env or {})
        r = subprocess.run(cmd, cwd=HERE, env=e, capture_output=True, text=True)
        self.log.append("### %s\n$ %s\n%s%s" % (step, " ".join(os.path.relpath(c, HERE) if os.path.isabs(c) and c.startswith(HERE) else c for c in cmd[2:]), r.stdout, r.stderr))
        self.steps.append({"step": step, "exit": r.returncode})
        if check and r.returncode != 0:
            self.fail.append({"gate": "step:" + step, "detail": "exit %d; see build_log.txt (last lines: %s)" % (r.returncode, (r.stdout + r.stderr).strip().splitlines()[-3:])})
        return r.returncode


def rd(p):
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True, help="output folder (created; relative paths are relative to the CURRENT directory)")
    ap.add_argument("--logo", help="LOGO_ASSET path relative to the assets root, e.g. m4-release/logo/<file>.png (or absolute)")
    ap.add_argument("--logo-status", default="READY WITH CROP/MATTING")
    ap.add_argument("--stub-logo", action="store_true", help="DEV ONLY: use the generated stub logo (requires --dev)")
    ap.add_argument("--dev", action="store_true", help="waive art placeholders / provisional / warnings / stub logo (never palette OPEN or determinism)")
    ap.add_argument("--assets-root", default=os.environ.get("ASSETS_ROOT", "/mnt/user-data/outputs"))
    ap.add_argument("--library-root", default=os.environ.get("LIBRARY_ROOT"), help="folder with <char>/manifest.json + library PNGs (default <assets-root>/asset-library)")
    ap.add_argument("--expressions-root", default=os.environ.get("EXPRESSIONS_ROOT"), help="default <assets-root>/expression-batch")
    ap.add_argument("--palettes", default=os.path.join(HERE, "palettes.json"))
    ap.add_argument("--work-dir", help="private build folder (default: a fresh temp dir, removed afterwards); must NOT be on the shared outputs mount")
    ap.add_argument("--resample-palettes", action="store_true", help="re-run tools/make_palettes.py into --palettes before building")
    A = ap.parse_args()
    B = Build(A)
    final = os.path.abspath(A.out)
    if A.stub_logo and not A.dev:
        sys.exit("--stub-logo is DEV ONLY and requires --dev")
    if not A.logo and not A.stub_logo:
        sys.exit("--logo PATH is required (placeholder: m4-release/logo/<file>) or use --dev --stub-logo")
    tmp = os.path.abspath(A.work_dir) if A.work_dir else tempfile.mkdtemp(prefix="bidazoo_m4_build_")
    if A.work_dir:
        if os.path.exists(tmp) and os.listdir(tmp):
            sys.exit("--work-dir must be empty or absent: %s" % tmp)
        os.makedirs(tmp, exist_ok=True)
    out = os.path.join(tmp, "build"); work = os.path.join(tmp, "work"); snap = os.path.join(tmp, "assets")
    os.makedirs(out); os.makedirs(work); os.makedirs(snap)
    root0 = os.path.abspath(A.assets_root)
    lib0 = os.path.abspath(A.library_root) if A.library_root else os.path.join(root0, "asset-library")
    exr0 = os.path.abspath(A.expressions_root) if A.expressions_root else os.path.join(root0, "expression-batch")
    # ---- snapshot of the inputs (same relative layout as the real assets root, so manifest paths stay canonical)
    def relto(p):
        r = os.path.relpath(p, root0).replace(os.sep, "/")
        if r.startswith(".."):
            sys.exit("%s must live under the assets root %s" % (p, root0))
        return r
    lib_rel, exr_rel = relto(lib0), relto(exr0)
    SKIP = ("_4bg.png", "_src.png", "_compare.png", "_sidebyside.png")
    n_copied = 0
    for src_dir, rel_dir, pats in ((lib0, lib_rel, ("*.png", "manifest.json")), (exr0, exr_rel, ("*.png", "*_report.json"))):
        for cid in CAST:
            d = os.path.join(snap, rel_dir, cid); os.makedirs(d, exist_ok=True)
            for pat in pats:
                for f in sorted(glob.glob(os.path.join(src_dir, cid, pat))):
                    if f.endswith(SKIP):
                        continue
                    shutil.copy2(f, d); n_copied += 1
    logo_in = None
    if A.logo and not A.stub_logo:
        lp = A.logo if os.path.isabs(A.logo) else os.path.join(root0, A.logo)
        if os.path.isfile(lp):
            lrel = relto(lp); os.makedirs(os.path.dirname(os.path.join(snap, lrel)), exist_ok=True)
            shutil.copy2(lp, os.path.join(snap, lrel)); n_copied += 1; logo_in = lrel
        else:
            sys.exit("LOGO_ASSET not found: %s" % lp)
    root = snap
    lib = os.path.join(snap, lib_rel); exr = os.path.join(snap, exr_rel)
    env = {"ASSETS_ROOT": root, "LIBRARY_ROOT": lib, "EXPRESSIONS_ROOT": exr, "REAL_DIR": os.path.join(work, "manifests_real"),
           "V2_DIR": os.path.join(out, "manifests"), "CORE_BOXES": os.path.join(work, "core_boxes.json"),
           "CORE_PREVIEW": os.path.join(work, "core_boxes_preview.png")}
    B.tmp, B.final, B.snapshot_files, B.lib_rel, B.exr_rel = tmp, final, n_copied, lib_rel, exr_rel
    logo = STUB_LOGO if A.stub_logo else logo_in
    logo_status = "PROVISIONAL" if A.stub_logo else A.logo_status

    # ---- 0 preflight: fonts and font audit
    fonts_dir = os.path.join(HERE, "fonts")
    miss = [f for f in FONT_FILES if not os.path.isfile(os.path.join(fonts_dir, f))]
    if miss:
        B.fail.append({"gate": "fonts", "detail": "missing %s in %s (a missing font is a hard error; no fallback)" % (miss, fonts_dir)})
    font_sha = {f: sha(os.path.join(fonts_dir, f)) for f in FONT_FILES if os.path.isfile(os.path.join(fonts_dir, f))}
    code_hits = []
    for f in ["render_sheet.py", "run_all.py", "check_consistency.py", "build_all.py"] + sorted(glob.glob(os.path.join(HERE, "tools", "*.py"))):
        p = f if os.path.isabs(f) else os.path.join(HERE, f)
        for n, line in enumerate(open(p, encoding="utf-8"), 1):
            code = line.split("#", 1)[0]
            if os.path.basename(p) != "build_all.py" and re.search(r"dejavu|poppins|liberation|truetype/", code, re.I):
                code_hits.append("%s:%d" % (os.path.relpath(p, HERE), n))
    if code_hits:
        B.fail.append({"gate": "font_audit", "detail": "DejaVu/Poppins/system-font references in code: %s" % code_hits})
    if not os.path.isfile(os.path.join(HERE, "palettes.json")) and A.palettes == os.path.join(HERE, "palettes.json") and not A.resample_palettes:
        B.fail.append({"gate": "palettes", "detail": "palettes.json missing"})

    # ---- stub logo
    if A.stub_logo:
        os.makedirs(os.path.join(root, "dev_stub"), exist_ok=True)
        B.run("make_stub_logo", PY + ["tools/make_stub_logo.py", os.path.join(root, STUB_LOGO)], env)
        B.gate("stub_logo", "DEV stub logo in use: %s" % STUB_LOGO, True)

    # ---- 1 palettes
    pal_path = os.path.abspath(A.palettes)
    if A.resample_palettes:
        B.run("make_palettes", PY + ["tools/make_palettes.py", "--assets-root", root, "--out", pal_path,
                                      "--proof-dir", os.path.join(os.path.dirname(pal_path), "palette_proof")], env)
    else:
        tmp = os.path.join(work, "palettes_fresh.json")
        rc = B.run("make_palettes(check-current)", PY + ["tools/make_palettes.py", "--assets-root", root, "--out", tmp,
                                                         "--proof-dir", os.path.join(work, "palette_proof")], env, check=False)
        if rc != 0:
            B.fail.append({"gate": "palettes_verify", "detail": "tools/make_palettes.py verification failed on the current assets (see build_log.txt)"})
        elif os.path.isfile(pal_path) and sha(tmp) != sha(pal_path):
            B.gate("palettes_current", "palettes.json is NOT current with the assets (a fresh sample differs); re-run with --resample-palettes", True)
    if not os.path.isfile(pal_path):
        B.fail.append({"gate": "palettes", "detail": "palettes file missing: %s" % pal_path})
        return finish(B, out, work, {}, env, root)
    pal = rd(pal_path)
    open_slots = []
    for cid in CAST:
        sl = pal["characters"][cid]["slots"]
        if len(sl) != 6:
            open_slots.append("%s: %d slots" % (cid, len(sl)))
        for i, s in enumerate(sl):
            if s.get("status") == "OPEN" or not s.get("hex") or not s.get("name"):
                open_slots.append("%s slot %d" % (cid, i + 1))
    if open_slots:
        B.fail.append({"gate": "palette_open", "detail": "OPEN / incomplete palette slots: %s" % open_slots})
        return finish(B, out, work, {}, env, root)

    # ---- 2-4 manifests
    B.run("make_real_manifests", PY + ["tools/make_real_manifests.py"], env)
    B.run("derive_core_boxes", PY + ["tools/derive_core_boxes.py"], env)
    rc = B.run("make_v2_manifests", PY + ["tools/make_v2_manifests.py", "--palettes", pal_path, "--logo", logo, "--logo-status", logo_status], env)
    if rc != 0:
        return finish(B, out, work, {}, env, root)

    # ---- 5-6 two independent renders
    r1 = B.run("run_all#1", PY + ["run_all.py", "--manifests", os.path.join(out, "manifests"), "--out", out, "--suffix", "v2", "--no-selftest", "--assets-root", root], env, check=False)
    rep_dir = os.path.join(work, "repeat")
    r2 = B.run("run_all#2", PY + ["run_all.py", "--manifests", os.path.join(out, "manifests"), "--out", rep_dir, "--suffix", "v2", "--no-selftest", "--assets-root", root], env, check=False)
    ident, det = True, {}
    for cid in CAST:
        for ext in (".png", ".report.json"):
            a = os.path.join(out, "%s_sheet_v2%s" % (cid, ext)); b = os.path.join(rep_dir, "%s_sheet_v2%s" % (cid, ext))
            if not (os.path.isfile(a) and os.path.isfile(b)):
                ident = False; det[cid + ext] = "missing"; continue
            same = sha(a) == sha(b); ident &= same; det[cid + ext] = "identical" if same else "DIFFERENT"
    if not (r1 == 0 and r2 == 0 and ident):
        B.fail.append({"gate": "determinism", "detail": "run_all exit codes %s/%s; repeat-render comparison %s" % (r1, r2, {k: v for k, v in det.items() if v != "identical"} or "ok")})
    # ---- 7 consistency
    B.run("check_consistency", PY + ["check_consistency.py", "--manifests", os.path.join(out, "manifests"), "--out", out, "--suffix", "v2", "--assets-root", root], env, check=False)
    cr = os.path.join(out, "check_report.json")
    if os.path.isfile(cr):
        n = rd(cr)["fail_count"]
        if n:
            fl = ["%s:%s" % (c, x["check"]) for c, rs_ in rd(cr)["results"].items() for x in rs_ if x["result"] == "FAIL"]
            B.fail.append({"gate": "check_consistency", "detail": "%d FAIL: %s" % (n, fl)})
    else:
        B.fail.append({"gate": "check_consistency", "detail": "no check_report.json"})
    # ---- 8 schema validation
    try:
        import jsonschema
        schema = rd(os.path.join(HERE, "manifest.schema.json")); bad = []
        for cid in CAST:
            errs = list(jsonschema.Draft202012Validator(schema).iter_errors(rd(os.path.join(out, "manifests", cid + ".json"))))
            bad += ["%s: %s %s" % (cid, list(e.path), e.message[:100]) for e in errs[:3]]
        B.steps.append({"step": "schema_validation", "errors": len(bad)})
        if bad:
            B.fail.append({"gate": "schema", "detail": bad})
    except ImportError:
        B.fail.append({"gate": "schema", "detail": "jsonschema package missing: cannot validate manifests"})
    return finish(B, out, work, {"identical": ident, "per_file": det}, env, root, font_sha, fonts_dir)


def finish(B, out, work, det, env, root, font_sha=None, fonts_dir=None):
    A = B.A
    summary = {}
    for cid in CAST:
        rp = os.path.join(out, "%s_sheet_v2.report.json" % cid)
        if not os.path.isfile(rp):
            continue
        rep = rd(rp)
        ph = rep["placeholders"]
        pal_ph = [p for p in ph if p["zone"] == "palette"]
        other_ph = [p for p in ph if p["zone"] != "palette"]
        prov = [p for p in rep["provisional"] if p["zone"] != "palette"]
        summary[cid] = {"placeholders": [(p["zone"] + "." + p["slot"], p["reason"]) for p in other_ph],
                        "palette_open": [p["slot"] for p in pal_ph],
                        "provisional_art": [p["zone"] + "." + p["slot"] for p in prov],
                        "template_defects": rep["template_defects"], "warnings": rep["warnings"],
                        "overflow_flags": [(o["zone"], o["slot"]) for o in rep["overflows"]],
                        "fonts": rep["fonts"], "computed_sheet_status": rep["computed_sheet_status"]}
        if pal_ph:
            B.fail.append({"gate": "palette_open", "detail": "%s: palette placeholders %s" % (cid, [p["slot"] for p in pal_ph])})
        if other_ph:
            B.gate("placeholders", "%s: %s" % (cid, summary[cid]["placeholders"]), True)
        if rep["template_defects"]:
            B.gate("template_defects", "%s: %s" % (cid, [d["what"] + ":" + str(d.get("text", d.get("slot", ""))) for d in rep["template_defects"]]), True)
        if rep["warnings"]:
            B.gate("report_warnings", "%s: %s" % (cid, rep["warnings"]), True)
        if prov:
            B.gate("provisional_art", "%s: %s" % (cid, summary[cid]["provisional_art"]), True)
        if rep["fonts"]["family"] != "Nunito Sans" or (font_sha and any(rep["fonts"]["sha256"][w] != font_sha[f] for w, f in
                (("400", "NunitoSans-Regular.ttf"), ("600", "NunitoSans-SemiBold.ttf"), ("700", "NunitoSans-Bold.ttf"), ("800", "NunitoSans-ExtraBold.ttf")))):
            B.fail.append({"gate": "fonts", "detail": "%s: report fonts do not match the bundled Nunito Sans files" % cid})
    # Poppins/DejaVu anywhere in outputs (manifests + reports)
    leaks = []
    for p in glob.glob(os.path.join(out, "*.json")) + glob.glob(os.path.join(out, "manifests", "*.json")):
        if re.search(r"dejavu|poppins", open(p, encoding="utf-8").read(), re.I):
            leaks.append(os.path.relpath(p, out))
    if leaks:
        B.fail.append({"gate": "font_audit", "detail": "DejaVu/Poppins named in outputs: %s" % leaks})
    # outputs: keep core boxes + palettes copy, drop work
    os.makedirs(os.path.join(out, "inputs"), exist_ok=True)
    for f in ("core_boxes.json",):
        if os.path.isfile(os.path.join(work, f)):
            shutil.copy(os.path.join(work, f), os.path.join(out, "inputs", f))
    if os.path.isfile(os.path.abspath(A.palettes)):
        shutil.copy(os.path.abspath(A.palettes), os.path.join(out, "inputs", "palettes.json"))
    with open(os.path.join(out, "build_log.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(B.log).replace(B.tmp, "<WORK>"))
    ok = not B.fail
    rep = {"result": "PASS" if ok else "FAIL", "mode": "dev" if A.dev else "final",
           "logo": STUB_LOGO if A.stub_logo else A.logo, "stub_logo": bool(A.stub_logo),
           "library_root_rel": B.lib_rel, "expressions_root_rel": B.exr_rel, "input_files_snapshotted": B.snapshot_files,
           "palettes_json_sha256": sha(os.path.abspath(A.palettes)) if os.path.isfile(os.path.abspath(A.palettes)) else None,
           "fonts_sha256": font_sha, "steps": B.steps, "repeat_render": det, "failures": B.fail, "waived_in_dev": B.waived,
           "per_sheet": summary}
    with open(os.path.join(out, "build_report.json"), "w", encoding="utf-8") as fh:
        json.dump(rep, fh, indent=1, ensure_ascii=False, default=str); fh.write("\n")
    lines, plines = [], []
    for f in sorted(glob.glob(os.path.join(out, "**", "*"), recursive=True)):
        if os.path.isfile(f) and os.path.basename(f) not in ("SHA256SUMS.txt", "PIXELSUMS.txt"):
            rp_ = os.path.relpath(f, out).replace(os.sep, "/")
            lines.append("%s  %s" % (sha(f), rp_))
            if f.endswith(".png"):
                plines.append("%s  %s" % (hashlib.sha256(np.asarray(Image.open(f).convert("RGBA")).tobytes()).hexdigest(), rp_))
    with open(os.path.join(out, "SHA256SUMS.txt"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    with open(os.path.join(out, "PIXELSUMS.txt"), "w", encoding="utf-8") as fh:
        fh.write("# sha256 of the decoded RGBA pixel bytes (invariant under PNG metadata stamping)\n" + "\n".join(plines) + "\n")
    if os.path.exists(B.final):
        shutil.rmtree(B.final)
    shutil.copytree(out, B.final)
    shutil.rmtree(B.tmp, ignore_errors=True)
    out = B.final
    print("BUILD %s (%s mode) -> %s" % (rep["result"], rep["mode"], out))
    for f in B.fail:
        print("  FAIL   %-20s %s" % (f["gate"], str(f["detail"])[:400]))
    for f in B.waived:
        print("  WAIVED %-20s %s" % (f["gate"], str(f["detail"])[:300]))
    for l in lines:
        if "sheet_v2.png" in l or "contact" in l:
            print("  sha256", l)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
