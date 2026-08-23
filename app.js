import {
  addLog,
  copyPhoto,
  deletePlant,
  exportData,
  getConfig,
  getPhotoUrl,
  getPlant,
  importData,
  listLogs,
  listPlants,
  saveConfig,
  savePhoto,
  savePlant,
} from "./db.js";

const LIGHT = {
  low: "Low light",
  medium: "Medium light",
  bright: "Bright indirect",
  direct: "Direct sun",
};

let LOCATIONS = [
  "Bathroom",
  "Bedroom",
  "Dining",
  "Genkan",
  "Kitchen",
  "LaundryRoom",
  "Living Room",
  "Stairs",
  "TatamiRoom",
  "Toilet 1F",
  "Toilet 2F",
];

let PRESETS = {
  aloe: {
    label: "Aloe Vera",
    category: "Succulent (stemless, fleshy leaves)",
    light: "direct",
    waterEveryDays: 14,
    mistEveryDays: 0,
    fertilizeEveryDays: 45,
    repotEveryMonths: 24,
  },
  calathea: {
    label: "Calathea (Goeppertia spp.)",
    category: "Tropical foliage plant; prayer-plant type (high-humidity understory)",
    light: "medium",
    waterEveryDays: 5,
    mistEveryDays: 2,
    fertilizeEveryDays: 30,
    repotEveryMonths: 12,
  },
  jade: {
    label: "Dwarf Jade (Portulacaria afra)",
    category: "Succulent shrub",
    light: "direct",
    waterEveryDays: 14,
    mistEveryDays: 0,
    fertilizeEveryDays: 45,
    repotEveryMonths: 24,
  },
  ivy: {
    label: "English Ivy (Hedera helix)",
    category: "Vining/climbing plant (evergreen climber)",
    light: "medium",
    waterEveryDays: 7,
    mistEveryDays: 3,
    fertilizeEveryDays: 30,
    repotEveryMonths: 18,
  },
  altissima: {
    label: "Ficus Altissima",
    category: "Tree-type indoor plant (Moraceae family)",
    light: "bright",
    waterEveryDays: 10,
    mistEveryDays: 0,
    fertilizeEveryDays: 30,
    repotEveryMonths: 18,
  },
  microcarpa: {
    label: "Ficus Microcarpa",
    category: "Tree-type indoor plant (Moraceae; often bonsai-trained)",
    light: "bright",
    waterEveryDays: 10,
    mistEveryDays: 0,
    fertilizeEveryDays: 30,
    repotEveryMonths: 24,
  },
  rubberIndoor: {
    label: "Indoor Rubber Tree (Ficus elastica)",
    category: "Tree-type indoor plant (latex-bearing Moraceae)",
    light: "bright",
    waterEveryDays: 10,
    mistEveryDays: 0,
    fertilizeEveryDays: 30,
    repotEveryMonths: 18,
  },
  orchid: {
    label: "Orchid (general)",
    category: "Epiphytic flowering plant (many genera; aerial-root growth)",
    light: "bright",
    waterEveryDays: 7,
    mistEveryDays: 3,
    fertilizeEveryDays: 21,
    repotEveryMonths: 18,
  },
  dieffenbachia: {
    label: "Dieffenbachia Camille",
    category: "Tropical aroid foliage plant (Araceae)",
    light: "medium",
    waterEveryDays: 7,
    mistEveryDays: 2,
    fertilizeEveryDays: 30,
    repotEveryMonths: 12,
  },
  birkin: {
    label: "Philodendron Birkin",
    category: "Tropical aroid foliage plant (upright/clumping)",
    light: "bright",
    waterEveryDays: 7,
    mistEveryDays: 1,
    fertilizeEveryDays: 30,
    repotEveryMonths: 12,
  },
  pothos: {
    label: "Pothos (Epipremnum aureum)",
    category: "Trailing/vining aroid (low-maintenance)",
    light: "medium",
    waterEveryDays: 7,
    mistEveryDays: 0,
    fertilizeEveryDays: 30,
    repotEveryMonths: 12,
  },
  rubber: {
    label: "Rubber Plant (Ficus elastica)",
    category: "Tree-type indoor plant (same as Indoor Rubber Tree)",
    light: "bright",
    waterEveryDays: 10,
    mistEveryDays: 0,
    fertilizeEveryDays: 30,
    repotEveryMonths: 18,
  },
  snake: {
    label: "Snake Plant (Dracaena trifasciata)",
    category: "Succulent-like upright foliage plant (rosette growth)",
    light: "low",
    waterEveryDays: 21,
    mistEveryDays: 0,
    fertilizeEveryDays: 60,
    repotEveryMonths: 24,
  },
  yucca: {
    label: "Yucca",
    category: "Arid-type woody rosette plant (xeric desert plant)",
    light: "direct",
    waterEveryDays: 14,
    mistEveryDays: 0,
    fertilizeEveryDays: 45,
    repotEveryMonths: 24,
  },
  alocasia: {
    label: "Alocasia",
    category: "Tropical aroid foliage plant (upright, large leaves)",
    light: "bright",
    waterEveryDays: 5,
    mistEveryDays: 2,
    fertilizeEveryDays: 30,
    repotEveryMonths: 12,
  },
  maranta: {
    label: "Maranta (Maranta leuconeura)",
    category: "Prayer-plant type tropical foliage plant (distinct from Calathea/Goeppertia)",
    light: "medium",
    waterEveryDays: 5,
    mistEveryDays: 2,
    fertilizeEveryDays: 30,
    repotEveryMonths: 12,
  },
  bamboo: {
    label: "Lucky Bamboo (Dracaena sanderiana)",
    category: "Dracaena-type cane plant (not a true bamboo)",
    light: "medium",
    waterEveryDays: 7,
    mistEveryDays: 0,
    fertilizeEveryDays: 45,
    repotEveryMonths: 24,
  },
};

