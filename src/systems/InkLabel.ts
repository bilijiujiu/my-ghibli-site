import Phaser from 'phaser';
import { u, SCALE } from '../config/constants';

/**
 * 悬停时浮现的手写感标签:没有底框,
 * 暖色衬线斜体 + 柔和暗影 + 一笔墨线下划线,像灯光下写在画上的字。
 */
export function addInkLabel(
  scene: Phaser.Scene, x: number, y: number, text: string, size = 22,
): Phaser.GameObjects.Container {
  const label = scene.add.text(0, 0, text, {
    fontFamily: '"Cormorant Garamond", serif',
    fontStyle: 'italic bold',
    fontSize: `${size * SCALE}px`,
    color: '#f7e8c6',
    shadow: { offsetX: 0, offsetY: u(1), color: 'rgba(28,16,6,0.95)', blur: u(10), fill: true },
  }).setOrigin(0.5, 1);

  /* 手绘感下划线:中间粗两头细,微微起伏 */
  const w = label.width * 0.82;
  const line = scene.add.graphics();
  line.fillStyle(0xe9c88a, 0.85);
  const steps = 24;
  const top: Phaser.Math.Vector2[] = [];
  const bot: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = -w / 2 + t * w;
    const py = u(3) + Math.sin(t * Math.PI * 1.3 + 0.4) * u(1.2);
    const th = Math.sin(t * Math.PI) * u(1.6) + u(0.3);
    top.push(new Phaser.Math.Vector2(px, py - th / 2));
    bot.unshift(new Phaser.Math.Vector2(px, py + th / 2));
  }
  line.fillPoints([...top, ...bot], true);
  line.setScale(0, 1);

  const c = scene.add.container(x, y, [label, line]).setAlpha(0);
  c.setData('line', line);
  c.setData('baseY', y);
  return c;
}

export function showInkLabel(scene: Phaser.Scene, c: Phaser.GameObjects.Container, show: boolean): void {
  const line = c.getData('line') as Phaser.GameObjects.Graphics;
  const baseY = c.getData('baseY') as number;
  scene.tweens.killTweensOf([c, line]);
  scene.tweens.add({ targets: c, alpha: show ? 1 : 0, y: show ? baseY - u(6) : baseY,
    duration: show ? 260 : 180, ease: 'Sine.easeOut' });
  scene.tweens.add({ targets: line, scaleX: show ? 1 : 0,
    duration: show ? 420 : 150, delay: show ? 80 : 0, ease: 'Cubic.easeOut' });
}
