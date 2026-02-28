import Phaser from 'phaser';

// ─────────────────────── Layout constants ──────────────────────────
const W = 448;   // canvas width
const H = 568;   // canvas height (grid 448 + HUD 72 + stop-bar 48)

const PANEL_W = 380;
const PANEL_H = 210;
const PANEL_X = (W - PANEL_W) / 2;   // 34
const PANEL_Y = (H - PANEL_H) / 2;   // 147

const BAR_PADDING = 24;              // space from panel edges to bar
const BAR_X = PANEL_X + BAR_PADDING;
const BAR_W = PANEL_W - BAR_PADDING * 2;  // 332
const BAR_H = 36;
const BAR_Y = PANEL_Y + 100;        // vertical centre inside panel

const MAX_TAPS = 5;
const CURSOR_DURATION_MS = 900;     // time for one sweep
const INITIAL_ZONE_W = 80;          // shrinks 10% every tap

// ── Events emitted on game.events ──────────────────────────────────
export const DIG_COMPLETE = 'DIG_COMPLETE';

interface DigResult {
    combo: number;
}

export class DigScene extends Phaser.Scene {
    // ─── bar drawing ───────────────────────────────────────────────
    private gfx!: Phaser.GameObjects.Graphics;

    // ─── cursor state (driven by tween target) ─────────────────────
    private cursorState = { x: BAR_X };
    private cursorTween!: Phaser.Tweens.Tween;

    // ─── perfect zone ──────────────────────────────────────────────
    private zoneX: number = BAR_X + (BAR_W - INITIAL_ZONE_W) / 2;
    private zoneW: number = INITIAL_ZONE_W;

    // ─── tap state ─────────────────────────────────────────────────
    private tapCount: number = 0;
    private combo: number = 0;
    private isComplete: boolean = false;

    // ─── text refs ─────────────────────────────────────────────────
    private statusText!: Phaser.GameObjects.Text;
    private tapCountText!: Phaser.GameObjects.Text;
    private feedbackText!: Phaser.GameObjects.Text;

    constructor() {
        super({ key: 'DigScene' });
    }

    /* ──────────────────────────── create ─────────────────────────── */
    create() {
        this.isComplete = false;
        this.tapCount = 0;
        this.combo = 0;
        this.zoneX = BAR_X + (BAR_W - INITIAL_ZONE_W) / 2;
        this.zoneW = INITIAL_ZONE_W;

        this.buildBackground();
        this.buildUI();
        this.gfx = this.add.graphics();
        this.drawBar();
        this.startCursor();

        // Capture ALL pointer input (blocks GameScene clicks while open)
        this.input.on('pointerdown', this.handleTap, this);
    }

    /* ─────────────────────── Background + panel ──────────────────── */

    private buildBackground() {
        // Dim the game world behind
        this.add.rectangle(W / 2, H / 2, W, H, 0x3d2b1f, 0.72).setDepth(0);

        // Panel
        const panel = this.add.rectangle(
            PANEL_X + PANEL_W / 2,
            PANEL_Y + PANEL_H / 2,
            PANEL_W,
            PANEL_H,
            0x5c4033
        ).setDepth(1);
        panel.setStrokeStyle(2, 0xc9a96e);

        // Panel glow effect — drawn as a slightly larger rect behind
        this.add.rectangle(
            PANEL_X + PANEL_W / 2,
            PANEL_Y + PANEL_H / 2,
            PANEL_W + 6,
            PANEL_H + 6,
            0xc9a96e,
            0.25
        ).setDepth(0);
    }

