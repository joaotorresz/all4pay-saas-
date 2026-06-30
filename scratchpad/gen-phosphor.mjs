import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
// registryKey -> Phosphor base (variante FILL = moderno, clean, cantos arredondados).
const BASE = {
  house: "house", "arrow-left-right": "arrows-left-right", repeat: "repeat",
  "trending-up": "trend-up", "trending-down": "trend-down", "file-text": "file-text",
  "credit-card": "credit-card", settings: "gear", plus: "plus", search: "magnifying-glass",
  "chevrons-up-down": "arrows-down-up", "chevron-down": "caret-down", "chevron-left": "caret-left",
  "chevron-right": "caret-right", menu: "list", calendar: "calendar-dots",
  sparkles: "sparkle", "arrow-up-right": "arrow-up-right", "arrow-up": "arrow-up",
  "arrow-down-to-line": "download-simple", x: "x", check: "check",
  workflow: "tree-structure", "list-checks": "list-checks", gauge: "gauge",
  "triangle-alert": "warning", users: "users", "shield-check": "shield-check",
  activity: "pulse", network: "share-network", layers: "stack", target: "target", database: "database",
  building: "buildings", cpu: "cpu", receipt: "receipt", "help-circle": "question",
  upload: "upload-simple", "grip-vertical": "dots-six-vertical", sun: "sun", moon: "moon", inbox: "tray",
  mail: "envelope-simple", "scan-line": "scan", paperclip: "paperclip", eye: "eye", "eye-off": "eye-slash",
  minus: "minus", "shopping-cart": "shopping-cart-simple", "trash-2": "trash",
  smartphone: "device-mobile", palette: "palette", "rotate-ccw": "arrow-counter-clockwise",
  edit: "pencil-simple",
};
const MAP = Object.fromEntries(Object.entries(BASE).map(([k, b]) => [k, `${b}-fill`]));
const names = [...new Set(Object.values(MAP))].join(",");
const raw = execSync(`curl -sS "https://api.iconify.design/ph.json?icons=${names}"`, { maxBuffer: 1 << 24 }).toString();
const data = JSON.parse(raw);
if (data.not_found?.length) { console.error("NOT FOUND:", data.not_found); process.exit(1); }
const W = data.width || 256, H = data.height || 256;
const out = {};
for (const [key, ph] of Object.entries(MAP)) {
  const ic = data.icons[ph]; if (!ic) { console.error("missing", ph); process.exit(1); }
  out[key] = { b: ic.body, w: ic.width || W, h: ic.height || H };
}
const body = "/**\n * AUTO-GERADO — conjunto de ícones **Phosphor (Fill)** (Iconify): cheios,\n * geométricos, modernos e com cantos arredondados. Monocromáticos via\n * `currentColor` (fill); a cor vem da prop `color` do <Icon>. Para atualizar:\n * rode scratchpad/gen-phosphor.mjs e cole. viewBox 256.\n */\nexport interface SolarIcon { b: string; w: number; h: number; }\nexport const SOLAR_ICONS: Record<string, SolarIcon> = " + JSON.stringify(out) + ";\n";
writeFileSync("/home/user/all4pay-saas-/src/components/ui/solar-icons.ts", body);
console.log("generated", Object.keys(out).length, "phosphor-fill icons");
