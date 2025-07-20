let data = JSON.parse(localStorage.getItem("trackers") || "[]");
const container = document.getElementById("tracker-container");
const searchInput = document.getElementById("search");
const clearSearchBtn = document.getElementById("clear-search");
const importInput = document.getElementById("import-data");
const importBtn = document.getElementById("import-btn");
const darkToggle = document.getElementById("dark-toggle");
let lastScroll = 0;

function save() {
  localStorage.setItem("trackers", JSON.stringify(data));
}

function render() {
  lastScroll = container.scrollTop;
  container.innerHTML = "";
  const filter = searchInput.value.toLowerCase();
  const isNumber = !isNaN(parseFloat(filter));
  const filteredTree = buildTree(data, filter, isNumber);
  container.appendChild(renderTree(filteredTree));
  initializeDragAndDrop();
  setTimeout(() => { container.scrollTop = lastScroll; }, 1);
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

  const infoDiv = document.createElement("div");
  infoDiv.innerHTML = `<strong>${tracker.name}</strong>: ${tracker.value.toFixed(2)}`;

  const btnDiv = document.createElement("div");

  const txBtn = document.createElement("button");
  txBtn.setAttribute('aria-label', 'View Transactions');
  txBtn.innerText = "📊";
  txBtn.onclick = () => openTransactions(tracker.id);

  const editBtn = document.createElement("button");
  editBtn.setAttribute('aria-label', 'Edit Tracker');
  editBtn.innerText = "✏️";
  editBtn.onclick = () => editTrackerModal(tracker.id);

  const delBtn = document.createElement("button");
  delBtn.className = "delete";
  delBtn.setAttribute('aria-label', 'Delete Tracker');
  delBtn.innerText = "🗑️";
  delBtn.onclick = () => deleteItem(tracker.id);

  btnDiv.appendChild(txBtn);
  btnDiv.appendChild(editBtn);
  btnDiv.appendChild(delBtn);

  el.appendChild(infoDiv);
  el.appendChild(btnDiv);

  return el;
}

function createFolderCard(folder) {
  const el = document.createElement("div");
  el.className = "folder";
  el.dataset.id = folder.id;
  el.style.borderLeftColor = folder.color || "#888";

  const header = document.createElement("div");
  header.className = "folder-header";

  // Add colored dot for folder color
  const colorDot = document.createElement("span");
  colorDot.style.display = "inline-block";
  colorDot.style.width = colorDot.style.height = "14px";
  colorDot.style.background = folder.color || "#888";
  colorDot.style.borderRadius = "50%";
  colorDot.style.marginRight = "8px";
  colorDot.style.border = "1px solid #ccc";
  colorDot.title = folder.color || "#888";

  const span = document.createElement("span");
  span.innerHTML = `${folder.expanded ? "▼" : "▶"} <strong>${folder.name}</strong> (${folder.children.length})`;

  const btnDiv = document.createElement("div");
  btnDiv.style.display = "flex";
  btnDiv.style.gap = "6px";

  // Edit Folder Button
  const editBtn = document.createElement("button");
  editBtn.setAttribute('aria-label', 'Edit Folder');
  editBtn.innerText = "✏️";
  editBtn.onclick = e => {
    e.stopPropagation();
    editFolderModal(folder.id);
  };

  // Delete Folder Button
  const delBtn = document.createElement("button");
  delBtn.className = "delete";
  delBtn.setAttribute('aria-label', 'Delete Folder');
  delBtn.innerText = "🗑️";
  delBtn.onclick = e => {
    e.stopPropagation();
    deleteItem(folder.id);
  };

  btnDiv.appendChild(editBtn);
  btnDiv.appendChild(delBtn);

  header.appendChild(colorDot);
  header.appendChild(span);
  header.appendChild(btnDiv);

  header.onclick = e => {
    // Only toggle if not clicking a button
    if (e.target.tagName.toLowerCase() !== "button") {
      folder.expanded = !folder.expanded;
      save();
      render();
    }
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
      if (found && found.item) return found;
    }
  }
  return {};
}

