// Renders the decoded ROM graphics to a PNG so the decode can be eyeballed.
//   node tools/dump-gfx.mjs out.png
// Top block: all 256 background tiles. Bottom block: all 64 sprites.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { TILE_PIXELS, SPRITE_PIXELS, PALETTE } from '../src/rom.js';

const SCALE = 2;
const TILE_COLS = 32;          // 32x8 grid of 8x8 tiles
const SPRITE_COLS = 16;        // 16x4 grid of 16x16 sprites
const W = 256;
const TILE_BLOCK_H = (256 / TILE_COLS) * 8;
const SPRITE_BLOCK_H = (64 / SPRITE_COLS) * 16;
const H = TILE_BLOCK_H + SPRITE_BLOCK_H;

// Each tile/sprite is drawn with the colour code that the game actually uses
// for it, so wrong colour wiring shows up as wrong colours here.
function tileColorCode(code) {
  if (code >= 0x90 && code <= 0xaf) return 0x14;  // fruit tiles
  if (code === 0x10 || code === 0x14) return 0x10; // dot / pill
  return 0x0f;
}
function spriteColorCode(code) {
  if (code <= 7) return 0x14;                     // fruit
  if (code === 28 || code === 29) return 0x11;    // frightened ghost
  if (code >= 32 && code <= 39) return 0x01;      // ghost body
  if (code >= 40 && code <= 43) return 0x18;      // score numbers
  return 0x09;                                    // Pac-Man yellow
}

const rgb = new Uint8Array(W * H * 3);
function put(x, y, palIndex) {
  if (PALETTE[palIndex * 4 + 3] === 0) return;
  const o = (y * W + x) * 3;
  rgb[o] = PALETTE[palIndex * 4];
  rgb[o + 1] = PALETTE[palIndex * 4 + 1];
  rgb[o + 2] = PALETTE[palIndex * 4 + 2];
}

for (let code = 0; code < 256; code++) {
  const ox = (code % TILE_COLS) * 8;
  const oy = Math.floor(code / TILE_COLS) * 8;
  const cc = tileColorCode(code);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      put(ox + x, oy + y, ((cc * 4) & 0xff) | TILE_PIXELS[code * 64 + y * 8 + x]);
    }
  }
}
for (let code = 0; code < 64; code++) {
  const ox = (code % SPRITE_COLS) * 16;
  const oy = TILE_BLOCK_H + Math.floor(code / SPRITE_COLS) * 16;
  const cc = spriteColorCode(code);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      put(ox + x, oy + y, ((cc * 4) & 0xff) | SPRITE_PIXELS[code * 256 + y * 16 + x]);
    }
  }
}

// Minimal PNG writer: filter byte 0 per row, one IDAT, no interlacing.
function png(width, height, pixels, scale) {
  const sw = width * scale, sh = height * scale;
  const raw = Buffer.alloc(sh * (sw * 3 + 1));
  let p = 0;
  for (let y = 0; y < sh; y++) {
    raw[p++] = 0;
    for (let x = 0; x < sw; x++) {
      const o = (Math.floor(y / scale) * width + Math.floor(x / scale)) * 3;
      raw[p++] = pixels[o];
      raw[p++] = pixels[o + 1];
      raw[p++] = pixels[o + 2];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sw, 0);
  ihdr.writeUInt32BE(sh, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const out = process.argv[2] || 'gfx.png';
writeFileSync(out, png(W, H, rgb, SCALE));
console.log(`wrote ${out} (${W * SCALE}x${H * SCALE})`);
