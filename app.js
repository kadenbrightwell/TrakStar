console.log("TrakStar app.js loaded");

/* =========================
   THEME LOAD (kept from your app)
   ========================= */
(function loadSavedTheme() {
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
})();
function updateInstantDarkBgStyle(newColor) {
  let style = document.getElementById("instant-dark-bg");
  if (!style) { style = document.createElement("style"); style.id = "instant-dark-bg"; document.head.appendChild(style); }
  style.textContent = `html.dark-pre, body.dark { background: ${newColor} !important; }`;
}

/* =========================
   STORAGE + MIGRATION
   ========================= */
const STORAGE_KEY = "items"; // new
const LEGACY_KEY  = "trackers"; // old
function migrateIfNeeded() {
  let items = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (items) return items;

  // Try legacy "trackers" structure and convert
  const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
  if (!Array.isArray(legacy)) return [];

  function convertList(list) {
    return (list || []).map(it => {
      if (it.type === "folder") {
        return { id: it.id || crypto.randomUUID(), type: "folder", name: it.name, color: it.color || "#888", expanded: true, children: convertList(it.children || []) };
      }
      if (it.type === "tracker") {
        if (it.trackerType === "countdown") {
          // single timer
          return {
            id: it.id || crypto.randomUUID(),
            type: "timer",
            name: it.name,
            color: it.color || "#6366f1",
            timerType: "single",
            target: it.endTime || (Date.now() + 3600000), // fallback
            lastNotified: {}
          };
        }
        // numerical/financial -> counter
        return {
          id: it.id || crypto.randomUUID(),
          type: "counter",
          name: it.name,
          color: it.color || "#6366f1",
          counterType: it.trackerType === "financial" ? "financial" : "numerical",
          value: Number(it.value) || 0,
          transactions: Array.isArray(it.transactions) ? it.transactions : []
        };
      }
      return it;
    });
  }
  items = convertList(legacy);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  return items;
}
let data = migrateIfNeeded();

/* robust autosave + backup */
let saveQueued = false;
function save(now=false) {
  if (now) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(LEGACY_KEY, JSON.stringify(data)); // keep a copy for old key to avoid surprises
    localStorage.setItem("autosave_snapshot", JSON.stringify({ at: Date.now(), data }));
    return;
  }
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => { saveQueued = false; save(true); }, 300);
}
setInterval(() => save(true), 15000); // periodic backup
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(()=>{});
}

/* =========================
   DOM HOOKS
   ========================= */
const container     = document.getElementById("tracker-container");
const searchInput   = document.getElementById("search");
const clearSearchBtn= document.getElementById("clear-search");
const importInput   = document.getElementById("import-data");
const importBtn     = document.getElementById("import-btn");
const darkToggle    = document.getElementById("dark-toggle");
const menuBtn       = document.getElementById("menu-btn");
const menu          = document.getElementById("main-menu");
const fabBtn        = document.getElementById("fab-btn");
const fabActions    = document.getElementById("fab-actions");
let lastScroll = 0;

/* =========================
   HELPERS
   ========================= */
function isMobile() { return window.matchMedia("(pointer:coarse)").matches || window.innerWidth <= 700; }

function findItemById(id, items = data) {
  for (const it of items) {
    if (it.id === id) return { item: it, parent: items };
    if (it.type === "folder") {
      const f = findItemById(id, it.children || []);
      if (f.item) return f;
    }
  }
  return { item: null, parent: null };
}
function getAllFolders(list=data, acc=[]) {
  for (const it of list) {
    if (it.type === "folder") { acc.push(it); getAllFolders(it.children || [], acc); }
  }
  return acc;
}
function createInput(placeholder, type="text", value="") {
  const el = document.createElement("input");
  el.type = type; el.placeholder = placeholder; el.value = value;
  el.style.display = "block"; el.style.marginBottom = "10px";
  return el;
}
function createSelect(options) {
  const s = document.createElement("select");
  options.forEach(([v,t]) => { const o=document.createElement("option"); o.value=v; o.textContent=t; s.appendChild(o); });
  s.style.display="block"; s.style.marginBottom="10px";
  return s;
}
function comma(n, frac=2) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
}
function formatCounterValue(counter) {
  if (counter.counterType === "financial") return "$" + comma(counter.value, 2);
  if (counter.counterType === "percentage") return comma(counter.value, 4) + "%";
  return comma(counter.value, 2);
}
function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms/1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400)/3600);
  const m = Math.floor((total % 3600)/60);
  const s = total % 60;
  let parts = [];
  if (d > 0) parts.push(`${d}D`);
  parts.push(`${h}H`, `${m}M`, `${s}S`); // show zeros for included units
  // If less than a day, omit D entirely as requested
  if (d === 0) parts = parts.slice(0); // already no D
  return parts.join(" ");
}

/* Folder stats: (dF sF - dC sC - dT sT) => (2F1-1C5-0T2) */
function folderStats(folder) {
  let dF=0, sF=0, dC=0, sC=0, dT=0, sT=0;
  function walk(children, top=false) {
    for (const ch of children) {
      if (ch.type === "folder") {
        if (top) dF++; else sF++;
        walk(ch.children || [], false);
      } else if (ch.type === "counter") {
        if (top) dC++; else sC++;
      } else if (ch.type === "timer") {
        if (top) dT++; else sT++;
      }
    }
  }
  walk(folder.children || [], true);
  return `(${dF}F${sF}-${dC}C${sC}-${dT}T${sT})`;
}

/* =========================
   MODALS (generic)
   ========================= */
function closeAnyModals() {
  document.querySelectorAll('.modal-backdrop, .trakstar-modal').forEach(e => {
    e.style.opacity = 0;
    setTimeout(() => e.remove(), 210);
  });
}
function createModal(title, nodes, onOk) {
  closeAnyModals();
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  back.onclick = () => { back.remove(); modal.remove(); };

  const modal = document.createElement("div");
  modal.className = "trakstar-modal";
  const h3 = document.createElement("h3"); h3.textContent = title;
  modal.appendChild(h3);
  nodes.forEach(n => modal.appendChild(n));

  const row = document.createElement("div");
  row.style.textAlign="right"; row.style.marginTop="10px";
  const cancel = document.createElement("button"); cancel.textContent="Cancel";
  const ok = document.createElement("button"); ok.textContent="OK"; ok.style.marginLeft="10px";
  cancel.onclick = () => { back.remove(); modal.remove(); };
  ok.onclick = () => { if (onOk) onOk(ok); back.remove(); modal.remove(); };
  row.append(cancel, ok);
  modal.appendChild(row);

  modal.onclick = e => e.stopPropagation();
  document.body.appendChild(back); document.body.appendChild(modal);
}

