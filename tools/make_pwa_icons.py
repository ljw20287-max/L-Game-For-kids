from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"


def make_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGB", (size, size), "#FFF6E5")
    draw = ImageDraw.Draw(img)
    s = size / 1024

    def xy(*vals):
        return tuple(round(v * s) for v in vals)

    pad = 64 if maskable else 36
    draw.rounded_rectangle(xy(pad, pad, 1024 - pad, 1024 - pad), radius=round(190 * s), fill="#5BB8F5")
    draw.ellipse(xy(690, 110, 900, 320), fill="#FFB020")
    draw.rounded_rectangle(xy(80, 660, 944, 930), radius=round(88 * s), fill="#7FC26A")

    # A friendly machine silhouette: part car, part construction toy.
    draw.rounded_rectangle(xy(210, 440, 800, 640), radius=round(74 * s), fill="#FFB020")
    draw.rounded_rectangle(xy(330, 310, 610, 475), radius=round(58 * s), fill="#FFFFFF")
    draw.polygon([xy(610, 330), xy(760, 450), xy(610, 450)], fill="#FFFFFF")
    draw.rounded_rectangle(xy(365, 340, 560, 455), radius=round(28 * s), fill="#D6ECFB")
    draw.rounded_rectangle(xy(635, 405, 730, 468), radius=round(24 * s), fill="#D6ECFB")
    draw.rounded_rectangle(xy(170, 575, 845, 690), radius=round(52 * s), fill="#E08E00")
    draw.rounded_rectangle(xy(745, 500, 870, 570), radius=round(30 * s), fill="#FFDB75")

    for cx in (330, 690):
        draw.ellipse(xy(cx - 96, 600, cx + 96, 792), fill="#2B3A55")
        draw.ellipse(xy(cx - 52, 644, cx + 52, 748), fill="#EEF4FF")
        draw.ellipse(xy(cx - 18, 678, cx + 18, 714), fill="#6B7A99")

    draw.arc(xy(310, 165, 714, 568), start=210, end=335, fill="#FFFFFF", width=max(12, round(32 * s)))
    draw.ellipse(xy(670, 210, 735, 275), fill="#FFFFFF")
    return img


def main():
    OUT.mkdir(exist_ok=True)
    make_icon(180).save(OUT / "apple-touch-icon.png")
    make_icon(192).save(OUT / "icon-192.png")
    make_icon(512).save(OUT / "icon-512.png")
    make_icon(512, maskable=True).save(OUT / "maskable-512.png")
    make_icon(32).save(OUT / "favicon.png")
    print("wrote PWA icons")


if __name__ == "__main__":
    main()
