// Registers the resolve hook of the plugin API fixtures. The test script loads this module with --import, so each test file of
// the run imports the fixtures for the specifiers of the plugin API.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
