import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Achievements } from '../systems/achievements';
import { addFireShader } from '../systems/FireShader';
import { FireAudio } from '../systems/FireAudio';
import { addGlow } from '../systems/glow';

/**
 * 壁炉近景 · 独立一幕。
 * 从 RoomScene 按 E 进入(scene.start('Fireplace'))。
 *
 * 体验:淡入 → 暗炉膛(熄灭) → 点击打火石(第一下擦火花不着,第二下点燃)
 *       → 火由小渐旺 → 按 E 添柴更旺 → 加满文字浮现 → Esc 离开。
 *
 * 交互分工:点击=打火 / E=加柴 / Esc=离开。
 *
 * 火焰位置:第一次点击时,以点击位置作为火焰底部中心(FIRE_X/FIRE_Y)。
 * 这样你点柴堆哪里,火就从哪里升起,不用手动量坐标。
 *
 * 需要 public/fireplace_bg.png。
 */

/* 火焰横向散布半径(屏幕像素),只给火星用 */
const FIRE_SPREAD = u(110);

/* 火焰倾斜:正值往右偏,负值往左偏。匹配壁炉斜视角。 */
const FIRE_LEAN = u(14);

/* 着色器画布(火焰能长到的最大范围) */
const FLAME_W = u(330), FLAME_H = u(330);

/**
 * 炉架(画布像素,从 fireplace_bg 上量的)。炉架是一块透视里的长方形:
 * 后沿从 (960,845) 到 (1380,812),前沿从 (1100,920) 到 (1580,883);两根前立柱在 x≈1078–1118 和 1548–1595。
 * 木柴必须躺在两根前立柱之间 —— 原来的柴从 x=1085 画起,直接横穿了左边的铁柱子。
 */
const GRATE = {
  backY: (x: number) => 845 + (x - 960) * (-33 / 420),
  frontY: (x: number) => 920 + (x - 1100) * (-37 / 480),
  postL: [1076, 1120] as const, postR: [1546, 1597] as const,
};
/** 炉架面上某个深度 t(0 = 后沿,1 = 前沿)、某个 x 处的 y */
const grateY = (x: number, t: number) => GRATE.backY(x) + (GRATE.frontY(x) - GRATE.backY(x)) * t;

interface Log { a: number[]; b: number[]; r: number; t: number; layer: number }
/**
 * 柴堆:3-2-1 的金字塔,每根都和炉架前沿平行。
 *   底层三根:后 / 中 / 前,贴着炉架面;
 *   中层两根:各架在底层两根之间的那道槽里;
 *   顶层一根:架在中层两根之间。
 * 进场就有底层三根,按 E 依次添中层两根、顶层一根。上层的柴压在下层的缝里,
 * 和下层只是前后遮挡、不会互相"插"进去 —— 原来是两根交叉画在同一个高度上,看着就是穿模。
 * 近处的柴半径大一点(透视),左右两端收在两根前立柱之间。
 */
