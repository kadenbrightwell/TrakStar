<!-- app.js (TrakStar v4, cleaned) -->
<script>
// --- TrakStar core (stable, no syntax landmines) ---
console.log("TrakStar app.js v4");

// ===== THEME LOAD =====
(function loadSavedTheme() {
  try {
    const aLight = localStorage.getItem('accentLight');
    const aDark  = localStorage.getItem('accentDark');
    const bLight = localStorage.getItem('bgLight');
    const bDark  = localStorage.getItem('bgDark');
    if (aLight) document.documentElement.style.setProperty('--accent', aLight);
    if (bLight) {
      document.documentElement.style.setProperty('--bg', bLight);
      document.body.style.background = bLight;
    }
    if (aDark || bDark) {
      let darkStyle = document.getElementById('theme-dark-style');
      if (!darkStyle) {
        darkStyle = document.createElement('style');
        darkStyle.id = 'theme-dark-style';
        document.head.appendChild(darkStyle);
      }
      darkStyle.textContent = `
        body.dark { --accent: ${aDark || '#8b5cf6'} !important; --bg: ${bDark || '#1a1a1a'} !important; }
      `;
      if (document.body.classList.contains('dark')) {
        if (aDark) document.documentElement.style.setProperty('--accent', aDark);
        if (bDark) {
          document.documentElement.style.setProperty('--bg', bDark);
          document.body.style.background = bDark;
        }
      }
    }
    if (localStorage.getItem("darkMode") === "true") document.body.classList.add("dark");
    else document.body.classList.remove("dark");
  } catch {}
})();
function updateInstantDarkBgStyle(newColor) {
  let style = document.getElementById("instant-dark-bg");
  if (!style) { style = document.createElement("style"); style.id = "instant-dark-bg"; document.head.appendChild(style); }
  style.textContent = `html.dark-pre, body.dark { background: ${newColor} !important; }`;
}

// ===== STORAGE + MIGRATION =====
const STORAGE_KEY = "items";
const LEGACY_KEY  = "trackers";
function migrateIfNeeded() {
  let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (items) return items;

  const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
  if (!Array.isArray(legacy)) return [];

  function convertList(list) {
    return (list || []).map(it => {
      if (it.type === "folder") {
        return { id: it.id || crypto.randomUUID(), type:"folder", name:it.name, color:it.color || "#888", expanded:true, children: convertList(it.children || []) };
      }
      if (it.type === "tracker") {
        if (it.trackerType === "countdown") {
          return { id: it.id || crypto.randomUUID(), type:"timer", name:it.name, color:it.color || "#6366f1", timerType:"single", target: it.endTime || (Date.now()+3600000), lastNotified:{} };
        }
        return { id: it.id || crypto.randomUUID(), type:"counter", name:it.name, color:it.color || "#6366f1", counterType: it.trackerType === "financial" ? "financial" : "numerical", value: Number(it.value)||0, transactions: Array.isArray(it.transactions)?it.transactions:[] };
      }
      return it;
    });
  }
  items = convertList(legacy);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  return items;
}
let data = migrateIfNeeded();

let saveQueued = false;
function save(now=false) {
  if (now) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem("autosave_snapshot", JSON.stringify({ at: Date.now(), data }));
    // keep a mirror for old key to avoid surprises
    localStorage.setItem(LEGACY_KEY, JSON.stringify(data));
    return;
  }
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => { saveQueued = false; save(true); }, 300);
}
setInterval(() => save(true), 15000);
if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(()=>{}); }

// ===== DOM HOOKS =====
const container      = document.getElementById("tracker-container");
const searchInput    = document.getElementById("search");
const clearSearchBtn = document.getElementById("clear-search");
const importInput    = document.getElementById("import-data");
const importBtn      = document.getElementById("import-btn");
const darkToggle     = document.getElementById("dark-toggle");
const menuBtn        = document.getElementById("menu-btn");
const menu           = document.getElementById("main-menu");
const fabBtn         = document.getElementById("fab-btn");
const fabActions     = document.getElementById("fab-actions");

// ===== HELPERS =====
function findItemById(id, items=data){
  for (const it of items) {
    if (it.id === id) return { item: it, parent: items };
    if (it.type === "folder") {
      const sub = findItemById(id, it.children || []);
      if (sub.item) return sub;
    }
  }
  return { item:null, parent:null };
}
function getAllFolders(list=data, acc=[]){ for(const it of list){ if(it.type==="folder"){ acc.push(it); getAllFolders(it.children||[], acc);} } return acc; }
function createInput(ph, type="text", value=""){ const el=document.createElement("input"); el.type=type; el.placeholder=ph; el.value=value; el.style.display="block"; el.style.marginBottom="10px"; return el; }
function createSelect(opts){ const s=document.createElement("select"); opts.forEach(([v,t])=>{const o=document.createElement("option"); o.value=v; o.textContent=t; s.appendChild(o);}); s.style.display="block"; s.style.marginBottom="10px"; return s; }
function comma(n, frac=2){ return Number(n).toLocaleString(undefined,{minimumFractionDigits:frac, maximumFractionDigits:frac}); }
function formatCounterValue(c){ if(c.counterType==="financial") return "$"+comma(c.value,2); if(c.counterType==="percentage") return comma(c.value,4)+"%"; return comma(c.value,2); }
function formatDuration(ms){
  const total = Math.max(0, Math.floor(ms/1000));
  const d = Math.floor(total/86400), h=Math.floor((total%86400)/3600), m=Math.floor((total%3600)/60), s=total%60;
  const parts=[]; if(d>0) parts.push(`${d}D`); parts.push(`${h}H`, `${m}M`, `${s}S`); return parts.join(" ");
}

