/**
 * ÍCONES QUATTRO — o conjunto DUOTÔNICO desenhado a partir da ilustração da
 * marca (o celular, o cartão lime e a mão, out/2026).
 *
 * A gramática é a da ilustração, reduzida a 24px:
 *   · VOLUME — a forma cheia do objeto, na cor do texto a 16% (é a "sombra"
 *     em areia da ilustração; sai de `currentColor`, então acompanha o tema);
 *   · CONTORNO — traço 1,7 de cantos arredondados, `currentColor` (o guia
 *     pede 1,7);
 *   · ACENTO — UM detalhe em lime (o chip do cartão, a tela do celular, o
 *     ponto de notificação), com fio fino do contorno por cima: lime puro
 *     sobre branco some, e é o fio que o mantém legível.
 *
 * ⚠️ CONTROLE NÃO TEM VOLUME NEM ACENTO. Seta, X, mais, menos, chevron e
 * alça de arrastar são GESTO, não objeto: precisam ser lidos em um instante,
 * e um acento ali disputaria atenção com o conteúdo. Esses ficam só no traço.
 *
 * As CHAVES são as mesmas do conjunto anterior (Hugeicons): trocar o desenho
 * não pode exigir tocar em tela nenhuma. viewBox 24 em todos.
 */
import type { SolarIcon } from "./solar-icons";

const V = (d: string) => `<path d="${d}" fill="currentColor" fill-opacity=".16"/>`;
const L = (d: string) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`;
const ACENTO = `style="fill:var(--color-lime)" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"`;
const A = (d: string) => `<path d="${d}" ${ACENTO}/>`;
const AC = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" ${ACENTO}/>`;
const VC = (cx: number, cy: number, r: number) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" fill-opacity=".16"/>`;
const LC = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.7"/>`;

const i = (...partes: string[]): SolarIcon => ({ b: partes.join(""), w: 24, h: 24 });

