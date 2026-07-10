import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 壁炉近景 · 独立一幕。
 * 从 RoomScene 按 E 进入(scene.start('Fireplace'))。
 *
 * 体验:淡入 → 暗炉膛 → 按 E 添柴,火越烧越旺 → 火旺后文字浮现 →
 *       Esc / 点击退出 → 淡回 Room。
 *
 * 本版:呼吸粒子火焰 + 加柴变旺 + 文字暖光浮现(占位)。
 * 火星聚字留作下一步升级。
 *
 * 需要 public/fireplace_bg.png。
 */

/* ===== 火焰位置(逻辑坐标,先给估值,进场后用 DEBUG 调) ===== */
const FIRE = {
  baseX: W / 2,        // 火焰底部中心 x(炉膛中线,先用屏幕中央)
  baseY: H * 0.72,     // 火焰底部 y(柴堆顶面)
  spread: 90,          // 火焰横向散布半径
};

/* ===== 火势等级:每加一次柴 +1,影响粒子量和光晕 ===== */
const MAX_LOGS = 4;          // 最多加几次柴
const BASE_INTENSITY = 0.35; // 初始火势(未加柴时的小火)

export class FireplaceScene extends Phaser.Scene {
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emberEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private glow!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private story!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private intensity = BASE_INTENSITY;
  private logs = 0;
  private glowPulse = 0;
  private leaving = false;

  constructor() { super('Fireplace'); }

  preload(): void {
    this.load.image('fireplace_bg', '/fireplace_bg.png');
    /* 用一张运行时生成的小圆点当粒子贴图,省得再准备素材 */
    this.makeParticleTexture();
  }

  create(): void {
    this.leaving = false;
    this.intensity = BASE_INTENSITY;
    this.logs = 0;

    /* 先铺一层深暖黑填满全屏,让两侧空隙成为"暗场"而非黑边 */
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0f0a).setDepth(-1);

    /* 背景完整装进屏幕(不裁切) */
    const src = this.textures.get('fireplace_bg').getSourceImage() as HTMLImageElement;
    const scale = Math.max(W / src.width, H / src.height);
    const bg = this.add.image(W / 2, H / 2, 'fireplace_bg').setScale(scale).setDepth(0);

    /* 背景左右边缘各压一道渐隐的暗色,让图片和暗场自然融合(不是硬边) */
    const bgLeft = bg.x - bg.displayWidth / 2;
    const bgRight = bg.x + bg.displayWidth / 2;
    const fade = this.add.graphics().setDepth(1);
    const fw = u(80);   // 渐隐宽度
    for (let i = 0; i < fw; i++) {
      const a = (1 - i / fw) * 0.9;
      fade.fillStyle(0x1a0f0a, a);
      fade.fillRect(bgLeft + i, 0, 1, H);       // 左缘往内渐隐
      fade.fillRect(bgRight - i - 1, 0, 1, H);  // 右缘往内渐隐
    }

    /* 暗色压角,让注意力集中到炉膛 */
    const vignette = this.add.graphics().setDepth(1);
    vignette.fillStyle(0x0a0608, 0.45);
    vignette.fillRect(0, 0, W, H);
    vignette.fillStyle(0x000000, 0);

    /* 火光晕(在火焰后面,会随火势脉动) */
    this.glow = this.add.graphics().setDepth(2);

    /* 火焰粒子 */
    this.buildFire();

    /* UI:提示 + 故事文字 */
    this.buildUI();

    this.keys = this.input.keyboard!.addKeys('E,ESC') as any;
    this.input.on('pointerdown', () => this.leave());

