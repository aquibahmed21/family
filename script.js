// Global variables
let data = null;
let expandState = {};
let currentView = localStorage.getItem('view') || 'tree';
if (currentView === 'families') currentView = 'relations'; // renamed view
const baseURL = 'https://web-push-3zaz.onrender.com/';

// Initialize the application
document.addEventListener('DOMContentLoaded', function ()
{
  const role = localStorage.getItem("role") || "reader";
  document.querySelector(".container").setAttribute("role", role);
  document.querySelector(".container").setAttribute("data-view", currentView);

  loadFamilyTree();

  // Wire up search and filters once DOM is ready
  setupSearchAndFilters();
});

function getCurrentRole()
{
  return document.querySelector('.container')?.getAttribute('role') || 'reader';
}

// Switch between tree / compact / list views
function setView(view)
{
  currentView = view;
  localStorage.setItem('view', view);
  document.querySelector('.container').setAttribute('data-view', view);

  document.querySelectorAll('.view-btn').forEach(btn =>
  {
    const active = btn.dataset.view === view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (data)
  {
    applyViewVisibility();
    if (view === 'tree') renderTree();
  }
}

// Show the correct content pane for the current view
const VIEW_PANES = {
  tree: ['treeContent', 'block'],
  list: ['listContent', 'block'],
  diagram: ['diagramContent', 'block'],
  relations: ['relationsContent', 'block'],
  columns: ['columnsContent', 'block']
};

function applyViewVisibility()
{
  document.querySelectorAll('.view-btn').forEach(btn =>
  {
    const active = btn.dataset.view === currentView;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  Object.entries(VIEW_PANES).forEach(([view, [id, display]]) =>
  {
    const pane = document.getElementById(id);
    if (pane) pane.style.display = currentView === view ? display : 'none';
  });

  if (currentView === 'list') renderListView();
  else if (currentView === 'diagram') renderDiagramView();
  else if (currentView === 'relations') renderRelationsView();
  else if (currentView === 'columns') renderColumnsView();
}

// Whether the current role may see this member at all
function canSee(member, role = getCurrentRole())
{
  if ((role === 'reader' || role === 'writer') && (member.privacy === 'private' || member.privacy === 'protected')) return false;
  if (role === 'admin' && member.privacy === 'private') return false;
  return true;
}

function safeGetByPath(path)
{
  try { return getByPath(path) || null; } catch (e) { return null; }
}

// Render the flat, indented list view of every member
let listSort = 'family';
const LIST_SORTS = [
  { key: 'family', label: 'Family order', icon: 'fa-sitemap' },
  { key: 'generation', label: 'Generation', icon: 'fa-layer-group' },
  { key: 'name', label: 'Name A–Z', icon: 'fa-arrow-down-a-z' },
  { key: 'serial', label: 'Serial', icon: 'fa-hashtag' }
];

// Age in whole years, up to the date of death when there is one
function ageOf(m)
{
  const born = new Date(m.dob);
  if (!m.dob || isNaN(born)) return null;
  const end = m.dod && !isNaN(new Date(m.dod)) ? new Date(m.dod) : new Date();
  let age = end.getFullYear() - born.getFullYear();
  if (end.getMonth() < born.getMonth() || (end.getMonth() === born.getMonth() && end.getDate() < born.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// Render the people directory: one card per member, with relatives named inline
function renderListView()
{
  const listEl = document.getElementById('listContent');
  if (!listEl) return;

  const role = getCurrentRole();
  let members = collectMembers().filter(m =>
  {
    if ((role === 'reader' || role === 'writer') && (m.privacy === 'private' || m.privacy === 'protected')) return false;
    if (role === 'admin' && m.privacy === 'private') return false;
    return true;
  });

  if (listSort === 'name') members.sort((a, b) => (a.name || '~').localeCompare(b.name || '~'));
  else if (listSort === 'serial') members.sort((a, b) => (a.serial ?? Infinity) - (b.serial ?? Infinity));
  else if (listSort === 'generation') members = members.map((m, i) => [m, i]).sort((a, b) => a[0].generation - b[0].generation || a[1] - b[1]).map(p => p[0]);

  const card = (m) =>
  {
    const displayName = role === 'reader' ? 'Private' : (m.name || 'Unnamed');
    const initial = role === 'reader' ? '?' : displayName.trim().charAt(0).toUpperCase();
    const age = role === 'reader' ? null : ageOf(m);
    const chips = [];
    if (role !== 'reader' && m.maritalStatus) chips.push(`<span class="result-tag">${m.maritalStatus}</span>`);
    if (role !== 'reader')
    {
      const dead = isDeceasedMember(m);
      chips.push(`<span class="result-tag life ${dead ? 'deceased' : 'alive'}"><i class="fas fa-${dead ? 'dove' : 'seedling'}"></i> ${dead ? 'Deceased' : 'Alive'}</span>`);
    }
    if (age !== null) chips.push(`<span class="result-tag">${m.dod ? 'Died aged ' + age : age + ' yrs'}</span>`);
    if (role !== 'reader' && m.religion) chips.push(`<span class="result-tag">${m.religion}</span>`);
    const lines = role === 'reader' ? [] : relationLines(m);
    return `<div class="person-card${m.dod ? ' deceased' : ''}" data-path="${m.path}" tabindex="0">
      <span class="result-avatar ${String(m.gender).toLowerCase()}">${initial}</span>
      <div class="person-main">
        <div class="person-title"><strong>${displayName}</strong><small>#${m.serial ?? 'N/A'}</small></div>
        ${lines.map(l => `<small class="result-rel"><i class="fas ${l.icon}"></i>${l.text}</small>`).join('')}
        ${chips.length ? `<div class="person-chips">${chips.join('')}</div>` : ''}
      </div>
      <div class="person-counts">
        <span title="Spouses"><i class="fas fa-ring"></i>${m.spousesCount}</span>
        <span title="Children"><i class="fas fa-users"></i>${m.childrenCount}</span>
      </div>
    </div>`;
  };

  let body;
  if (listSort === 'generation')
  {
    const groups = {};
    members.forEach(m => (groups[m.generation] = groups[m.generation] || []).push(m));
    body = Object.keys(groups).map(g =>
      `<h3 class="person-group">Generation ${g} <span>${groups[g].length}</span></h3><div class="person-grid">${groups[g].map(card).join('')}</div>`).join('');
  }
  else body = `<div class="person-grid">${members.map(card).join('')}</div>`;

  listEl.innerHTML = `
    <div class="list-bar">
      <span class="list-count">${members.length} ${members.length === 1 ? 'person' : 'people'}</span>
      <div class="list-sorts" role="group" aria-label="Sort people">
        ${LIST_SORTS.map(s => `<button type="button" class="list-sort${s.key === listSort ? ' active' : ''}" data-sort="${s.key}"><i class="fas ${s.icon}"></i> ${s.label}</button>`).join('')}
      </div>
    </div>${body}`;

  const open = (target) =>
  {
    const item = target.closest('.person-card');
    if (!item) return;
    setView('tree');
    navigateToPath(item.getAttribute('data-path'));
  };
  listEl.onclick = (e) =>
  {
    const sort = e.target.closest('.list-sort');
    if (sort)
    {
      listSort = sort.dataset.sort;
      renderListView();
      return;
    }
    open(e.target);
  };
  listEl.onkeydown = (e) => { if (e.key === 'Enter') open(e.target); };
}

// Render the org-chart style diagram view (pure CSS/HTML, no libraries)
let diagramZoom = 1;
let diagramLayout = localStorage.getItem('diagramLayout') === 'horizontal' ? 'horizontal' : 'vertical';

function renderDiagramView()
{
  const el = document.getElementById('diagramContent');
  if (!el || !data || !data.rootPerson) return;

  // Re-rendering on every toggle would otherwise snap the chart back to the top-left
  const prev = el.querySelector('.diagram-scroll');
  const scroll = prev ? { left: prev.scrollLeft, top: prev.scrollTop } : { left: 0, top: 0 };

  const people = collectMembers();
  const generations = people.reduce((n, m) => Math.max(n, m.generation), 0);

  el.innerHTML = `
    <div class="diagram-bar">
      <div class="diagram-legend">
        <span><i class="legend-dot male"></i>Male</span>
        <span><i class="legend-dot female"></i>Female</span>
        <span><i class="legend-dot deceased"></i>Deceased</span>
        <span class="diagram-stats">${people.length} people · ${generations} generation${generations === 1 ? '' : 's'}</span>
      </div>
      <div class="diagram-tools">
      <div class="diagram-zoom" role="group" aria-label="Branches">
        <button type="button" class="diagram-text-btn" data-act="expand" title="Expand all branches"><i class="fas fa-expand-arrows-alt"></i> Expand all</button>
        <button type="button" class="diagram-text-btn" data-act="collapse" title="Collapse all branches"><i class="fas fa-compress-arrows-alt"></i> Collapse all</button>
      </div>
      <div class="diagram-zoom" role="group" aria-label="Layout">
        <button type="button" class="diagram-text-btn${diagramLayout === 'vertical' ? ' active' : ''}" data-layout="vertical" title="Top-down layout"><i class="fas fa-arrow-down-long"></i> Top-down</button>
        <button type="button" class="diagram-text-btn${diagramLayout === 'horizontal' ? ' active' : ''}" data-layout="horizontal" title="Left-to-right layout"><i class="fas fa-arrow-right-long"></i> Left-right</button>
      </div>
      <div class="diagram-zoom" role="group" aria-label="Zoom">
        <button type="button" class="icon-btn" data-zoom="-" title="Zoom out" aria-label="Zoom out"><i class="fas fa-minus"></i></button>
        <button type="button" class="diagram-zoom-level" data-zoom="reset" title="Reset zoom">${Math.round(diagramZoom * 100)}%</button>
        <button type="button" class="icon-btn" data-zoom="+" title="Zoom in" aria-label="Zoom in"><i class="fas fa-plus"></i></button>
      </div>
      </div>
    </div>
    <div class="diagram-scroll">
      <ul class="chart-tree${diagramLayout === 'horizontal' ? ' horizontal' : ''}" style="zoom:${diagramZoom}">${renderDiagramPerson(data.rootPerson, 'root')}</ul>
    </div>
    <p class="diagram-hint"><i class="fas fa-hand"></i> Drag to pan · click a person to open them in the tree</p>`;

  const scrollEl = el.querySelector('.diagram-scroll');
  scrollEl.scrollLeft = scroll.left;
  scrollEl.scrollTop = scroll.top;

  // Drag-to-pan on empty chart space; a drag must not count as a click on a node
  let drag = null;
  let moved = false;
  scrollEl.onpointerdown = (e) =>
  {
    if (e.button !== 0 || e.target.closest('.chart-node')) return;
    drag = { x: e.clientX, y: e.clientY, left: scrollEl.scrollLeft, top: scrollEl.scrollTop };
    moved = false;
    scrollEl.setPointerCapture(e.pointerId);
    scrollEl.classList.add('panning');
  };
  scrollEl.onpointermove = (e) =>
  {
    if (!drag) return;
    moved = true;
    scrollEl.scrollLeft = drag.left - (e.clientX - drag.x);
    scrollEl.scrollTop = drag.top - (e.clientY - drag.y);
  };
  scrollEl.onpointerup = scrollEl.onpointercancel = () =>
  {
    drag = null;
    scrollEl.classList.remove('panning');
  };

  el.onclick = (e) =>
  {
    const act = e.target.closest('[data-act]');
    if (act)
    {
      if (act.dataset.act === 'expand') expandAll();
      else collapseAll();
      return;
    }
    const layoutBtn = e.target.closest('[data-layout]');
    if (layoutBtn)
    {
      diagramLayout = layoutBtn.dataset.layout;
      localStorage.setItem('diagramLayout', diagramLayout);
      renderDiagramView();
      return;
    }
    const zoomBtn = e.target.closest('[data-zoom]');
    if (zoomBtn)
    {
      const step = zoomBtn.dataset.zoom;
      diagramZoom = step === 'reset' ? 1 : Math.min(1.5, Math.max(0.5, +(diagramZoom + (step === '+' ? 0.1 : -0.1)).toFixed(2)));
      renderDiagramView();
      return;
    }
    const groupNode = e.target.closest('.chart-group');
    if (groupNode)
    {
      toggleDiagramSection(groupNode.dataset.toggle);
      return;
    }
    const personNode = e.target.closest('.chart-person');
    if (personNode && !moved)
    {
      const path = personNode.dataset.path;
      setView('tree');
      navigateToPath(path);
    }
  };
}

// ---------- Shared helpers for the Relations and Columns views ----------
function personInitial(m, role)
{
  return role === 'reader' ? '?' : (m.name || 'U').trim().charAt(0).toUpperCase();
}

function isDeceasedMember(m)
{
  return !!(m.dod && m.dod.trim()) || (m.status || '').toLowerCase() === 'deceased';
}

// Clickable name pill used by the Relations view
function personChip(m, path, role)
{
  const name = role === 'reader' ? 'Private' : (m.name || 'Unnamed');
  const cls = `${m.gender === 'Female' ? 'female' : 'male'}${isDeceasedMember(m) ? ' deceased' : ''}`;
  return `<button type="button" class="person-chip ${cls}" data-path="${path}" title="Open ${name} in the tree">
    <span class="mini-avatar">${personInitial(m, role)}</span>${name}<small>#${m.serial ?? 'N/A'}</small></button>`;
}

// ---------- Relations view: how are two people related? ----------
let relA = null;
let relB = null;

// Every visible member as a node with parent / child / spouse links, keyed by path.
// Children recorded under a spouse count as the partner's children too.
function buildRelationGraph(role)
{
  const nodes = new Map();
  const node = (m, path) =>
  {
    if (!nodes.has(path)) nodes.set(path, { m, path, up: [], down: [], spouse: [] });
    return nodes.get(path);
  };
  (function walk(member, path)
  {
    if (!member || !canSee(member, role)) return;
    const me = node(member, path);
    (member.spouses || []).forEach((sp, i) =>
    {
      if (!canSee(sp, role)) return;
      const spPath = `${path}.spouses[${i}]`;
      const s = node(sp, spPath);
      me.spouse.push(spPath);
      s.spouse.push(path);
      (sp.children || []).forEach((ch, k) =>
      {
        if (!canSee(ch, role)) return;
        const chPath = `${spPath}.children[${k}]`;
        const c = node(ch, chPath);
        c.up.push(spPath, path);
        s.down.push(chPath);
        me.down.push(chPath);
        walk(ch, chPath);
      });
    });
    (member.children || []).forEach((ch, i) =>
    {
      if (!canSee(ch, role)) return;
      const chPath = `${path}.children[${i}]`;
      const c = node(ch, chPath);
      c.up.push(path);
      me.down.push(chPath);
      walk(ch, chPath);
    });
  })(data.rootPerson, 'root');
  return nodes;
}

// Shortest chain of people between two paths; each hop records how it was crossed
function findRelationPath(nodes, from, to)
{
  if (!nodes.has(from) || !nodes.has(to)) return null;
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length)
  {
    const cur = queue.shift();
    if (cur === to) break;
    const n = nodes.get(cur);
    [['up', n.up], ['down', n.down], ['spouse', n.spouse]].forEach(([kind, list]) =>
    {
      list.forEach(next =>
      {
        if (prev.has(next)) return;
        prev.set(next, { from: cur, kind });
        queue.push(next);
      });
    });
  }
  if (!prev.has(to)) return null;
  const chain = [];
  for (let at = to; at; at = prev.get(at)?.from) chain.unshift({ path: at, via: prev.get(at)?.kind || null });
  return chain;
}

// Plain-English name for "B is A's ___" when the path only goes up then down
function bloodTerm(ups, downs, female)
{
  const pick = (m, f) => female ? f : m;
  const great = (n) => n > 0 ? (n === 1 ? 'great-' : `${n}x great-`) : '';
  if (ups === 0 && downs === 0) return 'the same person';
  if (ups === 0) return downs === 1 ? pick('son', 'daughter') : great(downs - 2) + pick('grandson', 'granddaughter');
  if (downs === 0) return ups === 1 ? pick('father', 'mother') : great(ups - 2) + pick('grandfather', 'grandmother');
  if (ups === 1 && downs === 1) return pick('brother', 'sister');
  if (ups === 1) return great(downs - 2) + pick('nephew', 'niece');
  if (downs === 1) return great(ups - 2) + pick('uncle', 'aunt');
  const degree = Math.min(ups, downs) - 1;
  const removed = Math.abs(ups - downs);
  const ord = ['', '1st', '2nd', '3rd'][degree] || `${degree}th`;
  return `${ord} cousin${removed ? ` ${removed}x removed` : ''}`;
}

function describeRelation(nodes, chain)
{
  const first = nodes.get(chain[0].path).m;
  const last = nodes.get(chain[chain.length - 1].path).m;
  const nameA = first.name || 'Unnamed';
  const nameB = last.name || 'Unnamed';
  const kinds = chain.slice(1).map(s => s.via);
  if (!kinds.length) return `${nameA} and ${nameB} are the same person.`;

  const lastFemale = last.gender === 'Female';
  const strip = (arr) => arr.filter(k => k !== 'spouse');
  const blood = (arr, female) =>
  {
    const ups = arr.filter(k => k === 'up').length;
    const downs = arr.filter(k => k === 'down').length;
    const ordered = arr.map(k => k + ',').join('').match(/^(up,)*(down,)*$/);
    return ordered ? bloodTerm(ups, downs, female) : null;
  };

  const spouseSteps = kinds.filter(k => k === 'spouse').length;
  if (kinds.length === 2 && spouseSteps === 2)
  {
    const shared = nodes.get(chain[1].path).m;
    return `${nameA} and ${nameB} are both married to ${shared.name || 'Unnamed'}.`;
  }
  if (spouseSteps === 0)
  {
    const term = blood(kinds, lastFemale);
    if (term) return `${nameB} is ${nameA}'s ${term}.`;
  }
  else if (spouseSteps === 1 && kinds.length === 1)
  {
    return `${nameB} is ${nameA}'s ${lastFemale ? 'wife' : 'husband'}.`;
  }
  else if (spouseSteps === 1 && kinds[kinds.length - 1] === 'spouse')
  {
    // B is the partner of one of A's blood relatives
    const relative = nodes.get(chain[chain.length - 2].path).m;
    const term = blood(strip(kinds), relative.gender === 'Female');
    if (term) return `${nameB} is the ${lastFemale ? 'wife' : 'husband'} of ${nameA}'s ${term}, ${relative.name || 'Unnamed'}.`;
  }
  else if (spouseSteps === 1 && kinds[0] === 'spouse')
  {
    // B is a blood relative of A's partner
    const partner = nodes.get(chain[1].path).m;
    const term = blood(strip(kinds), lastFemale);
    if (term) return `${nameB} is the ${term} of ${nameA}'s ${partner.gender === 'Female' ? 'wife' : 'husband'}, ${partner.name || 'Unnamed'}.`;
  }
  return `${nameB} is related to ${nameA} through ${chain.length - 2} other ${chain.length === 3 ? 'person' : 'people'}, including marriage.`;
}

function renderRelationsView()
{
  const el = document.getElementById('relationsContent');
  if (!el || !data || !data.rootPerson) return;
  const role = getCurrentRole();
  if (role === 'reader')
  {
    el.innerHTML = '<p class="col-empty">The relationship finder is not available for your role.</p>';
    return;
  }

  const nodes = buildRelationGraph(role);
  const label = (n) => `${n.m.name || 'Unnamed'} #${n.m.serial ?? 'N/A'}`;
  const byLabel = new Map([...nodes.values()].map(n => [label(n), n.path]));
  const textOf = (path) => (path && nodes.has(path) ? label(nodes.get(path)) : '');
  if (relA && !nodes.has(relA)) relA = null;
  if (relB && !nodes.has(relB)) relB = null;

  const chain = relA && relB ? findRelationPath(nodes, relA, relB) : null;
  const hop = { up: 'child of', down: 'parent of', spouse: 'married to' };

  let result = '<p class="col-empty">Pick two people to see how they are connected.</p>';
  if (relA && relB && !chain) result = '<p class="col-empty">No connection was found between these two people.</p>';
  if (chain)
  {
    result = `<div class="rel-summary"><i class="fas fa-link"></i> ${describeRelation(nodes, chain)}</div>
      <ol class="rel-chain">${chain.map((s, i) => `<li>
        ${i ? `<span class="rel-hop"><i class="fas fa-arrow-down-long"></i> ${hop[s.via]}</span>` : ''}
        ${personChip(nodes.get(s.path).m, s.path, role)}</li>`).join('')}</ol>`;
  }

  el.innerHTML = `
    <datalist id="relPeople">${[...byLabel.keys()].map(k => `<option value="${k.replace(/"/g, '')}"></option>`).join('')}</datalist>
    <div class="rel-form">
      <label class="field-pill"><i class="fas fa-user"></i>
        <input id="relA" list="relPeople" placeholder="First person (name or #serial)" value="${textOf(relA).replace(/"/g, '')}" autocomplete="off"></label>
      <button type="button" class="icon-btn" id="relSwap" title="Swap" aria-label="Swap people"><i class="fas fa-right-left"></i></button>
      <label class="field-pill"><i class="fas fa-user"></i>
        <input id="relB" list="relPeople" placeholder="Second person (name or #serial)" value="${textOf(relB).replace(/"/g, '')}" autocomplete="off"></label>
    </div>
    <div class="rel-result">${result}</div>`;

  const bind = (id, set) => el.querySelector(id).addEventListener('change', (e) =>
  {
    const typed = e.target.value.trim();
    set(byLabel.get(typed) || null);
    renderRelationsView();
  });
  bind('#relA', (p) => { relA = p; });
  bind('#relB', (p) => { relB = p; });
  el.querySelector('#relSwap').onclick = () => { [relA, relB] = [relB, relA]; renderRelationsView(); };

  el.onclick = (e) =>
  {
    const chip = e.target.closest('.person-chip');
    if (!chip) return;
    setView('tree');
    navigateToPath(chip.dataset.path);
  };
}

// ---------- Columns view: drill down one generation at a time ----------
let columnsSel = ['root'];

function renderColumnsView()
{
  const el = document.getElementById('columnsContent');
  if (!el || !data || !data.rootPerson) return;
  const role = getCurrentRole();

  // Drop any selection that no longer exists (data was reloaded or a member was deleted)
  const valid = [];
  for (const p of columnsSel)
  {
    const m = safeGetByPath(p);
    if (!m || !canSee(m, role)) break;
    valid.push(p);
  }
  columnsSel = valid.length ? valid : ['root'];

  const row = (m, path, selected) =>
  {
    const hasKin = (m.spouses && m.spouses.length) || (m.children && m.children.length);
    const meta = role === 'reader' ? '' : [m.maritalStatus, isDeceasedMember(m) ? 'deceased' : ''].filter(Boolean).join(' · ');
    return `<button type="button" class="col-row${selected ? ' selected' : ''}" data-path="${path}">
      <span class="result-avatar ${m.gender === 'Female' ? 'female' : 'male'}${isDeceasedMember(m) ? ' deceased' : ''}">${personInitial(m, role)}</span>
      <span class="col-text"><strong>${role === 'reader' ? 'Private' : (m.name || 'Unnamed')}</strong>${meta ? `<small>${meta}</small>` : ''}</span>
      <small class="col-serial">#${m.serial ?? 'N/A'}</small>
      ${hasKin ? '<i class="fas fa-chevron-right col-caret"></i>' : ''}
    </button>`;
  };

  const section = (title, icon, parentPath, type, list, selectedPath) =>
  {
    const rows = list.map((m, i) => ({ m, path: `${parentPath}.${type}[${i}]` })).filter(x => canSee(x.m, role));
    if (!rows.length) return '';
    return `<h4 class="col-title"><i class="fas ${icon}"></i> ${title} <span>${rows.length}</span></h4>
      ${rows.map(x => row(x.m, x.path, x.path === selectedPath)).join('')}`;
  };

  const columns = [`<div class="col"><h4 class="col-title"><i class="fas fa-seedling"></i> Family head</h4>${row(data.rootPerson, 'root', columnsSel[0] === 'root')}</div>`];
  columnsSel.forEach((path, i) =>
  {
    const parent = safeGetByPath(path);
    const next = columnsSel[i + 1];
    const body = section('Spouses', 'fa-ring', path, 'spouses', parent.spouses || [], next)
      + section('Children', 'fa-users', path, 'children', parent.children || [], next);
    columns.push(`<div class="col">${body || '<p class="col-empty">No spouses or children recorded.</p>'}</div>`);
  });

  // Profile of the person selected in the last column
  const last = columnsSel[columnsSel.length - 1];
  const p = safeGetByPath(last);
  const age = role === 'reader' ? null : ageOf({ dob: p.dob || '', dod: p.dod || '' });
  const facts = role === 'reader' ? [] : [
    ['fa-venus-mars', 'Gender', p.gender],
    ['fa-heart', 'Marital status', p.maritalStatus],
    ['fa-pray', 'Religion', p.religion],
    ['fa-calendar-alt', 'Born', formatDate(p.dob) ? formatDate(p.dob) + (age !== null && !p.dod ? ` (${age} yrs)` : '') : ''],
    ['fa-cross', 'Died', formatDate(p.dod) ? formatDate(p.dod) + (age !== null ? ` (aged ${age})` : '') : ''],
    ['fa-phone', 'Phone', p.phone],
    ['fa-envelope', 'Email', p.email],
    ['fa-map-marker-alt', 'Address', p.address]
  ].filter(f => f[2]);
  const profile = `<aside class="col col-profile">
    <div class="profile-head">
      <span class="result-avatar big ${p.gender === 'Female' ? 'female' : 'male'}${isDeceasedMember(p) ? ' deceased' : ''}">${personInitial(p, role)}</span>
      <div><strong>${role === 'reader' ? 'Private' : (p.name || 'Unnamed')}</strong><small>#${p.serial ?? 'N/A'} · Generation ${(last.match(/\.children\[/g) || []).length + 1}</small></div>
    </div>
    ${facts.map(f => `<div class="profile-fact"><i class="fas ${f[0]}"></i><span><small>${f[1]}</small>${f[2]}</span></div>`).join('')}
    ${role !== 'reader' && p.notes ? `<p class="profile-notes">${p.notes}</p>` : ''}
    <button type="button" class="btn btn-outline" data-open="${last}"><i class="fas fa-sitemap"></i> Open in tree</button>
  </aside>`;

  const prev = el.querySelector('.columns-scroll');
  el.innerHTML = `<div class="columns-scroll">${columns.join('')}${profile}</div>
    <p class="diagram-hint"><i class="fas fa-hand-pointer"></i> Pick a person to see their spouses and children in the next column</p>`;
  const scroller = el.querySelector('.columns-scroll');
  // Keep the newest column in view as the user drills down
  scroller.scrollLeft = prev && prev.scrollLeft ? scroller.scrollWidth : 0;

  el.onclick = (e) =>
  {
    const open = e.target.closest('[data-open]');
    if (open)
    {
      setView('tree');
      navigateToPath(open.dataset.open);
      return;
    }
    const rowEl = e.target.closest('.col-row');
    if (!rowEl) return;
    const path = rowEl.dataset.path;
    // Selecting in column N replaces everything to its right
    const colIndex = [...el.querySelectorAll('.col:not(.col-profile)')].indexOf(rowEl.closest('.col'));
    columnsSel = columnsSel.slice(0, colIndex).concat(path);
    renderColumnsView();
    const s = el.querySelector('.columns-scroll');
    s.scrollTo({ left: s.scrollWidth, behavior: 'smooth' });
  };
}

// Expand/collapse a spouses or children branch within the diagram view
function toggleDiagramSection(sectionPath)
{
  expandState[sectionPath] = !isExpanded(sectionPath);
  renderDiagramView();
}

// Build the <li> for one person plus their (possibly collapsed) branches
function renderDiagramPerson(member, path)
{
  const role = getCurrentRole();
  if ((role === 'reader' || role === 'writer') && (member.privacy === 'private' || member.privacy === 'protected')) return '';
  if (role === 'admin' && member.privacy === 'private') return '';

  const displayName = role === 'reader' ? 'Private' : (member.name || 'Unnamed');
  const genderClass = member.gender === 'Female' ? 'female' : 'male';

  const branches = [];

  if (member.spouses && member.spouses.length > 0)
  {
    const groupPath = `${path}.spouses`;
    const exp = isExpanded(groupPath);
    const inner = exp ? member.spouses.map((sp, i) => renderDiagramPerson(sp, `${path}.spouses[${i}]`)).join('') : '';
    branches.push(`
      <li>
        <div class="chart-node chart-group spouses" data-toggle="${groupPath}">
          <i class="fas fa-chevron-right ${exp ? 'expanded' : ''}"></i>
          <i class="fas fa-ring"></i> Spouses <span class="chart-count">${member.spouses.length}</span>
        </div>
        ${inner ? `<ul>${inner}</ul>` : ''}
      </li>`);
  }

  if (member.children && member.children.length > 0)
  {
    const groupPath = `${path}.children`;
    const exp = isExpanded(groupPath);
    const inner = exp ? member.children.map((ch, i) => renderDiagramPerson(ch, `${path}.children[${i}]`)).join('') : '';
    branches.push(`
      <li>
        <div class="chart-node chart-group children" data-toggle="${groupPath}">
          <i class="fas fa-chevron-right ${exp ? 'expanded' : ''}"></i>
          <i class="fas fa-users"></i> Children <span class="chart-count">${member.children.length}</span>
        </div>
        ${inner ? `<ul>${inner}</ul>` : ''}
      </li>`);
  }

  const isDeceased = !!(member.dod && member.dod.trim()) || (member.status || '').toLowerCase() === 'deceased';
  const initial = role === 'reader' ? '?' : displayName.trim().charAt(0).toUpperCase();
  const age = role === 'reader' ? null : ageOf({ dob: member.dob || '', dod: member.dod || '' });
  const meta = role === 'reader' ? [] : [
    member.maritalStatus,
    age !== null ? (isDeceased ? `died aged ${age}` : `${age} yrs`) : (isDeceased ? 'deceased' : '')
  ].filter(Boolean);

  return `
    <li>
      <div class="chart-node chart-person ${genderClass}${isDeceased ? ' deceased' : ''}" data-path="${path}" title="${displayName} · #${member.serial ?? 'N/A'}">
        <span class="chart-avatar">${initial}</span>
        <span class="chart-text">
          <span class="chart-name">${displayName}</span>
          ${meta.length ? `<span class="chart-meta">${meta.join(' · ')}</span>` : ''}
        </span>
        <span class="chart-serial">#${member.serial ?? 'N/A'}</span>
      </div>
      ${branches.length ? `<ul>${branches.join('')}</ul>` : ''}
    </li>`;
}

// Load family tree data
function loadFamilyTree()
{
  data = retrieveJsonLocally();
  if (data)
  {
    document.getElementById('loadingState').style.display = 'none';
    applyViewVisibility();
    collapseAll();
    document.querySelector("#lastUpdated").textContent = GetDisplayTime(data.date ?? 0);
  }
  fetch(baseURL + 'family')
    .then(response => response.json())
    .then(json =>
    {
      if (isUpdateRequired(json) || (!data && json))
      {
        data = json;
        storeJsonLocally(data);
        document.getElementById('loadingState').style.display = 'none';
        applyViewVisibility();
        collapseAll();
        document.querySelector("#lastUpdated").textContent = GetDisplayTime(data.date ?? 0);
      }
      else
      {
        document.getElementById('loadingState').innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color); margin-right: 0.5rem;"></i>
            Failed to load family tree: data not available
          `;
      }
    })
    .catch(err =>
    {
      document.getElementById('loadingState').innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color: var(--warning-color); margin-right: 0.5rem;"></i>
            Failed to load family tree: ${err.message}
          `;
    });
}

// Render the complete family tree
function renderTree()
{
  if (!data || !data.rootPerson) return;

  document.getElementById('familyName').textContent = data.familyName || 'Family Tree';
  const container = document.getElementById('treeContent');
  container.innerHTML = '';
  container.appendChild(renderMember(data.rootPerson, null, 'root', 0));

  updateStats();
}

// Compute and display headcount + marital-status breakdown
function updateStats()
{
  const members = collectMembers();
  const counts = { Male: 0, Female: 0, Married: 0, Single: 0, Divorced: 0, Widowed: 0, Separated: 0 };
  members.forEach(m =>
  {
    if (m.gender === 'Male') counts.Male++;
    else if (m.gender === 'Female') counts.Female++;
    if (Object.prototype.hasOwnProperty.call(counts, m.maritalStatus)) counts[m.maritalStatus]++;
  });

  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('totalMembers', members.length);
  set('statMale', counts.Male);
  set('statFemale', counts.Female);
  set('statMarried', counts.Married);
  set('statSingle', counts.Single);
  set('statDivorced', counts.Divorced);
  set('statWidowed', counts.Widowed);
  set('statSeparated', counts.Separated);
  set('statTotal', members.length);

  // Proportion bars: gender relative to total, marital relative to the largest group
  const total = members.length || 1;
  const maritalMax = Math.max(1, counts.Married, counts.Single, counts.Divorced, counts.Widowed, counts.Separated);
  const width = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = pct + '%'; };
  width('barMale', counts.Male / total * 100);
  width('barFemale', counts.Female / total * 100);
  const genderTotal = Math.max(1, counts.Male + counts.Female);
  width('splitMale', counts.Male / genderTotal * 100);
  width('splitFemale', counts.Female / genderTotal * 100);
  ['Married', 'Single', 'Divorced', 'Widowed', 'Separated'].forEach(k => width('bar' + k, counts[k] / maritalMax * 100));
}

// Build a flat list of all members with their paths
function collectMembers()
{
  const results = [];
  const role = getCurrentRole();
  // Relatives hidden from this role in the tree must not leak through their names here
  const visible = (p) => p && !(((role === 'reader' || role === 'writer') && (p.privacy === 'private' || p.privacy === 'protected'))
    || (role === 'admin' && p.privacy === 'private'));
  const names = (list) => (list || []).filter(visible).map(p => p.name).filter(Boolean);
  function walk(member, path, owner, relation)
  {
    if (!member) return;
    results.push({
      name: member.name || '',
      serial: member.serial || null,
      gender: member.gender || '',
      maritalStatus: member.maritalStatus || '',
      spousesCount: (member.spouses && member.spouses.length) || 0,
      childrenCount: (member.children && member.children.length) || 0,
      privacy: member.privacy || 'public',
      dob: member.dob || '',
      dod: member.dod || '',
      status: member.status || '',
      religion: member.religion || '',
      generation: (path.match(/\.children\[/g) || []).length + 1,
      // Relatives, so a result can be recognised without opening it
      relation,
      ownerName: visible(owner) && owner.name || '',
      spouseNames: names(member.spouses),
      childNames: names(member.children),
      path
    });
    if (member.spouses)
    {
      member.spouses.forEach((sp, i) => walk(sp, `${path}.spouses[${i}]`, member, 'spouse'));
    }
    if (member.children)
    {
      member.children.forEach((ch, i) => walk(ch, `${path}.children[${i}]`, member, 'child'));
    }
  }
  if (data && data.rootPerson) walk(data.rootPerson, 'root', null, 'root');
  return results;
}

// Short "who is this" lines for a search result: parent/spouse owner, spouses, children
function relationLines(m)
{
  const lines = [];
  if (m.ownerName)
  {
    const label = m.relation === 'child'
      ? (m.gender === 'Female' ? 'Daughter of' : m.gender === 'Male' ? 'Son of' : 'Child of')
      : (m.gender === 'Female' ? 'Wife of' : m.gender === 'Male' ? 'Husband of' : 'Spouse of');
    lines.push({ icon: m.relation === 'child' ? 'fa-child' : 'fa-ring', text: `${label} <b>${m.ownerName}</b>` });
  }
  const list = (arr) => arr.length > 3 ? `${arr.slice(0, 3).join(', ')} +${arr.length - 3}` : arr.join(', ');
  if (m.spouseNames.length) lines.push({ icon: 'fa-ring', text: `Spouse: <b>${list(m.spouseNames)}</b>` });
  if (m.childNames.length) lines.push({ icon: 'fa-users', text: `Children: <b>${list(m.childNames)}</b>` });
  return lines;
}

function setupSearchAndFilters()
{
  const input = document.getElementById('searchInput');
  const resultsBox = document.getElementById('searchResults');
  const clearBtn = document.getElementById('clearFiltersBtn');
  const backBtn = document.getElementById('backToResultsBtn');
  const genderSel = document.getElementById('filterGender');
  const maritalSel = document.getElementById('filterMarital');
  const childrenSel = document.getElementById('filterChildren');
  const spousesSel = document.getElementById('filterSpouses');
  const unifiedList = document.getElementById('filterResults');
  if (!input || !unifiedList) return;

  // store last results HTML to restore
  let lastResultsHTML = '';

  function computeAndRenderResults()
  {
    const q = (input.value || '').trim().toLowerCase();
    const gender = genderSel?.value || '';
    const marital = maritalSel?.value || '';
    const children = childrenSel?.value || '';
    const spouses = spousesSel?.value || '';
    const members = collectMembers();
    const filtered = members.filter(m =>
    {
      // filters
      if (gender && m.gender !== gender) return false;
      if (marital && m.maritalStatus !== marital) return false;
      if (children === 'yes' && m.childrenCount <= 0) return false;
      if (children === 'no' && m.childrenCount > 0) return false;
      if (spouses === 'yes' && m.spousesCount <= 0) return false;
      if (spouses === 'no' && m.spousesCount > 0) return false;
      // query
      if (q)
      {
        const nameHit = m.name.toLowerCase().includes(q);
        const serialHit = q.startsWith('#')
          ? (m.serial !== null && (`#${m.serial}` === q))
          : (m.serial !== null && (`${m.serial}` === q));
        if (!nameHit && !serialHit) return false;
      }
      return true;
    }).slice(0, 300);

    const role = getCurrentRole();
    unifiedList.innerHTML = filtered.length ? filtered.map(m =>
    {
      const displayName = role === 'reader' ? 'Private' : (m.name || 'Unnamed');
      const initial = role === 'reader' ? '?' : displayName.trim().charAt(0).toUpperCase();
      const tags = [m.gender, role === 'reader' ? '' : m.maritalStatus].filter(Boolean)
        .map(t => `<span class="result-tag">${t}</span>`).join('')
        + (role === 'reader' ? '' : `<span class="result-tag life ${isDeceasedMember(m) ? 'deceased' : 'alive'}"><i class="fas fa-${isDeceasedMember(m) ? 'dove' : 'seedling'}"></i> ${isDeceasedMember(m) ? 'Deceased' : 'Alive'}</span>`);
      const lines = role === 'reader' ? [] : relationLines(m);
      return `<div class="result-item" data-path="${m.path}" tabindex="0">
         <span class="result-avatar ${String(m.gender).toLowerCase()}">${initial}</span>
         <span class="result-main">
           <strong>${displayName}</strong>
           <small>#${m.serial ?? 'N/A'}</small>
           ${lines.map(l => `<small class="result-rel"><i class="fas ${l.icon}"></i>${l.text}</small>`).join('')}
         </span>
         <span class="result-tags">${tags}</span>
       </div>`;
    }).join('') : '<div class="text-muted">No results</div>';

    unifiedList.onclick = (e) =>
    {
      const item = e.target.closest('.result-item');
      if (!item) return;
      navigateToPath(item.getAttribute('data-path'));
    };
    unifiedList.onkeydown = (e) =>
    {
      if (e.key !== 'Enter') return;
      const item = e.target.closest('.result-item');
      if (item) navigateToPath(item.getAttribute('data-path'));
    };

    // hide standalone search box results if any
    if (resultsBox)
    {
      resultsBox.style.display = 'none';
      resultsBox.innerHTML = '';
    }
    lastResultsHTML = unifiedList.innerHTML;
    const countEl = document.getElementById('resultsCount');
    if (countEl) countEl.textContent = filtered.length ? `${filtered.length} ${filtered.length === 1 ? 'member' : 'members'}` : '';
  }

  // Search card is collapsed until the user asks for it
  const filterPanel = document.getElementById('filterPanel');
  const searchToggleBtn = document.getElementById('searchToggleBtn');
  const setSearchOpen = (open) =>
  {
    if (!filterPanel || !searchToggleBtn) return;
    filterPanel.hidden = !open;
    searchToggleBtn.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  };
  searchToggleBtn?.addEventListener('click', () => setSearchOpen(filterPanel.hidden));

  // Clicking a demographics stat quick-filters and shows matching members
  const statsPanel = document.getElementById('statsPanel');
  const insightsBtn = document.getElementById('insightsBtn');
  const dataPanel = document.getElementById('dataPanel');
  const dataBtn = document.getElementById('dataBtn');

  // Header menus: one open at a time, closed by outside click or Escape
  const menus = [[insightsBtn, statsPanel], [dataBtn, dataPanel]].filter(([btn, panel]) => btn && panel);
  const closeMenus = () => menus.forEach(([btn, panel]) =>
  {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  });
  menus.forEach(([btn, panel]) => btn.addEventListener('click', () =>
  {
    const open = panel.hidden;
    closeMenus();
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }));
  document.addEventListener('click', (e) =>
  {
    if (!e.target.closest('.insights')) closeMenus();
  });
  document.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Escape') closeMenus();
  });
  dataPanel?.addEventListener('click', () => setTimeout(closeMenus));

  if (statsPanel)
  {
    statsPanel.addEventListener('click', (e) =>
    {
      if (e.target.closest('.stat-block')) closeMenus();
    });
    const applyStatFilter = (block) =>
    {
      const type = block.dataset.filterType;
      const value = block.dataset.filterValue;
      if (!type || !value) return;

      if (input) input.value = '';
      if (genderSel) genderSel.value = type === 'gender' ? value : '';
      if (maritalSel) maritalSel.value = type === 'marital' ? value : '';
      if (childrenSel) childrenSel.value = '';
      if (spousesSel) spousesSel.value = '';

      setSearchOpen(true);
      computeAndRenderResults();
      unifiedList.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    statsPanel.addEventListener('click', (e) =>
    {
      const block = e.target.closest('.stat-block');
      if (block) applyStatFilter(block);
    });

    statsPanel.addEventListener('keydown', (e) =>
    {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const block = e.target.closest('.stat-block');
      if (!block) return;
      e.preventDefault();
      applyStatFilter(block);
    });
  }

  // Debounce using animation frames instead of timeouts
  let rafId = null;
  input.addEventListener('input', () =>
  {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() =>
    {
      computeAndRenderResults();
      rafId = null;
    });
  });

  genderSel?.addEventListener('change', computeAndRenderResults);
  maritalSel?.addEventListener('change', computeAndRenderResults);
  childrenSel?.addEventListener('change', computeAndRenderResults);
  spousesSel?.addEventListener('change', computeAndRenderResults);

  if (clearBtn)
  {
    clearBtn.addEventListener('click', () =>
    {
      if (genderSel) genderSel.value = '';
      if (maritalSel) maritalSel.value = '';
      if (childrenSel) childrenSel.value = '';
      if (spousesSel) spousesSel.value = '';
      if (input) input.value = '';
      unifiedList.innerHTML = '';
      const countEl = document.getElementById('resultsCount');
      if (countEl) countEl.textContent = '';
    });
  }

  const clearSearchBtn = document.getElementById('clearSearchBtn');
  if (clearSearchBtn)
  {
    clearSearchBtn.addEventListener('click', () =>
    {
      if (input) input.value = '';
      input?.focus();
      computeAndRenderResults();
    });
  }

  if (backBtn)
  {
    backBtn.addEventListener('click', () =>
    {
      setSearchOpen(true);
      unifiedList.innerHTML = lastResultsHTML;
      unifiedList.scrollIntoViewIfNeeded();
      backBtn.style.display = 'none';
    });
  }
}

