/** 触屏虚拟按键:DOM 按钮 → 全局状态,场景里读 touch.xxx */
export const touch = { left: false, right: false, up: false, down: false, e: false };

export function initTouch(): void {
  const map: Array<[string, keyof typeof touch]> = [
    ['btnL', 'left'], ['btnR', 'right'], ['btnU', 'up'], ['btnD', 'down'], ['btnE', 'e'],
  ];
  for (const [id, key] of map) {
    const el = document.getElementById(id);
    if (!el) continue;
    const on = (ev: Event) => { ev.preventDefault(); touch[key] = true; };
    const off = (ev: Event) => { ev.preventDefault(); touch[key] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
}
