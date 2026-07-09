import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Dialog } from '../systems/dialog';

/** 交互点:对应 design.md 表② */
interface Interactive {
  x: number;
  y: number;
  range: number;
  label: string;
  action: () => void;
}

/**
 * 第三幕:室内第一人称探索。
 * 没有角色 —— WASD 移动的是"你的视角",相机在房间里平移。
 * 靠近物品时,物品旁浮现 E 提示;按 E 打开内容弹层。
 * 按 `(反引号)开调试:显示交互点范围与坐标。
 */

/* ===== 房间参数 ===== */
const ROOM_W = 2200;        // 房间逻辑宽度(比屏幕宽,可以左右走)
const ROOM_H = 700;         // 房间逻辑高度
const MOVE_SPEED = 300;     // 移动速度(逻辑 px/s)
const START_X = 200;        // 出生点(进门处)
const START_Y = 500;
/* 可行走范围(你的"脚"能到的区域) */
const BOUNDS = { minX: 120, maxX: ROOM_W - 120, minY: 430, maxY: 620 };

export class RoomScene extends Phaser.Scene {
  private pos = { x: START_X, y: START_Y };   // "你"在房间里的位置(逻辑坐标)
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private dialog!: Dialog;
  private interactives: Interactive[] = [];
  private prompts: Map<Interactive, Phaser.GameObjects.Container> = new Map();
  private debugLayer: Phaser.GameObjects.Container | null = null;

  constructor() { super('Room'); }

  create(): void {
    this.pos = { x: START_X, y: START_Y };

    this.paintPlaceholder();

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E') as any;
    this.dialog = new Dialog(this);

    this.buildInteractives();
    this.buildHUD();

    /* 相机:跟随"你"的位置,限制在房间边界内 */
    const cam = this.cameras.main;
    cam.setBounds(0, 0, u(ROOM_W), u(ROOM_H));
    cam.centerOn(u(this.pos.x), u(this.pos.y) - u(60));
    cam.fadeIn(900, 255, 224, 176);   // 从暖光淡入,接住第二幕的过曝

    this.input.keyboard!.on('keydown-BACKTICK', () => this.toggleDebug());
  }

  /** 占位房间:等真图来了替换这个方法 */
  private paintPlaceholder(): void {
    const wall = this.add.graphics();
    wall.fillGradientStyle(0xc8a878, 0xc8a878, 0xa8875c, 0xa8875c, 1);
    wall.fillRect(0, 0, u(ROOM_W), u(430));
    const floor = this.add.graphics();
    floor.fillGradientStyle(0x8a6a48, 0x8a6a48, 0x5d4430, 0x5d4430, 1);
    floor.fillRect(0, u(430), u(ROOM_W), u(ROOM_H) - u(430));
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(0, u(460) + i * u(40), u(ROOM_W) * 2, 2, 0x4a3520, 0.3);
    }
    this.add.rectangle(u(ROOM_W) / 2, u(24), u(ROOM_W), u(48), 0x5d4430);

    /* 壁炉 */
    const fp = this.add.container(u(320), u(430)).setScale(SCALE);
    fp.add([
      this.add.rectangle(0, -110, 130, 220, 0x6a6a72),
      this.add.rectangle(0, -60, 90, 110, 0x1a1a1e),
      this.add.triangle(0, -14, 0, -52, 26, 0, -26, 0, 0xffb347),
    ]);
    const glow = this.add.circle(u(320), u(380), u(110), 0xff9a3c, 0.14);
    this.tweens.add({ targets: glow, alpha: 0.24, duration: 800, yoyo: true, repeat: -1 });

    /* 书架 */
    const shelf = this.add.container(u(760), u(430)).setScale(SCALE);
    shelf.add([this.add.rectangle(0, -130, 170, 260, 0x4a3423).setStrokeStyle(4, 0x33241a)]);
    const cols = [0x8a4a3a, 0x3a6a5a, 0x9a7a3a, 0x4a5a8a];
    for (let r = 0; r < 3; r++) {
      for (let b = 0; b < 7; b++) {
        shelf.add(this.add.rectangle(-58 + b * 20, -200 + r * 72, 13, 44, cols[(b + r) % 4]));
      }
    }

    /* 桌子 */
    const table = this.add.container(u(1200), u(500)).setScale(SCALE);
    table.add([
      this.add.rectangle(-56, -34, 12, 40, 0x5a4230).setOrigin(0.5, 0),
      this.add.rectangle(56, -34, 12, 40, 0x5a4230).setOrigin(0.5, 0),
      this.add.rectangle(0, -40, 160, 16, 0x7a5a3c).setStrokeStyle(3, 0x4a3520),
      this.add.circle(-20, -52, 9, 0xd06a4a),
      this.add.rectangle(28, -54, 26, 14, 0xe8dcc0),
    ]);

    /* 窗 + 光柱 */
    this.add.rectangle(u(1650), u(230), u(140), u(170), 0xa8c4e0).setStrokeStyle(6, 0x5a4230);
    this.add.rectangle(u(1650), u(230), u(4), u(170), 0x5a4230);
    this.add.rectangle(u(1650), u(230), u(140), u(4), 0x5a4230);
    this.add.triangle(u(1600), u(500), 0, -u(270), u(140), u(90), -u(90), u(90), 0xfff0d0, 0.12);