function buildLogs(): Log[] {
  const x0 = 1146, x1 = 1522;                    // 前排两端,离两根立柱各留一点空
  const row = (t: number, r: number, lift: number, layer: number): Log => {
    const shift = (1 - t) * -22;                 // 越靠后,整根往左挪一点(炉架后沿比前沿偏左)
    const ax = x0 + shift + (1 - t) * 14, bx = x1 + shift - (1 - t) * 14;
    return { a: [ax, grateY(ax, t) - r - lift], b: [bx, grateY(bx, t) - r - lift], r, t, layer };
  };
  const B = [row(0.10, 21, 0, 0), row(0.48, 23, 0, 0), row(0.86, 25, 0, 0)];
  /* 架在两根柴之间:深度取两者中间,高度抬到能同时搭在两根上的位置 */
  const onTop = (p: Log, q: Log, r: number, layer: number): Log => {
    const t = (p.t + q.t) / 2;
    const gap = Math.abs(((p.a[1] + p.b[1]) - (q.a[1] + q.b[1])) / 2);   // 两根下层柴的屏幕间距
    const base = Math.min((p.a[1] + q.a[1]) / 2, (p.b[1] + q.b[1]) / 2);
    const lift = Math.sqrt(Math.max(0, (p.r + r) ** 2 - (gap / 2) ** 2)) * 0.9;
    const L = row(t, r, 0, layer);
    const dy = ((p.a[1] + q.a[1]) / 2 - lift) - L.a[1];
    L.a[1] += dy; L.b[1] += dy;
    void base;
    return L;
  };
  const M = [onTop(B[0], B[1], 22, 1), onTop(B[1], B[2], 23, 1)];
  const T = onTop(M[0], M[1], 21, 2);
  /* 每根长短、左右位置都错开一点,不像一排一模一样的铅笔 */
  const jitter = [[6, -4], [-10, 8], [14, -12], [-8, -18], [18, 4], [-4, -24]];
  return [...B, ...M, T].map((L, i) => {
    const [da, db] = jitter[i];
    const k = (L.b[1] - L.a[1]) / (L.b[0] - L.a[0]);
    return { ...L, a: [L.a[0] + da, L.a[1] + da * k], b: [L.b[0] + db, L.b[1] + db * k] };
  });
}
const LOGS = buildLogs();
const BASE_LOGS = 3;
/** 深度 t 大于它的柴压在火焰前面,其余在火焰后面 —— 火是从柴缝里钻出来的 */
const FRONT_T = 0.3;      // 只有最后面那根底柴在火后面,其余都压在火前面,火从柴堆顶上冒出来

/* ===== 火势 ===== */
const MAX_LOGS = LOGS.length - BASE_LOGS;   // 最多加几次柴(3:中层两根 + 顶层一根)
const LIT_INTENSITY = 0.35;  // 刚点燃后渐旺到的初始小火强度
const IGNITE_TRIES = 2;      // 需要点几下才点着(第2下着)

export class FireplaceScene extends Phaser.Scene {
  private emberEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flame!: Phaser.GameObjects.Shader;
  /** 每根柴一对图层:木头 + 它自己的余烬。按深度排好,遮挡关系才对 */
  private grateGlow?: Phaser.GameObjects.Image;
  private logLayers: { log: Phaser.GameObjects.Graphics; ember: Phaser.GameObjects.Graphics;
                       cracks: Phaser.Geom.Point[][] }[] = [];
  private lightWarm!: Phaser.GameObjects.Image;
  private lightBox!: Phaser.GameObjects.Image;
  private lightFloor!: Phaser.GameObjects.Image;
  private vignette!: Phaser.GameObjects.Graphics;
  private flick = 0.5;
  private flickTarget = 0.5;
  private flickTimer = 0;
  private clock = 0;
  private audio = new FireAudio();
  private hint!: Phaser.GameObjects.Text;
  private story!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private intensity = 0;
  private targetIntensity = 0;
  private logs = 0;
  private glowPulse = 0;
  private leaving = false;

  private lit = false;
  private igniteTries = 0;

  /* 火焰底部中心(屏幕像素),在炉架柴堆中间 */
  private fireX = 1334;       // 柴堆正中
  private fireY = 872;

  constructor() { super('Fireplace'); }

  preload(): void {
    this.load.image('fireplace_bg', '/fireplace_bg.webp');
    this.makeParticleTexture();
  }

  create(): void {
    this.leaving = false;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.logs = 0;
    this.lit = false;
    this.igniteTries = 0;

    /* 暗场底 */
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0f0a).setDepth(-1);

    /* 背景完整装进屏幕 */
    const src = this.textures.get('fireplace_bg').getSourceImage() as HTMLImageElement;
    const scale = Math.min(W / src.width, H / src.height);
    const bg = this.add.image(W / 2, H / 2, 'fireplace_bg').setScale(scale).setDepth(0);

