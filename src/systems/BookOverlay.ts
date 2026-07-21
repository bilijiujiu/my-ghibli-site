import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 翻开的书 · 铺满大半屏,展示简历。多跨页 + 点边缘翻页。
 * 底图 book_open.png,文字按页面比例落进两页留白。
 *
 * 用法:
 *   this.book = new BookOverlay(this);
 *   this.book.open(); / this.book.isOpen / this.book.close()
 * preload: this.load.image('book_open', '/book_open.png');
 *
 * 翻页:点右页外侧边缘 → 下一跨页;点左页外侧边缘 → 上一跨页。
 */

const BOOK_SCREEN_H_RATIO = 0.92;

const AREA = {
  leftX: 0.14,        // 左页文字左边界(往里收,离开装帧框)
  centerX: 0.50,
  rightEnd: 0.86,     // 右页文字右边界(往里收)
  padTop: 0.16,       // 顶部留白(标题不被上框压)
};

const INK = '#4a3826';       // 旧墨褐,比之前浅一点更柔和
const INK_SOFT = '#7a6a52';  // 次要文字
const ACCENT = '#9a5b34';    // 栏目标题暖褐
const FONT = '"Cormorant Garamond", Georgia, serif';        // 衬线,配旧书
const FONT_H = '"Cormorant Garamond", Georgia, serif';      // 标题同款衬线

/* 一行内容的描述 */
type Line =
  | { t: 'title'; s: string }
  | { t: 'sub'; s: string }
  | { t: 'header'; s: string }
  | { t: 'text'; s: string; soft?: boolean; size?: number; bold?: boolean }
  | { t: 'gap'; h?: number };

/* 一个跨页 = 左页 + 右页 */
interface Spread {
  left: Line[];
  right: Line[];
}

/* ===== 简历内容:每个 Spread 是一对翻开的页 ===== */
const SPREADS: Spread[] = [
  /* 跨页1:名片+联系 | 教育+技能 */
  {
    left: [
      { t: 'title', s: 'Harry Han' },
      { t: 'sub', s: 'Informatics Student · University of Washington' },
      { t: 'gap' },
      { t: 'header', s: 'Contact' },
      { t: 'text', s: 'hanzong@uw.edu', soft: true },
      { t: 'text', s: '(206) 886-9407', soft: true },
      { t: 'text', s: '4906 25th Ave NE E201', soft: true },
      { t: 'text', s: 'Seattle, WA 98105', soft: true },
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
      { t: 'text', s: 'Python · SQL · JavaScript · Java', soft: true, size: 13 },
      { t: 'text', s: 'HTML/CSS · R', soft: true, size: 13 },
      { t: 'text', s: 'Figma · Miro · Blender · SolidWorks', soft: true, size: 13 },
      { t: 'text', s: 'UI/UX Design · Info Architecture', soft: true, size: 13 },
      { t: 'text', s: 'Data Analysis · Prototyping', soft: true, size: 13 },
    ],
  },
  /* 跨页2:两段亮眼经历 */
  {
    left: [
      { t: 'title', s: 'Experience' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'Funcience Semiconductor', bold: true },
      { t: 'text', s: 'Web & 3D Design Intern · 2025', soft: true, size: 12 },
      { t: 'text', s: '· Built and maintained the company website with HTML, CSS and JavaScript, focused on UX and accessibility.', size: 13 },
      { t: 'text', s: '· Created 3D chip and package models in SolidWorks and Blender for product decks.', size: 13 },
      { t: 'text', s: '· Aligned site content with technical specs across engineering and marketing teams.', size: 13 },
    ],
    right: [
      { t: 'title', s: ' ' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'UW CSSA', bold: true },
      { t: 'text', s: 'Finance & Fundraising Team · 2023–Present', soft: true, size: 12 },
      { t: 'text', s: '· Raised over $20,000 in sponsorship for student events.', size: 13 },
      { t: 'text', s: '· Built lasting partnerships with local businesses and corporate sponsors.', size: 13 },
      { t: 'text', s: '· Organized large-scale cultural events with the executive board, managing budgets and vendor logistics.', size: 13 },
    ],
  },
  /* 跨页3:另两段经历 */
  {
    left: [
      { t: 'title', s: 'Experience' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'Hejun Consulting', bold: true },
      { t: 'text', s: 'Consulting Intern · 2022', soft: true, size: 12 },
      { t: 'text', s: '· Cleaned and organized logistics data supporting a cold-chain business plan.', size: 13 },
      { t: 'text', s: '· Conducted market research feeding into client-facing recommendations.', size: 13 },
      { t: 'text', s: '· Joined client meetings and supported stakeholder communication.', size: 13 },
    ],
    right: [
      { t: 'title', s: ' ' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'CFYC Communication', bold: true },
      { t: 'text', s: 'Assistant to General Manager · 2023', soft: true, size: 12 },
      { t: 'text', s: '· Supported daily operations for a PON optical-network equipment manufacturer.', size: 13 },
      { t: 'text', s: '· Observed fiber manufacturing, quality control and supply-chain workflows.', size: 13 },
      { t: 'text', s: '· Helped convert design blueprints into machine-operable production files.', size: 13 },
    ],
  },
  /* 跨页4:项目 */
  {
    left: [
      { t: 'title', s: 'Projects' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'JobTrack', bold: true },
      { t: 'text', s: 'Job Application Tracking Platform', soft: true, size: 12 },
      { t: 'text', s: '· Designed and built a responsive job-tracking site with HTML, CSS, JavaScript and React concepts.', size: 13 },
      { t: 'text', s: '· Implemented interactive search, filtering and application status tracking.', size: 13 },
      { t: 'text', s: '· Focused on clean information hierarchy and usability.', size: 13 },
    ],
    right: [
      { t: 'title', s: ' ' },
      { t: 'gap', h: 0.02 },
      { t: 'text', s: 'Internet Archive Analysis', bold: true },
      { t: 'text', s: 'Information Architecture Study', soft: true, size: 12 },
      { t: 'text', s: '· Evaluated metadata, navigation, search and accessibility of archive.org.', size: 13 },
      { t: 'text', s: '· Identified discoverability pain points across the catalog.', size: 13 },
      { t: 'text', s: '· Proposed redesign wireframes to improve findability.', size: 13 },
    ],
  },
];

