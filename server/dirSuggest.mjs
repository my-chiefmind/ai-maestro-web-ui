/**
 * dirSuggest.mjs — folder suggestions for the Add board path field. Read-only: it lists child
 * directory names under the user's home directory and flags which are Maestro projects. It never
 * reads file contents, and anything outside the home directory yields no suggestions.
 */

import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";

const LIMIT = 50;

/** @param {string} dir */
function isCapsule(dir) {
  return existsSync(join(dir, "config.json")) && existsSync(join(dir, "board", "data.json"));
}

/**
 * Suggest directories for a typed path. `~/source/sp` lists entries of ~/source starting with "sp";
 * a trailing separator lists everything in that folder.
 * @param {string} input @param {string} [home]
 * @returns {{ path: string, maestro: boolean }[]}
 */
export function suggestDirs(input, home = homedir()) {
  const typed = String(input ?? "").trim() || "~/";
  if (!typed.startsWith("~") && !typed.startsWith(sep)) return [];
  const abs = typed.startsWith("~") ? join(home, typed.slice(1)) : typed;
  const endsWithSep = /[\\/]$/.test(typed);
  const parent = endsWithSep ? abs : dirname(abs); const stem = endsWithSep ? "" : basename(abs);
  let realHome, realParent;
  try { realHome = realpathSync(home); realParent = realpathSync(parent); } catch { return []; }
  if (realParent !== realHome && !realParent.startsWith(realHome + sep)) return [];
  let entries;
  try { entries = readdirSync(realParent, { withFileTypes: true }); } catch { return []; }
  const shown = typed.slice(0, typed.length - stem.length);
  return entries
    .filter((e) => e.isDirectory() && e.name.toLowerCase().startsWith(stem.toLowerCase()) && (stem.startsWith(".") || !e.name.startsWith(".")))
    .map((e) => e.name).sort((a, b) => a.localeCompare(b)).slice(0, LIMIT)
    .map((name) => {
      const dir = join(realParent, name);
      return { path: `${shown}${name}`, maestro: isCapsule(dir) || isCapsule(join(dir, "maestro")) };
    });
}
