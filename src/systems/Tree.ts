import Phaser from 'phaser';

/**
 * 程序化树。递归分枝生成骨架,叶子挂在末梢 —— 不用任何美术资源。
 * 画法(墨线 + 锥形枝 + 三遍上色的叶团)只在本文件,tools/tree.py 只负责形状。
 *
 * 四季只换叶子的颜色和密度,骨架一根不动 ——
 * 这是"同一棵树在过四季"而不是"四棵不同的树在切换",观感差别很大。
 *
 * 形状是在 tools/tree.py 里调好的,那边和这边用同一个 LCG 随机数,
 * 逐位一致,所以 Python 预览里长什么样,游戏里就长什么样。改一边记得同步另一边。
 */

/** 线性同余。不用 Math.random:换季重画时必须每次长出同一棵树。 */
class LCG {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0;
    return this.s / 0x100000000;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
}

interface Branch { x1: number; y1: number; x2: number; y2: number; w: number; d: number }
interface LeafPt { x: number; y: number; s: number; j: number }

function grow(seed: number): { branches: Branch[]; leaves: LeafPt[] } {
  const rng = new LCG(seed);
  const branches: Branch[] = [];
  const leaves: LeafPt[] = [];

  const rec = (x: number, y: number, ang: number, len: number, w: number, d: number): void => {
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    branches.push({ x1: x, y1: y, x2, y2, w, d });

    if (d >= 4) {
      /* 末梢挂叶。数量刻意压着:树在屏幕上只有 500px 高,
         叶点撒到两千个纯属浪费,每次换季重画都要多花几毫秒。 */
      const n = 1 + Math.floor(rng.range(0, 2));
      for (let i = 0; i < n; i++) {
        const f = rng.range(0.35, 1.0);
        leaves.push({ x: x + (x2 - x) * f, y: y + (y2 - y) * f,
                      s: rng.range(0.6, 1.0), j: rng.next() * Math.PI * 2 });
      }
    }
    if (d >= 6 || len < 5) return;

    /* 分叉:角度带随机,不然会长成对称的圣诞树 */
    const k = rng.next() < 0.78 ? 2 : 3;
    for (let i = 0; i < k; i++) {
      let spread = rng.range(0.30, 0.62) * (i % 2 === 0 ? 1 : -1);
      if (k === 3 && i === 2) spread = rng.range(-0.18, 0.18);
      rec(x2, y2, ang + spread + rng.range(-0.09, 0.09),
          len * rng.range(0.66, 0.80), w * 0.70, d + 1);
    }
  };

  rec(0, 0, rng.range(-0.06, 0.06), 118, 15, 0);
  return { branches, leaves };
}

/** 四季叶态:颜色池、密度、尺寸。春天的池子里混两种花色,于是十片里有三片是花。 */
const LEAF = [
  { cols: [0x9ccb63, 0xb8dd7a, 0x86bb56, 0xe9a9c4, 0xf3c6d8, 0xa9d472], dens: 0.60, size: 0.85 },
  { cols: [0x3f7a35, 0x4f8f3c, 0x2f6630, 0x69a24a], dens: 1.00, size: 1.00 },
  { cols: [0xd9973a, 0xc7642c, 0xe8bd63, 0xa4472a], dens: 0.72, size: 0.95 },
  { cols: [0x8a8f96], dens: 0.0, size: 0.0 },
];
const BARK = [0x4b3a2c, 0x40332a, 0x4a382a, 0x51473f];

interface Falling { x: number; y: number; vx: number; vy: number; ph: number; c: number; life: number }

/* ---- 颜色小工具 ---- */
const rgbOf = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
const pack = (r: number, g: number, b: number) =>
  (Math.round(Phaser.Math.Clamp(r, 0, 255)) << 16)
  | (Math.round(Phaser.Math.Clamp(g, 0, 255)) << 8) | Math.round(Phaser.Math.Clamp(b, 0, 255));
/** 乘法染色:和地景的 setTint(multiply) 是同一个算法,树和山才在同一种光里 */
const mul = (c: number, t: number) => {
  const [r, g, b] = rgbOf(c), [tr, tg, tb] = rgbOf(t);
  return pack(r * tr / 255, g * tg / 255, b * tb / 255);
};
/** 往某个颜色推:暗部推向冷紫褐(不是纯黑 —— 水彩的阴影从来不是黑的),亮部推向暖白 */
const toward = (c: number, to: number, f: number) => {
  const [r, g, b] = rgbOf(c), [r2, g2, b2] = rgbOf(to);
  return pack(r + (r2 - r) * f, g + (g2 - g) * f, b + (b2 - b) * f);
};
const SHADE = 0x2a2238;      // 阴影色:偏紫,和 room.webp 里的阴影一个调子
const LIGHT = 0xfff2c8;      // 受光色:暖
const INK = 0x24170f;        // 描边墨色:和室内那几张原画的勾线一个颜色

