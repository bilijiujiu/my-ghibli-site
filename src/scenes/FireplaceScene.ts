import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { Achievements } from '../systems/achievements';

/**
 * 壁炉近景 · 独立一幕。
 * 从 RoomScene 按 E 进入(scene.start('Fireplace'))。
 *
 * 体验:淡入 → 暗炉膛(熄灭) → 点击打火石(第一下擦火花不着,第二下点燃)
 *       → 火由小渐旺 → 按 E 添柴更旺 → 加满文字浮现 → Esc 离开。
 *
 * 交互分工:点击=打火 / E=加柴 / Esc=离开。
 *
 * 火焰位置:第一次点击时,以点击位置作为火焰底部中心(FIRE_X/FIRE_Y)。
 * 这样你点柴堆哪里,火就从哪里升起,不用手动量坐标。
 *
 * 需要 public/fireplace_bg.png。
 */

/* 火焰横向散布半径(屏幕像素)。想火更宽就调大这个数。 */
const FIRE_SPREAD = u(130);

/* 火焰倾斜:正值往右偏,负值往左偏。匹配壁炉斜视角。想更斜就调大。 */
const FIRE_LEAN = u(35);

/* ===== 火势 ===== */
const MAX_LOGS = 4;          // 最多加几次柴
const LIT_INTENSITY = 0.35;  // 刚点燃后渐旺到的初始小火强度
const IGNITE_TRIES = 2;      // 需要点几下才点着(第2下着)

export class FireplaceScene extends Phaser.Scene {
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private coreEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private emberEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hint!: Phaser.GameObjects.Text;
  private story!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  private intensity = 0;
  private targetIntensity = 0;
  private logs = 0;
  private glowPulse = 0;
  private leaving = false;

  private lit = false;
  private igniteTries = 0;

  /* 火焰底部中心(屏幕像素),固定在炉膛柴架上。位置不对就调这两个数。 */
  private fireX = W * 0.5;
  private fireY = H * 0.68;

  constructor() { super('Fireplace'); }

  preload(): void {
    this.load.image('fireplace_bg', '/fireplace_bg.png');
    this.makeParticleTexture();
  }

  create(): void {
    this.leaving = false;
    this.intensity = 0;
    this.targetIntensity = 0;
    this.logs = 0;
    this.lit = false;
    this.igniteTries = 0;

    /* 暗场底 */
    this.add.rectangle(W / 2, H / 2, W, H, 0x1a0f0a).setDepth(-1);

    /* 背景完整装进屏幕 */
    const src = this.textures.get('fireplace_bg').getSourceImage() as HTMLImageElement;
    const scale = Math.min(W / src.width, H / src.height);
    const bg = this.add.image(W / 2, H / 2, 'fireplace_bg').setScale(scale).setDepth(0);

    /* 边缘渐隐融合 */
    const bgLeft = bg.x - bg.displayWidth / 2;
    const bgRight = bg.x + bg.displayWidth / 2;
    const fade = this.add.graphics().setDepth(1);
    const fw = u(80);
    for (let i = 0; i < fw; i++) {
      const a = (1 - i / fw) * 0.9;
      fade.fillStyle(0x1a0f0a, a);
      fade.fillRect(bgLeft + i, 0, 1, H);
      fade.fillRect(bgRight - i - 1, 0, 1, H);
    }

    /* 压角 */
    const vignette = this.add.graphics().setDepth(1);
    vignette.fillStyle(0x0a0608, 0.45);
    vignette.fillRect(0, 0, W, H);

    /* 火焰粒子(进场熄灭) */
    this.buildFire();

    this.buildUI();

    this.keys = this.input.keyboard!.addKeys('E,ESC') as any;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.strike(p));

