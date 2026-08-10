#!/usr/bin/env python3
"""
从 hero_base.png 重新切出剪纸动画部件(cut-out rig)。

原来的做法是"每个部位各切一张图,轴心靠猜",行走时必然出现两类瑕疵:
  · 漏缝 —— 部件在关节处是直边,一旋转直边转开就露出背景;
  · 穿模 —— 轴心不对,肢体绕错误的点转,整块图挪出父部件的覆盖范围。

三条几何约束把这两类问题从根上消掉:

  1) 同心圆接缝(concentric seam)
     父子两层在关节处的分界,做成"以关节为圆心的同一个圆":
     父件止于圆外、子件补满圆内。子件绕圆心旋转时圆的轮廓恒等不变,
     父件的弧形边缘也始终贴着这个圆 —— 接缝在任何角度都严丝合缝。
     (原来是横平的直边裁切:膝盖一弯,直边的一角转到父件之外,就露出一道背景。)

  2) 半径受轮廓约束(inscribed radius)
     圆盖半径用距离变换求"内切于 (父件 ∪ 该肢体) 的最大值",而不是拍脑袋给。
     半径超了圆盖就鼓到角色轮廓之外,变成一块永远存在、远侧还被压暗的脏斑
     (原来髋部 r=105,有 3116 px 露在身体外)。

  3) 逐像素安全余量(clearance)
     需要被父件藏住、又不在圆盖里的那部分,逐像素判断:
     该点绕轴心转 θ 会横移 |p−pivot|·sinθ,而它离父件边界还有 distanceTransform(cover)[p]。
     只保留"余量 ≥ 横移量"的像素 ⇒ 转到任何角度它都仍在父件内。

  另外画稿里手臂压在躯干和大腿上,切层时必须先抹掉再补布料,
  否则手臂摆开会露出印在底层上的"鬼影手臂 / 鬼影手掌"。

输出:public/hero/*.png + rig.json(关节坐标 + 每张图的轴心偏移)
"""
import json, math, os
import numpy as np
import cv2
from PIL import Image

SRC, OUT = "public/hero_base.png", "public/hero"
os.makedirs(OUT, exist_ok=True)

# ── 关节坐标(在 800×1200 母版上量出来的)────────────────────────────────
# 髋比解剖位置略高:抬进衬衫下摆里,圆盖才藏得住,是剪纸绑定的惯用作弊。
NECK, SHOULDER, ELBOW = (352, 232), (356, 300), (352, 520)
HIP, KNEE = (345, 626), (350, 878)

# 最大摆角(弧度)。必须 ≥ HeroRig.ts 里实际用到的值,安全余量按它算。
MAX_HIP, MAX_KNEE, MAX_SH, MAX_ELBOW = 0.50, 0.70, 0.24, 0.55

R_KNEE, R_ELBOW = 66, 40      # 同心接缝半径:约等于该处肢体的半宽
FEATHER = 14                  # 羽化像素,压在同材质父件上时让接缝看不见
FAR = (0.80, 0.82, 0.92)      # 远侧肢体调色:压暗一点点就够,太黑会放大任何瑕疵

base = np.array(Image.open(SRC).convert("RGBA"))
H, W = base.shape[:2]
rgb, alpha = base[:, :, :3], base[:, :, 3]
YY, XX = np.mgrid[0:H, 0:W]


def biggest(m):
    """只留最大连通域 —— 原抠图边角有零星噪点,会把包围盒撑到整张画布。"""
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 8)
    return m if n <= 1 else (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)


def mask(name):
    a = np.array(Image.open(f"public/hero_base_{name}.png").convert("RGBA"))[:, :, 3]
    return biggest((a > 128).astype(np.uint8))


m_head, m_body, m_arm, m_leg = (mask(n) for n in ("head", "body", "arm", "leg"))
m_all = biggest((alpha > 128).astype(np.uint8))


