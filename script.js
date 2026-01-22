const $ = (q) => document.querySelector(q);
const $$ = (q) => document.querySelectorAll(q);

const LS_KEYS = {
  puzzles: "pg_puzzles_v1",
  lastPuzzleId: "pg_lastPuzzleId_v1",
  leaderboardPrefix: "pg_leaderboard_v1_",
  lastPlayerName: "pg_lastPlayerName_v1",
};

let currentImageDataUrl = "";
let currentPuzzleId = "";
let currentPuzzle = null;
let canvas = null;

let timerMs = 0;
let timerHandle = null;
let timerRunning = false;
let timerArmed = true;

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

function setPreview(dataUrl) {
  const img = $("#imgPreview");
  if (!dataUrl) {
    img.style.display = "none";
    img.removeAttribute("src");
    return;
  }
  img.src = dataUrl;
  img.style.display = "block";
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function loadDemoImage() {
  // ВАЖЛИВО: в тебе є puzzle.jpg в корені репо
  const res = await fetch("./puzzle.jpg", { cache: "no-store" });
  const blob = await res.blob();
  return await fileToDataUrl(blob);
}

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
  const base = `${location.origin}${location.pathname}`;
  if (p.visibility === "link") return `${base}#play?pid=${encodeURIComponent(p.id)}&t=${encodeURIComponent(p.token)}`;
  return `${base}#play?pid=${encodeURIComponent(p.id)}`;
}

function lbKey(puzzleId) {
  return `${LS_KEYS.leaderboardPrefix}${puzzleId}`;
}
function readLeaderboard(puzzleId) {
  return readLS(lbKey(puzzleId), {});
}
function writeLeaderboard(puzzleId, obj) {
  writeLS(lbKey(puzzleId), obj);
}

function renderLeaderboard(puzzleId) {
  const wrap = $("#leaderboard");
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

function clearCanvasHost() {
  const host = $("#puzzleHost");
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
  const startOnce = () => {
    if (timerArmed) startTimer();
    host.removeEventListener("pointerdown", startOnce, true);
    host.removeEventListener("mousedown", startOnce, true);
    host.removeEventListener("touchstart", startOnce, true);
  };
  host.addEventListener("pointerdown", startOnce, true);
  host.addEventListener("mousedown", startOnce, true);
  host.addEventListener("touchstart", startOnce, true);
}

function bestGrid(totalPieces, aspect) {
  const n = Number(totalPieces);
  const target = aspect > 0 ? aspect : 1;
  let best = null;

  for (let cols = 1; cols <= n; cols++) {
    if (n % cols !== 0) continue;
    const rows = n / cols;
    const ratio = cols / rows;
    const score = Math.abs(Math.log(ratio / target));
    if (!best || score < best.score) best = { cols, rows, score };
  }
  return { cols: best.cols, rows: best.rows };
}

function openImageModal(dataUrl) {
  $("#modalImg").src = dataUrl;
  $("#imgModal").classList.add("show");
}
function closeImageModal() {
  $("#imgModal").classList.remove("show");
  $("#modalImg").removeAttribute("src");
}

function openWinModal(timeText) {
  $("#winTime").textContent = timeText;
  $("#winModal").classList.add("show");
  const last = localStorage.getItem(LS_KEYS.lastPlayerName) || "";
  $("#playerName").value = last;
  $("#playerName").focus();
}
function closeWinModal() {
  $("#winModal").classList.remove("show");
}

async function buildPuzzle({ imageDataUrl, piecesCount }) {
  const host = $("#puzzleHost");
  clearCanvasHost();

  const W = Math.max(720, Math.min(980, host.clientWidth || 860));
  const H = Math.max(520, Math.min(720, host.clientHeight || 640));

  const img = new Image();
  img.onload = () => {
    const aspect = img.width / img.height;
    const { cols, rows } = bestGrid(piecesCount, aspect);
    const pieceSize = Math.floor(Math.min(W / cols, H / rows));
    const borderFill = Math.max(6, Math.floor(pieceSize * 0.12));

    canvas = new headbreaker.Canvas("puzzleHost", {
      width: W,
      height: H,
      image: img,
      painter: new headbreaker.painters.Konva(),
      pieceSize: pieceSize,
      proximity: Math.max(18, Math.floor(pieceSize * 0.22)),
      borderFill: borderFill,
      strokeWidth: Math.max(1.5, Math.floor(pieceSize * 0.03)),
      strokeColor: "rgba(255,255,255,0.35)",
      lineSoftness: 0.18,
      preventOffstageDrag: true,
    });

    canvas.adjustImagesToPuzzleWidth();
    canvas.autogenerate({
      horizontalPiecesCount: cols,
      verticalPiecesCount: rows,
      insertsGenerator: headbreaker.generators.random,
    });

    canvas.shuffle(0.75);
    canvas.attachSolvedValidator();
    canvas.onValid(() => {
      setTimeout(() => {
        stopTimer();
        openWinModal(formatTime(timerMs));
      }, 250);
    });

    canvas.draw();
    armTimerStartOnFirstInteraction();
  };
  img.src = imageDataUrl;
}

async function startPlayFromPuzzle(puzzle) {
  $("#playTitle").textContent = `Play • ${puzzle.name}`;
  renderLeaderboard(puzzle.id);
  resetTimer();
  await buildPuzzle({ imageDataUrl: puzzle.imageDataUrl, piecesCount: puzzle.piecesCount });
}

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
    token: uid().replaceAll("-", ""),
    piecesCount,
    imageDataUrl: currentImageDataUrl,
    createdAt: Date.now(),
  };

  upsertPuzzle(puzzle);
  currentPuzzleId = puzzle.id;
  currentPuzzle = puzzle;
  localStorage.setItem(LS_KEYS.lastPuzzleId, puzzle.id);

  $("#shareLink").value = puzzleShareLink(puzzle);

  // switch to play
  showPage("play");
  await startPlayFromPuzzle(puzzle);
}

