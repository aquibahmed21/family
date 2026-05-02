(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
let data = null;
let expandState = {};
const baseURL = "https://web-push-3zaz.onrender.com/";
document.addEventListener("DOMContentLoaded", function() {
  const role = localStorage.getItem("role") || "reader";
  document.querySelector(".container").setAttribute("role", role);
  loadFamilyTree();
  setupSearchAndFilters();
});
function loadFamilyTree() {
  data = retrieveJsonLocally();
  if (data) {
    document.getElementById("loadingState").style.display = "none";
    document.getElementById("treeContent").style.display = "block";
    collapseAll();
    document.querySelector("#lastUpdated").textContent = GetDisplayTime(data.date ?? 0);
  }
  fetch(baseURL + "family").then((response) => response.json()).then((json) => {
    if (isUpdateRequired(json) || !data && json) {
      data = json;
      storeJsonLocally(data);
      document.getElementById("loadingState").style.display = "none";
      document.getElementById("treeContent").style.display = "block";
      collapseAll();
      document.querySelector("#lastUpdated").textContent = GetDisplayTime(data.date ?? 0);
    } else {
      document.getElementById("loadingState").innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color); margin-right: 0.5rem;"></i>
            Failed to load family tree: data not available
          `;
    }
  }).catch((err) => {
    document.getElementById("loadingState").innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color); margin-right: 0.5rem;"></i>
            Failed to load family tree: ${err.message}
          `;
  });
}
function renderTree() {
  if (!data || !data.rootPerson) return;
  document.getElementById("familyName").textContent = data.familyName || "Family Tree";
  const container = document.getElementById("treeContent");
  container.innerHTML = "";
  container.appendChild(renderMember(data.rootPerson, null, "root", 0));
  document.querySelector("#totalMembers").textContent = `${collectMembers().length}`;
}
function collectMembers() {
  const results = [];
  function walk(member, path) {
    if (!member) return;
    results.push({
      name: member.name || "",
      serial: member.serial || null,
      gender: member.gender || "",
      maritalStatus: member.maritalStatus || "",
      spousesCount: member.spouses && member.spouses.length || 0,
      childrenCount: member.children && member.children.length || 0,
      path
    });
    if (member.spouses) {
      member.spouses.forEach((sp, i) => walk(sp, `${path}.spouses[${i}]`));
    }
    if (member.children) {
      member.children.forEach((ch, i) => walk(ch, `${path}.children[${i}]`));
    }
  }
  if (data && data.rootPerson) walk(data.rootPerson, "root");
  return results;
}
function setupSearchAndFilters() {
  const input = document.getElementById("searchInput");
  const resultsBox = document.getElementById("searchResults");
  const applyBtn = document.getElementById("applyFiltersBtn");
  const clearBtn = document.getElementById("clearFiltersBtn");
  const backBtn = document.getElementById("backToResultsBtn");
  const genderSel = document.getElementById("filterGender");
  const maritalSel = document.getElementById("filterMarital");
  const childrenSel = document.getElementById("filterChildren");
  const spousesSel = document.getElementById("filterSpouses");
  const unifiedList = document.getElementById("filterResults");
  if (!input || !applyBtn || !unifiedList) return;
  const getCurrentRole = () => {
    var _a;
    return ((_a = document.querySelector(".container")) == null ? void 0 : _a.getAttribute("role")) || "reader";
  };
  let lastResultsHTML = "";
  function computeAndRenderResults() {
    const q = (input.value || "").trim().toLowerCase();
    const gender = (genderSel == null ? void 0 : genderSel.value) || "";
    const marital = (maritalSel == null ? void 0 : maritalSel.value) || "";
    const children = (childrenSel == null ? void 0 : childrenSel.value) || "";
    const spouses = (spousesSel == null ? void 0 : spousesSel.value) || "";
    const members = collectMembers();
    const filtered = members.filter((m) => {
      if (gender && m.gender !== gender) return false;
      if (marital && m.maritalStatus !== marital) return false;
      if (children === "yes" && m.childrenCount <= 0) return false;
      if (children === "no" && m.childrenCount > 0) return false;
      if (spouses === "yes" && m.spousesCount <= 0) return false;
      if (spouses === "no" && m.spousesCount > 0) return false;
      if (q) {
        const nameHit = m.name.toLowerCase().includes(q);
        const serialHit = q.startsWith("#") ? m.serial !== null && `#${m.serial}` === q : m.serial !== null && `${m.serial}` === q;
        if (!nameHit && !serialHit) return false;
      }
      return true;
    }).slice(0, 300);
    const role = getCurrentRole();
    unifiedList.innerHTML = filtered.length ? filtered.map((m) => {
      const displayName = role === "reader" ? "Private" : m.name || "Unnamed";
      const maritalOut = role === "reader" ? "" : m.maritalStatus ? " · " + m.maritalStatus : "";
      return `<div class="result-item" data-path="${m.path}">
         <strong>${displayName}</strong>
         <small>#${m.serial ?? "N/A"} · ${m.gender}${maritalOut} · Sp:${m.spousesCount} · Ch:${m.childrenCount}</small>
       </div>`;
    }).join("") : '<div class="text-muted">No results</div>';
    unifiedList.onclick = (e) => {
      const item = e.target.closest(".result-item");
      if (!item) return;
      navigateToPath(item.getAttribute("data-path"));
    };
    if (resultsBox) {
      resultsBox.style.display = "none";
      resultsBox.innerHTML = "";
    }
    lastResultsHTML = unifiedList.innerHTML;
    const countEl = document.getElementById("resultsCount");
    if (countEl) countEl.textContent = filtered.length ? `Results (${filtered.length})` : "";
  }
  let rafId = null;
  input.addEventListener("input", () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      computeAndRenderResults();
      rafId = null;
    });
  });
  applyBtn.addEventListener("click", computeAndRenderResults);
  genderSel == null ? void 0 : genderSel.addEventListener("change", computeAndRenderResults);
  maritalSel == null ? void 0 : maritalSel.addEventListener("change", computeAndRenderResults);
  childrenSel == null ? void 0 : childrenSel.addEventListener("change", computeAndRenderResults);
  spousesSel == null ? void 0 : spousesSel.addEventListener("change", computeAndRenderResults);
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (genderSel) genderSel.value = "";
      if (maritalSel) maritalSel.value = "";
      if (childrenSel) childrenSel.value = "";
      if (spousesSel) spousesSel.value = "";
      if (input) input.value = "";
      unifiedList.innerHTML = "";
      const countEl = document.getElementById("resultsCount");
      if (countEl) countEl.textContent = "";
    });
  }
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener("click", () => {
      if (input) input.value = "";
      computeAndRenderResults();
    });
  }
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      unifiedList.innerHTML = lastResultsHTML;
      unifiedList.scrollIntoViewIfNeeded();
      backBtn.style.display = "none";
    });
  }
}
async function navigateToPath(path) {
  if (!path) return;
  const backBtn = document.getElementById("backToResultsBtn");
  if (backBtn) backBtn.style.display = "inline-flex";
  const sectionPaths = [];
  let prefix = "root";
  const regex = /(?:^|\.)((?:spouses|children))\[(\d+)\]/g;
  let m;
  while ((m = regex.exec(path)) !== null) {
    const type = m[1];
    const index = m[2];
    sectionPaths.push(`${prefix}.${type}`);
    prefix = `${prefix}.${type}[${index}]`;
  }
  sectionPaths.forEach((sp) => {
    expandState[sp] = true;
  });
  renderTree();
  for (const sp of sectionPaths) {
    const id = `section-${sp.replace(/[\[\].]/g, "-")}`;
    const el = document.getElementById(id);
    if (el && el.classList.contains("collapsed")) {
      toggleSection(sp);
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  await new Promise((r) => requestAnimationFrame(r));
  const card = document.querySelector(`.member-card[data-path="${path}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("highlight");
    card.addEventListener("animationend", () => {
      card.classList.remove("highlight");
    }, { once: true });
  }
}
function renderMember(member, parent, path, level) {
  const card = document.createElement("div");
  card.className = "member-card" + (member.gender == "Female" ? " female" : " male");
  card.style.animationDelay = `${level * 0.1}s`;
  card.setAttribute("data-path", path);
  const isDeceased = member.dod && member.dod.trim() !== "" || member.status && member.status.toLowerCase() === "deceased";
  const statusColor = isDeceased ? "var(--text-muted)" : "var(--success-color)";
  const avatarHTML = member.image ? `<img src="${member.image}" alt="${member.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <i class="fas fa-user" style="display: none;"></i>` : `<i class="fas fa-user"></i>`;
  const details = [
    { icon: "venus-mars", label: "Gender", value: member.gender || "Not specified" },
    { icon: "heart", label: "Status", value: member.maritalStatus || "Not specified" },
    { icon: "pray", label: "Religion", value: member.religion || "Not specified" }
  ];
  if (formatDate(member.dob))
    details.push({ icon: "calendar-alt", label: "Born", value: formatDate(member.dob) || "Unknown" });
  if (isDeceased && formatDate(member.dod)) {
    details.push({ icon: "cross", label: "Died", value: formatDate(member.dod) });
  }
  const detailsHTML = details.map((detail) => `
        <div class="detail-item" value="${detail.value}">
          <i class="fas fa-${detail.icon}"></i>
          <span>${detail.value}</span>
        </div>
      `).join("");
  card.innerHTML = `
        <div class="card-header">
          <div class="avatar-container">
            <div class="avatar">
              ${avatarHTML}
            </div>
            <div class="status-indicator" style="background: ${statusColor};"></div>
          </div>
          <div class="member-info">
            <div class="member-name">
              ${member.name ? `<span class="name">${member.name}</span>` : ""}
              <span class="serial-badge">#${member.serial || "N/A"}</span>
              ${member.alternateName ? `<span class="alternate-name">(${member.alternateName})</span>` : ""}
            </div>
            <div class="member-details">
              ${detailsHTML}
            </div>
            ${member.notes ? `<div class="member-notes"><i class="fas fa-quote-left"></i> ${member.notes}</div>` : ""}
          </div>
        </div>
        <div class="card-actions">
          <button class="btn btn-success btn-sm" onclick="showModal('spouse', '${path}')">
            <i class="fas fa-ring"></i> Add Spouse
          </button>
          <button class="btn btn-primary btn-sm" onclick="showModal('child', '${path}')">
            <i class="fas fa-baby"></i> Add Child
          </button>
          <button class="btn btn-warning btn-sm" onclick="showModal('edit', '${path}')">
            <i class="fas fa-edit"></i> Edit
          </button>
          ${path !== "root" ? `<button class="btn btn-danger btn-sm" onclick="deleteMember('${path}')"><i class="fas fa-trash"></i> Delete</button>` : ""}
        </div>
      `;
  if (member.spouses && member.spouses.length > 0) {
    const spousesSection = createSection("spouses", path, member, "Spouses", "ring", level);
    card.appendChild(spousesSection);
  }
  if (member.children && member.children.length > 0) {
    const childrenSection = createSection("children", path, member, "Children", "users", level);
    card.appendChild(childrenSection);
  }
  card.setAttribute("privacy", member.privacy || "public");
  return card;
}
function createSection(type, path, member, title, icon, level) {
  const section = document.createElement("div");
  section.className = "tree-connections";
  const sectionPath = `${path}.${type}`;
  const isExp = isExpanded(sectionPath);
  const sectionHeader = document.createElement("div");
  sectionHeader.className = "section-header";
  sectionHeader.innerHTML = `
        <button class="toggle-btn ${isExp ? "expanded" : ""}" >
          <i class="fas fa-chevron-right"></i>
        </button>
        <i class="fas fa-${icon}"></i>
        <span class="section-title" mValue="${member[type].length}">${title}</span>
      `;
  sectionHeader.onclick = () => toggleSection(sectionPath);
  const sectionContent = document.createElement("div");
  sectionContent.className = `section-content ${isExp ? "expanded" : "collapsed"}`;
  sectionContent.id = `section-${sectionPath.replace(/[\[\].]/g, "-")}`;
  if (isExp) {
    member[type].forEach((item, i) => {
      const itemElement = renderMember(item, member, `${path}.${type}[${i}]`, level + 1);
      sectionContent.appendChild(itemElement);
    });
  }
  section.appendChild(sectionHeader);
  section.appendChild(sectionContent);
  return section;
}
function toggleSection(sectionPath) {
  const isCurrentlyExpanded = isExpanded(sectionPath);
  expandState[sectionPath] = !isCurrentlyExpanded;
  const sectionContentId = `section-${sectionPath.replace(/[\[\].]/g, "-")}`;
  const sectionContent = document.getElementById(sectionContentId);
  const toggleBtn = sectionContent.parentElement.querySelector(".toggle-btn");
  const treeConnections = toggleBtn.parentElement;
  if (!isCurrentlyExpanded) {
    toggleBtn.classList.add("expanded");
    treeConnections.classList.add("expanded");
    sectionContent.className = "section-content expanded";
    const pathParts = sectionPath.split(".");
    const type = pathParts[pathParts.length - 1];
    const memberPath = pathParts.slice(0, -1).join(".");
    const member = getByPath(memberPath);
    sectionContent.innerHTML = "";
    if (member[type] && member[type].length > 0) {
      const level = pathParts.length - 1;
      member[type].forEach((item, i) => {
        const itemElement = renderMember(item, member, `${memberPath}.${type}[${i}]`, level);
        sectionContent.appendChild(itemElement);
      });
    }
  } else {
    toggleBtn.classList.remove("expanded");
    treeConnections.classList.remove("expanded");
    sectionContent.className = "section-content collapsed";
    const onEnd = () => {
      sectionContent.removeEventListener("transitionend", onEnd);
      if (sectionContent.classList.contains("collapsed")) {
        sectionContent.innerHTML = "";
      }
    };
    sectionContent.addEventListener("transitionend", onEnd);
  }
}
function isExpanded(path) {
  return expandState[path] !== false;
}
function expandAll() {
  expandState = {};
  renderTree();
}
async function onDBClick() {
  const code = await prompt("Enter your secret code to unlock controls");
  if (+code == 7889) {
    const role = await prompt("Enter your role to unlock controls");
    if (["root", "admin", "writer", "reader"].includes(role)) {
      localStorage.setItem("role", role);
      document.querySelector(".container").setAttribute("role", role);
      return;
    }
  }
  document.querySelector(".container").setAttribute("role", "reader");
}
function collapseAll() {
  function setAllCollapsed(obj, currentPath) {
    if (!obj) return;
    if (obj.spouses && obj.spouses.length > 0) {
      expandState[currentPath + ".spouses"] = false;
      obj.spouses.forEach((spouse, i) => {
        setAllCollapsed(spouse, currentPath + `.spouses[${i}]`);
      });
    }
    if (obj.children && obj.children.length > 0) {
      expandState[currentPath + ".children"] = false;
      obj.children.forEach((child, i) => {
        setAllCollapsed(child, currentPath + `.children[${i}]`);
      });
    }
  }
  setAllCollapsed(data.rootPerson, "root");
  renderTree();
}
function showModal(type, path) {
  const modal = document.getElementById("modal");
  const form = document.getElementById("memberForm");
  const title = document.getElementById("modalTitle");
  const subtitle = document.getElementById("modalSubtitle");
  form.reset();
  let member = {};
  if (type === "edit") {
    member = getByPath(path);
    title.textContent = "Edit Family Member";
    subtitle.textContent = `Update information for ${member.name}`;
    Object.keys(member).forEach((key) => {
      const input = form.querySelector(`[name="${key}"]`);
      if (["gender", "privacy", "status", "maritalStatus"].includes(key))
        form.querySelector(`[value="${member[key]}"]`).checked = true;
      else if (input && member[key] !== null && member[key] !== void 0)
        input.value = member[key];
    });
  } else {
    title.textContent = type === "spouse" ? "Add Spouse" : "Add Child";
    subtitle.textContent = `Add new ${type} to the family tree`;
  }
  form.dataset.type = type;
  form.dataset.path = path;
  modal.classList.add("show");
}
function closeModal() {
  document.getElementById("modal").classList.remove("show");
}
document.getElementById("memberForm").addEventListener("submit", function(e) {
  e.preventDefault();
  const formData = new FormData(this);
  const memberData = {};
  for (let [key, value] of formData.entries()) {
    if (value.trim()) {
      memberData[key] = value.trim();
    }
  }
  const type = this.dataset.type;
  const path = this.dataset.path;
  if (type === "edit") {
    const member = getByPath(path);
    Object.assign(member, memberData);
    const memberCard = document.querySelector(`[data-path="${path}"]`);
    const newCard = renderMember(member, null, path, 0);
    memberCard.parentNode.replaceChild(newCard, memberCard);
  } else {
    memberData.serial = getNextSerial(data.rootPerson) + 1;
    memberData.spouses = [];
    memberData.children = [];
    const parent = getByPath(path);
    if (type === "spouse") {
      parent.spouses = parent.spouses || [];
      parent.spouses.push(memberData);
      const spousesPath = `${path}.spouses`;
      if (isExpanded(spousesPath)) {
        const sectionContentId = `section-${spousesPath.replace(/[\[\].]/g, "-")}`;
        const sectionContent = document.getElementById(sectionContentId);
        if (sectionContent) {
          const newIndex = parent.spouses.length - 1;
          const newSpouse = renderMember(memberData, parent, `${path}.spouses[${newIndex}]`, path.split(".").length);
          sectionContent.appendChild(newSpouse);
        } else {
          const spousesSection = createSection("spouses", spousesPath, parent, "Spouses", "users", path.split(".").length);
          document.querySelector(`.member-card[data-path="${path}"]`).appendChild(spousesSection);
        }
      }
    } else if (type === "child") {
      parent.children = parent.children || [];
      parent.children.push(memberData);
      const childrenPath = `${path}.children`;
      if (isExpanded(childrenPath)) {
        const sectionContentId = `section-${childrenPath.replace(/[\[\].]/g, "-")}`;
        const sectionContent = document.getElementById(sectionContentId);
        if (sectionContent) {
          const newIndex = parent.children.length - 1;
          const newChild = renderMember(memberData, parent, `${path}.children[${newIndex}]`, path.split(".").length);
          sectionContent.appendChild(newChild);
        } else {
          const childrenSection = createSection("children", childrenPath, parent, "Children", "users", path.split(".").length);
          document.querySelector(`.member-card[data-path="${path}"]`).appendChild(childrenSection);
        }
      }
    }
    const parentCard = document.querySelector(`[data-path="${path}"]`);
    if (parentCard) {
      const sectionHeaders = parentCard.querySelectorAll(".section-title");
      sectionHeaders.forEach((header) => {
        const text = header.textContent;
        if (type === "spouse" && text.includes("Spouses")) {
          header.textContent = `Spouses`;
          header.setAttribute("mValue", parent.spouses.length);
        } else if (type === "child" && text.includes("Children")) {
          header.textContent = `Children`;
          header.setAttribute("mValue", parent.children.length);
        }
      });
    }
  }
  closeModal();
  uploadDataToServer();
});
function uploadDataToServer() {
  data.date = (/* @__PURE__ */ new Date()).getTime();
  document.querySelector("#lastUpdated").textContent = GetDisplayTime(data.date);
  const jsonStr = JSON.stringify(data, null, 2);
  fetch(baseURL + "family", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: jsonStr
  }).then((response) => {
    if (response.ok) {
      console.log("Family tree exported successfully!");
    } else {
      alert("Error exporting family tree: " + response.statusText);
    }
  }).catch((error) => {
    alert("Error exporting family tree: " + error.message);
  });
}
function deleteMember(path) {
  if (!confirm("Are you sure you want to delete this member and all their descendants?")) {
    return;
  }
  const pathParts = path.split(".");
  const lastPart = pathParts.pop();
  const parentPath = pathParts.join(".");
  const parent = getByPath(parentPath);
  const match = lastPart.match(/(\w+)\[(\d+)\]/);
  if (match) {
    const arrayName = match[1];
    const index = parseInt(match[2]);
    if (parent && parent[arrayName]) {
      parent[arrayName].splice(index, 1);
      const memberCard = document.querySelector(`[data-path="${path}"]`);
      if (memberCard) {
        memberCard.remove();
      }
      const parentCard = document.querySelector(`[data-path="${parentPath}"]`);
      if (parentCard) {
        const sectionHeaders = parentCard.querySelectorAll(".section-title");
        sectionHeaders.forEach((header) => {
          const text = header.textContent;
          if (arrayName === "spouses" && text.includes("Spouses")) {
            header.textContent = `Spouses`;
            header.setAttribute("value", parent.spouses.length);
          } else if (arrayName === "children" && text.includes("Children")) {
            header.textContent = `Children`;
            header.setAttribute("value", parent.children.length);
          }
        });
      }
    }
  }
  uploadDataToServer();
}
function getByPath(path) {
  if (path === "root") return data.rootPerson;
  let obj = data.rootPerson;
  const regex = /(\w+)\[(\d+)\]/g;
  let match;
  while ((match = regex.exec(path)) !== null) {
    const arrayName = match[1];
    const index = parseInt(match[2]);
    obj = obj[arrayName][index];
  }
  return obj;
}
function getNextSerial(obj, max = 0) {
  if (!obj) return max;
  if (obj.serial && obj.serial > max) {
    max = obj.serial;
  }
  if (obj.spouses) {
    obj.spouses.forEach((spouse) => {
      if (spouse.serial && spouse.serial > max) {
        max = spouse.serial;
      }
      if (spouse.children) {
        spouse.children.forEach((child) => {
          max = getNextSerial(child, max);
        });
      }
    });
  }
  if (obj.children) {
    obj.children.forEach((child) => {
      max = getNextSerial(child, max);
    });
  }
  return max;
}
function formatDate(dateString) {
  if (!dateString || dateString.trim() === "") return null;
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  } catch (e) {
    return dateString;
  }
}
async function exportJSON() {
  if (!data) {
    alert("No data to export");
    return;
  }
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.familyName || "family_tree"}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported.familyName && imported.rootPerson) {
        data = imported;
        expandState = {};
        collapseAll();
        uploadDataToServer();
        console.log("Family tree imported successfully!");
      } else {
        alert("Invalid family tree JSON structure.");
      }
    } catch (err) {
      alert("Error parsing JSON: " + err.message);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}
