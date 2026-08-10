#!/usr/bin/env python3
"""
自动验缝:逐帧检测角色内部有没有"漏底"的洞。

做法:在两种不同底色上各渲染一次,颜色不一致的像素即透明像素;
再从画布外缘对透明区做一次连通域填充 —— 凡是"透明、却又连不到画布外面"的像素,
就是被身体包起来的洞,也就是漏缝。人眼容易漏掉一两帧,这个跑一遍全帧不会漏。
"""
import math
import numpy as np
import cv2
from PIL import Image
import preview_rig as P

N = 36
worst = 0
total = 0
# 站立姿势也必须查 —— 上一版只测了走路帧,结果把"静止就存在"的脖子洞漏掉了
CASES = [(-1, 0.0)] + [(i, 1.0) for i in range(N)]
for i, amp in CASES:
    t = 0.0 if i < 0 else i / N * 2 * math.pi
    a = np.array(P.draw(t, amp=amp).convert("RGB")).astype(int)
    bg = P.Image.new("RGBA", (560, 1260), (0, 0, 0, 255))
    # 换个底色重画一遍
    orig = P.Image.new
    P.Image.new = lambda mode, size, color=(0, 0, 0, 0), _o=orig: _o(mode, size, (0, 0, 0, 255)) \
        if size == (560, 1260) else _o(mode, size, color)
    b = np.array(P.draw(t, amp=amp).convert("RGB")).astype(int)
    P.Image.new = orig

    transparent = (np.abs(a - b).sum(axis=2) > 12).astype(np.uint8)
    # 四周补一圈透明边:靴子会踩到画布下沿,不补的话两腿之间那块会被画布边界封死,
    # 误判成"内部的洞"。
    transparent = np.pad(transparent, 4, constant_values=1)
    # 从画布外缘灌水:能连到外面的透明像素是正常背景
    ff = transparent.copy()
    h, w = ff.shape
    m = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, m, (0, 0), 2)
    hole_mask = ((transparent == 1) & (ff != 2)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(hole_mask, 8)
    for k in range(1, n):
        area = int(st[k, cv2.CC_STAT_AREA])
        if area < 30:             # 30 px 以下才当抗锯齿;上一版阈值 400,把脖子那个洞放过了
            continue
        x, y, w_, h_ = st[k, :4]
        total += area
        worst = max(worst, area)
        tag = "站立" if i < 0 else f"帧{i:2d}"
        print(f"  {tag}  {area:>6} px  bbox=(x{x}..{x+w_}, y{y}..{y+h_})")

print(f"\n{N} 帧全查完:最大一处 {worst} px,合计 {total} px")
print("注:两腿分开、靴子又前后交叠时,双腿之间那块真实的负空间会被判成闭合区域,")
print("    出现在小腿/靴子高度(y>950)属正常;关节高度(肩 y≈300、肘 520、髋 626、膝 878)")
print("    出现成片区域才是真漏缝。")
