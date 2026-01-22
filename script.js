const board = document.getElementById("board");
const startBtn = document.getElementById("startBtn");
const imageInput = document.getElementById("imageInput");
const piecesSelect = document.getElementById("piecesSelect");
const timerEl = document.getElementById("timer");
const scoresEl = document.getElementById("scores");

let pieces = [];
let img = new Image();
let started = false;
let timer = null;
let seconds = 0;
let solvedCount = 0;

function startTimer() {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    seconds++;
    timerEl.textContent =
      String(Math.floor(seconds / 60)).padStart(2, "0") +
      ":" +
      String(seconds % 60).padStart(2, "0");
  }, 1000);
}

function stopTimer() {
  clearInterval(timer);
  saveScore(seconds);
}

function saveScore(time) {
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.push(time);
  scores.sort((a, b) => a - b);
  localStorage.setItem("scores", JSON.stringify(scores.slice(0, 5)));
  renderScores();
}

function renderScores() {
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scoresEl.innerHTML = "";
  scores.forEach(s => {
    const li = document.createElement("li");
    li.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    scoresEl.appendChild(li);
  });
}

function createPuzzle() {
  board.innerHTML = "";
  pieces = [];
  solvedCount = 0;
  seconds = 0;
  started = false;
  timerEl.textContent = "00:00";

  const total = Number(piecesSelect.value);
  const size = Math.sqrt(total);
  const pieceSize = board.clientWidth / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const piece = document.createElement("div");
      piece.className = "piece";
      piece.style.width = piece.style.height = pieceSize + "px";
      piece.style.backgroundImage = `url(${img.src})`;
      piece.style.backgroundSize = `${board.clientWidth}px ${board.clientHeight}px`;
      piece.style.backgroundPosition = `-${x * pieceSize}px -${y * pieceSize}px`;

      const correctX = x * pieceSize;
      const correctY = y * pieceSize;

      piece.dataset.x = correctX;
      piece.dataset.y = correctY;

      piece.style.left = Math.random() * (board.clientWidth - pieceSize) + "px";
      piece.style.top = Math.random() * (board.clientHeight - pieceSize) + "px";

      drag(piece);
      board.appendChild(piece);
      pieces.push(piece);
    }
  }
}

function drag(el) {
  let offsetX, offsetY;

  el.onmousedown = e => {
    if (el.classList.contains("locked")) return;
    startTimer();
    offsetX = e.offsetX;
    offsetY = e.offsetY;
    el.style.zIndex = 1000;

    document.onmousemove = e => {
      el.style.left = e.pageX - board.offsetLeft - offsetX + "px";
      el.style.top = e.pageY - board.offsetTop - offsetY + "px";
    };

    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;
      el.style.zIndex = "";

      const dx = Math.abs(parseFloat(el.style.left) - el.dataset.x);
      const dy = Math.abs(parseFloat(el.style.top) - el.dataset.y);

      if (dx < 15 && dy < 15) {
        el.style.left = el.dataset.x + "px";
        el.style.top = el.dataset.y + "px";
        el.classList.add("locked");
        solvedCount++;
        if (solvedCount === pieces.length) stopTimer();
      }
    };
  };
}

startBtn.onclick = () => {
  const file = imageInput.files[0];
  if (!file) return alert("Upload image");
  img.src = URL.createObjectURL(file);
  img.onload = createPuzzle;
};

renderScores();