const LOG_LABELS = {
  water: "Watered",
  mist: "Misted",
  fertilize: "Fertilized",
  repot: "Repotted",
};

const app = document.getElementById("app");
const photoUrls = new Map();
const homeState = {
  filter: "all",
  location: "all",
  plantType: "all",
  query: "",
  selectMode: false,
  selected: new Set(),
};
const settingsState = {
  locQuery: "",
  typeQuery: "",
};
let THEME = localStorage.getItem("bochog-theme") || "light";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

function addMonths(iso, months) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + Number(months));
  return d.toISOString().slice(0, 10);
}

function parseHash() {
  const hash = location.hash.replace(/^#/, "") || "/";
  const parts = hash.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "home" };
  if (parts[0] === "settings") return { name: "settings" };
  if (parts[0] === "new") return { name: "form", id: null };
  if (parts[0] === "edit" && parts[1]) return { name: "form", id: parts[1].split("?")[0] };
  if (parts[0] === "plant" && parts[1]) return { name: "detail", id: parts[1].split("?")[0] };
  return { name: "home" };
}

function go(path) {
  location.hash = path;
}

function daysUntil(iso) {
  const a = new Date(`${todayIso()}T12:00:00`);
  const b = new Date(`${iso}T12:00:00`);
  return Math.round((b - a) / 86400000);
}

function nextDate(last, every) {
  if (!last || !every) return null;
  return addDays(last, every);
}

function intervalStatus(last, every, { months = false, empty, overdue, now, soon, healthy }) {
  if (!every) return null;
  const next = last ? (months ? addMonths(last, every) : addDays(last, every)) : null;
  if (!next) return { key: "now", label: empty, next: null };
  const delta = daysUntil(next);
  if (delta < 0) return { key: "overdue", label: overdue(Math.abs(delta)), next };
  if (delta === 0) return { key: "now", label: now, next };
  if (delta <= 2) return { key: "soon", label: soon(delta), next };
  return { key: "healthy", label: healthy, next };
}

function waterStatus(plant) {
  return intervalStatus(plant.lastWatered, plant.waterEveryDays, {
    empty: "Set first water",
    overdue: (d) => `Overdue ${d}d`,
    now: "Water now",
    soon: (d) => `Due soon · ${d}d`,
    healthy: "Healthy",
  });
}

function mistStatus(plant) {
  if (!plant.mistEveryDays) return null;
  const next = nextDate(plant.lastMisted, plant.mistEveryDays);
  if (!next) return { key: "mist", label: "Mist soon", next: null };
  const delta = daysUntil(next);
  if (delta <= 0) return { key: "mist", label: "Mist now", next };
  return null;
}

function fertilizeStatus(plant) {
  return intervalStatus(plant.lastFertilized, plant.fertilizeEveryDays, {
    empty: "Set first feed",
    overdue: (d) => `Feed overdue ${d}d`,
    now: "Fertilize now",
    soon: (d) => `Feed soon · ${d}d`,
    healthy: "Fed",
  });
}

function repotStatus(plant) {
  return intervalStatus(plant.lastRepotted, plant.repotEveryMonths, {
    months: true,
    empty: "Set first repot",
    overdue: (d) => `Repot overdue ${d}d`,
    now: "Repot now",
    soon: (d) => `Repot soon · ${d}d`,
    healthy: "Repotted",
  });
}

