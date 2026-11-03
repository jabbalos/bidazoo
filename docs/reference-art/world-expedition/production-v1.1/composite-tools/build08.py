"""build08.py - MUST-CHANGE pass for 08_UI_and_Phaser_Asset_Spec.png (production-v1.1 frozen interim -> final)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compfx import *

INK = (40, 52, 75)

def build(src, dev=False):
    arr = np.array(Image.open(src).convert('RGB'))
    log = []
    # ---- panel 8: Poppins stand-ins -> Nunito Sans
    arr, i = retype(arr, (172, 525, 350, 548), 'Choose your explorer', 800, 'dark', 60, mode='row', dil=2); log.append(i)
    arr, i = retype(arr, (480, 531, 549, 543), 'HOST & GUIDE', 800, 'light', 45, anchor='c', x=514, tracking=0.03,
                    px=8.6, mode='row', fit_width=62); log.append(i)
    # ---- panel 13: "Try again!" Poppins -> Nunito Sans
    arr, i = retype(arr, (738, 786, 838, 812), 'Try again!', 800, 'dark', 25, dil=3, radius=4); log.append(i)
    # ---- panel 6: chip size labels (Bronco "80x96" -> "96x96"; all five retyped for consistency)
    for cx in (773, 866, 959.5, 1054.5, 1148.5):
        b = (int(cx - 28), 444, int(cx + 28), 462)
        arr, i = retype(arr, b, '96×96 px', 400, 'dark', 35, anchor='c', x=cx, px=11.5, fill=(42, 56, 78), dil=2); log.append(i)
    # ---- panel 15: stale / garbled text blocks (parchment, retyped in Nunito Sans Regular)
    arr, i = retype_block(arr, (30, 973, 300, 1014),
        ['Full Character Art (PNG, transparent)', 'Max size: 1024×1024 px each',
         'States: idle, happy, thinking, cheer, discover, tryAgain'], max_width=262, fill=INK, dil=3); log.append(i)
    arr, i = retype_block(arr, (910, 912, 1070, 1006),
        ['character_click_idle_0001.png', 'motion_click_jump_0001.png', 'ui_button_primary.png', 'ui_icon_star.png',
         'node_complete.png', 'fx_confetti_0001.png', 'bg_rainforest_01.png'], max_width=140, fill=INK, dil=3); log.append(i)
    arr, i = retype_block(arr, (698, 958, 905, 1010),
        ['Frame size: 256×256 px (or 512×512)', 'Format: PNG spritesheet',
         'Export names: motion_koala_run_0001.png ...', 'Recommended: 4–8 frames per animation'],
        max_width=198, fill=INK, dil=3); log.append(i)
    # ---- panel 15: portrait-card mock-up nameplate carried garbled pseudo-glyphs -> "EAGLE" (deterministic)
    arr, i = retype(arr, (326, 982, 368, 993), 'EAGLE', 800, 'light', 45, anchor='c', x=347.5, px=7.4, tracking=0.05,
                    mode='row', dil=2, fill=(255, 255, 255)); log.append(i)
    # ---- panel 16: garbled baked lines (flat parchment)
    arr, i = retype_block(arr, (830, 1047, 940, 1073), ['Follow COPPA/child', 'privacy laws'], thresh=22, dil=3, fill=(60, 72, 96)); log.append(i)
    arr, i = retype_block(arr, (1301, 1035, 1445, 1073), ['Use HTTPS only', 'Rate limit sign-in attempts',
        "Follow your platform's privacy policy"], thresh=22, dil=3, fill=(60, 72, 96), max_width=124); log.append(i)
    return arr, log

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    arr, log = build(src)
    Image.fromarray(arr).save(out)
    for l in log: print(l)