// Expand sections along a path and scroll to the card
async function navigateToPath(path)
{
  if (!path) return;
  const backBtn = document.getElementById('backToResultsBtn');
  if (backBtn) backBtn.style.display = 'inline-flex';
  // Expand required sections for the path by walking ancestor arrays
  const sectionPaths = [];
  let prefix = 'root';
  const regex = /(?:^|\.)((?:spouses|children))\[(\d+)\]/g;
  let m;
  while ((m = regex.exec(path)) !== null)
  {
    const type = m[1];
    const index = m[2];
    sectionPaths.push(`${prefix}.${type}`);
    prefix = `${prefix}.${type}[${index}]`;
  }
  // Ensure sections expansion flags are set
  sectionPaths.forEach(sp => { expandState[sp] = true; });
  // Re-render from root to realize expanded sections
  renderTree();
  // After render, if some sections were not expanded via flags, toggle them
  for (const sp of sectionPaths)
  {
    const id = `section-${sp.replace(/[\[\].]/g, '-')}`;
    const el = document.getElementById(id);
    if (el && el.classList.contains('collapsed'))
    {
      toggleSection(sp);
      // wait next frame so DOM updates before proceeding
      await new Promise(r => requestAnimationFrame(r));
    }
  }
  // Scroll to the member card and highlight
  await new Promise(r => requestAnimationFrame(r));
  const card = document.querySelector(`.member-card[data-path="${path}"]`);
  if (card)
  {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('highlight');
    card.addEventListener('animationend', () =>
    {
      card.classList.remove('highlight');
    }, { once: true });
  }
}