document.getElementById("modal").addEventListener("click", function(e) {
  if (e.target === this) {
    closeModal();
  }
});
function storeJsonLocally(data2) {
  localStorage.setItem("familyTreeData", JSON.stringify(data2));
}
function retrieveJsonLocally() {
  const data2 = localStorage.getItem("familyTreeData");
  if (!data2) return null;
  return JSON.parse(data2);
}
function isUpdateRequired(data2) {
  const storedData = retrieveJsonLocally();
  if (!storedData) return false;
  if (!storedData.date) return true;
  return storedData.date !== data2.date;
}
function GetDisplayTime(timeSent, includeSeconds = false, Is24Hour = false) {
  if (timeSent <= 0)
    return "--";
  let dateTimeSent = new Date(timeSent);
  let date = dateTimeSent.getDate();
  let month = dateTimeSent.getMonth();
  let day = dateTimeSent.getDay();
  let dayPart = ["Sun", "Mon", "Tue", "Wed", "Thur", "Fri", "Sat"][day];
  let fullYear = dateTimeSent.getFullYear();
  let hours = dateTimeSent.getHours();
  let hour = hours % 12;
  hour = Is24Hour ? hour ? hour : 12 : hours;
  let am_pm = Is24Hour ? hours >= 12 ? "pm" : "am" : "";
  let minutes = dateTimeSent.getMinutes();
  let seconds = dateTimeSent.getSeconds();
  let actualTime = ("00" + hour).slice(-2) + ":" + ("00" + minutes).slice(-2);
  if (includeSeconds) {
    actualTime += ":" + ("00" + seconds).slice(-2);
  }
  let timePart = Is24Hour ? actualTime + " " + am_pm : actualTime;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let monthName = monthNames[month];
  let dayMonthPart = ("00" + date).slice(-2) + "-" + monthName;
  let today = /* @__PURE__ */ new Date();
  let todayFullYear = today.getFullYear();
  let todayMonth = today.getMonth();
  let todayDate = today.getDate();
  let todayDay = today.getDay();
  let time = date > todayDate ? date - todayDate : todayDate - date;
  if (fullYear == todayFullYear && month == todayMonth && date == todayDate)
    return timePart;
  if (fullYear == todayFullYear && month == todayMonth && todayDate - date == 1)
    return "Y'day, " + timePart;
  if (fullYear == todayFullYear && month == todayMonth && day != todayDay && time <= 7)
    return dayMonthPart + ", " + dayPart + ", " + timePart;
  if (fullYear == todayFullYear && month == todayMonth && date == todayDate)
    return timePart;
  if (fullYear == todayFullYear)
    return dayMonthPart + ", " + timePart;
  dayMonthPart += "-" + fullYear;
  return dayMonthPart + ", " + timePart;
}
window.showModal = showModal;
window.closeModal = closeModal;
window.deleteMember = deleteMember;
window.toggleSection = toggleSection;
window.expandAll = expandAll;
window.collapseAll = collapseAll;
window.exportJSON = exportJSON;
window.importJSON = importJSON;
window.onDBClick = onDBClick;
window.navigateToPath = navigateToPath;
