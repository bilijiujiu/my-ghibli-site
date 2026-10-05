#!/usr/bin/env python3
"""
给阁楼原画估一张深度图(public/attic_depth.png),给激光扫描特效用。

模型:MiDaS v2.1 small(ONNX,~66MB,GitHub release 下载,不进仓库):
  https://github.com/isl-org/MiDaS/releases/download/v2_1/model-small.onnx
放到 tools/models/model-small.onnx 再运行。

MiDaS 输出的是相对"逆深度"(越近值越大)。这里:
  1) 按 256×256 推理,输出放大回原画尺寸;
  2) 用原画做引导滤波(guided filter)把边缘对齐 —— 不然桌子、三脚架的轮廓会糊成一团;
  3) 归一化到 0~1(1 = 最近),存成 16 位灰度 PNG 的高 8 位够用,直接存 8 位。
用法:python tools/make_depth.py public/attic_bg.webp public/attic_depth.png
"""
import sys
import numpy as np
import cv2
import onnxruntime as ort
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
model = sys.argv[3] if len(sys.argv) > 3 else "tools/models/model-small.onnx"
img = np.array(Image.open(src).convert("RGB")).astype(np.float32) / 255
H, W = img.shape[:2]

sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])


def infer(crop):
    """一块图 → 同尺寸的逆深度。模型输入固定 256×256"""
    h, w = crop.shape[:2]
    x = cv2.resize(crop, (256, 256), interpolation=cv2.INTER_AREA)
    x = (x - np.array([0.485, 0.456, 0.406])) / np.array([0.229, 0.224, 0.225])
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    out = sess.run(None, {sess.get_inputs()[0].name: x})[0][0]
    return cv2.resize(out, (w, h), interpolation=cv2.INTER_CUBIC)

# 整张图压成正方形推一次(全局结构对,但细节糊);
# 再切成三块互相重叠一半的正方形各推一次(细节清楚,但各自的深度尺度不一样),
# 每块用最小二乘把尺度和偏移对齐到整张图那一版,再用三角窗加权拼起来(重叠处平滑过渡,没有接缝)。
full = infer(img)
inv = np.zeros_like(full); wsum = np.zeros_like(full)
n_tiles = 3
for i in range(n_tiles):
    x0 = int(round(i * (W - H) / (n_tiles - 1)))
    t = infer(img[:, x0:x0 + H])
    ref = full[:, x0:x0 + H]
    A = np.stack([t.ravel(), np.ones(t.size)], 1)
    k, b = np.linalg.lstsq(A, ref.ravel(), rcond=None)[0]
    t = t * k + b
    win = 1 - np.abs(np.linspace(-1, 1, H, dtype=np.float32))
    win = np.maximum(win, 0.02)
    if i == 0: win[: H // 2] = 1          # 画面最左、最右两边只有一块覆盖,权重别降到 0
    if i == n_tiles - 1: win[H // 2:] = 1
    inv[:, x0:x0 + H] += t * win[None, :]
    wsum[:, x0:x0 + H] += win[None, :]
inv = inv / np.maximum(wsum, 1e-6)

lo, hi = np.percentile(inv, 1), np.percentile(inv, 99)
d = np.clip((inv - lo) / (hi - lo), 0, 1).astype(np.float32)


def guided(I, p, r, eps):
    """经典引导滤波(He et al.),I 灰度引导图,p 待滤波"""
    mean = lambda a: cv2.boxFilter(a, -1, (r, r))
    mI, mp = mean(I), mean(p)
    cov = mean(I * p) - mI * mp
    var = mean(I * I) - mI * mI
    a = cov / (var + eps); b = mp - a * mI
    return mean(a) * I + mean(b)

gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
d = np.clip(guided(gray, d, 7, 4e-4), 0, 1)
d = cv2.GaussianBlur(d, (0, 0), 1.0)
Image.fromarray((d * 255).astype(np.uint8)).save(dst)
print("ok", W, H, float(d.min()), float(d.max()))