// ---------- Edit mode: change status chips in place ----------
const PRIVACY_LABELS = { public: 'Public', protected: 'Protected', private: 'Private' };
const PRIVACY_ICONS = { public: 'globe', protected: 'user-shield', private: 'lock' };

// Who may flip which chip, and the choices each offers
function inlineEditOptions(field)
{
  const role = getCurrentRole();
  switch (field)
  {
    case 'gender': return [['Male', 'Male'], ['Female', 'Female']];
    case 'maritalStatus': return ['Single', 'Married', 'Divorced', 'Widowed', 'Separated'].map(v => [v, v]);
    case 'status': return [['alive', 'Alive'], ['deceased', 'Deceased']];
    case 'privacy':
      // Only root can see private members, so nobody else can park someone there
      return [['public', 'Public'], ['protected', 'Protected'], ...(role === 'root' ? [['private', 'Private']] : [])];
    default: return [];
  }
}

function canEditInline()
{
  return ['root', 'admin', 'writer'].includes(getCurrentRole());
}

// Inline changes stay in memory until the user presses Done
let pendingEdits = 0;

function syncEditButton()
{
  const btn = document.getElementById('editModeBtn');
  if (!btn) return;
  const editing = document.querySelector('.container').hasAttribute('data-edit');
  btn.setAttribute('aria-pressed', String(editing));
  btn.classList.toggle('active', editing);
  btn.querySelector('i').className = `fas ${editing ? 'fa-check' : 'fa-pen-to-square'}`;
  btn.querySelector('.btn-label').textContent = editing
    ? (pendingEdits ? `Done (${pendingEdits})` : 'Done')
    : 'Quick edit';
}

