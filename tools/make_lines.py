#!/usr/bin/env python3
"""
从阁楼原画里提取墨线,给"激光把画画出来"的进场效果用:public/attic_lines.png(灰度,白 = 墨线)。

原画是"墨线勾边 + 水彩上色",墨线就是比周围明显更暗的细线。做法:
  1) 亮度减去局部平均亮度 —— 墨线比周围暗一截,大面积的暗部(阴影、夜空)不会被选进来;
  2) 再要求本身够暗,去掉颜色里的小斑点;
  3) 去掉很小的连通块(噪点),留下成形的线条;
  4) 轻微羽化,线条边缘不发硬。
用法:python tools/make_lines.py public/attic_bg.webp public/attic_lines.png
"""
import sys
import numpy as np
import cv2
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = np.array(Image.open(src).convert("RGB")).astype(np.float32) / 255
L = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
local = cv2.GaussianBlur(L, (0, 0), 6)
ink = np.clip((local - L - 0.035) / 0.07, 0, 1) * np.clip((0.42 - L) / 0.18, 0, 1)
m = (ink > 0.35).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
keep = np.zeros(n, bool)
keep[1:] = st[1:, cv2.CC_STAT_AREA] >= 40
m = keep[lab].astype(np.float32)
out = cv2.GaussianBlur(np.maximum(m, ink * m), (0, 0), 0.7)
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(dst, optimize=True)
print("ok", float(m.mean()))
