import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Achievements } from '../systems/achievements';
import { Tree } from '../systems/Tree';
import { WindowLife } from '../systems/WindowLife';
import { addGlow } from '../systems/glow';

/**
 * 窗景 · 独立全屏一幕。两个控件,一个世界:
 *   右下角曲柄   → 时间(日月星辰、萤火虫)
 *   窗台上的盆栽 → 季节(草色、降水、窗外的树、候鸟)
 *
 * 盆栽既是控件也是指示器:它自己就长成当前季节的样子(抽芽→浓绿→转黄→秃枝挂雪),
 * 点一下推进一季。比一条横贯窗口的滑轨省地方,而且不用告诉你它是干什么的 ——
 * 你看见窗外在下雪、窗台那盆也秃了,自然就懂了。
 *
 * 窗外是 S1 那片草原 —— 访客进屋前刚在外面看过它,现在从屋里往外看,世界才闭合。
 * 地景由 tools/make_window_bg.py 从 public/hero.webp 派生出四季四张:
 * 抠掉天空只留丘陵,天空交给下面的调色表用代码画。天空画死在图里的话,曲柄就拨不动天色了。
 *
 * 时间是循环的,一圈就是一整天:
 *   t = 0.00 日出(东/右)→ 0.25 正午(天顶)→ 0.50 日落(西/左)→ 0.75 午夜 → 1.00 回到日出
 * 季节同样循环:0=春 0.25=夏 0.5=秋 0.75=冬,1.0 绕回春天 —— 一年过完接着下一年。
 */

/**
 * 一天的调色表。t 循环,最后一档必须等于第一档,否则午夜跨到日出会跳色。
 * top/bot = 天空渐变的顶与底;land = 地景的 multiply 染色;star = 星星的可见度。
 * (tools/preview_window.py 里有一份一模一样的,改这里记得同步过去。)
 */
const DAY = [
  { t: 0.00, top: 0x2a3c74, bot: 0xf6b489, land: 0xa9a2bd, star: 0.36 },  // 日出
  { t: 0.10, top: 0x5c93cf, bot: 0xfad8a8, land: 0xd9d2c8, star: 0.05 },  // 清晨
  { t: 0.25, top: 0x4a90d9, bot: 0xc6e2f4, land: 0xecf2ff, star: 0.00 },  // 正午
  { t: 0.42, top: 0x5896d6, bot: 0xecd9ae, land: 0xfff0d6, star: 0.00 },  // 午后
  { t: 0.52, top: 0x3c5b93, bot: 0xff9a50, land: 0xffcfa6, star: 0.06 },  // 黄昏
  { t: 0.60, top: 0x2b2c64, bot: 0xd0603a, land: 0xc98d70, star: 0.38 },  // 日落
  { t: 0.68, top: 0x1a1a44, bot: 0x54325e, land: 0x6a5a78, star: 0.78 },  // 暮色
  { t: 0.80, top: 0x080818, bot: 0x181838, land: 0x323e68, star: 1.00 },  // 夜
  { t: 0.93, top: 0x141c40, bot: 0x2c2c58, land: 0x3a4478, star: 0.80 },  // 将明
  { t: 1.00, top: 0x2a3c74, bot: 0xf6b489, land: 0xa9a2bd, star: 0.36 },  // = 0.00
];

/**
 * 四季。rain/snow 是降水强度,bird 是鸟群出现的频次,dir 是迁徙方向,
 * fly 是萤火虫 —— 只有夏夜才有,这种"只在对的时候出现"的细节最招人喜欢。
 */
const SEASON = [
  { key: 'window_land_spring', rain: 0.38, snow: 0.00, bird: 1.0, dir: 1,  fly: 0.20, leaf: 0 },
  { key: 'window_land_summer', rain: 0.10, snow: 0.00, bird: 0.3, dir: 1,  fly: 1.00, leaf: 0 },
  { key: 'window_land_autumn', rain: 0.55, snow: 0.00, bird: 1.3, dir: -1, fly: 0.25, leaf: 1 },
  { key: 'window_land_winter', rain: 0.00, snow: 0.90, bird: 0.1, dir: -1, fly: 0.00, leaf: 0 },
];
const SEASON_TWEEN = 900;      // 换季过渡时长 ms

