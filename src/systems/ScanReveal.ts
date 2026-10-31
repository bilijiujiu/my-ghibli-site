import Phaser from 'phaser';

/**
 * 阁楼进场:"激光把这幅画画出来"(GLSL)。
 *
 * 前两版是测绘软件那种彩色点云 —— 技术感是有,但放在手绘水彩的阁楼里风格打架,而且太长。
 * 这一版只保留"扫描仪"这个和 LiDAR 呼应的点子,视觉上换成画画的过程:
 *
 *   1) 扫描线:一道竖直的青色激光帘从扫描仪往左扫过整个房间(0 – 1.5s);
 *   2) 线稿:激光扫过的地方,原画的墨线亮起来 —— 先是青白色、发着光(激光刚描过),
 *      然后慢慢冷却成淡蓝的线(像蓝图/铅笔稿);墨线由 tools/make_lines.py 从原画提取(attic_lines.png);
 *   3) 水彩晕染:颜色从台灯的位置往外渗开,边缘是不规则的、被噪声扰动的水痕,
 *      水痕处颜色略深(水彩干了以后边缘颜料堆积的那道"潮线"),渗到哪里,哪里就变回完整原画(1.2 – 3.6s)。
 *
 * 整个过程由一个进度 p(0..1)驱动,时间轴见 setProgress。
 */

const FRAG = `
precision highp float;
uniform sampler2D iChannel0;   // 原画
uniform sampler2D iChannel1;   // 墨线(白 = 线)
uniform vec2 uSize;            // 画布像素
uniform vec2 uScanner;         // 扫描仪(像素,左上原点)
uniform vec2 uLamp;            // 台灯(像素)
uniform float uBeam;           // 激光帘当前的 x(像素)
uniform float uWash;           // 水彩晕染的半径(像素)
uniform float uTime;
varying vec2 outTexCoord;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + 3.1; a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = vec2(outTexCoord.x, 1.0 - outTexCoord.y);
  vec2 p = uv * uSize;
  vec3 art = texture2D(iChannel0, uv).rgb;
  float ink = texture2D(iChannel1, uv).r;

  /* 底:几乎全黑,带一点冷色,扫描仪周围透出一点点原画 */
  float nearS = exp(-length(p - uScanner) / 90.0);
  vec3 col = vec3(0.012, 0.018, 0.035) + art * 0.03 * nearS;

  /* 线稿:激光帘从右往左扫,帘子右边(扫过的)显出墨线。刚扫过最亮,随后冷却 */
  float behind = p.x - uBeam;                       // > 0 = 已经扫过
  float drawn = smoothstep(0.0, 6.0, behind);
  float hot = exp(-max(behind, 0.0) / 140.0);       // 越靠近帘子越"热"
  vec3 lineCol = mix(vec3(0.42, 0.62, 0.85), vec3(0.85, 1.0, 1.0), hot);
  col += lineCol * ink * drawn * (0.55 + 0.9 * hot);

  /* 激光帘本身:一条细亮线 + 两侧一点辉光,竖直方向有一点点颤动 */
  float jitter = (noise(vec2(p.y * 0.05, uTime * 8.0)) - 0.5) * 2.0;
  float d = abs(p.x - uBeam - jitter);
  float beamOn = step(-1.0, uBeam) * step(uBeam, uSize.x);
  col += vec3(0.45, 0.95, 1.0) * (exp(-d * d / 3.0) * 1.2 + exp(-d / 40.0) * 0.12) * beamOn;

  /* 水彩晕染:半径被低频噪声扰动,边缘不规则地往外渗 */
  float dist = length((p - uLamp) * vec2(1.0, 1.15));
  float edge = uWash + (fbm(p * 0.006) - 0.5) * 380.0 + (fbm(p * 0.03) - 0.5) * 60.0;
  /* uWash = 0 时一点颜色都不许有:噪声扰动能把边缘推到正数,没开始晕染台灯那就先冒出一块 */
  float wet = smoothstep(edge, edge - 26.0, dist) * step(0.5, uWash);
  /* 潮线:水痕边缘颜料堆积,颜色更深更饱和 */
  float tide = exp(-pow((dist - edge + 14.0) / 10.0, 2.0)) * step(1.0, uWash);
  vec3 washed = art * (1.0 - 0.28 * tide);
  /* 刚渗到的地方颜色还"湿":略浅、略冷,随后干成原画 */
  float fresh = smoothstep(edge - 220.0, edge, dist) * wet;
  washed = mix(washed, washed * 0.82 + vec3(0.04, 0.05, 0.08), fresh * 0.5);
  col = mix(col, washed, wet);

  gl_FragColor = vec4(col, 1.0);
}
`;

