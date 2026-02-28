// Generate a clean 16x16 pixel art adventurer with true transparency
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const SIZE = 16;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');

// Start fully transparent
ctx.clearRect(0, 0, SIZE, SIZE);

function px(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
}

// Color palette
const HAT = '#8B4513';  // brown hat
const HAT_LT = '#A0522D';  // hat highlight
const SKIN = '#F4C97E';  // skin tone
const SKIN_D = '#D4A050';  // skin shadow
const EYES = '#222222';  // eyes
const TUNIC = '#C2A060';  // beige tunic
const TUN_DK = '#9A7840';  // tunic shadow
const TUN_LT = '#D4B878';  // tunic highlight
const BELT = '#5C3A1E';  // belt
const PANTS = '#6B5030';  // brown pants
const BOOTS = '#3D2B1F';  // dark boots
const OUTLINE = '#2B1D0E';  // dark outline

// Row 0: hat top
px(6, 0, HAT); px(7, 0, HAT); px(8, 0, HAT); px(9, 0, HAT);

// Row 1: hat brim
px(5, 1, HAT); px(6, 1, HAT_LT); px(7, 1, HAT_LT); px(8, 1, HAT_LT); px(9, 1, HAT); px(10, 1, HAT);

// Row 2: hat brim wide
px(4, 2, HAT); px(5, 2, HAT); px(6, 2, HAT); px(7, 2, HAT); px(8, 2, HAT); px(9, 2, HAT); px(10, 2, HAT); px(11, 2, HAT);

// Row 3: head top
px(6, 3, SKIN); px(7, 3, SKIN); px(8, 3, SKIN); px(9, 3, SKIN);

// Row 4: face with eyes
px(5, 4, OUTLINE); px(6, 4, SKIN); px(7, 4, EYES); px(8, 4, SKIN); px(9, 4, EYES); px(10, 4, SKIN);

// Row 5: face bottom (mouth area)
px(6, 5, SKIN); px(7, 5, SKIN_D); px(8, 5, SKIN); px(9, 5, SKIN);

// Row 6: neck
px(7, 6, SKIN_D); px(8, 6, SKIN_D);

// Row 7: shoulders
px(4, 7, TUNIC); px(5, 7, TUNIC); px(6, 7, TUN_LT); px(7, 7, TUN_LT); px(8, 7, TUN_LT); px(9, 7, TUN_LT); px(10, 7, TUNIC); px(11, 7, TUNIC);

// Row 8: upper torso
px(4, 8, TUNIC); px(5, 8, TUN_LT); px(6, 8, TUN_LT); px(7, 8, TUN_LT); px(8, 8, TUN_LT); px(9, 8, TUN_LT); px(10, 8, TUN_LT); px(11, 8, TUNIC);

// Row 9: torso with arms
px(3, 9, SKIN); px(4, 9, TUNIC); px(5, 9, TUN_LT); px(6, 9, TUN_DK); px(7, 9, TUN_LT); px(8, 9, TUN_LT); px(9, 9, TUN_DK); px(10, 9, TUN_LT); px(11, 9, TUNIC); px(12, 9, SKIN);

// Row 10: belt line
px(3, 10, SKIN_D); px(4, 10, TUNIC); px(5, 10, BELT); px(6, 10, BELT); px(7, 10, BELT); px(8, 10, BELT); px(9, 10, BELT); px(10, 10, BELT); px(11, 10, TUNIC); px(12, 10, SKIN_D);

// Row 11: lower torso / hips
px(5, 11, TUN_DK); px(6, 11, TUN_DK); px(7, 11, TUN_DK); px(8, 11, TUN_DK); px(9, 11, TUN_DK); px(10, 11, TUN_DK);

// Row 12: upper legs
px(5, 12, PANTS); px(6, 12, PANTS); px(7, 12, PANTS); px(8, 12, PANTS); px(9, 12, PANTS); px(10, 12, PANTS);

// Row 13: legs
px(5, 13, PANTS); px(6, 13, PANTS); px(9, 13, PANTS); px(10, 13, PANTS);

// Row 14: lower legs
px(5, 14, BOOTS); px(6, 14, BOOTS); px(9, 14, BOOTS); px(10, 14, BOOTS);

// Row 15: boots
px(4, 15, BOOTS); px(5, 15, BOOTS); px(6, 15, BOOTS); px(9, 15, BOOTS); px(10, 15, BOOTS); px(11, 15, BOOTS);

// Write the file
const outPath = path.resolve('C:/Users/ADMIN/.gemini/antigravity/scratch/phaser3-grid-game/public/assets/player.png');
fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log('Done! Wrote clean 16x16 adventurer to', outPath);
