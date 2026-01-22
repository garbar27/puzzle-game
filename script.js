/* максимально проста версія пазла:
 * - прямокутні пазли (щоб легко збирати)
 * - snap до правильного місця (і блокування)
 * - таймер
 * - leaderboard (best per name) в localStorage
 * - працює на GitHub Pages без бібліотек
 */

const LS_LB = "puzzle_leaderboard_v1";

// Tabs
const navBtns = document.querySelectorAll(".navBtn");
const tabs = {
  create: document.getElementById("tab-create"),
  play: document.getElementById("tab-play"),
};
function setTab(name){
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  Object.keys(tabs).forEach(k => tabs[k].classList.toggle("active", k === name));
}
navBtns.forEach(b => b.addEventListener("click", ()=> setTab(b.dataset.tab)));

const fileInput = document.getElementById("fileInput");
const demoBtn = document.getElementById("demoBtn");
const clearBtn = document.getElementById("clearBtn");
const previewImg = document.getElementById("previewImg");
const puzzleNameEl = document.getElementById("puzzleName");
const piecesSelect = document.getElementById("piecesSelect");
const startBtn = document.getElementById("startBtn");

const playTitle = document.getElementById("playTitle");
const timerText = document.getElementById("timerText");
const imageBtn = document.getElementById("imageBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const backBtn = document.getElementById("backBtn");

const board = document.getElementById("board");
const tray = document.getElementById("tray");

const modal = document.getElementById("modal");
const finalImg = document.getElementById("finalImg");
const closeModal = document.getElementById("closeModal");

const solved = document.getElementById("solved");
const solvedTime = document.getElementById("solvedTime");
const closeSolved = document.getElementById("closeSolved");
const playerName = document.getElementById("playerName");
const saveScoreBtn = document.getElementById("saveScore");
const playAgainBtn = document.getElementById("playAgain");

const leaderboardEl = document.getElementById("leaderboard");

let imageDataUrl = "";
let imgNatural = { w: 0, h: 0 };

let pieces = [];
let placedCount = 0;

let timer = { running:false, t0:0, raf:0, elapsed:0 };

// --------- utils
function fmt(ms){
  const s = Math.floor(ms/1000);
  const m = Math.floor(s/60);
  const ss = s % 60;
  return `${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}

function stopTimer(){
  if (!timer.running) return;
  timer.running = false;
  cancelAnimationFrame(timer.raf);
}

function resetTimer(){
  stopTimer();
  timer = { running:false, t0:0, raf:0, elapsed:0 };
  timerText.textContent = "00:00";
}

function startTimer(){
  if (timer.running) return;
  timer.running = true;
  timer.t0 = performance.now();
  const tick = () => {
    timer.elapsed = performance.now() - timer.t0;
    timerText.textContent = fmt(timer.elapsed);
    timer.raf = requestAnimationFrame(tick);
  };
  timer.raf = requestAnimationFrame(tick);
}

function loadLB(){
  try{ return JSON.parse(localStorage.getItem(LS_LB) || "[]"); }catch{ return []; }
}
function saveLB(list){
  localStorage.setItem(LS_LB, JSON.stringify(list));
}
function renderLB(){
  const list = loadLB().sort((a,b)=>a.time-b.time).slice(0, 12);
  leaderboardEl.innerHTML = "";
  if (list.length === 0){
    leaderboardEl.innerHTML = `<div class="muted">Поки що немає результатів.</div>`;
    return;
  }
  list.forEach((r, i)=>{
    const row = document.createElement("div");
    row.className = "lbRow";
    row.innerHTML = `
      <div class="lbLeft">
        <div class="badge">${i+1}</div>
        <div>
          <div style="font-weight:900">${escapeHtml(r.name)}</div>
          <div class="muted" style="font-size:12px">${new Date(r.date).toLocaleString()}</div>
        </div>
      </div>
      <div style="font-weight:900">${fmt(r.time)}</div>
    `;
    leaderboardEl.appendChild(row);
  });
}
function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

// pick rows/cols close to image aspect but exact N
function pickGrid(n, aspect){
  let best = null;
  for (let c=1; c<=n; c++){
    if (n % c !== 0) continue;
    const r = n / c;
    const ratio = c / r;
    const score = Math.abs(ratio - aspect);
    if (!best || score < best.score) best = { c, r, score };
  }
  return best ? { cols: best.c, rows: best.r } : { cols: Math.round(Math.sqrt(n)), rows: Math.round(Math.sqrt(n)) };
}

function makeDemo(){
  const c = document.createElement("canvas");
  c.width = 1000; c.height = 650;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0,0,c.width,c.height);
  bg.addColorStop(0,"#2b1458");
  bg.addColorStop(0.55,"#101032");
  bg.addColorStop(1,"#1a2f5a");
  g.fillStyle = bg;
  g.fillRect(0,0,c.width,c.height);

  for (let i=0;i<180;i++){
    const x=Math.random()*c.width, y=Math.random()*c.height;
    const r=Math.random()*1.6+0.3;
    g.fillStyle=`rgba(255,255,255,${Math.random()*0.8})`;
    g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
  }

  g.fillStyle="rgba(245,242,255,.95)";
  g.font="bold 64px system-ui, sans-serif";
  g.fillText("Puzzle Game", 70, 120);

  g.fillStyle="rgba(245,242,255,.75)";
  g.font="26px system-ui, sans-serif";
  g.fillText("Upload image • drag pieces • snap to place • beat the time", 70, 170);

  return c.toDataURL("image/png");
}

function fileToDataUrl(file){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// --------- image input
fileInput.addEventListener("change", async (e)=>{
  const f = e.target.files?.[0];
  if (!f) return;
  imageDataUrl = await fileToDataUrl(f);
  previewImg.src = imageDataUrl;
  previewImg.style.display = "block";
});

demoBtn.addEventListener("click", ()=>{
  imageDataUrl = makeDemo();
  previewImg.src = imageDataUrl;
  previewImg.style.display = "block";
});

clearBtn.addEventListener("click", ()=>{
  imageDataUrl = "";
  fileInput.value = "";
  previewImg.src = "";
  previewImg.style.display = "none";
});

// --------- modals
imageBtn.addEventListener("click", ()=>{
  if (!imageDataUrl) return;
  finalImg.src = imageDataUrl;
  modal.classList.add("show");
});
closeModal.addEventListener("click", ()=> modal.classList.remove("show"));
modal.addEventListener("click", (e)=>{ if (e.target === modal) modal.classList.remove("show"); });

closeSolved.addEventListener("click", ()=> solved.classList.remove("show"));

// --------- game core
startBtn.addEventListener("click", async ()=>{
  if (!imageDataUrl){
    alert("Завантаж фото або натисни Use demo image.");
    return;
  }
  const name = (puzzleNameEl.value || "Untitled").trim() || "Untitled";
  const n = parseInt(piecesSelect.value, 10);

  playTitle.textContent = `Play • ${name}`;
  await buildPuzzle(n);
  setTab("play");
});

backBtn.addEventListener("click", ()=>{
  stopTimer();
  setTab("create");
});

shuffleBtn.addEventListener("click", ()=>{
  shufflePieces();
  resetTimer();
  startTimer();
});

playAgainBtn.addEventListener("click", async ()=>{
  solved.classList.remove("show");
  const n = parseInt(piecesSelect.value, 10);
  await buildPuzzle(n);
});

saveScoreBtn.addEventListener("click", ()=>{
  const name = (playerName.value || "").trim();
  if (!name){
    alert("Введи ім'я");
    return;
  }
  const t = Math.floor(timer.elapsed);

  const list = loadLB();
  const ix = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if (ix >= 0){
    if (t < list[ix].time){
      list[ix].time = t;
      list[ix].date = Date.now();
    }
  } else {
    list.push({ name, time: t, date: Date.now() });
  }
  saveLB(list);
  renderLB();
  solved.classList.remove("show");
});

// Build puzzle pieces and place them in tray (like real jigsaw table)
async function buildPuzzle(n){
  resetTimer();
  placedCount = 0;
  pieces = [];
  board.innerHTML = "";
  tray.innerHTML = "";

  const img = new Image();
  await new Promise((res)=>{
    img.onload = res;
    img.src = imageDataUrl;
  });
  imgNatural = { w: img.naturalWidth, h: img.naturalHeight };

  const aspect = imgNatural.w / imgNatural.h;
  const { cols, rows } = pickGrid(n, aspect);
  const total = cols * rows;

  // board "target" size
  const boardW = board.clientWidth;
  const boardH = board.clientHeight;

  // fit image into board while preserving aspect
  const scale = Math.min(boardW / imgNatural.w, boardH / imgNatural.h);
  const targetW = Math.floor(imgNatural.w * scale);
  const targetH = Math.floor(imgNatural.h * scale);

  const offsetX = Math.floor((boardW - targetW) / 2);
  const offsetY = Math.floor((boardH - targetH) / 2);

  // piece size in board coordinates
  const pw = Math.floor(targetW / cols);
  const ph = Math.floor(targetH / rows);

  // We’ll use a background-size matching target image size
  const bgSize = `${targetW}px ${targetH}px`;

  // create pieces
  for (let y=0; y<rows; y++){
    for (let x=0; x<cols; x++){
      const p = document.createElement("div");
      p.className = "piece";
      p.style.width = pw + "px";
      p.style.height = ph + "px";
      p.style.backgroundImage = `url(${imageDataUrl})`;
      p.style.backgroundSize = bgSize;
      p.style.backgroundPosition = `-${x*pw}px -${y*ph}px`;

      // correct position on board
      const cx = offsetX + x*pw;
      const cy = offsetY + y*ph;
      p.dataset.cx = String(cx);
      p.dataset.cy = String(cy);

      // spawn in tray (right panel), random
      const txMax = Math.max(10, tray.clientWidth - pw - 10);
      const tyMax = Math.max(10, tray.clientHeight - ph - 10);
      p.style.left = (10 + Math.random()*txMax) + "px";
      p.style.top = (10 + Math.random()*tyMax) + "px";

      tray.appendChild(p);
      pieces.push(p);

      enableDragSnap(p);
    }
  }

  // start timer immediately (простий і стабільний варіант)
  startTimer();

  renderLB();
}

// drag works across tray+board
function enableDragSnap(piece){
  let dragging = false;
  let start = { x:0, y:0 };
  let origin = { x:0, y:0 };

  const onDown = (e) => {
    if (piece.classList.contains("locked")) return;
    dragging = true;
    piece.style.zIndex = "999";
    piece.style.cursor = "grabbing";

    const rect = piece.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY };
    origin = { x: rect.left, y: rect.top };

    // move to body overlay layer by reparenting into boardWrap via fixed position trick
    piece.style.position = "fixed";
    piece.style.left = rect.left + "px";
    piece.style.top = rect.top + "px";

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    piece.style.left = (origin.x + dx) + "px";
    piece.style.top = (origin.y + dy) + "px";
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    piece.style.cursor = "grab";
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);

    // Decide if dropped over board
    const boardRect = board.getBoundingClientRect();
    const pieceRect = piece.getBoundingClientRect();

    const centerX = pieceRect.left + pieceRect.width/2;
    const centerY = pieceRect.top + pieceRect.height/2;

    const overBoard =
      centerX >= boardRect.left && centerX <= boardRect.right &&
      centerY >= boardRect.top && centerY <= boardRect.bottom;

    if (overBoard){
      // convert fixed coords to board local coords
      const localLeft = pieceRect.left - boardRect.left;
      const localTop = pieceRect.top - boardRect.top;

      // snap check
      const cx = parseFloat(piece.dataset.cx);
      const cy = parseFloat(piece.dataset.cy);

      const snapDist = Math.max(10, Math.min(pieceRect.width, pieceRect.height) * 0.25);

      if (Math.abs(localLeft - cx) <= snapDist && Math.abs(localTop - cy) <= snapDist){
        // snap and lock on board
        piece.classList.add("locked");
        piece.style.position = "absolute";
        piece.style.left = cx + "px";
        piece.style.top = cy + "px";
        piece.style.zIndex = "1";
        board.appendChild(piece);

        placedCount++;
        if (placedCount === pieces.length){
          // solved
          stopTimer();
          solvedTime.textContent = fmt(timer.elapsed);
          solved.classList.add("show");
        }
        return;
      }

      // not snapped: drop onto board as absolute where released
      piece.style.position = "absolute";
      piece.style.left = localLeft + "px";
      piece.style.top = localTop + "px";
      piece.style.zIndex = "50";
      board.appendChild(piece);
    } else {
      // drop back to tray (convert fixed coords to tray local)
      const trayRect = tray.getBoundingClientRect();
      const localLeft = pieceRect.left - trayRect.left;
      const localTop = pieceRect.top - trayRect.top;

      piece.style.position = "absolute";
      piece.style.left = localLeft + "px";
      piece.style.top = localTop + "px";
      piece.style.zIndex = "50";
      tray.appendChild(piece);
    }
  };

  piece.addEventListener("mousedown", onDown);
}

function shufflePieces(){
  // move all unlocked pieces back to tray randomly
  const txMax = Math.max(10, tray.clientWidth - 10);
  const tyMax = Math.max(10, tray.clientHeight - 10);

  pieces.forEach(p=>{
    if (p.classList.contains("locked")) return;

    // ensure in tray
    const rect = p.getBoundingClientRect();
    p.style.position = "absolute";
    tray.appendChild(p);
    p.style.left = (Math.random()*(txMax-100)+10) + "px";
    p.style.top = (Math.random()*(tyMax-100)+10) + "px";
    p.style.zIndex = "50";
  });
}

// initial
previewImg.style.display = "none";
renderLB();
