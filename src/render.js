// Rendering: procedurally generated pixel sprites (all original artwork),
// morphologically derived maze outlines, an 8x8 bitmap font, and the HUD.

import {
  TILE, COLS, ROWS, WIDTH, HEIGHT, COLORS, fruitForLevel,
} from './constants.js';
import { MAZE_TOP, DOOR_TILES, TUNNEL_ROW } from './maze.js';
import { GSTATE } from './ghosts.js';

// ---------------------------------------------------------------------------
// Bitmap font: 6x7 glyphs in an 8x8 cell, matching the wider, round-cornered
// look of the arcade original rather than a generic 5x7 block face.
const FONT = {
  A: [0x1e, 0x21, 0x21, 0x3f, 0x21, 0x21, 0x21],
  B: [0x3e, 0x21, 0x21, 0x3e, 0x21, 0x21, 0x3e],
  C: [0x1e, 0x21, 0x20, 0x20, 0x20, 0x21, 0x1e],
  D: [0x3e, 0x21, 0x21, 0x21, 0x21, 0x21, 0x3e],
  E: [0x3f, 0x20, 0x20, 0x3e, 0x20, 0x20, 0x3f],
  F: [0x3f, 0x20, 0x20, 0x3e, 0x20, 0x20, 0x20],
  G: [0x1e, 0x21, 0x20, 0x27, 0x21, 0x21, 0x1e],
  H: [0x21, 0x21, 0x21, 0x3f, 0x21, 0x21, 0x21],
  I: [0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08],
  J: [0x01, 0x01, 0x01, 0x01, 0x21, 0x21, 0x1e],
  K: [0x21, 0x22, 0x24, 0x38, 0x24, 0x22, 0x21],
  L: [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x3f],
  M: [0x21, 0x33, 0x2d, 0x21, 0x21, 0x21, 0x21],
  N: [0x21, 0x31, 0x29, 0x25, 0x23, 0x21, 0x21],
  O: [0x1e, 0x21, 0x21, 0x21, 0x21, 0x21, 0x1e],
  P: [0x3e, 0x21, 0x21, 0x3e, 0x20, 0x20, 0x20],
  Q: [0x1e, 0x21, 0x21, 0x21, 0x2d, 0x24, 0x1a],
  R: [0x3e, 0x21, 0x21, 0x3e, 0x24, 0x22, 0x21],
  S: [0x1e, 0x21, 0x20, 0x1e, 0x01, 0x21, 0x1e],
  T: [0x3f, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08],
  U: [0x21, 0x21, 0x21, 0x21, 0x21, 0x21, 0x1e],
  V: [0x21, 0x21, 0x21, 0x21, 0x21, 0x12, 0x0c],
  W: [0x21, 0x21, 0x21, 0x2d, 0x2d, 0x33, 0x21],
  X: [0x21, 0x21, 0x12, 0x0c, 0x12, 0x21, 0x21],
  Y: [0x21, 0x21, 0x12, 0x0c, 0x08, 0x08, 0x08],
  Z: [0x3f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x3f],
  0: [0x1e, 0x21, 0x21, 0x21, 0x21, 0x21, 0x1e],
  1: [0x08, 0x18, 0x08, 0x08, 0x08, 0x08, 0x1c],
  2: [0x1e, 0x21, 0x01, 0x06, 0x08, 0x10, 0x3f],
  3: [0x1e, 0x21, 0x01, 0x0e, 0x01, 0x21, 0x1e],
  4: [0x02, 0x06, 0x0a, 0x12, 0x3f, 0x02, 0x02],
  5: [0x3f, 0x20, 0x3e, 0x01, 0x01, 0x21, 0x1e],
  6: [0x0e, 0x10, 0x20, 0x3e, 0x21, 0x21, 0x1e],
  7: [0x3f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  8: [0x1e, 0x21, 0x21, 0x1e, 0x21, 0x21, 0x1e],
  9: [0x1e, 0x21, 0x21, 0x1f, 0x01, 0x02, 0x1c],
  '!': [0x08, 0x08, 0x08, 0x08, 0x08, 0x00, 0x08],
  '-': [0x00, 0x00, 0x00, 0x1e, 0x00, 0x00, 0x00],
  '/': [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x20],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0c, 0x0c],
  '"': [0x12, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00],
  ',': [0x00, 0x00, 0x00, 0x00, 0x0c, 0x04, 0x08],
  ':': [0x00, 0x0c, 0x0c, 0x00, 0x0c, 0x0c, 0x00],
  '(': [0x04, 0x08, 0x10, 0x10, 0x10, 0x08, 0x04],
  ')': [0x10, 0x08, 0x04, 0x04, 0x04, 0x08, 0x10],
  '@': [0x1e, 0x21, 0x2f, 0x2c, 0x2f, 0x21, 0x1e],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

export function drawText(ctx, text, tx, ty, color) {
  ctx.fillStyle = color;
  for (let i = 0; i < text.length; i++) {
    const glyph = FONT[text[i].toUpperCase()] || FONT[' '];
    const ox = (tx + i) * TILE + 1;
    const oy = ty * TILE + 1;
    for (let r = 0; r < 7; r++) {
      const bits = glyph[r];
      if (!bits) continue;
      for (let c = 0; c < 6; c++) {
        if (bits & (1 << (5 - c))) ctx.fillRect(ox + c, oy + r, 1, 1);
      }
    }
  }
}

// The original sets "PTS" beside the pellet values in a smaller face.
const SMALL_FONT = {
  P: ['###.', '#..#', '###.', '#...', '#...'],
  T: ['####', '.#..', '.#..', '.#..', '.#..'],
  S: ['.###', '#...', '.##.', '...#', '###.'],
  ' ': ['....', '....', '....', '....', '....'],
};

export function drawSmallText(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  let ox = x;
  for (const ch of text.toUpperCase()) {
    const g = SMALL_FONT[ch] || SMALL_FONT[' '];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 4; c++) if (g[r][c] === '#') ctx.fillRect(ox + c, y + r, 1, 1);
    }
    ox += 5;
  }
}

