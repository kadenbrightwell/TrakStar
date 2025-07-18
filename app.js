let data = JSON.parse(localStorage.getItem("trackers") || "[]");
const container = document.getElementById("tracker-container");
const searchInput = document.getElementById("search");

const COLORS = [
  "#FF9AA2","#FFB7B2","#FFDAC1",
  "#E2F0CB","#B5EAD7","#C7CEEA",
  "#FFCBF2","#BDB2FF","#FFDFBA",
  "#D5E8D4","#F8CECC","#F4E1D2"
];

function save() {
  localStorage.setItem("trackers", JSON.stringify(data));
}

function render() {
  container.innerHTML = "";
  const filter = searchInput.value.toLowerCase();

  const mainList = document.createElement("div");
  mainList.id = "main-list";
  data.filter(t => t.type === "tracker" && (
      t.name.toLowerCase().includes(filter) ||
      t.value.toString().includes(filter)
    ))
    .forEach(t => mainList.appendChild(renderTrackerCard(t)));
  container.appendChild(mainList);

  data.filter(f => f.type === "folder").forEach(f => {
    const matchFolder = f.name.toLowerCase().includes(filter);
    const matchTracker = f.trackers.some(t =>
      t.name.toLowerCase().includes(filter) ||
      t.value.toString().includes(filter)
    );
    if (!matchFolder && !matchTracker) return;
    container.appendChild(renderFolderCard(f, filter));
  });

  initDrag();
}

function renderTrackerCard(tracker) {
  const el = document.createElement("div");
  el.className = "tracker";
  el.style.borderLeftColor = tracker.color;
  el.innerHTML = `
    <div><strong>${tracker.name}</strong>: ${tracker.value.toFixed(2)}</div>
    <div>
      <button onclick="openTransModal('${tracker.id}')">🧾</button>
      <button onclick="openEditModal('${tracker.id}')">✏️</button>
      <button class="delete" onclick="deleteTracker('${tracker.id}')">🗑️</button>
    </div>`;
  return el;
}

function renderFolderCard(folder, filter) {
  const el = document.createElement("div");
  el.className = "folder";
  el.style.borderLeftColor = "#555";

  const hd = document.createElement("div");
  hd.className = "folder-header";
  hd.innerHTML = `
    <span>${folder.expanded ? "▼" : "▶️"} <strong>${folder.name}</strong> (${folder.trackers.length})</span>
    <span><button class="delete" onclick="deleteFolder('${folder.id}')">🗑️</button></span>
  `;
  hd.onclick = () => {
    folder.expanded = !folder.expanded;
    save(); render();
  };
  el.appendChild(hd);

  if (folder.expanded) {
    const list = document.createElement("div");
    list.className = "folder-trackers";
    folder.trackers.filter(t =>
        t.name.toLowerCase().includes(filter) ||
        t.value.toString().includes(filter)
      )
      .forEach(t => list.appendChild(renderTrackerCard(t)));
    el.appendChild(list);
  }

  return el;
}

function initDrag() {
  new Sortable(document.getElementById("main-list"), {
    animation: 150,
    onEnd: e => reorder(e, "")
  });
  data.filter(f => f.type === "folder").forEach(f => {
    const folderEl = [...document.getElementsByClassName("folder")].find(fe =>
      fe.querySelector(".folder-header strong").textContent === f.name
    );
    if (!folderEl) return;
    const listEl = folderEl.querySelector(".folder-trackers");
    if (listEl) new Sortable(listEl, {
      animation: 150,
      onEnd: e => reorder(e, f.id)
    });
  });
}

function reorder(evt, folderId) {
  if (folderId) {
    const folder = data.find(f => f.id === folderId);
    const arr = folder.trackers;
    const [m] = arr.splice(evt.oldIndex, 1);
    arr.splice(evt.newIndex, 0, m);
  } else {
    const roots = data.filter(i => i.type === "tracker");
    const [m] = roots.splice(evt.oldIndex, 1);
    roots.splice(evt.newIndex, 0, m);
    data = roots.concat(data.filter(i => i.type === "folder"));
  }
  save();
  render();
}

