/** Theme preference: "system" follows prefers-color-scheme; "light"/"dark" pin it via <html data-theme>. */
export const THEMES = ["system", "light", "dark"];
const KEY = "mwu-theme";

/** @param {string | null | undefined} value */
export const normalizeTheme = (value) => (THEMES.includes(/** @type {string} */ (value)) ? /** @type {string} */ (value) : "system");

/** @param {string} current */
export const nextTheme = (current) => THEMES[(THEMES.indexOf(normalizeTheme(current)) + 1) % THEMES.length];

export function readTheme() {
  try { return normalizeTheme(globalThis.localStorage?.getItem(KEY)); } catch { return "system"; }
}

/** @param {string} theme */
export function applyTheme(theme) {
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try { globalThis.localStorage?.setItem(KEY, theme); } catch { /* private mode: keep it in memory only */ }
}
