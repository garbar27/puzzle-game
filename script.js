let timerInterval;
let seconds = 0;
let started = false;

const timerEl = document.getElementById("timer");
const scoresEl = document.getElementById("scores");

function startTimer() {
  if (started) return;
  started = true;
  timerInterval = setInterval(() => {
    seconds++;
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    timerEl.textContent = `${m}:${s}`;
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function saveScore() {
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.push(seconds);
  scores.sort((a, b) => a - b);
  localStorage.setItem("scores", JSON.stringify(scores.slice(0, 5)));
  renderScores();
}

function renderScores() {
  scoresEl.innerHTML = "";
  const scores = JSON.parse(localStorage.getItem("scores") || "[]");
  scores.forEach(s => {
    const li = document.createElement("li");
    li.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    scoresEl.appendChild(li);
  });
}

renderScores();

document.getElementById("startBtn").onclick = () => {
  seconds = 0;
  started = false;
  timerEl.textContent = "00:00";
  clearInterval(timerInterval);

  document.getElementById("canvas").innerHTML = "";

  const input = document.getElementById("imageInput");
  const pieces = Number(document.getElementById("pieces").value);

  const img = new Image();
  img.onload = () => createPuzzle(img, pieces);

  if (input.files[0]) {
    img.src = URL.createObjectURL(input.files[0]);
  } else {
    img.src = "puzzle.jpg"; // fallback
  }
};

function createPuzzle(image, pieces) {
  const stage = new Konva.Stage({
    container: "canvas",
    width: 600,
    height: 600
  });

  const puzzle = new headbreaker.Canvas("canvas", {
    width: 600,
    height: 600,
    pieceSize: Math.sqrt((600 * 600) / pieces),
    proximity: 20,
    borderFill: 10,
    strokeWidth: 1,
    lineSoftness: 0.18,
    image: image
  });

  puzzle.autogenerate({
    horizontalPiecesCount: Math.round(Math.sqrt(pieces)),
    verticalPiecesCount: Math.round(Math.sqrt(pieces))
  });

  puzzle.shuffle();

  puzzle.onConnect(() => {
    startTimer();
  });

  puzzle.onComplete(() => {
    stopTimer();
    saveScore();
    alert("🎉 Puzzle completed!");
  });

  puzzle.draw();
}
