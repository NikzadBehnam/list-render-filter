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