// ===== GENERIC MODAL =====
function closeAnyModals(){ document.querySelectorAll('.modal-backdrop, .trakstar-modal').forEach(e=>{ e.style.opacity=0; setTimeout(()=>e.remove(),210); }); }
function createModal(title, nodes, onOk){
  closeAnyModals();
  const back = document.createElement("div"); back.className="modal-backdrop"; back.onclick = ()=>{ back.remove(); modal.remove(); };
  const modal = document.createElement("div"); modal.className="trakstar-modal";
  const h3 = document.createElement("h3"); h3.textContent = title; modal.appendChild(h3);
  nodes.forEach(n => modal.appendChild(n));
  const row = document.createElement("div"); row.style.textAlign="right"; row.style.marginTop="10px";
  const cancel = document.createElement("button"); cancel.textContent="Cancel"; cancel.onclick = ()=>{ back.remove(); modal.remove(); };
  const ok = document.createElement("button"); ok.textContent="OK"; ok.style.marginLeft="10px"; ok.onclick = ()=>{ if(onOk) onOk(ok); back.remove(); modal.remove(); };
  row.append(cancel, ok); modal.appendChild(row);
  modal.onclick = e=>e.stopPropagation();
  document.body.append(back, modal);
}

// ===== ADD / EDIT: Folders =====
function createFolderSelect(excludeId, descendants=[]){
  const select = document.createElement("select");
  const none = document.createElement("option"); none.value=""; none.textContent="— No Folder —"; select.appendChild(none);
  (function add(items, prefix=""){
    for(const it of items){
      if(it.type==="folder" && it.id!==excludeId && !descendants.includes(it.id)){
        const o=document.createElement("option"); o.value=it.id; o.textContent=prefix+it.name; select.appendChild(o);
        add(it.children||[], prefix+"— ");
      }
    }
  })(data);
  select.style.display="block"; select.style.marginBottom="10px";
  return select;
}
function getDescendantFolderIds(folder){
  let ids=[];
  for(const ch of (folder.children||[])){
    if(ch.type==="folder"){ ids.push(ch.id, ...getDescendantFolderIds(ch)); }
  }
  return ids;
}
function addFolderModal(parentId=null, after=null){
  const name=createInput("Folder name"), color=createInput("Color","color","#888"), dest=createFolderSelect();
  if(parentId) dest.value=parentId;
  createModal("Add Folder", [name,color,dest], ()=>{
    if(!name.value.trim()) return alert("Name is required");
    const folder = { id:crypto.randomUUID(), type:"folder", name:name.value.trim(), color:color.value||"#888", expanded:true, children:[] };
    const parent = dest.value ? findItemById(dest.value).item : null;
    (parent?.children || data).push(folder);
    save(true); render(); if(after) after();
  });
}
function editFolderModal(id){
  const { item:folder, parent:oldParent } = findItemById(id); if(!folder) return;
  const name=createInput("Name","text",folder.name), color=createInput("Color","color",folder.color||"#888");
  const sel = createFolderSelect(folder.id, getDescendantFolderIds(folder));
  // current parent
  let current=""; getAllFolders().forEach(f=>{ if((f.children||[]).includes(folder)) current=f.id; }); sel.value=current||"";
  createModal("Edit Folder", [name,color,sel], ()=>{
    if(!name.value.trim()) return alert("Folder name is required");
    folder.name=name.value.trim(); folder.color=color.value||"#888";
    let newParentArr=data;
    if(sel.value){ const p=findItemById(sel.value).item; if(p&&p.children) newParentArr=p.children; }
    if(newParentArr!==oldParent){ const idx=oldParent.indexOf(folder); if(idx>-1) oldParent.splice(idx,1); newParentArr.push(folder); }
    save(true); render();
  });
}

