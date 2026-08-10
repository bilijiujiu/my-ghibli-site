import Phaser from 'phaser';

/**
 * 柔和光晕。
 *
 * 别用 scene.add.circle() 当光晕 —— 那画出来是**实心圆**:整块均匀的不透明度、
 * 一圈硬边。叠上 ADD 混合就是一片边界清晰的光斑,半径大的时候那道弧看着就是一条直边,
 * 画面上会平白多出几道谁也解释不了的分界线。
 *
 * 这里在运行时用 canvas 画一张径向渐变当纹理,所有光晕共用它,
 * 再靠 tint 上色、displaySize 定大小。不占额外资源,边缘是真的渐隐。
 */

const KEY = 'soft_glow';
const SIZE = 256;

function ensure(scene: Phaser.Scene): string {
  if (scene.textures.exists(KEY)) return KEY;
  const tex = scene.textures.createCanvas(KEY, SIZE, SIZE);
  if (!tex) return KEY;
  const ctx = tex.getContext();
  const r = SIZE / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  /* 中间实、外圈快速掉下去:比线性渐变更像真实的光衰减(大致按平方反比) */
  g.addColorStop(0.00, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.40, 'rgba(255,255,255,0.32)');
  g.addColorStop(0.68, 'rgba(255,255,255,0.09)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  tex.refresh();
  return KEY;
}

/** 加一团光。rx/ry 是半径(ry 省略则是正圆)。 */
export function addGlow(scene: Phaser.Scene, x: number, y: number,
                        rx: number, color: number, alpha: number,
                        ry?: number): Phaser.GameObjects.Image {
  const img = scene.add.image(x, y, ensure(scene));
  img.setDisplaySize(rx * 2, (ry ?? rx) * 2);
  img.setTint(color).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD);
  return img;
}
