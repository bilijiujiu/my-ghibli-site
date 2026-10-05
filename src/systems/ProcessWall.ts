import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { PROCESS } from '../config/projects';

/**
 * 软木板 ·"这个网站是怎么做出来的"。
 * 左边一列钉着三张照片(云 / 窗 / 火),点哪张,右边就换成那组的改前改后对比:
 * 拖中间的把手(或直接在图上点),左边露出改前、右边是改后。下面一段话讲用了什么方法。
 *
 * 图片:public/process/{id}_before.webp 和 {id}_after.webp(由制作过程的截图生成)。
 * preload 里调 ProcessWall.preload(scene)。
 */

const SANS = '"Nunito", sans-serif';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const INK = 0x2a1c12;

export class ProcessWall {
  private scene: Phaser.Scene;
  private scrim?: Phaser.GameObjects.Rectangle;
  private root?: Phaser.GameObjects.Container;
  private view?: Phaser.GameObjects.Container;
  private pins: Phaser.GameObjects.Container[] = [];
  private current = 0;
  isOpen = false;

  static preload(scene: Phaser.Scene): void {
    for (const p of PROCESS) {
      scene.load.image(`proc_${p.id}_before`, `/process/${p.id}_before.webp`);
      scene.load.image(`proc_${p.id}_after`, `/process/${p.id}_after.webp`);
    }
  }

  constructor(scene: Phaser.Scene) { this.scene = scene; }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    const s = this.scene;
    this.scrim = s.add.rectangle(W / 2, H / 2, W, H, 0x0a0806, 0.75)
      .setScrollFactor(0).setDepth(3000).setInteractive();
    this.scrim.on('pointerdown', () => this.close());
    this.root = s.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(3001);

    /* 软木板:木框 + 软木面 + 颗粒 */
    const bw = W * 0.86, bh = H * 0.88;
    const board = s.add.graphics();
    board.fillStyle(0x000000, 0.4).fillRect(-bw / 2 + u(12), -bh / 2 + u(16), bw, bh);
    board.fillStyle(0x5a3a22, 1).fillRect(-bw / 2, -bh / 2, bw, bh);
    board.fillStyle(0xb88a58, 1).fillRect(-bw / 2 + u(18), -bh / 2 + u(18), bw - u(36), bh - u(36));
    const rng = new Phaser.Math.RandomDataGenerator(['cork']);
    for (let i = 0; i < 1400; i++) {
      board.fillStyle(rng.pick([0x9c7244, 0xc99a66, 0xa47a4a]), 0.8);
      board.fillCircle(rng.between(-bw / 2 + u(20), bw / 2 - u(20)), rng.between(-bh / 2 + u(20), bh / 2 - u(20)), u(1.4));
    }
    board.lineStyle(u(3), INK, 1).strokeRect(-bw / 2, -bh / 2, bw, bh);
    /* 拦一下:点在板上不要关掉 */
    const block = s.add.rectangle(0, 0, bw, bh, 0xffffff, 0.001).setInteractive();
    this.root.add([board, block]);

    const title = s.add.text(-bw / 2 + u(50), -bh / 2 + u(36), 'How this site was made', {
      fontFamily: SERIF, fontSize: `${30 * SCALE}px`, color: '#2a1c12', fontStyle: 'bold' });
    const sub = s.add.text(-bw / 2 + u(52), -bh / 2 + u(76), 'Pick a photo, then drag the handle: before ← → after', {
      fontFamily: SANS, fontSize: `${13 * SCALE}px`, color: '#4a3424' });
    this.root.add([title, sub]);

