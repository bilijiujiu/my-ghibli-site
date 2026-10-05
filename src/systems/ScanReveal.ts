import Phaser from 'phaser';

/**
 * 激光扫描显影 v2 —— 真的按三维来扫(GLSL)。
 *
 * 第一版是屏幕上一个往外扩的圆 + 均匀的点阵,看着就是一圈 2D 涟漪。真实的地面激光扫描仪是这样的:
 *   扫描头绕竖轴转一圈(方位角),同时激光在竖直方向上高速上下扫(俯仰角),
 *   所以点云落在"方位角 × 俯仰角"的网格上 —— 地板上是一圈圈以三脚架为圆心的同心环,
 *   墙上是一道道水平线,离扫描仪越远越稀。这个图案一眼就是"扫描",别的东西模仿不来。
 *
 * 要做出这个,得知道每个像素在三维里的位置:
 *   - 深度图 public/attic_depth.png 由 tools/make_depth.py 用 MiDaS 估出来(1 = 最近);
 *   - 每个像素按针孔相机反投影成三维点 P,扫描仪自己的像素也反投影成扫描仪位置 S;
 *   - 对 P − S 求方位角/俯仰角,落在网格点附近的像素才亮 —— 这就是点云。
 *
 * 镜头还会绕场景中心轻轻转几度:近处的点比远处的点移动得多(视差),一下就看得出是立体的。
 * 渲染是"反向变形":对屏幕上每个像素迭代几次,找出转动之后落到这里的原图像素。
 * 角度小、深度连续,四次迭代就收敛了。最后镜头转回正面、点云"上色"并补满成原画 —— 和原画逐像素一致。
 *
 * 整个过程由一个进度 p(0..1)驱动,时间轴见 setProgress。
 */

const FRAG = `
precision highp float;
uniform sampler2D iChannel0;   // 原画
uniform sampler2D iChannel1;   // 深度(1 = 近)
uniform vec2 uSize;            // 画布像素
uniform vec2 uOrigin;          // 扫描仪像素(左上为原点)
uniform float uSweep;          // 0..1 扫描头转过的比例
uniform float uYaw;            // 镜头绕场景转的角度(弧度)
uniform float uColor;          // 0..1 点云从高程色变成真实颜色
uniform float uFill;           // 0..1 点云补满成原画
uniform float uTime;
varying vec2 outTexCoord;

const float F = 1.6;           // 焦距(纵向视野约 64°)
const float PI = 3.14159265;
const vec3 PIVOT = vec3(0.0, 0.0, 4.5);

float aspect() { return uSize.x / uSize.y; }
/* 屏幕 uv(左上原点)↔ 相机坐标 s(中心原点,y 向上,纵向 −1..1) */
vec2 toS(vec2 uv) { return vec2((uv.x - 0.5) * 2.0 * aspect(), (0.5 - uv.y) * 2.0); }
vec2 toUV(vec2 s) { return vec2(s.x / (2.0 * aspect()) + 0.5, 0.5 - s.y * 0.5); }

float depthAt(vec2 uv) {
  float d = texture2D(iChannel1, clamp(uv, 0.001, 0.999)).r;
  return 1.0 / mix(1.0 / 10.0, 1.0 / 1.8, d);     // 逆深度线性插值 → 1.8m ~ 10m
}
vec3 unproject(vec2 uv) {
  float z = depthAt(uv);
  return vec3(toS(uv) * z / F, z);
}
vec3 yawAround(vec3 p, float a) {
  vec3 q = p - PIVOT;
  float c = cos(a), s = sin(a);
  return vec3(c * q.x + s * q.z, q.y, -s * q.x + c * q.z) + PIVOT;
}
vec3 elevationColor(float h) {
  vec3 c = mix(vec3(0.15, 0.30, 1.00), vec3(0.10, 0.90, 1.00), smoothstep(0.0, 0.25, h));
  c = mix(c, vec3(0.30, 1.00, 0.40), smoothstep(0.25, 0.5, h));
  c = mix(c, vec3(1.00, 0.92, 0.25), smoothstep(0.5, 0.75, h));
  return mix(c, vec3(1.00, 0.40, 0.25), smoothstep(0.75, 1.0, h));
}

void main() {
  vec2 q = vec2(outTexCoord.x, 1.0 - outTexCoord.y);

  /* 反向变形:找原图里哪个像素在镜头转了 uYaw 之后落到 q */
  vec2 uv = q;
  for (int i = 0; i < 4; i++) {
    vec3 P = yawAround(unproject(uv), uYaw);
    vec2 qq = toUV(P.xy * F / P.z);
    uv += q - qq;
  }
  /* 镜头转动时画面边缘会"看到"原画以外的地方 —— 那里没有数据,淡成黑的,不要拉伸边缘像素 */
  float inside = smoothstep(0.0, 0.015, uv.x) * smoothstep(1.0, 0.985, uv.x)
               * smoothstep(0.0, 0.015, uv.y) * smoothstep(1.0, 0.985, uv.y);
  uv = clamp(uv, 0.0, 1.0);

  vec3 art = texture2D(iChannel0, uv).rgb;
  vec3 P = unproject(uv);
  vec3 S = unproject(uOrigin / uSize);
  vec3 v = P - S;
  float r = length(v);

  /* 方位角(绕竖轴):从正对后墙开始,往左转,再转向镜头 —— 扫描帘从远处扫到近处 */
  float az = mod(atan(-v.x, v.z), 2.0 * PI);
  float el = atan(v.y, length(v.xz));

  vec3 ghost = art * 0.035 + vec3(0.004, 0.008, 0.02);

  /* 扫过了没有 */
  float swept = az / (2.0 * PI);
  float done = step(swept, uSweep);

  /* 网格:俯仰 1.1° 一圈,方位 0.8° 一点。再密就连成条纹、出摩尔纹,看不出是一颗颗的点了 */
  float dEl = radians(1.1), dAz = radians(0.8);
  float elc = (floor(el / dEl) + 0.5) * dEl;
  float azc = (floor(az / dAz) + 0.5) * dAz;
  vec2 ang = vec2((az - azc) * cos(el), el - elc);
  /* 角度差 × 距离 = 实际间隔(米),再按深度投影成屏幕像素 */
  float px = length(ang) * r * F / P.z * (uSize.y * 0.5);
  float rad = 1.3 + 1.5 * clamp(2.5 / P.z, 0.0, 1.0);
  float dotv = 1.0 - smoothstep(rad - 0.7, rad + 0.7, px);

  /* 颜色:高程色带 × 反射强度(原画亮度),再慢慢换成真实颜色 */
  float h = clamp((P.y + 1.6) / 3.2, 0.0, 1.0);
  float lum = dot(art, vec3(0.3, 0.59, 0.11));
  vec3 ptc = mix(elevationColor(h) * (0.45 + 1.1 * lum), art * 1.6 + 0.04, uColor);

  /* 刚被扫到的点更亮 */
  float behind = (uSweep - swept) * 2.0 * PI;
  float fresh = exp(-max(behind, 0.0) * 3.0);
  vec3 cloud = ghost + ptc * dotv * done * (1.0 + 1.4 * fresh);

  /* 扫描头正指着的那条竖线:激光帘 */
  float beam = exp(-pow(behind / 0.012, 2.0)) * step(uSweep, 0.999) * step(0.001, uSweep);
  cloud += vec3(0.35, 0.95, 1.0) * beam * 0.9;

  vec3 col = mix(cloud * inside, art, uFill);
  gl_FragColor = vec4(col, 1.0);
}
`;