function setEditMode(on)
{
  const container = document.querySelector('.container');
  const enabled = on && canEditInline();
  const wasEditing = container.hasAttribute('data-edit');
  container.toggleAttribute('data-edit', enabled);
  if (!enabled) closeChipMenu();

  // Editing happens on tree cards, so lock everything that would navigate away or leave unsaved changes behind
  if (enabled && !wasEditing)
  {
    ['statsPanel', 'dataPanel', 'filterPanel'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
    ['insightsBtn', 'dataBtn', 'searchToggleBtn'].forEach(id => document.getElementById(id)?.setAttribute('aria-expanded', 'false'));
    if (currentView !== 'tree') setView('tree');
  }
  document.querySelectorAll('.view-toggle, .search-toggle, #insights, #dataMenu').forEach(el => { el.inert = enabled; });

  // Leaving edit mode is the one moment the batch of changes is uploaded
  if (wasEditing && !enabled && pendingEdits > 0 && canEditInline())
  {
    pendingEdits = 0;
    uploadDataToServer();
  }
  syncEditButton();
}

window.addEventListener('beforeunload', (e) =>
{
  if (pendingEdits > 0) e.preventDefault();
});

function closeChipMenu()
{
  const menu = document.getElementById('chipMenu');
  if (menu) menu.hidden = true;
}

function openChipMenu(chip)
{
  const field = chip.dataset.field;
  const path = chip.closest('.member-card')?.dataset.path;
  const options = inlineEditOptions(field);
  if (!path || !options.length) return;

  let menu = document.getElementById('chipMenu');
  if (!menu)
  {
    menu = document.createElement('div');
    menu.id = 'chipMenu';
    menu.className = 'chip-menu';
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
  }
  menu.innerHTML = options.map(([value, label]) =>
    `<button type="button" role="menuitemradio" aria-checked="${value === chip.dataset.value}" class="chip-menu-item${value === chip.dataset.value ? ' current' : ''}" data-value="${value}">${label}</button>`).join('');
  menu.onclick = (e) =>
  {
    const item = e.target.closest('.chip-menu-item');
    if (!item) return;
    closeChipMenu();
    if (item.dataset.value !== chip.dataset.value) applyInlineChange(path, field, item.dataset.value);
  };

  menu.hidden = false;
  const rect = chip.getBoundingClientRect();
  const height = menu.offsetHeight;
  const below = rect.bottom + 6 + height <= window.innerHeight;
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${below ? rect.bottom + 6 : rect.top - height - 6}px`;
}

function applyInlineChange(path, field, value)
{
  const member = getByPath(path);
  if (!member) return;

  if (field === 'status')
  {
    // A date of death outranks the status flag, so reviving someone has to clear it
    if (value === 'alive' && member.dod && !confirm('This will clear the date of death. Continue?')) return;
    if (value === 'alive') delete member.dod;
  }
  member[field] = value;

  const oldNode = document.querySelector(`.member-node[data-path="${path}"]`);
  if (oldNode) oldNode.replaceWith(renderMember(member, null, path, 0));
  updateStats();
  pendingEdits++;
  syncEditButton();
}

// Rename in place: the name turns into a text box, Enter or blur keeps it, Escape cancels
function startNameEdit(nameEl)
{
  const path = nameEl.closest('.member-card')?.dataset.path;
  const member = path && getByPath(path);
  if (!member) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-input';
  input.value = member.name || '';
  input.placeholder = 'Full name';
  input.setAttribute('aria-label', 'Full name');
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  let done = false;
  const finish = (commit) =>
  {
    if (done) return;
    done = true;
    const value = input.value.trim();
    // A member needs a name, so an empty box counts as cancelling
    if (commit && value && value !== (member.name || '')) applyInlineChange(path, 'name', value);
    else input.replaceWith(nameEl);
  };
  input.addEventListener('keydown', (e) =>
  {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape')
    {
      e.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

document.addEventListener('click', (e) =>
{
  const chip = e.target.closest('.chip-editable');
  const container = document.querySelector('.container');
  const nameEl = e.target.closest('.member-card .name');
  if (nameEl && container?.hasAttribute('data-edit') && canEditInline())
  {
    closeChipMenu();
    startNameEdit(nameEl);
    return;
  }
  if (chip && container?.hasAttribute('data-edit') && canEditInline())
  {
    e.stopPropagation();
    openChipMenu(chip);
    return;
  }
  if (!e.target.closest('#chipMenu')) closeChipMenu();
});

document.addEventListener('keydown', (e) =>
{
  if (e.key === 'Escape') closeChipMenu();
});

window.addEventListener('scroll', closeChipMenu, true);

// Render individual family member
function renderMember(member, parent, path, level)
{
  const node = document.createElement('div');
  node.className = 'member-node';
  node.setAttribute('data-path', path);

  const card = document.createElement('div');
  card.className = 'member-card' + (member.gender == "Female" ? " female" : " male");
  card.setAttribute('data-path', path);

  // Determine if member is deceased
  const isDeceased = (member.dod && member.dod.trim() !== '') || (member.status && member.status.toLowerCase() === 'deceased');
  if (isDeceased) card.classList.add('deceased');
  const statusColor = isDeceased ? 'var(--text-muted)' : 'var(--success-color)';

  // Avatar HTML
  const avatarHTML = member.image
    ? `<img src="${member.image}" alt="${member.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <i class="fas fa-user" style="display: none;"></i>`
    : `<i class="fas fa-user"></i>`;

  // Build member details
  const privacy = member.privacy || 'public';
  const details = [
    { icon: member.gender === 'Female' ? 'venus' : 'mars', label: 'Gender', value: member.gender || 'Not specified', field: 'gender', raw: member.gender || '' },
    { icon: 'heart', label: 'Status', value: member.maritalStatus || 'Not specified', field: 'maritalStatus', raw: member.maritalStatus || '' },
    { icon: 'pray', label: 'Religion', value: member.religion || 'Not specified' },
    // Alive is the default, so it only shows while editing; deceased is always shown
    { icon: isDeceased ? 'dove' : 'seedling', label: 'Life', value: isDeceased ? 'Deceased' : 'Alive', field: 'status', raw: isDeceased ? 'deceased' : 'alive', cls: isDeceased ? '' : 'edit-only' },
    { icon: PRIVACY_ICONS[privacy] || 'globe', label: 'Privacy', value: PRIVACY_LABELS[privacy] || 'Public', field: 'privacy', raw: privacy, cls: 'edit-only' }
  ];

  if (formatDate(member.dob))
    details.push({ icon: 'calendar-alt', label: 'Born', value: formatDate(member.dob) || 'Unknown' });

  if (isDeceased && formatDate(member.dod))
  {
    details.push({ icon: 'cross', label: 'Died', value: formatDate(member.dod) });
  }

  if (member.phone)
    details.push({ icon: 'phone', label: 'Phone', value: member.phone, cls: 'contact-field' });

  if (member.email)
    details.push({ icon: 'envelope', label: 'Email', value: member.email, cls: 'contact-field' });

  const detailsHTML = details.map(detail => `
        <div class="detail-item ${detail.cls || ''}${detail.field ? ' chip-editable' : ''}" value="${detail.value}"${detail.field ? ` data-field="${detail.field}" data-value="${detail.raw}"` : ''}>
          <i class="fas fa-${detail.icon}"></i>
          <span>${detail.value}</span>
        </div>
      `).join('');

  // Main card content
  card.innerHTML = `
        <div class="card-header">
          <div class="avatar-container">
            <div class="avatar">
              ${avatarHTML}
            </div>
            <div class="status-indicator" style="background: ${statusColor};" title="${isDeceased ? 'Deceased' : 'Alive'}"></div>
          </div>
          <div class="member-info">
            <div class="member-name">
              <span class="name${member.name ? '' : ' name-empty'}">${member.name || ''}</span>
              ${member.alternateName ? `<span class="alternate-name">(${member.alternateName})</span>` : ''}
              <span class="serial-badge">#${member.serial || 'N/A'}</span>
            </div>
            <div class="member-details">
              ${detailsHTML}
            </div>
            ${member.address ? `<div class="member-address"><i class="fas fa-map-marker-alt"></i> ${member.address}</div>` : ''}
            ${member.notes ? `<div class="member-notes"><i class="fas fa-quote-left"></i> ${member.notes}</div>` : ''}
          </div>
          <div class="card-actions">
            <button class="btn btn-success btn-sm" onclick="showModal('spouse', '${path}')" title="Add Spouse" aria-label="Add Spouse">
              <i class="fas fa-ring"></i><span class="btn-label">Add Spouse</span>
            </button>
            <button class="btn btn-primary btn-sm" onclick="showModal('child', '${path}')" title="Add Child" aria-label="Add Child">
              <i class="fas fa-baby"></i><span class="btn-label">Add Child</span>
            </button>
            <button class="btn btn-warning btn-sm" onclick="showModal('edit', '${path}')" title="Edit" aria-label="Edit">
              <i class="fas fa-edit"></i><span class="btn-label">Edit</span>
            </button>
            ${path !== 'root' ? `<button class="btn btn-danger btn-sm" onclick="deleteMember('${path}')" title="Delete" aria-label="Delete"><i class="fas fa-trash"></i><span class="btn-label">Delete</span></button>` : ''}
          </div>
        </div>
      `;

  card.setAttribute("privacy", member.privacy || "public");
  node.appendChild(card);

  // Add spouses section
  if (member.spouses && member.spouses.length > 0)
  {
    const spousesSection = createSection('spouses', path, member, 'Spouses', 'ring', level);
    node.appendChild(spousesSection);
  }

  // Add children section
  if (member.children && member.children.length > 0)
  {
    const childrenSection = createSection('children', path, member, 'Children', 'users', level);
    node.appendChild(childrenSection);
  }

  return node;
}

// Create expandable section (spouses/children)
function createSection(type, path, member, title, icon, level)
{
  const section = document.createElement('div');
  section.className = 'tree-connections';

  const sectionPath = `${path}.${type}`;
  const isExp = isExpanded(sectionPath);

  const sectionHeader = document.createElement('div');
  sectionHeader.className = 'section-header';
  sectionHeader.innerHTML = `
        <button type="button" class="toggle-btn ${isExp ? 'expanded' : ''}" aria-expanded="${isExp}" aria-label="Toggle ${title}">
          <i class="fas fa-chevron-right"></i>
        </button>
        <i class="fas fa-${icon}"></i>
        <span class="section-title" mValue="${member[type].length}">${title}</span>
        <span class="section-count">${member[type].length}</span>
      `;

  sectionHeader.onclick = () => toggleSection(sectionPath);

  const sectionContent = document.createElement('div');
  sectionContent.className = `section-content ${isExp ? 'expanded' : 'collapsed'}`;
  sectionContent.id = `section-${sectionPath.replace(/[\[\].]/g, '-')}`;

  if (isExp)
  {
    member[type].forEach((item, i) =>
    {
      const itemElement = renderMember(item, member, `${path}.${type}[${i}]`, level + 1);
      sectionContent.appendChild(itemElement);
    });
  }

  section.appendChild(sectionHeader);
  section.appendChild(sectionContent);

  return section;
}

// Optimized toggle section function
function toggleSection(sectionPath)
{
  const isCurrentlyExpanded = isExpanded(sectionPath);
  expandState[sectionPath] = !isCurrentlyExpanded;

  // Find the specific section content
  const sectionContentId = `section-${sectionPath.replace(/[\[\].]/g, '-')}`;
  const sectionContent = document.getElementById(sectionContentId);
  const toggleBtn = sectionContent.parentElement.querySelector('.toggle-btn');
  const treeConnections = toggleBtn.parentElement;

  if (!isCurrentlyExpanded)
  {
    // Expanding
    toggleBtn.classList.add('expanded');
    toggleBtn.setAttribute('aria-expanded', 'true');
    treeConnections.classList.add('expanded');
    sectionContent.className = 'section-content expanded';

    // Get the data and render items
    const pathParts = sectionPath.split('.');
    const type = pathParts[pathParts.length - 1];
    const memberPath = pathParts.slice(0, -1).join('.');
    const member = getByPath(memberPath);

    // Clear and render items
    sectionContent.innerHTML = '';
    if (member[type] && member[type].length > 0)
    {
      const level = pathParts.length - 1;
      member[type].forEach((item, i) =>
      {
        const itemElement = renderMember(item, member, `${memberPath}.${type}[${i}]`, level);
        sectionContent.appendChild(itemElement);
      });
    }
  } else
  {
    // Collapsing
    toggleBtn.classList.remove('expanded');
    toggleBtn.setAttribute('aria-expanded', 'false');
    treeConnections.classList.remove('expanded');
    sectionContent.className = 'section-content collapsed';

    // Clear content after transition ends
    const onEnd = () =>
    {
      sectionContent.removeEventListener('transitionend', onEnd);
      if (sectionContent.classList.contains('collapsed'))
      {
        sectionContent.innerHTML = '';
      }
    };
    sectionContent.addEventListener('transitionend', onEnd);
  }
}

// Check if section is expanded
function isExpanded(path)
{
  return expandState[path] !== false; // Default to expanded
}

// Expand all sections
function expandAll()
{
  expandState = {};
  renderTree();
  if (currentView === 'diagram') renderDiagramView();
}

async function onDBClick()
{
  setEditMode(false);
  const code = await prompt("Enter your secret code to unlock controls");
  if (+code == 7889)
  {
    const role = await prompt("Enter your role to unlock controls");
    if (["root", "admin", "writer", "reader"].includes(role))
    {
      localStorage.setItem("role", role);
      document.querySelector(".container").setAttribute("role", role);
      return;
    }
  }
  document.querySelector(".container").setAttribute("role", "reader");
}

// Collapse all sections
function collapseAll()
{
  function setAllCollapsed(obj, currentPath)
  {
    if (!obj) return;
    if (obj.spouses && obj.spouses.length > 0)
    {
      expandState[currentPath + '.spouses'] = false;
      obj.spouses.forEach((spouse, i) =>
      {
        setAllCollapsed(spouse, currentPath + `.spouses[${i}]`);
      });
    }
    if (obj.children && obj.children.length > 0)
    {
      expandState[currentPath + '.children'] = false;
      obj.children.forEach((child, i) =>
      {
        setAllCollapsed(child, currentPath + `.children[${i}]`);
      });
    }
  }

  setAllCollapsed(data.rootPerson, 'root');
  renderTree();
  if (currentView === 'diagram') renderDiagramView();
}

// Show modal for adding/editing members
const PRIVACY_HINTS = {
  public: 'Visible to everyone, including readers.',
  protected: 'Hidden from readers and writers; admins can see it.',
  private: 'Only the root account can see this person.'
};

function setModalTab(name)
{
  document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.form-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
}

// Keep the header avatar and the privacy explanation in step with the form
function syncModalPreview()
{
  const form = document.getElementById('memberForm');
  const avatar = document.getElementById('modalAvatar');
  const name = form.elements.name.value.trim();
  avatar.textContent = name ? name.charAt(0).toUpperCase() : '';
  if (!name) avatar.innerHTML = '<i class="fas fa-user"></i>';
  avatar.classList.toggle('female', form.elements.gender.value === 'Female');
  document.getElementById('privacyHint').textContent = PRIVACY_HINTS[form.elements.privacy.value] || '';
}

(function setupModalForm()
{
  const form = document.getElementById('memberForm');
  document.querySelector('.modal-tabs').addEventListener('click', (e) =>
  {
    const tab = e.target.closest('.modal-tab');
    if (tab) setModalTab(tab.dataset.tab);
  });
  form.addEventListener('input', syncModalPreview);
  form.addEventListener('change', syncModalPreview);
  // A required field on a hidden tab would otherwise block submit silently
  form.addEventListener('invalid', () => setModalTab('basics'), true);
  document.getElementById('modal').addEventListener('mousedown', (e) =>
  {
    if (e.target.id === 'modal') closeModal();
  });
})();

function showModal(type, path)
{
  const modal = document.getElementById('modal');
  const form = document.getElementById('memberForm');
  const title = document.getElementById('modalTitle');
  const subtitle = document.getElementById('modalSubtitle');

  // Reset form
  form.reset();

  let member = {};
  if (type === 'edit')
  {
    member = getByPath(path);
    title.textContent = 'Edit Family Member';
    subtitle.textContent = `Update information for ${member.name}`;
    const addressLabel = document.getElementById('addressLabel');
    if (addressLabel) addressLabel.textContent = 'Address';

    // Populate form with existing data
    Object.keys(member).forEach(key =>
    {
      const input = form.querySelector(`[name="${key}"]`);
      if (["gender", "privacy", "status", "maritalStatus"].includes(key))
        form.querySelector(`[value="${member[key]}"]`).checked = true;
      else if (input && member[key] !== null && member[key] !== undefined)
        input.value = member[key];
    });
  } else
  {
    title.textContent = type === 'spouse' ? 'Add Spouse' : 'Add Child';
    subtitle.textContent = `Add new ${type} to the family tree`;

    // Inherit address from the spouse/parent this member is being added to
    const relative = getByPath(path);
    const addressLabel = document.getElementById('addressLabel');
    if (relative && relative.address)
    {
      form.querySelector('[name="address"]').value = relative.address;
      if (addressLabel) addressLabel.textContent = `Address (same as ${relative.name || 'relative'})`;
    } else if (addressLabel)
    {
      addressLabel.textContent = 'Address';
    }
  }

  // Records with a date of death but no explicit status are deceased
  if (member.dod)
  {
    const deceased = form.querySelector('[name="status"][value="deceased"]');
    if (deceased) deceased.checked = true;
  }

  // Store form context
  form.dataset.type = type;
  form.dataset.path = path;
  setModalTab('basics');
  syncModalPreview();

  modal.classList.add('show');
  requestAnimationFrame(() =>
  {
    const firstInput = form.querySelector('input[name="name"]');
    if (firstInput) firstInput.focus();
  });
}

// Close modal
function closeModal()
{
  document.getElementById('modal').classList.remove('show');
}

// Handle form submission
document.getElementById('memberForm').addEventListener('submit', function (e)
{
  e.preventDefault();

  const formData = new FormData(this);
  const memberData = {};

  // Convert form data to object
  for (let [key, value] of formData.entries())
  {
    if (value.trim())
    {
      memberData[key] = value.trim();
    }
  }

  const type = this.dataset.type;
  const path = this.dataset.path;

  if (type === 'edit')
  {
    // Edit existing member
    const member = getByPath(path);
    Object.assign(member, memberData);

    // Re-render just this member card
    const memberCard = document.querySelector(`[data-path="${path}"]`);
    const newCard = renderMember(member, null, path, 0);
    memberCard.parentNode.replaceChild(newCard, memberCard);

  } else
  {
    // Add new member
    memberData.serial = getNextSerial(data.rootPerson) + 1;
    memberData.spouses = [];
    memberData.children = [];

    const parent = getByPath(path);
    if (type === 'spouse')
    {
      parent.spouses = parent.spouses || [];
      parent.spouses.push(memberData);

      // Update the spouses section if it exists and is expanded
      const spousesPath = `${path}.spouses`;
      if (isExpanded(spousesPath))
      {
        const sectionContentId = `section-${spousesPath.replace(/[\[\].]/g, '-')}`;
        const sectionContent = document.getElementById(sectionContentId);
        if (sectionContent)
        {
          const newIndex = parent.spouses.length - 1;
          const newSpouse = renderMember(memberData, parent, `${path}.spouses[${newIndex}]`, path.split('.').length);
          sectionContent.appendChild(newSpouse);
        }
        else
        {
          const spousesSection = createSection('spouses', spousesPath, parent, 'Spouses', 'users', path.split('.').length);
          document.querySelector(`.member-node[data-path="${path}"]`).appendChild(spousesSection);
        }
      }
    }
    else if (type === 'child')
    {
      parent.children = parent.children || [];
      parent.children.push(memberData);

      // Update the children section if it exists and is expanded
      const childrenPath = `${path}.children`;
      if (isExpanded(childrenPath))
      {
        const sectionContentId = `section-${childrenPath.replace(/[\[\].]/g, '-')}`;
        const sectionContent = document.getElementById(sectionContentId);
        if (sectionContent)
        {
          const newIndex = parent.children.length - 1;
          const newChild = renderMember(memberData, parent, `${path}.children[${newIndex}]`, path.split('.').length);
          sectionContent.appendChild(newChild);
        }
        else
        {
          const childrenSection = createSection('children', childrenPath, parent, 'Children', 'users', path.split('.').length);
          document.querySelector(`.member-node[data-path="${path}"]`).appendChild(childrenSection);
        }
      }
    }

    // Update section headers to reflect new counts
    const parentCard = document.querySelector(`[data-path="${path}"]`);
    if (parentCard)
    {
      const sectionHeaders = parentCard.querySelectorAll('.section-title');
      sectionHeaders.forEach(header =>
      {
        const text = header.textContent;
        if (type === 'spouse' && text.includes('Spouses'))
        {
          header.textContent = `Spouses`;
          header.setAttribute("mValue", parent.spouses.length);
          const count = header.parentElement.querySelector('.section-count');
          if (count) count.textContent = parent.spouses.length;
        } else if (type === 'child' && text.includes('Children'))
        {
          header.textContent = `Children`;
          header.setAttribute("mValue", parent.children.length);
          const count = header.parentElement.querySelector('.section-count');
          if (count) count.textContent = parent.children.length;
        }
      });
    }
  }

  closeModal();
  updateStats();
  uploadDataToServer();
});

function uploadDataToServer()
{
  data.date = new Date().getTime();
  document.querySelector("#lastUpdated").textContent = GetDisplayTime(data.date);
  const jsonStr = JSON.stringify(data, null, 2);
  fetch(baseURL + 'family', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: jsonStr
  }).then(response =>
  {
    if (response.ok)
    {
      console.log('Family tree exported successfully!');
    } else
    {
      alert('Error exporting family tree: ' + response.statusText);
    }
  }).catch(error =>
  {
    alert('Error exporting family tree: ' + error.message);
  });
}

