const board = document.getElementById("board");
const piecesContainer = document.getElementById("pieces");

const size = 3;
let dragged = null;

for (let i = 0; i < size * size; i++) {
  const slot = document.createElement("div");
  slot.className = "slot";
  slot.addEventListener("dragover", e => e.preventDefault());
  slot.addEventListener("drop", () => {
    if (!slot.firstChild) slot.appendChild(dragged);
  });
  board.appendChild(slot);
}

let pieces = [];

for (let i = 0; i < size * size; i++) {
  const piece = document.createElement("div");
  piece.className = "piece";
  piece.draggable = true;

  const x = (i % size) * -100;
  const y = Math.floor(i / size) * -100;
  piece.style.backgroundPosition = `${x}px ${y}px`;

  piece.addEventListener("dragstart", e => dragged = e.target);
  pieces.push(piece);
}

pieces.sort(() => Math.random() - 0.5);
pieces.forEach(p => piecesContainer.appendChild(p));
