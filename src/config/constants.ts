/** 画布与移动的全局常量 —— 改数值只改这里 */
export const W = 1280;
export const H = 620;

/** 角色移动速度 px/s;纵深方向乘以 DEPTH_FACTOR */
export const SPEED = 260;
export const DEPTH_FACTOR = 0.55;

/** 第三幕室内的可行走范围(对应 design.md 表①) */
export const ROOM_BOUNDS = { minX: 70, maxX: W - 70, minY: 405, maxY: 585 };