    this.cameras.main.fadeIn(600, 20, 12, 8);
  }

  private makeParticleTexture(): void {
    const size = 32;
    const c = this.textures.createCanvas('spark', size, size);
    if (!c) return;
    const ctx = c.getContext();
    /* 硬边实心圆:中心实、边缘快速收窄(不是柔光渐变),更贴插画平涂感 */
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,1)');   // 大部分实心
    g.addColorStop(0.85, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');       // 只有最外圈软一点点
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    c.refresh();
  }

  /* ---------- 火焰 ---------- */
  private buildFire(): void {
    /* 底部核心层:橙红实心(不发白),NORMAL 混合避免叠加成白 */
    this.coreEmitter = this.add.particles(this.fireX, this.fireY, 'spark', {
      x: { min: -FIRE_SPREAD * 0.5, max: FIRE_SPREAD * 0.5 },
      speedY: { min: -u(80), max: -u(40) },
      speedX: { min: -u(14) + FIRE_LEAN, max: u(14) + FIRE_LEAN },
      scale: { start: 0.9 * SCALE, end: 0.2 * SCALE },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 350, max: 650 },
      frequency: 16,
      quantity: 2,
      tint: [0xff8a2e, 0xf26a1b, 0xe0531a],   // 橙红,不含黄白
      blendMode: 'NORMAL',
    }).setDepth(3);

    /* 主火苗:橙黄,往上舔,NORMAL 混合 */
    this.emitter = this.add.particles(this.fireX, this.fireY, 'spark', {
      x: { min: -FIRE_SPREAD * 0.45, max: FIRE_SPREAD * 0.45 },
      speedY: { min: -u(210), max: -u(120) },
      speedX: { min: -u(20) + FIRE_LEAN, max: u(20) + FIRE_LEAN },
      scale: { start: 0.8 * SCALE, end: 0 },
      alpha: { start: 0.85, end: 0 },
      lifespan: { min: 500, max: 900 },
      frequency: 12,
      quantity: 2,
      tint: [0xffc24d, 0xffa838, 0xff7a2e],   // 橙黄→橙
      blendMode: 'NORMAL',
    }).setDepth(4);

    /* 顶部亮尖:少量亮黄,点缀在火苗顶端,这层用 ADD 提亮但量很少 */
    this.emberEmitter = this.add.particles(this.fireX, this.fireY, 'spark', {
      x: { min: -FIRE_SPREAD * 0.35, max: FIRE_SPREAD * 0.35 },
      speedY: { min: -u(260), max: -u(160) },
      speedX: { min: -u(30) + FIRE_LEAN * 1.4, max: u(30) + FIRE_LEAN * 1.4 },
      scale: { start: 0.15 * SCALE, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 800, max: 1400 },
      frequency: 110,
      quantity: 1,
      tint: [0xffd27a, 0xffe89f],
      blendMode: 'ADD',
    }).setDepth(5);

    this.coreEmitter.stop();
    this.emitter.stop();
    this.emberEmitter.stop();
  }

  /** 把发射器移到当前火焰位置 */
  private moveEmittersToFire(): void {
    this.coreEmitter.setPosition(this.fireX, this.fireY);
    this.emitter.setPosition(this.fireX, this.fireY);
    this.emberEmitter.setPosition(this.fireX, this.fireY);
  }

  private applyIntensity(): void {
    const i = this.intensity;
    if (i <= 0.02) {
      this.coreEmitter.stop();
      this.emitter.stop();
      this.emberEmitter.stop();
      return;
    }
    if (!this.coreEmitter.emitting) this.coreEmitter.start();
    if (!this.emitter.emitting) this.emitter.start();
    if (!this.emberEmitter.emitting) this.emberEmitter.start();
    /* 火势越大:核心和主火苗越密,火星略增 */
    this.coreEmitter.frequency = Math.max(6, 16 - i * 12);
    this.coreEmitter.quantity = Math.round(2 + i * 3);
    this.emitter.frequency = Math.max(6, 18 - i * 14);
    this.emitter.quantity = Math.round(1 + i * 4);
    this.emberEmitter.frequency = Math.max(30, 110 - i * 70);
  }

  /* ---------- UI ---------- */
  private buildUI(): void {
    this.hint = this.add.text(W / 2, H - u(70), 'Click the logs to strike a light', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${17 * SCALE}px`, color: 'rgba(255,240,220,.9)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.7)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(20);

    this.story = this.add.text(W / 2, H * 0.28, '', {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${30 * SCALE}px`, color: '#ffe8c8', align: 'center',
      lineSpacing: u(10),
      shadow: { offsetX: 0, offsetY: 0, color: '#ff9a4a', blur: 18, fill: true },
      wordWrap: { width: u(520) },
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
  }

  /* ---------- 打火石:点击触发 ---------- */
  private strike(_p: Phaser.Input.Pointer): void {
    if (this.leaving) return;
    if (this.lit) return;

    this.igniteTries++;

    /* 擦火石:在火焰位置迸一簇白亮火星 */
    this.sparkBurst();

    if (this.igniteTries >= IGNITE_TRIES) {
      this.lit = true;
      this.targetIntensity = LIT_INTENSITY;
      this.hint.setText('Press E to add wood · Esc to leave');
      Achievements.unlock('fire', this);
    } else {
      this.hint.setText('Try again');
    }
  }

  /** 打火石火星:一簇白亮小火星四散 */
  private sparkBurst(): void {
    const p = this.add.particles(this.fireX, this.fireY, 'spark', {
      speed: { min: u(60), max: u(240) },
      angle: { min: 200, max: 340 },
      scale: { start: 0.3 * SCALE, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 200, max: 500 },
      tint: [0xffffff, 0xfff2c0, 0xffd27a],
      blendMode: 'ADD',
      emitting: false,
    }).setDepth(6);
    p.explode(20);
    this.glowPulse = Math.max(this.glowPulse, 0.5);
    this.time.delayedCall(700, () => p.destroy());
  }

  /* ---------- 加柴 ---------- */
  private addLog(): void {
    if (!this.lit) return;
    if (this.logs >= MAX_LOGS) return;
    this.logs++;
    this.targetIntensity = Math.min(1, LIT_INTENSITY + this.logs * (0.65 / MAX_LOGS) + 0.15);

    this.emberEmitter.explode(18, this.fireX, this.fireY);
    this.glowPulse = 1;

    if (this.logs >= MAX_LOGS) {
      this.revealStory();
      this.hint.setText('Esc to leave');
    }
  }

  private revealStory(): void {
    this.story.setText('The fire is warm now.\nA few words about me go here.');
    this.tweens.add({ targets: this.story, alpha: 1, duration: 1400, ease: 'Sine.easeOut' });
  }

  /* ---------- 离开 ---------- */
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

    /* 火势平滑逼近目标(由小渐旺) */
    if (Math.abs(this.intensity - this.targetIntensity) > 0.001) {
      this.intensity += (this.targetIntensity - this.intensity) * Math.min(1, 2 * dt);
      this.applyIntensity();
    }

    /* 加柴脉动衰减(保留给粒子爆发用) */
    this.glowPulse *= (1 - 3 * dt);
  }
}