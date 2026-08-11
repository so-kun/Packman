// Rendering: procedurally generated pixel sprites (all original artwork),
// a rounded-outline wall renderer, an 8x8 bitmap font, and the HUD.

import {
  TILE, COLS, ROWS, WIDTH, HEIGHT, COLORS, fruitForLevel,
} from './constants.js';
import { MAZE_TOP, DOOR_TILES } from './maze.js';
import { GSTATE } from './ghosts.js';

// ---------------------------------------------------------------------------
// 8x8 bitmap font (5x7 glyphs, original design). Each glyph: 7 rows, 5 bits.
const FONT = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x01, 0x01, 0x01, 0x01, 0x11, 0x11, 0x0e],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  0: [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  1: [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  2: [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  3: [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
  4: [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  5: [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  6: [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  7: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  8: [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  9: [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  '"': [0x0a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0e], // used as (c) mark
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

export function drawText(ctx, text, tx, ty, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < text.length; i++) {
    const glyph = FONT[text[i].toUpperCase()] || FONT[' '];
    const ox = tx * TILE + i * TILE + 1;
    const oy = ty * TILE;
    for (let r = 0; r < 7; r++) {
      const bits = glyph[r];
      for (let c = 0; c < 5; c++) {
        if (bits & (1 << (4 - c))) ctx.fillRect(ox + c + 1, oy + r + 1, 1, 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Sprite factory helpers

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }

// Pac body: 13px disc with a mouth wedge. dirAngle in radians, mouthHalf in
// radians (0 = closed). size 16x16, centered.
function makePacSprite(dirAngle, mouthHalf, scale = 1) {
  const s = 16 * scale;
  const cv = makeCanvas(s, s);
  const ctx = cv.getContext('2d');
  const cx = s / 2 - 0.5, cy = s / 2 - 0.5, r = 6.6 * scale;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      if (mouthHalf > 0) {
        let a = Math.atan2(dy, dx) - dirAngle;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        if (Math.abs(a) < mouthHalf) continue;
      }
      px(ctx, x, y, COLORS.pac);
    }
  }
  return cv;
}

const DIR_ANGLE = { RIGHT: 0, DOWN: Math.PI / 2, LEFT: Math.PI, UP: -Math.PI / 2 };

// Ghost body 14x14 in a 16x16 cell.
const SKIRT = {
  // two animation frames; strings are 14 wide ('1' = pixel on)
  a: ['11111111111111', '11011110111101', '10001100110001'],
  b: ['11111111111111', '01110110110111', '00100100100100'],
};

function makeGhostBody(color, frame) {
  const cv = makeCanvas(16, 16);
  const ctx = cv.getContext('2d');
  const ox = 1, oy = 1;
  for (let y = 0; y < 11; y++) {
    let half;
    if (y >= 6) half = 7;
    else half = Math.sqrt(49 - (6 - y) * (6 - y));
    const x0 = Math.round(7 - half), x1 = Math.round(7 + half);
    for (let x = x0; x < x1; x++) px(ctx, ox + x, oy + y, color);
  }
  const mask = SKIRT[frame];
  for (let r = 0; r < 3; r++) {
    for (let x = 0; x < 14; x++) {
      if (mask[r][x] === '1') px(ctx, ox + x, oy + 11 + r, color);
    }
  }
  return cv;
}

function drawGhostEyes(ctx, dirName, ox = 1, oy = 1) {
  const off = {
    UP: [0, -2], DOWN: [0, 2], LEFT: [-2, 0], RIGHT: [2, 0],
  }[dirName] || [0, 0];
  for (const ex of [3, 9]) {
    // white of eye 3x4 (shifted by gaze)
    ctx.fillStyle = COLORS.eyeWhite;
    ctx.fillRect(ox + ex + off[0] * 0.5, oy + 3 + off[1] * 0.5, 3, 4);
    ctx.fillStyle = COLORS.pupil;
    ctx.fillRect(ox + ex + 0.5 + off[0], oy + 4 + off[1], 2, 2);
  }
}

function makeGhostSprite(color, frame, dirName) {
  const cv = makeGhostBody(color, frame);
  drawGhostEyes(cv.getContext('2d'), dirName);
  return cv;
}

function makeFrightSprite(flash, frame) {
  const body = flash ? COLORS.flashBody : COLORS.frightBody;
  const face = flash ? COLORS.flashFace : COLORS.frightFace;
  const cv = makeGhostBody(body, frame);
  const ctx = cv.getContext('2d');
  // simple face: two square eyes + zig-zag mouth
  ctx.fillStyle = face;
  ctx.fillRect(1 + 3, 1 + 4, 2, 2);
  ctx.fillRect(1 + 9, 1 + 4, 2, 2);
  for (let i = 0; i < 7; i++) {
    ctx.fillRect(1 + i * 2, 1 + (i % 2 === 0 ? 9 : 8), 2, 1);
  }
  return cv;
}

function makeEyesSprite(dirName) {
  const cv = makeCanvas(16, 16);
  drawGhostEyes(cv.getContext('2d'), dirName);
  return cv;
}

// Fruit sprites: original 12x12 pixel art, drawn in a 16x16 cell.
// legend: r=red, R=dark red, g=green, G=dark green, y=yellow, o=orange,
//         p=purple, w=white, c=cyan, t=tan/stem
const FRUIT_ART = {
  cherry: [
    '..........t.',
    '.........t..',
    '.......tt...',
    '.....tt.....',
    '...tt.......',
    '..t.........',
    'rrr...rrr...',
    'rrrr.rrrrr..',
    'rwrr.rrwrr..',
    'rrrr.rrrrr..',
    '.rr...rrr...',
    '............',
  ],
  strawberry: [
    '....GGG.....',
    '..GGGGGGG...',
    'rrrrGGGrrr..',
    'rrwrrrrrwr..',
    'rrrrrwrrrr..',
    'rwrrrrrrwr..',
    '.rrrwrrrr...',
    '.rwrrrwrr...',
    '..rrrrrr....',
    '...rwrr.....',
    '....rr......',
    '............',
  ],
  peach: [
    '......tG....',
    '.....tGG....',
    '....t.......',
    '..oooooo....',
    '.oooooooo...',
    'oooooooooo..',
    'oooooooooo..',
    'oooooooooo..',
    '.oooooooo...',
    '..oooooo....',
    '...oooo.....',
    '............',
  ],
  apple: [
    '.....t......',
    '....t.......',
    '..rr.rrr....',
    '.rrrrrrrr...',
    'rrrrrrrrrr..',
    'rrrrrrrrrr..',
    'rrrrrrrrrr..',
    'rrrrrrrrrr..',
    '.rrrrrrrw...',
    '.rrrr.rrw...',
    '..rr...w....',
    '............',
  ],
  grapes: [
    '.....GG.....',
    '...GGGG.....',
    '.....G......',
    '...ppppp....',
    '..ppppppp...',
    '.ppwpppppp..',
    '.ppppppppp..',
    '.pppppppp...',
    '..ppppppp...',
    '...ppppp....',
    '....ppp.....',
    '.....p......',
  ],
  galaxian: [
    '............',
    'y....r....y.',
    'y....r....y.',
    'yy..rrr..yy.',
    '.y.rrrrr.y..',
    '.yrrrrrrry..',
    '..rr.r.rr...',
    '..r..r..r...',
    '.....r......',
    '.....r......',
    '............',
    '............',
  ],
  bell: [
    '.....cc.....',
    '....yyyy....',
    '...yyyyyy...',
    '..yyyyyyyy..',
    '..yyyyyyyy..',
    '..yyyyyyyy..',
    '..yyyyyyyy..',
    '.yyyyyyyyyy.',
    '.yyyyyyyyyy.',
    '....wwcc....',
    '............',
    '............',
  ],
  key: [
    '....ccc.....',
    '...cc.cc....',
    '...cc.cc....',
    '....ccc.....',
    '.....w......',
    '.....w......',
    '.....ww.....',
    '.....w......',
    '.....ww.....',
    '.....w......',
    '............',
    '............',
  ],
};
const FRUIT_COLORS = {
  r: '#ff0000', R: '#b80000', g: '#00ff00', G: '#00b800', y: '#ffff00',
  o: '#ffb852', p: '#b852ff', w: '#dedede', c: '#00ffff', t: '#b87800',
};

function makeFruitSprite(name) {
  const cv = makeCanvas(16, 16);
  const ctx = cv.getContext('2d');
  const art = FRUIT_ART[name];
  for (let y = 0; y < art.length; y++) {
    for (let x = 0; x < art[y].length; x++) {
      const ch = art[y][x];
      if (ch !== '.') px(ctx, x + 2, y + 2, FRUIT_COLORS[ch]);
    }
  }
  return cv;
}

// Ghost-score sprites (200/400/800/1600) with a tiny 3x5 digit font.
const MINI_DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  4: ['101', '101', '111', '001', '001'],
  6: ['111', '100', '111', '101', '111'],
  8: ['111', '101', '111', '101', '111'],
};

function makeScoreSprite(value) {
  const str = String(value);
  const cv = makeCanvas(str.length * 4 + 1, 7);
  const ctx = cv.getContext('2d');
  str.split('').forEach((ch, i) => {
    const glyph = MINI_DIGITS[ch];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (glyph[r][c] === '1') px(ctx, 1 + i * 4 + c, 1 + r, COLORS.cyan);
      }
    }
  });
  return cv;
}

// ---------------------------------------------------------------------------

export class Renderer {
  constructor(canvas, maze) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.maze = maze;
    this.buildSprites();
    this.wallBlue = this.renderWalls(COLORS.wall, true);
    this.wallWhite = this.renderWalls('#dedede', false);
  }

  buildSprites() {
    const S = this.sprites = {};
    // Pac: 3 mouth stages x 4 directions (+ closed shared)
    S.pacClosed = makePacSprite(0, 0);
    S.pac = {};
    for (const d of ['RIGHT', 'DOWN', 'LEFT', 'UP']) {
      S.pac[d] = [
        makePacSprite(DIR_ANGLE[d], 0.55),
        makePacSprite(DIR_ANGLE[d], 1.15),
      ];
    }
    S.pacGiant = {};
    for (const d of ['RIGHT', 'LEFT']) {
      S.pacGiant[d] = [
        makePacSprite(DIR_ANGLE[d], 0.55, 2),
        makePacSprite(DIR_ANGLE[d], 1.15, 2),
      ];
    }
    // Death animation: mouth opens upward until the body vanishes, then pops.
    S.pacDeath = [];
    for (let i = 0; i < 11; i++) {
      S.pacDeath.push(makePacSprite(DIR_ANGLE.UP, 0.3 + (i / 10) * 2.8));
    }
    const pop = makeCanvas(16, 16);
    const pc = pop.getContext('2d');
    pc.fillStyle = COLORS.pac;
    for (const [x, y] of [[7, 2], [7, 12], [2, 7], [12, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) {
      pc.fillRect(x, y, 2, 2);
    }
    S.pacDeath.push(pop);

    S.ghost = {};
    for (const name of ['blinky', 'pinky', 'inky', 'clyde']) {
      S.ghost[name] = {};
      for (const d of ['RIGHT', 'DOWN', 'LEFT', 'UP']) {
        S.ghost[name][d] = [
          makeGhostSprite(COLORS[name], 'a', d),
          makeGhostSprite(COLORS[name], 'b', d),
        ];
      }
    }
    S.fright = [makeFrightSprite(false, 'a'), makeFrightSprite(false, 'b')];
    S.frightFlash = [makeFrightSprite(true, 'a'), makeFrightSprite(true, 'b')];
    S.eyes = {};
    for (const d of ['RIGHT', 'DOWN', 'LEFT', 'UP']) S.eyes[d] = makeEyesSprite(d);
    S.fruit = {};
    for (const name of Object.keys(FRUIT_ART)) S.fruit[name] = makeFruitSprite(name);
    S.score = {};
    for (const v of [200, 400, 800, 1600]) S.score[v] = makeScoreSprite(v);
  }

  // Rounded thin-outline wall rendering, drawn once to an offscreen canvas.
  renderWalls(color, withDoor) {
    const cv = makeCanvas(WIDTH, HEIGHT);
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    const isW = (c, r) => this.maze.isWall(c, r) &&
      !(r === 17 && (c < 0 || c >= COLS)); // treat off-screen tunnel as open
    const wallOrDoor = (c, r) => this.maze.isWall(c, r) || this.maze.isDoor(c, r);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!this.maze.isWall(c, r)) continue;
        const x = c * TILE, y = r * TILE;
        const n = wallOrDoor(c, r - 1), s = wallOrDoor(c, r + 1);
        const w = wallOrDoor(c - 1, r), e = wallOrDoor(c + 1, r);
        const nw = wallOrDoor(c - 1, r - 1), ne = wallOrDoor(c + 1, r - 1);
        const sw = wallOrDoor(c - 1, r + 1), se = wallOrDoor(c + 1, r + 1);
        const d = 3.5; // inset of the outline from the open side
        ctx.beginPath();
        // Edges facing open space
        if (!n) { ctx.moveTo(x + (w ? 0 : d), y + d); ctx.lineTo(x + (e ? 8 : 8 - d), y + d); }
        if (!s) { ctx.moveTo(x + (w ? 0 : d), y + 8 - d); ctx.lineTo(x + (e ? 8 : 8 - d), y + 8 - d); }
        if (!w) { ctx.moveTo(x + d, y + (n ? 0 : d)); ctx.lineTo(x + d, y + (s ? 8 : 8 - d)); }
        if (!e) { ctx.moveTo(x + 8 - d, y + (n ? 0 : d)); ctx.lineTo(x + 8 - d, y + (s ? 8 : 8 - d)); }
        // Concave corners (wall on both sides, open diagonal)
        if (n && w && !nw) { ctx.moveTo(x, y + d); ctx.quadraticCurveTo(x + d, y + d, x + d, y); }
        if (n && e && !ne) { ctx.moveTo(x + 8, y + d); ctx.quadraticCurveTo(x + 8 - d, y + d, x + 8 - d, y); }
        if (s && w && !sw) { ctx.moveTo(x, y + 8 - d); ctx.quadraticCurveTo(x + d, y + 8 - d, x + d, y + 8); }
        if (s && e && !se) { ctx.moveTo(x + 8, y + 8 - d); ctx.quadraticCurveTo(x + 8 - d, y + 8 - d, x + 8 - d, y + 8); }
        ctx.stroke();
      }
    }
    void isW;
    if (withDoor) {
      ctx.fillStyle = COLORS.door;
      for (const [c, r] of DOOR_TILES) ctx.fillRect(c * TILE, r * TILE + 3, TILE, 2);
    }
    return cv;
  }

  clear() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  drawMaze(flashWhite = false) {
    this.ctx.drawImage(flashWhite ? this.wallWhite : this.wallBlue, 0, 0);
  }

  drawDots(tick) {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.dot;
    const blinkOn = (tick % 20) < 10;
    for (let r = 0; r < ROWS; r++) {
      const row = this.maze.dots[r];
      for (let c = 0; c < COLS; c++) {
        const d = row[c];
        if (d === 1) {
          ctx.fillRect(c * TILE + 3, r * TILE + 3, 2, 2);
        } else if (d === 2 && blinkOn) {
          ctx.beginPath();
          ctx.arc(c * TILE + 4, r * TILE + 4, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  blit(sprite, cx, cy) {
    this.ctx.drawImage(sprite, Math.round(cx - sprite.width / 2), Math.round(cy - sprite.height / 2));
  }

  drawPac(pac) {
    const phase = Math.floor(pac.frame) % 4;
    let sprite;
    if (!pac.moving && phase === 0) sprite = this.sprites.pac[pac.dir.name][0];
    else if (phase === 0 || phase === 2) sprite = this.sprites.pac[pac.dir.name][0];
    else if (phase === 1) sprite = this.sprites.pac[pac.dir.name][1];
    else sprite = this.sprites.pacClosed;
    this.blit(sprite, pac.x, pac.y);
  }

  drawPacDeath(frameIndex) {
    const frames = this.sprites.pacDeath;
    return frames[Math.min(frameIndex, frames.length - 1)];
  }

  drawGhost(g, game) {
    const anim = (game.tick >> 3) & 1 ? 'b' : 'a';
    const fi = anim === 'a' ? 0 : 1;
    if (g.state === GSTATE.EYES || g.state === GSTATE.ENTERING) {
      this.blit(this.sprites.eyes[g.dir.name], g.x, g.y);
      return;
    }
    if (g.frightened) {
      const t = game.frightTimer;
      const flashing = t > 0 && t < game.spec.frightFlashes * 28 && ((t / 14) | 0) % 2 === 0;
      this.blit((flashing ? this.sprites.frightFlash : this.sprites.fright)[fi], g.x, g.y);
      return;
    }
    this.blit(this.sprites.ghost[g.name][g.dir.name][fi], g.x, g.y);
  }

  drawHud(game) {
    const ctx = this.ctx;
    // The active player's "1UP" label blinks during play; the score itself
    // stays on screen (matches the arcade original).
    const inGame = game.state && game.state !== 'attract';
    if (!inGame || (game.tick % 32) < 16) drawText(ctx, '1UP', 3, 0, COLORS.text);
    drawText(ctx, 'HIGH SCORE', 9, 0, COLORS.text);
    const s = String(game.score === 0 ? '00' : game.score);
    drawText(ctx, s.padStart(6, ' '), 1, 1, COLORS.text);
    const hs = String(game.highScore === 0 ? '00' : game.highScore);
    drawText(ctx, hs.padStart(6, ' '), 11, 1, COLORS.text);
    // lives (bottom-left)
    for (let i = 0; i < Math.min(game.lives, 5); i++) {
      this.blit(this.sprites.pac.LEFT[1], 20 + i * 16, 34.5 * TILE + 4);
    }
    // fruit history (bottom-right): last 7 levels
    const first = Math.max(1, game.level - 6);
    let x = 24.5 * TILE;
    for (let lv = game.level; lv >= first; lv--) {
      const f = fruitForLevel(lv);
      this.blit(this.sprites.fruit[f.sprite], x, 34.5 * TILE + 4);
      x -= 16;
    }
  }
}

export { FONT, MAZE_TOP };
