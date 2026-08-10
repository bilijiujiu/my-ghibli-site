#!/usr/bin/env python3
"""
用 Python 复刻 WindowScene 的合成,导出一天里几个关键时刻的预览。
调色表必须和 WindowScene.ts 里的 DAY 一模一样,改一边要改另一边。
"""
import math
import numpy as np
from PIL import Image, ImageDraw

W, H = 2560, 1240
HORIZON, LAND_H = 0.54, 0.46
RX, RY = W * 0.46, H * 0.42
CX, CY = W / 2, H * HORIZON

DAY = [
    (0.00, 0x2a3c74, 0xf6b489, 0xa9a2bd, 0.36, "日出"),
    (0.10, 0x5c93cf, 0xfad8a8, 0xd9d2c8, 0.05, "清晨"),
    (0.25, 0x4a90d9, 0xc6e2f4, 0xecf2ff, 0.00, "正午"),
    (0.42, 0x5896d6, 0xecd9ae, 0xfff0d6, 0.00, "午后"),
    (0.52, 0x3c5b93, 0xff9a50, 0xffcfa6, 0.06, "黄昏"),
    (0.60, 0x2b2c64, 0xd0603a, 0xc98d70, 0.38, "日落"),
    (0.68, 0x1a1a44, 0x54325e, 0x6a5a78, 0.78, "暮色"),
    (0.80, 0x080818, 0x181838, 0x323e68, 1.00, "夜"),
    (0.93, 0x141c40, 0x2c2c58, 0x3a4478, 0.80, "将明"),
    (1.00, 0x2a3c74, 0xf6b489, 0xa9a2bd, 0.36, "日出"),
]


def rgb(c):
    return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255], float)


def key(t):
    x = t % 1.0
    a = b = DAY[0]
    for i in range(len(DAY) - 1):
        if DAY[i][0] <= x <= DAY[i + 1][0]:
            a, b = DAY[i], DAY[i + 1]; break
    f = 0 if b[0] == a[0] else (x - a[0]) / (b[0] - a[0])
    lerp = lambda i: rgb(a[i]) + (rgb(b[i]) - rgb(a[i])) * f
    star = a[4] + (b[4] - a[4]) * f
    tint_mix = min(max((star - 0.3) / 0.7, 0), 1)
    return dict(top=lerp(1), bot=lerp(2), land=lerp(3), star=star,
                tintC=rgb(0xff9a50) + (rgb(0x0a0a28) - rgb(0xff9a50)) * tint_mix,
                tintA=0.20 * min(star * 1.4, 1))


SEASON_KEYS = ["spring", "summer", "autumn", "winter"]
LANDS = {}
for _k in SEASON_KEYS:
    _im = Image.open(f"public/window_land_{_k}.webp").convert("RGBA")
    _lh = int(H * LAND_H)
    LANDS[_k] = _im.resize((int(_im.width * _lh / _im.height), _lh), Image.LANCZOS)
lh = int(H * LAND_H)
lw = LANDS["spring"].width


