"""Shared input locations for the manifest pipeline (no hard-coded session paths).
Resolution order: command-line flag, environment variable, default.
  --assets-root      / ASSETS_ROOT       directory every manifest asset path is relative to      (default /mnt/user-data/outputs)
  --library-root     / LIBRARY_ROOT      directory holding <char>/manifest.json + the library PNGs (default <assets-root>/asset-library)
  --expressions-root / EXPRESSIONS_ROOT  directory holding <char>/<char>_<state>.png (+ _report.json) (default <assets-root>/expression-batch)
Library and expression folders may live anywhere UNDER the assets root (e.g. m4-release/library); manifest paths are written
relative to the assets root so the renderer resolves them with --assets-root."""
import argparse, os

_ap = argparse.ArgumentParser(add_help=False)
_ap.add_argument("--assets-root"); _ap.add_argument("--library-root"); _ap.add_argument("--expressions-root")
_a, _ = _ap.parse_known_args()
ASSETS_ROOT = os.path.abspath(_a.assets_root or os.environ.get("ASSETS_ROOT") or "/mnt/user-data/outputs")
LIBRARY_ROOT = os.path.abspath(_a.library_root or os.environ.get("LIBRARY_ROOT") or os.path.join(ASSETS_ROOT, "asset-library"))
EXPRESSIONS_ROOT = os.path.abspath(_a.expressions_root or os.environ.get("EXPRESSIONS_ROOT") or os.path.join(ASSETS_ROOT, "expression-batch"))


def rel(p):
    r = os.path.relpath(os.path.abspath(p), ASSETS_ROOT).replace(os.sep, "/")
    if r.startswith(".."):
        raise SystemExit("path %s is outside the assets root %s" % (p, ASSETS_ROOT))
    return r


def lib_rel(cid, fname):
    return rel(os.path.join(LIBRARY_ROOT, cid, fname))


def expr_rel(cid, fname):
    return rel(os.path.join(EXPRESSIONS_ROOT, cid, fname))
