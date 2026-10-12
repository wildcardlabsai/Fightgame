"""
Extract individual portraits from a supplied contact-sheet image (offline; no generation, no inpainting, no resampling beyond a plain crop).

  python3 -I scripts/assets/portrait_ingest.py extract asset-pipeline/portrait-source/pilot-sheet-1.png

Reads  <sheet>.grid.json  {"cols":[[x0,x1],...], "rows":[[y0,y1],...], "inset":2}   (the tile areas BETWEEN the divider lines, inclusive)
Writes tiles/<sheet>_rRcC.png  (native-resolution tile, divider-free) and crops/<sheet>_rRcC.png (exact 4:5 window, still native resolution)
       <sheet>.tiles.json       per-tile box, crop box and automatic flags (information for the reviewer; nothing is approved here)
`detect` proposes a grid from the divider lines so a new sheet can be set up (check it against the contact sheet before trusting it).
"""
import hashlib, json, os, sys
import numpy as np
from PIL import Image

def bands(mask):
    out, s = [], None
    for i, m in enumerate(mask):
        if m and s is None: s = i
        if not m and s is not None: out.append((s, i - 1)); s = None
    if s is not None: out.append((s, len(mask) - 1))
    return out

def detect(path, ncols, nrows):
    """Proposal only: dividers are thin low-variance bands; the result must be checked by eye."""
    im = np.array(Image.open(path).convert('L')).astype(float)
    cs = im.std(axis=0)
    cb = [b for b in bands(cs < cs.mean() * 0.62) if b[1] - b[0] <= 9]
    return {'note': 'proposal', 'col_dividers': cb, 'size': list(im.shape[::-1])}

def head_top(tile):
    g = np.abs(np.diff(tile[:, int(tile.shape[1] * .3):int(tile.shape[1] * .7)], axis=1)).mean(axis=1)
    g = np.convolve(g, np.ones(3) / 3, 'same')
    return next((i for i in range(2, tile.shape[0]) if g[i] > 2.0), 0)

def ahash(img):
    a = np.array(img.convert('L').resize((16, 20), Image.BILINEAR)).astype(float)
    return (a > a.mean()).flatten()

def extract(sheet):
    base = os.path.splitext(sheet)[0]
    cfg = json.load(open(base + '.grid.json'))
    d = os.path.dirname(sheet); name = os.path.basename(base)
    os.makedirs(os.path.join(d, 'tiles'), exist_ok=True); os.makedirs(os.path.join(d, 'crops'), exist_ok=True)
    im = Image.open(sheet).convert('RGB'); inset = cfg.get('inset', 2)
    out, hashes = [], []
    for r, (y0, y1) in enumerate(cfg['rows']):
        for c, (x0, x1) in enumerate(cfg['cols']):
            box = (x0 + inset, y0 + inset, x1 + 1 - inset, y1 + 1 - inset)
            tile = im.crop(box); W, H = tile.size
            tid = f'{name}_r{r}c{c}'
            tile.save(os.path.join(d, 'tiles', tid + '.png'))
            # exact 4:5 window at full tile width (a plain crop: no scaling, no padding); vertical position follows the top of the head
            ch = int(round(W * 1.25)); ch = min(ch, H)
            top = head_top(np.array(tile.convert('L')).astype(float))
            y = max(0, min(H - ch, top - 12))
            crop = tile.crop((0, y, W, y + ch)); crop.save(os.path.join(d, 'crops', tid + '.png'))
            arr = np.array(crop.convert('L')).astype(float)
            flags = []
            if top < 6: flags.append('head_touches_top')
            # a bright/grey strip along an outer edge would be divider bleed: compare the outer 2 px to the next 6 px
            for nm, e, n in (('left', arr[:, :2], arr[:, 2:8]), ('right', arr[:, -2:], arr[:, -8:-2])):
                if abs(e.mean() - n.mean()) > 18: flags.append(f'edge_bleed_{nm}')
            hs = ahash(crop); hashes.append(hs)
            out.append({'id': tid, 'row': r, 'col': c, 'tile_box': list(box), 'tile_size': [W, H], 'head_top': int(top), 'crop_box': [0, int(y), W, int(y + ch)], 'crop_size': [W, ch], 'flags': flags})
    for i, a in enumerate(hashes):
        for j in range(i):
            if (a != hashes[j]).sum() < 36: out[i]['flags'].append(f'near_duplicate_of_{out[j]["id"]}')
    raw = open(sheet, 'rb').read()
    json.dump({'file': os.path.basename(sheet), 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'size': list(im.size), 'note': 'the original supplied image, kept unchanged'}, open(base + '.source.json', 'w'), indent=1)
    json.dump({'sheet': os.path.basename(sheet), 'tiles': out}, open(base + '.tiles.json', 'w'), indent=1)
    print(f'{len(out)} tiles extracted; flags: ' + json.dumps({t["id"]: t["flags"] for t in out if t["flags"]}))

def single(path, out_crop, y_frac=None):
    """One individually supplied image -> an exact 4:5 window at NATIVE resolution (a crop only: nothing is scaled up or padded).
    Taller than 4:5 (e.g. 2:3): full width, the window follows the top of the head (or the sidecar's y fraction). Wider than 4:5: full height,
    horizontally centred (flagged, because the sides are lost)."""
    im = Image.open(path).convert('RGB'); W, H = im.size; flags = []
    if W / H > 0.8 + 1e-6:
        cw = int(round(H * 0.8)); x = (W - cw) // 2; box = (x, 0, x + cw, H)
        flags.append('cropped_sides' if W / H > 0.95 else 'minor_side_crop')
    else:
        ch = int(round(W * 1.25)); ch = min(ch, H)
        if y_frac is not None: y = int(round(y_frac * H))
        else:
            scale = 200.0 / W; small = np.array(im.convert('L').resize((200, max(1, int(H * scale))), Image.BILINEAR)).astype(float)
            y = int(round(max(0, head_top(small) - 8) / scale))
        y = max(0, min(H - ch, y)); box = (0, y, W, y + ch)
    crop = im.crop(box); crop.save(out_crop)
    cw_, ch_ = crop.size
    res = 'high' if cw_ >= 960 else 'medium' if cw_ >= 640 else 'low'
    print(json.dumps({'size': [W, H], 'crop_box': list(box), 'crop_size': [cw_, ch_], 'resolution': res, 'flags': flags}))

if __name__ == '__main__':
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == 'detect': print(json.dumps(detect(path, 8, 3)))
    elif cmd == 'extract': extract(path)
    elif cmd == 'single': single(path, sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else None)
    else: sys.exit('usage: portrait_ingest.py extract|detect <sheet.png> | single <image> <out.png> [y_fraction]')
