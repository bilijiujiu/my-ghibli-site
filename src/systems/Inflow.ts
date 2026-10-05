import Phaser from 'phaser';

/**
 * 开窗以后"飘进屋里"的东西:雨丝、雪花、花瓣、落叶、萤火虫。
 *
 * 每个粒子在窗洞平面上生成(z=0),然后往观众这边飞(z 增大),同时受重力和风。
 * 屏幕位置用和窗扇同一套针孔透视:屏幕点 = 视点 + (P − 视点) · f / (f − z),
 * 所以离窗越远的粒子越大、散得越开 —— 像是真的从窗洞里吹出来,而不是在一个平面上平移。
 */

export type InflowKind = 'rain' | 'snow' | 'petal' | 'leaf' | 'fly';

interface P {
  kind: InflowKind; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; ph: number; life: number; c: number;
}

const PETAL = [0xf3c6d8, 0xe9a9c4, 0xfbe3ec];
const LEAF = [0xd9973a, 0xc7642c, 0xe8bd63, 0xa4472a];

export class Inflow {
  private g: Phaser.GameObjects.Graphics;
  private ps: P[] = [];
  private acc: Record<InflowKind, number> = { rain: 0, snow: 0, petal: 0, leaf: 0, fly: 0 };

  constructor(scene: Phaser.Scene,
              private hole: { x: number; y: number; w: number; h: number },
              private eye: { x: number; y: number; f: number },
              private floorY: number) {
    this.g = scene.add.graphics();
  }

  setDepth(d: number): this { this.g.setDepth(d); return this; }

  /**
   * @param rates 每秒生成多少个(已经乘过开窗程度)
   * @param light 环境亮度 0..1,夜里雨雪也暗下去;萤火虫反过来
   */
  update(dt: number, t: number, rates: Partial<Record<InflowKind, number>>, light: number): void {
    for (const k of Object.keys(rates) as InflowKind[]) {
      this.acc[k] += (rates[k] ?? 0) * dt;
      while (this.acc[k] >= 1 && this.ps.length < 260) { this.acc[k] -= 1; this.spawn(k); }
      if (this.acc[k] > 1) this.acc[k] = 0;
    }

    const g = this.g;
    g.clear();
    const { x: ex, y: ey, f } = this.eye;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.ph += dt;
      p.life -= dt;
      /* 运动:各类不一样 */
      if (p.kind === 'rain') { p.vy += 900 * dt; }
      else if (p.kind === 'snow') { p.vx = Math.sin(p.ph * 1.7) * 40; }
      else if (p.kind === 'petal' || p.kind === 'leaf') {
        p.vx = Math.sin(p.ph * 2.2) * 70; p.vy = 55 + Math.sin(p.ph * 3.1) * 25;
      } else if (p.kind === 'fly') {
        p.vx = Math.sin(p.ph * 0.9) * 35; p.vy = Math.cos(p.ph * 1.3) * 25;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

      const k = f / (f - p.z);
      const sx = ex + (p.x - ex) * k, sy = ey + (p.y - ey) * k;
      if (p.life <= 0 || sy > this.floorY || p.z > f * 0.8) { this.ps.splice(i, 1); continue; }
      /* 刚出窗洞时淡入,快到寿命时淡出 */
      const fade = Math.min(1, p.z / 60, p.life / 0.6);
      const day = 0.45 + light * 0.55;

      switch (p.kind) {
        case 'rain': {
          const len = 26 * k;
          g.lineStyle(1.6 * k, 0xd6e2f0, 0.5 * fade * day);
          g.lineBetween(sx, sy, sx - p.vx * 0.02 * k, sy - len);
          break;
        }
        case 'snow':
          g.fillStyle(0xf4f8ff, 0.9 * fade * day);
          g.fillCircle(sx, sy, 3.2 * k);
          break;
        case 'petal':
        case 'leaf': {
          const s = (p.kind === 'leaf' ? 9 : 6) * k;
          const flip = Math.abs(Math.cos(p.ph * 4));   // 翻转:椭圆宽度随相位变
          g.fillStyle(p.c, fade * day);
          g.fillEllipse(sx, sy, s * (0.35 + flip), s * 0.7);
          g.lineStyle(1, 0x2a1a10, 0.5 * fade * day);
          g.strokeEllipse(sx, sy, s * (0.35 + flip), s * 0.7);
          break;
        }
        case 'fly': {
          const blink = Math.max(0, Math.sin(p.ph * 2.4 + p.c));
          const a = fade * blink * blink;
          g.fillStyle(0xffe89a, 0.25 * a); g.fillCircle(sx, sy, 14 * k);
          g.fillStyle(0xfff6c8, 0.95 * a); g.fillCircle(sx, sy, 3 * k);
          break;
        }
      }
    }
    void t;
  }

  private spawn(kind: InflowKind): void {
    const h = this.hole;
    const x = h.x + Math.random() * h.w;
    const y = kind === 'fly' ? h.y + h.h * (0.3 + Math.random() * 0.6) : h.y + Math.random() * h.h * 0.7;
    const base = { kind, x, y, z: 0, ph: Math.random() * 6.28, c: 0 } as P;
    switch (kind) {
      case 'rain':  Object.assign(base, { vx: 30, vy: 200, vz: 520 + Math.random() * 300, life: 1.6 }); break;
      case 'snow':  Object.assign(base, { vx: 0, vy: 45 + Math.random() * 35, vz: 110 + Math.random() * 120, life: 7 }); break;
      case 'petal': Object.assign(base, { vx: 0, vy: 50, vz: 120 + Math.random() * 130, life: 7, c: PETAL[Math.floor(Math.random() * PETAL.length)] }); break;
      case 'leaf':  Object.assign(base, { vx: 0, vy: 60, vz: 140 + Math.random() * 140, life: 7, c: LEAF[Math.floor(Math.random() * LEAF.length)] }); break;
      case 'fly':   Object.assign(base, { vx: 0, vy: 0, vz: 35 + Math.random() * 50, life: 12, c: Math.random() * 6 }); break;
    }
    this.ps.push(base);
  }
}
