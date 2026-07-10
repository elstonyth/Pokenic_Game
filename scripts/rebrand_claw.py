# Definitive claw re-brand: precise per-letter mask + cv2.inpaint to erase "source-brand"
# (rebuilds the banner seamlessly — no box/streak/residual, leaves pack/sport name and
# logos intact), then composites a centred "Pokenic" (Poppins-Bold). Sources are the
# CLEAN originals (avif for product shots, -src.webp backups for dramatic). Idempotent.
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import cv2

DIR = "public/images/claw"
FONT = "scripts/Poppins-Bold.ttf" if os.path.exists("scripts/Poppins-Bold.ttf") else "C:/Windows/Fonts/segoeuib.ttf"
PURPLE = (104, 108, 190)
WHITE = (245, 247, 252)

# ONLY machines whose banner actually says "source-brand". The one-piece machines are
# tier-branded ("ELITE / PACK MACHINE" …) with NO source-brand → restored, not rebranded.
POKEMON = ["mythic-pack", "legend-pack", "elite-pack", "platinum-pack", "rookie-pack", "trainer-pack"]
RESTORE = ["elite-one-piece-pack", "legend-one-piece-pack", "one-piece-platinum-pack",
           "one-piece-sealed-claw-mcmnf5", "starter-one-piece-pack"]

# base -> (source_file, kind, band(x0,x1,y0,y1), text_rgb, centre(cx,cy), target_width_frac)
# kind "dark" = dark wordmark on a light/white banner (pokemon, BLACK-HAT detection)
# kind "white" = light wordmark on a dark/glowing banner (dramatic + ornate riftbound, TOP-HAT)
JOBS = {}
for b in POKEMON:
    JOBS[b] = (f"{b}-machine.avif", "dark", (0.37, 0.61, 0.153, 0.223), PURPLE, (0.488, 0.185), 0.165)
JOBS["starter-riftbound-pack"] = ("starter-riftbound-pack-machine.avif", "white", (0.32, 0.64, 0.135, 0.205), WHITE, (0.48, 0.166), 0.16)
JOBS["black-pack-jjnfuk"] = ("black-pack-jjnfuk-machine-src.webp", "white", (0.35, 0.63, 0.095, 0.172), WHITE, (0.49, 0.135), 0.165)
JOBS["legend-pack-1dpaec"] = ("legend-pack-1dpaec-machine-src.webp", "white", (0.35, 0.63, 0.095, 0.172), WHITE, (0.49, 0.135), 0.165)
JOBS["modern-grails-noafw0"] = ("modern-grails-noafw0-machine-src.webp", "white", (0.30, 0.59, 0.095, 0.172), WHITE, (0.445, 0.135), 0.155)
JOBS["pro-soccer-pack"] = ("pro-soccer-pack-machine-src.webp", "white", (0.35, 0.62, 0.095, 0.165), WHITE, (0.485, 0.128), 0.155)


def fit_font(text, target_px):
    size = 12
    while size < 200:
        f = ImageFont.truetype(FONT, size + 4)
        if f.getlength(text) > target_px:
            break
        size += 4
    return ImageFont.truetype(FONT, size)


def process(base, cfg):
    src, kind, band, color, centre, twf = cfg
    rgb = np.array(Image.open(f"{DIR}/{src}").convert("RGB"))
    H, W = rgb.shape[:2]
    x0, x1 = int(band[0] * W), int(band[1] * W)
    y0, y1 = int(band[2] * H), int(band[3] * H)
    # Detect the wordmark by LOCAL CONTRAST (morphological hat) so it works on any
    # banner colour: BLACK-HAT finds dark text on a lighter banner (product shots),
    # TOP-HAT finds bright text on a darker/glowing banner (dramatic). Confined to the
    # wordmark band so it never touches the pack/sport name below.
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    sub = gray[y0:y1, x0:x1]
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))
    op = cv2.MORPH_TOPHAT if kind == "white" else cv2.MORPH_BLACKHAT
    hat = cv2.morphologyEx(sub, op, k)
    _, mb = cv2.threshold(hat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = np.zeros((H, W), np.uint8)
    mask[y0:y1, x0:x1] = mb
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    cleaned = cv2.cvtColor(cv2.inpaint(bgr, mask, 6, cv2.INPAINT_TELEA), cv2.COLOR_BGR2RGB)
    img = Image.fromarray(cleaned)
    draw = ImageDraw.Draw(img)
    font = fit_font("Pokenic", twf * W)
    draw.text((centre[0] * W, centre[1] * H), "Pokenic", font=font, fill=color, anchor="mm")
    img.save(f"{DIR}/{base}-machine.webp", quality=92, method=6)
    return f"{base}: {W}x{H} mask_px={int((mask>0).sum())} font={font.size}"


for base, cfg in JOBS.items():
    print(process(base, cfg))

# Restore tier-branded machines to their unmodified original (no source-brand to remove)
for b in RESTORE:
    Image.open(f"{DIR}/{b}-machine.avif").convert("RGB").save(f"{DIR}/{b}-machine.webp", quality=92, method=6)
    print(f"{b}: restored (tier-branded, no source-brand)")

print(f"\n{len(JOBS)} re-branded, {len(RESTORE)} restored")