/* =========================
   ADD/EDIT: Folders
   ========================= */
function createFolderSelect(excludeId, descendants=[]) {
  const select = document.createElement("select");
  const opt = document.createElement("option"); opt.value=""; opt.textContent="— No Folder —"; select.appendChild(opt);
  (function add(items, prefix="") {
    for (const it of items) {
      if (it.type === "folder" && it.id !== excludeId && !descendants.includes(it.id)) {
        const o = document.createElement("option");
        o.value = it.id; o.textContent = prefix + it.name;
        select.appendChild(o);
        add(it.children || [], prefix + "— ");
      }
    }
  })(data);
  select.style.display="block"; select.style.marginBottom="10px";
  return select;
}
function getDescendantFolderIds(folder) {
  let ids = [];
  for (const ch of folder.children || []) {
    if (ch.type === "folder") { ids.push(ch.id, ...getDescendantFolderIds(ch)); }
  }
  return ids;
}
function addFolderModal(parentFolderId=null, after=null) {
  const name = createInput("Folder name");
  const color = createInput("Color","color","#888");
  const dest = createFolderSelect();
  if (parentFolderId) dest.value = parentFolderId;
  createModal("Add Folder", [name,color,dest], () => {
    if (!name.value.trim()) return alert("Name is required");
    const folderObj = { id: crypto.randomUUID(), type:"folder", name:name.value.trim(), color:color.value||"#888", expanded:true, children:[] };
    const parent = dest.value ? findItemById(dest.value).item : null;
    (parent?.children || data).push(folderObj);
    save(); render(); after && after();
  });
}
function editFolderModal(id) {
  const {item:folder, parent:oldParentArr} = findItemById(id);
  if (!folder) return;
  const name = createInput("Name","text",folder.name);
  const color = createInput("Color","color",folder.color||"#888");
  const descendants = getDescendantFolderIds(folder);
  const sel = createFolderSelect(folder.id, descendants);

  // find current parent
  let currentParent = "";
  (function findParent(list, parentId="") {
    for (const it of list) {
      if (it.type === "folder") {
        if (it.children && it.children.includes(folder)) currentParent = it.id;
        findParent(it.children || [], it.id);
      }
    }
  })(data);
  sel.value = currentParent || "";

  createModal("Edit Folder", [name,color,sel], () => {
    if (!name.value.trim()) return alert("Folder name is required");
    folder.name = name.value.trim();
    folder.color = color.value || "#888";

    let newParentArr = data;
    if (sel.value) {
      const p = findItemById(sel.value).item;
      if (p && p.children) newParentArr = p.children;
    }
    if (newParentArr !== oldParentArr) {
      const idx = oldParentArr.indexOf(folder);
      if (idx > -1) oldParentArr.splice(idx,1);
      newParentArr.push(folder);
    }
    save(); render();
  });
}

/* =========================
   ADD/EDIT: Counters
   ========================= */
function addCounterModal(parentFolderId=null, after=null) {
  const name = createInput("Counter name");
  const type = createSelect([["numerical","Numerical"],["financial","Financial ($)"],["percentage","Percentage (%)"]]);
  const value = createInput("Initial value","number","0");
  const color = createInput("Color","color","#6366f1");
  const dest = createFolderSelect();
  if (parentFolderId) dest.value = parentFolderId;

  createModal("Add Counter",[name,type,value,color,dest],() => {
    if (!name.value.trim()) return alert("Name is required");
    const v = Number(value.value || 0);
    const counter = {
      id: crypto.randomUUID(),
      type: "counter",
      name: name.value.trim(),
      color: color.value || "#6366f1",
      counterType: type.value,
      value: isNaN(v) ? 0 : v,
      transactions: []
    };
    const parent = dest.value ? findItemById(dest.value).item : null;
    (parent?.children || data).push(counter);
    save(); render(); after && after();
  });
}
function editCounterModal(id) {
  const { item: counter, parent: oldParentArr } = findItemById(id);
  if (!counter) return;
  const name  = createInput("Name","text",counter.name);
  const type  = createSelect([["numerical","Numerical"],["financial","Financial ($)"],["percentage","Percentage (%)"]]);
  type.value = counter.counterType;
  const value = createInput("Value","number", String(counter.value));
  const color = createInput("Color","color", counter.color || "#6366f1");
  const dest  = createFolderSelect(id);

  // set current parent
  let currentParent = "";
  getAllFolders().forEach(f => { if ((f.children||[]).includes(counter)) currentParent = f.id; });
  dest.value = currentParent || "";

  createModal("Edit Counter", [name,type,value,color,dest], () => {
    if (!name.value.trim()) return alert("Name is required");
    const v = Number(value.value);
    if (isNaN(v)) return alert("Value must be a number");
    counter.name = name.value.trim();
    counter.counterType = type.value;
    counter.value = v;
    counter.color = color.value || "#6366f1";

    let newParentArr = data;
    if (dest.value) {
      const p = findItemById(dest.value).item; if (p && p.children) newParentArr = p.children;
    }
    if (newParentArr !== oldParentArr) {
      const idx = oldParentArr.indexOf(counter); if (idx>-1) oldParentArr.splice(idx,1);
      newParentArr.push(counter);
    }
    save(); render();
  });
}
function openTransactions(id) {
  const { item: counter } = findItemById(id);
  if (!counter || counter.type !== "counter") return;
  const back = document.createElement("div");
  back.className = "modal-backdrop";
  const modal = document.createElement("div");
  modal.className = "trakstar-modal"; modal.style.maxWidth="360px"; modal.style.maxHeight="70vh"; modal.style.overflowY="auto";

  const list = (counter.transactions || []).slice().reverse();
  let html = `<h3>${counter.name} Transactions</h3>`;
  html += list.map(t => `<div><strong>${new Date(t.time).toLocaleString()}</strong>: ${t.amount>0?"+":""}${comma(t.amount,2)} ${t.note ? `<em>— ${t.note}</em>`:""}</div>`).join("") || "<em>No transactions</em>";
  html += `<br/><button id="addTx">+ Add</button><button id="closeTx" style="margin-left:10px;">Close</button>`;
  modal.innerHTML = html;

  back.onclick = () => { back.remove(); modal.remove(); };
  modal.onclick = e => e.stopPropagation();
  document.body.append(back, modal);

  document.getElementById("addTx").onclick = () => {
    const amount = parseFloat(prompt("Amount (+/-):"));
    if (isNaN(amount)) return alert("Invalid amount");
    const note = prompt("Note:");
    counter.transactions = counter.transactions || [];
    counter.transactions.push({ amount, note, time: Date.now() });
    counter.value += amount;
    save(true); render();
    back.remove(); modal.remove();
    openTransactions(id);
  };
  document.getElementById("closeTx").onclick = () => { back.remove(); modal.remove(); };
}

