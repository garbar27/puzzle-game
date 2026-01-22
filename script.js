const imageInput = document.getElementById("imageInput");
const startBtn = document.getElementById("startBtn");
const piecesSelect = document.getElementById("pieces");
const puzzleEl = document.getElementById("puzzle");
const timeEl = document.getElementById("time");
const scoresEl = document.getElementById("scores");

let timer = null;
let seconds = 0;
let started = false;

/* ---------- TIMER ---------- */
function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    timeEl.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
}

/* ---------- LEADERBOARD ---------- */
function saveScore(sec) {
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.push(sec);
  scores.sort((a, b) => a - b);
  localStorage.setItem("scores", JSON.stringify(scores.slice(0, 5)));
  renderScores();
}

function renderScores() {
  scoresEl.innerHTML = "";
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.forEach(s => {
    const li = document.createElement("li");
    li.textContent =
      `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    scoresEl.appendChild(li);
  });
}

renderScores();

/* ---------- MAIN ---------- */
startBtn.onclick = () => {
  puzzleEl.innerHTML = "";
  stopTimer();
  seconds = 0;
  timeEl.textContent = "00:00";
  started = false;

  const file = imageInput.files[0];
  const img = new Image();

  img.src = file
    ? URL.createObjectURL(file)
    : "puzzle.jpg";

  img.onload = () => {
    const pieceCount = Number(piecesSelect.value);
    const grid = Math.round(Math.sqrt(pieceCount));

    const puzzle = new headbreaker.Canvas("puzzle", {
      width: 600,
      height: 600,
      image: img,
      pieceSize: 600 / grid,
      proximity: 25,
      borderFill: 10,
      strokeWidth: 1,
      lineSoftness: 0.2,
      preventOffstageDrag: true
    });

    puzzle.autogenerate({
      horizontalPiecesCount: grid,
      verticalPiecesCount: grid
    });

    puzzle.shuffle();
    puzzle.attachSolvedValidator();

    /* 🧲 ВАЖЛИВО: GROUP DRAG */
    puzzle.on("piece-moved", piece => {
      if (!started) {
        started = true;
        startTimer();
      }

      const group = piece.group;
      if (!group) return;

      const { x, y } = piece;

      group.pieces.forEach(p => {
        if (p !== piece) {
          p.setPosition(
            x + (p.col - piece.col) * puzzle.pieceSize,
            y + (p.row - piece.row) * puzzle.pieceSize
          );
        }
      });
    });

    puzzle.on("solved", () => {
      stopTimer();
      saveScore(seconds);
      alert("🧩 Puzzle completed!");
    });

    puzzle.draw();
  };
};