def frame(t, season="autumn"):
    k = key(t)
    # 天空
    grad = np.linspace(0, 1, H)[:, None, None]
    sky = k["top"][None, None, :] * (1 - grad) + k["bot"][None, None, :] * grad
    im = Image.fromarray(np.tile(sky, (1, W, 1)).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(im)

    # 星星(固定种子,只为看密度)
    rs = np.random.RandomState(7)
    for _ in range(90):
        sx, sy = rs.randint(0, W), rs.randint(0, int(H * HORIZON))
        a = min(max((k["star"] - rs.rand() * 0.85) * 4, 0), 1)
        if a > 0.02:
            r = rs.rand() * 3 + 2
            d.ellipse([sx-r, sy-r, sx+r, sy+r], fill=(255, 255, 255, int(a*255)))

    # 日月
    for phase, is_sun in ((t, True), (t + 0.5, False)):
        a = 2 * math.pi * (phase % 1)
        elev = math.sin(a)
        x, y = CX + math.cos(a) * RX, CY - elev * RY
        al = min(max((elev + 0.20) * 5, 0), 1)
        if al <= 0.02:
            continue
        if is_sun:
            low = 1 - min(max(elev / 0.4, 0), 1)
            r = 80 * (1 + low * 0.5)
            col = rgb(0xffe08a) + (rgb(0xff6a3a) - rgb(0xffe08a)) * low
            d.ellipse([x-r*1.6, y-r*1.6, x+r*1.6, y+r*1.6],
                      fill=tuple(int(c) for c in col) + (int(al*64),))
            d.ellipse([x-r, y-r, x+r, y+r], fill=tuple(int(c) for c in col) + (int(al*255),))
        else:
            r = 60
            d.ellipse([x-r, y-r, x+r, y+r], fill=(240, 240, 226, int(al*255)))

    # 地景(multiply 染色)
    la = np.array(LANDS[season]).astype(float)
    la[:, :, :3] *= k["land"] / 255.0
    tile = Image.fromarray(np.clip(la, 0, 255).astype(np.uint8))
    x = 0
    i = 0
    while x < W:
        im.alpha_composite(tile.transpose(Image.FLIP_LEFT_RIGHT) if i % 2 else tile, (x, H - lh))
        x += lw; i += 1

    # 萤火虫
    rf = np.random.RandomState(11)
    fa = min(max((k["star"] - 0.45) * 2.6, 0), 1)
    for _ in range(34):
        fx = rf.randint(0, W); fy = rf.randint(int(H*(HORIZON+0.02)), int(H*0.94))
        b = rf.rand()
        if fa * b > 0.05:
            r = rf.rand()*4+3
            d.ellipse([fx-r, fy-r, fx+r, fy+r], fill=(255, 232, 154, int(fa*b*255)))

    # 全屏色调层
    ov = Image.new("RGBA", (W, H), tuple(int(c) for c in k["tintC"]) + (int(k["tintA"]*255),))
    im.alpha_composite(ov)

    # 窗框
    d2 = ImageDraw.Draw(im)
    m = 92
    for box in ([0, 0, W, m], [0, H-m, W, H], [0, 0, m, H], [W-m, 0, W, H]):
        d2.rectangle(box, fill=(58, 42, 26, 255))
    dark = int(k["star"] * 0.5 * 255)
    for box in ([0, 0, W, m], [0, H-m, W, H], [0, 0, m, H], [W-m, 0, W, H]):
        d2.rectangle(box, fill=(0, 0, 32, dark))
    return im


def add_tree(im, season, t):
    """把 tools/tree.py 长出来的那棵树合成进去,和 TS 版同一套递归、同一个 LCG。"""
    import tree as T
    br, lv = T.grow()
    sc = (H * 0.42) / 370
    ox, oy = int(W * 0.30), int(H * 0.88)
    d = ImageDraw.Draw(im, "RGBA")
    idx = SEASON_KEYS.index(season)
    bark = T.BARK[season]
    snow = 1.0 if season == "winter" else 0.0
    for (x1, y1, x2, y2, w, dep) in br:
        d.line([ox+x1*sc, oy+y1*sc, ox+x2*sc, oy+y2*sc],
               fill=((bark >> 16) & 255, (bark >> 8) & 255, bark & 255, 255),
               width=max(1, int(w*sc)))
        if snow and dep <= 5:
            off = w*sc*0.42
            d.line([ox+x1*sc, oy+y1*sc-off, ox+x2*sc, oy+y2*sc-off],
                   fill=(230, 238, 247, 255), width=max(1, int(w*sc*0.42)))
    cols, dens, size = T.LEAF[season]
    rng = T.LCG(99)
    for (x, y, s_, j) in lv:
        if rng.next() > dens:
            continue
        c = cols[int(rng.next()*len(cols))]
        r = s_*size*4.2*sc
        cx, cy = ox+x*sc+math.cos(j)*4*sc, oy+y*sc+math.sin(j)*4*sc
        d.ellipse([cx-r, cy-r*0.78, cx+r, cy+r*0.78],
                  fill=((c >> 16) & 255, (c >> 8) & 255, c & 255, 255))
    return im


if __name__ == "__main__":
    import sys
    if "--day" in sys.argv:
        times = [0.0, 0.12, 0.25, 0.44, 0.52, 0.58, 0.66, 0.80]
        cols, sc = 4, 0.24
        tw, th = int(W*sc), int(H*sc)
        sheet = Image.new("RGB", (tw*cols, th*((len(times)+cols-1)//cols)), (18, 18, 18))
        for i, t in enumerate(times):
            f = frame(t).convert("RGB").resize((tw, th), Image.LANCZOS)
            ImageDraw.Draw(f).text((10, 8), f"t={t:.2f}", fill=(255, 255, 255))
            sheet.paste(f, ((i % cols)*tw, (i//cols)*th))
        sheet.save("/tmp/window_day.png")
    else:
        rows = [(0.25, "正午"), (0.55, "黄昏")]
        cols, sc = 4, 0.24
        tw, th = int(W*sc), int(H*sc)
        sheet = Image.new("RGB", (tw*cols, th*len(rows)), (18, 18, 18))
        for r, (t, _) in enumerate(rows):
            for c, season in enumerate(SEASON_KEYS):
                f = frame(t, season)
                f = add_tree(f, season, t).convert("RGB").resize((tw, th), Image.LANCZOS)
                ImageDraw.Draw(f).text((10, 8), f"{season}  t={t}", fill=(255, 255, 255))
                sheet.paste(f, (c*tw, r*th))
        sheet.save("/tmp/window_season.png")
    print("ok")