const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (p: number, a: number, b: number) => ease(Phaser.Math.Clamp((p - a) / (b - a), 0, 1));

export class ScanReveal {
  readonly shader: Phaser.GameObjects.Shader;
  /** 一次完整扫描的建议时长(毫秒) */
  static readonly DURATION = 7200;

  constructor(scene: Phaser.Scene, artKey: string, depthKey: string,
              x: number, y: number, w: number, h: number, origin: { x: number; y: number }) {
    const base = new Phaser.Display.BaseShader('scan_reveal_v2', FRAG, undefined, {
      uSize: { type: '2f', value: { x: w, y: h } },
      uOrigin: { type: '2f', value: { x: origin.x, y: origin.y } },
      uSweep: { type: '1f', value: 0 },
      uYaw: { type: '1f', value: 0 },
      uColor: { type: '1f', value: 0 },
      uFill: { type: '1f', value: 0 },
      uTime: { type: '1f', value: 0 },
    });
    this.shader = scene.add.shader(base, x, y, w, h).setOrigin(0, 0);
    /* 必须 clamp:默认是 repeat,而 WebGL1 里非 2 的幂尺寸的纹理不能 repeat,采样出来全黑 */
    const clamp = { wrapS: 'clamp_to_edge', wrapT: 'clamp_to_edge' } as any;
    this.shader.setChannel0(artKey, clamp);
    this.shader.setChannel1(depthKey, clamp);
  }

  /**
   * 时间轴(p 是 0..1 的总进度):
   *   0.00–0.55  扫描头转一圈,点云一片片出现
   *   0.08–0.45  镜头往一边绕 4.5°(看出是立体的)
   *   0.48–0.70  点云从高程色换成真实颜色
   *   0.62–0.98  镜头绕回正面,同时点云补满成原画
   */
  setProgress(p: number, time = 0): void {
    const sweep = seg(p, 0.0, 0.55);
    const yawOut = seg(p, 0.08, 0.45), yawBack = seg(p, 0.62, 0.98);
    const yaw = Phaser.Math.DegToRad(4.5) * yawOut * (1 - yawBack);
    this.shader.setUniform('uSweep.value', sweep);
    this.shader.setUniform('uYaw.value', yaw);
    this.shader.setUniform('uColor.value', seg(p, 0.48, 0.70));
    this.shader.setUniform('uFill.value', seg(p, 0.70, 0.98));
    this.shader.setUniform('uTime.value', time);
  }
}