def reclaim():
    """
    四张原始抠图并不能铺满整个角色 —— 相对 hero_base.png 漏了两万多像素。

    最要命的一块在脖子:头沿下颌线裁、身体沿领口裁,中间 (x291..385, y222..258)
    夹着一楔子谁都没认领。这块地方上有头、下有躯干、左右是轮廓,
    也就是说**站着不动就是一个洞** —— 屏幕上那道横缝就是它,和旋转无关。

    这里把没人认领的小碎块(<1200px)按"离哪张图最近"重新分配 —— 脖子那楔子 818px、
    几处发梢 200~600px 都在其中。

    剩下的大块(远侧靴子 11665px、远侧手掌 4440px、远侧小腿 3940px)故意不补:
    它们本来就属于"另一侧"的肢体,而远侧肢体是拿近侧的图染色复用的,
    硬塞进近侧图会变成一条腿上长两只靴子、裤子上糊一块衬衫。
    而且它们贴在角色轮廓外沿、不夹在两层之间,少画只是轮廓瘦一点,不会漏底。
    """
    masks = {"head": m_head, "body": m_body, "arm": m_arm, "leg": m_leg}
    claimed = ((m_head | m_body | m_arm | m_leg) > 0).astype(np.uint8)
    left = (m_all & (1 - claimed)).astype(np.uint8)
    dist = {k: cv2.distanceTransform(1 - v, cv2.DIST_L2, 5) for k, v in masks.items()}
    names = list(masks)
    nearest = np.argmin(np.stack([dist[k] for k in names]), axis=0)

    n, lab, st, _ = cv2.connectedComponentsWithStats(left, 8)
    add = {k: np.zeros_like(m_all) for k in names}
    for i in range(1, n):
        comp = (lab == i).astype(np.uint8)
        if int(st[i, cv2.CC_STAT_AREA]) >= 1200:
            continue
        for j, k in enumerate(names):
            add[k] |= (comp & (nearest == j)).astype(np.uint8)
    for k in names:
        masks[k] |= add[k]
        if add[k].any():
            print(f"  补回 {k:5s} {int(add[k].sum()):>5} px")
    return masks["head"], masks["body"], masks["arm"], masks["leg"]


print("修补原始抠图之间没人认领的区域:")
m_head, m_body, m_arm, m_leg = reclaim()


def disc(c, r):
    m = np.zeros((H, W), np.uint8)
    cv2.circle(m, (int(c[0]), int(c[1])), int(round(r)), 1, -1)
    return m


def above(y):
    m = np.zeros((H, W), np.uint8); m[: int(y), :] = 1; return m


def below(y):
    m = np.zeros((H, W), np.uint8); m[int(y):, :] = 1; return m


def inscribed(pivot, region):
    return float(cv2.distanceTransform(region.astype(np.uint8), cv2.DIST_L2, 5)[pivot[1], pivot[0]])


def exposure_band(part, joints):
    """
    part 在动起来后"会被让开、从而露出底层"的那一圈范围。

    肢体绕轴心转 θ,离轴心 d 的点横移 d·sinθ,所以只有距离肢体边缘
    d·sinθ 以内的那圈才会露出来 —— 更深处永远被自己盖着。
    只修补这一圈,画稿上大片原始笔触就能原样保留,补出来的痕迹也几乎看不见。
    """
    need = np.full((H, W), 8.0)
    for pivot, theta in joints:
        need += np.hypot(XX - pivot[0], YY - pivot[1]) * math.sin(theta)
    edge = cv2.distanceTransform((part > 0).astype(np.uint8), cv2.DIST_L2, 5)
    return (part & (edge <= need)).astype(np.uint8)


