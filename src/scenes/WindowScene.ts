import Phaser from 'phaser';
import { W as SW, H as SH, u, SCALE } from '../config/constants';
import { GLASS, SILL, SASHES } from '../config/windowGlass';
import { Sash } from '../systems/Sash';
import { Inflow } from '../systems/Inflow';
import { Ambience } from '../systems/Ambience';
import { RainWindow } from '../systems/RainWindow';
import { Achievements } from '../systems/achievements';
import { PaintedTree as Tree, TREE_KEYS } from '../systems/PaintedTree';
import { WindowLife } from '../systems/WindowLife';
import { addGlow } from '../systems/glow';
import { SkyGradient, addPaper, addDisc } from '../systems/paint';

/**
 * 这一幕是"推近屋里那扇拱窗":窗框、墙、油灯直接是 room.webp 的那一块(window_room.webp,
 * 玻璃已抠空,见 tools/make_window_room.py),窗外的世界只从玻璃里透出来。
 *
 * 实现上用两台相机:
 *   outCam(= cameras.main)—— 视口就是玻璃的外接矩形,只拍窗外的东西;
 *   roomCam               —— 全屏,只拍屋里的东西(窗框原画、玻璃上的雨痕、曲柄、盆栽、提示字)。
 * roomCam 后加,所以画在 outCam 上面;原画里玻璃之外都是不透明的,窗外只在玻璃里露出来。
 *
 * 窗外那部分代码沿用原来的写法,用 W/H 表示"画面宽高"——
 * 这里把 W/H 换成玻璃区域的宽高,屋里的东西用 SW/SH(全屏)。
 */
const W = GLASS.w;
const H = GLASS.h;

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

const HORIZON = 0.60;          // 地平线在画面高度的比例(竖长的拱窗,天多留一点)
const LAND_H = 0.40;           // 地景占画面高度的比例(= 1 − HORIZON)
const LAND_DRIFT = u(3);       // 地景横移 px/s —— 小屋在走,窗外的景就该慢慢挪
const TREE_DRIFT = u(4);       // 树在近处,按视差走得快一点
const TREE_BASE_Y = 0.97;
const FIREFLY_N = 34;

const D = { sky: 0, star: 1, orb: 2, cloud: 2.5, land: 3, fly: 5,
            fall: 7, tree: 8, bird: 9, weather: 10, tint: 11, paper: 11.5,
            /* 以下在 roomCam 里 */
            glass: 12, drops: 13, frame: 14, sash: 14.5, light: 15, inflow: 16, ui: 20 };

/** 透视的视点:屏幕中心,焦距按画布宽取 —— 窗扇、飘进来的东西共用这一个,透视才对得上 */
const EYE = { x: SW / 2, y: SH * 0.48, f: SW * 0.42 };
const OPEN_MS = 1300;
const HINT_CLOSED = 'Click the window to open it · Crank the sun · Touch the plant for seasons · Esc to leave';
const HINT_OPEN = 'Click the window to close it · Crank the sun · Touch the plant for seasons · Esc to leave';
/* 云原来压在地景之上(depth 6):云比山远,地平线附近那几朵会盖住山脊。现在放回山后面。 */

/** 云的贴图:从 cloud1.png 预缩出来的两朵(tools/make_clouds.py)。
 *  原图 6752px 宽、屏幕上只显示 600px 左右 —— GPU 没有 mipmap 时缩小十倍就是最近邻抽样,
 *  水彩笔触被抽成一格一格的像素块,这就是云看着像像素画的原因。预缩到 ~1000px 就好了。 */
const CLOUD_KEYS = ['cloud_a', 'cloud_b'];

export class WindowScene extends Phaser.Scene {
  private timeVal = 0.30;
  private seasonVal = 0.0;
  private hasLand = false;
  private hasCrank = false;
  private hasCloud = false;

