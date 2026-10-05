import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { SCANNER, SPOTS, AtticSpot } from '../config/attic';
import { PROJECTS } from '../config/projects';
import { ScanReveal } from '../systems/ScanReveal';
import { ScannerSound, playStairs } from '../systems/AtticAudio';
import { ProjectCard } from '../systems/ProjectCard';
import { ProcessWall } from '../systems/ProcessWall';
import { addGlow } from '../systems/glow';

/**
 * 阁楼工作室 · 从 RoomScene 的楼梯上来。
 *
 * 体验:
 *   上来是一片黑,只有角落里扫描仪的指示灯在闪 → 点扫描仪 → 一道扫描波前从扫描仪扫开,
 *   黑暗先变成点云、再长回手绘原画 → 工作台上的东西亮起来,可以点:
 *     小车模型 = SuperAuto USA / 账本 = JobTrack / 图纸卷 = 这个网站;
 *     左墙软木板 = 这个网站的制作过程(改前改后对比);
 *     楼梯口 = 下楼。
 *   扫过一次就记住,同一次访问再上来直接是亮的。
 *
 * 底图:public/attic_bg.webp(Midjourney 原画,风格参考 room.webp)。
 * 交互点坐标在 src/config/attic.ts,是底图的归一化坐标。
 */

const DEBUG = false;          // 打开后点画面会在控制台打印归一化坐标,标定交互点用
let scannedThisVisit = false;

export class AtticScene extends Phaser.Scene {
  private bgKey = 'attic_bg';
  private bg = { x: 0, y: 0, w: W, h: H };
  private scan?: ScanReveal;
  private scanSound = new ScannerSound();   // 不能叫 sound,会和 Phaser.Scene 自带的 sound 冲突
  private led!: Phaser.GameObjects.Image;
  private hint!: Phaser.GameObjects.Text;
  private card!: ProjectCard;
  private wall!: ProcessWall;
  private spotObjs: Phaser.GameObjects.GameObject[] = [];
  private scanning = false;
  private ready = false;
  private leaving = false;
  private prevOverlay = false;
  private clock = 0;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() { super('Attic'); }

  preload(): void {
    this.load.image('attic_bg', '/attic_bg.webp');
    this.load.image('attic_depth', '/attic_depth.png');   // tools/make_depth.py 生成
    ProcessWall.preload(this);
  }

