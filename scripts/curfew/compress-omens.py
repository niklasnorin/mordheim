#!/usr/bin/env python3
"""Quantise the rendered Omen PNGs to 8-bit palettes (about a third of the size, visually identical)
and build the deck contact sheet. Run after render-omens.mjs. Requires Pillow."""
import glob, os, sys
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
out = os.path.join(root, 'public', 'curfew', 'omens')
files = sorted(glob.glob(os.path.join(out, '*.png')))
total = 0
for f in files:
    im = Image.open(f).convert('RGB')
    q = im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(f, optimize=True)
    total += os.path.getsize(f)
    print(f'{os.path.basename(f):32s} {os.path.getsize(f)//1024:5d} KB')
print(f'{len(files)} files, {total/1024/1024:.1f} MB')

# contact sheet: 6 columns, back card last
th = 480; tw = round(th * 1050 / 1800); cols = 6
fronts = [f for f in files if not f.endswith('back.png')] + [f for f in files if f.endswith('back.png')]
rows = (len(fronts) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw + (cols + 1) * 12, rows * th + (rows + 1) * 12), (14, 13, 12))
for i, f in enumerate(fronts):
    im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
    sheet.paste(im, (12 + (i % cols) * (tw + 12), 12 + (i // cols) * (th + 12)))
sheet.save(os.path.join(out, 'deck-sheet.jpg'), quality=86, optimize=True)
print('deck-sheet.jpg', os.path.getsize(os.path.join(out, 'deck-sheet.jpg')) // 1024, 'KB')
