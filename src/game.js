// Game orchestration: the state machine (attract → ready → play → death /
// level clear / cutscene / game over), scoring, fruit, mode scheduling,
// frightened timing, collisions, and level progression with the 8-bit level
// counter and its level-256 kill screen.

import {
  TILE, WIDTH, DIR, SCORE, EXTRA_LIFE_AT, START_LIVES, T, COLORS,
  levelSpec, scatterChaseSchedule, houseDotLimits, noDotTimerTicks,
  fruitForLevel, FRUIT_DOTS, FRUIT_TICKS, FRUIT_POS,
} from './constants.js';
import { Maze } from './maze.js';
import { Pac } from './actors.js';
import {
  makeGhosts, HouseController, MODE, GSTATE, updateElroy, seedRng,
} from './ghosts.js';
import { Renderer, drawText, drawSmallText } from './render.js';
import {
  isKillScreen, HIDDEN_DOTS, drawKillScreenGarbage, drawGarbageTiles,
} from './killscreen.js';
import { Cutscene, cutsceneForLevel } from './cutscenes.js';
import { demoDirection } from './demoai.js';

const STATE = {
  BOOT: 'boot',
  ATTRACT: 'attract',
  START_SCREEN: 'startScreen',
  READY: 'ready',
  PLAY: 'play',
  GHOST_EATEN: 'ghostEaten',
  DYING: 'dying',
  LEVEL_DONE: 'levelDone',
  CUTSCENE: 'cutscene',
  GAME_OVER: 'gameOver',
};

const HS_KEY = 'packman.highscore';

// Character roster as it reads on the Japanese original: behaviour name,
// then the nickname in quotes, padded with dashes to a common width.
const ROSTER = [
  { key: 'blinky', name: 'OIKAKE----', nick: '"AKABEI"', color: COLORS.blinky },
  { key: 'pinky', name: 'MACHIBUSE--', nick: '"PINKY"', color: COLORS.pinky },
  { key: 'inky', name: 'KIMAGURE--', nick: '"AOSUKE"', color: COLORS.inky },
  { key: 'clyde', name: 'OTOBOKE---', nick: '"GUZUTA"', color: COLORS.clyde },
];

// Attract-mode demo chase: starts once the roster and point values are up.
const DEMO_START = 960;
const DEMO_Y = 20 * TILE + 4;
const DEMO_PILL_X = 20;
// After ~two loops of the chase demo, switch to the in-maze autoplay demo.
const DEMO_PLAY_AT = DEMO_START + 1260;
// Power-on: garbage VRAM flicker, then a blank beat, then attract.
const BOOT_GARBAGE_TICKS = 150;
const BOOT_TICKS = 205;

export class Game {
  constructor(canvas, input, audio) {
    this.maze = new Maze();
    this.renderer = new Renderer(canvas, this.maze);
    this.input = input;
    this.audio = audio;
    this.highScore = Number(localStorage.getItem(HS_KEY) || 0);
    this.tick = 0;
    this.credits = 0;
    this.toBoot();
  }

  // --- helpers ------------------------------------------------------------

  ghostList() { return [this.ghosts.blinky, this.ghosts.pinky, this.ghosts.inky, this.ghosts.clyde]; }
  ghost(name) { return this.ghosts[name]; }
  get blinky() { return this.ghosts.blinky; }

