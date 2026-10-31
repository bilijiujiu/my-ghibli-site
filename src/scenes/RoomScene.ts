import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Dialog } from '../systems/dialog';
import { HeroRig } from '../entities/HeroRig';
import { BookOverlay } from '../systems/BookOverlay';
import { MoonBeam } from '../systems/MoonBeam';
import { Achievements, AchievementPanel } from '../systems/achievements';
import { playStairs } from '../systems/AtticAudio';

interface Interactive {
  x: number;
  y: number;
  range: number;
  label: string;
  action: () => void;
}

const DEBUG = false;

const ROOM_H = 620;
const ROOM_W = ROOM_H * 4;
const MOVE_SPEED = 320;
const START_X = 150;
/*
 * 可行走带:只许走在所有家具前面那一条空地板上。
 * 在 room.webp 上量了一遍物件压在地板上的最低点(逻辑坐标):
 *   左墙护墙板 ~565 · 柴堆 ~553 · 壁炉炉台 ~540 · 书堆 ~555 · 书桌腿 ~545 · 楼梯脚 ~575。
 * 原来脚底能走到 535,等于站在炉台和书堆上面。现在脚底限制在 580~606:
 * 永远在所有东西的前面,画角色时直接压在它们上面也不会穿帮。
 */
const FOOT_MIN = 580, FOOT_MAX = 606;
const START_Y = 590 - 55;
const BOUNDS = { minX: 120, maxX: ROOM_W - 120, minY: FOOT_MIN - 55, maxY: FOOT_MAX - 55 };

const HERO_SCALE = 0.48;
/*
 * 新骨架的原点在脚底。但 pos.y 并不是地板线 —— 可行走带 BOUNDS 是 480~570,
 * 而 room.webp 里 x≈150 处墙裙与地板的交界在逻辑 y≈565,往右到壁炉一带约 545。
 * 也就是说 pos.y 更像是"腰线",要再往下压这么多,靴底才真正踩在地板上。
 * (旧骨架的原点在 1200px 画布正中,配合 HERO_Y_OFFSET=86 正好也是这个落点,
 *  所以这个值同时保证了交互气泡、遮挡关系这些按老位置调过的东西不跑偏。)
 */
const HERO_FOOT_DROP = 55;

const WIN = { x: 1616, y: 274, w: 1792 - 1616, h: 437 - 274 };

/* 记住离开房间时的位置。首次为 null(开场从左侧进入),从子场景返回时恢复。 */
let savedPos: { x: number; y: number } | null = null;
/** 从哪个子场景回来的(决定进场方式)。null = 从门廊第一次进屋 */
let returnFrom: string | null = null;

export class RoomScene extends Phaser.Scene {
  private pos = { x: START_X, y: START_Y };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private dialog!: Dialog;
  private book!: BookOverlay;
  private moon!: MoonBeam;
  private achPanel!: AchievementPanel;
  private rig!: HeroRig;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private interactives: Interactive[] = [];
  private prompts: Map<Interactive, Phaser.GameObjects.Container> = new Map();
  private coordText?: Phaser.GameObjects.Text;
  private climbing = false;

  constructor() { super('Room'); }

  preload(): void {
    this.load.image('room', '/room.webp');
    HeroRig.preload(this);
    this.load.image('book_open', '/book_open.png');
    this.load.image('page_paper', '/page_paper.png');
  }