    /* 边缘渐隐融合 */
    const bgLeft = bg.x - bg.displayWidth / 2;
    const bgRight = bg.x + bg.displayWidth / 2;
    const fade = this.add.graphics().setDepth(1);
    const fw = u(80);
    for (let i = 0; i < fw; i++) {
      const a = (1 - i / fw) * 0.9;
      fade.fillStyle(0x1a0f0a, a);
      fade.fillRect(bgLeft + i, 0, 1, H);
      fade.fillRect(bgRight - i - 1, 0, 1, H);
    }

    /* 压角 */
    /* 火越旺,压角越淡 —— 屋子被火照亮 */
    this.vignette = this.add.graphics().setDepth(1);
    this.vignette.fillStyle(0x0a0608, 1);
    this.vignette.fillRect(0, 0, W, H);
    this.vignette.setAlpha(0.5);

    /* 火焰粒子(进场熄灭) */
    this.buildFire();

    this.buildUI();

    this.keys = this.input.keyboard!.addKeys('E,ESC') as any;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.strike(p));

    this.cameras.main.fadeIn(600, 20, 12, 8);
  }

  private makeParticleTexture(): void {
    const size = 32;
    const c = this.textures.createCanvas('spark', size, size);
    if (!c) return;
    const ctx = c.getContext();
    /* 硬边实心圆:中心实、边缘快速收窄(不是柔光渐变),更贴插画平涂感 */
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,1)');   // 大部分实心
    g.addColorStop(0.85, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');       // 只有最外圈软一点点
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    c.refresh();
  }

  /* ---------- 火焰 ---------- */
  /**
   * 层次(从后往前):
   *   炉膛里的火光(ADD) → 后排木柴 + 余烬 → 火焰着色器 → 前排木柴 + 余烬 → 火星
   *   → 照在石头和地面上的暖光(ADD)。
   */
  private buildFire(): void {
    /* 光:炉膛内壁、整片石墙、炉前地面,各一团 */
    this.lightBox = addGlow(this, this.fireX, this.fireY - u(110), u(230), 0xff7a2e, 0, u(200)).setDepth(1.5);
    this.lightWarm = addGlow(this, this.fireX, this.fireY - u(60), u(620), 0xff9a50, 0, u(430)).setDepth(7);
    this.lightFloor = addGlow(this, this.fireX, this.fireY + u(80), u(420), 0xffa25a, 0, u(90)).setDepth(7);

    this.flame = addFireShader(this, this.fireX, this.fireY + u(4), FLAME_W, FLAME_H).setDepth(3);
    this.buildGrateFront();
    this.drawLogs();

    /* 火星:很小、很亮,往上飘的时候左右晃 */
    this.emberEmitter = this.add.particles(this.fireX, this.fireY - u(30), 'spark', {
      x: { min: -FIRE_SPREAD * 0.5, max: FIRE_SPREAD * 0.5 },
      speedY: { min: -u(170), max: -u(90) },
      speedX: { min: -u(25) + FIRE_LEAN, max: u(25) + FIRE_LEAN },
      accelerationX: { min: -u(60), max: u(60) },
      scale: { start: 0.09 * SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 900, max: 1800 },
      frequency: 140,
      quantity: 1,
      tint: [0xffe9a8, 0xffc061, 0xff9a3a],
      blendMode: 'ADD',
    }).setDepth(5);
    this.emberEmitter.stop();
  }

  /**
   * 炉架的前沿横杆和两根前立柱,从背景原画里原样抠出来,盖在木柴上面。
   * 木柴躺在炉架里,前面那根横杆和两根柱子本来就该挡住柴的下沿和两头 —— 不盖的话,
   * 柴是画在整张背景上面的,炉架被柴压住,看着就像柴穿过了铁架子。
   */
  private buildGrateFront(): void {
    const key = 'grate_front';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, W, H);
    if (!tex) return;
    const ctx = tex.getContext();
    const src = this.textures.get('fireplace_bg').getSourceImage() as HTMLImageElement;
    const sc = Math.min(W / src.width, H / src.height);
    const ox = (W - src.width * sc) / 2, oy = (H - src.height * sc) / 2;
    ctx.save();
    ctx.beginPath();
    /* 前沿横杆:沿着前沿那条斜线,上下各留一点 */
    const fx0 = GRATE.postL[0], fx1 = GRATE.postR[1];
    ctx.moveTo(fx0, GRATE.frontY(fx0) - 4); ctx.lineTo(fx1, GRATE.frontY(fx1) - 4);
    ctx.lineTo(fx1, GRATE.frontY(fx1) + 14); ctx.lineTo(fx0, GRATE.frontY(fx0) + 14);
    ctx.closePath();
    /* 立柱不用抠:柴的两端已经收在两根立柱之间,碰不到。抠了反而会把柱子周围没被火照亮的石头
       一起盖上来,火一亮就看得见一个方框。 */
    ctx.clip();
    ctx.drawImage(src, ox, oy, src.width * sc, src.height * sc);
    ctx.restore();
    tex.refresh();
    this.add.image(0, 0, key).setOrigin(0, 0).setDepth(4.9);
    /* 横杆也该被火照亮:叠一层和炉膛光一样的暖光(只在横杆那一条) */
    this.grateGlow = addGlow(this, this.fireX, GRATE.frontY(this.fireX) + 5, u(230), 0xff7a2e, 0, u(40))
      .setDepth(4.95);
  }

  /**
   * 画木柴(添柴时重画)。画法和原画的柴堆一致:
   * 墨线 → 树皮固有色 → 上沿一道受光 → 下沿压暗 → 右端露出年轮截面。
   * 每根柴一个图层,深度按(前后 t,上下 layer)排:后面的先画,上层的压在同一排下层的上面;
   * 深度 t > FRONT_T 的在火焰前面(depth 4.x),其余在火焰后面(depth 2.x)。
   * 每根柴还预生成几条"裂缝",点着以后裂缝里透出余烬的红光,画在紧贴这根柴的上一层。
   */
  private drawLogs(): void {
    for (const l of this.logLayers) { l.log.destroy(); l.ember.destroy(); }
    this.logLayers = [];
    const n = BASE_LOGS + this.logs;
    const ink = 0x1a120c;
    const P = (x: number, y: number) => new Phaser.Geom.Point(x, y);
    const order = [...Array(n).keys()].sort((i, j) =>
      (LOGS[i].t + LOGS[i].layer * 0.001) - (LOGS[j].t + LOGS[j].layer * 0.001));
    order.forEach((i, rank) => {
      const L = LOGS[i];
      const front = L.layer > 0 || L.t > FRONT_T;
      const base = (front ? 4 : 2) + rank * 0.02;
      const g = this.add.graphics().setDepth(base);
      const ember = this.add.graphics().setDepth(base + 0.01).setBlendMode(Phaser.BlendModes.ADD);
      const rng = new Phaser.Math.RandomDataGenerator([`log${i}`]);   // 每根柴自己的种子,添柴时别的柴不会变样
      const [ax, ay] = L.a, [bx, by] = L.b;
      const r = L.r;
      const len = Math.hypot(bx - ax, by - ay);
      const nx = -(by - ay) / len, ny = (bx - ax) / len;         // 法线(朝下)
      const quad = (o0: number, o1: number) => [
        P(ax + nx * o0, ay + ny * o0), P(bx + nx * o0, by + ny * o0),
        P(bx + nx * o1, by + ny * o1), P(ax + nx * o1, ay + ny * o1)];
      /* 墨线 + 固有色 */
      g.fillStyle(ink, 1); g.fillPoints(quad(-r - 3, r + 3), true);
      g.fillCircle(ax, ay, r + 3);
      g.fillStyle(0x3a2619, 1); g.fillPoints(quad(-r, r), true);
      g.fillCircle(ax, ay, r);
      /* 上沿受光、下沿背光 */
      g.fillStyle(0x5a3b26, 1); g.fillPoints(quad(-r * 0.95, -r * 0.35), true);
      g.fillStyle(0x20140c, 1); g.fillPoints(quad(r * 0.45, r * 0.95), true);
      /* 树皮纹:顺着木头方向的几道短墨线 */
      g.lineStyle(2, ink, 0.7);
      for (let k = 0; k < 5; k++) {
        const f0 = rng.frac() * 0.8, f1 = f0 + 0.08 + rng.frac() * 0.15;
        const o = (rng.frac() - 0.5) * r * 1.2;
        g.lineBetween(ax + (bx - ax) * f0 + nx * o, ay + (by - ay) * f0 + ny * o,
                      ax + (bx - ax) * f1 + nx * o, ay + (by - ay) * f1 + ny * o);
      }
      /* 右端截面:椭圆 + 年轮 */
      g.fillStyle(ink, 1); g.fillEllipse(bx, by, r * 1.3 + 6, r * 2 + 6);
      g.fillStyle(0x5e4632, 1); g.fillEllipse(bx, by, r * 1.3, r * 2);
      g.fillStyle(0x76583e, 1); g.fillEllipse(bx - r * 0.1, by - r * 0.15, r * 0.9, r * 1.4);
      g.lineStyle(1.6, 0x3a2416, 0.9);
      for (let k = 1; k <= 3; k++) g.strokeEllipse(bx, by, r * 1.3 * k / 3.6, r * 2 * k / 3.6);

      /* 余烬裂缝:贴着下半截,折线 */
      const cracks: Phaser.Geom.Point[][] = [];
      for (let k = 0; k < 3; k++) {
        const pts: Phaser.Geom.Point[] = [];
        let f = 0.12 + rng.frac() * 0.6;
        let o = r * (0.1 + rng.frac() * 0.5);
        for (let m = 0; m < 4; m++) {
          pts.push(P(ax + (bx - ax) * f + nx * o, ay + (by - ay) * f + ny * o));
          f += 0.03 + rng.frac() * 0.05; o += (rng.frac() - 0.5) * r * 0.3;
        }
        cracks.push(pts);
      }
      this.logLayers.push({ log: g, ember, cracks });
    });
    /* 火焰的根跟着柴堆的顶走:柴越摞越高,火从更高的地方冒出来,不会被新添的柴整个盖住 */
    let top = Infinity;
    for (let i = 0; i < n; i++) top = Math.min(top, (LOGS[i].a[1] + LOGS[i].b[1]) / 2);
    this.flame?.setY(Math.min(this.fireY + u(4), top + 12));
  }

  /** 每帧:余烬裂缝随火势和闪烁明暗 */
  private drawEmbers(): void {
    const I = this.intensity;
    const a = Phaser.Math.Clamp(I * 1.4, 0, 1) * (0.55 + 0.45 * this.flick);
    for (const l of this.logLayers) {
      l.ember.clear();
      if (I < 0.02) continue;
      for (const pts of l.cracks) {
        l.ember.lineStyle(u(3.2), 0xff5a1e, a * 0.55);
        l.ember.strokePoints(pts);
        l.ember.lineStyle(u(1.2), 0xffc070, a);
        l.ember.strokePoints(pts);
      }
    }
  }

  /** 火势 → 火星发射与否 */
  private applyIntensity(): void {
    const i = this.intensity;
    if (i <= 0.02) { this.emberEmitter.stop(); return; }
    if (!this.emberEmitter.emitting) this.emberEmitter.start();
    this.emberEmitter.frequency = Math.max(35, 160 - i * 120);
  }

  /* ---------- UI ---------- */
  private buildUI(): void {
    this.hint = this.add.text(W / 2, H - u(70), 'Click the logs to strike a light', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${17 * SCALE}px`, color: 'rgba(255,240,220,.9)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.7)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(20);

    this.story = this.add.text(W / 2, H * 0.28, '', {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${30 * SCALE}px`, color: '#ffe8c8', align: 'center',
      lineSpacing: u(10),
      shadow: { offsetX: 0, offsetY: 0, color: '#ff9a4a', blur: 18, fill: true },
      wordWrap: { width: u(520) },
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
  }

  /* ---------- 打火石:点击触发 ---------- */
  private strike(_p: Phaser.Input.Pointer): void {
    if (this.leaving) return;
    if (this.lit) return;

    this.igniteTries++;
    this.audio.start();             // 浏览器要求用户操作之后才能出声

    /* 擦火石:在火焰位置迸一簇白亮火星 */
    this.sparkBurst();

    if (this.igniteTries >= IGNITE_TRIES) {
      this.lit = true;
      this.targetIntensity = LIT_INTENSITY;
      this.hint.setText('Press E to add wood · Esc to leave');
      Achievements.unlock('fire', this);
    } else {
      this.hint.setText('Try again');
    }
  }

  /** 打火石火星:一簇白亮小火星四散 */
  private sparkBurst(): void {
    const p = this.add.particles(this.fireX, this.fireY, 'spark', {
      speed: { min: u(60), max: u(240) },
      angle: { min: 200, max: 340 },
      scale: { start: 0.3 * SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 200, max: 500 },
      tint: [0xffffff, 0xfff2c0, 0xffd27a],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(6);
    p.explode(20);
    this.glowPulse = Math.max(this.glowPulse, 0.5);
    this.time.delayedCall(700, () => p.destroy());
  }

  /* ---------- 加柴 ---------- */
  private addLog(): void {
    if (!this.lit) return;
    if (this.logs >= MAX_LOGS) return;
    this.logs++;
    this.drawLogs();
    this.targetIntensity = Math.min(1, LIT_INTENSITY + this.logs * (0.65 / MAX_LOGS) + 0.15);

    this.emberEmitter.explode(18, this.fireX, this.fireY);
    this.glowPulse = 1;

    if (this.logs >= MAX_LOGS) {
      this.revealStory();
      this.hint.setText('Esc to leave');
    }
  }

  private revealStory(): void {
    this.story.setText('The fire is warm now.\nA few words about me go here.');
    this.tweens.add({ targets: this.story, alpha: 1, duration: 1400, ease: 'Sine.easeOut' });
  }

  /* ---------- 离开 ---------- */
  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.audio.stop();
    this.cameras.main.fadeOut(500, 20, 12, 8);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Room');
    });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.addLog();
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.leave();

    /* 火势平滑逼近目标(由小渐旺) */
    if (Math.abs(this.intensity - this.targetIntensity) > 0.001) {
      this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, 2 * dt);
      this.applyIntensity();
    }

    /* 加柴脉动衰减 */
    this.glowPulse *= (1 - 3 * dt);

    /* 闪烁:每 60~140ms 换一个随机目标,平滑追过去 —— 真火的明暗是不规则的跳,不是正弦 */
    this.clock += dt;
    this.flickTimer -= dt;
    if (this.flickTimer <= 0) {
      this.flickTimer = 0.06 + Math.random() * 0.08;
      this.flickTarget = Math.random();
    }
    this.flick += (this.flickTarget - this.flick) * Math.min(1, dt * 14);

    const I = this.intensity;
    const glow = Phaser.Math.Clamp(I * (0.82 + 0.18 * this.flick) + this.glowPulse * 0.25, 0, 1.2);
    this.flame.setUniform('uTime.value', this.clock);
    this.flame.setUniform('uIntensity.value', Math.min(1, I + this.glowPulse * 0.15));
    this.flame.setUniform('uFlicker.value', this.flick);
    this.flame.setUniform('uLean.value', 0.12 + 0.05 * Math.sin(this.clock * 0.7));
    this.lightBox.setAlpha(glow * 0.55);
    this.grateGlow?.setAlpha(glow * 0.45);
    this.lightWarm.setAlpha(glow * 0.42);
    this.lightFloor.setAlpha(glow * 0.32);
    /* 光源在晃,光晕中心也跟着轻轻晃 */
    this.lightWarm.x = this.fireX + (this.flick - 0.5) * u(14);
    this.vignette.setAlpha(0.52 - 0.3 * Math.min(1, I));
    this.drawEmbers();
    this.audio.update(dt, I);
  }
}