// ===== ADD / EDIT: Counters =====
function addCounterModal(parentId=null, after=null){
  const name=createInput("Counter name"), type=createSelect([["numerical","Numerical"],["financial","Financial ($)"],["percentage","Percentage (%)"]]);
  const value=createInput("Initial value","number","0"), color=createInput("Color","color","#6366f1"), dest=createFolderSelect();
  if(parentId) dest.value=parentId;
  createModal("Add Counter", [name,type,value,color,dest], ()=>{
    if(!name.value.trim()) return alert("Name is required");
    const v = Number(value.value||0); const counter={ id:crypto.randomUUID(), type:"counter", name:name.value.trim(), color:color.value||"#6366f1", counterType:type.value, value:isNaN(v)?0:v, transactions:[] };
    const parent = dest.value ? findItemById(dest.value).item : null;
    (parent?.children || data).push(counter);
    save(true); render(); if(after) after();
  });
}
function editCounterModal(id){
  const { item:counter, parent:oldParent } = findItemById(id); if(!counter) return;
  const name=createInput("Name","text",counter.name), type=createSelect([["numerical","Numerical"],["financial","Financial ($)"],["percentage","Percentage (%)"]]);
  type.value=counter.counterType;
  const value=createInput("Value","number", String(counter.value)), color=createInput("Color","color",counter.color||"#6366f1"), dest=createFolderSelect(id);
  let current=""; getAllFolders().forEach(f=>{ if((f.children||[]).includes(counter)) current=f.id; }); dest.value=current||"";
  createModal("Edit Counter",[name,type,value,color,dest], ()=>{
    if(!name.value.trim()) return alert("Name is required");
    const v=Number(value.value); if(isNaN(v)) return alert("Value must be a number");
    counter.name=name.value.trim(); counter.counterType=type.value; counter.value=v; counter.color=color.value||"#6366f1";
    let newParentArr=data; if(dest.value){ const p=findItemById(dest.value).item; if(p&&p.children) newParentArr=p.children; }
    if(newParentArr!==oldParent){ const idx=oldParent.indexOf(counter); if(idx>-1) oldParent.splice(idx,1); newParentArr.push(counter); }
    save(true); render();
  });
}
function openTransactions(id){
  const { item:counter } = findItemById(id); if(!counter || counter.type!=="counter") return;
  const wrap=document.createElement("div");
  wrap.innerHTML = `<h3>${counter.name} Transactions</h3>` + (counter.transactions||[]).slice().reverse().map(t=>{
    const s=new Date(t.time).toLocaleString(); const amt=t.amount>0?"+":""; return `<div><strong>${s}</strong>: ${amt}${Number(t.amount).toFixed(2)} ${t.note?`<em>— ${t.note}</em>`:""}</div>`;
  }).join("") || "<em>No transactions</em>";
  const add=document.createElement("button"); add.textContent="+ Add";
  const close=document.createElement("button"); close.textContent="Close"; close.style.marginLeft="10px";
  add.onclick = ()=>{
    const amount=parseFloat(prompt("Amount (+/-):")); if(isNaN(amount)) return alert("Invalid amount");
    const note=prompt("Note:"); counter.transactions=counter.transactions||[]; counter.transactions.push({amount, note, time:Date.now()}); counter.value += amount;
    save(true); render(); closeAnyModals(); openTransactions(id);
  };
  close.onclick = ()=> closeAnyModals();
  wrap.append(document.createElement("br"), add, close);
  createModal("Transactions", [wrap], null);
}

// ===== ADD / EDIT: Timers =====
function addTimerModal(parentId=null, after=null){
  const name=createInput("Timer name"), type=createSelect([["single","Single Timer"],["range","Range Timer (start & end)"],["repeat","Repeat Timer"]]);
  const color=createInput("Color","color","#6366f1"), dest=createFolderSelect(); if(parentId) dest.value=parentId;
  const singleEnd=createInput("End (YYYY-MM-DDTHH:MM)","datetime-local",""), rangeStart=createInput("Start (YYYY-MM-DDTHH:MM)","datetime-local",""), rangeEnd=createInput("End (YYYY-MM-DDTHH:MM)","datetime-local","");
  const repeatWhen=createInput("First Occurrence (YYYY-MM-DDTHH:MM)","datetime-local",""), repeatKind=createSelect([["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"],["yearly","Yearly"],["weekday","Every Weekday (Mon–Fri)"]]);
  const repeatInterval=createInput("Repeat interval","number","1");
  function showBits(){
    singleEnd.style.display = type.value==="single" ? "block":"none";
    rangeStart.style.display = rangeEnd.style.display = type.value==="range" ? "block":"none";
    repeatWhen.style.display = repeatKind.style.display = repeatInterval.style.display = type.value==="repeat" ? "block":"none";
  }
  type.onchange=showBits; showBits();

  createModal("Add Timer",[name,type,singleEnd,rangeStart,rangeEnd,repeatWhen,repeatKind,repeatInterval,color,dest], ()=>{
    if(!name.value.trim()) return alert("Name is required");
    const t={ id:crypto.randomUUID(), type:"timer", name:name.value.trim(), color:color.value||"#6366f1", timerType:type.value, lastNotified:{} };
    if(type.value==="single"){ if(!singleEnd.value) return alert("Please set an end time"); t.target=new Date(singleEnd.value).getTime(); }
    else if(type.value==="range"){ if(!rangeStart.value||!rangeEnd.value) return alert("Please set start and end"); t.start=new Date(rangeStart.value).getTime(); t.end=new Date(rangeEnd.value).getTime(); }
    else { if(!repeatWhen.value) return alert("Please set the first occurrence"); t.rule={kind:repeatKind.value, interval:Math.max(1,Number(repeatInterval.value||1))}; t.next=new Date(repeatWhen.value).getTime(); }
    const parent = dest.value ? findItemById(dest.value).item : null; (parent?.children || data).push(t);
    save(true); render(); scheduleAllNotifications(); if(after) after();
  });
}
function editTimerModal(id){
  const { item:timer, parent:oldParent } = findItemById(id); if(!timer) return;
  const name=createInput("Name","text",timer.name), type=createSelect([["single","Single Timer"],["range","Range Timer"],["repeat","Repeat Timer"]]); type.value=timer.timerType||"single";
  const color=createInput("Color","color",timer.color||"#6366f1"), dest=createFolderSelect(id);
  const singleEnd=createInput("End","datetime-local", timer.timerType==="single" && timer.target ? new Date(timer.target).toISOString().slice(0,16) : "");
  const rangeStart=createInput("Start","datetime-local", timer.timerType==="range" && timer.start ? new Date(timer.start).toISOString().slice(0,16) : "");
  const rangeEnd  =createInput("End","datetime-local",   timer.timerType==="range" && timer.end   ? new Date(timer.end).toISOString().slice(0,16) : "");
  const repeatWhen=createInput("Next Occurrence","datetime-local", timer.timerType==="repeat" && timer.next ? new Date(timer.next).toISOString().slice(0,16) : "");
  const repeatKind=createSelect([["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"],["yearly","Yearly"],["weekday","Every Weekday (Mon–Fri)"]]); repeatKind.value=(timer.rule&&timer.rule.kind)||"daily";
  const repeatInterval=createInput("Repeat interval","number", String((timer.rule&&timer.rule.interval)||1));
  function showBits(){
    singleEnd.style.display = type.value==="single" ? "block":"none";
    rangeStart.style.display = rangeEnd.style.display = type.value==="range" ? "block":"none";
    repeatWhen.style.display = repeatKind.style.display = repeatInterval.style.display = type.value==="repeat" ? "block":"none";
  }
  type.onchange=showBits; showBits();
  // current parent
  let current=""; getAllFolders().forEach(f=>{ if((f.children||[]).includes(timer)) current=f.id; }); dest.value=current||"";
  createModal("Edit Timer",[name,type,singleEnd,rangeStart,rangeEnd,repeatWhen,repeatKind,repeatInterval,color,dest], ()=>{
    if(!name.value.trim()) return alert("Name is required");
    timer.name=name.value.trim(); timer.color=color.value||"#6366f1"; timer.timerType=type.value; timer.lastNotified=timer.lastNotified||{};
    if(type.value==="single"){ if(!singleEnd.value) return alert("Please set an end time"); timer.target=new Date(singleEnd.value).getTime(); delete timer.start; delete timer.end; delete timer.rule; delete timer.next; }
    else if(type.value==="range"){ if(!rangeStart.value||!rangeEnd.value) return alert("Please set start and end"); timer.start=new Date(rangeStart.value).getTime(); timer.end=new Date(rangeEnd.value).getTime(); delete timer.target; delete timer.rule; delete timer.next; }
    else { if(!repeatWhen.value) return alert("Please set the next occurrence"); timer.rule={kind:repeatKind.value, interval:Math.max(1,Number(repeatInterval.value||1))}; timer.next=new Date(repeatWhen.value).getTime(); delete timer.start; delete timer.end; delete timer.target; }
    let newParentArr=data; if(dest.value){ const p=findItemById(dest.value).item; if(p&&p.children) newParentArr=p.children; }
    if(newParentArr!==oldParent){ const idx=oldParent.indexOf(timer); if(idx>-1) oldParent.splice(idx,1); newParentArr.push(timer); }
    save(true); render(); scheduleAllNotifications();
  });
}