// ---------------------------------------------------------------------------
// Pixel drawing helpers

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }

// Pixel-quantized filled circle — keeps edges crisp at sprite scale.
function disc(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function pxs(ctx, list, color) {
  ctx.fillStyle = color;
  for (const [x, y] of list) ctx.fillRect(x, y, 1, 1);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// Pac sprites: a 13px disc with a mouth wedge, in a 16x16 cell.

function makePacSprite(dirAngle, mouthHalf, scale = 1) {
  const s = 16 * scale;
  const cv = makeCanvas(s, s);
  const ctx = cv.getContext('2d');
  const cx = s / 2, cy = s / 2, r = 6.7 * scale;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      if (mouthHalf > 0) {
        let a = Math.atan2(dy, dx) - dirAngle;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        // The mouth is a wedge that narrows to a point at the center.
        if (Math.abs(a) < mouthHalf) continue;
      }
      px(ctx, x, y, COLORS.pac);
    }
  }
  return cv;
}

const DIR_ANGLE = { RIGHT: 0, DOWN: Math.PI / 2, LEFT: Math.PI, UP: -Math.PI / 2 };
// Mouth stages: shut, half, wide (~90 degrees total at its widest).
const MOUTH = [0, 0.30, 0.78];

// ---------------------------------------------------------------------------
// Ghost sprites: 14x14 body in a 16x16 cell — domed top, straight flanks and
// a zig-zag skirt that alternates between two phases.

function skirtDepth(x, frame) {
  // Frame A points down at x=1,5,9,13; frame B at x=3,7,11.
  const points = frame === 'a' ? [1, 5, 9, 13] : [3, 7, 11];
  let best = 99;
  for (const p of points) best = Math.min(best, Math.abs(x - p));
  return Math.max(0, 3 - best);
}

