#!/usr/bin/env python3
"""DEV ONLY: writes a clearly-marked stub LOGO_ASSET (transparent PNG, 936x288 = 3x the 312x96 logo box) so the pipeline can be
validated before the real logo exists.  Never use for a final render (build_all.py refuses a stub outside --dev).
   python3 -I tools/make_stub_logo.py OUT.png"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
out = sys.argv[1]
F = lambda f, s: ImageFont.truetype(os.path.join(ROOT, "fonts", f), s, layout_engine=ImageFont.Layout.BASIC)
im = Image.new("RGBA", (936, 288), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rounded_rectangle((6, 6, 929, 281), radius=40, outline=(30, 58, 95, 255), width=10)
d.text((468, 105), "BIDAZOO", font=F("NunitoSans-ExtraBold.ttf", 96), fill=(30, 58, 95, 255), anchor="mm")
d.text((468, 190), "WORLD EXPEDITION", font=F("NunitoSans-ExtraBold.ttf", 54), fill=(201, 146, 46, 255), anchor="mm")
d.text((468, 247), "STUB LOGO - DEV ONLY", font=F("NunitoSans-Bold.ttf", 28), fill=(160, 40, 40, 255), anchor="mm")
im.save(out, format="PNG", compress_level=9)
