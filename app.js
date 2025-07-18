let data = JSON.parse(localStorage.getItem("trackers") || "[]");
const container = document.getElementById("tracker-container");
const searchInput = document.getElementById("search");
const importInput = document.getElementById("import-data");

function save() {
  localStorage.setItem("trackers", JSON.stringify(data));
}

function render() {
  container.innerHTML = "";
  const filter = searchInput.value.toLowerCase();
  const isNumber = !isNaN(parseFloat(filter));

  const tree = buildTree(data);
  container.appendChild(renderTree(tree, filter, isNumber));
  initializeDragAndDrop(container, tree);
}

function buildTree(items) {
  return items.map(item => {
    if (item.type === "folder") {
      item.children = item.children || [];
      return {
        ...item,
        children: buildTree(item.children),
      };
    }
    return item;
  });
}

function renderTree(items, filter, isNumber) {
  const frag = document.createDocumentFragment();
  items.forEach(item => {
    if (item.type === "tracker") {
      const match = item.name.toLowerCase().includes(filter) || (isNumber && item.value.toString().includes(filter));
      if (match) frag.appendChild(createTrackerCard(item));
    } else if (item.type === "folder") {
      const childMatches = renderTree(item.children, filter, isNumber);
      const folderMatch = item.name.toLowerCase().includes(filter);
      if (folderMatch || childMatches.children.length > 0) {
        frag.appendChild(createFolderCard(item, filter, childMatches));
      }
    }
  });
  return frag;
}

function createTrackerCard(tracker) {
  const el = document.createElement("div");
  el.className = "tracker";
  el.style.borderLeftColor = tracker.color || "#6366f1";
  el.innerHTML = `
    <div><strong>${tracker.name}</strong>: ${tracker.value.toFixed(2)}</div>
    <div>
      <button onclick="openTransactions('${tracker.id}')">📊</button>
      <button onclick="editTrackerModal('${tracker.id}')">✏️</button>
      <button class="delete" onclick="deleteTracker('${tracker.id}')">🗑️</button>
    </div>
  `;
  return el;
}

function createFolderCard(folder, filter, childrenFrag) {
  const el = document.createElement("div");
  el.className = "folder";
  el.style.borderLeftColor = "#888";

  const header = document.createElement("div");
  header.className = "folder-header";
  header.innerHTML = `<span>${folder.expanded ? "▼" : "▶"} <strong>${folder.name}</strong> (${folder.children.length})</span>`;
  const delBtn = document.createElement("button");
  delBtn.className = "delete";
  delBtn.textContent = "🗑️";
  delBtn.onclick = e => {
    e.stopPropagation();
    deleteFolder(folder.id);
  };
  header.appendChild(delBtn);

  header.onclick = () => {
    folder.expanded = !folder.expanded;
    save();
    render();
  };

  el.appendChild(header);

  if (folder.expanded) {
    const list = document.createElement("div");
    list.className = "folder-trackers";
    list.dataset.folderId = folder.id;

    folder.children.forEach(child => {
      if (child.type === "tracker") {
        list.appendChild(createTrackerCard(child));
      } else if (child.type === "folder") {
        list.appendChild(createFolderCard(child, filter, child.children));
      }
    });

    el.appendChild(list);
  }

  return el;
}

function findTrackerById(id, items = data) {
  for (const item of items) {
    if (item.id === id) return { tracker: item, parent: items };
    if (item.type === "folder") {
      const found = findTrackerById(id, item.children || []);
      if (found) return found;
    }
  }
  return {};
}

function deleteTracker(id) {
  const found = findTrackerById(id);
  if (!found || !found.tracker) return;
  const index = found.parent.indexOf(found.tracker);
  if (index > -1) {
    found.parent.splice(index, 1);
    save();
    render();
  }
}

function deleteFolder(id) {
  if (!confirm("Delete this folder and all its contents?")) return;
  deleteTracker(id);
}

function addTrackerModal() {
  const name = createInput("Tracker name");
  const val = createInput("Initial value", "number");
  const color = createInput("Color", "color", "#6366f1");
  const folder = createSelectFolder();

  const modal = createModal("Add Tracker", [name, val, color, folder], {
    onConfirm: () => {
      const tracker = {
        id: crypto.randomUUID(),
        type: "tracker",
        name: name.value,
        value: parseFloat(val.value),
        color: color.value,
        transactions: [],
      };

      const parent = folder.value ? findTrackerById(folder.value).tracker : null;
      if (parent && parent.type === "folder") {
        parent.children.push(tracker);
      } else {
        data.push(tracker);
      }

      save();
      render();
    }
  });
}

function addFolderModal() {
  const name = createInput("Folder name");
  const folder = createSelectFolder();

  const modal = createModal("Add Folder", [name, folder], {
    onConfirm: () => {
      const newFolder = {
        id: crypto.randomUUID(),
        type: "folder",
        name: name.value,
        expanded: true,
        children: []
      };

      const parent = folder.value ? findTrackerById(folder.value).tracker : null;
      if (parent && parent.type === "folder") {
        parent.children.push(newFolder);
      } else {
        data.push(newFolder);
      }

      save();
      render();
    }
  });
}