function makeGhostBody(color, frame) {
  const cv = makeCanvas(16, 16);
  const ctx = cv.getContext('2d');
  const ox = 1, oy = 1;
  ctx.fillStyle = color;
  // dome (rows 0-10): circular cap of radius 7.5 centred at (6.5, 7)
  for (let y = 0; y <= 10; y++) {
    let half = 7.5;
    if (y < 7) half = Math.sqrt(56.25 - (7 - y) * (7 - y));
    const x0 = Math.max(0, Math.round(6.5 - half));
    const x1 = Math.min(13, Math.round(6.5 + half));
    ctx.fillRect(ox + x0, oy + y, x1 - x0 + 1, 1);
  }
  // skirt (rows 11-13)
  for (let x = 0; x < 14; x++) {
    const d = skirtDepth(x, frame);
    for (let k = 0; k < d; k++) ctx.fillRect(ox + x, oy + 11 + k, 1, 1);
  }
  return cv;
}

// Eye: 4x4 white blob with clipped corners, 2x2 pupil offset by gaze.
const GAZE = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
const PUPIL = { UP: [1, 0], DOWN: [1, 2], LEFT: [0, 1], RIGHT: [2, 1] };

function drawGhostEyes(ctx, dirName, ox = 1, oy = 1) {
  const gaze = GAZE[dirName] || [0, 0];
  const pupil = PUPIL[dirName] || [1, 1];
  for (const ex of [2, 8]) {
    const wx = ox + ex + gaze[0], wy = oy + 4 + gaze[1];
    ctx.fillStyle = COLORS.eyeWhite;
    ctx.fillRect(wx + 1, wy, 2, 4);
    ctx.fillRect(wx, wy + 1, 4, 2);
    ctx.fillStyle = COLORS.pupil;
    ctx.fillRect(wx + pupil[0], wy + pupil[1], 2, 2);
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
  ctx.fillStyle = face;
  ctx.fillRect(1 + 3, 1 + 5, 2, 2);
  ctx.fillRect(1 + 9, 1 + 5, 2, 2);
  // zig-zag mouth across the face
  for (let i = 0; i < 12; i++) {
    const up = (i % 4 === 1 || i % 4 === 2);
    ctx.fillRect(1 + 1 + i, 1 + (up ? 9 : 10), 1, 1);
  }
  return cv;
}

function makeEyesSprite(dirName) {
  const cv = makeCanvas(16, 16);
  drawGhostEyes(cv.getContext('2d'), dirName);
  return cv;
}

// ---------------------------------------------------------------------------
// Fruit sprites (original artwork), drawn into a 16x16 cell.

const F = {
  red: '#ff0000', dark: '#b81800', green: '#00b800', leaf: '#00ff00',
  orange: '#ffb852', brown: '#b87800', white: '#dedede', cyan: '#00ffff',
  yellow: '#ffff00', blue: '#2121ff', melon: '#00d800', melonLite: '#b8ffb8',
};

const FRUIT_BUILDERS = {
  cherry(c) {
    pxs(c, [[6, 9], [7, 8], [8, 7], [9, 6], [10, 5], [11, 4], [11, 8], [11, 7], [11, 6], [11, 5]], F.green);
    pxs(c, [[12, 3], [13, 3], [13, 2], [12, 4]], F.leaf);
    disc(c, 5, 11.5, 3.3, F.red);
    disc(c, 11, 12, 3.3, F.red);
    pxs(c, [[3, 10], [9, 11]], F.white);
  },
  strawberry(c) {
    pxs(c, [[7, 1], [8, 1], [7, 2]], F.green);
    for (let x = 4; x <= 11; x++) px(c, x, 3, F.leaf);
    pxs(c, [[5, 4], [7, 4], [9, 4], [10, 4], [6, 4], [8, 4]], F.leaf);
    // tapering body
    for (let y = 5; y <= 13; y++) {
      const half = 4.6 * (1 - (y - 5) / 10.5);
      const x0 = Math.round(7.5 - half - 0.5), x1 = Math.round(7.5 + half - 0.5);
      c.fillStyle = F.red;
      c.fillRect(x0, y, x1 - x0 + 1, 1);
    }
    pxs(c, [[5, 6], [9, 6], [7, 8], [4, 9], [10, 9], [6, 11], [9, 11]], F.white);
  },
  orange(c) {
    pxs(c, [[7, 3], [7, 4]], F.brown);
    pxs(c, [[8, 2], [9, 2], [10, 3], [9, 3]], F.leaf);
    disc(c, 7.5, 9.5, 4.6, F.orange);
    pxs(c, [[5, 7], [4, 8]], F.white);
  },
  apple(c) {
    disc(c, 5.6, 10, 3.9, F.red);
    disc(c, 9.4, 10, 3.9, F.red);
    c.fillStyle = F.red;
    c.fillRect(5, 7, 5, 7);
    pxs(c, [[7, 4], [7, 5], [7, 3]], F.brown);
    pxs(c, [[8, 3], [9, 3], [9, 2], [10, 3]], F.leaf);
    pxs(c, [[4, 8], [3, 9]], F.white);
  },
  melon(c) {
    pxs(c, [[7, 3], [7, 4], [8, 3]], F.green);
    disc(c, 7.5, 9.5, 4.8, F.melon);
    // lighter meridian stripes following the curve of the rind
    for (let y = 6; y <= 13; y++) {
      const t = (y - 9.5) / 4.8;
      const w = Math.sqrt(Math.max(0, 1 - t * t));
      for (const s of [-0.66, 0, 0.66]) {
        px(c, Math.round(7.5 + s * 4.8 * w), y, F.melonLite);
      }
    }
  },
  galaxian(c) {
    // flagship: red nose, yellow swept wings, blue underside
    pxs(c, [[7, 2], [8, 2], [7, 3], [8, 3], [6, 4], [7, 4], [8, 4], [9, 4]], F.red);
    pxs(c, [[6, 5], [7, 5], [8, 5], [9, 5]], F.red);
    pxs(c, [[2, 5], [3, 6], [2, 6], [12, 6], [13, 6], [13, 5]], F.yellow);
    for (let i = 0; i < 5; i++) {
      pxs(c, [[2 + i, 7], [11 - i + 2, 7]], F.yellow);
    }
    pxs(c, [[3, 8], [4, 8], [11, 8], [12, 8], [4, 9], [11, 9]], F.yellow);
    pxs(c, [[6, 6], [7, 6], [8, 6], [9, 6], [6, 7], [7, 7], [8, 7], [9, 7]], F.blue);
    pxs(c, [[6, 8], [7, 8], [8, 8], [9, 8], [7, 9], [8, 9], [7, 10], [8, 10]], F.blue);
    pxs(c, [[5, 10], [10, 10], [6, 11], [9, 11]], F.yellow);
  },
  bell(c) {
    pxs(c, [[7, 2], [8, 2]], F.white);
    // bell body widening downward
    for (let y = 3; y <= 11; y++) {
      const half = 1.6 + (y - 3) * 0.62;
      const x0 = Math.round(7.5 - half - 0.5), x1 = Math.round(7.5 + half - 0.5);
      c.fillStyle = F.yellow;
      c.fillRect(x0, y, x1 - x0 + 1, 1);
    }
    c.fillStyle = F.yellow;
    c.fillRect(2, 12, 12, 1);
    c.fillStyle = F.white;
    c.fillRect(3, 13, 10, 1);
    pxs(c, [[7, 14], [8, 14]], F.white);
    pxs(c, [[5, 5], [4, 7], [4, 9]], F.white);
  },
  key(c) {
    c.fillStyle = F.cyan;
    c.fillRect(5, 2, 6, 5);
    c.fillStyle = '#000';
    c.fillRect(7, 4, 2, 2);
    c.fillStyle = F.white;
    c.fillRect(7, 7, 2, 7);
    c.fillStyle = F.white;
    c.fillRect(9, 10, 2, 1);
    c.fillRect(9, 12, 2, 1);
  },
};

function makeFruitSprite(name) {
  const cv = makeCanvas(16, 16);
  const ctx = cv.getContext('2d');
  FRUIT_BUILDERS[name](ctx);
  return cv;
}

// Ghost-score sprites (200/400/800/1600) with a 3x5 digit font.
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
    const mask = this.computeWallMask();
    this.wallBlue = this.paintWalls(mask, COLORS.wall, true);
    this.wallWhite = this.paintWalls(mask, '#dedede', false);
  }

  buildSprites() {
    const S = this.sprites = {};
    S.pacClosed = makePacSprite(0, 0);
    S.pac = {};
    for (const d of ['RIGHT', 'DOWN', 'LEFT', 'UP']) {
      S.pac[d] = [
        makePacSprite(DIR_ANGLE[d], MOUTH[1]),
        makePacSprite(DIR_ANGLE[d], MOUTH[2]),
      ];
    }
    S.pacGiant = {};
    for (const d of ['RIGHT', 'LEFT']) {
      S.pacGiant[d] = [
        makePacSprite(DIR_ANGLE[d], MOUTH[1], 2),
        makePacSprite(DIR_ANGLE[d], MOUTH[2], 2),
      ];
    }
    // Death: the mouth opens upward until the body is gone, then a burst.
    S.pacDeath = [];
    for (let i = 0; i < 11; i++) {
      S.pacDeath.push(makePacSprite(DIR_ANGLE.UP, 0.22 + (i / 10) * 2.9));
    }
    const pop = makeCanvas(16, 16);
    const pc = pop.getContext('2d');
    pc.fillStyle = COLORS.pac;
    for (const [x, y] of [[7, 1], [7, 13], [1, 7], [13, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) {
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
    for (const name of Object.keys(FRUIT_BUILDERS)) S.fruit[name] = makeFruitSprite(name);
    S.score = {};
    for (const v of [200, 400, 800, 1600]) S.score[v] = makeScoreSprite(v);
  }

  // Tiles that are open but lie outside the maze proper (the black margins
  // beside the tunnel). Found by flooding inward from the playfield border
  // through non-wall tiles, never entering the tunnel row — which is the one
  // place the outside genuinely connects to a corridor.
  computeExteriorTiles() {
    const ext = new Set();
    const stack = [];
    const top = MAZE_TOP, bottom = MAZE_TOP + 30;
    const visit = (c, r) => {
      if (c < 0 || c >= COLS || r < top || r > bottom) return;
      if (r === TUNNEL_ROW || this.maze.wall[r][c]) return;
      const k = `${c},${r}`;
      if (ext.has(k)) return;
      ext.add(k);
      stack.push([c, r]);
    };
    for (let r = top; r <= bottom; r++) { visit(0, r); visit(COLS - 1, r); }
    for (let c = 0; c < COLS; c++) { visit(c, top); visit(c, bottom); }
    while (stack.length) {
      const [c, r] = stack.pop();
      visit(c + 1, r); visit(c - 1, r); visit(c, r + 1); visit(c, r - 1);
    }
    return ext;
  }

  // The maze outline is traced as a path rather than filled per tile: each
  // wall region gets a contour inset 3.5px from the open space beside it,
  // with every corner arced — the look of the original's tile set. Sides that
  // face the black margin outside the maze are inset only 0.5px instead,
  // which is what gives the perimeter its characteristic double line.
  buildWallPath() {
    const IN = 3.5, OUT = 0.5, R = 4;
    const top = MAZE_TOP, bottom = MAZE_TOP + 30;
    const ext = this.computeExteriorTiles();
    const path = new Path2D();

    const isWall = (c, r) => {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
      return this.maze.wall[r][c] && !this.maze.door[r][c];
    };
    const exterior = (c, r) => {
      if (c < 0 || c >= COLS || r < top || r > bottom) return true;
      return ext.has(`${c},${r}`);
    };
    // How far the contour sits from the edge shared with this neighbour.
    const inset = (c, r) => (exterior(c, r) ? OUT : IN);

    // Straight runs along each open-facing side, trimmed where a corner arc
    // takes over.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isWall(c, r)) continue;
        const x = c * TILE, y = r * TILE;
        const oN = !isWall(c, r - 1), oS = !isWall(c, r + 1);
        const oE = !isWall(c + 1, r), oW = !isWall(c - 1, r);
        const iN = inset(c, r - 1), iS = inset(c, r + 1);
        const iE = inset(c + 1, r), iW = inset(c - 1, r);
        if (oN) {
          const a = oW ? x + iW + R : x, b = oE ? x + TILE - iE - R : x + TILE;
          if (b > a) { path.moveTo(a, y + iN); path.lineTo(b, y + iN); }
        }
        if (oS) {
          const a = oW ? x + iW + R : x, b = oE ? x + TILE - iE - R : x + TILE;
          if (b > a) { path.moveTo(a, y + TILE - iS); path.lineTo(b, y + TILE - iS); }
        }
        if (oW) {
          const a = oN ? y + iN + R : y, b = oS ? y + TILE - iS - R : y + TILE;
          if (b > a) { path.moveTo(x + iW, a); path.lineTo(x + iW, b); }
        }
        if (oE) {
          const a = oN ? y + iN + R : y, b = oS ? y + TILE - iS - R : y + TILE;
          if (b > a) { path.moveTo(x + TILE - iE, a); path.lineTo(x + TILE - iE, b); }
        }
      }
    }

    // Corner arcs, classified per grid vertex by which of its four quadrants
    // are wall. One wall (or two diagonal) means a convex corner; three walls
    // means the contour wraps a concave corner around the single open tile.
    const HALF = Math.PI / 2;
    // arc() would otherwise join to whatever point the path last held.
    const arcSeg = (cx, cy, rad, a0, a1) => {
      path.moveTo(cx + rad * Math.cos(a0), cy + rad * Math.sin(a0));
      path.arc(cx, cy, rad, a0, a1);
    };
    for (let gr = 0; gr <= ROWS; gr++) {
      for (let gc = 0; gc <= COLS; gc++) {
        const x = gc * TILE, y = gr * TILE;
        const q = {
          nw: isWall(gc - 1, gr - 1), ne: isWall(gc, gr - 1),
          sw: isWall(gc - 1, gr), se: isWall(gc, gr),
        };
        const walls = (q.nw ? 1 : 0) + (q.ne ? 1 : 0) + (q.sw ? 1 : 0) + (q.se ? 1 : 0);
        if (walls === 0 || walls === 4) continue;

        // convex corner of a lone wall quadrant
        const convex = (which) => {
          if (which === 'se') {
            const cx = x + inset(gc - 1, gr) + R, cy = y + inset(gc, gr - 1) + R;
            arcSeg(cx, cy, R, Math.PI, 3 * HALF);
          } else if (which === 'sw') {
            const cx = x - inset(gc, gr) - R, cy = y + inset(gc - 1, gr - 1) + R;
            arcSeg(cx, cy, R, 3 * HALF, 4 * HALF);
          } else if (which === 'ne') {
            const cx = x + inset(gc - 1, gr - 1) + R, cy = y - inset(gc, gr) - R;
            arcSeg(cx, cy, R, HALF, Math.PI);
          } else {
            const cx = x - inset(gc, gr - 1) - R, cy = y - inset(gc - 1, gr) - R;
            arcSeg(cx, cy, R, 0, HALF);
          }
        };

        if (walls === 1) {
          convex(q.se ? 'se' : q.sw ? 'sw' : q.ne ? 'ne' : 'nw');
        } else if (walls === 2) {
          if (q.nw && q.se) { convex('se'); convex('nw'); }
          else if (q.ne && q.sw) { convex('sw'); convex('ne'); }
          // adjacent pairs are a straight run — nothing to draw
        } else {
          // three walls: arc around the single open quadrant
          if (!q.nw) {
            const d = inset(gc - 1, gr - 1);
            arcSeg(x + d, y + d, d, Math.PI, 3 * HALF);
          } else if (!q.ne) {
            const d = inset(gc, gr - 1);
            arcSeg(x - d, y + d, d, 3 * HALF, 4 * HALF);
          } else if (!q.sw) {
            const d = inset(gc - 1, gr);
            arcSeg(x + d, y - d, d, HALF, Math.PI);
          } else {
            const d = inset(gc, gr);
            arcSeg(x - d, y - d, d, 0, HALF);
          }
        }
      }
    }
    return path;
  }

  // Stroke the contour, then threshold coverage so the result is hard pixels
  // rather than the antialiased edges canvas would otherwise leave.
  computeWallMask() {
    const cv = makeCanvas(WIDTH, HEIGHT);
    const ctx = cv.getContext('2d');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke(this.buildWallPath());
    const data = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
    const mask = new Uint8Array(WIDTH * HEIGHT);
    for (let i = 0; i < mask.length; i++) if (data[i * 4 + 3] > 120) mask[i] = 1;
    return mask;
  }

  paintWalls(mask, color, withDoor) {
    const cv = makeCanvas(WIDTH, HEIGHT);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(WIDTH, HEIGHT);
    const [r, g, b] = hexToRgb(color);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const o = i * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (withDoor) {
      ctx.fillStyle = COLORS.door;
      for (const [c, rr] of DOOR_TILES) ctx.fillRect(c * TILE, rr * TILE + 3, TILE, 2);
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
          disc(ctx, c * TILE + 4, r * TILE + 4, 3.6, COLORS.dot);
        }
      }
    }
  }

  blit(sprite, cx, cy) {
    this.ctx.drawImage(sprite, Math.round(cx - sprite.width / 2), Math.round(cy - sprite.height / 2));
  }

  drawPac(pac) {
    // Cycle shut -> half -> wide -> half, freezing when Pac is not moving.
    const phase = Math.floor(pac.frame) % 4;
    let sprite;
    if (phase === 0) sprite = this.sprites.pacClosed;
    else if (phase === 2) sprite = this.sprites.pac[pac.dir.name][1];
    else sprite = this.sprites.pac[pac.dir.name][0];
    this.blit(sprite, pac.x, pac.y);
  }

  drawPacDeath(frameIndex) {
    const frames = this.sprites.pacDeath;
    return frames[Math.min(frameIndex, frames.length - 1)];
  }

  drawGhost(g, game) {
    const fi = (game.tick >> 3) & 1;
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
    // stays on screen (matches the arcade original). No blink in attract or
    // during the autoplay demo — there is no active player then.
    const inGame = game.state && game.state !== 'attract' && !game.demoMode;
    if (!inGame || (game.tick % 32) < 16) drawText(ctx, '1UP', 3, 0, COLORS.text);
    drawText(ctx, 'HIGH SCORE', 9, 0, COLORS.text);
    // "2UP" sits opposite "1UP" while the machine is idle; a one-player game
    // in progress shows only the active side.
    if (!inGame) drawText(ctx, '2UP', 22, 0, COLORS.text);
    const s = String(game.score === 0 ? '00' : game.score);
    drawText(ctx, s.padStart(6, ' '), 1, 1, COLORS.text);
    const hs = String(game.highScore === 0 ? '00' : game.highScore);
    drawText(ctx, hs.padStart(6, ' '), 11, 1, COLORS.text);
    // lives (bottom-left), facing left as on the original
    for (let i = 0; i < Math.min(game.lives, 5); i++) {
      this.blit(this.sprites.pac.LEFT[1], 20 + i * 16, 34.5 * TILE + 4);
    }
    // Fruit history (bottom-right): the last 7 levels, anchored at the right
    // edge with the oldest there — new fruit pushes in from the left.
    const first = Math.max(1, game.level - 6);
    let x = 24.5 * TILE;
    for (let lv = first; lv <= game.level; lv++) {
      const f = fruitForLevel(lv);
      this.blit(this.sprites.fruit[f.sprite], x, 34.5 * TILE + 4);
      x -= 16;
    }
  }
}

export { FONT, MAZE_TOP };
