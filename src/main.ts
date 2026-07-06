import Phaser from 'phaser';
import { W, H } from './config/constants';
import { initTouch, touch } from './input/touch';
import { TitleScene } from './scenes/TitleScene';
import { DressingScene } from './scenes/DressingScene';
import { RoomScene } from './scenes/RoomScene';

initTouch();
/* 让场景里能读到触屏状态(简单桥接;以后改成事件总线也行) */
(window as any).__touch = touch;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: '#1e1e22',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, DressingScene, RoomScene],
});
