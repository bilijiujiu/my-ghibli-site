import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * Open book overlay that fills most of the screen and shows the resume. Multiple spreads; click the edges to turn pages.
 * Background is book_open.png; text is placed in the blank areas of both pages using page-relative ratios.
 *
 * Usage:
 *   this.book = new BookOverlay(this);
 *   this.book.open(); / this.book.isOpen / this.book.close()
 * preload: this.load.image('book_open', '/book_open.png');
 *
 * Page turning: click the outer edge of the right page for the next spread, the left page for the previous one.
 */

const BOOK_SCREEN_H_RATIO = 0.92;

const AREA = {
  leftX: 0.14,        // left edge of left-page text (inset away from the binding frame)
  centerX: 0.50,
  rightEnd: 0.86,     // right edge of right-page text (inset)
  padTop: 0.16,       // top padding (keeps titles clear of the frame)
};

const INK = '#4a3826';       // old ink brown, a little lighter and softer
const INK_SOFT = '#7a6a52';  // secondary text
const ACCENT = '#9a5b34';    // warm brown for section titles
const FONT = '"Cormorant Garamond", Georgia, serif';        // serif, to match the old book
const FONT_H = '"Cormorant Garamond", Georgia, serif';      // same serif for headings

/* One line of content */
type Line =
  | { t: 'title'; s: string }
  | { t: 'sub'; s: string }
  | { t: 'header'; s: string }
  | { t: 'text'; s: string; soft?: boolean; size?: number; bold?: boolean }
  | { t: 'gap'; h?: number };

/* One spread = left page + right page */
interface Spread {
  left: Line[];
  right: Line[];
}