const HORIZON = 0.54;          // 地平线在画面高度的比例(和地景山脊对齐)
const LAND_H = 0.46;           // 地景占画面高度的比例
const LAND_DRIFT = u(3);       // 地景横移 px/s —— 小屋在走,窗外的景就该慢慢挪
const TREE_DRIFT = u(4);       // 树在近处,按视差走得快一点
const TREE_BASE_Y = 0.88;
const FIREFLY_N = 34;

const D = { sky: 0, star: 1, orb: 2, land: 3, fly: 5, cloud: 6,
            fall: 7, tree: 8, bird: 9, weather: 10, tint: 11, frame: 12, ui: 20 };

export class WindowScene extends Phaser.Scene {
  private timeVal = 0.30;
  private seasonVal = 0.0;
  private hasLand = false;
  private hasCrank = false;
  private hasCloud = false;

  private sky!: Phaser.GameObjects.Graphics;
  private landA: Phaser.GameObjects.Image[] = [];
  private landB: Phaser.GameObjects.Image[] = [];
  private landW = 0;
  private landOffset = 0;
  private hills?: Phaser.GameObjects.Graphics;
  private trees: Tree[] = [];
  private treeOffset = 0;
  private life!: WindowLife;
  private tintLayer!: Phaser.GameObjects.Rectangle;
  private frameTint!: Phaser.GameObjects.Graphics;
  private sun!: Phaser.GameObjects.Container;
  private sunCore!: Phaser.GameObjects.Arc;
  private moon!: Phaser.GameObjects.Arc;
  private moonHalo!: Phaser.GameObjects.Image;
  private stars: { o: Phaser.GameObjects.Arc; th: number; ph: number }[] = [];
  private flies: { o: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number }[] = [];
  private clouds: Phaser.GameObjects.GameObject[] = [];
  private crank!: Phaser.GameObjects.Container;
  private crankAngle = 0;
  private draggingCrank = false;
  private plant!: Phaser.GameObjects.Container;
  private plantTree!: Tree;
  private plantGlow!: Phaser.GameObjects.Arc;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private leaving = false;

  private arc = { cx: W / 2, cy: H * HORIZON, rx: W * 0.46, ry: H * 0.42 };

  constructor() { super('Window'); }

  preload(): void {
    /* 素材可能不存在:失败就用占位,不报致命错 */
    for (const s of SEASON) this.load.image(s.key, `/${s.key}.webp`);
    this.load.image('crank_img', '/crank.png');
    this.load.image('cloud1', '/cloud1.png');
    this.load.on('loaderror', () => { /* 忽略,create 里检测 */ });
  }

