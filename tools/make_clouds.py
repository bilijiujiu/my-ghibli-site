#!/usr/bin/env python3
"""
从 public/cloud1.png(6752px 宽,一整条云带)切出两朵独立的云,预缩到 ~1000px:
  cloud_a.webp / cloud_b.webp         原画配色(黄昏受光,粉橙高光)
  cloud_a_day.webp / cloud_b_day.webp 白天版:按明暗重新上色成白云 + 蓝灰暗部,笔触保留

为什么要预缩:原图在屏幕上只显示 ~600px,GPU 没有 mipmap 时缩小 10 倍
就是最近邻抽样,水彩笔触被抽成像素块 —— 这就是原来云看着像像素画的原因。

切口处的淡出不走直线:用低频噪声让淡出边沿弯弯曲曲,像云自己散开,
直线淡出会在云上留一道竖直的亮带。
运行:python tools/make_clouds.py(在项目根目录)
"""
import numpy as np
import cv2
from PIL import Image

SRC = "public/cloud1.png"
im = np.array(Image.open(SRC).convert("RGBA")).astype(np.float32)
rng = np.random.RandomState(3)


def wavy(n, h, scale):
    """每行一个横向偏移,低频起伏"""
    raw = rng.randn(h // 260 + 3)
    return cv2.resize(raw[None, :].astype(np.float32), (h, 1), interpolation=cv2.INTER_CUBIC)[0] * scale


def piece(x0, x1, fl, fr, name, w):
    c = im[780:2000, x0:x1].copy()
    h, n = c.shape[:2]
    xs = np.arange(n)[None, :].astype(np.float32)
    mask = np.ones((h, n), np.float32)
    if fl:
        off = wavy(n, h, fl * 0.45)[:, None]
        mask *= np.clip((xs - off) / fl, 0, 1)
    if fr:
        off = wavy(n, h, fr * 0.45)[:, None]
        mask *= np.clip((n - 1 - xs - off) / fr, 0, 1)
    mask = cv2.GaussianBlur(mask, (0, 0), 45) ** 1.6
    # 噪声偏移可能把淡出推到切口外面:最外 240px 再硬性压到 0,保证切口处一定是透明的
    edge = np.clip(np.minimum(xs, n - 1 - xs) / 240.0, 0, 1) ** 1.5
    if not fl: edge = np.where(xs < n / 2, 1, edge)
    if not fr: edge = np.where(xs >= n / 2, 1, edge)
    mask *= edge
    c[:, :, 3] *= mask
    a = c[:, :, 3]
    ys = np.where(a.max(1) > 6)[0]; xx = np.where(a.max(0) > 6)[0]
    c = c[max(ys.min() - 20, 0):ys.max() + 20, max(xx.min() - 20, 0):xx.max() + 20]
    out = Image.fromarray(c.astype(np.uint8))
    out = out.resize((w, int(out.height * w / out.width)), Image.LANCZOS)
    out.save(f"public/{name}.webp", "WEBP", quality=88, method=6)
    day(np.array(out).astype(np.float32), name)


def day(a, name):
    rgb = a[:, :, :3] / 255; al = a[:, :, 3] / 255
    lum = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
    warm = np.clip((rgb[:, :, 0] - rgb[:, :, 2]) * 3, 0, 1)      # 原画里被夕阳打亮的那面
    lo, hi = np.percentile(lum[al > 0.5], [3, 97])
    t = np.clip(np.clip((lum - lo) / (hi - lo), 0, 1) + warm * 0.35, 0, 1)[:, :, None]
    sh, md, li = (np.array(c, np.float32) / 255 for c in
                  ((0x8f, 0x9c, 0xbd), (0xcf, 0xd9, 0xec), (0xff, 0xff, 0xfc)))
    out = np.where(t < 0.5, sh + (md - sh) * (t / 0.5), md + (li - md) * ((t - 0.5) / 0.5))
    num = cv2.GaussianBlur(lum * al, (0, 0), 5); den = cv2.GaussianBlur(al, (0, 0), 5) + 1e-4
    det = (lum - num / den) * np.clip(al * 2, 0, 1)                 # 笔触加回去
    a[:, :, :3] = np.clip(out + det[:, :, None] * 0.8, 0, 1) * 255
    Image.fromarray(a.astype(np.uint8)).save(f"public/{name}_day.webp", "WEBP", quality=88, method=6)


piece(780, 2950, 0, 520, "cloud_a", 900)
piece(3200, 6080, 460, 160, "cloud_b", 1000)
print("ok")
