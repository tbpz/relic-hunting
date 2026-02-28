import Phaser from 'phaser';
import { RunManager } from '../managers/RunManager';
import { DIG_COMPLETE } from './DigScene';
import { DevConfig } from '../config/DevConfig';
import type { GameMode } from '../config/DevConfig';
import type { EndSceneData } from './EndScene';

// ── Canvas layout ──────────────────────────────────────────────────
export const GRID_COLS = 7;
export const GRID_ROWS = 7;
export const CELL_SIZE = 64;
export const CANVAS_W = GRID_COLS * CELL_SIZE;          // 448
export const CANVAS_H = GRID_ROWS * CELL_SIZE + 56 + 48; // 552

const HUD_Y = GRID_ROWS * CELL_SIZE;  // 448
const STOPBAR_Y = HUD_Y + 56;             // 504

// ── Cell types ─────────────────────────────────────────────────────
const CELL_EMPTY = 0;
const CELL_ROCK = 1;

// ── Chebyshev distance ─────────────────────────────────────────────
function chebyshev(ax: number, ay: number, bx: number, by: number) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

// ── Tile colours ───────────────────────────────────────────────────
const TILE_COLORS = [0x1a1a2e, 0x16213e, 0x0f3460, 0x1a1a2e];

// ── Reward ─────────────────────────────────────────────────────────
const PROB_TRAP = 0.15;
const PROB_STAIRS = 0.05;
const ARTIFACT_POOL = ['Diamond', 'Crystal Shard', 'Gold Ore', 'Ancient Coin', 'Rune Fragment', 'Iron Chunk'];

type RewardType = 'trap' | 'artifact' | 'rare_artifact' | 'stairs';
interface Reward { type: RewardType; label: string; color: string; item?: string; }

// ── Rock overlay ───────────────────────────────────────────────────
interface RockOverlay { col: number; row: number; img: Phaser.GameObjects.Image; cleared: boolean; }

