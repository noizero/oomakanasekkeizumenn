(() => {
  const $ = id => document.getElementById(id);
  const defaults = {length:30000,beam:6000,depth:3000,draft:1800,density:1025,stations:15,symmetry:true,bow:"raked",stern:"transom",members:[]};
  let design = structuredClone(defaults);
  let scene, camera, renderer, hullMesh, resizeObserver;
  let dirty = true;
  const inputIds = ["length","beam","depth","draft","density","stations","symmetry","bow","stern"];

  function readInputs() {
    for (const id of inputIds) {
      const el = $(id);
      design[id] = el.type === "checkbox" ? el.checked : (el.type === "number" ? Number(el.value) : el.value);
    }
    design.length = Math.max(1000, design.length || defaults.length);
    design.beam = Math.max(500, design.beam || defaults.beam);
    design.depth = Math.max(500, design.depth || defaults.depth);
    design.draft = Math.max(100, design.draft || defaults.draft);
  }
  function applyInputs() {
    inputIds.forEach(id => { if (design[id] !== undefined) $(id).type === "checkbox" ? $(id).checked = !!design[id] : $(id).value = design[id]; });
    renderAll();
  }
  function markDirty() { dirty = true; $("saveStatus").textContent = "未保存の変更"; renderAll(); }
  function fmt(n) { return Math.round(n).toLocaleString("ja-JP"); }

  function makeStation(t, L, B, D, bow, stern) {
    let x = t * L;
    let width = B/2;
    const bowT = Math.max(0, (t - 0.68) / 0.32);
    const sternT = Math.max(0, (0.22 - t) / 0.22);
    if (bow === "raked") width *= 1 - 0.32 * Math.pow(bowT, 1.5);
    if (bow === "clipper") width *= 1 - 0.1 * bowT;
    if (bow === "vertical") width *= 1 - 0.03 * bowT;
    if (bow === "bulbous") width *= 1 - 0.28 * bowT + 0.15 * Math.sin(bowT * Math.PI);
    if (stern === "cruiser") width *= 1 - 0.4 * Math.pow(sternT, 1.3);
    if (stern === "counter") width *= 1 - 0.17 * sternT;
    if (stern === "passenger") width *= 1 - 0.23 * sternT;
    const fullness = Math.max(0.12, Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.45);
    width *= fullness;
    return {x, width, keelZ: -D*0.18, deckZ: D*0.82};
  }
  function hullGeometry() {
    const L=design.length/1000, B=design.beam/1000, D=design.depth/1000;
    const n=Math.max(9,Math.min(41,Math.round(design.stations)|1));
    const rings=[], verts=[], idx=[];
    for(let i=0;i<=n;i++){
      const t=i/n, st=makeStation(t,L,B,D,design.bow,design.stern);
      const half=st.width;
      const ring=[
        [-half,0],[-half*.88,-D*.10],[-half*.58,-D*.17],[0,-D*.19],
        [half*.58,-D*.17],[half*.88,-D*.10],[half,0]
      ];
      const pts=ring.map(([y,z])=>[st.x,y,z+D*.19]);
      rings.push(pts);
    }
    const across=7;
    rings.forEach(r=>r.forEach(p=>verts.push(...p)));
    for(let i=0;i<n;i++) for(let j=0;j<across-1;j++){
      const a=i*across+j,b=a+across;
      idx.push(a,b,a+1,b,b+1,a+1);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));g.setIndex(idx);g.computeVertexNormals();
    return g;
  }
  function init3D() {
    const host=$("threeHost"); host.innerHTML="";
    if(!window.THREE){host.innerHTML='<div class="loading">3Dライブラリを読み込めません。インターネット接続を確認してください。</div>';return;}
    scene=new THREE.Scene(); scene.background=new THREE.Color(0xf0f5f8);
    camera=new THREE.PerspectiveCamera(40,host.clientWidth/Math.max(1,host.clientHeight),0.1,1000);
    camera.position.set(22,-25,18); camera.up.set(0,0,1); camera.lookAt(0,0,0);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2)); renderer.setSize(host.clientWidth,host.clientHeight); host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x7b8c9b,2));
    const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-10,-15,25);scene.add(light);
    const grid=new THREE.GridHelper(50,25,0xa8b7c4,0xd9e1e7);grid.rotation.x=Math.PI/2;grid.position.z=-1.5;scene.add(grid);
    const axes=new THREE.AxesHelper(5);scene.add(axes);
    const material=new THREE.MeshStandardMaterial({color:0x2f8395,metalness:.18,roughness:.42,side:THREE.DoubleSide});
    hullMesh=new THREE.Mesh(hullGeometry(),material);scene.add(hullMesh);
    const edge=new THREE.LineSegments(new THREE.EdgesGeometry(hullMesh.geometry),new THREE.LineBasicMaterial({color:0x17485d,transparent:true,opacity:.45})); hullMesh.add(edge);
    let drag=false,px=0,py=0,rotX=.45,rotZ=-.45,dist=42;
    function placeCamera(){camera.position.set(dist*Math.cos(rotX)*Math.cos(rotZ),dist*Math.cos(rotX)*Math.sin(rotZ),dist*Math.sin(rotX));camera.lookAt(0,0,0);renderer.render(scene,camera);}
    renderer.domElement.addEventListener("pointerdown",e=>{drag=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
    renderer.domElement.addEventListener("pointermove",e=>{if(!drag)return;rotZ+=(e.clientX-px)*.008;rotX=Math.max(-1.1,Math.min(1.3,rotX-(e.clientY-py)*.008));px=e.clientX;py=e.clientY;placeCamera()});
    renderer.domElement.addEventListener("pointerup",()=>drag=false);
    renderer.domElement.addEventListener("wheel",e=>{e.preventDefault();dist=Math.max(8,Math.min(100,dist+e.deltaY*.025));placeCamera()},{passive:false});
    resizeObserver=new ResizeObserver(()=>{if(!renderer)return;camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);renderer.render(scene,camera)});resizeObserver.observe(host);
    placeCamera();
  }
  function update3D(){
    if(!scene||!hullMesh)return;
    hullMesh.geometry.dispose();hullMesh.geometry=hullGeometry();
    const box=new THREE.Box3().setFromObject(hullMesh),size=box.getSize(new THREE.Vector3());
    const scale=26/Math.max(size.x,size.y,size.z,1);hullMesh.scale.setScalar(scale);
    scene.children.filter(o=>o.type==="GridHelper").forEach(o=>o.scale.setScalar(Math.max(1,size.x/35)));
    renderer.render(scene,camera);$("modelStatus").textContent="モデル更新済み";
  }
  function svgView(type){
    const L=design.length, B=design.beam, D=design.depth, T=design.draft;
    const W=520,H=190,pad=22, path=[];
    if(type==="top"){
      const points=[];
      for(let i=0;i<=50;i++){const s=makeStation(i/50,L/1000,B/1000,D/1000,design.bow,design.stern);points.push([pad+s.x/(L/1000)*(W-2*pad),H/2-s.width/(B/2000)*(H*.39)]);}
      const top=points.map(p=>p.join(",")).join(" ");
      const bottom=points.slice().reverse().map(p=>[p[0],H-p[1]].join(",")).join(" ");
      return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="平面図"><defs><pattern id="gridtop" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#edf1f4" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#gridtop)"/><line x1="${pad}" y1="${H/2}" x2="${W-pad}" y2="${H/2}" stroke="#9aa9b5" stroke-dasharray="5 4"/><polygon points="${top} ${bottom}" fill="#d4e9ed" stroke="#267b8d" stroke-width="2"/></svg>`;
    }
    if(type==="side"){
      const x0=pad,x1=W-pad,yDeck=H*.26,yKeel=H*.8,yWater=H*(.8-.54*T/D);
      const bowX=x0+(W-2*pad)*.16, sternX=x0+(W-2*pad)*.84;
      return `<svg viewBox="0 0 ${W} ${H}"><defs><pattern id="gridside" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#edf1f4" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#gridside)"/><path d="M ${x0} ${yDeck} L ${sternX} ${yDeck} L ${x1} ${yDeck+16} L ${x1} ${yKeel-6} Q ${(x0+x1)/2} ${yKeel+8} ${x0} ${yKeel-5} Z" fill="#d4e9ed" stroke="#267b8d" stroke-width="2"/><line x1="${x0}" y1="${yWater}" x2="${x1}" y2="${yWater}" stroke="#168c91" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${x0+5}" y="${yWater-5}" fill="#168c91" font-size="10">喫水線（概念表示）</text></svg>`;
    }
    const max=Math.max(B,D), scale=(H-2*pad)/max, half=B/2*scale, keel=H-pad, deck=keel-D*scale;
    return `<svg viewBox="0 0 ${W} ${H}"><defs><pattern id="gridfront" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#edf1f4" stroke-width="1"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#gridfront)"/><line x1="${W/2}" y1="${pad}" x2="${W/2}" y2="${H-pad}" stroke="#9aa9b5" stroke-dasharray="5 4"/><path d="M ${W/2-half} ${deck} Q ${W/2-half*.9} ${keel-12} ${W/2} ${keel} Q ${W/2+half*.9} ${keel-12} ${W/2+half} ${deck} Z" fill="#d4e9ed" stroke="#267b8d" stroke-width="2"/></svg>`;
  }
  function updateDrawings(){ $("topView").innerHTML=svgView("top");$("sideView").innerHTML=svgView("side");$("frontView").innerHTML=svgView("front"); }
  function updateMetrics(){
    $("metricLength").innerHTML=`${fmt(design.length)} <small>mm</small>`;$("metricBeam").innerHTML=`${fmt(design.beam)} <small>mm</small>`;$("metricDepth").innerHTML=`${fmt(design.depth)} <small>mm</small>`;$("metricDraft").innerHTML=`${fmt(design.draft)} <small>mm</small>`;
    const L=design.length/1000,B=design.beam/1000,T=design.draft/1000,rho=design.density;
    const cb=.62; const vol=L*B*T*cb, disp=vol*rho;
    $("calcVolume").textContent=vol.toLocaleString("ja-JP",{maximumFractionDigits:1})+" m³";
    $("calcDisplacement").textContent=disp.toLocaleString("ja-JP",{maximumFractionDigits:0})+" kg";
    $("calcCb").textContent=cb.toFixed(2)+"（仮定）";
    const warnings=[];
    if(design.draft>=design.depth)warnings.push(["error","喫水が型深さ以上です。入力値を確認してください。"]);
    if(design.draft>design.depth*.8)warnings.push(["warn","喫水が型深さに対して大きめです。船型・基準面を確認してください。"]);
    if(design.beam>design.length*.5)warnings.push(["warn","幅と長さの比が大きいため、寸法入力を確認してください。"]);
    if(design.stations<5||design.stations>41)warnings.push(["warn","断面数は5〜41の範囲を目安にしてください。"]);
    warnings.push(["warn","排水量は方形係数0.62を仮定した概算です。実形状からの積分値ではありません。"]);
    warnings.push(["warn","構造強度・規則適合は未評価です。"]);
    $("warnings").innerHTML=warnings.map(([c,t])=>`<div class="warning ${c}">${c==="error"?"要確認":c==="warn"?"注意":"情報"}：${t}</div>`).join("");
    $("calcStatus").textContent=warnings.some(w=>w[0]==="error")?"要確認":"概算のみ";
  }
  function renderMembers(){
    const body=$("memberRows");
    if(!design.members.length){body.innerHTML='<tr><td colspan="6" class="muted">部材はまだ登録されていません。</td></tr>';return;}
    body.innerHTML=design.members.map((m,i)=>`<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.type)}</td><td>${fmt(m.x)}</td><td>${fmt(m.z)}</td><td>${m.count}</td><td><button data-remove="${i}">削除</button></td></tr>`).join("");
    body.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>{design.members.splice(Number(b.dataset.remove),1);markDirty();renderMembers()}));
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function renderAll(){updateMetrics();updateDrawings();renderMembers();update3D();}
  function serialize(){readInputs();return {schemaVersion:1,app:"Ship Design Studio",savedAt:new Date().toISOString(),units:"mm",design};}
  function download(filename,content,type){const blob=new Blob([content],{type});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function saveLocal(){readInputs();localStorage.setItem("shipDesignStudio",JSON.stringify(serialize()));$("saveStatus").textContent="ブラウザに保存済み";$("fileMessage").textContent="このブラウザに設計データを保存しました。別の端末には自動同期されません。";}
  function exportJson(){download("ship-design.json",JSON.stringify(serialize(),null,2),"application/json");}
  function loadDesign(data){const d=data.design||data;if(!d||!d.length)throw new Error("設計データの形式が違います");design={...structuredClone(defaults),...d,members:Array.isArray(d.members)?d.members:[]};applyInputs();$("saveStatus").textContent="読み込み済み";$("fileMessage").textContent="JSONから設計データを読み込みました。";}
  inputIds.forEach(id=>$(id).addEventListener("input",()=>{readInputs();markDirty()}));
  document.querySelectorAll(".nav").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n===btn));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+btn.dataset.panel));const titles={hull:["船体モデル","主要寸法と船首・船尾形状を編集します。各ビューは同じ寸法データを参照します。"],structure:["内部・外部構造","構造部材を登録し、位置と基本情報を管理します。"],checks:["計算・警告","概算値と入力チェックを確認します。"],files:["保存・出力","設計データの保存・再読み込みと出力機能を管理します。"]};$("pageTitle").textContent=titles[btn.dataset.panel][0];$("pageSubtitle").textContent=titles[btn.dataset.panel][1];if(btn.dataset.panel==="hull"&&renderer){const host=$("threeHost");camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);renderer.render(scene,camera)}}));
  [$("saveBtn"),$("saveBtn2")].forEach(b=>b.addEventListener("click",saveLocal));
  [$("exportJsonBtn"),$("exportJsonBtn2")].forEach(b=>b.addEventListener("click",exportJson));
  [$("importJsonInput"),$("importJsonInput2")].forEach(el=>el.addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{loadDesign(JSON.parse(await f.text()))}catch(err){alert("読み込みに失敗しました: "+err.message)}e.target.value=""}));
  $("resetDimsBtn").addEventListener("click",()=>{const m=design.members;design={...structuredClone(defaults),members:m};applyInputs();markDirty()});
  $("addMemberBtn").addEventListener("click",()=>$("memberDialog").showModal());
  $("confirmMemberBtn").addEventListener("click",e=>{e.preventDefault();const m={name:$("memberName").value.trim()||"部材",type:$("memberType").value,x:Number($("memberX").value)||0,z:Number($("memberZ").value)||0,count:Math.max(1,Number($("memberCount").value)||1)};design.members.push(m);$("memberDialog").close();markDirty();renderMembers()});
  try{const saved=localStorage.getItem("shipDesignStudio");if(saved)loadDesign(JSON.parse(saved));else renderAll()}catch(e){renderAll()}
  init3D();update3D();dirty=false;$("saveStatus").textContent="読み込み済み";
  window.addEventListener("beforeunload",e=>{if(dirty){e.preventDefault();e.returnValue=""}});
})();