def repair(region, remove):
    """
    把 remove 从 region 里抹掉,再用同行剩下的布料把它补回来。

    cv2.inpaint 面对这么大一块洞只会糊出一团泥;而被遮住的地方本来就是
    "衣服在手臂底下的阴影",补一片颜色对得上的干净布料反而最像。
    游戏里也只会露出肢体边缘一道月牙,那里的颜色是和边界对齐的,看不出接缝。
    """
    hole = (cv2.dilate(remove, np.ones((7, 7), np.uint8)) & region).astype(np.uint8)
    inner = cv2.erode(region, np.ones((11, 11), np.uint8))       # 别把轮廓墨线拉进来
    out = rgb.copy().astype(np.float32)

    for y in np.where(hole.any(axis=1))[0]:
        run, i = None, 0
        row = hole[y]
        xs = np.where(row > 0)[0]
        if len(xs) == 0:
            continue
        # 逐段处理(一行里可能有好几段洞)
        breaks = np.where(np.diff(xs) > 1)[0]
        for seg in np.split(xs, breaks + 1):
            a, b = seg[0], seg[-1] + 1
            avail = (inner[y] > 0) & (row == 0)
            L = np.where(avail[:a])[0][-64:]
            Rt = np.where(avail[b:])[0][:64] + b
            if len(L) < 4 and len(Rt) < 4:
                continue
            n = b - a

            def mirror(src, flip):
                """把一段布料按"镜像平铺"延伸出去 —— 折痕接得上,不会出现平铺缝。"""
                t = out[y, src]
                if flip:
                    t = t[::-1]
                p = len(t)
                k = np.arange(n) % (2 * p)
                k = np.where(k < p, k, 2 * p - 1 - k)
                return t[k]

            if len(L) >= 4 and len(Rt) >= 4:
                fl = mirror(L, True)[::-1]          # 从左边界往右长
                fr = mirror(Rt, False)              # 从右边界往左长
                w = np.linspace(0, 1, n)[:, None]
                fill = fl * (1 - w) + fr * w
            elif len(L) >= 4:
                fill = mirror(L, True)[::-1]
            else:
                fill = mirror(Rt, False)
            out[y, a:b] = fill * 0.97               # 底下是阴影,压一点点

    out = np.clip(out, 0, 255)
    sm = cv2.GaussianBlur(out, (1, 9), 0)           # 纵向轻抹,消掉逐行重采样的抖动
    w = cv2.GaussianBlur((hole * 255).astype(np.float32), (9, 9), 0)[..., None] / 255.0
    return np.clip(out * (1 - w) + sm * w, 0, 255).astype(np.uint8)


def hideable(shape, pivot, cover, theta):
    """shape 中"转 θ 之后仍被 cover 盖住"的部分(约束 3)。"""
    clearance = cv2.distanceTransform((cover > 0).astype(np.uint8), cv2.DIST_L2, 5)
    travel = np.hypot(XX - pivot[0], YY - pivot[1]) * math.sin(min(theta, 1.2))
    return shape & cover & (clearance >= travel - 1.0)


def emit(name, geo, core, pivot, feather=FEATHER, src=None, tint=None):
    """按 geo 抠一层,羽化,裁紧,记录轴心相对裁剪框的偏移。"""
    g = (geo > 0).astype(np.uint8)
    if feather > 0:
        d = cv2.distanceTransform(g, cv2.DIST_L2, 5)
        a = np.maximum(np.clip(d / feather, 0, 1), (core > 0).astype(np.float32))
    else:
        a = g.astype(np.float32)
    a = (a * (alpha.astype(np.float32) / 255.0) * 255).astype(np.uint8)
    ys, xs = np.where(a > 3)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    col = (rgb if src is None else src).astype(np.float32)
    if tint:
        col = np.clip(col * np.array(tint), 0, 255)
    Image.fromarray(np.dstack([col.astype(np.uint8), a])[y0:y1, x0:x1]).save(f"{OUT}/{name}.png")
    meta = {"w": int(x1 - x0), "h": int(y1 - y0),
            "px": int(pivot[0] - x0), "py": int(pivot[1] - y0)}
    print(f"  {name:16s} {meta['w']:>4}×{meta['h']:<4} pivot=({meta['px']},{meta['py']})")
    return meta


rig = {"joints": {}, "parts": {}}

