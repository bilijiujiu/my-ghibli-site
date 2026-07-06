import Phaser from 'phaser';
import { W, H } from '../config/constants';

/**
 * 第一幕:远景标题 + 会走的蒸汽小屋。
 * 换真实美术:paintPlaceholder() 整体替换为三张切层图(天空/远山/草地)+ 小屋精灵,
 * 踱步与推镜逻辑保持不变。镜头参数见 design.md 表④。
 */
export class TitleScene extends Phaser.Scene {
  private clouds: Array<Phaser.GameObjects.Container & { speed?: number }> = [];
  private castle!: Phaser.GameObjects.Container;
  private castleBody!: Phaser.GameObjects.Container;
  private legs: Array<Phaser.GameObjects.Rectangle & { phase?: number }> = [];
  private castleDir = 1;
  private entering = false;

  constructor() { super('Title'); }

  create(): void {
    this.entering = false;
    this.castleDir = 1;
    this.clouds = [];
    this.legs = [];

    this.paintPlaceholder();
    this.buildCastle();
    this.buildTitleUI();

    this.cameras.main.fadeIn(600, 30, 30, 34);

    /* 点击 → 推镜转场(参数与 design.md 表④对应) */
    this.input.once('pointerdown', () => {
      this.entering = true;
      const cam = this.cameras.main;
      cam.pan(this.castle.x, this.castle.y - 80, 1200, 'Sine.easeIn');
      cam.zoomTo(3.2, 1200, 'Sine.easeIn');
      cam.fadeOut(1150, 250, 246, 238);
      cam.once('camerafadeoutcomplete', () => this.scene.start('Dressing'));
    });
  }

  private paintPlaceholder(): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x6a7ab0, 0x6a7ab0, 0xe8b88a, 0xf0d0a0, 1);
    sky.fillRect(0, 0, W, 430);

    for (let i = 0; i < 5; i++) {
      const cl = this.add.container(Phaser.Math.Between(0, W), 60 + i * 55) as any;
      cl.add([
        this.add.ellipse(0, 0, 150, 40, 0xffffff, 0.75),
        this.add.ellipse(50, 8, 100, 30, 0xffffff, 0.6),
        this.add.ellipse(-55, 10, 90, 26, 0xffffff, 0.6),
      ]);
      cl.speed = 6 + i * 3;
      this.clouds.push(cl);
    }

    this.add.triangle(260, 430, 0, 0, 340, -230, 680, 0, 0x7a86a8).setOrigin(0.5, 1).setAlpha(0.8);
    this.add.triangle(760, 430, 0, 0, 420, -290, 840, 0, 0x6a7698).setOrigin(0.5, 1).setAlpha(0.85);
    this.add.triangle(1150, 430, 0, 0, 300, -190, 600, 0, 0x8a94b0).setOrigin(0.5, 1).setAlpha(0.75);

    const hills = this.add.graphics();
    hills.fillStyle(0x8aa86a, 1); hills.fillEllipse(300, 470, 900, 180);
    hills.fillStyle(0x7a9a5c, 1); hills.fillEllipse(1000, 480, 1000, 200);
    const grass = this.add.graphics();
    grass.fillGradientStyle(0x6a8a4c, 0x6a8a4c, 0x4a6a38, 0x4a6a38, 1);
    grass.fillRect(0, 430, W, H - 430);
  }

  private buildCastle(): void {
    const castle = this.add.container(420, 430);
    this.castle = castle;

    for (let i = 0; i < 4; i++) {
      const leg = this.add.rectangle(-42 + i * 28, -18, 10, 46, 0x4a3a2c).setOrigin(0.5, 0) as any;
      leg.phase = (i % 2) * Math.PI;
      this.legs.push(leg);
      castle.add(leg);
    }

    const body = this.add.container(0, -20);
    body.add([
      this.add.rectangle(0, -60, 130, 96, 0x8a6a4a).setStrokeStyle(3, 0x5a4230),
      this.add.triangle(0, -108, 0, 0, 84, 46, -84, 46, 0x6a4a3a).setOrigin(0.5, 1),
      this.add.rectangle(34, -134, 18, 34, 0x5a4a42),
      this.add.rectangle(-24, -58, 30, 30, 0xffd88a).setStrokeStyle(3, 0x5a4230),
      this.add.rectangle(26, -40, 26, 56, 0x4a3628).setStrokeStyle(2, 0x33251a),
      this.add.circle(60, -30, 16, 0x6a5a4a).setStrokeStyle(3, 0x4a3a2c),
    ]);
    this.castleBody = body;
    castle.add(body);

    /* 烟囱冒烟 */
    this.time.addEvent({
      delay: 420, loop: true, callback: () => {
        const puff = this.add.circle(this.castle.x + 34 * this.castleDir, this.castle.y - 172, 7, 0xf0f0ea, 0.7);
        this.tweens.add({
          targets: puff, y: puff.y - 70, x: puff.x + Phaser.Math.Between(-16, 16),
          scale: 2.1, alpha: 0, duration: 2100, onComplete: () => puff.destroy(),
        });
      },
    });
  }

  private buildTitleUI(): void {
    this.add.text(W / 2, 158, '風 の 小 屋', {
      fontSize: '68px', fontStyle: 'bold', color: '#fffaf0',
      stroke: '#5a5a7a', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(20);
    this.add.text(W / 2, 218, 'A  W A L K A B L E   P O R T F O L I O', {
      fontSize: '15px', color: 'rgba(255,250,240,.85)',
    }).setOrigin(0.5).setDepth(20);
    const enter = this.add.text(W / 2, 520, '— 点 击 进 入 —', {
      fontSize: '20px', color: '#fffaf0',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: enter, alpha: 0.25, duration: 900, yoyo: true, repeat: -1 });
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    for (const cl of this.clouds) {
      cl.x += (cl.speed || 6) * dt;
      if (cl.x > W + 120) cl.x = -120;
    }
    const t = time / 1000;
    for (const leg of this.legs) leg.rotation = Math.sin(t * 5 + (leg.phase || 0)) * 0.4;
    this.castleBody.y = -20 + Math.sin(t * 5) * 3;
    if (!this.entering) {
      this.castle.x += 14 * this.castleDir * dt;
      if (this.castle.x > 860) this.castleDir = -1;
      if (this.castle.x < 320) this.castleDir = 1;
      this.castle.scaleX = this.castleDir;
    }
  }
}