  create(): void {
    this.leaving = false; this.scanning = false; this.ready = false;
    this.spotObjs = [];

    /* 底图铺满(cover),记下它在画布上的实际位置,交互点按它换算 */
    const src = this.textures.get(this.bgKey).getSourceImage() as HTMLImageElement;
    const sc = Math.max(W / src.width, H / src.height);
    this.bg.w = src.width * sc; this.bg.h = src.height * sc;
    this.bg.x = (W - this.bg.w) / 2; this.bg.y = (H - this.bg.h) / 2;
    this.add.image(this.bg.x, this.bg.y, this.bgKey).setOrigin(0, 0).setScale(sc).setDepth(0);

    const sp = this.at(SCANNER);
    this.led = addGlow(this, sp.x, sp.y, u(22), 0x66e0ff, 0.9).setDepth(6);

    this.hint = this.add.text(W / 2, H - u(34), '', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${16 * SCALE}px`, color: 'rgba(235,245,255,.9)',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.8)', blur: 6, fill: true },
    }).setOrigin(0.5).setDepth(20);

    this.card = new ProjectCard(this);
    this.wall = new ProcessWall(this);
    this.keys = this.input.keyboard!.addKeys('ESC') as any;

    if (scannedThisVisit) {
      this.led.setAlpha(0.5);
      this.showSpots();
    } else {
      /* 着色器盖在底图上,扫描完再撤掉 */
      this.scan = new ScanReveal(this, this.bgKey, 'attic_depth', this.bg.x, this.bg.y, this.bg.w, this.bg.h,
        { x: sp.x - this.bg.x, y: sp.y - this.bg.y });
      this.scan.shader.setDepth(1);
      this.scan.setProgress(0);
      this.hint.setText('Something is blinking in the corner. Click it.');
      const hit = this.add.circle(sp.x, sp.y, SCANNER.r * this.bg.w, 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true }).setDepth(30);
      hit.once('pointerdown', () => { hit.destroy(); this.startScan(); });
    }

    if (DEBUG) {
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        const nx = (p.x - this.bg.x) / this.bg.w, ny = (p.y - this.bg.y) / this.bg.h;
        console.log(`x: ${nx.toFixed(3)}, y: ${ny.toFixed(3)}`);
      });
    }
    this.cameras.main.fadeIn(700, 0, 0, 0);
  }

  /** 归一化坐标 → 画布像素 */
  private at(s: AtticSpot): { x: number; y: number } {
    return { x: this.bg.x + s.x * this.bg.w, y: this.bg.y + s.y * this.bg.h };
  }

  private startScan(): void {
    if (this.scanning || !this.scan) return;
    this.scanning = true;
    this.hint.setText('Scanning…');
    this.scanSound.start();
    const prog = { p: 0 };
    this.tweens.add({
      targets: prog, p: 1, duration: ScanReveal.DURATION, delay: 350, ease: 'Linear',
      onUpdate: () => {
        this.scan?.setProgress(prog.p, this.clock);
        /* 马达声只跟扫描头转的那一段(时间轴前 55%) */
        this.scanSound.setProgress(Math.min(1, prog.p / 0.55));
        if (prog.p > 0.55 && this.scanning) { this.scanning = false; this.scanSound.finish(); }
        if (prog.p > 0.62) this.hint.setText('');
      },
      onComplete: () => {
        this.scan?.shader.destroy();
        this.scan = undefined;
        this.scanning = false;
        scannedThisVisit = true;
        this.tweens.add({ targets: this.led, alpha: 0.5, duration: 600 });
        this.showSpots();
      },
    });
  }

  /** 扫完以后,能点的东西各自透出一点光;鼠标移上去显示名字 */
  private showSpots(): void {
    this.ready = true;
    this.hint.setText('Click things to look closer · Esc to go downstairs');
    for (const s of SPOTS) {
      const p = this.at(s);
      const r = s.r * this.bg.w;
      const glow = addGlow(this, p.x, p.y, r * 1.1, 0xffe2a8, 0).setDepth(8);
      this.tweens.add({ targets: glow, alpha: { from: 0.10, to: 0.22 }, duration: 1300 + Math.random() * 500,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 800 });
      const label = this.add.text(p.x, p.y - r - u(16), s.label, {
        fontFamily: '"Nunito", sans-serif', fontSize: `${15 * SCALE}px`, color: '#1e1610', fontStyle: 'bold',
        backgroundColor: 'rgba(250,244,230,0.95)', padding: { x: u(10), y: u(5) },
      }).setOrigin(0.5, 1).setDepth(25).setAlpha(0);
      const hit = this.add.circle(p.x, p.y, r, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).setDepth(24);
      hit.on('pointerover', () => {
        this.tweens.add({ targets: label, alpha: 1, y: p.y - r - u(22), duration: 160 });
        glow.setScale(glow.scaleX * 1.15);
      });
      hit.on('pointerout', () => {
        this.tweens.add({ targets: label, alpha: 0, y: p.y - r - u(16), duration: 160 });
        glow.setScale(glow.scaleX / 1.15);
      });
      hit.on('pointerdown', () => this.activate(s.id));
      this.spotObjs.push(glow, label, hit);
    }
  }

  private activate(id: string): void {
    if (this.card.isOpen || this.wall.isOpen) return;
    if (id === 'process') this.wall.open();
    else if (id === 'stairs') this.leave();
    else if (PROJECTS[id]) this.card.open(PROJECTS[id]);
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scanSound.stop();
    playStairs(6, 0.26);
    this.cameras.main.fadeOut(900, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Room'));
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.clock += dt;

    /* 指示灯:没扫之前一闪一闪等人点 */
    if (!this.scanning && !this.ready) this.led.setAlpha(0.35 + 0.65 * (Math.sin(this.clock * 4) > 0 ? 1 : 0.2));


    /* Esc:有卡片开着时 Esc 只关卡片(卡片自己处理),这一帧不离开 */
    const overlay = this.card.isOpen || this.wall.isOpen;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC) && !overlay && !this.prevOverlay) this.leave();
    this.prevOverlay = overlay;
  }
}
