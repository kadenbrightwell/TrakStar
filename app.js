let data = JSON.parse(localStorage.getItem("trackers") || "[]");
const container = document.getElementById("tracker-container");
const searchInput = document.getElementById("search");
const importInput = document.getElementById("import-data");

function save() {
  localStorage.setItem("trackers", JSON.stringify(data));
}

function render() {
  container.innerHTML = "";
  const filter = searchInput.value.toLowerCase().trim();

  const filterNum = parseFloat(filter);
  const isNumericSearch = !isNaN(filterNum);

  // Render top-level trackers matching name or value
  const rootTrackers = data.filter(i => i.type === "tracker" &&
    (i.name.toLowerCase().includes(filter) ||
    (isNumericSearch && i.value.toString().includes(filter)))
  );

  const mainList = document.createElement("div");
  mainList.id = "main-list";
  rootTrackers.forEach(t => mainList.appendChild(createTrackerCard(t)));
  container.appendChild(mainList);

  // Render folders matching name or any tracker inside matches
  data.filter(i => i.type === "folder").forEach(folder => {
    const folderNameMatches = folder.name.toLowerCase().includes(filter);
    const anyTrackerMatches = folder.trackers.some(t =>
      t.name.toLowerCase().includes(filter) ||
      (isNumericSearch && t.value.toString().includes(filter))
    );
    if (!folderNameMatches && !anyTrackerMatches) return;
    container.appendChild(createFolderCard(folder, filter));
  });

  initializeDragAndDrop();
}

function createTrackerCard(tracker, parentFolder = null) {
  const el = document.createElement("div");
  el.className = "tracker";
  el.style.borderLeftColor = tracker.color || "#6366f1";
  el.innerHTML = `
    <div><strong>${tracker.name}</strong>: ${tracker.value.toFixed(2)}</div>
    <div>
      <button onclick="openTransactions('${tracker.id}', ${!!parentFolder})">🗂️</button>
      <button onclick="editTrackerModal('${tracker.id}', ${!!parentFolder})">✏️</button>
      <button class="delete" onclick="deleteTracker('${tracker.id}', ${!!parentFolder}, '${parentFolder?.id || ''}')">🗑️</button>
    </div>
  `;
  return el;
}

function createFolderCard(folder, filter) {
  const el = document.createElement("div");
  el.className = "folder";
  el.style.borderLeftColor = "#555";
  const isExpanded = folder.expanded;

  const header = document.createElement("div");
  header.className = "folder-header";
  header.innerHTML = `
    <span>${isExpanded ? "▼" : "▶"} <strong>${folder.name}</strong> (${folder.trackers.length})</span>
    <span>
      <button>🗑️</button>
    </span>
  `;

  // Delete button stops propagation so it won't toggle expand
  header.querySelector("button").onclick = (e) => {
    e.stopPropagation();
    deleteFolder(folder.id);
  };

  // Clicking header toggles folder expand/collapse
  header.addEventListener("click", () => {
    folder.expanded = !folder.expanded;
    save();
    render();
  });

  el.appendChild(header);

  if (isExpanded) {
    const list = document.createElement("div");
    list.className = "folder-trackers";

    const filterLower = filter.toLowerCase();
    const filterNum = parseFloat(filterLower);
    const isNumericSearch = !isNaN(filterNum);

    folder.trackers.filter(t =>
      t.name.toLowerCase().includes(filterLower) ||
      (isNumericSearch && t.value.toString().includes(filterLower))
    ).forEach(t => list.appendChild(createTrackerCard(t, folder)));

    el.appendChild(list);
  }
  return el;
}

function createModal(title, contentElements, options = {}) {
  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "white";
  modal.style.padding = "20px";
  modal.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
  modal.style.borderRadius = "10px";
  modal.style.zIndex = "10000";
  modal.style.minWidth = "280px";

  const titleEl = document.createElement("h3");
  titleEl.textContent = title;
  modal.appendChild(titleEl);

  contentElements.forEach(el => modal.appendChild(el));

  const btnContainer = document.createElement("div");
  btnContainer.style.marginTop = "15px";
  btnContainer.style.textAlign = "right";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = options.cancelText || "Cancel";
  cancelBtn.onclick = () => {
    document.body.removeChild(modal);
  };

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = options.confirmText || "OK";
  confirmBtn.style.marginLeft = "10px";
  confirmBtn.onclick = () => {
    if (options.onConfirm) options.onConfirm();
  };

  btnContainer.appendChild(cancelBtn);
  btnContainer.appendChild(confirmBtn);
  modal.appendChild(btnContainer);
  document.body.appendChild(modal);
  return modal;
}

