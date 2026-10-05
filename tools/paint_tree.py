#!/usr/bin/env python3
"""
离线"画"一棵树,四季各一张:public/tree_{spring,summer,autumn,winter}.png

原来窗外的树是游戏里实时用线段 + 椭圆拼的,看着像模型。这里换成插画师画树的思路:
  - 树干树枝:弯曲、渐细的枝条,先描一圈墨线,再上固有色,受光侧提亮、背光侧压暗;
  - 树冠:不是一片片叶子,而是十几团"叶团",每团由若干个鼓包组成,
    每个鼓包按球面算明暗(光从左上来),再压成 4 档色阶 —— 和 room.webp 一样的赛璐璐分色;
  - 每团叶子外轮廓描墨线,鼓包下沿再补一道短墨线(漫画式的体积线);
  - 最后撒一层笔触(小椭圆色点),打破色块的平;边缘加一圈碎叶,轮廓不至于像云。
四季用同一个随机种子,骨架和叶团位置完全一样,只换颜色、密度(春秋稀一点),冬天落光叶、枝上积雪。
游戏里只负责显示、摇曳和换季淡入淡出(src/systems/PaintedTree.ts)。

运行:python tools/paint_tree.py(在项目根目录)
"""
import math
import numpy as np
import cv2
from PIL import Image
from scipy.cluster.vq import kmeans2

S = 2                       # 先画 2 倍,最后缩小,边缘更干净
CW, CH = 900 * S, 900 * S
BASE = (CW // 2, CH - 20 * S)
LIGHT = np.array([-0.55, -0.75, 0.55]); LIGHT /= np.linalg.norm(LIGHT)
INK = (26, 22, 20)

SEASONS = {
    #          暗部            中间调           亮部             高光            密度  点缀色
    "spring": ((58, 92, 62), (104, 150, 74), (160, 198, 98), (214, 232, 146), 0.78, [(242, 186, 208), (250, 222, 232)]),
    "summer": ((30, 60, 46), (56, 102, 58), (98, 146, 68), (160, 192, 96), 1.0, []),
    "autumn": ((104, 46, 32), (176, 92, 40), (222, 148, 58), (244, 204, 112), 0.8, [(196, 70, 40)]),
    "winter": None,
}
BARK = ((52, 38, 32), (86, 64, 50), (128, 100, 78))      # 暗 / 中 / 亮


def grow(rng):
    segs = []      # (x1, y1, x2, y2, w1, w2, depth)
    tips = []

    def rec(x, y, ang, length, w, d):
        n = 4
        cur_a = ang
        for i in range(n):
            cur_a += rng.uniform(-0.16, 0.16)
            l = length / n
            x2, y2 = x + math.sin(cur_a) * l, y - math.cos(cur_a) * l
            w2 = w * (1 - 0.32 / n * (i + 1))
            segs.append((x, y, x2, y2, w, w2, d))
            x, y, w = x2, y2, w2
            # 树干中段偶尔长一根侧枝
            if d <= 1 and i == 2 and rng.random() < 0.7:
                side = rng.choice([-1, 1])
                rec(x, y, cur_a + side * rng.uniform(0.7, 1.0), length * 0.55, w * 0.55, d + 2)
        if d >= 4 or length < 40 * S:
            tips.append((x, y, d))
            return
        k = 2 if rng.random() < 0.7 else 3
        for i in range(k):
            spread = rng.uniform(0.38, 0.70) * (1 if i % 2 == 0 else -1)
            if k == 3 and i == 2:
                spread = rng.uniform(-0.15, 0.15)
            rec(x, y, cur_a + spread, length * rng.uniform(0.62, 0.76), w * 0.72, d + 1)

    rec(BASE[0], BASE[1], rng.uniform(-0.05, 0.05), 210 * S, 58 * S, 0)
    return segs, tips


def draw_bark(img, segs, snow=False):
    """墨线 → 固有色 → 受光/背光 → 积雪"""
    def poly(x1, y1, x2, y2, w1, w2, grow_px=0, shift=0.0, scale=1.0):
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy) or 1
        nx, ny = -dy / L, dx / L
        a = w1 / 2 * scale + grow_px; b = w2 / 2 * scale + grow_px
        ox, oy = nx * shift, ny * shift
        pts = np.array([[x1 + nx * a + ox, y1 + ny * a + oy], [x2 + nx * b + ox, y2 + ny * b + oy],
                        [x2 - nx * b + ox, y2 - ny * b + oy], [x1 - nx * a + ox, y1 - ny * a + oy]], np.int32)
        return pts, (int(x1 + ox), int(y1 + oy), max(1, int(a))), (int(x2 + ox), int(y2 + oy), max(1, int(b)))

    def fill(col, **kw):
        for (x1, y1, x2, y2, w1, w2, d) in segs:
            p, c1, c2 = poly(x1, y1, x2, y2, w1, w2, **kw)
            cv2.fillPoly(img, [p], col + (255,), cv2.LINE_AA)
            cv2.circle(img, c1[:2], c1[2], col + (255,), -1, cv2.LINE_AA)
            cv2.circle(img, c2[:2], c2[2], col + (255,), -1, cv2.LINE_AA)

    fill(INK, grow_px=3.2 * S)
    fill(BARK[1])
    # 背光侧(右)压暗,受光侧(左)提亮:窄条往两边偏
    for (x1, y1, x2, y2, w1, w2, d) in segs:
        for shift, sc, col in ((0.26, 0.42, BARK[0]), (-0.24, 0.30, BARK[2])):
            # 枝条朝上长时,法线 (−dy, dx)/L 指向屏幕右:正偏移 = 右侧(背光),负偏移 = 左侧(受光)
            sgn = 1 if y2 < y1 else -1
            p, c1, c2 = poly(x1, y1, x2, y2, w1, w2, shift=shift * w1 * sgn, scale=sc)
            cv2.fillPoly(img, [p], col + (255,), cv2.LINE_AA)
    # 树皮纹:树干上几道竖向的墨线
    rng = np.random.RandomState(5)
    for (x1, y1, x2, y2, w1, w2, d) in segs:
        if d > 1:
            continue
        for _ in range(2):
            f = rng.uniform(-0.3, 0.3)
            cv2.line(img, (int(x1 + f * w1), int(y1)), (int(x2 + f * w2), int(y2)),
                     INK + (150,), max(1, int(1.2 * S)), cv2.LINE_AA)
    if snow:
        for (x1, y1, x2, y2, w1, w2, d) in segs:
            if abs(x2 - x1) < abs(y2 - y1) * 0.6 or rng.random() < 0.35:
                continue              # 太竖的枝挂不住雪,而且不是每根都积
            off = w1 * 0.38
            cv2.line(img, (int(x1), int(y1 - off)), (int(x2), int(y2 - w2 * 0.38)),
                     (236, 242, 250, 255), max(2, int(w2 * 0.38)), cv2.LINE_AA)


