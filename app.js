console.log("TrakStar app.js loaded");

/* =========================
   Theme bootstrap
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
    document.documentElement.classList.add('dark-pre');
    document.body.classList.add('dark-pre');
  }
})();

/* =========================
   Utilities
   ========================= */
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const by = (k) => (a,b) => (a[k] > b[k]) ? 1 : (a[k] < b[k]) ? -1 : 0;

function createEl(tag, props={}, children=[]) {
  const el = Object.assign(document.createElement(tag), props);
  for (const c of children) el.append(c);
  return el;
}
function createInput(label, type, value="") {
  const wrap = createEl("label");
  wrap.innerHTML = `<div class="small-muted" style="margin:.25rem 0 .35rem 0">${label}</div>`;
  const input = createEl("input", { type, value });
  wrap.append(input);
  return input;
}
function createSelect(options) {
  const sel = createEl("select");
  for (const [value, label] of options) sel.append(createEl("option", { value, textContent:label }));
  return sel;
}
function createFolderSelect(selectedId="") {
  const sel = createSelect([["","Top level"], ...getAllFolders().map(f => [f.id, f.name])]);
  sel.value = selectedId || "";
  return sel;
}
function comma(n, frac=2) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
}
function formatCounterValue(counter) {
  if (counter.type === "counter" && counter.counterType === "cumulative") {
    const { value, display } = computeCumulative(counter);
    if (display === "financial") return "$" + comma(value, 2);
    if (display === "percentage") return comma(value, 4) + "%";
    return comma(value, 2);
  }
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
  const parts = [];
  if (d) parts.push(d+"d");
  if (h) parts.push(h+"h");
  if (m) parts.push(m+"m");
  if (!parts.length || s) parts.push(s+"s");
  return parts.join(" ");
}

/* =========================
   Storage
   ========================= */
const STORAGE_KEY = "trakstar:data:v2";
const LEGACY_KEY  = "trakstar:data";

let data = null;
try {
  data = JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || "[]");
  if (!Array.isArray(data)) data = [];
} catch { data = []; }

/* Normalize legacy shapes */
data = data.map(it => {
  if (it.type === "counter") {
    return {
      id: it.id || crypto.randomUUID(),
      type: "counter",
      name: it.name,
      color: it.color || "#6366f1",
      counterType: it.trackerType === "financial" ? "financial" :
                   it.counterType || "numerical",
      value: Number(it.value) || 0,
      transactions: Array.isArray(it.transactions) ? it.transactions : [],
      cumulative: it.cumulative || null
    };
  }
  if (it.type === "timer") {
    return {
      id: it.id || crypto.randomUUID(),
      type: "timer",
      name: it.name,
      color: it.color || "#10b981",
      running: !!it.running,
      startedAt: it.startedAt || 0,
      totalMs: it.totalMs || 0
    };
  }
  if (it.type === "folder") {
    return { id: it.id || crypto.randomUUID(), type:"folder", name: it.name || "Folder", children:(it.children||[]).map(x=>x) };
  }
  return it;
});

/* Save (debounced) */
let saveQueued = false;
function save(now=false) {
  if (now) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(LEGACY_KEY, JSON.stringify(data));
    localStorage.setItem("autosave_snapshot", JSON.stringify({ at: Date.now(), data }));
    return;
  }
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => { saveQueued = false; save(true); }, 250);
}
setInterval(() => save(true), 15000);

/* =========================
   Modal
   ========================= */
function createModal(title, bodyNodes, onOk, okLabel="Save", options={}) {
  const tpl = $("#modal-template");
  const frag = tpl.content.cloneNode(true);
  const root = $(".modal-backdrop", frag);
  $(".modal-title", frag).textContent = title;
  const body = $(".modal-body", frag);
  for (const n of bodyNodes) body.append(n);
  const footer = $(".modal-footer", frag);
  const closeBtn = $(".modal-close", frag);
  const ok = createEl("button", { textContent: okLabel });
  const cancel = createEl("button", { textContent: "Cancel" });

  ok.onclick = () => { try { onOk && onOk(); } finally { document.body.removeChild(root); } };
  cancel.onclick = closeBtn.onclick = () => document.body.removeChild(root);
  footer.append(cancel, ok);
  document.body.appendChild(root);
  return { root, body, footer };
}

/* =========================
   Data helpers
   ========================= */
