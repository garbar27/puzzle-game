const btnCreate = document.getElementById("btnCreate");
const btnPlay = document.getElementById("btnPlay");
const createSection = document.getElementById("createSection");
const playSection = document.getElementById("playSection");

const imageInput = document.getElementById("imageInput");
const piecesSelect = document.getElementById("piecesSelect");
const startGameBtn = document.getElementById("startGameBtn");

const board = document.getElementById("board");
const showImageBtn = document.getElementById("showImageBtn");
const imageModal = document.getElementById("imageModal");
const fullImage = document.getElementById("fullImage");

let imageData = null;
let pieces = [];

btnCreate.onclick = () => switchTab("create");
btnPlay.onclick = () => switchTab("play");

function switchTab(tab) {
  btnCreate.classList.toggle("active", tab === "create");
  btnPlay.classList.toggle("active", tab === "play");
  createSection.classList.toggle("active", tab === "create");
  playSection.classList.toggle("active", tab === "play");
}

imageInput.onchange = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => imageData = reader.result;
  reader.readAsDataURL(file);
};

startGameBtn.onclick = () => {
  if (!imageData) {
    alert("Upload image");
    return;
  }
  startGame(parseInt(piecesSelect.value));
  switchTab("play");
};

function startGame(count) {
  board.innerHTML = "";
  pieces = [];

  const img = new Image();
  img.onload = () => {
    const cols = Math.sqrt(count);
    const rows = cols;

    const pw = img.width / cols;
    const ph = img.height / rows;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const piece = document.createElement("div");
        piece.className = "piece";

        piece.style.width = pw + "px";
        piece.style.height = ph + "px";
        piece.style.backgroundImage = `url(${imageData})`;
        piece.style.backgroundSize = `${img.width}px ${img.height}px`;
        piece.style.backgroundPosition = `-${x * pw}px -${y * ph}px`;

        piece.dataset.correctX = x * pw;
        piece.dataset.correctY = y * ph;

        piece.style.left = Math.random() * (board.clientWidth - pw) + "px";
        piece.style.top = Math.random() * (board.clientHeight - ph) + "px";

        enableDrag(piece);
        board.appendChild(piece);
        pieces.push(piece);
      }
    }
  };
  img.src = imageData;
}

function enableDrag(piece) {
  piece.onmousedown = e => {
    const offsetX = e.offsetX;
    const offsetY = e.offsetY;
    piece.style.zIndex = 1000;

    function move(ev) {
      piece.style.left = ev.pageX - board.offsetLeft - offsetX + "px";
      piece.style.top = ev.pageY - board.offsetTop - offsetY + "px";
    }

    document.addEventListener("mousemove", move);
    document.onmouseup = () => {
      document.removeEventListener("mousemove", move);
      snapPiece(piece);
      document.onmouseup = null;
    };
  };
}

function snapPiece(piece) {
  const dx = Math.abs(parseFloat(piece.style.left) - piece.dataset.correctX);
  const dy = Math.abs(parseFloat(piece.style.top) - piece.dataset.correctY);
  if (dx < 20 && dy < 20) {
    piece.style.left = piece.dataset.correctX + "px";
    piece.style.top = piece.dataset.correctY + "px";
    piece.style.pointerEvents = "none";
  }
}

showImageBtn.onclick = () => {
  fullImage.src = imageData;
  imageModal.style.display = "flex";
};

imageModal.onclick = () => imageModal.style.display = "none";