# ══ 躯干 ════════════════════════════════════════════════════════════════
# 上到脖子,下到衬衫下摆。下摆以下整块交给腿,裤子才会整条跟着腿走,
# 不会出现"上半截裤子不动、下半截在摆"的错位。
torso_geo = ((m_body | m_arm) & m_all) | (m_leg & above(662) & m_all)
torso_geo = biggest(cv2.morphologyEx(torso_geo, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8)))
torso_geo &= above(666)   # 严格止于衬衫下摆:多留一条都会在裤子上压出一道横杠
# 脖子整块垫在头后面:头是画在躯干之上的,垫底看不见,但可以保证下颌线附近
# 无论怎么裁都不会露出背景。这块是上一版那道横缝的正解。
R_NECK = float(np.clip(inscribed(NECK, m_all) - 2, 12, 46))
torso_geo |= (disc(NECK, R_NECK + 26) & m_all)
# 只抹掉手臂"摆开后会露出来"的那一圈,而不是整条手臂 —— 衬衫的原始笔触尽量保留
# 上臂只绕肩转,前臂还要叠加肘的旋转,分段算才不会把整条手臂都判成"会露出来"
_up = m_arm & above(ELBOW[1])
_lo = m_arm & below(ELBOW[1])
torso_rgb = repair(torso_geo, (exposure_band(_up, [(SHOULDER, MAX_SH)])
                               | exposure_band(_lo, [(SHOULDER, MAX_SH), (ELBOW, MAX_ELBOW)])))
rig["parts"]["torso"] = emit("torso", torso_geo, torso_geo, HIP, feather=0, src=torso_rgb)

# ══ 头 ══════════════════════════════════════════════════════════════════
# 上一版这里写成 head_geo &= above(NECK.y + r_neck),而 r_neck 被夹到了下限 10,
# 等于把下颌以下 10px 直接切掉 —— 加上躯干又没盖住脖子,就成了那道缝。
# 现在:头 = 下颌形状 ∪ 以脖子为圆心的圆盖,圆盖必须不透明(在 core 里),
# 只在圆盖之外羽化,而羽化落在躯干的脖子垫底上,看不出接缝。
r_neck = R_NECK
head_geo = (m_head | disc(NECK, r_neck + 8)) & (m_all | disc(NECK, r_neck + 8))
head_geo &= above(NECK[1] + r_neck + 8)
core_head = m_head | disc(NECK, r_neck)
rig["parts"]["head"] = emit("head", head_geo, core_head, NECK)

# ══ 手臂 ════════════════════════════════════════════════════════════════
# 肘部同心接缝:上臂止于 disc(ELBOW,R) 之外,前臂补满 disc(ELBOW,R+3)。
arm_up_raw = m_arm & above(ELBOW[1] + 80) & (1 - disc(ELBOW, R_ELBOW))
arm_lo_raw = m_arm & below(ELBOW[1] - 80)

# 近侧手臂压在完整躯干之上 —— 底下已经补成干净布料,旋转不可能露出背景,
# 圆盖只需消掉肩部那条直裁边,剩下交给羽化。
r_sh = float(np.clip(inscribed(SHOULDER, ((torso_geo | m_arm) > 0).astype(np.uint8)) - 3, 10, 70))
near_up = ((arm_up_raw | disc(SHOULDER, r_sh)) & m_all) | disc(SHOULDER, r_sh)
near_up &= (1 - disc(ELBOW, R_ELBOW)) | disc(SHOULDER, r_sh)
rig["parts"]["arm_upper"] = emit("arm_upper", near_up, arm_up_raw, SHOULDER)

# 远侧手臂画在躯干之下,圆盖必须严格受约束,否则会从轮廓里冒出来
far_up = (arm_up_raw & (1 - torso_geo)) | hideable(arm_up_raw, SHOULDER, torso_geo, MAX_SH) \
         | disc(SHOULDER, min(r_sh, inscribed(SHOULDER, m_all) - 2))
rig["parts"]["arm_upper_far"] = emit("arm_upper_far", far_up, arm_up_raw & (1 - torso_geo),
                                     SHOULDER, tint=FAR)

# 圆盖必须完全不透明:它填的是上臂让出来的那块圆,一旦被羽化成半透明就会透出背景
arm_lo = arm_lo_raw | disc(ELBOW, R_ELBOW + 3)
core_arm_lo = (arm_lo_raw & below(ELBOW[1] + 20)) | disc(ELBOW, R_ELBOW + 3)
rig["parts"]["arm_lower"] = emit("arm_lower", arm_lo, core_arm_lo, ELBOW)
rig["parts"]["arm_lower_far"] = emit("arm_lower_far", arm_lo, core_arm_lo, ELBOW, tint=FAR)