/* =========================
   ADD/EDIT: Timers
   Types: single (one target), range (start+end), repeat (...)
   ========================= */
function addTimerModal(parentFolderId=null, after=null) {
  const name  = createInput("Timer name");
  const type  = createSelect([["single","Single Timer"],["range","Range Timer (start & end)"],["repeat","Repeat Timer"]]);
  const color = createInput("Color","color","#6366f1");
  const dest  = createFolderSelect();
  if (parentFolderId) dest.value = parentFolderId;

  // time inputs
  const singleEnd = createInput("End (YYYY-MM-DDTHH:MM)","datetime-local","");
  const rangeStart= createInput("Start (YYYY-MM-DDTHH:MM)","datetime-local","");
  const rangeEnd  = createInput("End (YYYY-MM-DDTHH:MM)","datetime-local","");
  const repeatWhen= createInput("First Occurrence (YYYY-MM-DDTHH:MM)","datetime-local","");
  const repeatKind= createSelect([["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"],["yearly","Yearly"],["weekday","Every Weekday (Mon–Fri)"]]);
  const repeatInterval = createInput("Repeat interval (e.g., every N days/weeks)","number","1");
  const dowWrap = document.createElement("div"); dowWrap.className="small-muted";
  dowWrap.textContent = "For weekly: days used from the first occurrence.";
  function updateVisibility() {
    singleEnd.style.display = type.value==="single" ? "block":"none";
    rangeStart.style.display = rangeEnd.style.display = type.value==="range" ? "block":"none";
    repeatWhen.style.display = repeatKind.style.display = repeatInterval.style.display = (type.value==="repeat") ? "block":"none";
    dowWrap.style.display = (type.value==="repeat" && repeatKind.value==="weekly") ? "block":"none";
  }
  type.onchange = updateVisibility; repeatKind.onchange = updateVisibility; updateVisibility();

  createModal("Add Timer",[name,type,singleEnd,rangeStart,rangeEnd,repeatWhen,repeatKind,repeatInterval,dowWrap,color,dest], () => {
    if (!name.value.trim()) return alert("Name is required");
    const timer = {
      id: crypto.randomUUID(),
      type: "timer",
      name: name.value.trim(),
      color: color.value || "#6366f1",
      timerType: type.value,
      lastNotified: {}
    };
    if (type.value === "single") {
      if (!singleEnd.value) return alert("Please set an end time");
      timer.target = new Date(singleEnd.value).getTime();
    } else if (type.value === "range") {
      if (!rangeStart.value || !rangeEnd.value) return alert("Please set start and end");
      timer.start = new Date(rangeStart.value).getTime();
      timer.end   = new Date(rangeEnd.value).getTime();
    } else {
      if (!repeatWhen.value) return alert("Please set the first occurrence");
      timer.rule = { kind: repeatKind.value, interval: Math.max(1, Number(repeatInterval.value || 1)) };
      timer.next = new Date(repeatWhen.value).getTime();
      timer.timerType = "repeat";
    }
    const parent = dest.value ? findItemById(dest.value).item : null;
    (parent?.children || data).push(timer);
    save(true); render(); scheduleAllNotifications(); after && after();
  });
}
function editTimerModal(id) {
  const { item: timer, parent: oldParentArr } = findItemById(id);
  if (!timer) return;

  const name  = createInput("Name","text",timer.name);
  const type  = createSelect([["single","Single Timer"],["range","Range Timer"],["repeat","Repeat Timer"]]);
  type.value  = timer.timerType || "single";
  const color = createInput("Color","color", timer.color || "#6366f1");
  const dest  = createFolderSelect(id);

  const singleEnd = createInput("End (YYYY-MM-DDTHH:MM)","datetime-local", timer.timerType==="single" && timer.target ? new Date(timer.target).toISOString().slice(0,16) : "");
  const rangeStart= createInput("Start (YYYY-MM-DDTHH:MM)","datetime-local", timer.timerType==="range" && timer.start ? new Date(timer.start).toISOString().slice(0,16) : "");
  const rangeEnd  = createInput("End (YYYY-MM-DDTHH:MM)","datetime-local",   timer.timerType==="range" && timer.end   ? new Date(timer.end).toISOString().slice(0,16) : "");
  const repeatWhen= createInput("Next Occurrence (YYYY-MM-DDTHH:MM)","datetime-local", timer.timerType==="repeat" && timer.next ? new Date(timer.next).toISOString().slice(0,16) : "");
  const repeatKind= createSelect([["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"],["yearly","Yearly"],["weekday","Every Weekday (Mon–Fri)"]]);
  repeatKind.value = (timer.rule && timer.rule.kind) || "daily";
  const repeatInterval = createInput("Repeat interval","number", String((timer.rule && timer.rule.interval) || 1));
  function updateVisibility() {
    singleEnd.style.display = type.value==="single" ? "block":"none";
    rangeStart.style.display = rangeEnd.style.display = type.value==="range" ? "block":"none";
    repeatWhen.style.display = repeatKind.style.display = repeatInterval.style.display = (type.value==="repeat") ? "block":"none";
  }
  type.onchange = updateVisibility; updateVisibility();

  // current parent
  let currentParent = "";
  getAllFolders().forEach(f => { if ((f.children||[]).includes(timer)) currentParent = f.id; });
  dest.value = currentParent || "";

  createModal("Edit Timer",[name,type,singleEnd,rangeStart,rangeEnd,repeatWhen,repeatKind,repeatInterval,color,dest], () => {
    if (!name.value.trim()) return alert("Name is required");
    timer.name = name.value.trim();
    timer.color = color.value || "#6366f1";
    timer.timerType = type.value;
    timer.lastNotified = timer.lastNotified || {};
    if (type.value === "single") {
      if (!singleEnd.value) return alert("Please set an end time");
      timer.target = new Date(singleEnd.value).getTime();
      delete timer.start; delete timer.end; delete timer.rule; delete timer.next;
    } else if (type.value === "range") {
      if (!rangeStart.value || !rangeEnd.value) return alert("Please set start and end");
      timer.start = new Date(rangeStart.value).getTime();
      timer.end   = new Date(rangeEnd.value).getTime();
      delete timer.target; delete timer.rule; delete timer.next;
    } else {
      if (!repeatWhen.value) return alert("Please set the next occurrence");
      timer.rule = { kind: repeatKind.value, interval: Math.max(1, Number(repeatInterval.value || 1)) };
      timer.next = new Date(repeatWhen.value).getTime();
      delete timer.start; delete timer.end; delete timer.target;
    }

    let newParentArr = data;
    if (dest.value) {
      const p = findItemById(dest.value).item; if (p && p.children) newParentArr = p.children;
    }
    if (newParentArr !== oldParentArr) {
      const idx = oldParentArr.indexOf(timer); if (idx>-1) oldParentArr.splice(idx,1);
      newParentArr.push(timer);
    }
    save(true); render(); scheduleAllNotifications();
  });
}