    /* 左列:三张拍立得 */
    this.pins = PROCESS.map((p, i) => {
      const c = s.add.container(-bw / 2 + u(150), -bh / 2 + u(205) + i * u(148));
      const tw = u(172);
      const img = s.add.image(0, 0, `proc_${p.id}_after`);
      img.setScale(tw / img.width);
      if (img.displayHeight > u(88)) img.setCrop(0, (img.height - u(88) / img.scaleY) / 2, img.width, u(88) / img.scaleY);
      const frame = s.add.rectangle(0, u(8), tw + u(16), u(88) + u(42), 0xf6f1e6).setStrokeStyle(u(1.5), INK, 0.6);
      const label = s.add.text(0, u(52), p.title.split(':')[0], {
        fontFamily: SANS, fontSize: `${13 * SCALE}px`, color: '#2a1c12', fontStyle: 'bold' }).setOrigin(0.5, 0.5);
      const pin = s.add.circle(0, -u(46), u(7), 0xc0392b).setStrokeStyle(u(1.5), INK);
      c.add([frame, img, label, pin]);
      c.setRotation([-0.05, 0.035, -0.02][i]);
      c.setSize(tw + u(16), u(135)).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => this.show(i));
      return c;
    });
    this.root.add(this.pins);

    this.root.setAlpha(0).setScale(0.96);
    s.tweens.add({ targets: this.root, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.show(0);
    s.input.keyboard?.once('keydown-ESC', () => this.close());
  }

  /** 右侧换成第 i 组的改前改后 */
  private show(i: number): void {
    const s = this.scene;
    this.current = i;
    this.pins.forEach((p, k) => p.setAlpha(k === i ? 1 : 0.6).setScale(k === i ? 1.04 : 1));
    this.view?.destroy();
    const bw = W * 0.86, bh = H * 0.88;
    /* 右侧可用区 */
    const ax = -bw / 2 + u(290), aw = bw / 2 - u(50) - ax;
    const ay = -bh / 2 + u(110), ah = bh - u(110) - u(150);
    const P = PROCESS[i];
    const before = s.add.image(0, 0, `proc_${P.id}_before`);
    const after = s.add.image(0, 0, `proc_${P.id}_after`);
    const sc = Math.min(aw / before.width, ah / before.height);
    const vw = before.width * sc, vh = before.height * sc;
    const cx = ax + aw / 2, cy = ay + ah / 2;
    for (const im of [before, after]) im.setScale(sc).setPosition(cx, cy);
    this.view = s.add.container(0, 0);

    const frame = s.add.rectangle(cx, cy, vw + u(20), vh + u(20), 0xf6f1e6).setStrokeStyle(u(2), INK, 0.8);
    const handleLine = s.add.rectangle(cx, cy, u(4), vh, 0xffffff);
    const knob = s.add.circle(cx, cy, u(20), 0xffffff).setStrokeStyle(u(2), INK);
    const arrows = s.add.text(cx, cy, '‹ ›', { fontFamily: SANS, fontSize: `${16 * SCALE}px`, color: '#2a1c12', fontStyle: 'bold' }).setOrigin(0.5);
    const chip = (str: string, x: number, ox: number) => s.add.text(x, cy - vh / 2 + u(14), str, {
      fontFamily: SANS, fontSize: `${12 * SCALE}px`, color: '#ffffff', fontStyle: 'bold',
      backgroundColor: 'rgba(20,14,10,0.7)', padding: { x: u(8), y: u(4) } }).setOrigin(ox, 0);
    const lb = chip('BEFORE', cx - vw / 2 + u(14), 0), la = chip('AFTER', cx + vw / 2 - u(14), 1);

    const caption = s.add.text(ax, ay + ah + u(28), P.title, {
      fontFamily: SERIF, fontSize: `${22 * SCALE}px`, color: '#2a1c12', fontStyle: 'bold' });
    const body = s.add.text(ax, ay + ah + u(62), P.caption, {
      fontFamily: SANS, fontSize: `${13.5 * SCALE}px`, color: '#2a1c12', lineSpacing: u(4),
      wordWrap: { width: aw, useAdvancedWrap: true } });

    /* 把手位置 f(0..1):左边露改前,右边露改后 */
    const setF = (f: number) => {
      f = Phaser.Math.Clamp(f, 0, 1);
      const x0 = after.width * f;
      after.setCrop(x0, 0, after.width - x0, after.height);
      const hx = cx - vw / 2 + vw * f;
      handleLine.x = hx; knob.x = hx; arrows.x = hx;
    };
    setF(0.5);

    const zone = s.add.rectangle(cx, cy, vw, vh, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    let drag = false;
    const toF = (p: Phaser.Input.Pointer) => (p.x - (W / 2 + cx - vw / 2)) / vw;
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => { drag = true; setF(toF(p)); });
    s.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (drag && this.isOpen) setF(toF(p)); });
    s.input.on('pointerup', () => { drag = false; });

    /* 进来先自动"擦"一下,告诉人这是能拖的 */
    const demo = { f: 0.85 };
    s.tweens.add({ targets: demo, f: 0.5, duration: 900, ease: 'Sine.easeInOut', onUpdate: () => setF(demo.f) });

    this.view.add([frame, before, after, handleLine, knob, arrows, lb, la, caption, body, zone]);
    this.root!.add(this.view);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    const root = this.root, scrim = this.scrim;
    this.scene.tweens.add({ targets: root, alpha: 0, duration: 180,
      onComplete: () => { root?.destroy(); scrim?.destroy(); } });
    this.view = undefined;
    this.pins = [];
  }
}
