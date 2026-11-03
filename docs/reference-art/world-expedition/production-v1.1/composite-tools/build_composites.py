#!/usr/bin/env python3
"""build_composites.py - M4-5/M4-6 composite integration pass, STEP 1 (items independent of the logo / palette /
silhouette / sheet assets). Deterministic: no randomness, no AI; Nunito Sans text from ../renderer/fonts.

  python3 -I build_composites.py [--src DIR] [--out DIR]

  src  : folder holding the frozen production-v1.1 composites 00/07/08
         (default: the read-only staged worktree copy)
  out  : folder to write 00_Master_Overview.png, 07_..png, 08_..png (default: this folder)

Inputs besides src: ../library/*/*_turnaround_front.png (final front cutouts), /mnt/user-data/outputs/expression-batch
(frozen final 36 expressions), /mnt/user-data/outputs/renderer/manifests_v2 (head_scale / eye line / ref height).
STEP 2 (logo, palette swatches, silhouettes) is specified in dependent_steps.json and apply_step2_stub.py.
"""
import sys, os, json, hashlib, argparse
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from PIL import Image
import build00, build07, build08, step2

NAMES = {'00': '00_Master_Overview.png', '07': '07_Expressions_Proportions_Palettes.png', '08': '08_UI_and_Phaser_Asset_Spec.png'}
DEFAULT_SRC = '/mnt/user-data/uploads/BidaZoo-World-Expedition/docs/reference-art/world-expedition/production-v1.1'


def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()


def save(arr, path):
    im = Image.fromarray(arr)
    assert im.size == (1448, 1086), im.size
    im.save(path, format='PNG', compress_level=9)       # RGB, IHDR/IDAT/IEND only (no ancillary chunks)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=DEFAULT_SRC)
    ap.add_argument('--out', default=HERE)
    a = ap.parse_args()
    report = {}
    for key, mod in (('00', build00), ('07', build07), ('08', build08)):
        src = os.path.join(a.src, NAMES[key])
        arr, info = mod.build(src)                                   # STEP 1 (text / expression / lineup items)
        s1 = arr.copy()
        if key == '00':                                              # STEP 2: logo (banner restored from STEP 1), silhouettes + labels
            arr, i1 = step2.apply_logo(arr, '00'); arr, i2 = step2.silhouettes_00(arr)
            info2 = dict(logo=i1, silhouettes=i2)
        elif key == '07':                                            # STEP 2: panel-3 subtitle, palette cards, silhouettes + pills, logo
            arr, i0 = step2.subtitle_panel3(arr)
            arr, i1 = step2.palette_cards(arr); arr, i2 = step2.silhouettes_07(arr); arr, i3 = step2.apply_logo(arr, '07')
            info2 = dict(subtitle=i0, palettes=i1, silhouettes=i2, logo=i3)
        else:                                                        # STEP 2: logo
            arr, i1 = step2.apply_logo(arr, '08'); info2 = dict(logo=i1)
        dst = os.path.join(a.out, NAMES[key])
        save(arr, dst)
        Image.fromarray(s1).save(os.path.join(a.out, '_step1_' + NAMES[key])) if os.environ.get('KEEP_STEP1') else None
        report[NAMES[key]] = dict(src_sha256=sha(src), out_sha256=sha(dst), size=list(Image.open(dst).size), step2=json.loads(json.dumps(info2, default=str)))
        print(NAMES[key], report[NAMES[key]]['out_sha256'])
    json.dump(report, open(os.path.join(a.out, 'composites_report.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