/* =========================
   RENDER
   ========================= */
function buildTree(items, filter="") {
  const f = filter.toLowerCase().trim();
  return items.filter(it => {
    if (it.type === "folder") {
      it.children = buildTree(it.children || [], f);
      return it.name.toLowerCase().includes(f) || it.children.length>0;
    }
    if (it.type === "counter") {
      const match = it.name.toLowerCase().includes(f) || String(it.value).includes(f);
      return match;
    }
    if (it.type === "timer") {
      return it.name.toLowerCase().includes(f);
    }
    return false;
  });
}
function createFolderCard(folder) {
  const el = document.createElement("div");
  el.className = "folder-card";
  el.dataset.id = folder.id;
  el.style.borderLeftColor = folder.color || "#888";

  const left = document.createElement("div");
  left.className = "folder-header";
  const title = document.createElement("div");
  title.innerHTML = `<span class="item-title">${folder.name}</span> <span class="small-muted">${folderStats(folder)}</span>`;
  left.appendChild(title);

  const btns = document.createElement("div"); btns.className="btn-div";
  const openBtn = document.createElement("button"); openBtn.textContent="📂"; openBtn.title="Open";
  const editBtn = document.createElement("button"); editBtn.textContent="✏️"; editBtn.title="Edit";
  const delBtn  = document.createElement("button"); delBtn.className="delete"; delBtn.textContent="🗑️"; delBtn.title="Delete";

  openBtn.onclick = () => openFolderModal(folder.id);
  editBtn.onclick = (e) => { e.stopPropagation(); editFolderModal(folder.id); };
  delBtn.onclick  = (e) => { e.stopPropagation(); deleteItem(folder.id); };

  btns.append(openBtn, editBtn, delBtn);
  el.append(left, btns);
  return el;
}
function createCounterCard(counter) {
  const el = document.createElement("div");
  el.className = "item-card";
  el.dataset.id = counter.id;
  el.style.borderLeftColor = counter.color || "#6366f1";

  const title = document.createElement("div");
  title.className = "item-header";
  const left = document.createElement("div");
  left.innerHTML = `<div class="item-title">${counter.name}</div><div class="item-sub small-muted">${counter.counterType}</div>`;
  const rightVal = document.createElement("div"); rightVal.textContent = formatCounterValue(counter);
  rightVal.className = "item-title";
  title.append(left, rightVal);

  const btns = document.createElement("div"); btns.className="btn-div";
  const tx = document.createElement("button"); tx.textContent="📊"; tx.title="Transactions";
  const edit = document.createElement("button"); edit.textContent="✏️";
  const del = document.createElement("button"); del.className="delete"; del.textContent="🗑️";
  tx.onclick = () => openTransactions(counter.id);
  edit.onclick = () => editCounterModal(counter.id);
  del.onclick = () => deleteItem(counter.id);

  const row = document.createElement("div");
  row.appendChild(btns);
  btns.append(tx, edit, del);

  el.append(title, row);
  return el;
}
function createTimerCard(timer) {
  const el = document.createElement("div");
  el.className = "item-card";
  el.dataset.id = timer.id;
  el.style.borderLeftColor = timer.color || "#6366f1";

  const header = document.createElement("div");
  header.className = "item-header";
  const left = document.createElement("div");
  left.innerHTML = `<div class="item-title">${timer.name}</div><div class="item-sub small-muted">${timer.timerType}</div>`;
  const btns = document.createElement("div"); btns.className="btn-div";
  const edit = document.createElement("button"); edit.textContent="✏️"; edit.onclick = () => editTimerModal(timer.id);
  const del  = document.createElement("button"); del.className="delete"; del.textContent="🗑️"; del.onclick = () => deleteItem(timer.id);
  btns.append(edit, del);
  header.append(left, btns);

  const line = document.createElement("div"); line.className="count-line";
  const sub  = document.createElement("div"); sub.className="small-muted";

  function updateLines() {
    const now = Date.now();
    if (timer.timerType === "single") {
      const diff = timer.target - now;
      if (diff <= 0) {
        line.textContent = "⏰ Completed";
        sub.textContent = new Date(timer.target).toLocaleString();
      } else {
        line.textContent = formatDuration(diff);
        sub.textContent  = `Target: ${new Date(timer.target).toLocaleString()}`;
      }
    } else if (timer.timerType === "range") {
      const toStart = timer.start - now;
      const toEnd   = timer.end   - now;
      const leftStart = toStart > 0 ? formatDuration(toStart) : "Started";
      const leftEnd   = toEnd   > 0 ? formatDuration(toEnd)   : "Ended";
      line.textContent = `${leftStart} - ${leftEnd}`;
      sub.textContent  = `${new Date(timer.start).toLocaleString()} → ${new Date(timer.end).toLocaleString()}`;
    } else { // repeat
      const diff = timer.next - now;
      if (diff <= 0) {
        line.textContent = "⏰ Occurrence due";
      } else {
        line.textContent = formatDuration(diff);
      }
      sub.textContent = `Next: ${new Date(timer.next).toLocaleString()} (${timer.rule.kind}, every ${timer.rule.interval})`;
    }
  }
  updateLines();
  // mark node for global updater
  el.dataset.timer = "1";

  el.append(header, line, sub);
  return el;
}
function renderTree(items) {
  const frag = document.createElement("div");
  frag.id = "main-list";
  items.forEach(it => {
    if (it.type === "folder") frag.appendChild(createFolderCard(it));
    else if (it.type === "counter") frag.appendChild(createCounterCard(it));
    else if (it.type === "timer")   frag.appendChild(createTimerCard(it));
  });
  return frag;
}
function render() {
  lastScroll = container.scrollTop;
  container.innerHTML = "";
  const filtered = buildTree(data, searchInput.value || "");
  container.appendChild(renderTree(filtered));
  initializeDragAndDrop();
  container.scrollTop = lastScroll;
}