function showPage(route) {
  const pages = ["create", "play", "mypuzzles"];
  pages.forEach((r) => $(`#page-${r}`).classList.toggle("active", r === route));
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.route === route));
}

function initNav() {
  $$(".nav-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const r = b.dataset.route;
      showPage(r);
      if (r === "mypuzzles") renderMyPuzzles();
    });
  });
}

function renderMyPuzzles() {
  const list = $("#myPuzzlesList");
  const puzzles = getAllPuzzles();

  if (!puzzles.length) {
    list.innerHTML = `<div class="muted">Поки що немає збережених пазлів.</div>`;
    return;
  }

  list.innerHTML = puzzles
    .map((p) => {
      const tag = p.visibility === "public" ? "Public" : p.visibility === "private" ? "Private" : "Link-only";
      return `
        <div class="list-item" style="display:flex;justify-content:space-between;gap:12px;padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);">
          <div>
            <div style="font-weight:900">${escapeHtml(p.name)}</div>
            <div class="muted small">${p.piecesCount} pieces • ${new Date(p.createdAt).toLocaleString()}</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <span style="padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);color:var(--muted);font-weight:800;font-size:.82rem;">${tag}</span>
            <button class="btn ghost" data-play="${p.id}">Play</button>
          </div>
        </div>
      `;
    })
    .join("");

  list.querySelectorAll("[data-play]").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-play");
      const pz = getPuzzleById(id);
      if (!pz) return;
      currentPuzzleId = id;
      currentPuzzle = pz;
      localStorage.setItem(LS_KEYS.lastPuzzleId, id);
      showPage("play");
      await startPlayFromPuzzle(pz);
    });
  });
}

function initCreate() {
  const drop = $("#dropzone");
  const fileInput = $("#fileInput");

  drop.addEventListener("click", () => fileInput.click());

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
  $("#btnBack").addEventListener("click", () => showPage("create"));

  $("#btnShuffle").addEventListener("click", () => {
    if (!canvas) return;
    canvas.shuffle(0.80);
    canvas.redraw();
    resetTimer();
    armTimerStartOnFirstInteraction();
  });

  $("#btnImage").addEventListener("click", () => {
    if (!currentPuzzle) return;
    openImageModal(currentPuzzle.imageDataUrl);
  });

  $("#imgModal").addEventListener("click", (e) => {
    if (e.target && e.target.getAttribute("data-close") === "1") closeImageModal();
  });

  $("#winClose").addEventListener("click", closeWinModal);

  $("#playAgain").addEventListener("click", async () => {
    closeWinModal();
    if (currentPuzzle) await startPlayFromPuzzle(currentPuzzle);
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

document.addEventListener("DOMContentLoaded", () => {
  // якщо JS не підключився — нічого не буде. Але тепер підключення правильне.
  initNav();
  initCreate();
  initPlay();
  setPreview("");
});
