# Test: precise per-letter mask + cv2.inpaint to erase "source-brand" on one product
# (mythic, purple-on-white) and one dramatic (black-pack, white-on-dark) machine.
# Saves the mask + the inpainted result (NO text yet) so we can verify the removal
# is clean: no box, no streak, MYTHIC PACK / sport name intact.
import os
import numpy as np
from PIL import Image
import cv2

OUT = "docs/research/packdetail/lama-test"
os.makedirs(OUT, exist_ok=True)


def load_rgb(path):
    return np.array(Image.open(path).convert("RGB"))


def inpaint(src_path, kind, band, out_name):
    rgb = load_rgb(src_path)
    H, W = rgb.shape[:2]
    R, G, B = rgb[:, :, 0].astype(int), rgb[:, :, 1].astype(int), rgb[:, :, 2].astype(int)
    mask = np.zeros((H, W), np.uint8)
    x0, x1 = int(band[0] * W), int(band[1] * W)
    y0, y1 = int(band[2] * H), int(band[3] * H)
    region = np.zeros((H, W), bool)
    region[y0:y1, x0:x1] = True
    if kind == "purple":          # periwinkle text on white sign
        txt = (B - G > 18) & (B > 120)
    else:                          # white text on dark/glowing banner
        mn = np.minimum(np.minimum(R, G), B)
        txt = mn > 150
    mask[region & txt] = 255
    # dilate to capture anti-aliasing + glow halo
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    Image.fromarray(mask).save(f"{OUT}/{out_name}_mask.png")
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    res = cv2.inpaint(bgr, mask, 6, cv2.INPAINT_TELEA)
    res_rgb = cv2.cvtColor(res, cv2.COLOR_BGR2RGB)
    Image.fromarray(res_rgb).save(f"{OUT}/{out_name}_inpainted.png")
    print(f"{out_name}: {W}x{H} masked_px={int((mask>0).sum())}")


inpaint("public/images/claw/mythic-pack-machine.avif", "purple", (0.36, 0.62, 0.155, 0.225), "mythic")
inpaint("public/images/claw/black-pack-jjnfuk-machine-src.webp", "white", (0.34, 0.66, 0.095, 0.172), "blackpack")
print("done")
