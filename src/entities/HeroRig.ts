import Phaser from 'phaser';
import { RIG } from '../config/heroRig';

/**
 * 剪纸动画角色骨架(cut-out rig)。
 *
 * 切图由 build_rig.py 从 hero_base.png 生成,关节处做了"同心圆接缝":
 * 父子两层的分界是以关节为圆心的同一个圆,子件绕圆心转时圆的轮廓恒等不变,
 * 所以任何角度都不会露缝。轴心坐标和图片偏移都在 config/heroRig.ts 里,不要手填数字。
 *
 * 结构(层级即父子骨骼,子容器的 rotation 是相对父骨骼的角度):
 *
 *   c  ← 原点在脚底,场景直接按地面坐标摆它
 *   └ body            上下起伏(bob)整体施加在这一层,四肢才不会和躯干脱节
 *     ├ 远侧腿 hip → knee        ┐
 *     ├ 远侧臂 shoulder → elbow  │ 画在躯干之下,压暗一档
 *     ├ 近侧腿 hip → knee        │ 躯干压在它上面 = 衬衫下摆盖住裤腰
 *     ├ torso                    │
 *     ├ 近侧臂 shoulder → elbow  ┘ 画在躯干之上
 *     └ head
 *
 * 对外接口保持 c / update / setDirection 不变,场景代码零改动。
 */

/* ── 步态参数(和 preview_rig.py 里那份必须一致,调完记得两边同步)────────
   摆角上限已经写进切图的安全余量,想加大幅度要回去改 build_rig.py 的 MAX_* 重新出图。 */
const CYCLE_SPEED = 6.4;    // 走路循环角速度 rad/s
const IDLE_SPEED = 1.1;     // 站立呼吸
const HIP_SWING = 0.44;
const KNEE_BEND = 0.62;
const SH_SWING = 0.20;
const ELBOW_BEND = 0.34;
const ELBOW_REST = 0.14;    // 手肘常态微屈,完全伸直像木偶
const BOB = 13;             // 上下起伏(母版像素)

const FADE = 0.12;          // 起步/收步时摆幅的平滑系数,避免动作突然弹出来

type Joint = keyof typeof RIG.joints;

export class HeroRig {
  readonly c: Phaser.GameObjects.Container;

  private body!: Phaser.GameObjects.Container;
  private hipN!: Phaser.GameObjects.Container;
  private hipF!: Phaser.GameObjects.Container;
  private kneeN!: Phaser.GameObjects.Container;
  private kneeF!: Phaser.GameObjects.Container;
  private shN!: Phaser.GameObjects.Container;
  private shF!: Phaser.GameObjects.Container;
  private elN!: Phaser.GameObjects.Container;
  private elF!: Phaser.GameObjects.Container;
  private head!: Phaser.GameObjects.Container;

  private t = 0;
  private amp = 0;          // 0=站立 1=全速走,平滑过渡
  private dir = 1;

