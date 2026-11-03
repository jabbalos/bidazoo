#!/usr/bin/env python3
"""Deterministic pixel sampler for palette slots (library; used by tools/make_palettes.py).

Method (doc 09 s6 'hue mask plus the middle lightness band', made explicit):
  1. read the final RGBA asset; keep only INTERIOR pixels: alpha == 255 after a 2 px erosion of the alpha>=250 mask
     (no matte edge, no anti-aliased fringe, no semi-transparent shadow);
  2. optional REGION box (source px, x0,y0,x1,y1): restricts the pool to the part of the asset that is the slot;
  3. HSV window (hue in degrees, wrapping allowed; saturation and value 0..1) isolates the slot's colour family;
  4. MIDDLE LIGHTNESS BAND: of the pixels that pass, keep those whose luma lies between the 25th and 75th percentile
     (drops specular highlights and form shadows);
  5. the slot colour is the per-channel MEDIAN of the kept pixels, rounded to integers.
Pools from several sources are concatenated before steps 3-5 (every source contributes its interior pixels).
Everything is numpy on integer data: no randomness, no float-order effects that survive rounding (median of ints)."""
import hashlib, json, os
import numpy as np
from PIL import Image

ALPHA_SOLID = 250
ERODE_PX = 2


def _erode(mask, n):
    m = mask.copy()
    for _ in range(n):
        p = np.pad(m, 1, constant_values=False)
        m = (p[1:-1, 1:-1] & p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:]
             & p[:-2, :-2] & p[:-2, 2:] & p[2:, :-2] & p[2:, 2:])
    return m


def load_pool(root, rel, region=None, erode=ERODE_PX):
    full = os.path.join(root, rel)
    with open(full, "rb") as fh:
        data = fh.read()
    sha = hashlib.sha256(data).hexdigest()
    im = Image.open(full).convert("RGBA")
    a = np.asarray(im)
    solid = _erode(a[:, :, 3] >= ALPHA_SOLID, erode)
    if region:
        x0, y0, x1, y1 = region
        reg = np.zeros_like(solid)
        reg[y0:y1, x0:x1] = True
        solid &= reg
    rgb = a[:, :, :3]
    hsv = np.asarray(Image.fromarray(rgb, "RGB").convert("HSV")).astype(np.int32)
    return {"rel": rel, "sha256": sha, "size": im.size, "rgb": rgb, "hsv": hsv, "solid": solid}


def _window(hsv, hue, sat, val):
    h = hsv[:, :, 0] * 360.0 / 255.0
    s = hsv[:, :, 1] / 255.0
    v = hsv[:, :, 2] / 255.0
    lo, hi = hue
    hm = (h >= lo) & (h <= hi) if lo <= hi else ((h >= lo) | (h <= hi))
    return hm & (s >= sat[0]) & (s <= sat[1]) & (v >= val[0]) & (v <= val[1])


def sample(root, sources, hue=(0, 360), sat=(0.0, 1.0), val=(0.0, 1.0), band=(25, 75), min_px=200):
    """sources: list of {"path":..., "region":[x0,y0,x1,y1]|None}.  Returns provenance dict incl. 'hex'."""
    px, srcs = [], []
    for s in sources:
        P = load_pool(root, s["path"], s.get("region"), s.get("erode", ERODE_PX))
        m = P["solid"] & _window(P["hsv"], hue, sat, val)
        px.append(P["rgb"][m])
        srcs.append({"path": s["path"], "sha256": P["sha256"], "size_px": list(P["size"]),
                     "region": s.get("region"), "erode_px": s.get("erode", ERODE_PX), "pixels_in_window": int(m.sum())})
    allpx = np.concatenate(px) if px else np.zeros((0, 3), np.uint8)
    n_pool = int(len(allpx))
    if n_pool < min_px:
        raise SystemExit("palette sampler: only %d pixels in window (need %d) for %s" % (n_pool, min_px, [s["path"] for s in sources]))
    a64 = allpx.astype(np.int64)
    luma = 299 * a64[:, 0] + 587 * a64[:, 1] + 114 * a64[:, 2]
    lo, hi = np.percentile(luma, band[0]), np.percentile(luma, band[1])
    k = allpx[(luma >= lo) & (luma <= hi)]
    med = np.median(k, axis=0)
    rgb = [int(np.floor(v + 0.5)) for v in med]
    hexv = "#%02X%02X%02X" % tuple(rgb)
    return {"hex": hexv, "rgb": rgb, "pixels_in_window": n_pool, "pixels_in_band": int(len(k)),
            "band_percentiles": list(band),
            "band_channel_min": [int(x) for x in k.min(0)], "band_channel_max": [int(x) for x in k.max(0)],
            "window": {"hue_deg": list(hue), "sat": list(sat), "val": list(val)},
            "alpha_rule": "alpha>=%d, eroded by erode_px (per source; default %d)" % (ALPHA_SOLID, ERODE_PX), "sources": srcs}


def mask_overlay(root, sources, hue, sat, val, scale=1):
    """review helper: list of RGB images with the selected pixels tinted magenta"""
    out = []
    for s in sources:
        P = load_pool(root, s["path"], s.get("region"), s.get("erode", ERODE_PX))
        m = P["solid"] & _window(P["hsv"], hue, sat, val)
        base = np.full(P["rgb"].shape, (255, 248, 232), np.uint8)
        im = Image.open(os.path.join(root, s["path"])).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 248, 232, 255)); bg.alpha_composite(im)
        arr = np.asarray(bg.convert("RGB")).copy()
        arr[~m] = (arr[~m] * 0.45 + 255 * 0.55).astype(np.uint8)
        arr[m] = (arr[m] * 0.5).astype(np.uint8) + np.array([0, 0, 0], np.uint8)
        out.append(Image.fromarray(arr, "RGB"))
    return out
