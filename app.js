let data = JSON.parse(localStorage.getItem("trackers") || "[]");
const container = document.getElementById("tracker-container");
const searchInput = document.getElementById("search");
const importInput = document.getElementById("import-data");
const darkToggle = document.getElementById("dark-toggle");

function save() {
  localStorage.setItem("trackers", JSON.stringify(data));
}

function render() {
  container.innerHTML = "";
  const filter = searchInput.value.toLowerCase();
  const isNumber = !isNaN(parseFloat(filter));
  const filteredTree = buildTree(data, filter, isNumber);
  container.appendChild(renderTree(filteredTree));
  initializeDragAndDrop();
}

function buildTree(items, filter = "", isNumber = false) {
  return items.filter(item => {
    if (item.type === "tracker") {
      return item.name.toLowerCase().includes(filter) || (isNumber && item.value.toString().includes(filter));
    }
    if (item.type === "folder") {
      item.children = buildTree(item.children || [], filter, isNumber);
      return item.name.toLowerCase().includes(filter) || item.children.length > 0;
    }
    return false;
  });
}

function renderTree(items) {
  const frag = document.createElement("div");
  frag.id = "main-list";

  items.forEach(item => {
    if (item.type === "tracker") {
      frag.appendChild(createTrackerCard(item));
    } else if (item.type === "folder") {
      frag.appendChild(createFolderCard(item));
    }
  });

  return frag;
}

function createTrackerCard(tracker) {
  const el = document.createElement("div");
  el.className = "tracker";
  el.dataset.id = tracker.id;
  el.style.borderLeftColor = tracker.color || "#6366f1";
  el.innerHTML = `
    <div><strong>${tracker.name}</strong>: ${tracker.value.toFixed(2)}</div>
    <div>
      <button onclick="openTransactions('${tracker.id}')">📊</button>
      <button onclick="editTrackerModal('${tracker.id}')">✏️</button>
      <button class="delete" onclick="deleteItem('${tracker.id}')">🗑️</button>
    </div>
  `;
  return el;
}

function createFolderCard(folder) {
  const el = document.createElement("div");
  el.className = "folder";
  el.dataset.id = folder.id;
  el.style.borderLeftColor = "#888";

  const header = document.createElement("div");
  header.className = "folder-header";
  header.innerHTML = `
    <span>${folder.expanded ? "▼" : "▶"} <strong>${folder.name}</strong> (${folder.children.length})</span>
    <button class="delete" onclick="deleteItem('${folder.id}'); event.stopPropagation();">🗑️</button>
  `;
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
      } else {
        list.appendChild(createFolderCard(child));
      }
    });

    el.appendChild(list);
  }

  return el;
}

function findItemById(id, items = data, parent = null) {
  for (const item of items) {
    if (item.id === id) return { item, parent: items };
    if (item.type === "folder") {
      const found = findItemById(id, item.children || [], item);
      if (found) return found;
    }
  }
  return {};
}

function deleteItem(id) {
  const { item, parent } = findItemById(id);
  if (!item || !parent) return;
  const index = parent.indexOf(item);
  if (index > -1) {
    parent.splice(index, 1);
    save();
    render();
  }
}

function addTrackerModal() {
  const name = createInput("Tracker name");
  const val = createInput("Initial value", "number");
  const color = createInput("Color", "color", "#6366f1");
  const folder = createFolderSelect();

  createModal("Add Tracker", [name, val, color, folder], {
    onConfirm: () => {
      if (!name.value.trim()) return alert("Name is required");
      if (isNaN(parseFloat(val.value))) return alert("Value must be a number");
      const tracker = {
        id: crypto.randomUUID(),
        type: "tracker",
        name: name.value.trim(),
        value: parseFloat(val.value),
        color: color.value,
        transactions: [],
      };
      const parent = folder.value ? findItemById(folder.value).item : null;
      (parent?.children || data).push(tracker);
      save();
      render();
    }
  });
}

function addFolderModal() {
  const name = createInput("Folder name");
  const folder = createFolderSelect();

  createModal("Add Folder", [name, folder], {
    onConfirm: () => {
      if (!name.value.trim()) return alert("Folder name is required");
      const newFolder = {
        id: crypto.randomUUID(),
        type: "folder",
        name: name.value.trim(),
        expanded: true,
        children: [],
      };
      const parent = folder.value ? findItemById(folder.value).item : null;
      (parent?.children || data).push(newFolder);
      save();
      render();
    }
  });
}

function createFolderSelect() {
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
        addOptions(item.children || [], prefix + "— ");
      }
    });
  }

  addOptions(data);
  return select;
}

function createInput(placeholder, type = "text", defaultValue = "") {
  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder;
  input.value = defaultValue;
  input.style.display = "block";
  input.style.marginBottom = "10px";
  return input;
}

function createModal(title, inputs, { onConfirm }) {
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "#fff";
  modal.style.padding = "20px";
  modal.style.borderRadius = "10px";
  modal.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
  modal.style.zIndex = "1000";

  const h3 = document.createElement("h3");
  h3.textContent = title;
  modal.appendChild(h3);
  inputs.forEach(i => modal.appendChild(i));

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
  const { item: tracker } = findItemById(id);
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
    const note = prompt("Note:");
    tracker.transactions = tracker.transactions || [];
    tracker.transactions.push({ amount, note, time: Date.now() });
    tracker.value += amount;
    save();
    render();
    document.body.removeChild(modal);
    openTransactions(id);
  };
  document.getElementById("closeTx").onclick = () => document.body.removeChild(modal);
}

function editTrackerModal(id) {
  const { item: tracker } = findItemById(id);
  if (!tracker) return;

  const name = createInput("Name", "text", tracker.name);
  const value = createInput("Value", "number", tracker.value);
  const color = createInput("Color", "color", tracker.color || "#6366f1");

  createModal("Edit Tracker", [name, value, color], {
    onConfirm: () => {
      if (!name.value.trim()) return alert("Name is required");
      if (isNaN(parseFloat(value.value))) return alert("Value must be a number");
      tracker.name = name.value.trim();
      tracker.value = parseFloat(value.value);
      tracker.color = color.value;
      save();
      render();
    }
  });
}

function initializeDragAndDrop() {
  const lists = document.querySelectorAll("#main-list, .folder-trackers");
  lists.forEach(list => {
    new Sortable(list, {
      group: "shared",
      animation: 150,
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onEnd: evt => {
        const draggedId = evt.item.dataset.id;
        const { item, parent } = findItemById(draggedId);
        if (!item || !parent) return;

        // Remove from old position
        const oldIndex = parent.indexOf(item);
        if (oldIndex > -1) parent.splice(oldIndex, 1);

        // Insert into new position
        const newListId = evt.to.dataset.folderId;
        const newParent = newListId ? findItemById(newListId).item.children : data;
        newParent.splice(evt.newIndex, 0, item);

        save();
        render();
      }
    });
  });
}

// Dark mode toggle setup
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
  darkToggle.textContent = document.body.classList.contains("dark") ? "☀️ Light Mode" : "🌓 Dark Mode";
}

darkToggle.addEventListener("click", toggleDarkMode);

initDarkMode();

// Listeners
searchInput.oninput = render;
document.getElementById("add-tracker").onclick = addTrackerModal;
document.getElementById("add-folder").onclick = addFolderModal;
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
        alert("Import successful!");
      } else alert("Invalid format");
    } catch {
      alert("Could not import");
    }
  };
  reader.readAsText(file);
};

render();