function addTrackerModal() {
  const nameInput = document.createElement("input");
  nameInput.placeholder = "Tracker name";
  nameInput.style.width = "100%";
  nameInput.style.marginBottom = "8px";

  const valueInput = document.createElement("input");
  valueInput.placeholder = "Initial value";
  valueInput.type = "number";
  valueInput.step = "any";
  valueInput.style.width = "100%";
  valueInput.style.marginBottom = "8px";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = "#6366f1";
  colorInput.style.width = "100%";
  colorInput.style.marginBottom = "8px";

  const folders = data.filter(d => d.type === "folder");
  let folderSelect;
  if (folders.length) {
    folderSelect = document.createElement("select");
    folderSelect.style.width = "100%";
    folderSelect.style.marginBottom = "8px";
    folderSelect.innerHTML = `<option value="">-- No Folder (Main List)</option>` +
      folders.map(f => `<option value="${f.id}">${f.name}</option>`).join("");
  }

  const content = [nameInput, valueInput, colorInput];
  if (folderSelect) content.push(folderSelect);

  const modal = createModal("Add Tracker", content, {
    confirmText: "Add",
    cancelText: "Cancel",
    onConfirm: () => {
      const name = nameInput.value.trim();
      const val = parseFloat(valueInput.value);
      const color = colorInput.value;
      if (!name) return alert("Name is required.");
      if (isNaN(val)) return alert("Value must be a number.");
      const tracker = {
        id: crypto.randomUUID(),
        type: "tracker",
        name,
        value: val,
        color,
        transactions: []
      };
      if (folderSelect && folderSelect.value) {
        const folder = data.find(f => f.id === folderSelect.value);
        folder.trackers.push(tracker);
      } else {
        data.push(tracker);
      }
      save();
      render();
      document.body.removeChild(modal);
    }
  });
}

function addFolderModal() {
  const nameInput = document.createElement("input");
  nameInput.placeholder = "Folder name";
  nameInput.style.width = "100%";
  nameInput.style.marginBottom = "8px";

  const modal = createModal("Add Folder", [nameInput], {
    confirmText: "Add",
    cancelText: "Cancel",
    onConfirm: () => {
      const name = nameInput.value.trim();
      if (!name) return alert("Folder name is required.");
      data.push({
        id: crypto.randomUUID(),
        type: "folder",
        name,
        trackers: [],
        expanded: true
      });
      save();
      render();
      document.body.removeChild(modal);
    }
  });
}

function editTrackerModal(id, inFolder) {
  const { tracker } = findTrackerById(id);
  if (!tracker) return alert("Tracker not found.");

  const nameInput = document.createElement("input");
  nameInput.value = tracker.name;
  nameInput.style.width = "100%";
  nameInput.style.marginBottom = "8px";

  const valueInput = document.createElement("input");
  valueInput.type = "number";
  valueInput.step = "any";
  valueInput.value = tracker.value;
  valueInput.style.width = "100%";
  valueInput.style.marginBottom = "8px";

  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = tracker.color || "#6366f1";
  colorInput.style.width = "100%";
  colorInput.style.marginBottom = "8px";

  const modal = createModal("Edit Tracker", [nameInput, valueInput, colorInput], {
    confirmText: "Save",
    cancelText: "Cancel",
    onConfirm: () => {
      const newName = nameInput.value.trim();
      const newVal = parseFloat(valueInput.value);
      const newColor = colorInput.value;
      if (!newName) return alert("Name required.");
      if (isNaN(newVal)) return alert("Value must be a number.");
      tracker.name = newName;
      tracker.value = newVal;
      tracker.color = newColor;
      save();
      render();
      document.body.removeChild(modal);
    }
  });
}

function findTrackerById(id) {
  for (const item of data) {
    if (item.type === "tracker" && item.id === id) return { tracker: item, folder: null };
    if (item.type === "folder") {
      const tracker = item.trackers.find(t => t.id === id);
      if (tracker) return { tracker, folder: item };
    }
  }
  return {};
}

