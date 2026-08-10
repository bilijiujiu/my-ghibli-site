#!/usr/bin/env python3
"""
用 Python 复刻 HeroRig.ts 的变换,导出走路循环的逐帧图 / GIF,用来肉眼验缝。
这里的姿势函数和 TS 那份必须逐字对应,改一边要改另一边。
"""
import json, math
import numpy as np
from PIL import Image

R = json.load(open("public/hero/rig.json"))
J, PM = R["joints"], R["parts"]
IM = {k: Image.open(f"public/hero/{k}.png").convert("RGBA") for k in PM}

# ── 走路循环参数(与 HeroRig.ts 保持一致)───────────────────────────────
HIP_SWING, KNEE_BEND = 0.44, 0.62
SH_SWING, ELBOW_BEND = 0.20, 0.34
ELBOW_REST, BOB = 0.14, 13.0


def pose(t, amp=1.0):
    """t 为循环相位,amp 0=站立 1=全速走。返回各关节的绝对旋转角(弧度)。"""
    def leg(ph):
        hip = math.sin(t + ph) * HIP_SWING * amp
        # 膝盖只在摆动相弯曲:支撑腿伸直撑住身体,摆动腿收起来才不会蹭地
        knee = max(0.0, math.sin(t + ph - 1.9)) ** 1.3 * KNEE_BEND * amp
        return hip, hip + knee

    def arm(ph):
        sh = math.sin(t + ph) * SH_SWING * amp
        el = ELBOW_REST + max(0.0, math.sin(t + ph + 0.6)) * ELBOW_BEND * amp
        return sh, sh + el

    p = {}
    p["hipN"], p["kneeN"] = leg(0)
    p["hipF"], p["kneeF"] = leg(math.pi)
    p["shN"], p["elN"] = arm(math.pi)     # 手臂与同侧腿反相
    p["shF"], p["elF"] = arm(0)
    p["bob"] = (-abs(math.sin(t)) * BOB * amp) if amp > 0.01 else math.sin(t) * 1.5
    return p


def place(cv, key, at, rot):
    im, m = IM[key], PM[key]
    px, py = m["px"], m["py"]
    r = int(math.hypot(max(px, m["w"] - px), max(py, m["h"] - py))) + 4
    pad = Image.new("RGBA", (2 * r, 2 * r), (0, 0, 0, 0))
    pad.paste(im, (r - px, r - py))
    cv.alpha_composite(pad.rotate(-math.degrees(rot), Image.BICUBIC, center=(r, r)),
                       (int(at[0]) - r, int(at[1]) - r))


def draw(t, size=(560, 1260), origin=(280, 1215), debug=False, amp=1.0):
    cv = Image.new("RGBA", size, (247, 242, 230, 255))
    p, (ox, oy), b = pose(t, amp), origin, 0.0
    b = p["bob"]

    def jp(name, dy):
        return (ox + J[name]["x"], oy + J[name]["y"] + dy)

    def limb(up, lo, uj, lj, ur, lr, dy):
        """先按上段的旋转把下段轴心带过去,再摆下段 —— 这就是两级骨骼。"""
        ax, ay = jp(uj, dy)
        vx, vy = J[lj]["x"] - J[uj]["x"], J[lj]["y"] - J[uj]["y"]
        c, s = math.cos(ur), math.sin(ur)
        place(cv, lo, (ax + vx * c - vy * s, ay + vx * s + vy * c), lr)
        place(cv, up, (ax, ay), ur)

    # 画序:远腿 → 远臂 → 近腿 → 躯干 → 近臂 → 头
    # 躯干压在近腿之上 = 衬衫下摆盖住裤腰,髋部圆盖永远藏在衣服底下
    limb("thigh_far", "shin_far", "hip", "knee", p["hipF"], p["kneeF"], b)
    limb("arm_upper_far", "arm_lower_far", "shoulder", "elbow", p["shF"], p["elF"], b)
    limb("thigh", "shin", "hip", "knee", p["hipN"], p["kneeN"], b)
    place(cv, "torso", jp("hip", b), 0)
    limb("arm_upper", "arm_lower", "shoulder", "elbow", p["shN"], p["elN"], b)
    place(cv, "head", jp("neck", b), math.sin(t * 2) * 0.02 * amp)

    if debug:
        from PIL import ImageDraw
        d = ImageDraw.Draw(cv)
        for n in ("hip", "shoulder", "neck", "knee", "elbow"):
            x, y = jp(n, b); d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 0, 0))
    return cv


if __name__ == "__main__":
    N = 12
    fr = [draw(i / N * 2 * math.pi) for i in range(N)]
    sheet = Image.new("RGB", (fr[0].width * 6, fr[0].height * 2), (247, 242, 230))
    for i, f in enumerate(fr):
        sheet.paste(f.convert("RGB"), ((i % 6) * f.width, (i // 6) * f.height))
    sheet.resize((sheet.width // 3, sheet.height // 3)).save("/tmp/walk_sheet.png")
    fr[0].save("/tmp/walk.gif", save_all=True, append_images=fr[1:], duration=70, loop=0, disposal=2)
    # 最大摆幅特写:肩/肘/髋/膝在极限角度下是否露底
    draw(math.pi / 2).crop((90, 140, 470, 1240)).resize((342, 990)).convert("RGB") \
        .save("/tmp/walk_zoom.png")
    print("ok")