function deleteItem(id) {
  const { item, parent } = findItemById(id);
  if (!item || !parent) return;
  if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
  const index = parent.indexOf(item);
  if (index > -1) {
    parent.splice(index, 1);
    save();
    render();
  }
}

// Close any open modals before opening a new one
function closeAnyModals() {
  document.querySelectorAll('.modal-backdrop, .trakstar-modal').forEach(e => e.remove());
}

function addTrackerModal() {
  closeAnyModals();
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
  closeAnyModals();
  const name = createInput("Folder name");
  const color = createInput("Color", "color", "#888");
  const folder = createFolderSelect();

  createModal("Add Folder", [name, color, folder], {
    onConfirm: () => {
      if (!name.value.trim()) return alert("Name is required");
      const folderObj = {
        id: crypto.randomUUID(),
        type: "folder",
        name: name.value.trim(),
        color: color.value,
        expanded: true,
        children: [],
      };
      const parent = folder.value ? findItemById(folder.value).item : null;
      (parent?.children || data).push(folderObj);
      save();
      render();
    }
  });
}

function editFolderModal(id) {
  closeAnyModals();
  const { item: folder, parent: oldParentArr } = findItemById(id);
  if (!folder) return;

  const name = createInput("Name", "text", folder.name);
  const color = createInput("Color", "color", folder.color || "#888");

  // Prevent moving to self/descendants:
  const descendants = getDescendantFolderIds(folder);
  const folderSelect = createFolderSelect(folder.id, descendants);

  // Pre-select current parent folder (if any)
  let currentParentId = null;
  for (const folderObj of getAllFolders(data)) {
    if ((folderObj.children || []).includes(folder)) {
      currentParentId = folderObj.id;
      break;
    }
  }
  folderSelect.value = currentParentId || "";

  createModal("Edit Folder", [name, color, folderSelect], {
    onConfirm: () => {
      if (!name.value.trim()) return alert("Folder name is required");
      folder.name = name.value.trim();
      folder.color = color.value || "#888";

      // Handle moving between folders/groups
      let newParentArr = data;
      if (folderSelect.value) {
        const newParent = findItemById(folderSelect.value).item;
        if (newParent && newParent.children) {
          newParentArr = newParent.children;
        }
      }
      // If parent changes, move folder in real data
      if (newParentArr !== oldParentArr) {
        const oldIdx = oldParentArr.indexOf(folder);
        if (oldIdx > -1) oldParentArr.splice(oldIdx, 1);
        newParentArr.push(folder);
      }

      save();
      render();
    }
  });
}

function getAllFolders(items, arr = []) {
  items.forEach(item => {
    if (item.type === "folder") {
      arr.push(item);
      getAllFolders(item.children || [], arr);
    }
  });
  return arr;
}

