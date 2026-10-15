"""Shared helpers for deterministic silhouette derivation (M4 task B)."""
import numpy as np, cv2, hashlib, json, os
from PIL import Image
from scipy import ndimage as ndi

NAVY = (0x1E, 0x3A, 0x5F)   # doc 15 sec 9 "Silhouette fill: flat navy #1E3A5F"

def sha256_file(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def load(p):
    return np.array(Image.open(p).convert('RGBA'))

def hsv_f(rgb):
    h = cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2HSV).astype(float)
    return h[..., 0] * 2, h[..., 1] / 255, h[..., 2] / 255

def local_sd(rgb, k=5):
    g = rgb.astype(float) @ [.299, .587, .114]
    m = ndi.uniform_filter(g, k); m2 = ndi.uniform_filter(g * g, k)
    return np.sqrt(np.maximum(m2 - m * m, 0))

def leakish(rgb, M):
    h, s, v = hsv_f(rgb)
    warm = (h <= 65) | (h >= 350)
    return M & warm & (v > 0.55) & (s < 0.45)

def ground_line(rgb, M):
    """lowest row that holds >=3 dark/saturated body pixels (claws, hooves, paws)"""
    h, s, v = hsv_f(rgb)
    strong = M & ((v < 0.38) | (s > 0.55))
    rows = np.where(strong.sum(1) >= 3)[0]
    return int(rows.max()) if len(rows) else int(np.where(M.any(1))[0].max())
