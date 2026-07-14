import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 成就系统 · 全局共享,跨场景。
 *
 * - Achievements: 静态类,管定义 + 解锁状态 + localStorage 持久化。
 *   任意场景调用 Achievements.unlock('fire', scene) 解锁并弹幕。
 * - AchievementPanel: Tab 打开的成就目录(每个场景 new 一个,监听 Tab)。
 *
 * 用法(在每个需要成就的场景 create() 里):
 *   this.achPanel = new AchievementPanel(this);   // 自动监听 Tab
 * 解锁(在互动处):
 *   Achievements.unlock('fire', this);
 */

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;   // 用 emoji 当图标,简单
}

/* 所有成就定义。加新成就就往这里加一条。 */
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'fire',    name: '生火者',   desc: '点燃了壁炉的火',       icon: '🔥' },
  { id: 'book',    name: '阅读者',   desc: '翻开了书架上的简历',   icon: '📖' },
  { id: 'music',   name: '聆听者',   desc: '在唱片机上听了一首歌', icon: '🎵' },
  { id: 'social',  name: '联络者',   desc: '打开了手机上的联系方式', icon: '📱' },
  { id: 'window',  name: '远眺者',   desc: '望向了窗外',           icon: '🌙' },
  { id: 'stairs',  name: '探路者',   desc: '走上了楼梯',           icon: '🪜' },
];

const STORAGE_KEY = 'ghibli_achievements';

export class Achievements {
  private static unlocked: Set<string> | null = null;

  /** 读 localStorage(首次调用时加载) */
  private static load(): Set<string> {
    if (this.unlocked) return this.unlocked;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      this.unlocked = new Set(raw ? JSON.parse(raw) : []);
    } catch {
      this.unlocked = new Set();
    }
    return this.unlocked;
  }

  private static save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.load()]));
    } catch { /* localStorage 不可用就算了 */ }
  }

  static isUnlocked(id: string): boolean {
    return this.load().has(id);
  }

  static unlockedCount(): number {
    return this.load().size;
  }

  /** 解锁成就。已解锁则不重复弹幕。scene 用来显示弹幕。 */
  static unlock(id: string, scene: Phaser.Scene): void {
    const set = this.load();
    if (set.has(id)) return;   // 已解锁,不重复
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (!def) { console.warn('未知成就:', id); return; }
    set.add(id);
    this.save();
    new AchievementToast(scene, def);
  }

  /** 调试用:清空所有成就 */
  static reset(): void {
    this.unlocked = new Set();
    this.save();
  }
}

/* ---------------- 解锁弹幕 ---------------- */
class AchievementToast {
  constructor(scene: Phaser.Scene, def: AchievementDef) {
    const cardW = 300;
    const cardH = 76;
    const margin = 24;
    /* 右上角滑入 */
    const startX = W + cardW;
    const targetX = W - cardW / 2 - margin;
    const y = margin + cardH / 2;

    const c = scene.add.container(startX, y).setScrollFactor(0).setDepth(3000);

    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.4);
    bg.fillRoundedRect(u(-cardW / 2 + 3), u(-cardH / 2 + 4), u(cardW), u(cardH), u(14));
    bg.fillStyle(0x2a1f16, 0.96);
    bg.fillRoundedRect(u(-cardW / 2), u(-cardH / 2), u(cardW), u(cardH), u(14));
    bg.lineStyle(u(2), 0xc8783c, 0.9);
    bg.strokeRoundedRect(u(-cardW / 2), u(-cardH / 2), u(cardW), u(cardH), u(14));
    c.add(bg);

    const icon = scene.add.text(u(-cardW / 2 + 34), 0, def.icon, {
      fontSize: `${30 * SCALE}px`,
    }).setOrigin(0.5);
    c.add(icon);