/* =========================
   FOLDER MODAL (drill-in view)
   ========================= */
function buildBreadcrumbs(folderId) {
  let crumbs = [];
  (function walk(list, trail) {
    for (const it of list) {
      if (it.id === folderId) { crumbs = [...trail, it]; return true; }
      if (it.type === "folder" && it.children?.length) {
        if (walk(it.children, [...trail, it])) return true;
      }
    }
  })(data, []);
  return crumbs;
}
let modalState = null;
function openFolderModal(folderId) {
  modalState = { folderId };
  closeAnyModals();
  const { item: folder } = findItemById(folderId);
  if (!folder) return;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.style.opacity = 0;
  setTimeout(() => { backdrop.style.opacity = 1; }, 10);

  const modal = document.createElement("div");
  modal.className = "trakstar-modal";
  modal.style.width = "100vw"; modal.style.maxWidth = "100vw";
  modal.style.height = "100vh"; modal.style.maxHeight = "100vh";
  modal.style.left = "0"; modal.style.top = "0"; modal.style.transform = "none";
  modal.style.borderRadius = "0"; modal.style.padding = "0";
  modal.style.overflowY = "auto"; modal.style.display = "flex"; modal.style.flexDirection = "column";

  // Header
  const header = document.createElement("div");
  header.style.display="flex"; header.style.alignItems="center"; header.style.justifyContent="space-between";
  header.style.background="var(--accent)"; header.style.color="white"; header.style.padding="16px 14px"; header.style.fontSize="1.1em";
  const crumbs = buildBreadcrumbs(folderId);
  let backHtml = (crumbs.length>1) ? "&#x2190;" : "&#x2715;";
  header.innerHTML = `<button style="background:none;border:none;color:white;font-size:1.3em;" id="close-folder-modal">${backHtml}</button><span>${folder.name} <span class="small-muted">${folderStats(folder)}</span></span><span></span>`;

  const breadcrumbsEl = document.createElement("div");
  breadcrumbsEl.className = "breadcrumbs";
  crumbs.forEach((it, idx) => {
    const s = document.createElement("span"); s.textContent = it.name;
    if (idx < crumbs.length-1) { s.onclick = () => { document.body.removeChild(backdrop); document.body.removeChild(modal); openFolderModal(it.id); }; }
    breadcrumbsEl.appendChild(s);
  });

  const content = document.createElement("div");
  content.style.flex="1"; content.style.padding="16px 14px"; content.style.overflowY="auto";

  // Subfolders
  (folder.children || []).forEach(ch => { if (ch.type === "folder") content.appendChild(createFolderCard(ch)); });
  // Counters
  (folder.children || []).forEach(ch => { if (ch.type === "counter") {
    const card = createCounterCard(ch);
    content.appendChild(card);
  }});
  // Timers
  (folder.children || []).forEach(ch => { if (ch.type === "timer") {
    const card = createTimerCard(ch);
    content.appendChild(card);
  }});

  // Add buttons
  const btns = document.createElement("div");
  btns.className = "buttons";
  const addCounterBtn = document.createElement("button"); addCounterBtn.textContent = "Add Counter"; addCounterBtn.onclick = e => { e.stopPropagation(); addCounterModal(folder.id, () => setTimeout(()=>openFolderModal(folder.id),50)); };
  const addTimerBtn   = document.createElement("button"); addTimerBtn.textContent = "Add Timer"; addTimerBtn.onclick = e => { e.stopPropagation(); addTimerModal(folder.id, () => setTimeout(()=>openFolderModal(folder.id),50)); };
  const addFolderBtn  = document.createElement("button"); addFolderBtn.textContent = "Add Folder"; addFolderBtn.onclick = e => { e.stopPropagation(); addFolderModal(folder.id, () => setTimeout(()=>openFolderModal(folder.id),50)); };
  btns.append(addCounterBtn, addTimerBtn, addFolderBtn);
  content.appendChild(btns);

  modal.append(header, breadcrumbsEl, content);
  document.body.append(backdrop, modal);

  document.getElementById("close-folder-modal").onclick = () => {
    backdrop.style.opacity=0; modal.style.opacity=0;
    setTimeout(() => {
      backdrop.remove(); modal.remove();
      if (crumbs.length>1) {
        const up = crumbs[crumbs.length-2]; if (up && up.id) openFolderModal(up.id);
      }
    }, 200);
  };
}

/* =========================
   DELETE
   ========================= */
function deleteItem(id) {
  const { item, parent } = findItemById(id);
  if (!item || !parent) return;
  if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
  const idx = parent.indexOf(item);
  if (idx>-1) parent.splice(idx,1);
  save(true); render(); scheduleAllNotifications();
}

/* =========================
   DND (fixed for mobile)
   ========================= */
let dragging = false;
function initializeDragAndDrop() {
  const lists = [document.getElementById("main-list")].filter(Boolean);
  lists.forEach(list => {
    new Sortable(list, {
      animation: 150,
      ghostClass: "ghost",
      handle: null,
      forceFallback: isMobile(),      // fixes iOS glitch
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onStart: () => dragging = true,
      onEnd: (evt) => {
        dragging = false;
        if (evt.from !== evt.to) return;
        const draggedId = evt.item.dataset.id;
        // only reorder within root (simple + reliable)
        const { item } = findItemById(draggedId, data);
        if (!item) return;
        const oldIdx = data.indexOf(item);
        if (oldIdx > -1) data.splice(oldIdx,1);
        let newIndex = Math.max(0, Math.min(evt.newIndex, data.length));
        data.splice(newIndex,0,item);
        save(true); render();
      }
    });
  });
}

