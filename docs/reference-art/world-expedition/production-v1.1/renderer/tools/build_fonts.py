#!/usr/bin/env python3
"""Converts the @fontsource/nunito-sans 5.3.0 static latin WOFF files to TTF (lossless re-wrap with
fontTools: flavor removed, no glyph changes) and writes them to renderer/fonts/ together with the OFL text.
Usage: build_fonts.py <unpacked npm package dir> <out fonts dir>
Deterministic: fontTools save with no timestamp modification (recalcTimestamp=False)."""
import sys, os, shutil
from fontTools.ttLib import TTFont
pkg, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
NAMES = {400: "Regular", 600: "SemiBold", 700: "Bold", 800: "ExtraBold"}
for w, n in NAMES.items():
    f = TTFont(os.path.join(pkg, "files", "nunito-sans-latin-%d-normal.woff" % w), recalcTimestamp=False)
    f.flavor = None
    f.save(os.path.join(out, "NunitoSans-%s.ttf" % n))
shutil.copy(os.path.join(pkg, "LICENSE"), os.path.join(out, "OFL.txt"))
