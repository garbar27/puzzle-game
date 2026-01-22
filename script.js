/* =========================
   Puzzle Game (GitHub Pages)
   - Headbreaker + Konva
   - Upload image / demo image
   - Pieces count selector -> best grid
   - Jigsaw shapes + snapping (proximity)
   - Timer starts on first interaction
   - Stops on solved
   - Leaderboard (best per name) in localStorage
========================= */

const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const LS_KEYS = {
  puzzles: "pg_puzzles_v1",
  lastPuzzleId: "pg_lastPuzzleId_v1",
  leaderboardPrefix: "pg_leaderboard_v1_", // + puzzleId
  lastPlayerName: "pg_lastPlayerName_v1",
};

const ROUTES = ["create", "play", "mypuzzles"];

let currentImageDataUrl = "";     // chosen image
let currentPuzzleId = "";         // active puzzle id
let currentPuzzle = null;         // puzzle object from localStorage
let canvas = null;                // headbreaker.Canvas instance

// timer
let timerMs = 0;
let timerHandle = null;
let timerRunning = false;
let timerArmed = false; // start on first user action

/* ---------- helpers ---------- */

function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function readLS(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}
function writeLS(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function formatTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function setRoute(route) {
  if (!ROUTES.includes(route)) route = "create";
  location.hash = `#${route}`;
}

function applyRoute() {
  const r = (location.hash || "#create").replace("#", "");
  const route = ROUTES.includes(r) ? r : "create";

  ROUTES.forEach((name) => {
    const page = $(`#page-${name}`);
    if (page) page.classList.toggle("active", name === route);
  });
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.route === route));

  if (route === "mypuzzles") renderMyPuzzles();
  if (route === "play") {
    // if opened play without puzzle loaded — try restore last
    if (!currentPuzzleId) {
      const lastId = localStorage.getItem(LS_KEYS.lastPuzzleId) || "";
      if (lastId) {
        const pz = getPuzzleById(lastId);
        if (pz) {
          currentPuzzleId = lastId;
          currentPuzzle = pz;
          startPlayFromPuzzle(pz);
        }
      }
    }
  }
}

/* ---------- puzzles storage ---------- */

function getAllPuzzles() {
  return readLS(LS_KEYS.puzzles, []);
}
function saveAllPuzzles(list) {
  writeLS(LS_KEYS.puzzles, list);
}

function getPuzzleById(id) {
  return getAllPuzzles().find((p) => p.id === id) || null;
}

function upsertPuzzle(puzzle) {
  const list = getAllPuzzles();
  const idx = list.findIndex((p) => p.id === puzzle.id);
  if (idx >= 0) list[idx] = puzzle;
  else list.unshift(puzzle);
  saveAllPuzzles(list);
}

function puzzleShareLink(p) {
  // link-only uses token (still local-storage based, but this keeps UX consistent)
  const base = `${location.origin}${location.pathname}`;
  if (p.visibility === "link") return `${base}#play?pid=${encodeURIComponent(p.id)}&t=${encodeURIComponent(p.token)}`;
  return `${base}#play?pid=${encodeURIComponent(p.id)}`;
}

/* ---------- leaderboard ---------- */

function lbKey(puzzleId) {
  return `${LS_KEYS.leaderboardPrefix}${puzzleId}`;
}
function readLeaderboard(puzzleId) {
  return readLS(lbKey(puzzleId), {}); // {name: bestMs}
}
function writeLeaderboard(puzzleId, obj) {
  writeLS(lbKey(puzzleId), obj);
}
function renderLeaderboard(puzzleId) {
  const wrap = $("#leaderboard");
  if (!wrap) return;
  const lb = readLeaderboard(puzzleId);
  const rows = Object.entries(lb)
    .map(([name, ms]) => ({ name, ms }))
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 50);

  if (!rows.length) {
    wrap.innerHTML = `<div class="muted">Поки що немає результатів.</div>`;
    return;
  }

  wrap.innerHTML = rows
    .map(
      (r, i) => `
      <div class="lb-row">
        <div class="lb-name">${i + 1}. ${escapeHtml(r.name)}</div>
        <div class="lb-time">${formatTime(r.ms)}</div>
      </div>
    `
    )
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------- image loading ---------- */

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function loadDemoImage() {
  // demo is stored in repo: assets/demo.jpg
  const res = await fetch("./assets/demo.jpg");
  const blob = await res.blob();
  return await fileToDataUrl(blob);
}

