#!/usr/bin/env python3
"""
把第二幕门廊(public/porch.webp)里的门拆成可以开合的一层。

生成图不是不能动 —— 只要把该动的那块抠出来,底下缺的补上就行。这里只抠两样:

  porch_door.webp  门板本身。运行时以**右侧铰链**为轴做 scaleX 变化:
                   门绕铰链转开,在正视投影里就是横向被压扁 —— 这是 2.5D 开门的标准作弊,
                   比硬做三维旋转自然得多,而且一张图就够。
  porch_room.webp  门板背后的室内。门收窄后会露出这块;原画里那儿画的还是门,
                   不补的话会露出一扇"鬼影门"(和之前手臂摆开露出鬼影手臂是同一类问题)。

室内不去憋细节:门一开,人眼看到的本来就主要是光。取门缝里那道真实的暖光做基色,
往里逐渐压暗,再顺一道竖向的光柱 —— 比硬凑几件家具可信得多。

数值都是在 6688×3764 的原图上量出来的。
"""
import json
import numpy as np
import cv2
from PIL import Image

SRC = "public/porch.webp"

# ── 在原图上量出来的门 ────────────────────────────────────────────────
DOOR = dict(x0=5300, x1=5775, y0=360, y1=2440)   # 门板包围盒,x1 就是铰链所在
SLIT = dict(x0=5140, x1=5300)                    # 门缝:真实的室内暖光,拿它当基色
ROOM = dict(x0=5130, x1=5790, y0=360, y1=2440)   # 室内补片(要完整盖住门板)
ARC = ((5300, 480), (5775, 370))                 # 门顶那道弧:左端 y480 → 右端 y370
FLOOR_Y = 2330                                   # 室内地板高度

img = np.array(Image.open(SRC).convert("RGB")).astype(np.float32)


def crop(box):
    return img[box["y0"]:box["y1"], box["x0"]:box["x1"]].copy()


# ══ 1. 门板 ══════════════════════════════════════════════════════════
door = crop(DOOR)
h, w = door.shape[:2]
alpha = np.full((h, w), 255, np.uint8)

# 门顶是拱形,包围盒左上角那块其实是门框内侧的暗部,切掉,不然开门时会拖着一个方角
ys, xs = np.mgrid[0:h, 0:w]
arc_y = np.interp(xs + DOOR["x0"], [ARC[0][0], ARC[1][0]], [ARC[0][1], ARC[1][1]])
alpha[(ys + DOOR["y0"]) < arc_y - 6] = 0
alpha = cv2.GaussianBlur(alpha, (0, 0), 2.5)

Image.fromarray(np.dstack([door.astype(np.uint8), alpha])).save(
    "public/porch_door.webp", quality=90, method=6)

# ══ 2. 门后的室内 ══════════════════════════════════════════════════════
# 第一版是"取门缝的暖光往里铺一层渐变"—— 门开小的时候还行,一开大就是一块糊掉的方块。
# 正确答案本来就在项目里:门后应该是 public/room.webp,也就是第三幕真正要走进去的那间屋。
# 从门缝里看见的就是下一幕的壁炉,推门进去场景一换,空间是连着的。
ROOM_SRC = "public/room.webp"
ROOM_FOCUS = 1620          # room.webp 里壁炉的 x —— 门缝里最该看见的就是这团火
ROOM_TOP = 60              # 取得高一点 = 视野更宽,壁炉才像在屋子深处而不是贴着门

room_img = np.array(Image.open(ROOM_SRC).convert("RGB")).astype(np.float32)
rH, rW = room_img.shape[:2]
room = crop(ROOM)
rh, rw = room.shape[:2]
slit_w = SLIT["x1"] - SLIT["x0"]
slit_off = SLIT["x0"] - ROOM["x0"]
fill_from = SLIT["x1"] - ROOM["x0"]        # 从门缝右边开始需要补