const ease = (t: number) => t * t * (3 - 2 * t);
const seg = (p: number, a: number, b: number) => Phaser.Math.Clamp((p - a) / (b - a), 0, 1);

export class ScanReveal {
  readonly shader: Phaser.GameObjects.Shader;
  /** 一次完整进场的时长(毫秒) */
  static readonly DURATION = 3600;
  /** 激光帘扫完的那一刻(占总进度的比例),扫描仪的马达声在这里停 */
  static readonly BEAM_END = 0.42;
  private w: number;
  private h: number;
  private lamp: { x: number; y: number };
  private scanner: { x: number; y: number };

  constructor(scene: Phaser.Scene, artKey: string, linesKey: string,
              x: number, y: number, w: number, h: number,
              scanner: { x: number; y: number }, lamp: { x: number; y: number }) {
    this.w = w; this.h = h; this.lamp = lamp; this.scanner = scanner;
    const base = new Phaser.Display.BaseShader('scan_reveal_v3', FRAG, undefined, {
      uSize: { type: '2f', value: { x: w, y: h } },
      uScanner: { type: '2f', value: scanner },
      uLamp: { type: '2f', value: lamp },
      uBeam: { type: '1f', value: w + 10 },
      uWash: { type: '1f', value: 0 },
      uTime: { type: '1f', value: 0 },
    });
    this.shader = scene.add.shader(base, x, y, w, h).setOrigin(0, 0);
    /* 必须 clamp:默认是 repeat,而 WebGL1 里非 2 的幂尺寸的纹理不能 repeat,采样出来全黑 */
    const clamp = { wrapS: 'clamp_to_edge', wrapT: 'clamp_to_edge' } as any;
    this.shader.setChannel0(artKey, clamp);
    this.shader.setChannel1(linesKey, clamp);
  }

  /**
   * 时间轴(p 是 0..1 的总进度,总长 DURATION):
   *   0.00–0.42  激光帘从扫描仪扫到画面最左边,墨线随之出现
   *   0.33–1.00  颜色从台灯往外渗,铺满整个画面
   */
  setProgress(p: number, time = 0): void {
    const b = ease(seg(p, 0, ScanReveal.BEAM_END));
    /* 激光帘从画面最右边扫到最左边。p = 0(还没点)时停在画面外:不显示线、也不显示任何线稿 */
    const beam = p <= 0 ? this.w + 100 : (this.w + 10) + (-30 - (this.w + 10)) * b;
    const far = Math.max(
      Math.hypot(this.lamp.x, this.lamp.y * 1.15), Math.hypot(this.w - this.lamp.x, this.lamp.y * 1.15),
      Math.hypot(this.lamp.x, (this.h - this.lamp.y) * 1.15), Math.hypot(this.w - this.lamp.x, (this.h - this.lamp.y) * 1.15));
    const wash = (far + 260) * Math.pow(seg(p, 0.33, 1.0), 1.25);
    this.shader.setUniform('uBeam.value', p >= ScanReveal.BEAM_END ? -100 : beam);
    this.shader.setUniform('uWash.value', wash);
    this.shader.setUniform('uTime.value', time);
  }
}