function setPreview(dataUrl) {
  const img = $("#imgPreview");
  if (!img) return;
  if (!dataUrl) {
    img.style.display = "none";
    img.removeAttribute("src");
    return;
  }
  img.src = dataUrl;
  img.style.display = "block";
}

/* ---------- grid calculation (exact pieces) ---------- */

function bestGrid(totalPieces, aspect) {
  // Find factors (cols, rows) whose product == totalPieces
  // Closest to aspect ratio (w/h ~ cols/rows)
  const n = Number(totalPieces);
  const target = aspect > 0 ? aspect : 1;

  let best = null;

  for (let cols = 1; cols <= n; cols++) {
    if (n % cols !== 0) continue;
    const rows = n / cols;
    const ratio = cols / rows;
    const score = Math.abs(Math.log(ratio / target)); // symmetric
    if (!best || score < best.score) best = { cols, rows, score };
  }

  // fallback (shouldn’t happen for provided piece counts)
  if (!best) {
    const cols = Math.max(1, Math.round(Math.sqrt(n * target)));
    const rows = Math.max(1, Math.round(n / cols));
    return { cols, rows };
  }

  return { cols: best.cols, rows: best.rows };
}

/* ---------- Headbreaker puzzle rendering ---------- */

function clearCanvasHost() {
  const host = $("#puzzleHost");
  if (!host) return;

  // headbreaker inserts canvas / divs inside — safest clear everything
  host.innerHTML = "";
}

function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
  timerRunning = false;
}

function resetTimer() {
  stopTimer();
  timerMs = 0;
  timerArmed = true;
  timerRunning = false;
  $("#timerText").textContent = "00:00";
}

function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerArmed = false;
  const start = Date.now() - timerMs;
  timerHandle = setInterval(() => {
    timerMs = Date.now() - start;
    $("#timerText").textContent = formatTime(timerMs);
  }, 200);
}

function armTimerStartOnFirstInteraction() {
  const host = $("#puzzleHost");
  if (!host) return;

  const startOnce = () => {
    if (timerArmed) startTimer();
    host.removeEventListener("pointerdown", startOnce, true);
    host.removeEventListener("touchstart", startOnce, true);
    host.removeEventListener("mousedown", startOnce, true);
  };

  // capture so it triggers even if Konva consumes events
  host.addEventListener("pointerdown", startOnce, true);
  host.addEventListener("touchstart", startOnce, true);
  host.addEventListener("mousedown", startOnce, true);
}

function buildHeadbreakerPuzzle({ imageDataUrl, piecesCount }) {
  return new Promise((resolve) => {
    const host = $("#puzzleHost");
    if (!host) return;

    clearCanvasHost();

    // host size
    const W = Math.max(720, Math.min(980, host.clientWidth || 860));
    const H = Math.max(520, Math.min(720, host.clientHeight || 640));

    const img = new Image();
    img.onload = () => {
      const aspect = img.width / img.height;
      const { cols, rows } = bestGrid(piecesCount, aspect);

      // piece size to fit board nicely (we want puzzle board centered-ish, not tiny)
      const pieceSize = Math.floor(Math.min(W / cols, H / rows));
      const borderFill = Math.max(6, Math.floor(pieceSize * 0.12));

      canvas = new headbreaker.Canvas("puzzleHost", {
        width: W,
        height: H,
        image: img,

        // IMPORTANT for browser rendering:
        painter: new headbreaker.painters.Konva(),

        pieceSize: pieceSize,
        proximity: Math.max(18, Math.floor(pieceSize * 0.22)),

        borderFill: borderFill,
        strokeWidth: Math.max(1.5, Math.floor(pieceSize * 0.03)),
        strokeColor: "rgba(255,255,255,0.35)",
        lineSoftness: 0.18,

        // make it feel like a real puzzle table
        preventOffstageDrag: true,
      });

      // scale image to puzzle
      canvas.adjustImagesToPuzzleWidth();

      // generate jigsaw (TRUE jigsaw shapes)
      canvas.autogenerate({
        horizontalPiecesCount: cols,
        verticalPiecesCount: rows,
        insertsGenerator: headbreaker.generators.random,
      });

      // shuffle pieces around (like 2nd screenshot: scattered around)
      // shuffle(0.7) spreads random positions across the board
      canvas.shuffle(0.75);

      // solved detection:
      canvas.attachSolvedValidator();
      canvas.onValid(() => {
        // wait a moment to let last snap render
        setTimeout(() => {
          stopTimer();
          openWinModal(formatTime(timerMs));
        }, 250);
      });

      canvas.draw();

      // Timer starts when player first touches puzzle
      armTimerStartOnFirstInteraction();

      resolve({ cols, rows, pieceSize });
    };
    img.src = imageDataUrl;
  });
}