  private sky!: SkyGradient;
  private overcast!: Phaser.GameObjects.Rectangle;
  private rainNow = 0;
  private landA: Phaser.GameObjects.Image[] = [];
  private landB: Phaser.GameObjects.Image[] = [];
  private landW = 0;
  private landOffset = 0;
  private hills?: Phaser.GameObjects.Graphics;
  private trees: Tree[] = [];
  private treeOffset = 0;
  private life!: WindowLife;
  private tintLayer!: Phaser.GameObjects.Rectangle;
  private roomCam!: Phaser.Cameras.Scene2D.Camera;
  private glassRain!: RainWindow;
  private dayLight!: Phaser.GameObjects.Image;
  private roomLift!: Phaser.GameObjects.Rectangle;
  private sashes: Sash[] = [];
  private openVal = 0;          // 0 关 … 1 开
  private isOpen = false;
  private inflow!: Inflow;
  private ambience = new Ambience();
  private hoverGlow!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private sun!: Phaser.GameObjects.Container;
  private sunCore!: Phaser.GameObjects.Image;
  private moon!: Phaser.GameObjects.Image;
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
    for (const k of TREE_KEYS) this.load.image(k, `/${k}.png`);
    this.load.image('crank_img', '/crank.png');
    this.load.image('window_room', '/window_room_open.webp');
    this.load.image('sash_l', '/sash_l.png');
    this.load.image('sash_r', '/sash_r.png');
    for (const k of CLOUD_KEYS) {
      this.load.image(k, `/${k}.webp`);
      this.load.image(`${k}_day`, `/${k}_day.webp`);
    }
    this.load.on('loaderror', () => { /* 忽略,create 里检测 */ });
  }

  create(): void {
    this.leaving = false;
    /* 加载失败时 Phaser 会塞一张 __MISSING 占位纹理进来,得一并排掉 */
    this.hasLand = SEASON.every(s => this.textures.exists(s.key)
      && this.textures.get(s.key).key !== '__MISSING');
    this.hasCrank = this.textures.exists('crank_img');
    this.hasCloud = CLOUD_KEYS.every(k => [k, `${k}_day`].every(t =>
      this.textures.exists(t) && this.textures.get(t).key !== '__MISSING'));

    /* 窗外相机:视口 = 玻璃区域 */
    const outCam = this.cameras.main;
    outCam.setViewport(GLASS.x, GLASS.y, GLASS.w, GLASS.h).setScroll(0, 0);

    this.sky = new SkyGradient(this, W, H);
    this.sky.img.setDepth(D.sky);
    this.buildStars();
    this.buildSunMoon();
    this.buildLand();
    this.buildTrees();
    this.buildFireflies();
    this.buildClouds();
    this.life = new WindowLife(this, W, H, { weather: D.weather, bird: D.bird });

    /* 全屏色调层:把天、地、云统一到同一个时段的光里 */
    this.tintLayer = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(D.tint);
    /* 阴雨层:下雨的时候天是灰的。原来夕阳照常金灿灿、同时下着雨,氛围自相矛盾。 */
    this.overcast = this.add.rectangle(W / 2, H / 2, W, H, 0x56607a, 0).setDepth(D.tint);
    /* 纸纹:整幅窗景压在同一张水彩纸上 */
    addPaper(this, 0, 0, W, H, 0.45).setDepth(D.paper);

    /* 到这里为止建的都是窗外的东西 */
    const outside = [...this.children.list];

    this.roomCam = this.cameras.add(0, 0, SW, SH);
    this.buildFrame();
    this.buildCrank();
    this.buildPlant();

    this.hint = this.add.text(SW / 2, SH - u(30), HINT_CLOSED, {
      fontFamily: '"Nunito", sans-serif', fontSize: `${15 * SCALE}px`,
      color: 'rgba(255,255,255,.8)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.6)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(D.ui + 1);

    this.keys = this.input.keyboard!.addKeys('ESC') as any;
    Achievements.unlock('window', this);

    const inside = this.children.list.filter(o => !outside.includes(o));
    outCam.ignore(inside);
    this.roomCam.ignore(outside);

    outCam.fadeIn(500, 10, 12, 30);
    this.roomCam.fadeIn(500, 10, 12, 30);
    this.render(true);
  }

  /* ---------- 搭场景 ---------- */

  private buildStars(): void {
    for (let i = 0; i < 55; i++) {
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
    this.sunCore = addDisc(this, 0, 0, u(36), 0xffe08a);
    this.sun.add([halo, this.sunCore]);
    this.moonHalo = addGlow(this, 0, 0, u(76), 0xcfd8f0, 0.34).setDepth(D.orb);
    this.moon = addDisc(this, 0, 0, u(30), 0xf0f0e2).setDepth(D.orb);
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
    const treeH = H * 0.46;              // 整棵树(含树冠)在窗里的高度
    for (let i = 0; i < 2; i++) {
      /* 一棵近的(左三分之一处),一棵远一点、小一点的(右边),远的那棵站得高一点 —— 透视 */
      const t = new Tree(this, 0, H * (i ? TREE_BASE_Y - 0.06 : TREE_BASE_Y), treeH * (i ? 0.62 : 1), i === 1);
      (t as any)._home = i ? 0.84 : 0.27;
      (t as any)._par = i ? 0.7 : 1;      // 远的那棵视差小,漂得慢
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
   * 云。两张预缩好的云轮流用,随机左右翻转,屏幕上 550~1000px 宽 ——
   * 基本是 1:1 显示,原画的笔触全保住。不透明度拉高:吉卜力的云是"实"的,
   * 原来 0.5 的半透明看着像一层蒙在天上的贴纸。
   */
  private buildClouds(): void {
    const N = 4;
    for (let i = 0; i < N; i++) {
      /* 横向均匀撒开再加抖动,不会几朵挤成一团 */
      const x = (i / N) * (W + u(500)) - u(250) + Phaser.Math.Between(-u(80), u(80));
      const y = Phaser.Math.Between(Math.round(H * 0.10), Math.round(H * 0.36));
      if (this.hasCloud) {
        /* 每朵云两层:底下白天版(白云),上面原画版(黄昏粉橙)。
           原画的云是夕阳打光的,正午也挂着橙色高光就不对了 ——
           render() 里按太阳高度在两层之间淡入淡出。 */
        const key = CLOUD_KEYS[i % CLOUD_KEYS.length];
        const c = this.add.image(x, y, `${key}_day`).setDepth(D.cloud);
        const dusk = this.add.image(x, y, key).setDepth(D.cloud);
        /* 越低越大越快:近大远小,也给天空一点纵深 */
        const depthF = (y - H * 0.10) / (H * 0.26);
        const targetW = u(150 + depthF * 140) * (0.85 + Math.random() * 0.3);
        const flip = Math.random() < 0.5;
        c.setScale(targetW / c.width).setFlipX(flip);
        dusk.setScale(targetW / dusk.width).setFlipX(flip);
        (c as any)._speed = u(2 + depthF * 4 + Math.random() * 2);
        (c as any)._dusk = dusk;
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

  /**
   * 窗框 = room.webp 里那扇拱窗本身(玻璃已抠空)。
   * 玻璃这层(雾感 + 顺玻璃滑下的雨痕)用的是 RoomScene 同一个 RainWindow,
   * 屋里看是什么样,推近了还是什么样。它压在原画下面,所以只在玻璃里露出来。
   */
  private buildFrame(): void {
    this.glassRain = new RainWindow(this, {
      x: GLASS.x / SCALE, y: GLASS.y / SCALE, w: GLASS.w / SCALE, h: GLASS.h / SCALE,
    }, D.glass);

    this.add.image(0, 0, 'window_room').setOrigin(0, 0)
      .setDisplaySize(SW, SH).setDepth(D.frame);

    this.buildSashes();

    /* 白天的光:原画是夜里点着油灯的屋子。太阳升起来以后,
       窗口一圈的墙和窗台该被外面的天光照亮 —— 叠一团从窗口散开的光(ADD),
       再给整间屋子抬一点亮度。夜里两者都是 0,原画原样。 */
    this.dayLight = addGlow(this, GLASS.x + GLASS.w / 2, GLASS.y + GLASS.h * 0.62,
      GLASS.w * 1.25, 0xfff0d0, 0, GLASS.h * 0.8).setDepth(D.light);
    this.roomLift = this.add.rectangle(SW / 2, SH / 2, SW, SH, 0x6a6458, 0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(D.light);
  }

  /**
   * 两扇可开的窗扇(下半部分)。点窗户任意处开/关,两扇错开一点时间,不会像机器一样同步。
   * 窗扇往屋里转(内开),铰链在外侧;窗洞后面就是窗外的世界(outCam 拍的那层)。
   */
  private buildSashes(): void {
    for (const key of ['sash_l', 'sash_r'] as const) {
      const sash = new Sash(this, key, SASHES[key], EYE, u(9)).setDepth(D.sash);
      this.sashes.push(sash);
    }
    const l = SASHES.sash_l, r = SASHES.sash_r;
    const hole = { x: l.x, y: l.y, w: r.x + r.w - l.x, h: l.h };
    this.inflow = new Inflow(this, hole, EYE, SH - u(10)).setDepth(D.inflow);

    /* hover 时窗户透出一点光,告诉人这里能点 */
    this.hoverGlow = addGlow(this, hole.x + hole.w / 2, hole.y + hole.h / 2,
      hole.w * 0.75, 0xcfe6ff, 0, hole.h * 0.6).setDepth(D.light);
    const hit = this.add.rectangle(hole.x + hole.w / 2, hole.y + hole.h / 2, hole.w, hole.h, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true }).setDepth(D.ui);
    hit.on('pointerover', () => this.tweens.add({ targets: this.hoverGlow, alpha: 0.12, duration: 200 }));
    hit.on('pointerout', () => this.tweens.add({ targets: this.hoverGlow, alpha: 0, duration: 300 }));
    hit.on('pointerdown', () => this.toggleWindow());
  }

  private toggleWindow(): void {
    this.ambience.start();                  // 浏览器要求用户操作之后才能出声
    this.isOpen = !this.isOpen;
    this.hint.setText(this.isOpen ? HINT_OPEN : HINT_CLOSED);
    this.tweens.killTweensOf(this.sashes);
    this.sashes.forEach((sash, i) => {
      this.tweens.add({
        targets: sash, open: this.isOpen ? 1 : 0,
        duration: OPEN_MS, delay: (this.isOpen ? i : 1 - i) * 140,
        /* 开:先推开一点再顺势荡开,末尾轻轻回弹;关:收回来,最后"咔"一下贴合 */
        ease: this.isOpen ? 'Back.easeOut' : 'Cubic.easeIn',
      });
    });
  }

  private buildCrank(): void {
    /* 挂在窗户右边的墙上,和窗台差不多高 */
    const cx = GLASS.x + GLASS.w + u(150);
    const cy = SILL.y - u(150);
    this.crank = this.add.container(cx, cy).setDepth(D.ui);

    if (this.hasCrank) {
      const img = this.add.image(0, 0, 'crank_img').setOrigin(0.2, 0.5);
      img.setScale(u(120) / Math.max(img.width, img.height));
      this.crank.add(img);
    } else {
      this.crank.add(this.drawCrank());
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
   * 手摇曲柄:铁底座 + 黄铜摇臂 + 木把手。每个零件都是"墨线 → 固有色 → 暗面 → 高光"四遍,
   * 和屋里原画的上色方式一致。原来是三个纯色几何形,像 UI 图标。
   */
  private drawCrank(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    const ink = 0x1d130c;
    const ex = u(54), ey = -u(30);                       // 摇臂末端(把手位置)
    const ang = Math.atan2(ey, ex), len = Math.hypot(ex, ey);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const arm = (w0: number, w1: number, col: number, dx = 0, dy = 0) => {
      g.fillStyle(col, 1);
      g.fillPoints([
        new Phaser.Geom.Point(dx + nx * w0, dy + ny * w0),
        new Phaser.Geom.Point(dx + ex + nx * w1, dy + ey + ny * w1),
        new Phaser.Geom.Point(dx + ex - nx * w1, dy + ey - ny * w1),
        new Phaser.Geom.Point(dx - nx * w0, dy - ny * w0),
      ], true);
    };
    /* 底座:一块铁圆盘,四颗铆钉 */
    g.fillStyle(ink, 1); g.fillCircle(0, 0, u(19));
    g.fillStyle(0x3b3532, 1); g.fillCircle(0, 0, u(17));
    g.fillStyle(0x2a2522, 1); g.fillCircle(u(2), u(3), u(14));
    g.fillStyle(0x6a605a, 0.8); g.fillCircle(-u(5), -u(6), u(6));
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      g.fillStyle(ink, 1); g.fillCircle(Math.cos(a) * u(12), Math.sin(a) * u(12), u(2.6));
      g.fillStyle(0x8a7f76, 1); g.fillCircle(Math.cos(a) * u(12) - u(0.6), Math.sin(a) * u(12) - u(0.6), u(1.4));
    }
    /* 黄铜摇臂:根部粗、末端细 */
    arm(u(6.5), u(5), ink);
    arm(u(4.8), u(3.4), 0xb08a3e);
    arm(u(1.8), u(1.2), 0x7a5a26, nx * u(2.2), ny * u(2.2));          // 下侧暗面
    arm(u(1.3), u(0.9), 0xf2d58a, -nx * u(2.2), -ny * u(2.2));        // 上侧高光
    /* 中轴螺帽 */
    g.fillStyle(ink, 1); g.fillCircle(0, 0, u(8));
    g.fillStyle(0xc49a4a, 1); g.fillCircle(0, 0, u(6.5));
    g.fillStyle(0xf6e0a0, 0.9); g.fillCircle(-u(2), -u(2), u(2.4));
    /* 木把手 */
    g.fillStyle(ink, 1); g.fillCircle(ex, ey, u(13.5));
    g.fillStyle(0x7a4a2a, 1); g.fillCircle(ex, ey, u(11.5));
    g.fillStyle(0x4e2c18, 1); g.fillCircle(ex + u(2.5), ey + u(3), u(8.5));
    g.fillStyle(0xc88a58, 0.85); g.fillEllipse(ex - u(3.5), ey - u(4), u(8), u(5));
    void len;
    return g;
  }

  /**
   * 窗台上的盆栽 —— 季节的控件兼指示器。
   * 摆在窗框下沿那条木边上(那本来就是死空间),几乎不占窗口。
   * 它的枝叶用的是窗外那棵树同一套生成器,只是小一号 —— 屋里屋外同一个季节,同一种植物。
   */
  private buildPlant(): void {
    /* 摆在油灯旁边的书桌上 —— 窗台留给窗扇转开的空间 */
    const px = u(370);
    const potTop = u(462);
    this.plant = this.add.container(px, potTop).setDepth(D.ui);

    /* hover 时透出一圈暖光:不给点提示的话,没人知道这盆花能碰 */
    this.plantGlow = this.add.circle(0, -u(28), u(46), 0xffd070, 0);
    this.plant.add(this.plantGlow);

    this.plantTree = new Tree(this, px, potTop + u(2), u(70));
    this.plantTree.c.setDepth(D.ui);
    this.plantTree.fallLayer.setDepth(D.ui);

    /* 陶盆:压在枝干根部之上,把树根那截藏掉。
       墨线勾边 → 陶土固有色 → 右侧背光 → 左侧一道高光 → 盆沿 → 盆土,外加窗台上一小团投影。 */
    const pot = this.add.graphics().setDepth(D.ui + 1);
    const w0 = u(21), w1 = u(15), hgt = u(23), o = u(1.6);
    const P = (x: number, y: number) => new Phaser.Geom.Point(x, y);
    const ink = 0x1d130c;
    pot.fillStyle(0x000000, 0.28);
    pot.fillEllipse(px + u(4), potTop + hgt + u(1), w0 * 2.4, u(7));
    pot.fillStyle(ink, 1);
    pot.fillPoints([P(px - w0 - o, potTop), P(px + w0 + o, potTop),
                    P(px + w1 + o, potTop + hgt + o), P(px - w1 - o, potTop + hgt + o)], true);
    pot.fillStyle(0xa8603c, 1);
    pot.fillPoints([P(px - w0, potTop), P(px + w0, potTop),
                    P(px + w1, potTop + hgt), P(px - w1, potTop + hgt)], true);
    pot.fillStyle(0x6e3a22, 0.75);
    pot.fillPoints([P(px + w0 * 0.25, potTop), P(px + w0, potTop),
                    P(px + w1, potTop + hgt), P(px + w1 * 0.2, potTop + hgt)], true);
    pot.fillStyle(0xe2a070, 0.7);
    pot.fillPoints([P(px - w0 * 0.72, potTop + u(2)), P(px - w0 * 0.52, potTop + u(2)),
                    P(px - w1 * 0.45, potTop + hgt - u(3)), P(px - w1 * 0.66, potTop + hgt - u(3))], true);
    /* 盆沿 */
    const rx = px - w0 - u(3), rw = (w0 + u(3)) * 2, ry = potTop - u(6), rh = u(8);
    pot.fillStyle(ink, 1); pot.fillRoundedRect(rx - o, ry - o, rw + o * 2, rh + o * 2, u(2.5));
    pot.fillStyle(0xbc7048, 1); pot.fillRoundedRect(rx, ry, rw, rh, u(2));
    pot.fillStyle(0x7a4028, 0.7); pot.fillRect(rx + rw * 0.6, ry + rh * 0.5, rw * 0.4 - u(1), rh * 0.5);
    pot.fillStyle(0xf0b888, 0.65); pot.fillRect(rx + u(3), ry + u(1.5), rw * 0.45, u(1.8));

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

    /* 天空:下雨时整体往灰蓝里拉一点 */
    const grey = this.rainNow * 0.45;
    this.sky.draw(this.lerpColor(k.top, 0x4a5168, grey), this.lerpColor(k.bot, 0x8a8e9c, grey));

    /* 日月:绕同一条弧,相位差半天。t=0 从右侧地平线升起,0.25 到天顶,0.5 从左侧落下。 */
    this.placeOrb(this.sun, t, true);
    this.placeOrb(this.moon, (t + 0.5) % 1, false);
    this.moonHalo.setPosition(this.moon.x, this.moon.y).setAlpha(this.moon.alpha * 0.34);

    /* 地景:A=当前季节 B=下一季,靠 B 的透明度过渡;再统一按时段 multiply 染色 */
    for (let i = 0; i < this.landA.length; i++) {
      this.landA[i].setTexture(SEASON[s.i].key).setTint(k.land);
      this.landB[i].setTexture(SEASON[s.j].key).setTint(k.land).setAlpha(s.k);
    }
    /* 树吃和地景同一个光 —— 原来半夜地是蓝黑的、树还是正午那么亮 */
    for (const tr of this.trees) { tr.setLight(k.land); tr.setSeason(this.seasonVal, force); }
    /* 盆栽在屋里,只吃一半窗外的光 */
    this.plantTree?.setLight(this.lerpColor(0xffffff, k.land, 0.5));
    this.plantTree?.setSeason(this.seasonVal, force);

    this.tintLayer.setFillStyle(k.tintC, 1).setAlpha(k.tintA);

    /* 屋里吃到的天光:白天亮、黄昏偏暖、夜里没有(原画本身就是夜) */
    const day = Phaser.Math.Clamp(1 - k.star * 1.6, 0, 1) * (1 - this.rainNow * 0.4);
    this.dayLight.setTint(this.lerpColor(0xfff4dc, k.bot, 0.5)).setAlpha(day * 0.2);
    this.roomLift.setAlpha(day * 0.4);
    this.glassRain?.setIntensity(Phaser.Math.Clamp(this.rainNow * 2.2, 0, 1));

    /* 云:跟着天色一起被染 —— 不染的话正午的天是蓝的、云还是夕阳的粉橙,一眼假。
       云图本身就画着受光面和背光面,染色只要轻轻往天色推:白天几乎原色,
       入夜压到天顶色,下雨再往灰里拉。 */
    let cloudTint = this.lerpColor(0xffffff, k.bot, 0.22);
    cloudTint = this.lerpColor(cloudTint, k.top, Phaser.Math.Clamp(k.star * 0.85, 0, 0.85));
    cloudTint = this.lerpColor(cloudTint, 0x8a8f9e, this.rainNow * 0.5);
    /* 黄昏味:太阳贴近地平线(不管升起还是落下)时为 1,高挂或深夜为 0 */
    const sunElev = Math.sin(Math.PI * 2 * t);
    const warm = Phaser.Math.Clamp(1 - Math.abs(sunElev + 0.05) / 0.55, 0, 1);
    const cloudA = 0.62 + 0.3 * (1 - k.star);
    for (const c of this.clouds) {
      const img = c as Phaser.GameObjects.Image;
      if (img.setTint) img.setTint(cloudTint);
      img.setAlpha(cloudA);
      const dusk = (c as any)._dusk as Phaser.GameObjects.Image | undefined;
      if (dusk) dusk.setTint(cloudTint).setAlpha(cloudA * warm);
    }
    this.overcast.setAlpha(this.rainNow * 0.16 * (1 - k.star * 0.6));

    /* 星星:各自有个出场阈值,天黑到一定程度才逐颗亮起来 */
    for (const st of this.stars) {
      (st.o as any)._base = Phaser.Math.Clamp((k.star - st.th * 0.85) * 4, 0, 1);
    }
    /* 萤火虫 = 夜色 × 季节。夏夜最盛,冬天一只没有。 */
    for (const f of this.flies) {
      (f.o as any)._base = Phaser.Math.Clamp((k.star - 0.45) * 2.6, 0, 1) * s.fly;
    }
  }

  private placeOrb(orb: Phaser.GameObjects.Container | Phaser.GameObjects.Image,
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
      this.sunCore.setTint(this.lerpColor(0xffe08a, 0xff6a3a, low));
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
    /* 树跟着小屋的行走慢慢往后退,走出画面就从另一边绕回来。
       周期取 1.8 个窗宽:出画和入画之间留一段空,不会刚消失又冒出来。 */
    const period = W * 1.8;
    this.treeOffset += TREE_DRIFT * dt;
    for (let i = 0; i < this.trees.length; i++) {
      const tr = this.trees[i] as any;
      let x = (tr._home * W - this.treeOffset * tr._par) % period;
      if (x < -W * 0.4) x += period;
      this.trees[i].c.x = x;
      this.trees[i].update(dt, tsec, H);
      this.trees[i].spawnFall(s.leaf * 7, dt, H);
    }
    this.plantTree.update(dt, tsec * 0.6, H);

    /* 阵雨:雨量随时间起落,一阵一阵的,不是从头下到尾。
       雨大的时候天色、云一起变灰(render 里读 rainNow)。 */
    const shower = Phaser.Math.Clamp(0.55 + 0.6 * Math.sin(tsec * 0.09) + 0.25 * Math.sin(tsec * 0.23 + 1.7), 0, 1);
    const rain = s.rain * shower;
    if (Math.abs(rain - this.rainNow) > 0.01) { this.rainNow = rain; this.render(); }
    this.life.update(dt, rain, s.snow, s.bird, s.dir, light);
    this.glassRain.update(dt);

    /* 窗扇:开度取两扇的平均。玻璃上的雾和水珠随开窗淡掉;开着窗屋里更亮。 */
    for (const sh of this.sashes) sh.layout();
    this.openVal = this.sashes.reduce((a, b) => a + Phaser.Math.Clamp(b.open, 0, 1), 0) / this.sashes.length;
    const o = this.openVal;
    this.glassRain.setIntensity(Phaser.Math.Clamp(this.rainNow * 2.2, 0, 1), 1 - o * 0.85);
    const day = 1 - k.star;
    /* 飘进屋的东西:按季节、天气、昼夜,再乘开窗程度 */
    const inflowRates = {
      rain: rain * 120 * o,
      snow: s.snow * 26 * o,
      petal: (s.i === 0 ? 1 - s.k : s.i === 3 ? s.k : 0) * 2.2 * o * (1 - rain),
      leaf: s.leaf * 2.6 * o,
      fly: s.fly * Phaser.Math.Clamp((k.star - 0.45) * 2.6, 0, 1) * 1.4 * o,
    };
    this.inflow.update(dt, tsec, inflowRates, day);
    /* 风:开窗时盆栽被风吹得摇得更厉害 */
    this.plantTree.c.rotation += Math.sin(tsec * 2.1) * 0.035 * o + Math.sin(tsec * 5.3) * 0.014 * o;
    this.ambience.update(dt, o, 0.4 + 0.4 * Math.sin(tsec * 0.05) ** 2, rain);

    for (const c of this.clouds) {
      const o = c as any;
      o.x += o._speed * dt;
      const half = (o.displayWidth ?? u(160)) / 2;
      if (o.x - half > W) o.x = -half;
      if (o._dusk) o._dusk.x = o.x;
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
    this.roomCam.fadeOut(500, 10, 12, 30);
    this.ambience.stop();
    this.roomCam.once('camerafadeoutcomplete', () => this.scene.start('Room'));
  }
}
