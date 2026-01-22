/* Puzzle Game (GitHub Pages / no backend)
 * - Create: upload image, name, visibility, pieces
 * - Play: real jigsaw pieces via Headbreaker (snap/proximity), timer
 * - Leaderboard: best per player name (localStorage)
 * - Link-only: hidden unless URL contains token
 *
 * Uses: https://flbulgarelli.github.io/headbreaker/js/headbreaker.js
 */

const LS_PUZZLES = "puzzle_game_puzzles_v1";
const LS_LB_PREFIX = "puzzle_game_lb_v1_";

const PIECES_ALLOWED = [10,20,32,48,64,72,90,100,120,140,164,180,200];

let state = {
  currentView: "create",
  createImageDataUrl: "",
  currentPuzzleId: "",
  currentToken: "",
  timer: { started:false, t0:0, raf:0, elapsedMs:0 },
  canvas: null, // headbreaker.Canvas
};

const $ = (id) => document.getElementById(id);

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }

function setView(view){
  state.currentView = view;

  qsa(".navBtn").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  ["create","play","mypuzzles"].forEach(v=>{
    const el = $(`view-${v}`);
    if (!el) return;
    el.classList.toggle("hidden", v !== view);
  });

  // reflect in URL (hash)
  const url = new URL(location.href);
  url.hash = `view=${encodeURIComponent(view)}${state.currentPuzzleId ? `&id=${encodeURIComponent(state.currentPuzzleId)}` : ""}${state.currentToken ? `&token=${encodeURIComponent(state.currentToken)}` : ""}`;
  history.replaceState(null, "", url);

  if (view === "mypuzzles") renderMyPuzzles();
}

