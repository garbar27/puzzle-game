/* Puzzle Game (static, GitHub Pages friendly)
   - Upload image (FileReader)
   - Create puzzle (name + visibility + piece count + shape)
   - Play puzzle with timer
   - Leaderboard per puzzle (best time per player), stored in localStorage
   - “Image” button shows reference image in modal
*/

const PIECE_OPTIONS = [10,20,32,48,64,72,90,100,120,140,164,180,200];

const LS_KEYS = {
  puzzles: "pg_puzzles_v1",
  scores: "pg_scores_v1",
  lastPuzzleId: "pg_last_puzzle_id_v1"
};

const tabs = {
  create: document.getElementById("tab-create"),
  play: document.getElementById("tab-play"),
  puzzles: document.getElementById("tab-puzzles"),
};

const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));

function setTab(name){
  for (const k of Object.keys(tabs)) tabs[k].classList.toggle("hidden", k !== name);
  tabButtons.forEach(b => b.classList.toggle("is-active", b.dataset.tab === name));
  if (name === "puzzles") renderPuzzlesList();
}

tabButtons.forEach(btn => btn.addEventListener("click", () => setTab(btn.dataset.tab)));

/* ---------- Create form elements ---------- */
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const createPreview = document.getElementById("createPreview");
const previewPlaceholder = document.getElementById("previewPlaceholder");

const puzzleNameEl = document.getElementById("puzzleName");
const visibilityEl = document.getElementById("visibility");
const piecesCountEl = document.getElementById("piecesCount");

const btnClearImage = document.getElementById("btnClearImage");
const btnUseDefault = document.getElementById("btnUseDefault");
const btnCancelCreate = document.getElementById("btnCancelCreate");
const btnCreatePuzzle = document.getElementById("btnCreatePuzzle");

const shareRow = document.getElementById("shareRow");
const shareLink = document.getElementById("shareLink");
const btnCopyLink = document.getElementById("btnCopyLink");

/* ---------- Play elements ---------- */
const playTitle = document.getElementById("playTitle");
const playMeta = document.getElementById("playMeta");
const timerEl = document.getElementById("timer");
const boardEl = document.getElementById("board");
const piecesEl = document.getElementById("pieces");
const btnShowImage = document.getElementById("btnShowImage");
const btnShuffle = document.getElementById("btnShuffle");
const btnBackToCreate = document.getElementById("btnBackToCreate");
const leaderboardEl = document.getElementById("leaderboard");

/* ---------- My puzzles elements ---------- */
const puzzlesListEl = document.getElementById("puzzlesList");
const filterVisibilityEl = document.getElementById("filterVisibility");
const btnGoCreate = document.getElementById("btnGoCreate");