function prettyDate(iso) {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function canonicalLocation(value) {
  if (!value) return "";
  const compact = value.toLowerCase().replace(/\s+/g, "");
  return LOCATIONS.find((loc) => loc.toLowerCase().replace(/\s+/g, "") === compact) || value;
}

async function photoFor(id) {
  if (!id) return null;
  if (photoUrls.has(id)) return photoUrls.get(id);
  const url = await getPhotoUrl(id);
  if (url) photoUrls.set(id, url);
  return url;
}

function uid() {
  return crypto.randomUUID();
}

function slugify(name) {
  const base = String(name || "plant")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "plant";
  let key = base;
  let n = 2;
  while (PRESETS[key]) {
    key = `${base}-${n}`;
    n += 1;
  }
  return key;
}

async function persistCatalog() {
  await saveConfig({ locations: LOCATIONS, plantTypes: PRESETS, theme: THEME });
}

function applyTheme(theme) {
  THEME = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = THEME;
  localStorage.setItem("bochog-theme", THEME);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME === "dark" ? "#121a16" : "#1f3d2c";
}

function applyConfig(config) {
  if (config?.locations?.length) LOCATIONS = config.locations;
  if (config?.plantTypes && Object.keys(config.plantTypes).length) PRESETS = config.plantTypes;
  if (config?.theme) applyTheme(config.theme);
}

function logoSvg() {
  return `<img class="logo" src="./icons/icon.svg" alt="" />`;
}

function locationSelect(selected) {
  const current = canonicalLocation(selected);
  const extra = current && !LOCATIONS.includes(current) ? current : null;
  return `
    <option value="">Unplaced</option>
    ${LOCATIONS.map((loc) => `<option value="${escapeAttr(loc)}" ${current === loc ? "selected" : ""}>${escapeHtml(loc)}</option>`).join("")}
    ${extra ? `<option value="${escapeAttr(extra)}" selected>${escapeHtml(extra)}</option>` : ""}
  `;
}

function decorate(plant) {
  return {
    ...plant,
    location: canonicalLocation(plant.location),
    water: waterStatus(plant),
    mist: mistStatus(plant),
    fertilize: fertilizeStatus(plant),
    repot: repotStatus(plant),
  };
}

function groupPlants(plants) {
  const groups = new Map(LOCATIONS.map((loc) => [loc, []]));
  const extras = new Map();
  const unplaced = [];
  for (const plant of plants) {
    const loc = plant.location || "";
    if (!loc) unplaced.push(plant);
    else if (groups.has(loc)) groups.get(loc).push(plant);
    else {
      if (!extras.has(loc)) extras.set(loc, []);
      extras.get(loc).push(plant);
    }
  }
  const ordered = [];
  for (const loc of LOCATIONS) {
    if (groups.get(loc).length) ordered.push({ loc, plants: groups.get(loc) });
  }
  for (const [loc, list] of extras) ordered.push({ loc, plants: list });
  if (unplaced.length) ordered.push({ loc: "Unplaced", plants: unplaced });
  return ordered;
}

async function renderHome() {
  const { filter, location, plantType, query, selectMode, selected } = homeState;
  const q = query.trim().toLowerCase();
  const plants = (await listPlants()).map(decorate);
  plants.sort((a, b) => (a.water.next || "0000-01-01").localeCompare(b.water.next || "0000-01-01"));
  const visible = plants.filter((p) => {
    if (filter === "now" && p.water.key !== "now" && p.water.key !== "overdue") return false;
    if (filter === "soon" && p.water.key !== "soon") return false;
    if (filter === "healthy" && p.water.key !== "healthy") return false;
    if (location !== "all" && p.location !== location) return false;
    if (plantType !== "all" && (p.plantType || "") !== plantType) return false;
    if (!q) return true;
    const typeLabel = PRESETS[p.plantType]?.label || "";
    return [p.name, p.location, p.notes, typeLabel].join(" ").toLowerCase().includes(q);
  });
  const groups = groupPlants(visible);

  app.classList.toggle("has-batch", selectMode);
  app.innerHTML = `
    <header class="top">
      <div class="brand">
        ${logoSvg()}
        <div>
          <p class="eyebrow">Plant care</p>
          <h1>Bochog</h1>
        </div>
      </div>
      <div class="header-actions">
        <button class="icon-btn" data-go="#/settings" aria-label="Settings" title="Settings">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.77 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.89 14.52a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.69.22l2.39-.96c.5.38 1.04.7 1.63.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.63-.94l2.39.96c.26.12.55.02.69-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2Z"/>
          </svg>
        </button>
        <button class="ghost" id="selectToggle">${selectMode ? "Done" : "Select"}</button>
        <button class="primary" data-go="#/new">Add plant</button>
      </div>
    </header>
    <div class="row">
      <label class="field">Location
        <select id="locationFilter">
          <option value="all" ${location === "all" ? "selected" : ""}>All rooms</option>
          ${LOCATIONS.map((loc) => `<option value="${escapeAttr(loc)}" ${location === loc ? "selected" : ""}>${escapeHtml(loc)}</option>`).join("")}
          <option value="" ${location === "" ? "selected" : ""}>Unplaced</option>
        </select>
      </label>
      <label class="field">Plant name (Type)
        <select id="typeFilter">
          <option value="all" ${plantType === "all" ? "selected" : ""}>All types</option>
          ${Object.entries(PRESETS)
            .map(([key, preset]) => `<option value="${key}" ${plantType === key ? "selected" : ""}>${escapeHtml(preset.label)}</option>`)
            .join("")}
          <option value="" ${plantType === "" ? "selected" : ""}>Custom</option>
        </select>
      </label>
    </div>
    <input class="search" id="search" type="search" placeholder="Search name, notes" value="${escapeAttr(query)}" />
    <div class="filters">
      ${["all", "now", "soon", "healthy"]
        .map(
          (key) =>
            `<button class="chip ${filter === key ? "active" : ""}" data-filter="${key}">${
              { all: "All", now: "Water now", soon: "Due soon", healthy: "Healthy" }[key]
            }</button>`
        )
        .join("")}
    </div>
    ${
      visible.length === 0
        ? `<section class="empty">
            <h2>${plants.length ? "No matching plants" : "No plants here yet"}</h2>
            <p>${plants.length ? "Try another search or filter." : "Add a plant, take a photo, and Bochog will keep the watering dates for you."}</p>
            ${plants.length ? "" : `<button class="primary" data-go="#/new">Add your first plant</button>`}
          </section>`
        : groups
            .map(
              (group) => `
            <section class="room">
              <h2 class="room-title">${escapeHtml(group.loc)} <span>${group.plants.length}</span></h2>
              <div class="list">${group.plants.map((p) => plantCard(p, selectMode, selected.has(p.id))).join("")}</div>
            </section>`
            )
            .join("")
    }
    ${
      selectMode
        ? `<div class="batch-bar">
            <button class="primary" id="batchWater" ${selected.size ? "" : "disabled"}>Water ${selected.size || ""}</button>
            <button class="primary" id="batchMist" ${selected.size ? "" : "disabled"}>Mist</button>
            <button class="ghost" id="clearSelect">Clear</button>
          </div>`
        : ""
    }
  `;

  const search = app.querySelector("#search");
  if (search && document.activeElement === document.body) {
    /* keep as is */
  }
  for (const p of visible) {
    const img = app.querySelector(`[data-thumb="${p.id}"]`);
    if (!img) continue;
    const url = await photoFor(p.id);
    if (url) {
      img.replaceWith(Object.assign(document.createElement("img"), { className: "thumb", src: url, alt: p.name }));
    }
  }
}

function plantCard(p, selectMode, isSelected) {
  const extra = [p.fertilize?.key === "now" || p.fertilize?.key === "overdue" ? `<span class="badge soon">${p.fertilize.label}</span>` : "", p.repot?.key === "now" || p.repot?.key === "overdue" ? `<span class="badge soon">${p.repot.label}</span>` : ""].join("");
  const wateredToday = p.lastWatered === todayIso();
  return `
    <article class="card ${selectMode ? "selecting" : ""}">
      ${selectMode ? `<input type="checkbox" data-select="${p.id}" ${isSelected ? "checked" : ""} />` : ""}
      <a class="card-main" href="#/plant/${p.id}">
        <div class="thumb placeholder" data-thumb="${p.id}">🌿</div>
        <div class="meta">
          <h3>${escapeHtml(p.name)}</h3>
          <p class="when">Next water ${p.water.next ? prettyDate(p.water.next) : "—"}</p>
          <div class="badges">
            <span class="badge ${p.water.key}">${p.water.label}</span>
            ${p.mist ? `<span class="badge mist">${p.mist.label}</span>` : ""}
            ${extra}
          </div>
        </div>
      </a>
      ${
        selectMode
          ? ""
          : `<button type="button" class="${wateredToday ? "ghost" : "primary"} water-btn" data-quick-water="${p.id}">${
              wateredToday ? "Watered" : "Water"
            }</button>`
      }
    </article>
  `;
}

async function markCare(plant, type) {
  const date = todayIso();
  if (type === "water") plant.lastWatered = date;
  if (type === "mist") plant.lastMisted = date;
  if (type === "fertilize") plant.lastFertilized = date;
  if (type === "repot") plant.lastRepotted = date;
  await savePlant(plant);
  await addLog({ plantId: plant.id, type, date });
}

function nextCloneName(name, existingNames) {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  const match = String(name || "Plant").trim().match(/^(.*?)(?:\s+(\d+))?$/);
  const stem = (match?.[1] || name || "Plant").trim();
  let n = match?.[2] ? Number(match[2]) + 1 : 2;
  let candidate = `${stem} ${n}`;
  while (taken.has(candidate.toLowerCase())) {
    n += 1;
    candidate = `${stem} ${n}`;
  }
  return candidate;
}

async function clonePlant(id) {
  const plant = await getPlant(id);
  if (!plant) return;
  const plants = await listPlants();
  const newId = uid();
  const clone = {
    ...plant,
    id: newId,
    name: nextCloneName(
      plant.name,
      plants.map((p) => p.name)
    ),
    createdAt: new Date().toISOString(),
  };
  await savePlant(clone);
  await copyPhoto(id, newId);
  sessionStorage.setItem("bochogJustCloned", newId);
  go(`#/edit/${newId}`);
}

async function renderSettings() {
  const locQ = settingsState.locQuery.trim().toLowerCase();
  const typeQ = settingsState.typeQuery.trim().toLowerCase();
  const locItems = LOCATIONS.map((loc, i) => ({ loc, i })).filter(({ loc }) => !locQ || loc.toLowerCase().includes(locQ));
  const typeItems = Object.entries(PRESETS).filter(
    ([, preset]) =>
      !typeQ ||
      [preset.label, preset.category].join(" ").toLowerCase().includes(typeQ)
  );
  app.innerHTML = `
    <button class="ghost" data-go="#/">← All plants</button>
    <h1 style="margin: 8px 0 16px">Settings</h1>

    <h2 class="section-title">Theme</h2>
    <p class="hint">Choose a light or dark look for Bochog on this device.</p>
    <div class="theme-row">
      <button type="button" class="chip ${THEME === "light" ? "active" : ""}" data-theme-pick="light">Light</button>
      <button type="button" class="chip ${THEME === "dark" ? "active" : ""}" data-theme-pick="dark">Dark</button>
    </div>

    <h2 class="section-title">Backup</h2>
    <p class="hint">Export includes photos, rooms, plant names, care logs, and schedules. Import replaces data on this device.</p>
    <div class="footer-links">
      <button class="ghost" id="exportBtn">Export backup</button>
      <label class="ghost file-btn">Import backup<input id="importFile" type="file" accept="application/json" /></label>
    </div>

    <h2 class="section-title">Locations</h2>
    <p class="hint">Rooms used in the Location dropdown.</p>
    <input class="search" id="locSearch" type="search" placeholder="Search rooms" value="${escapeAttr(settingsState.locQuery)}" />
    <label class="field">Jump to a room
      <select id="locJump">
        <option value="">All rooms</option>
        ${LOCATIONS.map((loc) => `<option value="${escapeAttr(loc)}" ${settingsState.locQuery === loc ? "selected" : ""}>${escapeHtml(loc)}</option>`).join("")}
      </select>
    </label>
    <ul class="edit-list">
      ${
        locItems.length
          ? locItems
              .map(
                ({ loc, i }) => `
        <li>
          <input data-loc-index="${i}" value="${escapeAttr(loc)}" />
          <button type="button" class="danger compact" data-del-loc="${i}">Delete</button>
        </li>`
              )
              .join("")
          : `<li class="hint">No rooms match.</li>`
      }
    </ul>
    <div class="add-row">
      <input id="newLocation" placeholder="New room" />
      <button type="button" class="primary" id="addLocation">Add</button>
    </div>

    <h2 class="section-title">Plant name (Type)</h2>
    <p class="hint">Names in the plant dropdown. Category is saved into notes when you pick one.</p>
    <input class="search" id="typeSearch" type="search" placeholder="Search plant names" value="${escapeAttr(settingsState.typeQuery)}" />
    <label class="field">Jump to a plant name
      <select id="typeJump">
        <option value="">All plant names</option>
        ${Object.entries(PRESETS)
          .map(([key, preset]) => `<option value="${key}" ${settingsState.typeQuery === preset.label ? "selected" : ""}>${escapeHtml(preset.label)}</option>`)
          .join("")}
      </select>
    </label>
    <div class="type-list">
      ${
        typeItems.length
          ? typeItems
              .map(
                ([key, preset]) => `
        <article class="type-card">
          <label>Name<input data-type-label="${key}" value="${escapeAttr(preset.label)}" /></label>
          <label>Category<textarea data-type-cat="${key}">${escapeHtml(preset.category || "")}</textarea></label>
          <button type="button" class="danger compact" data-del-type="${key}">Delete</button>
        </article>`
              )
              .join("")
          : `<p class="hint">No plant names match.</p>`
      }
    </div>
    <div class="type-card">
      <label>New name<input id="newTypeName" placeholder="Monstera" /></label>
      <label>Category<textarea id="newTypeCategory" placeholder="Tropical foliage plant"></textarea></label>
      <button type="button" class="primary" id="addType">Add plant name (Type)</button>
    </div>
  `;
}

async function renderDetail(id) {
  const plant = await getPlant(id);
  if (!plant) {
    go("#/");
    return;
  }
  const decorated = decorate(plant);
  const photo = await photoFor(plant.id);
  const logs = await listLogs(plant.id);
  app.innerHTML = `
    <button class="ghost" data-go="#/">← All plants</button>
    <div class="detail-hero">
      ${photo ? `<img src="${photo}" alt="${escapeHtml(plant.name)}" />` : `<div class="hero-fallback">🌿</div>`}
    </div>
    <header class="top">
      <div>
        <p class="eyebrow">${escapeHtml(decorated.location || "Unplaced")}</p>
        <h1>${escapeHtml(plant.name)}</h1>
        ${plant.plantType && PRESETS[plant.plantType] ? `<p class="where">${escapeHtml(PRESETS[plant.plantType].category)}</p>` : ""}
      </div>
      <div class="header-actions">
        <button class="ghost" data-clone="${plant.id}">Clone</button>
        <button class="ghost" data-go="#/edit/${plant.id}">Edit</button>
      </div>
    </header>
    <div class="badges">
      <span class="badge ${decorated.water.key}">${decorated.water.label}</span>
      ${decorated.mist ? `<span class="badge mist">${decorated.mist.label}</span>` : ""}
      ${decorated.fertilize ? `<span class="badge ${decorated.fertilize.key}">${decorated.fertilize.label}</span>` : ""}
      ${decorated.repot ? `<span class="badge ${decorated.repot.key}">${decorated.repot.label}</span>` : ""}
    </div>
    <div class="actions">
      <button class="primary" data-care="water">Mark watered</button>
      <button class="primary" data-care="mist" ${plant.mistEveryDays ? "" : "disabled"}>Mark misted</button>
      <button class="primary" data-care="fertilize" ${plant.fertilizeEveryDays ? "" : "disabled"}>Mark fertilized</button>
      <button class="primary" data-care="repot" ${plant.repotEveryMonths ? "" : "disabled"}>Mark repotted</button>
    </div>
    <div class="stat-grid">
      <div class="stat"><span>Water every</span><strong>${plant.waterEveryDays} days</strong></div>
      <div class="stat"><span>Last watered</span><strong>${prettyDate(plant.lastWatered)}</strong></div>
      <div class="stat"><span>Next water</span><strong>${prettyDate(decorated.water.next)}</strong></div>
      <div class="stat"><span>Light</span><strong>${LIGHT[plant.light] || "—"}</strong></div>
      <div class="stat"><span>Mist every</span><strong>${plant.mistEveryDays ? `${plant.mistEveryDays} days` : "Off"}</strong></div>
      <div class="stat"><span>Last misted</span><strong>${prettyDate(plant.lastMisted)}</strong></div>
      <div class="stat"><span>Fertilize every</span><strong>${plant.fertilizeEveryDays ? `${plant.fertilizeEveryDays} days` : "Off"}</strong></div>
      <div class="stat"><span>Last fertilized</span><strong>${prettyDate(plant.lastFertilized)}</strong></div>
      <div class="stat"><span>Repot every</span><strong>${plant.repotEveryMonths ? `${plant.repotEveryMonths} months` : "Off"}</strong></div>
      <div class="stat"><span>Last repotted</span><strong>${prettyDate(plant.lastRepotted)}</strong></div>
    </div>
    ${plant.notes ? `<h2 class="section-title">Notes</h2><p class="notes">${escapeHtml(plant.notes)}</p>` : ""}
    <h2 class="section-title">Care log</h2>
    ${
      logs.length
        ? `<ol class="log">${logs
            .slice(0, 30)
            .map((row) => `<li><strong>${LOG_LABELS[row.type] || row.type}</strong> ${prettyDate(row.date)}</li>`)
            .join("")}</ol>`
        : `<p class="hint">No history yet. Mark watered, misted, fertilized, or repotted to start the log.</p>`
    }
  `;
}

function formValues(plant) {
  return {
    name: plant?.name || "",
    plantType: plant?.plantType || "",
    location: canonicalLocation(plant?.location || ""),
    light: plant?.light || "bright",
    waterEveryDays: plant?.waterEveryDays ?? 7,
    mistEveryDays: plant?.mistEveryDays ?? "",
    lastWatered: plant?.lastWatered || "",
    lastMisted: plant?.lastMisted || "",
    fertilizeEveryDays: plant?.fertilizeEveryDays ?? "",
    lastFertilized: plant?.lastFertilized || "",
    repotEveryMonths: plant?.repotEveryMonths ?? "",
    lastRepotted: plant?.lastRepotted || "",
    notes: plant?.notes || "",
  };
}

async function renderForm(id) {
  const plant = id ? await getPlant(id) : null;
  const v = formValues(plant);
  const photo = plant ? await photoFor(plant.id) : null;
  const justCloned = plant && sessionStorage.getItem("bochogJustCloned") === plant.id;
  if (justCloned) sessionStorage.removeItem("bochogJustCloned");
  app.innerHTML = `
    <div class="form-top">
      <button class="ghost" type="button" data-go="${plant ? `#/plant/${plant.id}` : "#/"}">← Cancel</button>
      <button class="primary" type="submit" form="plantForm">Save plant</button>
    </div>
    <h1 style="margin: 8px 0 16px">${justCloned ? "Cloned plant" : plant ? "Edit plant" : "New plant"}</h1>
    ${justCloned ? `<p class="hint">Same photo, room, and watering schedule. Rename it or change the location, then save.</p>` : ""}
    <form class="form" id="plantForm">
      <label>Plant name (Type)
        <select id="preset" name="plantType">
          <option value="">Custom</option>
          ${Object.entries(PRESETS)
            .map(([key, preset]) => `<option value="${key}" ${v.plantType === key ? "selected" : ""}>${escapeHtml(preset.label)}</option>`)
            .join("")}
        </select>
      </label>
      <label>Name<input name="name" required value="${escapeAttr(v.name)}" placeholder="Monstera" /></label>
      <div class="row">
        <label>Location
          <select name="location">${locationSelect(v.location)}</select>
        </label>
        <label>Light
          <select name="light">
            ${Object.entries(LIGHT)
              .map(([key, label]) => `<option value="${key}" ${v.light === key ? "selected" : ""}>${label}</option>`)
              .join("")}
          </select>
        </label>
      </div>
      <div class="photo-picker">
        <div id="photoPreview">${photo ? `<img src="${photo}" alt="" />` : ""}</div>
        <label class="primary file-btn" style="text-align:center">
          ${photo ? "Change photo" : "Add photo"}
          <input id="photoInput" type="file" accept="image/*" />
        </label>
      </div>
      <div class="row">
        <label>Water every (days)<input name="waterEveryDays" type="number" min="1" required value="${v.waterEveryDays}" /></label>
        <label>Mist every (days)<input name="mistEveryDays" type="number" min="0" placeholder="Off" value="${v.mistEveryDays}" /></label>
      </div>
      <div class="row">
        <label>Last watered<input name="lastWatered" type="date" value="${v.lastWatered}" /></label>
        <label>Last misted<input name="lastMisted" type="date" value="${v.lastMisted}" /></label>
      </div>
      <div class="row">
        <label>Fertilize every (days)<input name="fertilizeEveryDays" type="number" min="0" placeholder="Off" value="${v.fertilizeEveryDays}" /></label>
        <label>Last fertilized<input name="lastFertilized" type="date" value="${v.lastFertilized}" /></label>
      </div>
      <div class="row">
        <label>Repot every (months)<input name="repotEveryMonths" type="number" min="0" placeholder="Off" value="${v.repotEveryMonths}" /></label>
        <label>Last repotted<input name="lastRepotted" type="date" value="${v.lastRepotted}" /></label>
      </div>
      <label>Notes<textarea name="notes" placeholder="Likes to dry out a little…">${escapeHtml(v.notes)}</textarea></label>
      ${plant ? `<button class="ghost" type="button" id="cloneBtn">Clone as new plant</button>` : ""}
      ${plant ? `<button class="danger" type="button" id="deleteBtn">Delete plant</button>` : ""}
    </form>
  `;

  let photoBlob = null;
  app.querySelector("#photoInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    photoBlob = await compressImage(file);
    const url = URL.createObjectURL(photoBlob);
    app.querySelector("#photoPreview").innerHTML = `<img src="${url}" alt="" />`;
  });

  app.querySelector("#preset")?.addEventListener("change", (e) => {
    const preset = PRESETS[e.target.value];
    const form = app.querySelector("#plantForm");
    if (!preset) return;
    form.name.value = preset.label;
    form.light.value = preset.light;
    form.waterEveryDays.value = preset.waterEveryDays;
    form.mistEveryDays.value = preset.mistEveryDays || "";
    form.fertilizeEveryDays.value = preset.fertilizeEveryDays || "";
    form.repotEveryMonths.value = preset.repotEveryMonths || "";
    if (!form.notes.value.trim()) form.notes.value = preset.category;
  });

  app.querySelector("#plantForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const next = {
      id: plant?.id || uid(),
      name: String(data.get("name")).trim(),
      plantType: String(data.get("plantType") || "").trim(),
      location: canonicalLocation(String(data.get("location") || "").trim()),
      light: String(data.get("light")),
      waterEveryDays: Number(data.get("waterEveryDays")),
      mistEveryDays: Number(data.get("mistEveryDays")) || 0,
      lastWatered: String(data.get("lastWatered")) || null,
      lastMisted: String(data.get("lastMisted")) || null,
      fertilizeEveryDays: Number(data.get("fertilizeEveryDays")) || 0,
      lastFertilized: String(data.get("lastFertilized")) || null,
      repotEveryMonths: Number(data.get("repotEveryMonths")) || 0,
      lastRepotted: String(data.get("lastRepotted")) || null,
      notes: String(data.get("notes")).trim(),
      createdAt: plant?.createdAt || new Date().toISOString(),
    };
    await savePlant(next);
    if (photoBlob) await savePhoto(next.id, photoBlob);
    photoUrls.delete(next.id);
    go(`#/plant/${next.id}`);
  });

  app.querySelector("#cloneBtn")?.addEventListener("click", () => clonePlant(plant.id));

  app.querySelector("#deleteBtn")?.addEventListener("click", async () => {
    if (!confirm(`Delete ${plant.name}?`)) return;
    await deletePlant(plant.id);
    photoUrls.delete(plant.id);
    go("#/");
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1200;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob || file);
        },
        "image/jpeg",
        0.82
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function route() {
  const r = parseHash();
  if (r.name === "settings") return renderSettings();
  if (r.name === "detail") return renderDetail(r.id);
  if (r.name === "form") return renderForm(r.id);
  return renderHome();
}

