import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Achievements } from '../systems/achievements';

/**
 * 窗景 · 独立全屏一幕。转动右下角曲柄拨动时间:
 * 太阳/月亮划过天空,天色丝滑渐变,窗内外光照联动,
 * 星星渐次亮起,城镇灯一盏盏错落点亮,云慢慢飘。
 *
 * time: 0 = 白天正午, 1 = 深夜。
 * 素材(可选,没放会自动用代码占位):
 *   public/window_bg.png  窗外城镇风景(黄昏中性调)
 *   public/crank.png      铜曲柄(透明底)
 *   public/cloud1.png     云(透明底)
 */

const SKY_STOPS = [
  { t: 0.0,  top: 0x5a9ade, bot: 0xbfe0f5 },
  { t: 0.42, top: 0x4a6a9a, bot: 0xf0b070 },
  { t: 0.68, top: 0x30306a, bot: 0xd06a40 },
  { t: 1.0,  top: 0x080818, bot: 0x161632 },
];

/* 叠在背景图上的色调(白天透明→黄昏橙→夜深蓝) */
const TINT_STOPS = [
  { t: 0.0,  color: 0xffffff, alpha: 0.0 },
  { t: 0.45, color: 0xff9a50, alpha: 0.18 },
  { t: 0.7,  color: 0x503060, alpha: 0.35 },
  { t: 1.0,  color: 0x0a0a28, alpha: 0.62 },
];

export class WindowScene extends Phaser.Scene {
  private timeVal = 0.15;
  private hasBg = false;
  private hasCrank = false;
  private hasCloud = false;

  private sky!: Phaser.GameObjects.Graphics;
  private bg?: Phaser.GameObjects.Image;
  private tintLayer!: Phaser.GameObjects.Rectangle;
  private frameTint!: Phaser.GameObjects.Graphics;
  private sun!: Phaser.GameObjects.Container;
  private sunCore!: Phaser.GameObjects.Arc;
  private moon!: Phaser.GameObjects.Arc;
  private stars: { o: Phaser.GameObjects.Arc; th: number; ph: number }[] = [];
  private lamps: { o: Phaser.GameObjects.Rectangle; th: number }[] = [];
  private clouds: Phaser.GameObjects.GameObject[] = [];
  private crank!: Phaser.GameObjects.Container;
  private crankAngle = 0;
  private draggingCrank = false;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private leaving = false;

  private arc = { cx: W / 2, cy: H * 1.0, rx: W * 0.44, ry: H * 0.78 };

  constructor() { super('Window'); }

  preload(): void {
    /* 素材可能不存在:失败就用占位,不报致命错 */
    this.load.image('window_bg', '/window_bg.png');
    this.load.image('crank_img', '/crank.png');
    this.load.image('cloud1', '/cloud1.png');
    this.load.on('loaderror', () => { /* 忽略,create 里检测 */ });
  }

  create(): void {
    this.leaving = false;
    this.hasBg = this.textures.exists('window_bg') && !(this.textures.get('window_bg').key === '__MISSING');
    this.hasCrank = this.textures.exists('crank_img');
    this.hasCloud = this.textures.exists('cloud1');

    /* 1. 天空(最底,始终有——背景图透明处/无图时可见) */
    this.sky = this.add.graphics().setDepth(0);

    /* 2. 星星 */
    for (let i = 0; i < 90; i++) {
      const o = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(0, Math.round(H * 0.55)),
        Phaser.Math.FloatBetween(u(1), u(2.4)), 0xffffff, 0,
      ).setDepth(1);
      this.stars.push({ o, th: 0.5 + Math.random() * 0.45, ph: Math.random() * Math.PI * 2 });
    }

    /* 3. 太阳(带光晕)与月亮 */
    this.sun = this.add.container(0, 0).setDepth(2);
    const halo = this.add.circle(0, 0, u(64), 0xffdf90, 0.25);
    this.sunCore = this.add.circle(0, 0, u(40), 0xffe08a, 1);
    this.sun.add([halo, this.sunCore]);
    this.moon = this.add.circle(0, 0, u(30), 0xf0f0e2, 1).setDepth(2);

    /* 4. 窗外背景图(手绘城镇)或占位剪影 */
    if (this.hasBg) {
      const src = this.textures.get('window_bg').getSourceImage() as HTMLImageElement;
      const sc = Math.max(W / src.width, H / src.height);
      this.bg = this.add.image(W / 2, H / 2, 'window_bg').setScale(sc).setDepth(3);
    } else {
      this.buildTownPlaceholder();
    }

    /* 5. 城镇灯(叠在背景之上,错落点亮) */
    this.buildLights();

    /* 6. 云(慢慢飘) */
    this.buildClouds();

    /* 7. 全屏色调层(把整个窗外调成对应时段) */
    this.tintLayer = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(6);

    /* 8. 窗框(前景一圈)+ 窗框自己的色调层(窗内光照联动) */
    this.buildFrame();