  addScore(points) {
    const before = this.score;
    this.score += points;
    if (this.demoMode) return; // demo score never grants lives or records
    if (before < EXTRA_LIFE_AT && this.score >= EXTRA_LIFE_AT) {
      this.lives++;
      this.audio.extraLife();
    }
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(HS_KEY, String(this.highScore));
    }
  }

  // --- state transitions --------------------------------------------------

  toBoot() {
    // Power-on look: uninitialized video RAM garbage, then a blank beat.
    this.state = STATE.BOOT;
    this.stateTimer = 0;
    this.demoMode = false;
    this.score = 0;
    this.lives = 0;
    this.level = 1;
    this.spec = levelSpec(1);
    this.pac = new Pac(this.maze);
    this.ghosts = makeGhosts(this.maze);
  }

  toAttract() {
    this.state = STATE.ATTRACT;
    this.stateTimer = 0;
    this.demo = null;
    this.demoMode = false;
    this.audio.suppressed = false;
    this.score = 0;
    this.lives = 0;
    this.level = 1;
    this.spec = levelSpec(1);
    this.pac = new Pac(this.maze);
    this.ghosts = makeGhosts(this.maze);
    this.maze.reset();
    this.audio.setLoop('none');
  }

  // Coin in: bump the credit counter with the coin chime; outside of a game
  // this brings up the PUSH START BUTTON screen, as on the real machine.
  insertCoin() {
    if (this.credits >= 99) return;
    this.credits++;
    this.audio.resume();
    this.audio.suppressed = false;
    this.audio.credit();
    if (this.state === STATE.BOOT || this.state === STATE.ATTRACT ||
        this.demoMode || this.state === STATE.GAME_OVER) {
      this.toStartScreen();
    }
  }

  toStartScreen() {
    this.demoMode = false;
    this.audio.suppressed = false;
    this.state = STATE.START_SCREEN;
    this.stateTimer = 0;
    this.demo = null;
    this.audio.setLoop('none');
  }

  // A start press only works with credit in the machine.
  tryStart() {
    if (this.credits <= 0) return false;
    this.credits--;
    this.audio.resume();
    this.newGame();
    return true;
  }

  // In-maze autoplay demo: real game rules, silent, one life, GAME OVER text.
  startDemoPlay() {
    this.demoMode = true;
    this.audio.suppressed = true;
    this.score = 0;
    this.lives = 0;
    this.level = 1;
    this.startLevel(false);
    this.state = STATE.PLAY; // no READY pause in the demo
  }

  newGame() {
    this.demoMode = false;
    this.audio.suppressed = false;
    this.demo = null;
    this.score = 0;
    this.lives = START_LIVES;
    this.level = 1;
    this.startLevel(true);
  }

  startLevel(firstOfGame = false) {
    this.spec = levelSpec(this.level);
    this.killScreen = isKillScreen(this.level);
    this.maze.reset(this.killScreen, HIDDEN_DOTS);
    seedRng(0x2a6d + this.level);
    this.house = new HouseController(this);
    this.houseLimits = houseDotLimits(this.level);
    this.noDotLimit = noDotTimerTicks(this.level);
    this.schedule = scatterChaseSchedule(this.level);
    this.resetPositions();
    this.beginReady(firstOfGame);
  }

  resetPositions() {
    this.pac.place(13.5 * TILE + 4 - 4 + 4, 26 * TILE + 4, DIR.LEFT); // (112, 212)
    this.pac.x = 112;
    this.pac.wantDir = DIR.LEFT;
    this.pac.frame = 0;
    for (const g of this.ghostList()) g.resetFor(this.level);
    this.phaseIndex = 0;
    this.phaseTimer = this.schedule[0];
    this.mode = MODE.SCATTER;
    this.frightTimer = 0;
    this.ghostChain = 0;
    this.pacFreeze = 0;
    this.fruit = null;          // {sprite, points, timer}
    this.fruitScore = null;     // {points, timer}
    this.fruitSpawned = 0;
    this.sirenLevel = 0;
    this.elroySuspended = false;
  }

  beginReady(firstOfGame) {
    this.state = STATE.READY;
    this.stateTimer = firstOfGame ? T.READY_FIRST : T.READY;
    this.readyFirst = firstOfGame;
    this.audio.setLoop('none');
    if (firstOfGame) this.audio.intro();
  }

  // --- per-frame update ---------------------------------------------------

  update() {
    this.tick++;
    if (this.input.consumeMute()) this.audio.toggleMute();
    if (this.input.consumeCoin()) this.insertCoin();
    switch (this.state) {
      case STATE.BOOT: this.updateBoot(); break;
      case STATE.ATTRACT: this.updateAttract(); break;
      case STATE.START_SCREEN: this.updateStartScreen(); break;
      case STATE.READY: this.updateReady(); break;
      case STATE.PLAY: this.updatePlay(); break;
      case STATE.GHOST_EATEN: this.updateGhostEaten(); break;
      case STATE.DYING: this.updateDying(); break;
      case STATE.LEVEL_DONE: this.updateLevelDone(); break;
      case STATE.CUTSCENE: this.updateCutscene(); break;
      case STATE.GAME_OVER: this.updateGameOver(); break;
    }
    this.audio.update();
  }

  updateBoot() {
    this.stateTimer++;
    this.handleStartInputs();
    if (this.stateTimer >= BOOT_TICKS && this.state === STATE.BOOT) this.toAttract();
  }

  // Start button behaves like the machine's: it only works with credit.
  // A touch tap stands in for both coin slot and start button.
  handleStartInputs() {
    if (this.input.consumeStart()) this.tryStart();
    if (this.input.consumeTap()) this.startOrCoin();
  }

  updateAttract() {
    this.stateTimer++;
    if (this.stateTimer >= DEMO_START) {
      if (!this.demo) this.initDemo();
      this.stepDemo();
    }
    if (this.stateTimer >= DEMO_PLAY_AT) {
      this.startDemoPlay();
      return;
    }
    this.handleStartInputs();
  }

  updateStartScreen() {
    this.stateTimer++;
    this.handleStartInputs();
  }

  // Tap fallback: start if there is credit, otherwise drop a coin in.
  startOrCoin() {
    if (!this.tryStart()) this.insertCoin();
  }

  // Attract-mode demo: the ghost train chases Pac leftward, he eats the
  // energizer, and the tables turn — 200/400/800/1600 as he eats them back.
  initDemo() {
    this.demo = {
      phase: 1, // 1 = chased left, 2 = frightened chase right
      pacX: WIDTH + 16,
      pacFrame: 0,
      chain: 0,
      freeze: 0,
      donePause: 0,
      score: null, // {x, points, timer}
      ghosts: ['blinky', 'pinky', 'inky', 'clyde'].map((name, i) => ({
        name, x: WIDTH + 44 + i * 18, eaten: false,
      })),
    };
  }

  stepDemo() {
    const D = this.demo;
    if (D.score && --D.score.timer <= 0) D.score = null;
    if (D.phase === 1) {
      D.pacX -= 1.25;
      D.pacFrame += 0.32;
      for (const g of D.ghosts) g.x -= 1.25;
      if (D.pacX <= DEMO_PILL_X) { D.phase = 2; }
    } else {
      // Frightened ghosts crawl right; Pac runs them down one by one.
      for (const g of D.ghosts) if (!g.eaten) g.x += 0.3;
      if (D.freeze > 0) {
        D.freeze--;
      } else {
        D.pacX += 1.5;
        D.pacFrame += 0.34;
        const next = D.ghosts.filter(g => !g.eaten).sort((a, b) => a.x - b.x)[0];
        if (next && D.pacX >= next.x) {
          next.eaten = true;
          const points = SCORE.GHOST[Math.min(D.chain, 3)];
          D.chain++;
          D.score = { x: next.x, points, timer: 40 };
          D.freeze = 40;
        }
      }
      if (D.pacX > WIDTH + 24 && ++D.donePause > 90) this.initDemo();
    }
  }

  updateReady() {
    if (this.input.consumeStart()) this.audio.resume();
    this.stateTimer--;
    if (this.stateTimer <= 0) {
      this.state = STATE.PLAY;
    }
  }

  currentSirenLevel() {
    const eaten = this.maze.totalDots - this.maze.dotsLeft;
    const frac = eaten / this.maze.totalDots;
    if (frac > 0.9) return 4;
    if (frac > 0.75) return 3;
    if (frac > 0.5) return 2;
    if (frac > 0.25) return 1;
    return 0;
  }

  updatePlay() {
    if (this.demoMode) {
      // Start (with credit) or a tap (as a coin) leaves the demo.
      this.handleStartInputs();
      if (!this.demoMode) return;
      if ((this.tick & 3) === 0) this.pac.setWant(demoDirection(this));
    } else if (this.input.dir) {
      this.pac.setWant(this.input.dir);
    }

    // mode scheduling (paused while frightened)
    if (this.frightTimer > 0) {
      this.frightTimer--;
      if (this.frightTimer === 0) {
        for (const g of this.ghostList()) g.frightened = false;
        this.ghostChain = 0;
      }
    } else {
      if (this.phaseTimer !== Infinity && --this.phaseTimer <= 0) {
        this.phaseIndex++;
        this.phaseTimer = this.schedule[this.phaseIndex];
        this.mode = this.phaseIndex % 2 === 0 ? MODE.SCATTER : MODE.CHASE;
        for (const g of this.ghostList()) g.reverseSignal();
      }
    }

    this.house.tick();
    updateElroy(this);

    // Pac movement (freeze frames after eating a dot)
    if (this.pacFreeze > 0) this.pacFreeze--;
    else {
      const pct = this.frightTimer > 0 ? this.spec.pacFright : this.spec.pac;
      this.pac.advancePac(pct);
    }
    this.eatAtPac();
    if (this.checkCollisions()) return;
    for (const g of this.ghostList()) g.update(this);
    if (this.checkCollisions()) return;

    // fruit lifecycle
    if (this.fruit && --this.fruit.timer <= 0) this.fruit = null;
    if (this.fruitScore && --this.fruitScore.timer <= 0) this.fruitScore = null;
    if (this.fruit && this.pac.tileX >= 13 && this.pac.tileX <= 14 && this.pac.tileY === 20) {
      this.addScore(this.fruit.points);
      this.audio.eatFruit();
      this.fruitScore = { points: this.fruit.points, timer: T.FRUIT_SCORE };
      this.fruit = null;
    }

    // sound loop
    const anyEyes = this.ghostList().some(g => g.state === GSTATE.EYES || g.state === GSTATE.ENTERING);
    if (anyEyes) this.audio.setLoop('eyes');
    else if (this.frightTimer > 0) this.audio.setLoop('fright');
    else this.audio.setLoop('siren', this.currentSirenLevel());

    if (this.maze.dotsLeft === 0) {
      this.state = STATE.LEVEL_DONE;
      this.stateTimer = T.LEVEL_FREEZE + T.LEVEL_FLASH;
      this.audio.setLoop('none');
    }
  }

  eatAtPac() {
    const d = this.maze.eatDotAt(this.pac.tileX, this.pac.tileY);
    if (!d) return;
    if (d === 1) this.audio.waka();
    else this.audio.eatEnergizer();
    this.house.onDotEaten();
    const eaten = this.maze.totalDots - this.maze.dotsLeft;
    if (eaten === FRUIT_DOTS[0] || eaten === FRUIT_DOTS[1]) this.spawnFruit();
    if (d === 1) {
      this.addScore(SCORE.PELLET);
      this.pacFreeze = 1;
    } else {
      this.addScore(SCORE.ENERGIZER);
      this.pacFreeze = 3;
      this.ghostChain = 0;
      if (this.spec.frightTicks > 0) {
        this.frightTimer = this.spec.frightTicks;
        for (const g of this.ghostList()) g.frighten();
      } else {
        // No frightened time on late levels — ghosts only reverse.
        for (const g of this.ghostList()) g.reverseSignal();
      }
    }
  }

  spawnFruit() {
    const f = fruitForLevel(this.level);
    this.fruit = { sprite: f.sprite, points: f.points, timer: FRUIT_TICKS };
    this.fruitSpawned++;
  }

  checkCollisions() {
    for (const g of this.ghostList()) {
      if (g.state !== GSTATE.OUTSIDE) continue;
      if (g.tileX === this.pac.tileX && g.tileY === this.pac.tileY) {
        if (g.frightened) {
          const points = SCORE.GHOST[Math.min(this.ghostChain, 3)];
          this.ghostChain++;
          this.addScore(points);
          this.audio.eatGhost();
          g.eaten();
          this.eatenGhost = g;
          this.eatenPoints = points;
          this.state = STATE.GHOST_EATEN;
          this.stateTimer = T.GHOST_EAT_PAUSE;
          return true;
        }
        this.startDeath();
        return true;
      }
    }
    return false;
  }

  updateGhostEaten() {
    this.stateTimer--;
    // Eyes already in flight keep moving during the pause.
    for (const g of this.ghostList()) {
      if ((g.state === GSTATE.EYES || g.state === GSTATE.ENTERING) && g !== this.eatenGhost) {
        g.update(this);
      }
    }
    if (this.stateTimer <= 0) {
      this.eatenGhost = null;
      this.state = STATE.PLAY;
    }
  }

  startDeath() {
    this.state = STATE.DYING;
    this.stateTimer = T.DEATH_FREEZE + T.DEATH_ANIM;
    this.deathSoundPlayed = false;
    this.audio.setLoop('none');
  }

  updateDying() {
    this.stateTimer--;
    if (this.stateTimer === T.DEATH_ANIM && !this.deathSoundPlayed) {
      this.deathSoundPlayed = true;
      this.audio.death();
    }
    if (this.stateTimer <= 0) {
      if (this.demoMode) { this.toAttract(); return; }
      this.lives--;
      if (this.lives < 0) {
        this.state = STATE.GAME_OVER;
        this.stateTimer = T.GAME_OVER;
      } else {
        this.house.afterDeath();
        this.elroySuspended = true;
        this.resetPositions();
        this.beginReady(false);
      }
    }
  }

  updateLevelDone() {
    this.stateTimer--;
    if (this.stateTimer <= 0) {
      if (this.demoMode) { this.toAttract(); return; }
      const cut = cutsceneForLevel(this.level);
      this.level++; // note: display/behavior wraps via killScreen check
      if (cut) {
        this.cutscene = new Cutscene(cut, this.renderer, this.audio);
        this.cutscene.hud = this;
        this.cutscene.score = this.score;
        this.state = STATE.CUTSCENE;
      } else {
        this.startLevel(false);
      }
    }
  }

  updateCutscene() {
    this.cutscene.update();
    if (this.cutscene.done || this.input.consumeStart()) {
      this.cutscene = null;
      this.startLevel(false);
    }
  }

  updateGameOver() {
    this.stateTimer--;
    this.handleStartInputs();
    if (this.state !== STATE.GAME_OVER) return;
    if (this.stateTimer <= 0) {
      if (this.credits > 0) this.toStartScreen();
      else this.toAttract();
    }
  }

  // --- drawing ------------------------------------------------------------

  draw() {
    const r = this.renderer;
    r.clear();
    if (this.state === STATE.BOOT) { this.drawBoot(); return; }
    if (this.state === STATE.ATTRACT) { this.drawAttract(); return; }
    if (this.state === STATE.START_SCREEN) { this.drawStartScreen(); return; }
    if (this.state === STATE.CUTSCENE) { this.cutscene.draw(); return; }

    const flashing = this.state === STATE.LEVEL_DONE && this.stateTimer < T.LEVEL_FLASH;
    const flashWhite = flashing && ((this.stateTimer / 16) | 0) % 2 === 0;
    r.drawMaze(flashWhite);
    if (this.killScreen) drawKillScreenGarbage(r.ctx);
    if (!flashing) r.drawDots(this.tick);
    r.drawHud(this);

    if (this.fruit) r.blit(r.sprites.fruit[this.fruit.sprite], FRUIT_POS.x, FRUIT_POS.y);
    if (this.fruitScore) {
      drawText(r.ctx, String(this.fruitScore.points), 12, 20, COLORS.pink);
    }
    // The autoplay demo runs under a standing GAME OVER banner, as on the
    // real machine's attract loop, with the credit count in place of lives.
    if (this.demoMode) {
      drawText(r.ctx, 'GAME  OVER', 9, 20, COLORS.red);
      this.drawCredits();
    }

    switch (this.state) {
      case STATE.READY:
        if (this.readyFirst) drawText(r.ctx, 'PLAYER ONE', 9, 14, COLORS.cyan);
        drawText(r.ctx, 'READY!', 11, 20, COLORS.yellow);
        if (this.readyFirst) break; // actors not shown during the tune
        this.drawActors();
        break;
      case STATE.PLAY:
        this.drawActors();
        break;
      case STATE.GHOST_EATEN:
        // Pac and the just-eaten ghost are hidden; its score shows instead.
        for (const g of this.ghostList()) {
          if (g !== this.eatenGhost) r.drawGhost(g, this);
        }
        r.blit(r.sprites.score[this.eatenPoints], this.eatenGhost.x, this.eatenGhost.y);
        break;
      case STATE.DYING: {
        if (this.stateTimer > T.DEATH_ANIM) {
          this.drawActors(); // brief freeze with everyone visible
        } else {
          const f = Math.floor((T.DEATH_ANIM - this.stateTimer) / (T.DEATH_ANIM / 12));
          r.blit(r.drawPacDeath(f), this.pac.x, this.pac.y);
        }
        break;
      }
      case STATE.LEVEL_DONE:
        if (!flashing) this.drawActors(true);
        else r.drawPac(this.pac);
        break;
      case STATE.GAME_OVER:
        drawText(r.ctx, 'GAME  OVER', 9, 20, COLORS.red);
        break;
    }
  }

  drawActors(pacOnlyGhostsHidden = false) {
    const r = this.renderer;
    r.drawPac(this.pac);
    if (!pacOnlyGhostsHidden) {
      for (const g of this.ghostList()) r.drawGhost(g, this);
    }
  }

  drawAttract() {
    const r = this.renderer, ctx = r.ctx;
    r.drawHud(this);
    drawText(ctx, 'CHARACTER / NICKNAME', 4, 4, COLORS.text);
    const step = 180;
    ROSTER.forEach((row, i) => {
      const appear = 120 + i * step;
      if (this.stateTimer < appear) return;
      const ty = 6 + i * 3;
      r.blit(r.sprites.ghost[row.key].RIGHT[0], 4 * TILE + 4, ty * TILE + 4);
      if (this.stateTimer > appear + 60) drawText(ctx, row.name, 6, ty, row.color);
      if (this.stateTimer > appear + 120) {
        drawText(ctx, row.nick, 6 + row.name.length, ty, row.color);
      }
    });
    if (this.stateTimer > 120 + 4 * step) {
      ctx.fillStyle = COLORS.dot;
      ctx.fillRect(10 * TILE + 3, 24 * TILE + 3, 2, 2);
      drawText(ctx, '10', 12, 24, COLORS.text);
      drawSmallText(ctx, 'PTS', 15 * TILE, 24 * TILE + 3, COLORS.text);
      ctx.fillStyle = COLORS.dot; // drawText left the fill on the text colour
      ctx.beginPath();
      ctx.arc(10 * TILE + 4, 27 * TILE + 4, 4, 0, Math.PI * 2);
      ctx.fill();
      drawText(ctx, '50', 12, 27, COLORS.text);
      drawSmallText(ctx, 'PTS', 15 * TILE, 27 * TILE + 3, COLORS.text);
    }
    if (this.demo) this.drawDemo();
    drawText(ctx, 'NAMCO', 11, 31, COLORS.pink);
    this.drawCredits();
  }

  drawCredits() {
    drawText(this.renderer.ctx, `CREDIT  ${this.credits}`, 2, 35, COLORS.text);
  }

  drawStartScreen() {
    const r = this.renderer, ctx = r.ctx;
    r.drawHud(this);
    drawText(ctx, 'PUSH START BUTTON', 6, 11, COLORS.orange);
    drawText(ctx, '1 PLAYER ONLY', 8, 15, COLORS.cyan);
    drawText(ctx, 'BONUS PACKMAN FOR 10000 PTS', 1, 19, COLORS.peach);
    drawText(ctx, '@ 1980 NAMCO', 8, 25, COLORS.pink);
    this.drawCredits();
  }

  drawBoot() {
    // Uninitialized-VRAM garbage that shuffles a few times, then a blank
    // screen just before the attract mode begins.
    if (this.stateTimer < BOOT_GARBAGE_TICKS) {
      const seed = 0xBEEF + Math.floor(this.stateTimer / 15) * 7919;
      drawGarbageTiles(this.renderer.ctx, 0, 28, seed, 82);
    }
  }

  drawDemo() {
    const r = this.renderer, ctx = r.ctx;
    const D = this.demo;
    const anim = (this.tick >> 3) & 1;
    // the demo energizer, blinking until eaten
    if (D.phase === 1 && (this.tick % 20) < 10) {
      ctx.fillStyle = COLORS.dot;
      ctx.beginPath();
      ctx.arc(DEMO_PILL_X, DEMO_Y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Pac (hidden while a ghost score is showing, as in gameplay)
    if (D.freeze === 0) {
      const dirName = D.phase === 1 ? 'LEFT' : 'RIGHT';
      const phase = Math.floor(D.pacFrame) % 4;
      const sprite = phase === 3 ? r.sprites.pacClosed
        : r.sprites.pac[dirName][phase === 1 ? 1 : 0];
      r.blit(sprite, D.pacX, DEMO_Y);
    }
    for (const g of D.ghosts) {
      if (g.eaten) continue;
      if (D.phase === 1) r.blit(r.sprites.ghost[g.name].LEFT[anim], g.x, DEMO_Y);
      else r.blit(r.sprites.fright[anim], g.x, DEMO_Y);
    }
    if (D.score) r.blit(r.sprites.score[D.score.points], D.score.x, DEMO_Y);
  }
}

export { STATE };
