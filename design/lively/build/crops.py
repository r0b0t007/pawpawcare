"""Pre-crop the Unsplash originals around each pet's face so frames that use
fillProportionally show the right part of the photo."""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'photos')
OUT = os.path.join(ROOT, 'crops')
os.makedirs(OUT, exist_ok=True)

# name: (source, aspect w/h, focal x, focal y, zoom)
CROPS = {
    'biscuit-face': ('biscuit', 1, .50, .27, 1.6),
    'biscuit-hero': ('biscuit', 390 / 420, .50, .32, 1.15),
    'biscuit-card': ('biscuit', 167 / 140, .50, .28, 1.7),
    'miso-face': ('miso', 1, .40, .36, 1.6),
    'miso-card': ('miso', 167 / 140, .42, .45, 1.2),
    'luna-face': ('luna', 1, .50, .38, 1.7),
    'luna-card': ('luna', 167 / 140, .50, .45, 1.4),
    'pepper-face': ('pepper', 1, .50, .42, 1.2),
    'pepper-card': ('pepper', 167 / 140, .50, .45, 1.05),
    'welcome-hero': ('welcome', 390 / 520, .50, .55, 1.0),
    'species-dog': ('species-dog', 342 / 210, .50, .42, 1.0),
    'species-cat': ('species-cat', 342 / 210, .50, .40, 1.0),
    'empty-kitten': ('empty-kitten', 1, .50, .50, 1.1),
    'success-hug': ('success-hug', 390 / 430, .50, .50, 1.0),
    'community-post': ('community-woman', 342 / 230, .55, .45, 1.0),
    'lost-dog': ('lost-dog', 342 / 170, .50, .47, 1.0),
    'cover-pals': ('community-pals', 1, .45, .50, 1.0),
}


def crop(src, aspect, fx, fy, zoom):
    im = Image.open(os.path.join(ROOT, src + '.jpg')).convert('RGB')
    W, H = im.size
    w = min(W, H * aspect) / zoom
    h = w / aspect
    cx = min(max(fx * W, w / 2), W - w / 2)
    cy = min(max(fy * H, h / 2), H - h / 2)
    box = tuple(int(v) for v in (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
    out = im.crop(box)
    if out.width > 1200:
        out = out.resize((1200, int(1200 / aspect)), Image.LANCZOS)
    return out


if __name__ == '__main__':
    for name, spec in CROPS.items():
        crop(*spec).save(os.path.join(OUT, name + '.jpg'), quality=86)
        print(name)
