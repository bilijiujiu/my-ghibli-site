import Phaser from 'phaser';

/**
 * 剪纸动画角色骨架(Cut-out rig)。
 * 四个部件从同一张 800×1200 母版切出,位置天然对齐。
 *
 * 关键技巧:每个要旋转的部件放进一个"关节容器"。
 *   - 关节容器位于旋转轴心
 *   - 图片在容器里反向偏移,回到原来的位置
 *   - 旋转容器 = 绕轴心旋转
 */

/* ===== 动画参数 ===== */
const WALK_SPEED = 7;
const ARM_SWING = 0.35;
const LEG_SWING = 0.30;
const BODY_BOB = 4;
const IDLE_BREATH = 1.2;

/* ===== 关节位置(相对 800×1200 画布中心的偏移,像素) =====
   画布中心是 (400, 600)。
   下面的数值 = 关节实际像素坐标 - 画布中心。先猜后调。 */
const SHOULDER = { x: 0, y: -270 };   // 肩关节:大约在画布 y=330 处
const HIP = { x: 0, y: -20 };         // 髋关节:大约在画布 y=580 处
const NECK = { x: 0, y: -330 };       // 脖子:大约在画布 y=270 处

const FAR_TINT = 0x9a9ab0;

export class HeroRig {
  scene: Phaser.Scene;
  c: Phaser.GameObjects.Container;

  private headJoint!: Phaser.GameObjects.Container;
  private armNearJoint!: Phaser.GameObjects.Container;
  private armFarJoint!: Phaser.GameObjects.Container;
  private legNearJoint!: Phaser.GameObjects.Container;
  private legFarJoint!: Phaser.GameObjects.Container;
  private torso!: Phaser.GameObjects.Image;
  private head!: Phaser.GameObjects.Image;

  private walkT = 0;
  private dir = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.c = scene.add.container(x, y);

    /**
     * 造一个关节:容器在轴心位置,图片反向偏移回到原位。
     */
    const makeJoint = (key: string, joint: { x: number; y: number }, tint?: number) => {
      const container = scene.add.container(joint.x, joint.y);
      const img = scene.add.image(-joint.x, -joint.y, key).setOrigin(0.5, 0.5);
      if (tint !== undefined) img.setTint(tint);
      container.add(img);
      return container;
    };

    /* 从后到前 */
    this.armFarJoint  = makeJoint('hero_arm', SHOULDER, FAR_TINT);
    this.legFarJoint  = makeJoint('hero_leg', HIP, FAR_TINT);

    this.torso = scene.add.image(0, 0, 'hero_torso').setOrigin(0.5, 0.5);

    this.legNearJoint = makeJoint('hero_leg', HIP);
    this.armNearJoint = makeJoint('hero_arm', SHOULDER);
    this.headJoint    = makeJoint('hero_head', NECK);
    this.head = this.headJoint.list[0] as Phaser.GameObjects.Image;

    this.c.add([
      this.armFarJoint,
      this.legFarJoint,
      this.torso,
      this.legNearJoint,
      this.armNearJoint,
      this.headJoint,
    ]);
  }

  update(dt: number, moving: boolean): void {
    this.walkT += dt * (moving ? WALK_SPEED : IDLE_BREATH);

    const armSwing = moving ? ARM_SWING : 0.04;
    const legSwing = moving ? LEG_SWING : 0;

    /* 手臂前后摆,相位相反 */
    this.armNearJoint.rotation = Math.sin(this.walkT) * armSwing;
    this.armFarJoint.rotation  = Math.sin(this.walkT + Math.PI) * armSwing;

    /* 腿前后摆,和同侧手臂反向 */
    this.legNearJoint.rotation = Math.sin(this.walkT + Math.PI) * legSwing;
    this.legFarJoint.rotation  = Math.sin(this.walkT) * legSwing;

    /* 身体上下起伏 */
    const bob = moving
      ? Math.abs(Math.sin(this.walkT)) * BODY_BOB
      : Math.sin(this.walkT) * 1.5;
    this.torso.y = -bob;
    this.headJoint.y = NECK.y - bob;

    /* 头微微点动 */
    this.headJoint.rotation = Math.sin(this.walkT) * 0.015;
  }

  setDirection(dir: number): void {
    if (dir === 0 || dir === this.dir) return;
    this.dir = dir;
    this.c.scaleX = Math.abs(this.c.scaleX) * dir;
  }
}