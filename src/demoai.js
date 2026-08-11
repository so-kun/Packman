// Attract-mode autoplay: a simple demo driver for Pac. BFS to the nearest
// remaining dot while treating tiles near hostile ghosts as blocked; if no
// safe path to food exists, run for whichever neighbor tile is farthest from
// the nearest ghost. (This is intentionally a light-weight stand-in for the
// original demo's canned inputs, which are not publicly documented.)

import { COLS, DIR_PRIORITY } from './constants.js';
import { TUNNEL_ROW } from './maze.js';
import { GSTATE } from './ghosts.js';

export function demoDirection(game) {
  const { maze, pac } = game;
  const hostiles = game.ghostList().filter(
    g => g.state === GSTATE.OUTSIDE && !g.frightened,
  );
  const danger = new Set();
  for (const g of hostiles) {
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (Math.abs(dx) + Math.abs(dy) <= 2) {
          danger.add(`${g.tileX + dx},${g.tileY + dy}`);
        }
      }
    }
  }

  // BFS from pac's tile; remember the first step of each path.
  const seen = new Set([`${pac.tileX},${pac.tileY}`]);
  const q = [[pac.tileX, pac.tileY, null]];
  let qi = 0;
  while (qi < q.length) {
    const [c, r, first] = q[qi++];
    if (first && maze.dots[r] && maze.dots[r][c]) return first;
    for (const d of DIR_PRIORITY) {
      let nc = c + d.x;
      const nr = r + d.y;
      if (nr === TUNNEL_ROW) {
        if (nc < 0) nc = COLS - 1;
        else if (nc >= COLS) nc = 0;
      }
      if (!maze.walkable(nc, nr)) continue;
      const k = `${nc},${nr}`;
      if (seen.has(k) || danger.has(k)) continue;
      seen.add(k);
      q.push([nc, nr, first || d]);
    }
  }

  // No safe route to a dot: flee — maximize distance from the nearest ghost.
  let best = null;
  let bestDist = -1;
  for (const d of DIR_PRIORITY) {
    const nc = pac.tileX + d.x, nr = pac.tileY + d.y;
    if (!maze.walkable(nc, nr)) continue;
    let minDist = 999;
    for (const g of hostiles) {
      minDist = Math.min(minDist, Math.abs(g.tileX - nc) + Math.abs(g.tileY - nr));
    }
    if (minDist > bestDist) { bestDist = minDist; best = d; }
  }
  return best || pac.dir;
}