/* =========================
   LIVE COUNTDOWN + NOTIFICATIONS
   ========================= */
function nextRepeatTime(rule, from) {
  const dt = new Date(from);
  const n = Math.max(1, rule.interval || 1);
  switch (rule.kind) {
    case "weekday": {
      // Mon–Fri only
      let t = new Date(from).getTime();
      do {
        t += 24*3600*1000;
        const d = new Date(t).getDay(); // 0=Sun..6=Sat
        if (d>=1 && d<=5) n===1 ? 0 : 0; // just loop daily below
      } while (!(new Date(t).getDay()>=1 && new Date(t).getDay()<=5));
      return t;
    }
    case "daily":   return dt.setDate(dt.getDate() + n), dt.getTime();
    case "weekly":  return dt.setDate(dt.getDate() + 7*n), dt.getTime();
    case "monthly": return dt.setMonth(dt.getMonth() + n), dt.getTime();
    case "yearly":  return dt.setFullYear(dt.getFullYear() + n), dt.getTime();
    default:        return from + 24*3600*1000;
  }
}

function updateCountdownLines() {
  document.querySelectorAll('.item-card[data-timer="1"]').forEach(card => {
    const id = card.dataset.id;
    const { item: timer } = findItemById(id);
    if (!timer) return;
    const line = card.querySelector('.count-line');
    const sub  = card.querySelector('.small-muted:last-child');
    const now  = Date.now();
    if (timer.timerType === "single") {
      const diff = timer.target - now;
      if (diff <= 0) { line.textContent = "⏰ Completed"; sub.textContent = new Date(timer.target).toLocaleString(); }
      else { line.textContent = formatDuration(diff); sub.textContent = `Target: ${new Date(timer.target).toLocaleString()}`; }
    } else if (timer.timerType === "range") {
      const toStart = timer.start - now, toEnd = timer.end - now;
      line.textContent = `${toStart>0 ? formatDuration(toStart) : "Started"} - ${toEnd>0 ? formatDuration(toEnd) : "Ended"}`;
      sub.textContent  = `${new Date(timer.start).toLocaleString()} → ${new Date(timer.end).toLocaleString()}`;
    } else {
      const diff = timer.next - now;
      line.textContent = diff <= 0 ? "⏰ Occurrence due" : formatDuration(diff);
      sub.textContent  = `Next: ${new Date(timer.next).toLocaleString()} (${timer.rule.kind}, every ${timer.rule.interval})`;
    }
  });
}
setInterval(updateCountdownLines, 1000);

/* Notifications: show when timers complete. Uses SW so it works when app is in PWA mode and tab is backgrounded. */
function canNotify() {
  return ("Notification" in window) && Notification.permission === "granted" && navigator.serviceWorker && navigator.serviceWorker.controller;
}
function requestNotifyPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") Notification.requestPermission();
}
function showSWNotification(title, body, tag) {
  if (!navigator.serviceWorker) return;
  navigator.serviceWorker.ready.then(reg => {
    // postMessage fallback
    if (reg.active) reg.active.postMessage({ type: "showNotification", title, body, tag });
    else if (reg.showNotification) reg.showNotification(title, { body, tag, icon: "icon.png", badge:"icon.png" });
  });
}

function scheduleAllNotifications() {
  // Clear existing (we only use time-based checks every second)
  // We’ll just rely on the 1s interval to fire when due.
}
setInterval(() => {
  const now = Date.now();
  data.forEach(it => {
    if (it.type !== "timer") return;
    it.lastNotified = it.lastNotified || {};
    if (it.timerType === "single") {
      if (now >= it.target && !it.lastNotified.done) {
        if (canNotify()) showSWNotification(`Timer "${it.name}"`, "Completed.", it.id+"single");
        it.lastNotified.done = true; save();
      }
    } else if (it.timerType === "range") {
      if (!it.lastNotified.rangeStart && now >= it.start) {
        if (canNotify()) showSWNotification(`Range "${it.name}"`, "Start reached.", it.id+"start");
        it.lastNotified.rangeStart = true; save();
      }
      if (!it.lastNotified.rangeEnd && now >= it.end) {
        if (canNotify()) showSWNotification(`Range "${it.name}"`, "End reached.", it.id+"end");
        it.lastNotified.rangeEnd = true; save();
      }
    } else if (it.timerType === "repeat") {
      if (now >= it.next - 500) {
        if (canNotify()) showSWNotification(`Repeat "${it.name}"`, "Occurrence reached.", it.id+"repeat");
        // compute next
        it.next = nextRepeatTime(it.rule, it.next);
        save(true); render();
      }
    }
  });
}, 1000);

/* =========================
   SETTINGS (kept + notify toggle)
   ========================= */
function initDarkMode() {
  const saved = localStorage.getItem("darkMode");
  if (saved === "true") document.body.classList.add("dark");
  updateDarkToggleText();
}
function toggleDarkMode() {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("darkMode", isDark);
  updateDarkToggleText();
}
function updateDarkToggleText() {
  darkToggle.textContent = document.body.classList.contains("dark") ? "☀️" : "🌓";
}
darkToggle.addEventListener("click", toggleDarkMode);
initDarkMode();

