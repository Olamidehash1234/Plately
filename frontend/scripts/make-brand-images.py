"""Generate the raster brand images: favicons and the link-preview card.

    python frontend/scripts/make-brand-images.py

favicon.svg is hand-written and scales by itself, but PNG fallbacks are still
needed — Safari wants an apple-touch-icon, and WhatsApp, Slack and Twitter will
not render an SVG in a link preview at all. Those are drawn here rather than
committed as opaque binaries so that changing the brand means editing colours
in one place and re-running this.

Sizes are the ones that actually get requested: 96 for browser tabs, 180 for
iOS home screens, 1200x630 for link previews (the ratio every scraper crops
to).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# Straight from frontend/tailwind.config.js.
PRIMARY = "#0b6444"
PRIMARY_CONTAINER = "#2f7d5b"
PRIMARY_FIXED = "#a4f3c9"
WHITE = "#ffffff"

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
FONTS = PUBLIC / "fonts"

# Supersampling factor. Pillow has no antialiased drawing, so everything is
# rendered large and scaled down with a good filter.
SS = 4


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def draw_mark(size: int) -> Image.Image:
    """The plate mark, matching public/favicon.svg."""
    px = size * SS
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(px * 14 / 64)
    d.rounded_rectangle([0, 0, px - 1, px - 1], radius=radius, fill=PRIMARY)

    centre = px / 2
    rim = px * 19 / 64
    width = max(1, int(px * 4 / 64))
    d.ellipse(
        [centre - rim, centre - rim, centre + rim, centre + rim],
        outline=WHITE,
        width=width,
    )

    inner = px * 8.5 / 64
    d.ellipse(
        [centre - inner, centre - inner, centre + inner, centre + inner],
        fill=PRIMARY_FIXED,
    )

    return img.resize((size, size), Image.LANCZOS)


def draw_og_card() -> Image.Image:
    """1200x630 link preview.

    Kept deliberately sparse: WhatsApp renders these small, and a card that
    reads at thumbnail size beats one carrying detail nobody can see.
    """
    w, h = 1200 * SS, 630 * SS
    img = Image.new("RGB", (w, h), PRIMARY)
    d = ImageDraw.Draw(img)

    # A soft diagonal wash so the card is not a flat rectangle of green.
    for i in range(h):
        blend = i / h * 0.55
        r = int(0x0B + (0x2F - 0x0B) * blend)
        g = int(0x64 + (0x7D - 0x64) * blend)
        b = int(0x44 + (0x5B - 0x44) * blend)
        d.line([(0, i), (w, i)], fill=(r, g, b))

    pad = 88 * SS

    mark_size = 132 * SS
    mark = draw_mark(mark_size // SS).resize((mark_size, mark_size), Image.LANCZOS)
    img.paste(mark, (pad, pad), mark)

    title = font("FoundersGrotesk-Bold.otf", 132 * SS)
    tagline = font("FoundersGrotesk-Medium.otf", 54 * SS)
    detail = font("FoundersGrotesk-Regular.otf", 34 * SS)

    y = pad + mark_size + 54 * SS
    d.text((pad, y), "Plately", font=title, fill=WHITE)

    y += 168 * SS
    d.text(
        (pad, y),
        "Photograph a meal, know what's in it.",
        font=tagline,
        fill=PRIMARY_FIXED,
    )

    y += 86 * SS
    d.text(
        (pad, y),
        "Jollof  ·  Amala  ·  Eba  ·  Egusi  ·  Moi moi  ·  Pounded yam  ·  and more",
        font=detail,
        fill=(255, 255, 255, 210),
    )

    return img.resize((1200, 630), Image.LANCZOS)


def main() -> None:
    outputs = {
        "favicon-96.png": draw_mark(96),
        "apple-touch-icon.png": draw_mark(180),
        "og-image.png": draw_og_card(),
    }
    for name, image in outputs.items():
        path = PUBLIC / name
        image.save(path, optimize=True)
        print(f"  {path.relative_to(ROOT)}  {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
