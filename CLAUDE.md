# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Tetris en JavaScript vanilla + HTML5 Canvas. Sin dependencias, sin `package.json`, sin build, sin tests ni linter. La UI y los textos están en español.

## Ejecutar

Abrir `index.html` en el navegador, o servirlo con cualquier servidor estático:

```bash
python -m http.server 8000   # luego http://localhost:8000
```

## Arquitectura

Tres archivos: `index.html` (DOM, dos `<canvas>` y overlay), `style.css` (tema oscuro) y `game.js` (toda la lógica).

`game.js` es un script clásico (no módulo, `'use strict'`) cargado al final del `<body>`; obtiene los elementos del DOM por `id` al cargarse y guarda todo el estado en variables globales mutables (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`…). `init()` reinicia ese estado y también es el handler del botón de reinicio.

Convenciones clave:

- **El índice de tipo de pieza es también el índice de color.** `PIECES[i]` es una matriz cuadrada cuyas celdas valen `i`, y `board` almacena ese mismo valor (0 = vacío) que `drawBlock` resuelve vía `COLORS[i]`. Añadir/cambiar piezas exige mantener `PIECES`, `COLORS` y `randomPiece()` sincronizados: las 7 clásicas (1–7) salen con `* 7`, y la tuerca (8, anillo 3×3 con hueco central) sale aparte con probabilidad `NUT_CHANCE` (0.05).
- **Bomba** (`BOMB` = 9, forma 1×1): no es aleatoria. Cada `BOMB_EVERY` líneas `clearLines()` activa `bombPending` y `spawn()` la pone como `next` (vía `makePiece`). Al bloquearse, `lockPiece()` llama a `explode()` en vez de `merge()`: vacía el 3×3 centrado (+10×nivel por bloque, sin gravedad) y lanza el destello `explosion` que pinta `drawExplosion()`. `drawBlock` delega en `drawBomb` para el tipo 9.
- **Rotación** = `rotateCW` (transposición + inversión) + wall kicks simples en `tryRotate` (desplazamientos `0, -1, 1, -2, 2`); no es SRS.
- **Colisión** (`collide`) permite `y < 0` (celdas por encima del tablero) y es la base de movimiento, rotación, ghost (`ghostY`) y detección de Game Over en `spawn()`.
- **Bucle**: `requestAnimationFrame` con acumulador `dropAccum` contra `dropInterval`. Pausa y Game Over hacen `cancelAnimationFrame(animId)`. `lockPiece()` = `merge` → `clearLines` → `spawn`.
- **Puntuación/nivel**: `LINE_SCORES[n] * level`; hard drop +2/celda, soft drop +1/fila; nivel = `startLevel + floor(lines/10)` vía `setLevel()`, que también fija `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Menú de pausa** (`P`/`Escape` → `togglePause`): reutiliza `#overlay` con la clase `is-paused`, que muestra los elementos `.pause-only` (Reanudar, Ver controles, selector `#start-level`). `#restart-btn` es común a pausa y Game Over. `startLevel` solo se aplica en el siguiente `init()`. Al reanudar, `closePauseMenu()` quita el foco del botón y `resumeGuard` descarta el auto-repeat de teclas mantenidas.
- **Tema claro/oscuro**: los colores de `style.css` son variables CSS en `:root` (oscuro, por defecto) y `:root[data-theme="light"]`. `applyTheme(theme)` en `game.js` fija `data-theme`, cachea `--grid` y `--highlight` para el canvas, actualiza `#theme-toggle` y redibuja (`draw`/`drawNext`) aunque el juego esté en pausa. La preferencia se guarda en `localStorage` (`theme`); `init()` no la toca.
- **Récords**: `localStorage` (`records`) guarda `{ top: [{name, score, lines}] (máx. `MAX_RECORDS` = 5), bestCombo, maxLines }`; el último nombre usado va en `playerName`. Al cargar se muestra la pantalla de inicio (`showStart()`, con `gameOver = true` hasta pulsar «Jugar»), no se llama a `init()`. `endGame()` actualiza combo/líneas máximas y, si `qualifies(score)`, muestra `#name-entry`; `submitRecord()` inserta y resalta la fila (también se invoca desde `init()` para no perder un récord sin guardar). Combo = bloqueos consecutivos que limpian líneas (`combo`/`maxCombo` en `clearLines()`; la bomba no lo altera).
- **Skins** (`SKINS`: `retro`, `neon`, `pastel`, `pixel`): cada una define `colors` (paleta indexada como `PIECES`, 10 entradas incluida la bomba), `drawCell(context, px, py, size, color)` y opcionalmente `grid`. `drawBlock` fija `globalAlpha` y delega en `skin.drawCell` (o `drawBomb`, que usa `skin.colors[BOMB]`). `applySkin(name)` cambia la variable global `skin`, fija `data-skin` en `<html>` (CSS pone el tablero negro en neon), sincroniza `#skin-select` y redibuja. Preferencia en `localStorage` (`skin`). Añadir una pieza exige ampliar las paletas de todas las skins.

## Acoplamientos a tener en cuenta

- Las dimensiones del `<canvas id="board">` en `index.html` (300×600) deben ser `COLS*BLOCK × ROWS*BLOCK`.
- `#next-canvas` (120×120) asume una rejilla de 4×4 con celdas de 30 px (`NB` en `drawNext`).
- Los `id` del HTML (`score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, `resume-btn`, `controls-btn`, `pause-controls`, `start-level`, `next-canvas`, `theme-toggle`, `name-entry`, `player-name`, `records`, `records-list`, `best-combo`, `max-lines`, `reset-records-btn`, `skin-select`) se referencian directamente desde `game.js`.
