import Phaser from 'phaser';
import { W, H } from '../config/constants';
import { OUTFITS } from '../config/outfits';
import { Hero } from '../entities/Hero';

/**
 * 第二幕:近景 + 主角倚车 + 换装。
 * 穿搭选择通过 registry('outfitIndex') 带入第三幕。
 */
export class DressingScene extends Phaser.Scene {
  private hero!: Hero;
  private door!: Phaser.GameObjects.Rectangle;
  private ui!: Phaser.GameObjects.Container;
  private outfitName!: Phaser.GameObjects.Text;
  private outfitIdx = 0;
  private departing = false;
  private walkTween: Phaser.Tweens.Tween | null = null;
  private readonly doorX = 1030;

  constructor() { super('Dressing'); }

  create(): void {
    this.departing = false;
    this.walkTween = null;

    this.paintPlaceholder();

    this.outfitIdx = (this.registry.get('outfitIndex') as number) || 0;
    this.hero = new Hero(this, 640, 560, this.outfitIdx);
    this.hero.lean();
    this.hero.c.setDepth(10);

    this.buildUI();

    /* 与第一幕 zoom 的衔接:暖白淡入 + 轻微回缩 */
    const cam = this.cameras.main;
    cam.fadeIn(700, 250, 246, 238);
    cam.setZoom(1.12);
    cam.zoomTo(1, 900, 'Sine.easeOut');
  }

  private paintPlaceholder(): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x7a8ab8, 0x7a8ab8, 0xf0c898, 0xf0d8a8, 1);
    sky.fillRect(0, 0, W, 470);
    const grass = this.add.graphics();
    grass.fillGradientStyle(0x7a9a5c, 0x7a9a5c, 0x4a6a38, 0x4a6a38, 1);
    grass.fillRect(0, 470, W, H - 470);
    for (let i = 0; i < 26; i++) {
      this.add.triangle(
        Phaser.Math.Between(20, W - 20), Phaser.Math.Between(490, 600),
        0, 0, 6, -16, 12, 0, 0x5a8a44,
      ).setAlpha(0.8);
    }

    /* 小屋近景 */
    const house = this.add.container(880, 545);
    house.add([
      this.add.rectangle(-30, -60, 12, 120, 0x4a3a2c),
      this.add.rectangle(230, -60, 12, 120, 0x4a3a2c),
      this.add.rectangle(100, -260, 460, 290, 0x8a6a4a).setStrokeStyle(5, 0x5a4230).setOrigin(0.5, 0),
      this.add.triangle(100, -268, 0, 0, 280, 120, -280, 120, 0x6a4a3a).setOrigin(0.5, 1),
      this.add.rectangle(-40, -170, 90, 90, 0xffd88a).setStrokeStyle(5, 0x5a4230),
      this.add.circle(268, -30, 46, 0x6a5a4a).setStrokeStyle(6, 0x4a3a2c),
      this.add.circle(268, -30, 10, 0x4a3a2c),
    ]);

    /* 门:origin 在左缘,scaleX 缩小 = 向内开 */
    this.door = this.add.rectangle(1010, 455, 74, 150, 0x4a3628)
      .setStrokeStyle(4, 0x33251a).setOrigin(0, 1);
    this.add.circle(1070, 390, 5, 0xc9a86a).setDepth(5);
  }

  private buildUI(): void {
    const cx = 300, cy = 250;
    this.ui = this.add.container(0, 0).setDepth(50);

    const panel = this.add.rectangle(cx, cy, 380, 210, 0xf7efdc, 0.94).setStrokeStyle(3, 0x8a6b4a);
    const title = this.add.text(cx, cy - 76, '今天穿什么?', {
      fontSize: '22px', fontStyle: 'bold', color: '#4a3826',
    }).setOrigin(0.5);
    this.outfitName = this.add.text(cx, cy - 18, OUTFITS[this.outfitIdx].name, {
      fontSize: '28px', fontStyle: 'bold', color: '#7a5a36',
    }).setOrigin(0.5);

    const mkArrow = (x: number, dir: number) => {
      const a = this.add.text(x, cy - 18, dir < 0 ? '◀' : '▶', {
        fontSize: '30px', color: '#8a6b4a',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      a.on('pointerover', () => a.setColor('#d60000'));
      a.on('pointerout', () => a.setColor('#8a6b4a'));
      a.on('pointerdown', () => this.switchOutfit(dir));
      return a;
    };
    const left = mkArrow(cx - 140, -1);
    const right = mkArrow(cx + 140, 1);

    const go = this.add.text(cx, cy + 58, '出 发 进 屋 →', {
      fontSize: '18px', fontStyle: 'bold', color: '#fff',
      backgroundColor: '#b0483a', padding: { x: 22, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    go.on('pointerover', () => go.setBackgroundColor('#d60000'));
    go.on('pointerout', () => go.setBackgroundColor('#b0483a'));
    go.on('pointerdown', () => this.depart());

    const hint = this.add.text(cx, cy + 128, '←→ 方向键也可以切换 · Enter 出发', {
      fontSize: '12px', color: 'rgba(74,56,38,.65)',
    }).setOrigin(0.5);

    this.ui.add([panel, title, this.outfitName, left, right, go, hint]);

    this.input.keyboard!.on('keydown-LEFT', () => this.switchOutfit(-1));
    this.input.keyboard!.on('keydown-RIGHT', () => this.switchOutfit(1));
    this.input.keyboard!.on('keydown-ENTER', () => this.depart());
  }

  private switchOutfit(dir: number): void {
    if (this.departing) return;
    this.outfitIdx = (this.outfitIdx + dir + OUTFITS.length) % OUTFITS.length;
    this.hero.setOutfit(this.outfitIdx);
    this.outfitName.setText(OUTFITS[this.outfitIdx].name);
    this.tweens.add({ targets: this.hero.c, scaleY: 0.93, duration: 90, yoyo: true });
  }

  private depart(): void {
    if (this.departing) return;
    this.departing = true;
    this.registry.set('outfitIndex', this.outfitIdx);

    this.tweens.add({ targets: this.ui, alpha: 0, duration: 350 });
    this.hero.stand();

    this.walkTween = this.tweens.add({
      targets: this.hero, x: this.doorX, duration: 1400, ease: 'Linear',
      onComplete: () => {
        this.tweens.add({ targets: this.door, scaleX: 0.18, duration: 420, ease: 'Sine.easeIn' });
        this.time.delayedCall(430, () => {
          this.cameras.main.fadeOut(550, 10, 8, 6);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Room'));
        });
      },
    });
  }

  update(_time: number, delta: number): void {
    if (this.departing && this.walkTween && this.walkTween.isPlaying()) {
      /* 位移交给 tween,这里只驱动走路动画 */
      this.hero.update(delta / 1000, 1, 0, 0);
    }
  }
}