export class BookOverlay {
  private scene: Phaser.Scene;
  private root!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  private bookImg!: Phaser.GameObjects.Image;
  private pageLayer!: Phaser.GameObjects.Container;   // 装当前跨页文字,翻页时替换
  private bookW = 0;
  private bookH = 0;
  private index = 0;
  private flipping = false;
  isOpen = false;

  /* 魔法笔书写 */
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
    /* 所有点击在这里按坐标分发:箭头→翻页 / 书内→不动 / 书外→关闭 */
    this.scrim.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const dx = p.x - W / 2;
      const dy = p.y - H / 2;
      const ax = this.bookW * 0.44;
      const hitR = u(60);
      /* 左箭头圈 */
      if (Math.hypot(dx + ax, dy) < hitR) { this.flip(-1); return; }
      /* 右箭头圈 */
      if (Math.hypot(dx - ax, dy) < hitR) { this.flip(1); return; }
      /* 书面范围内:书写中则跳过书写,否则不动 */
      if (Math.abs(dx) < this.bookW / 2 && Math.abs(dy) < this.bookH / 2) {
        if (this.writing) this.finishWriting();
        return;
      }
      /* 书外:关闭 */
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

    /* 页码 */
    this.pageNum = this.scene.add.text(0, this.py(0.97), '', {
      fontFamily: FONT, fontSize: `${13 * SCALE}px`, color: INK_SOFT,
    }).setOrigin(0.5);
    this.root.add(this.pageNum);

    this.pageLayer = this.scene.add.container(0, 0);
    this.root.add(this.pageLayer);

    /* 先建箭头(renderSpread 里会用到 updateArrows) */
    this.buildFlipZones();

    this.renderSpread();

    /* 箭头提到最上层 */
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

  /* 翻页箭头(仅显示,点击由 scrim 统一按坐标分发) */
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

  /* 根据当前页更新箭头明暗 */
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

    /* 旧文字立刻收起(新页反正要重写),纸页动作掩盖这一瞬 */
    this.pageLayer.removeAll(true);

    /* 底下渲染新页(文字隐藏=空白纸),等翻完再写 */
    this.index = next;
    this.renderSpread(true);