function getAllFolders(list=data, out=[]) {
  for (const it of list) {
    if (it.type === 'folder') { out.push(it); getAllFolders(it.children || [], out); }
  }
  return out;
}
function walkCounters(list, out=[]) {
  for (const it of list) {
    if (it.type === 'counter') out.push(it);
    else if (it.type === 'folder') walkCounters(it.children || [], out);
  }
  return out;
}
function findItemById(id, list=data, parent=null) {
  for (const it of list) {
    if (it.id === id) return { item: it, parent, list };
    if (it.type === 'folder') {
      const r = findItemById(id, it.children || [], it);
      if (r) return r;
    }
  }
  return null;
}

/* =========================
   Cumulative math
   ========================= */
function classifyType(ct) {
  if (ct === "percentage") return "percentage";
  if (ct === "financial") return "financial";
  return "numerical";
}
/**
 * Rule:
 * - All percentages ⇒ average them (simple mean).
 * - If mixing percentages with anything else:
 *   do the other calculations first, treat that as 100%, then
 *   average that implied 100% with the explicit percentages.
 */
function computeCumulative(counter) {
  const all = walkCounters(data);
  const ids = (counter.cumulative?.ids || []).filter(Boolean);
  const items = ids.map(id => all.find(x => x.id === id)).filter(Boolean);

  if (!items.length) return { value: 0, display: "numerical" };

  const types = items.map(c => classifyType(c.counterType));
  const hasPct = types.includes("percentage");
  const onlyPct = hasPct && types.every(t => t === "percentage");
  const hasFinancial = types.includes("financial");

  if (onlyPct) {
    const avg = items.reduce((s,c)=>s+Number(c.value||0),0) / items.length;
    return { value: avg, display: "percentage" };
  }

  // Sum of non-percent values (numerical + financial)
  const nonPct = items.filter(c => classifyType(c.counterType) !== "percentage");
  const sumNonPct = nonPct.reduce((s,c)=>s+Number(c.value||0),0);

  if (hasPct) {
    // Equate the non-percent result to 100%
    const implied100 = 100;
    const pcts = items.filter(c => classifyType(c.counterType) === "percentage").map(c => Number(c.value||0));
    const avgPct = (implied100 + (pcts.length ? (pcts.reduce((s,v)=>s+v,0) / pcts.length) : 0)) / (pcts.length ? 2 : 1);
    return { value: avgPct, display: "percentage" };
  }

  // No percentages: prefer financial display if any financial present
  return { value: sumNonPct, display: hasFinancial ? "financial" : "numerical" };
}
function recomputeAllCumulatives() {
  let changed = false;
  for (const c of walkCounters(data)) {
    if (c.counterType === "cumulative") {
      const { value, display } = computeCumulative(c);
      // store computed value so sorting/search shows something stable
      if (c.value !== value) { c.value = value; changed = true; }
      // remember last computed display hint
      c._display = display;
    }
  }
  if (changed) save(true);
}

/* =========================
   Rendering
   ========================= */
function render() {
  recomputeAllCumulatives(); // keep cumulative in sync
  const q = ($("#search").value || "").toLowerCase().trim();
  const container = $("#tracker-container");
  container.textContent = "";

  function match(it) {
    if (!q) return true;
    const hay = (it.name || "").toLowerCase();
    return hay.includes(q);
  }

  function renderList(list, into) {
    for (const it of list) {
      if (it.type === "folder") {
        if (!match(it)) { renderList(it.children||[], into); continue; }
        const node = createEl("div", { className:"item" });
        const title = createEl("div", { className:"item-header" });
        const left = createEl("div");
        left.innerHTML = `<div class="item-title">${it.name}</div><div class="small-muted">Folder</div>`;
        const btns = createEl("div", { className:"btn-div" });
        const addC = createEl("button", { textContent:"➕", title:"Add Counter" });
        const addT = createEl("button", { textContent:"⏱️", title:"Add Timer" });
        const edit = createEl("button", { textContent:"✏️", title:"Rename" });
        const del  = createEl("button", { textContent:"🗑️", title:"Delete" });
        addC.onclick = () => openAddCounter(it.id);
        addT.onclick = () => openAddTimer(it.id);
        edit.onclick = () => {
          const name = createInput("Name","text", it.name);
          createModal("Rename Folder",[name],()=>{ it.name = name.value.trim()||"Folder"; save(); render(); });
        };
        del.onclick = () => {
          if (!confirm("Delete folder and all contents?")) return;
          const idx = data.indexOf(it);
          if (idx>-1) data.splice(idx,1);
          save(); render();
        };
        btns.append(addC, addT, edit, del);
        title.append(left, btns); node.append(title);
        renderList(it.children||[], node);
        into.append(node);
        continue;
      }

      if (!match(it)) continue;
      const node = createEl("div", { className:"item" });
      const title = createEl("div", { className:"item-header" });

      const left = createEl("div");
      const sub = it.counterType === "cumulative"
        ? (it._display || "cumulative")
        : it.counterType;
      left.innerHTML = `<div class="item-title">${it.name}</div><div class="item-sub small-muted">${sub}</div>`;

      const rightVal = createEl("div", { className:"item-title", textContent: formatCounterValue(it) });
      title.append(left, rightVal);

      const btns = createEl("div", { className:"btn-div" });
      const tx = createEl("button", { textContent:"📊", title:"Transactions" });
      const edit = createEl("button", { textContent:"✏️", title:"Edit" });
      const combine = it.counterType === "cumulative" ? createEl("button", { textContent:"🧩", title:"Combine counters" }) : null;
      const del  = createEl("button", { textContent:"🗑️", title:"Delete" });

      tx.onclick = () => openTransactions(it.id);
      edit.onclick = () => openEditCounter(it.id);
      if (combine) combine.onclick = () => openCombineCounters(it.id);
      del.onclick = () => {
        if (!confirm("Delete this counter?")) return;
        const where = findItemById(it.id);
        where.list.splice(where.list.indexOf(it), 1);
        save(); render();
      };

      btns.append(tx, edit); if (combine) btns.append(combine); btns.append(del);
      node.append(title, btns);
      into.append(node);
    }
  }

  renderList(data, container);
}

