import Phaser from 'phaser';
import { u } from '../config/constants';

/**
 * 窗户玻璃上的雨滴 · 纯 Phaser 实现(不依赖着色器)。
 * 雨滴在窗户矩形区域内从顶部生成,顺玻璃下滑,留下逐渐消失的水痕,
 * 偶尔汇聚成大滴加速。整体叠一层雾感玻璃。
 *
 * 用法(RoomScene):
 *   this.rain = new RainWindow(this, WIN);   // create() 里
 *   this.rain.update(dt);                    // update() 里每帧
 *
 * 坐标用「房间逻辑坐标」传入,内部用 u() 转物理像素。
 */

/* 窗户区域(房间逻辑坐标) */
export interface WindowRect {
  x: number;      // 左上 x
  y: number;      // 左上 y
  w: number;      // 宽
  h: number;      // 高
}

/* ===== 参数:调这里改效果 ===== */
const DROP_COUNT = 34;        // 同时存在的雨滴数
const MIN_SPEED = 40;         // 最慢下滑速度(逻辑像素/秒)
const MAX_SPEED = 150;        // 最快
const MIN_R = 1.2;            // 雨滴最小半径
const MAX_R = 3.0;            // 雨滴最大半径
const TRAIL_FADE = 0.9;       // 水痕消退速度(越大消得越快)
const GLASS_FOG = 0.10;       // 玻璃雾感透明度

interface Drop {
  x: number;
  y: number;
  r: number;
  speed: number;
  wobble: number;    // 左右微晃相位
  trail: number;     // 当前水痕长度
}

export class RainWindow {
  private scene: Phaser.Scene;
  private rect: WindowRect;
  private g: Phaser.GameObjects.Graphics;
  private fog: Phaser.GameObjects.Graphics;
  private drops: Drop[] = [];

  constructor(scene: Phaser.Scene, rect: WindowRect) {
    this.scene = scene;
    this.rect = rect;

    /* 玻璃雾层:一层淡淡的冷色,叠在窗户上制造"隔着玻璃"感 */
    this.fog = scene.add.graphics().setDepth(50);
    this.fog.fillStyle(0xaac4e0, GLASS_FOG);
    this.fog.fillRect(u(rect.x), u(rect.y), u(rect.w), u(rect.h));

    /* 雨滴绘制层 */
    this.g = scene.add.graphics().setDepth(51);

    /* 初始化雨滴,随机分布在窗户里 */
    for (let i = 0; i < DROP_COUNT; i++) {
      this.drops.push(this.spawn(true));
    }
  }

  private spawn(anywhere = false): Drop {
    return {
      x: this.rect.x + Math.random() * this.rect.w,
      y: anywhere
        ? this.rect.y + Math.random() * this.rect.h
        : this.rect.y - Math.random() * 20,
      r: MIN_R + Math.random() * (MAX_R - MIN_R),
      speed: MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED),
      wobble: Math.random() * Math.PI * 2,
      trail: 0,
    };
  }

  update(dt: number): void {
    this.g.clear();

    for (const d of this.drops) {
      /* 大滴掉得快(重力感);顺带轻微左右晃 */
      d.y += d.speed * dt * (0.6 + d.r / MAX_R);
      d.wobble += dt * 2;
      d.x += Math.sin(d.wobble) * 0.15;

      /* 水痕:滑动时拉长,停下时消退 */
      d.trail = Math.min(d.trail + d.speed * dt * 0.5, 40);
      d.trail *= (1 - TRAIL_FADE * dt);

      const px = u(d.x);
      const py = u(d.y);
      const pr = u(d.r);

      /* 画身后的水痕(一条渐隐的细线) */
      if (d.trail > 2) {
        this.g.lineStyle(u(d.r * 0.7), 0xbfd8f0, 0.18);
        this.g.lineBetween(px, py - u(d.trail), px, py);
      }

      /* 画雨滴主体(半透明水珠 + 一点高光) */
      this.g.fillStyle(0xdcecfb, 0.55);
      this.g.fillCircle(px, py, pr);
      this.g.fillStyle(0xffffff, 0.5);
      this.g.fillCircle(px - pr * 0.3, py - pr * 0.3, pr * 0.35);

      /* 滑出窗户底部 → 重置到顶部 */
      if (d.y > this.rect.y + this.rect.h) {
        Object.assign(d, this.spawn(false));
      }
    }
  }

  destroy(): void {
    this.g.destroy();
    this.fog.destroy();
  }
}