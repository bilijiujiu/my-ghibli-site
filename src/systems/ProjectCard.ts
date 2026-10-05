import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import type { Project } from '../config/projects';

/**
 * 项目卡片:一张用胶带贴着的纸。
 * 结构固定 —— 标题 / 身份 / 问题 / 我做了什么 / 结果 / 技术标签 / 链接按钮,
 * 招聘方扫一眼就知道往哪看。结果还是 TODO 的不显示,访客看不到占位文字。
 */

const PAPER = 0xf3e8d2, INK = 0x3a2a1a;
const C_INK = '#3a2a1a', C_SOFT = '#7a6a52', C_ACCENT = '#9a5b34';
const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"Nunito", sans-serif';

export class ProjectCard {
  private scene: Phaser.Scene;
  private scrim?: Phaser.GameObjects.Rectangle;
  private root?: Phaser.GameObjects.Container;
  isOpen = false;

  constructor(scene: Phaser.Scene) { this.scene = scene; }

  open(p: Project): void {
    if (this.isOpen) return;
    this.isOpen = true;
    const s = this.scene;
    const cw = u(600), pad = u(46);
    const innerW = cw - pad * 2;

    this.scrim = s.add.rectangle(W / 2, H / 2, W, H, 0x0a0806, 0.72)
      .setScrollFactor(0).setDepth(3000).setInteractive();
    this.scrim.on('pointerdown', () => this.close());
    this.root = s.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(3001);

    /* 先排文字,算出总高度,再画纸 */
    const items: Phaser.GameObjects.GameObject[] = [];
    let y = 0;
    const add = (t: Phaser.GameObjects.Text, gapAfter: number) => {
      t.setPosition(-innerW / 2, y); items.push(t); y += t.height + gapAfter;
    };
    const txt = (str: string, size: number, color: string, font = SANS, extra: object = {}) =>
      s.add.text(0, 0, str, { fontFamily: font, fontSize: `${size * SCALE}px`, color,
        wordWrap: { width: innerW, useAdvancedWrap: true }, lineSpacing: u(4), ...extra });
    const header = (str: string) => add(txt(str.toUpperCase(), 11.5, C_ACCENT, SANS,
      { fontStyle: 'bold', letterSpacing: u(2) } as any), u(6));

    add(txt(p.title, 34, C_INK, SERIF, { fontStyle: 'bold' }), u(2));
    add(txt(p.meta, 13, C_SOFT, SANS, { fontStyle: 'italic' }), u(18));
    header('The problem');
    add(txt(p.problem, 14, C_INK), u(16));
    header('What I did');
    for (const d of p.did) add(txt('•  ' + d, 13.5, C_INK), u(6));
    y += u(10);
    if (!p.result.startsWith('TODO')) {
      header('Result');
      add(txt(p.result, 14, C_INK), u(16));
    }
    /* 技术标签:一排小胶囊 */
    let tx = -innerW / 2;
    const chipY = y;
    for (const tag of p.tags) {
      const t = txt(tag, 11.5, C_INK);
      const w = t.width + u(18);
      if (tx + w > innerW / 2) { tx = -innerW / 2; y += u(30); }
      const bg = s.add.graphics();
      bg.fillStyle(0xe2d2b0, 1).fillRoundedRect(tx, y, w, u(24), u(12));
      bg.lineStyle(u(1.2), INK, 0.5).strokeRoundedRect(tx, y, w, u(24), u(12));
      t.setPosition(tx + u(9), y + u(4));
      items.push(bg, t);
      tx += w + u(8);
    }
    if (p.tags.length) y += u(24) + u(18);
    void chipY;
    /* 链接按钮 */
    let bx = -innerW / 2;
    for (const l of p.links) {
      const t = txt(l.label + '  →', 13, '#f3e8d2', SANS, { fontStyle: 'bold' });
      const w = t.width + u(30);
      const btn = s.add.graphics();
      btn.fillStyle(0x5a3a22, 1).fillRoundedRect(bx, y, w, u(34), u(6));
      t.setPosition(bx + u(15), y + u(7));
      const hit = s.add.rectangle(bx + w / 2, y + u(17), w, u(34), 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', (_p: any, _x: any, _y: any, ev: any) => {
        ev?.stopPropagation?.();
        window.open(l.url, '_blank', 'noopener');
      });
      items.push(btn, t, hit);
      bx += w + u(12);
    }
    if (p.links.length) y += u(34);

    const ch = y + pad * 2;
    const top = -ch / 2;
    /* 纸:投影 → 纸面 → 内框细线 → 墨线外框 → 两角胶带 */
    const paper = s.add.graphics();
    paper.fillStyle(0x000000, 0.35).fillRect(-cw / 2 + u(10), top + u(14), cw, ch);
    paper.fillStyle(PAPER, 1).fillRect(-cw / 2, top, cw, ch);
    paper.lineStyle(u(1), INK, 0.25).strokeRect(-cw / 2 + u(14), top + u(14), cw - u(28), ch - u(28));
    paper.lineStyle(u(2), INK, 1).strokeRect(-cw / 2, top, cw, ch);
    for (const sx of [-1, 1]) {
      const tape = s.add.rectangle(sx * (cw / 2 - u(30)), top + u(4), u(90), u(26), 0xe8dcb8, 0.85)
        .setRotation(sx * 0.6).setStrokeStyle(u(1), INK, 0.25);
      items.push(tape);
    }
    /* 关闭 × */
    const x = txt('×', 26, C_SOFT);
    x.setPosition(cw / 2 - u(40), top + u(10));
    x.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close());

    /* 文字整体平移到纸里 */
    for (const it of items) {
      const o = it as any;
      if (o.type === 'Graphics') o.y += top + pad;
      else o.y += top + pad;
    }
    this.root.add([paper, ...items, x]);
    this.root.setRotation(-0.012).setScale(0.94).setAlpha(0);
    s.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });

    s.input.keyboard?.once('keydown-ESC', () => this.close());
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    const root = this.root, scrim = this.scrim;
    this.scene.tweens.add({ targets: root, alpha: 0, scale: 0.96, duration: 180,
      onComplete: () => { root?.destroy(); scrim?.destroy(); } });
  }
}