// ── Random rock layout ─────────────────────────────────────────────
function generateRockPositions(n: number, skipCol: number, skipRow: number): [number, number][] {
    const out: [number, number][] = [];
    const used = new Set([`${skipCol},${skipRow}`]);
    while (out.length < n) {
        const c = Phaser.Math.Between(0, GRID_COLS - 1);
        const r = Phaser.Math.Between(0, GRID_ROWS - 1);
        const k = `${c},${r}`;
        if (!used.has(k)) { used.add(k); out.push([c, r]); }
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════
export class GameScene extends Phaser.Scene {
    // Grid
    private gridCells: Phaser.GameObjects.Rectangle[][] = [];
    private cellTypes: number[][] = [];
    private shroud: Phaser.GameObjects.Rectangle[][] = [];
    private rockOverlays: RockOverlay[] = [];

    // Player
    private player!: Phaser.GameObjects.Container;
    private playerGridX = 3;
    private playerGridY = 3;
    private isMoving = false;

    // Dig state
    private digTargetCol = -1;
    private digTargetRow = -1;
    private isDigging = false;

    // Progression
    private floorNumber = 1;
    private isTransitioning = false;
    private rockPositions: [number, number][] = [];

    // HUD + dev
    private hudText!: Phaser.GameObjects.Text;
    private modeBadge!: Phaser.GameObjects.Text;

    // Fade overlay
    private fadeOverlay!: Phaser.GameObjects.Rectangle;

    constructor() { super({ key: 'GameScene' }); }

    /* ── preload ────────────────────────────────────────────────── */
    preload() {
        // Show a simple loading bar
        const bar = this.add.rectangle(CANVAS_W / 2, CANVAS_H / 2, 300, 18, 0x333355);
        const fill = this.add.rectangle(CANVAS_W / 2 - 150, CANVAS_H / 2, 0, 14, 0x9b59b6).setOrigin(0, 0.5);
        this.load.on('progress', (v: number) => { fill.width = 300 * v; });

        const tip = this.add.text(CANVAS_W / 2, CANVAS_H / 2 + 22, 'Loading assets...', {
            fontFamily: 'monospace', fontSize: '13px', color: '#aaaacc',
        }).setOrigin(0.5);

        this.load.on('complete', () => { bar.destroy(); fill.destroy(); tip.destroy(); });

        // Pixel art sprites
        this.load.image('player', 'assets/player.png');
        this.load.image('rock', 'assets/rock.png');
        this.load.image('artifact', 'assets/artifact.png');
    }

    /* ── create ─────────────────────────────────────────────────── */
    create() {
        // ── Reset all mutable state (scene instance is reused on restart) ──
        this.gridCells = [];
        this.cellTypes = [];
        this.shroud = [];
        this.rockOverlays = [];
        this.playerGridX = 3;
        this.playerGridY = 3;
        this.isMoving = false;
        this.digTargetCol = -1;
        this.digTargetRow = -1;
        this.isDigging = false;
        this.floorNumber = 1;
        this.isTransitioning = false;
        this.rockPositions = [];

        const run = RunManager.getInstance();
        this.cameras.main.setBackgroundColor('#0d0d1a');
        this.cameras.main.fadeIn(400, 0, 0, 0);

        this.rockPositions = generateRockPositions(8, this.playerGridX, this.playerGridY);
        this.buildCellTypes();
        this.buildGrid();
        this.buildRockOverlays();
        this.buildPlayer();
        this.buildShroud();
        this.buildHUD(run);
        this.buildStopBar();

        // Full-screen fade overlay
        this.fadeOverlay = this.add.rectangle(
            CANVAS_W / 2, CANVAS_H / 2, CANVAS_W, CANVAS_H, 0x000000
        ).setAlpha(0).setDepth(50);

        // Reveal fog at start
        this.revealFog(this.playerGridX, this.playerGridY);

        // Tap/click input
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (this.isMoving || this.isDigging || this.isTransitioning) return;
            const gridX = Math.floor(pointer.x / CELL_SIZE);
            const gridY = Math.floor(pointer.y / CELL_SIZE);
            if (gridX < 0 || gridX >= GRID_COLS || gridY < 0 || gridY >= GRID_ROWS) return;

            if (this.cellTypes[gridY][gridX] === CELL_ROCK) {
                const ov = this.rockOverlays.find(r => r.col === gridX && r.row === gridY);
                if (ov && !ov.cleared) { this.launchDig(gridX, gridY); return; }
            }
            this.movePlayer(gridX, gridY);
        });

        // Dev mode keyboard shortcuts
        this.input.keyboard!.on('keydown-ONE', () => this.setMode('normal'));
        this.input.keyboard!.on('keydown-TWO', () => this.setMode('punish'));
        this.input.keyboard!.on('keydown-THREE', () => this.setMode('floor'));
        this.input.keyboard!.on('keydown-NUMPAD_ONE', () => this.setMode('normal'));
        this.input.keyboard!.on('keydown-NUMPAD_TWO', () => this.setMode('punish'));
        this.input.keyboard!.on('keydown-NUMPAD_THREE', () => this.setMode('floor'));

        // Dig result
        this.game.events.on(DIG_COMPLETE, this.onDigComplete, this);
    }

    /* ── cell types ─────────────────────────────────────────────── */
    private buildCellTypes() {
        for (let r = 0; r < GRID_ROWS; r++)
            this.cellTypes[r] = new Array(GRID_COLS).fill(CELL_EMPTY);
        for (const [c, r] of this.rockPositions)
            this.cellTypes[r][c] = CELL_ROCK;
    }

    /* ── grid ───────────────────────────────────────────────────── */
    private buildGrid() {
        for (let row = 0; row < GRID_ROWS; row++) {
            this.gridCells[row] = [];
            for (let col = 0; col < GRID_COLS; col++) {
                const fill = this.cellTypes[row][col] === CELL_ROCK
                    ? 0x111118
                    : TILE_COLORS[(row + col) % TILE_COLORS.length];
                const cell = this.add.rectangle(
                    col * CELL_SIZE + CELL_SIZE / 2,
                    row * CELL_SIZE + CELL_SIZE / 2,
                    CELL_SIZE - 2, CELL_SIZE - 2, fill
                );
                cell.setStrokeStyle(1, 0x2a2a4a);
                this.gridCells[row][col] = cell;
            }
        }
    }

    /* ── rock overlays (sprite-based) ───────────────────────────── */
    private buildRockOverlays() {
        for (const [col, row] of this.rockPositions) {
            const cx = col * CELL_SIZE + CELL_SIZE / 2;
            const cy = row * CELL_SIZE + CELL_SIZE / 2;
            const img = this.add.image(cx, cy, 'rock')
                .setDisplaySize(52, 52)
                .setDepth(2);
            this.rockOverlays.push({ col, row, img, cleared: false });
        }
    }

    /* ── player (sprite-based) ──────────────────────────────────── */
    private buildPlayer() {
        const cx = this.playerGridX * CELL_SIZE + CELL_SIZE / 2;
        const cy = this.playerGridY * CELL_SIZE + CELL_SIZE / 2;

        const glow = this.add.circle(0, 0, 28, 0x7b2d8b, 0.4);
        const sprite = this.add.image(0, 0, 'player').setDisplaySize(44, 44);

        this.player = this.add.container(cx, cy, [glow, sprite]);
        this.player.setDepth(10);

        this.tweens.add({
            targets: glow,
            scaleX: 1.3, scaleY: 1.3, alpha: 0.15,
            duration: 900, yoyo: true, repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    /* ── shroud ─────────────────────────────────────────────────── */
    private buildShroud() {
        for (let row = 0; row < GRID_ROWS; row++) {
            this.shroud[row] = [];
            for (let col = 0; col < GRID_COLS; col++) {
                const tile = this.add.rectangle(
                    col * CELL_SIZE + CELL_SIZE / 2,
                    row * CELL_SIZE + CELL_SIZE / 2,
                    CELL_SIZE, CELL_SIZE, 0x000000
                ).setAlpha(0.92).setDepth(5);
                this.shroud[row][col] = tile;
            }
        }
    }

    /* ── HUD ────────────────────────────────────────────────────── */
    private buildHUD(run: RunManager) {
        this.add.rectangle(CANVAS_W / 2, HUD_Y + 28, CANVAS_W, 56, 0x0d0d1a)
            .setDepth(20);

        this.hudText = this.add.text(12, HUD_Y + 10, this.hudString(run), {
            fontFamily: 'monospace', fontSize: '13px',
            color: '#e0aaff', stroke: '#000', strokeThickness: 2,
        }).setDepth(21);

        this.modeBadge = this.add.text(CANVAS_W - 8, HUD_Y + 8, '', {
            fontFamily: 'monospace', fontSize: '11px',
            color: '#aaffaa', stroke: '#000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(22).setInteractive({ useHandCursor: true });

        this.modeBadge.on('pointerdown', () => {
            const modes: GameMode[] = ['normal', 'punish', 'floor'];
            const nextIndex = (modes.indexOf(DevConfig.mode) + 1) % modes.length;
            this.setMode(modes[nextIndex]);
        });

        this.updateModeBadge();
    }

    /* ── Stop bar ───────────────────────────────────────────────── */
    private buildStopBar() {
        // Dark strip
        this.add.rectangle(CANVAS_W / 2, STOPBAR_Y + 24, CANVAS_W, 48, 0x0a0a14)
            .setDepth(20);

        // STOP button
        const btn = this.add.rectangle(CANVAS_W / 2, STOPBAR_Y + 24, 180, 34, 0x6b1010)
            .setStrokeStyle(2, 0xe74c3c)
            .setDepth(21)
            .setInteractive({ useHandCursor: true });

        const btnText = this.add.text(CANVAS_W / 2, STOPBAR_Y + 24, '■  End Run', {
            fontFamily: 'monospace', fontSize: '14px',
            color: '#ffaaaa', stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(22);

        btn.on('pointerover', () => { btn.setFillStyle(0x991a1a); btnText.setColor('#ffcccc'); });
        btn.on('pointerout', () => { btn.setFillStyle(0x6b1010); btnText.setColor('#ffaaaa'); });
        btn.on('pointerdown', () => this.triggerExit('success'));
    }

    /* ── HUD strings ────────────────────────────────────────────── */
    private hudString(run: RunManager): string {
        const bag = run.runBag.length ? run.runBag.slice(-3).join(', ') : '—';
        return `🏚 F${this.floorNumber}  ❤ HP:${run.hp}  🛡 Dur:${run.durability}  🎒 ${bag}`;
    }

    private updateModeBadge() {
        const labels: Record<GameMode, string> = {
            normal: '🟢 [1]', punish: '🔴 [2] Punish', floor: '🔵 [3] Floor',
        };
        const colors: Record<GameMode, string> = {
            normal: '#aaffaa', punish: '#ff8888', floor: '#88bbff',
        };
        this.modeBadge.setText(labels[DevConfig.mode]).setColor(colors[DevConfig.mode]);
    }

    private setMode(mode: GameMode) {
        DevConfig.mode = mode;
        if (mode === 'punish') RunManager.getInstance().hp = 100;
        this.updateModeBadge();
    }

    /* ── Dig ────────────────────────────────────────────────────── */
    private launchDig(col: number, row: number) {
        this.isDigging = true;
        this.digTargetCol = col;
        this.digTargetRow = row;
        const ov = this.rockOverlays.find(r => r.col === col && r.row === row)!;
        this.tweens.add({
            targets: ov.img, alpha: 0.4, duration: 120, yoyo: true,
            onComplete: () => this.scene.launch('DigScene'),
        });
    }

    private onDigComplete(result: { combo: number }) {
        this.isDigging = false;
        const col = this.digTargetCol;
        const row = this.digTargetRow;

        // Clear rock cell
        this.cellTypes[row][col] = CELL_EMPTY;
        const ov = this.rockOverlays.find(r => r.col === col && r.row === row)!;
        ov.cleared = true;
        this.tweens.add({ targets: ov.img, alpha: 0, duration: 300 });
        this.gridCells[row][col].setFillStyle(TILE_COLORS[(row + col) % TILE_COLORS.length]);

        // Reward
        const reward = this.calculateReward(result.combo);
        this.applyReward(reward);
        this.showRewardPopup(
            col * CELL_SIZE + CELL_SIZE / 2,
            row * CELL_SIZE + CELL_SIZE / 2,
            reward.label, reward.color
        );

        if (reward.type === 'stairs') {
            this.time.delayedCall(800, () => this.descendToNextFloor());
        } else {
            this.movePlayer(col, row);
        }
    }

    /* ── Reward system ──────────────────────────────────────────── */
    private calculateReward(combo: number): Reward {
        // Dev overrides
        if (DevConfig.mode === 'punish')
            return { type: 'trap', label: '💀 Trap! -1 HP', color: '#e74c3c' };
        if (DevConfig.mode === 'floor')
            return { type: 'stairs', label: '🪜 Found Stairs!', color: '#3498db' };

        // Combo 5 → rare
        if (combo >= 5)
            return { type: 'rare_artifact', label: '★ Rare Artifact!', color: '#f1c40f', item: 'Rare Artifact' };

        const roll = Math.random();
        if (roll < PROB_TRAP)
            return { type: 'trap', label: '💀 Trap! -1 HP', color: '#e74c3c' };
        if (roll < PROB_TRAP + PROB_STAIRS)
            return { type: 'stairs', label: '🪜 Found Stairs!', color: '#3498db' };

        const item = ARTIFACT_POOL[Math.floor(Math.random() * ARTIFACT_POOL.length)];
        return { type: 'artifact', label: `✨ Found ${item}!`, color: '#2ecc71', item };
    }

    private applyReward(reward: Reward) {
        const run = RunManager.getInstance();
        switch (reward.type) {
            case 'trap':
                run.takeDamage(1);
                this.cameras.main.flash(300, 180, 0, 0);
                if (run.hp <= 0) {
                    this.time.delayedCall(900, () => this.triggerExit('failure'));
                }
                break;
            case 'rare_artifact':
                run.addLoot(reward.item!);
                run.wear(3);
                this.cameras.main.flash(400, 200, 160, 0);
                this.checkDurability();
                break;
            case 'artifact':
                run.addLoot(reward.item!);
                run.wear(8);
                this.checkDurability();
                break;
        }
    }

    private checkDurability() {
        if (RunManager.getInstance().durability <= 0) {
            this.time.delayedCall(900, () => this.triggerExit('success'));
        }
    }

    /* ── Exit to EndScene ───────────────────────────────────────── */
    private triggerExit(mode: 'success' | 'failure') {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        this.tweens.add({
            targets: this.fadeOverlay,
            alpha: 1, duration: 500, ease: 'Sine.easeIn',
            onComplete: () => {
                const data: EndSceneData = { mode, floor: this.floorNumber };
                this.game.events.off(DIG_COMPLETE, this.onDigComplete, this);
                this.scene.start('EndScene', data);
            },
        });
    }

    /* ── Floating popup ─────────────────────────────────────────── */
    private showRewardPopup(x: number, y: number, label: string, color: string) {
        const pill = this.add.rectangle(x, y, label.length * 8 + 20, 26, 0x000000, 0.7).setDepth(30);
        const text = this.add.text(x, y, label, {
            fontFamily: 'monospace', fontSize: '14px',
            color, stroke: '#000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(31);

        this.tweens.add({
            targets: [text, pill], y: y - 70, alpha: 0,
            duration: 1600, ease: 'Quad.easeOut',
            onComplete: () => { text.destroy(); pill.destroy(); },
        });
        this.tweens.add({
            targets: text, scaleX: 1.3, scaleY: 1.3,
            duration: 120, yoyo: true, ease: 'Back.easeOut',
        });
    }

    /* ── Floor descent ──────────────────────────────────────────── */
    private descendToNextFloor() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;
        this.tweens.add({
            targets: this.fadeOverlay, alpha: 1, duration: 600, ease: 'Sine.easeIn',
            onComplete: () => {
                this.floorNumber++;
                this.regenerateFloor();
                this.tweens.add({
                    targets: this.fadeOverlay, alpha: 0, duration: 600, delay: 200,
                    ease: 'Sine.easeOut',
                    onComplete: () => { this.isTransitioning = false; },
                });
            },
        });
    }

    private regenerateFloor() {
        for (const ov of this.rockOverlays) ov.img.destroy();
        this.rockOverlays = [];

        this.playerGridX = 3;
        this.playerGridY = 3;
        this.player.setPosition(
            this.playerGridX * CELL_SIZE + CELL_SIZE / 2,
            this.playerGridY * CELL_SIZE + CELL_SIZE / 2
        );

        this.rockPositions = generateRockPositions(8, this.playerGridX, this.playerGridY);
        this.buildCellTypes();

        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                this.gridCells[row][col].setFillStyle(
                    this.cellTypes[row][col] === CELL_ROCK
                        ? 0x111118
                        : TILE_COLORS[(row + col) % TILE_COLORS.length]
                );
            }
        }

        this.buildRockOverlays();

        for (let row = 0; row < GRID_ROWS; row++)
            for (let col = 0; col < GRID_COLS; col++)
                this.shroud[row][col].setAlpha(0.92);

        this.revealFog(this.playerGridX, this.playerGridY);
        this.showFloorBanner();
    }

    private showFloorBanner() {
        const cx = CANVAS_W / 2;
        const cy = GRID_ROWS * CELL_SIZE / 2;
        const bg = this.add.rectangle(cx, cy, 240, 50, 0x1a1040, 0.9)
            .setDepth(55).setStrokeStyle(2, 0x9b59b6);
        const text = this.add.text(cx, cy, `— Floor ${this.floorNumber} —`, {
            fontFamily: 'monospace', fontSize: '18px',
            color: '#e0aaff', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(56);
        this.tweens.add({
            targets: [text, bg], alpha: 0,
            duration: 900, delay: 1200,
            ease: 'Sine.easeIn',
            onComplete: () => { text.destroy(); bg.destroy(); },
        });
    }

    /* ── Movement ───────────────────────────────────────────────── */
    private movePlayer(tc: number, tr: number) {
        if (tc === this.playerGridX && tr === this.playerGridY) return;
        this.isMoving = true;
        const tx = tc * CELL_SIZE + CELL_SIZE / 2;
        const ty = tr * CELL_SIZE + CELL_SIZE / 2;
        this.tweens.add({
            targets: this.player, scaleX: 0.85, scaleY: 0.85,
            duration: 80, yoyo: true,
        });
        this.tweens.add({
            targets: this.player, x: tx, y: ty,
            duration: 220, ease: 'Quad.easeOut',
            onComplete: () => {
                this.playerGridX = tc;
                this.playerGridY = tr;
                this.isMoving = false;
                this.revealFog(this.playerGridX, this.playerGridY);
            },
        });
    }

    /* ── Fog of war ─────────────────────────────────────────────── */
    private revealFog(px: number, py: number) {
        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const d = chebyshev(col, row, px, py);
                const t = this.shroud[row][col];
                const a = d <= 1 ? 0 : d === 2 ? 0.55 : 0.92;
                this.tweens.add({ targets: t, alpha: a, duration: 200, ease: 'Sine.easeOut' });
            }
        }
    }

    /* ── Update ─────────────────────────────────────────────────── */
    update() {
        const run = RunManager.getInstance();
        this.hudText.setText(this.hudString(run));
    }
}
