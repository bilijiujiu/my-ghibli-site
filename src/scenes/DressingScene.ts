import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Hero } from '../entities/Hero';

/**
 * 第二幕:门廊近景过场(porch.webp)。
 * 主角剪影从左走入 → 停在门前 → 欢迎语淡入 → 点击走进门 → 第三幕。
 */

/* ===== 位置参数(按 porch.webp 构图调) ===== */
const HERO_START_X = 100;   // 主角入场起点(画面左侧)
const HERO_STOP_X = 700;    // 主角停下的位置(门廊前地面)
const HERO_Y = 640;         // 主角脚的 y
const HERO_SCALE = 1.6;     // 主角相对 SCALE 的放大倍数
const DOOR_X = 1180;        // 门的大致 x
const DOOR_Y = 430;         // 门中心 y
const TEXT_X = 260;         // 欢迎语位置(左上天空区)
const TEXT_Y = 240;

export class DressingScene extends Phaser.Scene {
  private hero!: Hero;
  private welcome!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  private doorGlow?: Phaser.GameObjects.Rectangle;
  private arrived = false;
  private entering = false;

  constructor() { super('Dressing'); }

  preload(): void {
    this.load.image('porch', '/porch.webp');
  }

  create(): void {
    this.arrived = false;
    this.entering = false;

    this.paintScene();
    this.buildWelcome();

    /* 主角剪影,从左侧走入 */
    this.hero = new Hero(this, u(HERO_START_X), u(HERO_Y), 0);
    this.hero.c.setScale(SCALE * HERO_SCALE).setDepth(10);
    this.silhouette(this.hero);

    const cam = this.cameras.main;
    cam.fadeIn(700, 250, 246, 238);
    cam.setZoom(1.06);
    cam.zoomTo(1, 900, 'Sine.easeOut');

    /* 走入 → 停在门前 → 欢迎语淡入 */
    this.walkTo(u(HERO_STOP_X), 1800, () => {
      this.arrived = true;
      this.tweens.add({ targets: this.welcome, alpha: 1, duration: 800 });
      this.tweens.add({ targets: this.hint, alpha: 0.85, duration: 800, delay: 400 });
    });

    this.input.on('pointerdown', () => { if (this.arrived) this.enter(); });
    this.input.keyboard!.on('keydown-ENTER', () => { if (this.arrived) this.enter(); });
  }

  /** 把角色所有部件染成深色剪影(黄昏逆光下的自然效果) */
  private silhouette(hero: Hero): void {
    (hero.c.list as any[]).forEach(obj => {
      if (obj.setFillStyle) obj.setFillStyle(0x2a2438);
      if (obj.setStrokeStyle) obj.setStrokeStyle(0);
    });
    hero.c.setAlpha(0.92);
  }

  private paintScene(): void {
    const src = this.textures.get('porch').getSourceImage() as HTMLImageElement;
    const scale = Math.max(W / src.width, H / src.height);
    this.add.image(W / 2, H / 2, 'porch').setScale(scale).setDepth(0);

    this.doorGlow = this.add.rectangle(u(DOOR_X), u(DOOR_Y), u(90), u(180), 0xffcf88, 0.0)
      .setDepth(1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: this.doorGlow, alpha: 0.28, duration: 1600, yoyo: true, repeat: -1 });
  }

  private buildWelcome(): void {
    /* 欢迎语(初始透明,到达后淡入),放左上天空区 */
    this.welcome = this.add.container(u(TEXT_X), u(TEXT_Y)).setDepth(20).setAlpha(0);
    const l1 = this.add.text(0, 0, "The light's on. You're just in time.", {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${32 * SCALE}px`, color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.6)', blur: 10 * SCALE, fill: true },
    }).setOrigin(0.5);
    const l2 = this.add.text(0, u(46), 'Come inside.', {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${32 * SCALE}px`, fontStyle: 'italic', color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.6)', blur: 10 * SCALE, fill: true },
    }).setOrigin(0.5);
    this.welcome.add([l1, l2]);

    /* 底部进入提示 */
    this.hint = this.add.text(W / 2, H - u(60), '— Click to step inside —', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${18 * SCALE}px`, color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.5)', blur: 8 * SCALE, fill: true },
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
    this.tweens.add({
      targets: this.hint, alpha: { from: 0.85, to: 0.35 },
      duration: 1100, yoyo: true, repeat: -1, delay: 1500,
    });
  }

  /** 让主角走到目标 x,播放走路动画 */
  private walkTo(targetX: number, duration: number, onDone: () => void): void {
    this.tweens.add({
      targets: this.hero, x: targetX, duration, ease: 'Linear',
      onUpdate: () => this.hero.update(0.016, 1, 0, 0),
      onComplete: () => { this.hero.update(0.016, 0, 0, 0); onDone(); },
    });
  }

private enter(): void {
  if (this.entering) return;
  this.entering = true;

  /* 文字先淡出 */
  this.tweens.add({ targets: [this.welcome, this.hint], alpha: 0, duration: 300 });

  /* 主角走到门前 */
  this.walkTo(u(DOOR_X - 90), 1400, () => {
    /* 1. 主角走进门:缩小 + 淡出(模拟走入门内的透视) */
    this.tweens.add({
      targets: this.hero.c,
      scaleX: SCALE * HERO_SCALE * 0.7,
      scaleY: SCALE * HERO_SCALE * 0.7,
      x: u(DOOR_X),
      y: u(HERO_Y - 30),
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeIn',
    });

    /* 2. 相机推向门 */
    const cam = this.cameras.main;
    cam.pan(u(DOOR_X), u(DOOR_Y), 1600, 'Sine.easeInOut');
    cam.zoomTo(2.6, 1600, 'Sine.easeInOut');

    /* 3. 门内暖光渐渐充满画面 */
    if (this.doorGlow) {
      this.tweens.add({ targets: this.doorGlow, alpha: 0.9, duration: 900, delay: 300 });
    }
    const flood = this.add.rectangle(u(DOOR_X), u(DOOR_Y), W * 2, H * 2, 0xffe0b0, 0)
      .setDepth(90).setScrollFactor(1);
    this.tweens.add({
      targets: flood, alpha: 1, duration: 900, delay: 800, ease: 'Quad.easeIn',
      onComplete: () => {
        /* 4. 过曝顶点切场景 */
        this.scene.start('Room');
      },
    });
  });
}
  update(): void {
    /* 走路动画由 walkTo 的 onUpdate 驱动 */
  }
}