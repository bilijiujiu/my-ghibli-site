#!/usr/bin/env python3
"""
从 S1 的草原(public/hero.webp)派生窗景地平线图,四季各一张。

为什么是它:S1 是访客进屋前看到的那片草原,窗外理应就是同一片地。
用同一张原画派生,世界观自洽,也不用另外画。

流程:
  1) 抠掉天空 —— 山脊以上留 alpha。WindowScene 底层有一层代码画的天色渐变,
     天空交给它,曲柄拨时间才真的能把天从正午拨到深夜(贴一张画死的天空就拨不动了)。
  2) 裁掉少年和山上那座小屋 —— 人已经在屋里了,窗外不该再站着他自己,
     也不该看见自己住的那座屋子。取中间 x1700~5100 这段干净的丘陵。
  3) 四季改色 —— 走**明度重映射(三段色阶)**,不是色相旋转。
     实测这块地景本身只有 S≈39 的彩度(它在原画里是逆光的剪影),
     色相旋转拧不动这么灰的颜色,四季会长得一模一样。
     改成:把画面的明暗当作一张灰度图,每季给一条"暗部→中间调→亮部"的色阶重新上色,
     再把原图的高频笔触加回去。颜色完全可控,水彩的笔触一根不丢。

输出 public/window_land_{spring,summer,autumn,winter}.webp,单向一条,
镜像交给 WindowScene 用翻转的相邻图拼(省一半体积)。
"""
import numpy as np
import cv2
from PIL import Image
import os

SRC = "public/hero.webp"

# 源图 7256×3468 上量出来的取景框:避开左边的少年、右上的小屋、右下的大石头
X0, X1 = 1700, 5100
# 纵向只取到 2050:窗外看到的应该是远景丘陵,不是贴脸的草丛。
# 而且要的是一条又宽又扁的地平线带(约 5.7:1),截太多前景就变成竖构图了。
Y0, Y1 = 1450, 2050

OUT_W = 3400            # 比窗口画布(2560)宽,留出横移的余量
SKY_RB = 70             # R−B 大于它就算天空:实测天空 R−B≈130~170,地面 ≈−20~+10
FEATHER = 5             # 山脊边缘羽化像素

# 每季一条三段色阶:暗部 / 中间调 / 亮部。地景的明暗直接查这张表上色。
SEASONS = {
    "spring": (0x3f5c3c, 0x82a352, 0xd2e28e),   # 新绿,亮部发嫩黄
    "summer": (0x2a4a2c, 0x54803c, 0xa6c468),   # 浓绿,压得住
    "autumn": (0x4a3826, 0xa8813c, 0xecc681),   # 金黄
    "winter": (0x62728c, 0xb6c4d8, 0xf3f7fc),   # 雪,冷
}
DETAIL = 1.15        # 高频笔触加回来的强度


def build_base():
    """抠出地景,返回(明暗图, 高频笔触, alpha)。"""
    img = np.array(Image.open(SRC).convert("RGB"))[Y0:Y1, X0:X1].astype(np.float32)

    sky = (img[:, :, 0] - img[:, :, 2]) > SKY_RB
    # 从上往下累积:一旦某列进入地面,它下面全算地面。
    # 不这么做的话,草丛里被夕阳打亮的黄色麦穗会被误判成天空,地面上会被戳出洞。
    land = np.maximum.accumulate((~sky).astype(np.uint8), axis=0)
    land = cv2.morphologyEx(land, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    alpha = cv2.GaussianBlur(land.astype(np.float32) * 255, (0, 0), FEATHER)

    lum = img @ np.array([0.30, 0.59, 0.11], np.float32)
    inside = alpha > 128
    # 用分位数把明度拉满 0~1,色阶两头才用得上
    lo, hi = np.percentile(lum[inside], 3), np.percentile(lum[inside], 97)
    tone = np.clip((lum - lo) / max(hi - lo, 1e-3), 0, 1)
    detail = lum - cv2.GaussianBlur(lum, (0, 0), 6)      # 水彩笔触,重新上色后加回去
    return tone, detail, alpha


def rgbv(c):
    return np.array([(c >> 16) & 255, (c >> 8) & 255, c & 255], np.float32)


def recolor(tone, detail, ramp):
    """三段色阶:0→暗部, 0.5→中间调, 1→亮部。"""
    dark, mid, light = (rgbv(c) for c in ramp)
    t = tone[:, :, None]
    lower = dark + (mid - dark) * np.clip(t / 0.5, 0, 1)
    upper = mid + (light - mid) * np.clip((t - 0.5) / 0.5, 0, 1)
    out = np.where(t < 0.5, lower, upper)
    return np.clip(out + detail[:, :, None] * DETAIL, 0, 255)


tone, detail, alpha = build_base()
for name, ramp in SEASONS.items():
    rgba = np.dstack([recolor(tone, detail, ramp), alpha]).astype(np.uint8)
    scale = OUT_W / rgba.shape[1]
    rgba = cv2.resize(rgba, (OUT_W, int(round(rgba.shape[0] * scale))), interpolation=cv2.INTER_AREA)
    rows = np.where((rgba[:, :, 3] > 3).any(axis=1))[0]
    rgba = rgba[rows.min():]
    path = f"public/window_land_{name}.webp"
    Image.fromarray(rgba).save(path, quality=88, method=6)
    print(f"  {path:38s} {rgba.shape[1]}×{rgba.shape[0]}  {os.path.getsize(path)/1024:.0f} KB")