  create(): void {
    /* 从子场景返回时恢复上次位置;首次开场用起点 */
    this.pos = savedPos ? { ...savedPos } : { x: START_X, y: START_Y };
    /* 旧存档里的位置可能在新的可行走带外面 */
    this.pos.y = Phaser.Math.Clamp(this.pos.y, BOUNDS.minY, BOUNDS.maxY);
    this.climbing = false;
    /* 场景对象会被复用:从壁炉/书桌/窗户/阁楼回来时,上一次的提示气泡已经销毁了,别留在表里 */
    this.prompts = new Map();

    this.paintScene();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E') as any;
    this.dialog = new Dialog(this);
    this.book = new BookOverlay(this);
    this.achPanel = new AchievementPanel(this);

    this.buildInteractives();
    this.buildHero();
    this.buildHUD();

    /* 窗玻璃上原来是一颗颗匀速往下掉的"雨滴",像串珠门帘;换成从窗口照进来的月光 */
    this.moon = new MoonBeam(this, WIN, 503);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, u(ROOM_W), u(ROOM_H));
    /* 镜头直接落在主角身上。原来固定从 0 开始,每次从子场景回来镜头都要从屋子最左边滑过来 */
    cam.scrollX = Phaser.Math.Clamp(u(this.pos.x) - W / 2, 0, u(ROOM_W) - W);
    cam.scrollY = 0;
    /* 进场:
       - 第一次从门廊进来:门里漫出来的暖光是白里透橙的,从这个颜色淡入,接得上;
       - 从子场景回来:那边都是淡出到暗色,这里也从暗色淡入。原来一律从奶白色淡入,
         于是"暗 → 一下子亮白 → 屋里",看着就是一次白屏闪烁,很刺眼。
       - 从窗户回来:镜头先推在窗户上,再慢慢拉回整个屋子 —— 正好是"看窗外"那一下的反向。 */
    if (returnFrom === null) {
      cam.fadeIn(900, 255, 224, 176);
    } else {
      cam.fadeIn(700, 10, 12, 20);
      if (returnFrom === 'Window') {
        cam.setZoom(1.6);
        cam.zoomTo(1, 1100, 'Sine.easeOut');
      }
    }
    returnFrom = null;

