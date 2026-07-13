import Phaser from 'phaser';
import { W, H, u, SCALE } from '../config/constants';

/**
 * 黑胶唱片机覆盖层 · 盖在 DeskScene 之上。
 * 旋转的黑胶唱片 + 唱臂 + 播放/暂停/上一首/下一首 + 歌单切换。
 * 音频用 HTML5 Audio 播放。Esc / 点空白关闭(并停止播放)。
 *
 * 用法(DeskScene):
 *   this.player = new RecordPlayerOverlay(this);
 *   this.player.open();
 *   this.player.isOpen / this.player.close()
 *   在 scene 的 update 里调用 this.player.update() 让唱片转
 *
 * 音频文件:public/song1.mp3 等。换歌改下面 TRACKS。
 */

interface Track {
  title: string;
  note: string;   // 一句话介绍
  file: string;   // public 下的路径
}

const TRACKS: Track[] = [
  { title: '第一首', note: '这首是……(占位)', file: '/song1.mp3' },
  { title: '第二首', note: '这首是……(占位)', file: '/song2.mp3' },
  { title: '第三首', note: '这首是……(占位)', file: '/song3.mp3' },
];

const DISC_R = 150;   // 唱片半径(逻辑像素)

export class RecordPlayerOverlay {
  private scene: Phaser.Scene;
  private root!: Phaser.GameObjects.Container;
  private scrim!: Phaser.GameObjects.Rectangle;
  isOpen = false;

  private disc!: Phaser.GameObjects.Container;   // 旋转的唱片
  private tonearm!: Phaser.GameObjects.Container; // 唱臂
  private playBtn!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private noteText!: Phaser.GameObjects.Text;

  private audio: HTMLAudioElement | null = null;
  private index = 0;
  private playing = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.index = 0;
    this.playing = false;