// ===== RENDER =====
function folderStats(folder){
  let dF=0,sF=0,dC=0,sC=0,dT=0,sT=0;
  (function walk(children, top=false){
    for(const ch of (children||[])){
      if(ch.type==="folder"){ top?dF++:sF++; walk(ch.children||[], false); }
      else if(ch.type==="counter"){ top?dC++:sC++; }
      else if(ch.type==="timer"){ top?dT++:sT++; }
    }
  })(folder.children||[], true);
  return `(${dF}F${sF}-${dC}C${sC}-${dT}T${sT})`;
}
function createFolderCard(folder){
  const el=document.createElement("div"); el.className="folder-card"; el.dataset.id=folder.id; el.style.borderLeftColor=folder.color||"#888";
  const left=document.createElement("div"); left.className="folder-header";
  const title=document.createElement("div"); title.innerHTML=`<span class="item-title">${folder.name}</span> <span class="small-muted">${folderStats(folder)}</span>`;
  left.appendChild(title);
  const btns=document.createElement("div"); btns.className="btn-div";
  const open=document.createElement("button"); open.textContent="📂"; open.title="Open"; open.onclick=()=>openFolderModal(folder.id);
  const edit=document.createElement("button"); edit.textContent="✏️"; edit.title="Edit"; edit.onclick=(e)=>{ e.stopPropagation(); editFolderModal(folder.id); };
  const del=document.createElement("button"); del.className="delete"; del.textContent="🗑️"; del.title="Delete"; del.onclick=(e)=>{ e.stopPropagation(); deleteItem(folder.id); };
  btns.append(open,edit,del); el.append(left,btns); return el;
}
function createCounterCard(counter){
  const el=document.createElement("div"); el.className="item-card"; el.dataset.id=counter.id; el.style.borderLeftColor=counter.color||"#6366f1";
  const title=document.createElement("div"); title.className="item-header";
  const left=document.createElement("div"); left.innerHTML=`<div class="item-title">${counter.name}</div><div class="item-sub small-muted">${counter.counterType}</div>`;
  const right=document.createElement("div"); right.textContent=formatCounterValue(counter); right.className="item-title";
  const btns=document.createElement("div"); btns.className="btn-div";
  const tx=document.createElement("button"); tx.textContent="📊"; tx.title="Transactions"; tx.onclick=()=>openTransactions(counter.id);
  const edit=document.createElement("button"); edit.textContent="✏️"; edit.onclick=()=>editCounterModal(counter.id);
  const del=document.createElement("button"); del.className="delete"; del.textContent="🗑️"; del.onclick=()=>deleteItem(counter.id);
  btns.append(tx,edit,del); title.append(left,right);
  el.append(title, btns); return el;
}
function createTimerCard(timer){
  const el=document.createElement("div"); el.className="item-card"; el.dataset.id=timer.id; el.dataset.timer="1"; el.style.borderLeftColor=timer.color||"#6366f1";
  const header=document.createElement("div"); header.className="item-header";
  const left=document.createElement("div"); left.innerHTML=`<div class="item-title">${timer.name}</div><div class="item-sub small-muted">${timer.timerType}</div>`;
  const btns=document.createElement("div"); btns.className="btn-div";
  const edit=document.createElement("button"); edit.textContent="✏️"; edit.onclick=()=>editTimerModal(timer.id);
  const del=document.createElement("button"); del.className="delete"; del.textContent="🗑️"; del.onclick=()=>deleteItem(timer.id);
  btns.append(edit,del); header.append(left,btns);
  const line=document.createElement("div"); line.className="count-line";
  const sub=document.createElement("div"); sub.className="small-muted";
  el.append(header, line, sub);
  (function refresh(){
    const now=Date.now();
    if(timer.timerType==="single"){
      const diff=timer.target-now;
      if(diff<=0){ line.textContent="⏰ Completed"; sub.textContent=new Date(timer.target).toLocaleString(); }
      else { line.textContent=formatDuration(diff); sub.textContent=`Target: ${new Date(timer.target).toLocaleString()}`; }
    } else if(timer.timerType==="range"){
      const toStart=timer.start-now, toEnd=timer.end-now;
      line.textContent = `${toStart>0?formatDuration(toStart):"Started"} - ${toEnd>0?formatDuration(toEnd):"Ended"}`;
      sub.textContent = `${new Date(timer.start).toLocaleString()} → ${new Date(timer.end).toLocaleString()}`;
    } else {
      const diff=timer.next-now; line.textContent = diff<=0 ? "⏰ Occurrence due" : formatDuration(diff);
      sub.textContent=`Next: ${new Date(timer.next).toLocaleString()} (${timer.rule.kind}, every ${timer.rule.interval})`;
    }
  })();
  return el;
}
function renderTree(items, filter=""){
  const f=filter.toLowerCase().trim(); const frag=document.createDocumentFragment();
  items.forEach(it=>{
    if(it.type==="folder"){
      const matches=it.name.toLowerCase().includes(f); const children=(it.children||[]).filter(Boolean);
      const sub = buildTree(children, f);
      if(matches || sub.length){ const card=createFolderCard({...it, children: sub}); frag.appendChild(card); }
    } else if(it.type==="counter"){
      if(it.name.toLowerCase().includes(f) || String(it.value).includes(f)) frag.appendChild(createCounterCard(it));
    } else if(it.type==="timer"){
      if(it.name.toLowerCase().includes(f)) frag.appendChild(createTimerCard(it));
    }
  });
  return frag;
}
function buildTree(items, f){
  return items.map(x=>{
    if(x.type==="folder"){ return { ...x, children: buildTree(x.children||[], f) }; }
    return x;
  }).filter(it=>{
    if(it.type==="folder") return it.name.toLowerCase().includes(f) || (it.children||[]).length>0;
    if(it.type==="counter") return it.name.toLowerCase().includes(f) || String(it.value).includes(f);
    if(it.type==="timer") return it.name.toLowerCase().includes(f);
    return false;
  });
}
function render(){
  container.innerHTML = "";
  const filtered = buildTree(data, (searchInput.value||"").toLowerCase());
  container.appendChild(renderTree(filtered));
  initializeDragAndDrop();
}