/* Settings modal (color theme + notifications) — based on your original */
const settingsBtn = document.getElementById("settings-btn");
settingsBtn.onclick = openSettingsModal;
function openSettingsModal() {
  closeAnyModals();

  const defaults = { accentLight:'#6366f1', accentDark:'#8b5cf6', bgLight:'#f5f7fa', bgDark:'#1a1a1a' };
  const accentLight = localStorage.getItem('accentLight') || defaults.accentLight;
  const accentDark  = localStorage.getItem('accentDark')  || defaults.accentDark;
  const bgLight     = localStorage.getItem('bgLight')     || defaults.bgLight;
  const bgDark      = localStorage.getItem('bgDark')      || defaults.bgDark;

  const modal = document.createElement('div'); modal.className='trakstar-modal settings-modal'; modal.style.minWidth='350px';

  function makeRow(label, lightId, darkId, lightVal, darkVal) {
    const row = document.createElement('div'); row.className='settings-option-row';
    const lbl = document.createElement('label'); lbl.textContent = label; lbl.style.width='110px';
    const li = document.createElement('input'); li.type='color'; li.id=lightId; li.value=lightVal; li.className='color-input';
    const di = document.createElement('input'); di.type='color'; di.id=darkId;  di.value=darkVal;  di.className='color-input';
    const lt = document.createElement('span'); lt.textContent='Light'; lt.style.marginRight="2px";
    const dt = document.createElement('span'); dt.textContent='Dark';  dt.style.marginRight="2px";
    row.append(lbl, lt, li, dt, di); return row;
  }

  const accentRow = makeRow('Accent color','accent-light','accent-dark',accentLight,accentDark);
  const bgRow     = makeRow('Background','bg-light','bg-dark',bgLight,bgDark);

  // Mode switch
  const modeRow = document.createElement('div'); modeRow.className='mode-switch-row';
  const lightLbl = document.createElement('span'); lightLbl.textContent = 'Light';
  const darkLbl  = document.createElement('span'); darkLbl.textContent  = 'Dark';
  const switchTrack = document.createElement('div'); switchTrack.className='switch-track';
  const switchThumb = document.createElement('div'); switchThumb.className='switch-thumb' + (document.body.classList.contains('dark') ? ' switch-dark' : '');
  switchTrack.appendChild(switchThumb);
  function updateSwitchUI(){ document.body.classList.contains('dark') ? switchThumb.classList.add('switch-dark') : switchThumb.classList.remove('switch-dark'); }
  switchTrack.onclick = () => { document.body.classList.toggle('dark'); localStorage.setItem('darkMode', document.body.classList.contains('dark')); updateSwitchUI(); applyThemeVars(); render(); };
  modeRow.append(lightLbl, switchTrack, darkLbl);

  // Notifications toggle
  const notifRow = document.createElement("div"); notifRow.className="settings-option-row";
  const notifLabel = document.createElement("label"); notifLabel.textContent = "Enable Notifications";
  const notifToggle = document.createElement("input"); notifToggle.type="checkbox"; notifToggle.checked = (Notification && Notification.permission === "granted");
  notifToggle.onchange = () => { if (notifToggle.checked) requestNotifyPermission(); };
  notifRow.append(notifLabel, notifToggle);

  const btnRow = document.createElement('div'); btnRow.style.textAlign='right'; btnRow.style.marginTop='18px';
  const closeBtn = document.createElement('button'); closeBtn.textContent='Close'; closeBtn.onclick = () => { back.remove(); modal.remove(); };
  const resetBtn = document.createElement('button'); resetBtn.textContent='Reset Colors'; resetBtn.style.marginRight='14px';
  resetBtn.onclick = () => {
    document.getElementById('accent-light').value = defaults.accentLight;
    document.getElementById('accent-dark').value = defaults.accentDark;
    document.getElementById('bg-light').value = defaults.bgLight;
    document.getElementById('bg-dark').value = defaults.bgDark;
    localStorage.removeItem('accentLight'); localStorage.removeItem('accentDark'); localStorage.removeItem('bgLight'); localStorage.removeItem('bgDark');
    applyThemeVars();
  };
  btnRow.append(resetBtn, closeBtn);

  function applyThemeVars() {
    const aLight = document.getElementById('accent-light').value;
    const aDark  = document.getElementById('accent-dark').value;
    const bLight = document.getElementById('bg-light').value;
    const bDark  = document.getElementById('bg-dark').value;
    localStorage.setItem('accentLight', aLight);
    localStorage.setItem('accentDark', aDark);
    localStorage.setItem('bgLight', bLight);
    localStorage.setItem('bgDark', bDark);

    document.documentElement.style.setProperty('--accent', aLight);
    document.documentElement.style.setProperty('--bg', bLight);
    if (!document.body.classList.contains("dark")) document.body.style.background = bLight;

    let darkStyle = document.getElementById('theme-dark-style');
    if (!darkStyle) { darkStyle = document.createElement('style'); darkStyle.id='theme-dark-style'; document.head.appendChild(darkStyle); }
    darkStyle.textContent = `body.dark { --accent: ${aDark} !important; --bg: ${bDark} !important; }`;
    updateInstantDarkBgStyle(bDark);

    if (document.body.classList.contains('dark')) {
      document.documentElement.style.setProperty('--accent', aDark);
      document.documentElement.style.setProperty('--bg', bDark);
      document.body.style.background = bDark;
    }
    render();
  }
  accentRow.querySelector('#accent-light').oninput = applyThemeVars;
  accentRow.querySelector('#accent-dark').oninput  = applyThemeVars;
  bgRow.querySelector('#bg-light').oninput         = applyThemeVars;
  bgRow.querySelector('#bg-dark').oninput          = applyThemeVars;

  modal.append(accentRow, bgRow, modeRow, notifRow, btnRow);

  const back = document.createElement("div"); back.className="modal-backdrop"; back.onclick = () => { back.remove(); modal.remove(); };
  modal.onclick = e => e.stopPropagation();
  document.body.append(back, modal);

  applyThemeVars(); updateSwitchUI();
}

/* =========================
   MENU / FAB / SEARCH / IMPORT-EXPORT / CLOUD
   (kept from your app and adjusted IDs)
   ========================= */
menuBtn.onclick = e => { e.stopPropagation(); menu.style.display = menu.style.display === "none" ? "flex" : "none"; };
window.addEventListener("click", () => { if (menu.style.display !== "none") menu.style.display = "none"; });
menu.onclick = e => e.stopPropagation();

searchInput.oninput = () => { render(); clearSearchBtn.style.display = searchInput.value ? "inline" : "none"; };
clearSearchBtn.onclick = () => { searchInput.value = ""; render(); clearSearchBtn.style.display="none"; searchInput.focus(); };

