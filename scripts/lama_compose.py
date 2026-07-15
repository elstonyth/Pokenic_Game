# Step 3 of the LaMa re-brand: composite a centred "Polycards" onto each LaMa-cleaned
# banner and write the final {base}-machine.webp. Also restore the tier-branded
# one-piece machines to their unmodified originals (no source-brand to remove).
import os
import pillow_avif  # noqa: F401 — registers AVIF codec in Pillow
from PIL import Image, ImageDraw, ImageFont
from lama_config import JOBS, RESTORE, DIR, LAMA_OUT

FONT = "scripts/Poppins-Bold.ttf" if os.path.exists("scripts/Poppins-Bold.ttf") else "C:/Windows/Fonts/segoeuib.ttf"


def fit_font(text, target_px):
    size = 12
    while size < 200:
        f = ImageFont.truetype(FONT, size + 4)
        if f.getlength(text) > target_px:
            break
        size += 4
    return ImageFont.truetype(FONT, size)


for base, cfg in JOBS.items():
    src = f"{LAMA_OUT}/{base}.png"
    if not os.path.exists(src):
        print(f"{base}: MISSING LaMa output ({src}) — skipped"); continue
    img = Image.open(src).convert("RGB")
    W, H = img.size
    draw = ImageDraw.Draw(img)
    font = fit_font("Polycards", cfg["twf"] * W)
    draw.text((cfg["centre"][0] * W, cfg["centre"][1] * H), "Polycards", font=font, fill=cfg["color"], anchor="mm")
    img.save(f"{DIR}/{base}-machine.webp", quality=92, method=6)
    print(f"{base}: composed Polycards (font {font.size})")

for b in RESTORE:
    Image.open(f"{DIR}/{b}-machine.avif").convert("RGB").save(f"{DIR}/{b}-machine.webp", quality=92, method=6)
    print(f"{b}: restored (tier-branded)")

print(f"\n{len(JOBS)} composed, {len(RESTORE)} restored")