/* ---------- Modals ---------- */
const imageModal = document.getElementById("imageModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const btnCloseModal = document.getElementById("btnCloseModal");
const modalImage = document.getElementById("modalImage");

const winModal = document.getElementById("winModal");
const winBackdrop = document.getElementById("winBackdrop");
const btnCloseWin = document.getElementById("btnCloseWin");
const winTimeEl = document.getElementById("winTime");
const playerNameEl = document.getElementById("playerName");
const btnSaveScore = document.getElementById("btnSaveScore");
const btnPlayAgain = document.getElementById("btnPlayAgain");

/* ---------- State ---------- */
let createImageDataUrl = ""; // uploaded or demo
let currentPuzzle = null;    // puzzle object
let dragPiece = null;

let timer = {
  running: false,
  startMs: 0,
  elapsedMs: 0,
  tickId: null
};

/* ---------- Utilities ---------- */
function loadJson(key, fallback){
  try{ return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch{ return fallback; }
}
function saveJson(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function formatTime(ms){
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
}

function openModal(modal){
  document.body.classList.add("modal-open");
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal){
  document.body.classList.remove("modal-open");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function getSelectedShape(){
  const el = document.querySelector('input[name="shape"]:checked');
  return el ? el.value : "square";
}

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
}

/* Choose rows/cols for exact N pieces, using image aspect ratio if available */
function chooseGrid(n, aspect){
  // aspect = width/height
  const targetCols = Math.max(2, Math.round(Math.sqrt(n * (aspect || 1))));
  let cols = targetCols;
  let rows = Math.ceil(n / cols);

  // Adjust to make rows*cols == n by finding a factor pair close to aspect
  // Try factor pairs first (exact)
  let best = { rows, cols, score: Infinity };
  for (let c = 2; c <= n; c++){
    if (n % c !== 0) continue;
    const r = n / c;
    const ratio = c / r;
    const score = Math.abs(ratio - (aspect || 1)) + Math.abs(c - targetCols) * 0.01;
    if (score < best.score) best = { rows: r, cols: c, score };
  }
  if (best.score !== Infinity) return { rows: best.rows, cols: best.cols };

  // If n is prime-ish, fall back to "rows*cols >= n" exact count by leaving empty? We don't want empties.
  // So for non-factorable with 2+, we allow non-square by using rows*cols = n exactly (always possible):
  // rows = 1, cols = n (but ugly). We'll search for rows where cols becomes integer via n/rows:
  // that's factor again. If none, we'll just use 1 x n.
  return { rows: 1, cols: n };
}

/* Demo image as fallback (small inline SVG to avoid external deps) */
function setDemoImage(){
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop stop-color="#1b1333" offset="0"/>
        <stop stop-color="#b58cff" offset="0.6"/>
        <stop stop-color="#7de2ff" offset="1"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="1200" fill="url(#g)"/>
    <circle cx="380" cy="360" r="220" fill="rgba(255,255,255,0.18)"/>
    <circle cx="820" cy="760" r="260" fill="rgba(0,0,0,0.18)"/>
    <text x="80" y="1120" fill="rgba(255,255,255,0.88)" font-size="88" font-family="Arial" font-weight="800">
      Demo Puzzle
    </text>
  </svg>`;
  createImageDataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  updateCreatePreview();
}

function updateCreatePreview(){
  if (createImageDataUrl){
    createPreview.src = createImageDataUrl;
    createPreview.style.display = "block";
    previewPlaceholder.style.display = "none";
  } else {
    createPreview.removeAttribute("src");
    createPreview.style.display = "none";
    previewPlaceholder.style.display = "grid";
  }
}

/* ---------- Init create form ---------- */
(function initCreate(){
  PIECE_OPTIONS.forEach(n => {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = String(n);
    piecesCountEl.appendChild(opt);
  });
  piecesCountEl.value = "64";

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
  });

  btnClearImage.addEventListener("click", () => {
    createImageDataUrl = "";
    fileInput.value = "";
    updateCreatePreview();
  });

  btnUseDefault.addEventListener("click", () => {
    setDemoImage();
  });

  btnCancelCreate.addEventListener("click", () => {
    puzzleNameEl.value = "";
    visibilityEl.value = "public";
    piecesCountEl.value = "64";
    document.querySelector('input[name="shape"][value="square"]').checked = true;
    shareRow.style.display = "none";
  });

  btnCopyLink.addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(shareLink.value);
      btnCopyLink.textContent = "Copied!";
      setTimeout(() => btnCopyLink.textContent = "Copy", 900);
    } catch {
      alert("Не вдалося скопіювати. Скопіюй вручну з поля.");
    }
  });

  btnCreatePuzzle.addEventListener("click", createPuzzle);
})();

async function handleFile(file){
  if (!file.type.startsWith("image/")){
    alert("Будь ласка, завантаж зображення (PNG/JPG/WebP).");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    createImageDataUrl = reader.result;
    updateCreatePreview();
  };
  reader.readAsDataURL(file);
}

/* ---------- Puzzles storage ---------- */
function getAllPuzzles(){
  return loadJson(LS_KEYS.puzzles, []);
}
function saveAllPuzzles(list){
  saveJson(LS_KEYS.puzzles, list);
}
function upsertPuzzle(p){
  const list = getAllPuzzles();
  const idx = list.findIndex(x => x.id === p.id);
  if (idx >= 0) list[idx] = p;
  else list.unshift(p);
  saveAllPuzzles(list);
}

function deletePuzzle(id){
  const list = getAllPuzzles().filter(p => p.id !== id);
  saveAllPuzzles(list);
}

/* ---------- Create puzzle ---------- */
async function createPuzzle(){
  if (!createImageDataUrl){
    alert("Спочатку завантаж фото (або натисни Use demo image).");
    return;
  }

  const name = (puzzleNameEl.value || "Untitled").trim();
  const visibility = visibilityEl.value;
  const piecesCount = Number(piecesCountEl.value);
  const shape = getSelectedShape();

  // build id: based on image + settings (best-effort stable)
  const fingerprint = JSON.stringify({ img: createImageDataUrl.slice(0, 5000), piecesCount, shape, name });
  const id = await sha256(fingerprint);

  // get image aspect
  const imgInfo = await loadImageInfo(createImageDataUrl);

  const puzzle = {
    id,
    name,
    visibility,
    piecesCount,
    shape,
    imageDataUrl: createImageDataUrl,
    createdAt: Date.now(),
    imgW: imgInfo.w,
    imgH: imgInfo.h
  };

  upsertPuzzle(puzzle);
  localStorage.setItem(LS_KEYS.lastPuzzleId, id);

  // share link (works as an "ID link" inside this app)
  const url = new URL(location.href);
  url.hash = `#puzzle=${encodeURIComponent(id)}`;
  shareLink.value = url.toString();
  shareRow.style.display = "flex";

  // Auto go to play
  await startPuzzleById(id);
  setTab("play");
}

/* ---------- Load image info ---------- */
function loadImageInfo(dataUrl){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/* ---------- Play / Puzzle engine ---------- */
function resetTimer(){
  timer.running = false;
  timer.startMs = 0;
  timer.elapsedMs = 0;
  if (timer.tickId) clearInterval(timer.tickId);
  timer.tickId = null;
  timerEl.textContent = "00:00";
}
function startTimer(){
  if (timer.running) return;
  timer.running = true;
  timer.startMs = performance.now();
  timer.tickId = setInterval(() => {
    const now = performance.now();
    timer.elapsedMs = now - timer.startMs;
    timerEl.textContent = formatTime(timer.elapsedMs);
  }, 200);
}
function stopTimer(){
  if (!timer.running) return;
  timer.running = false;
  if (timer.tickId) clearInterval(timer.tickId);
  timer.tickId = null;
}

function clearBoard(){
  boardEl.innerHTML = "";
  piecesEl.innerHTML = "";
  dragPiece = null;
}

function setBoardGrid(rows, cols){
  boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  boardEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

  piecesEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  piecesEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
}

function buildPuzzleDOM(puzzle){
  clearBoard();
  resetTimer();

  const { piecesCount, shape, imageDataUrl } = puzzle;

  const aspect = (puzzle.imgW && puzzle.imgH) ? (puzzle.imgW / puzzle.imgH) : 1;
  const { rows, cols } = chooseGrid(piecesCount, aspect);

  puzzle._grid = { rows, cols };

  setBoardGrid(rows, cols);

  // set reference image for modal
  modalImage.src = imageDataUrl;

  // Create slots
  for (let i = 0; i < piecesCount; i++){
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.idx = String(i);

    slot.addEventListener("dragover", (e) => e.preventDefault());
    slot.addEventListener("drop", () => {
      if (!dragPiece) return;
      // prevent replacing
      if (slot.firstChild) return;
      slot.appendChild(dragPiece);
      startTimer();
      checkComplete();
    });

    boardEl.appendChild(slot);
  }

  // Create pieces
  const pieces = [];
  for (let i = 0; i < piecesCount; i++){
    const piece = document.createElement("div");
    piece.className = "piece";
    if (shape === "rounded") piece.classList.add("rounded");
    if (shape === "soft") piece.classList.add("soft");

    piece.draggable = true;
    piece.dataset.idx = String(i);

    // Background slicing
    const x = i % cols;
    const y = Math.floor(i / cols);

    piece.style.backgroundImage = `url("${imageDataUrl}")`;
    piece.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    piece.style.backgroundPosition = `${(x / (cols - 1 || 1)) * 100}% ${(y / (rows - 1 || 1)) * 100}%`;

    piece.addEventListener("dragstart", () => {
      dragPiece = piece;
      startTimer();
    });

    // allow drop back into pieces area (so user can undo)
    piece.addEventListener("dragend", () => { /* no-op */ });

    pieces.push(piece);
  }

  shuffleArray(pieces).forEach(p => piecesEl.appendChild(p));

  playTitle.textContent = puzzle.name;
  playMeta.textContent = `${puzzle.piecesCount} pieces • ${puzzle.visibility} • ${rows}×${cols}`;
  renderLeaderboard(puzzle.id);
}

function shuffleArray(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function checkComplete(){
  const slots = Array.from(boardEl.querySelectorAll(".slot"));
  if (slots.length === 0) return;

  // must be all filled
  for (const slot of slots){
    if (!slot.firstChild) return;
  }

  // must match indices
  for (const slot of slots){
    const want = slot.dataset.idx;
    const got = slot.firstChild?.dataset?.idx;
    if (want !== got) return;
  }

  // Completed
  stopTimer();
  const finalMs = timer.elapsedMs || (performance.now() - timer.startMs);
  const t = formatTime(finalMs);
  winTimeEl.textContent = t;
  playerNameEl.value = loadJson("pg_player_name_v1", "Player");
  openModal(winModal);

  // Store "pending"
  winModal.dataset.ms = String(finalMs);
}

btnShuffle.addEventListener("click", () => {
  if (!currentPuzzle) return;

  // Collect all pieces from board back to pool then shuffle
  const allPieces = Array.from(document.querySelectorAll(".piece"));
  allPieces.forEach(p => piecesEl.appendChild(p));
  const list = Array.from(piecesEl.children);
  piecesEl.innerHTML = "";
  shuffleArray(list).forEach(p => piecesEl.appendChild(p));

  resetTimer();
});

btnShowImage.addEventListener("click", () => {
  if (!currentPuzzle) return;
  modalImage.src = currentPuzzle.imageDataUrl;
  openModal(imageModal);
});

btnBackToCreate.addEventListener("click", () => {
  setTab("create");
});

modalBackdrop.addEventListener("click", () => closeModal(imageModal));
btnCloseModal.addEventListener("click", () => closeModal(imageModal));

winBackdrop.addEventListener("click", () => closeModal(winModal));
btnCloseWin.addEventListener("click", () => closeModal(winModal));

btnPlayAgain.addEventListener("click", async () => {
  closeModal(winModal);
  if (!currentPuzzle) return;
  await startPuzzleById(currentPuzzle.id);
});

btnSaveScore.addEventListener("click", () => {
  if (!currentPuzzle) return;
  const ms = Number(winModal.dataset.ms || "0");
  const name = (playerNameEl.value || "Player").trim().slice(0, 30);

  saveJson("pg_player_name_v1", name);

  saveBestScore(currentPuzzle.id, name, ms);
  renderLeaderboard(currentPuzzle.id);
  closeModal(winModal);
});

/* ---------- Leaderboard (localStorage) ---------- */
/*
  scores structure:
  {
    [puzzleId]: {
      [playerName]: bestMs
    }
  }
*/
function getScores(){
  return loadJson(LS_KEYS.scores, {});
}
function saveScores(obj){
  saveJson(LS_KEYS.scores, obj);
}

function saveBestScore(puzzleId, playerName, ms){
  const scores = getScores();
  scores[puzzleId] = scores[puzzleId] || {};
  const prev = scores[puzzleId][playerName];
  if (typeof prev !== "number" || ms < prev){
    scores[puzzleId][playerName] = ms;
    saveScores(scores);
  }
}

function renderLeaderboard(puzzleId){
  const scores = getScores();
  const map = scores[puzzleId] || {};
  const entries = Object.entries(map)
    .map(([name, ms]) => ({ name, ms }))
    .sort((a,b) => a.ms - b.ms)
    .slice(0, 15);

  leaderboardEl.innerHTML = "";
  if (entries.length === 0){
    leaderboardEl.innerHTML = `<div class="muted">Поки що немає результатів. Будь першим 🧩</div>`;
    return;
  }

  entries.forEach((e, idx) => {
    const row = document.createElement("div");
    row.className = "lb-row";
    row.innerHTML = `
      <div class="lb-name">${idx+1}. ${escapeHtml(e.name)}</div>
      <div class="lb-time">${formatTime(e.ms)}</div>
    `;
    leaderboardEl.appendChild(row);
  });
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

/* ---------- My puzzles list ---------- */
filterVisibilityEl.addEventListener("change", renderPuzzlesList);
btnGoCreate.addEventListener("click", () => setTab("create"));

function renderPuzzlesList(){
  const list = getAllPuzzles();
  const f = filterVisibilityEl.value;

  const filtered = (f === "all") ? list : list.filter(p => p.visibility === f);

  puzzlesListEl.innerHTML = "";
  if (filtered.length === 0){
    puzzlesListEl.innerHTML = `<div class="muted">Немає пазлів. Створи перший у вкладці Create.</div>`;
    return;
  }

  filtered.forEach(p => {
    const item = document.createElement("div");
    item.className = "puzzle-item";

    const thumb = document.createElement("div");
    thumb.className = "puzzle-thumb";
    const img = document.createElement("img");
    img.src = p.imageDataUrl;
    img.alt = p.name;
    thumb.appendChild(img);

    const info = document.createElement("div");
    info.className = "puzzle-info";
    info.innerHTML = `
      <div class="puzzle-title">${escapeHtml(p.name)}</div>
      <div class="puzzle-sub">${p.piecesCount} pieces • ${p.visibility}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "puzzle-actions";

    const btnPlay = document.createElement("button");
    btnPlay.className = "btn primary";
    btnPlay.textContent = "Play";
    btnPlay.addEventListener("click", async () => {
      await startPuzzleById(p.id);
      setTab("play");
    });

    const btnLink = document.createElement("button");
    btnLink.className = "btn";
    btnLink.textContent = "Link";
    btnLink.addEventListener("click", async () => {
      const url = new URL(location.href);
      url.hash = `#puzzle=${encodeURIComponent(p.id)}`;
      try{
        await navigator.clipboard.writeText(url.toString());
        btnLink.textContent = "Copied!";
        setTimeout(() => btnLink.textContent = "Link", 900);
      } catch {
        alert("Скопіюй вручну: " + url.toString());
      }
    });

    const btnDel = document.createElement("button");
    btnDel.className = "btn ghost";
    btnDel.textContent = "Delete";
    btnDel.addEventListener("click", () => {
      if (!confirm(`Видалити "${p.name}"?`)) return;
      deletePuzzle(p.id);
      renderPuzzlesList();
    });

    actions.appendChild(btnPlay);
    actions.appendChild(btnLink);
    actions.appendChild(btnDel);

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(actions);

    puzzlesListEl.appendChild(item);
  });
}

/* ---------- Start puzzle by id ---------- */
async function startPuzzleById(id){
  const list = getAllPuzzles();
  const p = list.find(x => x.id === id);
  if (!p){
    alert("Пазл не знайдено на цьому пристрої. Якщо це link-only/private — він зберігається локально.");
    setTab("puzzles");
    return;
  }
  currentPuzzle = p;
  buildPuzzleDOM(currentPuzzle);
}

/* ---------- Router from hash (#puzzle=ID) ---------- */
function readHashPuzzleId(){
  const m = location.hash.match(/puzzle=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

window.addEventListener("hashchange", async () => {
  const id = readHashPuzzleId();
  if (id){
    await startPuzzleById(id);
    setTab("play");
  }
});

(function boot(){
  // default demo if no image picked
  updateCreatePreview();

  const fromHash = readHashPuzzleId();
  if (fromHash){
    startPuzzleById(fromHash).then(() => setTab("play"));
    return;
  }

  // If there is a last puzzle, open play tab (optional). We'll keep user on Create by default.
  const list = getAllPuzzles();
  if (list.length > 0){
    // keep on create, but allow My Puzzles
  }

  setTab("create");
})();
