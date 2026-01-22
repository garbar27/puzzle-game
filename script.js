const imageInput = document.getElementById("imageInput");
const startBtn = document.getElementById("startBtn");
const piecesSelect = document.getElementById("pieces");
const puzzleEl = document.getElementById("puzzle");
const timeEl = document.getElementById("time");
const scoresEl = document.getElementById("scores");

let timer = null;
let seconds = 0;
let started = false;

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
    li.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2,"0")}`;
    scoresEl.appendChild(li);
  });
}

renderScores();

startBtn.onclick = async () => {
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

  await img.decode();

  const stage = new Konva.Stage({
    container: "puzzle",
    width: 600,
    height: 600
  });

  const layer = new Konva.Layer();
  stage.add(layer);

  const puzzle = new headbreaker.Canvas("puzzle", {
    width: 600,
    height: 600,
    pieceSize: Math.sqrt((600 * 600) / piecesSelect.value),
    proximity: 20,
    borderFill: 10,
    strokeWidth: 1,
    lineSoftness: 0.18,
    image: img,
  });

  puzzle.autogenerate({
    horizontalPiecesCount: Math.round(Math.sqrt(piecesSelect.value)),
    verticalPiecesCount: Math.round(Math.sqrt(piecesSelect.value))
  });

  puzzle.shuffle();

  puzzle.attachSolvedValidator();

  puzzle.on("piece-moved", () => {
    if (!started) {
      started = true;
      startTimer();
    }
  });

  puzzle.on("solved", () => {
    stopTimer();
    saveScore(seconds);
    alert("🧩 Puzzle completed!");
  });

  puzzle.draw();
};