// ===== Folder Overlay (drill-in) =====
function buildBreadcrumbs(folderId){
  let crumbs=[];
  (function walk(list, trail){
    for(const it of list){
      if(it.id===folderId){ crumbs=[...trail, it]; return true; }
      if(it.type==="folder" && (it.children||[]).length){ if(walk(it.children, [...trail, it])) return true; }
    }
  })(data, []);
  return crumbs;
}
function openFolderModal(folderId){
  closeAnyModals();
  const { item:folder } = findItemById(folderId); if(!folder) return;
  const backdrop=document.createElement("div"); backdrop.className="modal-backdrop";
  const modal=document.createElement("div"); modal.className="trakstar-modal";
  Object.assign(modal.style,{width:"100vw",maxWidth:"100vw",height:"100vh",maxHeight:"100vh",left:"0",top:"0",transform:"none",borderRadius:"0",padding:"0",overflowY:"auto",display:"flex",flexDirection:"column"});
  const header=document.createElement("div"); Object.assign(header.style,{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--accent)",color:"white",padding:"16px 14px",fontSize:"1.1em"});
  const crumbs=buildBreadcrumbs(folderId); const backHtml = crumbs.length>1 ? "←" : "✕";
  header.innerHTML = `<button style="background:none;border:none;color:white;font-size:1.3em;" id="close-folder-modal">${backHtml}</button><span>${folder.name} <span class="small-muted">${folderStats(folder)}</span></span><span></span>`;
  const breadcrumbsEl=document.createElement("div"); breadcrumbsEl.className="breadcrumbs";
  crumbs.forEach((it,idx)=>{ const s=document.createElement("span"); s.textContent=it.name; if(idx<crumbs.length-1) s.onclick=()=>{ document.body.removeChild(backdrop); document.body.removeChild(modal); openFolderModal(it.id); }; breadcrumbsEl.appendChild(s); });

  const content=document.createElement("div"); Object.assign(content.style,{flex:"1",padding:"16px 14px",overflowY:"auto"});
  (folder.children||[]).forEach(ch=>{ if(ch.type==="folder") content.appendChild(createFolderCard(ch)); });
  (folder.children||[]).forEach(ch=>{ if(ch.type==="counter") content.appendChild(createCounterCard(ch)); });
  (folder.children||[]).forEach(ch=>{ if(ch.type==="timer") content.appendChild(createTimerCard(ch)); });

  const btns=document.createElement("div"); btns.style.display="flex"; btns.style.gap="8px"; btns.style.padding="16px 14px";
  const addCounterBtn=document.createElement("button"); addCounterBtn.textContent="Add Counter"; addCounterBtn.onclick=e=>{ e.stopPropagation(); addCounterModal(folder.id, ()=>{ document.body.removeChild(backdrop); document.body.removeChild(modal); openFolderModal(folder.id); }); };
  const addTimerBtn=document.createElement("button"); addTimerBtn.textContent="Add Timer"; addTimerBtn.onclick=e=>{ e.stopPropagation(); addTimerModal(folder.id, ()=>{ document.body.removeChild(backdrop); document.body.removeChild(modal); openFolderModal(folder.id); }); };
  const addFolderBtn=document.createElement("button"); addFolderBtn.textContent="Add Folder"; addFolderBtn.onclick=e=>{ e.stopPropagation(); addFolderModal(folder.id, ()=>{ document.body.removeChild(backdrop); document.body.removeChild(modal); openFolderModal(folder.id); }); };
  btns.append(addCounterBtn, addTimerBtn, addFolderBtn);

  modal.append(header, breadcrumbsEl, content, btns);
  backdrop.onclick = ()=>{ backdrop.remove(); modal.remove(); };
  modal.onclick = e=>e.stopPropagation();
  document.body.append(backdrop, modal);
}

// ===== Delete =====
function deleteItem(id){
  const { item, parent } = findItemById(id); if(!item) return;
  if(!confirm(`Delete "${item.name}"?`)) return;
  const idx = parent.indexOf(item); if(idx>-1) parent.splice(idx,1);
  save(true); render();
}

// ===== Drag & Drop =====
function initializeDragAndDrop(){
  if (!window.Sortable) return;
  const el = document.getElementById("tracker-container");
  if (!el._sortableApplied) {
    new Sortable(el, {
      animation: 150,
      ghostClass: "ghost",
      onEnd: () => { save(true); render(); }
    });
    el._sortableApplied = true;
  }
}

// ===== Live countdown + notifications =====
function nextRepeatTime(rule, from){
  const dt=new Date(from), n=Math.max(1, rule.interval||1);
  switch(rule.kind){
    case "weekday": { let t=new Date(from).getTime(); do{ t+=86400e3; } while(!([1,2,3,4,5].includes(new Date(t).getDay()))); return t; }
    case "daily":   return (dt.setDate(dt.getDate()+n), dt.getTime());
    case "weekly":  return (dt.setDate(dt.getDate()+7*n), dt.getTime());
    case "monthly": return (dt.setMonth(dt.getMonth()+n), dt.getTime());
    case "yearly":  return (dt.setFullYear(dt.getFullYear()+n), dt.getTime());
    default:        return from + 86400e3;
  }
}
function canNotify(){ return ("Notification" in window) && Notification.permission==="granted" && navigator.serviceWorker && navigator.serviceWorker.controller; }
function requestNotifyPermission(){ if(!("Notification" in window)) return; if(Notification.permission!=="granted") Notification.requestPermission(); }
function showSWNotification(title, body, tag){
  if(!navigator.serviceWorker) return;
  navigator.serviceWorker.ready.then(reg => {
    if (reg.active) reg.active.postMessage({ type:"showNotification", title, body, tag });
    else if (reg.showNotification) reg.showNotification(title, { body, tag, icon:"icon.png", badge:"icon.png" });
  });
}
function scheduleAllNotifications(){} // driven by poll below
setInterval(()=>{
  const now=Date.now();
  data.forEach(it=>{
    if(it.type!=="timer") return;
    it.lastNotified=it.lastNotified||{};
    if(it.timerType==="single"){
      if(now>=it.target && !it.lastNotified.done){ if(canNotify()) showSWNotification(`Timer "${it.name}"`,"Completed.", it.id+"single"); it.lastNotified.done=true; save(); }
    } else if(it.timerType==="range"){
      if(!it.lastNotified.rangeStart && now>=it.start){ if(canNotify()) showSWNotification(`Range "${it.name}"`,"Start reached.", it.id+"start"); it.lastNotified.rangeStart=true; save(); }
      if(!it.lastNotified.rangeEnd && now>=it.end){ if(canNotify()) showSWNotification(`Range "${it.name}"`,"End reached.", it.id+"end"); it.lastNotified.rangeEnd=true; save(); }
    } else if(it.timerType==="repeat"){
      if(now>=it.next-500){ if(canNotify()) showSWNotification(`Repeat "${it.name}"`,"Occurrence reached.", it.id+"repeat"); it.next=nextRepeatTime(it.rule, it.next); save(true); render(); }
    }
  });
}, 1000);

// ===== Settings (dark mode + colors) =====
function initDarkMode(){ const saved=localStorage.getItem("darkMode"); if(saved==="true") document.body.classList.add("dark"); updateDarkToggleText(); }
function toggleDarkMode(){ document.body.classList.toggle("dark"); const isDark=document.body.classList.contains("dark"); localStorage.setItem("darkMode", isDark); updateDarkToggleText(); }
function updateDarkToggleText(){ darkToggle.textContent = document.body.classList.contains("dark") ? "☀️" : "🌓"; }
darkToggle.addEventListener("click", toggleDarkMode); initDarkMode();

document.getElementById("settings-btn").onclick = openSettingsModal;
function openSettingsModal(){
  closeAnyModals();
  const defaults={ accentLight:'#6366f1', accentDark:'#8b5cf6', bgLight:'#f5f7fa', bgDark:'#1a1a1a' };
  const accentLight=localStorage.getItem('accentLight')||defaults.accentLight, accentDark=localStorage.getItem('accentDark')||defaults.accentDark;
  const bgLight=localStorage.getItem('bgLight')||defaults.bgLight, bgDark=localStorage.getItem('bgDark')||defaults.bgDark;

  const modal=document.createElement('div'); modal.className='trakstar-modal'; modal.style.minWidth='350px';
  const accentRow=document.createElement('div'); accentRow.innerHTML = `<div><b>Accent</b></div><input id="accent-light" type="color" value="${accentLight}" /><input id="accent-dark" type="color" value="${accentDark}" />`;
  const bgRow=document.createElement('div'); bgRow.innerHTML = `<div><b>Background</b></div><input id="bg-light" type="color" value="${bgLight}" /><input id="bg-dark" type="color" value="${bgDark}" />`;
  const modeRow=document.createElement('div'); modeRow.innerHTML = `<div><b>Mode</b></div><button id="mode-toggle">${document.body.classList.contains('dark')?'Light':'Dark'}</button>`;
  modeRow.querySelector('#mode-toggle').onclick = ()=>{ toggleDarkMode(); modeRow.querySelector('#mode-toggle').textContent = document.body.classList.contains('dark') ? 'Light' : 'Dark'; };

  const notifRow=document.createElement('div'); notifRow.innerHTML = `<label><input id="notif-toggle" type="checkbox" ${("Notification" in window && Notification.permission==="granted")?'checked':''}/> Enable Notifications</label>`;
  notifRow.querySelector('#notif-toggle').onchange = (e)=>{ if(e.target.checked) requestNotifyPermission(); };

  const btnRow=document.createElement('div'); btnRow.style.textAlign='right'; btnRow.style.marginTop='12px';
  const close=document.createElement('button'); close.textContent='Close'; close.onclick=()=>{ back.remove(); modal.remove(); };
  btnRow.append(close);

  function applyThemeVars(){
    const aLight=document.getElementById('accent-light').value, aDark=document.getElementById('accent-dark').value, bLight=document.getElementById('bg-light').value, bDark=document.getElementById('bg-dark').value;
    localStorage.setItem('accentLight',aLight); localStorage.setItem('accentDark',aDark); localStorage.setItem('bgLight',bLight); localStorage.setItem('bgDark',bDark);
    document.documentElement.style.setProperty('--accent', aLight); document.documentElement.style.setProperty('--bg', bLight);
    if(!document.body.classList.contains("dark")) document.body.style.background=bLight;
    let darkStyle=document.getElementById('theme-dark-style'); if(!darkStyle){ darkStyle=document.createElement('style'); darkStyle.id='theme-dark-style'; document.head.appendChild(darkStyle); }
    darkStyle.textContent=`body.dark { --accent:${aDark} !important; --bg:${bDark} !important; }`; updateInstantDarkBgStyle(bDark);
    if(document.body.classList.contains('dark')){ document.documentElement.style.setProperty('--accent', aDark); document.documentElement.style.setProperty('--bg', bDark); document.body.style.background=bDark; }
    render();
  }
  accentRow.querySelector('#accent-light').oninput=applyThemeVars;
  accentRow.querySelector('#accent-dark').oninput=applyThemeVars;
  bgRow.querySelector('#bg-light').oninput=applyThemeVars;
  bgRow.querySelector('#bg-dark').oninput=applyThemeVars;

  modal.append(accentRow, bgRow, modeRow, notifRow, btnRow);
  const back=document.createElement("div"); back.className="modal-backdrop"; back.onclick=()=>{ back.remove(); modal.remove(); };
  modal.onclick = e=>e.stopPropagation(); document.body.append(back, modal); applyThemeVars();
}

// ===== MENU / FAB / SEARCH / IMPORT-EXPORT / CLOUD =====
menuBtn.onclick = e => { e.stopPropagation(); menu.style.display = (menu.style.display === "none" || !menu.style.display) ? "flex" : "none"; };
window.addEventListener("click", () => { if (menu.style.display !== "none") menu.style.display = "none"; });
menu.onclick = e => e.stopPropagation();

searchInput.oninput = () => { render(); clearSearchBtn.style.display = searchInput.value ? "inline" : "none"; };
clearSearchBtn.onclick = () => { searchInput.value=""; render(); clearSearchBtn.style.display="none"; searchInput.focus(); };

fabBtn.onclick = (e) => {
  e.stopPropagation();
  const isActive = !fabActions.classList.contains("fab-active");
  if (isActive) { fabActions.style.display="flex"; requestAnimationFrame(()=> fabActions.classList.add("fab-active")); }
  else { fabActions.classList.remove("fab-active"); setTimeout(()=>{ fabActions.style.display="none"; }, 200); }
};
window.addEventListener("click", () => { fabActions.classList.remove("fab-active"); fabActions.style.display="none"; });
fabActions.onclick = e => e.stopPropagation();
document.getElementById("add-folder").onclick  = () => { addFolderModal();  fabActions.classList.remove("fab-active"); fabActions.style.display="none"; };
document.getElementById("add-counter").onclick = () => { addCounterModal(); fabActions.classList.remove("fab-active"); fabActions.style.display="none"; };
document.getElementById("add-timer").onclick   = () => { addTimerModal();   fabActions.classList.remove("fab-active"); fabActions.style.display="none"; };

// Export / Import
document.getElementById("export-data").onclick = ()=>{
  const blob = new Blob([JSON.stringify(data)], { type:"application/json" });
  const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="trakstar_backup.json"; a.click(); URL.revokeObjectURL(url);
};
importBtn.onclick = ()=> importInput.click();
importInput.onchange = e=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try {
      const imported=JSON.parse(reader.result);
      if(Array.isArray(imported) && imported.every(x=>typeof x==="object" && x.type)){ data=imported; save(true); render(); scheduleAllNotifications(); alert("Import successful!"); }
      else alert("Invalid format");
    } catch { alert("Could not import"); }
  };
  reader.readAsText(file);
};