/* ---------- UI: Modals ---------- */

function openImageModal(dataUrl) {
  $("#modalImg").src = dataUrl;
  $("#imgModal").classList.add("show");
  $("#imgModal").setAttribute("aria-hidden", "false");
}
function closeImageModal() {
  $("#imgModal").classList.remove("show");
  $("#imgModal").setAttribute("aria-hidden", "true");
  $("#modalImg").removeAttribute("src");
}

function openWinModal(timeText) {
  $("#winTime").textContent = timeText;
  $("#winModal").classList.add("show");
  $("#winModal").setAttribute("aria-hidden", "false");

  const last = localStorage.getItem(LS_KEYS.lastPlayerName) || "";
  $("#playerName").value = last;
  $("#playerName").focus();
}
function closeWinModal() {
  $("#winModal").classList.remove("show");
  $("#winModal").setAttribute("aria-hidden", "true");
}

/* ---------- Create flow ---------- */

async function createPuzzleAndPlay() {
  const name = ($("#puzzleName").value || "").trim() || "Untitled";
  const visibility = $("#visibility").value;
  const piecesCount = Number($("#piecesCount").value);

  if (!currentImageDataUrl) {
    alert("Спочатку завантаж фото або натисни Use demo image.");
    return;
  }

  const puzzle = {
    id: uid(),
    name,
    visibility,
    token: uid().replaceAll("-", ""), // for link-only UX
    piecesCount,
    imageDataUrl: currentImageDataUrl,
    createdAt: Date.now(),
  };

  upsertPuzzle(puzzle);
  currentPuzzleId = puzzle.id;
  currentPuzzle = puzzle;
  localStorage.setItem(LS_KEYS.lastPuzzleId, puzzle.id);

  $("#shareLink").value = puzzleShareLink(puzzle);

  // go play
  setRoute("play");
  startPlayFromPuzzle(puzzle);
}

async function startPlayFromPuzzle(puzzle) {
  $("#playTitle").textContent = `Play • ${puzzle.name}`;
  renderLeaderboard(puzzle.id);

  resetTimer();
  await buildHeadbreakerPuzzle({
    imageDataUrl: puzzle.imageDataUrl,
    piecesCount: puzzle.piecesCount,
  });
}

/* ---------- My puzzles ---------- */