app.addEventListener("click", (e) => {
  const themePick = e.target.closest("[data-theme-pick]")?.dataset.themePick;
  if (themePick) {
    e.preventDefault();
    applyTheme(themePick);
    persistCatalog();
    renderSettings();
    return;
  }
  const goTo = e.target.closest("[data-go]")?.dataset.go;
  if (goTo) {
    e.preventDefault();
    go(goTo);
  }
  const filter = e.target.closest("[data-filter]")?.dataset.filter;
  if (filter) {
    e.preventDefault();
    homeState.filter = filter;
    renderHome();
  }
  const cloneId = e.target.closest("[data-clone]")?.dataset.clone;
  if (cloneId) {
    e.preventDefault();
    clonePlant(cloneId);
  }
});

app.addEventListener("click", async (e) => {
  if (e.target.id === "selectToggle") {
    homeState.selectMode = !homeState.selectMode;
    if (!homeState.selectMode) homeState.selected.clear();
    renderHome();
    return;
  }
  const quickWater = e.target.closest("[data-quick-water]")?.dataset.quickWater;
  if (quickWater) {
    e.preventDefault();
    const plant = await getPlant(quickWater);
    if (plant) {
      await markCare(plant, "water");
      await renderHome();
    }
    return;
  }
  if (e.target.id === "clearSelect") {
    homeState.selected.clear();
    renderHome();
    return;
  }
  if (e.target.id === "batchWater" || e.target.id === "batchMist") {
    const type = e.target.id === "batchWater" ? "water" : "mist";
    const ids = [...homeState.selected];
    for (const id of ids) {
      const plant = await getPlant(id);
      if (plant) await markCare(plant, type);
    }
    homeState.selected.clear();
    homeState.selectMode = false;
    renderHome();
    return;
  }
  const care = e.target.closest("[data-care]")?.dataset.care;
  if (care) {
    const id = parseHash().id;
    const plant = await getPlant(id);
    if (!plant) return;
    await markCare(plant, care);
    renderDetail(id);
    return;
  }
  if (e.target.id === "addLocation") {
    const input = app.querySelector("#newLocation");
    const name = input?.value.trim();
    if (!name) return;
    if (LOCATIONS.some((loc) => loc.toLowerCase() === name.toLowerCase())) return;
    LOCATIONS.push(name);
    await persistCatalog();
    renderSettings();
    return;
  }
  if (e.target.id === "addType") {
    const name = app.querySelector("#newTypeName")?.value.trim();
    const category = app.querySelector("#newTypeCategory")?.value.trim() || "";
    if (!name) return;
    const key = slugify(name);
    PRESETS[key] = {
      label: name,
      category,
      light: "medium",
      waterEveryDays: 7,
      mistEveryDays: 0,
      fertilizeEveryDays: 30,
      repotEveryMonths: 12,
    };
    await persistCatalog();
    renderSettings();
    return;
  }
  const delLoc = e.target.closest("[data-del-loc]")?.dataset.delLoc;
  if (delLoc !== undefined) {
    const index = Number(delLoc);
    const removed = LOCATIONS[index];
    if (!confirm(`Delete location “${removed}”? Plants keep their current room until you edit them.`)) return;
    LOCATIONS.splice(index, 1);
    if (homeState.location === removed) homeState.location = "all";
    await persistCatalog();
    renderSettings();
    return;
  }
  const delType = e.target.closest("[data-del-type]")?.dataset.delType;
  if (delType) {
    const label = PRESETS[delType]?.label || delType;
    if (!confirm(`Delete “${label}” from the plant name list?`)) return;
    delete PRESETS[delType];
    if (homeState.plantType === delType) homeState.plantType = "all";
    await persistCatalog();
    renderSettings();
    return;
  }
  if (e.target.id === "exportBtn") {
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bochog-backup-${todayIso()}.json`;
    a.click();
  }
});

app.addEventListener("change", async (e) => {
  if (e.target.dataset.locIndex !== undefined) {
    const index = Number(e.target.dataset.locIndex);
    const next = e.target.value.trim();
    const prev = LOCATIONS[index];
    if (!next || next === prev) {
      e.target.value = prev;
      return;
    }
    const plants = await listPlants();
    for (const plant of plants) {
      if (plant.location === prev) {
        plant.location = next;
        await savePlant(plant);
      }
    }
    LOCATIONS[index] = next;
    if (homeState.location === prev) homeState.location = next;
    await persistCatalog();
    return;
  }
  if (e.target.dataset.typeLabel) {
    const key = e.target.dataset.typeLabel;
    const next = e.target.value.trim();
    if (!next || !PRESETS[key]) {
      e.target.value = PRESETS[key]?.label || "";
      return;
    }
    PRESETS[key].label = next;
    await persistCatalog();
    return;
  }
  if (e.target.dataset.typeCat) {
    const key = e.target.dataset.typeCat;
    if (!PRESETS[key]) return;
    PRESETS[key].category = e.target.value;
    await persistCatalog();
    return;
  }
  if (e.target.id === "locJump") {
    settingsState.locQuery = e.target.value;
    renderSettings();
    return;
  }
  if (e.target.id === "typeJump") {
    const preset = PRESETS[e.target.value];
    settingsState.typeQuery = preset ? preset.label : "";
    renderSettings();
    return;
  }
  if (e.target.id === "locationFilter") {
    homeState.location = e.target.value;
    renderHome();
    return;
  }
  if (e.target.id === "typeFilter") {
    homeState.plantType = e.target.value;
    renderHome();
    return;
  }
  if (e.target.dataset.select) {
    if (e.target.checked) homeState.selected.add(e.target.dataset.select);
    else homeState.selected.delete(e.target.dataset.select);
    renderHome();
    return;
  }
  if (e.target.id !== "importFile") return;
  const file = e.target.files?.[0];
  if (!file) return;
  if (!confirm("Import will replace plants on this device. Continue?")) return;
  const payload = JSON.parse(await file.text());
  await importData(payload);
  applyConfig(payload.config || (await getConfig()));
  photoUrls.clear();
  go("#/");
  route();
});

app.addEventListener("input", (e) => {
  const start = e.target.selectionStart;
  if (e.target.id === "search") {
    homeState.query = e.target.value;
    renderHome().then(() => restoreCaret("search", start));
    return;
  }
  if (e.target.id === "locSearch") {
    settingsState.locQuery = e.target.value;
    renderSettings().then(() => restoreCaret("locSearch", start));
    return;
  }
  if (e.target.id === "typeSearch") {
    settingsState.typeQuery = e.target.value;
    renderSettings().then(() => restoreCaret("typeSearch", start));
  }
});

function restoreCaret(id, start) {
  const el = app.querySelector(`#${id}`);
  if (!el) return;
  el.focus();
  if (typeof start === "number") el.setSelectionRange(start, start);
}

window.addEventListener("hashchange", route);

async function boot() {
  applyTheme(localStorage.getItem("bochog-theme") || "light");
  try {
    applyConfig(await getConfig());
    await persistCatalog();
  } catch (error) {
    console.error("Could not load settings", error);
  }
  route();
}

boot();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