    this.scrim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x0a0604, 0.7)
      .setScrollFactor(0).setDepth(2000).setInteractive();
    this.scrim.on('pointerdown', () => this.close());

    this.root = this.scene.add.container(W / 2, H / 2)
      .setScrollFactor(0).setDepth(2001);

    this.drawPlayer();
    this.loadTrack(0, false);

    this.root.setScale(0.9).setAlpha(0);
    this.scene.tweens.add({ targets: this.root, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.scrim.setAlpha(0);
    this.scene.tweens.add({ targets: this.scrim, alpha: 0.7, duration: 220 });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stopAudio();
    this.scene.tweens.add({
      targets: this.root, scale: 0.92, alpha: 0, duration: 180, ease: 'Quad.easeIn',
      onComplete: () => this.root.destroy(),
    });
    this.scene.tweens.add({
      targets: this.scrim, alpha: 0, duration: 180, onComplete: () => this.scrim.destroy(),
    });
  }

  /* ---------- 画唱片机 ---------- */
  private drawPlayer(): void {
    /* 木质底座 */
    const base = this.scene.add.graphics();
    base.fillStyle(0x000000, 0.4);
    base.fillRoundedRect(u(-260 + 6), u(-230 + 8), u(520), u(460), u(24));
    base.fillStyle(0x5a3d28, 1);   // 暖木色
    base.fillRoundedRect(u(-260), u(-230), u(520), u(460), u(24));
    base.fillStyle(0x6b4a32, 1);
    base.fillRoundedRect(u(-248), u(-218), u(496), u(300), u(16));  // 台面
    this.root.add(base);

    /* 唱片(容器,会旋转) */
    this.disc = this.scene.add.container(u(-40), u(-70));
    const d = this.scene.add.graphics();
    /* 黑胶盘 */
    d.fillStyle(0x1a1a1a, 1);
    d.fillCircle(0, 0, u(DISC_R));
    /* 纹路 */
    d.lineStyle(u(1), 0x333333, 0.6);
    for (let r = 30; r < DISC_R; r += 12) d.strokeCircle(0, 0, u(r));
    /* 中心标签(暖色圆) */
    d.fillStyle(0xc8783c, 1);
    d.fillCircle(0, 0, u(42));
    /* 中心孔 */
    d.fillStyle(0x1a1a1a, 1);
    d.fillCircle(0, 0, u(5));
    this.disc.add(d);
    /* 一道白色扇形,让旋转看得出来 */
    const mark = this.scene.add.graphics();
    mark.fillStyle(0xffffff, 0.15);
    mark.slice(0, 0, u(DISC_R), Phaser.Math.DegToRad(-6), Phaser.Math.DegToRad(6), false);
    mark.fillPath();
    this.disc.add(mark);
    this.root.add(this.disc);

    /* 唱臂(从右上角伸向唱片) */
    this.tonearm = this.scene.add.container(u(150), u(-190));
    const arm = this.scene.add.graphics();
    arm.fillStyle(0x888888, 1);
    arm.fillCircle(0, 0, u(16));           // 转轴
    arm.lineStyle(u(8), 0xcccccc, 1);
    arm.lineBetween(0, 0, u(-70), u(90));  // 臂杆
    arm.fillStyle(0x444444, 1);
    arm.fillRoundedRect(u(-80), u(84), u(20), u(24), u(4));  // 唱头
    this.tonearm.add(arm);
    this.tonearm.setRotation(Phaser.Math.DegToRad(-25));  // 初始抬起
    this.root.add(this.tonearm);

    /* 歌名 + 介绍 */
    this.titleText = this.scene.add.text(0, u(110), '', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${22 * SCALE}px`,
      fontStyle: 'bold', color: '#ffe8c8',
    }).setOrigin(0.5);
    this.root.add(this.titleText);

    this.noteText = this.scene.add.text(0, u(142), '', {
      fontFamily: '"Nunito", sans-serif', fontSize: `${14 * SCALE}px`, color: '#d8c4a8',
    }).setOrigin(0.5);
    this.root.add(this.noteText);

    /* 控制按钮:上一首 / 播放暂停 / 下一首 */
    const mkBtn = (x: number, label: string, onClick: () => void, big = false) => {
      const t = this.scene.add.text(u(x), u(185), label, {
        fontFamily: '"Nunito", sans-serif',
        fontSize: `${(big ? 34 : 24) * SCALE}px`, color: '#ffe8c8',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.on('pointerdown', (_p: any, _x: any, _y: any, e: Phaser.Types.Input.EventData) => {
        e.stopPropagation(); onClick();
      });
      t.on('pointerover', () => t.setColor('#fff'));
      t.on('pointerout', () => t.setColor('#ffe8c8'));
      this.root.add(t);
      return t;
    };
    mkBtn(-70, '⏮', () => this.prev());
    this.playBtn = mkBtn(0, '▶', () => this.toggle(), true);
    mkBtn(70, '⏭', () => this.next());
  }

  /* ---------- 音频控制 ---------- */
  private loadTrack(i: number, autoplay: boolean): void {
    this.stopAudio();
    this.index = (i + TRACKS.length) % TRACKS.length;
    const t = TRACKS[this.index];
    this.titleText.setText(t.title);
    this.noteText.setText(t.note);

    this.audio = new Audio(t.file);
    this.audio.addEventListener('ended', () => this.next());

    if (autoplay) this.playAudio();
    else this.setPlaying(false);
  }

  private toggle(): void {
    if (this.playing) this.pauseAudio();
    else this.playAudio();
  }

  private playAudio(): void {
    if (!this.audio) return;
    this.audio.play().catch(err => console.log('播放失败(可能音频文件还没放):', err));
    this.setPlaying(true);
  }

  private pauseAudio(): void {
    this.audio?.pause();
    this.setPlaying(false);
  }

  private stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    this.setPlaying(false);
  }

  private setPlaying(p: boolean): void {
    this.playing = p;
    if (this.playBtn) this.playBtn.setText(p ? '⏸' : '▶');
    /* 唱臂:播放时落下,暂停时抬起 */
    if (this.tonearm) {
      this.scene.tweens.add({
        targets: this.tonearm,
        rotation: Phaser.Math.DegToRad(p ? -8 : -25),
        duration: 400, ease: 'Sine.easeInOut',
      });
    }
  }

  private next(): void { this.loadTrack(this.index + 1, this.playing); }
  private prev(): void { this.loadTrack(this.index - 1, this.playing); }

  /** 由场景 update 调用:播放时唱片旋转 */
  update(dt: number): void {
    if (this.isOpen && this.playing && this.disc) {
      this.disc.rotation += dt * 2.2;   // 转速
    }
  }
}