import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';
import { addGlow } from '../systems/glow';
import { playDoorCreak } from '../systems/AtticAudio';

/**
 * 第二幕:门廊近景过场(porch.webp)。
 * 镜头就是访客本人,画面里不放人物:
 *   淡入 → 镜头极慢地往前"呼吸" → 门自己虚掩着推开一条缝(邀请)→ 欢迎语浮现
 *   → 点击:门吱呀一声推大,镜头加速推进门缝,暖光漫过整个画面 → 第三幕。
 * 原来是主角从左边走进来,但人物和门廊原画画风不一样,而且走路要等好几秒。
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
};

const ARRIVE_MS = 1100;      // 淡入后多久门开始推开、欢迎语出现
const DOOR_AJAR = 1.0;       // 原画里门本来就虚掩着
const DOOR_OPEN = 0.46;      // 主角走到跟前时开到这么大
const DOOR_WIDE = 0.26;      // 进门那一下再推开一点
/* 欢迎语左对齐、离左边留足余量。原来是以 x=260 居中,一行字宽 ~575 逻辑像素,
   左半截已经伸到画布外面;ENVELOP 缩放在宽屏上还会再裁掉两边,所以开头的 "T" 被切了。 */
const TEXT_X = 70, TEXT_Y = 215;

export class DressingScene extends Phaser.Scene {

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
    this.load.on('loaderror', () => { /* 缺素材就退回静态,不报致命错 */ });
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

    /* 镜头:从暖白淡入,然后一直极慢地往前推 —— 站在门廊上不是静止的照片,是在"走近" */
    const cam = this.cameras.main;
    cam.fadeIn(900, 250, 246, 238);
    /* 起点就放大一点:原图按宽度刚好铺满,zoom 一旦小于 1 两边就会露出画布底色 */
    cam.setZoom(1.03);
    this.tweens.add({ targets: cam, zoom: 1.075, duration: 14000, ease: 'Sine.easeInOut' });

    /* 门自己推开一条缝,欢迎语和提示随后浮现 */
    this.time.delayedCall(ARRIVE_MS, () => {
      this.arrived = true;
      this.swingDoor(DOOR_OPEN, 2400, 'Sine.easeInOut');
      playDoorCreak(0.5);
      this.tweens.add({ targets: this.welcome, alpha: 1, duration: 1000, delay: 500 });
      this.tweens.add({ targets: this.hint, alpha: 0.85, duration: 800, delay: 1400 });
    });

    this.input.on('pointerdown', () => { if (this.arrived) this.enter(); });
    this.input.keyboard!.on('keydown-ENTER', () => { if (this.arrived) this.enter(); });
  }

  private paintScene(): void {
    const src = this.textures.get('porch').getSourceImage() as HTMLImageElement;
    this.imgScale = Math.max(W / src.width, H / src.height);
    this.add.image(W / 2, H / 2, 'porch').setScale(this.imgScale).setDepth(0);

    /* 原来这里叠了三张 cloud1.png(6752px 宽,缩到 0.3~0.5 也有两三千像素)、22% 透明度,
       说是"只在左边天空飘",其实每张都宽到盖住门廊的柱子、灯和墙,画面上就是几团发白的雾。
       porch.webp 里本来就画着云,不需要再叠。 */

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
    }).setOrigin(0, 0.5);
    const l2 = this.add.text(u(4), u(48), 'Come inside.', {
      fontFamily: '"Cormorant Garamond", serif',
      fontSize: `${32 * SCALE}px`, fontStyle: 'italic', color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.6)', blur: 10 * SCALE, fill: true },
    }).setOrigin(0, 0.5);
    this.welcome.add([l1, l2]);

    /* 提示放在欢迎语下面:原来在画面底部正中,正好压在主角腿上 */
    this.hint = this.add.text(u(TEXT_X + 4), u(TEXT_Y + 112), '— Click to step inside', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${18 * SCALE}px`, color: '#fffaf0',
      shadow: { offsetX: 0, offsetY: 2 * SCALE, color: 'rgba(20,20,40,0.5)', blur: 8 * SCALE, fill: true },
    }).setOrigin(0, 0.5).setDepth(20).setAlpha(0);
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

  /**
   * 进门:门推大 → 镜头先轻轻后撤一下再加速推进门缝(像人迈步前的那一下重心)
   * → 暖光从门里漫出来盖满画面 → 第三幕。
   */
  private enter(): void {
    if (this.entering) return;
    this.entering = true;

    this.tweens.add({ targets: [this.welcome, this.hint], alpha: 0, duration: 350 });
    this.swingDoor(DOOR_WIDE, 1100, 'Sine.easeOut');
    playDoorCreak(1);

    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    const gx = this.sx(P.doorGlow.x), gy = this.sy(P.doorGlow.y);
    this.tweens.add({
      targets: cam, zoom: Math.max(1.005, cam.zoom - 0.025), duration: 260, ease: 'Sine.easeOut',
      onComplete: () => {
        cam.pan(gx, gy, 1900, 'Cubic.easeIn');
        cam.zoomTo(3.2, 1900, 'Cubic.easeIn');
      },
    });

    const flood = this.add.rectangle(gx, gy, W * 3, H * 3, 0xffe0b0, 0).setDepth(90);
    this.tweens.add({
      targets: flood, alpha: 1, duration: 900, delay: 1250, ease: 'Quad.easeIn',
      onComplete: () => this.scene.start('Room'),
    });
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.05);
    this.t += dt;

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