export class Tree {
  readonly c: Phaser.GameObjects.Container;
  private branchG: Phaser.GameObjects.Graphics;
  private leafG: Phaser.GameObjects.Graphics;
  private fallG: Phaser.GameObjects.Graphics;
  private branches: Branch[];
  private leaves: LeafPt[];
  private builtAt = -1;
  private builtTint = -1;
  private tint = 0xffffff;
  private falling: Falling[] = [];
  private sway = 0;
  private scl: number;

  constructor(scene: Phaser.Scene, x: number, y: number, scale: number, seed: number) {
    this.scl = scale;
    const g = grow(seed);
    this.branches = g.branches;
    this.leaves = g.leaves;

    this.c = scene.add.container(x, y);
    this.branchG = scene.add.graphics();
    this.leafG = scene.add.graphics();
    this.fallG = scene.add.graphics();
    this.c.add([this.branchG, this.leafG]);
    this.fallG.setDepth(0);          // 落叶不跟着树摇,单独一层
    (this.c as any)._fallG = this.fallG;
  }

  get fallLayer(): Phaser.GameObjects.Graphics { return this.fallG; }

  /**
   * 时段光照(multiply 色)。和地景用同一个颜色 —— 原来树不吃光,
   * 半夜的地是蓝黑的、树却还是正午那么亮,一眼就是贴上去的。
   * 只有颜色变得够多才重画,拧曲柄的时候不会每帧重建几百个叶团。
   */
  setLight(tint: number): void {
    const [r, g, b] = rgbOf(tint), [r0, g0, b0] = rgbOf(this.tint);
    if (Math.abs(r - r0) + Math.abs(g - g0) + Math.abs(b - b0) < 9) return;
    this.tint = tint;
    if (this.builtAt >= 0) this.setSeason(this.builtAt, true);
  }

