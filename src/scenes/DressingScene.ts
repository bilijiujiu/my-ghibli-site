import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { HeroRig } from '../entities/HeroRig';
import { RIG } from '../config/heroRig';
import { addGlow } from '../systems/glow';

/**
 * 第二幕:门廊近景过场(porch.webp)。
 * 主角从左走入 → 走到台阶前 → 门在他靠近时缓缓推开 → 点击走进门 → 第三幕。
 *
 * porch.webp 是一张生成的整图,但"生成图不能动"是个误会:
 * 把该动的那块抠出来、底下缺的补上,剩下的交给光,这一幕就活了。
 *   · 门   —— tools/make_porch.py 抠成单独一层,以右侧铰链为轴做 scaleX 变化。
 *             门绕铰链转开,在正视投影里就是横向被压扁,一张图就够,比硬做三维旋转自然。
 *   · 灯、窗、门洞 —— 一律不动原图,叠 ADD 混合的暖光,呼吸 + 微颤。
 *   · 浮尘、飘云、天色渐暗 —— 纯代码。
 *
 * 所有位置都用 **porch.webp 原图坐标** 写(6688×3764),运行时按实际缩放换算 —— 
 * 这样在图上量出来多少就填多少,不用先在脑子里做一遍换算。
 */

const SRC_W = 6688, SRC_H = 3764;

/* 在原图上量出来的锚点 */
const P = {
  lamp: { x: 4670, y: 1040 },      // 提灯的灯芯
  window: { x: 4390, y: 1010 },    // 门左边那扇格子窗
  doorGlow: { x: 5320, y: 1500 },  // 门缝里透出来的光
  pool: { x: 5000, y: 2600 },      // 光洒在门廊地板上的那一摊
  door: { x0: 5300, x1: 5775, y0: 360, y1: 2440 },   // 门板(x1 = 铰链)
  room: { x0: 5130, y0: 360 },                       // 门后室内补片
  /* 主角停下时脚底的位置。y 不能超过 3500 —— 图是按 max 比例铺满的,
     纵向被裁掉了上下各 264 原图像素,3500 以下永远在画面外,脚会被切掉。 */
  heroFoot: { x: 3657, y: 3470 },
  heroStart: { x: 1500, y: 3470 },
};

const HERO_PIX_H = 560;      // 主角在画布上的高度。按门高和栏杆高反推 —— 原来 358 是个小孩。
const DOOR_AJAR = 1.0;       // 原画里门本来就虚掩着
const DOOR_OPEN = 0.46;      // 主角走到跟前时开到这么大
const DOOR_WIDE = 0.26;      // 进门那一下再推开一点
const TEXT_X = 260, TEXT_Y = 240;

export class DressingScene extends Phaser.Scene {
  private hero!: HeroRig;
  private walkTarget: number | null = null;
  private walkSpeed = 0;
  private onArrive?: () => void;