fabBtn.onclick = (e) => {
  e.stopPropagation();
  const isActive = fabActions.classList.toggle("fab-active");
  fabActions.style.display = isActive ? "flex" : "none";
  setTimeout(() => { isActive ? fabActions.classList.add("fab-active") : fabActions.classList.remove("fab-active"); }, 10);
};
window.addEventListener("click", () => { fabActions.classList.remove("fab-active"); fabActions.style.display="none"; });
fabActions.onclick = e => e.stopPropagation();
document.getElementById("add-folder").onclick  = () => { addFolderModal();  fabActions.classList.remove("fab-active"); fabActions.style.display="none"; };
document.getElementById("add-counter").onclick = () => { addCounterModal(); fabActions.classList.remove("fab-active"); fabActions.style.display="none"; };
document.getElementById("add-timer").onclick   = () => { addTimerModal();   fabActions.classList.remove("fab-active"); fabActions.style.display="none"; };

document.getElementById("export-data").onclick = () => {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "trakstar_backup.json"; a.click();
  URL.revokeObjectURL(url);
};
importBtn.onclick = () => importInput.click();
importInput.onchange = e => {
  const file = e.target.files[0]; const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (Array.isArray(imported) && imported.every(x => typeof x === "object" && x.type)) {
        data = imported; save(true); render(); scheduleAllNotifications(); alert("Import successful!");
      } else alert("Invalid format");
    } catch { alert("Could not import"); }
  };
  reader.readAsText(file);
};

document.getElementById("clear-all-trackers").onclick = () => {
  if (!confirm("This will delete ALL items and folders. Are you absolutely sure?")) return;
  data = []; save(true); render(); scheduleAllNotifications();
};

/* ======= Cloud (kept from your app) ======= */
const DIRECTORY_BLOB_ID = "1396310904861286400";
function getTimestampPrefix() {
  const now = new Date(); const pad = n => n.toString().padStart(2,'0');
  return `${pad(now.getDate())}${pad(now.getMonth()+1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}_`;
}
async function getDirectory() {
  const res = await fetch("https://jsonblob.com/api/jsonBlob/" + DIRECTORY_BLOB_ID);
  if (!res.ok) throw new Error("Could not fetch directory blob");
  let dir = await res.json();
  if (!dir.main) dir.main = {}; if (!dir.archive) dir.archive = {};
  return dir;
}
async function saveDirectory(dir) {
  const res = await fetch("https://jsonblob.com/api/jsonBlob/" + DIRECTORY_BLOB_ID, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dir)
  });
  if (!res.ok) throw new Error("Could not update directory blob");
}
document.getElementById("delete-id").onclick = async () => {
  const id = prompt("Enter the ID to archive (delete):"); if (!id) return;
  try {
    let dir = await getDirectory();
    if (!dir.main[id]) { alert("That ID does not exist in the main list."); return; }
    const tsId = getTimestampPrefix() + id; dir.archive[tsId] = dir.main[id]; delete dir.main[id];
    await saveDirectory(dir); alert(`Moved "${id}" to archive as "${tsId}".`);
  } catch (e) { alert("Delete/archive failed: " + e.message); }
};
document.getElementById("restore-id").onclick = async () => {
  const baseId = prompt("Enter the ID to restore (original base, e.g., dans_list_1):"); if (!baseId) return;
  try {
    let dir = await getDirectory();
    const matching = Object.keys(dir.archive).filter(k => k.endsWith("_"+baseId) || k.substring(9)===baseId)
      .map(k => ({ tsId:k, timestamp:k.substring(0,9), blobId:dir.archive[k] })).sort((a,b)=>b.tsId.localeCompare(a.tsId));
    if (matching.length===0) { alert("No archived versions of this ID exist."); return; }
    const restore = matching[0];
    if (dir.main[baseId]) { if (!confirm(`"${baseId}" already exists in the main list! Overwrite?`)) return; }
    dir.main[baseId] = restore.blobId;
    await saveDirectory(dir); alert(`Restored "${baseId}" from "${restore.tsId}".`);
  } catch (e) { alert("Restore failed: " + e.message); }
};
document.getElementById("cloud-save").onclick = async () => {
  const userId = prompt("Enter your unique ID:"); if (!userId) return;
  try {
    let dir = await getDirectory();
    let blobId = dir.main[userId];
    let res;
    if (blobId) {
      res = await fetch("https://jsonblob.com/api/jsonBlob/" + blobId, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to update your data.");
    } else {
      res = await fetch("https://jsonblob.com/api/jsonBlob", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to create blob.");
      blobId = res.headers.get("Location").split("/").pop();
      dir.main[userId] = blobId; await saveDirectory(dir);
    }
    alert("Saved! Use this ID to load from any device: " + userId);
  } catch (e) { alert("Cloud save failed: " + e.message); }
};
document.getElementById("cloud-load").onclick = async () => {
  const userId = prompt("Enter the ID to load:"); if (!userId) return;
  try {
    const dir = await getDirectory(); const blobId = dir.main[userId];
    if (!blobId) throw new Error("ID not found in main list.");
    const res = await fetch("https://jsonblob.com/api/jsonBlob/" + blobId);
    if (!res.ok) throw new Error("Blob not found.");
    const blobData = await res.json();
    if (Array.isArray(blobData) && typeof blobData[0] === "object") {
      data = blobData; save(true); render(); scheduleAllNotifications(); alert("Loaded!");
    } else throw new Error("Invalid data.");
  } catch (e) { alert("Cloud load failed: " + e.message); }
};

/* ===== TrakStar <-> Bank bridge (append at end of app.js) ===== */
(function exposeBridge(){
  function walkCounters(list, out=[]) {
    for (const it of list) {
      if (it.type === 'counter') out.push(it);
      else if (it.type === 'folder') walkCounters(it.children || [], out);
    }
    return out;
  }
  window.TrakStar = window.TrakStar || {};
  window.TrakStar.getCounters = () => walkCounters(data).map(c => ({ id:c.id, name:c.name, counterType:c.counterType }));
  window.TrakStar.updateCounterValue = (id, newValue/*number*/, isBank=false) => {
    const found = (function find(items){
      for (const it of items) {
        if (it.id === id) return it;
        if (it.type === 'folder') { const f = find(it.children || []); if (f) return f; }
      }
      return null;
    })(data);
    if (found && found.type === 'counter' && typeof newValue === 'number' && !Number.isNaN(newValue)) {
      found.value = newValue;
      if (isBank) found.counterType = 'financial';
      save(true); render();
    }
  };
})();

/* =========================
   KICK IT OFF
   ========================= */
render();
scheduleAllNotifications();