export const ICONES_QUATTRO: Record<string, SolarIcon> = {
  /* ---------------- objetos (volume + contorno + acento) ---------------- */
  house: i(V("M4.5 10.2 12 4.3l7.5 5.9V20h-15z"), L("M3 11.2 12 4l9 7.2M5.5 9.6V20h13V9.6"), A("M10 20v-4.6a2 2 0 0 1 4 0V20z")),
  inicio: i(V("M12 3.6 20.4 9.7 17.2 19.6H6.8L3.6 9.7Z"), L("M12 3.6 20.4 9.7 17.2 19.6H6.8L3.6 9.7Z"), AC(12, 12.6, 2.4)),
  "layout-dashboard": i(V("M13 3.5h7.5v5H13z"), V("M3.5 14h7.5v6.5H3.5z"), L("M3.5 3.5H11v7.5H3.5zM13 3.5h7.5v5H13zM13 10.5h7.5v10H13zM3.5 13H11v7.5H3.5z"), A("M14.2 11.7h5.1v7.6h-5.1z")),
  "trending-up": i(V("M3 17.5 9 11.5l4 4 8-8V20H3z"), L("M3 17.5 9 11.5l4 4 8-8M15.5 7.5H21v5.5"), AC(9, 11.5, 1.6)),
  "trending-down": i(V("M3 6.5 9 12.5l4-4 8 8V20H3z"), L("M3 6.5 9 12.5l4-4 8 8M15.5 16.5H21V11"), AC(9, 12.5, 1.6)),
  "file-text": i(V("M6 3h8.5L19 7.5V21H6z"), L("M6 3h8.5L19 7.5V21H6zM9 12h7M9 15.5h7M9 8.5h3"), A("M14.5 3v4.5H19z")),
  "credit-card": i(V("M3 6h18v12H3z"), L("M3 6h18v12H3zM3 10h18M7 15h4"), A("M15 13.2h3.4v2.6H15z")),
  settings: i(VC(12, 12, 7), L("M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"), LC(12, 12, 5.6), AC(12, 12, 2.2)),
  search: i(VC(10.5, 10.5, 6.5), LC(10.5, 10.5, 6.5), L("m15.4 15.4 5 5"), A("M7.6 9.4a3.2 3.2 0 0 1 2.4-2.3")),
  calendar: i(V("M3.5 6h17v14.5h-17z"), L("M3.5 6h17v14.5h-17zM3.5 10h17M8 3.5v4M16 3.5v4"), A("M13.5 13h3.5v3.5h-3.5z")),
  sparkles: i(V("M10 3.5 11.8 8.2 16.5 10 11.8 11.8 10 16.5 8.2 11.8 3.5 10 8.2 8.2z"), L("M10 3.5 11.8 8.2 16.5 10 11.8 11.8 10 16.5 8.2 11.8 3.5 10 8.2 8.2z"), A("M18 14.5 18.9 16.6 21 17.5 18.9 18.4 18 20.5 17.1 18.4 15 17.5 17.1 16.6z")),
  workflow: i(V("M3.5 3.5h7v6h-7z"), L("M3.5 3.5h7v6h-7zM13.5 14.5h7v6h-7zM7 9.5v3.5a1.5 1.5 0 0 0 1.5 1.5h5"), A("M14.7 15.7h4.6v3.6h-4.6z")),
  "list-checks": i(L("M11 6.5h9.5M11 12h9.5M11 17.5h9.5"), A("M3.5 4.5h4v4h-4z"), A("M3.5 10h4v4h-4z"), V("M3.5 15.5h4v4h-4z"), L("M3.5 15.5h4v4h-4z")),
  gauge: i(V("M3.5 16a8.5 8.5 0 0 1 17 0z"), L("M3.5 16a8.5 8.5 0 0 1 17 0M12 16l4-5M6 16h.01M18 16h.01"), AC(12, 16, 1.9)),
  "triangle-alert": i(V("M12 3.8 21.2 19.5H2.8z"), L("M12 3.8 21.2 19.5H2.8zM12 9.5v4.5"), AC(12, 16.6, 1.3)),
  users: i(V("M2.8 19.5a6.2 6.2 0 0 1 12.4 0z"), VC(9, 8, 3.5), L("M2.8 19.5a6.2 6.2 0 0 1 12.4 0M17 13.8a5 5 0 0 1 4.2 5.7"), LC(9, 8, 3.5), A("M15.6 4.8a3.2 3.2 0 1 1 0 6.3z")),
  "shield-check": i(V("M12 3 19.5 6v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"), L("M12 3 19.5 6v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"), A("M12 6.4 16.6 8.3v3.3c0 2.9-2 5.2-4.6 6.1z"), L("m8.8 12 2.2 2.2 4.1-4.2")),
  activity: i(V("M3 12h4l2.5-6 5 12 2.5-6h4v8H3z"), L("M3 12h4l2.5-6 5 12 2.5-6h4"), AC(9.5, 6, 1.5)),
  network: i(VC(5, 18.5, 2.5), VC(19, 18.5, 2.5), L("M12 8v3.5M12 11.5 5.8 16.6M12 11.5l6.2 5.1"), LC(5, 18.5, 2.5), LC(19, 18.5, 2.5), AC(12, 5.5, 2.8)),
  layers: i(V("M3 15.5 12 20l9-4.5-3.6-1.8L12 16.4 6.6 13.7z"), L("M3 12 12 16.5 21 12M3 15.5 12 20l9-4.5"), A("M12 3.5 21 8l-9 4.5L3 8z")),
  target: i(VC(12, 12, 9), LC(12, 12, 9), LC(12, 12, 5.5), AC(12, 12, 2.4)),
  database: i(V("M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"), L("M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"), `<ellipse cx="12" cy="6" rx="7.5" ry="3" ${ACENTO}/>`),
  building: i(V("M4.5 21V5.5L13 3v18z"), L("M4.5 21V5.5L13 3v18M13 9h6.5v12M3 21h18M8 8.5h1.5M8 12h1.5M8 15.5h1.5"), A("M15.5 12.5h2v2h-2zM15.5 16.5h2v2h-2z")),
  cpu: i(V("M6 6h12v12H6z"), L("M6 6h12v12H6zM9 2.8V6M15 2.8V6M9 18v3.2M15 18v3.2M2.8 9H6M2.8 15H6M18 9h3.2M18 15h3.2"), A("M9.3 9.3h5.4v5.4H9.3z")),
  receipt: i(V("M5 3h14v18l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6L5 21z"), L("M5 3h14v18l-2.3-1.6-2.4 1.6-2.3-1.6-2.3 1.6-2.4-1.6L5 21zM8.5 7.5h7M8.5 11h4"), A("M8.5 14h7v2.4h-7z")),
  "help-circle": i(VC(12, 12, 9), LC(12, 12, 9), L("M9.4 9.3a2.7 2.7 0 1 1 3.6 2.5c-.6.3-1 .9-1 1.6v.6"), AC(12, 17, 1.2)),
  info: i(VC(12, 12, 9), LC(12, 12, 9), L("M12 11v5.5"), AC(12, 7.8, 1.3)),
  upload: i(V("M3.5 15v4.5h17V15"), L("M3.5 15v4.5h17V15M12 15V4M7.5 8.5 12 4l4.5 4.5"), A("M8 15.8h8v1.9H8z")),
  sun: i(L("M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"), AC(12, 12, 4.4)),
  moon: i(V("M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"), L("M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"), AC(17.5, 6, 1.4)),
  inbox: i(V("M3.5 13h5l1.5 2.5h4l1.5-2.5h5v6.5h-17z"), L("M3.5 13 6.2 5h11.6l2.7 8v6.5h-17zM3.5 13h5l1.5 2.5h4l1.5-2.5h5"), A("M10 15.5h4l.9-1.5H9.1z")),
  mail: i(V("M3 5.5h18v13H3z"), L("M3 5.5h18v13H3zM3.5 6.5 12 13l8.5-6.5"), AC(18, 16, 2.2)),
  "scan-line": i(L("M3.5 8V5.5a2 2 0 0 1 2-2H8M16 3.5h2.5a2 2 0 0 1 2 2V8M20.5 16v2.5a2 2 0 0 1-2 2H16M8 20.5H5.5a2 2 0 0 1-2-2V16"), V("M7 7h10v10H7z"), A("M5.5 11.1h13v1.8h-13z")),
  paperclip: i(L("M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"), AC(19.6, 11.9, 1.3)),
  eye: i(V("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"), L("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"), AC(12, 12, 3.2)),
  "eye-off": i(V("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"), L("M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM4 4l16 16"), AC(12, 12, 3.2)),
  "shopping-cart": i(V("M6.3 6.5H20.5l-1.8 8H7.8z"), L("M2.5 3.5h2.6l2.7 11h10.9l1.8-8H6.3"), AC(9.5, 19, 1.8), AC(17.5, 19, 1.8)),
  "trash-2": i(V("M6 7h12l-1 13.5H7z"), L("M6 7h12l-1 13.5H7zM10 11v5.5M14 11v5.5"), A("M3.8 5h16.4v2H3.8zM9.5 5V3.5h5V5")),
  smartphone: i(V("M6.5 2.5h11v19h-11z"), L("M6.5 2.5h11v19h-11zM10.5 18.5h3"), A("M8.3 4.4h7.4v3.2H8.3z")),
  palette: i(V("M12 3a9 9 0 0 0 0 18c1.3 0 2-1 2-2 0-1.4-1.2-1.9-1.2-3.1 0-1.2 1-1.9 2.2-1.9H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z"), L("M12 3a9 9 0 0 0 0 18c1.3 0 2-1 2-2 0-1.4-1.2-1.9-1.2-3.1 0-1.2 1-1.9 2.2-1.9H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z"), AC(8, 11, 1.4), AC(11.5, 7.5, 1.4), AC(16, 8.5, 1.4)),
  edit: i(V("M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19z"), L("M4 20l1-4.5L15.5 5l3.5 3.5L8.5 19zM13.5 7l3.5 3.5"), A("M15.5 5 17 3.5a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L19 8.5z")),
  bell: i(V("M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15.5 6 9z"), L("M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15.5 6 9zM10.2 20.5a2 2 0 0 0 3.6 0"), AC(17.8, 5.2, 2.3)),
  link: i(L("M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"), AC(12, 12, 1.4)),
  "arrow-left-right": i(L("M16.5 3.5 20.5 7.5l-4 4M20.5 7.5h-15M7.5 12.5l-4 4 4 4M3.5 16.5h15")),
  repeat: i(L("m17 2.5 3.5 3.5-3.5 3.5M3.5 11.5V10a4 4 0 0 1 4-4h13M7 21.5l-3.5-3.5L7 14.5M20.5 12.5V14a4 4 0 0 1-4 4h-13")),
  "rotate-ccw": i(L("M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 3.5v5h5")),

  /* ---------------- controles (só traço) ---------------- */
  plus: i(L("M12 5v14M5 12h14")),
  minus: i(L("M5 12h14")),
  x: i(L("M6 6l12 12M18 6 6 18")),
  check: i(L("m4.5 12.5 5 5 10-11")),
  "chevron-down": i(L("m6 9 6 6 6-6")),
  "chevron-left": i(L("m15 6-6 6 6 6")),
  "chevron-right": i(L("m9 6 6 6-6 6")),
  "chevrons-up-down": i(L("m7 9 5-5 5 5M7 15l5 5 5-5")),
  menu: i(L("M4 6.5h16M4 12h16M4 17.5h10")),
  "arrow-up-right": i(L("M7 17 17 7M8.5 7H17v8.5")),
  "arrow-up": i(L("M12 20V4M5.5 10.5 12 4l6.5 6.5")),
  "arrow-down": i(L("M12 4v16M5.5 13.5 12 20l6.5-6.5")),
  "arrow-down-to-line": i(L("M12 3.5v12M6.5 10 12 15.5 17.5 10M4.5 20.5h15")),
  "grip-vertical": i(`<g fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></g>`),
  "more-vertical": i(`<g fill="currentColor"><circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/></g>`),
};

/** As chaves do conjunto, para a lista do design system e para a guarda. */
export const CHAVES_ICONES_QUATTRO = Object.keys(ICONES_QUATTRO);
