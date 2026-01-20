const board = document.getElementById("board");
const piecesContainer = document.getElementById("pieces");

const size = 5;
const boardSize = 500;
const pieceSize = boardSize / size;

let dragged = null;

// поле
for (let i = 0; i < size * size; i++) {
  const slot = document.createElement("div");
  slot.className = "slot";

  slot.addEventListener("dragover", e => e.preventDefault());
  slot.addEventListener("drop", () => {
    if (!slot.firstChild && dragged) {
      slot.appendChild(dragged);
    }
  });

  board.appendChild(slot);
}

// частини
const pieces = [];

for (let i = 0; i < size * size; i++) {
  const piece = document.createElement("div");
  piece.className = "piece";
  piece.draggable = true;

  const x = (i % size) * -pieceSize;
  const y = Math.floor(i / size) * -pieceSize;

  piece.style.backgroundPosition = `${x}px ${y}px`;

  piece.addEventListener("dragstart", () => {
    dragged = piece;
  });

  pieces.push(piece);
}

// перемішуємо
pieces.sort(() => Math.random() - 0.5);
pieces.forEach(p => piecesContainer.appendChild(p));