    private buildUI() {
        const cx = W / 2;

        // Title
        this.add.text(cx, PANEL_Y + 18, '⛏  DIGGING', {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#f5e6c8',
            stroke: '#2b1d0e',
            strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(2);

        // Tap counter
        this.tapCountText = this.add.text(cx, BAR_Y + BAR_H + 12, '', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#d4c4a0',
        }).setOrigin(0.5, 0).setDepth(2);

        // Status / combo
        this.statusText = this.add.text(cx, PANEL_Y + 46, `Combo: 0 / ${MAX_TAPS}`, {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#f5e6c8',
        }).setOrigin(0.5, 0).setDepth(2);

        // Hit/miss feedback (flash text)
        this.feedbackText = this.add.text(cx, BAR_Y - 28, '', {
            fontFamily: 'monospace',
            fontSize: '16px',
            color: '#ffffff',
            stroke: '#2b1d0e',
            strokeThickness: 4,
        }).setOrigin(0.5, 0.5).setDepth(3).setAlpha(0);

        this.refreshTapText();
    }

    /* ──────────────────────── Bar rendering ──────────────────────── */

    private drawBar() {
        const g = this.gfx;
        g.clear();
        g.setDepth(2);

        // ── Background track ──────────────────────────────────────────
        g.fillStyle(0x3d2b1f);
        g.fillRect(BAR_X, BAR_Y, BAR_W, BAR_H);

        // ── Perfect zone ─────────────────────────────────────────────
        g.fillStyle(0x27ae60, 0.85);
        g.fillRect(this.zoneX, BAR_Y, this.zoneW, BAR_H);

        // ── Track border ─────────────────────────────────────────────
        g.lineStyle(2, 0xc9a96e);
        g.strokeRect(BAR_X, BAR_Y, BAR_W, BAR_H);

        // ── Cursor (vertical line + cap) ─────────────────────────────
        const cx = this.cursorState.x;
        g.lineStyle(3, 0xffeb3b);
        g.beginPath();
        g.moveTo(cx, BAR_Y - 6);
        g.lineTo(cx, BAR_Y + BAR_H + 6);
        g.strokePath();

        // Triangle cap on top
        g.fillStyle(0xffeb3b);
        g.fillTriangle(cx - 6, BAR_Y - 6, cx + 6, BAR_Y - 6, cx, BAR_Y + 2);

        // Triangle cap on bottom
        g.fillTriangle(cx - 6, BAR_Y + BAR_H + 6, cx + 6, BAR_Y + BAR_H + 6, cx, BAR_Y + BAR_H - 2);
    }

    /* ───────────────────────── Cursor tween ─────────────────────── */

    private startCursor() {
        this.cursorState.x = BAR_X;

        this.cursorTween = this.tweens.add({
            targets: this.cursorState,
            x: BAR_X + BAR_W,
            duration: CURSOR_DURATION_MS,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1,
            onUpdate: () => this.drawBar(),
        });
    }

    /* ───────────────────────── Tap handling ─────────────────────── */

    private handleTap() {
        if (this.isComplete) return;

        this.tapCount++;
        const curX = this.cursorState.x;
        const hit = curX >= this.zoneX && curX <= this.zoneX + this.zoneW;

        if (hit) {
            this.combo++;
            this.showFeedback('✓ PERFECT!', '#2ecc71');
        } else {
            this.showFeedback('✗ Miss', '#e74c3c');
        }

        // Move zone to random position within bar, shrink by 10%
        this.zoneW *= 0.9;
        const maxLeft = BAR_X + BAR_W - this.zoneW;
        this.zoneX = Phaser.Math.Between(BAR_X, maxLeft);

        this.refreshTapText();
        this.statusText.setText(`Combo: ${this.combo} / ${this.tapCount}`);
        this.drawBar();

        if (this.tapCount >= MAX_TAPS) {
            this.finishDig();
        }
    }

    /* ─────────────────────── Feedback flash ─────────────────────── */

    private showFeedback(msg: string, color: string) {
        this.feedbackText.setText(msg).setColor(color).setAlpha(1);
        this.tweens.add({
            targets: this.feedbackText,
            alpha: 0,
            y: this.feedbackText.y - 16,
            duration: 600,
            ease: 'Quad.easeOut',
            onComplete: () => {
                this.feedbackText.setY(BAR_Y - 28);
            },
        });
    }

    /* ─────────────────────── Completion ─────────────────────────── */

    private finishDig() {
        this.isComplete = true;
        this.cursorTween.stop();

        const result: DigResult = { combo: this.combo };

        // Flash the panel result
        const cx = W / 2;
        const resultColor = this.combo >= 4 ? '#f1c40f' : this.combo >= 2 ? '#2ecc71' : '#e74c3c';
        const resultLabel = this.combo >= 4 ? '★ EXCELLENT!' : this.combo >= 2 ? 'Good!' : 'Poor...';

        this.add.text(cx, PANEL_Y + PANEL_H / 2, `${resultLabel}\n${this.combo}/${MAX_TAPS} hits`, {
            fontFamily: 'monospace',
            fontSize: '22px',
            color: resultColor,
            align: 'center',
            stroke: '#2b1d0e',
            strokeThickness: 4,
        }).setOrigin(0.5).setDepth(10);

        // Short delay → emit → stop
        this.time.delayedCall(1200, () => {
            this.game.events.emit(DIG_COMPLETE, result);
            this.scene.stop();
        });
    }

    /* ────────────────────────── helpers ─────────────────────────── */

    private refreshTapText() {
        const dots = '●'.repeat(this.tapCount) + '○'.repeat(MAX_TAPS - this.tapCount);
        this.tapCountText.setText(`Taps: ${dots}  (${MAX_TAPS - this.tapCount} left)`);
    }
}
