import Phaser from 'phaser';
import { RunManager } from '../managers/RunManager';

// ── Layout ─────────────────────────────────────────────────────────
const W = 448;
const H = 552;   // grid(448) + hud(56) + stop-bar(48)

const LS_KEY = 'relicHunter_lastRun';

export type EndMode = 'success' | 'failure';

export interface EndSceneData {
    mode: EndMode;
    floor: number;
}

export class EndScene extends Phaser.Scene {
    constructor() {
        super({ key: 'EndScene' });
    }

    create(data: EndSceneData) {
        const run = RunManager.getInstance();
        const isSuccess = data.mode === 'success';

        // ── Persist or clear runBag ──────────────────────────────
        if (isSuccess) {
            try {
                const saved = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as string[];
                const merged = [...saved, ...run.runBag];
                localStorage.setItem(LS_KEY, JSON.stringify(merged));
            } catch {/* ignore storage errors */ }
        }

        // ── Background ───────────────────────────────────────────
        this.cameras.main.setBackgroundColor(isSuccess ? '#0a1628' : '#1a0808');

        // Animated vignette background glow
        const glowColor = isSuccess ? 0x1e3a5f : 0x3a0f0f;
        this.add.rectangle(W / 2, H / 2, W, H, glowColor, 0.5);

        // ── Header ───────────────────────────────────────────────
        const titleText = isSuccess ? '🏆 Treasures Collected!' : '💀 Run Failed';
        const titleColor = isSuccess ? '#f1c40f' : '#e74c3c';

        this.add.text(W / 2, 60, titleText, {
            fontFamily: 'monospace',
            fontSize: '20px',
            color: titleColor,
            stroke: '#000',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(W / 2, 100, isSuccess
            ? `You survived ${data.floor} floor${data.floor !== 1 ? 's' : ''}!`
            : 'The dungeon claims another life...', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#aaaacc',
        }).setOrigin(0.5);

        // ── Stats panel ──────────────────────────────────────────
        const panelY = 130;
        this.add.rectangle(W / 2, panelY + 60, 360, 108, 0x0a0a1a, 0.8)
            .setStrokeStyle(1, 0x334455);

        const stats = [
            `🏚 Floor Reached  :  ${data.floor}`,
            `❤  HP Remaining   :  ${run.hp}`,
            `🛡  Durability Left :  ${run.durability}`,
        ];
        stats.forEach((line, i) => {
            this.add.text(W / 2, panelY + 16 + i * 28, line, {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#c0c8e0',
            }).setOrigin(0.5);
        });

        // ── Loot list ────────────────────────────────────────────
        const lootY = 270;
        this.add.text(W / 2, lootY, isSuccess ? '🎒 Loot Saved to Vault:' : '🎒 Loot Lost:', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: isSuccess ? '#e0aaff' : '#cc6666',
        }).setOrigin(0.5);

        const bag = run.runBag;
        if (bag.length === 0) {
            this.add.text(W / 2, lootY + 28, '— Nothing collected —', {
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#666688',
            }).setOrigin(0.5);
        } else {
            // Tally counts
            const counts = bag.reduce<Record<string, number>>((acc, item) => {
                acc[item] = (acc[item] ?? 0) + 1;
                return acc;
            }, {});
            const lines = Object.entries(counts).map(([k, v]) => `${k}  ×${v}`);
            lines.forEach((line, i) => {
                this.add.text(W / 2, lootY + 28 + i * 24, line, {
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#aaddaa',
                }).setOrigin(0.5);
            });
        }

        // ── localStorage notice ──────────────────────────────────
        if (isSuccess) {
            this.add.text(W / 2, H - 120, '💾 Loot saved to localStorage', {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#666688',
            }).setOrigin(0.5);
        }

        // ── Play Again button ─────────────────────────────────────
        const btnY = H - 72;
        const btn = this.add.rectangle(W / 2, btnY, 200, 42, 0x2d1b69)
            .setStrokeStyle(2, 0x9b59b6)
            .setInteractive({ useHandCursor: true });

        const btnText = this.add.text(W / 2, btnY, '▶  Play Again', {
            fontFamily: 'monospace',
            fontSize: '15px',
            color: '#e0aaff',
            stroke: '#000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        // Hover pulse
        btn.on('pointerover', () => btn.setFillStyle(0x4a2d9c));
        btn.on('pointerout', () => btn.setFillStyle(0x2d1b69));

        btn.on('pointerdown', () => {
            // Reset RunManager state
            run.reset();
            // Clear loot on failure
            if (!isSuccess) run.runBag = [];

            // Fade out and restart GameScene
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start('GameScene');
            });
        });

        // Entrance tween for the button
        btnText.setAlpha(0);
        btn.setAlpha(0);
        this.tweens.add({
            targets: [btn, btnText],
            alpha: 1,
            duration: 600,
            delay: 400,
            ease: 'Sine.easeOut',
        });

        // Entrance: fade in whole scene
        this.cameras.main.fadeIn(500, 0, 0, 0);
    }
}
