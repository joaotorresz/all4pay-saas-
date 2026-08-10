/**
 * Gera src/components/ui/solar-icons.ts a partir do set **Hugeicons Rounded**
 * (Iconify, prefixo `hugeicons` — a variante livre é Stroke Rounded, 24×24).
 *
 * Diferente do set anterior (Phosphor Fill, preenchido), Hugeicons é TRAÇADO:
 * os corpos vêm com stroke="currentColor" e stroke-width próprio, então o
 * <Icon> passa a honrar a prop `strokeWidth`.
 *
 * Uso:  node scratchpad/gen-hugeicons.mjs
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// chave usada no app  ->  nome no set hugeicons
const MAP = {
  house: "home-01",
  "arrow-left-right": "arrow-data-transfer-horizontal",
  repeat: "repeat",
  "trending-up": "chart-up",
  "trending-down": "chart-down",
  "file-text": "file-02",
  "credit-card": "credit-card",
  settings: "settings-01",
  plus: "plus-sign",
  search: "search-01",
  "chevrons-up-down": "arrow-up-down",
  "chevron-down": "arrow-down-01",
  "chevron-left": "arrow-left-01",
  "chevron-right": "arrow-right-01",
  menu: "menu-01",
  calendar: "calendar-03",
  sparkles: "sparkles",
  "arrow-up-right": "arrow-up-right-01",
  // ⚠️ SETA, não chevron. `arrow-up-01` é um chevron (só a ponta, sem haste) e
  // lia como "^" ao lado de um valor — não como direção do dinheiro. O par
  // -02 tem haste + ponta, e é o que faz entrada/saída se lerem como opostos.
  "arrow-up": "arrow-up-02",
  "arrow-down": "arrow-down-02",
  "arrow-down-to-line": "download-01",
  x: "cancel-01",
  check: "tick-02",
  workflow: "workflow-square-10",
  "list-checks": "task-01",
  gauge: "dashboard-speed-01",
  "triangle-alert": "alert-02",
  users: "user-multiple",
  "shield-check": "shield-01",
  activity: "activity-01",
  network: "share-08",
  layers: "layers-01",
  target: "target-01",
  database: "database",
  building: "building-03",
  cpu: "computer-phone-sync",
  receipt: "invoice-01",
  "help-circle": "help-circle",
  upload: "upload-01",
  "grip-vertical": "drag-drop-vertical",
  sun: "sun-01",
  moon: "moon-02",
  inbox: "inbox",
  mail: "mail-01",
  "scan-line": "qr-code",
  paperclip: "attachment-01",
  eye: "view",
  "eye-off": "view-off",
  minus: "minus-sign",
  "shopping-cart": "shopping-cart-01",
  "trash-2": "delete-02",
  smartphone: "smart-phone-01",
  palette: "paint-board",
  "rotate-ccw": "arrow-reload-horizontal",
  edit: "edit-02",
  info: "information-circle",
  link: "link-01",
};

const names = [...new Set(Object.values(MAP))];
const raw = execSync(
  `curl -sS --max-time 90 "https://api.iconify.design/hugeicons.json?icons=${names.join(",")}"`,
  { maxBuffer: 1 << 26 },
).toString();
const data = JSON.parse(raw);

if (data.not_found?.length) {
  console.error("NÃO ENCONTRADOS no set hugeicons:", data.not_found);
  process.exit(1);
}

const W = data.width || 24, H = data.height || 24;
const out = {};
for (const [key, hi] of Object.entries(MAP)) {
  const ic = data.icons[hi];
  if (!ic) { console.error("faltando:", key, "->", hi); process.exit(1); }
  out[key] = { b: ic.body, w: ic.width || W, h: ic.height || H };
}

const header = `/**
 * AUTO-GERADO — conjunto de ícones **Hugeicons (Stroke Rounded)** (Iconify).
 * Traçados, cantos arredondados, viewBox 24. Monocromáticos via
 * \`currentColor\` (stroke); a cor vem da prop \`color\` do <Icon> e a espessura
 * da prop \`strokeWidth\`. Para atualizar: rode scratchpad/gen-hugeicons.mjs.
 */
export interface SolarIcon { b: string; w: number; h: number; }
export const SOLAR_ICONS: Record<string, SolarIcon> = `;
writeFileSync(
  "/home/user/all4pay-saas-/src/components/ui/solar-icons.ts",
  header + JSON.stringify(out) + ";\n",
);
console.log("gerados", Object.keys(out).length, "ícones hugeicons (stroke rounded)");
