import Phaser from 'phaser';
import { OUTFITS } from '../config/outfits';

/**
 * 角色(占位小人)。
 * 换真实美术:内部改成 body/outfit 两个叠放的 sprite + 帧动画,
 * 对外接口(x/y/dir/update/setOutfit/lean/stand)保持不变,场景代码零改动。
 */
export class Hero {
  scene: Phaser.Scene;
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  dir = 1;
  private walkT = 0;

  private shadow!: Phaser.GameObjects.Ellipse;
  private legL!: Phaser.GameObjects.Rectangle;
  private legR!: Phaser.GameObjects.Rectangle;
  private skirt!: Phaser.GameObjects.Triangle;
  private apron!: Phaser.GameObjects.Triangle;
  private torso!: Phaser.GameObjects.Rectangle;
  private arm!: Phaser.GameObjects.Rectangle;
  private head!: Phaser.GameObjects.Arc;
  private hair!: Phaser.GameObjects.Arc;
  private bang!: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, outfitIdx = 0) {
    this.scene = scene;
    this.x = x;
    this.y = y;

    const c = scene.add.container(x, y);
    this.c = c;
    this.shadow = scene.add.ellipse(0, 2, 54, 12, 0x000000, 0.22);
    this.legL = scene.add.rectangle(-7, -34, 9, 34, 0x6b4a3a).setOrigin(0.5, 0);
    this.legR = scene.add.rectangle(7, -34, 9, 34, 0x5d3f31).setOrigin(0.5, 0);
    this.skirt = scene.add.triangle(0, -30, 0, 0, 44, 34, -44, 34, 0x3f7f74).setOrigin(0.5, 1);
    this.apron = scene.add.triangle(0, -32, 0, 0, 26, 28, -26, 28, 0xf3ead8).setOrigin(0.5, 1);
    this.torso = scene.add.rectangle(0, -78, 30, 30, 0xd6913c).setOrigin(0.5, 0);
    this.arm = scene.add.rectangle(14, -76, 8, 26, 0xc5822f).setOrigin(0.5, 0);
    this.head = scene.add.circle(0, -92, 15, 0xf0c9a2);
    this.hair = scene.add.arc(0, -96, 16, 160, 20, true, 0x6b4226);
    this.bang = scene.add.rectangle(6, -100, 18, 8, 0x6b4226);
    c.add([this.shadow, this.legL, this.legR, this.skirt, this.apron,
           this.torso, this.arm, this.head, this.hair, this.bang]);

    this.setOutfit(outfitIdx);
  }

  /** 换装核心 —— 真实美术版改为切换贴图/动画前缀 */
  setOutfit(i: number): void {
    const o = OUTFITS[i];
    this.torso.setFillStyle(o.shirt);
    this.arm.setFillStyle(Phaser.Display.Color.IntegerToColor(o.shirt).darken(12).color);
    this.skirt.setFillStyle(o.skirt);
    this.hair.setFillStyle(o.hair);
    this.bang.setFillStyle(o.hair);
  }

  /** 倚靠姿势(第二幕) */
  lean(): void { this.c.angle = -8; this.legR.x = 12; }
  stand(): void { this.c.angle = 0; this.legR.x = 7; }

  /**
   * @param dx -1/0/1 横向  @param dy -1/0/1 纵深
   * @param speed 传 0 表示位移由外部 tween 驱动,这里只播动画
   */
  update(dt: number, dx: number, dy: number, speed: number, depthFactor = 0.55): void {
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      if (dx !== 0) this.dir = dx;
      this.x += speed * dx * dt;
      this.y += speed * depthFactor * dy * dt;
      this.walkT += dt * 10;
      this.legL.rotation = Math.sin(this.walkT) * 0.55;
      this.legR.rotation = Math.sin(this.walkT + Math.PI) * 0.55;
      this.arm.rotation = Math.sin(this.walkT + Math.PI) * 0.4;
    } else {
      this.legL.rotation = this.legR.rotation = this.arm.rotation = 0;
    }
    this.c.x = this.x;
    this.c.y = this.y - (moving ? Math.abs(Math.sin(this.walkT)) * 3 : 0);
    this.c.scaleX = this.dir;
  }
}