    /* 9. 曲柄(右下角,拖着转) */
    this.buildCrank();

    this.add.text(W / 2, H - u(36), 'Turn the crank to move the sun · Esc to leave', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${15 * SCALE}px`,
      color: 'rgba(255,255,255,.8)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.6)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(30);

    this.keys = this.input.keyboard!.addKeys('ESC') as any;
    Achievements.unlock('window', this);
    this.cameras.main.fadeIn(500, 10, 12, 30);
    this.render();
  }

  /* 占位城镇剪影(无背景图时) */
  private buildTownPlaceholder(): void {
    const g = this.add.graphics().setDepth(3);
    g.fillStyle(0x1c1c30, 1);
    const rng = new Phaser.Math.RandomDataGenerator(['town2']);
    const baseY = H * 0.68;
    let x = -u(20);
    while (x < W + u(20)) {
      const bw = rng.between(u(70), u(140));
      const bh = rng.between(u(60), u(200));
      g.fillRect(x, baseY - bh, bw, bh + u(200));
      /* 屋顶三角 */
      g.fillTriangle(x, baseY - bh, x + bw, baseY - bh, x + bw / 2, baseY - bh - u(34));
      x += bw + u(8);
    }
  }

  /* 城镇灯:错落分布,各自阈值(时间过了各自阈值才亮) */
  private buildLights(): void {
    const rng = new Phaser.Math.RandomDataGenerator(['lights']);
    for (let i = 0; i < 46; i++) {
      const o = this.add.rectangle(
        rng.between(u(30), W - u(30)),
        rng.between(Math.round(H * 0.52), Math.round(H * 0.8)),
        u(rng.between(6, 11)), u(rng.between(9, 15)),
        0xffd070, 0,
      ).setDepth(4);
      this.lamps.push({ o, th: 0.55 + rng.frac() * 0.35 });
    }
  }

  private buildClouds(): void {
    for (let i = 0; i < 3; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(Math.round(H * 0.08), Math.round(H * 0.3));
      if (this.hasCloud) {
        const c = this.add.image(x, y, 'cloud1').setDepth(5)
          .setAlpha(0.8).setScale(0.4 + Math.random() * 0.35);
        (c as any)._speed = u(4 + Math.random() * 5);
        this.clouds.push(c);
      } else {
        /* 占位云:几个叠圆 */
        const c = this.add.container(x, y).setDepth(5).setAlpha(0.5);
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, 0, u(26)); g.fillCircle(u(24), u(4), u(20)); g.fillCircle(-u(24), u(5), u(18));
        c.add(g);
        (c as any)._speed = u(4 + Math.random() * 5);
        this.clouds.push(c);
      }
    }
  }

  /* 窗框:四周一圈木框 + 同步窗内光照的色调层 */
  private buildFrame(): void {
    const g = this.add.graphics().setDepth(10);
    const m = u(46);
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(0, 0, W, m); g.fillRect(0, H - m, W, m);
    g.fillRect(0, 0, m, H); g.fillRect(W - m, 0, m, H);
    /* 内缘亮线 */
    g.lineStyle(u(3), 0x5a4128, 1);
    g.strokeRect(m, m, W - m * 2, H - m * 2);

    /* 窗框色调层(随时间明暗,窗内联动感) */
    this.frameTint = this.add.graphics().setDepth(11);
  }

  /* 曲柄:右下角。拖动指针绕曲柄中心转 → 角度累计映射时间 */
  private buildCrank(): void {
    const cx = W - u(110);
    const cy = H - u(120);
    this.crank = this.add.container(cx, cy).setDepth(20);

    if (this.hasCrank) {
      const img = this.add.image(0, 0, 'crank_img').setOrigin(0.2, 0.5);
      const sc = u(120) / Math.max(img.width, img.height);
      img.setScale(sc);
      this.crank.add(img);
    } else {
      /* 占位曲柄:轴心圆+臂+握把 */
      const g = this.add.graphics();
      g.fillStyle(0x8a6a3a, 1); g.fillCircle(0, 0, u(14));
      g.lineStyle(u(9), 0xa8823f, 1); g.lineBetween(0, 0, u(52), -u(30));
      g.fillStyle(0xc8a050, 1); g.fillCircle(u(52), -u(30), u(12));
      this.crank.add(g);
    }

    /* 大点击区,拖动旋转 */
    const hit = this.add.circle(cx, cy, u(90), 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true }).setDepth(21);
    let lastAng = 0;
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.draggingCrank = true;
      lastAng = Math.atan2(p.y - cy, p.x - cx);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.draggingCrank) return;
      const ang = Math.atan2(p.y - cy, p.x - cx);
      let d = ang - lastAng;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      lastAng = ang;
      this.crankAngle += d;
      this.crank.setRotation(this.crankAngle);
      /* 一整圈≈时间走 0.3;顺时针加,逆时针减 */
      this.timeVal = Phaser.Math.Clamp(this.timeVal + d / (Math.PI * 2) * 0.3, 0, 1);
      this.render();
    });
    this.input.on('pointerup', () => { this.draggingCrank = false; });
  }

  /* ---------- 按 time 渲染 ---------- */
  private render(): void {
    const t = this.timeVal;

    /* 天空 */
    const [top, bot] = this.stopColor(SKY_STOPS, t);
    this.sky.clear();
    const bands = 50;
    for (let i = 0; i < bands; i++) {
      this.sky.fillStyle(this.lerpColor(top, bot, i / bands), 1);
      this.sky.fillRect(0, (H / bands) * i, W, H / bands + 1);
    }

    /* 太阳/月亮位置 */
    const ang = Math.PI * (1 - t);
    const bx = this.arc.cx - Math.cos(ang) * this.arc.rx;
    const by = this.arc.cy - Math.sin(ang) * this.arc.ry;
    /* 太阳落到低处变大变红 */
    const lowness = Phaser.Math.Clamp((t - 0.3) / 0.4, 0, 1);   // 越接近地平线越大越红
    this.sun.setPosition(bx, by);
    this.sun.setScale(1 + lowness * 0.45);
    this.sunCore.setFillStyle(this.lerpColor(0xffe08a, 0xff6a3a, lowness));
    this.sun.setAlpha(Phaser.Math.Clamp(1 - (t - 0.55) * 5, 0, 1));
    /* 月亮:后半程从另一侧升起 */
    const mt = Phaser.Math.Clamp((t - 0.55) / 0.45, 0, 1);
    const mang = Math.PI * (1 - mt * 0.5);
    this.moon.setPosition(
      this.arc.cx - Math.cos(mang) * this.arc.rx,
      this.arc.cy - Math.sin(mang) * this.arc.ry,
    );
    this.moon.setAlpha(mt);

    /* 全屏色调层 */
    const [tc, ta] = this.tintAt(t);
    this.tintLayer.setFillStyle(tc, 1).setAlpha(ta);

    /* 窗框光照联动:白天亮暖光,夜里暗 */
    this.frameTint.clear();
    const frameDark = Phaser.Math.Clamp((t - 0.3) / 0.7, 0, 1);
    this.frameTint.fillStyle(0x000020, frameDark * 0.5);
    const m = u(46);
    this.frameTint.fillRect(0, 0, W, m); this.frameTint.fillRect(0, H - m, W, m);
    this.frameTint.fillRect(0, 0, m, H); this.frameTint.fillRect(W - m, 0, m, H);
    /* 黄昏时窗框内缘染一道橙光 */
    const dusk = Phaser.Math.Clamp(1 - Math.abs(t - 0.5) * 4, 0, 1);
    if (dusk > 0.01) {
      this.frameTint.lineStyle(u(4), 0xff9a50, dusk * 0.6);
      this.frameTint.strokeRect(m, m, W - m * 2, H - m * 2);
    }

    /* 星星(渐次:各自阈值) */
    for (const s of this.stars) {
      const a = Phaser.Math.Clamp((t - s.th) * 6, 0, 1);
      (s.o as any)._base = a;
    }
    /* 城镇灯(错落点亮) */
    for (const l of this.lamps) {
      const a = Phaser.Math.Clamp((t - l.th) * 8, 0, 1);
      l.o.setAlpha(a * 0.95);
    }
  }

  private tintAt(t: number): [number, number] {
    for (let i = 0; i < TINT_STOPS.length - 1; i++) {
      const a = TINT_STOPS[i], b = TINT_STOPS[i + 1];
      if (t >= a.t && t <= b.t) {
        const f = (t - a.t) / (b.t - a.t);
        return [this.lerpColor(a.color, b.color, f), a.alpha + (b.alpha - a.alpha) * f];
      }
    }
    const last = TINT_STOPS[TINT_STOPS.length - 1];
    return [last.color, last.alpha];
  }

  private stopColor(stops: typeof SKY_STOPS, t: number): [number, number] {
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (t >= a.t && t <= b.t) {
        const f = (t - a.t) / (b.t - a.t);
        return [this.lerpColor(a.top, b.top, f), this.lerpColor(a.bot, b.bot, f)];
      }
    }
    const last = stops[stops.length - 1];
    return [last.top, last.bot];
  }

  private lerpColor(c1: number, c2: number, f: number): number {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    return (Math.round(r1 + (r2 - r1) * f) << 16)
      | (Math.round(g1 + (g2 - g1) * f) << 8)
      | Math.round(b1 + (b2 - b1) * f);
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;

    /* 云慢慢飘 */
    for (const c of this.clouds) {
      const obj = c as any;
      obj.x += obj._speed * dt;
      if (obj.x > W + u(80)) obj.x = -u(80);
    }

    /* 星星闪烁 */
    for (const s of this.stars) {
      s.ph += dt * 2;
      const base = (s.o as any)._base ?? 0;
      s.o.setAlpha(base * (0.6 + 0.4 * Math.sin(s.ph)));
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.leave();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(500, 10, 12, 30);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Room'));
  }
}