function openTransactions(id) {
  const { tracker } = findTrackerById(id);
  if (!tracker) return alert("Tracker not found.");

  const modal = document.createElement("div");
  modal.style.position = "fixed";
  modal.style.top = "50%";
  modal.style.left = "50%";
  modal.style.transform = "translate(-50%, -50%)";
  modal.style.background = "white";
  modal.style.padding = "20px";
  modal.style.boxShadow = "0 4px 10px rgba(0,0,0,0.2)";
  modal.style.borderRadius = "10px";
  modal.style.zIndex = "10000";
  modal.style.minWidth = "280px";
  modal.style.maxHeight = "70vh";
  modal.style.overflowY = "auto";

  let html = `<h3>${tracker.name} Transactions</h3><div style="margin-bottom:12px; max-height: 300px; overflow-y: auto;">`;
  if (tracker.transactions && tracker.transactions.length) {
    tracker.transactions.forEach(tr => {
      html += `<div style="border-bottom:1px solid #eee; padding:4px 0;">
        <strong>${new Date(tr.time).toLocaleString()}</strong>: ${tr.amount >= 0 ? "+" : ""}${tr.amount.toFixed(2)}
        ${tr.note ? ` - <em>${tr.note}</em>` : ""}
      </div>`;
    });
  } else {
    html += "<em>No transactions yet.</em>";
  }
  html += `</div>
    <button id="addTransBtn">+ Add Transaction</button>
    <button id="closeTransBtn" style="margin-left:8px;">Close</button>
  `;

  modal.innerHTML = html;
  document.body.appendChild(modal);

  document.getElementById("addTransBtn").onclick = () => {
    const amountStr = prompt("Enter transaction amount (use negative for subtraction):");
    if (amountStr === null) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return alert("Invalid number.");
    const note = prompt("Optional note:");
    tracker.value += amount;
    tracker.transactions = tracker.transactions || [];
    tracker.transactions.push({ amount, note, time: Date.now() });
    save();
    render();
    document.body.removeChild(modal);
    openTransactions(id);
  };

  document.getElementById("closeTransBtn").onclick = () => {
    document.body.removeChild(modal);
  };
}

function deleteTracker(id, inFolder, folderId) {
  if (inFolder) {
    const folder = data.find(f => f.id === folderId);
    if (!folder) return;
    folder.trackers = folder.trackers.filter(t => t.id !== id);
  } else {
    data = data.filter(t => t.id !== id);
  }
  save();
  render();
}

function deleteFolder(id) {
  if (confirm("Delete this folder and all its trackers?")) {
    data = data.filter(f => f.id !== id);
    save();
    render();
  }
}

searchInput.oninput = () => render();

function initializeDragAndDrop() {
  new Sortable(document.getElementById("main-list"), {
    animation: 150,
    onEnd: e => reorder(e, "")
  });

  data.filter(i => i.type === "folder").forEach(folder => {
    const listEl = [...document.getElementsByClassName("folder")].find(f =>
      f.querySelector(".folder-header strong").textContent === folder.name);
    if (!listEl) return;
    const folderTrackersList = listEl.querySelector(".folder-trackers");
    if (folderTrackersList) {
      new Sortable(folderTrackersList, {
        animation: 150,
        onEnd: e => reorder(e, folder.id)
      });
    }
  });
}

function reorder(evt, folderId) {
  let arr;
  if (folderId) {
    const folder = data.find(f => f.id === folderId);
    if (!folder) return;
    arr = folder.trackers;
  } else {
    arr = data.filter(t => t.type === "tracker");
  }
  const [moved] = arr.splice(evt.oldIndex, 1);
  arr.splice(evt.newIndex, 0, moved);
  save();
  render();
}

// Export JSON
document.getElementById("export-data").onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "trackers_backup.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// Import JSON
importInput.onchange = e => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    if (confirm("Importing will overwrite all current data. Continue?")) {
      try {
        const imported = JSON.parse(reader.result);
        if (Array.isArray(imported)) {
          data = imported;
          save();
          render();
          alert("Import successful!");
        } else {
          alert("Invalid import format.");
        }
      } catch {
        alert("Failed to parse JSON.");
      }
    }
  };
  reader.readAsText(file);
};

// Initialize
render();

// Button listeners for adding
document.getElementById("add-folder").onclick = addFolderModal;
document.getElementById("add-tracker").onclick = addTrackerModal;
