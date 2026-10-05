import Phaser from 'phaser';

/**
 * 火焰着色器(GLSL)。
 *
 * 思路:火不是"一堆橙色圆点往上飘",而是一团被热气往上拽的、不停撕裂的形状。
 *   1) 两层 fbm 噪声做域扭曲(domain warp),整体往上滚 —— 这是火苗"舔"和"翻卷"的来源;
 *   2) 外形是一个下宽上窄的包络,越往上越被噪声切碎,分出几条火舌、顶上甩出脱离的火团;
 *   3) 每个像素算一个"温度":离边缘越远、越靠下越热;
 *   4) 温度压成 5 档颜色(暗红 → 橙红 → 橙 → 金黄 → 奶白芯),档与档之间只留很窄的过渡 ——
 *      和壁炉原画一样的赛璐璐分色,而不是写实渲染的柔和渐变;
 *   5) 最外一圈描一道暗红边,相当于原画里的墨线。
 *
 * 输出预乘 alpha(Phaser 默认的混合方式)。
 */

const FRAG = `
precision mediump float;

uniform float uTime;
uniform float uIntensity;   // 0..1 火势
uniform float uLean;        // 火苗整体往一边倒的程度
uniform float uFlicker;     // 0..1 全局明暗抖动
varying vec2 outTexCoord;   // 0..1,y=0 在底部

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
/* 分色:t 过了 edge 就切到下一档,只留 0.025 的软边 */
float band(float t, float edge) { return smoothstep(edge - 0.025, edge + 0.025, t); }

void main() {
  float I = uIntensity;
  if (I < 0.01) { gl_FragColor = vec4(0.0); return; }

  vec2 uv = outTexCoord;
  float y = uv.y;
  float x = (uv.x - 0.5) * 2.0;
  x -= uLean * y * y;                       // 上半截往一边倒

  float t = uTime;
  /* 域扭曲:第一层噪声去推第二层的采样坐标 */
  vec2 q = vec2(x * 2.1, y * 2.4 - t * 1.7);
  float w = fbm(q + vec2(0.0, t * 0.35));
  float n = fbm(q * 1.6 + vec2(w * 1.6 - 0.8, -t * 0.9));

  /* 外形 */
  float h = 0.26 + 0.56 * I + 0.06 * uFlicker;          // 火焰高度(占画布比例)
  float yy = y / h;
  float width = (0.30 + 0.30 * I) * pow(clamp(1.0 - yy, 0.0, 1.0), 0.75);
  /* 火舌:往上走,宽度被一条横向的正弦 + 噪声切开 */
  float tongues = 0.5 + 0.5 * sin(x * (7.0 + 6.0 * I) + n * 5.0 + t * 1.1);   // 火越大,分出的火舌越多
  width *= mix(1.0, 0.2 + 1.0 * tongues, smoothstep(0.05, 0.55, yy));
  float d = width - abs(x) + (n - 0.5) * (0.22 + 0.5 * smoothstep(0.0, 0.6, yy));
  /* 顶上甩出去的火团:高处用噪声阈值"切"出孤立的小块 */
  float wisp = smoothstep(0.64, 0.72, n) * smoothstep(0.75, 1.0, yy) * smoothstep(1.25, 1.0, yy) * 0.1
               * (1.0 - smoothstep(0.25, 0.5, abs(x)));
  d = max(d, wisp - 0.02);

  float alpha = smoothstep(0.0, 0.012, d);
  if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }

  /* 温度 */
  float heat = d * 3.0 + (1.0 - yy) * 0.38 - 0.10 + 0.06 * uFlicker;
  /* 柴缝里那一截压成橙色:贴着木柴的地方是最亮的奶白,夹在两根柴中间会像一团白棉花 */
  heat = min(heat, 1.0) - (1.0 - smoothstep(0.03, 0.16, y)) * 0.5;   // 先封顶再压,否则中心远超 1,压不下来
  heat = clamp(heat, 0.0, 1.0);

  vec3 c0 = vec3(0.62, 0.10, 0.05);   // 暗红
  vec3 c1 = vec3(0.90, 0.30, 0.07);   // 橙红
  vec3 c2 = vec3(1.00, 0.56, 0.13);   // 橙
  vec3 c3 = vec3(1.00, 0.80, 0.32);   // 金黄
  vec3 c4 = vec3(1.00, 0.95, 0.78);   // 奶白芯
  vec3 col = c0;
  col = mix(col, c1, band(heat, 0.20));
  col = mix(col, c2, band(heat, 0.42));
  col = mix(col, c3, band(heat, 0.66));
  col = mix(col, c4, band(heat, 0.93));

  /* 外缘暗边(原画墨线的意思,但用深红,火不该有黑边) */
  float rim = 1.0 - smoothstep(0.012, 0.03, d);
  col = mix(col, vec3(0.38, 0.06, 0.03), rim * 0.85);

  /* 底部埋进木柴里的那截淡掉,交给柴堆的余烬去接 */
  alpha *= smoothstep(0.0, 0.06, y);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

export function addFireShader(scene: Phaser.Scene, x: number, y: number, w: number, h: number)
  : Phaser.GameObjects.Shader {
  const key = 'fire_shader';
  const base = new Phaser.Display.BaseShader(key, FRAG, undefined, {
    uTime: { type: '1f', value: 0 },
    uIntensity: { type: '1f', value: 0 },
    uLean: { type: '1f', value: 0 },
    uFlicker: { type: '1f', value: 0 },
  });
  /* 原点在底边中点:x/y 给的是火焰底部中心 */
  return scene.add.shader(base, x, y, w, h).setOrigin(0.5, 1);
}
