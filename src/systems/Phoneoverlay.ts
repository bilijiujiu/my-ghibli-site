import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 手机 social 覆盖层 · 盖在 DeskScene 之上。
 * 一块手机屏 + 2×2 图标网格(Instagram/邮箱/GitHub/LinkedIn)。
 * 点图标新标签打开链接。Esc / 点空白关闭。
 *
 * 用法(DeskScene):
 *   this.phone = new PhoneOverlay(this);
 *   this.phone.open();
 *   this.phone.isOpen / this.phone.close()
 *
 * 换真实链接:改下面 APPS 里的 url。
 */

interface AppIcon {
  key: string;
  label: string;
  texture: string;  // 图标图片的 key
  url: string;      // 链接(先占位 '#')
}

const APPS: AppIcon[] = [
  { key: 'instagram', label: 'Instagram', texture: 'icon_instagram', url: '#' },
  { key: 'email',     label: '邮箱',       texture: 'icon_gmail',     url: '#' },
  { key: 'github',    label: 'GitHub',    texture: 'icon_github',    url: '#' },
  { key: 'linkedin',  label: 'LinkedIn',  texture: 'icon_handshake', url: '#' },
];

/* 手机屏尺寸(逻辑像素) */
const PHONE_W = 300;
const PHONE_H = 600;

