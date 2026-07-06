import Phaser from 'phaser';
import { W, H, SPEED, DEPTH_FACTOR, ROOM_BOUNDS } from '../config/constants';
import { OUTFITS } from '../config/outfits';
import { Hero } from '../entities/Hero';
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
 * 第三幕:室内 WASD 自由移动(2.5D 纵深 + setDepth(y) 遮挡)。
 * 按 ~(反引号)切换调试模式:显示所有交互点范围圈与坐标 —— 标定表②坐标时用。
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
    this.hero = new Hero(this, 120, 470, outfitIdx);

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,E') as any;
    this.dialog = new Dialog(this);

    /* E 提示气泡 */
    this.prompt = this.add.container(0, 0).setDepth(900).setVisible(false);
    this.prompt.add([
      this.add.circle(0, 0, 14, 0xffffff, 0.95),
      this.add.text(0, 0, 'E', { fontSize: '15px', fontStyle: 'bold', color: '#333' }).setOrigin(0.5),
    ]);
    this.promptLabel = this.add.text(0, 0, '', {
      fontSize: '13px', color: '#fff', backgroundColor: 'rgba(0,0,0,.55)', padding: { x: 8, y: 3 },
    }).setOrigin(0.5, 0).setDepth(900).setVisible(false);

    /* ---- 交互点(对应 design.md 表②,坐标用调试模式标定) ---- */
    const o = OUTFITS[outfitIdx];
    this.interactives = [
      { x: 180, y: 420, range: 100, label: '烤火',
        action: () => this.dialog.open('壁炉', '这里接 design.md 表② I2 的内容。') },
      { x: 560, y: 420, range: 100, label: '看看书架',
        action: () => this.dialog.open('书架 · Works', '表② I1:作品卡片。你现在穿的是「' + o.name + '」——registry 跨场景带过来的。') },
      { x: 820, y: 500, range: 110, label: '桌子',
        action: () => this.dialog.open('桌子', '绕桌子走一圈,看 setDepth(y) 的前后遮挡。') },
    ];

    /* HUD */
    this.add.text(24, 18, '👗 ' + o.name, { fontSize: '16px', fontStyle: 'bold', color: '#fff' }).setDepth(999);
    this.add.text(W / 2, H - 16, 'WASD / 方向键 移动 · 靠近物品按 E · 按 ` 开调试', {
      fontSize: '13px', color: 'rgba(255,255,255,.8)',
    }).setOrigin(0.5, 1).setDepth(999);

    /* 调试模式开关(标定交互点坐标用) */
    this.input.keyboard!.on('keydown-BACKTICK', () => this.toggleDebug());

    this.cameras.main.fadeIn(650, 10, 8, 6);
  }

  private paintPlaceholder(): void {
    const wall = this.add.graphics();
    wall.fillGradientStyle(0xc8a878, 0xc8a878, 0xa8875c, 0xa8875c, 1);
    wall.fillRect(0, 0, W, 380);
    const floor = this.add.graphics();
    floor.fillGradientStyle(0x8a6a48, 0x8a6a48, 0x5d4430, 0x5d4430, 1);
    floor.fillRect(0, 380, W, H - 380);
    for (let i = 0; i < 6; i++) {
      this.add.rectangle(0, 415 + i * 38, W * 2, 2, 0x4a3520, 0.35);
    }
    this.add.rectangle(W / 2, 24, W, 48, 0x5d4430);

    /* 窗 + 光柱 */
    this.add.rectangle(1060, 210, 130, 160, 0xa8c4e0).setStrokeStyle(6, 0x5a4230);
    this.add.rectangle(1060, 210, 4, 160, 0x5a4230);
    this.add.rectangle(1060, 210, 130, 4, 0x5a4230);
    this.add.triangle(1010, 460, 0, -250, 130, 80, -80, 80, 0xfff0d0, 0.12);

    /* 壁炉(靠墙 → depth 380) */
    const fp = this.add.container(180, 380).setDepth(380);
    fp.add([
      this.add.rectangle(0, -110, 130, 220, 0x6a6a72),
      this.add.rectangle(0, -60, 90, 110, 0x1a1a1e),
      this.add.triangle(0, -14, 0, -52, 26, 0, -26, 0, 0xffb347),
    ]);
    const glow = this.add.circle(180, 330, 100, 0xff9a3c, 0.14).setDepth(379);
    this.tweens.add({ targets: glow, alpha: 0.24, duration: 800, yoyo: true, repeat: -1 });

    /* 书架 */
    const shelf = this.add.container(560, 380).setDepth(380);
    shelf.add([this.add.rectangle(0, -130, 170, 260, 0x4a3423).setStrokeStyle(4, 0x33241a)]);
    const cols = [0x8a4a3a, 0x3a6a5a, 0x9a7a3a, 0x4a5a8a];
    for (let r = 0; r < 3; r++) {
      for (let b = 0; b < 7; b++) {
        shelf.add(this.add.rectangle(-58 + b * 20, -200 + r * 72, 13, 44, cols[(b + r) % 4]));
      }
    }

    /* 中央木桌(遮挡展示品 → depth = baseline 480) */
    const table = this.add.container(820, 480).setDepth(480);
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
      g.add(this.add.text(it.x, it.y, `${it.label}\n(${it.x}, ${it.y}) r=${it.range}`, {
        fontSize: '12px', color: '#fff', backgroundColor: 'rgba(0,0,0,.6)', padding: { x: 6, y: 3 }, align: 'center',
      }).setOrigin(0.5));
    }
    /* 可行走范围框 */
    const b = ROOM_BOUNDS;
    g.add(this.add.rectangle(
      (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2,
      b.maxX - b.minX, b.maxY - b.minY, 0x00ff88, 0.06,
    ).setStrokeStyle(2, 0x00ff88, 0.7));
    /* 鼠标坐标读数:点哪里打印哪里,标定新交互点用 */
    g.add(this.add.text(24, 50, '调试模式:点击任意位置在控制台打印坐标', {
      fontSize: '12px', color: '#0f8', backgroundColor: 'rgba(0,0,0,.6)', padding: { x: 6, y: 3 },
    }));
    this.input.on('pointerdown', this.logPointer, this);
    this.debugLayer = g;
  }

  private logPointer(p: Phaser.Input.Pointer): void {
    if (this.debugLayer) console.log(`交互点坐标候选: x=${Math.round(p.worldX)}, y=${Math.round(p.worldY)}`);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const k = this.keys;
    /* 触屏状态从 input/touch 模块读 */
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
    /* 2.5D 遮挡的全部秘密 */
    this.hero.c.setDepth(this.hero.y);

    /* 交互检测 */
    let near: Interactive | null = null;
    for (const it of this.interactives) {
      if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, it.x, it.y) < it.range) { near = it; break; }
    }
    if (near) {
      this.prompt.setVisible(true).setPosition(this.hero.c.x, this.hero.c.y - 150);
      this.promptLabel.setVisible(true).setText(near.label).setPosition(this.hero.c.x, this.hero.c.y - 128);
      if (Phaser.Input.Keyboard.JustDown(k.E) || touch.e) { touch.e = false; near.action(); }
    } else {
      this.prompt.setVisible(false);
      this.promptLabel.setVisible(false);
    }
  }
}
