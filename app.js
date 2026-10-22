(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const defaults = {length:30000,beam:6000,depth:3000,draft:1800,density:1025,stations:21,symmetry:true,bow:"raked",stern:"transom",members:[]};
  let design = structuredClone(defaults), scene, camera, renderer, hullMesh, resizeObserver, renderRequested=false;
  const inputIds=["length","beam","depth","draft","density","stations","symmetry","bow","stern"];
  const fmt=n=>Math.round(n).toLocaleString("ja-JP");
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  function readInputs(){
    for(const id of inputIds){const e=$(id);design[id]=e.type==="checkbox"?e.checked:e.type==="number"?Number(e.value):e.value;}
    design.length=clamp(design.length||defaults.length,1000,1000000);
    design.beam=clamp(design.beam||defaults.beam,500,200000);
    design.depth=clamp(design.depth||defaults.depth,500,100000);
    design.draft=clamp(design.draft||defaults.draft,100,100000);
    design.stations=clamp(Math.round(design.stations||21),5,81);
    if(design.stations%2===0)design.stations=Math.min(81,design.stations+1);
  }
  function applyInputs(){inputIds.forEach(id=>{if(design[id]!==undefined){const e=$(id);if(e.type==="checkbox")e.checked=!!design[id];else e.value=design[id];}});renderAll();}
  function markDirty(){ $("saveStatus").textContent="未保存の変更";renderAll(); }
  // x runs from stern (0) to bow (L); all geometry is generated from these stations.
  // Half-breadth is zero only at the actual stem/transom end; bulbous bow stays connected.
  function station(t){
    const L=design.length/1000,B=design.beam/1000,D=design.depth/1000;
    t=clamp(t,0,1);
    let w;
    // Stable, positive, continuous fullness curve with no abrupt disappearing ends.
    const base=Math.pow(Math.sin(Math.PI*t),0.62);
    w=(B/2)*base*(0.91+0.09*Math.cos(2*Math.PI*(t-.5)));
    // Bow region: last ~24% of length, smooth transitions to the stem.
    const bowU=clamp((t-.76)/.24,0,1);
    if(design.bow==="raked")w*=1-0.72*Math.pow(bowU,1.25);
    else if(design.bow==="clipper")w*=1-0.48*Math.pow(bowU,1.1);
    else if(design.bow==="vertical")w*=1-0.12*Math.pow(bowU,1.2);
    else if(design.bow==="bulbous"){
      // Main stem tapers normally; a small forward bulb broadens locally and remains joined.
      w*=1-0.64*Math.pow(bowU,1.15);
      const bulb=Math.exp(-Math.pow((t-.91)/.045,2));
      w+=B*.055*bulb*Math.sin(Math.PI*t);
    } else w*=1-0.5*Math.pow(bowU,1.2);
    // Stern shape, smooth and independently selectable.
    const sternU=clamp((.24-t)/.24,0,1);
    if(design.stern==="cruiser")w*=1-0.58*Math.pow(sternU,1.4);
    else if(design.stern==="counter")w*=1-0.24*Math.pow(sternU,1.2);
    else if(design.stern==="passenger")w*=1-0.32*Math.pow(sternU,1.1);
    else if(design.stern==="transom")w*=1-0.08*Math.pow(sternU,2);
    else w*=1-0.3*Math.pow(sternU,1.2);
    w=Math.max(0,w);
    return {x:(t-.5)*L, half:w, L,B,D};
  }
  function crossSection(st,theta){
    const {half,D}=st;
    // theta 0..2pi around section: deck edges, bilge, keel, opposite bilge and deck.
    const y=half*Math.cos(theta);
    const s=Math.sin(theta);
    // Rounded V/U bottom, near-vertical upper sides. z measured from keel baseline.
    const z=(D*.06)+(D*.88)*Math.pow(Math.abs(Math.cos(theta)),.72);
    return [st.x,y,z];
  }
  function buildHullGeometry(){
    const n=clamp(Math.round(design.stations),5,81), around=32, verts=[],indices=[];
    for(let i=0;i<=n;i++){
      const st=station(i/n);
      for(let j=0;j<around;j++){
        const p=crossSection(st,2*Math.PI*j/around);
        verts.push(p[0],p[1],p[2]);
      }
    }
    for(let i=0;i<n;i++)for(let j=0;j<around;j++){
      const a=i*around+j,b=i*around+(j+1)%around,c=(i+1)*around+j,d=(i+1)*around+(j+1)%around;
      indices.push(a,c,b,b,c,d);
    }
    // Close ends with small triangulated caps to avoid open-looking stem/stern.
    for(const end of [0,n]){
      const st=station(end/n),centerIndex=verts.length/3;
      verts.push(st.x,0,st.D*.35);
      for(let j=0;j<around;j++){
        const a=end*around+j,b=end*around+(j+1)%around;
        if(end===0)indices.push(centerIndex,b,a);else indices.push(centerIndex,a,b);
      }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();
    return g;
  }
  function init3D(){
    const host=$("threeHost");host.innerHTML="";
    if(!window.THREE){host.innerHTML='<div class="loading">3Dライブラリを読み込めません。インターネット接続を確認してください。</div>';return;}
    scene=new THREE.Scene();scene.background=new THREE.Color(0xf0f5f8);
    camera=new THREE.PerspectiveCamera(38,host.clientWidth/Math.max(1,host.clientHeight),.01,10000);
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(host.clientWidth,host.clientHeight);host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x70879a,2.1));
    const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(-20,-25,35);scene.add(light);
    const grid=new THREE.GridHelper(40,20,0xa7b8c5,0xd8e1e8);grid.rotation.x=Math.PI/2;grid.position.z=-.2;scene.add(grid);
    hullMesh=new THREE.Mesh(buildHullGeometry(),new THREE.MeshStandardMaterial({color:0x2d8193,metalness:.12,roughness:.48,side:THREE.DoubleSide}));
    scene.add(hullMesh);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(hullMesh.geometry,28),new THREE.LineBasicMaterial({color:0x17485d,transparent:true,opacity:.34}));hullMesh.add(edges);
    let drag=false,px=0,py=0,yaw=-.55,pitch=.38,dist=1;
    function frame(){
      const L=design.length/1000,B=design.beam/1000,D=design.depth/1000;
      const maxDim=Math.max(L,B,D),targetDist=maxDim*1.65;
      dist=clamp(dist, maxDim*.65,maxDim*5);
      camera.position.set(dist*Math.cos(pitch)*Math.cos(yaw),dist*Math.cos(pitch)*Math.sin(yaw),dist*Math.sin(pitch));
      camera.up.set(0,0,1);camera.lookAt(0,0,D*.42);
      camera.near=Math.max(.001,maxDim/10000);camera.far=maxDim*20;camera.updateProjectionMatrix();
      grid.scale.set(Math.max(1,L/30),Math.max(1,L/30),1);
      renderer.render(scene,camera);
    }
    dist=Math.max(design.length/1000,design.beam/1000)*1.65;
    renderer.domElement.addEventListener("pointerdown",e=>{drag=true;px=e.clientX;py=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)});
    renderer.domElement.addEventListener("pointermove",e=>{if(!drag)return;yaw+=(e.clientX-px)*.008;pitch=clamp(pitch-(e.clientY-py)*.008,-1.1,1.3);px=e.clientX;py=e.clientY;frame()});
    renderer.domElement.addEventListener("pointerup",()=>drag=false);
    renderer.domElement.addEventListener("pointercancel",()=>drag=false);
    renderer.domElement.addEventListener("wheel",e=>{e.preventDefault();dist=clamp(dist*Math.exp(e.deltaY*.001),Math.max(design.length/1000,design.beam/1000)*.55,Math.max(design.length/1000,design.beam/1000)*7);frame()},{passive:false});
    resizeObserver=new ResizeObserver(()=>{if(!renderer)return;camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);renderer.setSize(host.clientWidth,host.clientHeight);frame()});resizeObserver.observe(host);
    window._shipFrame=frame;frame();
  }
  function update3D(){
    if(!scene||!hullMesh||!renderer)return;
    const old=hullMesh.geometry;hullMesh.geometry=buildHullGeometry();old.dispose();
    const oldEdge=hullMesh.children[0];if(oldEdge){hullMesh.remove(oldEdge);oldEdge.geometry.dispose();oldEdge.material.dispose();}
    hullMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(hullMesh.geometry,28),new THREE.LineBasicMaterial({color:0x17485d,transparent:true,opacity:.34})));
    if(window._shipFrame)window._shipFrame();
    $("modelStatus").textContent="モデル更新済み";
  }
  // Orthographic drawing helper: geometry and dimensions use the same principal dimensions.
  function dimH(x1,x2,y,label,extY1,extY2){
    return `<g class="dim"><path d="M${x1} ${extY1}V${y} M${x2} ${extY2}V${y} M${x1} ${y}H${x2}" /><path d="M${x1} ${y}l7 -3v6z M${x2} ${y}l-7 -3v6z" fill="#516777" stroke="none"/><rect x="${(x1+x2)/2-35}" y="${y-15}" width="70" height="13" rx="3" fill="#fff"/><text x="${(x1+x2)/2}" y="${y-5}" text-anchor="middle">${label}</text></g>`;
  }
  function dimV(y1,y2,x,label,extX1,extX2){
    return `<g class="dim"><path d="M${extX1} ${y1}H${x} M${extX2} ${y2}H${x} M${x} ${y1}V${y2}" /><path d="M${x} ${y1}l-3 7h6z M${x} ${y2}l-3 -7h6z" fill="#516777" stroke="none"/><rect x="${x-24}" y="${(y1+y2)/2-7}" width="48" height="14" rx="3" fill="#fff"/><text x="${x}" y="${(y1+y2)/2+3}" text-anchor="middle">${label}</text></g>`;
  }
  function svgBase(content,label){return `<svg viewBox="0 0 620 245" role="img" aria-label="${label}"><defs><pattern id="grid-${label}" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#edf1f4" stroke-width="1"/></pattern></defs><rect width="620" height="245" fill="url(#grid-${label})"/>${content}</svg>`;}
  function svgTop(){
    const L=design.length,B=design.beam, left=70,right=550,mid=112,scaleX=(right-left)/L,scaleY=72/(B/2);
    const top=[],bottom=[];
    for(let i=0;i<=80;i++){const s=station(i/80),x=left+(s.x+design.length/2000)*scaleX;top.push([x,mid-s.half*1000*scaleY]);bottom.push([x,mid+s.half*1000*scaleY]);}
    const points=top.concat(bottom.reverse()).map(p=>p.join(",")).join(" ");
    let c=`<polygon points="${points}" fill="#d3e9ed" stroke="#267b8d" stroke-width="2"/><line x1="${left}" y1="${mid}" x2="${right}" y2="${mid}" stroke="#8d9ca8" stroke-dasharray="5 4"/><text x="${left}" y="20" font-size="11" fill="#526777">船尾</text><text x="${right}" y="20" text-anchor="end" font-size="11" fill="#526777">船首</text>`;
    c+=dimH(left,right,220,`全長 ${fmt(L)} mm`,mid+75,mid+75);
    c+=dimV(mid-72,mid+72,590,`幅 ${fmt(B)}`,right, right);
    return svgBase(c,"平面図");
  }
  function svgSide(){
    const L=design.length,D=design.depth,T=design.draft,left=70,right=550,top=65,bottom=178,sx=(right-left)/L,sz=(bottom-top)/D;
    let sternTop=.03,bowTop=.12,sternBottom=0,bowBottom=.015;
    if(design.stern==="cruiser"){sternTop=.15;sternBottom=.06;}
    else if(design.stern==="counter"){sternTop=.07;sternBottom=.025;}
    else if(design.stern==="passenger"){sternTop=.10;sternBottom=.035;}
    if(design.bow==="vertical"){bowTop=.025;bowBottom=.02;}
    else if(design.bow==="clipper"){bowTop=.09;bowBottom=0;}
    else if(design.bow==="bulbous"){bowTop=.15;bowBottom=-.015;}
    else if(design.bow==="raked"){bowTop=.18;bowBottom=.015;}
    const xSL=left+L*sternTop*sx,xBL=left+L*sternBottom*sx;
    const xST=right-L*bowTop*sx,xBT=right-L*bowBottom*sx;
    const yDeck=top,yKeel=bottom-D*.06*sz,water=bottom-T*sz;
    let c=`<polygon points="${xSL},${yDeck} ${xST},${yDeck} ${xBT},${yKeel} ${xBL},${yKeel}" fill="#d3e9ed" stroke="#267b8d" stroke-width="2" stroke-linejoin="round"/><line x1="${left}" y1="${water}" x2="${right}" y2="${water}" stroke="#168c91" stroke-dasharray="6 4" stroke-width="1.5"/><text x="${right}" y="${water-5}" text-anchor="end" fill="#168c91" font-size="10">喫水線 T=${fmt(T)} mm</text><text x="${left}" y="20" font-size="11" fill="#526777">船尾</text><text x="${right}" y="20" text-anchor="end" font-size="11" fill="#526777">船首</text>`;
    c+=dimH(left,right,220,`全長 ${fmt(L)} mm`,bottom+2,bottom+2);
    c+=dimV(top,bottom,590,`深さ ${fmt(D)}`,right,right);
    return svgBase(c,"側面図");
  }
  function svgFront(){
    const B=design.beam,D=design.depth,T=design.draft,W=620,H=245,cx=310,top=55,bottom=185,half=165,scaleZ=(bottom-top)/D;
    const pts=[];
    for(let j=0;j<=40;j++){const theta=Math.PI*j/40;const y=Math.cos(theta)*half;const z=top+(1-Math.sin(theta))*(bottom-top);pts.push([cx+y,z]);}
    const outline=pts.map(p=>p.join(",")).join(" ")+" "+pts.slice().reverse().map(p=>p.join(",")).join(" ");
    // Use a closed, symmetric section silhouette.
    const leftPts=[],rightPts=[];
    for(let j=0;j<=30;j++){const u=j/30;const z=bottom-(bottom-top)*u;const halfW=half*Math.pow(Math.max(0,1-Math.pow(1-u,2)),.55);leftPts.push([cx-halfW,z]);rightPts.push([cx+halfW,z]);}
    const shape=leftPts.concat(rightPts.reverse()).map(p=>p.join(",")).join(" ");
    const water=bottom-T*scaleZ;
    let c=`<polygon points="${shape}" fill="#d3e9ed" stroke="#267b8d" stroke-width="2"/><line x1="${cx-half}" y1="${water}" x2="${cx+half}" y2="${water}" stroke="#168c91" stroke-dasharray="6 4"/><line x1="${cx}" y1="40" x2="${cx}" y2="${bottom+3}" stroke="#8d9ca8" stroke-dasharray="5 4"/><text x="${cx}" y="20" text-anchor="middle" font-size="11" fill="#526777">正面断面（概念形状）</text>`;
    c+=dimH(cx-half,cx+half,220,`幅 ${fmt(B)} mm`,bottom,bottom);
    c+=dimV(top,bottom,565,`深さ ${fmt(D)}`,cx+half,cx+half);
    return svgBase(c,"正面図");
  }
  function updateDrawings(){$("topView").innerHTML=svgTop();$("sideView").innerHTML=svgSide();$("frontView").innerHTML=svgFront();}
  function updateMetrics(){
    $("metricLength").innerHTML=`${fmt(design.length)} <small>mm</small>`;$("metricBeam").innerHTML=`${fmt(design.beam)} <small>mm</small>`;$("metricDepth").innerHTML=`${fmt(design.depth)} <small>mm</small>`;$("metricDraft").innerHTML=`${fmt(design.draft)} <small>mm</small>`;
    const L=design.length/1000,B=design.beam/1000,T=design.draft/1000,rho=design.density,cb=.62,vol=L*B*T*cb,disp=vol*rho;
    $("calcVolume").textContent=vol.toLocaleString("ja-JP",{maximumFractionDigits:1})+" m³";$("calcDisplacement").textContent=disp.toLocaleString("ja-JP",{maximumFractionDigits:0})+" kg";$("calcCb").textContent=cb.toFixed(2)+"（仮定）";
    const warnings=[];
    if(design.draft>=design.depth)warnings.push(["error","喫水が型深さ以上です。入力値を確認してください。"]);
    else if(design.draft>design.depth*.8)warnings.push(["warn","喫水が型深さに対して大きめです。基準面を確認してください。"]);
    if(design.beam>design.length*.5)warnings.push(["warn","幅と長さの比が大きいため、寸法入力を確認してください。"]);
    warnings.push(["warn","排水量は方形係数0.62を仮定した概算で、実形状からの積分値ではありません。"]);
    warnings.push(["warn","構造強度・安定性・規則適合は未評価です。"]);
    $("warnings").innerHTML=warnings.map(([c,t])=>`<div class="warning ${c}">${c==="error"?"要確認":"注意"}：${t}</div>`).join("");$("calcStatus").textContent=warnings.some(w=>w[0]==="error")?"要確認":"概算のみ";
  }
  function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function renderMembers(){const body=$("memberRows");if(!design.members.length){body.innerHTML='<tr><td colspan="6" class="muted">部材はまだ登録されていません。</td></tr>';return;}body.innerHTML=design.members.map((m,i)=>`<tr><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.type)}</td><td>${fmt(m.x)}</td><td>${fmt(m.z)}</td><td>${m.count}</td><td><button data-remove="${i}">削除</button></td></tr>`).join("");body.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>{design.members.splice(Number(b.dataset.remove),1);markDirty();renderMembers();}));}
  function renderAll(){updateMetrics();updateDrawings();renderMembers();update3D();}
  function serialize(){readInputs();return {schemaVersion:2,app:"Ship Design Studio",savedAt:new Date().toISOString(),units:"mm",design};}
  function download(name,content,type){const blob=new Blob([content],{type}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function saveLocal(){readInputs();localStorage.setItem("shipDesignStudio",JSON.stringify(serialize()));$("saveStatus").textContent="ブラウザに保存済み";$("fileMessage").textContent="このブラウザに保存しました。別端末には自動同期されません。";}
  function exportJson(){download("ship-design.json",JSON.stringify(serialize(),null,2),"application/json");}
  function loadDesign(data){const d=data.design||data;if(!d||!d.length)throw new Error("設計データの形式が違います");design={...structuredClone(defaults),...d,members:Array.isArray(d.members)?d.members:[]};applyInputs();$("saveStatus").textContent="読み込み済み";}
  inputIds.forEach(id=>$(id).addEventListener("input",()=>{readInputs();markDirty();}));
  document.querySelectorAll(".nav").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n===btn));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id==="panel-"+btn.dataset.panel));const t={hull:["船体モデル","主要寸法と船首・船尾形状を編集します。各ビューは同じ寸法データを参照します。"],structure:["内部・外部構造","構造部材を登録し、位置と基本情報を管理します。"],checks:["計算・警告","概算値と入力チェックを確認します。"],files:["保存・出力","設計データの保存・再読み込みと出力機能を管理します。"]};$("pageTitle").textContent=t[btn.dataset.panel][0];$("pageSubtitle").textContent=t[btn.dataset.panel][1];if(btn.dataset.panel==="hull"&&renderer){const host=$("threeHost");camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);renderer.setSize(host.clientWidth,host.clientHeight);camera.updateProjectionMatrix();if(window._shipFrame)window._shipFrame();}}));
  [$("saveBtn"),$("saveBtn2")].forEach(b=>b.addEventListener("click",saveLocal));[$("exportJsonBtn"),$("exportJsonBtn2")].forEach(b=>b.addEventListener("click",exportJson));
  [$("importJsonInput"),$("importJsonInput2")].forEach(el=>el.addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;try{loadDesign(JSON.parse(await f.text()));}catch(err){alert("読み込みに失敗しました: "+err.message);}e.target.value="";}));
  $("resetDimsBtn").addEventListener("click",()=>{design={...structuredClone(defaults),members:design.members};applyInputs();markDirty();});
  $("addMemberBtn").addEventListener("click",()=>$("memberDialog").showModal());
  $("confirmMemberBtn").addEventListener("click",e=>{e.preventDefault();design.members.push({name:$("memberName").value.trim()||"部材",type:$("memberType").value,x:Number($("memberX").value)||0,z:Number($("memberZ").value)||0,count:Math.max(1,Number($("memberCount").value)||1)});$("memberDialog").close();markDirty();renderMembers();});
  try{const saved=localStorage.getItem("shipDesignStudio");if(saved)loadDesign(JSON.parse(saved));else applyInputs();}catch(e){applyInputs();}
  init3D();update3D();
  window.addEventListener("beforeunload",e=>{if($("saveStatus").textContent==="未保存の変更"){e.preventDefault();e.returnValue="";}});
})();