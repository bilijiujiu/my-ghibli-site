import Phaser from 'phaser';

/**
 * 窗景用的"手绘感"纹理,全部在运行时用 canvas 画,不占额外素材。
 *
 * 为什么需要它们:窗外的地景、云是原画,而天空、窗框、日月原来是 Graphics 纯色几何,
 * 一张画里混了"水彩"和"矢量"两种语言。这里把代码画的那部分也往纸上的水彩靠:
 *   - 天空:真渐变(原来 50 条色带拼的,能看见一道道横纹)
 *   - 纸纹:整幅窗景压一层很淡的水彩晕染 + 纸面颗粒,把原画和代码画的东西糊到同一张纸上
 *   - 窗框:木纹、倒角、墨线,和 room.webp 里的木梁一个画法
 *   - 圆盘:实心但边缘有几像素的柔化,太阳/月亮不再像剪纸贴片
 */

/* ---------------- 天空 ---------------- */

const SKY_KEY = 'paint_sky';
const SKY_H = 512;

/** 一张 4×512 的竖条 canvas,拉伸到全屏。每次换天色只重画这一条,很便宜。 */
export class SkyGradient {
  readonly img: Phaser.GameObjects.Image;
  private tex: Phaser.Textures.CanvasTexture;

  constructor(scene: Phaser.Scene, w: number, h: number) {
    if (scene.textures.exists(SKY_KEY)) scene.textures.remove(SKY_KEY);
    this.tex = scene.textures.createCanvas(SKY_KEY, 4, SKY_H)!;
    this.img = scene.add.image(0, 0, SKY_KEY).setOrigin(0, 0).setDisplaySize(w, h);
  }

  /** top → bot 的渐变,中段用 smoothstep 走,地平线附近的暖色才铺得开 */
  draw(top: number, bot: number): void {
    const ctx = this.tex.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, SKY_H);
    const css = (c: number) => `rgb(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255})`;
    const mix = (f: number) => {
      const r1 = (top >> 16) & 255, g1 = (top >> 8) & 255, b1 = top & 255;
      const r2 = (bot >> 16) & 255, g2 = (bot >> 8) & 255, b2 = bot & 255;
      const e = f * f * (3 - 2 * f);
      return `rgb(${Math.round(r1 + (r2 - r1) * e)},${Math.round(g1 + (g2 - g1) * e)},${Math.round(b1 + (b2 - b1) * e)})`;
    };
    g.addColorStop(0, css(top));
    for (let i = 1; i < 8; i++) g.addColorStop(i / 8, mix(i / 8));
    g.addColorStop(1, css(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, SKY_H);
    this.tex.refresh();
  }
}

/* ---------------- 纸纹 / 水彩晕染 ---------------- */

const PAPER_KEY = 'paint_paper';

/**
 * 一张浅色的纸:底色接近白,上面随机压几百团极淡的晕染和细颗粒。
 * 以 MULTIPLY 混合铺满窗口 —— 只会让画面某些地方微微发暗发暖,
 * 效果就是"所有东西都画在同一张水彩纸上"。
 */
