import Phaser from 'phaser';
import { W, H, u, SCALE, SPEED, DEPTH_FACTOR, ROOM_BOUNDS } from '../config/constants';
import { OUTFITS } from '../config/outfits';
import { Hero } from '../entities/Hero';
import { Dialog } from '../systems/dialog';

interface Interactive {
  x: number;
  y: number;
  range: number;
  label: string;
  action: () => void;
}

/**
 * 第三幕:室内 WASD 自由移动(2.5D 纵深 + setDepth(y) 遮挡)。
 * 按 `(反引号)切换调试模式:显示交互点范围圈与坐标。
 */
export class RoomScene extends Phaser.Scene {
  private hero!: Hero;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private dialog!: Dialog;
  private prompt!: Phaser.GameObjects.Container;
  private promptLabel!: Phaser.GameObjects.Text;
  private interactives: Interactive[] = [];
  private debugLayer: Phaser.GameObjects.Container | null = null;

  constructor() { super('Room'); }

  create(): void {
    this.paintPlaceholder();

    const outfitIdx = (this.registry.get('outfitIndex') as number) || 0;
    this.hero = new Hero(this, u(120), u(470), outfitIdx);
    this.hero.c.setScale(SCALE);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E') as any;
    this.dialog = new Dialog(this);

    this.prompt = this.add.container(0, 0).setDepth(900).setVisible(false);
    this.prompt.add([
      this.add.circle(0, 0, u(14), 0xffffff, 0.95),
      this.add.text(0, 0, 'E', { fontSize: `${15 * SCALE}px`, fontStyle: 'bold', color: '#333' }).setOrigin(0.5),
    ]);
    this.promptLabel = this.add.text(0, 0, '', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${13 * SCALE}px`, color: '#fff', backgroundColor: 'rgba(0,0,0,.55)', padding: { x: 8, y: 3 },
    }).setOrigin(0.5, 0).setDepth(900).setVisible(false);

    const o = OUTFITS[outfitIdx];
    this.interactives = [
      { x: u(180), y: u(420), range: u(100), label: 'Warm up',
        action: () => this.dialog.open('Fireplace', 'Placeholder — design.md table ② I2 content goes here.') },
      { x: u(560), y: u(420), range: u(100), label: 'Browse the shelf',
        action: () => this.dialog.open('Bookshelf · Works', 'Table ② I1: project cards. You are wearing "' + o.name + '" — passed across scenes via registry.') },
      { x: u(820), y: u(500), range: u(110), label: 'The table',
        action: () => this.dialog.open('Table', 'Walk around it to see the setDepth(y) occlusion.') },
    ];

    this.add.text(u(24), u(18), '👗 ' + o.name, {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${16 * SCALE}px`, fontStyle: 'bold', color: '#fff',
    }).setDepth(999);
    this.add.text(W / 2, H - u(16), 'WASD / Arrows to move · Press E to interact · ` for debug', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${13 * SCALE}px`, color: 'rgba(255,255,255,.8)',
    }).setOrigin(0.5, 1).setDepth(999);

    this.input.keyboard!.on('keydown-BACKTICK', () => this.toggleDebug());

    this.cameras.main.fadeIn(900, 255, 224, 176);
  }

  private paintPlaceholder(): void {
    const wall = this.add.graphics();
    wall.fillGradientStyle(0xc8a878, 0xc8a878, 0xa8875c, 0xa8875c, 1);
    wall.fillRect(0, 0, W, u(380));
    const floor = this.add.graphics();
    floor.fillGradientStyle(0x8a6a48, 0x8a6a48, 0x5d4430, 0x5d4430, 1);
    floor.fillRect(0, u(380), W, H - u(380));
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(0, u(415) + i * u(38), W * 2, 2, 0x4a3520, 0.35);
    }
    this.add.rectangle(W / 2, u(24), W, u(48), 0x5d4430);

    this.add.rectangle(u(1060), u(210), u(130), u(160), 0xa8c4e0).setStrokeStyle(6, 0x5a4230);
    this.add.rectangle(u(1060), u(210), u(4), u(160), 0x5a4230);
    this.add.rectangle(u(1060), u(210), u(130), u(4), 0x5a4230);
    this.add.triangle(u(1010), u(460), 0, -u(250), u(130), u(80), -u(80), u(80), 0xfff0d0, 0.12);

    const fp = this.add.container(u(180), u(380)).setDepth(u(380)).setScale(SCALE);
    fp.add([
      this.add.rectangle(0, -110, 130, 220, 0x6a6a72),
      this.add.rectangle(0, -60, 90, 110, 0x1a1a1e),
      this.add.triangle(0, -14, 0, -52, 26, 0, -26, 0, 0xffb347),
    ]);
    const glow = this.add.circle(u(180), u(330), u(100), 0xff9a3c, 0.14).setDepth(u(379));
    this.tweens.add({ targets: glow, alpha: 0.24, duration: 800, yoyo: true, repeat: -1 });

    const shelf = this.add.container(u(560), u(380)).setDepth(u(380)).setScale(SCALE);
    shelf.add([this.add.rectangle(0, -130, 170, 260, 0x4a3423).setStrokeStyle(4, 0x33241a)]);
    const cols = [0x8a4a3a, 0x3a6a5a, 0x9a7a3a, 0x4a5a8a];
    for (let r = 0; r < 3; r++) {
      for (let b = 0; b < 7; b++) {
        shelf.add(this.add.rectangle(-58 + b * 20, -200 + r * 72, 13, 44, cols[(b + r) % 4]));
      }
    }

    const table = this.add.container(u(820), u(480)).setDepth(u(480)).setScale(SCALE);
    table.add([
      this.add.rectangle(-56, -34, 12, 40, 0x5a4230).setOrigin(0.5, 0),
      this.add.rectangle(56, -34, 12, 40, 0x5a4230).setOrigin(0.5, 0),
      this.add.rectangle(0, -40, 160, 16, 0x7a5a3c).setStrokeStyle(3, 0x4a3520),
      this.add.circle(-20, -52, 9, 0xd06a4a),
      this.add.rectangle(28, -54, 26, 14, 0xe8dcc0),
    ]);
  }

  private toggleDebug(): void {
    if (this.debugLayer) {
      this.debugLayer.destroy();
      this.debugLayer = null;
      return;
    }
    const g = this.add.container(0, 0).setDepth(950);
    for (const it of this.interactives) {
      g.add(this.add.circle(it.x, it.y, it.range, 0xd60000, 0.12).setStrokeStyle(2, 0xd60000, 0.8));
      g.add(this.add.text(it.x, it.y, `${it.label}\n(${Math.round(it.x)}, ${Math.round(it.y)})`, {
        fontSize: `${12 * SCALE}px`, color: '#fff', backgroundColor: 'rgba(0,0,0,.6)', padding: { x: 6, y: 3 }, align: 'center',
      }).setOrigin(0.5));
    }
    const b = ROOM_BOUNDS;
    g.add(this.add.rectangle(
      (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2,
      b.maxX - b.minX, b.maxY - b.minY, 0x00ff88, 0.06,
    ).setStrokeStyle(2, 0x00ff88, 0.7));
    g.add(this.add.text(u(24), u(50), 'Debug: click anywhere to log coordinates', {
      fontSize: `${12 * SCALE}px`, color: '#0f8', backgroundColor: 'rgba(0,0,0,.6)', padding: { x: 6, y: 3 },
    }));
    this.input.on('pointerdown', this.logPointer, this);
    this.debugLayer = g;
  }

  private logPointer(p: Phaser.Input.Pointer): void {
    if (this.debugLayer) console.log(`interactive coord: x=${Math.round(p.worldX)}, y=${Math.round(p.worldY)}`);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const k = this.keys;
    const touch = (window as any).__touch || {};

    if (this.dialog.isOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.E) || touch.e) { touch.e = false; this.dialog.close(); }
      this.hero.update(dt, 0, 0, 0);
      return;
    }

    let dx = 0, dy = 0;
    if (k.A.isDown || k.LEFT.isDown || touch.left) dx = -1;
    if (k.D.isDown || k.RIGHT.isDown || touch.right) dx = 1;
    if (k.W.isDown || k.UP.isDown || touch.up) dy = -1;
    if (k.S.isDown || k.DOWN.isDown || touch.down) dy = 1;

    this.hero.update(dt, dx, dy, SPEED, DEPTH_FACTOR);
    this.hero.x = Phaser.Math.Clamp(this.hero.x, ROOM_BOUNDS.minX, ROOM_BOUNDS.maxX);
    this.hero.y = Phaser.Math.Clamp(this.hero.y, ROOM_BOUNDS.minY, ROOM_BOUNDS.maxY);
    this.hero.c.setDepth(this.hero.y);

    let near: Interactive | null = null;
    for (const it of this.interactives) {
      if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, it.x, it.y) < it.range) { near = it; break; }
    }
    if (near) {
      this.prompt.setVisible(true).setPosition(this.hero.c.x, this.hero.c.y - u(150));
      this.promptLabel.setVisible(true).setText(near.label).setPosition(this.hero.c.x, this.hero.c.y - u(128));
      if (Phaser.Input.Keyboard.JustDown(k.E) || touch.e) { touch.e = false; near.action(); }
    } else {
      this.prompt.setVisible(false);
      this.promptLabel.setVisible(false);
    }
  }
}