# ══ 腿 ══════════════════════════════════════════════════════════════════
# 膝部同心接缝,和肘部同理。另外画稿里手掌压在大腿上,得先抹掉。
leg_rgb = repair(m_leg, m_arm)
thigh_raw = m_leg & above(KNEE[1] + 120) & (1 - disc(KNEE, R_KNEE))
shin_raw = m_leg & below(KNEE[1] - 120)

r_hip = float(np.clip(inscribed(HIP, ((torso_geo | m_leg) > 0).astype(np.uint8)) - 3, 10, 110))
r_hip = min(r_hip, inscribed(HIP, m_all) - 2)
thigh = (thigh_raw & (1 - torso_geo)) | hideable(thigh_raw, HIP, torso_geo, MAX_HIP) | disc(HIP, r_hip)
core_thigh = thigh_raw & (1 - torso_geo)
rig["parts"]["thigh"] = emit("thigh", thigh, core_thigh, HIP, src=leg_rgb)
rig["parts"]["thigh_far"] = emit("thigh_far", thigh, core_thigh, HIP, src=leg_rgb, tint=FAR)

shin = shin_raw | disc(KNEE, R_KNEE + 3)
core_shin = (shin_raw & below(KNEE[1] + 20)) | disc(KNEE, R_KNEE + 3)
rig["parts"]["shin"] = emit("shin", shin, core_shin, KNEE, src=leg_rgb)
rig["parts"]["shin_far"] = emit("shin_far", shin, core_shin, KNEE, src=leg_rgb, tint=FAR)

# ══ 关节坐标(原点 = 脚底中心,角色站立时的锚点)══════════════════════════
rows = np.where(m_all.any(axis=1))[0]
FOOT_Y = int(rows.max())
for k, v in dict(neck=NECK, shoulder=SHOULDER, elbow=ELBOW, hip=HIP, knee=KNEE).items():
    rig["joints"][k] = {"x": v[0] - HIP[0], "y": v[1] - FOOT_Y}
rig["height"] = int(FOOT_Y - rows.min())
rig["caps"] = {"hip": round(r_hip, 1), "knee": R_KNEE, "elbow": R_ELBOW,
               "neck": round(r_neck, 1), "shoulder": round(r_sh, 1)}
rig["maxAngle"] = {"hip": MAX_HIP, "knee": MAX_KNEE, "shoulder": MAX_SH, "elbow": MAX_ELBOW}

json.dump(rig, open(f"{OUT}/rig.json", "w"), indent=2)
print("\n圆盖半径:", rig["caps"])
print("关节(相对脚底):", json.dumps(rig["joints"]))
print("角色高度:", rig["height"])

# ══ 顺带生成 TS 常量,免得运行时再去 fetch 一个 json ══════════════════════
ts = ["/* 由 build_rig.py 自动生成,请勿手改。改切图请改脚本后重跑。 */",
      "export interface PartMeta { w: number; h: number; px: number; py: number }",
      "export const RIG = {"]
ts.append("  /** 关节坐标,原点 = 脚底中心(角色站立时的锚点) */")
ts.append("  joints: {")
for k, v in rig["joints"].items():
    ts.append(f"    {k}: {{ x: {v['x']}, y: {v['y']} }},")
ts.append("  },")
ts.append("  /** 每张切图的尺寸,以及轴心相对该图左上角的偏移 */")
ts.append("  parts: {")
for k, v in rig["parts"].items():
    ts.append(f"    {k}: {{ w: {v['w']}, h: {v['h']}, px: {v['px']}, py: {v['py']} }},")
ts.append("  } as Record<string, PartMeta>,")
ts.append(f"  height: {rig['height']},")
ts.append("} as const;")
ts.append("")
ts.append("export type PartName = keyof typeof RIG.parts;")
ts.append("")
open("src/config/heroRig.ts", "w").write("\n".join(ts) + "\n")
print("写出 src/config/heroRig.ts")