function createInput(placeholder, type = "text", defaultValue = "") {
  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.style.display = "block";
  input.style.marginBottom = "10px";
  input.value = defaultValue;
  return input;
}

function createSelectFolder() {
  const select = document.createElement("select");
  select.style.display = "block";
  select.style.marginBottom = "10px";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "-- No Folder --";
  select.appendChild(defaultOption);

  function addOptions(items, prefix = "") {
    items.forEach(item => {
      if (item.type === "folder") {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = prefix + item.name;
        select.appendChild(option);
        addOptions(item.children, prefix + "— ");
      }
    });
  }

  addOptions(data);
  return select;
}

function createModal(title, elements, { onConfirm }) {
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "#fff";
  modal.style.padding = "20px";
  modal.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
  modal.style.borderRadius = "10px";
  modal.style.zIndex = "1000";

  const h3 = document.createElement("h3");
  h3.textContent = title;
  modal.appendChild(h3);

  elements.forEach(el => modal.appendChild(el));

  const btnRow = document.createElement("div");
  btnRow.style.marginTop = "10px";
  btnRow.style.textAlign = "right";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = () => document.body.removeChild(modal);

  const confirm = document.createElement("button");
  confirm.textContent = "OK";
  confirm.style.marginLeft = "10px";
  confirm.onclick = () => {
    onConfirm();
    document.body.removeChild(modal);
  };

  btnRow.appendChild(cancel);
  btnRow.appendChild(confirm);
  modal.appendChild(btnRow);
  document.body.appendChild(modal);
  return modal;
}

function openTransactions(id) {
  const { tracker } = findTrackerById(id);
  if (!tracker) return;

  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "#fff";
  modal.style.padding = "20px";
  modal.style.borderRadius = "10px";
  modal.style.zIndex = "1000";
  modal.style.maxHeight = "70vh";
  modal.style.overflowY = "auto";

  let html = `<h3>${tracker.name} Transactions</h3>`;
  html += (tracker.transactions || []).map(t =>
    `<div><strong>${new Date(t.time).toLocaleString()}</strong>: ${t.amount > 0 ? "+" : ""}${t.amount.toFixed(2)} ${t.note ? `- <em>${t.note}</em>` : ""}</div>`
  ).join("") || "<em>No transactions</em>";

  html += `<br/><button id="addTx">+ Add</button><button id="closeTx" style="margin-left:10px;">Close</button>`;
  modal.innerHTML = html;
  document.body.appendChild(modal);

  document.getElementById("addTx").onclick = () => {
    const amount = parseFloat(prompt("Amount:"));
    if (isNaN(amount)) return alert("Invalid");
    const note = prompt("Note (optional):");
    tracker.transactions = tracker.transactions || [];
    tracker.transactions.push({ amount, note, time: Date.now() });
    tracker.value += amount;
    save();
    render();
    document.body.removeChild(modal);
    openTransactions(id);
  };

  document.getElementById("closeTx").onclick = () => {
    document.body.removeChild(modal);
  };
}

function editTrackerModal(id) {
  const { tracker } = findTrackerById(id);
  if (!tracker) return;

  const name = createInput("Name", "text", tracker.name);
  const value = createInput("Value", "number", tracker.value);
  const color = createInput("Color", "color", tracker.color || "#6366f1");

  createModal("Edit Tracker", [name, value, color], {
    onConfirm: () => {
      tracker.name = name.value;
      tracker.value = parseFloat(value.value);
      tracker.color = color.value;
      save();
      render();
    }
  });
}

function initializeDragAndDrop(containerEl, items) {
  new Sortable(containerEl, {
    animation: 150,
    onEnd: evt => {
      const [moved] = items.splice(evt.oldIndex, 1);
      items.splice(evt.newIndex, 0, moved);
      save();
    }
  });

  containerEl.querySelectorAll(".folder-trackers").forEach(list => {
    const folderId = list.dataset.folderId;
    const folder = findTrackerById(folderId).tracker;
    new Sortable(list, {
      group: 'nested',
      animation: 150,
      onEnd: evt => {
        const [moved] = folder.children.splice(evt.oldIndex, 1);
        folder.children.splice(evt.newIndex, 0, moved);
        save();
      }
    });
  });
}

// Event listeners
searchInput.oninput = render;
document.getElementById("add-folder").onclick = addFolderModal;
document.getElementById("add-tracker").onclick = addTrackerModal;
document.getElementById("export-data").onclick = () => {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trackers_backup.json";
  a.click();
  URL.revokeObjectURL(url);
};
importInput.onchange = e => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (Array.isArray(imported)) {
        data = imported;
        save();
        render();
      } else alert("Invalid data");
    } catch {
      alert("Error parsing file");
    }
  };
  reader.readAsText(file);
};

render();