  /** 场景 preload 里调一次即可 */
  static preload(scene: Phaser.Scene): void {
    for (const name of Object.keys(RIG.parts)) {
      scene.load.image(`hero_${name}`, `/hero/${name}.png`);
    }
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.c = scene.add.container(x, y);
    this.body = scene.add.container(0, 0);
    this.c.add(this.body);

    /** 造一个骨骼:容器落在关节上,图片反向偏移,使自己的轴心正好压住容器原点。 */
    const bone = (part: string, at: { x: number; y: number }) => {
      const m = RIG.parts[part];
      const g = scene.add.container(at.x, at.y);
      g.add(scene.add.image(-m.px, -m.py, `hero_${part}`).setOrigin(0, 0));
      return g;
    };
    const J = (j: Joint) => RIG.joints[j];
    /** 子关节相对父关节的偏移 */
    const rel = (child: Joint, parent: Joint) => ({
      x: J(child).x - J(parent).x, y: J(child).y - J(parent).y,
    });

    /** 一条两段式肢体:上段挂在 root 关节,下段挂在上段里面 */
    const limb = (upper: string, lower: string, root: Joint, mid: Joint) => {
      const up = bone(upper, J(root));
      const lo = bone(lower, rel(mid, root));
      up.addAt(lo, 0);                     // 下段在上段之下(袖子盖住肘、大腿盖住膝)
      return [up, lo] as const;
    };

    /* 画序:远腿 → 远臂 → 近腿 → 躯干 → 近臂 → 头。
       躯干压在近腿之上,髋部圆盖就永远藏在衬衫下摆底下。 */
    [this.hipF, this.kneeF] = limb('thigh_far', 'shin_far', 'hip', 'knee');
    [this.shF, this.elF] = limb('arm_upper_far', 'arm_lower_far', 'shoulder', 'elbow');
    [this.hipN, this.kneeN] = limb('thigh', 'shin', 'hip', 'knee');
    const torso = bone('torso', J('hip'));
    [this.shN, this.elN] = limb('arm_upper', 'arm_lower', 'shoulder', 'elbow');
    this.head = bone('head', J('neck'));

    this.body.add([this.hipF, this.shF, this.hipN, torso, this.shN, this.head]);
  }

  update(dt: number, moving: boolean): void {
    this.amp += ((moving ? 1 : 0) - this.amp) * Math.min(1, dt / FADE);
    this.t += dt * (moving ? CYCLE_SPEED : IDLE_SPEED);

    const a = this.amp;
    const t = this.t;

    /* 腿:髋前后摆;膝只在"摆动相"弯曲 —— 支撑腿伸直撑住身体,
       抬起来的那条腿把小腿收一下才不会蹭地,这是走路好看的关键。 */
    const hip = (ph: number) => Math.sin(t + ph) * HIP_SWING * a;
    const knee = (ph: number) => Math.pow(Math.max(0, Math.sin(t + ph - 1.9)), 1.3) * KNEE_BEND * a;

    this.hipN.rotation = hip(0);
    this.kneeN.rotation = knee(0);
    this.hipF.rotation = hip(Math.PI);
    this.kneeF.rotation = knee(Math.PI);

    /* 手臂和同侧腿反相。肩摆幅刻意做小:躯干上印着的那条手臂只补过
       "会露出来的一圈",肩摆太大就会露到没补过的地方去。 */
    const sh = (ph: number) => Math.sin(t + ph) * SH_SWING * a;
    const el = (ph: number) => ELBOW_REST + Math.max(0, Math.sin(t + ph + 0.6)) * ELBOW_BEND * a;

    this.shN.rotation = sh(Math.PI);
    this.elN.rotation = el(Math.PI);
    this.shF.rotation = sh(0);
    this.elF.rotation = el(0);

    /* 起伏:两步一个周期。整体施加在 body 上,四肢才跟着一起浮沉不脱节。
       站立时换成极轻的呼吸。 */
    this.body.y = moving || a > 0.01
      ? -Math.abs(Math.sin(t)) * BOB * a
      : Math.sin(t) * 1.5;
    this.head.rotation = Math.sin(t * 2) * 0.02 * a;
  }

  /** 把所有部件染成同一个颜色 —— 第二幕门廊逆光剪影用 */
  silhouette(color = 0x2a2438, alpha = 0.92): void {
    this.c.iterate((o: Phaser.GameObjects.GameObject) => this.tintDeep(o, color));
    this.c.setAlpha(alpha);
  }

  private tintDeep(o: Phaser.GameObjects.GameObject, color: number): void {
    const any = o as any;
    if (any.setTint) any.setTint(color);
    if (any.iterate) any.iterate((ch: Phaser.GameObjects.GameObject) => this.tintDeep(ch, color));
  }

  setDirection(dir: number): void {
    if (dir === 0 || dir === this.dir) return;
    this.dir = dir;
    this.c.scaleX = Math.abs(this.c.scaleX) * dir;
  }

  /** 角色在母版像素里的总高,场景据此换算缩放 */
  static get height(): number { return RIG.height; }
}
