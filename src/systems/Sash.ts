import Phaser from 'phaser';

/**
 * 一扇可以真正开合的窗扇 —— 原画里切下来的那块,在 3D 里绕铰链转。
 *
 * 为什么不直接用 Phaser 的 Plane:Plane 只能绕自己的中心转,窗扇得绕边上的铰链转;
 * 而且它的透视参数(fov、panZ)和屏幕像素之间的换算很绕。
 * 这里自己做投影:
 *   1) 窗扇切成 NX×NY 的网格,每个顶点在"墙面坐标系"里有 (x, y, z),z 朝向观众;
 *   2) 绕铰链(一条竖直线)转 θ —— 内开窗,所以自由边往观众这边(+z)摆;
 *   3) 针孔透视投到屏幕:屏幕点 = 视点 + (P − 视点) · f / (f − z)。
 * 网格切细是为了贴图透视正确 —— 只用两个三角形的话,贴图是仿射插值,
 * 转到一半会沿对角线折出一道很明显的错位。
 *
 * Mesh 用正交投影 + 宽高 1,这样它不会再做任何变换,顶点坐标就是屏幕像素(相对 mesh 原点)。
 * 另外画一条窗扇自由边的"侧面"(木料厚度),转开时才看得出这是块有厚度的木头,不是纸片。
 */

const NX = 10, NY = 10;

export interface SashRect { x: number; y: number; w: number; h: number; hinge: 'left' | 'right' }

export class Sash {
  readonly mesh: Phaser.GameObjects.Mesh;
  readonly edge: Phaser.GameObjects.Graphics;
  private r: SashRect;
  private hx: number;            // 铰链的屏幕 x
  private eye: { x: number; y: number; f: number };
  private thick: number;
  /** Phaser 给每个三角形单独建顶点(不共享),vertices[n] 对应网格点 gridOf[n] */
  private gridOf: number[] = [];
  private gx = new Float32Array((NX + 1) * (NY + 1));
  private gy = new Float32Array((NX + 1) * (NY + 1));
  /** 0 = 关,1 = 开到最大 */
  open = 0;
  /** 开到最大时的角度(弧度) */
  maxAngle = Phaser.Math.DegToRad(62);

  constructor(scene: Phaser.Scene, key: string, r: SashRect,
              eye: { x: number; y: number; f: number }, thickness: number) {
    this.r = r;
    this.eye = eye;
    this.thick = thickness;
    this.hx = r.hinge === 'left' ? r.x : r.x + r.w;

    this.edge = scene.add.graphics();
    this.mesh = scene.add.mesh(0, 0, key);
    this.mesh.setOrtho(1, 1);
    this.mesh.setSize(1, 1);
    this.mesh.hideCCW = false;
    this.mesh.ignoreDirtyCache = true;

    /* 网格:顶点和 UV。贴图左右不翻 —— 铰链在右的那扇,u 照样是从左到右 */
    const verts: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        verts.push(0, 0);
        uvs.push(i / NX, j / NY);
      }
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.mesh.addVertices(verts, uvs, idx);
    this.gridOf = idx;
    this.layout();
  }

  /** 墙面上的点 (wx, wy) 绕铰链转 θ 后投到屏幕 */
  private project(wx: number, wy: number, theta: number, back = 0): [number, number, number] {
    /* d = 离铰链的水平距离(带符号:铰链在左时往右为正) */
    const sgn = this.r.hinge === 'left' ? 1 : -1;
    const d = (wx - this.hx) * sgn;
    /* 窗扇方向 (sgn·cosθ, sinθ),朝观众的法线 (−sgn·sinθ, cosθ);
       back:沿法线反方向(往墙里)退一个厚度,画侧面用 */
    const x = this.hx + sgn * (d * Math.cos(theta) + back * Math.sin(theta));
    const z = d * Math.sin(theta) - back * Math.cos(theta);
    const k = this.eye.f / (this.eye.f - z);
    return [this.eye.x + (x - this.eye.x) * k, this.eye.y + (wy - this.eye.y) * k, z];
  }

  /** 按 open 重算所有顶点;再画自由边的厚度面。每帧调一次。 */
  layout(): void {
    const th = Phaser.Math.Clamp(this.open, 0, 1.05) * this.maxAngle;
    const { x, y, w, h } = this.r;
    const v = this.mesh.vertices;
    /* 转开以后背光:越转越暗,颜色同时往原画的冷蓝阴影推 */
    const shade = 1 - 0.32 * Math.sin(th);
    const tint = Phaser.Display.Color.GetColor(
      Math.round(255 * shade * 0.94), Math.round(255 * shade * 0.97), Math.round(255 * shade));
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        const [sx, sy] = this.project(x + (w * i) / NX, y + (h * j) / NY, th);
        this.gx[j * (NX + 1) + i] = sx;
        this.gy[j * (NX + 1) + i] = sy;
      }
    }
    for (let n = 0; n < v.length; n++) {
      const g = this.gridOf[n];
      v[n].x = this.gx[g];
      v[n].y = -this.gy[g];       // Mesh 的 y 轴朝上
      v[n].color = tint;
    }

    /* 自由边的侧面:正面那条边 → 往墙里退一个厚度的那条边 */
    this.edge.clear();
    if (th < 0.02) return;
    const fx = this.r.hinge === 'left' ? x + w : x;
    const p1 = this.project(fx, y, th), p2 = this.project(fx, y + h, th);
    const p3 = this.project(fx, y + h, th, this.thick), p4 = this.project(fx, y, th, this.thick);
    const pts = [p1, p2, p3, p4].map(p => new Phaser.Geom.Point(p[0], p[1]));
    this.edge.fillStyle(0x1f3a48, 1);
    this.edge.fillPoints(pts, true);
    /* 受光的一道细边 + 墨线,和原画的木头一个画法 */
    this.edge.lineStyle(2, 0x5f8a96, 0.8);
    this.edge.lineBetween(p1[0], p1[1], p2[0], p2[1]);
    this.edge.lineStyle(2.5, 0x101418, 1);
    this.edge.strokePoints(pts, true);
  }

  /** 屏幕上这扇窗(关着时)的范围,用来做点击区 */
  get rect(): SashRect { return this.r; }

  setDepth(d: number): this {
    this.edge.setDepth(d);
    this.mesh.setDepth(d + 0.01);
    return this;
  }
}
