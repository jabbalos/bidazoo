#!/usr/bin/env python3
"""Lead fix: the M4 library manifests dropped recommended_eye_line_src_y / eye_line_basis. Copy them back from the M2 manifests (asset PNGs unchanged)."""
import json, sys
R = sys.argv[1]; L = sys.argv[2]
for c in ["click", "dino", "koala", "tarsier", "eagle", "bronco"]:
    o = {a["asset"]: a for a in json.load(open(f"{R}/asset-library/{c}/manifest.json"))["assets"]}
    p = f"{L}/{c}/manifest.json"; m = json.load(open(p)); n = 0
    for a in m["assets"]:
        s = o.get(a["asset"])
        if s:
            for k in ("recommended_eye_line_src_y", "eye_line_basis"):
                if k not in a:
                    a[k] = s.get(k); n += 1
    json.dump(m, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
    print(c, "restored", n)