    const label = scene.add.text(u(-cardW / 2 + 64), u(-14), '解锁成就', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${12 * SCALE}px`, color: '#c8a880',
    }).setOrigin(0, 0.5);
    c.add(label);

    const name = scene.add.text(u(-cardW / 2 + 64), u(10), `${def.name} · ${def.desc}`, {
      fontFamily: '"Nunito", sans-serif', fontSize: `${14 * SCALE}px`,
      fontStyle: 'bold', color: '#ffe8c8',
    }).setOrigin(0, 0.5);
    c.add(name);

    /* 滑入 → 停留 → 滑出 */
    scene.tweens.add({ targets: c, x: targetX, duration: 400, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: c, x: startX, duration: 400, ease: 'Quad.easeIn',
      delay: 3200,
      onComplete: () => c.destroy(),
    });
  }
}

/* ---------------- 成就目录(Tab 打开) ---------------- */
export class AchievementPanel {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container | null = null;
  private entry!: Phaser.GameObjects.Container;
  isOpen = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    /* 右上角常驻入口:暖木底圆 + 暖橙描边 + 奖杯图标 */
    this.buildEntry();

    /* 监听 Tab 键切换 */
    const tabKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    tabKey.on('down', (e: KeyboardEvent) => {
      (e as any).preventDefault?.();
      this.toggle();
    });
  }

  private buildEntry(): void {
    const size = 46;                 // 图标圆牌直径
    const margin = 22;
    const x = W - margin - u(size / 2);
    const y = margin + u(size / 2);

    this.entry = this.scene.add.container(x, y).setScrollFactor(0).setDepth(1500);

    const g = this.scene.add.graphics();
    g.fillStyle(0x000000, 0.35);
    g.fillCircle(u(2), u(3), u(size / 2));            // 投影
    g.fillStyle(0x2a1f16, 0.95);                     // 暖木底
    g.fillCircle(0, 0, u(size / 2));
    g.lineStyle(u(2), 0xc8783c, 0.9);                // 暖橙描边
    g.strokeCircle(0, 0, u(size / 2));
    this.entry.add(g);

    const icon = this.scene.add.text(0, 0, '🏆', { fontSize: `${22 * SCALE}px` }).setOrigin(0.5);
    this.entry.add(icon);

    /* 点击热区 */
    const hit = this.scene.add.circle(0, 0, u(size / 2), 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    this.entry.add(hit);
    hit.on('pointerover', () => this.scene.tweens.add({ targets: this.entry, scale: 1.1, duration: 150 }));
    hit.on('pointerout', () => this.scene.tweens.add({ targets: this.entry, scale: 1, duration: 150 }));
    hit.on('pointerdown', (_p: any, _x: any, _y: any, e: Phaser.Types.Input.EventData) => {
      e.stopPropagation();
      this.toggle();
    });
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    this.entry.setVisible(false);   // 打开目录时藏入口

    const scrim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0604, 0.75)
      .setScrollFactor(0).setDepth(2500).setInteractive();
    scrim.on('pointerdown', () => this.close());

    this.root = this.scene.add.container(W / 2, H / 2).setScrollFactor(0).setDepth(2501);
    (this.root as any)._scrim = scrim;

    /* 标题 + 进度 */
    const total = ACHIEVEMENTS.length;
    const got = Achievements.unlockedCount();
    const title = this.scene.add.text(0, u(-H / (2 * SCALE) + 70), `成就  ${got}/${total}`, {
      fontFamily: '"Nunito", sans-serif', fontSize: `${28 * SCALE}px`,
      fontStyle: 'bold', color: '#ffe8c8',
    }).setOrigin(0.5);
    this.root.add(title);

    /* 成就列表:每行一个 */
    const rowH = 72;
    const listW = 460;
    const startY = -((ACHIEVEMENTS.length - 1) * rowH) / 2 + 10;

    ACHIEVEMENTS.forEach((def, i) => {
      const y = startY + i * rowH;
      const unlocked = Achievements.isUnlocked(def.id);

      const row = this.scene.add.graphics();
      row.fillStyle(unlocked ? 0x2a1f16 : 0x1a1a1e, 0.9);
      row.fillRoundedRect(u(-listW / 2), u(y - rowH / 2 + 6), u(listW), u(rowH - 12), u(12));
      if (unlocked) {
        row.lineStyle(u(1.5), 0xc8783c, 0.7);
        row.strokeRoundedRect(u(-listW / 2), u(y - rowH / 2 + 6), u(listW), u(rowH - 12), u(12));
      }
      this.root!.add(row);

      /* 图标(未解锁显示问号) */
      const icon = this.scene.add.text(u(-listW / 2 + 44), u(y), unlocked ? def.icon : '❓', {
        fontSize: `${28 * SCALE}px`,
      }).setOrigin(0.5).setAlpha(unlocked ? 1 : 0.4);
      this.root!.add(icon);

      /* 名字 + 描述(未解锁显示 ???) */
      const name = this.scene.add.text(u(-listW / 2 + 84), u(y - 12),
        unlocked ? def.name : '???', {
        fontFamily: '"Nunito", sans-serif', fontSize: `${17 * SCALE}px`,
        fontStyle: 'bold', color: unlocked ? '#ffe8c8' : '#666',
      }).setOrigin(0, 0.5);
      this.root!.add(name);

      const desc = this.scene.add.text(u(-listW / 2 + 84), u(y + 12),
        unlocked ? def.desc : '尚未解锁', {
        fontFamily: '"Nunito", sans-serif', fontSize: `${13 * SCALE}px`,
        color: unlocked ? '#c8a880' : '#555',
      }).setOrigin(0, 0.5);
      this.root!.add(desc);
    });

    /* 底部提示 */
    const hint = this.scene.add.text(0, u(H / (2 * SCALE) - 60), 'Tab 关闭', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${14 * SCALE}px`, color: '#c8a880',
    }).setOrigin(0.5);
    this.root.add(hint);

    /* 弹入动画 */
    this.root.setScale(0.94).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
    scrim.setAlpha(0);
    this.scene.tweens.add({ targets: scrim, alpha: 0.75, duration: 200 });
  }

  close(): void {
    if (!this.isOpen || !this.root) return;
    this.isOpen = false;
    this.entry.setVisible(true);   // 恢复入口
    const scrim = (this.root as any)._scrim as Phaser.GameObjects.Rectangle;
    this.scene.tweens.add({
      targets: this.root, scale: 0.94, alpha: 0, duration: 160,
      onComplete: () => { this.root?.destroy(); this.root = null; },
    });
    if (scrim) this.scene.tweens.add({ targets: scrim, alpha: 0, duration: 160, onComplete: () => scrim.destroy() });
  }
}