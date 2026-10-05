#!/usr/bin/env python3
"""
窗景的"窗框"直接取自 room.webp —— 访客在屋里看到的就是这扇拱窗,
按 E 往外看,镜头应该是推近这同一扇窗,而不是换成另一个窗框。

做法:
  1) 从 room.webp 裁一块和画布同比例(2560:1240)、以拱窗为中心的区域,放大到画布尺寸;
  2) 把玻璃抠成透明 —— 玻璃是很纯的深蓝(R≈0, B−G≥40),窗棂是偏灰的青色、墨线是近黑,
     按颜色就能分开;再限制在拱窗内部(上半椭圆 + 下半矩形),墙上的蓝色不会被误抠;
  3) 星点、雨滴这些玻璃上的小亮点补回到玻璃里(填洞),边缘羽化 1px。
输出:public/window_room.webp(带 alpha)和 src/config/windowGlass.ts(玻璃区域的屏幕坐标)。
运行:python tools/make_window_room.py(在项目根目录)
"""
import json
import numpy as np
import cv2
from PIL import Image

W, H = 2560, 1240
SRC = "public/room.webp"
# room.webp(6528×1632)上的裁切框:拱窗居中,上留一截梁,下到窗台下沿
CX0, CY0, CW = 3448, 270, 2065
CH = round(CW * H / W)

# 拱窗内部(room.webp 坐标):下半是矩形,上半是椭圆拱
WIN_X0, WIN_X1, WIN_Y0, WIN_Y1 = 3950 + 283, 3950 + 800, 150 + 200, 150 + 1012
ARCH_CX, ARCH_CY, ARCH_RX, ARCH_RY = 3950 + 545, 150 + 560, 262, 350

im = np.array(Image.open(SRC).convert("RGB"))
crop = im[CY0:CY0 + CH, CX0:CX0 + CW].astype(np.int32)
# 判色前先轻微模糊:原图是有损压缩,玻璃里有颗粒噪点,逐像素判会碎成渣
sm = cv2.GaussianBlur(crop.astype(np.float32), (0, 0), 1.6)
R, G, B = sm[..., 0], sm[..., 1], sm[..., 2]
yy, xx = np.mgrid[0:CH, 0:CW]
xx = xx + CX0; yy = yy + CY0
inside = (xx >= WIN_X0) & (xx <= WIN_X1) & (yy >= WIN_Y0) & (yy <= WIN_Y1) & (
    (yy >= ARCH_CY) | (((xx - ARCH_CX) / ARCH_RX) ** 2 + ((yy - ARCH_CY) / ARCH_RY) ** 2 <= 1))

glass = ((B > G + 37) & (B > 55) & (R < 110)) | ((B > 170) & (R < 120) & (G > 120))
glass = (glass & inside).astype(np.uint8)
glass = cv2.morphologyEx(glass, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
glass = cv2.morphologyEx(glass, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
# 去掉零碎的小块
n, lab, st, _ = cv2.connectedComponentsWithStats(glass)
keep = np.zeros_like(glass)
for i in range(1, n):
    if st[i][4] > 250:
        keep[lab == i] = 1
# 填洞:星点/水珠是玻璃里的小亮斑,只填面积小的洞(窗棂是大的"洞",不能填)
inv = (1 - keep).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
for i in range(1, n):
    if st[i][4] < 260:
        keep[lab == i] = 1
glass = keep

# 放大到画布
rgb = cv2.resize(crop.astype(np.uint8), (W, H), interpolation=cv2.INTER_LANCZOS4)
# 轻微锐化,抵消放大的糊
blur = cv2.GaussianBlur(rgb, (0, 0), 1.2)
rgb = np.clip(rgb.astype(np.float32) * 1.35 - blur.astype(np.float32) * 0.35, 0, 255).astype(np.uint8)
m = cv2.resize(glass.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
m = cv2.GaussianBlur(m, (0, 0), 0.9)
alpha = np.clip((1 - m) * 255, 0, 255).astype(np.uint8)
Image.fromarray(np.dstack([rgb, alpha])).save("public/window_room.webp", "WEBP", quality=90, method=6)

ys, xs = np.where(m > 0.5)
box = dict(x=int(xs.min()), y=int(ys.min()), w=int(xs.max() - xs.min() + 1), h=int(ys.max() - ys.min() + 1))
s = W / CW
def to_screen(x, y): return round((x - CX0) * s), round((y - CY0) * s)
sill_l = to_screen(3950 + 225, 150 + 1040)
sill_r = to_screen(3950 + 880, 150 + 1040)
with open("src/config/windowGlass.ts", "w") as f:
    f.write("/** 由 tools/make_window_room.py 生成,别手改。window_room.webp 里玻璃区域的外接矩形(画布像素)。 */\n")
    f.write(f"export const GLASS = {json.dumps(box)};\n")
    f.write("/** 窗台石台面(画布像素):左右端点与台面高度 */\n")
    f.write(f"export const SILL = {{ x0: {sill_l[0]}, x1: {sill_r[0]}, y: {sill_l[1]} }};\n")
print(box, sill_l, sill_r)

# ---------------------------------------------------------------------------
# 可开合的窗扇:下半部分左右两扇,从上面那张图里切出来,单独存成贴图。
# 底图里对应的区域挖空(window_room_open.webp),关窗时两扇窗扇刚好盖回原位,看不出接缝。
# 窗扇上的玻璃不再是全透明:留一层很淡的蓝(alpha≈0.16),窗扇转开时才看得出那是玻璃。
# 中间那根立柱、上面的横档、两侧的窗框属于墙,不动。
# ---------------------------------------------------------------------------
SASHES = {
    "sash_l": dict(x0=989, x1=1291, y0=543, y1=1108, hinge="left"),
    "sash_r": dict(x0=1321, x1=1607, y0=543, y1=1108, hinge="right"),
}
full = np.array(Image.open("public/window_room.webp").convert("RGBA"))
opened = full.copy()
for name, r in SASHES.items():
    piece = full[r["y0"]:r["y1"], r["x0"]:r["x1"]].copy()
    a = piece[:, :, 3].astype(np.float32) / 255
    glass_tint = np.array([170, 198, 226], np.float32)
    rgb = piece[:, :, :3].astype(np.float32)
    rgb = rgb * a[:, :, None] + glass_tint * (1 - a[:, :, None])
    piece[:, :, :3] = rgb.astype(np.uint8)
    piece[:, :, 3] = np.clip(a * 255 + (1 - a) * 40, 0, 255).astype(np.uint8)
    Image.fromarray(piece).save(f"public/{name}.png")
    opened[r["y0"]:r["y1"], r["x0"]:r["x1"], 3] = 0
Image.fromarray(opened).save("public/window_room_open.webp", "WEBP", quality=90, method=6)
with open("src/config/windowGlass.ts", "a") as f:
    f.write("/** 两扇可开的窗扇在画布上的位置(贴图 public/sash_l.png / sash_r.png),hinge 是铰链那一侧 */\n")
    f.write("export const SASHES = {\n")
    for name, r in SASHES.items():
        f.write(f"  {name}: {{ x: {r['x0']}, y: {r['y0']}, w: {r['x1'] - r['x0']}, h: {r['y1'] - r['y0']}, hinge: '{r['hinge']}' as const }},\n")
    f.write("};\n")
print("sashes ok")
