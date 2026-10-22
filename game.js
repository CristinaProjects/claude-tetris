'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - nut (metallic grey)
  '#424242', // B - bomb
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (nut)
  [[9]],                                       // B (bomb)
];

// Skins: cada una aporta su paleta (mismo índice que PIECES) y su forma de pintar una celda.
// `grid` opcional sustituye al color de rejilla del tema.
const SKINS = {
  retro: {
    label: 'Retro',
    colors: COLORS,
    drawCell(context, px, py, size, color) {
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      context.fillStyle = highlightColor;
      context.fillRect(px + 1, py + 1, size - 2, 4);
    },
  },
  neon: {
    label: 'Neon',
    grid: '#101018',
    colors: [null, '#00f0ff', '#fff200', '#ff00ff', '#39ff14', '#ff0040', '#2979ff', '#ff8c00', '#e0e0ff', '#ff4081'],
    drawCell(context, px, py, size, color) {
      context.save();
      context.shadowColor = color;
      context.shadowBlur = size * 0.5;
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(px + 3, py + 3, size - 6, size - 6);
      context.globalAlpha *= 0.3;
      context.fillStyle = color;
      context.fillRect(px + 3, py + 3, size - 6, size - 6);
      context.restore();
    },
  },
  pastel: {
    label: 'Pastel',
    colors: [null, '#a8e6f0', '#fff1a8', '#d9b8f0', '#b8e6c1', '#f5b5b5', '#b8d4f5', '#ffd2a8', '#d6dde2', '#7d7d8c'],
    drawCell(context, px, py, size, color) {
      const r = size * 0.25;
      roundRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
      context.fillStyle = color;
      context.fill();
      context.strokeStyle = 'rgba(0, 0, 0, 0.12)';
      context.lineWidth = 1;
      context.stroke();
      roundRectPath(context, px + 5, py + 4, size - 10, size * 0.3, r * 0.6);
      context.fillStyle = 'rgba(255, 255, 255, 0.45)';
      context.fill();
    },
  },
  pixel: {
    label: 'Pixel art',
    colors: COLORS,
    drawCell(context, px, py, size, color) {
      const n = 6, p = size / n;
      context.fillStyle = color;
      context.fillRect(px, py, size, size);
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) {
          let shade = null;
          if (r === 0 || c === 0) shade = 'rgba(255, 255, 255, 0.45)';       // bisel claro
          else if (r === n - 1 || c === n - 1) shade = 'rgba(0, 0, 0, 0.4)'; // bisel oscuro
          else if (r === 1 && c === 1) shade = 'rgba(255, 255, 255, 0.7)';   // brillo
          else if ((r + c) % 3 === 0) shade = 'rgba(0, 0, 0, 0.15)';         // tramado
          if (!shade) continue;
          context.fillStyle = shade;
          context.fillRect(px + Math.floor(c * p), py + Math.floor(r * p), Math.ceil(p), Math.ceil(p));
        }
    },
  },
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const NUT_CHANCE = 0.05;
const BOMB = 9;
const BOMB_EVERY = 5;
const EXPLOSION_MS = 300;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const skinSelect = document.getElementById('skin-select');

let gridColor, highlightColor, skin = SKINS.retro;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextBombAt, bombPending, explosion;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  return makePiece(Math.random() < NUT_CHANCE ? 8 : Math.floor(Math.random() * 7) + 1);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    while (lines >= nextBombAt) {
      bombPending = true;
      nextBombAt += BOMB_EVERY;
    }
    updateHUD();
  }
}

function explode(cx, cy) {
  let destroyed = 0;
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c]) {
        board[r][c] = 0;
        destroyed++;
      }
  score += destroyed * 10 * level;
  explosion = { x: cx, y: cy, t: performance.now() };
  updateHUD();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type === BOMB) {
    explode(current.x, current.y);
  } else {
    merge();
    clearLines();
  }
  spawn();
}

function spawn() {
  current = next;
  next = bombPending ? makePiece(BOMB) : randomPiece();
  bombPending = false;
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  if (colorIndex === BOMB) drawBomb(context, x, y, size);
  else skin.drawCell(context, x * size, y * size, size, skin.colors[colorIndex]);
  context.globalAlpha = 1;
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function drawBomb(context, x, y, size) {
  const cx = x * size + size / 2;
  const cy = y * size + size / 2 + size * 0.08;
  const rad = size * 0.34;
  // fuse
  context.strokeStyle = '#8d6e63';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(cx + rad * 0.5, cy - rad * 0.8);
  context.lineTo(cx + rad * 0.9, cy - rad * 1.35);
  context.stroke();
  // spark
  context.fillStyle = '#ffb300';
  context.beginPath();
  context.arc(cx + rad * 0.95, cy - rad * 1.4, size * 0.08, 0, Math.PI * 2);
  context.fill();
  // body
  context.fillStyle = skin.colors[BOMB];
  context.beginPath();
  context.arc(cx, cy, rad, 0, Math.PI * 2);
  context.fill();
  // shine
  context.fillStyle = highlightColor;
  context.beginPath();
  context.arc(cx - rad * 0.35, cy - rad * 0.35, rad * 0.25, 0, Math.PI * 2);
  context.fill();
}

function drawExplosion() {
  if (!explosion) return;
  const k = (performance.now() - explosion.t) / EXPLOSION_MS;
  if (k >= 1) { explosion = null; return; }
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = '#ff9800';
  ctx.fillRect((explosion.x - 1) * BLOCK, (explosion.y - 1) * BLOCK, BLOCK * 3, BLOCK * 3);
  ctx.fillStyle = '#ffeb3b';
  ctx.fillRect(explosion.x * BLOCK, explosion.y * BLOCK, BLOCK, BLOCK);
  ctx.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = skin.grid || gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  drawExplosion();
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  nextBombAt = BOMB_EVERY;
  bombPending = false;
  explosion = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === skinSelect) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const style = getComputedStyle(document.documentElement);
  gridColor = style.getPropertyValue('--grid').trim();
  highlightColor = style.getPropertyValue('--highlight').trim();
  const light = theme === 'light';
  themeToggle.textContent = light ? '☾ Oscuro' : '☀ Claro';
  themeToggle.setAttribute('aria-pressed', String(light));
  themeToggle.setAttribute('aria-label', light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  if (current) { draw(); drawNext(); }
}

function savedTheme() {
  try { return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch {}
  themeToggle.blur();
});

applyTheme(savedTheme());

function applySkin(name) {
  if (!Object.hasOwn(SKINS, name)) name = 'retro';
  skin = SKINS[name];
  document.documentElement.dataset.skin = name;
  skinSelect.value = name;
  if (current) { draw(); drawNext(); }
}

function savedSkin() {
  try { return localStorage.getItem('skin') || 'retro'; }
  catch { return 'retro'; }
}

for (const [key, s] of Object.entries(SKINS))
  skinSelect.add(new Option(s.label, key));

skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  try { localStorage.setItem('skin', skinSelect.value); } catch {}
  skinSelect.blur();
});

applySkin(savedSkin());

init();