  create(): void {
    this.leaving = false;
    /* 加载失败时 Phaser 会塞一张 __MISSING 占位纹理进来,得一并排掉 */
    this.hasLand = SEASON.every(s => this.textures.exists(s.key)
      && this.textures.get(s.key).key !== '__MISSING');
    this.hasCrank = this.textures.exists('crank_img');
    this.hasCloud = this.textures.exists('cloud1');

    this.sky = this.add.graphics().setDepth(D.sky);
    this.buildStars();
    this.buildSunMoon();
    this.buildLand();
    this.buildTrees();
    this.buildFireflies();
    this.buildClouds();
    this.life = new WindowLife(this, W, H, { weather: D.weather, bird: D.bird });

    /* 全屏色调层:把天、地、云统一到同一个时段的光里 */
    this.tintLayer = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(D.tint);

    this.buildFrame();
    this.buildCrank();
    this.buildPlant();

    this.add.text(W / 2, H - u(30), 'Crank the sun · Touch the plant for seasons · Esc to leave', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${15 * SCALE}px`,
      color: 'rgba(255,255,255,.8)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.6)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(D.ui + 1);

    this.keys = this.input.keyboard!.addKeys('ESC') as any;
    Achievements.unlock('window', this);
    this.cameras.main.fadeIn(500, 10, 12, 30);
    this.render(true);
  }

  /* ---------- 搭场景 ---------- */

  private buildStars(): void {
    for (let i = 0; i < 90; i++) {
      const o = this.add.circle(
        Phaser.Math.Between(0, W), Phaser.Math.Between(0, Math.round(H * HORIZON)),
        Phaser.Math.FloatBetween(u(1), u(2.4)), 0xffffff, 0,
      ).setDepth(D.star);
      this.stars.push({ o, th: Math.random(), ph: Math.random() * Math.PI * 2 });
    }
  }

  private buildSunMoon(): void {
    /* 太阳 = 一团渐变光晕 + 一个实心圆盘。
       光晕必须用渐变纹理:add.circle 是实心的,拿它当光晕就是一枚贴纸。
       圆盘倒是该硬边 —— 太阳本来就有清晰的边缘。 */
    this.sun = this.add.container(0, 0).setDepth(D.orb);
    const halo = addGlow(this, 0, 0, u(130), 0xffce78, 0.55);
    this.sunCore = this.add.circle(0, 0, u(36), 0xffe08a, 1);
    this.sun.add([halo, this.sunCore]);
    this.moonHalo = addGlow(this, 0, 0, u(76), 0xcfd8f0, 0.34).setDepth(D.orb);
    this.moon = this.add.circle(0, 0, u(30), 0xf0f0e2, 1).setDepth(D.orb);
  }

  /**
   * 地景:两层叠着放,A 是当前季节、B 是下一个季节,靠 B 的透明度做换季过渡。
   * 每层把同一张图铺若干份,奇数份左右翻转,于是首尾天然接得上,可以无限横移。
   * 翻转拼接的周期是 2×图宽,offset 对它取模,循环回来时相位完全对齐。
   */
  private buildLand(): void {
    if (!this.hasLand) { this.buildHillPlaceholder(); return; }

    const src = this.textures.get(SEASON[0].key).getSourceImage() as HTMLImageElement;
    const scale = (H * LAND_H) / src.height;
    this.landW = src.width * scale;

    const n = Math.ceil((W + this.landW * 2) / this.landW) + 1;
    for (const arr of [this.landA, this.landB]) {
      for (let i = 0; i < n; i++) {
        const img = this.add.image(0, H, SEASON[0].key)
          .setOrigin(0, 1).setScale(scale).setDepth(D.land);
        if (i % 2 === 1) img.setFlipX(true);
        arr.push(img);
      }
    }
    this.layoutLand();
  }

  private layoutLand(): void {
    for (let i = 0; i < this.landA.length; i++) {
      const x = i * this.landW - this.landOffset;
      this.landA[i].x = x;
      this.landB[i].x = x;
    }
  }

  /* 没有地景图时的占位:起伏丘陵剪影(不是城镇 —— 会走路的小屋不该有邻居) */
  private buildHillPlaceholder(): void {
    const g = this.add.graphics().setDepth(D.land);
    const rng = new Phaser.Math.RandomDataGenerator(['hills']);
    for (const [depth, amp, base, color] of [
      [0, u(46), H * 0.56, 0x4a5568], [1, u(70), H * 0.64, 0x39424f],
    ] as [number, number, number, number][]) {
      g.fillStyle(color, 1);
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= W; x += u(40)) {
        const y = base + Math.sin(x / u(260) + depth * 2) * amp + rng.between(-u(6), u(6));
        g.lineTo(x, y);
      }
      g.lineTo(W, H);
      g.closePath();
      g.fillPath();
    }
    this.hills = g;
  }

  /**
   * 两棵树,在"树空间"里相隔一个屏宽,周期是两个屏宽 —— 于是永远至少有一棵在画面里。
   * 它们跟着地景一起漂,只是快一点(近处的东西视差更大)。
   */
  private buildTrees(): void {
    const scale = (H * 0.42) / 370;      // 370 ≈ 生成器长出来的树高(本地单位)
    for (let i = 0; i < 2; i++) {
      const t = new Tree(this, 0, H * TREE_BASE_Y, scale, 7 + i * 131);
      t.c.setDepth(D.tree);
      t.fallLayer.setDepth(D.fall);
      this.trees.push(t);
    }
  }

  /** 萤火虫:夏夜才有。旧版是 46 盏城镇窗灯 —— 草原上没有那么多窗户。 */
  private buildFireflies(): void {
    const rng = new Phaser.Math.RandomDataGenerator(['flies']);
    for (let i = 0; i < FIREFLY_N; i++) {
      const x = rng.between(0, W);
      const y = rng.between(Math.round(H * (HORIZON + 0.02)), Math.round(H * 0.94));
      const o = addGlow(this, x, y, u(rng.frac() * 3.4 + 2.6), 0xffe89a, 0).setDepth(D.fly);
      this.flies.push({ o, x, y, ph: rng.frac() * Math.PI * 2, sp: 0.5 + rng.frac() });
    }
  }

  /**
   * 云。cloud1.png 原图 6752 px 宽,画布才 2560 —— 原来 scale 0.4~0.75 等于
   * 每"朵"云是一整条铺满屏幕、底边平直的云带,看着就是贴了张纸。
   * 缩到 0.09~0.17(600~1150 px)才是一朵一朵的云,数量补到 5 朵。
   */
  private buildClouds(): void {
    for (let i = 0; i < 5; i++) {
      const x = Phaser.Math.Between(-u(200), W + u(200));
      const y = Phaser.Math.Between(Math.round(H * 0.06), Math.round(H * 0.34));
      if (this.hasCloud) {
        const c = this.add.image(x, y, 'cloud1').setDepth(D.cloud)
          .setAlpha(0.5).setScale(0.09 + Math.random() * 0.08);
        (c as any)._speed = u(3 + Math.random() * 4);
        this.clouds.push(c);
      } else {
        const c = this.add.container(x, y).setDepth(D.cloud).setAlpha(0.5);
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1);
        g.fillCircle(0, 0, u(26)); g.fillCircle(u(24), u(4), u(20)); g.fillCircle(-u(24), u(5), u(18));
        c.add(g);
        (c as any)._speed = u(4 + Math.random() * 5);
        this.clouds.push(c);
      }
    }
  }

  private buildFrame(): void {
    const g = this.add.graphics().setDepth(D.frame);
    const m = u(46);
    g.fillStyle(0x3a2a1a, 1);
    g.fillRect(0, 0, W, m); g.fillRect(0, H - m, W, m);
    g.fillRect(0, 0, m, H); g.fillRect(W - m, 0, m, H);
    g.lineStyle(u(3), 0x5a4128, 1);
    g.strokeRect(m, m, W - m * 2, H - m * 2);
    this.frameTint = this.add.graphics().setDepth(D.frame + 1);
  }

  private buildCrank(): void {
    const cx = W - u(110);
    const cy = H - u(120);
    this.crank = this.add.container(cx, cy).setDepth(D.ui);

    if (this.hasCrank) {
      const img = this.add.image(0, 0, 'crank_img').setOrigin(0.2, 0.5);
      img.setScale(u(120) / Math.max(img.width, img.height));
      this.crank.add(img);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x8a6a3a, 1); g.fillCircle(0, 0, u(14));
      g.lineStyle(u(9), 0xa8823f, 1); g.lineBetween(0, 0, u(52), -u(30));
      g.fillStyle(0xc8a050, 1); g.fillCircle(u(52), -u(30), u(12));
      this.crank.add(g);
    }

    const hit = this.add.circle(cx, cy, u(90), 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true }).setDepth(D.ui + 1);
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
      /* 转两圈 = 一整天。不 clamp 而是取模:转到头不撞墙,天色首尾也接得上。 */
      this.timeVal = (this.timeVal + d / (Math.PI * 2) * 0.5 + 1) % 1;
      this.render();
    });
    this.input.on('pointerup', () => { this.draggingCrank = false; });
  }


  /**
   * 窗台上的盆栽 —— 季节的控件兼指示器。
   * 摆在窗框下沿那条木边上(那本来就是死空间),几乎不占窗口。
   * 它的枝叶用的是窗外那棵树同一套生成器,只是小一号 —— 屋里屋外同一个季节,同一种植物。
   */
  private buildPlant(): void {
    const px = u(150);
    const potTop = H - u(52);
    this.plant = this.add.container(px, potTop).setDepth(D.ui);

    /* hover 时透出一圈暖光:不给点提示的话,没人知道这盆花能碰 */
    this.plantGlow = this.add.circle(0, -u(28), u(46), 0xffd070, 0);
    this.plant.add(this.plantGlow);

    this.plantTree = new Tree(this, px, potTop - u(4), (u(60)) / 370, 401);
    this.plantTree.c.setDepth(D.ui);
    this.plantTree.fallLayer.setDepth(D.ui);

    /* 陶盆:压在枝干根部之上,把树根那截藏掉 */
    const pot = this.add.graphics().setDepth(D.ui + 1);
    const w0 = u(21), w1 = u(15), hgt = u(23);
    pot.fillStyle(0x9a5b3c, 1);
    pot.fillPoints([
      new Phaser.Geom.Point(px - w0, potTop),
      new Phaser.Geom.Point(px + w0, potTop),
      new Phaser.Geom.Point(px + w1, potTop + hgt),
      new Phaser.Geom.Point(px - w1, potTop + hgt),
    ], true);
    pot.fillStyle(0xb06a45, 1);
    pot.fillRect(px - w0 - u(3), potTop - u(6), (w0 + u(3)) * 2, u(8));
    pot.lineStyle(u(2), 0x6d3d27, 0.8);
    pot.strokeRect(px - w0 - u(3), potTop - u(6), (w0 + u(3)) * 2, u(8));

    /* 点击区域:比盆栽本身大一圈,好点 */
    const hit = this.add.circle(px, potTop - u(18), u(52), 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true }).setDepth(D.ui + 2);
    hit.on('pointerover', () => this.tweens.add({ targets: this.plantGlow, alpha: 0.22, duration: 180 }));
    hit.on('pointerout', () => this.tweens.add({ targets: this.plantGlow, alpha: 0, duration: 260 }));
    hit.on('pointerdown', () => this.nextSeason());
  }

  /** 推进一季。season 是循环的,所以冬天再点一下会顺着走回春天,而不是倒着退回去。 */
  private nextSeason(): void {
    const target = (Math.round(this.seasonVal * 4) + 1) / 4;
    this.tweens.addCounter({
      from: this.seasonVal, to: target, duration: SEASON_TWEEN, ease: 'Sine.easeInOut',
      onUpdate: (tw) => { this.seasonVal = tw.getValue(); this.render(); },
    });
    /* 手感:被碰到的时候轻轻一颤 */
    this.tweens.add({ targets: this.plantTree.c, scaleX: 1.06, scaleY: 1.06,
                      duration: 130, yoyo: true, ease: 'Quad.easeOut' });
  }

  /* ---------- 按 time / season 渲染 ---------- */

  private render(force = false): void {
    const t = this.timeVal;
    const k = this.keyAt(t);
    const s = this.seasonAt(this.seasonVal);

    /* 天空 */
    this.sky.clear();
    const bands = 50;
    for (let i = 0; i < bands; i++) {
      this.sky.fillStyle(this.lerpColor(k.top, k.bot, i / bands), 1);
      this.sky.fillRect(0, (H / bands) * i, W, H / bands + 1);
    }

    /* 日月:绕同一条弧,相位差半天。t=0 从右侧地平线升起,0.25 到天顶,0.5 从左侧落下。 */
    this.placeOrb(this.sun, t, true);
    this.placeOrb(this.moon, (t + 0.5) % 1, false);
    this.moonHalo.setPosition(this.moon.x, this.moon.y).setAlpha(this.moon.alpha * 0.34);

    /* 地景:A=当前季节 B=下一季,靠 B 的透明度过渡;再统一按时段 multiply 染色 */
    for (let i = 0; i < this.landA.length; i++) {
      this.landA[i].setTexture(SEASON[s.i].key).setTint(k.land);
      this.landB[i].setTexture(SEASON[s.j].key).setTint(k.land).setAlpha(s.k);
    }
    for (const tr of this.trees) tr.setSeason(this.seasonVal, force);
    this.plantTree?.setSeason(this.seasonVal, force);

    this.tintLayer.setFillStyle(k.tintC, 1).setAlpha(k.tintA);

    /* 窗框:白天亮,夜里暗,黄昏内缘染一道橙 */
    this.frameTint.clear();
    const m = u(46);
    this.frameTint.fillStyle(0x000020, k.star * 0.5);
    this.frameTint.fillRect(0, 0, W, m); this.frameTint.fillRect(0, H - m, W, m);
    this.frameTint.fillRect(0, 0, m, H); this.frameTint.fillRect(W - m, 0, m, H);
    const dusk = Phaser.Math.Clamp(1 - Math.abs(t - 0.54) * 12, 0, 1);
    if (dusk > 0.01) {
      this.frameTint.lineStyle(u(4), 0xff9a50, dusk * 0.6);
      this.frameTint.strokeRect(m, m, W - m * 2, H - m * 2);
    }

    /* 云:跟着天色一起被染 —— 不染的话正午的天是蓝的、云还是夕阳的粉橙,一眼假。
       multiply 只能压暗,所以取天空底色和顶色之间偏底色的一档,正好是云受光的颜色。 */
    const cloudTint = this.lerpColor(k.bot, k.top, 0.30);
    for (const c of this.clouds) {
      const img = c as Phaser.GameObjects.Image;
      if (img.setTint) img.setTint(cloudTint);
      img.setAlpha(0.30 + 0.28 * (1 - k.star));
    }

    /* 星星:各自有个出场阈值,天黑到一定程度才逐颗亮起来 */
    for (const st of this.stars) {
      (st.o as any)._base = Phaser.Math.Clamp((k.star - st.th * 0.85) * 4, 0, 1);
    }
    /* 萤火虫 = 夜色 × 季节。夏夜最盛,冬天一只没有。 */
    for (const f of this.flies) {
      (f.o as any)._base = Phaser.Math.Clamp((k.star - 0.45) * 2.6, 0, 1) * s.fly;
    }
  }

  private placeOrb(orb: Phaser.GameObjects.Container | Phaser.GameObjects.Arc,
                   phase: number, isSun: boolean): void {
    const a = Math.PI * 2 * phase;
    const elev = Math.sin(a);
    orb.setPosition(this.arc.cx + Math.cos(a) * this.arc.rx,
                    this.arc.cy - elev * this.arc.ry);
    /* 落到地平线以下还要留一段可见:地景画在日月之上,
       这段时间太阳正好被山脊一点点吃掉,才有"沉下去"的感觉 */
    orb.setAlpha(Phaser.Math.Clamp((elev + 0.20) * 5, 0, 1));
    if (isSun) {
      const low = 1 - Phaser.Math.Clamp(elev / 0.4, 0, 1);
      this.sun.setScale(1 + low * 0.5);
      this.sunCore.setFillStyle(this.lerpColor(0xffe08a, 0xff6a3a, low));
    }
  }

  /** 在循环的一天调色表上取某一时刻的所有参数 */
  private keyAt(t: number) {
    const x = ((t % 1) + 1) % 1;
    let a = DAY[0], b = DAY[DAY.length - 1];
    for (let i = 0; i < DAY.length - 1; i++) {
      if (x >= DAY[i].t && x <= DAY[i + 1].t) { a = DAY[i]; b = DAY[i + 1]; break; }
    }
    const f = b.t === a.t ? 0 : (x - a.t) / (b.t - a.t);
    const star = a.star + (b.star - a.star) * f;
    return {
      top: this.lerpColor(a.top, b.top, f),
      bot: this.lerpColor(a.bot, b.bot, f),
      land: this.lerpColor(a.land, b.land, f),
      star,
      tintC: this.lerpColor(0xff9a50, 0x0a0a28, Phaser.Math.Clamp((star - 0.3) / 0.7, 0, 1)),
      tintA: 0.20 * Phaser.Math.Clamp(star * 1.4, 0, 1),
    };
  }

  /** 季节循环:0=春 0.25=夏 0.5=秋 0.75=冬,1.0 回到春。返回相邻两档下标与混合系数。 */
  private seasonAt(v: number) {
    const f = ((((v % 1) + 1) % 1)) * 4;
    const i = Math.floor(f) % 4;
    const k = f - Math.floor(f);
    const a = SEASON[i], b = SEASON[(i + 1) % 4];
    const mix = (p: 'rain' | 'snow' | 'bird' | 'fly' | 'leaf') => a[p] + (b[p] - a[p]) * k;
    return {
      i, j: (i + 1) % 4, k,
      rain: mix('rain'), snow: mix('snow'), bird: mix('bird'),
      fly: mix('fly'), leaf: mix('leaf'), dir: k < 0.5 ? a.dir : b.dir,
    };
  }

  private lerpColor(c1: number, c2: number, f: number): number {
    const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
    return (Math.round(r1 + (r2 - r1) * f) << 16)
      | (Math.round(g1 + (g2 - g1) * f) << 8) | Math.round(b1 + (b2 - b1) * f);
  }

  update(time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    const tsec = time / 1000;
    const k = this.keyAt(this.timeVal);
    const s = this.seasonAt(this.seasonVal);
    const light = 1 - k.star;                       // 环境亮度:白天 1,深夜 0

    /* 地景与树缓慢横移 —— 小屋在走。树在近处,视差更大,走得快些。 */
    if (this.landW > 0) {
      this.landOffset = (this.landOffset + LAND_DRIFT * dt) % (this.landW * 2);
      this.layoutLand();
    }
    const period = W * 2;
    this.treeOffset = (this.treeOffset + TREE_DRIFT * dt) % period;
    for (let i = 0; i < this.trees.length; i++) {
      let x = (i * W - this.treeOffset) % period;
      if (x < -W) x += period;
      this.trees[i].c.x = x;
      this.trees[i].update(dt, tsec, H);
      this.trees[i].spawnFall(s.leaf * 7, dt, H);
    }
    this.plantTree.update(dt, tsec * 0.6, H);

    this.life.update(dt, s.rain, s.snow, s.bird, s.dir, light);

    for (const c of this.clouds) {
      const o = c as any;
      o.x += o._speed * dt;
      if (o.x > W + u(80)) o.x = -u(80);
    }

    for (const st of this.stars) {
      st.ph += dt * 2;
      st.o.setAlpha(((st.o as any)._base ?? 0) * (0.6 + 0.4 * Math.sin(st.ph)));
    }

    /* 萤火虫:慢慢飘 + 各自节奏地一明一灭 */
    for (const f of this.flies) {
      f.ph += dt * f.sp;
      f.o.setPosition(f.x + Math.sin(f.ph * 0.7) * u(26), f.y + Math.cos(f.ph) * u(14));
      const blink = Math.max(0, Math.sin(f.ph * 1.6));
      f.o.setAlpha(((f.o as any)._base ?? 0) * (0.15 + 0.85 * blink * blink));
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
