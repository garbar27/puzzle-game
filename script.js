const board = document.getElementById("board");
const startBtn = document.getElementById("start");
const imageInput = document.getElementById("imageInput");
const piecesSelect = document.getElementById("pieces");
const timerEl = document.getElementById("timer");
const leaderboardEl = document.getElementById("leaderboard");

let img = new Image();
let pieces = [];
let started = false;
let time = 0;
let timer;
let solved = 0;

function startTimer() {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    time++;
    timerEl.textContent =
      String(Math.floor(time / 60)).padStart(2, "0") +
      ":" +
      String(time % 60).padStart(2, "0");
  }, 1000);
}

function stopTimer() {
  clearInterval(timer);
  saveScore(time);
}

function saveScore(t) {
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.push(t);
  scores.sort((a, b) => a - b);
  localStorage.setItem("scores", JSON.stringify(scores.slice(0, 5)));
  renderScores();
}

function renderScores() {
  leaderboardEl.innerHTML = "";
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.forEach(s => {
    const li = document.createElement("li");
    li.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    leaderboardEl.appendChild(li);
  });
}

function createPuzzle() {
  board.innerHTML = "";
  pieces = [];
  solved = 0;
  started = false;
  time = 0;
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

function drag(piece) {
  let offsetX, offsetY;

  piece.onmousedown = e => {
    if (piece.classList.contains("locked")) return;
    startTimer();

    offsetX = e.offsetX;
    offsetY = e.offsetY;

    document.onmousemove = e => {
      piece.style.left = e.pageX - board.offsetLeft - offsetX + "px";
      piece.style.top = e.pageY - board.offsetTop - offsetY + "px";
    };

    document.onmouseup = () => {
      document.onmousemove = null;
      document.onmouseup = null;

      const dx = Math.abs(parseFloat(piece.style.left) - piece.dataset.x);
      const dy = Math.abs(parseFloat(piece.style.top) - piece.dataset.y);

      if (dx < 15 && dy < 15) {
        piece.style.left = piece.dataset.x + "px";
        piece.style.top = piece.dataset.y + "px";
        piece.classList.add("locked");
        solved++;
        if (solved === pieces.length) stopTimer();
      }
    };
  };
}

startBtn.onclick = () => {
  if (!imageInput.files[0]) {
    alert("Завантаж зображення");
    return;
  }
  img.src = URL.createObjectURL(imageInput.files[0]);
  img.onload = createPuzzle;
};

renderScores();
