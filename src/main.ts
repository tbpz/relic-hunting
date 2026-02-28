import Phaser from 'phaser';
import { GameScene, CANVAS_W, CANVAS_H } from './scenes/GameScene';
import { DigScene } from './scenes/DigScene';
import { EndScene } from './scenes/EndScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_W,   // 448
  height: CANVAS_H,  // 552  (grid 448 + HUD 56 + stop-bar 48)
  backgroundColor: '#0d0d1a',
  pixelArt: true,
  scene: [GameScene, DigScene, EndScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    parent: 'game-container',
    // Respect the full viewport height on mobile
    width: CANVAS_W,
    height: CANVAS_H,
  },
};

new Phaser.Game(config);
