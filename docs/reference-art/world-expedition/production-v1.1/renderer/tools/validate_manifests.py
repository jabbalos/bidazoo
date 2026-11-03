#!/usr/bin/env python3
"""Dev tool: validate manifests against ../manifest.schema.json (needs the jsonschema package)."""
import glob, json, os, sys
import jsonschema
H = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
schema = json.load(open(os.path.join(H, "manifest.schema.json")))
bad = 0
for f in sorted(f for f in glob.glob(os.path.join(H, "manifests", "*.json")) + glob.glob(os.path.join(H, "final-manifests", "[a-z]*.json")) if not f.endswith("core_boxes.json") and os.path.exists(f)):
    errs = list(jsonschema.Draft202012Validator(schema).iter_errors(json.load(open(f))))
    print(os.path.relpath(f, H), "OK" if not errs else "%d error(s)" % len(errs))
    for e in errs[:5]:
        print("   ", list(e.path), e.message[:120])
    bad += bool(errs)
sys.exit(1 if bad else 0)
