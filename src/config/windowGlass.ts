/** 由 tools/make_window_room.py 生成,别手改。window_room.webp 里玻璃区域的外接矩形(画布像素)。 */
export const GLASS = {"x": 978, "y": 125, "w": 632, "h": 982};
/** 窗台石台面(画布像素):左右端点与台面高度 */
export const SILL = { x0: 901, x1: 1713, y: 1141 };
/** 两扇可开的窗扇在画布上的位置(贴图 public/sash_l.png / sash_r.png),hinge 是铰链那一侧 */
export const SASHES = {
  sash_l: { x: 989, y: 543, w: 302, h: 565, hinge: 'left' as const },
  sash_r: { x: 1321, y: 543, w: 286, h: 565, hinge: 'right' as const },
};