function parseHash(){
  const h = (location.hash || "").replace(/^#/, "");
  const p = new URLSearchParams(h);
  const view = p.get("view");
  const id = p.get("id");
  const token = p.get("token");
  return { view, id, token };
}

function uid(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function token(){
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function loadPuzzles(){
  try{
    return JSON.parse(localStorage.getItem(LS_PUZZLES) || "[]");
  }catch{
    return [];
  }
}
function savePuzzles(list){
  localStorage.setItem(LS_PUZZLES, JSON.stringify(list));
}

function getPuzzle(id){
  return loadPuzzles().find(p => p.id === id);
}

function setShareLink(url){
  $("shareLink").value = url;
  $("shareBox").classList.add("active");
}

function clearShareLink(){
  $("shareLink").value = "";
  $("shareBox").classList.remove("active");
}

function formatTime(ms){
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  const ss = s % 60;
  return `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}

function resetTimer(){
  cancelAnimationFrame(state.timer.raf);
  state.timer = { started:false, t0:0, raf:0, elapsedMs:0 };
  $("timerText").textContent = "00:00";
}
function startTimer(){
  if (state.timer.started) return;
  state.timer.started = true;
  state.timer.t0 = performance.now();
  const tick = () => {
    state.timer.elapsedMs = performance.now() - state.timer.t0;
    $("timerText").textContent = formatTime(state.timer.elapsedMs);
    state.timer.raf = requestAnimationFrame(tick);
  };
  state.timer.raf = requestAnimationFrame(tick);
}
function stopTimer(){
  if (!state.timer.started) return;
  cancelAnimationFrame(state.timer.raf);
}

function pickBestGridForN(n, imgAspect){
  // choose (cols,rows) such that cols*rows = n and cols/rows close to image aspect
  // fall back to nearest sqrt layout
  let best = null;
  for (let cols=1; cols<=n; cols++){
    if (n % cols !== 0) continue;
    const rows = n / cols;
    const ratio = cols / rows;
    const score = Math.abs(ratio - imgAspect);
    if (!best || score < best.score){
      best = { cols, rows, score };
    }
  }
  if (best) return { cols: best.cols, rows: best.rows };

  const cols = Math.max(1, Math.round(Math.sqrt(n * imgAspect)));
  const rows = Math.max(1, Math.round(n / cols));
  return { cols, rows };
}

function makeDemoImageDataUrl(){
  // generate a nice purple-ish demo image (no external assets)
  const c = document.createElement("canvas");
  c.width = 900; c.height = 600;
  const g = c.getContext("2d");

  const bg = g.createLinearGradient(0,0,900,600);
  bg.addColorStop(0, "#2b1458");
  bg.addColorStop(0.5, "#101032");
  bg.addColorStop(1, "#1a2f5a");
  g.fillStyle = bg;
  g.fillRect(0,0,c.width,c.height);

  // stars
  for(let i=0;i<180;i++){
    const x=Math.random()*c.width, y=Math.random()*c.height;
    const r=Math.random()*1.6+0.2;
    g.fillStyle = `rgba(255,255,255,${Math.random()*0.8})`;
    g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
  }

  // orb
  const cx=680, cy=340;
  const orb = g.createRadialGradient(cx,cy,10,cx,cy,180);
  orb.addColorStop(0,"rgba(168,117,255,.95)");
  orb.addColorStop(0.45,"rgba(120,70,255,.35)");
  orb.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle=orb;
  g.beginPath(); g.arc(cx,cy,200,0,Math.PI*2); g.fill();

  g.fillStyle="rgba(255,255,255,.9)";
  g.font="bold 62px system-ui, sans-serif";
  g.fillText("Magic Puzzle", 70, 110);

  g.fillStyle="rgba(242,241,255,.75)";
  g.font="24px system-ui, sans-serif";
  g.fillText("Upload your own image • choose pieces • beat the timer", 70, 155);

  return c.toDataURL("image/png");
}

async function fileToDataUrl(file){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function safeText(s){
  return (s || "").toString().trim();
}

function ensureCreateDefaults(){
  $("puzzleName").value = $("puzzleName").value || "Untitled";
  if (!$("piecesCount").value) $("piecesCount").value = "48";
  if (!$("visibility").value) $("visibility").value = "public";
}

/* =========================
   HEADBREAKER GAME
========================= */

function destroyCanvas(){
  if (state.canvas){
    try{ state.canvas.clear(); }catch{}
  }
  state.canvas = null;
  $("puzzleStage").innerHTML = "";
}

function computeStageSize(){
  // Use container size
  const wrap = $("puzzleStage");
  const w = wrap.clientWidth || 1100;
  const h = wrap.clientHeight || 720;
  return { w, h };
}

function showFinalOverlay(show){
  $("imageOverlay").classList.toggle("hidden", !show);
}

function showSolvedOverlay(show){
  $("solvedOverlay").classList.toggle("hidden", !show);
}

function attachSolvedHandler(canvas){
  // Use built-in solved validator + event (see Headbreaker docs)
  canvas.attachSolvedValidator();
  canvas.onValid(() => {
    stopTimer();
    $("solvedTime").textContent = formatTime(state.timer.elapsedMs);
    showSolvedOverlay(true);
  });
}

function renderLeaderboard(puzzleId){
  const key = LS_LB_PREFIX + puzzleId;
  let list = [];
  try{ list = JSON.parse(localStorage.getItem(key) || "[]"); }catch{}

  // sort asc by time
  list.sort((a,b)=>a.timeMs-b.timeMs);

  const root = $("leaderboard");
  root.innerHTML = "";

  if (list.length === 0){
    root.innerHTML = `<div class="muted">Поки що немає результатів. Склади пазл першим 🙂</div>`;
    return;
  }

  list.slice(0, 12).forEach((row, idx)=>{
    const el = document.createElement("div");
    el.className = "lbRow";
    el.innerHTML = `
      <div class="lbLeft">
        <div class="badge">${idx+1}</div>
        <div>
          <div class="name">${escapeHtml(row.name)}</div>
          <div class="muted" style="font-size:12px">${new Date(row.date).toLocaleString()}</div>
        </div>
      </div>
      <div class="time">${formatTime(row.timeMs)}</div>
    `;
    root.appendChild(el);
  });
}

function saveScore(puzzleId, name, timeMs){
  const key = LS_LB_PREFIX + puzzleId;
  let list = [];
  try{ list = JSON.parse(localStorage.getItem(key) || "[]"); }catch{}

  // keep best per name
  const ix = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if (ix >= 0){
    if (timeMs < list[ix].timeMs){
      list[ix].timeMs = timeMs;
      list[ix].date = Date.now();
    }
  } else {
    list.push({ name, timeMs, date: Date.now() });
  }

  localStorage.setItem(key, JSON.stringify(list));
}

function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function buildAndPlayPuzzle(puzzle){
  destroyCanvas();
  resetTimer();

  $("playTitle").textContent = `Play • ${puzzle.name}`;
  $("finalImage").src = puzzle.imageDataUrl;

  const img = new Image();
  img.src = puzzle.imageDataUrl;

  img.onload = () => {
    const { w, h } = computeStageSize();

    // We want pieces scattered like "normal jigsaw on a big table"
    // Make a wide "table" area so pieces can spread.
    const tableW = Math.max(1100, w);
    const tableH = Math.max(720, h);

    // choose piece size based on grid
    // puzzle area should fit inside target frame-ish:
    const targetW = Math.min(820, tableW * 0.72);
    const targetH = Math.min(560, tableH * 0.72);
    const pieceSize = Math.floor(Math.min(targetW / puzzle.cols, targetH / puzzle.rows));

    // create headbreaker canvas
    const canvas = new headbreaker.Canvas("puzzleStage", {
      width: tableW,
      height: tableH,
      pieceSize: pieceSize,
      proximity: Math.max(12, Math.floor(pieceSize * 0.22)),
      borderFill: Math.max(10, Math.floor(pieceSize * 0.12)),
      strokeWidth: 1.5,
      lineSoftness: 0.18,
      image: img,
      fixed: true, // keep canvas fixed
    });

    // Adjust image scaling so it fits the puzzle
    // (important for correct crop)
    canvas.adjustImagesToPuzzleWidth();

    canvas.autogenerate({
      horizontalPiecesCount: puzzle.cols,
      verticalPiecesCount: puzzle.rows,
      insertsGenerator: headbreaker.generators.random
    });

    // Shuffle pieces around the "table" heavily.
    // This spreads pieces so user can drag them into the center.
    canvas.shuffle(0.95);

    canvas.draw();

    // solved handler
    attachSolvedHandler(canvas);

    // Start timer immediately (simpler & reliable)
    startTimer();

    // Extra: allow shuffle button
    $("shuffleBtn").onclick = () => {
      canvas.shuffle(0.95);
      canvas.redraw();
      resetTimer();
      startTimer();
    };

    state.canvas = canvas;

    // Render leaderboard
    renderLeaderboard(puzzle.id);

    // responsive resize
    window.onresize = () => {
      if (!state.canvas) return;
      const { w: nw, h: nh } = computeStageSize();
      const newW = Math.max(1100, nw);
      const newH = Math.max(720, nh);
      try{
        state.canvas.resize(newW, newH);
        state.canvas.redraw();
      }catch{}
    };
  };
}

/* =========================
   MY PUZZLES LIST
========================= */

function visibilityTag(v){
  if (v === "public") return "Public";
  if (v === "private") return "Private";
  return "Link-only";
}

function renderMyPuzzles(){
  const list = loadPuzzles().sort((a,b)=>b.createdAt-a.createdAt);
  const root = $("puzzlesList");
  root.innerHTML = "";

  if (list.length === 0){
    root.innerHTML = `<div class="muted">Поки що немає пазлів. Створи перший у вкладці Create.</div>`;
    return;
  }

  list.forEach(p=>{
    const el = document.createElement("div");
    el.className = "puzCard";
    el.innerHTML = `
      <div class="puzMeta">
        <div style="font-weight:800">${escapeHtml(p.name)}</div>
        <div class="row">
          <span class="tag">${visibilityTag(p.visibility)}</span>
          <span class="tag">${p.piecesCount} pcs</span>
          <span class="tag">${p.cols}×${p.rows}</span>
        </div>
        <div class="muted" style="font-size:12px">${new Date(p.createdAt).toLocaleString()}</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <button class="btn secondary" data-act="play" data-id="${p.id}">Play</button>
        <button class="btn ghost" data-act="share" data-id="${p.id}">Share</button>
        <button class="btn ghost" data-act="delete" data-id="${p.id}">Delete</button>
      </div>
    `;
    root.appendChild(el);
  });

  root.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      const p = getPuzzle(id);
      if (!p) return;

      if (act === "play"){
        openPuzzleToPlay(p);
      }
      if (act === "share"){
        const url = buildShareUrl(p);
        setShareLink(url);
      }
      if (act === "delete"){
        if (!confirm("Delete this puzzle?")) return;
        const all = loadPuzzles().filter(x=>x.id !== id);
        savePuzzles(all);
        renderMyPuzzles();
      }
    });
  });
}

function buildShareUrl(p){
  const url = new URL(location.href);
  const t = p.token || "";
  url.hash = `view=play&id=${encodeURIComponent(p.id)}${t ? `&token=${encodeURIComponent(t)}` : ""}`;
  return url.toString();
}

function openPuzzleToPlay(p){
  // Link-only: require token in URL (still local, but hidden without it)
  state.currentPuzzleId = p.id;
  state.currentToken = p.visibility === "link" ? (p.token || "") : "";
  setView("play");
  buildAndPlayPuzzle(p);
}

/* =========================
   CREATE FLOW
========================= */

function readCreateForm(){
  const name = safeText($("puzzleName").value) || "Untitled";
  const visibility = $("visibility").value || "public";
  const piecesCount = parseInt($("piecesCount").value || "48", 10);

  if (!PIECES_ALLOWED.includes(piecesCount)){
    alert("Pieces count is not allowed.");
    return null;
  }
  if (!state.createImageDataUrl){
    alert("Будь ласка, завантаж фото або натисни 'Use demo image'.");
    return null;
  }

  return { name, visibility, piecesCount };
}

async function createPuzzleAndPlay(){
  const form = readCreateForm();
  if (!form) return;

  // load image to get aspect
  const img = new Image();
  img.src = state.createImageDataUrl;

  img.onload = () => {
    const aspect = img.width / img.height;
    const grid = pickBestGridForN(form.piecesCount, aspect);

    // Ensure exact count
    if (grid.cols * grid.rows !== form.piecesCount){
      // this should not happen, but just in case
      alert("Не вдалося підібрати точну сітку для цієї кількості частин.");
      return;
    }

    const id = uid();
    const p = {
      id,
      name: form.name,
      visibility: form.visibility,
      piecesCount: form.piecesCount,
      cols: grid.cols,
      rows: grid.rows,
      imageDataUrl: state.createImageDataUrl,
      createdAt: Date.now(),
      token: form.visibility === "link" ? token() : ""
    };

    const all = loadPuzzles();
    all.unshift(p);
    savePuzzles(all);

    // share link
    setShareLink(buildShareUrl(p));

    // jump to play
    openPuzzleToPlay(p);
  };
}

/* =========================
   INIT / ROUTING
========================= */

function initNav(){
  qsa(".navBtn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const v = btn.dataset.view;
      clearShareLink();
      if (v === "play"){
        // if no current puzzle, go to My Puzzles
        if (!state.currentPuzzleId){
          setView("mypuzzles");
          return;
        }
      }
      setView(v);
    });
  });
}

function initCreateUI(){
  ensureCreateDefaults();

  $("imgPreview").style.display = "none";

  $("fileInput").addEventListener("change", async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 7 * 1024 * 1024){
      alert("Файл завеликий. Спробуй до ~3–5MB.");
      return;
    }
    state.createImageDataUrl = await fileToDataUrl(file);
    $("imgPreview").src = state.createImageDataUrl;
    $("imgPreview").style.display = "block";
    clearShareLink();
  });

  $("useDemoBtn").addEventListener("click", ()=>{
    state.createImageDataUrl = makeDemoImageDataUrl();
    $("imgPreview").src = state.createImageDataUrl;
    $("imgPreview").style.display = "block";
    clearShareLink();
  });

  $("removeImgBtn").addEventListener("click", ()=>{
    state.createImageDataUrl = "";
    $("fileInput").value = "";
    $("imgPreview").src = "";
    $("imgPreview").style.display = "none";
    clearShareLink();
  });

  $("cancelCreateBtn").addEventListener("click", ()=>{
    clearShareLink();
    $("puzzleName").value = "Untitled";
    $("visibility").value = "public";
    $("piecesCount").value = "48";
    state.createImageDataUrl = "";
    $("fileInput").value = "";
    $("imgPreview").src = "";
    $("imgPreview").style.display = "none";
  });

  $("createPlayBtn").addEventListener("click", ()=>{
    clearShareLink();
    createPuzzleAndPlay();
  });

  $("copyLinkBtn").addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText($("shareLink").value);
      $("copyLinkBtn").textContent = "Copied!";
      setTimeout(()=> $("copyLinkBtn").textContent = "Copy", 900);
    }catch{
      alert("Не вдалося скопіювати. Скопіюй вручну.");
    }
  });
}

function initPlayUI(){
  $("toggleImageBtn").addEventListener("click", ()=>{
    const isHidden = $("imageOverlay").classList.contains("hidden");
    showFinalOverlay(isHidden);
  });
  $("closeOverlayBtn").addEventListener("click", ()=> showFinalOverlay(false));
  $("backToCreateBtn").addEventListener("click", ()=>{
    showFinalOverlay(false);
    showSolvedOverlay(false);
    destroyCanvas();
    resetTimer();
    state.currentPuzzleId = "";
    state.currentToken = "";
    setView("create");
  });

  $("closeSolvedBtn").addEventListener("click", ()=> showSolvedOverlay(false));

  $("saveScoreBtn").addEventListener("click", ()=>{
    const name = safeText($("playerName").value);
    if (!name){
      alert("Введи ім'я 🙂");
      return;
    }
    saveScore(state.currentPuzzleId, name, Math.floor(state.timer.elapsedMs));
    renderLeaderboard(state.currentPuzzleId);
    showSolvedOverlay(false);
  });

  $("playAgainBtn").addEventListener("click", ()=>{
    const p = getPuzzle(state.currentPuzzleId);
    if (!p) return;
    showSolvedOverlay(false);
    buildAndPlayPuzzle(p);
  });
}

function initHashRouting(){
  const { view, id, token } = parseHash();

  // default view
  if (view) state.currentView = view;

  if (id){
    const p = getPuzzle(id);
    if (p){
      // handle link-only protection
      if (p.visibility === "link"){
        if (!token || token !== p.token){
          // show My Puzzles and share instructions (local limitation)
          setView("mypuzzles");
          return;
        }
      }
      state.currentPuzzleId = id;
      state.currentToken = token || "";
      setView("play");
      buildAndPlayPuzzle(p);
      return;
    }
  }

  // no id: just open requested view
  if (state.currentView === "play" && !state.currentPuzzleId){
    setView("create");
  } else {
    setView(state.currentView || "create");
  }
}

function boot(){
  initNav();
  initCreateUI();
  initPlayUI();
  initHashRouting();
}

boot();
