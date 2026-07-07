/** 画布与移动的全局常量 —— 改数值只改这里 */
export const SCALE = 2;
export const W = 1280 * SCALE;
export const H = 620 * SCALE;

/** 逻辑坐标 → 画布坐标换算 */
export const u = (n: number) => n * SCALE;

/** 角色移动速度 px/s;纵深方向乘以 DEPTH_FACTOR */
export const SPEED = 260 * SCALE;
export const DEPTH_FACTOR = 0.55;

/** 第三幕室内的可行走范围(对应 design.md 表①) */
export const ROOM_BOUNDS = {
  minX: u(70), maxX: W - u(70), minY: u(405), maxY: u(585),
};