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

/* =====================================
   Data layer — Rick & Morty characters
   ===================================== */

const API_URL = "https://rickandmortyapi.com/api/character"; //end point
const CACHE_KEY = "rm-characters-cache";
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 h in ms
const USE_CACHE = false;

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
  try {
    let url = API_URL;
    const acc = [];

    while (url) {
      const res = await fetch(url);
      if (!res.ok) {
        showGlobalToast(`Error: HTTP ${res.status}`, "error");
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.results) {
        showGlobalToast("Error: Invalid JSON data structure", "error");
        throw new Error("Invalid JSON structure");
      }

      const page = json.results.map((c) => ({
        id: c.id,
        name: c.name,
        species: c.species,
        created:
          c.created ||
          new Date(
            Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
      }));

      acc.push(...page);
      url = json.info.next;
    }

    writeCache(acc);
    return acc;
  } catch (err) {
    showGlobalToast("Failed to load data, please try again later.", "error");
    console.error("❌ Fetch failed:", err);
    throw err; // Let the calling code handle additional failure cases
  }
}
/* ==========================
   UI layer — list rendering
   ========================== */

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
function rowTemplate({ id, name, created, species, gender }) {
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
    populationCategories(ALL_ITEMS);
    setupFilters(); // Attach all listeners
    console.info("Filters are ready");
  } catch {
    listContainer.innerHTML = '<p class="empty-state">Failed to load data.</p>';
  }
})();

/* =========================================================
   Modal component — full a11y version
   ========================================================= */

const modalRoot = document.getElementById("modal-root");
let previouslyFocused = null;

/** Open the modal with a prettified JSON view */
function openModal(item) {
  previouslyFocused = document.activeElement;

  const headingId = `dialog-title-${item.id}`;

  modalRoot.innerHTML = `
       <div class="focus-sentinel" tabindex="0" data-sentinel="start"></div>
   
       <div class="modal-overlay" tabindex="-1"></div>
   
       <div class="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="${headingId}">
   
         <button class="modal-close"
                 aria-label="Close dialog">&times;</button>
   
         <h2 id="${headingId}" class="modal-heading">
           ${item.name}
         </h2>
   
         <pre class="modal-json">${JSON.stringify(item, null, 2)}</pre>
       </div>
   
       <div class="focus-sentinel" tabindex="0" data-sentinel="end"></div>
     `;

  modalRoot.classList.remove("hidden");
  requestAnimationFrame(() => modalRoot.classList.add("is-visible"));

  trapFocus();
}

/** Close + cleanup  */
function closeModal() {
  modalRoot.classList.remove("is-visible");
  modalRoot.addEventListener(
    "transitionend",
    () => {
      modalRoot.classList.add("hidden");
      modalRoot.innerHTML = "";
      releaseFocus();
      if (previouslyFocused) previouslyFocused.focus();
    },
    { once: true }
  );
}

/* ---------- Event wiring ---------- */
modalRoot.addEventListener("click", (e) => {
  if (
    e.target.classList.contains("modal-overlay") ||
    e.target.classList.contains("modal-close")
  )
    closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalRoot.classList.contains("hidden"))
    closeModal();
});

/* ---------- Sentinel‑based focus trap ---------- */
function trapFocus() {
  modalRoot.addEventListener("focusin", loopFocus);
  // focus first interactive element inside dialog
  modalRoot.querySelector(".modal").focus();
}

function releaseFocus() {
  modalRoot.removeEventListener("focusin", loopFocus);
}

function loopFocus(e) {
  if (!e.target.dataset.sentinel) return;

  const focusables = modalRoot.querySelectorAll(
    'button, [href], textarea, input, select, pre, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;

  // Jump to last or first focusable depending on sentinel
  (e.target.dataset.sentinel === "start"
    ? focusables[focusables.length - 1]
    : focusables[0]
  ).focus();
}

/* =============================
   Filters — UI population only 
   ============================= */

const categorySelect = document.getElementById("category");
const dateFromInput = document.getElementById("date-from");
const dateToInput = document.getElementById("date-to");
const keywordInput = document.getElementById("keyword");

function populationCategories(items) {
  const unique = [
    ...new Set(items.map((c) => c.species).filter(Boolean)),
  ].sort();

  categorySelect.innerHTML =
    '<option value="">All</option>' +
    unique.map((sp) => `<option value="${sp}">${sp}</option>`).join("");
}

/* ===========================
   Filters + debounce + logic
   =========================== */

const DEBOUNCE_DELAY = 300; //ms debounce for keyword search

let keywordTimeout;
let filteredItems = [...ALL_ITEMS];

/* Add all listeners for filter controls */
function setupFilters() {
  // Date range
  dateFromInput.addEventListener("change", applyFilters);
  dateToInput.addEventListener("change", applyFilters);
  categorySelect.addEventListener("change", applyFilters);

  // Keyword search (with debounce)

  keywordInput.addEventListener("input", () => {
    clearTimeout(keywordTimeout);
    keywordTimeout = setTimeout(applyFilters, DEBOUNCE_DELAY);
  });
}

/** Apply all active filters (AND logic) */
function applyFilters() {
  const keyword = keywordInput.value.toLowerCase();
  const category = categorySelect.value;
  const dateFrom = dateFromInput.value ? new Date(dateFromInput.value) : null;
  const dateTo = dateToInput.value ? new Date(dateToInput.value) : null;

  filteredItems = ALL_ITEMS.filter((item) => {
    // Keyword filter
    const matchesKeyword = item.name.toLowerCase().includes(keyword);

    // Category filter
    const matchesCategory = category ? item.species === category : true;

    // Date filter
    const createdDate = new Date(item.created);
    const matchesDateRange =
      (!dateFrom || createdDate >= dateFrom) &&
      (!dateTo || createdDate <= dateTo);

    return matchesKeyword && matchesCategory && matchesDateRange;
  });

  renderList(filteredItems); // Re-render the filtered results

  if (filteredItems.length === 0) {
    showGlobalToast("No results found.", "info");
  } else {
    hideToast();
  }
}

/** Hide the toast message */
function hideToast() {
  const existingToast = document.querySelector(".toast");
  if (existingToast) existingToast.remove();
}

/* =============================
   Error Handling + Global Toast
   ============================= */

/** Show global toast message */
function showGlobalToast(message, type = "error") {
  const toast = document.createElement("div");
  toast.classList.add("toast", type);
  toast.innerHTML = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 100);
  setTimeout(() => toast.remove(), 5000);
}
