import Phaser from 'phaser';
import { W, H } from '../config/constants';

/**
 * 简易对话弹层。阶段 4 会升级为 DOM 覆盖层(内容可复制、SEO 可见),
 * 到时只需改这个文件,场景调用方式不变。
 */
export class Dialog {
  private scene: Phaser.Scene;
  private g: Phaser.GameObjects.Container | null = null;
  isOpen = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(title: string, body: string): void {
    this.isOpen = true;
    const s = this.scene;
    const g = s.add.container(0, 0).setDepth(1000);
    g.add([
      s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.45),
      s.add.rectangle(W / 2, H / 2, 560, 230, 0xf7efdc).setStrokeStyle(3, 0x8a6b4a),
      s.add.text(W / 2, H / 2 - 76, title, { fontSize: '22px', fontStyle: 'bold', color: '#4a3826' }).setOrigin(0.5),
      s.add.text(W / 2, H / 2 - 32, body, { fontSize: '15px', color: '#5a4a38', wordWrap: { width: 480 }, lineSpacing: 8 }).setOrigin(0.5, 0),
      s.add.text(W / 2, H / 2 + 88, '按 E 关闭', { fontSize: '13px', color: '#9a8468' }).setOrigin(0.5),
    ]);
    this.g = g;
  }

  close(): void {
    this.g?.destroy();
    this.g = null;
    this.isOpen = false;
  }
}
