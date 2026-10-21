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

const LINE_SCORES = [0, 100, 300, 500, 800];
const NUT_CHANCE = 0.05;
const BOMB = 9;
const BOMB_EVERY = 5;
const EXPLOSION_MS = 300;
const TOP_SIZE = 5;
const NAME_MAX = 12;

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
const playBtn = document.getElementById('play-btn');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('player-name');
const recordsBox = document.getElementById('records');
const recordsBody = document.getElementById('records-body');
const recordsStats = document.getElementById('records-stats');
const clearRecordsBtn = document.getElementById('clear-records-btn');

let gridColor, highlightColor;
let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let nextBombAt, bombPending, explosion;
let started = false, combo, maxCombo, pendingEntry;

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
  return cleared;
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
    // combo: piezas seguidas que limpian líneas (la bomba no cuenta)
    if (clearLines()) {
      combo++;
      maxCombo = Math.max(maxCombo, combo);
    } else {
      combo = 0;
    }
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
  if (colorIndex === BOMB) { drawBomb(context, x, y, size, alpha); return; }
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawBomb(context, x, y, size, alpha) {
  const cx = x * size + size / 2;
  const cy = y * size + size / 2 + size * 0.08;
  const rad = size * 0.34;
  context.globalAlpha = alpha ?? 1;
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
  context.fillStyle = COLORS[BOMB];
  context.beginPath();
  context.arc(cx, cy, rad, 0, Math.PI * 2);
  context.fill();
  // shine
  context.fillStyle = highlightColor;
  context.beginPath();
  context.arc(cx - rad * 0.35, cy - rad * 0.35, rad * 0.25, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
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
  ctx.strokeStyle = gridColor;
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
  const rec = loadRecords();
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);
  const qualifies = score > 0 &&
    (rec.top.length < TOP_SIZE || score > rec.top[rec.top.length - 1].score);
  if (qualifies) {
    pendingEntry = { score, lines, level, date: new Date().toISOString().slice(0, 10) };
    nameInput.value = savedName();
    nameForm.classList.remove('hidden');
  }
  renderRecords(rec, -1);
  recordsBox.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (qualifies) { nameInput.focus(); nameInput.select(); }
}

// ---- Records (localStorage) ----
function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  let data;
  try { data = JSON.parse(localStorage.getItem('records')); }
  catch { return emptyRecords(); }
  if (!data || typeof data !== 'object') return emptyRecords();
  const num = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const top = (Array.isArray(data.top) ? data.top : [])
    .filter(e => e && typeof e === 'object' && typeof e.name === 'string' && Number.isFinite(e.score))
    .map(e => ({
      name: e.name.slice(0, NAME_MAX),
      score: num(e.score),
      lines: num(e.lines),
      level: num(e.level),
      date: typeof e.date === 'string' ? e.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_SIZE);
  return { top, bestCombo: num(data.bestCombo), maxLines: num(data.maxLines) };
}

function saveRecords(rec) {
  try { localStorage.setItem('records', JSON.stringify(rec)); } catch {}
}

function savedName() {
  try { return (localStorage.getItem('playerName') || '').slice(0, NAME_MAX); }
  catch { return ''; }
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? '' : d.toLocaleDateString('es-ES');
}

function renderRecords(rec, highlight) {
  recordsBody.replaceChildren();
  if (!rec.top.length) {
    const td = recordsBody.insertRow().insertCell();
    td.colSpan = 6;
    td.className = 'records-empty';
    td.textContent = 'Sin records todavía';
  }
  rec.top.forEach((e, i) => {
    const tr = recordsBody.insertRow();
    if (i === highlight) tr.className = 'current';
    // textContent: el nombre es dato del usuario
    for (const v of [i + 1, e.name, e.score.toLocaleString(), e.lines, e.level, formatDate(e.date)])
      tr.insertCell().textContent = v;
  });
  recordsStats.textContent = `Mejor combo: ${rec.bestCombo} · Líneas máx.: ${rec.maxLines}`;
}

function saveEntry() {
  if (!pendingEntry) return;
  const name = nameInput.value.trim().slice(0, NAME_MAX) || 'Anónimo';
  try { localStorage.setItem('playerName', name); } catch {}
  const entry = { name, ...pendingEntry };
  pendingEntry = null;
  const rec = loadRecords();
  rec.top.push(entry);
  rec.top.sort((a, b) => b.score - a.score);
  rec.top = rec.top.slice(0, TOP_SIZE);
  saveRecords(rec);
  nameForm.classList.add('hidden');
  nameInput.blur();
  renderRecords(rec, rec.top.indexOf(entry));
}

function showStartScreen() {
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  renderRecords(loadRecords(), -1);
  recordsBox.classList.remove('hidden');
  playBtn.classList.remove('hidden');
  restartBtn.classList.add('hidden');
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

// Reinicia el estado sin arrancar el bucle
function resetState() {
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
  combo = 0;
  maxCombo = 0;
  pendingEntry = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
}

function init() {
  resetState();
  started = true;
  overlay.classList.add('hidden');
  nameForm.classList.add('hidden');
  recordsBox.classList.add('hidden');
  playBtn.classList.add('hidden');
  restartBtn.classList.remove('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // no robar teclas a campos de texto (p. ej. el nombre del record)
  if (e.target.matches?.('input, select, textarea')) return;
  if (!started) return;
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
playBtn.addEventListener('click', () => { init(); playBtn.blur(); });

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  saveEntry();
});

clearRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records?')) return;
  try { localStorage.removeItem('records'); } catch {}
  renderRecords(emptyRecords(), -1);
  clearRecordsBtn.blur();
});

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

resetState();
draw();
showStartScreen();
