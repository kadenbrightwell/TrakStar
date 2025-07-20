// === TrakStar Enhanced - Menu + Settings ===
let data = JSON.parse(localStorage.getItem("trackers") || "[]");
const container = document.getElementById("tracker-container");
const searchInput = document.getElementById("search");
const clearSearchBtn = document.getElementById("clear-search");
const importInput = document.getElementById("import-data");
const importBtn = document.getElementById("import-btn");
const darkToggle = document.getElementById("dark-toggle");
const moreBtn = document.getElementById("more-btn");
const utilityMenu = document.getElementById("utility-menu");
const settingsBtn = document.getElementById("settings-btn");
let lastScroll = 0;

// ---- FOLDER STATS FUNCTION ----
function folderStats(folder) {
  let directFolders = 0, directTrackers = 0, subfolders = 0, subtrackers = 0;
  function walk(children, topLevel = false) {
    for (const item of children) {
      if (item.type === "folder") {
        if (topLevel) directFolders++;
        else subfolders++;
        walk(item.children || [], false);
      } else if (item.type === "tracker") {
        if (topLevel) directTrackers++;
        else subtrackers++;
      }
    }
  }
  walk(folder.children || [], true);
  return [directFolders, directTrackers, subfolders, subtrackers];
}

// ===================== RENDERING =====================
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
  btnDiv.className = "btn-div";

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

// Main screen folder card (no expansion, opens modal)
function createFolderCard(folder) {
  const el = document.createElement("div");
  el.className = "folder";
  el.dataset.id = folder.id;
  el.style.borderLeftColor = folder.color || "#888";

  const header = document.createElement("div");
  header.className = "folder-header";
  header.style.cursor = "pointer";

  // Colored dot
  const colorDot = document.createElement("span");
  colorDot.style.display = "inline-block";
  colorDot.style.width = colorDot.style.height = "14px";
  colorDot.style.background = folder.color || "#888";
  colorDot.style.borderRadius = "50%";
  colorDot.style.marginRight = "8px";
  colorDot.style.border = "1px solid #ccc";
  colorDot.title = folder.color || "#888";

  // ---- UPDATED FOLDER SUMMARY ----
  const [folders, trackers, subfolders, subtrackers] = folderStats(folder);
  let summary = `<strong>${folder.name}</strong> (${folders} folders, ${trackers} trackers`;
  if (subfolders > 0 || subtrackers > 0) {
    summary += `, ${subfolders} sub-folders, ${subtrackers} sub-trackers`;
  }
  summary += `)`;
  const span = document.createElement("span");
  span.innerHTML = summary;

  const btnDiv = document.createElement("div");
  btnDiv.className = "btn-div";

  // Edit
  const editBtn = document.createElement("button");
  editBtn.setAttribute('aria-label', 'Edit Folder');
  editBtn.innerText = "✏️";
  editBtn.onclick = e => {
    e.stopPropagation();
    editFolderModal(folder.id);
  };

  // Delete
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
    if (e.target.tagName.toLowerCase() !== "button") openFolderModal(folder.id);
  };
  el.appendChild(header);

  return el;
}

// --- BREADCRUMBS + FOLDER MODAL ---
function buildBreadcrumbs(folderId) {
  let breadcrumbs = [];
  function walk(nodeList, path) {
    for (const item of nodeList) {
      if (item.id === folderId) {
        breadcrumbs = [...path, item];
        return true;
      }
      if (item.type === "folder" && item.children?.length) {
        if (walk(item.children, [...path, item])) return true;
      }
    }
    return false;
  }
  walk(data, []);
  return breadcrumbs;
}

