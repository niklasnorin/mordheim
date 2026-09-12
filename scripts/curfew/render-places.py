#!/usr/bin/env python3
"""
CURFEW — the place bands.

Cuts one wide band and one small mark from each place's painting and grades them into the same night, so the
Ledger and the Eve can say where the campaign is in a glance. Output is deterministic: the same sources always
give the same files.

    python3 scripts/curfew/render-places.py

Sources
  Mordheim   public/ruined-city.jpg              the site's own hero art
  Fussenbach scripts/curfew/sources/fussenbach.jpg  the village painting from the group's campaign PDF

Output
  public/curfew/places/<id>-band.jpg   1100x495, the banner under the Ledger's header (rendered as a shorter letterbox; see curfew.css)
  public/curfew/places/<id>-mark.jpg   96x96, the tile beside the night line
"""
from PIL import Image, ImageEnhance, ImageFilter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'curfew' / 'places'
SOOT = (0x0E, 0x0D, 0x0C)
BAND = (1100, 495)
MARK = (96, 96)

# Each place: its source, the band to cut (left, top, right, bottom), the mark to cut, and how far into the night to take it.
PLACES = {
    # The rooftops and the cathedral spire under the comet's sky. Already night; barely touched.
    'mordheim': {
        'source': ROOT / 'public' / 'ruined-city.jpg',
        'band': (0, 16, 1536, 708),
        'mark': (786, 36, 1006, 256),
        'grade': {'brightness': 0.95, 'saturation': 0.92, 'soot': 0.06, 'contrast': 1.04},
    },
    # The roofs, the watchtower and the church above the Fussen. Daylight in the painting, so the night is put on it here.
    'fussenbach': {
        'source': ROOT / 'scripts' / 'curfew' / 'sources' / 'fussenbach.jpg',
        'band': (0, 18, 462, 226),
        'mark': (296, 24, 400, 128),
        'grade': {'brightness': 0.74, 'saturation': 0.62, 'soot': 0.12, 'contrast': 1.08},
    },
}


def grade(img, brightness, saturation, soot, contrast):
    """Put both places in one night: take the light down, the colour back, and a wash of Soot over the whole."""
    img = ImageEnhance.Color(img).enhance(saturation)
    img = ImageEnhance.Brightness(img).enhance(brightness)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    return Image.blend(img, Image.new('RGB', img.size, SOOT), soot)


def cut(source, box, size, sharpen):
    img = Image.open(source).convert('RGB').crop(box)
    img = img.resize(size, Image.LANCZOS)
    # the village band is enlarged past its own pixels; a light unsharp mask puts the edges back
    if sharpen:
        img = img.filter(ImageFilter.UnsharpMask(radius=1.6, percent=95, threshold=3))
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for place, spec in PLACES.items():
        src = spec['source']
        for kind, box, size in (('band', spec['band'], BAND), ('mark', spec['mark'], MARK)):
            width = box[2] - box[0]
            img = cut(src, box, size, sharpen=width < size[0])
            img = grade(img, **spec['grade'])
            path = OUT / f'{place}-{kind}.jpg'
            img.save(path, quality=84, optimize=True, progressive=True)
            print(f'{path.relative_to(ROOT)}  {size[0]}x{size[1]}  {path.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
