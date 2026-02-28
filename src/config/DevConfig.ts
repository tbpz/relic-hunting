/**
 * DevConfig — lightweight singleton for toggling game modes at runtime.
 * Consumed by GameScene.calculateReward() to override drop probabilities.
 */
export type GameMode = 'normal' | 'punish' | 'floor';

export const DevConfig = {
    mode: 'normal' as GameMode,
};
