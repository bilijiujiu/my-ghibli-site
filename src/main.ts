import Phaser from 'phaser';
import { W, H } from './config/constants';
import { initTouch, touch } from './input/touch';
import { TitleScene } from './scenes/TitleScene';
import { DressingScene } from './scenes/DressingScene';
import { RoomScene } from './scenes/RoomScene';
import { FireplaceScene } from './scenes/FireplaceScene';
import { DeskScene } from './scenes/DeskScene';

initTouch();
(window as any).__touch = touch;

/* 等所有 web 字体就绪再启动,避免用回退字体(Courier)渲染 */
document.fonts.ready.catch(() => {}).then(() => {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#1e1e22',
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [TitleScene, DressingScene, RoomScene, FireplaceScene, DeskScene],
  });
});