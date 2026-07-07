import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 第一幕:远景标题 + 会走的蒸汽小屋。
 * 背景 = hero.webp 叠层:base 底图 / grass 草地(风效)/ front 前景高草。
 * 云:待重构为单朵 PNG 漂移(见 design.md),当前底图云静止显示。
 */

/* ===== 想调效果,改这里 ===== */
const MARGIN = 44 * SCALE;
const GRASS_CROP = 0.53;      // 草地 = 画面 53% 以下
const FRONT_CROP = 0.90;      // 前景高草 = 最底部 10%
const GRASS_WIND = 0.011;
const PARALLAX = { base: 5 * SCALE, grass: 15 * SCALE, front: 22 * SCALE };

export class TitleScene extends Phaser.Scene {
  private castle!: Phaser.GameObjects.Container;
  private castleBody!: Phaser.GameObjects.Container;
  private legs: Array<Phaser.GameObjects.Rectangle & { phase?: number }> = [];
  private castleDir = 1;
  private entering = false;

  private layers: Partial<Record<'base' | 'grass' | 'front', Phaser.GameObjects.Image>> = {};
  private grassFX?: Phaser.FX.Displacement;
  private frontFX?: Phaser.FX.Displacement;
  private lookX = 0;
  private lookY = 0;

  constructor() { super('Title'); }

  preload(): void {
    this.load.image('s1', '/hero.webp');
    // TODO 云重构:this.load.image('cloud1', '/cloud1.png'); ...
  }

  create(): void {
    this.entering = false;
    this.castleDir = 1;
    this.legs = [];

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
  }

  private buildCastle(): void {
    const castle = this.add.container(u(420), u(430)).setDepth(3).setScale(SCALE);
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

    this.time.addEvent({
      delay: 420, loop: true, callback: () => {
        const puff = this.add.circle(
          this.castle.x + u(34) * this.castleDir,
          this.castle.y - u(172),
          u(7), 0xf0f0ea, 0.7,
        ).setDepth(3);
        this.tweens.add({
          targets: puff, y: puff.y - u(70), x: puff.x + Phaser.Math.Between(-u(16), u(16)),
          scale: 2.1, alpha: 0, duration: 2100, onComplete: () => puff.destroy(),
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

    /* 小屋踱步 */
    for (const leg of this.legs) leg.rotation = Math.sin(t * 5 + (leg.phase || 0)) * 0.4;
    this.castleBody.y = -20 + Math.sin(t * 5) * 3;
    if (!this.entering) {
      this.castle.x += u(14) * this.castleDir * dt;
      if (this.castle.x > u(860)) this.castleDir = -1;
      if (this.castle.x < u(320)) this.castleDir = 1;
      this.castle.scaleX = this.castleDir * SCALE;
    }
  }
}