// Exclude self and descendants when moving folders (prevents cyclic)
function createFolderSelect(excludeId, descendants = []) {
  const select = document.createElement("select");
  select.style.display = "block";
  select.style.marginBottom = "10px";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "-- No Folder --";
  select.appendChild(defaultOption);

  function addOptions(items, prefix = "") {
    items.forEach(item => {
      if (item.type === "folder" && item.id !== excludeId && !descendants.includes(item.id)) {
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

function getDescendantFolderIds(folder) {
  let ids = [];
  (folder.children || []).forEach(child => {
    if (child.type === "folder") {
      ids.push(child.id, ...getDescendantFolderIds(child));
    }
  });
  return ids;
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
  closeAnyModals();
  // Backdrop for clicking out to dismiss
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.onclick = () => {
    document.body.removeChild(backdrop);
    document.body.removeChild(modal);
  };

  const modal = document.createElement("div");
  modal.className = "trakstar-modal";
  modal.tabIndex = -1;

  const h3 = document.createElement("h3");
  h3.textContent = title;
  modal.appendChild(h3);
  inputs.forEach(i => modal.appendChild(i));

  const btnRow = document.createElement("div");
  btnRow.style.marginTop = "10px";
  btnRow.style.textAlign = "right";

  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";
  cancel.onclick = () => {
    document.body.removeChild(backdrop);
    document.body.removeChild(modal);
  };

  const confirm = document.createElement("button");
  confirm.textContent = "OK";
  confirm.style.marginLeft = "10px";
  confirm.onclick = () => {
    onConfirm();
    document.body.removeChild(backdrop);
    document.body.removeChild(modal);
  };

  btnRow.appendChild(cancel);
  btnRow.appendChild(confirm);
  modal.appendChild(btnRow);

  // Prevent backdrop click from bubbling to modal
  modal.onclick = e => e.stopPropagation();

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  // Focus first input
  setTimeout(() => {
    const inp = modal.querySelector("input, select");
    if (inp) inp.focus();
  }, 50);

  return modal;
}

function openTransactions(id) {
  closeAnyModals();
  const { item: tracker } = findItemById(id);
  if (!tracker) return;

  // Backdrop for modal
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.onclick = () => {
    document.body.removeChild(backdrop);
    document.body.removeChild(modal);
  };

  const modal = document.createElement("div");
  modal.className = "trakstar-modal";
  modal.style.maxWidth = "340px";
  modal.style.maxHeight = "70vh";
  modal.style.overflowY = "auto";

  let html = `<h3>${tracker.name} Transactions</h3>`;
  html += (tracker.transactions || []).map(t =>
    `<div><strong>${new Date(t.time).toLocaleString()}</strong>: ${t.amount > 0 ? "+" : ""}${t.amount.toFixed(2)} ${t.note ? `- <em>${t.note}</em>` : ""}</div>`
  ).join("") || "<em>No transactions</em>";
  html += `<br/><button id="addTx" aria-label="Add Transaction">+ Add</button><button id="closeTx" aria-label="Close" style="margin-left:10px;">Close</button>`;
  modal.innerHTML = html;

  modal.onclick = e => e.stopPropagation();

  document.body.appendChild(backdrop);
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
    document.body.removeChild(backdrop);
    document.body.removeChild(modal);
    openTransactions(id);
  };
  document.getElementById("closeTx").onclick = () => {
    document.body.removeChild(backdrop);
    document.body.removeChild(modal);
  };
}

// Updated: allows moving tracker between folders via modal
function editTrackerModal(id) {
  closeAnyModals();
  const { item: tracker, parent: oldParentArr } = findItemById(id);
  if (!tracker) return;

  const name = createInput("Name", "text", tracker.name);
  const value = createInput("Value", "number", tracker.value);
  const color = createInput("Color", "color", tracker.color || "#6366f1");
  const folder = createFolderSelect(id); // Exclude this tracker

  // Pre-select current parent folder (if any)
  let currentParentId = null;
  for (const folderObj of getAllFolders(data)) {
    if ((folderObj.children || []).includes(tracker)) {
      currentParentId = folderObj.id;
      break;
    }
  }
  folder.value = currentParentId || "";

  createModal("Edit Tracker", [name, value, color, folder], {
    onConfirm: () => {
      if (!name.value.trim()) return alert("Name is required");
      if (isNaN(parseFloat(value.value))) return alert("Value must be a number");
      tracker.name = name.value.trim();
      tracker.value = parseFloat(value.value);
      tracker.color = color.value;

      // Move tracker if folder/group changed
      let newParentArr = data;
      if (folder.value) {
        const newParent = findItemById(folder.value).item;
        if (newParent && newParent.children) {
          newParentArr = newParent.children;
        }
      }
      // If parent changed, move tracker in real data
      if (newParentArr !== oldParentArr) {
        const oldIdx = oldParentArr.indexOf(tracker);
        if (oldIdx > -1) oldParentArr.splice(oldIdx, 1);
        newParentArr.push(tracker);
      }

      save();
      render();
    }
  });
}

function initializeDragAndDrop() {
  document.querySelectorAll("#main-list, .folder-trackers").forEach(list => {
    new Sortable(list, {
      group: {
        name: list.dataset.folderId ? `folder-${list.dataset.folderId}` : "root",
        pull: false, // Only allow reordering within the same group
        put: false
      },
      animation: 150,
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onEnd: evt => {
        if (evt.from !== evt.to) return; // Prevent cross-group moves

        const draggedId = evt.item.dataset.id;
        // Find parent array in real data
        let parentArr = data;
        if (evt.from.dataset.folderId) {
          const parentFolder = findItemById(evt.from.dataset.folderId).item;
          parentArr = parentFolder ? parentFolder.children : data;
        }

        const { item } = findItemById(draggedId, parentArr);
        if (!item) return;
        const oldIndex = parentArr.indexOf(item);
        if (oldIndex > -1) parentArr.splice(oldIndex, 1);

        // Clamp new index
        let newIndex = Math.max(0, Math.min(evt.newIndex, parentArr.length));
        parentArr.splice(newIndex, 0, item);

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
  darkToggle.textContent = document.body.classList.contains("dark") ? "☀️" : "🌓";
}

darkToggle.addEventListener("click", toggleDarkMode);

initDarkMode();

// Listeners
searchInput.oninput = () => {
  render();
  clearSearchBtn.style.display = searchInput.value ? "inline" : "none";
};
clearSearchBtn.onclick = () => {
  searchInput.value = "";
  render();
  clearSearchBtn.style.display = "none";
  searchInput.focus();
};
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
importBtn.onclick = () => importInput.click();
importInput.onchange = e => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      // Extra: validate it's an array of objects with expected shape
      if (Array.isArray(imported) && imported.every(x => typeof x === "object" && x.type)) {
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

                                                                                                                                      //-- v CLOUD STUFFS v --//

// === SUPER SIMPLE JSONBlob PUBLIC SAVE/LOAD ===

// Map of your user IDs to jsonblob.com blob IDs (cached in browser)
let userIdMap = JSON.parse(localStorage.getItem("jsonblob_id_map") || "{}");

// Helper: save mapping
function saveUserIdMap() {
  localStorage.setItem("jsonblob_id_map", JSON.stringify(userIdMap));
}

// SAVE to cloud with user ID
document.getElementById("cloud-save").onclick = async () => {
  const userId = prompt("Enter a unique ID to save (example: daniels_list_071925):");
  if (!userId) return;
  try {
    let blobId = userIdMap[userId];
    let res, dataUrl;
    if (blobId) {
      // Blob exists, update it
      dataUrl = "https://jsonblob.com/api/jsonBlob/" + blobId;
      res = await fetch(dataUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to update blob.");
    } else {
      // Create new blob
      res = await fetch("https://jsonblob.com/api/jsonBlob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to create blob.");
      blobId = res.headers.get("Location").split("/").pop();
      userIdMap[userId] = blobId;
      saveUserIdMap();
    }
    alert("Saved! Your ID: " + userId + "\nShare it to load on any device.");
  } catch (e) {
    alert("Save error: " + e.message);
  }
};

// LOAD from cloud with user ID
document.getElementById("cloud-load").onclick = async () => {
  const userId = prompt("Enter the ID to load (example: daniels_list_071925):");
  if (!userId) return;
  try {
    let blobId = userIdMap[userId];
    // If not in local map, ask user for the blobId (or provide a directory yourself)
    if (!blobId) {
      blobId = prompt(
        "ID not found in this browser. Enter the numeric code (if you have it), or ask whoever shared the data for the blob code."
      );
      if (!blobId) return;
      userIdMap[userId] = blobId;
      saveUserIdMap();
    }
    const url = "https://jsonblob.com/api/jsonBlob/" + blobId;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Blob not found.");
    const blobData = await res.json();
    // Simple structure check
    if (Array.isArray(blobData) && typeof blobData[0] === "object") {
      data = blobData;
      save();
      render();
      alert("Loaded successfully!");
    } else {
      throw new Error("Invalid data.");
    }
  } catch (e) {
    alert("Load error: " + e.message);
  }
};

                                                                                                                                            //-- ^ CLOUD STUFFS ^ --//

render();
