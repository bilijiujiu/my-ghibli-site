import Phaser from 'phaser';
import { u } from '../config/constants';

/**
 * 月光:从窗口斜照进屋的一道光,落在地板上是一块带窗棂影子的光斑,光柱里飘着几粒灰。
 * 替换原来窗玻璃上的"雨滴"—— 那是一颗颗等距的圆点匀速往下掉,像串珠门帘,和原画完全不搭。
 *
 * 全部用 ADD 混合叠在原画上,不动原画一个像素。坐标用房间逻辑坐标(和 RoomScene 的 WIN 一致)。
 *   - 光斑:窗户下半那块(带十字窗棂)经过一个仿射变换压到地板上:往左下斜、纵向压扁(地板是斜着看的);
 *   - 光柱:窗户和光斑之间的那一片,很淡,越往地板越淡;
 *   - 浮尘:只在光柱里生成、慢慢飘、一明一暗。
 */

export interface Rect { x: number; y: number; w: number; h: number }

const MOON = 0xcfe0ff;
const KEY = 'moon_patch';

export class MoonBeam {
  private scene: Phaser.Scene;
  private patch: Phaser.GameObjects.Image;
  private shaft: Phaser.GameObjects.Image;
  private motes: { o: Phaser.GameObjects.Image; t: number; s: number; ph: number; sp: number }[] = [];
  private win: Rect;
  private floor: { x: number; y: number; w: number; h: number; shear: number };
  private clock = 0;

  /**
   * @param win    窗户(玻璃部分)的逻辑坐标
   * @param floorY 光斑靠墙那条边落在地板上的 y
   */
  constructor(scene: Phaser.Scene, win: Rect, floorY: number, depth = 2) {
    this.scene = scene;
    this.win = win;
    /* 光从右上方(窗外高处的月亮)照进来:光斑在窗户正下方偏左,越靠近观众越往左 */
    this.floor = { x: win.x - win.w * 0.25, y: floorY, w: win.w * 1.08, h: win.h * 0.42, shear: -win.w * 0.5 };

    this.patch = scene.add.image(0, 0, this.buildPatch()).setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setTint(MOON).setAlpha(0.55);
    this.shaft = scene.add.image(0, 0, this.buildShaft()).setOrigin(0, 0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setTint(MOON).setAlpha(0.14);

    const glowKey = 'moon_mote';
    if (!scene.textures.exists(glowKey)) {
      const t = scene.textures.createCanvas(glowKey, 32, 32)!;
      const c = t.getContext();
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 32, 32); t.refresh();
    }
    for (let i = 0; i < 26; i++) {
      const o = scene.add.image(0, 0, glowKey).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(depth + 0.5).setTint(0xeaf2ff).setScale(u(0.09 + Math.random() * 0.12));
      this.motes.push({ o, t: Math.random(), s: Math.random(), ph: Math.random() * 6.28, sp: 0.02 + Math.random() * 0.03 });
    }
  }

