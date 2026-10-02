# Bakes each card's foil into its painting: python3 tools/bake-foil.py [card-id ...]
#
# Rare, Epic and Legendary cards have a painted effect layer (art/fx/), Mythics a
# holo stack (art/holo/: foil, ripples, glints). The game used to draw these
# live over the painting, under a light that followed the phone's tilt, and
# iPhones ran out of memory doing it. Here the same layers are lit once, by a
# band of light frozen at a flattering angle, and flattened into one picture:
#   client/art/foil/<id>.webp    1024x1536, for cards shown large
#   client/art/foil-s/<id>.webp  360x540, for thumbnails, hands and the board
# and the ids are listed in manifest.json under "foil". To the phone a foil
# print is just another painting: no layers, masks, blends or filters at runtime.
#
# Needs Pillow and NumPy (pip install pillow numpy). Tool only, never shipped.
import json, math, os, sys
import numpy as np
from PIL import Image

ART = os.path.join(os.path.dirname(__file__), '..', 'client', 'art')
W, H = 1024, 1536

# The resting light: a band crossing from upper left to lower right, as if the
# card were tipped slightly toward a window.
LIGHT = dict(angle=115, x=0.40, y=0.36)

# A still picture reads as foil through three things, layered per rarity:
#   painted  the card's own effect layer (fx/, or the Mythic holo foil and
#            ripples). These are painted faint, for a moving light, so 'gain'
#            strengthens their coverage before they are screened on.
#   sheen    a glossy band that lifts what is already bright along the light.
#   sparkle  star-points, denser on bright areas: silver, violet, gold or rainbow.
#   holo     Mythic only: a rainbow over the highlights (never the shadows, so
#            faces stay clean), plus the artist's holo mask.
RECIPES = {
    'rare': dict(painted=[dict(layer='fx', gain=8.0, opacity=0.9, bright=1.6, sat=0.5)],
                 sheen=(0.16, (0.92, 0.97, 1.0)), sparkle=(170, 'silver'), holo=0),
    'epic': dict(painted=[dict(layer='fx', gain=3.0, opacity=0.55, bright=1.5, sat=1.35)],
                 sheen=(0.15, (0.85, 0.8, 1.0)), sparkle=(230, 'arcane'), holo=0),
    'legendary': dict(painted=[dict(layer='fx', gain=2.4, opacity=0.42, bright=1.15, sat=1.6)],
                      sheen=(0.16, (1.0, 0.78, 0.42)), sparkle=(380, 'gold'), holo=0),
    'mythic': dict(painted=[dict(layer='foil', gain=2.6, opacity=0.85, bright=1.4, sat=1.5),
                            dict(layer='ripples', gain=1.4, opacity=0.35, bright=1.2, sat=1.0)],
                   sheen=(0.2, (1.0, 0.95, 0.95)), sparkle=(460, 'rainbow'), holo=0.42),
}
SPARK_COLOURS = {
    'silver': [(0.88, 0.93, 1.0), (1.0, 1.0, 1.0)],
    'arcane': [(0.75, 0.6, 1.0), (0.55, 0.95, 1.0), (1.0, 1.0, 1.0)],
    'gold': [(1.0, 0.84, 0.45), (1.0, 0.94, 0.7), (1.0, 0.75, 0.3)],
}


def grid(w, h):
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    return xs, ys


def rainbow(w, h):
    """A diagonal spectrum, the colours of pressed holo foil."""
    xs, ys = grid(w, h)
    t = (xs / w * 0.8 + ys / h * 0.55) * 2.2 * math.pi
    rgb = np.stack([0.5 + 0.5 * np.cos(t), 0.5 + 0.5 * np.cos(t - 2.1), 0.5 + 0.5 * np.cos(t - 4.2)], -1)
    return np.clip(rgb * 1.15 + 0.1, 0, 1).astype(np.float32)


def band(w, h, core=0.09, fade=0.34):
    """0..1: how much of the frozen light falls here."""
    th = math.radians(LIGHT['angle'])
    dx, dy = math.sin(th), -math.cos(th)  # CSS angle: 0deg points up, 90deg right
    xs, ys = grid(w, h)
    t = np.abs(((xs - LIGHT['x'] * w) * dx + (ys - LIGHT['y'] * h) * dy) / math.hypot(w, h))
    k = np.clip((t - core) / fade, 0, 1)
    return 1 - k * k * (3 - 2 * k)


def smooth(x, a, b):
    k = np.clip((x - a) / (b - a), 0, 1)
    return k * k * (3 - 2 * k)


