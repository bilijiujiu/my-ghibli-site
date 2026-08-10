#!/usr/bin/env python3
"""
程序化树:递归分枝生成骨架,叶子挂在末梢。四季只换叶子的颜色/密度,骨架不动。

这份是"设计稿":先在 Python 里把形状和配色调好,再把同一套递归原样搬进
WindowScene.ts。两边的随机数发生器必须完全一致,不然树的长相对不上 ——
所以这里不用 random,用一个自己实现的确定性 LCG,TS 那边照抄。
"""
import math


class LCG:
    """线性同余,和 TS 版逐位一致。用它才能保证两边长出同一棵树。"""
    def __init__(self, seed):
        self.s = seed & 0xFFFFFFFF

    def next(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 0x100000000

    def range(self, a, b):
        return a + (b - a) * self.next()


def grow(seed=7, height=1.0):
    """
    返回 (branches, leaves)。
      branches: (x1,y1,x2,y2,width,depth) —— 坐标以树根为原点,y 向上为负
      leaves:   (x,y,size,jitter)         —— 末梢上的挂叶点
    """
    rng = LCG(seed)
    branches, leaves = [], []

    def rec(x, y, ang, length, width, depth):
        x2 = x + math.sin(ang) * length
        y2 = y - math.cos(ang) * length
        branches.append((x, y, x2, y2, width, depth))

        if depth >= 4:
            # 末梢挂叶:沿着这一段撒几片。数量刻意压着 —— 树在屏幕上只有 500px 高,
            # 叶点多到两千个纯属浪费,每次换季重画都要多花几毫秒。
            n = 1 + int(rng.range(0, 2))
            for i in range(n):
                f = rng.range(0.35, 1.0)
                leaves.append((x + (x2 - x) * f, y + (y2 - y) * f,
                               rng.range(0.6, 1.0), rng.next() * math.pi * 2))
        if depth >= 6 or length < 5:
            return

        # 分叉:主枝continues,侧枝张开。角度带随机,树才不像圣诞树
        k = 2 if rng.next() < 0.78 else 3
        for i in range(k):
            spread = rng.range(0.30, 0.62) * (1 if i % 2 == 0 else -1)
            if k == 3 and i == 2:
                spread = rng.range(-0.18, 0.18)
            rec(x2, y2, ang + spread + rng.range(-0.09, 0.09),
                length * rng.range(0.66, 0.80),
                width * 0.70, depth + 1)

    rec(0, 0, rng.range(-0.06, 0.06), 118 * height, 15 * height, 0)
    return branches, leaves


# 四季的叶子:(颜色列表, 密度, 尺寸倍率)
LEAF = {
    "spring": ([0x9ccb63, 0xb8dd7a, 0x86bb56, 0xe9a9c4, 0xf3c6d8, 0xa9d472], 0.60, 0.85),  # 嫩芽,间几朵花
    "summer": ([0x3f7a35, 0x4f8f3c, 0x2f6630, 0x69a24a], 1.00, 1.00),
    "autumn": ([0xd9973a, 0xc7642c, 0xe8bd63, 0xa4472a], 0.72, 0.95),
    "winter": ([], 0.0, 0.0),
}
BARK = {"spring": 0x4b3a2c, "summer": 0x40332a, "autumn": 0x4a382a, "winter": 0x51473f}


if __name__ == "__main__":
    from PIL import Image, ImageDraw
    br, lv = grow()
    print(f"枝 {len(br)} 段, 叶点 {len(lv)} 个")
    sheet = Image.new("RGB", (300 * 4, 420), (150, 175, 205))
    for i, season in enumerate(("spring", "summer", "autumn", "winter")):
        im = Image.new("RGBA", (300, 420), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        ox, oy, sc = 150, 408, 0.80
        bark = BARK[season]
        for (x1, y1, x2, y2, w, dep) in br:
            d.line([ox + x1 * sc, oy + y1 * sc, ox + x2 * sc, oy + y2 * sc],
                   fill=((bark >> 16) & 255, (bark >> 8) & 255, bark & 255),
                   width=max(1, int(w * sc)))
            if season == "winter" and dep <= 5:   # 枝上的积雪:偏上半个枝宽画一道细线
                d.line([ox + x1 * sc, oy + y1 * sc - w * sc * 0.42,
                        ox + x2 * sc, oy + y2 * sc - w * sc * 0.42],
                       fill=(230, 238, 247), width=max(1, int(w * sc * 0.42)))
        cols, dens, size = LEAF[season]
        rng = LCG(99)
        for (x, y, s, j) in lv:
            if rng.next() > dens:
                continue
            c = cols[int(rng.next() * len(cols))]
            r = s * size * 4.2 * sc
            cx, cy = ox + x * sc + math.cos(j) * 4, oy + y * sc + math.sin(j) * 4
            d.ellipse([cx - r, cy - r * 0.78, cx + r, cy + r * 0.78],
                      fill=((c >> 16) & 255, (c >> 8) & 255, c & 255))
        bg = Image.new("RGBA", (300, 420), (150, 175, 205, 255))
        bg.alpha_composite(im)
        sheet.paste(bg.convert("RGB"), (i * 300, 0))
    sheet.save("/tmp/tree.png")
    print("ok")