  /** 光斑:窗户形状(上半拱、下半两扇各 3×3 小格,中间粗立柱),经仿射变换压到地板上 */
  private buildPatch(): string {
    const s = this.scene, f = this.floor;
    const bw = Math.ceil(u(f.w + Math.abs(f.shear))) + 40, bh = Math.ceil(u(f.h)) + 40;
    if (s.textures.exists(KEY)) s.textures.remove(KEY);
    const tex = s.textures.createCanvas(KEY, bw, bh)!;
    const c = tex.getContext();
    /* 仿射:窗户局部坐标 (0..1, 0..1) → 画布。v=0 是窗户上沿 → 光斑远边(靠墙),v=1 → 近边 */
    const ox = 20 - Math.min(0, u(f.shear)), oy = 20;
    c.setTransform(u(f.w), 0, u(f.shear), u(f.h), ox, oy);
    c.filter = 'blur(3px)';
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 1, 1);
    /* 窗棂影子:中间粗立柱 + 每扇两根细竖条、两根细横条 */
    c.globalCompositeOperation = 'destination-out';
    c.fillRect(0.47, 0, 0.06, 1);
    for (const x of [0.16, 0.32, 0.68, 0.84]) c.fillRect(x - 0.012, 0, 0.024, 1);
    for (const y of [0.33, 0.66]) c.fillRect(0, y - 0.025, 1, 0.05);
    c.globalCompositeOperation = 'source-over';
    /* 远边(靠墙)亮、近边暗 —— 光是从高处斜着打下来的,越远离窗户越弱 */
    c.globalCompositeOperation = 'destination-in';
    const g = c.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c.fillStyle = g; c.fillRect(-0.2, 0, 1.4, 1);
    tex.refresh();
    this.patchOrigin = { x: u(f.x) - ox + 0, y: u(f.y) - oy };
    return KEY;
  }
  private patchOrigin = { x: 0, y: 0 };

  /** 光柱:窗户下沿两角 → 光斑近边两角 围成的那一片,越往下越淡 */
  private buildShaft(): string {
    const s = this.scene, w = this.win, f = this.floor;
    const pts = [
      [w.x, w.y], [w.x + w.w, w.y],                                    // 窗户上沿
      [f.x + f.w + f.shear, f.y + f.h], [f.x + f.shear, f.y + f.h],    // 光斑近边
    ].map(([x, y]) => [u(x), u(y)]);
    const minX = Math.min(...pts.map(p => p[0])), minY = Math.min(...pts.map(p => p[1]));
    const maxX = Math.max(...pts.map(p => p[0])), maxY = Math.max(...pts.map(p => p[1]));
    const key = 'moon_shaft';
    if (s.textures.exists(key)) s.textures.remove(key);
    const tex = s.textures.createCanvas(key, Math.ceil(maxX - minX), Math.ceil(maxY - minY))!;
    const c = tex.getContext();
    c.filter = 'blur(10px)';
    const g = c.createLinearGradient(0, 0, 0, maxY - minY);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0.15)');
    c.fillStyle = g;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x - minX, y - minY) : c.moveTo(x - minX, y - minY)));
    c.closePath(); c.fill();
    tex.refresh();
    this.shaftOrigin = { x: minX, y: minY };
    return key;
  }
  private shaftOrigin = { x: 0, y: 0 };

  update(dt: number): void {
    this.clock += dt;
    this.patch.setPosition(this.patchOrigin.x, this.patchOrigin.y);
    this.shaft.setPosition(this.shaftOrigin.x, this.shaftOrigin.y);
    /* 云偶尔遮一下月亮:光整体很慢地明暗 */
    const cloud = 0.85 + 0.15 * Math.sin(this.clock * 0.21) * Math.sin(this.clock * 0.13 + 1);
    this.patch.setAlpha(0.55 * cloud);
    this.shaft.setAlpha(0.14 * cloud);

    /* 浮尘:t 是从窗口到地板的位置,s 是横向位置;慢慢往下飘、左右晃 */
    const w = this.win, f = this.floor;
    for (const m of this.motes) {
      m.t += dt * m.sp; m.ph += dt * 0.8;
      if (m.t > 1) { m.t = 0; m.s = Math.random(); }
      const topX = w.x + w.w * m.s, topY = w.y + w.h * 0.6;
      const botX = f.x + f.shear * 0.6 + f.w * m.s, botY = f.y + f.h * 0.6;
      const x = topX + (botX - topX) * m.t + Math.sin(m.ph) * 4;
      const y = topY + (botY - topY) * m.t;
      m.o.setPosition(u(x), u(y));
      const edge = Math.sin(Math.PI * m.t);           // 两头淡入淡出
      m.o.setAlpha(edge * (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(m.ph * 1.7))) * cloud);
    }
  }

  destroy(): void {
    this.patch.destroy(); this.shaft.destroy();
    for (const m of this.motes) m.o.destroy();
  }
}