  private imgScale = 1;   /* 不能叫 scale —— Phaser.Scene 自己有个 scale(ScaleManager) */
  private welcome!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  private door?: Phaser.GameObjects.Image;
  private doorScale = DOOR_AJAR;
  private lamp!: Phaser.GameObjects.Image;
  private lampCore!: Phaser.GameObjects.Image;
  private windowGlow!: Phaser.GameObjects.Image;
  private slitGlow!: Phaser.GameObjects.Image;
  private pool!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Ellipse;
  private dusk!: Phaser.GameObjects.Rectangle;
  private motes: { o: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number }[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private arrived = false;
  private entering = false;
  private t = 0;

  constructor() { super('Dressing'); }

  preload(): void {
    this.load.image('porch', '/porch.webp');
    this.load.image('porch_room', '/porch_room.webp');
    this.load.image('porch_door', '/porch_door.webp');
    this.load.image('cloud1', '/cloud1.png');
    this.load.on('loaderror', () => { /* 缺素材就退回静态,不报致命错 */ });
    HeroRig.preload(this);
  }

  /* 原图坐标 → 画布坐标。图是按 max(W/w, H/h) 铺满并居中的。 */
  private sx(v: number): number { return W / 2 + (v - SRC_W / 2) * this.imgScale; }
  private sy(v: number): number { return H / 2 + (v - SRC_H / 2) * this.imgScale; }
  private sl(v: number): number { return v * this.imgScale; }

  create(): void {
    this.arrived = false;
    this.entering = false;
    this.t = 0;
    this.doorScale = DOOR_AJAR;

    this.paintScene();
    this.buildLights();
    this.buildWelcome();

    /* 主角:不做成纯黑剪影 —— 门廊是暖光场景,压成暖褐比压成黑更像"背光下的人",
       也保得住新骨架那身水彩笔触。 */
    this.hero = new HeroRig(this, this.sx(P.heroStart.x), this.sy(P.heroStart.y));
    this.hero.c.setScale(HERO_PIX_H / RIG.height).setDepth(10);
    this.hero.silhouette(0x8a6a52, 0.97);
    this.shadow = this.add.ellipse(0, 0, u(40), u(11), 0x2a1c12, 0.30).setDepth(9);

    const cam = this.cameras.main;
    cam.fadeIn(700, 250, 246, 238);
    cam.setZoom(1.06);
    cam.zoomTo(1, 900, 'Sine.easeOut');

    /* 走入 → 停在台阶前 → 门推开 + 欢迎语淡入 */
    this.walkTo(this.sx(P.heroFoot.x), 2600, () => {
      this.arrived = true;
      this.swingDoor(DOOR_OPEN, 1600, 'Sine.easeOut');
      this.tweens.add({ targets: this.welcome, alpha: 1, duration: 800 });
      this.tweens.add({ targets: this.hint, alpha: 0.85, duration: 800, delay: 400 });
    });

    this.input.on('pointerdown', () => { if (this.arrived) this.enter(); });
    this.input.keyboard!.on('keydown-ENTER', () => { if (this.arrived) this.enter(); });
  }

  private paintScene(): void {
    const src = this.textures.get('porch').getSourceImage() as HTMLImageElement;
    this.imgScale = Math.max(W / src.width, H / src.height);
    this.add.image(W / 2, H / 2, 'porch').setScale(this.imgScale).setDepth(0);

    /* 云:只在左边天空那一带飘。右半边是门廊,飘过去就穿帮了。 */
    if (this.textures.exists('cloud1')) {
      for (let i = 0; i < 3; i++) {
        const c = this.add.image(Phaser.Math.Between(0, Math.round(W * 0.45)),
                                 Phaser.Math.Between(u(60), u(210)), 'cloud1')
          .setDepth(1).setAlpha(0.22).setScale(0.30 + Math.random() * 0.22);
        (c as any)._sp = u(2.5 + Math.random() * 2.5);
        this.clouds.push(c);
      }
    }

    /* 门后的室内 + 门板。门板的原点放在右边铰链上,scaleX 一变就是绕铰链开合。 */
    if (this.textures.exists('porch_room')) {
      this.add.image(this.sx(P.room.x0), this.sy(P.room.y0), 'porch_room')
        .setOrigin(0, 0).setScale(this.imgScale).setDepth(1);
    }
    if (this.textures.exists('porch_door')) {
      this.door = this.add.image(this.sx(P.door.x1), this.sy(P.door.y0), 'porch_door')
        .setOrigin(1, 0).setScale(this.imgScale).setDepth(2);
    }
  }

  /**
   * 灯、窗、门缝的暖光。一律 ADD 混合叠在原图上,不动原图一个像素。
   * 用 systems/glow 的径向渐变,不能用 add.circle —— 那是实心圆,叠出来是一块块硬边光斑。
   */
  private buildLights(): void {
    const add = (x: number, y: number, r: number, color: number, a: number, ry?: number) =>
      addGlow(this, this.sx(x), this.sy(y), this.sl(r), color, a, ry ? this.sl(ry) : undefined)
        .setDepth(3);

    this.lamp = add(P.lamp.x, P.lamp.y, 720, 0xffb454, 0.34);
    this.lampCore = add(P.lamp.x, P.lamp.y, 210, 0xffe0a0, 0.55);
    this.windowGlow = add(P.window.x, P.window.y, 520, 0xffa848, 0.24);
    this.slitGlow = add(P.doorGlow.x, P.doorGlow.y, 620, 0xffb050, 0.26);

    /* 光洒在门廊地板上的一摊:压扁成椭圆,地面是斜着铺开的 */
    this.pool = add(P.pool.x, P.pool.y, 1400, 0xff9a3c, 0.18, 520);

    /* 灯下的浮尘:有光柱才看得见灰,这一下最像"空气里有东西" */
    for (let i = 0; i < 26; i++) {
      const o = addGlow(this,
        this.sx(P.lamp.x) + Phaser.Math.Between(-this.sl(600), this.sl(600)),
        this.sy(P.lamp.y) + Phaser.Math.Between(-this.sl(300), this.sl(900)),
        u(Math.random() * 2.6 + 1.4), 0xffe7b0, 0).setDepth(12);
      this.motes.push({ o, x: o.x, y: o.y, ph: Math.random() * 6.28, sp: 0.25 + Math.random() * 0.5 });
    }

    /* 天色:站着不走的时候会一点点更暗更蓝,催你进门 */
    this.dusk = this.add.rectangle(W / 2, H / 2, W, H, 0x2a2a5a, 0).setDepth(4);
  }

  private buildWelcome(): void {
    this.welcome = this.add.container(u(TEXT_X), u(TEXT_Y)).setDepth(20).setAlpha(0);
    const l1 = this.add.text(0, 0, "The light's on. You're just in time.", {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${32 * SCALE}px`, color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.6)', blur: 10 * SCALE, fill: true },
    }).setOrigin(0.5);
    const l2 = this.add.text(0, u(46), 'Come inside.', {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${32 * SCALE}px`, fontStyle: 'italic', color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.6)', blur: 10 * SCALE, fill: true },
    }).setOrigin(0.5);
    this.welcome.add([l1, l2]);

    this.hint = this.add.text(W / 2, H - u(60), '— Click to step inside —', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${18 * SCALE}px`, color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.5)', blur: 8 * SCALE, fill: true },
    }).setOrigin(0.5).setDepth(20).setAlpha(0);
    this.tweens.add({
      targets: this.hint, alpha: { from: 0.85, to: 0.35 },
      duration: 1100, yoyo: true, repeat: -1, delay: 1500,
    });
  }

  /** 开合门:改的是 scaleX,原点在铰链上,所以看着就是绕铰链转 */
  private swingDoor(to: number, duration: number, ease = 'Sine.easeInOut'): void {
    this.tweens.addCounter({
      from: this.doorScale, to, duration, ease,
      onUpdate: (tw) => { this.doorScale = tw.getValue(); },
    });
  }

  /** 让主角走到目标 x —— 位移和步态都在 update() 里按真实 dt 推进 */
  private walkTo(targetX: number, duration: number, onDone: () => void): void {
    this.walkSpeed = Math.abs(targetX - this.hero.c.x) / (duration / 1000);
    this.walkTarget = targetX;
    this.onArrive = onDone;
  }

  private enter(): void {
    if (this.entering) return;
    this.entering = true;

    this.tweens.add({ targets: [this.welcome, this.hint], alpha: 0, duration: 300 });
    this.swingDoor(DOOR_WIDE, 900, 'Sine.easeOut');

    /* 主角走到门前 → 缩小淡出(走进门的透视)→ 相机推门 → 暖光漫过画面 */
    this.walkTo(this.sx(P.door.x0 - 120), 1500, () => {
      const s = HERO_PIX_H / RIG.height;
      this.tweens.add({
        targets: this.hero.c,
        scaleX: s * 0.7 * Math.sign(this.hero.c.scaleX || 1), scaleY: s * 0.7,
        x: this.sx(P.doorGlow.x), y: this.sy(P.heroFoot.y - 260),
        alpha: 0, duration: 900, ease: 'Sine.easeIn',
      });
      this.tweens.add({ targets: this.shadow, alpha: 0, duration: 700 });

      const cam = this.cameras.main;
      cam.pan(this.sx(P.doorGlow.x), this.sy(P.doorGlow.y), 1600, 'Sine.easeInOut');
      cam.zoomTo(2.6, 1600, 'Sine.easeInOut');

      const flood = this.add.rectangle(this.sx(P.doorGlow.x), this.sy(P.doorGlow.y),
                                       W * 2, H * 2, 0xffe0b0, 0).setDepth(90);
      this.tweens.add({
        targets: flood, alpha: 1, duration: 900, delay: 800, ease: 'Quad.easeIn',
        onComplete: () => this.scene.start('Room'),
      });
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.t += dt;

    /* ---- 走位与步态 ---- */
    if (this.walkTarget !== null) {
      const c = this.hero.c;
      const dir = Math.sign(this.walkTarget - c.x) || 1;
      const step = this.walkSpeed * dt;
      if (Math.abs(this.walkTarget - c.x) <= step) {
        c.x = this.walkTarget;
        this.walkTarget = null;
        this.hero.update(dt, false);
        const done = this.onArrive; this.onArrive = undefined;
        done?.();
      } else {
        c.x += step * dir;
        this.hero.setDirection(dir);
        this.hero.update(dt, true);
      }
    } else {
      this.hero.update(dt, false);
    }
    if (!this.entering) {
      this.shadow.setPosition(this.hero.c.x, this.hero.c.y + u(3));
      this.shadow.setScale(1 + Math.abs(this.hero.c.scaleX) * 6);
    }

    /* ---- 门:scaleX 直接写,tween 只负责推 doorScale ---- */
    if (this.door) this.door.scaleX = this.imgScale * this.doorScale;

    /* ---- 灯:呼吸 + 一点点没规律的颤,烛火不会均匀地闪 ---- */
    const flick = 0.5 + 0.5 * Math.sin(this.t * 2.1) + 0.18 * Math.sin(this.t * 11.3);
    this.lamp.setAlpha(0.27 + 0.11 * flick);
    this.lampCore.setAlpha(0.46 + 0.16 * flick);
    this.lampCore.setScale(1 + 0.05 * flick);
    this.windowGlow.setAlpha(0.19 + 0.07 * Math.sin(this.t * 1.3 + 1));

    /* 门开得越大,漏出来的光越多 —— 门缝的光和地板的光池都跟着门走 */
    const open = Phaser.Math.Clamp((DOOR_AJAR - this.doorScale) / (DOOR_AJAR - DOOR_WIDE), 0, 1);
    this.slitGlow.setAlpha(0.20 + 0.42 * open + 0.05 * flick);
    this.slitGlow.setScale(1 + 0.55 * open);
    this.pool.setAlpha(0.13 + 0.26 * open);

    /* ---- 浮尘:飘,并且只在灯光够亮的地方才看得见 ---- */
    for (const m of this.motes) {
      m.ph += dt * m.sp;
      m.o.setPosition(m.x + Math.sin(m.ph) * u(18), m.y - (this.t * u(4) * m.sp) % u(220));
      m.o.setAlpha(0.35 + 0.45 * Math.abs(Math.sin(m.ph * 1.7)));
    }

    for (const c of this.clouds) {
      c.x += (c as any)._sp * dt;
      if (c.x > W * 0.5) c.x = -u(120);
    }

    /* ---- 站着不动的时候天色一点点沉下去,催人进门 ---- */
    if (this.arrived && !this.entering) {
      this.dusk.setAlpha(Math.min(0.16, this.dusk.alpha + dt * 0.012));
    }
  }
}