/* ===== Resume content: each Spread is a pair of open pages ===== */
const SPREADS: Spread[] = [
  /* Spread 1: name + contact | education + skills */
  {
    left: [
      { t: 'title', s: 'Harry Han' },
      { t: 'sub', s: 'Informatics Student · University of Washington' },
      { t: 'gap' },
      { t: 'header', s: 'Contact' },
      { t: 'text', s: 'hanzong@uw.edu', soft: true },
      { t: 'text', s: 'Seattle, WA', soft: true },
      { t: 'gap' },
      { t: 'header', s: 'Languages' },
      { t: 'text', s: 'English · Mandarin Chinese', soft: true },
    ],
    right: [
      { t: 'title', s: 'Education' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'B.S. in Informatics', bold: true },
      { t: 'text', s: 'University of Washington, Seattle', size: 13 },
      { t: 'text', s: 'Expected Dec 2026', soft: true, size: 12 },
      { t: 'gap' },
      { t: 'header', s: 'Skills' },
      { t: 'text', s: 'Python · SQL · JavaScript · Java · R', soft: true, size: 13 },
      { t: 'text', s: 'React · HTML/CSS · Firebase · Shopify', soft: true, size: 13 },
      { t: 'text', s: 'Figma · GitHub · Excel · Blender', soft: true, size: 13 },
      { t: 'text', s: 'Data & Funnel Analysis · Product Mgmt', soft: true, size: 13 },
      { t: 'text', s: 'UI/UX Design · Info Architecture', soft: true, size: 13 },
    ],
  },
  /* Spread 2: most recent and relevant experience */
  {
    left: [
      { t: 'title', s: 'Experience' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'SuperAutoUSA', bold: true },
      { t: 'text', s: 'Product Manager & Front-End Developer · 2026–Present', soft: true, size: 12 },
      { t: 'text', s: '· Led storefront features for a Shopify auto parts store, from requirements to launch.', size: 13 },
      { t: 'text', s: '· Traced ~71% of sessions to bot traffic, showing a reported 78% conversion drop was mostly noise.', size: 13 },
      { t: 'text', s: '· Built a fitment-finder landing page and a "Shop By Brand" search in HTML, CSS and JavaScript.', size: 13 },
    ],
    right: [
      { t: 'title', s: ' ' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'Funcience Semiconductor', bold: true },
      { t: 'text', s: 'Web & 3D Design Intern · 2025', soft: true, size: 12 },
      { t: 'text', s: '· Built and maintained the company website with HTML, CSS and JavaScript, focused on UX and accessibility.', size: 13 },
      { t: 'text', s: '· Created 3D chip and package models in SolidWorks and Blender for product decks.', size: 13 },
      { t: 'text', s: '· Aligned site content with technical specs across engineering and marketing teams.', size: 13 },
    ],
  },
  /* Spread 3: more experience */
  {
    left: [
      { t: 'title', s: 'Experience' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'UW CSSA', bold: true },
      { t: 'text', s: 'Finance & Fundraising Officer · 2023–Present', soft: true, size: 12 },
      { t: 'text', s: '· Raised over $20,000 in sponsorship for student events.', size: 13 },
      { t: 'text', s: '· Built lasting partnerships with local businesses and corporate sponsors.', size: 13 },
      { t: 'text', s: '· Organized large-scale cultural events with the executive board.', size: 13 },
    ],
    right: [
      { t: 'title', s: ' ' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'Hejun Consulting', bold: true },
      { t: 'text', s: 'Consulting Intern · 2022', soft: true, size: 12 },
      { t: 'text', s: '· Cleaned and organized logistics data supporting a cold-chain business plan.', size: 13 },
      { t: 'text', s: '· Conducted market research feeding into client-facing recommendations.', size: 13 },
      { t: 'text', s: '· Joined client meetings and supported stakeholder communication.', size: 13 },
    ],
  },
  /* Spread 4: projects */
  {
    left: [
      { t: 'title', s: 'Projects' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'Husky Share', bold: true },
      { t: 'text', s: 'Campus Item-Sharing Web App · INFO 442', soft: true, size: 12 },
      { t: 'text', s: '· Built with a 5-person team: UW students lend, sell and give away items on a campus map.', size: 13 },
      { t: 'text', s: '· Set up the React app and Firestore database, and built photo upload with Firebase Storage.', size: 13 },
      { t: 'text', s: '· Shipped work through GitHub issues, milestones and pull requests.', size: 13 },
    ],
    right: [
      { t: 'title', s: ' ' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'JobTrack', bold: true },
      { t: 'text', s: 'Job Application Tracking Platform', soft: true, size: 12 },
      { t: 'text', s: '· Designed and built a responsive job-tracking site with HTML, CSS, JavaScript and React concepts.', size: 13 },
      { t: 'text', s: '· Implemented interactive search, filtering and application status tracking.', size: 13 },
      { t: 'text', s: '· Focused on clean information hierarchy and usability.', size: 13 },
    ],
  },
];

export class BookOverlay {
  private scene: Phaser.Scene;
  private root!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  private bookImg!: Phaser.GameObjects.Image;
  private pageLayer!: Phaser.GameObjects.Container;   // holds the current spread's text; replaced on page turn
  private bookW = 0;
  private bookH = 0;
  private index = 0;
  private flipping = false;
  isOpen = false;

  /* Magic pen writing */
  private pen: Phaser.GameObjects.Container | null = null;
  private writeTweens: Phaser.Tweens.Tween[] = [];
  private writing = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.index = 0;