def foliage(img, tips, pal, dens, accents, rng, layer):
    """叶团。layer=0 画树枝后面那层(偏暗),1 画前面那层。"""
    dark, mid, light, hi = (np.array(c, np.float32) for c in pal[:4])
    pts = np.array([[t[0], t[1]] for t in tips], np.float32)
    np.random.seed(11)
    cents, lab = kmeans2(pts, 16, minit="++", seed=11)

    H, W = img.shape[:2]
    tone = np.full((H, W), -1.0, np.float32)     # 每个像素的明度(−1 = 没叶子)
    lines = np.zeros((H, W), np.uint8)           # 体积线
    order = np.argsort(cents[:, 1])              # 上面的先画,下面的盖在上面
    crng = np.random.RandomState(23)
    for ci in order:
        members = pts[lab == ci]
        if len(members) == 0:
            continue
        keep = crng.random() < dens
        back = crng.random() < 0.35              # 约三分之一的叶团在树枝后面
        if not keep or (layer == 0) != back:
            continue
        cx, cy = members.mean(0)
        spread = max(members.std(0).max(), 30 * S)
        R = (spread * 1.0 + 58 * S) * crng.uniform(0.8, 1.15)
        # 鼓包:中心一个大的 + 上沿一圈小的 + 每个枝梢一个
        puffs = [(cx, cy, R * 0.82)]
        for a in np.linspace(math.pi * 1.05, math.pi * 1.95, 5):
            puffs.append((cx + math.cos(a) * R * 0.62, cy + math.sin(a) * R * 0.55, R * crng.uniform(0.38, 0.52)))
        for (mx, my) in members[:: max(1, len(members) // 6)]:
            puffs.append((mx + crng.uniform(-10, 10) * S, my + crng.uniform(-10, 10) * S, R * crng.uniform(0.3, 0.45)))
        # 从后往前(上面的鼓包先画),每个鼓包按球面算光
        puffs.sort(key=lambda p: p[1])
        for (px, py, pr) in puffs:
            x0, x1 = int(max(px - pr, 0)), int(min(px + pr + 1, W))
            y0, y1 = int(max(py - pr, 0)), int(min(py + pr + 1, H))
            if x1 <= x0 or y1 <= y0:
                continue
            yy, xx = np.mgrid[y0:y1, x0:x1]
            vx, vy = (xx - px) / pr, (yy - py) / (pr * 0.88)
            rr = vx * vx + vy * vy
            m = rr <= 1
            vz = np.sqrt(np.clip(1 - rr, 0, 1))
            lum = vx * LIGHT[0] + vy * LIGHT[1] + vz * LIGHT[2]
            lum = lum * 0.5 + 0.5 - (0.18 if layer == 0 else 0)   # 后面那层整体暗一档
            sub = tone[y0:y1, x0:x1]
            sub[m] = lum[m]
            # 鼓包下半圈的体积线
            # 只给一部分鼓包画,只画下沿一小段弧 —— 画满了就成了鱼鳞
            if False:   # 体积线试过,画出来像一排笑脸,不要了
                edge = m & (rr > 0.88) & (vy > 0.35) & (np.abs(vx) < 0.55)
                lines[y0:y1, x0:x1][edge] = 255

    has = tone >= 0
    if not has.any():
        return
    # 轮廓上撒碎叶:沿边缘随机点小圆,轮廓才"毛"
    cnts, _ = cv2.findContours(has.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    for c in cnts:
        for p in c[:: 7 * S, 0]:
            if rng.random() < 0.55:
                r = int(rng.uniform(5, 11) * S)
                yy0, xx0 = p[1], p[0]
                y0, y1 = max(yy0 - r, 0), min(yy0 + r + 1, H)
                x0, x1 = max(xx0 - r, 0), min(xx0 + r + 1, W)
                sub = tone[y0:y1, x0:x1]
                yy, xx = np.mgrid[y0:y1, x0:x1]
                mm = (xx - xx0) ** 2 + (yy - yy0) ** 2 <= r * r
                fill_v = 0.25 if yy0 > cy else 0.6
                sub[mm & (sub < 0)] = fill_v
    has = tone >= 0

    # 4 档色阶(赛璐璐),档与档之间留 1px 的软边
    t = cv2.GaussianBlur(tone, (0, 0), 0.8 * S)
    steps = np.array([0.0, 0.38, 0.6, 0.8])
    cols = [dark, mid, light, hi]
    out = np.zeros((H, W, 3), np.float32)
    for i, c in enumerate(cols):
        w = np.clip((t - steps[i]) * 25, 0, 1) if i > 0 else np.ones_like(t)
        out = out * (1 - w[..., None]) + c * w[..., None]

    # 笔触:随机小椭圆,颜色取相邻档
    ys, xs = np.where(has)
    for _ in range(int(len(ys) / (180 * S * S))):
        i = rng.integers(len(ys))
        y, x = ys[i], xs[i]
        tv = tone[y, x]
        c = (light if tv < 0.5 else (hi if tv > 0.7 else dark)) * rng.uniform(0.95, 1.05)
        ax = int(rng.uniform(3, 8) * S); ay = int(ax * rng.uniform(0.4, 0.7))
        cv2.ellipse(out, (int(x), int(y)), (ax, ay), rng.uniform(-40, 10), 0, 360, c.tolist(), -1, cv2.LINE_AA)
    # 点缀:春天的花、秋天的红叶
    for _ in range(int(len(ys) / (1600 * S * S)) if accents else 0):
        i = rng.integers(len(ys))
        y, x = ys[i], xs[i]
        if tone[y, x] < 0.35:
            continue
        c = np.array(accents[rng.integers(len(accents))], np.float32)
        r = int(rng.uniform(2, 3.5) * S)
        cv2.circle(out, (int(x), int(y)), r, c.tolist(), -1, cv2.LINE_AA)

    # 墨线:外轮廓 + 体积线
    m8 = has.astype(np.uint8)
    outline = cv2.dilate(m8, np.ones((2 * S + 3, 2 * S + 3), np.uint8)) - m8
    vol = cv2.dilate(lines, np.ones((S + 1, S + 1), np.uint8)) & (m8 * 255)
    vol = (vol > 0)

    alpha = np.maximum(has, outline > 0).astype(np.float32)
    rgb = out
    rgb[outline > 0] = INK
    rgb[vol] = rgb[vol] * 0.55 + np.array(INK, np.float32) * 0.45

    a = alpha[..., None]
    base = img[..., :3].astype(np.float32); ba = img[..., 3:4].astype(np.float32) / 255
    img[..., :3] = np.clip(rgb * a + base * (1 - a), 0, 255).astype(np.uint8)   # 不 clip 的话 256 会绕回 0
    img[..., 3:4] = np.clip((a + ba * (1 - a)) * 255, 0, 255).astype(np.uint8)


def paint(season):
    rng = np.random.default_rng(7)
    srng = __import__("random").Random(42)
    segs, tips = grow(srng)
    img = np.zeros((CH, CW, 4), np.uint8)
    spec = SEASONS[season]
    if spec is None:
        draw_bark(img, segs, snow=True)
    else:
        foliage(img, tips, spec, spec[4], spec[5], rng, layer=0)
        draw_bark(img, segs)
        foliage(img, tips, spec, spec[4], spec[5], rng, layer=1)
    out = Image.fromarray(img, "RGBA").resize((CW // S, CH // S), Image.LANCZOS)
    out.save(f"public/tree_{season}.png")
    return out


if __name__ == "__main__":
    for s in SEASONS:
        paint(s)
        print(s)
