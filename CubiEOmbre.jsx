import React, { useState, useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import * as Tone from 'tone';
import { Home, Play, Info, Volume2, VolumeX, Undo2, RotateCcw, RotateCw, Plus, Minus, Sparkles } from 'lucide-react';

/* ============================== TOKENS ============================== */
const COLORS = {
  ink: '#3A3A4A',
  primary: '#6C5CE7',
  primaryDark: '#5847D1',
  success: '#00C9A7',
  warning: '#FF6B6B',
  card: '#FFFFFF',
};
const PALETTE = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#A78BFA', '#6BCB77', '#FF9F45', '#4D96FF', '#FF6FB5'];
const WALL_COLORS = { front: '#FF6B6B', side: '#4ECDC4', top: '#A78BFA' };

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;800&display=swap');
*{box-sizing:border-box;}
.cae-shell{min-height:100%;width:100%;font-family:'Nunito',sans-serif;color:${COLORS.ink};
  background:linear-gradient(160deg,#FFF3B0 0%,#FFD3E0 45%,#C9F0FF 100%);}
.cae-heading{font-family:'Fredoka',sans-serif;}
.cae-btn{font-family:'Fredoka',sans-serif;border:none;border-radius:999px;padding:14px 26px;font-size:16px;
  font-weight:600;cursor:pointer;box-shadow:0 4px 0 rgba(0,0,0,0.15);display:flex;align-items:center;
  justify-content:center;gap:8px;transition:transform .1s ease, box-shadow .1s ease;}
.cae-btn:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,0.15);}
.cae-btn-primary{background:${COLORS.primary};color:white;}
.cae-btn-secondary{background:white;color:${COLORS.primary};}
.cae-btn-ghost{background:rgba(255,255,255,0.6);color:${COLORS.ink};}
.cae-btn-icon{border-radius:50%;width:44px;height:44px;padding:0;box-shadow:0 3px 0 rgba(0,0,0,0.12);}
.cae-btn:disabled{opacity:0.45;cursor:not-allowed;box-shadow:none;transform:none;}
.cae-card{background:${COLORS.card};border-radius:20px;box-shadow:0 6px 18px rgba(58,58,74,0.10);}
.cae-mascot{position:relative;width:64px;height:74px;animation:cae-bob 3.2s ease-in-out infinite;}
.cae-mascot-sm{position:relative;width:34px;height:40px;}
.cae-face{position:absolute;width:100%;height:100%;}
.cae-face-top{clip-path:polygon(50% 0%,100% 25%,50% 50%,0% 25%);}
.cae-face-left{clip-path:polygon(0% 25%,50% 50%,50% 100%,0% 75%);}
.cae-face-right{clip-path:polygon(50% 50%,100% 25%,100% 75%,50% 100%);}
@keyframes cae-bob{0%,100%{transform:translateY(0) rotate(0deg);}50%{transform:translateY(-8px) rotate(3deg);}}
@keyframes cae-pop{0%{transform:scale(0.6);opacity:0;}70%{transform:scale(1.08);opacity:1;}100%{transform:scale(1);}}
.cae-pop{animation:cae-pop .3s ease;}
@keyframes cae-float{0%{transform:translateY(0) rotate(0deg);opacity:1;}100%{transform:translateY(-130px) rotate(340deg);opacity:0;}}
.cae-confetti{position:absolute;width:8px;height:8px;border-radius:2px;animation:cae-float 1.1s ease-out forwards;}
`;

/* ============================== HELPERS ============================== */
function makeEmptyHeights(sizeX, sizeZ) {
  return Array.from({ length: sizeX }, () => Array(sizeZ).fill(0));
}
function cloneHeights(h) { return h.map(col => [...col]); }

function computeProjections(heights, sizeX, sizeZ, maxH, views) {
  const out = {};
  if (views.includes('front')) {
    const arr = [];
    for (let x = 0; x < sizeX; x++) { let m = 0; for (let z = 0; z < sizeZ; z++) m = Math.max(m, heights[x][z]); arr.push(m); }
    out.front = arr;
  }
  if (views.includes('side')) {
    const arr = [];
    for (let z = 0; z < sizeZ; z++) { let m = 0; for (let x = 0; x < sizeX; x++) m = Math.max(m, heights[x][z]); arr.push(m); }
    out.side = arr;
  }
  if (views.includes('top')) {
    const grid = [];
    for (let x = 0; x < sizeX; x++) { const row = []; for (let z = 0; z < sizeZ; z++) row.push(heights[x][z] > 0); grid.push(row); }
    out.top = grid;
  }
  return out;
}
function projectionsMatch(a, b, views) {
  for (const v of views) {
    if (v === 'top') {
      for (let x = 0; x < a.top.length; x++) for (let z = 0; z < a.top[x].length; z++) if (a.top[x][z] !== b.top[x][z]) return false;
    } else {
      const A = a[v], B = b[v];
      if (A.length !== B.length) return false;
      for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return false;
    }
  }
  return true;
}
function formatTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Per-puzzle time limits (seconds). Run out and the puzzle is lost — streak resets to 1, but the
// saved record (best streak) stays at whatever was already reached.
const CLASSIC_TIME_LIMIT = 60;    // Block Puzzle 3D
const TASSELLI_TIME_LIMIT = 30;   // Tasselli Ruotati
const INCASTRO_TIME_LIMIT = 180;  // Incastro Perfetto

// Urgency thresholds: the countdown turns amber, then red, as time runs low.
const CLASSIC_TIME_WARN = 15, CLASSIC_TIME_DANGER = 10;
const TASSELLI_TIME_WARN = 15, TASSELLI_TIME_DANGER = 10;
const INCASTRO_TIME_WARN = 60, INCASTRO_TIME_DANGER = 10;
function getTimeColor(timeLeft, warnAt, dangerAt) {
  if (timeLeft <= dangerAt) return COLORS.warning;
  if (timeLeft <= warnAt) return '#d4a017';
  return COLORS.ink;
}

/* ============================== GENERATOR ============================== */
function getInfiniteDifficulty(n) {
  if (n <= 3) return { sizeX: 3, sizeZ: 3, maxH: 2, views: ['front', 'side'] };
  if (n <= 6) return { sizeX: 3, sizeZ: 3, maxH: 3, views: n % 2 === 0 ? ['front', 'side', 'top'] : ['front', 'side'] };
  if (n <= 10) return { sizeX: 4, sizeZ: 4, maxH: 3, views: ['front', 'side', 'top'] };
  if (n <= 15) return { sizeX: 4, sizeZ: 4, maxH: 4, views: ['front', 'side', 'top'] };
  return { sizeX: 5, sizeZ: 5, maxH: 4, views: ['front', 'side', 'top'] };
}

function generateHeights(sizeX, sizeZ, maxH) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const heights = makeEmptyHeights(sizeX, sizeZ);
    const visited = new Set();
    const cells = [];
    const startX = Math.floor(Math.random() * sizeX), startZ = Math.floor(Math.random() * sizeZ);
    visited.add(`${startX},${startZ}`); cells.push([startX, startZ]);
    const targetCells = Math.max(3, Math.round(sizeX * sizeZ * (0.45 + Math.random() * 0.3)));
    let guard = 0;
    while (cells.length < targetCells && guard < 400) {
      guard++;
      const [cx, cz] = cells[Math.floor(Math.random() * cells.length)];
      const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)];
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nx < sizeX && nz >= 0 && nz < sizeZ && !visited.has(`${nx},${nz}`)) {
        visited.add(`${nx},${nz}`); cells.push([nx, nz]);
      }
    }
    for (const [x, z] of cells) {
      const neighborH = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nx < sizeX && nz >= 0 && nz < sizeZ && heights[nx][nz] > 0) neighborH.push(heights[nx][nz]);
      }
      let h;
      if (neighborH.length && Math.random() < 0.55) {
        const base = neighborH[Math.floor(Math.random() * neighborH.length)];
        h = Math.min(maxH, Math.max(1, base + (Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1))));
      } else {
        h = 1 + Math.floor(Math.random() * maxH);
      }
      heights[x][z] = h;
    }
    const vals = cells.map(([x, z]) => heights[x][z]);
    const distinct = new Set(vals).size;
    if (maxH === 1 || distinct > 1 || attempt === 14) return heights;
  }
  return makeEmptyHeights(sizeX, sizeZ);
}

/* ---- Incastro Perfetto: a real 2x2x2 twisty cube. 8 cubies, each "real" (solid) or
   "virtual" (hollow); turning one of the 6 layers cycles 4 cubies' states at once,
   exactly like quarter-turning a face of a physical 2x2x2 puzzle. ---- */
const INCASTRO_CYCLES = {
  top:    [2, 3, 7, 6],
  bottom: [0, 1, 5, 4],
  left:   [0, 2, 6, 4],
  right:  [1, 3, 7, 5],
  front:  [0, 1, 3, 2],
  back:   [4, 5, 7, 6],
};
const INCASTRO_AXES = Object.keys(INCASTRO_CYCLES);
const INCASTRO_LABELS = { top: 'Alto', bottom: 'Basso', left: 'Sinistra', right: 'Destra', front: 'Fronte', back: 'Retro' };

// Which world axis + signed direction each named turn spins around. Shared by the pure logic below
// (to rotate a marked face's direction) and by SceneIncastro's INCASTRO_AXIS_INFO (which adds the
// Three.js pivot point) — kept as one source of truth so the two can never drift out of sync.
const INCASTRO_ROTATION_AXIS = {
  top:    { axis: 'y', sign: -1 },
  bottom: { axis: 'y', sign: -1 },
  left:   { axis: 'x', sign: 1 },
  right:  { axis: 'x', sign: 1 },
  front:  { axis: 'z', sign: 1 },
  back:   { axis: 'z', sign: 1 },
};

// A cubie's marked face is tracked as a direction label in WORLD space ('px' = the face currently
// pointing toward +X, etc.). rotateDirLabel rotates that label the same way a physical 90° turn
// would — verified numerically against Three.js's own rotation matrices (36/36 match) before use.
const INCASTRO_DIR_VECTORS = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
function incastroDirFromVector(v) {
  const [x, y, z] = v.map(n => Math.round(n));
  if (x === 1) return 'px'; if (x === -1) return 'nx';
  if (y === 1) return 'py'; if (y === -1) return 'ny';
  if (z === 1) return 'pz'; if (z === -1) return 'nz';
  return null;
}
function rotateDirLabel(label, rotAxis, angleDeg) {
  if (!label) return label;
  const [x, y, z] = INCASTRO_DIR_VECTORS[label];
  const rad = angleDeg * Math.PI / 180;
  const c = Math.round(Math.cos(rad)), s = Math.round(Math.sin(rad));
  let nx = x, ny = y, nz = z;
  if (rotAxis === 'x') { ny = c * y - s * z; nz = s * y + c * z; }
  else if (rotAxis === 'y') { nx = c * x + s * z; nz = -s * x + c * z; }
  else { nx = c * x - s * y; ny = s * x + c * y; }
  return incastroDirFromVector([nx, ny, nz]);
}
// The outward-facing direction of a given axis for a given target slot — e.g. a slot with x=1 has
// its outward X side facing +X ('px'); only x/z are ever used since only the left (X) and right (Z)
// walls exist in this game (there's no top/bottom wall to check a Y-facing mark against).
function outwardDirForSlot(slot, axisChar) {
  if (axisChar === 'x') return (slot % 2 === 1) ? 'px' : 'nx';
  return (Math.floor(slot / 4) === 1) ? 'pz' : 'nz';
}
// Which axis/axes (if any) make a given slot "vicino" al proprio muro fisso — cioè dove
// outwardDirForSlot punta DAVVERO verso quel muro invece che in direzione opposta. Solo queste
// combinazioni (slot, asse) vengono usate per piazzare il cubetto segnato: per uno slot "lontano"
// su un asse, la faccia richiesta sarebbe quella interna (rivolta verso il vicino nella stessa
// colonna), spesso nascosta alla vista se quel vicino è pieno — impossibile da verificare a occhio.
function nearAxesForSlot(slot) {
  const axes = [];
  if (slot % 2 === 0) axes.push('x');             // x=0 è la metà vicina al muro dell'asse X
  if (Math.floor(slot / 4) === 0) axes.push('z');  // z=0 è la metà vicina al muro dell'asse Z
  return axes;
}

// state is an array of 8 { solid, markedFace } objects per slot. markedFace is null for every piece
// except (at most) one, which carries a direction label that rotates along with real 90° turns.
function applyIncastroTurn(stateArr, axis, reverse) {
  const cycle = INCASTRO_CYCLES[axis];
  const seq = reverse ? [cycle[0], cycle[3], cycle[2], cycle[1]] : cycle;
  const { axis: rotAxis, sign } = INCASTRO_ROTATION_AXIS[axis];
  const angleDeg = (reverse ? -sign : sign) * 90;
  const next = [...stateArr];
  for (let i = 0; i < 4; i++) {
    const piece = stateArr[seq[i]];
    const moved = piece.markedFace ? { ...piece, markedFace: rotateDirLabel(piece.markedFace, rotAxis, angleDeg) } : piece;
    next[seq[(i + 1) % 4]] = moved;
  }
  return next;
}

// projections: "is at least one cube present along this line of sight" — same spirit as Cubi & Ombre's
// front/side shadows, just OR-based (present/absent) instead of height-based.
function incastroProjX(state) { // viewed along X — indexed [z][y]
  const p = [[false, false], [false, false]];
  for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) p[z][y] = state[2 * y + 4 * z] || state[1 + 2 * y + 4 * z];
  return p;
}
function incastroProjZ(state) { // viewed along Z — indexed [x][y]
  const p = [[false, false], [false, false]];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) p[x][y] = state[x + 2 * y] || state[x + 2 * y + 4];
  return p;
}
function incastroProjectionsMatch(a, b) {
  const pxA = incastroProjX(a), pxB = incastroProjX(b);
  const pzA = incastroProjZ(a), pzB = incastroProjZ(b);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    if (pxA[i][j] !== pxB[i][j]) return false;
    if (pzA[i][j] !== pzB[i][j]) return false;
  }
  return true;
}

// Mark difficulty: below the threshold, classic puzzles (no mark). From this puzzle on, exactly one
// cubie gets exactly one marked face, requiring exactly one wall cell to match it.
// TEMPORARY (for testing): lowered to 1 so the mechanic shows up immediately. Tell me the real
// number once you've confirmed it renders correctly and I'll restore the intended curve.
const INCASTRO_MARKS_START_STREAK = 1;
function getIncastroHasMark(streakNum) {
  return streakNum >= INCASTRO_MARKS_START_STREAK;
}

function generateIncastroPuzzle(hasMark) {
  let target, count;
  do {
    target = Array.from({ length: 8 }, () => Math.random() < 0.5);
    count = target.filter(Boolean).length;
  } while (count < 2 || count > 6); // 0/1/7/8-filled targets are degenerate: every reachable state shares their projection

  const solidSlots = target.map((v, i) => (v ? i : null)).filter(v => v !== null);
  let markedSlot = null, markedAxis = null;
  if (hasMark && solidSlots.length > 0) {
    // Solo slot "vicini" ad almeno un muro sono candidati per il segno (vedi nearAxesForSlot) —
    // 2 slot su 8 (quelli lontani su ENTRAMBI gli assi) restano sempre esclusi; se capitano ad
    // essere gli unici pieni, il puzzle nasce semplicemente senza segno per questa volta.
    const markableSlots = solidSlots.filter(s => nearAxesForSlot(s).length > 0);
    if (markableSlots.length > 0) {
      markedSlot = markableSlots[Math.floor(Math.random() * markableSlots.length)];
      const validAxes = nearAxesForSlot(markedSlot);
      markedAxis = validAxes[Math.floor(Math.random() * validAxes.length)];
    }
  }

  const solved = target.map((solid, i) => ({ solid, markedFace: i === markedSlot ? outwardDirForSlot(i, markedAxis) : null }));

  let scramble, attempts = 0;
  do {
    scramble = solved.map(o => ({ ...o }));
    const numMoves = 6 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numMoves; i++) scramble = applyIncastroTurn(scramble, INCASTRO_AXES[Math.floor(Math.random() * 6)], false);
    attempts++;
  } while (incastroSolved(scramble, target, markedSlot, markedAxis) && attempts < 25);
  return { target, scramble, markedSlot, markedAxis };
}

function incastroSolved(stateObjects, target, markedSlot, markedAxis) {
  const stateSolid = stateObjects.map(o => o.solid);
  if (!incastroProjectionsMatch(stateSolid, target)) return false;
  if (markedSlot !== null) {
    if (stateObjects[markedSlot].markedFace !== outwardDirForSlot(markedSlot, markedAxis)) return false;
  }
  return true;
}

/* ---- Tasselli Ruotati: a 3x3 grid puzzle. A small preview shows the target pattern with a
   magenta corner marker as the orientation anchor; the big board is the SAME pattern rotated
   by 90/180/270°, with that same anchor shown at its rotated corner. The player must mentally
   "undo" the rotation and tap the matching cells on/off to reproduce it. The anchor's own corner
   also varies puzzle to puzzle (not always bottom-left) so it can't just be memorized. ---- */
const TASSELLI_CORNERS = [0, 2, 6, 8]; // the 3x3 grid's 4 true corners, 0-indexed row-major
function tasselliRotateIndex90(idx) {
  const r = Math.floor(idx / 3), c = idx % 3;
  return c * 3 + (2 - r); // (r,c) -> (c, 2-r): standard 90° clockwise rotation for a 3x3 grid
}
function tasselliRotateIndexN(idx, times) {
  let i = idx;
  for (let t = 0; t < ((times % 4) + 4) % 4; t++) i = tasselliRotateIndex90(i);
  return i;
}
function tasselliRotateGrid90(cells) {
  const next = new Array(9).fill(false);
  for (let i = 0; i < 9; i++) next[tasselliRotateIndex90(i)] = cells[i];
  return next;
}
function tasselliRotateGridN(cells, times) {
  let g = cells;
  for (let t = 0; t < ((times % 4) + 4) % 4; t++) g = tasselliRotateGrid90(g);
  return g;
}
// pure infinite mode, no difficulty curve: every puzzle is a fresh random 3x3 pattern (3-5 lit
// cells — the anchor cell is a normal candidate too, it just always shows the triangle overlay
// regardless of its color) with a fresh random anchor corner, rotated by a genuine 90/180/270°
// turn (never 0 — the whole point is figuring out the rotation)
function generateTasselliPuzzle() {
  const anchorIndex = TASSELLI_CORNERS[Math.floor(Math.random() * TASSELLI_CORNERS.length)];
  const candidates = [];
  for (let i = 0; i < 9; i++) candidates.push(i);
  const count = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5 lit cells
  const pool = [...candidates];
  const onSet = new Set();
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    onSet.add(pool.splice(idx, 1)[0]);
  }
  const target = Array.from({ length: 9 }, (_, i) => onSet.has(i));
  const rotation = 1 + Math.floor(Math.random() * 3); // 1, 2, or 3 quarter-turns (90/180/270)
  return { target, rotation, anchorIndex };
}

/* ============================== SAVE SYSTEM ============================== */
const SAVE_KEY = 'cubi-e-ombre-save-v1';
const PAUSED_KEY = 'cubi-e-ombre-paused-v1';
function defaultSave() { return { infiniteBest: 0, incastroBest: 0, tasselliBest: 0, muted: false }; }
function defaultPaused() { return { blockPuzzle: null, incastro: null, tasselli: null }; }
async function loadSave() {
  try {
    // localStorage è sincrono, ma la funzione resta async: nessun altro punto del codice che la
    // chiama (loadSave().then(setSave)) deve cambiare.
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw);
    return { ...defaultSave(), ...parsed };
  } catch (e) { return defaultSave(); }
}
async function persistSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}
async function loadPaused() {
  try {
    const raw = localStorage.getItem(PAUSED_KEY);
    if (!raw) return defaultPaused();
    const parsed = JSON.parse(raw);
    return { ...defaultPaused(), ...parsed };
  } catch (e) { return defaultPaused(); }
}
async function persistPaused(data) {
  try { localStorage.setItem(PAUSED_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
}

// Salvataggio "attivo" separato da PAUSED_KEY: cattura il puzzle in corso mentre si sta ancora
// giocando (non in pausa), scritto solo sugli eventi di uscita/chiusura scheda (vedi il ref +
// listener nel componente App). Sincrono di proposito: beforeunload/pagehide non aspettano
// funzioni async, quindi loadSave/persistPaused restano async ma queste no.
const ACTIVE_KEY = 'cubi-e-ombre-active-v1';
function loadActive() {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function persistActive(snap) {
  try {
    if (!snap) { localStorage.removeItem(ACTIVE_KEY); return; }
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(snap));
  } catch (e) { /* ignore */ }
}
function clearActive() {
  try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
}

/* ============================== 3D SCENE ============================== */
function Scene3D({ levelData, playerHeights, onCellTap }) {
  const containerRef = useRef(null);
  const stateRef = useRef({});
  const onCellTapRef = useRef(onCellTap);
  onCellTapRef.current = onCellTap;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !levelData) return;
    const { sizeX, sizeZ, maxH, views, heights: targetHeights } = levelData;
    const targetProj = computeProjections(targetHeights, sizeX, sizeZ, maxH, views);

    // origin + wall-separation gap: walls stand apart from the platform instead of touching it
    const originX = -(sizeX - 1) / 2, originZ = -(sizeZ - 1) / 2;
    const hasTop = views.includes('top');
    const wallGap = 1.3;
    const topGap = 1.6;
    const topY = maxH + topGap;
    const boundMinX = originX - 0.5 - wallGap;
    const boundMaxX = originX + sizeX - 0.5;
    const boundMinZ = originZ - 0.5 - wallGap;
    const boundMaxZ = originZ + sizeZ - 0.5;
    const boundMinY = 0;
    const boundMaxY = hasTop ? topY + 0.6 : maxH;
    const centerX = (boundMinX + boundMaxX) / 2;
    const centerZ = (boundMinZ + boundMaxZ) / 2;

    // rotation-proof frustum fit: the camera can be dragged to ANY angle around the vertical axis,
    // so instead of fitting just the default view, sample many angles and take the worst-case
    // half-width/half-height needed — verified numerically to fit every level size/aspect ratio
    const phi = Math.acos(1 / Math.sqrt(3));
    const worldUpVec = new THREE.Vector3(0, 1, 0);
    const boundCorners = [];
    [boundMinX, boundMaxX].forEach(x => [boundMinY, boundMaxY].forEach(y => [boundMinZ, boundMaxZ].forEach(z => {
      boundCorners.push(new THREE.Vector3(x, y, z));
    })));
    let maxHalfW = 0, maxHalfH = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      const th = deg * Math.PI / 180;
      const cd = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const sRight = new THREE.Vector3().crossVectors(worldUpVec, cd).normalize();
      const sUp = new THREE.Vector3().crossVectors(cd, sRight).normalize();
      let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
      boundCorners.forEach(p => {
        const r = p.dot(sRight), u = p.dot(sUp);
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      });
      maxHalfW = Math.max(maxHalfW, (maxR - minR) / 2);
      maxHalfH = Math.max(maxHalfH, (maxU - minU) / 2);
    }

    const w = Math.max(container.clientWidth, 50), h = Math.max(container.clientHeight, 50);
    const scene = new THREE.Scene();
    const aspect = w / h;
    const frustumSize = Math.max(maxHalfH * 2, (maxHalfW * 2) / aspect) * 1.1;
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2, frustumSize * aspect / 2, frustumSize / 2, -frustumSize / 2, 0.1, 300
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(6, 12, 8);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
    fillLight.position.set(-6, 4, -6);
    scene.add(fillLight);

    const disposables = [];

    // ---- ground ----
    const groundGroup = new THREE.Group();
    const interactive = [];
    for (let x = 0; x < sizeX; x++) {
      for (let z = 0; z < sizeZ; z++) {
        const geo = new THREE.PlaneGeometry(0.94, 0.94);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(originX + x, 0.01, originZ + z);
        mesh.userData = { gx: x, gz: z };
        groundGroup.add(mesh);
        interactive.push(mesh);
        disposables.push(geo, mat);
        const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xd8d8e8 });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.rotation.x = -Math.PI / 2;
        edges.position.set(originX + x, 0.011, originZ + z);
        groundGroup.add(edges);
        disposables.push(edgeGeo, edgeMat);
      }
    }
    scene.add(groundGroup);

    // ---- extended floor filling the gap toward the walls, so they don't look disconnected ----
    const extGeo = new THREE.PlaneGeometry(boundMaxX - boundMinX, boundMaxZ - boundMinZ);
    const extMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const extFloor = new THREE.Mesh(extGeo, extMat);
    extFloor.rotation.x = -Math.PI / 2;
    extFloor.position.set(centerX, 0.004, centerZ);
    scene.add(extFloor);
    disposables.push(extGeo, extMat);

    // ---- walls (real 3D panels standing apart from the platform, like the reference photo) ----
    const wallsGroup = new THREE.Group();
    function addWallCell(cx, cy, cz, rotY, filled, colorHex) {
      const geo = new THREE.PlaneGeometry(0.94, 0.94);
      const mat = new THREE.MeshBasicMaterial({
        color: filled ? colorHex : 0xffffff,
        transparent: true,
        opacity: filled ? 0.92 : 0.28,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, cy, cz);
      mesh.rotation.y = rotY;
      wallsGroup.add(mesh);
      disposables.push(geo, mat);
      const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xd8d8e8 });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.position.set(cx, cy, cz);
      edges.rotation.y = rotY;
      wallsGroup.add(edges);
      disposables.push(edgeGeo, edgeMat);
    }
    // front wall: standing apart from the platform, separated by wallGap
    for (let x = 0; x < sizeX; x++) {
      for (let u = 0; u < maxH; u++) {
        addWallCell(originX + x, u + 0.5, originZ - 0.5 - wallGap, 0, u < targetProj.front[x], WALL_COLORS.front);
      }
    }
    // side wall: standing apart from the platform, separated by wallGap
    for (let z = 0; z < sizeZ; z++) {
      for (let u = 0; u < maxH; u++) {
        addWallCell(originX - 0.5 - wallGap, u + 0.5, originZ + z, -Math.PI / 2, u < targetProj.side[z], WALL_COLORS.side);
      }
    }
    // top view (only when the level needs a 3rd projection): floats directly above the platform,
    // like a skylight looking straight down — aligned cell-for-cell with the ground below it
    if (hasTop) {
      for (let x = 0; x < sizeX; x++) {
        for (let z = 0; z < sizeZ; z++) {
          const filled = targetProj.top[x][z];
          const geo = new THREE.PlaneGeometry(0.94, 0.94);
          const mat = new THREE.MeshBasicMaterial({
            color: filled ? WALL_COLORS.top : 0xffffff,
            transparent: true,
            opacity: filled ? 0.92 : 0.28,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.set(originX + x, topY, originZ + z);
          wallsGroup.add(mesh);
          disposables.push(geo, mat);
          const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1));
          const edgeMat = new THREE.LineBasicMaterial({ color: 0xd8d8e8 });
          const edges = new THREE.LineSegments(edgeGeo, edgeMat);
          edges.rotation.x = -Math.PI / 2;
          edges.position.set(originX + x, topY + 0.001, originZ + z);
          wallsGroup.add(edges);
          disposables.push(edgeGeo, edgeMat);
        }
      }
    }
    scene.add(wallsGroup);

    const cubesGroup = new THREE.Group();
    scene.add(cubesGroup);

    // ---- orbiting camera (fixed elevation, draggable azimuth), centered on platform+walls together ----
    let theta = Math.PI / 4;
    const radius = Math.max(boundMaxX - boundMinX, boundMaxZ - boundMinZ, boundMaxY - boundMinY) * 2.6;
    const lookTarget = new THREE.Vector3(centerX, hasTop ? topY * 0.5 : maxH * 0.4, centerZ);
    function updateCamera() {
      camera.position.set(
        lookTarget.x + radius * Math.sin(phi) * Math.cos(theta),
        lookTarget.y + radius * Math.cos(phi),
        lookTarget.z + radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(lookTarget);
    }
    updateCamera();

    stateRef.current = { scene, camera, renderer, cubesGroup, interactive, originX, originZ, frustumSize };

    const raycaster = new THREE.Raycaster();
    const pointerVec = new THREE.Vector2();
    function raycastTap(clientX, clientY) {
      const st = stateRef.current;
      if (!st.renderer) return;
      const rect = st.renderer.domElement.getBoundingClientRect();
      pointerVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerVec, st.camera);
      const cubeTargets = st.cubesGroup.children.filter(c => c.userData && c.userData.gx !== undefined);
      const hits = raycaster.intersectObjects([...st.interactive, ...cubeTargets], false);
      if (hits.length > 0) {
        const { gx, gz } = hits[0].object.userData;
        onCellTapRef.current(gx, gz);
      }
    }

    let dragging = false, dragStartX = 0, dragStartY = 0, thetaStart = 0, dragMoved = 0;
    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
      dragMoved = Math.max(dragMoved, Math.hypot(dx, dy));
      theta = thetaStart - dx * 0.0075;
      updateCamera();
    }
    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (dragMoved < 6) raycastTap(e.clientX, e.clientY);
    }
    function onPointerDown(e) {
      dragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      thetaStart = theta; dragMoved = 0;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const resizeObserver = new ResizeObserver(() => {
      const c = containerRef.current;
      if (!c || !stateRef.current.renderer) return;
      const nw = Math.max(c.clientWidth, 50), nh = Math.max(c.clientHeight, 50);
      stateRef.current.renderer.setSize(nw, nh);
      const asp = nw / nh;
      const newFrustumSize = Math.max(maxHalfH * 2, (maxHalfW * 2) / asp) * 1.1;
      const cam = stateRef.current.camera;
      cam.left = -newFrustumSize * asp / 2; cam.right = newFrustumSize * asp / 2;
      cam.top = newFrustumSize / 2; cam.bottom = -newFrustumSize / 2;
      cam.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    let raf;
    function animate() { raf = requestAnimationFrame(animate); renderer.render(scene, camera); }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      disposables.forEach(d => d.dispose && d.dispose());
      if (container) container.innerHTML = '';
      stateRef.current = {};
    };
  }, [levelData]);

  useEffect(() => {
    const st = stateRef.current;
    if (!st.cubesGroup || !levelData) return;
    const { sizeX, sizeZ } = levelData;
    while (st.cubesGroup.children.length > 0) {
      const c = st.cubesGroup.children.pop();
      c.geometry && c.geometry.dispose();
      c.material && c.material.dispose();
    }
    const originX = st.originX, originZ = st.originZ;
    for (let x = 0; x < sizeX; x++) {
      for (let z = 0; z < sizeZ; z++) {
        const colH = playerHeights[x] ? playerHeights[x][z] : 0;
        for (let level = 0; level < colH; level++) {
          const color = PALETTE[(x * sizeZ + z) % PALETTE.length];
          const geo = new THREE.BoxGeometry(0.88, 0.88, 0.88);
          const mat = new THREE.MeshLambertMaterial({ color });
          const cube = new THREE.Mesh(geo, mat);
          cube.position.set(originX + x, level + 0.5, originZ + z);
          cube.userData = { gx: x, gz: z };
          st.cubesGroup.add(cube);
          const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
          );
          edges.position.copy(cube.position);
          st.cubesGroup.add(edges);
        }
      }
    }
  }, [playerHeights, levelData]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />;
}

/* ============================== INCASTRO PERFETTO SCENE ============================== */
const INCASTRO_CUBE_POS = (() => {
  const arr = [];
  for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    arr[x + y * 2 + z * 4] = { x: (x - 0.5) * 0.96, y: (y - 0.5) * 0.96, z: (z - 0.5) * 0.96 };
  }
  return arr;
})();
// pivot points for each named turn's Three.js rotation; axis/sign come from the shared
// INCASTRO_ROTATION_AXIS (defined near the pure logic above) so they can never drift apart —
// verified against INCASTRO_CYCLES: top/bottom need -90°, the other four need +90°, to match the logical permutation
const INCASTRO_AXIS_INFO = {
  top:    { ...INCASTRO_ROTATION_AXIS.top, pivot: { x: 0, y: 0.48, z: 0 } },
  bottom: { ...INCASTRO_ROTATION_AXIS.bottom, pivot: { x: 0, y: -0.48, z: 0 } },
  left:   { ...INCASTRO_ROTATION_AXIS.left, pivot: { x: -0.48, y: 0, z: 0 } },
  right:  { ...INCASTRO_ROTATION_AXIS.right, pivot: { x: 0.48, y: 0, z: 0 } },
  front:  { ...INCASTRO_ROTATION_AXIS.front, pivot: { x: 0, y: 0, z: -0.48 } },
  back:   { ...INCASTRO_ROTATION_AXIS.back, pivot: { x: 0, y: 0, z: 0.48 } },
};
// verified numerically: three.js's Y-axis rotation matrix has opposite chirality to X/Z in the
// standard convention, so the preview ring's spin direction needs this per-axis correction to
// visually match the real rotation direction driven by INCASTRO_AXIS_INFO's own sign
const RING_SIGN_FLIP = { top: -1, bottom: -1, left: 1, right: 1, front: 1, back: 1 };

const SceneIncastro = forwardRef(function SceneIncastro({ initialState, target, markedSlot, markedAxis }, ref) {
  const containerRef = useRef(null);
  const stateRef = useRef({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const w = Math.max(container.clientWidth, 50), h = Math.max(container.clientHeight, 50);
    const scene = new THREE.Scene();

    const cubeHalf = 0.48, cellSize = 0.86, cellSpacing = 0.96, cubieHalf = 0.39; // cube shrunk a bit for breathing room
    const wallHalfSpan = cellSpacing / 2 + cellSize / 2;

    // camera basis: fixed elevation, but now DRAGGABLE azimuth (theta) — added so a marked cubie
    // (or any hidden face) can always be inspected by spinning the view, matching Cubi & Ombre's
    // classic mode. phi/theta are derived from the original fixed direction so the default view
    // is identical to before; only being able to rotate away from it is new.
    const camDir0 = new THREE.Vector3(1, 0.9, 1).normalize();
    const phi = Math.acos(camDir0.y);
    let theta = Math.atan2(camDir0.z, camDir0.x);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const screenRight = new THREE.Vector3().crossVectors(worldUp, camDir0).normalize();
    const screenUp = new THREE.Vector3().crossVectors(camDir0, screenRight).normalize();

    // the two solution panels are TRUE vertical planes standing in 3D space (like the main game's walls),
    // just elevated above the cube so its silhouette never overlaps them — verified numerically.
    // left panel: normal along X, shows projX; right panel: normal along Z, shows projZ
    const wallY = 2.2, wallOffset = cubeHalf + 1.4;
    const leftWallCenter = new THREE.Vector3(-wallOffset, wallY, 0);
    const rightWallCenter = new THREE.Vector3(0, wallY, -wallOffset);

    // rigorous fit: project the cube's 8 corners AND both walls' true (rotated-plane) corners onto screen axes
    const cubeExtent = cubeHalf + cubieHalf;
    const cornerPoints = [];
    [-cubeExtent, cubeExtent].forEach(x => [-cubeExtent, cubeExtent].forEach(y => [-cubeExtent, cubeExtent].forEach(z => {
      cornerPoints.push(new THREE.Vector3(x, y, z));
    })));
    [-wallHalfSpan, wallHalfSpan].forEach(dz => [-wallHalfSpan, wallHalfSpan].forEach(dy => {
      cornerPoints.push(new THREE.Vector3(leftWallCenter.x, leftWallCenter.y + dy, leftWallCenter.z + dz));
    }));
    [-wallHalfSpan, wallHalfSpan].forEach(dx => [-wallHalfSpan, wallHalfSpan].forEach(dy => {
      cornerPoints.push(new THREE.Vector3(rightWallCenter.x + dx, rightWallCenter.y + dy, rightWallCenter.z));
    }));

    // centerOffset: a fixed world-space point (computed once from the ORIGINAL angle) that the
    // camera always orbits around and looks at — this doesn't change as theta varies.
    const centerOffset = screenRight.clone();
    {
      let minR0 = Infinity, maxR0 = -Infinity, minU0 = Infinity, maxU0 = -Infinity;
      cornerPoints.forEach(p => {
        const r = p.dot(screenRight), u = p.dot(screenUp);
        minR0 = Math.min(minR0, r); maxR0 = Math.max(maxR0, r);
        minU0 = Math.min(minU0, u); maxU0 = Math.max(maxU0, u);
      });
      centerOffset.multiplyScalar((minR0 + maxR0) / 2).addScaledVector(screenUp, (minU0 + maxU0) / 2);
    }

    // rotation-proof frustum fit: since the camera can now be dragged to any azimuth, sample many
    // angles at the same fixed elevation and keep the worst-case half-width/half-height needed —
    // same technique already used for the classic mode's Scene3D.
    let maxHalfW = 0, maxHalfH = 0;
    for (let deg = 0; deg < 360; deg += 5) {
      const th = deg * Math.PI / 180;
      const cd = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const sRight = new THREE.Vector3().crossVectors(worldUp, cd).normalize();
      const sUp = new THREE.Vector3().crossVectors(cd, sRight).normalize();
      let minR = Infinity, maxR = -Infinity, minU = Infinity, maxU = -Infinity;
      cornerPoints.forEach(p => {
        const r = p.dot(sRight), u = p.dot(sUp);
        minR = Math.min(minR, r); maxR = Math.max(maxR, r);
        minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      });
      maxHalfW = Math.max(maxHalfW, (maxR - minR) / 2);
      maxHalfH = Math.max(maxHalfH, (maxU - minU) / 2);
    }

    const w2 = Math.max(container.clientWidth, 50), h2 = Math.max(container.clientHeight, 50);
    const aspect = w2 / h2;
    const frustumSize = Math.max(maxHalfH * 2, (maxHalfW * 2) / aspect) * 1.08;
    const camera = new THREE.OrthographicCamera(-frustumSize * aspect / 2, frustumSize * aspect / 2, frustumSize / 2, -frustumSize / 2, 0.1, 100);
    function updateCamera() {
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      camera.position.copy(dir.multiplyScalar(12).add(centerOffset));
      camera.lookAt(centerOffset);
    }
    updateCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w2, h2);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(5, 10, 6);
    scene.add(dirLight);

    const disposables = [];
    const mainGroup = new THREE.Group();
    const cubeMeshes = [];      // the colored box for each cubie (by ORIGINAL creation index)
    const slotToGroup = [];     // slotToGroup[slotIndex] = the cubie-group CURRENTLY sitting at that slot

    // shared geometry/material for the red "marked cubie" seal — a small disc that sits on
    // whichever ONE face is currently marked (offset slightly outward to avoid z-fighting).
    // markFacesByLabel maps a world-direction label to the local position/rotation that places
    // a decal flush against that face WHEN the cubieGroup itself is at identity rotation — which
    // it always is (rotation is reset to 0 after each turn), so world direction = local direction.
    const markGeo = new THREE.CircleGeometry(cubieHalf * 0.34, 20);
    const markMat = new THREE.MeshBasicMaterial({ color: COLORS.warning, side: THREE.DoubleSide });
    disposables.push(markGeo, markMat);
    const markFacesByLabel = {
      px: { pos: [cubieHalf + 0.006, 0, 0], rot: [0, Math.PI / 2, 0] },
      nx: { pos: [-cubieHalf - 0.006, 0, 0], rot: [0, -Math.PI / 2, 0] },
      py: { pos: [0, cubieHalf + 0.006, 0], rot: [-Math.PI / 2, 0, 0] },
      ny: { pos: [0, -cubieHalf - 0.006, 0], rot: [Math.PI / 2, 0, 0] },
      pz: { pos: [0, 0, cubieHalf + 0.006], rot: [0, 0, 0] },
      nz: { pos: [0, 0, -cubieHalf - 0.006], rot: [0, Math.PI, 0] },
    };
    // (re)places the decal on a cubieGroup for its CURRENT markedFace label, removing any old one
    // first — used both at creation and after every turn (see playTurn) once the label has rotated
    function setCubieMark(cubieGroup, label) {
      cubieGroup.children.filter(c => c.userData && c.userData.isMarkDecal).forEach(c => cubieGroup.remove(c));
      cubieGroup.userData.markedFace = label || null;
      if (!label) return;
      const f = markFacesByLabel[label];
      const markMesh = new THREE.Mesh(markGeo, markMat);
      markMesh.position.set(...f.pos);
      markMesh.rotation.set(...f.rot);
      markMesh.userData.isMarkDecal = true;
      cubieGroup.add(markMesh);
    }

    // reusable thick-edge builder (native GL line width is unreliable across browsers, so a
    // genuinely thick outline needs actual 3D cylinder geometry, not a thin GL line) — used both
    // for the gold layer-preview highlight below and the red marked-cubie glow
    function buildBoxEdgeCylinders(halfSize, radius, material) {
      const group = new THREE.Group();
      const corners = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        corners.push(new THREE.Vector3(sx * halfSize, sy * halfSize, sz * halfSize));
      }
      const upAxis = new THREE.Vector3(0, 1, 0);
      for (let a = 0; a < corners.length; a++) {
        for (let b = a + 1; b < corners.length; b++) {
          const diff = corners[a].clone().sub(corners[b]);
          const nonZeroAxes = ['x', 'y', 'z'].filter(ax => Math.abs(diff[ax]) > 1e-6).length;
          if (nonZeroAxes !== 1) continue;
          const mid = corners[a].clone().add(corners[b]).multiplyScalar(0.5);
          const dir = corners[b].clone().sub(corners[a]);
          const length = dir.length();
          dir.normalize();
          const cylGeo = new THREE.CylinderGeometry(radius, radius, length, 8);
          const cyl = new THREE.Mesh(cylGeo, material);
          cyl.position.copy(mid);
          cyl.quaternion.setFromUnitVectors(upAxis, dir);
          group.add(cyl);
          disposables.push(cylGeo);
        }
      }
      return group;
    }
    // shared material for the marked cubie's pulsing glow outline — there's at most one marked
    // cubie, so a single material (animated in the render loop below) covers it; stays null when
    // this puzzle has no mark at all
    let markedGlowMat = null;

    INCASTRO_CUBE_POS.forEach((p, i) => {
      const cubieGroup = new THREE.Group();
      cubieGroup.position.set(p.x, p.y, p.z);

      const cubieState = initialState ? initialState[i] : { solid: true, markedFace: null };
      const solid = cubieState.solid;
      const geo = new THREE.BoxGeometry(cubieHalf * 2, cubieHalf * 2, cubieHalf * 2);
      const mat = new THREE.MeshLambertMaterial({ color: solid ? COLORS.primary : 0xffffff, transparent: true, opacity: solid ? 1 : 0.12 });
      const cube = new THREE.Mesh(geo, mat);
      cubieGroup.add(cube);
      cubeMeshes.push(cube);
      disposables.push(geo, mat);

      setCubieMark(cubieGroup, cubieState.markedFace);

      // the whole marked cubie gets a pulsing red outline so it can be found from any angle —
      // rotation-invariant by design (a symmetric box outline looks the same after any 90° turn),
      // so unlike the face decal it never needs rebuilding as the piece moves through turns
      if (cubieState.markedFace) {
        markedGlowMat = new THREE.MeshBasicMaterial({ color: COLORS.warning, transparent: true, opacity: 1 });
        disposables.push(markedGlowMat);
        const markedGlow = buildBoxEdgeCylinders(cubieHalf + 0.025, 0.045, markedGlowMat);
        cubieGroup.add(markedGlow);
      }

      const edgeGeo = new THREE.EdgesGeometry(geo);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x3a3a4a, transparent: true, opacity: 0.35 });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      cubieGroup.add(edges);
      cubieGroup.userData.edgeMat = edgeMat;
      disposables.push(edgeGeo, edgeMat);

      // thick gold highlight edges — armed-layer preview, toggled on/off in setPreview below
      const thickEdgeMat = new THREE.MeshBasicMaterial({ color: 0xffcc33 });
      disposables.push(thickEdgeMat);
      const thickEdgeGroup = buildBoxEdgeCylinders(cubieHalf, 0.028, thickEdgeMat);
      thickEdgeGroup.visible = false;
      cubieGroup.add(thickEdgeGroup);
      cubieGroup.userData.thickEdgeGroup = thickEdgeGroup;

      mainGroup.add(cubieGroup);
      slotToGroup[i] = cubieGroup;
    });
    scene.add(mainGroup);

    // ---- preview effect: ONE dense ring of golden glitter that surrounds exactly the 4 cubies of
    // whichever layer is armed, and spins in the SAME direction that layer will actually rotate
    // (RING_SIGN_FLIP is defined at module scope, shared with setPreview below)
    const RING_RADIUS = 0.85, RING_COUNT = 80;
    const ringGroup = new THREE.Group();
    const ringParticles = [];
    for (let j = 0; j < RING_COUNT; j++) {
      const pRadius = 0.02 + Math.random() * 0.018;
      const pGeo = new THREE.SphereGeometry(pRadius, 6, 6);
      const pMat = new THREE.MeshBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.visible = false;
      ringGroup.add(pMesh);
      disposables.push(pGeo, pMat);
      ringParticles.push({
        mesh: pMesh,
        baseAngle: (j / RING_COUNT) * Math.PI * 2,
        radiusJitter: (Math.random() * 2 - 1) * 0.08,
        axisJitter: (Math.random() * 2 - 1) * 0.06,
        twinkleF: 0.6 + Math.random() * 0.9, twinkleP: Math.random() * Math.PI * 2,
      });
    }
    scene.add(ringGroup);

    // ---- solution walls: true vertical planes standing in 3D space (same style as the main game),
    // elevated above the cube so its silhouette never overlaps them
    const wallsGroup = new THREE.Group();
    function addSolutionCell(cx, cy, cz, filled, rotY) {
      const geo = new THREE.PlaneGeometry(cellSize, cellSize);
      const mat = new THREE.MeshBasicMaterial({ color: filled ? COLORS.primary : 0xffffff, transparent: true, opacity: filled ? 0.92 : 0.28, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, cy, cz);
      mesh.rotation.y = rotY;
      wallsGroup.add(mesh);
      disposables.push(geo, mat);
      const edgeGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(cellSpacing, cellSpacing));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xd8d8e8 });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.position.set(cx, cy, cz);
      edges.rotation.y = rotY;
      wallsGroup.add(edges);
      disposables.push(edgeGeo, edgeMat);
    }
    // each wall shows a PROJECTION (shadow): "is at least one cube present along this line of sight",
    // exactly like Cubi & Ombre's front/side walls — a simple 2x2, no raw per-cubie values
    const projX = incastroProjX(target); // [z][y]
    const projZ = incastroProjZ(target); // [x][y]

    // Exactly one cell, on exactly one wall, is marked — whichever one matches the single marked
    // face's axis ('x' → left wall cell at z,y; 'z' → right wall cell at x,y).
    let markedLeftCell = null, markedRightCell = null;
    if (markedSlot !== null && markedSlot !== undefined) {
      const sx = markedSlot % 2, sy = Math.floor(markedSlot / 2) % 2, sz = Math.floor(markedSlot / 4);
      if (markedAxis === 'x') markedLeftCell = sz * 2 + sy;
      else if (markedAxis === 'z') markedRightCell = sx * 2 + sy;
    }
    const wallMarkGeo = new THREE.CircleGeometry(cellSize * 0.24, 20);
    const wallMarkMat = new THREE.MeshBasicMaterial({ color: COLORS.warning, side: THREE.DoubleSide });
    disposables.push(wallMarkGeo, wallMarkMat);
    function addWallMark(cx, cy, cz, rotY) {
      const mesh = new THREE.Mesh(wallMarkGeo, wallMarkMat);
      mesh.position.set(cx, cy, cz);
      mesh.rotation.y = rotY;
      const normal = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rotY, 0));
      mesh.position.addScaledVector(normal, 0.01);
      wallsGroup.add(mesh);
    }

    for (let z = 0; z < 2; z++) for (let y = 0; y < 2; y++) {
      const cx = leftWallCenter.x, cy = leftWallCenter.y + (y - 0.5) * cellSpacing, cz = leftWallCenter.z + (z - 0.5) * cellSpacing;
      addSolutionCell(cx, cy, cz, projX[z][y], Math.PI / 2);
      if (projX[z][y] && markedLeftCell === z * 2 + y) addWallMark(cx, cy, cz, Math.PI / 2);
    }
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) {
      const cx = rightWallCenter.x + (x - 0.5) * cellSpacing, cy = rightWallCenter.y + (y - 0.5) * cellSpacing, cz = rightWallCenter.z;
      addSolutionCell(cx, cy, cz, projZ[x][y], 0);
      if (projZ[x][y] && markedRightCell === x * 2 + y) addWallMark(cx, cy, cz, 0);
    }
    scene.add(wallsGroup);

    stateRef.current = { scene, camera, renderer, cubeMeshes, mainGroup, slotToGroup, ringParticles, ringActive: null, animating: false, setCubieMark };

    // draggable camera: horizontal drag orbits azimuthally (theta) at the same fixed elevation —
    // no tap-to-select here (that's handled by the HTML ⟳ buttons layered on top), so unlike
    // Scene3D there's no drag-vs-tap disambiguation needed, just continuous rotation.
    let dragging = false, dragStartX = 0, thetaStart = 0;
    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - dragStartX;
      theta = thetaStart - dx * 0.0075;
      updateCamera();
    }
    function onPointerUp() {
      dragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    }
    function onPointerDown(e) {
      dragging = true;
      dragStartX = e.clientX;
      thetaStart = theta;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const resizeObserver = new ResizeObserver(() => {
      const c = containerRef.current;
      if (!c || !stateRef.current.renderer) return;
      const nw = Math.max(c.clientWidth, 50), nh = Math.max(c.clientHeight, 50);
      stateRef.current.renderer.setSize(nw, nh);
      const asp = nw / nh;
      const newFrustumSize = Math.max(maxHalfH * 2, (maxHalfW * 2) / asp) * 1.08;
      const cam = stateRef.current.camera;
      cam.left = -newFrustumSize * asp / 2; cam.right = newFrustumSize * asp / 2;
      cam.top = newFrustumSize / 2; cam.bottom = -newFrustumSize / 2;
      cam.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    let raf;
    const RING_SPIN_SPEED = (Math.PI * 2) / 3.2; // one full revolution every 3.2s
    function animate() {
      raf = requestAnimationFrame(animate);
      const t = performance.now() / 1000;
      if (markedGlowMat) {
        markedGlowMat.opacity = 0.4 + 0.6 * ((Math.sin(t * 4) + 1) / 2);
      }
      const ringActive = stateRef.current.ringActive;
      if (ringActive) {
        const { axis: rotAxis, sign, pivot } = ringActive;
        const spin = t * RING_SPIN_SPEED * sign;
        stateRef.current.ringParticles.forEach(rp => {
          const angle = rp.baseAngle + spin;
          const r = RING_RADIUS + rp.radiusJitter;
          let x = pivot.x, y = pivot.y, z = pivot.z;
          if (rotAxis === 'y') { x += r * Math.cos(angle); z += r * Math.sin(angle); y += rp.axisJitter; }
          else if (rotAxis === 'x') { y += r * Math.cos(angle); z += r * Math.sin(angle); x += rp.axisJitter; }
          else { x += r * Math.cos(angle); y += r * Math.sin(angle); z += rp.axisJitter; }
          rp.mesh.position.set(x, y, z);
          const twinkle = (Math.sin(t * rp.twinkleF + rp.twinkleP) + 1) / 2;
          rp.mesh.material.opacity = 0.65 + 0.35 * twinkle;
        });
      }
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.dispose();
      disposables.forEach(d => d.dispose && d.dispose());
      if (container) container.innerHTML = '';
      stateRef.current = {};
    };
  }, [target, markedSlot, markedAxis]);

  useImperativeHandle(ref, () => ({
    playTurn(axis, reverse, onComplete) {
      const st = stateRef.current;
      if (!st.scene || st.animating) { onComplete && onComplete(); return; }
      st.animating = true;

      const info = INCASTRO_AXIS_INFO[axis];
      const cycle = INCASTRO_CYCLES[axis];
      const seq = reverse ? [cycle[0], cycle[3], cycle[2], cycle[1]] : cycle;
      const pivot = new THREE.Group();
      pivot.position.set(info.pivot.x, info.pivot.y, info.pivot.z);
      st.scene.add(pivot);

      const movedGroups = seq.map(slot => st.slotToGroup[slot]);
      movedGroups.forEach(cg => {
        st.mainGroup.remove(cg);
        cg.position.sub(pivot.position);
        pivot.add(cg);
      });

      const effectiveSign = reverse ? -info.sign : info.sign;
      const targetAngle = effectiveSign * (Math.PI / 2);
      const duration = 300;
      const startTime = performance.now();
      function step(now) {
        const t = Math.min(1, (now - startTime) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        pivot.rotation[info.axis] = targetAngle * eased;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          movedGroups.forEach((cg, i) => {
            const newSlot = seq[(i + 1) % 4];
            pivot.remove(cg);
            const p = INCASTRO_CUBE_POS[newSlot];
            cg.position.set(p.x, p.y, p.z);
            cg.rotation.set(0, 0, 0);
            st.mainGroup.add(cg);
            st.slotToGroup[newSlot] = cg;
            // the mark (if this piece carries one) physically rotated along with it — update its
            // direction label and rebuild the decal, using the exact same signed angle as above
            if (cg.userData.markedFace) {
              st.setCubieMark(cg, rotateDirLabel(cg.userData.markedFace, info.axis, effectiveSign * 90));
            }
          });
          st.scene.remove(pivot);
          st.animating = false;
          onComplete && onComplete();
        }
      }
      requestAnimationFrame(step);
    },
    setPreview(axis) {
      const st = stateRef.current;
      if (!st.ringParticles) return;
      if (axis) {
        const info = INCASTRO_AXIS_INFO[axis];
        st.ringActive = { axis: info.axis, sign: info.sign * RING_SIGN_FLIP[axis], pivot: info.pivot };
      } else {
        st.ringActive = null;
      }
      st.ringParticles.forEach(rp => { rp.mesh.visible = !!axis; });

      const highlighted = axis ? new Set(INCASTRO_CYCLES[axis]) : new Set();
      for (let slot = 0; slot < 8; slot++) {
        st.slotToGroup[slot].userData.thickEdgeGroup.visible = highlighted.has(slot);
      }
    },
    setRingDirection(axis, reverse) {
      const st = stateRef.current;
      if (!st.ringActive) return;
      const info = INCASTRO_AXIS_INFO[axis];
      const baseSign = info.sign * RING_SIGN_FLIP[axis];
      st.ringActive.sign = reverse ? -baseSign : baseSign;
    },
  }));

  return <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />;
});

/* ============================== CSS MASCOT ============================== */
function Mascot({ small }) {
  const cls = small ? 'cae-mascot-sm' : 'cae-mascot';
  return (
    <div className={cls}>
      <div className="cae-face cae-face-top" style={{ background: '#FFD93D' }} />
      <div className="cae-face cae-face-left" style={{ background: '#FF9F45' }} />
      <div className="cae-face cae-face-right" style={{ background: '#FF6B6B' }} />
    </div>
  );
}

/* ============================== CONFETTI ============================== */
function ConfettiBurst() {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    id: i, left: Math.random() * 100, color: PALETTE[i % PALETTE.length], delay: Math.random() * 0.25,
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {pieces.map(p => (
        <div key={p.id} className="cae-confetti" style={{ left: `${p.left}%`, bottom: '20%', background: p.color, animationDelay: `${p.delay}s` }} />
      ))}
    </div>
  );
}

/* ============================== SCREENS ============================== */
function TopBar({ onBack, muted, onToggleMute, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
      <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onBack}><Home size={20} /></button>
      {title && <div className="cae-heading" style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>}
      <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onToggleMute}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
    </div>
  );
}

function MenuScreen({ save, pausedBlockPuzzle, pausedIncastro, pausedTasselli, onInfinite, onIncastro, onTasselli, onHowTo, onToggleMute }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, gap: 18 }}>
      <button className="cae-btn cae-btn-ghost cae-btn-icon" style={{ position: 'absolute', top: 16, right: 16 }} onClick={onToggleMute}>
        {save.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
      <Mascot />
      <div className="cae-heading" style={{ fontSize: 34, fontWeight: 700, color: COLORS.primary, textAlign: 'center', lineHeight: 1.1 }}>
        Cubi &amp; Ombre
      </div>
      <div style={{ fontSize: 14, opacity: 0.75, textAlign: 'center', maxWidth: 260 }}>
        Costruisci con i cubi finché la tua forma combacia con le ombre intorno.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280, marginTop: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button className="cae-btn cae-btn-primary" onClick={onInfinite}><Play size={18} /> Block Puzzle 3D</button>
          {pausedBlockPuzzle && (
            <div style={{ fontSize: 11, opacity: 0.6, textAlign: 'center' }}>Puzzle {pausedBlockPuzzle.infiniteNum} in corso</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button className="cae-btn cae-btn-secondary" onClick={onIncastro}>◈ Incastro Perfetto</button>
          {pausedIncastro && (
            <div style={{ fontSize: 11, opacity: 0.6, textAlign: 'center' }}>Puzzle {pausedIncastro.streak} in corso</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button className="cae-btn cae-btn-secondary" onClick={onTasselli}>◫ Tasselli Ruotati</button>
          {pausedTasselli && (
            <div style={{ fontSize: 11, opacity: 0.6, textAlign: 'center' }}>Puzzle {pausedTasselli.streak} in corso</div>
          )}
        </div>
        <button className="cae-btn cae-btn-ghost" onClick={onHowTo}><Info size={18} /> Come si gioca</button>
      </div>
      <div className="cae-card" style={{ padding: '10px 18px', display: 'flex', gap: 18, fontSize: 13, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <div>◼ Record: {save.infiniteBest}</div>
        <div>◈ Record: {save.incastroBest}</div>
        <div>◫ Record: {save.tasselliBest}</div>
      </div>
    </div>
  );
}

function HowToScreen({ onBack }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <TopBar onBack={onBack} title="Come si gioca" muted={false} onToggleMute={() => {}} />
      <div style={{ padding: '4px 20px 24px', maxWidth: 420, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 14, lineHeight: 1.6 }}>
        <p>Intorno al piano trovi 2 o 3 pareti colorate: sono le sagome della forma che devi costruire, viste da davanti, di lato e (a volte) dall'alto.</p>
        <p><b>Trascina</b> sullo schermo per ruotare la visuale e vedere ogni lato della tua costruzione — utile per piazzare cubi nelle celle più nascoste.</p>
        <p>Tocca una casella della griglia per aggiungere un cubo. Passa alla modalità <b>Rimuovi</b> per toglierlo.</p>
        <p>Confronta a occhio la tua costruzione con le pareti: appena combacia con tutte le sagome richieste, il livello si completa da solo — nessun pulsante da premere!</p>
        <p>Ogni puzzle ha un limite di tempo. In <b>Block Puzzle 3D</b>, l'icona Home mette in pausa la partita invece di abbandonarla: dal menu potrai scegliere "Continua" per riprendere esattamente da dove eri, con 3 secondi di preparazione prima che il tempo riparta.</p>
        <p><b>Incastro Perfetto</b> è un cubo 2×2×2: tocca uno dei simboli ⟳ per scegliere uno strato, poi ruotalo con le due frecce finché la tua sagoma non combacia con le due pareti.</p>
        <p>A un certo punto un cubetto avrà un <b style={{ color: COLORS.warning }}>segno rosso</b> su una sola faccia: non basta più metterlo nella casella giusta, va anche girato in modo che quella faccia punti verso la parete che mostra lo stesso segno.</p>
        <p><b>Tasselli Ruotati</b>: in alto vedi la soluzione, con un piccolo angolo <b style={{ color: '#E040A0' }}>magenta</b> come punto di riferimento fisso. La griglia grande sotto è la stessa soluzione, ma ruotata — lo stesso angolo magenta te lo indica. Tocca le caselle per accenderle o spegnerle e riproduci la soluzione ruotata.</p>
      </div>
    </div>
  );
}

function WinOverlay({ moveCount, elapsed, onNext, onMenu, isLastLevel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,74,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <ConfettiBurst />
      <div className="cae-card cae-pop" style={{ padding: '28px 26px', textAlign: 'center', maxWidth: 300, position: 'relative' }}>
        <Sparkles size={30} color={COLORS.primary} style={{ marginBottom: 6 }} />
        <div className="cae-heading" style={{ fontSize: 22, fontWeight: 700, color: COLORS.primary }}>Combacia!</div>
        <div style={{ fontSize: 13, opacity: 0.7, margin: '6px 0 18px' }}>{moveCount} mosse · {formatTime(elapsed)}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!isLastLevel && <button className="cae-btn cae-btn-primary" onClick={onNext}>Prossimo</button>}
          <button className="cae-btn cae-btn-ghost" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function LoseOverlay({ onRetry, onMenu }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,74,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="cae-card cae-pop" style={{ padding: '28px 26px', textAlign: 'center', maxWidth: 300, position: 'relative' }}>
        <div className="cae-heading" style={{ fontSize: 22, fontWeight: 700, color: COLORS.warning }}>Tempo scaduto!</div>
        <div style={{ fontSize: 13, opacity: 0.7, margin: '6px 0 18px' }}>Si riparte dal Puzzle 1 — il record resta salvo.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="cae-btn cae-btn-primary" onClick={onRetry}>Riprova</button>
          <button className="cae-btn cae-btn-ghost" onClick={onMenu}>Menu</button>
        </div>
      </div>
    </div>
  );
}

function ContinueChoiceOverlay({ title, subtitle, onContinue, onNew, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,74,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="cae-card cae-pop" style={{ padding: '28px 26px', textAlign: 'center', maxWidth: 300, position: 'relative' }}>
        <div className="cae-heading" style={{ fontSize: 20, fontWeight: 700, color: COLORS.primary }}>{title}</div>
        <div style={{ fontSize: 13, opacity: 0.7, margin: '6px 0 18px' }}>{subtitle}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="cae-btn cae-btn-primary" onClick={onContinue}><Play size={16} /> Continua</button>
          <button className="cae-btn cae-btn-secondary" onClick={onNew}>Nuova partita</button>
          <button className="cae-btn cae-btn-ghost" onClick={onCancel}>Annulla</button>
        </div>
      </div>
    </div>
  );
}

function ResumeCountdownOverlay({ count }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(58,58,74,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="cae-card cae-pop" style={{ padding: '30px 44px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>Si riprende tra...</div>
        <div className="cae-heading" style={{ fontSize: 52, fontWeight: 700, color: COLORS.primary }}>{count}</div>
      </div>
    </div>
  );
}

function PlayScreen(props) {
  const { levelData, playerHeights, mode, setMode, onCellTap, onUndo, onReset,
    onBack, moveCount, elapsed, timeLeft, won, lost, resumeCountdown, muted, onToggleMute, onNext, onRetry } = props;
  const { name } = levelData;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onBack}><Home size={20} /></button>
        <div className="cae-card" style={{ padding: '5px 16px', textAlign: 'center' }}>
          <div className="cae-heading" style={{ fontSize: 14, fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 11 }}>
            <span style={{ opacity: 0.6 }}>{moveCount} mosse ·</span>{' '}
            <span style={{ color: getTimeColor(timeLeft, CLASSIC_TIME_WARN, CLASSIC_TIME_DANGER), fontWeight: timeLeft <= CLASSIC_TIME_WARN ? 700 : 400 }}>⏱ {formatTime(timeLeft)}</span>
          </div>
        </div>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onToggleMute}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <Scene3D levelData={levelData} playerHeights={playerHeights} onCellTap={onCellTap} />
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '8px 14px 16px', flexWrap: 'wrap' }}>
        <div className="cae-card" style={{ display: 'flex', padding: 4, gap: 4 }}>
          <button className="cae-btn" style={{ padding: '9px 15px', fontSize: 14, background: mode === 'add' ? COLORS.primary : 'transparent', color: mode === 'add' ? 'white' : COLORS.ink, boxShadow: 'none' }} onClick={() => setMode('add')}><Plus size={16} /> Aggiungi</button>
          <button className="cae-btn" style={{ padding: '9px 15px', fontSize: 14, background: mode === 'remove' ? COLORS.warning : 'transparent', color: mode === 'remove' ? 'white' : COLORS.ink, boxShadow: 'none' }} onClick={() => setMode('remove')}><Minus size={16} /> Rimuovi</button>
        </div>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onUndo}><Undo2 size={18} /></button>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onReset}><RotateCcw size={18} /></button>
      </div>

      {won && <WinOverlay moveCount={moveCount} elapsed={elapsed} onNext={onNext} onMenu={onBack} isLastLevel={false} />}
      {lost && <LoseOverlay onRetry={onRetry} onMenu={onBack} />}
      {resumeCountdown !== null && resumeCountdown !== undefined && <ResumeCountdownOverlay count={resumeCountdown} />}
    </div>
  );
}

/* ============================== TASSELLI RUOTATI ============================== */
const TASSELLI_ON_COLOR = '#FFD93D';
const TASSELLI_ANCHOR_COLOR = '#E040A0';
// Reference (max) sizes — quanto sono larghe le due griglie quando c'è spazio in abbondanza (il
// caso normale su telefono). Su schermi corti in larghezza-ma-non-in-altezza (tipico di finestre
// desktop) le due griglie insieme + etichetta + gap possono superare l'altezza disponibile, e
// prima finivano semplicemente tagliate con bisogno di scroll. TASSELLI_BOARD_MIN è il pavimento
// sotto cui le celle diventerebbero scomode da toccare — sotto quella soglia si torna allo scroll
// come rete di sicurezza invece di rimpicciolire ulteriormente.
const TASSELLI_SOLUTION_MAX = 180;
const TASSELLI_BOARD_MAX = 340;
const TASSELLI_BOARD_MIN = 170;
const TASSELLI_BLOCK_GAP = 26;    // spazio verticale tra il blocco "Soluzione" e la griglia di gioco
const TASSELLI_LABEL_BLOCK = 24;  // altezza approssimativa dell'etichetta "Soluzione" + margine

// The anchor always sits on one of the grid's 4 true corners (0=top-left, 2=top-right,
// 6=bottom-left, 8=bottom-right in a 3x3). The triangle itself must point into THAT corner —
// not always the cell's own top-left — otherwise after a rotation it visually "points" the
// wrong way even though it's on the right cell.
function tasselliCornerStyle(index) {
  const row = Math.floor(index / 3), col = index % 3;
  const isTop = row === 0, isLeft = col === 0;
  const pos = { position: 'absolute', width: '40%', height: '40%' };
  if (isTop) pos.top = 0; else pos.bottom = 0;
  if (isLeft) pos.left = 0; else pos.right = 0;
  let clipPath;
  if (isTop && isLeft) clipPath = 'polygon(0 0, 100% 0, 0 100%)';
  else if (isTop && !isLeft) clipPath = 'polygon(100% 0, 100% 100%, 0 0)';
  else if (!isTop && isLeft) clipPath = 'polygon(0 100%, 0 0, 100% 100%)';
  else clipPath = 'polygon(100% 100%, 0 100%, 100% 0)';
  return { ...pos, clipPath };
}

function TasselliCell({ on, index, showAnchor, interactive, onClick }) {
  const clickable = interactive;
  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      style={{
        width: '100%', aspectRatio: '1 / 1', border: 'none', borderRadius: 12, overflow: 'hidden',
        background: on ? TASSELLI_ON_COLOR : '#E7E7F0', position: 'relative', padding: 0,
        cursor: clickable ? 'pointer' : 'default',
        boxShadow: clickable ? '0 2px 0 rgba(0,0,0,0.08)' : 'none',
        transition: 'background .15s ease',
      }}
    >
      {showAnchor && (
        <div style={{ ...tasselliCornerStyle(index), background: TASSELLI_ANCHOR_COLOR }} />
      )}
    </button>
  );
}

function TasselliPlayScreen({ target, rotation, anchorIndex, board, moves, elapsed, timeLeft, won, lost, resumeCountdown, onTap, onBack, onNext, onRetry, muted, onToggleMute, streak, best }) {
  const boardAnchorIndex = tasselliRotateIndexN(anchorIndex, rotation);
  const contentRef = useRef(null);
  const [boardSize, setBoardSize] = useState(TASSELLI_BOARD_MAX);

  // Misura lo spazio VERO disponibile (l'area sotto l'intestazione) e restringe entrambe le
  // griglie insieme, proporzionalmente, così stanno sempre nello schermo senza dover scrollare —
  // su telefono lo spazio in altezza basta già alle dimensioni piene (nessun cambiamento visibile
  // lì), su una finestra desktop più corta le griglie si rimpiccioliscono quanto serve.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    function recompute() {
      const availH = el.clientHeight - 36; // meno il padding verticale del contenitore (12px + 24px)
      const availW = el.clientWidth - 48;  // meno il padding orizzontale del contenitore (24px + 24px)
      const ratio = TASSELLI_SOLUTION_MAX / TASSELLI_BOARD_MAX; // altezza soluzione come frazione di quella della board
      const byHeight = (availH - TASSELLI_LABEL_BLOCK - TASSELLI_BLOCK_GAP) / (1 + ratio);
      setBoardSize(Math.max(TASSELLI_BOARD_MIN, Math.min(TASSELLI_BOARD_MAX, byHeight, availW)));
    }
    recompute();
    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onBack}><Home size={20} /></button>
        <div className="cae-card" style={{ padding: '5px 16px', textAlign: 'center' }}>
          <div className="cae-heading" style={{ fontSize: 14, fontWeight: 600 }}>Tasselli Ruotati</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Puzzle {streak} · {moves} mosse · record {best}</div>
          <div style={{ fontSize: 11, color: getTimeColor(timeLeft, TASSELLI_TIME_WARN, TASSELLI_TIME_DANGER), fontWeight: timeLeft <= TASSELLI_TIME_WARN ? 700 : 400 }}>⏱ {formatTime(timeLeft)}</div>
        </div>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onToggleMute}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </div>

      <div ref={contentRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: TASSELLI_BLOCK_GAP, padding: '12px 24px 24px' }}>
        <div style={{ width: '100%', maxWidth: boardSize * (TASSELLI_SOLUTION_MAX / TASSELLI_BOARD_MAX) }}>
          <div style={{ fontSize: 12, opacity: 0.6, textAlign: 'center', marginBottom: 8 }}>Soluzione</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
            {target.map((on, i) => (
              <TasselliCell key={i} on={on} index={i} showAnchor={i === anchorIndex} interactive={false} />
            ))}
          </div>
        </div>

        <div style={{ width: '100%', maxWidth: boardSize }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {board.map((on, i) => (
              <TasselliCell key={i} on={on} index={i} showAnchor={i === boardAnchorIndex} interactive={!won && !lost && resumeCountdown === null} onClick={() => onTap(i)} />
            ))}
          </div>
        </div>
      </div>

      {won && <WinOverlay moveCount={moves} elapsed={elapsed} onNext={onNext} onMenu={onBack} isLastLevel={false} />}
      {lost && <LoseOverlay onRetry={onRetry} onMenu={onBack} />}
      {resumeCountdown !== null && resumeCountdown !== undefined && <ResumeCountdownOverlay count={resumeCountdown} />}
    </div>
  );
}

const INCASTRO_SELECTOR_POS = {
  top:    { top: '64%', left: '8%' },
  bottom: { top: '78%', left: '8%' },
  left:   { top: '90%', left: '20%' },
  right:  { top: '97.5%', left: '38%' },
  back:   { top: '97%', left: '65%' },
  front:  { top: '88%', left: '83%' },
};

// On a real phone the cube fills the whole stage, so the hand-tuned INCASTRO_SELECTOR_POS
// percentages read fine as-is. On a wide desktop window the stage is landscape, so the button
// hot-zone is capped to a portrait box instead of stretching. That box's proportions AND button
// size are fixed constants, measured directly (pixel analysis, not estimated) from a confirmed-
// correct phone screenshot — width:height ≈ 0.80, button diameter ≈ 9.7% of stage height. This
// replaces an earlier version that tried to auto-calibrate these from a live phone visit via
// window.storage; that never reliably reached separate desktop sessions, so measured constants
// are simpler and guaranteed consistent everywhere.
const INCASTRO_REFERENCE_RATIO = 0.8;
const INCASTRO_REFERENCE_BUTTON_SCALE = 0.097;

function IncastroPlayScreen({ target, incastroState, markedSlot, markedAxis, moves, elapsed, timeLeft, won, lost, resumeCountdown, onTurn, onBack, onNext, onRetry, muted, onToggleMute, streak, best }) {
  const sceneRef = useRef(null);
  const stageRef = useRef(null);
  // Synchronous lock against a fast double-tap on the rotate buttons. `animating` (React state)
  // only drives the disabled/visual look of the buttons and updates a render late — a second tap
  // landing in that gap used to slip past the old `if (animating...) return` guard, reach
  // playTurn() while the Three.js scene was still mid-turn, get silently no-op'd on the VISUAL
  // side (playTurn's own internal guard), but still fire onComplete() -> onTurn() -> a real
  // logical turn applied to incastroState. Net effect: the puzzle looks solved on screen but the
  // logic thinks one extra turn happened, so the win check never matches — and that mismatch
  // persists across further moves since it's baked into the state, not a timing fluke. This ref
  // is checked+set in the same synchronous tick as the click, so a second tap is dropped before
  // it ever reaches playTurn/onTurn, whether or not React has re-rendered the disabled button yet.
  const animatingRef = useRef(false);
  const [animating, setAnimating] = useState(false);
  const [selectedAxis, setSelectedAxis] = useState(null);
  const [buttonBox, setButtonBox] = useState({ left: 0, top: 0, width: 0, height: 0, scale: INCASTRO_REFERENCE_BUTTON_SCALE, isNative: true });

  useEffect(() => { animatingRef.current = false; setAnimating(false); setSelectedAxis(null); }, [target]);

  // Portrait/square stage (real phones): never touch it, buttons use the full native space at
  // their normal scale, exactly like before. Landscape stage (desktop): cap the button hot-zone
  // to the fixed reference ratio, centered, and scale buttons by the fixed reference fraction.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    function recompute() {
      const cw = el.clientWidth, ch = el.clientHeight;
      if (!cw || !ch) return;
      if (cw <= ch) {
        setButtonBox({ left: 0, top: 0, width: cw, height: ch, scale: INCASTRO_REFERENCE_BUTTON_SCALE, isNative: true });
      } else {
        const boxWidth = Math.min(cw, ch * INCASTRO_REFERENCE_RATIO);
        setButtonBox({ left: (cw - boxWidth) / 2, top: 0, width: boxWidth, height: ch, scale: INCASTRO_REFERENCE_BUTTON_SCALE, isNative: false });
      }
    }

    recompute();
    const resizeObserver = new ResizeObserver(recompute);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  function handleSelectAxis(axis) {
    if (animatingRef.current || won || lost || resumeCountdown !== null || !sceneRef.current || selectedAxis === axis) return;
    sceneRef.current.setPreview(axis);
    setSelectedAxis(axis);
  }

  function handleRotate(reverse) {
    if (animatingRef.current || won || lost || resumeCountdown !== null || !selectedAxis || !sceneRef.current) return;
    animatingRef.current = true; // set BEFORE playTurn, synchronously — a second tap arriving
                                  // right after this line (even before React re-renders the
                                  // disabled button) hits the guard above and returns immediately,
                                  // never reaching playTurn/onTurn at all.
    const invertedAxes = ['left', 'right', 'front', 'back'];
    const effectiveReverse = invertedAxes.includes(selectedAxis) ? !reverse : reverse;
    setAnimating(true);
    sceneRef.current.setRingDirection(selectedAxis, effectiveReverse);
    sceneRef.current.playTurn(selectedAxis, effectiveReverse, () => {
      onTurn(selectedAxis, effectiveReverse);
      animatingRef.current = false;
      setAnimating(false);
    });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onBack}><Home size={20} /></button>
        <div className="cae-card" style={{ padding: '5px 16px', textAlign: 'center', maxWidth: 240 }}>
          <div className="cae-heading" style={{ fontSize: 14, fontWeight: 600 }}>Incastro Perfetto</div>
          <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 4 }}>
            <span style={{ opacity: 0.6 }}>Puzzle {streak} · {moves} mosse · record {best}</span>
            <span style={{ color: getTimeColor(timeLeft, INCASTRO_TIME_WARN, INCASTRO_TIME_DANGER), fontWeight: timeLeft <= INCASTRO_TIME_WARN ? 700 : 400 }}>⏱ {formatTime(timeLeft)}</span>
          </div>
          {markedSlot !== null && markedSlot !== undefined && (
            <div style={{ fontSize: 11, color: COLORS.warning, fontWeight: 600, marginTop: 2 }}>
              ● il cubo segnato va nella sua casella, girato dal verso giusto
            </div>
          )}
        </div>
        <button className="cae-btn cae-btn-ghost cae-btn-icon" onClick={onToggleMute}>{muted ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
      </div>

      <div ref={stageRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', left: buttonBox.left, top: buttonBox.top, width: buttonBox.width, height: buttonBox.height }}>
          <SceneIncastro ref={sceneRef} initialState={incastroState} target={target} markedSlot={markedSlot} markedAxis={markedAxis} />

          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {INCASTRO_AXES.map(axis => {
              const selected = selectedAxis === axis;
              const pos = INCASTRO_SELECTOR_POS[axis];
              const btnSize = Math.max(30, Math.round(buttonBox.height * buttonBox.scale));
            return (
              <button key={axis} disabled={animating || won || lost || resumeCountdown !== null}
                onClick={() => handleSelectAxis(axis)}
                style={{
                  position: 'absolute', top: pos.top, left: pos.left, transform: 'translate(-50%, -50%)',
                  pointerEvents: 'auto', width: btnSize, height: btnSize, borderRadius: '50%', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selected ? '#d4a017' : 'rgba(255,255,255,0.88)', color: selected ? 'white' : COLORS.primary,
                  boxShadow: selected ? '0 3px 0 #a67c0d' : '0 3px 0 rgba(0,0,0,0.12)',
                  fontSize: Math.round(btnSize * 0.46), cursor: 'pointer', transition: 'top .2s ease, left .2s ease',
                }}>
                ⟳
              </button>
            );
            })}
          </div>
        </div>
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '10px 16px 20px' }}>
        <button className="cae-btn cae-btn-secondary" disabled={animating || won || lost || resumeCountdown !== null || !selectedAxis}
          style={{ width: 64, height: 64, borderRadius: '50%', padding: 0 }}
          onClick={() => handleRotate(true)}>
          <RotateCcw size={26} />
        </button>
        <div style={{ fontSize: 12, opacity: 0.6, minWidth: 90, textAlign: 'center' }}>
          {selectedAxis ? `Strato: ${INCASTRO_LABELS[selectedAxis]}` : 'Scegli uno strato'}
        </div>
        <button className="cae-btn cae-btn-secondary" disabled={animating || won || lost || resumeCountdown !== null || !selectedAxis}
          style={{ width: 64, height: 64, borderRadius: '50%', padding: 0 }}
          onClick={() => handleRotate(false)}>
          <RotateCw size={26} />
        </button>
      </div>

      {won && <WinOverlay moveCount={moves} elapsed={elapsed} onNext={onNext} onMenu={onBack} isLastLevel={false} />}
      {lost && <LoseOverlay onRetry={onRetry} onMenu={onBack} />}
      {resumeCountdown !== null && resumeCountdown !== undefined && <ResumeCountdownOverlay count={resumeCountdown} />}
    </div>
  );
}

/* ============================== BACKGROUND MUSIC (original pop/rock ballad loop) ==============================
   Inspired by the general mood of a reference track (moderate ~86 BPM, minor key, a "band version"
   ballad that builds from delicate to full) analyzed only for objective technical stats and on-screen
   text — tempo/key/"Band ver." label. No melody, lyrics, or any other creative content was taken from
   that track; every note and pattern below is original. Structure: 8 delicate bars (piano arpeggio,
   no drums) alternate with 8 full bars (driven guitar chords, real drums), looping continuously. */
function createBackgroundMusic() {
  const master = new Tone.Volume(-8).toDestination();

  const piano = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.5, sustain: 0.12, release: 1.1 },
  }).connect(master);
  piano.volume.value = -3;

  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 1, decay: 0.4, sustain: 0.5, release: 2.2 },
  }).connect(master);
  pad.volume.value = -10;

  const bass = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.03, decay: 0.15, sustain: 0.3, release: 0.6 },
  }).connect(master);
  bass.volume.value = 0;

  const guitarDist = new Tone.Distortion(0.32).connect(master);
  const guitar = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.004, decay: 0.16, sustain: 0.04, release: 0.22 },
  }).connect(guitarDist);
  guitar.volume.value = -6;

  const kick = new Tone.MembraneSynth({ pitchDecay: 0.045, octaves: 4, envelope: { attack: 0.001, decay: 0.28, sustain: 0 } }).connect(master);
  kick.volume.value = -3;

  const snareFilter = new Tone.Filter(2600, 'lowpass').connect(master);
  const snare = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } }).connect(snareFilter);
  snare.volume.value = -6;

  const hatFilter = new Tone.Filter(7000, 'highpass').connect(master);
  const hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.028, sustain: 0 } }).connect(hatFilter);
  hat.volume.value = -14;

  // original 4-bar minor progression: Em9 - Cmaj7 - Am7 - Bm7 (same chords in both sections;
  // the delicate/full contrast comes from instrumentation, rhythm, and drums, not the harmony)
  const chords = [
    ['E3', 'G3', 'B3', 'D4', 'F#4'],
    ['C3', 'E3', 'G3', 'B3'],
    ['A2', 'C3', 'E3', 'G3'],
    ['B2', 'D3', 'F#3', 'A3'],
  ];
  const bassNotes = ['E1', 'C2', 'A1', 'B1'];

  let stepCount = 0;

  const mainSeq = new Tone.Sequence((time, step) => {
    const bar = Math.floor(stepCount / 8) % 16;
    const chordIdx = bar % 4;
    const isFull = bar >= 8;
    const chord = chords[chordIdx];
    const root = bassNotes[chordIdx];

    if (step === 0) {
      pad.triggerAttackRelease(chord, '1m', time);
      pad.volume.value = isFull ? -6 : -12;
      if (!isFull) bass.triggerAttackRelease(root, '2n', time);
    }

    if (!isFull) {
      // delicate: gentle piano arpeggio through the chord tones, no drums at all
      if (step % 2 === 0) {
        const note = chord[(step / 2) % chord.length];
        piano.triggerAttackRelease(note, '8n', time);
      }
    } else {
      // full: driven guitar chord stabs (strum rhythm) + real drums + fuller bass
      if ([0, 1, 4, 5, 6].includes(step)) guitar.triggerAttackRelease(chord, '8n', time);
      if (step === 0 || step === 4) { bass.triggerAttackRelease(root, '8n', time); kick.triggerAttackRelease('C1', '8n', time); }
      if (step === 2 || step === 6) snare.triggerAttackRelease('16n', time);
      hat.triggerAttackRelease('32n', time);
    }

    stepCount++;
  }, [0, 1, 2, 3, 4, 5, 6, 7], '8n');

  let started = false;
  return {
    start() {
      if (started) return;
      started = true;
      Tone.Transport.bpm.value = 86;
      Tone.Transport.swing = 0;
      mainSeq.start(0);
      if (Tone.Transport.state !== 'started') Tone.Transport.start();
    },
    setMuted(muted) { master.mute = muted; },
    dispose() {
      mainSeq.dispose();
      [piano, pad, bass, guitar, guitarDist, kick, snare, hat, snareFilter, hatFilter, master].forEach(n => n.dispose());
    },
  };
}

/* ============================== APP ============================== */
export default function CubiEOmbre() {
  const [screen, setScreen] = useState('menu');
  const [save, setSave] = useState(defaultSave());
  const [infiniteNum, setInfiniteNum] = useState(1);
  const [levelData, setLevelData] = useState(null);
  const [playerHeights, setPlayerHeights] = useState(null);
  const [history, setHistory] = useState([]);
  const [moveCount, setMoveCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(CLASSIC_TIME_LIMIT);
  const [won, setWon] = useState(false);
  const [lost, setLost] = useState(false);
  const [mode, setMode] = useState('add');
  const [pausedBlockPuzzle, setPausedBlockPuzzle] = useState(null);
  const [resumeCountdown, setResumeCountdown] = useState(null);
  // which mode's "Continua / Nuova partita" popup is currently showing on the menu (null = none)
  const [choiceModal, setChoiceModal] = useState(null);

  const [incastroTarget, setIncastroTarget] = useState(null);
  const [incastroState, setIncastroState] = useState(null);
  const [incastroMarkedSlot, setIncastroMarkedSlot] = useState(null);
  const [incastroMarkedAxis, setIncastroMarkedAxis] = useState(null);
  const [incastroMoves, setIncastroMoves] = useState(0);
  const [incastroElapsed, setIncastroElapsed] = useState(0);
  const [incastroTimeLeft, setIncastroTimeLeft] = useState(INCASTRO_TIME_LIMIT);
  const [incastroWon, setIncastroWon] = useState(false);
  const [incastroLost, setIncastroLost] = useState(false);
  const [incastroStreak, setIncastroStreak] = useState(1);
  const [pausedIncastro, setPausedIncastro] = useState(null);

  const [tasselliTarget, setTasselliTarget] = useState(null);
  const [tasselliRotation, setTasselliRotation] = useState(0);
  const [tasselliAnchorIndex, setTasselliAnchorIndex] = useState(6);
  const [tasselliBoard, setTasselliBoard] = useState(null);
  const [tasselliMoves, setTasselliMoves] = useState(0);
  const [tasselliElapsed, setTasselliElapsed] = useState(0);
  const [tasselliTimeLeft, setTasselliTimeLeft] = useState(TASSELLI_TIME_LIMIT);
  const [tasselliWon, setTasselliWon] = useState(false);
  const [tasselliLost, setTasselliLost] = useState(false);
  const [tasselliStreak, setTasselliStreak] = useState(1);
  const [pausedTasselli, setPausedTasselli] = useState(null);
  // true solo dopo che il caricamento iniziale da localStorage è completato — vedi il commento
  // sull'effetto di salvataggio qui sotto per il perché serve.
  const [pausedLoaded, setPausedLoaded] = useState(false);

  const soundsRef = useRef(null);
  const musicRef = useRef(null);

  // Snapshot del puzzle in corso "adesso", ricalcolato a ogni render (stessa forma usata da
  // handlePauseX): null quando non c'è nulla da salvare (menu, schermata how-to, puzzle vinto o
  // perso). Assegnato durante il render, non in un effetto, così i listener sotto — registrati
  // una sola volta al mount — leggono sempre il valore più fresco senza bisogno di essere
  // ricreati a ogni cambio di stato.
  const activeSnapshotRef = useRef(null);
  activeSnapshotRef.current = (() => {
    if (screen === 'play' && !won && !lost && levelData && playerHeights) {
      return { type: 'blockPuzzle', data: { levelData, playerHeights, history, moveCount, elapsed, timeLeft, mode, infiniteNum } };
    }
    if (screen === 'incastro' && !incastroWon && !incastroLost && incastroTarget && incastroState) {
      return { type: 'incastro', data: { target: incastroTarget, incastroState, markedSlot: incastroMarkedSlot, markedAxis: incastroMarkedAxis, moves: incastroMoves, elapsed: incastroElapsed, timeLeft: incastroTimeLeft, streak: incastroStreak } };
    }
    if (screen === 'tasselli' && !tasselliWon && !tasselliLost && tasselliTarget && tasselliBoard) {
      return { type: 'tasselli', data: { target: tasselliTarget, rotation: tasselliRotation, anchorIndex: tasselliAnchorIndex, board: tasselliBoard, moves: tasselliMoves, elapsed: tasselliElapsed, timeLeft: tasselliTimeLeft, streak: tasselliStreak } };
    }
    return null;
  })();

  // Salvataggio continuo separato (vedi ACTIVE_KEY sopra): scatta solo sugli eventi di uscita,
  // mai a ogni mossa/tick, così copre chiudere la scheda o cambiare app mentre si sta giocando
  // attivamente senza aggiungere scritture su localStorage durante il gioco normale. Registrato
  // una volta sola al mount: legge lo stato sempre aggiornato da activeSnapshotRef.
  useEffect(() => {
    function flushActive() { persistActive(activeSnapshotRef.current); }
    function onVisibility() { if (document.visibilityState === 'hidden') flushActive(); }
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flushActive);
    window.addEventListener('beforeunload', flushActive);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flushActive);
      window.removeEventListener('beforeunload', flushActive);
    };
  }, []);

  useEffect(() => { loadSave().then(setSave); }, []);

  useEffect(() => {
    loadPaused().then(p => {
      // Se la scheda è stata chiusa mentre un puzzle era in corso (senza mai premere Home), qui
      // c'è uno snapshot "attivo" separato lasciato dai listener di uscita qui sotto. Lo uniamo a
      // pausedX solo se non c'è già un pausedX per quel tipo (una pausa esplicita vince sempre),
      // poi lo svuotiamo: è un recupero "una tantum", non deve restare a fare da doppione.
      const active = loadActive();
      const merged = { ...p };
      if (active && active.type && active.data && !merged[active.type]) {
        merged[active.type] = active.data;
      }
      clearActive();
      setPausedBlockPuzzle(merged.blockPuzzle);
      setPausedIncastro(merged.incastro);
      setPausedTasselli(merged.tasselli);
      setPausedLoaded(true);
    });
  }, []);

  // Salva su localStorage ogni volta che uno dei tre "puzzle in corso" cambia — messo in pausa,
  // ripreso (torna a null), o azzerato iniziando una partita nuova — così sopravvivono anche alla
  // chiusura della pagina, non solo a un cambio di schermata nella stessa sessione. Il guard su
  // pausedLoaded evita di sovrascrivere un salvataggio reale con i valori iniziali (null) nella
  // primissima renderizzazione, prima che il caricamento qui sopra sia completato.
  useEffect(() => {
    if (!pausedLoaded) return;
    persistPaused({ blockPuzzle: pausedBlockPuzzle, incastro: pausedIncastro, tasselli: pausedTasselli });
  }, [pausedBlockPuzzle, pausedIncastro, pausedTasselli, pausedLoaded]);

  useEffect(() => {
    let started = false;
    function tryUnlock() {
      if (started) return;
      if (!soundsRef.current) {
        soundsRef.current = {
          blip: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 } }).toDestination(),
          thud: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 } }).toDestination(),
        };
        musicRef.current = createBackgroundMusic();
        musicRef.current.setMuted(save.muted);
      }
      // fire every unlock path we know of in parallel — different mobile browsers/webviews respond
      // to different ones, and Tone's own resume() is known to miss iOS's "interrupted" state
      Tone.start().catch(() => {});
      try {
        const raw = Tone.getContext().rawContext;
        if (raw && raw.state !== 'running' && typeof raw.resume === 'function') raw.resume().catch(() => {});
      } catch (e) {}

      // don't just assume success — check shortly after, and if still not running, leave the
      // listeners attached so the NEXT tap gets another attempt instead of giving up forever
      setTimeout(() => {
        let running = false;
        try { running = Tone.getContext().rawContext.state === 'running'; } catch (e) {}
        if (running) {
          started = true;
          ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach(evt => window.removeEventListener(evt, tryUnlock));
          musicRef.current && musicRef.current.start();
        }
      }, 80);
    }
    ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach(evt => window.addEventListener(evt, tryUnlock));
    return () => {
      ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach(evt => window.removeEventListener(evt, tryUnlock));
      musicRef.current && musicRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    musicRef.current && musicRef.current.setMuted(save.muted);
  }, [save.muted]);

  const NOTES = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5'];
  function playPlace(h) { if (save.muted || !soundsRef.current) return; try { soundsRef.current.blip.triggerAttackRelease(NOTES[Math.min(h, NOTES.length - 1)], '16n'); } catch (e) {} }
  function playRemove(h) { if (save.muted || !soundsRef.current) return; try { soundsRef.current.blip.triggerAttackRelease(NOTES[Math.min(h, NOTES.length - 1)], '16n', undefined, 0.55); } catch (e) {} }
  function playError() { if (save.muted || !soundsRef.current) return; try { soundsRef.current.thud.triggerAttackRelease('A2', '16n'); } catch (e) {} }
  function playWin() {
    if (save.muted || !soundsRef.current) return;
    try { ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => setTimeout(() => soundsRef.current.blip.triggerAttackRelease(n, '16n'), i * 90)); } catch (e) {}
  }
  function playClick() { if (save.muted || !soundsRef.current) return; try { soundsRef.current.blip.triggerAttackRelease('B4', '32n'); } catch (e) {} }

  function updateSave(patch) {
    setSave(prev => { const next = { ...prev, ...patch }; persistSave(next); return next; });
  }

  function startInfinite(num) {
    const diff = getInfiniteDifficulty(num);
    const heights = generateHeights(diff.sizeX, diff.sizeZ, diff.maxH);
    setInfiniteNum(num);
    setLevelData({ name: `Block Puzzle 3D · Livello ${num}`, sizeX: diff.sizeX, sizeZ: diff.sizeZ, maxH: diff.maxH, views: diff.views, heights });
    setPlayerHeights(makeEmptyHeights(diff.sizeX, diff.sizeZ));
    setHistory([]); setMoveCount(0); setElapsed(0); setTimeLeft(CLASSIC_TIME_LIMIT); setWon(false); setLost(false); setMode('add');
    setPausedBlockPuzzle(null); setResumeCountdown(null);
    setScreen('play');
  }
  function handlePauseBlockPuzzle() {
    if (!won && !lost && levelData && playerHeights) {
      // Uscita a metà livello: salva lo stato esatto per riprendere da lì.
      setPausedBlockPuzzle({ levelData, playerHeights, history, moveCount, elapsed, timeLeft, mode, infiniteNum });
    } else if (won) {
      // Appena vinto, poi Menu invece di continuare subito: non c'è niente a metà da salvare, ma
      // prepariamo già il livello successivo così "Continua" dal menu riparte da lì e non da 1.
      const nextNum = infiniteNum + 1;
      const diff = getInfiniteDifficulty(nextNum);
      const heights = generateHeights(diff.sizeX, diff.sizeZ, diff.maxH);
      setPausedBlockPuzzle({
        levelData: { name: `Block Puzzle 3D · Livello ${nextNum}`, sizeX: diff.sizeX, sizeZ: diff.sizeZ, maxH: diff.maxH, views: diff.views, heights },
        playerHeights: makeEmptyHeights(diff.sizeX, diff.sizeZ),
        history: [], moveCount: 0, elapsed: 0, timeLeft: CLASSIC_TIME_LIMIT, mode: 'add', infiniteNum: nextNum,
      });
    }
    setScreen('menu');
  }
  function handleContinueBlockPuzzle() {
    if (!pausedBlockPuzzle) return;
    const snap = pausedBlockPuzzle;
    setLevelData(snap.levelData);
    setPlayerHeights(snap.playerHeights);
    setHistory(snap.history);
    setMoveCount(snap.moveCount);
    setElapsed(snap.elapsed);
    setTimeLeft(snap.timeLeft);
    setMode(snap.mode);
    setInfiniteNum(snap.infiniteNum);
    setWon(false); setLost(false);
    setPausedBlockPuzzle(null);
    setResumeCountdown(3);
    setScreen('play');
  }
  function startIncastro(streakNum) {
    const num = streakNum || 1;
    const { target, scramble, markedSlot, markedAxis } = generateIncastroPuzzle(getIncastroHasMark(num));
    setIncastroTarget(target);
    setIncastroState(scramble);
    setIncastroMarkedSlot(markedSlot);
    setIncastroMarkedAxis(markedAxis);
    setIncastroMoves(0); setIncastroElapsed(0); setIncastroTimeLeft(INCASTRO_TIME_LIMIT); setIncastroWon(false); setIncastroLost(false);
    setIncastroStreak(num);
    setPausedIncastro(null); setResumeCountdown(null);
    setScreen('incastro');
  }
  function handlePauseIncastro() {
    if (!incastroWon && !incastroLost && incastroTarget && incastroState) {
      // Uscita a metà puzzle: salva lo stato esatto per riprendere da lì.
      setPausedIncastro({
        target: incastroTarget, incastroState, markedSlot: incastroMarkedSlot, markedAxis: incastroMarkedAxis,
        moves: incastroMoves, elapsed: incastroElapsed, timeLeft: incastroTimeLeft, streak: incastroStreak,
      });
    } else if (incastroWon) {
      // Appena vinto, poi Menu invece di Prossimo: prepariamo già il puzzle successivo così
      // "Continua" dal menu riparte da lì e non da Puzzle 1.
      const nextStreak = incastroStreak + 1;
      const { target, scramble, markedSlot, markedAxis } = generateIncastroPuzzle(getIncastroHasMark(nextStreak));
      setPausedIncastro({
        target, incastroState: scramble, markedSlot, markedAxis,
        moves: 0, elapsed: 0, timeLeft: INCASTRO_TIME_LIMIT, streak: nextStreak,
      });
    }
    setScreen('menu');
  }
  function handleContinueIncastro() {
    if (!pausedIncastro) return;
    const snap = pausedIncastro;
    setIncastroTarget(snap.target);
    setIncastroState(snap.incastroState);
    setIncastroMarkedSlot(snap.markedSlot);
    setIncastroMarkedAxis(snap.markedAxis);
    setIncastroMoves(snap.moves);
    setIncastroElapsed(snap.elapsed);
    setIncastroTimeLeft(snap.timeLeft);
    setIncastroStreak(snap.streak);
    setIncastroWon(false); setIncastroLost(false);
    setPausedIncastro(null);
    setResumeCountdown(3);
    setScreen('incastro');
  }
  function startTasselli(streakNum) {
    const num = streakNum || 1;
    const { target, rotation, anchorIndex } = generateTasselliPuzzle();
    setTasselliTarget(target);
    setTasselliRotation(rotation);
    setTasselliAnchorIndex(anchorIndex);
    setTasselliBoard(Array(9).fill(false));
    setTasselliMoves(0); setTasselliElapsed(0); setTasselliTimeLeft(TASSELLI_TIME_LIMIT); setTasselliWon(false); setTasselliLost(false);
    setTasselliStreak(num);
    setPausedTasselli(null); setResumeCountdown(null);
    setScreen('tasselli');
  }
  function handlePauseTasselli() {
    if (!tasselliWon && !tasselliLost && tasselliTarget && tasselliBoard) {
      // Uscita a metà puzzle: salva lo stato esatto per riprendere da lì.
      setPausedTasselli({
        target: tasselliTarget, rotation: tasselliRotation, anchorIndex: tasselliAnchorIndex, board: tasselliBoard,
        moves: tasselliMoves, elapsed: tasselliElapsed, timeLeft: tasselliTimeLeft, streak: tasselliStreak,
      });
    } else if (tasselliWon) {
      // Appena vinto, poi Menu invece di Prossimo: prepariamo già il puzzle successivo così
      // "Continua" dal menu riparte da lì e non da Puzzle 1.
      const { target, rotation, anchorIndex } = generateTasselliPuzzle();
      setPausedTasselli({
        target, rotation, anchorIndex, board: Array(9).fill(false),
        moves: 0, elapsed: 0, timeLeft: TASSELLI_TIME_LIMIT, streak: tasselliStreak + 1,
      });
    }
    setScreen('menu');
  }
  function handleContinueTasselli() {
    if (!pausedTasselli) return;
    const snap = pausedTasselli;
    setTasselliTarget(snap.target);
    setTasselliRotation(snap.rotation);
    setTasselliAnchorIndex(snap.anchorIndex);
    setTasselliBoard(snap.board);
    setTasselliMoves(snap.moves);
    setTasselliElapsed(snap.elapsed);
    setTasselliTimeLeft(snap.timeLeft);
    setTasselliStreak(snap.streak);
    setTasselliWon(false); setTasselliLost(false);
    setPausedTasselli(null);
    setResumeCountdown(3);
    setScreen('tasselli');
  }

  useEffect(() => {
    if (screen !== 'play' || won || resumeCountdown !== null) return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [screen, won, resumeCountdown]);

  useEffect(() => {
    if (screen !== 'incastro' || incastroWon || resumeCountdown !== null) return;
    const id = setInterval(() => setIncastroElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [screen, incastroWon, resumeCountdown]);

  useEffect(() => {
    if (screen !== 'tasselli' || tasselliWon || resumeCountdown !== null) return;
    const id = setInterval(() => setTasselliElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [screen, tasselliWon, resumeCountdown]);

  useEffect(() => {
    if (screen !== 'play' || won || lost || resumeCountdown !== null) return;
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { setLost(true); playError(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [screen, won, lost, resumeCountdown]);

  useEffect(() => {
    if (resumeCountdown === null) return;
    if (resumeCountdown <= 0) { setResumeCountdown(null); return; }
    const id = setTimeout(() => setResumeCountdown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resumeCountdown]);

  useEffect(() => {
    if (screen !== 'incastro' || incastroWon || incastroLost || resumeCountdown !== null) return;
    const id = setInterval(() => {
      setIncastroTimeLeft(t => {
        if (t <= 1) { setIncastroLost(true); playError(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [screen, incastroWon, incastroLost, resumeCountdown]);

  useEffect(() => {
    if (screen !== 'tasselli' || tasselliWon || tasselliLost || resumeCountdown !== null) return;
    const id = setInterval(() => {
      setTasselliTimeLeft(t => {
        if (t <= 1) { setTasselliLost(true); playError(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [screen, tasselliWon, tasselliLost, resumeCountdown]);

  const targetProj = useMemo(() => levelData ? computeProjections(levelData.heights, levelData.sizeX, levelData.sizeZ, levelData.maxH, levelData.views) : null, [levelData]);
  const currentProj = useMemo(() => (levelData && playerHeights) ? computeProjections(playerHeights, levelData.sizeX, levelData.sizeZ, levelData.maxH, levelData.views) : null, [playerHeights, levelData]);

  useEffect(() => {
    if (!targetProj || !currentProj || !levelData || won || lost || moveCount === 0) return;
    if (projectionsMatch(currentProj, targetProj, levelData.views)) {
      setWon(true);
      playWin();
      if (infiniteNum > save.infiniteBest) updateSave({ infiniteBest: infiniteNum });
    }
    // eslint-disable-next-line
  }, [currentProj]);

  useEffect(() => {
    if (!incastroTarget || !incastroState || incastroWon || incastroLost || incastroMoves === 0) return;
    if (incastroSolved(incastroState, incastroTarget, incastroMarkedSlot, incastroMarkedAxis)) {
      setIncastroWon(true);
      playWin();
      if (incastroStreak > save.incastroBest) updateSave({ incastroBest: incastroStreak });
    }
    // eslint-disable-next-line
  }, [incastroState]);

  useEffect(() => {
    if (!tasselliTarget || !tasselliBoard || tasselliWon || tasselliLost || tasselliMoves === 0) return;
    const rotatedTarget = tasselliRotateGridN(tasselliTarget, tasselliRotation);
    if (tasselliBoard.every((v, i) => v === rotatedTarget[i])) {
      setTasselliWon(true);
      playWin();
      if (tasselliStreak > save.tasselliBest) updateSave({ tasselliBest: tasselliStreak });
    }
    // eslint-disable-next-line
  }, [tasselliBoard]);

  function handleCellTap(x, z) {
    if (won || lost || resumeCountdown !== null || !playerHeights || !levelData) return;
    const cur = playerHeights[x][z];
    if (mode === 'add') {
      if (cur >= levelData.maxH) { playError(); return; }
      setHistory(hArr => [...hArr, cloneHeights(playerHeights)]);
      setPlayerHeights(ph => { const next = cloneHeights(ph); next[x][z] = cur + 1; return next; });
      setMoveCount(m => m + 1); playPlace(cur + 1);
    } else {
      if (cur <= 0) { playError(); return; }
      setHistory(hArr => [...hArr, cloneHeights(playerHeights)]);
      setPlayerHeights(ph => { const next = cloneHeights(ph); next[x][z] = cur - 1; return next; });
      setMoveCount(m => m + 1); playRemove(cur - 1);
    }
  }
  function handleIncastroTurn(axis, reverse) {
    if (incastroWon || incastroLost || resumeCountdown !== null || !incastroState) return;
    setIncastroState(prev => applyIncastroTurn(prev, axis, reverse));
    setIncastroMoves(m => m + 1);
    playPlace(INCASTRO_AXES.indexOf(axis) + 2);
  }
  function handleUndo() {
    if (history.length === 0) return;
    setPlayerHeights(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  }
  function handleReset() {
    if (!levelData) return;
    setPlayerHeights(makeEmptyHeights(levelData.sizeX, levelData.sizeZ));
    setHistory([]); setMoveCount(0); setElapsed(0); setWon(false);
  }
  function handleNext() {
    startInfinite(infiniteNum + 1);
  }
  function handlePuzzleRetry() { startInfinite(1); }
  function handleIncastroNext() { startIncastro(incastroStreak + 1); }
  function handleIncastroRetry() { startIncastro(1); }
  function handleTasselliTap(index) {
    if (tasselliWon || tasselliLost || resumeCountdown !== null || !tasselliBoard) return;
    const turningOn = !tasselliBoard[index];
    setTasselliBoard(prev => { const next = [...prev]; next[index] = !next[index]; return next; });
    setTasselliMoves(m => m + 1);
    if (turningOn) playPlace(3); else playRemove(2);
  }
  function handleTasselliNext() { startTasselli(tasselliStreak + 1); }
  function handleTasselliRetry() { startTasselli(1); }
  function handleToggleMute() { updateSave({ muted: !save.muted }); }

  // menu button clicks: if that mode has a paused game, show the Continua/Nuova popup instead of
  // jumping straight in; otherwise just start a fresh puzzle like before
  function handleClickInfinite() {
    playClick();
    if (pausedBlockPuzzle) { setChoiceModal('infinite'); return; }
    startInfinite(1);
  }
  function handleClickIncastro() {
    playClick();
    if (pausedIncastro) { setChoiceModal('incastro'); return; }
    startIncastro(1);
  }
  function handleClickTasselli() {
    playClick();
    if (pausedTasselli) { setChoiceModal('tasselli'); return; }
    startTasselli(1);
  }

  return (
    <div className="cae-shell">
      <style>{STYLES}</style>
      {screen === 'menu' && (
        <>
          <MenuScreen save={save}
            pausedBlockPuzzle={pausedBlockPuzzle} pausedIncastro={pausedIncastro} pausedTasselli={pausedTasselli}
            onInfinite={handleClickInfinite}
            onIncastro={handleClickIncastro}
            onTasselli={handleClickTasselli}
            onHowTo={() => { playClick(); setScreen('howto'); }}
            onToggleMute={handleToggleMute} />
          {choiceModal === 'infinite' && pausedBlockPuzzle && (
            <ContinueChoiceOverlay title="Block Puzzle 3D" subtitle={`Puzzle ${pausedBlockPuzzle.infiniteNum} in corso`}
              onContinue={() => { setChoiceModal(null); handleContinueBlockPuzzle(); }}
              onNew={() => { setChoiceModal(null); startInfinite(1); }}
              onCancel={() => setChoiceModal(null)} />
          )}
          {choiceModal === 'incastro' && pausedIncastro && (
            <ContinueChoiceOverlay title="Incastro Perfetto" subtitle={`Puzzle ${pausedIncastro.streak} in corso`}
              onContinue={() => { setChoiceModal(null); handleContinueIncastro(); }}
              onNew={() => { setChoiceModal(null); startIncastro(1); }}
              onCancel={() => setChoiceModal(null)} />
          )}
          {choiceModal === 'tasselli' && pausedTasselli && (
            <ContinueChoiceOverlay title="Tasselli Ruotati" subtitle={`Puzzle ${pausedTasselli.streak} in corso`}
              onContinue={() => { setChoiceModal(null); handleContinueTasselli(); }}
              onNew={() => { setChoiceModal(null); startTasselli(1); }}
              onCancel={() => setChoiceModal(null)} />
          )}
        </>
      )}
      {screen === 'howto' && <HowToScreen onBack={() => setScreen('menu')} />}
      {screen === 'play' && levelData && playerHeights && (
        <PlayScreen
          levelData={levelData} playerHeights={playerHeights}
          mode={mode} setMode={setMode} onCellTap={handleCellTap} onUndo={handleUndo} onReset={handleReset}
          onBack={handlePauseBlockPuzzle}
          moveCount={moveCount} elapsed={elapsed} timeLeft={timeLeft} won={won} lost={lost} resumeCountdown={resumeCountdown} muted={save.muted} onToggleMute={handleToggleMute}
          onNext={handleNext} onRetry={handlePuzzleRetry}
        />
      )}
      {screen === 'incastro' && incastroTarget && incastroState && (
        <IncastroPlayScreen
          target={incastroTarget} incastroState={incastroState} markedSlot={incastroMarkedSlot} markedAxis={incastroMarkedAxis} moves={incastroMoves} elapsed={incastroElapsed} timeLeft={incastroTimeLeft}
          won={incastroWon} lost={incastroLost} resumeCountdown={resumeCountdown} onTurn={handleIncastroTurn} onBack={handlePauseIncastro} onNext={handleIncastroNext} onRetry={handleIncastroRetry}
          muted={save.muted} onToggleMute={handleToggleMute} streak={incastroStreak} best={save.incastroBest}
        />
      )}
      {screen === 'tasselli' && tasselliTarget && tasselliBoard && (
        <TasselliPlayScreen
          target={tasselliTarget} rotation={tasselliRotation} anchorIndex={tasselliAnchorIndex} board={tasselliBoard} moves={tasselliMoves} elapsed={tasselliElapsed} timeLeft={tasselliTimeLeft}
          won={tasselliWon} lost={tasselliLost} resumeCountdown={resumeCountdown} onTap={handleTasselliTap} onBack={handlePauseTasselli} onNext={handleTasselliNext} onRetry={handleTasselliRetry}
          muted={save.muted} onToggleMute={handleToggleMute} streak={tasselliStreak} best={save.tasselliBest}
        />
      )}
    </div>
  );
}