export function addPaper(scene: Phaser.Scene, x: number, y: number, w: number, h: number,
                         alpha = 1): Phaser.GameObjects.TileSprite {
  if (!scene.textures.exists(PAPER_KEY)) {
    const S = 512;
    const tex = scene.textures.createCanvas(PAPER_KEY, S, S)!;
    const ctx = tex.getContext();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);
    const rnd = new Phaser.Math.RandomDataGenerator(['paper']);
    /* 大块晕染:颜色偏暖褐,画在 3×3 宫格的偏移上,保证无缝平铺 */
    for (let i = 0; i < 110; i++) {
      const cx = rnd.frac() * S, cy = rnd.frac() * S, r = 30 + rnd.frac() * 110;
      const a = 0.012 + rnd.frac() * 0.022;
      const tone = rnd.pick(['120,90,60', '90,80,110', '140,110,70']);
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        g.addColorStop(0, `rgba(${tone},${a})`);
        g.addColorStop(0.7, `rgba(${tone},${a * 0.6})`);
        g.addColorStop(1, `rgba(${tone},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
      }
    }
    /* 纸面颗粒 */
    const id = ctx.getImageData(0, 0, S, S);
    for (let p = 0; p < id.data.length; p += 4) {
      const n = (rnd.frac() - 0.5) * 12;
      id.data[p] += n; id.data[p + 1] += n; id.data[p + 2] += n;
    }
    ctx.putImageData(id, 0, 0);
    tex.refresh();
  }
  return scene.add.tileSprite(x, y, w, h, PAPER_KEY).setOrigin(0, 0)
    .setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(alpha);
}

/* ---------------- 软边圆盘(日月) ---------------- */

const DISC_KEY = 'paint_disc';

/** 实心圆,外缘约 8% 半径的柔化。白色,靠 tint 上色。 */
export function addDisc(scene: Phaser.Scene, x: number, y: number, r: number,
                        color: number): Phaser.GameObjects.Image {
  if (!scene.textures.exists(DISC_KEY)) {
    const S = 256, R = S / 2;
    const tex = scene.textures.createCanvas(DISC_KEY, S, S)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(R, R, 0, R, R, R);
    g.addColorStop(0.00, 'rgba(255,255,255,1)');
    g.addColorStop(0.60, 'rgba(255,255,255,1)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.97)');
    g.addColorStop(0.95, 'rgba(255,255,255,0.45)');
    g.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    tex.refresh();
  }
  return scene.add.image(x, y, DISC_KEY).setDisplaySize(r * 2.1, r * 2.1).setTint(color);
}

/* ---------------- 窗框 ---------------- */

const FRAME_KEY = 'paint_frame';

/**
 * 木窗框:四条木料 + 下沿一条宽一点的窗台。
 * 每条木料:顺纹的渐变底色 → 几十道深浅不一的木纹 → 内缘一道阴影、外缘一道受光 → 墨线勾边。
 * 画在一张和画布一样大的 canvas 上,中间留空。只画一次。
 */
export function addFrame(scene: Phaser.Scene, W: number, H: number, m: number,
                         sill: number): Phaser.GameObjects.Image {
  if (scene.textures.exists(FRAME_KEY)) scene.textures.remove(FRAME_KEY);
  const tex = scene.textures.createCanvas(FRAME_KEY, W, H)!;
  const ctx = tex.getContext();
  const rnd = new Phaser.Math.RandomDataGenerator(['frame']);
  const ink = '#1d130c';

  /* 一条木料:horizontal 决定木纹走向 */
  const plank = (x: number, y: number, w: number, h: number, horizontal: boolean,
                 base: [string, string]) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const g = horizontal ? ctx.createLinearGradient(0, y, 0, y + h)
                         : ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, base[0]); g.addColorStop(0.5, base[1]); g.addColorStop(1, base[0]);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    /* 木纹:顺着长边的细波浪线,深浅各半 */
    const span = horizontal ? h : w, len = horizontal ? w : h;
    for (let i = 0; i < span / 3; i++) {
      const off = rnd.frac() * span;
      const dark = rnd.frac() < 0.6;
      ctx.strokeStyle = dark ? `rgba(20,10,4,${0.10 + rnd.frac() * 0.18})`
                             : `rgba(255,220,170,${0.04 + rnd.frac() * 0.07})`;
      ctx.lineWidth = 0.8 + rnd.frac() * 2.2;
      ctx.beginPath();
      const amp = 1 + rnd.frac() * 4, freq = 0.002 + rnd.frac() * 0.006, ph = rnd.frac() * 6.28;
      for (let t = -20; t <= len + 20; t += 24) {
        const d = off + Math.sin(t * freq + ph) * amp;
        if (horizontal) (t < 0 ? ctx.moveTo(x + t, y + d) : ctx.lineTo(x + t, y + d));
        else (t < 0 ? ctx.moveTo(x + d, y + t) : ctx.lineTo(x + d, y + t));
      }
      ctx.stroke();
    }
    /* 几个木节 */
    for (let i = 0; i < Math.round(len / 700); i++) {
      const p = rnd.frac() * len, q = span * (0.3 + rnd.frac() * 0.4);
      const kx = horizontal ? x + p : x + q, ky = horizontal ? y + q : y + p;
      ctx.fillStyle = 'rgba(25,12,5,0.35)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, horizontal ? 14 : 6, horizontal ? 6 : 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = ink; ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  };

  const wood: [string, string] = ['#3b2818', '#58402a'];
  plank(0, 0, W, m, true, wood);                       // 上
  plank(0, m, m, H - m - sill, false, wood);           // 左
  plank(W - m, m, m, H - m - sill, false, wood);       // 右
  plank(0, H - sill, W, sill, true, ['#46301d', '#6a4c31']);   // 窗台

  /* 窗台的台面:靠窗一侧一道亮边,是受光的那个平面 */
  ctx.fillStyle = 'rgba(255,214,160,0.16)';
  ctx.fillRect(m * 0.4, H - sill + 3, W - m * 0.8, sill * 0.26);
  ctx.strokeStyle = ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, H - sill + sill * 0.3); ctx.lineTo(W, H - sill + sill * 0.3); ctx.stroke();

  /* 内缘倒角:窗洞一圈,上、左偏暗(背光),下、右偏亮 */
  const ix0 = m, iy0 = m, ix1 = W - m, iy1 = H - sill, b = 7;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(ix0, iy0, ix1 - ix0, b);
  ctx.fillRect(ix0, iy0, b, iy1 - iy0);
  ctx.fillStyle = 'rgba(255,200,140,0.14)';
  ctx.fillRect(ix0, iy1 - b, ix1 - ix0, b);
  ctx.fillRect(ix1 - b, iy0, b, iy1 - iy0);
  ctx.strokeStyle = ink; ctx.lineWidth = 4;
  ctx.strokeRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
  tex.refresh();
  return scene.add.image(0, 0, FRAME_KEY).setOrigin(0, 0);
}
