const tabs=document.querySelectorAll(".tab-btn");
const panels={
  create:document.getElementById("panel-create"),
  play:document.getElementById("panel-play"),
  my:document.getElementById("panel-my")
};

tabs.forEach(b=>{
  b.onclick=()=>{
    tabs.forEach(x=>x.classList.remove("is-active"));
    b.classList.add("is-active");
    Object.values(panels).forEach(p=>p.classList.add("hidden"));
    panels[b.dataset.tab].classList.remove("hidden");
  }
});

let imageData=null;
let timerInt=null;
let seconds=0;

const board=document.getElementById("board");
const pieces=document.getElementById("pieces");

document.getElementById("imageInput").onchange=e=>{
  const file=e.target.files[0];
  const reader=new FileReader();
  reader.onload=()=>imageData=reader.result;
  reader.readAsDataURL(file);
};

document.getElementById("createBtn").onclick=()=>{
  if(!imageData){alert("Upload image");return;}
  startPuzzle(parseInt(piecesCount.value));
  tabs[1].click();
};

function startPuzzle(count){
  board.innerHTML="";
  pieces.innerHTML="";
  seconds=0;
  document.getElementById("timer").textContent="00:00";
  clearInterval(timerInt);
  timerInt=setInterval(()=>{
    seconds++;
    document.getElementById("timer").textContent=
      String(Math.floor(seconds/60)).padStart(2,"0")+":"+
      String(seconds%60).padStart(2,"0");
  },1000);

  const size=Math.round(Math.sqrt(count));
  board.style.gridTemplateColumns=`repeat(${size},1fr)`;
  pieces.style.gridTemplateColumns=`repeat(${size},1fr)`;

  for(let i=0;i<size*size;i++){
    const s=document.createElement("div");
    s.className="slot";
    s.ondragover=e=>e.preventDefault();
    s.ondrop=e=>{
      if(e.dataTransfer.getData("i"))
        s.appendChild(document.getElementById(e.dataTransfer.getData("i")));
    };
    board.appendChild(s);

    const p=document.createElement("div");
    p.className="piece";
    p.id="p"+i;
    p.draggable=true;
    p.style.backgroundImage=`url(${imageData})`;
    p.style.backgroundSize=`${size*100}% ${size*100}%`;
    p.style.backgroundPosition=
      `${(i%size)*-100}% ${Math.floor(i/size)*-100}%`;
    p.ondragstart=e=>e.dataTransfer.setData("i",p.id);
    pieces.appendChild(p);
  }
}

document.getElementById("showImage").onclick=()=>{
  fullImage.src=imageData;
  imageModal.classList.remove("hidden");
};

function closeImage(){
  imageModal.classList.add("hidden");
}