    this.playFold(dir, () => {
      this.flipping = false;
      this.startWriting();
    });
  }

  /** 纸页折翻动画:用真实纸图(page_paper.png)折过去 */
  private playFold(dir: number, onDone: () => void): void {
    const halfW = this.bookW / 2 * 0.74;   // 沿用你调好的对齐系数
    const pageH = this.bookH * 0.70;

    /* 折起的纸:真实纸图,origin 钉在书脊 */
    const fold = this.scene.add.image(0, 0, 'page_paper')
      .setOrigin(dir === 1 ? 0 : 1, 0.5);
    fold.setDisplaySize(halfW, pageH);
    this.root.add(fold);
    const baseScaleX = fold.scaleX;   // 记住铺满半页时的横向缩放

    /* 折边阴影线(贴着书脊) */
    const spineShadow = this.scene.add.rectangle(0, 0, u(6), pageH, 0x000000, 0.25)
      .setOrigin(0.5, 0.5);
    this.root.add(spineShadow);

    /* 第一段:纸折向书脊(压扁+调暗 tint) */
    this.scene.tweens.add({
      targets: fold, scaleX: 0, duration: 240, ease: 'Quad.easeIn',
      onUpdate: (tw) => {
        const s = Math.round(0xff * (0.65 + 0.35 * (1 - tw.progress)));
        fold.setTint((s << 16) | (s << 8) | s);
      },
      onComplete: () => {
        /* 第二段:换边展开(翻到另一侧,纸水平镜像更像背面) */
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

  /* 渲染当前跨页 */
  private renderSpread(skipWrite = false): void {
    this.pageLayer.removeAll(true);
    const sp = SPREADS[this.index];
    this.renderColumn(sp.left, AREA.leftX, AREA.centerX - AREA.leftX - 0.04);
    this.renderColumn(sp.right, AREA.centerX + 0.03, AREA.rightEnd - AREA.centerX - 0.04);
    this.pageNum.setText(`${this.index + 1} / ${SPREADS.length}`);
    this.root.bringToTop(this.pageNum);
    this.updateArrows();
    if (skipWrite) {
      /* 翻页中:文字先藏起(裁剪成0宽),等翻完由 flip 回调启动书写 */
      const texts = this.pageLayer.list.filter(
        (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text,
      );
      for (const t of texts) t.setCrop(0, 0, 0, t.height);
    } else {
      this.startWriting();
    }
  }

  /* ---------- 魔法笔书写 ---------- */

  /** 收集本页所有 Text,按顺序用裁剪补间"写"出来,笔跟着走 */
  private startWriting(): void {
    this.stopWriting();          // 清掉上一页残留
    this.writing = true;

    /* 收集文字对象(pageLayer 里的 Text) */
    const texts = this.pageLayer.list.filter(
      (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text,
    );
    if (texts.length === 0) { this.writing = false; return; }

    /* 全部先裁剪成 0 宽(隐藏) */
    for (const t of texts) t.setCrop(0, 0, 0, t.height);

    /* 笔:占位笔形(一根斜的细杆+笔尖),之后可换羽毛笔图 */
    this.pen = this.scene.add.container(0, 0);
    const pg = this.scene.add.graphics();
    pg.lineStyle(u(4), 0x5a3d22, 1);
    pg.lineBetween(0, 0, u(14), -u(34));          // 笔杆(斜向右上)
    pg.fillStyle(0x2a1f16, 1);
    pg.fillTriangle(0, 0, u(4), -u(6), -u(3), -u(5)); // 笔尖
    this.pen.add(pg);
    this.pageLayer.add(this.pen);

    /* 总时长约 1.4s,按各行字宽分配 */
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
          /* 笔尖跟到当前书写位置(行首x+已写宽度, 行的垂直中部) */
          if (this.pen) this.pen.setPosition(t.x + prox.w, t.y + t.height * 0.7);
        },
      });
      this.writeTweens.push(tw);
      delay += dur;
    }

    /* 写完:笔淡出 */
    const done = this.scene.tweens.add({
      targets: {}, x: 0, duration: 1, delay,
      onComplete: () => this.finishWriting(),
    });
    this.writeTweens.push(done);
  }

  /** 跳过/结束:全部显示,笔消失 */
  private finishWriting(): void {
    for (const tw of this.writeTweens) tw.stop();
    this.writeTweens = [];
    const texts = this.pageLayer.list.filter(
      (o): o is Phaser.GameObjects.Text => o instanceof Phaser.GameObjects.Text,
    );
    for (const t of texts) t.setCrop();   // 清除裁剪=全显
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
    const size = (opts?.size ?? 14) + 1;   // 衬线略放大一点点即可
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