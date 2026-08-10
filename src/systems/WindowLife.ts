import Phaser from 'phaser';

/**
 * 窗外的活物与天气:雨、雪、候鸟、兽群。
 * 全部用 Graphics 每帧重画 —— 数量都在几百这个量级,比建几百个 GameObject 省得多,
 * 也方便按季节把强度连续调成 0。
 */

interface Drop { x: number; y: number; v: number; len: number }
interface Flake { x: number; y: number; v: number; ph: number; r: number }
interface Bird { ox: number; oy: number; ph: number }
interface Flock { x: number; y: number; dir: number; sp: number; birds: Bird[] }

export class WindowLife {
  private W: number;
  private H: number;
  private drops: Drop[] = [];
  private flakes: Flake[] = [];
  private flocks: Flock[] = [];
  private gRain: Phaser.GameObjects.Graphics;
  private gSnow: Phaser.GameObjects.Graphics;
  private gBird: Phaser.GameObjects.Graphics;
  private birdTimer = 6;

  constructor(scene: Phaser.Scene, W: number, H: number, depth: { weather: number; bird: number }) {
    this.W = W; this.H = H;
    this.gBird = scene.add.graphics().setDepth(depth.bird);
    this.gRain = scene.add.graphics().setDepth(depth.weather);
    this.gSnow = scene.add.graphics().setDepth(depth.weather);

    for (let i = 0; i < 320; i++) {
      this.drops.push({ x: Math.random() * W, y: Math.random() * H,
                        v: H * (0.9 + Math.random() * 0.5), len: 18 + Math.random() * 26 });
    }
    for (let i = 0; i < 220; i++) {
      this.flakes.push({ x: Math.random() * W, y: Math.random() * H,
                         v: 26 + Math.random() * 44, ph: Math.random() * 6.28,
                         r: 1.6 + Math.random() * 3.4 });
    }
  }

  /**
   * @param rain  0..1 雨量   @param snow 0..1 雪量
   * @param birdRate 每秒生成鸟群的期望   @param birdDir 迁徙方向 (+1 向右 / −1 向左)
   * @param light 环境亮度 0..1,夜里雨雪和鸟都该暗下去
   */
  update(dt: number, rain: number, snow: number, birdRate: number, birdDir: number,
         light: number): void {
    this.drawRain(dt, rain, light);
    this.drawSnow(dt, snow, light);
    this.drawBirds(dt, birdRate, birdDir, light);
  }

  private drawRain(dt: number, amount: number, light: number): void {
    this.gRain.clear();
    if (amount < 0.02) return;
    const n = Math.floor(this.drops.length * amount);
    const slant = 0.28;
    this.gRain.lineStyle(2, 0xbcd0e8, 0.34 * amount * (0.35 + light * 0.65));
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      d.y += d.v * dt;
      d.x += d.v * slant * dt;
      if (d.y > this.H) { d.y = -30; d.x = Math.random() * this.W - 60; }
      this.gRain.lineBetween(d.x, d.y, d.x - d.len * slant, d.y - d.len);
    }
  }

  private drawSnow(dt: number, amount: number, light: number): void {
    this.gSnow.clear();
    if (amount < 0.02) return;
    const n = Math.floor(this.flakes.length * amount);
    this.gSnow.fillStyle(0xf2f7ff, 0.8 * (0.4 + light * 0.6));
    for (let i = 0; i < n; i++) {
      const f = this.flakes[i];
      f.ph += dt * 0.9;
      f.y += f.v * dt;
      f.x += Math.sin(f.ph) * 16 * dt;
      if (f.y > this.H) { f.y = -20; f.x = Math.random() * this.W; }
      this.gSnow.fillCircle(f.x, f.y, f.r);
    }
  }

  private drawBirds(dt: number, rate: number, dir: number, light: number): void {
    this.birdTimer -= dt;
    if (this.birdTimer <= 0 && rate > 0.01) {
      this.birdTimer = 4 + Math.random() * 10 / Math.max(rate, 0.05);
      const n = 5 + Math.floor(Math.random() * 7);
      const birds: Bird[] = [];
      /* 人字形:两翼各排开,越靠后越低一点 */
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? 1 : -1;
        const rank = Math.floor(i / 2);
        birds.push({ ox: -rank * 34 * dir, oy: side * rank * 17,
                     ph: Math.random() * 6.28 });
      }
      this.flocks.push({
        x: dir > 0 ? -200 : this.W + 200,
        y: this.H * (0.14 + Math.random() * 0.22),
        dir, sp: 70 + Math.random() * 50, birds,
      });
    }

    this.gBird.clear();
    const alpha = 0.55 + light * 0.35;
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const fl = this.flocks[i];
      fl.x += fl.sp * fl.dir * dt;
      if (fl.x < -400 || fl.x > this.W + 400) { this.flocks.splice(i, 1); continue; }
      this.gBird.lineStyle(2.5, 0x2b2b3a, alpha);
      for (const b of fl.birds) {
        b.ph += dt * 7;
        const flap = Math.sin(b.ph) * 6;          // 拍翅:两撇线的开合
        const x = fl.x + b.ox, y = fl.y + b.oy + Math.sin(fl.x / 180 + b.ph * 0.1) * 8;
        this.gBird.lineBetween(x, y, x - 9 * fl.dir, y - flap);
        this.gBird.lineBetween(x, y, x + 9 * fl.dir, y - flap);
      }
    }
  }

}
