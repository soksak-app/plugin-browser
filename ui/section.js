// The page of a section of the browser plugin (core docs/spec/plugins.md#sections, docs/spec/native-surfaces.md#view-surfaces).
// The host serves this page for each section surface and injects the start values with section {id, sidebar, card}; the section
// view selects the status that the section draws by its id (section-view.js).

import { createPage } from "./page.js";
import { startValues } from "./start-values.js";
import { createSectionView } from "./section-view.js";

const start = startValues();
const { bridge, report } = createPage();
createSectionView({ runtime: bridge.runtime, root: document.body, section: start.section, report });
