import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 第一幕:静态远景(草原 + 远处小屋 + 旅人,画在 hero.webp 里)。
 * 动效:草地风吹位移 + 鼠标视差 + cloud1.png 飘云。
 * 只保留一句 "Click to Start"。点击 → 第二幕。
 */

/* ===== 想调效果,改这里 ===== */
const MARGIN = 44 * SCALE;
const GRASS_CROP = 0.50;
const FRONT_CROP = 0.88;
const GRASS_WIND = 0.011;
const PARALLAX = { base: 5 * SCALE, grass: 14 * SCALE, front: 20 * SCALE };

export class TitleScene extends Phaser.Scene {
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
  }

  create(): void {
    this.entering = false;
    this.clouds = [];

    this.makeNoiseTexture();
    this.paintScene();
    this.buildTitleUI();

    this.cameras.main.fadeIn(600, 30, 30, 34);

    this.input.once('pointerdown', () => {
      this.entering = true;
      const cam = this.cameras.main;
      cam.zoomTo(1.6, 1200, 'Sine.easeIn');
      cam.fadeOut(1150, 250, 246, 238);
      cam.once('camerafadeoutcomplete', () => this.scene.start('Dressing'));
    });
  }

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

    /* 云:透明 PNG 缓慢横移,出界回卷 */
    const cloudDefs = [
      { key: 'cloud1', x: 0.5, y: 0.18, speed: 6 },
    ];
    this.clouds = cloudDefs.map(d => ({
      img: this.add.image(W * d.x, H * d.y, d.key).setScale(scale).setDepth(1),
      speed: d.speed * SCALE,
      baseY: H * d.y,
    }));
  }

  private buildTitleUI(): void {
    const enter = this.add.text(W / 2, H - u(70), '— Click to Start —', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${20 * SCALE}px`, color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.5)', blur: 8 * SCALE, fill: true },
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: enter, alpha: 0.3, duration: 1100, yoyo: true, repeat: -1 });
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;
    const t = time / 1000;

    if (this.grassFX) {
      this.grassFX.x = Math.sin(t * 1.05) * GRASS_WIND + GRASS_WIND * 0.4;
      this.grassFX.y = Math.cos(t * 0.75) * GRASS_WIND * 0.45;
    }
    if (this.frontFX) {
      this.frontFX.x = Math.sin(t * 1.35 + 1.2) * GRASS_WIND * 1.5;
      this.frontFX.y = Math.cos(t * 0.9) * GRASS_WIND * 0.6;
    }

    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      const half = c.img.displayWidth / 2;
      if (c.img.x - half > W + u(40)) c.img.x = -half - u(40);
      c.img.y = c.baseY + Math.sin(t * 0.3) * u(4);
    }

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
  }
}