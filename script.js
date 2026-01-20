const board = document.getElementById("board");
const piecesContainer = document.getElementById("pieces");

const size = 5;          // 🔥 5x5 = 25 частин
const boardSize = 500;
const pieceSize = boardSize / size;

let dragged = null;

// створення поля
for (let i = 0; i < size * size; i++) {
  const slot = document.createElement("div");
  slot.className = "slot";
  slot.addEventListener("dragover", e => e.preventDefault());
  slot.addEventListener("drop", () => {
    if (!slot.firstChild) slot.appendChild(dragged);
  });
  board.appendChild(slot);
}

// створення частин
let pieces = [];

for (let i = 0; i < size * size; i++) {
  const piece = document.createElement("div");
  piece.className = "piece";
  piece.draggable = true;

  piece.style.width = pieceSize + "px";
  piece.style.height = pieceSize + "px";

  const x = (i % size) * -pieceSize;
  const y = Math.floor(i / size) * -pieceSize;
  piece.style.backgroundPosition = `${x}px ${y}px`;

  piece.addEventListener("dragstart", e => dragged = e.target);
  pieces.push(piece);
}

// перемішати
pieces.sort(() => Math.random() - 0.5);
pieces.forEach(p => piecesContainer.appendChild(p));
