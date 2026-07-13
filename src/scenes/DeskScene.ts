import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { PhoneOverlay } from '../systems/PhoneOverlay';
import { RecordPlayerOverlay } from '../systems/RecordPlayerOverlay';

/**
 * 桌子近景 · 独立一幕。俯视桌面,四样物件各是一个入口。
 * 从 RoomScene 按 E 进入(scene.start('Desk'))。
 *
 * 吉他→音乐合集 / 相册→生活照 / 手机→social / 咖啡→彩蛋话。
 * 本版:转场 + 背景 + DEBUG 坐标工具。
 * 物件热区(HOTSPOTS)等你用 DEBUG 量出四样物件坐标后再填。
 *
 * 需要 public/desk_bg.png(2048宽左右,别超4096)。
 */

/* DEBUG=true 时点画面显示坐标,用来量物件位置。量完改回 false。 */
const DEBUG = false;

/* ===== 物件热区(逻辑坐标,等 DEBUG 量出后填) =====
   x/y 是物件中心,r 是可点半径。先留空占位。 */
interface Hotspot {
  key: string;
  x: number;
  y: number;
  r: number;
  label: string;
}

const HOTSPOTS: Hotspot[] = [
  { key: 'guitar', x: 667, y: 305, r: 180, label: '音乐' },
  { key: 'album',  x: 281, y: 291, r: 150, label: '照片' },
  { key: 'phone',  x: 1108, y: 427, r: 90,  label: 'Social' },
  { key: 'coffee', x: 892, y: 181, r: 90,  label: '闲话' },
];

export class DeskScene extends Phaser.Scene {
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private leaving = false;
  private coordText?: Phaser.GameObjects.Text;
  private phone!: PhoneOverlay;
  private player!: RecordPlayerOverlay;

  constructor() { super('Desk'); }

  preload(): void {
    this.load.image('desk_bg', '/desk_bg.png');
    this.load.image('icon_instagram', '/icon_instagram.png');
    this.load.image('icon_gmail', '/icon_gmail.png');
    this.load.image('icon_github', '/icon_github.png');
    this.load.image('icon_handshake', '/icon_handshake.png');
  }

  create(): void {
    this.leaving = false;

    /* 暗场底 */
    this.add.rectangle(W / 2, H / 2, W, H, 0x140d06).setDepth(-1);

    /* 背景:16:9 宽图。BG_ZOOM 控制大小,1=填满,小于1=缩小露出更多 */
    const BG_ZOOM = 0.9;
    const src = this.textures.get('desk_bg').getSourceImage() as HTMLImageElement;
    const scale = Math.max(W / src.width, H / src.height) * BG_ZOOM;
    this.add.image(W / 2, H / 2, 'desk_bg').setScale(scale).setDepth(0);

    /* 轻压角,聚焦桌面 */
    const vig = this.add.graphics().setDepth(1);
    vig.fillStyle(0x0a0604, 0.25);
    vig.fillRect(0, 0, W, H);

    this.buildHotspots();
    this.buildHUD();

    this.phone = new PhoneOverlay(this);
    this.player = new RecordPlayerOverlay(this);

    this.keys = this.input.keyboard!.addKeys('ESC') as any;

    if (DEBUG) this.buildDebug();

    this.cameras.main.fadeIn(500, 20, 12, 8);
  }

  /* ---------- 物件热区 ---------- */
  private buildHotspots(): void {
    for (const h of HOTSPOTS) {
      const zone = this.add.circle(u(h.x), u(h.y), u(h.r), 0xffffff, 0.001)
        .setDepth(10).setInteractive({ useHandCursor: true });

      /* 悬停:淡淡高亮圈 */
      const ring = this.add.circle(u(h.x), u(h.y), u(h.r), 0xffe0a0, 0)
        .setStrokeStyle(u(3), 0xffe0a0, 0).setDepth(9);

      zone.on('pointerover', () => {
        this.tweens.add({ targets: ring, alpha: 1, duration: 200 });
        ring.setStrokeStyle(u(3), 0xffe0a0, 0.8);
      });
      zone.on('pointerout', () => {
        this.tweens.add({ targets: ring, alpha: 0, duration: 200 });
      });
      zone.on('pointerdown', () => this.openItem(h.key));
    }
  }

  /** 点击物件:手机→social,吉他→唱片机,其余先占位 */
  private openItem(key: string): void {
    if (key === 'phone') { this.phone.open(); return; }
    if (key === 'guitar') { this.player.open(); return; }
    console.log('点击物件:', key);
    // TODO: album/coffee 各自的面板
  }

  private buildHUD(): void {
    this.add.text(W / 2, H - u(50), 'Esc 离开', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${16 * SCALE}px`, color: 'rgba(255,240,220,.85)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.7)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(20);
  }

  /* ---------- DEBUG:点画面显示坐标 ---------- */
  private buildDebug(): void {
    this.coordText = this.add.text(u(20), u(20), 'DEBUG: 点物件获取坐标', {
      fontFamily: 'monospace',
      fontSize: `${16 * SCALE}px`, color: '#0f8',
      backgroundColor: 'rgba(0,0,0,.85)', padding: { x: 12, y: 8 },
    }).setDepth(999);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const x = Math.round(p.worldX / SCALE);
      const y = Math.round(p.worldY / SCALE);
      this.coordText?.setText(`x=${x}, y=${y}`);
      console.log(`x=${x}, y=${y}`);
    });
  }

  update(_t: number, delta: number): void {
    this.player.update(delta / 1000);

    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      if (this.phone.isOpen) { this.phone.close(); }
      else if (this.player.isOpen) { this.player.close(); }
      else { this.leave(); }
    }
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(500, 20, 12, 8);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Room');
    });
  }
}