# 按门洞的长宽比从 room.webp 上切一条,再拉到门洞大小
need_w, need_h = rw, rh
src_h = rH - ROOM_TOP
src_w = int(src_h * need_w / need_h)
x0 = int(np.clip(ROOM_FOCUS - src_w // 2, 0, rW - src_w))
view = cv2.resize(room_img[ROOM_TOP:, x0:x0 + src_w], (need_w, need_h),
                  interpolation=cv2.INTER_AREA)

# 色调对齐:把这条切片的整体色偏拉到门缝里那块真实暖光上,不然一眼看出是两张画拼的
slit_med = np.median(room[:, slit_off:slit_off + slit_w].reshape(-1, 3), axis=0)
view_med = np.median(view.reshape(-1, 3), axis=0)
view = np.clip(view * np.clip(slit_med / np.maximum(view_med, 1), 0.72, 1.7), 0, 255)

# 门洞边缘压暗:光在门框内侧本来就衰减得快,不压的话像贴了张海报
gx = np.linspace(0, 1, need_w)[None, :]
gy = np.linspace(0, 1, need_h)[:, None]
vig = np.ones((need_h, need_w), np.float32)
vig *= (1 - 0.34 * np.clip((gx - 0.50) / 0.50, 0, 1) ** 1.4)              # 越往里越暗
vig *= (1 - 0.30 * np.clip((0.10 - gy) / 0.10, 0, 1))                    # 门楣的阴影
vig *= (1 - 0.22 * np.clip((gy - 0.93) / 0.07, 0, 1))                    # 门槛
view *= vig[:, :, None]

# 靠门缝那一侧留一道光柱:光从这儿漏出来,室内这一侧也该被它照亮
beam = np.exp(-((gx - 0.30) ** 2) / 0.030)[:, :, None]
view = np.clip(view * (1 + beam * 0.16) + np.array([34, 18, 5], np.float32) * beam, 0, 255)

room[:, fill_from:] = view[:, fill_from:]
# 和左边那道原画门缝交叉淡入,接缝才不会硬碰硬
blend = 90
b0, b1 = max(0, fill_from - blend), fill_from + blend
w = np.clip((np.arange(b0, b1) - b0) / (b1 - b0), 0, 1)[None, :, None]
orig = crop(ROOM)[:, b0:b1]
room[:, b0:b1] = orig * (1 - w) + view[:, b0:b1] * w

# 补片是个矩形,直接盖上去的话上下两条边就是硬碴 —— 门开着的时候,
# 门楣上方会出现"室内的墙直接顶着门廊的横梁"这种接不上的分层感。
# 给它一层跟着门洞形状走的 alpha:拱顶以上、门槛以下、右侧门框之外都渐隐掉,
# 露出下面原画的门框,层就藏进去了。
rh2, rw2 = room.shape[:2]
yy, xx = np.mgrid[0:rh2, 0:rw2]
gx_abs, gy_abs = xx + ROOM["x0"], yy + ROOM["y0"]
arc_top = np.interp(gx_abs, [ARC[0][0], ARC[1][0]], [ARC[0][1], ARC[1][1]]) - 40
a = np.ones((rh2, rw2), np.float32)
a *= np.clip((gy_abs - arc_top) / 26.0, 0, 1)                    # 拱顶
a *= np.clip((2415 - gy_abs) / 25.0, 0, 1)                       # 门槛
a *= np.clip((DOOR["x1"] + 6 - gx_abs) / 18.0, 0, 1)             # 右侧门框
a *= np.clip((gx_abs - ROOM["x0"]) / 12.0, 0, 1)                 # 左边缘
alpha_room = (cv2.GaussianBlur(a, (0, 0), 2.0) * 255).astype(np.uint8)

Image.fromarray(np.dstack([np.clip(room, 0, 255).astype(np.uint8), alpha_room])).save(
    "public/porch_room.webp", quality=90, method=6)

meta = {"door": DOOR, "room": ROOM, "hinge": DOOR["x1"], "src": [img.shape[1], img.shape[0]]}
json.dump(meta, open("public/porch_parts.json", "w"), indent=2)

import os
for f in ("public/porch_door.webp", "public/porch_room.webp"):
    print(f"  {f:28s} {Image.open(f).size}  {os.path.getsize(f)/1024:.0f} KB")
print("  铰链 x =", DOOR["x1"])