// Delete member
function deleteMember(path)
{
  if (!confirm('Are you sure you want to delete this member and all their descendants?'))
  {
    return;
  }

  const pathParts = path.split('.');
  const lastPart = pathParts.pop();
  const parentPath = pathParts.join('.');
  const parent = getByPath(parentPath);

  const match = lastPart.match(/(\w+)\[(\d+)\]/);
  if (match)
  {
    const arrayName = match[1];
    const index = parseInt(match[2]);
    if (parent && parent[arrayName])
    {
      parent[arrayName].splice(index, 1);

      // Remove the member card from DOM
      const memberCard = document.querySelector(`[data-path="${path}"]`);
      if (memberCard)
      {
        memberCard.remove();
      }

      // Update section header counts
      const parentCard = document.querySelector(`[data-path="${parentPath}"]`);
      if (parentCard)
      {
        const sectionHeaders = parentCard.querySelectorAll('.section-title');
        sectionHeaders.forEach(header =>
        {
          const text = header.textContent;
          if (arrayName === 'spouses' && text.includes('Spouses'))
          {
            header.textContent = `Spouses`;
            header.setAttribute("mValue", parent.spouses.length);
            const count = header.parentElement.querySelector('.section-count');
            if (count) count.textContent = parent.spouses.length;
          } else if (arrayName === 'children' && text.includes('Children'))
          {
            header.textContent = `Children`;
            header.setAttribute("mValue", parent.children.length);
            const count = header.parentElement.querySelector('.section-count');
            if (count) count.textContent = parent.children.length;
          }
        });
      }
    }
  }

  updateStats();
  uploadDataToServer();
}

