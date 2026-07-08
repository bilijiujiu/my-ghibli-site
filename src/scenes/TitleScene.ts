import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 第一幕:远景标题 + 会走的蒸汽小屋(真图)。
 * 背景 = hero.webp 叠层:base 底图 / grass 草地(风效)/ front 前景高草。
 * 云:cloud1.png 单张云带缓慢横移。
 * 小屋:house.png 真图,暖橘染色融合黄昏 + 轻微柔化,整体颠簸+摇摆+烟囱冒烟。
 */

/* ===== 想调效果,改这里 ===== */
const MARGIN = 44 * SCALE;
const GRASS_CROP = 0.53;      // 草地 = 画面 53% 以下
const FRONT_CROP = 0.90;      // 前景高草 = 最底部 10%
const GRASS_WIND = 0.011;
const PARALLAX = { base: 5 * SCALE, grass: 15 * SCALE, front: 22 * SCALE };
const CASTLE_Y = 470;         // 小屋脚的 y:调这个让脚踩进草
const CASTLE_H_RATIO = 0.42;  // 小屋高度占画面比例
const CASTLE_TINT = 0xffd9b0; // 暖橘染色(模拟夕阳);往 0xffffff 调则更亮

export class TitleScene extends Phaser.Scene {
  private castle!: Phaser.GameObjects.Container;
  private castleShadow!: Phaser.GameObjects.Ellipse;
  private castleDir = 1;
  private entering = false;

  private layers: Partial<Record<'base' | 'grass' | 'front', Phaser.GameObjects.Image>> = {};
  private clouds: Array<{ img: Phaser.GameObjects.Image; speed: number; baseY: number }> = [];
  private grassFX?: Phaser.FX.Displacement;
  private frontFX?: Phaser.FX.Displacement;
  private lookX = 0;
  private lookY = 0;

  constructor() { super('Title'); }

  preload(): void {
    this.load.image('s1', '/hero.webp');
    this.load.image('cloud1', '/cloud1.png');
    this.load.image('cottage', '/house.png');
  }

  create(): void {
    this.entering = false;
    this.castleDir = 1;
    this.clouds = [];

    this.makeNoiseTexture();
    this.paintScene();
    this.buildCastle();
    this.buildTitleUI();

    this.cameras.main.fadeIn(600, 30, 30, 34);

    this.input.once('pointerdown', () => {
      this.entering = true;
      const cam = this.cameras.main;
      cam.pan(this.castle.x, this.castle.y - u(80), 1200, 'Sine.easeIn');
      cam.zoomTo(2.8, 1200, 'Sine.easeIn');
      cam.fadeOut(1150, 250, 246, 238);
      cam.once('camerafadeoutcomplete', () => this.scene.start('Dressing'));
    });
  }