    this.scrim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x140d06, 0.7)
      .setScrollFactor(0).setDepth(2000).setInteractive();
    /* All clicks are routed here by position: arrows → turn page / inside book → nothing / outside → close */
    this.scrim.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const dx = p.x - W / 2;
      const dy = p.y - H / 2;
      const ax = this.bookW * 0.44;
      const hitR = u(60);
      /* Left arrow hit area */
      if (Math.hypot(dx + ax, dy) < hitR) { this.flip(-1); return; }
      /* Right arrow hit area */
      if (Math.hypot(dx - ax, dy) < hitR) { this.flip(1); return; }
      /* Inside the book: skip the writing animation if it is running, otherwise do nothing */
      if (Math.abs(dx) < this.bookW / 2 && Math.abs(dy) < this.bookH / 2) {
        if (this.writing) this.finishWriting();
        return;
      }
      /* Outside the book: close */
      this.close();
    });

    this.root = this.scene.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(2001);

    this.bookImg = this.scene.add.image(0, 0, 'book_open').setOrigin(0.5, 0.5);
    const targetH = H * BOOK_SCREEN_H_RATIO;
    const scale = targetH / this.bookImg.height;
    this.bookImg.setScale(scale);
    this.bookW = this.bookImg.displayWidth;
    this.bookH = this.bookImg.displayHeight;
    this.root.add(this.bookImg);

    /* Page number */
    this.pageNum = this.scene.add.text(0, this.py(0.97), '', {
      fontFamily: FONT, fontSize: `${13 * SCALE}px`, color: INK_SOFT,
    }).setOrigin(0.5);
    this.root.add(this.pageNum);

    this.pageLayer = this.scene.add.container(0, 0);
    this.root.add(this.pageLayer);

    /* Create arrows first (renderSpread calls updateArrows) */
    this.buildFlipZones();

    this.renderSpread();

    /* Bring arrows to the top */
    this.root.bringToTop(this.arrowL);
    this.root.bringToTop(this.arrowR);

    this.root.setScale(0.9).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
    this.scrim.setAlpha(0);
    this.scene.tweens.add({ targets: this.scrim, alpha: 0.7, duration: 220 });
  }

  private pageNum!: Phaser.GameObjects.Text;

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stopWriting();
    this.scene.tweens.add({
      targets: this.root, scale: 0.92, alpha: 0, duration: 180, ease: 'Quad.easeIn',
      onComplete: () => this.root.destroy(),
    });
    this.scene.tweens.add({
      targets: this.scrim, alpha: 0, duration: 180, onComplete: () => this.scrim.destroy(),
    });
  }

  private arrowL!: Phaser.GameObjects.Text;
  private arrowR!: Phaser.GameObjects.Text;

  /* Page-turn arrows (display only; clicks are routed by the scrim) */
  private buildFlipZones(): void {
    const ax = this.bookW * 0.44;

    this.arrowL = this.scene.add.text(-ax, 0, '‹', {
      fontFamily: 'Georgia, serif', fontSize: `${56 * SCALE}px`, color: '#8a6a44',
    }).setOrigin(0.5);
    this.root.add(this.arrowL);

    this.arrowR = this.scene.add.text(ax, 0, '›', {
      fontFamily: 'Georgia, serif', fontSize: `${56 * SCALE}px`, color: '#8a6a44',
    }).setOrigin(0.5);
    this.root.add(this.arrowR);
  }

  /* Dim or brighten arrows based on the current page */
  private updateArrows(): void {
    if (!this.arrowL) return;
    this.arrowL.setColor('#8a6a44').setAlpha(this.index > 0 ? 1 : 0.25);
    this.arrowR.setColor('#8a6a44').setAlpha(this.index < SPREADS.length - 1 ? 1 : 0.25);
  }

  private flip(dir: number): void {
    if (this.flipping) return;
    const next = this.index + dir;
    if (next < 0 || next >= SPREADS.length) return;
    this.flipping = true;
    this.stopWriting();

    /* Hide old text right away (the new page is rewritten anyway); the page flip hides the moment */
    this.pageLayer.removeAll(true);

    /* Render the new page underneath (text hidden = blank paper), then write after the flip */
    this.index = next;
    this.renderSpread(true);

    this.playFold(dir, () => {
      this.flipping = false;
      this.startWriting();
    });
  }

  /** Page-fold animation using the real paper image (page_paper.png) */
  private playFold(dir: number, onDone: () => void): void {
    const halfW = this.bookW / 2 * 0.74;   // keep the tuned alignment factor
    const pageH = this.bookH * 0.70;

    /* The folding page: real paper image, origin pinned to the spine */
    const fold = this.scene.add.image(0, 0, 'page_paper')
      .setOrigin(dir === 1 ? 0 : 1, 0.5);
    fold.setDisplaySize(halfW, pageH);
    this.root.add(fold);
    const baseScaleX = fold.scaleX;   // remember the horizontal scale when it covers half the book

    /* Fold shadow line (along the spine) */
    const spineShadow = this.scene.add.rectangle(0, 0, u(6), pageH, 0x000000, 0.25)
      .setOrigin(0.5, 0.5);
    this.root.add(spineShadow);

    /* Step 1: fold the page toward the spine (squash + darker tint) */
    this.scene.tweens.add({
      targets: fold, scaleX: 0, duration: 240, ease: 'Quad.easeIn',
      onUpdate: (tw) => {
        const s = Math.round(0xff * (0.65 + 0.35 * (1 - tw.progress)));
        fold.setTint((s << 16) | (s << 8) | s);
      },
      onComplete: () => {
        /* Step 2: unfold on the other side (mirrored so it looks like the back of the page) */
        fold.setOrigin(dir === 1 ? 1 : 0, 0.5);
        fold.setPosition(0, 0);
        fold.setFlipX(true);
        this.scene.tweens.add({
          targets: fold, scaleX: baseScaleX, duration: 240, ease: 'Quad.easeOut',
          onUpdate: (tw) => {
            const s = Math.round(0xff * (0.65 + 0.35 * tw.progress));
            fold.setTint((s << 16) | (s << 8) | s);
          },
          onComplete: () => {
            this.scene.tweens.add({
              targets: [fold, spineShadow], alpha: 0, duration: 150,
              onComplete: () => { fold.destroy(); spineShadow.destroy(); onDone(); },
            });
          },
        });
      },
    });
  }

  /* Render the current spread */
  private renderSpread(skipWrite = false): void {
    this.pageLayer.removeAll(true);
    const sp = SPREADS[this.index];
    this.renderColumn(sp.left, AREA.leftX, AREA.centerX - AREA.leftX - 0.04);
    this.renderColumn(sp.right, AREA.centerX + 0.03, AREA.rightEnd - AREA.centerX - 0.04);
    this.pageNum.setText(`${this.index + 1} / ${SPREADS.length}`);
    this.root.bringToTop(this.pageNum);
    this.updateArrows();
    if (skipWrite) {
      /* While flipping: hide text (crop to 0 width); the flip callback starts the writing */
      const texts = this.pageLayer.list.filter(
        (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text,
      );
      for (const t of texts) t.setCrop(0, 0, 0, t.height);
    } else {
      this.startWriting();
    }
  }

  /* ---------- Magic pen writing ---------- */

  /** Collect all Text on this page and "write" them in order with a crop tween; the pen follows */
  private startWriting(): void {
    this.stopWriting();          // clear leftovers from the previous page
    this.writing = true;

    /* Collect text objects (Text in pageLayer) */
    const texts = this.pageLayer.list.filter(
      (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text,
    );
    if (texts.length === 0) { this.writing = false; return; }

    /* Crop everything to 0 width first (hidden) */
    for (const t of texts) t.setCrop(0, 0, 0, t.height);

    /* Pen: placeholder shape (a thin slanted stick + tip); can be swapped for a quill image later */
    this.pen = this.scene.add.container(0, 0);
    const pg = this.scene.add.graphics();
    pg.lineStyle(u(4), 0x5a3d22, 1);
    pg.lineBetween(0, 0, u(14), -u(34));          // pen body (slanting up and right)
    pg.fillStyle(0x2a1f16, 1);
    pg.fillTriangle(0, 0, u(4), -u(6), -u(3), -u(5)); // pen tip
    this.pen.add(pg);
    this.pageLayer.add(this.pen);

    /* About 1.4s total, split by each line's text width */
    const totalMs = 1400;
    const totalW = texts.reduce((s, t) => s + t.width, 0) || 1;
    let delay = 0;

    for (const t of texts) {
      const dur = Math.max(40, (t.width / totalW) * totalMs);
      const prox = { w: 0 };
      const tw = this.scene.tweens.add({
        targets: prox, w: t.width,
        duration: dur, delay, ease: 'Linear',
        onUpdate: () => {
          t.setCrop(0, 0, prox.w, t.height);
          /* Move the pen tip to the current writing position (line start x + written width, line's vertical middle) */
          if (this.pen) this.pen.setPosition(t.x + prox.w, t.y + t.height * 0.7);
        },
      });
      this.writeTweens.push(tw);
      delay += dur;
    }

    /* Done writing: fade out the pen */
    const done = this.scene.tweens.add({
      targets: {}, x: 0, duration: 1, delay,
      onComplete: () => this.finishWriting(),
    });
    this.writeTweens.push(done);
  }

  /** Skip/finish: show everything and hide the pen */
  private finishWriting(): void {
    for (const tw of this.writeTweens) tw.stop();
    this.writeTweens = [];
    const texts = this.pageLayer.list.filter(
      (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text,
    );
    for (const t of texts) t.setCrop();   // clearing the crop shows the full text
    if (this.pen) {
      const p = this.pen;
      this.pen = null;
      this.scene.tweens.add({ targets: p, alpha: 0, duration: 250, onComplete: () => p.destroy() });
    }
    this.writing = false;
  }

  private stopWriting(): void {
    for (const tw of this.writeTweens) tw.stop();
    this.writeTweens = [];
    if (this.pen) { this.pen.destroy(); this.pen = null; }
    this.writing = false;
  }

  private renderColumn(lines: Line[], x: number, w: number): void {
    let y = AREA.padTop;
    for (const ln of lines) {
      if (ln.t === 'gap') { y += ln.h ?? 0.03; continue; }
      if (ln.t === 'title') { y = this.line(ln.s, x, y, w, { size: 22, bold: true }); continue; }
      if (ln.t === 'sub') { y = this.line(ln.s, x, y, w, { soft: true }); continue; }
      if (ln.t === 'header') { y = this.sectionHeader(ln.s, x, y, w); continue; }
      y = this.line(ln.s, x, y, w, { soft: ln.soft, size: ln.size, bold: ln.bold });
    }
  }

  private px(ratioX: number): number { return (ratioX - 0.5) * this.bookW; }
  private py(ratioY: number): number { return (ratioY - 0.5) * this.bookH; }

  private sectionHeader(text: string, x: number, y: number, wRatio: number): number {
    const t = this.scene.add.text(this.px(x), this.py(y), text.toUpperCase(),
      { fontFamily: FONT_H, fontSize: `${16 * SCALE}px`, fontStyle: 'bold', color: ACCENT,
        letterSpacing: 2 } as any);
    this.pageLayer.add(t);
    const g = this.scene.add.graphics();
    g.lineStyle(u(1.5), 0x9a5b34, 0.4);
    g.lineBetween(this.px(x), this.py(y) + u(24), this.px(x + wRatio), this.py(y) + u(24));
    this.pageLayer.add(g);
    return y + 0.055;
  }

  private line(text: string, x: number, y: number, wRatio: number, opts?: {
    soft?: boolean; size?: number; bold?: boolean;
  }): number {
    const size = (opts?.size ?? 14) + 1;   // serif needs only a slight size bump
    const t = this.scene.add.text(this.px(x), this.py(y), text, {
      fontFamily: FONT, fontSize: `${size * SCALE}px`,
      color: opts?.soft ? INK_SOFT : INK,
      fontStyle: opts?.bold ? 'bold' : 'normal',
      wordWrap: { width: this.bookW * wRatio },
      lineSpacing: u(5),
    });
    this.pageLayer.add(t);
    return y + (t.height / this.bookH) + 0.016;
  }
}