// Use for modal navigation state
let modalState = null;
function openFolderModal(folderId) {
  modalState = { folderId };

  closeAnyModals();
  const { item: folder } = findItemById(folderId);
  if (!folder) return;

  // Animate fade-in for backdrop and modal
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.style.opacity = 0;
  setTimeout(() => { backdrop.style.opacity = 1; }, 10);
  backdrop.onclick = () => {
    backdrop.style.opacity = 0;
    modal.style.opacity = 0;
    setTimeout(() => {
      if (document.body.contains(backdrop)) document.body.removeChild(backdrop);
      if (document.body.contains(modal)) document.body.removeChild(modal);
      modalState = null;
    }, 220);
  };

  const modal = document.createElement("div");
  modal.className = "trakstar-modal";
  modal.style.opacity = 0;
  setTimeout(() => { modal.style.opacity = 1; }, 15);
  modal.style.width = "100vw";
  modal.style.maxWidth = "100vw";
  modal.style.height = "100vh";
  modal.style.maxHeight = "100vh";
  modal.style.left = "0";
  modal.style.top = "0";
  modal.style.transform = "none";
  modal.style.borderRadius = "0";
  modal.style.padding = "0";
  modal.style.overflowY = "auto";
  modal.style.display = "flex";
  modal.style.flexDirection = "column";

  // Header bar
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.background = "var(--accent)";
  header.style.color = "white";
  header.style.padding = "16px 14px";
  header.style.fontSize = "1.1em";

  // --- Breadcrumbs logic for back button ---
  const crumbs = buildBreadcrumbs(folderId);

  let backHtml = '';
  if (crumbs.length > 1) {
    backHtml = `<button style="background:none;border:none;color:white;font-size:1.3em;" id="close-folder-modal">&#x2190;</button>`;
  } else {
    backHtml = `<button style="background:none;border:none;color:white;font-size:1.3em;" id="close-folder-modal">&#x2715;</button>`;
  }
  header.innerHTML = `${backHtml} <span>${folder.name}</span> <span></span>`;
  modal.appendChild(header);

  // --- BREADCRUMBS ---
  const breadcrumbsEl = document.createElement("div");
  breadcrumbsEl.className = "breadcrumbs";
  crumbs.forEach((item, idx) => {
    const crumb = document.createElement("span");
    crumb.textContent = item.name;
    if (idx < crumbs.length - 1) {
      crumb.onclick = () => {
        document.body.removeChild(backdrop);
        document.body.removeChild(modal);
        openFolderModal(item.id);
      };
    }
    breadcrumbsEl.appendChild(crumb);
  });
  modal.appendChild(breadcrumbsEl);

  // --- CONTENT ---
  const content = document.createElement("div");
  content.style.flex = "1";
  content.style.padding = "16px 14px";
  content.style.overflowY = "auto";

  // Subfolders as folder cards (with action buttons!)
  (folder.children || []).forEach(child => {
    if (child.type === "folder") {
      const card = createFolderCard(child);
      card.querySelector(".delete").onclick = e => {
        e.stopPropagation();
        deleteItem(child.id);
        document.body.removeChild(backdrop);
        document.body.removeChild(modal);
        openFolderModal(folderId);
      };
      card.querySelector(".btn-div button[aria-label='Edit Folder']").onclick = e => {
        e.stopPropagation();
        editFolderModal(child.id);
      };
      content.appendChild(card);
    }
  });

  // Trackers as tracker cards (with action buttons!)
  (folder.children || []).forEach(child => {
    if (child.type === "tracker") {
      const tcard = createTrackerCard(child);
      tcard.querySelector(".delete").onclick = e => {
        e.stopPropagation();
        deleteItem(child.id);
        document.body.removeChild(backdrop);
        document.body.removeChild(modal);
        openFolderModal(folderId);
      };
      tcard.querySelector("button[aria-label='Edit Tracker']").onclick = e => {
        e.stopPropagation();
        editTrackerModal(child.id);
      };
      content.appendChild(tcard);
    }
  });

  // Add buttons
  const btns = document.createElement("div");
  btns.className = "buttons";
  const addTrackerBtn = document.createElement("button");
  addTrackerBtn.innerText = "📋 Add Tracker";
  addTrackerBtn.onclick = e => {
    e.stopPropagation();
    addTrackerModal(folder.id, () => {
      setTimeout(() => openFolderModal(folder.id), 50);
    });
  };
  const addFolderBtn = document.createElement("button");
  addFolderBtn.innerText = "📂 Add Folder";
  addFolderBtn.onclick = e => {
    e.stopPropagation();
    addFolderModal(folder.id, () => {
      setTimeout(() => openFolderModal(folder.id), 50);
    });
  };
  btns.appendChild(addTrackerBtn);
  btns.appendChild(addFolderBtn);
  content.appendChild(btns);

  modal.appendChild(content);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  document.getElementById("close-folder-modal").onclick = () => {
    backdrop.style.opacity = 0;
    modal.style.opacity = 0;
    setTimeout(() => {
      if (document.body.contains(backdrop)) document.body.removeChild(backdrop);
      if (document.body.contains(modal)) document.body.removeChild(modal);
      if (crumbs.length > 1) {
        const up = crumbs[crumbs.length - 2];
        if (up && up.id) openFolderModal(up.id);
      }
    }, 210);
  };
}

function isMobile() {
  return window.innerWidth <= 700;
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
  document.querySelectorAll('.modal-backdrop, .trakstar-modal').forEach(e => {
    e.style.opacity = 0;
    setTimeout(() => e.remove(), 210);
  });
}