export class PhoneOverlay {
  private scene: Phaser.Scene;
  private root!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  isOpen = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    /* 遮罩:压暗桌面,点空白关闭 */
    this.scrim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0604, 0.6)
      .setScrollFactor(0).setDepth(2000).setInteractive();
    this.scrim.on('pointerdown', () => this.close());

    this.root = this.scene.add.container(W / 2, H / 2)
      .setScrollFactor(0).setDepth(2001);

    this.drawPhone();
    this.drawIcons();

    /* 弹出动画 */
    this.root.setScale(0.9).setAlpha(0);
    this.scene.tweens.add({
      targets: this.root, scale: 1, alpha: 1,
      duration: 260, ease: 'Back.easeOut',
    });
    this.scrim.setAlpha(0);
    this.scene.tweens.add({ targets: this.scrim, alpha: 0.6, duration: 220 });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.scene.tweens.add({
      targets: this.root, scale: 0.92, alpha: 0,
      duration: 180, ease: 'Quad.easeIn',
      onComplete: () => this.root.destroy(),
    });
    this.scene.tweens.add({
      targets: this.scrim, alpha: 0,
      duration: 180, onComplete: () => this.scrim.destroy(),
    });
  }

  /* ---------- 手机外形 ---------- */
  private drawPhone(): void {
    const g = this.scene.add.graphics();
    const halfW = PHONE_W / 2;
    const halfH = PHONE_H / 2;

    /* 手机投影 */
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(u(-halfW + 5), u(-halfH + 10), u(PHONE_W), u(PHONE_H), u(40));

    /* 机身:深色金属边框 */
    g.fillStyle(0x14141a, 1);
    g.fillRoundedRect(u(-halfW), u(-halfH), u(PHONE_W), u(PHONE_H), u(40));

    /* 边框高光(一圈细亮边,金属感) */
    g.lineStyle(u(1.5), 0x3a3a46, 0.8);
    g.strokeRoundedRect(u(-halfW), u(-halfH), u(PHONE_W), u(PHONE_H), u(40));

    this.root.add(g);

    /* 屏幕:暖色渐变壁纸(和小屋暖调呼应),用多层矩形模拟竖直渐变 */
    const pad = 12;
    const scrX = -halfW + pad;
    const scrY = -halfH + pad;
    const scrW = PHONE_W - pad * 2;
    const scrH = PHONE_H - pad * 2;

    const wallpaper = this.scene.add.graphics();
    /* 渐变:顶部暖橙 → 中部暖棕 → 底部深紫,分层叠 */
    const bands = 40;
    const top = { r: 0x3a, g: 0x2a, b: 0x24 };
    const bot = { r: 0x24, g: 0x1c, b: 0x2e };
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const r = Math.round(top.r + (bot.r - top.r) * t);
      const gg = Math.round(top.g + (bot.g - top.g) * t);
      const b = Math.round(top.b + (bot.b - top.b) * t);
      const color = (r << 16) | (gg << 8) | b;
      wallpaper.fillStyle(color, 1);
      wallpaper.fillRect(u(scrX), u(scrY + (scrH / bands) * i), u(scrW), u(scrH / bands) + 1);
    }
    this.root.add(wallpaper);

    /* 屏幕圆角遮罩(用描边盖住渐变的直角) —— 画一个圆角边框压在屏幕边缘 */
    const mask = this.scene.add.graphics();
    mask.lineStyle(u(pad + 2), 0x14141a, 1);
    mask.strokeRoundedRect(u(-halfW + pad / 2), u(-halfH + pad / 2), u(PHONE_W - pad), u(PHONE_H - pad), u(30));
    this.root.add(mask);

    /* 顶部刘海 */
    const notch = this.scene.add.graphics();
    notch.fillStyle(0x14141a, 1);
    notch.fillRoundedRect(u(-42), u(-halfH + pad + 2), u(84), u(24), u(12));
    this.root.add(notch);

    /* 状态栏:时间 + 信号/电量 */
    const statusY = -halfH + pad + 16;
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    const time = this.scene.add.text(u(scrX + 20), u(statusY), `${hh}:${mm}`, {
      fontFamily: '"Nunito", sans-serif', fontSize: `${13 * SCALE}px`, color: '#fff',
    }).setOrigin(0, 0.5);
    this.root.add(time);
    /* 右上角信号/电量小方块示意 */
    const sig = this.scene.add.text(u(scrX + scrW - 20), u(statusY), '📶 100%', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${11 * SCALE}px`, color: '#fff',
    }).setOrigin(1, 0.5);
    this.root.add(sig);

    /* 标题 */
    const title = this.scene.add.text(0, u(-halfH + 90), 'Say hi', {
      fontFamily: '"Nunito", sans-serif',
      fontSize: `${24 * SCALE}px`, fontStyle: 'bold', color: '#ffe8c8',
      shadow: { offsetX: 0, offsetY: 2, color: 'rgba(0,0,0,.4)', blur: 6, fill: true },
    }).setOrigin(0.5);
    this.root.add(title);

    /* 底部 home 横条 */
    const homeBar = this.scene.add.graphics();
    homeBar.fillStyle(0xffffff, 0.55);
    homeBar.fillRoundedRect(u(-45), u(halfH - pad - 14), u(90), u(5), u(2.5));
    this.root.add(homeBar);

    /* 屏幕左上高光(玻璃反光感) */
    const gloss = this.scene.add.graphics();
    gloss.fillStyle(0xffffff, 0.04);
    gloss.fillRoundedRect(u(scrX), u(scrY), u(scrW), u(scrH * 0.4), u(24));
    this.root.add(gloss);
  }

  /* ---------- 2×2 图标网格 ---------- */
  private drawIcons(): void {
    const iconSize = 88;      // 图标方块边长
    const gapX = 40;          // 横向间距
    const gapY = 56;          // 纵向间距
    const startX = -(iconSize + gapX) / 2;
    const startY = -30;       // 网格整体垂直位置

    APPS.forEach((app, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = startX + col * (iconSize + gapX);
      const cy = startY + row * (iconSize + gapY);

      /* 图标投影 */
      const shadow = this.scene.add.graphics();
      shadow.fillStyle(0x000000, 0.3);
      shadow.fillRoundedRect(u(cx - iconSize / 2 + 2), u(cy - iconSize / 2 + 5), u(iconSize), u(iconSize), u(22));
      this.root.add(shadow);

      /* 白色圆角卡片底板 */
      const card = this.scene.add.graphics();
      card.fillStyle(0xffffff, 1);
      card.fillRoundedRect(u(cx - iconSize / 2), u(cy - iconSize / 2), u(iconSize), u(iconSize), u(22));
      this.root.add(card);

      /* 黑色 logo 居中,缩到卡片的 55%(留白边,像 iOS 图标) */
      const img = this.scene.add.image(u(cx), u(cy), app.texture).setOrigin(0.5);
      const logoTarget = u(iconSize) * 0.55;
      const s = logoTarget / Math.max(img.width, img.height);
      img.setScale(s);
      this.root.add(img);

      /* App 名 */
      const name = this.scene.add.text(u(cx), u(cy + iconSize / 2 + 16), app.label, {
        fontFamily: '"Nunito", sans-serif',
        fontSize: `${13 * SCALE}px`, color: '#ddd',
      }).setOrigin(0.5);
      this.root.add(name);

      /* 点击热区 */
      const hit = this.scene.add.rectangle(u(cx), u(cy), u(iconSize), u(iconSize), 0xffffff, 0.001)
        .setInteractive({ useHandCursor: true });
      this.root.add(hit);

      /* 悬停:卡片和 logo 一起轻微放大 */
      hit.on('pointerover', () => {
        this.scene.tweens.add({ targets: card, scaleX: 1.06, scaleY: 1.06, duration: 150 });
        this.scene.tweens.add({ targets: img, scaleX: s * 1.06, scaleY: s * 1.06, duration: 150 });
      });
      hit.on('pointerout', () => {
        this.scene.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 150 });
        this.scene.tweens.add({ targets: img, scaleX: s, scaleY: s, duration: 150 });
      });
      hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation();
        if (app.url && app.url !== '#') {
          window.open(app.url, '_blank');
        } else {
          console.log('链接待填:', app.key);
        }
      });
    });
  }
}