def luma(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def saturate(rgb, s):
    g = luma(rgb)[..., None]
    return g + (rgb - g) * s


def load(path, w, h):
    im = Image.open(path).convert('RGBA')
    if im.size != (w, h):
        im = im.resize((w, h), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    return a[..., :3], a[..., 3:]


def screen(out, lay):
    return 1 - (1 - out) * (1 - np.clip(lay, 0, 1))


def sparkle(out, lum, count, palette, rng, scale):
    """Star-points, placed mostly where the painting is already bright."""
    h, w = lum.shape
    # not on faces: they sit in the upper middle of almost every painting, and
    # points of light on skin read as dust, not foil
    weight = ((smooth(lum, 0.18, 0.85) ** 1.5 + 0.02) * face_guard(w, h)).ravel()
    idx = rng.choice(w * h, size=count, replace=False, p=weight / weight.sum())
    acc = np.zeros((h, w, 3), np.float32)
    for i in idx:
        y, x = divmod(int(i), w)
        r = rng.uniform(0.9, 2.2) * scale  # core radius, px
        ray = rng.uniform(2.5, 6.5) * scale if rng.random() < 0.35 else 0  # some get a 4-point flare
        R = int(math.ceil(max(r * 3, ray))) + 1
        y0, y1, x0, x1 = max(0, y - R), min(h, y + R + 1), max(0, x - R), min(w, x + R + 1)
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        dy, dx = yy - y, xx - x
        v = np.exp(-(dx * dx + dy * dy) / (2 * r * r))
        if ray:
            v = v + 0.55 * np.exp(-(dy * dy) / (0.35 * scale) ** 2 - np.abs(dx) / (ray * 0.45)) + 0.55 * np.exp(-(dx * dx) / (0.35 * scale) ** 2 - np.abs(dy) / (ray * 0.45))
        if palette == 'rainbow':
            t = (x / w * 0.8 + y / h * 0.55) * 2.2 * math.pi + rng.uniform(-0.6, 0.6)
            col = np.array([0.6 + 0.4 * math.cos(t), 0.6 + 0.4 * math.cos(t - 2.1), 0.6 + 0.4 * math.cos(t - 4.2)], np.float32)
        else:
            col = np.array(SPARK_COLOURS[palette][rng.integers(len(SPARK_COLOURS[palette]))], np.float32)
        acc[y0:y1, x0:x1] += v[..., None] * col * rng.uniform(0.45, 1.0)
    return screen(out, acc)


def face_guard(w, h, keep=0.92):
    """1 everywhere except the upper middle, where faces sit: the foil stays off skin."""
    xs, ys = grid(w, h)
    return 1 - keep * np.exp(-(((xs / w - 0.5) / 0.2) ** 2) - (((ys / h - 0.27) / 0.14) ** 2))


def bake_at(card_id, rarity, w, h):
    rec = RECIPES[rarity]
    rng = np.random.default_rng(sum(ord(c) * 31 ** i for i, c in enumerate(card_id)) % (2**32))  # the same sparkle every bake
    base, _ = load(os.path.join(ART, 'cards', card_id + '.webp'), w, h)
    out = base.copy()
    lit = band(w, h)
    guard = face_guard(w, h, 0.8)
    # the painted effect layers, lit mostly inside the band
    for r in rec['painted']:
        src = os.path.join(ART, 'fx', card_id + '.webp') if r['layer'] == 'fx' else os.path.join(ART, 'holo', f"{card_id}_{r['layer']}.webp")
        rgb, alpha = load(src, w, h)
        # keep the painted strokes, not the soft wash around them (that only dulls the painting)
        alpha = np.clip(alpha * r['gain'], 0, 1) ** 1.8
        rgb = np.clip(saturate(rgb * r['bright'], r['sat']), 0, 1)
        out = screen(out, rgb * alpha * ((0.45 + 0.55 * lit) * guard * r['opacity'])[..., None])
    lum = luma(base)
    # Mythic holo: a rainbow over the highlights and where the artist's mask allows
    if rec['holo']:
        _, mask = load(os.path.join(ART, 'holo', card_id + '_mask.webp'), w, h)
        where = np.maximum(smooth(lum, 0.42, 0.95), np.clip(mask[..., 0] * 1.6, 0, 1) * 0.7)
        out = screen(out, rainbow(w, h) * (where * (0.55 + 0.45 * lit) * guard * rec['holo'])[..., None])
    # the gloss along the light
    k, tint = rec['sheen']
    out = screen(out, np.array(tint, np.float32) * (lit * smooth(lum, 0.22, 0.9) * guard * k)[..., None])
    # sparkle: scaled to the picture, so the small copy keeps visible points
    count, palette = rec['sparkle']
    scale = w / 1024 if w >= 1024 else max(1.0, w / 1024 * 2.2)
    n = count if w >= 1024 else int(count * 0.45)
    out = sparkle(out, luma(out), n, palette, rng, scale)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')


def bake(card_id, rarity):
    for d, (w, h) in (('foil', (W, H)), ('foil-s', (360, 540))):
        os.makedirs(os.path.join(ART, d), exist_ok=True)
        bake_at(card_id, rarity, w, h).save(os.path.join(ART, d, card_id + '.webp'), 'WEBP', quality=86, method=6)


def main():
    mf = os.path.join(ART, 'manifest.json')
    manifest = json.load(open(mf))
    rarities = json.loads(os.popen("node -e \"import('./engine/cards/index.js').then(({LIST})=>console.log(JSON.stringify(Object.fromEntries(LIST.map((c)=>[c.id,c.rarity])))))\"").read())
    want = sys.argv[1:] or [i for i, r in rarities.items() if r in RECIPES]
    done = []
    for cid in want:
        r = rarities.get(cid)
        if r not in RECIPES or cid not in manifest.get('cards', []):
            continue
        if r == 'mythic' and cid not in manifest.get('holo', []):
            continue
        if r != 'mythic' and cid not in manifest.get('fx', []):
            continue
        bake(cid, r)
        done.append(cid)
        print('baked', cid, r)
    manifest['foil'] = sorted(set(manifest.get('foil', [])) | set(done))
    json.dump(manifest, open(mf, 'w'), indent=1)
    print(len(done), 'foil prints;', len(manifest['foil']), 'in the manifest')


if __name__ == '__main__':
    os.chdir(os.path.join(os.path.dirname(__file__), '..'))
    main()