/* =========================
   Add/Edit items
   ========================= */
function openAddCounter(parentFolderId="") {
  const name = createInput("Name","text","");
  const type = createSelect([
    ["numerical","Numerical"],
    ["financial","Financial ($)"],
    ["percentage","Percentage (%)"],
    ["cumulative","Cumulative"]
  ]);
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
      transactions: [],
      cumulative: type.value === "cumulative" ? { ids: [] } : null
    };
    const parent = dest.value ? findItemById(dest.value).item : null;
    (parent?.children || data).push(counter);
    save(); render();
    if (counter.counterType === "cumulative") openCombineCounters(counter.id);
  });
}
function openEditCounter(id) {
  const { item: counter, list: oldParentArr } = findItemById(id);
  if (!counter || counter.type !== "counter") return;

  const name = createInput("Name","text", counter.name);
  const type = createSelect([
    ["numerical","Numerical"],
    ["financial","Financial ($)"],
    ["percentage","Percentage (%)"],
    ["cumulative","Cumulative"]
  ]);
  type.value = counter.counterType;
  const value = createInput("Value","number", String(counter.value));
  value.disabled = counter.counterType === "cumulative";
  const color = createInput("Color","color", counter.color || "#6366f1");
  const dest  = createFolderSelect();

  // set current parent
  let currentParent = "";
  getAllFolders().forEach(f => { if ((f.children||[]).includes(counter)) currentParent = f.id; });
  dest.value = currentParent || "";

  const m = createModal("Edit Counter", [name,type,value,color,dest], () => {
    if (!name.value.trim()) return alert("Name is required");
    const v = Number(value.value);
    if (counter.counterType !== "cumulative" && isNaN(v)) return alert("Value must be a number");
    counter.name = name.value.trim();
    counter.counterType = type.value;
    if (counter.counterType !== "cumulative") counter.value = v;
    counter.color = color.value || "#6366f1";
    if (counter.counterType === "cumulative" && !counter.cumulative) counter.cumulative = { ids: [] };
    if (counter.counterType !== "cumulative") counter.cumulative = null;

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

  // If cumulative, offer “Combine” button in footer
  if (counter.counterType === "cumulative") {
    const btn = createEl("button", { textContent: "🧩 Configure Combination" });
    btn.onclick = () => { document.body.removeChild(m.root); openCombineCounters(id); };
    $(".modal-footer", m.root).prepend(btn);
  }
}
function openCombineCounters(counterId) {
  const { item: counter } = findItemById(counterId);
  if (!counter || counter.type !== "counter") return;

  const allCounters = walkCounters(data).filter(c => c.id !== counter.id);
  const chosen = new Set(counter.cumulative?.ids || []);

  const list = createEl("div");
  for (const c of allCounters) {
    const row = createEl("label", { className: "inline", style:"align-items:center" });
    const cb = createEl("input", { type:"checkbox", checked: chosen.has(c.id) });
    const name = createEl("div", { textContent: c.name });
    row.append(cb, name); list.append(row);
    cb.addEventListener("change", () => { if (cb.checked) chosen.add(c.id); else chosen.delete(c.id); });
  }
  if (!allCounters.length) list.append(createEl("div", { className:"small-muted", textContent:"No other counters yet." }));

  createModal("Combine Counters", [list], () => {
    counter.cumulative = { ids: Array.from(chosen) };
    const { value, display } = computeCumulative(counter);
    counter.value = value; counter._display = display;
    save(); render();
  });
}

/* Transactions (simple) */
function openTransactions(id) {
  const { item: counter } = findItemById(id);
  if (!counter || counter.type !== "counter") return;

  const amount = createInput("Amount (+/-)","number","");
  const note   = createInput("Note","text","");
  const list   = createEl("div");
  const items  = (counter.transactions || []).slice().reverse();
  if (!items.length) list.append(createEl("div",{className:"small-muted",textContent:"No transactions yet."}));
  for (const t of items) list.append(createEl("div",{textContent:`${t.ts ? new Date(t.ts).toLocaleString() : ''}  ${t.amount>0?'+':''}${t.amount} – ${t.note||''}`}));

  createModal("Transactions", [amount,note,list], () => {
    const v = Number(amount.value || 0);
    if (isNaN(v) || v === 0) return;
    counter.value = Number(counter.value || 0) + v;
    counter.transactions = counter.transactions || [];
    counter.transactions.push({ ts: Date.now(), amount: v, note: note.value || "" });
    save(); render();
  }, "Add");
}

/* =========================
   Menus, search, basic actions
   ========================= */
(function menus(){
  const menuBtn = $("#menu-btn");
  const menu = $("#main-menu");
  menuBtn.addEventListener("click", () => {
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  });

  $("#dark-toggle").addEventListener("click", () => {
    const darkNow = document.documentElement.classList.toggle("dark-pre");
    document.body.classList.toggle("dark-pre", darkNow);
    localStorage.setItem("darkMode", darkNow ? "dark" : "light");
  });

  $("#export-data").onclick = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "trakstar.json"; a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 1500);
  };
  $("#import-btn").onclick = () => $("#import-data").click();
  $("#import-data").onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(txt => {
      try {
        const parsed = JSON.parse(txt);
        if (!Array.isArray(parsed)) throw new Error("Bad file");
        data = parsed; save(true); render();
      } catch (err) { alert("Import failed: "+err.message); }
    });
  };

  $("#clear-all-trackers").onclick = () => {
    if (!confirm("Delete ALL data?")) return;
    data = []; save(); render();
  };

  const fab = $("#fab-btn");
  const actions = $("#fab-actions");
  fab.onclick = () => actions.style.display = actions.style.display === "flex" ? "none" : "flex";
  $("#add-folder").onclick = () => {
    const name = createInput("Folder name","text","");
    createModal("Add Folder",[name],()=> {
      data.push({ id: crypto.randomUUID(), type:"folder", name: name.value.trim()||"Folder", children:[] });
      save(); render();
    });
  };
  $("#add-counter").onclick = () => openAddCounter();
  $("#add-timer").onclick = () => openAddTimer();

  const search = $("#search"), clearBtn = $("#clear-search");
  search.addEventListener("input", () => { clearBtn.style.display = search.value ? "inline-block" : "none"; render(); });
  clearBtn.addEventListener("click", () => { search.value=""; clearBtn.style.display="none"; render(); });
})();

