const root = document.documentElement;
const STORAGE_KEY = "theme-preference";
const btnToggle = document.getElementById("theme-toggle");
const iconSun = document.getElementById("icon-sun");

/* Return 'light' | 'dark' from storage or system */
function getPreferredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/* Apply theme by toggling classes on <html> */
function applyTheme(theme) {
  root.classList.toggle("theme-dark", theme === "dark");
  root.classList.toggle("theme-light", theme === "light");

  // swap icon (simple CSS class flip)
  btnToggle.classList.toggle("is-dark", theme === "dark");
}

/* Persist and apply user choice */
function toggleTheme() {
  const newTheme = root.classList.contains("theme-dark") ? "light" : "dark";

  localStorage.setItem(STORAGE_KEY, newTheme);
  applyTheme(newTheme);
}

// ----------- Init -----------
applyTheme(getPreferredTheme());

// Events
btnToggle.addEventListener("click", toggleTheme);
btnToggle.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    toggleTheme();
  }
});

/* =========================================================
   Data layer — Rick & Morty characters
   ========================================================= */

const API_URL = "https://rickandmortyapi.com/api/character";
const CACHE_KEY = "rm-characters-cache";
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 h in ms
const USE_CACHE = true;

/**
 * Get cached payload if it exists and is fresh.
 * @returns {Array|null}
 */
function readCache() {
  if (!USE_CACHE) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!raw) return null;
    if (Date.now() - raw.ts > CACHE_TTL) return null; // stale
    return raw.data;
  } catch {
    return null;
  }
}

/**
 * Write payload + timestamp to localStorage.
 * @param {Array} data
 */
function writeCache(data) {
  if (!USE_CACHE) return;
  localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
}

/**
 * Fetch every page of the API, normalise the results,
 * and return a flat array.
 * @returns {Promise<Array<{id:number,name:string,species:string,created:string}>>}
 */
async function fetchData() {
  // 1 ) Serve from cache when available
  const cached = readCache();
  if (cached) {
    console.info("Loaded characters from cache");
    return cached;
  }

  // 2 ) Pull fresh data (handles pagination)
  try {
    let url = API_URL;
    const acc = [];

    while (url) {
      const res = await fetch(url);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const page = json.results.map((c) => ({
        id: c.id,
        name: c.name,
        species: c.species,
        /**
         * Normalise timestamp:  API has `created`; if
         * your chosen endpoint ever lacks it, fall back
         * to a pseudo‑date within the past year.
         */
        created:
          c.created ||
          new Date(
            Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
        image: c.image, // handy for future UI polish
      }));

      acc.push(...page);
      url = json.info.next; // null when last page
    }

    console.info(`Fetched ${acc.length} characters from API`);
    writeCache(acc);
    return acc;
  } catch (err) {
    console.error("Fetch failed:", err);
    throw err; // let caller show toast / fallback UI
  }
}

/* =========================================================
   UI layer — list rendering
   ========================================================= */

const listContainer = document.getElementById("list-container");
let ALL_ITEMS = []; // keeps master dataset for filters / modal

/** Format ISO to e.g. “Apr 18 2025” (uses user locale) */
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Build one <li> row */
function rowTemplate({ id, name, created, species }) {
  return `
       <li class="list-row interactive" data-id="${id}">
         <span class="cell name" aria-label="Character name">${name}</span>
         <span class="cell date">${fmtDate(created)}</span>
         <span class="cell species">${species}</span>
         <button class="btn-more" data-id="${id}"
           aria-label="More info about ${name}">
           More info
         </button>
       </li>`;
}

/** Render (or re‑render) the list */
function renderList(items) {
  if (!items.length) {
    listContainer.innerHTML = '<p class="empty-state">No results&nbsp;😢</p>';
    return;
  }

  const html = `<ul class="list">${items.map(rowTemplate).join("")}</ul>`;
  listContainer.innerHTML = html;
}

/** Delegated click → upcoming modal */
listContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-more");
  if (!btn) return;
  const id = Number(btn.dataset.id);
  const item = ALL_ITEMS.find((c) => c.id === id);
  if (item) openModal(item);
});

/* ---------- Bootstrap ---------- */
(async () => {
  try {
    ALL_ITEMS = await fetchData();
    renderList(ALL_ITEMS);
    console.info("✅ Initial list rendered");
  } catch {
    listContainer.innerHTML = '<p class="empty-state">Failed to load data.</p>';
  }
})();

/* =========================================================
   Modal component — show full JSON payload
   ========================================================= */

const modalRoot = document.getElementById("modal-root");
let previouslyFocused = null;

/** Open the modal with a prettified JSON view */
function openModal(item) {
  previouslyFocused = document.activeElement;

  // Build markup once per call (dialog + overlay)
  modalRoot.innerHTML = `
       <div class="modal-overlay" tabindex="-1"></div>
       <div class="modal" role="dialog" aria-modal="true" aria-label="Character details">
         <button class="modal-close" aria-label="Close dialog">&times;</button>
         <pre class="modal-json">${JSON.stringify(item, null, 2)}</pre>
       </div>`;

  modalRoot.classList.remove("hidden");
  requestAnimationFrame(() => modalRoot.classList.add("is-visible"));

  trapFocus();
}

/** Close + cleanup */
function closeModal() {
  modalRoot.classList.remove("is-visible");
  modalRoot.addEventListener(
    "transitionend",
    () => {
      modalRoot.classList.add("hidden");
      modalRoot.innerHTML = "";
      if (previouslyFocused) previouslyFocused.focus();
    },
    { once: true }
  );
  releaseFocus();
}

/* ---------- Event wiring ---------- */
//   • overlay click
//   • close‑button click
//   • Esc key
modalRoot.addEventListener("click", (e) => {
  if (
    e.target.classList.contains("modal-overlay") ||
    e.target.classList.contains("modal-close")
  ) {
    closeModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalRoot.classList.contains("hidden")) {
    closeModal();
  }
});

/* ---------- Focus trapping ---------- */
function trapFocus() {
  const focusable = modalRoot.querySelectorAll(
    'button, [href], textarea, input, select, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  function loop(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey ? e.target === first : e.target === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  modalRoot.addEventListener("keydown", loop);
  first.focus();
  modalRoot._loop = loop; // store for removal
}

function releaseFocus() {
  modalRoot.removeEventListener("keydown", modalRoot._loop || (() => {}));
  modalRoot._loop = null;
}