  /** 运行时生成平滑噪声图,给位移特效当"风场" */
  private makeNoiseTexture(): void {
    if (this.textures.exists('windNoise')) return;
    const size = 128, cell = 16;
    const small = document.createElement('canvas');
    small.width = small.height = cell;
    const sctx = small.getContext('2d')!;
    const data = sctx.createImageData(cell, cell);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i]     = 80 + Math.floor(Math.random() * 120);
      data.data[i + 1] = 80 + Math.floor(Math.random() * 120);
      data.data[i + 2] = 128;
      data.data[i + 3] = 255;
    }
    sctx.putImageData(data, 0, 0);

    const ct = this.textures.createCanvas('windNoise', size, size)!;
    const ctx = ct.getContext();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(small, 0, 0, size, size);
    ct.refresh();
  }

  private paintScene(): void {
    const src = this.textures.get('s1').getSourceImage() as HTMLImageElement;
    const texW = src.width, texH = src.height;
    const scale = Math.max((W + MARGIN * 2) / texW, (H + MARGIN * 2) / texH);

    const makeLayer = (depth: number): Phaser.GameObjects.Image =>
      this.add.image(W / 2, H / 2, 's1').setScale(scale).setDepth(depth);

    this.layers.base = makeLayer(0);

    this.layers.grass = makeLayer(2);
    this.layers.grass.setCrop(0, texH * GRASS_CROP, texW, texH * (1 - GRASS_CROP));
    this.grassFX = this.layers.grass.preFX?.addDisplacement('windNoise', 0, 0) ?? undefined;

    this.layers.front = makeLayer(4);
    this.layers.front.setCrop(0, texH * FRONT_CROP, texW, texH * (1 - FRONT_CROP));
    this.frontFX = this.layers.front.preFX?.addDisplacement('windNoise', 0, 0) ?? undefined;

    /* 云:单张云带缓慢横移,出界回卷 */
    const cloudDefs = [
      { key: 'cloud1', x: 0.5, y: 0.22, speed: 6 },
    ];
    this.clouds = cloudDefs.map(d => ({
      img: this.add.image(W * d.x, H * d.y, d.key).setScale(scale).setDepth(1),
      speed: d.speed * SCALE,
      baseY: H * d.y,
    }));
  }

  private buildCastle(): void {
    const castle = this.add.container(u(420), u(CASTLE_Y)).setDepth(3);
    this.castle = castle;

    /* 落地阴影:独立对象,depth 2.5,在草地之上、小屋之下 */
    this.castleShadow = this.add.ellipse(u(420), u(CASTLE_Y), u(120), u(24), 0x000000, 0.30)
      .setDepth(2.5);

    /* 小屋图片:origin 底部中心,y 即"脚"的位置 */
    const img = this.add.image(0, 0, 'cottage').setOrigin(0.5, 1);
    const targetH = H * CASTLE_H_RATIO;
    img.setScale(targetH / img.height);
    img.setTint(CASTLE_TINT).setAlpha(0.96);   // 暖橘染色:融进夕阳
    img.preFX?.addBlur(0, 1, 1, 0.8);          // 极轻微柔化:远景不那么锐利
    castle.add(img);

    /* 烟囱冒烟(烟囱在小屋左上,位置可调) */
    this.time.addEvent({
      delay: 520, loop: true, callback: () => {
        const puff = this.add.circle(
          this.castle.x - u(60) * this.castleDir,
          this.castle.y - u(210),
          u(6), 0xf0f0ea, 0.5,
        ).setDepth(3);
        this.tweens.add({
          targets: puff, y: puff.y - u(80), x: puff.x + Phaser.Math.Between(-u(14), u(14)),
          scale: 2.4, alpha: 0, duration: 2400, onComplete: () => puff.destroy(),
        });
      },
    });
  }

  private buildTitleUI(): void {
    this.add.text(W / 2, u(158), 'The Wandering Cottage', {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${58 * SCALE}px`, fontStyle: 'bold', color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 3 * SCALE, color: 'rgba(40,40,70,0.45)', blur: 10 * SCALE, fill: true },
    }).setOrigin(0.5).setDepth(20);
    this.add.text(W / 2, u(218), 'A  WALKABLE  PORTFOLIO', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${15 * SCALE}px`, color: 'rgba(255,250,240,.85)',
    }).setOrigin(0.5).setDepth(20);
    const enter = this.add.text(W / 2, u(520), '— Click to Enter —', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${20 * SCALE}px`, color: '#fffaf0',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: enter, alpha: 0.25, duration: 900, yoyo: true, repeat: -1 });
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const t = time / 1000;

    /* 风:位移强度随时间起伏 */
    if (this.grassFX) {
      this.grassFX.x = Math.sin(t * 1.05) * GRASS_WIND + GRASS_WIND * 0.4;
      this.grassFX.y = Math.cos(t * 0.75) * GRASS_WIND * 0.45;
    }
    if (this.frontFX) {
      this.frontFX.x = Math.sin(t * 1.35 + 1.2) * GRASS_WIND * 1.5;
      this.frontFX.y = Math.cos(t * 0.9) * GRASS_WIND * 0.6;
    }

    /* 云漂移 */
    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      const half = c.img.displayWidth / 2;
      if (c.img.x - half > W + u(40)) c.img.x = -half - u(40);
      c.img.y = c.baseY + Math.sin(t * 0.3) * u(4);
    }

    /* 视差:鼠标位置 → 各层不同幅度偏移 */
    if (!this.entering) {
      const p = this.input.activePointer;
      const tx = Phaser.Math.Clamp(p.x / W - 0.5, -0.5, 0.5);
      const ty = Phaser.Math.Clamp(p.y / H - 0.5, -0.5, 0.5);
      this.lookX += (tx - this.lookX) * 0.04;
      this.lookY += (ty - this.lookY) * 0.04;
    }
    const px = (k: keyof typeof PARALLAX) => -this.lookX * PARALLAX[k];
    const py = (k: keyof typeof PARALLAX) => -this.lookY * PARALLAX[k] * 0.55;
    if (this.layers.base)  this.layers.base.setPosition(W / 2 + px('base'), H / 2 + py('base'));
    if (this.layers.grass) this.layers.grass.setPosition(W / 2 + px('grass'), H / 2 + py('grass'));
    if (this.layers.front) this.layers.front.setPosition(W / 2 + px('front'), H / 2 + py('front'));

    /* 小屋:整体沉重颠簸 + 轻微摇摆(替代迈腿) */
    const bob = Math.abs(Math.sin(t * 2.2)) * u(6);
    this.castle.y = u(CASTLE_Y) - bob;
    this.castle.angle = Math.sin(t * 2.2) * 1.2;
    if (!this.entering) {
      this.castle.x += u(14) * this.castleDir * dt;
      if (this.castle.x > u(880)) this.castleDir = -1;
      if (this.castle.x < u(300)) this.castleDir = 1;
    }
    this.castle.scaleX = this.castleDir;

    /* 阴影跟随 + 颠簸呼吸 */
    this.castleShadow.x = this.castle.x;
    const contact = 1 - Math.abs(Math.sin(t * 2.2));
    this.castleShadow.setScale(1 + contact * 0.15, 1);
    this.castleShadow.setAlpha(0.20 + contact * 0.14);
  }
}