function renderMyPuzzles() {
  const list = $("#myPuzzlesList");
  if (!list) return;

  const puzzles = getAllPuzzles();
  if (!puzzles.length) {
    list.innerHTML = `<div class="muted">Поки що немає збережених пазлів. Створи перший у Create 🙂</div>`;
    return;
  }

  list.innerHTML = puzzles
    .map((p) => {
      const tag =
        p.visibility === "public" ? "Public" : p.visibility === "private" ? "Private" : "Link-only";
      return `
        <div class="list-item">
          <div>
            <div style="font-weight:900">${escapeHtml(p.name)}</div>
            <div class="muted small">${p.piecesCount} pieces • ${new Date(p.createdAt).toLocaleString()}</div>
          </div>
          <div class="item-actions">
            <span class="tag">${tag}</span>
            <button class="btn ghost" data-play="${p.id}">Play</button>
            <button class="btn ghost" data-copy="${p.id}">Copy link</button>
            <button class="btn ghost danger" data-del="${p.id}">Delete</button>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll("[data-play]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-play");
      const pz = getPuzzleById(id);
      if (!pz) return;
      currentPuzzleId = id;
      currentPuzzle = pz;
      localStorage.setItem(LS_KEYS.lastPuzzleId, id);
      setRoute("play");
      startPlayFromPuzzle(pz);
    });
  });

  list.querySelectorAll("[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-copy");
      const pz = getPuzzleById(id);
      if (!pz) return;
      const link = puzzleShareLink(pz);
      await navigator.clipboard.writeText(link);
      alert("Link copied!");
    });
  });

  list.querySelectorAll("[data-del]").forEach((b) => {
    b.addEventListener("click", () => {
      const id = b.getAttribute("data-del");
      const puzzles = getAllPuzzles().filter((x) => x.id !== id);
      saveAllPuzzles(puzzles);
      renderMyPuzzles();
    });
  });
}

/* ---------- Wire UI ---------- */

function initNav() {
  $$(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => setRoute(b.dataset.route));
  });
}

function initCreate() {
  const drop = $("#dropzone");
  const fileInput = $("#fileInput");

  // click opens file picker
  drop.addEventListener("click", () => fileInput.click());

  // drag & drop
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("dragover");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    currentImageDataUrl = await fileToDataUrl(file);
    setPreview(currentImageDataUrl);
  });

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    currentImageDataUrl = await fileToDataUrl(f);
    setPreview(currentImageDataUrl);
  });

  $("#useDemo").addEventListener("click", async () => {
    currentImageDataUrl = await loadDemoImage();
    setPreview(currentImageDataUrl);
  });

  $("#removeImage").addEventListener("click", () => {
    currentImageDataUrl = "";
    fileInput.value = "";
    setPreview("");
  });

  $("#cancelCreate").addEventListener("click", () => {
    $("#puzzleName").value = "";
    $("#visibility").value = "public";
    $("#piecesCount").value = "64";
    $("#shareLink").value = "";
  });

  $("#createAndPlay").addEventListener("click", createPuzzleAndPlay);

  $("#copyLink").addEventListener("click", async () => {
    const v = $("#shareLink").value;
    if (!v) return;
    await navigator.clipboard.writeText(v);
    alert("Link copied!");
  });
}

function initPlay() {
  $("#btnBack").addEventListener("click", () => setRoute("create"));

  $("#btnShuffle").addEventListener("click", () => {
    if (!canvas) return;
    // reshuffle pieces (keep board)
    canvas.shuffle(0.80);
    canvas.redraw();
    resetTimer();
    armTimerStartOnFirstInteraction();
  });

  $("#btnImage").addEventListener("click", () => {
    if (!currentPuzzle) return;
    openImageModal(currentPuzzle.imageDataUrl);
  });

  // image modal close
  $("#imgModal").addEventListener("click", (e) => {
    if (e.target && e.target.getAttribute("data-close") === "1") closeImageModal();
  });

  // win modal
  $("#winClose").addEventListener("click", closeWinModal);

  $("#playAgain").addEventListener("click", () => {
    closeWinModal();
    if (currentPuzzle) startPlayFromPuzzle(currentPuzzle);
  });

  $("#saveScore").addEventListener("click", () => {
    if (!currentPuzzleId) return;

    const name = ($("#playerName").value || "").trim() || "Player";
    localStorage.setItem(LS_KEYS.lastPlayerName, name);

    const lb = readLeaderboard(currentPuzzleId);
    const prev = lb[name];
    if (prev == null || timerMs < prev) {
      lb[name] = timerMs;
      writeLeaderboard(currentPuzzleId, lb);
    }

    renderLeaderboard(currentPuzzleId);
    closeWinModal();
  });
}

/* ---------- Deep link: #play?pid=...&t=... ---------- */

function parsePlayParams() {
  // Supports hash like: #play?pid=XXX&t=YYY
  const hash = location.hash || "";
  if (!hash.startsWith("#play")) return null;
  const qIndex = hash.indexOf("?");
  if (qIndex < 0) return { pid: null, token: null };

  const qs = hash.slice(qIndex + 1);
  const params = new URLSearchParams(qs);
  return {
    pid: params.get("pid"),
    token: params.get("t"),
  };
}

function handleDeepLink() {
  const params = parsePlayParams();
  if (!params) return;

  if (params.pid) {
    const pz = getPuzzleById(params.pid);
    if (!pz) return;

    // if link-only, check token
    if (pz.visibility === "link" && params.token && params.token !== pz.token) {
      alert("Невірний токен для Link-only пазла (локальне збереження).");
      return;
    }

    currentPuzzleId = pz.id;
    currentPuzzle = pz;
    localStorage.setItem(LS_KEYS.lastPuzzleId, pz.id);

    // clean title
    $("#shareLink").value = puzzleShareLink(pz);

    setRoute("play");
    startPlayFromPuzzle(pz);
  }
}

/* ---------- boot ---------- */

window.addEventListener("hashchange", () => {
  applyRoute();
  handleDeepLink();
});

document.addEventListener("DOMContentLoaded", async () => {
  initNav();
  initCreate();
  initPlay();

  // default preview = none
  setPreview("");

  // route init
  applyRoute();
  handleDeepLink();
});