    if (DEBUG) this.buildDebug();
  }

  /**
   * 上楼:镜头顺着楼梯往右上方摇、慢慢推近,木楼梯一步一响,
   * 摇到一半画面暗下去,接阁楼(AtticScene 从黑里亮起来,两边接得上)。
   */
  private climbStairs(): void {
    if (this.climbing) return;
    this.climbing = true;
    savedPos = { ...this.pos };
    returnFrom = 'Attic';
    Achievements.unlock('stairs', this);
    playStairs(7, 0.3);
    const cam = this.cameras.main;
    cam.pan(u(2300), u(250), 1800, 'Sine.easeIn');
    cam.zoomTo(1.35, 1800, 'Sine.easeIn');
    this.time.delayedCall(1000, () => cam.fadeOut(800, 0, 0, 0));
    cam.once('camerafadeoutcomplete', () => this.scene.start('Attic'));
  }

  private paintScene(): void {
    const src = this.textures.get('room').getSourceImage() as HTMLImageElement;
    const scale = u(ROOM_H) / src.height;
    this.add.image(0, 0, 'room').setOrigin(0, 0).setScale(scale).setDepth(0);

    const fireGlow = this.add.circle(u(609), u(424), u(130), 0xff9a3c, 0.10).setDepth(1);
    this.tweens.add({ targets: fireGlow, alpha: 0.20, duration: 900, yoyo: true, repeat: -1 });

    const lampGlow = this.add.circle(u(660), u(90), u(85), 0xffd88a, 0.08).setDepth(1);
    this.tweens.add({ targets: lampGlow, alpha: 0.16, duration: 1400, yoyo: true, repeat: -1 });

    const deskLamp = this.add.circle(u(1470), u(360), u(70), 0xffc870, 0.08).setDepth(1);
    this.tweens.add({ targets: deskLamp, alpha: 0.15, duration: 1200, yoyo: true, repeat: -1 });
  }

  /** 角色脚底(以及影子)应该落在的画布 y */
  private footY(logicalY: number): number {
    return u(logicalY + HERO_FOOT_DROP);
  }

  /**
   * 环境光:人物原图是白天光下的水彩,放进夜里的屋子就像贴上去的。
   * 从 room.webp 上按 x 取一列"人物身后那一段墙"的平均颜色(壁炉边偏暖橙、窗户边偏冷蓝),
   * 归一化成一个乘法色,走到哪就染上哪里的光。只取一次,存成表。
   */
  private ambient: number[] = [];
  private buildAmbient(): void {
    const src = this.textures.get('room').getSourceImage() as HTMLImageElement;
    const N = 128;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = 32;
    const ctx = cv.getContext('2d')!;
    /* 取墙面中下部到地板这一段(逻辑 y 300~600),人物主要就落在这一段前面 */
    const sy = src.height * 300 / ROOM_H, sh = src.height * 300 / ROOM_H;
    ctx.drawImage(src, 0, sy, src.width, sh, 0, 0, N, 32);
    const d = ctx.getImageData(0, 0, N, 32).data;
    this.ambient = [];
    for (let i = 0; i < N; i++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < 32; j++) { const k = (j * N + i) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; }
      const m = Math.max(r, g, b) || 1;
      /* 只要色相、不要明暗:按最亮的通道归一,再往白色拉回 55%,免得染得太重 */
      const mix = (c: number) => Math.round(255 * (0.55 + 0.45 * (c / m)) * 0.94);
      this.ambient.push((mix(r) << 16) | (mix(g) << 8) | mix(b));
    }
  }
  private ambientAt(x: number): number {
    if (!this.ambient.length) return 0xffffff;
    const f = Phaser.Math.Clamp(x / ROOM_W, 0, 1) * (this.ambient.length - 1);
    const i = Math.floor(f), t = f - i;
    const a = Phaser.Display.Color.IntegerToColor(this.ambient[i]);
    const b = Phaser.Display.Color.IntegerToColor(this.ambient[Math.min(i + 1, this.ambient.length - 1)]);
    return Phaser.Display.Color.GetColor(a.red + (b.red - a.red) * t, a.green + (b.green - a.green) * t, a.blue + (b.blue - a.blue) * t);
  }

  private buildHero(): void {
    this.buildAmbient();
    /* 影子跟脚底同一条线 —— 旧代码把影子画在 pos.y,比脚底高了 55px,
       所以那团椭圆其实浮在小腿肚位置,人看着不像踩在地上。 */
    this.heroShadow = this.add.ellipse(u(START_X), this.footY(START_Y), u(56), u(13), 0x000000, 0.25)
      .setDepth(499);

    this.rig = new HeroRig(this, u(START_X), this.footY(START_Y));
    this.rig.c.setScale(HERO_SCALE);
    this.rig.c.setDepth(500);
  }

  private buildInteractives(): void {
    this.interactives = [
      { x: 609, y: 520, range: 150, label: 'Warm up by the fire',
        action: () => { savedPos = { ...this.pos }; returnFrom = 'Fireplace'; this.scene.start('Fireplace'); } },
      { x: 1157, y: 520, range: 150, label: 'Browse the shelf',
        action: () => { Achievements.unlock('book', this); this.book.open(); } },
      { x: 1425, y: 525, range: 140, label: 'Look at the desk',
        action: () => { savedPos = { ...this.pos }; returnFrom = 'Desk'; this.scene.start('Desk'); } },
      { x: 1720, y: 520, range: 150, label: 'Look outside',
  action: () => { savedPos = { ...this.pos }; returnFrom = 'Window'; this.scene.start('Window'); } },
      { x: 2142, y: 525, range: 170, label: 'Go upstairs',
        action: () => this.climbStairs() },
    ];

    const bubbleY: Record<number, number> = {
      609: 424, 1157: 302, 1425: 394, 1720: 332, 2142: 396,
    };

    for (const it of this.interactives) {
      const anchorY = bubbleY[it.x] ?? (it.y - 180);
      const c = this.add.container(u(it.x), u(anchorY) - u(60)).setDepth(900).setAlpha(0);
      const bubble = this.add.circle(0, 0, u(18), 0xffffff, 0.95);
      const e = this.add.text(0, 0, 'E', {
        fontFamily: '"Nunito", sans-serif',
        fontSize: `${17 * SCALE}px`, fontStyle: 'bold', color: '#333',
      }).setOrigin(0.5);
      const label = this.add.text(0, u(30), it.label, {
        fontFamily: '"Nunito", sans-serif',
        fontSize: `${14 * SCALE}px`, color: '#fff',
        backgroundColor: 'rgba(0,0,0,.6)', padding: { x: 10, y: 4 },
      }).setOrigin(0.5, 0);
      c.add([bubble, e, label]);
      this.prompts.set(it, c);
    }
  }

  private buildHUD(): void {
    this.add.text(W / 2, H - u(24), 'WASD / Arrows to move · Press E to interact', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${14 * SCALE}px`, color: 'rgba(255,255,255,.85)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.7)', blur: 6, fill: true },
    }).setOrigin(0.5, 1).setDepth(999).setScrollFactor(0);
  }

  private buildDebug(): void {
    for (const it of this.interactives) {
      this.add.circle(u(it.x), u(it.y), u(it.range), 0xd60000, 0.15)
        .setStrokeStyle(3, 0xd60000, 0.9).setDepth(950);
      this.add.text(u(it.x), u(it.y), `${it.label}\n(${it.x}, ${it.y})`, {
        fontSize: `${13 * SCALE}px`, color: '#fff', backgroundColor: 'rgba(0,0,0,.8)',
        padding: { x: 8, y: 4 }, align: 'center',
      }).setOrigin(0.5).setDepth(951);
    }

    this.add.rectangle(
      u((BOUNDS.minX + BOUNDS.maxX) / 2), u((BOUNDS.minY + BOUNDS.maxY) / 2),
      u(BOUNDS.maxX - BOUNDS.minX), u(BOUNDS.maxY - BOUNDS.minY), 0x00ff88, 0.08,
    ).setStrokeStyle(3, 0x00ff88, 0.8).setDepth(949);

    this.coordText = this.add.text(u(20), u(20), 'DEBUG: dianji huoqu zuobiao', {
      fontFamily: 'monospace',
      fontSize: `${16 * SCALE}px`, color: '#0f8',
      backgroundColor: 'rgba(0,0,0,.85)', padding: { x: 12, y: 8 },
    }).setDepth(999).setScrollFactor(0);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const x = Math.round(p.worldX / SCALE);
      const y = Math.round(p.worldY / SCALE);
      this.coordText?.setText(`x=${x}, y=${y}`);
      console.log(`x=${x}, y=${y}`);
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const k = this.keys;
    const touch = (window as any).__touch || {};

    this.moon.update(dt);

    if (this.achPanel.isOpen) {
      this.rig.update(dt, false);
      return;
    }

    if (this.book.isOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.E) || touch.e) { touch.e = false; this.book.close(); }
      this.rig.update(dt, false);
      return;
    }

    if (this.dialog.isOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.E) || touch.e) { touch.e = false; this.dialog.close(); }
      this.rig.update(dt, false);
      return;
    }

    let dx = 0, dy = 0;
    if (k.A.isDown || k.LEFT.isDown || touch.left) dx = -1;
    if (k.D.isDown || k.RIGHT.isDown || touch.right) dx = 1;
    if (k.W.isDown || k.UP.isDown || touch.up) dy = -1;
    if (k.S.isDown || k.DOWN.isDown || touch.down) dy = 1;

    this.pos.x = Phaser.Math.Clamp(this.pos.x + MOVE_SPEED * dx * dt, BOUNDS.minX, BOUNDS.maxX);
    this.pos.y = Phaser.Math.Clamp(this.pos.y + MOVE_SPEED * 0.5 * dy * dt, BOUNDS.minY, BOUNDS.maxY);

    const moving = dx !== 0 || dy !== 0;
    this.rig.update(dt, moving);
    if (dx !== 0) this.rig.setDirection(dx);

    this.rig.c.setPosition(u(this.pos.x), this.footY(this.pos.y));
    this.heroShadow.setPosition(u(this.pos.x), this.footY(this.pos.y));
    /* 近大远小:往前走(y 变大)稍微大一点,幅度 ±3% —— 可行走带很窄,够了 */
    const depthF = (this.pos.y - (BOUNDS.minY + BOUNDS.maxY) / 2) / (BOUNDS.maxY - BOUNDS.minY);
    const persp = 1 + depthF * 0.06;
    this.rig.c.setScale(HERO_SCALE * persp * Math.sign(this.rig.c.scaleX || 1), HERO_SCALE * persp);
    this.heroShadow.setScale(persp);
    this.rig.silhouette(this.ambientAt(this.pos.x), 1);

    const cam = this.cameras.main;
    cam.scrollX += (u(this.pos.x) - W / 2 - cam.scrollX) * 0.08;
    cam.scrollY = 0;

    let near: Interactive | null = null;
    let minDist = Infinity;
    for (const it of this.interactives) {
      const d = Phaser.Math.Distance.Between(this.pos.x, this.pos.y, it.x, it.y);
      if (d < it.range && d < minDist) { near = it; minDist = d; }
    }

    for (const [it, c] of this.prompts) {
      const target = it === near ? 1 : 0;
      c.alpha += (target - c.alpha) * 0.15;
    }

    if (near && (Phaser.Input.Keyboard.JustDown(k.E) || touch.e)) {
      touch.e = false;
      near.action();
    }
  }
}