// ADD TRACKER/FOLDER MODALS: Accept callback to stay in modal after adding
function addTrackerModal(parentFolderId = null, afterAdd = null) {
  closeAnyModals();
  const name = createInput("Tracker name");
  const val = createInput("Initial value", "number");
  const color = createInput("Color", "color", "#6366f1");
  const folder = createFolderSelect();

  if (parentFolderId) folder.value = parentFolderId;

  createModal("Add Tracker", [name, val, color, folder], {
    onConfirm: (confirmBtn) => {
      if (!name.value.trim()) return alert("Name is required");
      if (isNaN(parseFloat(val.value))) return alert("Value must be a number");
      confirmBtn.disabled = true;
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
      if (afterAdd) afterAdd();
    }
  });
}
function addFolderModal(parentFolderId = null, afterAdd = null) {
  closeAnyModals();
  const name = createInput("Folder name");
  const color = createInput("Color", "color", "#888");
  const folder = createFolderSelect();

  if (parentFolderId) folder.value = parentFolderId;

  createModal("Add Folder", [name, color, folder], {
    onConfirm: (confirmBtn) => {
      if (!name.value.trim()) return alert("Name is required");
      confirmBtn.disabled = true;
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
      if (afterAdd) afterAdd();
    }
  });
}

function editFolderModal(id) {
  closeAnyModals();
  const { item: folder, parent: oldParentArr } = findItemById(id);
  if (!folder) return;

  const name = createInput("Name", "text", folder.name);
  const color = createInput("Color", "color", folder.color || "#888");
  const descendants = getDescendantFolderIds(folder);
  const folderSelect = createFolderSelect(folder.id, descendants);

  let currentParentId = null;
  for (const folderObj of getAllFolders(data)) {
    if ((folderObj.children || []).includes(folder)) {
      currentParentId = folderObj.id;
      break;
    }
  }
  folderSelect.value = currentParentId || "";

  createModal("Edit Folder", [name, color, folderSelect], {
    onConfirm: (confirmBtn) => {
      if (!name.value.trim()) return alert("Folder name is required");
      confirmBtn.disabled = true;
      folder.name = name.value.trim();
      folder.color = color.value || "#888";

      let newParentArr = data;
      if (folderSelect.value) {
        const newParent = findItemById(folderSelect.value).item;
        if (newParent && newParent.children) {
          newParentArr = newParent.children;
        }
      }
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
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.style.opacity = 0;
  setTimeout(() => { backdrop.style.opacity = 1; }, 10);
  backdrop.onclick = () => {
    backdrop.style.opacity = 0;
    modal.style.opacity = 0;
    setTimeout(() => {
      document.body.removeChild(backdrop);
      document.body.removeChild(modal);
    }, 210);
  };

  const modal = document.createElement("div");
  modal.className = "trakstar-modal";
  modal.style.opacity = 0;
  setTimeout(() => { modal.style.opacity = 1; }, 15);
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
    backdrop.style.opacity = 0;
    modal.style.opacity = 0;
    setTimeout(() => {
      document.body.removeChild(backdrop);
      document.body.removeChild(modal);
    }, 200);
  };

  const confirm = document.createElement("button");
  confirm.textContent = "OK";
  confirm.style.marginLeft = "10px";
  let clicked = false;
  confirm.onclick = () => {
    if (clicked) return;
    clicked = true;
    onConfirm(confirm);
    // close the modal instantly for feedback (if not already closed by handler)
    backdrop.style.opacity = 0;
    modal.style.opacity = 0;
    setTimeout(() => {
      if (document.body.contains(backdrop)) document.body.removeChild(backdrop);
      if (document.body.contains(modal)) document.body.removeChild(modal);
    }, 200);
  };

  btnRow.appendChild(cancel);
  btnRow.appendChild(confirm);
  modal.appendChild(btnRow);

  modal.onclick = e => e.stopPropagation();

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

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

function editTrackerModal(id) {
  closeAnyModals();
  const { item: tracker, parent: oldParentArr } = findItemById(id);
  if (!tracker) return;

  const name = createInput("Name", "text", tracker.name);
  const value = createInput("Value", "number", tracker.value);
  const color = createInput("Color", "color", tracker.color || "#6366f1");
  const folder = createFolderSelect(id);

  let currentParentId = null;
  for (const folderObj of getAllFolders(data)) {
    if ((folderObj.children || []).includes(tracker)) {
      currentParentId = folderObj.id;
      break;
    }
  }
  folder.value = currentParentId || "";

  createModal("Edit Tracker", [name, value, color, folder], {
    onConfirm: (confirmBtn) => {
      if (!name.value.trim()) return alert("Name is required");
      if (isNaN(parseFloat(value.value))) return alert("Value must be a number");
      confirmBtn.disabled = true;
      tracker.name = name.value.trim();
      tracker.value = parseFloat(value.value);
      tracker.color = color.value;

      let newParentArr = data;
      if (folder.value) {
        const newParent = findItemById(folder.value).item;
        if (newParent && newParent.children) {
          newParentArr = newParent.children;
        }
      }
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
        pull: false,
        put: false
      },
      animation: 150,
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onEnd: evt => {
        if (evt.from !== evt.to) return;

        const draggedId = evt.item.dataset.id;
        let parentArr = data;
        if (evt.from.dataset.folderId) {
          const parentFolder = findItemById(evt.from.dataset.folderId).item;
          parentArr = parentFolder ? parentFolder.children : data;
        }
        const { item } = findItemById(draggedId, parentArr);
        if (!item) return;
        const oldIndex = parentArr.indexOf(item);
        if (oldIndex > -1) parentArr.splice(oldIndex, 1);
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
document.getElementById("add-tracker").onclick = () => addTrackerModal();
document.getElementById("add-folder").onclick = () => addFolderModal();
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
const DIRECTORY_BLOB_ID = "1396310904861286400";

function getTimestampPrefix() {
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear().toString().slice(-2)}${pad(now.getHours())}${pad(now.getMinutes())}_`;
}

async function getDirectory() {
  const res = await fetch("https://jsonblob.com/api/jsonBlob/" + DIRECTORY_BLOB_ID);
  if (!res.ok) throw new Error("Could not fetch directory blob");
  let dir = await res.json();
  if (!dir.main) dir.main = {};
  if (!dir.archive) dir.archive = {};
  return dir;
}
async function saveDirectory(dir) {
  const res = await fetch("https://jsonblob.com/api/jsonBlob/" + DIRECTORY_BLOB_ID, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dir)
  });
  if (!res.ok) throw new Error("Could not update directory blob");
}

document.getElementById("delete-id").onclick = async () => {
  const id = prompt("Enter the ID to archive (delete):");
  if (!id) return;
  try {
    let dir = await getDirectory();
    if (!dir.main[id]) {
      alert("That ID does not exist in the main list.");
      return;
    }
    const tsId = getTimestampPrefix() + id;
    dir.archive[tsId] = dir.main[id];
    delete dir.main[id];
    await saveDirectory(dir);
    alert(`Moved "${id}" to archive as "${tsId}". You can restore it later.`);
  } catch (e) {
    alert("Delete/archive failed: " + e.message);
  }
};

document.getElementById("restore-id").onclick = async () => {
  const baseId = prompt("Enter the ID to restore (original base, e.g., dans_list_1):");
  if (!baseId) return;
  try {
    let dir = await getDirectory();
    const matching = Object.keys(dir.archive)
      .filter(k => k.endsWith("_" + baseId) || k.substring(9) === baseId)
      .map(k => ({ tsId: k, timestamp: k.substring(0, 9), blobId: dir.archive[k] }))
      .sort((a, b) => b.tsId.localeCompare(a.tsId));
    if (matching.length === 0) {
      alert("No archived versions of this ID exist.");
      return;
    }
    const restore = matching[0];
    if (dir.main[baseId]) {
      if (!confirm(`"${baseId}" already exists in the main list! Restoring will overwrite it. Continue?`)) return;
    }
    dir.main[baseId] = restore.blobId;
    await saveDirectory(dir);
    alert(`Restored "${baseId}" from archive version "${restore.tsId}".`);
  } catch (e) {
    alert("Restore failed: " + e.message);
  }
};

document.getElementById("cloud-save").onclick = async () => {
  const userId = prompt("Enter your unique ID:");
  if (!userId) return;
  try {
    let dir = await getDirectory();
    let blobId = dir.main[userId];
    let res;
    if (blobId) {
      res = await fetch("https://jsonblob.com/api/jsonBlob/" + blobId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to update your data.");
    } else {
      res = await fetch("https://jsonblob.com/api/jsonBlob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to create blob.");
      blobId = res.headers.get("Location").split("/").pop();
      dir.main[userId] = blobId;
      await saveDirectory(dir);
    }
    alert("Saved! Use this ID to load from any device: " + userId);
  } catch (e) {
    alert("Cloud save failed: " + e.message);
  }
};

document.getElementById("cloud-load").onclick = async () => {
  const userId = prompt("Enter the ID to load:");
  if (!userId) return;
  try {
    const dir = await getDirectory();
    const blobId = dir.main[userId];
    if (!blobId) throw new Error("ID not found in main list.");
    const res = await fetch("https://jsonblob.com/api/jsonBlob/" + blobId);
    if (!res.ok) throw new Error("Blob not found.");
    const blobData = await res.json();
    if (Array.isArray(blobData) && typeof blobData[0] === "object") {
      data = blobData;
      save();
      render();
      alert("Loaded!");
    } else {
      throw new Error("Invalid data.");
    }
  } catch (e) {
    alert("Cloud load failed: " + e.message);
  }
};
//-- ^ CLOUD STUFFS ^ --//

render();
