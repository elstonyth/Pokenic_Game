# Measure, per machine: the banner PLATE's horizontal centre vs where "polycards" actually sits.
# Plate centre = expand from image-centre along a row ABOVE the wordmark (clear plate, no text/logo)
# while colour stays ~= the plate. polycards centre = bbox of text pixels (far from plate colour) in band.
import pillow_avif  # noqa
import numpy as np
from PIL import Image
from lama_config import JOBS

for base, cfg in JOBS.items():
    f = f"public/images/claw/{base}-machine.webp"
    try:
        rgb = np.array(Image.open(f).convert("RGB")).astype(int)
    except Exception as e:
        print(f"{base:26s} ERR {e}")
        continue
    H, W = rgb.shape[:2]
    bx0, bx1, by0, by1 = cfg["band"]
    py = max(0, int((by0 - 0.02) * H))      # row just ABOVE the wordmark = clear plate surface
    cx = W // 2
    plate = rgb[py, cx]
    def sim(x):
        return np.abs(rgb[py, x] - plate).sum() < 55
    l = cx
    while l > 1 and sim(l - 1):
        l -= 1
    r = cx
    while r < W - 1 and sim(r + 1):
        r += 1
    plate_c = (l + r) / 2 / W
    yb0, yb1, xb0, xb1 = int(by0 * H), int(by1 * H), int(bx0 * W), int(bx1 * W)
    sub = rgb[yb0:yb1, xb0:xb1]
    d = np.abs(sub - plate).sum(axis=2)
    xs = np.where((d > 75).any(axis=0))[0]
    text_c = (xb0 + (xs.min() + xs.max()) / 2) / W if len(xs) else -1
    off = (text_c - plate_c) * 100 if text_c >= 0 else 0
    flag = "  <-- OFF" if abs(off) > 1.6 else ""
    print(f"{base:26s} plate[{l/W:.2f}-{r/W:.2f}] c={plate_c:.3f}  polycards_c={text_c:.3f}  off={off:+.1f}%{flag}")