/* =========================
   Timers (unchanged behavior)
   ========================= */
function openAddTimer(parentFolderId="") {
  const name = createInput("Name","text","");
  const color = createInput("Color","color","#10b981");
  const dest = createFolderSelect(parentFolderId);
  createModal("Add Timer",[name,color,dest],() => {
    if (!name.value.trim()) return alert("Name is required");
    const t = { id: crypto.randomUUID(), type:"timer", name:name.value.trim(), color:color.value||"#10b981", running:false, startedAt:0, totalMs:0 };
    const parent = dest.value ? findItemById(dest.value).item : null;
    (parent?.children || data).push(t);
    save(); render();
  });
}

/* =========================
   Timer loop + notifications
   ========================= */
function scheduleAllNotifications(){ /* (left intentionally lightweight) */ }
setInterval(()=>{ render(); }, 1000);

/* Expose a tiny API for bank.js */
(function exposeAPI(){
  function updateCounterValueInternal(id, newValue, isBank=false) {
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
      save(true);
      render();
    }
  }
  window.TrakStar = window.TrakStar || {};
  window.TrakStar.getCounters = () => walkCounters(data).map(c => ({ id:c.id, name:c.name, counterType:c.counterType }));
  window.TrakStar.updateCounterValue = (id, val, isBank=false) => updateCounterValueInternal(id, val, isBank);
})();
render();
scheduleAllNotifications();
