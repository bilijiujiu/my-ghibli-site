/* 由 build_rig.py 自动生成,请勿手改。改切图请改脚本后重跑。 */
export interface PartMeta { w: number; h: number; px: number; py: number }
export const RIG = {
  /** 关节坐标,原点 = 脚底中心(角色站立时的锚点) */
  joints: {
    neck: { x: 7, y: -956 },
    shoulder: { x: 11, y: -888 },
    elbow: { x: 7, y: -668 },
    hip: { x: 0, y: -562 },
    knee: { x: 5, y: -310 },
  },
  /** 每张切图的尺寸,以及轴心相对该图左上角的偏移 */
  parts: {
    torso: { w: 241, h: 494, px: 118, py: 454 },
    head: { w: 241, h: 269, px: 99, py: 228 },
    arm_upper: { w: 134, h: 353, px: 90, py: 53 },
    arm_upper_far: { w: 129, h: 347, px: 85, py: 53 },
    arm_lower: { w: 149, h: 335, px: 78, py: 80 },
    arm_lower_far: { w: 149, h: 335, px: 78, py: 80 },
    thigh: { w: 172, h: 471, px: 93, py: 99 },
    thigh_far: { w: 172, h: 471, px: 93, py: 99 },
    shin: { w: 244, h: 431, px: 98, py: 120 },
    shin_far: { w: 244, h: 431, px: 98, py: 120 },
  } as Record<string, PartMeta>,
  height: 1184,
} as const;

export type PartName = keyof typeof RIG.parts;

