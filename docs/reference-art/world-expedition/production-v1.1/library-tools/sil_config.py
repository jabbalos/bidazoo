"""Per-asset cleanup configuration for deterministic silhouette derivation (task B).
Coordinates are in the SOURCE asset's own pixel space (x0,y0,x1,y1; x1/y1 exclusive).
Ops (all applied only to 'background-like' pixels = parchment cream / tan / grey shadow, never to dark or saturated body colour):
  below_line: [(x,y)..] -> remove everything under the polyline (ground shadow that is not parchment-coloured)
  erase: [rect] -> unconditional removal inside rect (leftover contact-shadow bar / thin matte spur)
  strip: N      -> within the bottom N rows: remove the ground contact shadow
  cut:   [rect] -> remove parchment that leaked into leg gaps / loops (matte artifacts), inside rect
  peel:  (y0,y1)-> remove 3 px bright-white matte fringe on the outer boundary, rows y0..y1
  hull:  [rect] -> repair an edge notch (erased pale fur) by the local convex hull inside rect
  fill:  [rect] -> force-fill an interior hole whose centroid lies in rect (artifact holes only)
Every entry is justified by an inspected zoom of the asset (see qa/sil_debug)."""
SRC = {  # slot -> source asset suffix
 'front': 'turnaround_front', '34': 'turnaround_34', 'side': 'turnaround_side', 'back': 'turnaround_back',
}
ACTION_SRC = {'click': 'hero', 'dino': 'hero', 'koala': 'hero_reading', 'tarsier': 'hero', 'eagle': 'hero', 'bronco': 'hero'}
ACTION_SLOT = {'koala': 'reading'}   # doc 16: Koala 5th silhouette is READING (its hero is the reading pose)

CFG = {
 ('click','front'): dict(strip=22, cut=[(78,246,126,296)]),
 ('click','34'):    dict(strip=22, cut=[(96,244,134,290)]),
 ('click','side'):  dict(strip=22, cut=[(72,224,86,246),(104,272,118,282)]),
 ('click','back'):  dict(strip=22, cut=[(64,220,84,264)]),
 ('click','action'): dict(),
 ('dino','front'):  dict(strip=24, cut=[(86,241,122,262)], erase=[(90,262,120,269)]),
 ('dino','34'):     dict(strip=24, cut=[(98,243,136,258)], erase=[(100,260,132,266)]),
 ('dino','side'):   dict(strip=24),
 ('dino','back'):   dict(strip=24, cut=[(76,252,114,266)], erase=[(82,261,112,268)]),
 ('dino','action'): dict(),
 ('koala','front'): dict(strip=12, cut=[(96,223,128,252)], hull=[(144,198,172,232)], erase=[(98,246,126,254),(8,90,16,118)], fill=[(92,218,102,242)]),
 ('koala','34'):    dict(strip=16, fill=[(90,246,106,258)]),
 ('koala','side'):  dict(strip=8),
 ('koala','back'):  dict(strip=14, cut=[(96,222,118,254)], erase=[(96,248,120,254)]),
 ('koala','reading'): dict(strip=18, below_line=[(0,217),(30,219),(62,225),(96,231),(206,232)]),
 ('tarsier','front'): dict(strip=14, cut=[(56,146,76,174)]),
 ('tarsier','34'):    dict(strip=18, cut=[(18,145,52,180),(140,203,162,216)]),
 ('tarsier','side'):  dict(strip=14, cut=[(146,191,178,214),(60,164,72,174),(90,158,102,170)]),
 ('tarsier','back'):  dict(strip=14, cut=[(84,184,92,194),(96,152,106,162)]),
 ('tarsier','action'): dict(),
 ('eagle','front'): dict(strip=26, cut=[(96,248,166,289)]),
 ('eagle','34'):    dict(strip=26, cut=[(108,250,142,288)]),
 ('eagle','side'):  dict(strip=28, cut=[(132,242,152,258)]),
 ('eagle','back'):  dict(strip=25),
 ('eagle','action'): dict(fill=[(145,112,165,130)]),
 ('bronco','front'): dict(strip=16, peel=(0,190), hull=[(44,230,84,256)], fill=[(50,258,72,272)]),
 ('bronco','34'):    dict(strip=16, peel=(0,190)),
 ('bronco','side'):  dict(strip=18, peel=(0,190)),
 ('bronco','back'):  dict(strip=18, peel=(0,190)),
 ('bronco','action'): dict(),
}
