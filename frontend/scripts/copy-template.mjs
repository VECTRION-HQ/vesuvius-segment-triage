// Copy the single-file Vite build into the Python package as the report template,
// asserting the data island survived bundling.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const SRC = "dist/index.html";
const DEST_DIR = "../segment_triage/web";
const DEST = `${DEST_DIR}/template.html`;

const html = readFileSync(SRC, "utf-8");
if (!html.includes('id="triage-data"')) {
  console.error("ERROR: #triage-data data island missing from build output — report injection would fail.");
  process.exit(1);
}
mkdirSync(DEST_DIR, { recursive: true });
copyFileSync(SRC, DEST);
console.log(`Copied ${SRC} -> ${DEST} (${html.length} bytes)`);