    /* 上锁的门(毕设,design.md I5) */
    this.add.rectangle(u(1950), u(360), u(110), u(240), 0x4a3628).setStrokeStyle(5, 0x33251a);
    this.add.text(u(1950), u(360), '🔒', { fontSize: `${34 * SCALE}px` }).setOrigin(0.5);
  }

  /** 交互点 + 每个点旁边的 E 提示气泡(初始隐藏) */
  private buildInteractives(): void {
    this.interactives = [
      { x: 320, y: 470, range: 150, label: 'Warm up by the fire',
        action: () => this.dialog.open('Fireplace', 'design.md 表② I2 —— 关于我的内容放这里。') },
      { x: 760, y: 470, range: 150, label: 'Browse the shelf',
        action: () => this.dialog.open('Bookshelf · Works', 'design.md 表② I1 —— SuperAuto、这个网站本身,作品卡片放这里。') },
      { x: 1200, y: 540, range: 150, label: 'Look at the desk',
        action: () => this.dialog.open('The Desk', 'design.md 表② I3/I4 —— 简历下载、联系方式放这里。') },
      { x: 1650, y: 500, range: 150, label: 'Look outside',
        action: () => this.dialog.open('The Window', 'design.md 表② I5 彩蛋 —— 一句关于窗外的闲话。') },
      { x: 1950, y: 480, range: 150, label: 'A locked door',
        action: () => this.dialog.open('🔒 Locked', '毕业设计正在酝酿中,这扇门暂时打不开 —— 过阵子回来看看?') },
    ];

    /* 每个交互点上方一个 E 气泡,靠近时淡入 */
    for (const it of this.interactives) {
      const c = this.add.container(u(it.x), u(it.y) - u(160)).setDepth(900).setAlpha(0);
      const bubble = this.add.circle(0, 0, u(16), 0xffffff, 0.95);
      const e = this.add.text(0, 0, 'E', {
        fontFamily: '"Nunito", sans-serif',
        fontSize: `${16 * SCALE}px`, fontStyle: 'bold', color: '#333',
      }).setOrigin(0.5);
      const label = this.add.text(0, u(28), it.label, {
        fontFamily: '"Nunito", sans-serif',
        fontSize: `${13 * SCALE}px`, color: '#fff',
        backgroundColor: 'rgba(0,0,0,.55)', padding: { x: 8, y: 3 },
      }).setOrigin(0.5, 0);
      c.add([bubble, e, label]);
      this.prompts.set(it, c);
    }
  }

  private buildHUD(): void {
    /* HUD 固定在屏幕上,不随相机移动 */
    this.add.text(W / 2, H - u(24), 'WASD / Arrows to move · Press E to interact', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${14 * SCALE}px`, color: 'rgba(255,255,255,.85)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.6)', blur: 6, fill: true },
    }).setOrigin(0.5, 1).setDepth(999).setScrollFactor(0);
  }

  private toggleDebug(): void {
    if (this.debugLayer) {
      this.debugLayer.destroy();
      this.debugLayer = null;
      this.input.off('pointerdown', this.logPointer, this);
      return;
    }
    const g = this.add.container(0, 0).setDepth(950);
    for (const it of this.interactives) {
      g.add(this.add.circle(u(it.x), u(it.y), u(it.range), 0xd60000, 0.12).setStrokeStyle(2, 0xd60000, 0.8));
      g.add(this.add.text(u(it.x), u(it.y), `${it.label}\n(${it.x}, ${it.y})`, {
        fontSize: `${12 * SCALE}px`, color: '#fff', backgroundColor: 'rgba(0,0,0,.6)',
        padding: { x: 6, y: 3 }, align: 'center',
      }).setOrigin(0.5));
    }
    g.add(this.add.rectangle(
      u((BOUNDS.minX + BOUNDS.maxX) / 2), u((BOUNDS.minY + BOUNDS.maxY) / 2),
      u(BOUNDS.maxX - BOUNDS.minX), u(BOUNDS.maxY - BOUNDS.minY), 0x00ff88, 0.06,
    ).setStrokeStyle(2, 0x00ff88, 0.7));
    this.input.on('pointerdown', this.logPointer, this);
    this.debugLayer = g;
  }

  private logPointer(p: Phaser.Input.Pointer): void {
    if (this.debugLayer) {
      console.log(`coord: x=${Math.round(p.worldX / SCALE)}, y=${Math.round(p.worldY / SCALE)}`);
    }
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const k = this.keys;
    const touch = (window as any).__touch || {};

    /* 弹层打开时冻结移动 */
    if (this.dialog.isOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.E) || touch.e) { touch.e = false; this.dialog.close(); }
      return;
    }

    /* 移动"你"的位置 */
    let dx = 0, dy = 0;
    if (k.A.isDown || k.LEFT.isDown || touch.left) dx = -1;
    if (k.D.isDown || k.RIGHT.isDown || touch.right) dx = 1;
    if (k.W.isDown || k.UP.isDown || touch.up) dy = -1;
    if (k.S.isDown || k.DOWN.isDown || touch.down) dy = 1;

    this.pos.x = Phaser.Math.Clamp(this.pos.x + MOVE_SPEED * dx * dt, BOUNDS.minX, BOUNDS.maxX);
    this.pos.y = Phaser.Math.Clamp(this.pos.y + MOVE_SPEED * 0.55 * dy * dt, BOUNDS.minY, BOUNDS.maxY);

    /* 相机跟随视角(稍微抬高,像人的视线) */
    const cam = this.cameras.main;
    const targetX = u(this.pos.x);
    const targetY = u(this.pos.y) - u(60);
    cam.scrollX += (targetX - W / 2 - cam.scrollX) * 0.08;
    cam.scrollY += (targetY - H / 2 - cam.scrollY) * 0.08;

    /* 交互检测:找最近的可交互点 */
    let near: Interactive | null = null;
    let minDist = Infinity;
    for (const it of this.interactives) {
      const d = Phaser.Math.Distance.Between(this.pos.x, this.pos.y, it.x, it.y);
      if (d < it.range && d < minDist) { near = it; minDist = d; }
    }

    /* 气泡:靠近的那个淡入,其余淡出 */
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