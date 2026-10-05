import Phaser from 'phaser';

/**
 * 画出来的树。四季四张图由 tools/paint_tree.py 离线画好(叶团 + 赛璐璐分色 + 墨线),
 * 这里只负责:显示、换季淡入淡出、按时段染色、随风摇、秋天落叶。
 *
 * 接口和原来的程序化 Tree 保持一致(c / fallLayer / setSeason / setLight / update / spawnFall),
 * WindowScene 里换一个类名就能用。
 */

export const TREE_KEYS = ['tree_spring', 'tree_summer', 'tree_autumn', 'tree_winter'];
/** paint_tree.py 里树根离画布底边 20px(画布 900 高) */
const ROOT_Y = 880 / 900;
const FALL_COLS = [0xd9973a, 0xc7642c, 0xe8bd63, 0xa4472a];

interface Falling { x: number; y: number; vx: number; vy: number; ph: number; c: number; life: number }

export class PaintedTree {
  readonly c: Phaser.GameObjects.Container;
  private a: Phaser.GameObjects.Image;
  private b: Phaser.GameObjects.Image;
  private fallG: Phaser.GameObjects.Graphics;
  private falling: Falling[] = [];
  private tint = 0xffffff;
  private phase = Math.random() * 10;

  constructor(scene: Phaser.Scene, x: number, y: number, height: number, flip = false) {
    this.c = scene.add.container(x, y);
    this.a = scene.add.image(0, 0, TREE_KEYS[0]).setOrigin(0.5, ROOT_Y);
    this.b = scene.add.image(0, 0, TREE_KEYS[1]).setOrigin(0.5, ROOT_Y).setAlpha(0);
    const s = height / this.a.height;
    for (const im of [this.a, this.b]) im.setScale(s).setFlipX(flip);
    this.c.add([this.a, this.b]);
    this.fallG = scene.add.graphics();
  }

  get fallLayer(): Phaser.GameObjects.Graphics { return this.fallG; }

  /** 0=春 0.25=夏 0.5=秋 0.75=冬,循环。相邻两季的图交叉淡化。 */
  setSeason(season: number, _force = false): void {
    const f = (((season % 1) + 1) % 1) * 4;
    const i = Math.floor(f) % 4;
    const k = f - Math.floor(f);
    this.a.setTexture(TREE_KEYS[i]);
    this.b.setTexture(TREE_KEYS[(i + 1) % 4]).setAlpha(k);
  }

  /** 时段光(multiply),和地景用同一个颜色 */
  setLight(tint: number): void {
    this.tint = tint;
    this.a.setTint(tint);
    this.b.setTint(tint);
  }

  /** 秋天飘落叶:从树冠范围里随机一点出发 */
  spawnFall(rate: number, dt: number, groundY: number): void {
    if (rate <= 0 || Math.random() >= rate * dt || this.falling.length >= 40) return;
    const w = this.a.displayWidth, h = this.a.displayHeight;
    const x = this.c.x + (Math.random() - 0.5) * w * 0.7;
    const y = this.c.y - h * (0.5 + Math.random() * 0.4);
    this.falling.push({
      x, y, vx: -8 - Math.random() * 14, vy: 14 + Math.random() * 16, ph: Math.random() * 6.28,
      c: FALL_COLS[Math.floor(Math.random() * FALL_COLS.length)], life: (groundY - y) / 20,
    });
  }

  update(dt: number, t: number, groundY: number): void {
    /* 整棵树绕树根微摆:两个频率叠起来,不像节拍器 */
    const tt = t + this.phase;
    this.c.setRotation(Math.sin(tt * 0.9) * 0.012 + Math.sin(tt * 2.3) * 0.004);

    this.fallG.clear();
    const [tr, tg, tb] = [(this.tint >> 16) & 255, (this.tint >> 8) & 255, this.tint & 255];
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const p = this.falling[i];
      p.ph += dt * 3;
      p.x += (p.vx + Math.sin(p.ph) * 22) * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > groundY) { this.falling.splice(i, 1); continue; }
      const col = Phaser.Display.Color.GetColor(
        ((p.c >> 16) & 255) * tr / 255, ((p.c >> 8) & 255) * tg / 255, (p.c & 255) * tb / 255);
      const wdt = 7 * Math.abs(Math.cos(p.ph)) + 2;
      this.fallG.fillStyle(col, Phaser.Math.Clamp(p.life, 0, 1));
      this.fallG.fillEllipse(p.x, p.y, wdt, 5);
      this.fallG.lineStyle(1, 0x1a1410, 0.6 * Phaser.Math.Clamp(p.life, 0, 1));
      this.fallG.strokeEllipse(p.x, p.y, wdt, 5);
    }
  }
}