// Clear all
document.getElementById("clear-all-trackers").onclick = ()=>{
  if(!confirm("This will delete ALL items and folders. Are you absolutely sure?")) return;
  data=[]; save(true); render(); scheduleAllNotifications();
};

// ===== Cloud via Worker (kept) =====
const BACKEND_URL = (document.querySelector('meta[name="trakstar-backend"]')?.content) || window.BACKEND_URL || 'https://trakstar-backend.krb52.workers.dev';
async function cloudSaveToGit(id,payload){ const res=await fetch(`${BACKEND_URL}/id/save`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,data:payload})}); if(!res.ok) throw new Error(await res.text()); }
async function cloudLoadFromGit(id){ const res=await fetch(`${BACKEND_URL}/id/load?id=${encodeURIComponent(id)}`); if(!res.ok) throw new Error('ID not found'); return res.json(); }
async function cloudDeleteToArchive(id){ const res=await fetch(`${BACKEND_URL}/id/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); if(!res.ok) throw new Error(await res.text()); return res.json(); }
async function cloudRestoreLatest(id){ const res=await fetch(`${BACKEND_URL}/id/restore`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); if(!res.ok) throw new Error(await res.text()); return res.json(); }
document.getElementById("cloud-save").onclick = async ()=>{ const id=prompt("Enter your unique ID:"); if(!id) return; try{ await cloudSaveToGit(id, data); alert("Saved to your private GitHub. Use this ID to load from any device: "+id); } catch(e){ alert("Cloud save failed: "+e.message);} };
document.getElementById("cloud-load").onclick = async ()=>{ const id=prompt("Enter the ID to load:"); if(!id) return; try{ const blob=await cloudLoadFromGit(id); if(Array.isArray(blob)&&typeof blob[0]==="object"){ data=blob; save(true); render(); scheduleAllNotifications(); alert("Loaded!"); } else throw new Error("Invalid data format"); } catch(e){ alert("Cloud load failed: "+e.message);} };
document.getElementById("delete-id").onclick = async ()=>{ const id=prompt("Enter the ID to archive (delete):"); if(!id) return; try{ const out=await cloudDeleteToArchive(id); alert(`Moved "${id}" to archive as "${out.archivedAs}".`);} catch(e){ alert("Delete/archive failed: "+e.message);} };
document.getElementById("restore-id").onclick = async ()=>{ const id=prompt("Enter the ID to restore (e.g., dans_list_1):"); if(!id) return; try{ const out=await cloudRestoreLatest(id); alert(`Restored "${id}" from "${out.restoredFrom}".`);} catch(e){ alert("Restore failed: "+e.message);} };

// ===== TrakStar <-> Bank bridge =====
(function exposeBridge(){
  function walkCounters(list, out=[]){ for(const it of list){ if(it.type==='counter') out.push(it); else if(it.type==='folder') walkCounters(it.children||[], out); } return out; }
  window.TrakStar = window.TrakStar || {};
  window.TrakStar.getCounters = () => walkCounters(data).map(c => ({ id:c.id, name:c.name, counterType:c.counterType }));
  window.TrakStar.updateCounterValue = (id, newValue, isBank=false) => {
    const found=(function find(items){ for(const it of items){ if(it.id===id) return it; if(it.type==='folder'){ const f=find(it.children||[]); if(f) return f; } } return null; })(data);
    if(found && found.type==='counter' && typeof newValue==='number' && !Number.isNaN(newValue)){ found.value=newValue; if(isBank) found.counterType='financial'; save(true); render(); }
  };
})();

// ===== Kick it off =====
render();
scheduleAllNotifications();
</script>
