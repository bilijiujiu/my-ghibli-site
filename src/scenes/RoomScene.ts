import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Dialog } from '../systems/dialog';
import { HeroRig } from '../entities/HeroRig';
import { BookOverlay } from '../systems/BookOverlay';
import { RainWindow } from '../systems/RainWindow';

/** 交互点:对应 design.md 表② */
interface Interactive {
  x: number;
  y: number;
  range: number;
  label: string;
  action: () => void;
}

/**
 * 第三幕:室内探索(room.webp 长卷)。
 * 布局:门(左) → 壁炉 → 书架 → 桌子 → 窗 → 楼梯(右)
 * 角色:剪纸骨架(HeroRig),WASD 移动,四肢摆动。
 */

/* ===== 标定开关 ===== */
const DEBUG = true;

/* ===== 房间参数 ===== */
const ROOM_H = 620;
const ROOM_W = ROOM_H * 4;   // 2480
const MOVE_SPEED = 320;
const START_X = 150;
const START_Y = 520;
const BOUNDS = { minX: 120, maxX: ROOM_W - 120, minY: 480, maxY: 570 };

/* ===== 角色参数(调这里) ===== */
const HERO_SCALE = 0.48;      // 角色整体缩放
const HERO_Y_OFFSET = 86;    // 容器中心相对脚底的偏移 = 550(原图) × HERO_SCALE

/* ===== 窗户区域(你量的坐标:左上1616,274 右下1792,437) ===== */
const WIN = { x: 1616, y: 274, w: 1792 - 1616, h: 437 - 274 };

export class RoomScene extends Phaser.Scene {
  private pos = { x: START_X, y: START_Y };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private dialog!: Dialog;
  private book!: BookOverlay;
  private rain!: RainWindow;
  private rig!: HeroRig;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private interactives: Interactive[] = [];
  private prompts: Map<Interactive, Phaser.GameObjects.Container> = new Map();
  private coordText?: Phaser.GameObjects.Text;

  constructor() { super('Room'); }

  preload(): void {
    this.load.image('room', '/room.webp');
    this.load.image('hero_head', '/hero_base_head.png');
    this.load.image('hero_arm', '/hero_base_arm.png');
    this.load.image('hero_leg', '/hero_base_leg.png');
    this.load.image('hero_torso', '/hero_base_body.png');
    this.load.image('book_open', '/book_open.png');
  }

  create(): void {
    this.pos = { x: START_X, y: START_Y };

    this.paintScene();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E') as any;
    this.dialog = new Dialog(this);
    this.book = new BookOverlay(this);

    this.buildInteractives();
    this.buildHero();
    this.buildHUD();

    /* 窗户玻璃雨滴(一直下) */
    this.rain = new RainWindow(this, WIN);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, u(ROOM_W), u(ROOM_H));
    cam.scrollX = 0;
    cam.scrollY = 0;
    cam.fadeIn(900, 255, 224, 176);

    if (DEBUG) this.buildDebug();
  }

  private paintScene(): void {
    const src = this.textures.get('room').getSourceImage() as HTMLImageElement;
    const scale = u(ROOM_H) / src.height;
    this.add.image(0, 0, 'room').setOrigin(0, 0).setScale(scale).setDepth(0);

    /* 壁炉火光呼吸 */
    const fireGlow = this.add.circle(u(609), u(424), u(130), 0xff9a3c, 0.10).setDepth(1);
    this.tweens.add({ targets: fireGlow, alpha: 0.20, duration: 900, yoyo: true, repeat: -1 });

    /* 吊灯光晕呼吸 */
    const lampGlow = this.add.circle(u(660), u(90), u(85), 0xffd88a, 0.08).setDepth(1);
    this.tweens.add({ targets: lampGlow, alpha: 0.16, duration: 1400, yoyo: true, repeat: -1 });

    /* 桌上油灯的微光 */
    const deskLamp = this.add.circle(u(1470), u(360), u(70), 0xffc870, 0.08).setDepth(1);
    this.tweens.add({ targets: deskLamp, alpha: 0.15, duration: 1200, yoyo: true, repeat: -1 });
  }

  /** 角色:落地阴影 + 剪纸骨架 */
  private buildHero(): void {
    this.heroShadow = this.add.ellipse(u(START_X), u(START_Y), u(56), u(13), 0x000000, 0.25)
      .setDepth(499);

    this.rig = new HeroRig(this, u(START_X), u(START_Y) - u(HERO_Y_OFFSET));
    this.rig.c.setScale(HERO_SCALE);
    this.rig.c.setDepth(500);
  }

  private buildInteractives(): void {
    this.interactives = [
      { x: 609, y: 520, range: 150, label: 'Warm up by the fire',
        action: () => this.scene.start('Fireplace') },
      { x: 1157, y: 520, range: 150, label: 'Browse the shelf',
        action: () => this.book.open() },
      { x: 1425, y: 525, range: 140, label: 'Look at the desk',
        action: () => this.dialog.open('The Desk', 'design.md 表② I3/I4 —— 简历、联系方式放这里。') },
      { x: 1720, y: 520, range: 150, label: 'Look outside',
        action: () => this.dialog.open('The Window', 'design.md 表② 彩蛋 —— 关于窗外夜色的闲话。') },
      { x: 2142, y: 525, range: 170, label: 'Go upstairs',
        action: () => this.dialog.open('Upstairs', '楼上还在整理中 —— 毕业设计正在酝酿。过阵子回来看看?') },
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

    this.coordText = this.add.text(u(20), u(20), 'DEBUG: 点击画面获取坐标', {
      fontFamily: 'monospace',
      fontSize: `${16 * SCALE}px`, color: '#0f8',
      backgroundColor: 'rgba(0,0,0,.85)', padding: { x: 12, y: 8 },
    }).setDepth(999).setScrollFactor(0);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const x = Math.round(p.worldX / SCALE);
      const y = Math.round(p.worldY / SCALE);
      this.coordText?.setText(`DEBUG 坐标: x=${x}, y=${y}`);
      console.log(`x=${x}, y=${y}`);
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const k = this.keys;
    const touch = (window as any).__touch || {};

    /* 窗户雨滴:一直下,不受开书/开对话影响 */
    this.rain.update(dt);

    /* 书打开时:E 关书,吃掉其他输入,角色待机 */
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

    /* ---- 角色 ---- */
    const moving = dx !== 0 || dy !== 0;
    this.rig.update(dt, moving);
    if (dx !== 0) this.rig.setDirection(dx);

    this.rig.c.setPosition(u(this.pos.x), u(this.pos.y) - u(HERO_Y_OFFSET));
    this.heroShadow.setPosition(u(this.pos.x), u(this.pos.y));

    /* 相机跟随 */
    const cam = this.cameras.main;
    cam.scrollX += (u(this.pos.x) - W / 2 - cam.scrollX) * 0.08;
    cam.scrollY = 0;

    /* 交互检测 */
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