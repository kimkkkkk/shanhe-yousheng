"""Generate PWA PNG icons from the 山河有声 mark using Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
import math

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)
S = 4  # supersample


def canvas(size=512, rounded=True, bg=(24, 53, 42, 255)):
    im = Image.new("RGBA", (size * S, size * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, size * S - 1, size * S - 1], radius=116 * S, fill=bg)
    else:
        d.rectangle([0, 0, size * S - 1, size * S - 1], fill=bg)
    return im, d


def draw_mark(size=512, rounded=True, bg=(24, 53, 42, 255), cream=(242, 236, 221, 255)):
    im, d = canvas(size, rounded, bg)
    u = size * S / 512

    def p(v):
        return v * u

    d.ellipse([p(54), p(54), p(458), p(458)], outline=(240, 223, 192, 140), width=max(1, int(p(7))))
    # mountain
    d.polygon([(p(92), p(340)), (p(204), p(160)), (p(265), p(251)), (p(307), p(192)), (p(420), p(340))], fill=cream)
    # snow / light facet
    d.polygon([(p(204), p(160)), (p(236), p(208)), (p(218), p(214)), (p(204), p(232)), (p(178), p(205))], fill=(255, 250, 238, 255))
    # sun
    d.ellipse([p(316), p(106), p(396), p(186)], fill=(198, 111, 74, 255))
    # wave: a smooth filled ribbon reads cleaner at small icon sizes
    top = []
    for i in range(0, 121):
        x = 68 + i * (376 / 120)
        y = 382 + 13 * math.sin(i / 120 * math.pi * 2.1 + 0.2)
        top.append((p(x), p(y)))
    bottom = [(x, y + p(13)) for x, y in reversed(top)]
    d.polygon(top + bottom, fill=(242, 236, 221, 218))
    # small gold arc
    d.arc([p(372), p(360), p(428), p(416)], start=0, end=90, fill=(217, 183, 125, 205), width=max(1, int(p(8))))
    return im.resize((size, size), Image.LANCZOS)


def full_bleed(size=512):
    im, d = canvas(size, rounded=False, bg=(24, 53, 42, 255))
    u = size * S / 512

    def p(v):
        return v * u

    # keep all content inside the maskable safe zone (center 80%)
    d.ellipse([p(74), p(74), p(438), p(438)], outline=(240, 223, 192, 130), width=max(1, int(p(6))))
    d.polygon([(p(112), p(326)), (p(210), p(180)), (p(263), p(258)), (p(303), p(208)), (p(400), p(326))], fill=(242, 236, 221, 255))
    d.polygon([(p(210), p(180)), (p(238), p(222)), (p(222), p(226)), (p(210), p(242)), (p(188), p(220))], fill=(255, 250, 238, 255))
    d.ellipse([p(330), p(132), p(402), p(204)], fill=(198, 111, 74, 255))
    top = []
    for i in range(0, 121):
        x = 96 + i * (320 / 120)
        y = 360 + 11 * math.sin(i / 120 * math.pi * 2.1 + 0.2)
        top.append((p(x), p(y)))
    bottom = [(x, y + p(12)) for x, y in reversed(top)]
    d.polygon(top + bottom, fill=(242, 236, 221, 215))
    return im.resize((size, size), Image.LANCZOS)


mark = draw_mark(512)
mark.save(OUT / "icon-512.png", optimize=True)
mark.resize((192, 192), Image.LANCZOS).save(OUT / "icon-192.png", optimize=True)
mark.resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png", optimize=True)
full_bleed(512).save(OUT / "icon-maskable-512.png", optimize=True)
print("icons written:", sorted(p.name for p in OUT.glob("*.png")))