    /* 淡入(复用你项目的暖色淡入基调) */
    this.cameras.main.fadeIn(600, 20, 12, 8);
  }

  /* ---------- 运行时生成粒子贴图(一个柔边圆点) ---------- */
  private makeParticleTexture(): void {
    const size = 32;
    const c = this.textures.createCanvas('spark', size, size);
    if (!c) return;
    const ctx = c.getContext();
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,240,200,0.9)');
    g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    c.refresh();
  }

  /* ---------- 火焰 ---------- */
  private buildFire(): void {
    const bx = u(FIRE.baseX);
    const by = u(FIRE.baseY);

    /* 主火焰:橙红粒子上升 + 收缩 + 变透明 */
    this.emitter = this.add.particles(bx, by, 'spark', {
      x: { min: -u(FIRE.spread) * 0.5, max: u(FIRE.spread) * 0.5 },
      speedY: { min: -u(180), max: -u(90) },
      speedX: { min: -u(20), max: u(20) },
      scale: { start: 0.9 * SCALE, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 600, max: 1100 },
      frequency: 18,
      quantity: 2,
      tint: [0xffe08a, 0xffb24d, 0xff7a2e, 0xe8531a],
      blendMode: 'ADD',
    }).setDepth(3);

    /* 火星:少量小亮点飘更高 */
    this.emberEmitter = this.add.particles(bx, by, 'spark', {
      x: { min: -u(FIRE.spread) * 0.3, max: u(FIRE.spread) * 0.3 },
      speedY: { min: -u(260), max: -u(150) },
      speedX: { min: -u(35), max: u(35) },
      scale: { start: 0.25 * SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 900, max: 1600 },
      frequency: 60,
      quantity: 1,
      tint: [0xffd27a, 0xffef9f],
      blendMode: 'ADD',
    }).setDepth(4);

    this.applyIntensity();
  }

  /** 根据火势更新粒子量 */
  private applyIntensity(): void {
    const i = this.intensity;
    this.emitter.frequency = Math.max(6, 22 - i * 18);
    this.emitter.quantity = Math.round(1 + i * 4);
    this.emberEmitter.frequency = Math.max(20, 80 - i * 60);
  }

  /* ---------- UI ---------- */
  private buildUI(): void {
    this.hint = this.add.text(W / 2, H - u(70), '按 E 添柴 · 点击离开', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${17 * SCALE}px`, color: 'rgba(255,240,220,.9)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.7)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(20);

    /* 故事文字:初始透明,火旺后浮现。先占位。 */
    this.story = this.add.text(W / 2, H * 0.30, '', {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${30 * SCALE}px`, color: '#ffe8c8', align: 'center',
      lineSpacing: u(10),
      shadow: { offsetX: 0, offsetY: 0, color: '#ff9a4a', blur: 18, fill: true },
      wordWrap: { width: u(520) },
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
  }

  /* ---------- 加柴 ---------- */
  private addLog(): void {
    if (this.logs >= MAX_LOGS) return;
    this.logs++;
    this.intensity = Math.min(1, BASE_INTENSITY + this.logs * (0.65 / MAX_LOGS) + 0.15);
    this.applyIntensity();

    /* 腾起反馈:一簇火星炸开 + 光晕猛地扩一下 */
    this.emberEmitter.explode(18, u(FIRE.baseX), u(FIRE.baseY));
    this.glowPulse = 1;

    /* 火旺到顶,文字浮现 */
    if (this.logs >= MAX_LOGS) {
      this.revealStory();
      this.hint.setText('点击离开');
    }
  }

  private revealStory(): void {
    /* TODO 换成你的话。这里先占位。 */
    this.story.setText('炉火正旺。\n这里是关于我的一段话。');
    this.tweens.add({ targets: this.story, alpha: 1, duration: 1400, ease: 'Sine.easeOut' });
  }

  /* ---------- 离开,淡回房间 ---------- */
  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(500, 20, 12, 8);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('Room');
    });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;

    if (Phaser.Input.Keyboard.JustDown(this.keys.E)) this.addLog();
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) this.leave();

    /* 光晕脉动:基础呼吸 + 加柴时的猛扩衰减 */
    this.glowPulse *= (1 - 3 * dt);
    const breath = 0.5 + 0.5 * Math.sin(this.time.now / 400);
    const radius = u(180 + this.intensity * 220 + this.glowPulse * 120);
    const alpha = 0.12 + this.intensity * 0.22 + breath * 0.05 * this.intensity + this.glowPulse * 0.25;

    this.glow.clear();
    this.glow.fillStyle(0xff8a3a, Phaser.Math.Clamp(alpha, 0, 0.8));
    this.glow.fillCircle(u(FIRE.baseX), u(FIRE.baseY - 40), radius);
  }
}