// Get member by path
function getByPath(path)
{
  if (path === 'root') return data.rootPerson;

  let obj = data.rootPerson;
  const regex = /(\w+)\[(\d+)\]/g;
  let match;

  while ((match = regex.exec(path)) !== null)
  {
    const arrayName = match[1];
    const index = parseInt(match[2]);
    obj = obj[arrayName][index];
  }

  return obj;
}

// Get next serial number
function getNextSerial(obj, max = 0)
{
  if (!obj) return max;

  if (obj.serial && obj.serial > max)
  {
    max = obj.serial;
  }

  if (obj.spouses)
  {
    obj.spouses.forEach(spouse =>
    {
      if (spouse.serial && spouse.serial > max)
      {
        max = spouse.serial;
      }
      if (spouse.children)
      {
        spouse.children.forEach(child =>
        {
          max = getNextSerial(child, max);
        });
      }
    });
  }

  if (obj.children)
  {
    obj.children.forEach(child =>
    {
      max = getNextSerial(child, max);
    });
  }

  return max;
}

// Format date for display
function formatDate(dateString)
{
  if (!dateString || dateString.trim() === '') return null;

  try
  {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e)
  {
    return dateString; // Return original if parsing fails
  }
}

// Export JSON
async function exportJSON()
{
  if (!data)
  {
    alert('No data to export');
    return;
  }

  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.familyName || 'family_tree'}.json`;
  document.body.appendChild(a);
  a.click();

  setTimeout(() =>
  {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// Import JSON
function importJSON(event)
{
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e)
  {
    try
    {
      const imported = JSON.parse(e.target.result);
      if (imported.familyName && imported.rootPerson)
      {
        data = imported;
        expandState = {}; // Reset expansion state
        collapseAll();
        uploadDataToServer();
        console.log('Family tree imported successfully!');
      } else
      {
        alert('Invalid family tree JSON structure.');
      }
    } catch (err)
    {
      alert('Error parsing JSON: ' + err.message);
    }
  };
  reader.readAsText(file);

  // Reset file input
  event.target.value = '';
}

// Close modal when clicking overlay
document.getElementById('modal').addEventListener('click', function (e)
{
  if (e.target === this)
  {
    closeModal();
  }
});

// Close modal with Escape key
document.addEventListener('keydown', function (e)
{
  if (e.key === 'Escape' && document.getElementById('modal').classList.contains('show'))
  {
    closeModal();
  }
});


function storeJsonLocally(data)
{
  localStorage.setItem('familyTreeData', JSON.stringify(data));
}

function retrieveJsonLocally()
{
  const data = localStorage.getItem('familyTreeData');
  if (!data) return null;
  return JSON.parse(data);
}

function isUpdateRequired(data)
{
  const storedData = retrieveJsonLocally();
  if (!storedData) return false;
  if (!storedData.date) return true;
  return storedData.date !== data.date;
}

function GetDisplayTime(timeSent, includeSeconds = false, Is24Hour = false)
{
  if (timeSent <= 0)
    return "--";

  // Time received/sent
  let dateTimeSent = new Date(timeSent);
  let date = dateTimeSent.getDate();
  let month = dateTimeSent.getMonth();
  let day = dateTimeSent.getDay();
  let dayPart = ["Sun", "Mon", "Tue", "Wed", "Thur", "Fri", "Sat"][day]; // https://stackoverflow.com/q/54741141/514235
  let fullYear = dateTimeSent.getFullYear();

  let hours = dateTimeSent.getHours();
  let hour = hours % 12;
  hour = Is24Hour ? hour ? hour : 12 : hours;
  let am_pm = Is24Hour ? hours >= 12 ? "pm" : "am" : "";
  let minutes = dateTimeSent.getMinutes();
  let seconds = dateTimeSent.getSeconds();
  let actualTime = ("00" + hour).slice(-2) + ":" + ("00" + minutes).slice(-2);
  if (includeSeconds)
  {
    actualTime += ":" + ("00" + seconds).slice(-2);
  }
  let timePart = Is24Hour ? actualTime + " " + am_pm : actualTime;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let monthName = monthNames[month];
  let dayMonthPart = ("00" + date).slice(-2) + "-" + monthName;

  // Today's date
  let today = new Date();
  let todayFullYear = today.getFullYear();
  let todayMonth = today.getMonth();
  let todayDate = today.getDate();
  let todayDay = today.getDay();
  let time = (date > todayDate) ? date - todayDate : todayDate - date;

  if (fullYear == todayFullYear && month == todayMonth && date == todayDate)
    return timePart;

  if (fullYear == todayFullYear && month == todayMonth && todayDate - date == 1)
    return "Y'day" + ", " + timePart;

  if (fullYear == todayFullYear && month == todayMonth && day != todayDay && time <= 7)
    return dayMonthPart + ", " + dayPart + ", " + timePart;

  // To check if it's same day/date
  if (fullYear == todayFullYear && month == todayMonth && date == todayDate)
    return timePart;

  if (fullYear == todayFullYear)
    return dayMonthPart + ", " + timePart;

  dayMonthPart += "-" + fullYear; // Append the year if it's not the same as the current year

  return dayMonthPart + ", " + timePart;
}

// Global function assignments
window.showModal = showModal;
window.closeModal = closeModal;
window.deleteMember = deleteMember;
window.toggleSection = toggleSection;
window.expandAll = expandAll;
window.collapseAll = collapseAll;
window.exportJSON = exportJSON;
window.setEditMode = setEditMode;
window.importJSON = importJSON;
window.onDBClick = onDBClick;
window.navigateToPath = navigateToPath;
window.setView = setView;