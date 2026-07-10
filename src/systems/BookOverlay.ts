import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 翻开的书 · 铺满大半屏,展示简历。
 * 底图 book_open.png 是真实美术图,文字按页面比例落进两页留白。
 *
 * 用法:
 *   this.book = new BookOverlay(this);   // 在 create() 里
 *   this.book.open();                    // 书架交互时
 *   this.book.isOpen / this.book.close()
 *
 * 底图需放在 public/book_open.png,并在场景 preload() 里:
 *   this.load.image('book_open', '/book_open.png');
 */

/* ===== 书占屏幕高度的比例 ===== */
const BOOK_SCREEN_H_RATIO = 1.22;   // 书高 = 屏幕高 × 这个值

/* ===== 底图里两页留白区的边界(相对底图的 0~1 比例,先估,跑起来再调) ===== */
const AREA = {
  leftX: 0.13,        // 左页文字左边界
  centerX: 0.50,      // 中缝
  rightEnd: 0.88,     // 右页文字右边界
  padTop: 0.18,       // 顶部留白
};

const INK = '#3a2f22';
const INK_SOFT = '#6b5c48';
const ACCENT = '#9a5b34';
const FONT = '"Nunito", sans-serif';

export class BookOverlay {
  private scene: Phaser.Scene;
  private root!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  private bookImg!: Phaser.GameObjects.Image;
  private bookW = 0;
  private bookH = 0;
  isOpen = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    /* 遮罩:压暗整个游戏世界,点击关闭 */
    this.scrim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x140d06, 0.7)
      .setScrollFactor(0).setDepth(2000).setInteractive();
    this.scrim.on('pointerdown', () => this.close());

    this.root = this.scene.add.container(W / 2, H / 2)
      .setScrollFactor(0).setDepth(2001);

    /* 书本底图:按屏幕高度比例缩放 */
    this.bookImg = this.scene.add.image(0, 0, 'book_open').setOrigin(0.5, 0.5);
    const targetH = H * BOOK_SCREEN_H_RATIO;
    const scale = targetH / this.bookImg.height;
    this.bookImg.setScale(scale);
    this.bookW = this.bookImg.displayWidth;
    this.bookH = this.bookImg.displayHeight;
    this.root.add(this.bookImg);

    this.drawLeftPage();
    this.drawRightPage();

    /* 弹出动画 */
    this.root.setScale(0.9).setAlpha(0);
    this.scene.tweens.add({
      targets: this.root, scale: 1, alpha: 1,
      duration: 280, ease: 'Back.easeOut',
    });
    this.scrim.setAlpha(0);
    this.scene.tweens.add({ targets: this.scrim, alpha: 0.7, duration: 220 });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.scene.tweens.add({
      targets: this.root, scale: 0.92, alpha: 0,
      duration: 180, ease: 'Quad.easeIn',
      onComplete: () => this.root.destroy(),
    });
    this.scene.tweens.add({
      targets: this.scrim, alpha: 0,
      duration: 180, onComplete: () => this.scrim.destroy(),
    });
  }

  /* ---- 坐标换算:把「底图比例」转成「容器内像素」 ---- */
  private px(ratioX: number): number {
    return (ratioX - 0.5) * this.bookW;
  }
  private py(ratioY: number): number {
    return (ratioY - 0.5) * this.bookH;
  }

  /* ---- 文字辅助 ---- */
  private sectionHeader(text: string, x: number, y: number, wRatio: number): number {
    const t = this.scene.add.text(this.px(x), this.py(y), text.toUpperCase(),
      { fontFamily: FONT, fontSize: `${13 * SCALE}px`, fontStyle: 'bold', color: ACCENT });
    this.root.add(t);
    const g = this.scene.add.graphics();
    g.lineStyle(u(1.5), 0x9a5b34, 0.5);
    g.lineBetween(this.px(x), this.py(y) + u(20), this.px(x + wRatio), this.py(y) + u(20));
    this.root.add(g);
    return y + 0.05;
  }

  private line(text: string, x: number, y: number, wRatio: number, opts?: {
    soft?: boolean; size?: number; bold?: boolean;
  }): number {
    const size = opts?.size ?? 14;
    const t = this.scene.add.text(this.px(x), this.py(y), text, {
      fontFamily: FONT, fontSize: `${size * SCALE}px`,
      color: opts?.soft ? INK_SOFT : INK,
      fontStyle: opts?.bold ? 'bold' : 'normal',
      wordWrap: { width: this.bookW * wRatio },
      lineSpacing: u(3),
    });
    this.root.add(t);
    return y + (t.height / this.bookH) + 0.018;
  }

  /* ---- 左页:简介 + 联系方式(占位) ---- */
  private drawLeftPage(): void {
    const x = AREA.leftX;
    const w = AREA.centerX - AREA.leftX - 0.04;
    let y = AREA.padTop;

    y = this.line('Your Name', x, y, w, { size: 22, bold: true });
    y = this.line('Product Designer · New Grad', x, y, w, { soft: true });
    y += 0.03;
    y = this.sectionHeader('About', x, y, w);
    y = this.line('两三句自我简介占位。谁、做什么、找什么方向。', x, y, w);
    y += 0.03;
    y = this.sectionHeader('Contact', x, y, w);
    y = this.line('your@email.com', x, y, w, { soft: true });
    y = this.line('yoursite.com', x, y, w, { soft: true });
    y = this.line('linkedin.com/in/you', x, y, w, { soft: true });
  }

  /* ---- 右页:经历 + 技能(占位) ---- */
  private drawRightPage(): void {
    const x = AREA.centerX + 0.03;
    const w = AREA.rightEnd - AREA.centerX - 0.04;
    let y = AREA.padTop;

    y = this.line('Experience', x, y, w, { size: 22, bold: true });
    y += 0.02;
    y = this.line('公司 / 职位', x, y, w, { bold: true });
    y = this.line('2024 — Present', x, y, w, { soft: true, size: 12 });
    y = this.line('· 一句话成果占位。', x, y, w, { size: 13 });
    y = this.line('· 第二条成果占位。', x, y, w, { size: 13 });
    y += 0.03;
    y = this.sectionHeader('Skills', x, y, w);
    y = this.line('Figma · Prototyping · Design Systems', x, y, w, { soft: true });
    y = this.line('User Research · UI', x, y, w, { soft: true });
  }
}