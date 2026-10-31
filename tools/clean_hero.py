#!/usr/bin/env python3
"""
重新整理主角抠图 public/hero_base.png,然后跑 build_rig.py 重新切部件。

原来的抠图是从白底的水彩画上抠出来的,有三类毛病,所有部件都继承了它们:
  1) 白边:墨线外面还留着一圈纸白色的像素,放到暗的室内背景上就是一圈发亮的光晕;
  2) 碎点:人物周围散落着几百个白色小斑点(抠图时没清掉的纸面杂点);
  3) 锯齿:alpha 是硬阈值,边缘一格一格的,没有抗锯齿。

处理:
  a) 只留最大的那一块(人物本体),碎点全部去掉;
  b) 去白边:在离轮廓 7px 以内的一圈里,找"又亮又不饱和"的纸白色像素,
     而且只去掉和外面连通的那部分 —— 衬衫本身也是浅色,但它被墨线围在里面,不会被误删;
  c) 边缘颜色净化:半透明的边缘像素用里面的颜色补(inpaint),不再带白色;
  d) 抗锯齿:alpha 轻微模糊再拉回陡峭,得到 1~2px 的柔边;
  e) 外轮廓补一道很细的深褐墨线 —— 和屋里原画"墨线勾边"的画法一致,也能压住残留的浅色边。
     墨线只在整体剪影的外侧,所以 build_rig 切出来的部件之间不会出现线(关节处没有缝线)。

原图备份为 public/hero_base.orig.png.unused(.gitignore 里 *.unused 不进仓库)。
运行:python tools/clean_hero.py && python tools/build_rig.py
"""
import os
import shutil
import numpy as np
import cv2
from PIL import Image

SRC = "public/hero_base.png"
BACKUP = "public/hero_base.orig.png.unused"
if not os.path.exists(BACKUP):
    shutil.copy(SRC, BACKUP)

im = np.array(Image.open(BACKUP).convert("RGBA")).astype(np.float32)
rgb, a = im[..., :3] / 255, im[..., 3] / 255
H, W = a.shape

# a) 最大连通块
solid = (a > 0.5).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(solid, 8)
body = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
body = cv2.morphologyEx(body, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
# 把人物内部的小洞填上(抠图在衣服亮部打出来的针眼)
inv = 1 - body
n, lab, st, _ = cv2.connectedComponentsWithStats(inv, 4)
for i in range(1, n):
    x, y, w, h, area = st[i]
    if area < 400 and x > 0 and y > 0 and x + w < W and y + h < H:
        body[lab == i] = 1
a = a * cv2.dilate(body, np.ones((3, 3), np.uint8)).astype(np.float32)

# b) 去白边:靠近轮廓、又亮又灰、并且和外部连通
lum = rgb.mean(2)
sat = rgb.max(2) - rgb.min(2)
paper = ((lum > 0.74) & (sat < 0.15)).astype(np.uint8)
outside = (a < 0.5).astype(np.uint8)
dist_out = cv2.distanceTransform(1 - outside, cv2.DIST_L2, 3)
band = (dist_out <= 7) & (a > 0)
cand = (paper.astype(bool) & band) | outside.astype(bool)
n, lab = cv2.connectedComponents(cand.astype(np.uint8), connectivity=4)
outside_labels = set(np.unique(lab[outside.astype(bool)])) - {0}
fringe = np.isin(lab, list(outside_labels)) & paper.astype(bool) & band
a[fringe] = 0
print("去掉白边像素:", int(fringe.sum()))

# 再清一次孤立碎块(去白边后可能断出来的小片)
solid = (a > 0.5).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(solid, 8)
keep = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
a = a * cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8))

# d) 抗锯齿
ab = cv2.GaussianBlur(a, (0, 0), 0.9)
a = np.clip((ab - 0.5) * 2.4 + 0.5, 0, 1)

# c) 边缘颜色净化:不够实的像素,颜色从里面借
rgb8 = (rgb * 255).astype(np.uint8)
need = ((a < 0.97) & (a > 0)).astype(np.uint8)
need = cv2.dilate(need, np.ones((3, 3), np.uint8))
rgb8 = cv2.inpaint(rgb8, need, 3, cv2.INPAINT_TELEA)
rgb = rgb8.astype(np.float32) / 255

# e) 外轮廓墨线:沿剪影外侧一圈 ~1.5px。
#    颜色不用统一的黑:取旁边那块颜色压暗 —— 头发边是深褐、衬衫边是深灰蓝。
#    统一的黑线会把头发细丝描成一团团黑疙瘩。
sil = (a > 0.5).astype(np.uint8)
d_out = cv2.distanceTransform(1 - sil, cv2.DIST_L2, 5)
ring = np.clip(1.8 - d_out, 0, 1) * (1 - a)
#    细的东西(飘起来的发丝,本身就是一笔墨线)不描边,不然一根根描成黑疙瘩:
#    只在"开运算后还在"的实心部分周围描。
thick = cv2.morphologyEx(sil, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
near_thick = cv2.distanceTransform(1 - thick, cv2.DIST_L2, 5) <= 3.5
ring = ring * near_thick
ring = cv2.GaussianBlur(ring, (0, 0), 0.5)
fill = cv2.dilate((ring > 0.01).astype(np.uint8), np.ones((5, 5), np.uint8)) & (1 - sil)
ext = cv2.inpaint((rgb * 255).astype(np.uint8), fill, 4, cv2.INPAINT_TELEA).astype(np.float32) / 255
INK = ext * 0.38 + np.array([0.04, 0.03, 0.02], np.float32)
na = a + ring * (1 - a) * 0.9
rgb = (rgb * a[..., None] + INK * (ring * (1 - a) * 0.9)[..., None]) / np.maximum(na, 1e-4)[..., None]
a = na

out = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1) * 255]).astype(np.uint8)
out[a <= 0.003] = 0
Image.fromarray(out, "RGBA").save(SRC)
print("ok ->", SRC)