function openAddModal(isFolder = false) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h3>${isFolder ? "New Folder" : "New Tracker"}</h3>`;

  const nameInput = document.createElement("input");
  nameInput.placeholder = "Name";
  modal.appendChild(nameInput);

  let valueInput, colorPick, folderSel;
  if (!isFolder) {
    valueInput = document.createElement("input");
    valueInput.placeholder = "Value";
    valueInput.type = "number";
    valueInput.step = "any";
    modal.appendChild(valueInput);

    colorPick = document.createElement("div");
    colorPick.className = "color-picker";
    COLORS.forEach(c => {
      const sw = document.createElement("div");
      sw.className = "color-swatch";
      sw.style.background = c;
      sw.onclick = () => {
        document.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("selected"));
        sw.classList.add("selected");
      };
      colorPick.appendChild(sw);
    });
    modal.appendChild(colorPick);

    const folders = data.filter(d => d.type === "folder");
    if (folders.length) {
      folderSel = document.createElement("select");
      folderSel.innerHTML = `<option value="">Main List</option>` +
        folders.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
      modal.appendChild(folderSel);
    }
  }

  const btns = document.createElement("div");
  btns.style.textAlign = "right";
  btns.style.marginTop = "10px";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = () => modal.remove();

  const ok = document.createElement("button");
  ok.textContent = "Save";
  ok.onclick = () => {
    const name = nameInput.value.trim();
    if (!name) return alert("Name required.");

    if (isFolder) {
      data.push({ id: crypto.randomUUID(), type: "folder", name, trackers: [], expanded: true });
    } else {
      const val = parseFloat(valueInput.value);
      if (isNaN(val)) return alert("Value must be a number.");
      const color = document.querySelector(".color-swatch.selected")?.style.background || COLORS[0];
      const tr = { id: crypto.randomUUID(), type: "tracker", name, value: val, color, transactions: [] };
      if (folderSel && folderSel.value) {
        data.find(f => f.id === folderSel.value).trackers.push(tr);
      } else {
        data.push(tr);
      }
    }

    save();
    render();
    modal.remove();
  };

  btns.append(cancel, ok);
  modal.append(btns);
  document.body.appendChild(modal);
}

function openEditModal(id) {
  const { tracker } = findById(id);
  if (!tracker) return alert("Tracker not found.");

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h3>Edit Tracker</h3>`;

  const nameInput = document.createElement("input");
  nameInput.value = tracker.name;
  modal.appendChild(nameInput);

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.step = "any";
  valueInput.value = tracker.value;
  modal.appendChild(valueInput);

  const colorPick = document.createElement("div");
  colorPick.className = "color-picker";
  COLORS.forEach(c => {
    const sw = document.createElement("div");
    sw.className = "color-swatch" + (c === tracker.color ? " selected" : "");
    sw.style.background = c;
    sw.onclick = () => {
      document.querySelectorAll(".color-swatch").forEach(x => x.classList.remove("selected"));
      sw.classList.add("selected");
    };
    colorPick.appendChild(sw);
  });
  modal.appendChild(colorPick);

  const btns = document.createElement("div");
  btns.style.textAlign = "right";
  btns.style.marginTop = "10px";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = () => modal.remove();

  const ok = document.createElement("button");
  ok.textContent = "Save";
  ok.onclick = () => {
    const name = nameInput.value.trim();
    if (!name) return alert("Name required.");

    const val = parseFloat(valueInput.value);
    if (isNaN(val)) return alert("Value must be a number.");

    const color = document.querySelector(".color-swatch.selected")?.style.background || tracker.color;
    tracker.name = name;
    tracker.value = val;
    tracker.color = color;

    save();
    render();
    modal.remove();
  };

  btns.append(cancel, ok);
  modal.append(btns);
  document.body.appendChild(modal);
}

function openTransModal(id) {
  const { tracker } = findById(id);
  if (!tracker) return alert("Tracker not found.");

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `<h3>${tracker.name} Transactions</h3>`;

  const listDiv = document.createElement("div");
  listDiv.style.maxHeight = "300px";
  listDiv.style.overflowY = "auto";

  (tracker.transactions || []).forEach((tr, i) => {
    const trDiv = document.createElement("div");
    trDiv.style.display = "flex";
    trDiv.style.justifyContent = "space-between";
    trDiv.style.fontSize = "14px";
    trDiv.style.marginBottom = "4px";

    trDiv.textContent = `${new Date(tr.time).toLocaleString()}: ${tr.amount >= 0 ? "+" : ""}${tr.amount.toFixed(2)}${tr.note ? " – " + tr.note : ""}`;

    const edit = document.createElement("button");
    edit.textContent = "✏️";
    edit.onclick = () => {
      const a = parseFloat(prompt("New amount:", tr.amount));
      if (isNaN(a)) return;
      const n = prompt("New note:", tr.note);
      tr.amount = a;
      tr.note = n;
      save();
      render();
      modal.remove();
      openTransModal(id);
    };

    const del = document.createElement("button");
    del.textContent = "🗑️";
    del.onclick = () => {
      tracker.transactions.splice(i, 1);
      save();
      render();
      modal.remove();
      openTransModal(id);
    };

    trDiv.append(edit, del);
    listDiv.appendChild(trDiv);
  });

  if (!(tracker.transactions || []).length) {
    const none = document.createElement("div");
    none.style.fontStyle = "italic";
    none.textContent = "No transactions";
    listDiv.appendChild(none);
  }

  modal.appendChild(listDiv);

  const add = document.createElement("button");
  add.textContent = "+ Add";
  add.style.marginTop = "10px";
  add.onclick = () => {
    const a = parseFloat(prompt("Amount:"));
    if (isNaN(a)) return;
    const n = prompt("Note (optional):");
    tracker.value += a;
    tracker.transactions = tracker.transactions || [];
    tracker.transactions.push({ amount: a, note: n, time: Date.now() });
    save();
    render();
    modal.remove();
    openTransModal(id);
  };

  const cancel = document.createElement("button");
  cancel.textContent = "Close";
  cancel.style.marginLeft = "8px";
  cancel.onclick = () => modal.remove();

  const btns = document.createElement("div");
  btns.style.textAlign = "right";
  btns.style.marginTop = "8px";
  btns.append(add, cancel);

  modal.append(btns);
  document.body.appendChild(modal);
}

function findById(id) {
  for (const i of data) {
    if (i.type === "tracker" && i.id === id) return { tracker: i };
    if (i.type === "folder") {
      const t = i.trackers.find(x => x.id === id);
      if (t) return { tracker: t };
    }
  }
  return {};
}

function deleteTracker(id) {
  if (confirm("Delete this tracker?")) {
    data = data.filter(i => !(i.type === "tracker" && i.id === id));
    data.filter(f => f.type === "folder")
      .forEach(f => f.trackers = f.trackers.filter(t => t.id !== id));
    save();
    render();
  }
}

function deleteFolder(id) {
  if (confirm("Delete this folder and all its trackers?")) {
    data = data.filter(f => !(f.type === "folder" && f.id === id));
    save();
    render();
  }
}

searchInput.oninput = () => render();

document.getElementById("add-tracker").onclick = () => openAddModal(false);
document.getElementById("add-folder").onclick = () => openAddModal(true);
document.getElementById("export-data")?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trackers_export.json";
  a.click();
  URL.revokeObjectURL(url);
});

render();