  /**
   * season 是循环的:0=春 0.25=夏 0.5=秋 0.75=冬,1.0 绕回春天。
   * 只有跨过一小段才真的重画 —— 换季过渡的每一帧都重建四百个叶点太浪费。
   *
   * 画法是往"手绘"靠的,不是矢量:
   *   枝干 —— 有粗细渐变的锥形,先描一圈墨线再上色,受光面再提一笔亮色;
   *   树冠 —— 每片叶子画成一团大色块,三遍上色:阴影团(偏下)→ 固有色 → 受光面(偏左上)。
   *   色块大到彼此重叠,就糊成一簇一簇的树冠,而不是一颗颗绿豆。
   */
  setSeason(season: number, force = false): void {
    if (!force && Math.abs(season - this.builtAt) < 0.02 && this.builtTint === this.tint) return;
    this.builtAt = season;
    this.builtTint = this.tint;

    const f = (((season % 1) + 1) % 1) * 4;
    const i = Math.floor(f) % 4;
    const k = f - Math.floor(f);
    const a = LEAF[i], b = LEAF[(i + 1) % 4];
    const dens = a.dens + (b.dens - a.dens) * k;
    const size = a.size + (b.size - a.size) * k;
    const bark = mul(this.lerpColor(BARK[i], BARK[(i + 1) % 4], k), this.tint);
    const ink = mul(INK, this.tint);
    const barkLit = mul(toward(this.lerpColor(BARK[i], BARK[(i + 1) % 4], k), LIGHT, 0.32), this.tint);
    /* 冬天枝上积雪。冬天的关键帧在 0.75,所以必须在那之前就积满 ——
       原来写的 (w-0.72)/0.16 代进 0.75 只有 0.19,等于整个冬天树上都没雪。 */
    const w = (((season % 1) + 1) % 1);
    const snow = Phaser.Math.Clamp((w - 0.58) / 0.14, 0, 1)      // 深秋开始积
                 * Phaser.Math.Clamp((1.0 - w) / 0.05, 0, 1);    // 临回春化掉

    const s = this.scl;
    const G = this.branchG;
    G.clear();
    const ol = Math.max(1.2, 1.6 * s);              // 墨线宽

    /* 锥形枝:起点粗、末端收到子枝的粗细,四边形 + 两端圆头,关节处才不会有缺口 */
    const limb = (br: Branch, grow: number, color: number, dx = 0, dy = 0, thin = 1) => {
      const w0 = (br.w * s * thin) / 2 + grow, w1 = (br.w * 0.7 * s * thin) / 2 + grow;
      const x1 = br.x1 * s + dx, y1 = br.y1 * s + dy, x2 = br.x2 * s + dx, y2 = br.y2 * s + dy;
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      G.fillStyle(color, 1);
      G.fillPoints([
        new Phaser.Geom.Point(x1 + nx * w0, y1 + ny * w0),
        new Phaser.Geom.Point(x2 + nx * w1, y2 + ny * w1),
        new Phaser.Geom.Point(x2 - nx * w1, y2 - ny * w1),
        new Phaser.Geom.Point(x1 - nx * w0, y1 - ny * w0),
      ], true);
      G.fillCircle(x1, y1, w0);
      G.fillCircle(x2, y2, w1);
    };
    for (const br of this.branches) limb(br, ol, ink);          // 1) 墨线
    for (const br of this.branches) limb(br, 0, bark);          // 2) 固有色
    for (const br of this.branches) {                           // 3) 左侧受光的一笔
      if (br.d > 3) continue;
      limb(br, 0, barkLit, -br.w * s * 0.18, 0, 0.32);
    }
    /* 积雪:同一根枝往上偏半个枝宽再描一道 —— 雪落在朝上的那面 */
    if (snow > 0.01) {
      for (const br of this.branches) {
        if (br.d > 5) continue;
        const off = br.w * s * 0.42;
        G.lineStyle(Math.max(1, br.w * s * 0.42), mul(0xe6eef7, this.tint), snow);
        G.lineBetween(br.x1 * s, br.y1 * s - off, br.x2 * s, br.y2 * s - off);
      }
    }

    const L = this.leafG;
    L.clear();
    if (dens > 0.01) {
      /* 先把要画的叶团挑出来(颜色、位置、大小),再分三遍画 */
      const rng = new LCG(99);
      const blobs: { x: number; y: number; r: number; col: number; hi: boolean }[] = [];
      for (const lf of this.leaves) {
        if (rng.next() > dens) continue;
        const pool = rng.next() < 1 - k ? a.cols : b.cols;
        const col = pool[Math.floor(rng.next() * pool.length)];
        blobs.push({
          x: lf.x * s + Math.cos(lf.j) * 4 * s,
          y: lf.y * s + Math.sin(lf.j) * 4 * s,
          r: lf.s * size * 10.5 * s,
          col, hi: rng.next() < 0.45,
        });
      }
      for (const p of blobs) {                // 阴影团:往下偏,压暗、带点紫
        L.fillStyle(mul(toward(p.col, SHADE, 0.55), this.tint), 1);
        L.fillEllipse(p.x + p.r * 0.1, p.y + p.r * 0.26, p.r * 2.2, p.r * 1.8);
      }
      for (const p of blobs) {                // 固有色
        L.fillStyle(mul(p.col, this.tint), 1);
        L.fillEllipse(p.x, p.y, p.r * 2.0, p.r * 1.55);
      }
      for (const p of blobs) {                // 受光:左上,小一圈
        if (!p.hi) continue;
        L.fillStyle(mul(toward(p.col, LIGHT, 0.38), this.tint), 0.9);
        L.fillEllipse(p.x - p.r * 0.3, p.y - p.r * 0.32, p.r * 1.2, p.r * 0.8);
      }
    }
  }

  /** 秋天飘落叶:从树冠随机取一片,飘着旋着落到地面 */
  spawnFall(rate: number, dt: number, groundY: number): void {
    if (rate > 0 && Math.random() < rate * dt && this.falling.length < 40) {
      const lf = this.leaves[Math.floor(Math.random() * this.leaves.length)];
      const cols = LEAF[2].cols;
      this.falling.push({
        x: this.c.x + lf.x * this.scl, y: this.c.y + lf.y * this.scl,
        vx: -8 - Math.random() * 14, vy: 14 + Math.random() * 16,
        ph: Math.random() * 6.28, c: cols[Math.floor(Math.random() * cols.length)],
        life: (groundY - (this.c.y + lf.y * this.scl)) / 20,
      });
    }
  }

  update(dt: number, t: number, windY: number): void {
    /* 摇曳:整棵树绕根部微转。容器原点就在树根,所以根不动、树冠在摆。 */
    this.sway = Math.sin(t * 0.9) * 0.012 + Math.sin(t * 2.3) * 0.004;
    this.c.setRotation(this.sway);

    this.fallG.clear();
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const p = this.falling[i];
      p.ph += dt * 3;
      p.x += (p.vx + Math.sin(p.ph) * 22) * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > windY) { this.falling.splice(i, 1); continue; }
      this.fallG.fillStyle(mul(p.c, this.tint), Phaser.Math.Clamp(p.life, 0, 1));
      this.fallG.fillEllipse(p.x, p.y, 7 * Math.abs(Math.cos(p.ph)) + 2, 5);
    }
  }

  private lerpColor(c1: number, c2: number, f: number): number {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    return (Math.round(r1 + (r2 - r1) * f) << 16)
      | (Math.round(g1 + (g2 - g1) * f) << 8) | Math.round(b1 + (b2 - b1) * f);
  }
}
