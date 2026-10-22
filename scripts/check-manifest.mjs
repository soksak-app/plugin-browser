// Checks plugin.json with validateManifest of the plugin API. make check runs it. The API is the installed
// @soksak/plugin-api, or the packages/plugin-api source of core when CORE_PLUGIN_API_DIR names it.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.resolve(process.env.CORE_PLUGIN_API_DIR || path.join(root, "node_modules", "@soksak", "plugin-api"));
const api = await import(pathToFileURL(path.join(apiDir, "index.js")).href);
if (typeof api.validateManifest !== "function") {
  throw new Error(`the API package at ${apiDir} does not export validateManifest; set CORE_PLUGIN_API_DIR to the packages/plugin-api source of core`);
}

const manifest = JSON.parse(readFileSync(path.join(root, "plugin.json"), "utf8"));
if (api.validateManifest(manifest) !== manifest) throw new Error("validateManifest did not return plugin.json");
console.log("Manifest check passed: plugin.json");
